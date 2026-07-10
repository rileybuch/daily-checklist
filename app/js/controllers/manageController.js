// Manage controller — the DOM-agnostic orchestration for the Manage screens
// (SPEC Section 5, view 5).
//
// Holds the in-memory habits + target_rules (the SAME array references the Today
// controller reads, so archiving a habit here immediately drops it from Today /
// the Week grid) and exposes the write interactions the Manage view needs: add a
// habit, edit a habit, archive/reactivate a habit, and add a target rule.
//
// Persistence goes through the #001 endpoints via the #003 api client
// (`postHabit` / `postRule`) — habits and rules are config, not append-only
// events, so they are written directly rather than through the offline event
// queue. Local state is updated only AFTER the POST resolves, so a failed write
// surfaces its error and leaves the UI consistent with the backend.
//
// All validation and slug derivation live in the pure manageModel; this file is
// state + I/O glue and is proven by manageController.test.mjs.

import { validateHabitInput, validateRuleInput, deriveSlug, buildWeekPreview } from "../views/manageModel.js";
import { addDays } from "../core/dates.js";

/**
 * @param {object} deps
 * @param {{habits: Array, target_rules: Array, config: object}} deps.bootstrapData
 * @param {{postHabit: Function, postRule: Function}} deps.apiClient
 * @param {() => string} deps.newId client id generator (for rule_id)
 * @param {string} deps.todayIso ISO date treated as "today" (created_at, tomorrow default)
 */
export function createManageController({ bootstrapData, apiClient, newId, todayIso }) {
  const habits = bootstrapData.habits || [];
  const rules = bootstrapData.target_rules || [];
  const config = bootstrapData.config || {};

  function sortedHabits() {
    return [...habits].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  }

  return {
    /** All habits (active AND archived), ordered by sort_order. */
    getHabits: () => sortedHabits(),
    getConfig: () => config,
    /** The target rules for one habit, in insertion order (history preserved). */
    getRulesFor: (habitId) => rules.filter((rule) => rule.habit_id === habitId),
    /** Tomorrow's ISO date — the default `effective_from` for a forward-dated target change. */
    tomorrow: () => addDays(todayIso, 1),

    /**
     * Preview a habit's resolved weekly schedule (optionally including a draft
     * rule not yet saved), via the #002 core. `weekStartDate` defaults to today.
     * @param {string} habitId
     * @param {{days: string, week_parity: string, target: number,
     *          effective_from: string, effective_to: string}} [draftRule]
     * @param {string} [weekStartDate]
     */
    preview(habitId, draftRule, weekStartDate) {
      const withDraft = draftRule
        ? [...rules, { rule_id: "__draft__", habit_id: habitId, ...draftRule }]
        : rules;
      return buildWeekPreview(habitId, withDraft, config, weekStartDate || todayIso);
    },

    /**
     * Create a habit: derive + uniqueness-check the slug, POST it, then add it to
     * local state. `habit_id` and `type` are fixed at creation (immutable after).
     * @returns {Promise<{ok: boolean, errors?: string[], habit?: object}>}
     */
    async addHabit(input) {
      const check = validateHabitInput(input, habits);
      if (!check.ok) {
        return { ok: false, errors: check.errors };
      }
      const type = input.type;
      const habit = {
        habit_id: check.slug,
        name: String(input.name).trim(),
        type,
        unit: type === "binary" ? "" : String(input.unit == null ? "" : input.unit).trim(),
        sort_order: Number(input.sort_order || 0),
        active: true,
        created_at: todayIso,
      };
      await apiClient.postHabit(habit);
      habits.push(habit);
      return { ok: true, habit };
    },

    /**
     * Edit a habit's mutable fields (name / unit / sort_order / active). `habit_id`
     * and `type` are immutable and never touched. POSTs the full updated row.
     * @returns {Promise<{ok: boolean, errors?: string[], habit?: object}>}
     */
    async editHabit(habitId, patch) {
      const habit = habits.find((h) => h.habit_id === habitId);
      if (!habit) {
        return { ok: false, errors: [`No habit with id "${habitId}".`] };
      }
      const merged = {
        name: patch.name === undefined ? habit.name : patch.name,
      };
      const check = validateHabitInput(merged, habits, { isEdit: true });
      if (!check.ok) {
        return { ok: false, errors: check.errors };
      }
      const updated = { ...habit };
      if (patch.name !== undefined) {
        updated.name = String(patch.name).trim();
      }
      if (patch.unit !== undefined) {
        updated.unit = habit.type === "binary" ? "" : String(patch.unit).trim();
      }
      if (patch.sort_order !== undefined) {
        updated.sort_order = Number(patch.sort_order || 0);
      }
      if (patch.active !== undefined) {
        updated.active = Boolean(patch.active);
      }
      await apiClient.postHabit(updated);
      Object.assign(habit, updated);
      return { ok: true, habit };
    },

    /**
     * Archive (active=false) or reactivate (active=true) a habit. Archiving leaves
     * the checklist/Week grid but retains all history (events are untouched).
     */
    setActive(habitId, active) {
      return this.editHabit(habitId, { active });
    },

    /**
     * Append a NEW target rule (never mutates an existing one, so target history
     * is preserved — SPEC Section 3). POSTs it, then adds it to local state.
     * @returns {Promise<{ok: boolean, errors?: string[], rule?: object}>}
     */
    async addRule(habitId, input) {
      const check = validateRuleInput(input);
      if (!check.ok) {
        return { ok: false, errors: check.errors };
      }
      const rule = { rule_id: newId(), habit_id: habitId, ...check.rule };
      await apiClient.postRule(rule);
      rules.push(rule);
      return { ok: true, rule };
    },
  };
}

// Re-export so the view can render a live slug preview without reaching past the
// controller into the model.
export { deriveSlug };
