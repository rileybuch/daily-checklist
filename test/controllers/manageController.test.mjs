// Unit tests for app/js/controllers/manageController.js — the Manage write
// orchestration (task #006, SPEC 5.5). Drives the controller through the REAL
// #003 api client backed by a recording transport (per the AC: "api client with
// fake transport"), so the POST /habits and POST /rules shapes are proven
// exactly as they hit the live Web App — no live server.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createManageController } from "../../app/js/controllers/manageController.js";
import { createApiClient } from "../../app/js/data/apiClient.js";
import { seqIds } from "../helpers/fakes.mjs";

const BASE = "https://script.google.com/macros/s/AKID/exec";
const TODAY = "2026-07-09";

/** A fetch-shaped transport that records every call and accepts habit/rule POSTs. */
function recordingTransport() {
  const calls = [];
  const transport = async (url, init = {}) => {
    const parsed = new URL(url);
    calls.push({
      path: parsed.searchParams.get("path"),
      token: parsed.searchParams.get("token"),
      method: (init.method || "GET").toUpperCase(),
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    return { status: 200, json: async () => ({ status: 200, ok: true }) };
  };
  return { transport, calls };
}

function mount(overrides = {}) {
  const { transport, calls } = recordingTransport();
  const apiClient = createApiClient({ baseUrl: BASE, token: "tok", transport });
  const bootstrapData = {
    habits: overrides.habits || [
      { habit_id: "pushups", name: "Pushups", type: "counter", unit: "reps", sort_order: 1, active: true },
      { habit_id: "flossing", name: "Flossing", type: "binary", unit: "", sort_order: 2, active: true },
    ],
    target_rules: overrides.target_rules || [
      { rule_id: "p-wk", habit_id: "pushups", days: "mon,tue,wed,thu,fri", week_parity: "*", target: 6, effective_from: "2026-01-01", effective_to: "" },
    ],
    config: overrides.config || { anchor_date: "2026-07-05", week_start: "sun" },
  };
  const controller = createManageController({ bootstrapData, apiClient, newId: seqIds("rule"), todayIso: TODAY });
  return { controller, calls, bootstrapData };
}

// --- addHabit ---------------------------------------------------------------

test("addHabit derives the slug, sets defaults, and POSTs to /habits", async () => {
  const { controller, calls, bootstrapData } = mount();
  const res = await controller.addHabit({ name: "Dips", type: "counter", unit: "reps", sort_order: 5 });

  assert.equal(res.ok, true);
  assert.equal(res.habit.habit_id, "dips");
  assert.equal(res.habit.type, "counter");
  assert.equal(res.habit.unit, "reps");
  assert.equal(res.habit.sort_order, 5);
  assert.equal(res.habit.active, true);
  assert.equal(res.habit.created_at, TODAY);

  const post = calls.find((c) => c.path === "habits");
  assert.ok(post, "a POST /habits was issued");
  assert.equal(post.method, "POST");
  assert.equal(post.token, "tok");
  assert.equal(post.body.habit_id, "dips");
  // Local state updated so the new habit appears in the list.
  assert.ok(bootstrapData.habits.some((h) => h.habit_id === "dips"));
});

test("addHabit blanks the unit for a binary habit", async () => {
  const { controller } = mount();
  const res = await controller.addHabit({ name: "No Alcohol", type: "binary", unit: "ignored", sort_order: 9 });
  assert.equal(res.ok, true);
  assert.equal(res.habit.unit, "");
});

test("addHabit rejects a duplicate slug with a clear message and does NOT POST", async () => {
  const { controller, calls, bootstrapData } = mount();
  const before = bootstrapData.habits.length;
  const res = await controller.addHabit({ name: "Pushups", type: "counter", unit: "reps", sort_order: 1 });

  assert.equal(res.ok, false);
  assert.ok(res.errors.some((m) => /already exists/i.test(m)));
  assert.equal(calls.filter((c) => c.path === "habits").length, 0, "no POST on invalid input");
  assert.equal(bootstrapData.habits.length, before, "local state unchanged");
});

test("addHabit rejects an empty name with no POST", async () => {
  const { controller, calls } = mount();
  const res = await controller.addHabit({ name: "  ", type: "counter" });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((m) => /name is required/i.test(m)));
  assert.equal(calls.filter((c) => c.path === "habits").length, 0);
});

// --- editHabit / archive ----------------------------------------------------

test("editHabit changes mutable fields but keeps habit_id and type immutable", async () => {
  const { controller, calls } = mount();
  const res = await controller.editHabit("pushups", { name: "Push-ups", unit: "reps", sort_order: 3 });

  assert.equal(res.ok, true);
  assert.equal(res.habit.habit_id, "pushups", "habit_id unchanged");
  assert.equal(res.habit.type, "counter", "type unchanged");
  assert.equal(res.habit.name, "Push-ups");
  assert.equal(res.habit.sort_order, 3);

  const post = calls.find((c) => c.path === "habits");
  assert.equal(post.body.habit_id, "pushups");
  assert.equal(post.body.type, "counter");
});

test("editHabit rejects an empty name", async () => {
  const { controller, calls } = mount();
  const res = await controller.editHabit("pushups", { name: "" });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((m) => /name is required/i.test(m)));
  assert.equal(calls.filter((c) => c.path === "habits").length, 0);
});

