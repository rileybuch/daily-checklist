// Unit tests for app/js/views/weekModel.js — the pure Week-grid view-model.
//
// AC coverage (SPEC 5.2):
//   - one row per active habit ordered by sort_order; seven Sun–Sat day headers
//     with correct dates for the selected week;
//   - binary cells green / red / hatched-skip / light-gray for a seeded week;
//   - counter cells n/target coloured green (met) / amber (partial) / red (0 on a
//     scheduled past day); target=0 scheduled-rest reads as a rest, never red;
//   - future & unscheduled cells light-gray, never red;
//   - measurement rows neutral (dot on measure days, blank otherwise), never red;
//   - paging: building the grid for the previous/next week yields that week's
//     dates, label, and states.
//
// All cell states come from the #002 domain core; this suite proves the grid is a
// faithful, pure projection of that core plus the presentation fields the thin
// DOM view (week.js) renders.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildWeekGrid } from "../../app/js/views/weekModel.js";
import { GTG_CONFIG, GTG_RULES, BIBLE_RULES } from "../core/fixtures.mjs";

// pushup_max (daily) + a Sunday-only binary so we can exercise "unscheduled".
const MEASURE_RULES = [
  { rule_id: "pm-daily", habit_id: "pushup_max", days: "*", week_parity: "*", target: 1, effective_from: "2026-01-01", effective_to: "" },
];
const SUNDAY_ONLY_RULES = [
  { rule_id: "so-sun", habit_id: "sabbath", days: "sun", week_parity: "*", target: 1, effective_from: "2026-01-01", effective_to: "" },
];
const RULES = [...GTG_RULES, ...BIBLE_RULES, ...MEASURE_RULES, ...SUNDAY_ONLY_RULES];

const HABITS = [
  { habit_id: "pushups", name: "Pushups", type: "counter", unit: "reps", sort_order: 1, active: true },
  { habit_id: "wall_sits", name: "Wall-sits", type: "counter", unit: "seconds", sort_order: 2, active: true },
  { habit_id: "bible_study", name: "Bible Study", type: "binary", unit: "", sort_order: 3, active: true },
  { habit_id: "sabbath", name: "Sabbath", type: "binary", unit: "", sort_order: 4, active: true },
  { habit_id: "pushup_max", name: "Pushup max", type: "measurement", unit: "reps", sort_order: 5, active: true },
  { habit_id: "archived", name: "Old habit", type: "counter", unit: "reps", sort_order: 0, active: false },
];

// Week 1 under the GTG anchor: Sun 2026-07-05 .. Sat 2026-07-11 (even parity).
const WEEK1_START = "2026-07-05";
// A `today` past the whole week so every day is in the past (deterministic states).
const AFTER = "2026-08-01";

// Seeded events for Week 1.
function set(habitId, date, ts, value = 10) {
  return { event_id: `${habitId}-${date}-${ts}`, ts: `${date}T${ts}`, date, habit_id: habitId, kind: "set", value, undo_of: "" };
}
const WEEK1_EVENTS = [
  // Pushups (target: Sun 0, Mon–Fri 6, Sat-even 3).
  set("pushups", "2026-07-06", "08:00:00"), set("pushups", "2026-07-06", "08:05:00"),
  set("pushups", "2026-07-06", "08:10:00"), set("pushups", "2026-07-06", "08:15:00"),
  set("pushups", "2026-07-06", "08:20:00"), set("pushups", "2026-07-06", "08:25:00"), // Mon → 6/6 green
  set("pushups", "2026-07-07", "08:00:00"), set("pushups", "2026-07-07", "08:05:00"),
  set("pushups", "2026-07-07", "08:10:00"), // Tue → 3/6 amber
  // Wed 2026-07-08 → 0/6 red (no sets)
  // Bible Study (daily target 1).
  { event_id: "b1", ts: "2026-07-06T07:00:00", date: "2026-07-06", habit_id: "bible_study", kind: "check", value: "", undo_of: "" }, // Mon green
  { event_id: "b2", ts: "2026-07-07T07:00:00", date: "2026-07-07", habit_id: "bible_study", kind: "skip", value: "", undo_of: "" }, // Tue skip
  // Wed 2026-07-08 → no event → red
  // Pushup max measurement.
  { event_id: "m1", ts: "2026-07-06T07:00:00", date: "2026-07-06", habit_id: "pushup_max", kind: "measure", value: 44, undo_of: "" },
];

function grid(opts = {}) {
  return buildWeekGrid({
    habits: HABITS,
    rules: RULES,
    config: GTG_CONFIG,
    events: opts.events || WEEK1_EVENTS,
    weekStartDate: opts.weekStartDate || WEEK1_START,
    today: opts.today || AFTER,
  });
}

function rowFor(g, habitId) {
  return g.rows.find((r) => r.habitId === habitId);
}
function cellOn(row, iso) {
  return row.cells.find((c) => c.date === iso);
}

// --- rows & headers ---------------------------------------------------------

test("one row per active habit, ordered by sort_order; archived excluded", () => {
  const g = grid();
  assert.deepEqual(
    g.rows.map((r) => r.habitId),
    ["pushups", "wall_sits", "bible_study", "sabbath", "pushup_max"],
  );
});

