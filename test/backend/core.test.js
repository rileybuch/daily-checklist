// Unit tests for the pure backend core (backend/core.gs.js), driven entirely by
// the in-memory FakeStore. No Google globals, no network — this is the whole of
// M1's automatable verification (live deploy + round-trip are [HUMAN] in DEPLOY.md).

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  handleRequest,
  shapeResponse,
  sha256Hex,
} = require("../../backend/core.gs.js");
const { FakeStore } = require("./fake_store.js");

const GOOD_TOKEN = "good";

function isoNDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// A store seeded with 2 habits, 3 rules, and 5 events, per the routing/auth story.
function seededStore() {
  return new FakeStore({
    habits: [
      {
        habit_id: "pushups",
        name: "Pushups",
        type: "counter",
        unit: "reps",
        sort_order: 1,
        active: true,
        created_at: "2026-01-01",
      },
      {
        habit_id: "bible_study",
        name: "Bible Study",
        type: "binary",
        unit: "",
        sort_order: 2,
        active: true,
        created_at: "2026-01-01",
      },
    ],
    rules: [
      {
        rule_id: "r1",
        habit_id: "pushups",
        days: "mon,tue,wed,thu,fri",
        week_parity: "*",
        target: 6,
        effective_from: "2026-01-01",
        effective_to: "",
      },
      {
        rule_id: "r2",
        habit_id: "pushups",
        days: "sat",
        week_parity: "odd",
        target: 3,
        effective_from: "2026-01-01",
        effective_to: "",
      },
      {
        rule_id: "r3",
        habit_id: "bible_study",
        days: "*",
        week_parity: "*",
        target: 1,
        effective_from: "2026-01-01",
        effective_to: "",
      },
    ],
    config: {
      anchor_date: "2026-01-04",
      week_start: "sun",
      secret_token_hash: sha256Hex(GOOD_TOKEN),
    },
    events: [
      { event_id: "e1", ts: isoNDaysAgo(1), date: isoNDaysAgo(1), habit_id: "pushups", kind: "set", value: 20, undo_of: "" },
      { event_id: "e2", ts: isoNDaysAgo(1), date: isoNDaysAgo(1), habit_id: "pushups", kind: "set", value: 18, undo_of: "" },
      { event_id: "e3", ts: isoNDaysAgo(2), date: isoNDaysAgo(2), habit_id: "bible_study", kind: "check", value: "", undo_of: "" },
      { event_id: "e4", ts: isoNDaysAgo(5), date: isoNDaysAgo(5), habit_id: "pushups", kind: "set", value: 15, undo_of: "" },
      { event_id: "e-old", ts: isoNDaysAgo(40), date: isoNDaysAgo(40), habit_id: "pushups", kind: "set", value: 12, undo_of: "" },
    ],
  });
}

function get(path, query = {}) {
  return { method: "GET", path, query, body: null };
}

function post(path, body, query = {}) {
  return { method: "POST", path, query, body };
}

function withToken(query = {}) {
  return { token: GOOD_TOKEN, ...query };
}

// ---------------------------------------------------------------------------
// AC: handleRequest dispatches all five endpoints
// ---------------------------------------------------------------------------

test("GET /bootstrap dispatches and returns 200 with all sections", () => {
  const store = seededStore();
  const res = handleRequest(get("/bootstrap", withToken()), store);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.habits));
  assert.ok(Array.isArray(res.body.target_rules));
  assert.ok(res.body.config && typeof res.body.config === "object");
  assert.ok(Array.isArray(res.body.events));
});

test("GET /events dispatches and returns 200 with events", () => {
  const store = seededStore();
  const res = handleRequest(get("/events", withToken()), store);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.events));
});

test("POST /events dispatches and returns 200 with inserted/skipped", () => {
  const store = seededStore();
  const res = handleRequest(
    post("/events", [{ event_id: "n1", date: "2026-07-08", habit_id: "pushups", kind: "set", value: 21 }], withToken()),
    store,
  );
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.inserted, ["n1"]);
  assert.deepEqual(res.body.skipped, []);
});

