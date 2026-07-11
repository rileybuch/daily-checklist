// Target-rule resolution for the habit tracker domain core.
//
// A habit's daily target is not stored per day — it is derived from an ordered
// set of `target_rules` (SPEC Section 3). This is what replaces the printed
// calendar's day-of-week and alternating-Saturday structure without the app
// knowing what a "program" is. Riley changes a target going forward by adding a
// new rule with a later `effective_from`; full history is preserved, so past
// days are always judged against the target that applied *then*.
//
// Resolution, for a habit + date:
//   1. Keep rules for that habit that are IN SCOPE:
//        effective_from <= date <= effective_to  (blank effective_to = open).
//   2. Keep those whose `days` and `week_parity` MATCH the date
//        (a "*" wildcard matches anything).
//   3. MOST SPECIFIC wins: an exact day beats "*"; a specific parity beats "*".
//      Day specificity dominates parity specificity (an exact-day/any-parity
//      rule outranks an any-day/specific-parity rule).
//   4. Ties break on the NEWEST `effective_from`.
//   No rule survives → the habit is not scheduled that day.

import { dayOfWeek, weekParity } from "./dates.js";

/** ISO date strings compare correctly with lexical `<`/`>`, so no Date needed. */
function inScope(rule, date) {
  if (rule.effective_from && rule.effective_from > date) {
    return false;
  }
  if (rule.effective_to && date > rule.effective_to) {
    return false;
  }
  return true;
}

function dayMatches(rule, date) {
  if (!rule.days || rule.days === "*") {
    return true;
  }
  const dow = dayOfWeek(date);
  return rule.days
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .includes(dow);
}

function parityMatches(rule, date, anchorDate) {
  if (!rule.week_parity || rule.week_parity === "*") {
    return true;
  }
  return rule.week_parity === weekParity(date, anchorDate);
}

/** 1 if the rule pins an exact day, else 0. */
function daySpecificity(rule) {
  return rule.days && rule.days !== "*" ? 1 : 0;
}

/** 1 if the rule pins a specific parity, else 0. */
function paritySpecificity(rule) {
  return rule.week_parity && rule.week_parity !== "*" ? 1 : 0;
}

/**
 * Resolve the target for a habit on a date.
 *
 * @param {string} habitId
 * @param {string} date ISO "YYYY-MM-DD"
 * @param {Array<object>} rules the full `target_rules` table
 * @param {{anchor_date?: string}} config carries `anchor_date` for parity
 * @returns {{target: number, scheduled: true} | {scheduled: false}}
 *   `{ scheduled: false }` when no rule matches (habit shown gray, excluded from
 *   streaks). A matched `target` of 0 is a scheduled REST — `scheduled: true`,
 *   `target: 0` — never a failure.
 */
export function resolveTarget(habitId, date, rules, config) {
  const anchorDate = config ? config.anchor_date : undefined;

  const candidates = rules.filter(
    (rule) =>
      rule.habit_id === habitId &&
      inScope(rule, date) &&
      dayMatches(rule, date) &&
      parityMatches(rule, date, anchorDate),
  );

  if (candidates.length === 0) {
    return { scheduled: false };
  }

  candidates.sort((a, b) => {
    const dayDelta = daySpecificity(b) - daySpecificity(a);
    if (dayDelta !== 0) {
      return dayDelta;
    }
    const parityDelta = paritySpecificity(b) - paritySpecificity(a);
    if (parityDelta !== 0) {
      return parityDelta;
    }
    // Equal specificity → newest effective_from wins.
    if (a.effective_from !== b.effective_from) {
      return a.effective_from < b.effective_from ? 1 : -1;
    }
    return 0;
  });

  return { target: Number(candidates[0].target), scheduled: true };
}
