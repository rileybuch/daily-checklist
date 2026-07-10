// DOM tests for app/js/views/manage.js — the thin Manage renderer — driven
// through the dependency-free fake-DOM shim. These verify the conditional unit
// field, the immutability of habit_id/type on edit, the archive/reactivate
// toggle, the plain-language weekly preview (via #002 resolveTarget) and its live
// updates, the append-only rule flow, and that invalid input surfaces a message
// with no POST. Decision logic is proven in manageModel/manageController tests;
// here we prove the view faithfully paints and wires it.

import { test } from "node:test";
import assert from "node:assert/strict";

import { installDom } from "../helpers/domStub.mjs";
import { renderManage } from "../../app/js/views/manage.js";
import { createManageController } from "../../app/js/controllers/manageController.js";
import { seqIds } from "../helpers/fakes.mjs";

const TODAY = "2026-07-09"; // Thursday of an even-parity week (anchor 2026-07-05).

/** A fake api client that records habit/rule POSTs and always succeeds. */
function fakeApi() {
  const calls = { habits: [], rules: [] };
  return {
    calls,
    postHabit: async (habit) => {
      calls.habits.push(habit);
      return { ok: true };
    },
    postRule: async (rule) => {
      calls.rules.push(rule);
      return { ok: true };
    },
  };
}

function mount() {
  const dom = installDom();
  const api = fakeApi();
  const bootstrapData = {
    habits: [
      { habit_id: "pushups", name: "Pushups", type: "counter", unit: "reps", sort_order: 1, active: true },
      { habit_id: "flossing", name: "Flossing", type: "binary", unit: "", sort_order: 2, active: true },
    ],
    target_rules: [
      { rule_id: "p-wk", habit_id: "pushups", days: "mon,tue,wed,thu,fri", week_parity: "*", target: 6, effective_from: "2026-01-01", effective_to: "" },
    ],
    config: { anchor_date: "2026-07-05", week_start: "sun" },
  };
  const controller = createManageController({ bootstrapData, apiClient: api, newId: seqIds("rule"), todayIso: TODAY });
  const view = renderManage(dom.root, controller, { todayIso: TODAY });
  return { dom, api, controller, view };
}

function cardFor(root, name) {
  return root
    .querySelectorAll(".manage-habit")
    .find((c) => (c.querySelector(".habit-title") || {}).textContent === name);
}

// --- Conditional unit field -------------------------------------------------

test("add-habit unit field shows for counter/measurement and hides for binary", () => {
  const { dom } = mount();
  const form = dom.root.querySelector(".manage-add-habit");
  // Default type is counter → unit input present.
  assert.ok(form.querySelector(".habit-unit"), "unit shown for counter");

  const type = form.querySelector(".habit-type");
  type.value = "binary";
  type.dispatch("change");
  assert.equal(form.querySelector(".habit-unit"), null, "unit hidden for binary");

  type.value = "measurement";
  type.dispatch("change");
  assert.ok(form.querySelector(".habit-unit"), "unit shown for measurement");
});

test("typing a name shows a live derived slug preview", () => {
  const { dom } = mount();
  const form = dom.root.querySelector(".manage-add-habit");
  const name = form.querySelector(".habit-name");
  name.value = "Dips";
  name.dispatch("input");
  assert.equal(form.querySelector(".habit-slug-preview").textContent, "dips");
});

// --- Add habit --------------------------------------------------------------

test("adding a habit posts via the api client and adds a card", async () => {
  const { dom, api, view } = mount();
  const form = dom.root.querySelector(".manage-add-habit");
  form.querySelector(".habit-name").value = "Dips";
  form.querySelector(".habit-type").value = "counter";
  form.querySelector(".habit-unit").value = "reps";
  form.querySelector(".habit-sort").value = "5";

  form.querySelector(".add-habit-submit").click();
  await view.whenIdle();

  assert.equal(api.calls.habits.length, 1);
  assert.equal(api.calls.habits[0].habit_id, "dips");
  assert.ok(cardFor(dom.root, "Dips"), "a Dips card was rendered");
});

test("adding a duplicate-slug habit shows an error and does not post", async () => {
  const { dom, api, view } = mount();
  const form = dom.root.querySelector(".manage-add-habit");
  form.querySelector(".habit-name").value = "Pushups"; // slug collides with existing
  form.querySelector(".add-habit-submit").click();
  await view.whenIdle();

  assert.equal(api.calls.habits.length, 0, "no POST on invalid input");
  const err = dom.root.querySelector(".habit-error");
  assert.ok(err.querySelectorAll(".error").some((p) => /already exists/i.test(p.textContent)));
});

// --- Edit habit (immutable id + type) --------------------------------------

test("editing a habit exposes name/unit/sort but NOT habit_id or type controls", () => {
  const { dom } = mount();
  const card = cardFor(dom.root, "Pushups");
  card.querySelector(".edit-habit").click();

  const form = cardFor(dom.root, "Pushups").querySelector(".edit-habit-form");
  // Editable mutable fields present.
  assert.ok(form.querySelector(".habit-name"), "name is editable");
  assert.ok(form.querySelector(".habit-unit"), "unit is editable for a counter");
  assert.ok(form.querySelector(".habit-sort"), "sort_order is editable");
  // Immutable fields are read-only text, not editable controls.
  assert.equal(form.querySelector("select.habit-type"), null, "no editable type control");
  assert.equal(form.querySelector("input.habit-id"), null, "no editable id control");
  assert.equal(form.querySelector(".habit-type-static").textContent, "counter");
  assert.equal(form.querySelector(".habit-id-static").textContent, "pushups");
});