test("POST /habits dispatches and returns 200", () => {
  const store = seededStore();
  const res = handleRequest(
    post("/habits", { habit_id: "flossing", name: "Flossing", type: "binary" }, withToken()),
    store,
  );
  assert.equal(res.status, 200);
});

test("POST /rules dispatches and returns 200", () => {
  const store = seededStore();
  const res = handleRequest(
    post("/rules", { rule_id: "r9", habit_id: "flossing", days: "*", week_parity: "*", target: 1, effective_from: "2026-07-01" }, withToken()),
    store,
  );
  assert.equal(res.status, 200);
});

test("unknown route returns 404", () => {
  const store = seededStore();
  const res = handleRequest(get("/nope", withToken()), store);
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// AC: missing or wrong token returns 401 (generic body) for EVERY endpoint
// Story: routing/auth — wrong token on bootstrap returns 401
// ---------------------------------------------------------------------------

const ENDPOINTS = [
  ["GET", "/bootstrap", null],
  ["GET", "/events", null],
  ["POST", "/events", []],
  ["POST", "/habits", { habit_id: "x", name: "X", type: "binary" }],
  ["POST", "/rules", { rule_id: "x", habit_id: "x", days: "*", target: 1, effective_from: "2026-01-01" }],
];

for (const [method, path, body] of ENDPOINTS) {
  test(`missing token → 401 generic for ${method} ${path}`, () => {
    const store = seededStore();
    const req = { method, path, query: {}, body };
    const res = handleRequest(req, store);
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: "unauthorized" });
  });

  test(`wrong token → 401 generic for ${method} ${path}`, () => {
    const store = seededStore();
    const req = { method, path, query: { token: "wrong" }, body };
    const res = handleRequest(req, store);
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: "unauthorized" });
  });
}

test("401 body is identical whether token is missing or wrong (no leak)", () => {
  const store = seededStore();
  const missing = handleRequest(get("/bootstrap", {}), store);
  const wrong = handleRequest(get("/bootstrap", { token: "wrong" }), store);
  assert.deepEqual(missing.body, wrong.body);
});

// ---------------------------------------------------------------------------
// AC / Story: idempotency on event_id
// ---------------------------------------------------------------------------

test("POST /events is idempotent on event_id across a retried batch", () => {
  const store = seededStore();
  const batch = [
    { event_id: "A", date: "2026-07-08", habit_id: "pushups", kind: "set", value: 20 },
    { event_id: "B", date: "2026-07-08", habit_id: "pushups", kind: "set", value: 22 },
  ];

  const first = handleRequest(post("/events", batch, withToken()), store);
  assert.deepEqual(first.body.inserted, ["A", "B"]);
  assert.deepEqual(first.body.skipped, []);

  // Simulate a client retry of the exact same batch after a dropped connection.
  const second = handleRequest(post("/events", batch, withToken()), store);
  assert.deepEqual(second.body.inserted, []);
  assert.deepEqual(second.body.skipped, ["A", "B"]);

  // The store contains exactly one row each for A and B.
  const all = store.getEvents();
  assert.equal(all.filter((e) => e.event_id === "A").length, 1);
  assert.equal(all.filter((e) => e.event_id === "B").length, 1);
});

test("POST /events dedupes duplicate ids within a single batch", () => {
  const store = seededStore();
  const batch = [
    { event_id: "D", date: "2026-07-08", habit_id: "pushups", kind: "set", value: 20 },
    { event_id: "D", date: "2026-07-08", habit_id: "pushups", kind: "set", value: 99 },
  ];
  const res = handleRequest(post("/events", batch, withToken()), store);
  assert.deepEqual(res.body.inserted, ["D"]);
  assert.deepEqual(res.body.skipped, ["D"]);
  assert.equal(store.getEvents().filter((e) => e.event_id === "D").length, 1);
});

