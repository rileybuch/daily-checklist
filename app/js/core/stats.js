// Streak & completion statistics for the habit tracker domain core (SPEC
// Section 5 Stats + Section 3 skip semantics).
//
// Every stat is derived by scanning days and classifying each with the same
// helper, so binary and counter habits share one definition of "done".
//
// SKIP SEMANTICS (locked by tests, do not change without updating the spec):
// a `skip` day is NEUTRAL. It neither breaks a streak nor counts as a completed
// day — the streak simply carries across it — and it is EXCLUDED from the
// completion-rate denominator. Unscheduled days are likewise ignored (not part
// of the schedule). A `pending` day (today/future with nothing logged) does not
// break a streak and does not count; it is excluded from completion too, so
// "today isn't done yet" never looks like a miss.

import { addDays } from "./dates.js";
import { resolveTarget } from "./targets.js";
import { binaryDayState, counterDayState } from "./derive.js";

/**
 * Classify one day for a habit into a stat-relevant bucket.
 * @param {{habit_id: string, type: string}} habit
 * @returns {"complete"|"incomplete"|"skip"|"pending"|"unscheduled"}
 */
function classifyDay(habit, date, events, rules, config, today) {
  const resolved = resolveTarget(habit.habit_id, date, rules, config);
  if (!resolved.scheduled) {
    return "unscheduled";
  }
  const state =
    habit.type === "counter"
      ? counterDayState(habit.habit_id, date, events, resolved, today)
      : binaryDayState(habit.habit_id, date, events, resolved, today);
  switch (state) {
    case "green":
      return "complete";
    case "amber":
    case "red":
      return "incomplete";
    case "skip":
      return "skip";
    case "pending":
      return "pending";
    default:
      return "unscheduled";
  }
}

/** Earliest event date for a habit, or null if it has no dated events. */
function earliestEventDate(habitId, events) {
  let earliest = null;
  for (const event of events) {
    if (event.habit_id !== habitId || !event.date) {
      continue;
    }
    if (earliest === null || event.date < earliest) {
      earliest = event.date;
    }
  }
  return earliest;
}

/**
 * Current streak: consecutive COMPLETED scheduled days ending at `asOfDate`,
 * scanning backward. Skips/pending/unscheduled days are neutral and stepped
 * over; the first `incomplete` (miss) day stops the count. The scan is floored
 * at the habit's earliest event (there is no history to judge before then).
 *
 * @param {{habit_id: string, type: string}} habit
 * @param {string} asOfDate ISO date to count back from
 * @param {Array<object>} events
 * @param {Array<object>} rules
 * @param {{anchor_date?: string}} config
 * @param {string} today ISO date treated as "now" (drives red-vs-pending)
 * @returns {number}
 */
export function currentStreak(habit, asOfDate, events, rules, config, today) {
  const floor = earliestEventDate(habit.habit_id, events);
  if (floor === null) {
    return 0;
  }
  let streak = 0;
  let cursor = asOfDate;
  while (cursor >= floor) {
    const bucket = classifyDay(habit, cursor, events, rules, config, today);
    if (bucket === "complete") {
      streak += 1;
    } else if (bucket === "incomplete") {
      break;
    }
    // skip / pending / unscheduled → neutral, keep scanning
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/**
 * Best streak: the longest run of consecutive completed scheduled days from the
 * habit's earliest event through `today`, with the same skip-neutral semantics.
 *
 * @param {{habit_id: string, type: string}} habit
 * @param {Array<object>} events
 * @param {Array<object>} rules
 * @param {{anchor_date?: string}} config
 * @param {string} today ISO date treated as "now"; also the scan's upper bound
 * @returns {number}
 */
export function bestStreak(habit, events, rules, config, today) {
  const start = earliestEventDate(habit.habit_id, events);
  if (start === null) {
    return 0;
  }
  let best = 0;
  let run = 0;
  let cursor = start;
  while (cursor <= today) {
    const bucket = classifyDay(habit, cursor, events, rules, config, today);
    if (bucket === "complete") {
      run += 1;
      if (run > best) {
        best = run;
      }
    } else if (bucket === "incomplete") {
      run = 0;
    }
    // skip / pending / unscheduled → neutral, run carries
    cursor = addDays(cursor, 1);
  }
  return best;
}

/**
 * Completion rate over an inclusive [fromDate, toDate] window:
 *   completed scheduled days / (scheduled days − skipped − pending).
 * Skips and not-yet-decided (pending/future) days are excluded from the
 * denominator; unscheduled days are ignored entirely.
 *
 * @param {{habit_id: string, type: string}} habit
 * @param {string} fromDate inclusive ISO start
 * @param {string} toDate inclusive ISO end
 * @param {Array<object>} events
 * @param {Array<object>} rules
 * @param {{anchor_date?: string}} config
 * @param {string} today ISO date treated as "now"
 * @returns {number} rate in [0, 1]; 0 when no day qualifies for the denominator
 */
export function completionRate(habit, fromDate, toDate, events, rules, config, today) {
  let completed = 0;
  let denominator = 0;
  let cursor = fromDate;
  while (cursor <= toDate) {
    const bucket = classifyDay(habit, cursor, events, rules, config, today);
    if (bucket === "complete") {
      completed += 1;
      denominator += 1;
    } else if (bucket === "incomplete") {
      denominator += 1;
    }
    // skip / pending / unscheduled → excluded from the denominator
    cursor = addDays(cursor, 1);
  }
  return denominator === 0 ? 0 : completed / denominator;
}
