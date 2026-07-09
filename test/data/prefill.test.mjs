// Unit tests for app/js/data/prefill.js — the per-set value pre-fill rule.
// AC: tapping + pre-fills the value from the previous set of THAT habit (first
// set of the day → last-used value for the habit; none ever → sensible default).

import { test } from "node:test";
import assert from "node:assert/strict";

import { nextSetValue } from "../../app/js/data/prefill.js";

function setEvent(id, habitId, ts, value, undo_of = "") {
  return { event_id: id, ts, date: ts.slice(0, 10), habit_id: habitId, kind: "set", value, undo_of };
}

test("nextSetValue returns the fallback when the habit has never been logged", () => {
  assert.equal(nextSetValue("pushups", [], 1), 1);
  assert.equal(nextSetValue("wall_sits", [], 30), 30);
});

test("nextSetValue returns the value of the habit's most recent set (by ts)", () => {
  const events = [
    setEvent("s1", "pushups", "2026-07-06T08:00:00", 12),
    setEvent("s2", "pushups", "2026-07-08T08:00:00", 15),
    setEvent("s3", "pushups", "2026-07-07T08:00:00", 13),
  ];
  assert.equal(nextSetValue("pushups", events, 1), 15);
});

test("nextSetValue is per-habit: wall_sits pre-fills seconds, pushups pre-fills reps", () => {
  const events = [
    setEvent("p1", "pushups", "2026-07-08T08:00:00", 14),
    setEvent("w1", "wall_sits", "2026-07-08T08:05:00", 45),
  ];
  assert.equal(nextSetValue("pushups", events, 1), 14);
  assert.equal(nextSetValue("wall_sits", events, 1), 45);
});

test("nextSetValue ignores a voided set and falls back to the prior live set", () => {
  const events = [
    setEvent("s1", "pushups", "2026-07-08T08:00:00", 12),
    setEvent("s2", "pushups", "2026-07-08T08:05:00", 20),
    { event_id: "u1", ts: "2026-07-08T08:06:00", date: "2026-07-08", habit_id: "pushups", kind: "undo", value: "", undo_of: "s2" },
  ];
  assert.equal(nextSetValue("pushups", events, 1), 12);
});
