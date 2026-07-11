// Shared test doubles for the data/sync layer (task #003).
//
// These fakes let the entire queue / API-client / controller stack run under
// `node --test` with no browser and no live Google backend:
//   - FakeStorage    → a localStorage-shaped in-memory key/value store.
//   - FakeSheet      → an in-memory stand-in for the events tab, enforcing the
//                      same event_id idempotency the real backend guarantees.
//   - sheetTransport → a fetch-shaped transport backed by a FakeSheet, so the
//                      real apiClient can drive it exactly as it would the live
//                      Web App.
//   - flakyTransport → wraps a transport and fails the first N calls (network
//                      down at the gym), then behaves normally.

/** localStorage-shaped in-memory store (getItem/setItem/removeItem/clear). */
export class FakeStorage {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

/** In-memory events tab that dedupes on event_id like the real POST /events. */
export class FakeSheet {
  constructor() {
    this.events = [];
    this.seen = new Set();
  }
  append(batch) {
    const inserted = [];
    const skipped = [];
    for (const ev of batch) {
      if (this.seen.has(ev.event_id)) {
        skipped.push(ev.event_id);
      } else {
        this.seen.add(ev.event_id);
        this.events.push(ev);
        inserted.push(ev.event_id);
      }
    }
    return { inserted, skipped };
  }
}

/** Build a JSON `Response`-shaped object the apiClient can `.json()`. */
function jsonResponse(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

/**
 * A fetch-shaped transport backed by a FakeSheet + optional bootstrap data.
 * Understands the same `?path=...&token=...` routing the Apps Script adapter uses.
 */
export function sheetTransport(sheet, { token = "secret", bootstrap = {} } = {}) {
  return async function transport(url, init = {}) {
    const parsed = new URL(url);
    const path = parsed.searchParams.get("path");
    const gotToken = parsed.searchParams.get("token");
    if (gotToken !== token) {
      return jsonResponse({ status: 401, error: "unauthorized" });
    }
    const method = (init.method || "GET").toUpperCase();
    if (method === "GET" && path === "bootstrap") {
      return jsonResponse({
        status: 200,
        habits: bootstrap.habits || [],
        target_rules: bootstrap.target_rules || [],
        config: bootstrap.config || {},
        events: sheet.events.slice(),
      });
    }
    if (method === "GET" && path === "events") {
      return jsonResponse({ status: 200, events: sheet.events.slice() });
    }
    if (method === "POST" && path === "events") {
      const batch = JSON.parse(init.body);
      const { inserted, skipped } = sheet.append(batch);
      return jsonResponse({ status: 200, inserted, skipped });
    }
    if (method === "POST" && path === "habits") {
      return jsonResponse({ status: 200, ok: true });
    }
    if (method === "POST" && path === "rules") {
      return jsonResponse({ status: 200, ok: true });
    }
    return jsonResponse({ status: 404, error: "not_found" });
  };
}

/**
 * Wrap a transport so its first `failures` invocations reject as if the network
 * were down, then delegate to the real transport. Models the basement-gym flush.
 */
export function flakyTransport(inner, failures) {
  let remaining = failures;
  return async function transport(url, init) {
    if (remaining > 0) {
      remaining -= 1;
      throw new TypeError("Failed to fetch");
    }
    return inner(url, init);
  };
}

/** A deterministic monotonic id generator for tests. */
export function seqIds(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}
