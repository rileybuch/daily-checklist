// Pure view-model builder for the Trends view (SPEC Section 5, view 3; task
// #005).
//
// This holds ALL of the Trends view's decision logic with zero DOM, so it is
// unit-testable under `node --test`. It selects the chart set from the habit's
// `type` and fills each chart's series from the #002 domain core + the #005
// series aggregations — it never recomputes counts, targets, states, or streaks
// itself. The thin DOM layer (trends.js) turns these descriptors into SVG.
//
// Range: a habit's trends span from its EARLIEST dated event to `today`, so an
// empty habit yields no charts (the view shows "No data yet") and a busy habit
// shows exactly its history.

import { resolveTarget } from "../core/targets.js";
import { binaryDayState, measureSeries } from "../core/derive.js";
import { addDays, weekStart } from "../core/dates.js";
import {
  counterDailySeries,
  counterVolumeSeries,
  rollingAverage,
  weeklyTotals,
  weeklyCompletionSeries,
} from "../core/series.js";

const ROLLING_WINDOW = 7;

/** Archived habits keep their history but leave the picker. Mirrors todayModel. */
function isActive(habit) {
  if (habit.active === undefined || habit.active === null || habit.active === "") {
    return true;
  }
  return habit.active === true || String(habit.active).toLowerCase() === "true";
}

/** Earliest dated, non-undo event for a habit, or null if it has none. */
function earliestEventDate(habitId, events) {
  let earliest = null;
  for (const event of events) {
    if (event.habit_id !== habitId || event.kind === "undo" || !event.date) {
      continue;
    }
    if (earliest === null || event.date < earliest) {
      earliest = event.date;
    }
  }
  return earliest;
}

/**
 * The active habits that can be picked in Trends, ordered by `sort_order`.
 * @param {Array<object>} habits
 * @returns {Array<{habitId: string, name: string, type: string}>}
 */
export function pickableHabits(habits) {
  return habits
    .filter(isActive)
    .slice()
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((h) => ({ habitId: h.habit_id, name: h.name, type: h.type }));
}

function counterCharts(habit, rules, config, events, fromDate, today) {
  const daily = counterDailySeries(habit.habit_id, fromDate, today, events, rules, config);
  const volume = counterVolumeSeries(habit.habit_id, fromDate, today, events);
  const weekly = weeklyTotals(habit.habit_id, fromDate, today, events);
  const dates = daily.map((d) => d.date);
  const counts = daily.map((d) => d.count);
  const unit = habit.unit || "";
  return [
    { kind: "counterDaily", title: "Daily sets vs target", dates, counts, targets: daily.map((d) => d.target) },
    { kind: "rollingAvg", title: "7-day rolling average (sets)", dates, values: rollingAverage(counts, ROLLING_WINDOW) },
    { kind: "weeklyTotal", title: "Weekly total (sets)", weekStarts: weekly.map((w) => w.weekStart), totals: weekly.map((w) => w.total) },
    { kind: "volume", title: `Daily volume${unit ? ` (${unit})` : ""}`, dates, values: volume.map((v) => v.totalValue) },
    { kind: "avgPerSet", title: `Average per set${unit ? ` (${unit})` : ""}`, dates, values: volume.map((v) => v.avgValue) },
  ];
}

function binaryCharts(habit, rules, config, events, fromDate, today) {
  const weekly = weeklyCompletionSeries(
    { habit_id: habit.habit_id, type: habit.type },
    fromDate,
    today,
    events,
    rules,
    config,
    today,
  );
  const days = [];
  let cursor = weekStart(fromDate);
  while (cursor <= today) {
    const resolved = resolveTarget(habit.habit_id, cursor, rules, config);
    days.push({ date: cursor, state: binaryDayState(habit.habit_id, cursor, events, resolved, today) });
    cursor = addDays(cursor, 1);
  }
  return [
    { kind: "weeklyCompletion", title: "Weekly completion %", weekStarts: weekly.map((w) => w.weekStart), rates: weekly.map((w) => w.rate) },
    { kind: "heatmap", title: "Daily heatmap", days },
  ];
}

function measurementCharts(habit, events) {
  const series = measureSeries(habit.habit_id, events);
  return [
    { kind: "progression", title: "Progression", dates: series.map((p) => p.date), values: series.map((p) => p.value) },
  ];
}

/**
 * Build the Trends descriptor for one habit.
 *
 * @param {{habits: Array, rules: Array, config: object, events: Array,
 *          habitId: string, today: string}} params
 * @returns {{habitId: string, name: string, type: string, unit: string,
 *            empty: boolean, charts: Array<object>}}
 *   `empty` is true (and `charts` is []) when the habit has no relevant events;
 *   the view renders "No data yet" in that case.
 */
export function buildTrends({ habits, rules, config, events, habitId, today }) {
  const habit = habits.find((h) => h.habit_id === habitId);
  if (!habit) {
    return { habitId, name: "", type: "", unit: "", empty: true, charts: [] };
  }

  const base = { habitId, name: habit.name, type: habit.type, unit: habit.unit || "" };
  const fromDate = earliestEventDate(habitId, events);
  if (fromDate === null) {
    return { ...base, empty: true, charts: [] };
  }

  let charts;
  if (habit.type === "counter") {
    charts = counterCharts(habit, rules, config, events, fromDate, today);
  } else if (habit.type === "binary") {
    charts = binaryCharts(habit, rules, config, events, fromDate, today);
  } else {
    charts = measurementCharts(habit, events);
  }

  return { ...base, empty: false, charts };
}
