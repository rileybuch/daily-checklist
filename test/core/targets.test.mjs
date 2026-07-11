// Unit tests for app/js/core/targets.js — target-rule resolution.

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveTarget } from "../../app/js/core/targets.js";
import { GTG_CONFIG, GTG_RULES, GTG_SPAN, GTG_EXPECTED } from "./fixtures.mjs";

const CONFIG = { anchor_date: "2026-07-05" };

// ---------------------------------------------------------------------------
// AC: most-specific-wins — an exact `sat` rule beats a `*` rule on a Saturday.
// ---------------------------------------------------------------------------

test("most-specific-wins: exact day beats the wildcard day on a Saturday", () => {
  const rules = [
    { rule_id: "star", habit_id: "pushups", days: "*", week_parity: "*", target: 6, effective_from: "2026-01-01", effective_to: "" },
    { rule_id: "sat", habit_id: "pushups", days: "sat", week_parity: "*", target: 3, effective_from: "2026-01-01", effective_to: "" },
  ];
  // 2026-07-11 is a Saturday.
  assert.deepEqual(resolveTarget("pushups", "2026-07-11", rules, CONFIG), { target: 3, scheduled: true });
  // On a weekday only the wildcard is in play.
  assert.deepEqual(resolveTarget("pushups", "2026-07-08", rules, CONFIG), { target: 6, scheduled: true });
});

// ---------------------------------------------------------------------------
// AC / Story: parity — alternating Saturdays resolve even→3, odd→0.
// ---------------------------------------------------------------------------

test("parity: alternating Saturdays resolve even→3 and odd→0", () => {
  const rules = [
    { rule_id: "star", habit_id: "pushups", days: "*", week_parity: "*", target: 6, effective_from: "2026-01-01", effective_to: "" },
    { rule_id: "sat-even", habit_id: "pushups", days: "sat", week_parity: "even", target: 3, effective_from: "2026-01-01", effective_to: "" },
    { rule_id: "sat-odd", habit_id: "pushups", days: "sat", week_parity: "odd", target: 0, effective_from: "2026-01-01", effective_to: "" },
  ];
  // 2026-07-11 even Saturday → 3; 2026-07-18 odd Saturday → 0 (scheduled rest).
  assert.deepEqual(resolveTarget("pushups", "2026-07-11", rules, CONFIG), { target: 3, scheduled: true });
  assert.deepEqual(resolveTarget("pushups", "2026-07-18", rules, CONFIG), { target: 0, scheduled: true });
});

test("parity + specificity: an even-Saturday rule beats the wildcard on that Saturday", () => {
  const rules = [
    { rule_id: "star", habit_id: "pushups", days: "*", week_parity: "*", target: 6, effective_from: "2026-01-01", effective_to: "" },
    { rule_id: "sat-even", habit_id: "pushups", days: "sat", week_parity: "even", target: 3, effective_from: "2026-01-01", effective_to: "" },
  ];
  assert.deepEqual(resolveTarget("pushups", "2026-07-11", rules, CONFIG), { target: 3, scheduled: true });
});

// ---------------------------------------------------------------------------
// AC / Story: newest effective_from breaks a tie between equally-specific rules.
// ---------------------------------------------------------------------------

test("newest effective_from wins the tie; earlier dates still use the old target", () => {
  const rules = [
    { rule_id: "old", habit_id: "pushups", days: "mon,tue,wed,thu,fri", week_parity: "*", target: 6, effective_from: "2026-06-01", effective_to: "" },
    { rule_id: "new", habit_id: "pushups", days: "mon,tue,wed,thu,fri", week_parity: "*", target: 8, effective_from: "2026-07-09", effective_to: "" },
  ];
  // 2026-07-08 (Wed): the new rule is not yet in scope → old target 6.
  assert.deepEqual(resolveTarget("pushups", "2026-07-08", rules, CONFIG), { target: 6, scheduled: true });
  // 2026-07-09 (Thu): both in scope, equally specific → newest effective_from → 8.
  assert.deepEqual(resolveTarget("pushups", "2026-07-09", rules, CONFIG), { target: 8, scheduled: true });
  // 2026-07-10 (Fri): still the new target.
  assert.deepEqual(resolveTarget("pushups", "2026-07-10", rules, CONFIG), { target: 8, scheduled: true });
});

// ---------------------------------------------------------------------------
// AC: effective_to bounds a rule; no matching rule → not scheduled.
// ---------------------------------------------------------------------------

test("a closed effective_to excludes dates after it", () => {
  const rules = [
    { rule_id: "bounded", habit_id: "pushups", days: "*", week_parity: "*", target: 6, effective_from: "2026-06-01", effective_to: "2026-07-08" },
  ];
  assert.deepEqual(resolveTarget("pushups", "2026-07-08", rules, CONFIG), { target: 6, scheduled: true });
  assert.deepEqual(resolveTarget("pushups", "2026-07-09", rules, CONFIG), { scheduled: false });
});

test("no matching rule returns { scheduled: false }", () => {
  const rules = [
    { rule_id: "wed-only", habit_id: "pushups", days: "wed", week_parity: "*", target: 6, effective_from: "2026-01-01", effective_to: "" },
  ];
  // 2026-07-11 is a Saturday → no rule matches.
  assert.deepEqual(resolveTarget("pushups", "2026-07-11", rules, CONFIG), { scheduled: false });
  // A different habit with no rules at all.
  assert.deepEqual(resolveTarget("pullups", "2026-07-08", rules, CONFIG), { scheduled: false });
});

test("target 0 is a scheduled rest, not an absent schedule", () => {
  const rules = [
    { rule_id: "sun", habit_id: "pushups", days: "sun", week_parity: "*", target: 0, effective_from: "2026-01-01", effective_to: "" },
  ];
  assert.deepEqual(resolveTarget("pushups", "2026-07-05", rules, CONFIG), { target: 0, scheduled: true });
});

// ---------------------------------------------------------------------------
// SPEC AC #3: the full GTG schedule, resolved across a 14-day span.
// The hand-computed target vectors live in fixtures.mjs.
// ---------------------------------------------------------------------------

test("SPEC AC #3: full 14-day GTG target vector matches for all four exercises", () => {
  for (const habitId of ["pushups", "pullups", "squats", "wall_sits"]) {
    const actual = GTG_SPAN.map((date) => {
      const r = resolveTarget(habitId, date, GTG_RULES, GTG_CONFIG);
      assert.equal(r.scheduled, true, `${habitId} ${date} should be scheduled`);
      return r.target;
    });
    assert.deepEqual(actual, GTG_EXPECTED[habitId], `14-day target vector for ${habitId}`);
  }
});
