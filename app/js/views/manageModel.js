// Pure logic for the Manage screens (SPEC Section 5, view 5).
//
// This module holds ALL of Manage's decision logic with zero DOM and zero
// network, so it is unit-testable under `node --test`. The controller
// (manageController.js) wraps this with mutable state + the api client; the DOM
// layer (manage.js) is a thin renderer over these descriptors.
//
// Three responsibilities live here:
//   1. Slug derivation from a habit name (immutable once created — SPEC Section 3).
//   2. Validation of habit and target-rule form input (the edge states in the
//      task spec: empty name, duplicate slug, effective_to < effective_from).
//   3. The weekly schedule PREVIEW — built by calling the #002 domain core
//      `resolveTarget` across the seven days of the current week, so the preview
//      is the exact same resolution the Week grid renders (no divergence).

import { resolveTarget } from "../core/targets.js";
import { weekStart, addDays } from "../core/dates.js";

const HABIT_TYPES = ["binary", "counter", "measurement"];
const PARITIES = ["even", "odd", "*"];
const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS = { sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };
// Preview reads Monday-first so a standard work-week reads as one run
// ("Mon–Fri 6, Sat 3, Sun rest" — SPEC Section 5 view 5).
const PREVIEW_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const OFFSET_FROM_SUNDAY = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/**
 * Derive an immutable slug (`habit_id`) from a display name: lowercase, runs of
 * non-alphanumeric characters collapse to a single underscore, no leading or
 * trailing underscore.
 *
 * @param {string} name
 * @returns {string}
 * @example
 * deriveSlug("Bible Study")
 * // => "bible_study"
 * @example
 * deriveSlug("Wall-sits")
 * // => "wall_sits"
 */
export function deriveSlug(name) {
  return String(name == null ? "" : name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Whether a type carries a per-value unit (counter/measurement) vs. blank (binary). */
export function typeHasUnit(type) {
  return type === "counter" || type === "measurement";
}

/**
 * Validate habit form input.
 *
 * On ADD (`isEdit` falsy) the slug is derived and checked for uniqueness against
 * `existingHabits`. On EDIT the slug and type are immutable, so only the mutable
 * fields (name) are validated here.
 *
 * @param {{name?: string, type?: string}} input
 * @param {Array<{habit_id: string}>} existingHabits
 * @param {{isEdit?: boolean}} [opts]
 * @returns {{ok: boolean, errors: string[], slug: string}}
 */
export function validateHabitInput(input, existingHabits = [], opts = {}) {
  const errors = [];
  const isEdit = Boolean(opts.isEdit);
  const name = String(input.name == null ? "" : input.name).trim();

  if (!name) {
    errors.push("Name is required.");
  }

  let slug = "";
  if (!isEdit) {
    if (!HABIT_TYPES.includes(input.type)) {
      errors.push("Pick a habit type.");
    }
    slug = deriveSlug(name);
    if (name && !slug) {
      errors.push("Could not derive a slug from that name — use some letters or numbers.");
    }
    if (slug && existingHabits.some((habit) => habit.habit_id === slug)) {
      errors.push(`A habit with the slug "${slug}" already exists.`);
    }
  }

  return { ok: errors.length === 0, errors, slug };
}

/** Coerce a `days` value (array, comma string, or "*") into a normalized comma string or "*". */
function normalizeDays(days) {
  if (days === "*" || days == null) {
    return { value: "*", count: 7 };
  }
  const list = Array.isArray(days)
    ? days
    : String(days)
        .split(",")
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean);
  const valid = list.filter((day) => DAY_NAMES.includes(day));
  return { value: valid.join(","), count: valid.length };
}

/**
 * Validate a target-rule form input and return the normalized rule fields.
 *
 * @param {{days?: string|string[], week_parity?: string, target?: number|string,
 *          effective_from?: string, effective_to?: string}} input
 * @returns {{ok: boolean, errors: string[],
 *            rule: {days: string, week_parity: string, target: number,
 *                   effective_from: string, effective_to: string}}}
 */
export function validateRuleInput(input) {
  const errors = [];

  const days = normalizeDays(input.days);
  if (days.count === 0) {
    errors.push("Pick at least one day.");
  }

  const parity = input.week_parity == null || input.week_parity === "" ? "*" : input.week_parity;
  if (!PARITIES.includes(parity)) {
    errors.push("Week parity must be even, odd, or any.");
  }

  const rawTarget = input.target;
  const target = Number(rawTarget);
  if (rawTarget === "" || rawTarget == null || !Number.isInteger(target) || target < 0) {
    errors.push("Target must be a whole number of sets (0 = rest).");
  }

  const from = String(input.effective_from == null ? "" : input.effective_from).trim();
  if (!from) {
    errors.push("An \"effective from\" date is required.");
  }

  const to = String(input.effective_to == null ? "" : input.effective_to).trim();
  if (from && to && to < from) {
    errors.push("The \"effective to\" date can't be before the \"effective from\" date.");
  }

  return {
    ok: errors.length === 0,
    errors,
    rule: {
      days: days.value,
      week_parity: parity,
      target: Number.isFinite(target) ? target : 0,
      effective_from: from,
      effective_to: to,
    },
  };
}

/** Format a resolved target as preview text: rest / not scheduled / the set count. */
function previewValue(resolved) {
  if (!resolved.scheduled) {
    return "not scheduled";
  }
  return Number(resolved.target) === 0 ? "rest" : String(Number(resolved.target));
}

/**
 * Build a plain-language weekly schedule preview for a habit, e.g.
 * "Mon–Fri 6, Sat 3, Sun rest". Each day's value comes from the #002 core
 * `resolveTarget` over the seven days of the week containing `weekStartDate`;
 * consecutive days that resolve to the same value collapse into one segment.
 *
 * @param {string} habitId
 * @param {Array<object>} rules the target_rules to resolve against
 * @param {{anchor_date?: string}} config
 * @param {string} weekStartDate any date in the target week (normalized to its Sunday)
 * @returns {{text: string, segments: Array<{label: string, value: string}>}}
 */
export function buildWeekPreview(habitId, rules, config, weekStartDate) {
  const sunday = weekStart(weekStartDate);
  const days = PREVIEW_ORDER.map((day) => {
    const date = addDays(sunday, OFFSET_FROM_SUNDAY[day]);
    return { day, value: previewValue(resolveTarget(habitId, date, rules, config)) };
  });

  const segments = [];
  for (const { day, value } of days) {
    const last = segments[segments.length - 1];
    if (last && last.value === value) {
      last.end = day;
    } else {
      segments.push({ start: day, end: day, value });
    }
  }

  const rendered = segments.map((seg) => {
    const label = seg.start === seg.end ? DAY_LABELS[seg.start] : `${DAY_LABELS[seg.start]}–${DAY_LABELS[seg.end]}`;
    return { label, value: seg.value };
  });

  return {
    text: rendered.map((seg) => `${seg.label} ${seg.value}`).join(", "),
    segments: rendered,
  };
}
