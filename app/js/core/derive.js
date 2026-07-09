// Event derivation for the habit tracker domain core.
//
// The `events` tab is append-only (SPEC Section 3): state is never mutated in
// place, it is *derived* by folding the event log. These pure functions do that
// fold — counter counts/volume, binary & counter day states, and the measure
// series — all client-side, with no DOM, fetch, or Google globals.
//
// Voiding: an `undo` event (kind "undo", `undo_of` = target event_id) cancels
// the event it points at. v1 has a single undo affordance (voids the last set /
// last action); undo-of-an-undo ("redo") is out of scope, so an undo is always
// treated as effective. Binary flip-flops are expressed with explicit
// check/uncheck/skip events, not undo, and resolve via "last event wins".

/**
 * The set of event_ids cancelled by an `undo`.
 * @param {Array<object>} events
 * @returns {Set<string>}
 */
export function voidedEventIds(events) {
  const voided = new Set();
  for (const event of events) {
    if (event.kind === "undo" && event.undo_of) {
      voided.add(event.undo_of);
    }
  }
  return voided;
}

/** Non-voided `set` events for one habit on one date. */
function liveSets(habitId, date, events) {
  const voided = voidedEventIds(events);
  return events.filter(
    (event) =>
      event.habit_id === habitId &&
      event.date === date &&
      event.kind === "set" &&
      !voided.has(event.event_id),
  );
}

/**
 * Number of non-voided `set` events for a habit/date — the count judged against
 * the target IN SETS (per-set reps/seconds do not affect this).
 * @param {string} habitId @param {string} date @param {Array<object>} events
 * @returns {number}
 */
export function counterDayCount(habitId, date, events) {
  return liveSets(habitId, date, events).length;
}

/**
 * Volume summary from the day's non-voided per-set values (reps or seconds).
 * Feeds trend views, not target completion.
 * @param {string} habitId @param {string} date @param {Array<object>} events
 * @returns {{totalValue: number, setCount: number, avgValue: number}}
 *   `avgValue` is 0 when there are no sets.
 */
export function counterDayVolume(habitId, date, events) {
  const sets = liveSets(habitId, date, events);
  const setCount = sets.length;
  const totalValue = sets.reduce((sum, event) => sum + Number(event.value || 0), 0);
  const avgValue = setCount === 0 ? 0 : totalValue / setCount;
  return { totalValue, setCount, avgValue };
}

/**
 * The last non-voided event for a habit/date whose kind is in `kinds`.
 * Ordered by `ts` ascending, with original array position as a stable
 * tiebreak, so the most recent action wins.
 */
function lastEventOfKinds(habitId, date, events, kinds) {
  const voided = voidedEventIds(events);
  let best = null;
  let bestTs = null;
  let bestIndex = -1;
  events.forEach((event, index) => {
    if (
      event.habit_id !== habitId ||
      event.date !== date ||
      !kinds.includes(event.kind) ||
      voided.has(event.event_id)
    ) {
      return;
    }
    const ts = event.ts || "";
    if (best === null || ts > bestTs || (ts === bestTs && index > bestIndex)) {
      best = event;
      bestTs = ts;
      bestIndex = index;
    }
  });
  return best;
}

/**
 * Day state for a binary habit, from the LAST non-voided check/uncheck/skip
 * event for the date.
 *
 * @param {string} habitId
 * @param {string} date
 * @param {Array<object>} events
 * @param {{scheduled: boolean, target?: number}} resolved output of resolveTarget
 * @param {string} today ISO date treated as "now"
 * @returns {"green"|"red"|"skip"|"pending"|"unscheduled"}
 *   green = checked; skip = hatched (neutral for streaks); red = scheduled, past,
 *   and not checked; pending = today/future with nothing logged; unscheduled =
 *   no rule scheduled the habit that day.
 */
export function binaryDayState(habitId, date, events, resolved, today) {
  if (!resolved || !resolved.scheduled) {
    return "unscheduled";
  }
  const last = lastEventOfKinds(habitId, date, events, ["check", "uncheck", "skip"]);
  if (last) {
    if (last.kind === "check") {
      return "green";
    }
    if (last.kind === "skip") {
      return "skip";
    }
    // "uncheck" falls through: it is an explicit "not done" → treated like no check.
  }
  return date < today ? "red" : "pending";
}

/**
 * Day state for a counter habit, comparing the non-voided set count to target.
 *
 * @param {string} habitId
 * @param {string} date
 * @param {Array<object>} events
 * @param {{scheduled: boolean, target?: number}} resolved output of resolveTarget
 * @param {string} today ISO date treated as "now"
 * @returns {"green"|"amber"|"red"|"pending"|"unscheduled"}
 *   green = count ≥ target (>0) OR a target-0 scheduled rest; amber = partial
 *   (0 < count < target); red = 0 on a scheduled past day with target > 0;
 *   pending = 0 on today/future; unscheduled = not scheduled that day.
 */
export function counterDayState(habitId, date, events, resolved, today) {
  if (!resolved || !resolved.scheduled) {
    return "unscheduled";
  }
  const target = Number(resolved.target);
  if (target === 0) {
    return "green"; // scheduled rest — always satisfied
  }
  const count = counterDayCount(habitId, date, events);
  if (count >= target) {
    return "green";
  }
  if (count > 0) {
    return "amber";
  }
  return date < today ? "red" : "pending";
}

/**
 * Time series of a measurement habit's non-voided `measure` values, sorted
 * ascending by date. Drives the progression chart.
 * @param {string} habitId @param {Array<object>} events
 * @returns {Array<{date: string, value: number}>}
 */
export function measureSeries(habitId, events) {
  const voided = voidedEventIds(events);
  return events
    .filter(
      (event) =>
        event.habit_id === habitId && event.kind === "measure" && !voided.has(event.event_id),
    )
    .map((event) => ({ date: event.date, value: Number(event.value) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
