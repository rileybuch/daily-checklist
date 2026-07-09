/**
 * Pure backend core for the Daily Checklist Apps Script Web App (SPEC M1).
 *
 * This file is authored in *plain script style* (top-level function declarations,
 * no ES module syntax) for two reasons:
 *
 *   1. Google Apps Script (V8) does NOT support ES modules. When Riley pastes
 *      this file into the Apps Script editor, every top-level `function` becomes
 *      a global that the adapter (adapter.gs.js) can call directly.
 *   2. Node's `node --test` needs to import it. The CommonJS `module.exports`
 *      guard at the bottom runs only under Node (where `module` exists); in Apps
 *      Script `module` is undefined and the guard is skipped.
 *
 * HARD RULE: this file references NO Google globals (SpreadsheetApp,
 * ContentService, Utilities, Logger). Those live only in adapter.gs.js. The
 * `test/backend/purity.test.js` grep enforces this. That is why token hashing is
 * a self-contained pure-JS SHA-256 (sha256Hex) rather than Utilities.computeDigest
 * — Node and Apps Script must produce the identical digest for token auth to work.
 *
 * `handleRequest(request, store)` is the single entry point:
 *   request = { method, path, query, body }
 *   store   = injected data-access object (FakeStore in tests, SheetStore in prod)
 */

"use strict";

/** Allowed values for `event.kind` (SPEC Section 3, events tab). */
var EVENT_KINDS = ["set", "check", "uncheck", "skip", "unskip", "measure", "undo"];

/** Allowed values for `habit.type` (SPEC Section 3, habits tab). */
var HABIT_TYPES = ["binary", "counter", "measurement"];

/** Allowed values for `target_rule.week_parity` (SPEC Section 3, target_rules tab). */
var WEEK_PARITIES = ["even", "odd", "*"];

/** Default bootstrap window: last N days of events. */
var BOOTSTRAP_DAYS = 30;

// ---------------------------------------------------------------------------
// Entry point + routing
// ---------------------------------------------------------------------------

/**
 * Dispatch an incoming request to the matching handler after token auth.
 *
 * @param {{method:string, path:string, query:Object, body:*}} request
 * @param {Object} store - data-access object implementing the store interface.
 * @returns {{status:number, body:Object}}
 */
function handleRequest(request, store) {
  if (!authenticate(request, store)) {
    // Generic 401 — never reveals whether the token was missing vs wrong.
    return { status: 401, body: { error: "unauthorized" } };
  }

  var method = request.method;
  var path = request.path;

  if (method === "GET" && path === "/bootstrap") {
    return handleBootstrap(request, store);
  }
  if (method === "GET" && path === "/events") {
    return handleGetEvents(request, store);
  }
  if (method === "POST" && path === "/events") {
    return handlePostEvents(request, store);
  }
  if (method === "POST" && path === "/habits") {
    return handlePostHabit(request, store);
  }
  if (method === "POST" && path === "/rules") {
    return handlePostRule(request, store);
  }

  return { status: 404, body: { error: "not_found", detail: "no route for " + method + " " + path } };
}

// ---------------------------------------------------------------------------
// Token auth
// ---------------------------------------------------------------------------

/**
 * True iff the request carries a token whose SHA-256 hash matches the configured
 * `secret_token_hash`. Missing token or missing config hash both return false.
 *
 * @param {{query:Object}} request
 * @param {Object} store
 * @returns {boolean}
 */
