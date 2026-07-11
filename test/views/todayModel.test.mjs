// Unit tests for app/js/views/todayModel.js — the pure Today view-model builder.
// AC: only habits scheduled for the selected date render, ordered by sort_order;
// each row carries the type-specific state the thin DOM layer renders. The date
// drives which schedule applies (backfill). Archived habits are excluded.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTodayRows } from "../../app/js/views/todayModel.js";
import { GTG_CONFIG, GTG_RULES, BIBLE_RULES } from "../core/fixtures.mjs";

const HABITS = [
  { habit_id: "pushups", name: "Pushups", type: "counter", unit: "reps", sort_order: 1, active: true },
  { habit_id: "wall_sits", name: "Wall-sits", type: "counter", unit: "seconds", sort_order: 2, active: true },
  { habit_id: "bible_study", name: "Bible Study", type: "binary", unit: "", sort_order: 3, active: true },
  { habit_id: "pushup_max", name: "Pushup max", type: "measurement", unit: "reps", sort_order: 4, active: true },
  { habit_id: "archived", name: "Old habit", type: "counter", unit: "reps", sort_order: 0, active: false },
];

// A daily rule so the measurement habit is scheduled every day.
const MEASURE_RULES = [
  { rule_id: "pm-daily", habit_id: "pushup_max", days: "*", week_parity: "*", target: 1, effective_from: "2026-01-01", effective_to: "" },
];
const RULES = [...GTG_RULES, ...BIBLE_RULES, ...MEASURE_RULES];

// 2026-07-06 is a Monday under the GTG anchor: pushups target 6, wall_sits 4.
const MONDAY = "2026-07-06";
const TODAY = "2026-07-08";

function rowFor(rows, habitId) {
  return rows.find((r) => r.habitId === habitId);
}

test("only active habits scheduled for the date render, sorted by sort_order", () => {
  const rows = buildTodayRows({ habits: HABITS, rules: RULES, config: GTG_CONFIG, events: [], date: MONDAY, today: TODAY });
  assert.deepEqual(rows.map((r) => r.habitId), ["pushups", "wall_sits", "bible_study", "pushup_max"]);
  assert.equal(rowFor(rows, "archived"), undefined, "archived habits are excluded");
});

test("a counter row carries count, target, unit, fill ratio and derived state", () => {
  const events = [
    { event_id: "s1", ts: "2026-07-06T08:00:00", date: MONDAY, habit_id: "pushups", kind: "set", value: 12, undo_of: "" },
    { event_id: "s2", ts: "2026-07-06T08:05:00", date: MONDAY, habit_id: "pushups", kind: "set", value: 14, undo_of: "" },
  ];
  const rows = buildTodayRows({ habits: HABITS, rules: RULES, config: GTG_CONFIG, events, date: MONDAY, today: MONDAY });
  const row = rowFor(rows, "pushups");
  assert.equal(row.type, "counter");
  assert.equal(row.unit, "reps");
  assert.equal(row.target, 6);
  assert.equal(row.count, 2);
  assert.equal(row.state, "amber");
  assert.ok(Math.abs(row.fillRatio - 2 / 6) < 1e-9);
  assert.deepEqual(row.lastSet, { event_id: "s2", value: 14 }, "exposes the just-logged set for the stepper");
});

test("a counter row with no sets has a null lastSet", () => {
  const rows = buildTodayRows({ habits: HABITS, rules: RULES, config: GTG_CONFIG, events: [], date: MONDAY, today: MONDAY });
  assert.equal(rowFor(rows, "pushups").lastSet, null);
});

test("wall-sits render seconds as the unit; pushups render reps", () => {
  const rows = buildTodayRows({ habits: HABITS, rules: RULES, config: GTG_CONFIG, events: [], date: MONDAY, today: MONDAY });
  assert.equal(rowFor(rows, "pushups").unit, "reps");
  assert.equal(rowFor(rows, "wall_sits").unit, "seconds");
});

test("a binary row carries its derived day-state", () => {
  const events = [
    { event_id: "c1", ts: "2026-07-06T07:00:00", date: MONDAY, habit_id: "bible_study", kind: "check", value: "", undo_of: "" },
  ];
  const rows = buildTodayRows({ habits: HABITS, rules: RULES, config: GTG_CONFIG, events, date: MONDAY, today: MONDAY });
  const row = rowFor(rows, "bible_study");
  assert.equal(row.type, "binary");
  assert.equal(row.state, "green");
});

test("a measurement row is never red and exposes its value series", () => {
  const events = [
    { event_id: "m1", ts: "2026-07-01T07:00:00", date: "2026-07-01", habit_id: "pushup_max", kind: "measure", value: 40, undo_of: "" },
    { event_id: "m2", ts: "2026-07-05T07:00:00", date: "2026-07-05", habit_id: "pushup_max", kind: "measure", value: 44, undo_of: "" },
  ];
  const rows = buildTodayRows({ habits: HABITS, rules: RULES, config: GTG_CONFIG, events, date: MONDAY, today: MONDAY });
  const row = rowFor(rows, "pushup_max");
  assert.equal(row.type, "measurement");
  assert.notEqual(row.state, "red");
  assert.equal(row.series.length, 2);
  assert.equal(row.lastValue, 44);
});

test("changing the date re-resolves the schedule (backfill): Sunday is a rest day", () => {
  // 2026-07-05 is the anchor Sunday → counter target 0 (scheduled rest).
  const rows = buildTodayRows({ habits: HABITS, rules: RULES, config: GTG_CONFIG, events: [], date: "2026-07-05", today: TODAY });
  const push = rowFor(rows, "pushups");
  assert.equal(push.target, 0);
  assert.equal(push.state, "green", "a scheduled rest day is satisfied, not red");
});

test("no scheduled habits yields an empty row list (drives the empty state)", () => {
  const rows = buildTodayRows({ habits: HABITS, rules: [], config: GTG_CONFIG, events: [], date: MONDAY, today: TODAY });
  assert.deepEqual(rows, []);
});
