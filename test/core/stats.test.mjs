// Unit tests for app/js/core/stats.js — streaks and completion rate.
//
// The headline case is SPEC AC #4: a hand-computed streak fixture. The seeded
// Bible Study week is checked Sun–Wed, SKIP Thu, checked Fri, and eventless Sat.
// Skip semantics (locked here and documented in stats.js): a skip neither
// breaks a streak nor counts toward it — the streak carries across the skip.

import { test } from "node:test";
import assert from "node:assert/strict";

import { currentStreak, bestStreak, completionRate } from "../../app/js/core/stats.js";
import {
  BIBLE_STUDY,
  BIBLE_RULES,
  BIBLE_TODAY,
} from "./fixtures.mjs";
import { BIBLE_EVENTS } from "./fixtures.mjs";

const CONFIG = { anchor_date: "2026-01-04" }; // any Sunday; parity irrelevant for a daily habit

// ---------------------------------------------------------------------------
// SPEC AC #4: streak math matches hand computation.
//
// Hand computation over Sun 06-07 .. Sat 06-13 (all in the past, today 06-20):
//   06-07 check → complete   (run 1)
//   06-08 check → complete   (run 2)
//   06-09 check → complete   (run 3)
//   06-10 check → complete   (run 4)
//   06-11 SKIP  → neutral     (run carries at 4)
//   06-12 check → complete   (run 5)   ← best run bridges the skip = 5
//   06-13 (none, past) → red → break
// ---------------------------------------------------------------------------

test("SPEC AC #4: currentStreak as of Fri 06-12 is 5 (skip bridged, not counted)", () => {
  assert.equal(
    currentStreak(BIBLE_STUDY, "2026-06-12", BIBLE_EVENTS, BIBLE_RULES, CONFIG, BIBLE_TODAY),
    5,
  );
});

test("SPEC AC #4: currentStreak as of the eventless past Sat 06-13 is 0 (red breaks)", () => {
  assert.equal(
    currentStreak(BIBLE_STUDY, "2026-06-13", BIBLE_EVENTS, BIBLE_RULES, CONFIG, BIBLE_TODAY),
    0,
  );
});

test("a pending (today, not-yet-done) day does not break the current streak", () => {
  // With today === asOf === Sat 06-13, Saturday is pending (not red) and is
  // skipped over; the streak is the same 5 as of Friday.
  assert.equal(
    currentStreak(BIBLE_STUDY, "2026-06-13", BIBLE_EVENTS, BIBLE_RULES, CONFIG, "2026-06-13"),
    5,
  );
});

test("SPEC AC #4: bestStreak over the seeded window is 5 (bridges the Thu skip)", () => {
  assert.equal(
    bestStreak(BIBLE_STUDY, BIBLE_EVENTS, BIBLE_RULES, CONFIG, BIBLE_TODAY),
    5,
  );
});

// ---------------------------------------------------------------------------
// A red day inside the window resets the best run.
// ---------------------------------------------------------------------------

test("bestStreak resets on a genuine miss, then the later run is measured", () => {
  // check, check, (miss), check, check, check → best run is the final 3.
  const events = [
    { event_id: "x1", ts: "2026-06-07T07:00:00", date: "2026-06-07", habit_id: "bible_study", kind: "check", value: "", undo_of: "" },
    { event_id: "x2", ts: "2026-06-08T07:00:00", date: "2026-06-08", habit_id: "bible_study", kind: "check", value: "", undo_of: "" },
    // 06-09 missed (no event, past)
    { event_id: "x4", ts: "2026-06-10T07:00:00", date: "2026-06-10", habit_id: "bible_study", kind: "check", value: "", undo_of: "" },
    { event_id: "x5", ts: "2026-06-11T07:00:00", date: "2026-06-11", habit_id: "bible_study", kind: "check", value: "", undo_of: "" },
    { event_id: "x6", ts: "2026-06-12T07:00:00", date: "2026-06-12", habit_id: "bible_study", kind: "check", value: "", undo_of: "" },
  ];
  assert.equal(bestStreak(BIBLE_STUDY, events, BIBLE_RULES, CONFIG, "2026-06-12"), 3);
});

test("streak functions return 0 for a habit with no events", () => {
  assert.equal(currentStreak(BIBLE_STUDY, "2026-06-13", [], BIBLE_RULES, CONFIG, BIBLE_TODAY), 0);
  assert.equal(bestStreak(BIBLE_STUDY, [], BIBLE_RULES, CONFIG, BIBLE_TODAY), 0);
});

// ---------------------------------------------------------------------------
// AC: completionRate excludes skip days from the denominator.
//
// Over Sun 06-07 .. Sat 06-13: 5 completed, 1 skip (excluded), 1 red.
// denominator = 7 scheduled − 1 skip = 6; rate = 5/6.
// ---------------------------------------------------------------------------

test("completionRate excludes skip days from the denominator (5/6, not 5/7)", () => {
  const rate = completionRate(
    BIBLE_STUDY,
    "2026-06-07",
    "2026-06-13",
    BIBLE_EVENTS,
    BIBLE_RULES,
    CONFIG,
    BIBLE_TODAY,
  );
  assert.equal(rate, 5 / 6);
});

test("completionRate is 1 for a fully-completed skip-free window", () => {
  const events = ["2026-06-07", "2026-06-08", "2026-06-09"].map((date, i) => ({
    event_id: `f${i}`,
    ts: `${date}T07:00:00`,
    date,
    habit_id: "bible_study",
    kind: "check",
    value: "",
    undo_of: "",
  }));
  assert.equal(
    completionRate(BIBLE_STUDY, "2026-06-07", "2026-06-09", events, BIBLE_RULES, CONFIG, BIBLE_TODAY),
    1,
  );
});

test("completionRate is 0 for a window of all-missed scheduled days", () => {
  // No events → every scheduled past day is a miss → 0 completed / 7 = 0.
  assert.equal(
    completionRate(BIBLE_STUDY, "2026-06-07", "2026-06-13", [], BIBLE_RULES, CONFIG, BIBLE_TODAY),
    0,
  );
});
