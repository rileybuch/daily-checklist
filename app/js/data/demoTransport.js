// In-memory stub backend for local dev / runtime smoke (NOT used in production).
//
// The real app talks to a Google Apps Script Web App that this developer has no
// local access to. This module provides a `fetch`-shaped transport backed by an
// in-memory store, seeded with a representative habit set, so the Today view can
// be exercised in a real browser with `?demo=1` (see app.js) — no Google account,
// no network. It speaks the SAME `?path=...&token=...` protocol and enforces the
// same event_id idempotency as the live backend, so what you see in demo mode is
// faithful to production behavior.

import { addDays } from "../core/dates.js";

const SEED_HABITS = [
  { habit_id: "pushups", name: "Pushups", type: "counter", unit: "reps", sort_order: 1, active: true },
  { habit_id: "squats", name: "Squats", type: "counter", unit: "reps", sort_order: 2, active: true },
  { habit_id: "wall_sits", name: "Wall-sits", type: "counter", unit: "seconds", sort_order: 3, active: true },
  { habit_id: "bible_study", name: "Bible Study", type: "binary", unit: "", sort_order: 4, active: true },
  { habit_id: "pushup_max", name: "Pushup max", type: "measurement", unit: "reps", sort_order: 5, active: true },
];

/** Every habit scheduled every day so the demo always has rows to show. */
function seedRules() {
  const daily = (habitId, target) => ({
    rule_id: `${habitId}-daily`,
    habit_id: habitId,
    days: "*",
    week_parity: "*",
    target,
    effective_from: "2026-01-01",
    effective_to: "",
  });
  return [
    daily("pushups", 6),
    daily("squats", 6),
    daily("wall_sits", 4),
    daily("bible_study", 1),
    daily("pushup_max", 1),
  ];
}

/**
 * Two weeks of history relative to `anchor` (today), so every Trends chart and
 * Stats card is populated when the app is opened with ?demo=1 — including a
 * four-point "Pushup max" progression (SPEC AC #5). Dates are anchor-relative so
 * the demo stays fresh whenever it is opened, not frozen to fixed calendar days.
 * @param {string} anchor ISO date treated as "today"
 * @returns {Array<object>} append-only event rows
 */
function seedEvents(anchor) {
  const events = [];
  let n = 0;
  const add = (offset, habitId, kind, value, hh) =>
    events.push({
      event_id: `seed-${n++}`,
      ts: `${addDays(anchor, offset)}T${hh || "07:30:00"}`,
      date: addDays(anchor, offset),
      habit_id: habitId,
      kind,
      value,
      undo_of: "",
    });
  const logSets = (offset, habitId, count, base) => {
    for (let i = 0; i < count; i += 1) {
      add(offset, habitId, "set", base + (i % 3), `08:${String(10 + i).padStart(2, "0")}:00`);
    }
  };

  // Four "Pushup max" measurements across test days (SPEC AC #5).
  [[-40, 40], [-27, 43], [-13, 46], [-1, 49]].forEach(([offset, value]) =>
    add(offset, "pushup_max", "measure", value),
  );

  // Counter habits over the last 14 days (targets: pushups/squats 6, wall_sits 4).
  const pushups = [4, 6, 6, 0, 6, 5, 6, 6, 3, 6, 6, 4, 6, 2];
  const squats = [6, 6, 3, 6, 6, 0, 6, 4, 6, 6, 2, 6, 6, 0];
  const wallSits = [4, 3, 4, 0, 4, 4, 2, 4, 4, 0, 4, 3, 4, 1];
  for (let k = 0; k < 14; k += 1) {
    const offset = k - 13;
    logSets(offset, "pushups", pushups[k], 10);
    logSets(offset, "squats", squats[k], 15);
    logSets(offset, "wall_sits", wallSits[k], 35);
  }

  // Bible Study (daily binary) — mostly done, one skip, one miss.
  const bible = ["check", "check", "check", "skip", "check", "check", "check", "", "check", "check", "check", "check", "check", "check"];
  for (let k = 0; k < 14; k += 1) {
    if (bible[k]) {
      add(k - 13, "bible_study", bible[k], "");
    }
  }
  return events;
}

function jsonResponse(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

/**
 * Create an in-memory demo transport plus the credentials the app should use.
 * @param {string} [anchorDate] the config anchor_date (defaults to today)
 * @returns {{transport: Function, token: string, baseUrl: string}}
 */
export function createDemoTransport(anchorDate) {
  const anchor = anchorDate || new Date().toISOString().slice(0, 10);
  const config = { anchor_date: anchor, week_start: "sun" };
  const events = seedEvents(anchor);
  const seen = new Set(events.map((e) => e.event_id));
  const token = "demo-token";

  const transport = async (url, init = {}) => {
    const parsed = new URL(url);
    const path = parsed.searchParams.get("path");
    if (parsed.searchParams.get("token") !== token) {
      return jsonResponse({ status: 401, error: "unauthorized" });
    }
    const method = (init.method || "GET").toUpperCase();

    if (method === "GET" && path === "bootstrap") {
      return jsonResponse({
        status: 200,
        habits: SEED_HABITS,
        target_rules: seedRules(),
        config,
        events: events.slice(),
      });
    }
    if (method === "GET" && path === "events") {
      return jsonResponse({ status: 200, events: events.slice() });
    }
    if (method === "POST" && path === "events") {
      const batch = JSON.parse(init.body);
      const inserted = [];
      const skipped = [];
      for (const ev of batch) {
        if (seen.has(ev.event_id)) {
          skipped.push(ev.event_id);
        } else {
          seen.add(ev.event_id);
          events.push(ev);
          inserted.push(ev.event_id);
        }
      }
      return jsonResponse({ status: 200, inserted, skipped });
    }
    if (method === "POST" && (path === "habits" || path === "rules")) {
      return jsonResponse({ status: 200, ok: true });
    }
    return jsonResponse({ status: 404, error: "not_found" });
  };

  return { transport, token, baseUrl: "https://demo.local/exec" };
}
