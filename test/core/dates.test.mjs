// Unit tests for app/js/core/dates.js — the timezone-safe date/week helpers.

import { test } from "node:test";
import assert from "node:assert/strict";

import { weekStart, weekIndex, weekParity, dayOfWeek, addDays } from "../../app/js/core/dates.js";

// ---------------------------------------------------------------------------
// dayOfWeek — component-wise parsing, no Date("YYYY-MM-DD") UTC pitfall.
// ---------------------------------------------------------------------------

test("dayOfWeek names each day of a known Sun–Sat week", () => {
  assert.equal(dayOfWeek("2026-07-05"), "sun");
  assert.equal(dayOfWeek("2026-07-06"), "mon");
  assert.equal(dayOfWeek("2026-07-07"), "tue");
  assert.equal(dayOfWeek("2026-07-08"), "wed");
  assert.equal(dayOfWeek("2026-07-09"), "thu");
  assert.equal(dayOfWeek("2026-07-10"), "fri");
  assert.equal(dayOfWeek("2026-07-11"), "sat");
});

// ---------------------------------------------------------------------------
// weekStart — the Sunday of the given date's week (weeks run Sun–Sat).
// ---------------------------------------------------------------------------

test("weekStart returns the Sunday of the week for every day of that week", () => {
  for (const iso of ["2026-07-05", "2026-07-06", "2026-07-08", "2026-07-11"]) {
    assert.equal(weekStart(iso), "2026-07-05", `weekStart(${iso})`);
  }
});

test("weekStart of a Sunday is that same Sunday", () => {
  assert.equal(weekStart("2026-07-12"), "2026-07-12");
});

test("weekStart crosses a month boundary correctly", () => {
  // 2026-08-01 is a Saturday; its week starts Sunday 2026-07-26.
  assert.equal(dayOfWeek("2026-08-01"), "sat");
  assert.equal(weekStart("2026-08-01"), "2026-07-26");
});

// ---------------------------------------------------------------------------
// weekIndex / weekParity — alternate week-to-week from the anchor.
// AC: parity alternates correctly for 6 consecutive weeks from an anchor.
// ---------------------------------------------------------------------------

const ANCHOR = "2026-07-05"; // a Sunday

test("weekIndex counts whole weeks elapsed since the anchor", () => {
  assert.equal(weekIndex("2026-07-05", ANCHOR), 0);
  assert.equal(weekIndex("2026-07-11", ANCHOR), 0); // same week as anchor
  assert.equal(weekIndex("2026-07-12", ANCHOR), 1);
  assert.equal(weekIndex("2026-07-19", ANCHOR), 2);
});

test("weekIndex is negative for dates before the anchor", () => {
  assert.equal(weekIndex("2026-06-28", ANCHOR), -1);
  assert.equal(weekIndex("2026-06-21", ANCHOR), -2);
});

test("weekParity alternates even/odd across 6 consecutive weeks from the anchor", () => {
  const expected = ["even", "odd", "even", "odd", "even", "odd"];
  for (let w = 0; w < 6; w += 1) {
    const date = addDays(ANCHOR, w * 7);
    assert.equal(weekParity(date, ANCHOR), expected[w], `week ${w} (${date})`);
  }
});

test("weekParity is stable within a single Sun–Sat week", () => {
  // Week 1 (index 0) is even for every day Sun 07-05 .. Sat 07-11.
  for (let d = 0; d < 7; d += 1) {
    assert.equal(weekParity(addDays("2026-07-05", d), ANCHOR), "even");
  }
});

test("weekParity handles dates before the anchor without sign errors", () => {
  assert.equal(weekParity("2026-06-28", ANCHOR), "odd"); // index -1
  assert.equal(weekParity("2026-06-21", ANCHOR), "even"); // index -2
});

// ---------------------------------------------------------------------------
// addDays — timezone-safe arithmetic used by the stats scanners.
// ---------------------------------------------------------------------------

test("addDays crosses month and year boundaries", () => {
  assert.equal(addDays("2026-07-31", 1), "2026-08-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
});

test("addDays over a non-leap February", () => {
  // 2026 is not a leap year: Feb has 28 days.
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
});
