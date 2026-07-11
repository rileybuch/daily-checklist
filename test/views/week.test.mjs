// DOM tests for app/js/views/week.js — the thin Week-grid renderer — driven
// through the dependency-free fake-DOM shim. These verify the rendered matrix
// (day headers, habit rows, cell colours/text), the paging arrows, and the
// backfill tap that reaches a past day's Today view. Decision logic is proven in
// weekModel.test.mjs; here we prove the view faithfully paints and wires it.

import { test } from "node:test";
import assert from "node:assert/strict";

import { installDom } from "../helpers/domStub.mjs";
import { renderWeek } from "../../app/js/views/week.js";
import { createTodayController } from "../../app/js/controllers/todayController.js";
import { createQueue } from "../../app/js/data/queue.js";
import { GTG_CONFIG, GTG_RULES, BIBLE_RULES } from "../core/fixtures.mjs";
import { FakeStorage, seqIds } from "../helpers/fakes.mjs";

const MEASURE_RULES = [
  { rule_id: "pm-daily", habit_id: "pushup_max", days: "*", week_parity: "*", target: 1, effective_from: "2026-01-01", effective_to: "" },
];
const RULES = [...GTG_RULES, ...BIBLE_RULES, ...MEASURE_RULES];

const HABITS = [
  { habit_id: "pushups", name: "Pushups", type: "counter", unit: "reps", sort_order: 1, active: true },
  { habit_id: "wall_sits", name: "Wall-sits", type: "counter", unit: "seconds", sort_order: 2, active: true },
  { habit_id: "bible_study", name: "Bible Study", type: "binary", unit: "", sort_order: 3, active: true },
  { habit_id: "pushup_max", name: "Pushup max", type: "measurement", unit: "reps", sort_order: 4, active: true },
];

// today = Saturday of week 1 → Sun–Fri are past, Sat is today (deterministic).
const TODAY = "2026-07-11";

function set(habitId, date, ts, value = 10) {
  return { event_id: `${habitId}-${date}-${ts}`, ts: `${date}T${ts}`, date, habit_id: habitId, kind: "set", value, undo_of: "" };
}
const EVENTS = [
  set("pushups", "2026-07-06", "08:00:00"), set("pushups", "2026-07-06", "08:05:00"),
  set("pushups", "2026-07-06", "08:10:00"), set("pushups", "2026-07-06", "08:15:00"),
  set("pushups", "2026-07-06", "08:20:00"), set("pushups", "2026-07-06", "08:25:00"), // Mon 6/6 green
  set("pushups", "2026-07-07", "08:00:00"), set("pushups", "2026-07-07", "08:05:00"),
  set("pushups", "2026-07-07", "08:10:00"), // Tue 3/6 amber
  // Wed 2026-07-08 → 0/6 red
  { event_id: "b1", ts: "2026-07-06T07:00:00", date: "2026-07-06", habit_id: "bible_study", kind: "check", value: "", undo_of: "" },
  { event_id: "b2", ts: "2026-07-07T07:00:00", date: "2026-07-07", habit_id: "bible_study", kind: "skip", value: "", undo_of: "" },
  { event_id: "m1", ts: "2026-07-06T07:00:00", date: "2026-07-06", habit_id: "pushup_max", kind: "measure", value: 44, undo_of: "" },
];

function mount({ onOpenDate = () => {} } = {}) {
  const dom = installDom();
  const controller = createTodayController({
    bootstrapData: { habits: HABITS, target_rules: RULES, config: GTG_CONFIG, events: EVENTS },
    queue: createQueue({ storage: new FakeStorage() }),
    newId: seqIds("ev"),
    now: () => `${TODAY}T09:00:00`,
    todayIso: TODAY,
  });
  const view = renderWeek(dom.root, controller, { todayIso: TODAY, onOpenDate });
  return { dom, controller, view };
}

function rowByName(root, name) {
  return [...root.querySelectorAll(".week-row")].find(
    (r) => (r.querySelector(".week-habit") || {}).textContent === name,
  );
}
function cellOn(row, iso) {
  return [...row.querySelectorAll(".week-cell")].find((c) => c.dataset.date === iso);
}
function classes(node) {
  return node.className.split(/\s+/);
}

test("renders seven Sun–Sat day headers with dates for the current week", () => {
  const { dom, view } = mount();
  const days = [...dom.root.querySelectorAll(".week-day")];
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((d) => d.querySelector(".dow").textContent), ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  assert.deepEqual(days.map((d) => d.querySelector(".dom").textContent), ["5", "6", "7", "8", "9", "10", "11"]);
  view.rerender();
});

