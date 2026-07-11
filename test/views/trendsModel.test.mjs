// Unit tests for app/js/views/trendsModel.js — the pure Trends descriptor
// builder (task #005). It selects which chart set a habit gets from its `type`
// and fills each chart's series from the #002 core + #005 series aggregations.
// The thin DOM view (trends.js) only turns these descriptors into SVG; all the
// selection + data logic is proven here.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTrends, pickableHabits } from "../../app/js/views/trendsModel.js";

const CONFIG = { anchor_date: "2026-07-05", week_start: "sun" };

const RULES = [
  { rule_id: "p", habit_id: "pushups", days: "*", week_parity: "*", target: 6, effective_from: "2026-01-01", effective_to: "" },
  { rule_id: "b", habit_id: "bible_study", days: "*", week_parity: "*", target: 1, effective_from: "2026-01-01", effective_to: "" },
  { rule_id: "m", habit_id: "pushup_max", days: "*", week_parity: "*", target: 1, effective_from: "2026-01-01", effective_to: "" },
  { rule_id: "n", habit_id: "newbie", days: "*", week_parity: "*", target: 5, effective_from: "2026-01-01", effective_to: "" },
];

const HABITS = [
  { habit_id: "pushups", name: "Pushups", type: "counter", unit: "reps", sort_order: 1, active: true },
  { habit_id: "bible_study", name: "Bible Study", type: "binary", unit: "", sort_order: 2, active: true },
  { habit_id: "pushup_max", name: "Pushup max", type: "measurement", unit: "reps", sort_order: 3, active: true },
  { habit_id: "newbie", name: "Newbie", type: "counter", unit: "reps", sort_order: 4, active: true },
  { habit_id: "archived", name: "Old", type: "counter", unit: "reps", sort_order: 5, active: false },
];

function set(habitId, date, ts, value) {
  return { event_id: `s-${habitId}-${date}-${ts}`, ts: `${date}T${ts}`, date, habit_id: habitId, kind: "set", value, undo_of: "" };
}

const EVENTS = [
  // Pushups: 6 sets Mon 7/6, 3 sets Tue 7/7.
  set("pushups", "2026-07-06", "08:00:00", 10), set("pushups", "2026-07-06", "08:05:00", 10),
  set("pushups", "2026-07-06", "08:10:00", 10), set("pushups", "2026-07-06", "08:15:00", 10),
  set("pushups", "2026-07-06", "08:20:00", 10), set("pushups", "2026-07-06", "08:25:00", 10),
  set("pushups", "2026-07-07", "08:00:00", 12), set("pushups", "2026-07-07", "08:05:00", 12),
  set("pushups", "2026-07-07", "08:10:00", 12),
  // Bible: check Mon, skip Tue, (Wed missed).
  { event_id: "b1", ts: "2026-07-06T07:00:00", date: "2026-07-06", habit_id: "bible_study", kind: "check", value: "", undo_of: "" },
  { event_id: "b2", ts: "2026-07-07T07:00:00", date: "2026-07-07", habit_id: "bible_study", kind: "skip", value: "", undo_of: "" },
  // Pushup max: four measurements in date order (SPEC AC #5).
  { event_id: "m1", ts: "2026-06-01T07:00:00", date: "2026-06-01", habit_id: "pushup_max", kind: "measure", value: 40, undo_of: "" },
  { event_id: "m2", ts: "2026-06-10T07:00:00", date: "2026-06-10", habit_id: "pushup_max", kind: "measure", value: 42, undo_of: "" },
  { event_id: "m3", ts: "2026-06-20T07:00:00", date: "2026-06-20", habit_id: "pushup_max", kind: "measure", value: 45, undo_of: "" },
  { event_id: "m4", ts: "2026-07-01T07:00:00", date: "2026-07-01", habit_id: "pushup_max", kind: "measure", value: 48, undo_of: "" },
];

const TODAY = "2026-07-09";

function trends(habitId) {
  return buildTrends({ habits: HABITS, rules: RULES, config: CONFIG, events: EVENTS, habitId, today: TODAY });
}
function chart(desc, kind) {
  return desc.charts.find((c) => c.kind === kind);
}

// --- picker -----------------------------------------------------------------

test("pickableHabits lists active habits in sort order, archived excluded", () => {
  assert.deepEqual(
    pickableHabits(HABITS).map((h) => h.habitId),
    ["pushups", "bible_study", "pushup_max", "newbie"],
  );
});

// --- counter ----------------------------------------------------------------

