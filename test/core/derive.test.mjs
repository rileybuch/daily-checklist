// Unit tests for app/js/core/derive.js — event derivation and day states.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  voidedEventIds,
  counterDayCount,
  counterDayVolume,
  binaryDayState,
  counterDayState,
  measureSeries,
} from "../../app/js/core/derive.js";
import { BIBLE_STUDY, BIBLE_EVENTS, BIBLE_TODAY } from "./fixtures.mjs";

const SCHEDULED = { target: 1, scheduled: true };
const UNSCHEDULED = { scheduled: false };

function setEvent(id, date, value, undo_of = "") {
  return { event_id: id, ts: `${date}T08:00:00`, date, habit_id: "pushups", kind: "set", value, undo_of };
}
function undoEvent(id, date, target) {
  return { event_id: id, ts: `${date}T08:05:00`, date, habit_id: "pushups", kind: "undo", value: "", undo_of: target };
}

// ---------------------------------------------------------------------------
// voidedEventIds — an undo voids the event it points at.
// ---------------------------------------------------------------------------

test("voidedEventIds collects the targets of every undo event", () => {
  const events = [setEvent("s1", "2026-07-08", 20), setEvent("s2", "2026-07-08", 18), undoEvent("u1", "2026-07-08", "s2")];
  const voided = voidedEventIds(events);
  assert.ok(voided.has("s2"));
  assert.ok(!voided.has("s1"));
});

test("voidedEventIds returns an empty set when there are no undos", () => {
  const events = [setEvent("s1", "2026-07-08", 20)];
  assert.equal(voidedEventIds(events).size, 0);
});

// ---------------------------------------------------------------------------
// AC / Story: counterDayCount counts non-voided sets; an undo drops the count.
// ---------------------------------------------------------------------------

test("counterDayCount counts only non-voided set events for that habit/date", () => {
  const events = [
    setEvent("s1", "2026-07-08", 20),
    setEvent("s2", "2026-07-08", 18),
    setEvent("s3", "2026-07-08", 15),
  ];
  assert.equal(counterDayCount("pushups", "2026-07-08", events), 3);

  // Undo the third set → count drops to 2.
  const withUndo = [...events, undoEvent("u1", "2026-07-08", "s3")];
  assert.equal(counterDayCount("pushups", "2026-07-08", withUndo), 2);
});

test("counterDayCount ignores other habits, other dates, and non-set kinds", () => {
  const events = [
    setEvent("s1", "2026-07-08", 20),
    { event_id: "o1", ts: "2026-07-08T08:00:00", date: "2026-07-08", habit_id: "squats", kind: "set", value: 30, undo_of: "" },
    setEvent("s2", "2026-07-09", 20),
    { event_id: "c1", ts: "2026-07-08T08:00:00", date: "2026-07-08", habit_id: "pushups", kind: "check", value: "", undo_of: "" },
  ];
  assert.equal(counterDayCount("pushups", "2026-07-08", events), 1);
});

// ---------------------------------------------------------------------------
// AC / Story: counterDayVolume — total, count, average from per-set values.
// ---------------------------------------------------------------------------

test("counterDayVolume totals per-set values and averages over the non-voided sets", () => {
  const events = [setEvent("s1", "2026-07-08", 20), setEvent("s2", "2026-07-08", 18), setEvent("s3", "2026-07-08", 16)];
  assert.deepEqual(counterDayVolume("pushups", "2026-07-08", events), {
    totalValue: 54,
    setCount: 3,
    avgValue: 18,
  });
});

test("counterDayVolume excludes an undone set from total, count, and average", () => {
  const events = [
    setEvent("s1", "2026-07-08", 20),
    setEvent("s2", "2026-07-08", 10),
    undoEvent("u1", "2026-07-08", "s2"),
  ];
  assert.deepEqual(counterDayVolume("pushups", "2026-07-08", events), {
    totalValue: 20,
    setCount: 1,
    avgValue: 20,
  });
});