test("POST /events skips an id already present in the store", () => {
  const store = seededStore();
  // e1 is already seeded.
  const res = handleRequest(
    post("/events", [{ event_id: "e1", date: "2026-07-08", habit_id: "pushups", kind: "set", value: 1 }], withToken()),
    store,
  );
  assert.deepEqual(res.body.inserted, []);
  assert.deepEqual(res.body.skipped, ["e1"]);
});

// ---------------------------------------------------------------------------
// AC: GET /bootstrap shape — config without secret hash, events last 30 days
// ---------------------------------------------------------------------------

test("GET /bootstrap omits secret_token_hash from config", () => {
  const store = seededStore();
  const res = handleRequest(get("/bootstrap", withToken()), store);
  assert.equal(res.body.config.secret_token_hash, undefined);
  assert.equal(res.body.config.anchor_date, "2026-01-04");
  assert.equal(res.body.config.week_start, "sun");
});

test("GET /bootstrap returns only events from the last 30 days", () => {
  const store = seededStore();
  const res = handleRequest(get("/bootstrap", withToken()), store);
  const ids = res.body.events.map((e) => e.event_id);
  assert.ok(ids.includes("e1"));
  assert.ok(ids.includes("e4")); // 5 days ago — inside window
  assert.ok(!ids.includes("e-old")); // 40 days ago — outside window
});

test("GET /bootstrap returns the seeded habits and rules", () => {
  const store = seededStore();
  const res = handleRequest(get("/bootstrap", withToken()), store);
  assert.equal(res.body.habits.length, 2);
  assert.equal(res.body.target_rules.length, 3);
});

// ---------------------------------------------------------------------------
// AC: GET /events?since filters by date
// ---------------------------------------------------------------------------

test("GET /events?since returns only events with date >= since", () => {
  const store = new FakeStore({
    config: { secret_token_hash: sha256Hex(GOOD_TOKEN) },
    events: [
      { event_id: "old", date: "2026-06-30", habit_id: "pushups", kind: "set", value: 1 },
      { event_id: "edge", date: "2026-07-01", habit_id: "pushups", kind: "set", value: 1 },
      { event_id: "new", date: "2026-07-05", habit_id: "pushups", kind: "set", value: 1 },
    ],
  });
  const res = handleRequest(get("/events", withToken({ since: "2026-07-01" })), store);
  const ids = res.body.events.map((e) => e.event_id).sort();
  assert.deepEqual(ids, ["edge", "new"]);
});

// ---------------------------------------------------------------------------
// AC / Story: validation rejects garbage — >= 4 distinct cases
// ---------------------------------------------------------------------------

test("POST /events with unknown kind → 400 mentioning the kind", () => {
  const store = seededStore();
  const res = handleRequest(
    post("/events", [{ event_id: "z", date: "2026-07-08", habit_id: "pushups", kind: "frobnicate" }], withToken()),
    store,
  );
  assert.equal(res.status, 400);
  assert.ok(/frobnicate/.test(res.body.detail), `detail should mention the bad kind: ${res.body.detail}`);
});

test("POST /events with non-numeric value on set → 400 mentioning the value", () => {
  const store = seededStore();
  const res = handleRequest(
    post("/events", [{ event_id: "z", date: "2026-07-08", habit_id: "pushups", kind: "set", value: "lots" }], withToken()),
    store,
  );
  assert.equal(res.status, 400);
  assert.ok(/lots|value/.test(res.body.detail), `detail should mention the value: ${res.body.detail}`);
});

test("POST /events with missing required field → 400", () => {
  const store = seededStore();
  const res = handleRequest(
    post("/events", [{ date: "2026-07-08", habit_id: "pushups", kind: "set", value: 5 }], withToken()),
    store,
  );
  assert.equal(res.status, 400);
  assert.ok(/event_id/.test(res.body.detail), `detail should name the missing field: ${res.body.detail}`);
});

test("POST /events with a non-array body → 400", () => {
  const store = seededStore();
  const res = handleRequest(post("/events", { event_id: "z" }, withToken()), store);
  assert.equal(res.status, 400);
});

