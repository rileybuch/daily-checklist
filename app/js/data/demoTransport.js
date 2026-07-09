// In-memory stub backend for local dev / runtime smoke (NOT used in production).
//
// The real app talks to a Google Apps Script Web App that this developer has no
// local access to. This module provides a `fetch`-shaped transport backed by an
// in-memory store, seeded with a representative habit set, so the Today view can
// be exercised in a real browser with `?demo=1` (see app.js) — no Google account,
// no network. It speaks the SAME `?path=...&token=...` protocol and enforces the
// same event_id idempotency as the live backend, so what you see in demo mode is
// faithful to production behavior.

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

const SEED_EVENTS = [
  // A couple of days of a "Pushup max" progression so the measurement row has history.
  { event_id: "seed-m1", ts: "2026-06-01T07:00:00", date: "2026-06-01", habit_id: "pushup_max", kind: "measure", value: 40, undo_of: "" },
  { event_id: "seed-m2", ts: "2026-06-20T07:00:00", date: "2026-06-20", habit_id: "pushup_max", kind: "measure", value: 44, undo_of: "" },
];

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
  const events = SEED_EVENTS.slice();
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
