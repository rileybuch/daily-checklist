// API client for the Apps Script Web App (SPEC Section 4).
//
// Five endpoints, all JSON, `token` attached to every request. The transport is
// INJECTED (a `fetch`-shaped function) so the client is unit-testable with a
// fake — no live server. Routing matches the adapter (adapter.gs.js): the
// endpoint name is passed as a `?path=` query param (the adapter reads
// `e.parameter.path`), alongside `token`.
//
// Apps Script Web Apps always emit HTTP 200 and fold the logical status into the
// JSON body (see backend `shapeResponse`). So success/failure is decided by the
// `status` field of the parsed body, not the HTTP status. POST bodies are sent
// as `text/plain` on purpose: it keeps the request a CORS "simple request" and
// avoids a preflight OPTIONS that Apps Script cannot answer.

/**
 * Build a request URL with `path`, `token`, and any extra query params.
 * @param {string} baseUrl the Web App `/exec` URL
 * @param {string} path endpoint name, e.g. "bootstrap"
 * @param {string} token shared secret
 * @param {Object} query extra query params
 * @returns {string}
 */
function buildUrl(baseUrl, path, token, query) {
  const url = new URL(baseUrl);
  url.searchParams.set("path", path);
  url.searchParams.set("token", token);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Create an API client bound to a base URL, token, and transport.
 *
 * @param {{baseUrl: string, token: string, transport: Function}} deps
 *   `transport(url, init)` is `fetch`-shaped and must resolve to an object with
 *   an async `json()` method.
 * @returns {{bootstrap: Function, getEvents: Function, postEvents: Function,
 *            postHabit: Function, postRule: Function}}
 */
export function createApiClient({ baseUrl, token, transport }) {
  async function call(method, path, { query = {}, body } = {}) {
    const url = buildUrl(baseUrl, path, token, query);
    const init = { method, redirect: "follow" };
    if (body !== undefined) {
      init.headers = { "Content-Type": "text/plain;charset=utf-8" };
      init.body = JSON.stringify(body);
    }
    const response = await transport(url, init);
    const payload = await response.json();
    if (typeof payload.status === "number" && payload.status >= 400) {
      const error = new Error(payload.error || `request_failed_${payload.status}`);
      error.status = payload.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  return {
    /** GET /bootstrap → { habits, target_rules, config, events }. */
    bootstrap: () => call("GET", "bootstrap"),
    /** GET /events?since=<ISO date> → { events }. */
    getEvents: (since) => call("GET", "events", { query: { since } }),
    /** POST /events (JSON array) → { inserted, skipped }; idempotent on event_id. */
    postEvents: (events) => call("POST", "events", { body: events }),
    /** POST /habits → { ok, habit_id }. */
    postHabit: (habit) => call("POST", "habits", { body: habit }),
    /** POST /rules → { ok, rule_id }. */
    postRule: (rule) => call("POST", "rules", { body: rule }),
  };
}
