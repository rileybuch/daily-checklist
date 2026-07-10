// Unit tests for app/js/views/manageModel.js — the pure Manage logic (task #006,
// SPEC 5.5). Covers slug derivation, habit + rule validation edge states, and the
// weekly schedule preview built over the #002 core `resolveTarget`. The preview
// is asserted against Riley's real GTG schedule so it matches the printed
// calendar ("Mon–Fri 6, Sat 3, Sun rest" on an even week).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  deriveSlug,
  typeHasUnit,
  validateHabitInput,
  validateRuleInput,
  buildWeekPreview,
} from "../../app/js/views/manageModel.js";
import { GTG_CONFIG, GTG_RULES } from "../core/fixtures.mjs";

// --- deriveSlug -------------------------------------------------------------

test("deriveSlug lowercases and collapses non-alphanumerics to underscores", () => {
  assert.equal(deriveSlug("Bible Study"), "bible_study");
  assert.equal(deriveSlug("Wall-sits"), "wall_sits");
  assert.equal(deriveSlug("Dips"), "dips");
  assert.equal(deriveSlug("  No   Alcohol!!  "), "no_alcohol");
  assert.equal(deriveSlug("Pushup max (test)"), "pushup_max_test");
});

test("deriveSlug returns empty string for a nameless / symbol-only input", () => {
  assert.equal(deriveSlug(""), "");
  assert.equal(deriveSlug("   "), "");
  assert.equal(deriveSlug("!!!"), "");
  assert.equal(deriveSlug(null), "");
});

// --- typeHasUnit ------------------------------------------------------------

test("typeHasUnit is true for counter/measurement and false for binary", () => {
  assert.equal(typeHasUnit("counter"), true);
  assert.equal(typeHasUnit("measurement"), true);
  assert.equal(typeHasUnit("binary"), false);
});

// --- validateHabitInput (add) ----------------------------------------------

const EXISTING = [{ habit_id: "pushups" }, { habit_id: "bible_study" }];

test("validateHabitInput (add) accepts a fresh name + type and derives the slug", () => {
  const res = validateHabitInput({ name: "Dips", type: "counter" }, EXISTING);
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
  assert.equal(res.slug, "dips");
});

test("validateHabitInput (add) rejects an empty name", () => {
  const res = validateHabitInput({ name: "   ", type: "counter" }, EXISTING);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((m) => /name is required/i.test(m)));
});

test("validateHabitInput (add) rejects a name whose slug already exists", () => {
  const res = validateHabitInput({ name: "Pushups", type: "counter" }, EXISTING);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((m) => /already exists/i.test(m)));
  assert.equal(res.slug, "pushups");
});

test("validateHabitInput (add) rejects an unknown type", () => {
  const res = validateHabitInput({ name: "Dips", type: "nonsense" }, EXISTING);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((m) => /habit type/i.test(m)));
});

test("validateHabitInput (edit) skips slug/type checks and only guards the name", () => {
  // Editing an existing habit: same slug as itself must NOT trip the duplicate check.
  const ok = validateHabitInput({ name: "Pushups" }, EXISTING, { isEdit: true });
  assert.equal(ok.ok, true);
  const bad = validateHabitInput({ name: "" }, EXISTING, { isEdit: true });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((m) => /name is required/i.test(m)));
});

// --- validateRuleInput ------------------------------------------------------

test("validateRuleInput accepts a well-formed rule and normalizes the fields", () => {
  const res = validateRuleInput({
    days: ["mon", "tue", "wed", "thu", "fri"],
    week_parity: "*",
    target: "6",
    effective_from: "2026-07-05",
    effective_to: "",
  });
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.rule, {
    days: "mon,tue,wed,thu,fri",
    week_parity: "*",
    target: 6,
    effective_from: "2026-07-05",
    effective_to: "",
  });
});

test("validateRuleInput treats '*' days as the whole week", () => {
  const res = validateRuleInput({ days: "*", target: 0, effective_from: "2026-07-05" });
  assert.equal(res.ok, true);
  assert.equal(res.rule.days, "*");
  assert.equal(res.rule.target, 0);
});

test("validateRuleInput rejects an empty day selection", () => {
  const res = validateRuleInput({ days: [], target: 6, effective_from: "2026-07-05" });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((m) => /at least one day/i.test(m)));
});

test("validateRuleInput rejects a non-integer / negative target", () => {
  assert.equal(validateRuleInput({ days: "*", target: "abc", effective_from: "2026-07-05" }).ok, false);
  assert.equal(validateRuleInput({ days: "*", target: "2.5", effective_from: "2026-07-05" }).ok, false);
  assert.equal(validateRuleInput({ days: "*", target: -1, effective_from: "2026-07-05" }).ok, false);
});

test("validateRuleInput requires an effective_from date", () => {
  const res = validateRuleInput({ days: "*", target: 6, effective_from: "" });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((m) => /effective from/i.test(m)));
});

test("validateRuleInput rejects effective_to before effective_from", () => {
  const res = validateRuleInput({
    days: "*",
    target: 6,
    effective_from: "2026-07-10",
    effective_to: "2026-07-01",
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((m) => /can't be before/i.test(m)));
});

// --- buildWeekPreview -------------------------------------------------------

test("buildWeekPreview renders Riley's GTG schedule for an even week", () => {
  // Week of 2026-07-05 is even parity → Saturday target is 3 for pushups.
  const preview = buildWeekPreview("pushups", GTG_RULES, GTG_CONFIG, "2026-07-05");
  assert.equal(preview.text, "Mon–Fri 6, Sat 3, Sun rest");
});

test("buildWeekPreview flips the alternating Saturday to rest on an odd week", () => {
  // Week of 2026-07-12 is odd parity → Saturday resolves to 0 (rest), so it
  // merges with the Sunday rest into one trailing segment.
  const preview = buildWeekPreview("pushups", GTG_RULES, GTG_CONFIG, "2026-07-12");
  assert.equal(preview.text, "Mon–Fri 6, Sat–Sun rest");
});

test("buildWeekPreview normalizes any in-week date to that week's schedule", () => {
  // A mid-week Wednesday resolves to the same even-week schedule as its Sunday.
  const preview = buildWeekPreview("wall_sits", GTG_RULES, GTG_CONFIG, "2026-07-08");
  assert.equal(preview.text, "Mon–Fri 4, Sat 2, Sun rest");
});

test("buildWeekPreview marks days no rule covers as 'not scheduled'", () => {
  const rules = [
    { rule_id: "r1", habit_id: "flossing", days: "mon,wed,fri", week_parity: "*", target: 1, effective_from: "2026-01-01", effective_to: "" },
  ];
  const preview = buildWeekPreview("flossing", rules, GTG_CONFIG, "2026-07-05");
  assert.equal(
    preview.text,
    "Mon 1, Tue not scheduled, Wed 1, Thu not scheduled, Fri 1, Sat–Sun not scheduled",
  );
});
