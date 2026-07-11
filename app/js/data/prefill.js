// Per-set value pre-fill rule for counter habits (SPEC Section 5, view 1).
//
// One tap logs a set immediately; its `value` is pre-filled from the PREVIOUS
// set of that habit so Riley rarely has to touch the stepper. "Previous set"
// means the habit's most recent non-voided `set` event across all dates (so the
// first set of a new day inherits the last-used value); if the habit has never
// been logged, a caller-supplied sensible default is used.
//
// Voiding is honoured via the core derivation (an undone set doesn't count),
// so this stays consistent with what the Today view actually shows.

import { voidedEventIds } from "../core/derive.js";

/**
 * The value to pre-fill for the next set of a habit.
 *
 * @param {string} habitId
 * @param {Array<object>} events the full known event list
 * @param {number} fallback value to use when the habit has no prior live set
 * @returns {number}
 */
export function nextSetValue(habitId, events, fallback) {
  const voided = voidedEventIds(events);
  let best = null;
  let bestTs = null;
  let bestIndex = -1;
  events.forEach((event, index) => {
    if (
      event.habit_id !== habitId ||
      event.kind !== "set" ||
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
  return best ? Number(best.value) : fallback;
}
