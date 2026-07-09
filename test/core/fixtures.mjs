// Shared test fixtures for the domain-core suite (task #002).
//
// These encode SPEC's two highest-risk acceptance criteria as data:
//   - AC #3: Riley's full GTG target schedule as `target_rules`.
//   - AC #4: a hand-seeded week of Bible Study binary events.
//
// The calendar anchor and dates are chosen so the printed calendar's
// alternating-Saturday phase lines up with SPEC's worked example
// (2026-07-11 is an EVEN-parity Saturday, 2026-07-18 is ODD).

// --- AC #3: GTG schedule ----------------------------------------------------

// Week-parity anchor. 2026-07-05 is a Sunday (start of GTG "Week 1"), so
// weekIndex(2026-07-05) === 0 (even) and weekIndex(2026-07-12) === 1 (odd).
export const GTG_CONFIG = { anchor_date: "2026-07-05", week_start: "sun" };

// Pushups / Pullups / Squats: Mon–Fri 6, alt-Sat 3/0 (even/odd), Sun 0.
// Wall-sits:                  Mon–Fri 4, alt-Sat 2/0 (even/odd), Sun 0.
function gtgRules(habitId, weekday, satEven) {
  return [
    { rule_id: `${habitId}-wk`, habit_id: habitId, days: "mon,tue,wed,thu,fri", week_parity: "*", target: weekday, effective_from: "2026-01-01", effective_to: "" },
    { rule_id: `${habitId}-sat-even`, habit_id: habitId, days: "sat", week_parity: "even", target: satEven, effective_from: "2026-01-01", effective_to: "" },
    { rule_id: `${habitId}-sat-odd`, habit_id: habitId, days: "sat", week_parity: "odd", target: 0, effective_from: "2026-01-01", effective_to: "" },
    { rule_id: `${habitId}-sun`, habit_id: habitId, days: "sun", week_parity: "*", target: 0, effective_from: "2026-01-01", effective_to: "" },
  ];
}

export const GTG_RULES = [
  ...gtgRules("pushups", 6, 3),
  ...gtgRules("pullups", 6, 3),
  ...gtgRules("squats", 6, 3),
  ...gtgRules("wall_sits", 4, 2),
];

// The 14-day span this fixture is proven over: Sun 2026-07-05 .. Sat 2026-07-18.
export const GTG_SPAN = [
  "2026-07-05", "2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11",
  "2026-07-12", "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18",
];

// Hand-computed target vectors across GTG_SPAN (index-aligned).
// Sun rest, Mon–Fri work, Sat alternates (even 3/2, odd 0).
export const GTG_EXPECTED = {
  pushups: [0, 6, 6, 6, 6, 6, 3, 0, 6, 6, 6, 6, 6, 0],
  pullups: [0, 6, 6, 6, 6, 6, 3, 0, 6, 6, 6, 6, 6, 0],
  squats: [0, 6, 6, 6, 6, 6, 3, 0, 6, 6, 6, 6, 6, 0],
  wall_sits: [0, 4, 4, 4, 4, 4, 2, 0, 4, 4, 4, 4, 4, 0],
};

// --- AC #4: Bible Study week ------------------------------------------------

export const BIBLE_STUDY = { habit_id: "bible_study", type: "binary" };

// Daily binary habit (target 1 expresses "scheduled every day").
export const BIBLE_RULES = [
  { rule_id: "bs-daily", habit_id: "bible_study", days: "*", week_parity: "*", target: 1, effective_from: "2026-01-01", effective_to: "" },
];

// The seeded week runs Sun 2026-06-07 .. Sat 2026-06-13. `today` sits after it
// so the whole week is in the past and the eventless Saturday reads as a miss.
export const BIBLE_WEEK = [
  "2026-06-07", "2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13",
];
export const BIBLE_TODAY = "2026-06-20";

// Checked Sun–Wed, SKIP Thu, checked Fri, no event Sat.
export const BIBLE_EVENTS = [
  { event_id: "b1", ts: "2026-06-07T07:00:00", date: "2026-06-07", habit_id: "bible_study", kind: "check", value: "", undo_of: "" },
  { event_id: "b2", ts: "2026-06-08T07:00:00", date: "2026-06-08", habit_id: "bible_study", kind: "check", value: "", undo_of: "" },
  { event_id: "b3", ts: "2026-06-09T07:00:00", date: "2026-06-09", habit_id: "bible_study", kind: "check", value: "", undo_of: "" },
  { event_id: "b4", ts: "2026-06-10T07:00:00", date: "2026-06-10", habit_id: "bible_study", kind: "check", value: "", undo_of: "" },
  { event_id: "b5", ts: "2026-06-11T07:00:00", date: "2026-06-11", habit_id: "bible_study", kind: "skip", value: "", undo_of: "" },
  { event_id: "b6", ts: "2026-06-12T07:00:00", date: "2026-06-12", habit_id: "bible_study", kind: "check", value: "", undo_of: "" },
  // No event for 2026-06-13 (Saturday) — a scheduled, past, unchecked day → red.
];
