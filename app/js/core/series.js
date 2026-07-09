// Trend-series aggregations for the habit tracker domain core (SPEC 5.3, task
// #005).
//
// The M4 charts need aggregations the base #002 core does not expose directly —
// per-day series over a range, a rolling average, weekly totals, per-week
// completion. These are PURE functions layered on the existing core
// (resolveTarget / counterDayCount / counterDayVolume / completionRate); they add
// NO new derivation rules, so every chart number stays anchored to the #002
// definitions. No DOM, fetch, or Google globals.
//
// TARGET-AT-THE-TIME (SPEC 5.3): counterDailySeries resolves the target for each
// date independently via resolveTarget, so a day is always judged against the
// target that applied *then* — a rule change mid-range shows both targets.

import { addDays, weekStart } from "./dates.js";
import { resolveTarget } from "./targets.js";
import { counterDayCount, counterDayVolume } from "./derive.js";
import { completionRate } from "./stats.js";

/** Inclusive list of ISO dates from `fromDate` to `toDate` (empty if reversed). */
function dateRange(fromDate, toDate) {
  const dates = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/**
 * Daily counter series over an inclusive date range: each day's non-voided set
 * count paired with the target-at-the-time.
 *
 * @param {string} habitId
 * @param {string} fromDate inclusive ISO start
 * @param {string} toDate inclusive ISO end
 * @param {Array<object>} events
 * @param {Array<object>} rules the full target_rules table
 * @param {{anchor_date?: string}} config
 * @returns {Array<{date: string, count: number, target: number|null, scheduled: boolean}>}
 *   `target` is null on unscheduled days (`scheduled: false`).
 */
export function counterDailySeries(habitId, fromDate, toDate, events, rules, config) {
  return dateRange(fromDate, toDate).map((date) => {
    const resolved = resolveTarget(habitId, date, rules, config);
    return {
      date,
      count: counterDayCount(habitId, date, events),
      target: resolved.scheduled ? Number(resolved.target) : null,
      scheduled: resolved.scheduled,
    };
  });
}

/**
 * Daily volume series over an inclusive date range, from each day's per-set
 * values (reps or seconds) via #002 counterDayVolume.
 *
 * @param {string} habitId
 * @param {string} fromDate inclusive ISO start
 * @param {string} toDate inclusive ISO end
 * @param {Array<object>} events
 * @returns {Array<{date: string, totalValue: number, avgValue: number, setCount: number}>}
 */
export function counterVolumeSeries(habitId, fromDate, toDate, events) {
  return dateRange(fromDate, toDate).map((date) => ({
    date,
    ...counterDayVolume(habitId, date, events),
  }));
}

/**
 * Trailing rolling average. Element i is the mean of the up-to-`windowSize`
 * values ending at i, so the window shrinks toward the start of the series.
 *
 * @param {Array<number>} values
 * @param {number} windowSize window length in samples (>= 1)
 * @returns {Array<number>} same length as `values`
 * @example
 * rollingAverage([1, 2, 3, 4], 2); // [1, 1.5, 2.5, 3.5]
 */
export function rollingAverage(values, windowSize) {
  const size = Math.max(1, Math.floor(windowSize));
  return values.map((_, i) => {
    const start = Math.max(0, i - size + 1);
    const window = values.slice(start, i + 1);
    const sum = window.reduce((acc, v) => acc + v, 0);
    return sum / window.length;
  });
}

/**
 * Weekly set totals over an inclusive date range, bucketed into Sun–Sat weeks
 * (SPEC-locked week start). Each bucket sums #002 counterDayCount across its
 * seven days.
 *
 * @param {string} habitId
 * @param {string} fromDate inclusive ISO start
 * @param {string} toDate inclusive ISO end
 * @param {Array<object>} events
 * @returns {Array<{weekStart: string, total: number}>} ordered by week
 */
export function weeklyTotals(habitId, fromDate, toDate, events) {
  const weeks = [];
  let cursor = weekStart(fromDate);
  while (cursor <= toDate) {
    let total = 0;
    for (let i = 0; i < 7; i += 1) {
      total += counterDayCount(habitId, addDays(cursor, i), events);
    }
    weeks.push({ weekStart: cursor, total });
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

/**
 * Per-week completion rate for a binary/counter habit over a date range, one
 * bucket per Sun–Sat week, each computed with #002 completionRate (so skips and
 * pending days are excluded from the denominator).
 *
 * @param {{habit_id: string, type: string}} habit
 * @param {string} fromDate inclusive ISO start
 * @param {string} toDate inclusive ISO end
 * @param {Array<object>} events
 * @param {Array<object>} rules
 * @param {{anchor_date?: string}} config
 * @param {string} today ISO date treated as "now"
 * @returns {Array<{weekStart: string, rate: number}>} ordered by week; rate in [0, 1]
 */
export function weeklyCompletionSeries(habit, fromDate, toDate, events, rules, config, today) {
  const weeks = [];
  let cursor = weekStart(fromDate);
  while (cursor <= toDate) {
    const weekEnd = addDays(cursor, 6);
    weeks.push({
      weekStart: cursor,
      rate: completionRate(habit, cursor, weekEnd, events, rules, config, today),
    });
    cursor = addDays(cursor, 7);
  }
  return weeks;
}
