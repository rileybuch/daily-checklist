// Unit tests for app/js/views/statsModel.js — the pure Stats descriptor builder
// (task #005, SPEC 5.4). It reads current/best streak and 30/90-day completion
// straight from the #002 core for each active habit; this proves the plumbing and
// the window bounds, and that `skip` days are excluded from the completion
// denominator (the core guarantees the semantics — see stats.test.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildStats } from "../../app/js/views/statsModel.js";

const CONFIG = { anchor_date: "2026-07-05", week_start: "sun" };
const TODAY = "2026-07-09";

const RULES = [
  // effective_from 7/4 → days before it are unscheduled (excluded), so the
  // completion window is a clean, hand-computable set of judged days.
  { rule_id: "b", habit_id: "bible_study", days: "*", week_parity: "*", target: 1, effective_from: "2026-07-04", effective_to: "" },
  { rule_id: "m", habit_id: "pushup_max", days: "*", week_parity: "*", target: 1, effective_from: "2026-01-01", effective_to: "" },
  { rule_id: "n", habit_id: "newbie", days: "*", week_parity: "*", target: 1, effective_from: "2026-01-01", effective_to: "" },
];

const HABITS = [
  { habit_id: "bible_study", name: "Bible Study", type: "binary", unit: "", sort_order: 1, active: true },
  { habit_id: "pushup_max", name: "Pushup max", type: "measurement", unit: "reps", sort_order: 2, active: true },
  { habit_id: "newbie", name: "Newbie", type: "binary", unit: "", sort_order: 3, active: true },
  { habit_id: "archived", name: "Old", type: "binary", unit: "", sort_order: 4, active: false },
];

function bin(date, kind) {
  return { event_id: `${kind}-${date}`, ts: `${date}T07:00:00`, date, habit_id: "bible_study", kind, value: "", undo_of: "" };
}
const EVENTS = [
  bin("2026-07-04", "check"), // complete
  bin("2026-07-05", "skip"), //  skip → excluded from denominator
  // 2026-07-06 → missed (no event, past) → incomplete
  bin("2026-07-07", "check"),
  bin("2026-07-08", "check"),
  bin("2026-07-09", "check"), // today, complete
  { event_id: "m1", ts: "2026-06-01T07:00:00", date: "2026-06-01", habit_id: "pushup_max", kind: "measure", value: 40, undo_of: "" },
];

function stats() {
  return buildStats({ habits: HABITS, rules: RULES, config: CONFIG, events: EVENTS, today: TODAY });
}
function row(habitId) {
  return stats().find((r) => r.habitId === habitId);
}

test("one row per active habit in sort order; archived excluded", () => {
  assert.deepEqual(stats().map((r) => r.habitId), ["bible_study", "pushup_max", "newbie"]);
});

test("binary habit reports current streak, best streak, and 30/90-day completion", () => {
  const bs = row("bible_study");
  assert.equal(bs.applicable, true);
  assert.equal(bs.hasData, true);
  assert.equal(bs.currentStreak, 3); // 7/7, 7/8, 7/9 back to the 7/6 miss
  assert.equal(bs.bestStreak, 3);
  // Completion: 4 complete / (4 complete + 1 miss) = 0.8; the 7/5 skip is excluded.
  assert.equal(bs.completion30, 0.8);
  assert.equal(bs.completion90, 0.8);
});

test("the skip day is excluded from the completion denominator (not counted as a miss)", () => {
  const bs = row("bible_study");
  // If the skip counted, the denominator would be 6 and the rate 4/6 ≈ 0.667.
  assert.notEqual(bs.completion30, 4 / 6);
});

test("measurement habits are not applicable for streaks/completion (no daily state)", () => {
  const pm = row("pushup_max");
  assert.equal(pm.applicable, false);
  assert.equal(pm.currentStreak, null);
  assert.equal(pm.bestStreak, null);
  assert.equal(pm.completion30, null);
  assert.equal(pm.hasData, true); // it does have a measurement
});

test("a habit with no events reports no data and zeroed streaks", () => {
  const nb = row("newbie");
  assert.equal(nb.hasData, false);
  assert.equal(nb.currentStreak, 0);
  assert.equal(nb.bestStreak, 0);
});
