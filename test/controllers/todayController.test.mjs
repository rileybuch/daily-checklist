// Unit tests for app/js/controllers/todayController.js — the DOM-agnostic
// orchestration the thin Today view delegates to. Drives every interactive AC:
// optimistic ＋, inline stepper, undo, binary toggle/skip, measure, date switch,
// and force-close / offline queue survival — all against fakes, no live server.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createTodayController } from "../../app/js/controllers/todayController.js";
import { createQueue } from "../../app/js/data/queue.js";
import { createApiClient } from "../../app/js/data/apiClient.js";
import { createSyncEngine } from "../../app/js/data/sync.js";
import { GTG_CONFIG, GTG_RULES, BIBLE_RULES } from "../core/fixtures.mjs";
import { FakeStorage, FakeSheet, sheetTransport, flakyTransport, seqIds } from "../helpers/fakes.mjs";

const HABITS = [
  { habit_id: "pushups", name: "Pushups", type: "counter", unit: "reps", sort_order: 1, active: true },
  { habit_id: "wall_sits", name: "Wall-sits", type: "counter", unit: "seconds", sort_order: 2, active: true },
  { habit_id: "bible_study", name: "Bible Study", type: "binary", unit: "", sort_order: 3, active: true },
  { habit_id: "pushup_max", name: "Pushup max", type: "measurement", unit: "reps", sort_order: 4, active: true },
];
const MEASURE_RULES = [
  { rule_id: "pm-daily", habit_id: "pushup_max", days: "*", week_parity: "*", target: 1, effective_from: "2026-01-01", effective_to: "" },
];
const RULES = [...GTG_RULES, ...BIBLE_RULES, ...MEASURE_RULES];

const MONDAY = "2026-07-06"; // work day: pushups target 6, wall_sits 4
const YESTERDAY = "2026-07-05"; // anchor Sunday: rest

function makeController({ bootstrapEvents = [], todayIso = MONDAY, storage = new FakeStorage() } = {}) {
  const queue = createQueue({ storage });
  const controller = createTodayController({
    bootstrapData: { habits: HABITS, target_rules: RULES, config: GTG_CONFIG, events: bootstrapEvents },
    queue,
    newId: seqIds("ev"),
    now: () => `${todayIso}T09:00:00`,
    todayIso,
    defaultSetValue: 1,
  });
  return { controller, queue, storage };
}

function row(controller, habitId) {
  return controller.rows().find((r) => r.habitId === habitId);
}

// --- AC: optimistic ＋ ------------------------------------------------------

test("logSet enqueues one set with a UUID and pre-filled value, and the count increments immediately", () => {
  const { controller, queue } = makeController();
  assert.equal(row(controller, "pushups").count, 0);

  const event = controller.logSet("pushups");

  assert.ok(event.event_id, "carries a client-generated event_id");
  assert.equal(event.kind, "set");
  assert.equal(event.date, MONDAY);
  assert.equal(queue.size(), 1, "one event queued for the network");
  assert.equal(row(controller, "pushups").count, 1, "count updates before any flush");
});

test("logSet pre-fills the value from the habit's previous set", () => {
  const { controller } = makeController({
    bootstrapEvents: [
      { event_id: "prev", ts: "2026-07-04T08:00:00", date: "2026-07-04", habit_id: "pushups", kind: "set", value: 12, undo_of: "" },
    ],
  });
  const event = controller.logSet("pushups");
  assert.equal(event.value, 12);
});

test("the very first set of a brand-new habit falls back to the default value", () => {
  const { controller } = makeController();
  assert.equal(controller.logSet("pushups").value, 1);
});

// --- AC: inline stepper edits value in place, count unchanged ---------------

test("editSetValue changes the just-logged set's value without adding or removing a set", () => {
  const { controller, queue } = makeController();
  const event = controller.logSet("pushups"); // value 1
  assert.equal(row(controller, "pushups").count, 1);

  controller.editSetValue(event.event_id, 14);

  assert.equal(row(controller, "pushups").count, 1, "count is unchanged by an edit");
  assert.equal(row(controller, "pushups").volume.totalValue, 14, "the edited value is reflected");
  assert.equal(queue.list()[0].value, 14, "the queued event is patched in place before flush");
});

// --- AC: undo decrements immediately ---------------------------------------

test("undoLast enqueues an undo of the last set and the count decrements immediately", () => {
  const { controller, queue } = makeController();
  const first = controller.logSet("pushups");
  const second = controller.logSet("pushups");
  assert.equal(row(controller, "pushups").count, 2);

  const undo = controller.undoLast("pushups");

  assert.equal(undo.kind, "undo");
  assert.equal(undo.undo_of, second.event_id, "voids the most recent set");
  assert.equal(row(controller, "pushups").count, 1, "count drops immediately");
  assert.equal(queue.size(), 3, "the undo is itself an enqueued event");
  void first;
});