function authenticate(request, store) {
  var token = request && request.query ? request.query.token : undefined;
  var config = store.getConfig() || {};
  var expected = config.secret_token_hash;
  if (!token || !expected) {
    return false;
  }
  return sha256Hex(String(token)) === String(expected);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /bootstrap → habits + target_rules + config (secret hash omitted) + the
 * last BOOTSTRAP_DAYS days of events, so the client opens the app in one call.
 */
function handleBootstrap(request, store) {
  var config = store.getConfig() || {};
  var safeConfig = {};
  Object.keys(config).forEach(function (key) {
    if (key !== "secret_token_hash") {
      safeConfig[key] = config[key];
    }
  });

  return {
    status: 200,
    body: {
      habits: store.getHabits(),
      target_rules: store.getRules(),
      config: safeConfig,
      events: store.getEvents(cutoffISO(BOOTSTRAP_DAYS)),
    },
  };
}

/** GET /events?since=<ISO date> → events with date >= since (all if omitted). */
function handleGetEvents(request, store) {
  var since = request && request.query ? request.query.since : undefined;
  return { status: 200, body: { events: store.getEvents(since) } };
}

/**
 * POST /events → append a batch (array). Idempotent on `event_id`: ids already
 * present in the store, or repeated within the batch, are reported under
 * `skipped` and inserted at most once. Returns { inserted:[ids], skipped:[ids] }.
 */
function handlePostEvents(request, store) {
  var batch = request.body;
  if (!Array.isArray(batch)) {
    return { status: 400, body: { error: "invalid_body", detail: "POST /events expects a JSON array of events" } };
  }

  for (var i = 0; i < batch.length; i++) {
    var err = validateEvent(batch[i]);
    if (err) {
      return { status: 400, body: err };
    }
  }

  var seen = {};
  store.getEvents().forEach(function (e) {
    seen[e.event_id] = true;
  });

  var inserted = [];
  var skipped = [];
  var toAppend = [];
  batch.forEach(function (ev) {
    if (seen[ev.event_id]) {
      skipped.push(ev.event_id);
    } else {
      seen[ev.event_id] = true;
      inserted.push(ev.event_id);
      toAppend.push(ev);
    }
  });

  if (toAppend.length > 0) {
    store.appendEvents(toAppend);
  }
  return { status: 200, body: { inserted: inserted, skipped: skipped } };
}

/** POST /habits → upsert a habit by habit_id. */
function handlePostHabit(request, store) {
  var habit = request.body;
  var err = validateHabit(habit);
  if (err) {
    return { status: 400, body: err };
  }
  store.upsertHabit(habit);
  return { status: 200, body: { ok: true, habit_id: habit.habit_id } };
}

/** POST /rules → upsert a target rule by rule_id. */
function handlePostRule(request, store) {
  var rule = request.body;
  var err = validateRule(rule);
  if (err) {
    return { status: 400, body: err };
  }
  store.upsertRule(rule);
  return { status: 200, body: { ok: true, rule_id: rule.rule_id } };
}

// ---------------------------------------------------------------------------
// Validation (pure) — each returns null when valid, or { error, detail }.
// ---------------------------------------------------------------------------

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function missingField(obj, fields) {
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    if (obj[f] === undefined || obj[f] === null || obj[f] === "") {
      return f;
    }
  }
  return null;
}

function isFiniteNumber(value) {
  return typeof value === "number" && isFinite(value);
}

/**
 * Validate an event row. Requires event_id, date, habit_id, kind; kind must be a
 * known enum; `set`/`measure` require a finite numeric `value`.
 */
function validateEvent(event) {
  if (!isObject(event)) {
    return { error: "invalid_event", detail: "event must be a JSON object" };
  }
  var missing = missingField(event, ["event_id", "date", "habit_id", "kind"]);
  if (missing) {
    return { error: "missing_field", detail: "event missing required field: " + missing };
  }
  if (EVENT_KINDS.indexOf(event.kind) === -1) {
    return { error: "invalid_kind", detail: "invalid event kind: " + event.kind };
  }
  if (event.kind === "set" || event.kind === "measure") {
    if (!isFiniteNumber(event.value)) {
      return { error: "invalid_value", detail: "non-numeric value for " + event.kind + " event: " + event.value };
    }
  }
  return null;
}

/** Validate a habit row. Requires habit_id, name, type; type must be a known enum. */
function validateHabit(habit) {
  if (!isObject(habit)) {
    return { error: "invalid_habit", detail: "habit must be a JSON object" };
  }
  var missing = missingField(habit, ["habit_id", "name", "type"]);
  if (missing) {
    return { error: "missing_field", detail: "habit missing required field: " + missing };
  }
  if (HABIT_TYPES.indexOf(habit.type) === -1) {
    return { error: "invalid_type", detail: "invalid habit type: " + habit.type };
  }
  return null;
}

/**
 * Validate a target rule. Requires rule_id, habit_id, days, target, effective_from;
 * target must be numeric; week_parity, when present, must be even|odd|*.
 */