test("renders one row per habit in sort_order with the habit name", () => {
  const { dom } = mount();
  const names = [...dom.root.querySelectorAll(".week-habit")].map((n) => n.textContent);
  assert.deepEqual(names, ["Pushups", "Wall-sits", "Bible Study", "Pushup max"]);
});

test("binary cells render green / skip / red for the seeded week", () => {
  const { dom } = mount();
  const bs = rowByName(dom.root, "Bible Study");
  assert.ok(classes(cellOn(bs, "2026-07-06")).includes("state-green"));
  assert.ok(classes(cellOn(bs, "2026-07-07")).includes("state-skip"));
  assert.ok(classes(cellOn(bs, "2026-07-08")).includes("state-red"));
});

test("counter cells render n/target text coloured green / amber / red", () => {
  const { dom } = mount();
  const push = rowByName(dom.root, "Pushups");
  const mon = cellOn(push, "2026-07-06");
  assert.equal(mon.textContent, "6/6");
  assert.ok(classes(mon).includes("state-green"));
  const tue = cellOn(push, "2026-07-07");
  assert.equal(tue.textContent, "3/6");
  assert.ok(classes(tue).includes("state-amber"));
  const wed = cellOn(push, "2026-07-08");
  assert.equal(wed.textContent, "0/6");
  assert.ok(classes(wed).includes("state-red"));
});

test("a scheduled-rest (Sunday, target 0) cell reads 'rest' and is not red", () => {
  const { dom } = mount();
  const sun = cellOn(rowByName(dom.root, "Pushups"), "2026-07-05");
  assert.equal(sun.textContent, "rest");
  assert.ok(classes(sun).includes("state-rest"));
  assert.ok(!classes(sun).includes("state-red"));
});

test("measurement cells show a dot on measure days and blank otherwise, never red", () => {
  const { dom } = mount();
  const pm = rowByName(dom.root, "Pushup max");
  assert.equal(cellOn(pm, "2026-07-06").textContent, "•");
  assert.equal(cellOn(pm, "2026-07-07").textContent, "");
  for (const cell of pm.querySelectorAll(".week-cell")) {
    assert.ok(!classes(cell).includes("state-red"));
  }
});

test("the week label shows the current-week range", () => {
  const { dom } = mount();
  const label = dom.root.querySelector(".week-label");
  assert.match(label.textContent, /This week · Jul 5 – 11/);
});

test("paging back re-renders the previous week's dates and label", () => {
  const { dom } = mount();
  dom.root.querySelector(".nav-prev").click();
  assert.match(dom.root.querySelector(".week-label").textContent, /Jun 28 – Jul 4/);
  assert.deepEqual(
    [...dom.root.querySelectorAll(".week-day")].map((d) => d.querySelector(".dom").textContent),
    ["28", "29", "30", "1", "2", "3", "4"],
  );
  // Return to the current week via the next arrow.
  dom.root.querySelector(".nav-next").click();
  assert.match(dom.root.querySelector(".week-label").textContent, /Jul 5 – 11/);
});

test("future cells (next week) are non-editable divs, never red", () => {
  const { dom } = mount();
  dom.root.querySelector(".nav-next").click(); // week 2 — all future
  const push = rowByName(dom.root, "Pushups");
  const wed = cellOn(push, "2026-07-15");
  assert.equal(wed.tagName, "DIV", "future cells are not tappable buttons");
  assert.ok(!classes(wed).includes("editable"));
  assert.ok(!classes(wed).includes("state-red"));
});

test("tapping a past cell invokes onOpenDate with that date (backfill path)", () => {
  const opened = [];
  const { dom } = mount({ onOpenDate: (iso) => opened.push(iso) });
  const tue = cellOn(rowByName(dom.root, "Bible Study"), "2026-07-07");
  assert.equal(tue.tagName, "BUTTON", "past cells are tappable");
  tue.click();
  assert.deepEqual(opened, ["2026-07-07"]);
});

test("backfilling then re-rendering reflects the new event (missed → green)", () => {
  const opened = [];
  const { dom, controller, view } = mount({ onOpenDate: (iso) => opened.push(iso) });
  const bs = rowByName(dom.root, "Bible Study");
  const wed = cellOn(bs, "2026-07-08");
  assert.ok(classes(wed).includes("state-red"), "Wednesday starts red (missed)");
  // Simulate the backfill: open Wednesday, check Bible Study on that date.
  wed.click();
  assert.deepEqual(opened, ["2026-07-08"]);
  controller.setDate("2026-07-08");
  controller.toggleBinary("bible_study");
  view.rerender();
  const wed2 = cellOn(rowByName(dom.root, "Bible Study"), "2026-07-08");
  assert.ok(classes(wed2).includes("state-green"), "Wednesday now reads green");
});
