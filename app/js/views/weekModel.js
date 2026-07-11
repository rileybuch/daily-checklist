// Pure view-model builder for the Week grid (SPEC Section 5, view 2).
//
// This holds ALL of the Week grid's decision logic with zero DOM, so it is
// unit-testable under `node --test`. The DOM layer (week.js) is a thin renderer
// that turns these descriptors into a table. Like todayModel, every day-state and
// target comes from the #002 domain core — schedule resolution, counts, and
// day-states are never reimplemented here.
//
// The grid is a Way-of-Life-style matrix: one row per active habit (ordered by
// `sort_order`), seven columns for the Sun–Sat week that contains
// `weekStartDate`. Each cell carries the CSS state the thin view colours by, the
// text it shows (counter `n/target` or "rest"), and whether it is editable
// (a past/today day Riley can tap to backfill via the Today view).

import { resolveTarget } from "../core/targets.js";
import {
  binaryDayState,
  counterDayState,
  counterDayCount,
  measureSeries,
} from "../core/derive.js";
import { weekStart, addDays, dayOfWeek } from "../core/dates.js";

const DOW_LABELS = { sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Archived habits keep their history but leave the grid. Mirrors todayModel. */
function isActive(habit) {
  if (habit.active === undefined || habit.active === null || habit.active === "") {
    return true;
  }
  return habit.active === true || String(habit.active).toLowerCase() === "true";
}

/** Split an ISO date into its integer [year, month, day]. */
function ymd(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

/**
 * Human label for a Sun–Sat range, e.g. "Jul 5 – 11", "Jun 28 – Jul 4",
 * "Dec 27 – Jan 2". The end month is shown only when it differs from the start.
 * @param {string} startIso @param {string} endIso
 * @returns {string}
 */
function rangeLabel(startIso, endIso) {
  const s = ymd(startIso);
  const e = ymd(endIso);
  const left = `${MONTHS[s.m - 1]} ${s.d}`;
  const right = e.m === s.m ? `${e.d}` : `${MONTHS[e.m - 1]} ${e.d}`;
  return `${left} – ${right}`;
}

/**
 * Presentation state + text for one counter cell.
 * Rest (scheduled target 0) is surfaced as its own `state` ("rest") so the view
 * colours it neutral — it is never red. Future cells show no count (light-gray).
 */
function counterCell(habitId, date, events, resolved, today, isFuture) {
  if (!resolved.scheduled) {
    return { state: "unscheduled", display: "" };
  }
  const target = Number(resolved.target);
  if (target === 0) {
    return { state: "rest", display: "rest" };
  }
  const state = counterDayState(habitId, date, events, resolved, today);
  if (isFuture) {
    return { state, display: "" };
  }
  const count = counterDayCount(habitId, date, events);
  return { state, display: `${count}/${target}` };
}

/**
 * Build the Week grid view-model for the week containing `weekStartDate`.
 *
 * @param {{habits: Array, rules: Array, config: object, events: Array,
 *          weekStartDate: string, today: string}} params
 * @returns {{weekStart: string, weekEnd: string, label: string,
 *            days: Array<{date: string, label: string, dayNum: number,
 *                         isToday: boolean, isFuture: boolean}>,
 *            rows: Array<{habitId: string, name: string, type: string,
 *                         sortOrder: number, cells: Array<object>}>}}
 */
export function buildWeekGrid({ habits, rules, config, events, weekStartDate, today }) {
  const start = weekStart(weekStartDate);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const end = dates[6];

  const days = dates.map((date) => ({
    date,
    label: DOW_LABELS[dayOfWeek(date)],
    dayNum: ymd(date).d,
    isToday: date === today,
    isFuture: date > today,
  }));

  const rows = habits
    .filter(isActive)
    .map((habit) => {
      const measureDates =
        habit.type === "measurement"
          ? new Set(measureSeries(habit.habit_id, events).map((p) => p.date))
          : null;

      const cells = dates.map((date) => {
        const isFuture = date > today;
        const editable = date <= today;
        const base = { date, isFuture, editable };

        if (habit.type === "measurement") {
          return { ...base, state: "measurement", display: "", hasMeasure: measureDates.has(date) };
        }

        const resolved = resolveTarget(habit.habit_id, date, rules, config);

        if (habit.type === "counter") {
          return { ...base, ...counterCell(habit.habit_id, date, events, resolved, today, isFuture) };
        }

        // binary
        return { ...base, state: binaryDayState(habit.habit_id, date, events, resolved, today), display: "" };
      });

      return {
        habitId: habit.habit_id,
        name: habit.name,
        type: habit.type,
        sortOrder: Number(habit.sort_order || 0),
        cells,
      };
    });

  rows.sort((a, b) => a.sortOrder - b.sortOrder);

  return { weekStart: start, weekEnd: end, label: rangeLabel(start, end), days, rows };
}