test("saving an edit changes the name via the api client", async () => {
  const { dom, api, view } = mount();
  cardFor(dom.root, "Pushups").querySelector(".edit-habit").click();
  const form = cardFor(dom.root, "Pushups").querySelector(".edit-habit-form");
  form.querySelector(".habit-name").value = "Push-ups";
  form.querySelector(".save-habit").click();
  await view.whenIdle();

  assert.equal(api.calls.habits.length, 1);
  assert.equal(api.calls.habits[0].name, "Push-ups");
  assert.ok(cardFor(dom.root, "Push-ups"), "the card shows the new name");
});

// --- Archive / reactivate ---------------------------------------------------

test("archiving a habit marks it archived; reactivating restores it", async () => {
  const { dom, controller, view } = mount();
  cardFor(dom.root, "Flossing").querySelector(".archive-toggle").click();
  await view.whenIdle();

  let card = cardFor(dom.root, "Flossing");
  assert.ok(card.className.split(/\s+/).includes("archived"), "card marked archived");
  assert.equal(card.querySelector(".archive-toggle").textContent, "Reactivate");
  assert.equal(controller.getHabits().find((h) => h.habit_id === "flossing").active, false);

  card.querySelector(".archive-toggle").click();
  await view.whenIdle();
  assert.equal(controller.getHabits().find((h) => h.habit_id === "flossing").active, true);
});

// --- Schedule preview + rules ----------------------------------------------

test("opening a habit's schedule shows the plain-language weekly preview", () => {
  const { dom } = mount();
  cardFor(dom.root, "Pushups").querySelector(".edit-schedule").click();
  const editor = cardFor(dom.root, "Pushups").querySelector(".rule-editor");
  // Saved rule: Mon–Fri 6, weekend uncovered.
  assert.equal(editor.querySelector(".habit-preview").textContent, "This week: Mon–Fri 6, Sat–Sun not scheduled");
});

test("the rule preview updates live as the form changes", () => {
  const { dom } = mount();
  cardFor(dom.root, "Pushups").querySelector(".edit-schedule").click();
  const editor = cardFor(dom.root, "Pushups").querySelector(".rule-editor");
  const preview = editor.querySelector(".rule-preview");
  assert.equal(preview.textContent, "This week: Mon–Fri 6, Sat–Sun not scheduled");

  // Draft a weekend rest (target 0) covering Sat + Sun from an in-scope date.
  editor.querySelector(".rule-from").value = "2026-01-01";
  editor.querySelector(".rule-from").dispatch("change");
  for (const box of editor.querySelectorAll(".rule-day")) {
    if (["sat", "sun"].includes(box.dataset.day)) {
      box.checked = true;
      box.dispatch("change");
    }
  }
  const target = editor.querySelector(".rule-target-input");
  target.value = "0";
  target.dispatch("input");

  assert.equal(preview.textContent, "This week: Mon–Fri 6, Sat–Sun rest");
});

test("adding a rule posts it and lists it under the habit", async () => {
  const { dom, api, view } = mount();
  cardFor(dom.root, "Pushups").querySelector(".edit-schedule").click();
  const editor = cardFor(dom.root, "Pushups").querySelector(".rule-editor");

  for (const box of editor.querySelectorAll(".rule-day")) {
    if (box.dataset.day === "sat") {
      box.checked = true;
    }
  }
  editor.querySelector(".rule-parity-input").value = "even";
  editor.querySelector(".rule-target-input").value = "3";
  editor.querySelector(".rule-from").value = "2026-07-05";

  editor.querySelector(".add-rule-submit").click();
  await view.whenIdle();

  assert.equal(api.calls.rules.length, 1);
  assert.equal(api.calls.rules[0].days, "sat");
  assert.equal(api.calls.rules[0].week_parity, "even");
  assert.equal(api.calls.rules[0].target, 3);

  // Old Mon–Fri rule still listed + the new one → append-only history preserved.
  const items = cardFor(dom.root, "Pushups").querySelector(".rule-editor").querySelectorAll(".rule-item");
  assert.equal(items.length, 2);
});

test("a rule with effective_to before effective_from is rejected with no POST", async () => {
  const { dom, api, view } = mount();
  cardFor(dom.root, "Pushups").querySelector(".edit-schedule").click();
  const editor = cardFor(dom.root, "Pushups").querySelector(".rule-editor");
  for (const box of editor.querySelectorAll(".rule-day")) {
    box.checked = true;
  }
  editor.querySelector(".rule-target-input").value = "6";
  editor.querySelector(".rule-from").value = "2026-07-10";
  editor.querySelector(".rule-to").value = "2026-07-01";

  editor.querySelector(".add-rule-submit").click();
  await view.whenIdle();

  assert.equal(api.calls.rules.length, 0, "no POST on invalid rule");
  const err = cardFor(dom.root, "Pushups").querySelector(".rule-error");
  assert.ok(err.querySelectorAll(".error").some((p) => /can't be before/i.test(p.textContent)));
});

test("'raise target' defaults effective_from to tomorrow and selects the weekdays", () => {
  const { dom, controller } = mount();
  cardFor(dom.root, "Pushups").querySelector(".edit-schedule").click();
  const editor = cardFor(dom.root, "Pushups").querySelector(".rule-editor");
  editor.querySelector(".raise-target").click();

  assert.equal(editor.querySelector(".rule-from").value, controller.tomorrow());
  const checked = editor.querySelectorAll(".rule-day").filter((b) => b.checked).map((b) => b.dataset.day);
  assert.deepEqual(checked.sort(), ["fri", "mon", "thu", "tue", "wed"]);
});
