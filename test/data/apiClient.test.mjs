// Unit tests for app/js/data/apiClient.js — the injectable-transport API client.
// AC: attaches `token` to every request and targets the correct endpoint/verb
// for all five endpoints; unit-tested with a fake transport (no live server).

import { test } from "node:test";
import assert from "node:assert/strict";

import { createApiClient } from "../../app/js/data/apiClient.js";

/** A transport that records the last call and returns a canned payload. */
function recordingTransport(payload = { status: 200 }) {
  const calls = [];
  const transport = async (url, init = {}) => {
    calls.push({ url, init });
    return { status: 200, json: async () => payload };
  };
  return { transport, calls };
}

function parse(url) {
  const u = new URL(url);
  return { origin: u.origin, path: u.searchParams.get("path"), token: u.searchParams.get("token"), search: u.searchParams };
}

const BASE = "https://script.google.com/macros/s/AKID/exec";

test("bootstrap issues GET with path=bootstrap and the token", async () => {
  const { transport, calls } = recordingTransport({ status: 200, habits: [] });
  const client = createApiClient({ baseUrl: BASE, token: "tok", transport });

  const res = await client.bootstrap();

  assert.equal(calls.length, 1);
  const { init } = calls[0];
  assert.equal((init.method || "GET").toUpperCase(), "GET");
  const p = parse(calls[0].url);
  assert.equal(p.path, "bootstrap");
  assert.equal(p.token, "tok");
  assert.deepEqual(res, { status: 200, habits: [] });
});

test("getEvents issues GET path=events and forwards the since filter", async () => {
  const { transport, calls } = recordingTransport({ status: 200, events: [] });
  const client = createApiClient({ baseUrl: BASE, token: "tok", transport });

  await client.getEvents("2026-07-01");

  const p = parse(calls[0].url);
  assert.equal((calls[0].init.method || "GET").toUpperCase(), "GET");
  assert.equal(p.path, "events");
  assert.equal(p.token, "tok");
  assert.equal(p.search.get("since"), "2026-07-01");
});

test("postEvents issues POST path=events with the batch as a JSON array body", async () => {
  const { transport, calls } = recordingTransport({ status: 200, inserted: ["e1"], skipped: [] });
  const client = createApiClient({ baseUrl: BASE, token: "tok", transport });

  const batch = [{ event_id: "e1", kind: "set", value: 12 }];
  const res = await client.postEvents(batch);

  const { init } = calls[0];
  assert.equal(init.method.toUpperCase(), "POST");
  const p = parse(calls[0].url);
  assert.equal(p.path, "events");
  assert.equal(p.token, "tok");
  assert.deepEqual(JSON.parse(init.body), batch);
  assert.deepEqual(res.inserted, ["e1"]);
});

test("postHabit and postRule issue POST to their respective paths with the token", async () => {
  const { transport, calls } = recordingTransport({ status: 200, ok: true });
  const client = createApiClient({ baseUrl: BASE, token: "tok", transport });

  await client.postHabit({ habit_id: "pushups", name: "Pushups", type: "counter" });
  await client.postRule({ rule_id: "r1", habit_id: "pushups", days: "*", target: 6, effective_from: "2026-01-01" });

  const habitCall = parse(calls[0].url);
  assert.equal(calls[0].init.method.toUpperCase(), "POST");
  assert.equal(habitCall.path, "habits");
  assert.equal(habitCall.token, "tok");

  const ruleCall = parse(calls[1].url);
  assert.equal(calls[1].init.method.toUpperCase(), "POST");
  assert.equal(ruleCall.path, "rules");
  assert.equal(ruleCall.token, "tok");
});

test("a logical error status in the JSON body is surfaced as a thrown error", async () => {
  const transport = async () => ({ status: 200, json: async () => ({ status: 401, error: "unauthorized" }) });
  const client = createApiClient({ baseUrl: BASE, token: "bad", transport });

  await assert.rejects(() => client.bootstrap(), (err) => {
    assert.equal(err.status, 401);
    assert.equal(err.payload.error, "unauthorized");
    return true;
  });
});
