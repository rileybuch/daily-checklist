/**
 * Google Apps Script adapter for the Daily Checklist Web App (SPEC M1).
 *
 * This is the ONLY file that touches Google globals (SpreadsheetApp,
 * ContentService, Logger). It is deliberately thin and is NOT unit-tested against
 * live Google — all logic lives in the pure core (core.gs.js), which this file
 * consumes as globals (Apps Script concatenates all files into one global scope,
 * so `handleRequest`, `shapeResponse`, `sha256Hex` are already in scope here).
 *
 * Responsibilities:
 *   - doGet(e) / doPost(e): parse the Apps Script event object into the pure
 *     `request` shape, build a SheetStore, call handleRequest, return via
 *     ContentService.
 *   - SheetStore: implements the same store interface FakeStore implements, over
 *     the bound Google Sheet.
 *   - setupSheet(): one-time creation of the four tabs with header rows.
 *   - computeTokenHash(token): helper Riley runs once to produce the value for
 *     config.secret_token_hash (see DEPLOY.md).
 *
 * Do NOT add `module.exports` here — this file is never imported by Node.
 */

/* global SpreadsheetApp, ContentService, Logger, handleRequest, shapeResponse, sha256Hex */

/** Canonical column order per SPEC Section 3. Header row is written in this order. */
var SHEET_HEADERS = {
  habits: ["habit_id", "name", "type", "unit", "sort_order", "active", "created_at"],
  target_rules: ["rule_id", "habit_id", "days", "week_parity", "target", "effective_from", "effective_to"],
  events: ["event_id", "ts", "date", "habit_id", "kind", "value", "undo_of"],
  config: ["key", "value"],
};

// ---------------------------------------------------------------------------
// Web App entry points
// ---------------------------------------------------------------------------

function doGet(e) {
  return handleAppsScriptRequest("GET", e);
}

function doPost(e) {
  return handleAppsScriptRequest("POST", e);
}

/**
 * Parse the Apps Script event object into the pure request shape, dispatch, and
 * return a ContentService JSON response.
 *
 * The path is taken from `e.pathInfo` (e.g. `.../exec/bootstrap`) or, as a
 * fallback, a `?path=bootstrap` query param. The token and other query params
 * come from `e.parameter`. POST bodies are parsed from `e.postData.contents`.
 */
function handleAppsScriptRequest(method, e) {
  var params = (e && e.parameter) || {};
  var rawPath = (e && e.pathInfo) || params.path || "";
  var path = "/" + String(rawPath).replace(/^\/+/, "");

  var body = null;
  if (method === "POST" && e && e.postData && e.postData.contents) {
    body = JSON.parse(e.postData.contents);
  }

  var request = { method: method, path: path, query: params, body: body };
  var store = new SheetStore();
  var response = handleRequest(request, store);

  return ContentService.createTextOutput(shapeResponse(response)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// SheetStore — the production store, over the bound Google Sheet
// ---------------------------------------------------------------------------

/**
 * @param {Spreadsheet} [spreadsheet] - defaults to the bound active spreadsheet.
 * @constructor
 */
function SheetStore(spreadsheet) {
  this.ss = spreadsheet || SpreadsheetApp.getActive();
}

/** Read a tab into an array of objects keyed by its header row. */
SheetStore.prototype.readObjects = function (tab) {
  var sheet = this.ss.getSheetByName(tab);
  if (!sheet) {
    return [];
  }
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return [];
  }
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = values[i][c];
    }
    rows.push(obj);
  }
  return rows;
};

SheetStore.prototype.getHabits = function () {
  return this.readObjects("habits");
};

SheetStore.prototype.getRules = function () {
  return this.readObjects("target_rules");
};

SheetStore.prototype.getConfig = function () {
  var rows = this.readObjects("config");
  var config = {};
  rows.forEach(function (r) {
    config[r.key] = r.value;
  });
  return config;
};

SheetStore.prototype.getEvents = function (sinceDate) {
  var rows = this.readObjects("events");
  if (!sinceDate) {
    return rows;
  }
  var since = String(sinceDate);
  return rows.filter(function (r) {
    return String(r.date) >= since;
  });
};

SheetStore.prototype.appendEvents = function (rows) {
  var sheet = this.ss.getSheetByName("events");
  var headers = SHEET_HEADERS.events;
  rows.forEach(function (ev) {
    sheet.appendRow(
      headers.map(function (h) {
        return ev[h] === undefined ? "" : ev[h];
      }),
    );
  });
};

SheetStore.prototype.upsertHabit = function (habit) {
  this.upsert("habits", "habit_id", habit);
};

SheetStore.prototype.upsertRule = function (rule) {
  this.upsert("target_rules", "rule_id", rule);
};

/** Replace the row whose idField matches, or append a new row. */
SheetStore.prototype.upsert = function (tab, idField, obj) {
  var sheet = this.ss.getSheetByName(tab);
  var headers = SHEET_HEADERS[tab];
  var idCol = headers.indexOf(idField);
  var rowValues = headers.map(function (h) {
    return obj[h] === undefined ? "" : obj[h];
  });

  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(obj[idField])) {
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([rowValues]);
      return;
    }
  }
  sheet.appendRow(rowValues);
};

// ---------------------------------------------------------------------------
// One-time setup helpers (run manually from the Apps Script editor)
// ---------------------------------------------------------------------------

/**
 * Create the four data tabs with their header rows if they don't already exist.
 * Idempotent: safe to run more than once. Run this once after pasting the code.
 */
function setupSheet() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(SHEET_HEADERS).forEach(function (tab) {
    var sheet = ss.getSheetByName(tab);
    if (!sheet) {
      sheet = ss.insertSheet(tab);
    }
    var headers = SHEET_HEADERS[tab];
    var existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    var needsHeader = headers.some(function (h, i) {
      return existing[i] !== h;
    });
    if (needsHeader) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  });
  Logger.log("setupSheet complete: tabs habits, target_rules, events, config are ready.");
}

/**
 * Print the SHA-256 hash of a plaintext token. Run once (e.g.
 * `computeTokenHash("my-secret")`), copy the logged value into the `config` tab
 * as the value for key `secret_token_hash`. Uses the SAME sha256Hex the request
 * path uses, so the digests are guaranteed to match.
 *
 * @param {string} token
 * @returns {string}
 */
function computeTokenHash(token) {
  var hash = sha256Hex(token);
  Logger.log(hash);
  return hash;
}