test("POST /events with non-numeric value on measure → 400", () => {
  const store = seededStore();
  const res = handleRequest(
    post("/events", [{ event_id: "m", date: "2026-07-08", habit_id: "pushup_max", kind: "measure", value: "many" }], withToken()),
    store,
  );
  assert.equal(res.status, 400);
});

test("POST /habits with unknown type → 400", () => {
  const store = seededStore();
  const res = handleRequest(
    post("/habits", { habit_id: "q", name: "Q", type: "quantum" }, withToken()),
    store,
  );
  assert.equal(res.status, 400);
  assert.ok(/quantum/.test(res.body.detail), `detail should mention the bad type: ${res.body.detail}`);
});

test("POST /habits with missing name → 400", () => {
  const store = seededStore();
  const res = handleRequest(post("/habits", { habit_id: "q", type: "binary" }, withToken()), store);
  assert.equal(res.status, 400);
});

test("POST /rules with non-numeric target → 400", () => {
  const store = seededStore();
  const res = handleRequest(
    post("/rules", { rule_id: "r", habit_id: "pushups", days: "*", target: "six", effective_from: "2026-07-01" }, withToken()),
    store,
  );
  assert.equal(res.status, 400);
});

test("POST /rules with bad week_parity → 400", () => {
  const store = seededStore();
  const res = handleRequest(
    post("/rules", { rule_id: "r", habit_id: "pushups", days: "*", week_parity: "prime", target: 6, effective_from: "2026-07-01" }, withToken()),
    store,
  );
  assert.equal(res.status, 400);
});

// A valid measure event with a numeric value is accepted.
test("POST /events accepts a measure event with a numeric value", () => {
  const store = seededStore();
  const res = handleRequest(
    post("/events", [{ event_id: "m1", date: "2026-07-08", habit_id: "pushup_max", kind: "measure", value: 42 }], withToken()),
    store,
  );
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.inserted, ["m1"]);
});

// ---------------------------------------------------------------------------
// AC: upsert habits and rules by id
// ---------------------------------------------------------------------------

test("POST /habits inserts a new habit then updates it in place", () => {
  const store = seededStore();
  const before = store.getHabits().length;

  handleRequest(post("/habits", { habit_id: "flossing", name: "Flossing", type: "binary" }, withToken()), store);
  assert.equal(store.getHabits().length, before + 1);

  handleRequest(post("/habits", { habit_id: "flossing", name: "Floss Teeth", type: "binary" }, withToken()), store);
  assert.equal(store.getHabits().length, before + 1); // replaced, not duplicated
  const flossing = store.getHabits().find((h) => h.habit_id === "flossing");
  assert.equal(flossing.name, "Floss Teeth");
});

test("POST /rules inserts a new rule then updates it in place", () => {
  const store = seededStore();
  const before = store.getRules().length;

  handleRequest(post("/rules", { rule_id: "r1", habit_id: "pushups", days: "*", week_parity: "*", target: 8, effective_from: "2026-07-01" }, withToken()), store);
  assert.equal(store.getRules().length, before); // r1 already exists → replaced
  const r1 = store.getRules().find((r) => r.rule_id === "r1");
  assert.equal(r1.target, 8);

  handleRequest(post("/rules", { rule_id: "r-new", habit_id: "pushups", days: "*", week_parity: "*", target: 4, effective_from: "2026-07-01" }, withToken()), store);
  assert.equal(store.getRules().length, before + 1); // new id → inserted
});

// ---------------------------------------------------------------------------
// Response shaping (pure): folds status into the JSON payload
// ---------------------------------------------------------------------------

test("shapeResponse serializes body with status folded in", () => {
  const text = shapeResponse({ status: 401, body: { error: "unauthorized" } });
  const parsed = JSON.parse(text);
  assert.equal(parsed.status, 401);
  assert.equal(parsed.error, "unauthorized");
});

test("shapeResponse round-trips a 200 bootstrap body", () => {
  const text = shapeResponse({ status: 200, body: { habits: [], events: [] } });
  const parsed = JSON.parse(text);
  assert.equal(parsed.status, 200);
  assert.deepEqual(parsed.habits, []);
});