test("counterDayVolume of a day with no sets is zeroed with a zero average", () => {
  assert.deepEqual(counterDayVolume("pushups", "2026-07-08", []), { totalValue: 0, setCount: 0, avgValue: 0 });
});

// ---------------------------------------------------------------------------
// AC: binaryDayState returns each state, using the last non-voided event.
// ---------------------------------------------------------------------------

const TODAY = "2026-07-08";

test("binaryDayState → green when the last event is a check", () => {
  const events = [{ event_id: "c", ts: "2026-07-06T07:00:00", date: "2026-07-06", habit_id: "h", kind: "check", value: "", undo_of: "" }];
  assert.equal(binaryDayState("h", "2026-07-06", events, SCHEDULED, TODAY), "green");
});

test("binaryDayState → skip when the last event is a skip", () => {
  const events = [{ event_id: "s", ts: "2026-07-06T07:00:00", date: "2026-07-06", habit_id: "h", kind: "skip", value: "", undo_of: "" }];
  assert.equal(binaryDayState("h", "2026-07-06", events, SCHEDULED, TODAY), "skip");
});

test("binaryDayState → red when scheduled, past, and no event", () => {
  assert.equal(binaryDayState("h", "2026-07-06", [], SCHEDULED, TODAY), "red");
});

test("binaryDayState → red when the last event is an uncheck on a past day", () => {
  const events = [
    { event_id: "c", ts: "2026-07-06T07:00:00", date: "2026-07-06", habit_id: "h", kind: "check", value: "", undo_of: "" },
    { event_id: "u", ts: "2026-07-06T09:00:00", date: "2026-07-06", habit_id: "h", kind: "uncheck", value: "", undo_of: "" },
  ];
  assert.equal(binaryDayState("h", "2026-07-06", events, SCHEDULED, TODAY), "red");
});

test("binaryDayState → pending on today with no event", () => {
  assert.equal(binaryDayState("h", TODAY, [], SCHEDULED, TODAY), "pending");
});

test("binaryDayState → unscheduled when the day is not scheduled", () => {
  assert.equal(binaryDayState("h", "2026-07-06", [], UNSCHEDULED, TODAY), "unscheduled");
});

test("binaryDayState uses the LAST non-voided event when several exist for the date", () => {
  // check then uncheck then check again → last is check → green.
  const events = [
    { event_id: "c1", ts: "2026-07-06T07:00:00", date: "2026-07-06", habit_id: "h", kind: "check", value: "", undo_of: "" },
    { event_id: "u1", ts: "2026-07-06T08:00:00", date: "2026-07-06", habit_id: "h", kind: "uncheck", value: "", undo_of: "" },
    { event_id: "c2", ts: "2026-07-06T09:00:00", date: "2026-07-06", habit_id: "h", kind: "check", value: "", undo_of: "" },
  ];
  assert.equal(binaryDayState("h", "2026-07-06", events, SCHEDULED, TODAY), "green");
});

test("binaryDayState ignores a check that has been voided by an undo", () => {
  const events = [
    { event_id: "c1", ts: "2026-07-06T07:00:00", date: "2026-07-06", habit_id: "h", kind: "check", value: "", undo_of: "" },
    { event_id: "u1", ts: "2026-07-06T08:00:00", date: "2026-07-06", habit_id: "h", kind: "undo", value: "", undo_of: "c1" },
  ];
  // The only check is voided → past scheduled day with no live event → red.
  assert.equal(binaryDayState("h", "2026-07-06", events, SCHEDULED, TODAY), "red");
});

// ---------------------------------------------------------------------------
// AC: counterDayState returns green/amber/red/pending/unscheduled.
// ---------------------------------------------------------------------------

const T6 = { target: 6, scheduled: true };
const REST = { target: 0, scheduled: true };