test("seven Sun–Sat day headers with the selected week's dates", () => {
  const g = grid();
  assert.equal(g.days.length, 7);
  assert.deepEqual(g.days.map((d) => d.label), ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  assert.deepEqual(
    g.days.map((d) => d.date),
    ["2026-07-05", "2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11"],
  );
  assert.deepEqual(g.days.map((d) => d.dayNum), [5, 6, 7, 8, 9, 10, 11]);
});

test("weekStart normalises any in-week date to that week's Sunday", () => {
  const g = grid({ weekStartDate: "2026-07-08" }); // a Wednesday
  assert.equal(g.weekStart, "2026-07-05");
  assert.equal(g.weekEnd, "2026-07-11");
});

test("week label shows the Sun–Sat date range", () => {
  assert.equal(grid().label, "Jul 5 – 11");
});

// --- binary cells -----------------------------------------------------------

test("binary cells: green / skip / red across the seeded week", () => {
  const bs = rowFor(grid(), "bible_study");
  assert.equal(cellOn(bs, "2026-07-06").state, "green");
  assert.equal(cellOn(bs, "2026-07-07").state, "skip");
  assert.equal(cellOn(bs, "2026-07-08").state, "red");
});

test("binary unscheduled days are light-gray (unscheduled), never red", () => {
  const sab = rowFor(grid(), "sabbath"); // scheduled Sundays only
  assert.equal(cellOn(sab, "2026-07-05").state, "red"); // Sun scheduled, past, no check → red
  // Mon–Sat are not scheduled for a Sunday-only habit → unscheduled.
  for (const iso of ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11"]) {
    const cell = cellOn(sab, iso);
    assert.equal(cell.state, "unscheduled", `${iso} should be unscheduled`);
    assert.notEqual(cell.state, "red");
  }
});

// --- counter cells ----------------------------------------------------------

test("counter cells: n/target coloured green (met), amber (partial), red (0 past)", () => {
  const push = rowFor(grid(), "pushups");
  const mon = cellOn(push, "2026-07-06");
  assert.equal(mon.state, "green");
  assert.equal(mon.display, "6/6");
  const tue = cellOn(push, "2026-07-07");
  assert.equal(tue.state, "amber");
  assert.equal(tue.display, "3/6");
  const wed = cellOn(push, "2026-07-08");
  assert.equal(wed.state, "red");
  assert.equal(wed.display, "0/6");
});

test("a target=0 scheduled-rest cell reads as a rest and is never red", () => {
  const push = rowFor(grid(), "pushups");
  const sun = cellOn(push, "2026-07-05"); // Sunday target 0
  assert.equal(sun.state, "rest");
  assert.notEqual(sun.state, "red");
  assert.equal(sun.display, "rest");
});

// --- future / unscheduled ---------------------------------------------------

test("future days render light-gray (pending) and are never red", () => {
  // today = Tuesday of week 1 → Wed..Sat are future.
  const push = rowFor(grid({ today: "2026-07-07" }), "pushups");
  for (const iso of ["2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11"]) {
    const cell = cellOn(push, iso);
    assert.equal(cell.state, "pending", `${iso} future should be pending`);
    assert.notEqual(cell.state, "red");
    assert.equal(cell.isFuture, true);
    assert.equal(cell.display, "", "future counter cells show no count");
  }
});

// --- measurement rows -------------------------------------------------------

test("measurement rows are neutral: a dot on measure days, blank otherwise, never red", () => {
  const pm = rowFor(grid(), "pushup_max");
  for (const cell of pm.cells) {
    assert.equal(cell.state, "measurement");
    assert.notEqual(cell.state, "red");
  }
  assert.equal(cellOn(pm, "2026-07-06").hasMeasure, true);
  assert.equal(cellOn(pm, "2026-07-07").hasMeasure, false);
});

// --- backfill affordance ----------------------------------------------------

test("cells are editable (backfillable) for past/today dates, not future", () => {
  const push = rowFor(grid({ today: "2026-07-07" }), "pushups");
  assert.equal(cellOn(push, "2026-07-06").editable, true, "past day editable");
  assert.equal(cellOn(push, "2026-07-07").editable, true, "today editable");
  assert.equal(cellOn(push, "2026-07-08").editable, false, "future day not editable");
});

// --- paging -----------------------------------------------------------------

test("paging to the previous week yields that week's dates, label and states", () => {
  const prev = grid({ weekStartDate: "2026-06-28" }); // Sun 2026-06-28 .. Sat 2026-07-04
  assert.deepEqual(
    prev.days.map((d) => d.date),
    ["2026-06-28", "2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"],
  );
  assert.equal(prev.label, "Jun 28 – Jul 4");
  // No events seeded that week → weekday counter cells are red (0 on scheduled past).
  assert.equal(cellOn(rowFor(prev, "pushups"), "2026-06-29").state, "red"); // Monday
});

test("paging to the next (odd-parity) week flips the alternating Saturday to a rest", () => {
  // Week 2: Sun 2026-07-12 .. Sat 2026-07-18 (odd parity → Sat target 0 rest).
  const next = grid({ weekStartDate: "2026-07-12" });
  assert.equal(next.label, "Jul 12 – 18");
  const satPush = cellOn(rowFor(next, "pushups"), "2026-07-18");
  assert.equal(satPush.state, "rest", "odd-parity Saturday is a scheduled rest");
  assert.notEqual(satPush.state, "red");
});

test("label spans months and years correctly", () => {
  const g = grid({ weekStartDate: "2026-12-27" }); // Sun 2026-12-27 .. Sat 2027-01-02
  assert.equal(g.label, "Dec 27 – Jan 2");
});