test("counter habit gets daily-sets-vs-target, rolling avg, weekly total, and volume charts", () => {
  const t = trends("pushups");
  assert.equal(t.type, "counter");
  assert.equal(t.empty, false);
  const kinds = t.charts.map((c) => c.kind).sort();
  assert.deepEqual(kinds, ["avgPerSet", "counterDaily", "rollingAvg", "volume", "weeklyTotal"].sort());
});

test("counterDaily chart carries counts and the target-at-the-time per day", () => {
  const daily = chart(trends("pushups"), "counterDaily");
  const byDate = Object.fromEntries(daily.dates.map((d, i) => [d, { count: daily.counts[i], target: daily.targets[i] }]));
  // Range runs from the first pushups event (7/6) to today (7/9).
  assert.deepEqual(daily.dates, ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09"]);
  assert.equal(byDate["2026-07-06"].count, 6);
  assert.equal(byDate["2026-07-07"].count, 3);
  assert.equal(byDate["2026-07-08"].count, 0);
  assert.equal(byDate["2026-07-06"].target, 6);
});

test("counter volume chart totals the per-set reps for the day", () => {
  const vol = chart(trends("pushups"), "volume");
  const byDate = Object.fromEntries(vol.dates.map((d, i) => [d, vol.values[i]]));
  assert.equal(byDate["2026-07-06"], 60); // 6 sets × 10
  assert.equal(byDate["2026-07-07"], 36); // 3 sets × 12
});

test("counter weekly total sums the week's sets", () => {
  const wt = chart(trends("pushups"), "weeklyTotal");
  const idx = wt.weekStarts.indexOf("2026-07-05");
  assert.ok(idx >= 0);
  assert.equal(wt.totals[idx], 9); // 6 + 3 sets in the week of 7/5
});

test("counter rolling average is a 7-day trailing mean of daily set counts", () => {
  const ra = chart(trends("pushups"), "rollingAvg");
  // counts [6, 3, 0, 0]; trailing 7-day means → [6, 4.5, 3, 2.25].
  assert.deepEqual(ra.values, [6, 4.5, 3, 2.25]);
});

// --- binary -----------------------------------------------------------------

test("binary habit gets weekly-completion and heatmap charts", () => {
  const t = trends("bible_study");
  assert.equal(t.type, "binary");
  assert.deepEqual(t.charts.map((c) => c.kind).sort(), ["heatmap", "weeklyCompletion"].sort());
});

test("binary weekly completion excludes the skip day from the denominator", () => {
  const wc = chart(trends("bible_study"), "weeklyCompletion");
  const idx = wc.weekStarts.indexOf("2026-07-05");
  // Judged days in the week of 7/5 up to today: Sun 7/5 missed, Mon 7/6 complete,
  // Tue 7/7 skip (EXCLUDED), Wed 7/8 missed; 7/9 is today→pending (excluded).
  // 1 complete / 3 judged = 1/3 — the skip does not lower the denominator to 3
  // by being counted; it is simply left out.
  assert.equal(wc.rates[idx], 1 / 3);
});

test("binary heatmap reflects seeded green / skip / red days", () => {
  const hm = chart(trends("bible_study"), "heatmap");
  const byDate = Object.fromEntries(hm.days.map((d) => [d.date, d.state]));
  assert.equal(byDate["2026-07-06"], "green");
  assert.equal(byDate["2026-07-07"], "skip");
  assert.equal(byDate["2026-07-08"], "red");
});

// --- measurement (SPEC AC #5) -----------------------------------------------

test("measurement habit renders a progression line of its measure values in date order", () => {
  const t = trends("pushup_max");
  assert.equal(t.type, "measurement");
  const prog = chart(t, "progression");
  assert.deepEqual(prog.dates, ["2026-06-01", "2026-06-10", "2026-06-20", "2026-07-01"]);
  assert.deepEqual(prog.values, [40, 42, 45, 48]);
  assert.equal(prog.values.length, 4, "four seeded measurements → four points");
});

// --- empty state ------------------------------------------------------------

test("a habit with no events is flagged empty with no charts", () => {
  const t = trends("newbie");
  assert.equal(t.empty, true);
  assert.deepEqual(t.charts, []);
});

test("a measurement habit with a single point does not error and renders one point", () => {
  const single = EVENTS.filter((e) => e.event_id === "m1");
  const t = buildTrends({ habits: HABITS, rules: RULES, config: CONFIG, events: single, habitId: "pushup_max", today: TODAY });
  const prog = t.charts.find((c) => c.kind === "progression");
  assert.equal(t.empty, false);
  assert.deepEqual(prog.values, [40]);
});