function validateRule(rule) {
  if (!isObject(rule)) {
    return { error: "invalid_rule", detail: "rule must be a JSON object" };
  }
  var missing = missingField(rule, ["rule_id", "habit_id", "days", "target", "effective_from"]);
  if (missing) {
    return { error: "missing_field", detail: "rule missing required field: " + missing };
  }
  if (!isFiniteNumber(rule.target)) {
    return { error: "invalid_target", detail: "non-numeric target: " + rule.target };
  }
  if (rule.week_parity !== undefined && rule.week_parity !== "" && WEEK_PARITIES.indexOf(rule.week_parity) === -1) {
    return { error: "invalid_week_parity", detail: "invalid week_parity: " + rule.week_parity };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Response shaping (pure)
// ---------------------------------------------------------------------------

/**
 * Turn a { status, body } response into the JSON text the adapter hands to
 * ContentService. Apps Script Web Apps always emit HTTP 200 via ContentService,
 * so the logical status is folded into the JSON body for the client to branch on.
 *
 * @param {{status:number, body:Object}} response
 * @returns {string} JSON text
 */
function shapeResponse(response) {
  var payload = { status: response.status };
  var body = response.body || {};
  Object.keys(body).forEach(function (key) {
    payload[key] = body[key];
  });
  return JSON.stringify(payload);
}

// ---------------------------------------------------------------------------
// Date helpers (pure — uses the standard Date, not any Google global)
// ---------------------------------------------------------------------------

/**
 * ISO date (YYYY-MM-DD) for `days` days before now, in UTC. Used as the
 * inclusive lower bound for the bootstrap event window.
 *
 * @param {number} days
 * @returns {string}
 */
function cutoffISO(days) {
  var d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// SHA-256 (pure JS) — self-contained so Node and Apps Script hash identically.
// Standard FIPS 180-4 implementation; verified against node:crypto in tests.
// ---------------------------------------------------------------------------

/**
 * Hex-encoded SHA-256 digest of a UTF-8 string.
 *
 * @param {string} message
 * @returns {string} 64 lowercase hex characters
 */
function sha256Hex(message) {
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  function rotr(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  var bytes = utf8Bytes(message);
  var bitLen = bytes.length * 8;

  // Padding: append 0x80, then zeros, then a 64-bit big-endian length.
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) {
    bytes.push(0);
  }
  var hi = Math.floor(bitLen / 0x100000000);
  var lo = bitLen >>> 0;
  bytes.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff);
  bytes.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);

  var w = new Array(64);
  for (var offset = 0; offset < bytes.length; offset += 64) {
    for (var t = 0; t < 16; t++) {
      var j = offset + t * 4;
      w[t] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) | 0;
    }
    for (t = 16; t < 64; t++) {
      var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }

    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];

    for (t = 0; t < 64; t++) {
      var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      var ch = (e & f) ^ (~e & g);
      var temp1 = (h + S1 + ch + K[t] + w[t]) | 0;
      var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var temp2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
    H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0;
    H[7] = (H[7] + h) | 0;
  }

  var hex = "";
  for (var k = 0; k < H.length; k++) {
    hex += ("00000000" + (H[k] >>> 0).toString(16)).slice(-8);
  }
  return hex;
}

/**
 * Encode a JS string to an array of UTF-8 byte values (handles surrogate pairs).
 *
 * @param {string} str
 * @returns {number[]}
 */
function utf8Bytes(str) {
  var bytes = [];
  for (var i = 0; i < str.length; i++) {
    var code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0xd800 || code >= 0xe000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      // High surrogate followed by low surrogate → one code point.
      i++;
      code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// CommonJS export guard — runs only under Node. In Apps Script `module` is
// undefined, so these functions remain plain globals for the adapter to call.
// ---------------------------------------------------------------------------

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    handleRequest: handleRequest,
    shapeResponse: shapeResponse,
    sha256Hex: sha256Hex,
    validateEvent: validateEvent,
    validateHabit: validateHabit,
    validateRule: validateRule,
    cutoffISO: cutoffISO,
    EVENT_KINDS: EVENT_KINDS,
    HABIT_TYPES: HABIT_TYPES,
    WEEK_PARITIES: WEEK_PARITIES,
    BOOTSTRAP_DAYS: BOOTSTRAP_DAYS,
  };
}