test("undoLast is a no-op when there is no set to void", () => {
  const { controller, queue } = makeController();
  assert.equal(controller.undoLast("pushups"), null);
  assert.equal(queue.size(), 0);
});

// --- AC: wall-sits log seconds, pushups reps -------------------------------

test("wall-sits log a set treated as seconds; pushups as reps (per unit), pre-filled per habit", () => {
  const { controller } = makeController({
    bootstrapEvents: [
      { event_id: "p", ts: "2026-07-04T08:00:00", date: "2026-07-04", habit_id: "pushups", kind: "set", value: 15, undo_of: "" },
      { event_id: "w", ts: "2026-07-04T08:10:00", date: "2026-07-04", habit_id: "wall_sits", kind: "set", value: 45, undo_of: "" },
    ],
  });
  const push = controller.logSet("pushups");
  const wall = controller.logSet("wall_sits");

  assert.equal(push.value, 15);
  assert.equal(wall.value, 45);
  assert.equal(row(controller, "pushups").unit, "reps");
  assert.equal(row(controller, "wall_sits").unit, "seconds");
});

// --- AC: binary toggle / skip ----------------------------------------------

test("toggleBinary enqueues check then uncheck, and the cell state follows", () => {
  const { controller, queue } = makeController();
  assert.equal(row(controller, "bible_study").state, "pending");

  const checked = controller.toggleBinary("bible_study");
  assert.equal(checked.kind, "check");
  assert.equal(row(controller, "bible_study").state, "green");

  const unchecked = controller.toggleBinary("bible_study");
  assert.equal(unchecked.kind, "uncheck");
  assert.equal(row(controller, "bible_study").state, "pending");
  assert.equal(queue.size(), 2);
});

test("skipBinary enqueues a skip and the cell reflects the skip state", () => {
  const { controller } = makeController();
  const skip = controller.skipBinary("bible_study");
  assert.equal(skip.kind, "skip");
  assert.equal(row(controller, "bible_study").state, "skip");
});

// --- AC: measurement submit ------------------------------------------------

test("recordMeasure enqueues a measure event with the entered value", () => {
  const { controller, queue } = makeController();
  const m = controller.recordMeasure("pushup_max", 47);
  assert.equal(m.kind, "measure");
  assert.equal(m.value, 47);
  assert.equal(queue.size(), 1);
  assert.equal(row(controller, "pushup_max").lastValue, 47);
});

// --- AC: date switch / backfill --------------------------------------------

test("setDate re-renders using the selected date's schedule and stamps events with that date", () => {
  const { controller } = makeController();
  controller.setDate(YESTERDAY); // anchor Sunday → rest for counters
  assert.equal(row(controller, "pushups").target, 0);

  // A binary check while backfilling carries yesterday's date.
  const check = controller.toggleBinary("bible_study");
  assert.equal(check.date, YESTERDAY);
});

// --- AC: force-close survival + offline exactly-once (integration) ----------

test("events survive a force-close: a new controller over the same storage recovers the queued sets", () => {
  const storage = new FakeStorage();
  const a = makeController({ storage });
  a.controller.logSet("pushups");
  a.controller.logSet("pushups");
  assert.equal(a.controller.pendingCount(), 2);

  // App killed and reopened before any flush: fresh controller, same storage.
  const b = makeController({ storage });
  assert.equal(b.controller.pendingCount(), 2, "queued events persisted");
  assert.equal(row(b.controller, "pushups").count, 2, "optimistic count restored from the queue");
});

test("offline-then-online flush lands every set exactly once (no duplicates)", async () => {
  const storage = new FakeStorage();
  const queue = createQueue({ storage });
  const sheet = new FakeSheet();
  const transport = flakyTransport(sheetTransport(sheet, { token: "tok" }), 1);
  const apiClient = createApiClient({ baseUrl: "https://script/exec", token: "tok", transport });
  const sync = createSyncEngine({ queue, apiClient });
  const controller = createTodayController({
    bootstrapData: { habits: HABITS, target_rules: RULES, config: GTG_CONFIG, events: [] },
    queue,
    sync,
    newId: seqIds("ev"),
    now: () => `${MONDAY}T09:00:00`,
    todayIso: MONDAY,
  });

  controller.logSet("wall_sits");
  controller.logSet("wall_sits");
  controller.logSet("wall_sits");

  const offline = await controller.flush(); // network down
  assert.equal(offline.flushed, 0);
  assert.equal(controller.pendingCount(), 3);

  const online = await controller.flush(); // reconnected
  assert.equal(online.flushed, 3);
  assert.equal(controller.pendingCount(), 0);
  await controller.flush(); // redundant
  assert.equal(sheet.events.length, 3, "each set landed exactly once");
});
