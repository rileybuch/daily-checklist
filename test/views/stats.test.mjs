// DOM tests for app/js/views/stats.js — the thin Stats renderer — via the
// fake-DOM shim. These verify one card per active habit, the streak/completion
// numbers rendered from the #002 core, the measurement dash, and the "No data
// yet" note. The numbers themselves are proven in statsModel.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";

import { installDom } from "../helpers/domStub.mjs";
import { renderStats } from "../../app/js/views/stats.js";
import { createTodayController } from "../../app/js/controllers/todayController.js";
import { createQueue } from "../../app/js/data/queue.js";
import { FakeStorage, seqIds } from "../helpers/fakes.mjs";

const CONFIG = { anchor_date: "2026-07-05", week_start: "sun" };
const TODAY = "2026-07-09";
const RULES = [
  { rule_id: "b", habit_id: "bible_study", days: "*", week_parity: "*", target: 1, effective_from: "2026-07-04", effective_to: "" },
  { rule_id: "m", habit_id: "pushup_max", days: "*", week_parity: "*", target: 1, effective_from: "2026-01-01", effective_to: "" },
  { rule_id: "n", habit_id: "newbie", days: "*", week_parity: "*", target: 1, effective_from: "2026-01-01", effective_to: "" },
];
const HABITS = [
  { habit_id: "bible_study", name: "Bible Study", type: "binary", unit: "", sort_order: 1, active: true },
  { habit_id: "pushup_max", name: "Pushup max", type: "measurement", unit: "reps", sort_order: 2, active: true },
  { habit_id: "newbie", name: "Newbie", type: "binary", unit: "", sort_order: 3, active: true },
];
function bin(date, kind) {
  return { event_id: `${kind}-${date}`, ts: `${date}T07:00:00`, date, habit_id: "bible_study", kind, value: "", undo_of: "" };
}
const EVENTS = [
  bin("2026-07-04", "check"), bin("2026-07-05", "skip"),
  bin("2026-07-07", "check"), bin("2026-07-08", "check"), bin("2026-07-09", "check"),
  { event_id: "m1", ts: "2026-06-01T07:00:00", date: "2026-06-01", habit_id: "pushup_max", kind: "measure", value: 40, undo_of: "" },
];

function mount() {
  const dom = installDom();
  const controller = createTodayController({
    bootstrapData: { habits: HABITS, target_rules: RULES, config: CONFIG, events: EVENTS },
    queue: createQueue({ storage: new FakeStorage() }),
    newId: seqIds("ev"),
    now: () => `${TODAY}T09:00:00`,
    todayIso: TODAY,
  });
  const view = renderStats(dom.root, controller, { todayIso: TODAY });
  return { dom, controller, view };
}

function cardFor(root, habitId) {
  return root.querySelectorAll(".stat-card").find((c) => c.dataset.habit === habitId);
}
function cellValues(card) {
  return card.querySelectorAll(".stat-value").map((v) => v.textContent);
}

test("renders one card per active habit in sort order", () => {
  const { dom } = mount();
  assert.deepEqual(dom.root.querySelectorAll(".stat-name").map((n) => n.textContent), ["Bible Study", "Pushup max", "Newbie"]);
});

test("binary card shows current streak, best streak, and 30/90-day completion", () => {
  const { dom } = mount();
  // currentStreak 3, best 3, completion 0.8 → 80% for both windows.
  assert.deepEqual(cellValues(cardFor(dom.root, "bible_study")), ["3", "3", "80%", "80%"]);
});

test("measurement card renders dashes for streaks/completion (no daily state)", () => {
  const { dom } = mount();
  assert.deepEqual(cellValues(cardFor(dom.root, "pushup_max")), ["—", "—", "—", "—"]);
});

test("a habit with no events shows a 'No data yet' note", () => {
  const { dom } = mount();
  const nb = cardFor(dom.root, "newbie");
  assert.match(nb.querySelector(".stat-nodata").textContent, /No data yet/);
  assert.deepEqual(cellValues(nb), ["0", "0", "0%", "0%"]);
});