test("counterDayState → green when count meets or exceeds the target", () => {
  const events = [setEvent("s1", "2026-07-06", 20), setEvent("s2", "2026-07-06", 20), setEvent("s3", "2026-07-06", 20), setEvent("s4", "2026-07-06", 20), setEvent("s5", "2026-07-06", 20), setEvent("s6", "2026-07-06", 20)];
  assert.equal(counterDayState("pushups", "2026-07-06", events, T6, TODAY), "green");
});

test("counterDayState → green on a scheduled rest day (target 0)", () => {
  assert.equal(counterDayState("pushups", "2026-07-06", [], REST, TODAY), "green");
});

test("counterDayState → amber when partial (0 < count < target)", () => {
  const events = [setEvent("s1", "2026-07-06", 20), setEvent("s2", "2026-07-06", 20)];
  assert.equal(counterDayState("pushups", "2026-07-06", events, T6, TODAY), "amber");
});

test("counterDayState → red when 0 sets on a scheduled past day with target > 0", () => {
  assert.equal(counterDayState("pushups", "2026-07-06", [], T6, TODAY), "red");
});

test("counterDayState → pending when 0 sets on today", () => {
  assert.equal(counterDayState("pushups", TODAY, [], T6, TODAY), "pending");
});

test("counterDayState → unscheduled when the day is not scheduled", () => {
  assert.equal(counterDayState("pushups", "2026-07-06", [], UNSCHEDULED, TODAY), "unscheduled");
});

// ---------------------------------------------------------------------------
// SPEC AC #4 (states half): the seeded Bible Study week reads
// green,green,green,green,skip,green,red for Sun–Sat.
// ---------------------------------------------------------------------------

test("SPEC AC #4: Bible Study week day-states match hand computation", () => {
  const states = [
    "2026-06-07", "2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13",
  ].map((date) => binaryDayState(BIBLE_STUDY.habit_id, date, BIBLE_EVENTS, SCHEDULED, BIBLE_TODAY));
  assert.deepEqual(states, ["green", "green", "green", "green", "skip", "green", "red"]);
});

// ---------------------------------------------------------------------------
// AC: measureSeries returns measure values sorted by date.
// ---------------------------------------------------------------------------

test("measureSeries returns non-voided measure values sorted ascending by date", () => {
  const events = [
    { event_id: "m2", ts: "2026-07-10T07:00:00", date: "2026-07-10", habit_id: "pushup_max", kind: "measure", value: 45, undo_of: "" },
    { event_id: "m1", ts: "2026-06-01T07:00:00", date: "2026-06-01", habit_id: "pushup_max", kind: "measure", value: 40, undo_of: "" },
    { event_id: "m3", ts: "2026-08-01T07:00:00", date: "2026-08-01", habit_id: "pushup_max", kind: "measure", value: 50, undo_of: "" },
    { event_id: "other", ts: "2026-07-01T07:00:00", date: "2026-07-01", habit_id: "pullup_max", kind: "measure", value: 12, undo_of: "" },
  ];
  assert.deepEqual(measureSeries("pushup_max", events), [
    { date: "2026-06-01", value: 40 },
    { date: "2026-07-10", value: 45 },
    { date: "2026-08-01", value: 50 },
  ]);
});

test("measureSeries excludes a voided measurement", () => {
  const events = [
    { event_id: "m1", ts: "2026-06-01T07:00:00", date: "2026-06-01", habit_id: "pushup_max", kind: "measure", value: 40, undo_of: "" },
    { event_id: "m2", ts: "2026-07-10T07:00:00", date: "2026-07-10", habit_id: "pushup_max", kind: "measure", value: 999, undo_of: "" },
    { event_id: "u1", ts: "2026-07-10T07:05:00", date: "2026-07-10", habit_id: "pushup_max", kind: "undo", value: "", undo_of: "m2" },
  ];
  assert.deepEqual(measureSeries("pushup_max", events), [{ date: "2026-06-01", value: 40 }]);
});
