// Unit tests for app/js/core/series.js — the trend-series aggregations the M4
// charts read (task #005). These are pure domain functions layered on the #002
// core (resolveTarget / counterDayCount / counterDayVolume / completionRate), so
// every chart number is proven here, not in the DOM view.
//
// Highest-risk coverage: the counter daily series compares each day against the
// TARGET-AT-THE-TIME (SPEC 5.3) — a fixture whose target changes mid-range must
// show both targets, honoring the #002 historical-target semantics.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  counterDailySeries,
  counterVolumeSeries,
  rollingAverage,
  weeklyTotals,
  weeklyCompletionSeries,
} from "../../app/js/core/series.js";
import {
  BIBLE_STUDY,
  BIBLE_RULES,
  BIBLE_EVENTS,
  GTG_CONFIG,
} from "./fixtures.mjs";

const CONFIG = { anchor_date: "2026-06-07", week_start: "sun" };

// Pushups: target 6 from Jun 1, raised to 8 from Jun 15 (mid-range change).
const PUSH_RULES = [
  { rule_id: "p-6", habit_id: "pushups", days: "*", week_parity: "*", target: 6, effective_from: "2026-06-01", effective_to: "" },
  { rule_id: "p-8", habit_id: "pushups", days: "*", week_parity: "*", target: 8, effective_from: "2026-06-15", effective_to: "" },
];

function set(date, ts, value) {
  return { event_id: `s-${date}-${ts}`, ts: `${date}T${ts}`, date, habit_id: "pushups", kind: "set", value, undo_of: "" };
}

// Mon Jun 8: 2 sets (10,12); Tue Jun 9: 1 set (14); later Jun 16: 3 sets (20,20,20).
const PUSH_EVENTS = [
  set("2026-06-08", "08:00:00", 10),
  set("2026-06-08", "08:05:00", 12),
  set("2026-06-09", "08:00:00", 14),
  set("2026-06-16", "08:00:00", 20),
  set("2026-06-16", "08:05:00", 20),
  set("2026-06-16", "08:10:00", 20),
];

// --- counterDailySeries: target-at-the-time --------------------------------

test("counterDailySeries reports each day's count and the target-at-the-time", () => {
  const series = counterDailySeries("pushups", "2026-06-08", "2026-06-16", PUSH_EVENTS, PUSH_RULES, CONFIG);
  const byDate = Object.fromEntries(series.map((d) => [d.date, d]));

  // Before Jun 15 the target is 6; on/after it is 8 — same habit, no per-day store.
  assert.equal(byDate["2026-06-08"].target, 6);
  assert.equal(byDate["2026-06-14"].target, 6);
  assert.equal(byDate["2026-06-15"].target, 8);
  assert.equal(byDate["2026-06-16"].target, 8);

  // Counts come from #002 counterDayCount (sets in SETS, not per-set value).
  assert.equal(byDate["2026-06-08"].count, 2);
  assert.equal(byDate["2026-06-09"].count, 1);
  assert.equal(byDate["2026-06-16"].count, 3);
  assert.equal(byDate["2026-06-10"].count, 0);
});

test("counterDailySeries spans every calendar day in the inclusive range", () => {
  const series = counterDailySeries("pushups", "2026-06-08", "2026-06-16", PUSH_EVENTS, PUSH_RULES, CONFIG);
  assert.equal(series.length, 9); // Jun 8..16 inclusive
  assert.equal(series[0].date, "2026-06-08");
  assert.equal(series[8].date, "2026-06-16");
});

test("counterDailySeries marks unscheduled days scheduled:false with target null", () => {
  // A range day before any rule is in scope → not scheduled.
  const series = counterDailySeries("pushups", "2026-05-30", "2026-06-01", PUSH_EVENTS, PUSH_RULES, CONFIG);
  const byDate = Object.fromEntries(series.map((d) => [d.date, d]));
  assert.equal(byDate["2026-05-30"].scheduled, false);
  assert.equal(byDate["2026-05-30"].target, null);
  assert.equal(byDate["2026-06-01"].scheduled, true);
  assert.equal(byDate["2026-06-01"].target, 6);
});

// --- counterVolumeSeries ----------------------------------------------------

test("counterVolumeSeries returns per-day total and average of per-set values", () => {
  const vol = counterVolumeSeries("pushups", "2026-06-08", "2026-06-16", PUSH_EVENTS);
  const byDate = Object.fromEntries(vol.map((d) => [d.date, d]));
  assert.deepEqual(
    { total: byDate["2026-06-08"].totalValue, avg: byDate["2026-06-08"].avgValue, sets: byDate["2026-06-08"].setCount },
    { total: 22, avg: 11, sets: 2 },
  );
  assert.equal(byDate["2026-06-16"].totalValue, 60);
  assert.equal(byDate["2026-06-16"].avgValue, 20);
  // A day with no sets has zeroed volume, not NaN.
  assert.equal(byDate["2026-06-10"].totalValue, 0);
  assert.equal(byDate["2026-06-10"].avgValue, 0);
});

// --- rollingAverage ---------------------------------------------------------

test("rollingAverage is a trailing mean that shrinks the window at the start", () => {
  assert.deepEqual(rollingAverage([1, 2, 3, 4, 5, 6, 7, 8], 3), [1, 1.5, 2, 3, 4, 5, 6, 7]);
});

test("rollingAverage over a single-day window is the identity", () => {
  assert.deepEqual(rollingAverage([3, 0, 6], 1), [3, 0, 6]);
});

test("rollingAverage of an empty series is empty", () => {
  assert.deepEqual(rollingAverage([], 7), []);
});

// --- weeklyTotals -----------------------------------------------------------

test("weeklyTotals groups set counts into Sun–Sat buckets", () => {
  // Jun 7 is a Sunday (anchor). Jun 8/9 fall in week of Jun 7; Jun 16 in week of Jun 14.
  const weeks = weeklyTotals("pushups", "2026-06-07", "2026-06-16", PUSH_EVENTS);
  const byWeek = Object.fromEntries(weeks.map((w) => [w.weekStart, w.total]));
  assert.equal(byWeek["2026-06-07"], 3); // Mon 2 + Tue 1
  assert.equal(byWeek["2026-06-14"], 3); // Jun 16 → 3 sets
});

// --- weeklyCompletionSeries (binary) ----------------------------------------

test("weeklyCompletionSeries gives per-week completion with skip excluded", () => {
  // BIBLE_EVENTS: Sun–Wed checked, Thu skip, Fri checked, Sat missed (week of Jun 7).
  // Denominator excludes the skip → 5 completed / 6 judged.
  const weeks = weeklyCompletionSeries(BIBLE_STUDY, "2026-06-07", "2026-06-13", BIBLE_EVENTS, BIBLE_RULES, CONFIG, "2026-06-20");
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].weekStart, "2026-06-07");
  assert.equal(Math.round(weeks[0].rate * 1000) / 1000, Math.round((5 / 6) * 1000) / 1000);
});

// Guard against an accidental dependency on GTG_CONFIG shape drift.
test("fixtures import cleanly", () => {
  assert.ok(GTG_CONFIG.anchor_date);
});
