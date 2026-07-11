// Pure view-model builder for the Stats view (SPEC Section 5, view 4; task
// #005).
//
// One compact summary row per active habit: current streak, best streak, and
// completion % over the last 30 and 90 days. Every number comes straight from the
// #002 core (currentStreak / bestStreak / completionRate), which already encodes
// the skip-excluded-from-denominator semantics — this builder only plumbs the
// calls and fixes the window bounds. Zero DOM, so it is unit-testable.
//
// Measurement habits have no daily pass/fail state (SPEC Section 3), so streaks
// and completion do not apply to them; their rows are marked `applicable: false`
// and the numeric fields are null (the view renders a dash).

import { addDays } from "../core/dates.js";
import { currentStreak, bestStreak, completionRate } from "../core/stats.js";

/** Archived habits keep their history but leave the Stats list. */
function isActive(habit) {
  if (habit.active === undefined || habit.active === null || habit.active === "") {
    return true;
  }
  return habit.active === true || String(habit.active).toLowerCase() === "true";
}

/** Whether the habit has any dated, non-undo event to summarise. */
function hasAnyEvent(habitId, events) {
  return events.some((event) => event.habit_id === habitId && event.kind !== "undo" && event.date);
}

/** Inclusive completion window ending `today`, spanning `days` calendar days. */
function completionOver(habit, days, events, rules, config, today) {
  return completionRate(habit, addDays(today, -(days - 1)), today, events, rules, config, today);
}

/**
 * Build the Stats rows for all active habits.
 *
 * @param {{habits: Array, rules: Array, config: object, events: Array,
 *          today: string}} params
 * @returns {Array<{habitId: string, name: string, type: string, applicable: boolean,
 *            hasData: boolean, currentStreak: number|null, bestStreak: number|null,
 *            completion30: number|null, completion90: number|null}>}
 *   ordered by `sort_order`. For measurement habits the streak/completion fields
 *   are null (`applicable: false`).
 */
export function buildStats({ habits, rules, config, events, today }) {
  return habits
    .filter(isActive)
    .slice()
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((habit) => {
      const base = {
        habitId: habit.habit_id,
        name: habit.name,
        type: habit.type,
        hasData: hasAnyEvent(habit.habit_id, events),
      };
      if (habit.type === "measurement") {
        return { ...base, applicable: false, currentStreak: null, bestStreak: null, completion30: null, completion90: null };
      }
      const core = { habit_id: habit.habit_id, type: habit.type };
      return {
        ...base,
        applicable: true,
        currentStreak: currentStreak(core, today, events, rules, config, today),
        bestStreak: bestStreak(core, events, rules, config, today),
        completion30: completionOver(core, 30, events, rules, config, today),
        completion90: completionOver(core, 90, events, rules, config, today),
      };
    });
}
