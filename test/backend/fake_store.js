// In-memory test double for the backend store interface.
//
// Implements the exact interface the production `SheetStore` (backend/adapter.gs.js)
// implements, over plain arrays — so the pure core (backend/core.gs.js) can be
// unit-tested end-to-end with no Google globals.
//
// Every accessor returns fresh copies so a test (or the core) mutating a returned
// object cannot corrupt the store's internal state — mirroring the real adapter,
// which hands back fresh objects read from the Sheet on each call.
//
// This is a helper module, not a test file: it contains no `test()` calls.

"use strict";

class FakeStore {
  constructor(seed = {}) {
    this.habits = (seed.habits || []).map((h) => ({ ...h }));
    this.rules = (seed.rules || []).map((r) => ({ ...r }));
    this.config = { ...(seed.config || {}) };
    this.events = (seed.events || []).map((e) => ({ ...e }));
  }

  getHabits() {
    return this.habits.map((h) => ({ ...h }));
  }

  getRules() {
    return this.rules.map((r) => ({ ...r }));
  }

  getConfig() {
    return { ...this.config };
  }

  getEvents(sinceDate) {
    const all = this.events.map((e) => ({ ...e }));
    if (!sinceDate) {
      return all;
    }
    return all.filter((e) => String(e.date) >= String(sinceDate));
  }

  appendEvents(rows) {
    rows.forEach((r) => this.events.push({ ...r }));
  }

  upsertHabit(habit) {
    const i = this.habits.findIndex((x) => x.habit_id === habit.habit_id);
    if (i >= 0) {
      this.habits[i] = { ...habit };
    } else {
      this.habits.push({ ...habit });
    }
  }

  upsertRule(rule) {
    const i = this.rules.findIndex((x) => x.rule_id === rule.rule_id);
    if (i >= 0) {
      this.rules[i] = { ...rule };
    } else {
      this.rules.push({ ...rule });
    }
  }
}

module.exports = { FakeStore };