test("setActive(false) archives a habit and setActive(true) reactivates it, events untouched", async () => {
  const events = [{ event_id: "e1", habit_id: "flossing", kind: "check", date: "2026-07-01", value: "", undo_of: "", ts: "2026-07-01T07:00:00" }];
  const { controller, bootstrapData } = mount();
  bootstrapData.events = events;

  await controller.setActive("flossing", false);
  assert.equal(controller.getHabits().find((h) => h.habit_id === "flossing").active, false);
  assert.deepEqual(bootstrapData.events, events, "archiving does not touch events");

  await controller.setActive("flossing", true);
  assert.equal(controller.getHabits().find((h) => h.habit_id === "flossing").active, true);
});

// --- addRule ----------------------------------------------------------------

test("addRule POSTs the normalized rule to /rules and appends it to local state", async () => {
  const { controller, calls, bootstrapData } = mount();
  const res = await controller.addRule("pushups", {
    days: ["sat"],
    week_parity: "even",
    target: "3",
    effective_from: "2026-07-05",
    effective_to: "",
  });

  assert.equal(res.ok, true);
  assert.equal(res.rule.habit_id, "pushups");
  assert.equal(res.rule.days, "sat");
  assert.equal(res.rule.week_parity, "even");
  assert.equal(res.rule.target, 3);
  assert.ok(res.rule.rule_id, "a rule_id was generated");

  const post = calls.find((c) => c.path === "rules");
  assert.equal(post.method, "POST");
  assert.equal(post.body.target, 3);
  assert.ok(bootstrapData.target_rules.some((r) => r.rule_id === res.rule.rule_id));
});

test("addRule rejects effective_to before effective_from with no POST", async () => {
  const { controller, calls } = mount();
  const res = await controller.addRule("pushups", {
    days: "*",
    target: 6,
    effective_from: "2026-07-10",
    effective_to: "2026-07-01",
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((m) => /can't be before/i.test(m)));
  assert.equal(calls.filter((c) => c.path === "rules").length, 0);
});

test("raising a target adds a NEW forward-dated rule and leaves the old rule in place", async () => {
  // Story: Riley raises pushups from 6 → 8 effective tomorrow. Both rules coexist.
  const { controller, bootstrapData } = mount();
  const oldRules = controller.getRulesFor("pushups");
  assert.equal(oldRules.length, 1);
  const oldRuleId = oldRules[0].rule_id;

  const from = controller.tomorrow();
  assert.equal(from, "2026-07-10");
  const res = await controller.addRule("pushups", {
    days: "mon,tue,wed,thu,fri",
    week_parity: "*",
    target: 8,
    effective_from: from,
    effective_to: "",
  });

  assert.equal(res.ok, true);
  const after = controller.getRulesFor("pushups");
  assert.equal(after.length, 2, "old and new rules both present");
  assert.ok(after.some((r) => r.rule_id === oldRuleId && Number(r.target) === 6), "old target-6 rule preserved");
  assert.ok(after.some((r) => Number(r.target) === 8 && r.effective_from === "2026-07-10"), "new target-8 rule added");
  assert.equal(bootstrapData.target_rules.length, 2);
});

// --- preview ----------------------------------------------------------------

test("preview resolves a habit's current weekly schedule via the core", () => {
  const { controller } = mount();
  // Only a Mon–Fri 6 rule exists for pushups; weekend is not scheduled.
  const preview = controller.preview("pushups", undefined, "2026-07-05");
  assert.equal(preview.text, "Mon–Fri 6, Sat–Sun not scheduled");
});

test("preview reflects a draft rule merged over the saved rules", () => {
  const { controller } = mount();
  // Draft: add a Sunday rest (target 0) on top of the existing Mon–Fri 6.
  const preview = controller.preview(
    "pushups",
    { days: "sat,sun", week_parity: "*", target: 0, effective_from: "2026-01-01", effective_to: "" },
    "2026-07-05",
  );
  assert.equal(preview.text, "Mon–Fri 6, Sat–Sun rest");
});
