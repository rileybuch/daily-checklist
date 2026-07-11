// DOM tests for app/js/views/trends.js — the thin Trends renderer — via the
// dependency-free fake-DOM shim. These verify the habit picker, the per-type
// chart set, the injected inline SVG (including SPEC AC #5: four measurement
// points), and the "No data yet" empty state. Chart maths is proven in
// charts.test.mjs and selection in trendsModel.test.mjs; here we prove the view
// faithfully wires them.

import { test } from "node:test";
import assert from "node:assert/strict";

import { installDom } from "../helpers/domStub.mjs";
import { renderTrends } from "../../app/js/views/trends.js";
import { createTodayController } from "../../app/js/controllers/todayController.js";
import { createQueue } from "../../app/js/data/queue.js";
import { FakeStorage, seqIds } from "../helpers/fakes.mjs";

const CONFIG = { anchor_date: "2026-07-05", week_start: "sun" };
const RULES = [
  { rule_id: "p", habit_id: "pushups", days: "*", week_parity: "*", target: 6, effective_from: "2026-01-01", effective_to: "" },
  { rule_id: "b", habit_id: "bible_study", days: "*", week_parity: "*", target: 1, effective_from: "2026-01-01", effective_to: "" },
  { rule_id: "m", habit_id: "pushup_max", days: "*", week_parity: "*", target: 1, effective_from: "2026-01-01", effective_to: "" },
  { rule_id: "n", habit_id: "newbie", days: "*", week_parity: "*", target: 5, effective_from: "2026-01-01", effective_to: "" },
];
const HABITS = [
  { habit_id: "pushups", name: "Pushups", type: "counter", unit: "reps", sort_order: 1, active: true },
  { habit_id: "bible_study", name: "Bible Study", type: "binary", unit: "", sort_order: 2, active: true },
  { habit_id: "pushup_max", name: "Pushup max", type: "measurement", unit: "reps", sort_order: 3, active: true },
  { habit_id: "newbie", name: "Newbie", type: "counter", unit: "reps", sort_order: 4, active: true },
];

function set(habitId, date, ts, value) {
  return { event_id: `s-${habitId}-${date}-${ts}`, ts: `${date}T${ts}`, date, habit_id: habitId, kind: "set", value, undo_of: "" };
}
const EVENTS = [
  set("pushups", "2026-07-06", "08:00:00", 10), set("pushups", "2026-07-06", "08:05:00", 10),
  set("pushups", "2026-07-07", "08:00:00", 12),
  { event_id: "b1", ts: "2026-07-06T07:00:00", date: "2026-07-06", habit_id: "bible_study", kind: "check", value: "", undo_of: "" },
  { event_id: "b2", ts: "2026-07-07T07:00:00", date: "2026-07-07", habit_id: "bible_study", kind: "skip", value: "", undo_of: "" },
  { event_id: "m1", ts: "2026-06-01T07:00:00", date: "2026-06-01", habit_id: "pushup_max", kind: "measure", value: 40, undo_of: "" },
  { event_id: "m2", ts: "2026-06-10T07:00:00", date: "2026-06-10", habit_id: "pushup_max", kind: "measure", value: 42, undo_of: "" },
  { event_id: "m3", ts: "2026-06-20T07:00:00", date: "2026-06-20", habit_id: "pushup_max", kind: "measure", value: 45, undo_of: "" },
  { event_id: "m4", ts: "2026-07-01T07:00:00", date: "2026-07-01", habit_id: "pushup_max", kind: "measure", value: 48, undo_of: "" },
];
const TODAY = "2026-07-09";

function mount() {
  const dom = installDom();
  const controller = createTodayController({
    bootstrapData: { habits: HABITS, target_rules: RULES, config: CONFIG, events: EVENTS },
    queue: createQueue({ storage: new FakeStorage() }),
    newId: seqIds("ev"),
    now: () => `${TODAY}T09:00:00`,
    todayIso: TODAY,
  });
  const view = renderTrends(dom.root, controller, { todayIso: TODAY });
  return { dom, controller, view };
}

function pickerButton(root, habitId) {
  return [...root.querySelectorAll(".pick")].find((b) => b.dataset.habit === habitId);
}
function canvasHtml(root) {
  return [...root.querySelectorAll(".chart-canvas")].map((c) => c.innerHTML);
}
// The fake-DOM shim has no descendant combinator, so locate a card by kind then
// read its canvas directly.
function cardCanvas(root, kind) {
  const card = [...root.querySelectorAll(".chart-card")].find((c) => c.className.includes(`kind-${kind}`));
  return card ? card.querySelector(".chart-canvas") : null;
}
function countIn(str, needle) {
  return str.split(needle).length - 1;
}

test("renders one picker button per active habit, first selected by default", () => {
  const { dom } = mount();
  const picks = [...dom.root.querySelectorAll(".pick")];
  assert.deepEqual(picks.map((b) => b.textContent), ["Pushups", "Bible Study", "Pushup max", "Newbie"]);
  assert.ok(pickerButton(dom.root, "pushups").className.includes("active"));
});

test("counter habit (default) renders the five counter charts as inline SVG", () => {
  const { dom } = mount();
  const kinds = [...dom.root.querySelectorAll(".chart-card")].map((c) =>
    c.className.split(/\s+/).find((k) => k.startsWith("kind-")),
  );
  assert.deepEqual(
    kinds.sort(),
    ["kind-avgPerSet", "kind-counterDaily", "kind-rollingAvg", "kind-volume", "kind-weeklyTotal"].sort(),
  );
  // Every canvas holds an <svg>.
  for (const html of canvasHtml(dom.root)) {
    assert.match(html, /<svg/);
  }
});

test("the counter daily chart draws target ticks (target-at-the-time)", () => {
  const { dom } = mount();
  const daily = cardCanvas(dom.root, "counterDaily");
  assert.match(daily.innerHTML, /target-tick/);
});

test("selecting the measurement habit renders a four-point progression line (SPEC AC #5)", () => {
  const { dom } = mount();
  pickerButton(dom.root, "pushup_max").click();
  const canvas = cardCanvas(dom.root, "progression");
  assert.ok(canvas, "progression chart present");
  assert.equal(countIn(canvas.innerHTML, "<circle"), 4, "four measurement points");
  assert.equal(countIn(canvas.innerHTML, "<polyline"), 1, "one progression line");
});

test("selecting the binary habit renders a completion chart and a heatmap", () => {
  const { dom } = mount();
  pickerButton(dom.root, "bible_study").click();
  assert.ok(
    [...dom.root.querySelectorAll(".chart-card")].some((c) => c.className.includes("kind-weeklyCompletion")),
    "weekly completion present",
  );
  const hm = cardCanvas(dom.root, "heatmap");
  assert.match(hm.innerHTML, /hm-green/);
  assert.match(hm.innerHTML, /hm-skip/);
});

test("a habit with no events shows 'No data yet' and no chart", () => {
  const { dom } = mount();
  pickerButton(dom.root, "newbie").click();
  assert.equal(dom.root.querySelectorAll(".chart-card").length, 0);
  assert.match(dom.root.querySelector(".empty").textContent, /No data yet/);
});
