// Unit tests for app/js/data/sync.js — the outbound-queue flusher.
// AC: a failing-then-succeeding transport posts each event_id until acknowledged,
// with no duplicates after success; a network failure leaves the queue intact.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createQueue } from "../../app/js/data/queue.js";
import { createApiClient } from "../../app/js/data/apiClient.js";
import { createSyncEngine } from "../../app/js/data/sync.js";
import { FakeStorage, FakeSheet, sheetTransport, flakyTransport } from "../helpers/fakes.mjs";

const BASE = "https://script/exec";

function setEvent(id, value) {
  return { event_id: id, ts: "2026-07-08T08:00:00", date: "2026-07-08", habit_id: "pushups", kind: "set", value, undo_of: "" };
}

function wire({ failures = 0, sheet = new FakeSheet() } = {}) {
  const storage = new FakeStorage();
  const queue = createQueue({ storage });
  const transport = flakyTransport(sheetTransport(sheet, { token: "tok" }), failures);
  const apiClient = createApiClient({ baseUrl: BASE, token: "tok", transport });
  const sync = createSyncEngine({ queue, apiClient });
  return { queue, sync, sheet };
}

test("flush on an empty queue is a no-op", async () => {
  const { sync } = wire();
  const res = await sync.flush();
  assert.equal(res.pending, 0);
  assert.equal(res.flushed, 0);
});

test("flush posts the queued batch and clears acknowledged events on success", async () => {
  const { queue, sync, sheet } = wire();
  queue.enqueue(setEvent("a", 12));
  queue.enqueue(setEvent("b", 14));

  const res = await sync.flush();

  assert.equal(res.flushed, 2);
  assert.equal(queue.size(), 0, "acknowledged events are dequeued");
  assert.deepEqual(sheet.events.map((e) => e.event_id), ["a", "b"]);
});

test("a network failure leaves the queue intact for retry (nothing lost)", async () => {
  const { queue, sync, sheet } = wire({ failures: 1 });
  queue.enqueue(setEvent("a", 12));

  const res = await sync.flush();

  assert.equal(res.flushed, 0);
  assert.ok(res.error, "the failure is reported");
  assert.equal(queue.size(), 1, "the event stays queued");
  assert.equal(sheet.events.length, 0, "nothing reached the sheet");
});

test("failing-then-succeeding flush lands each event exactly once (idempotent, no dup)", async () => {
  const { queue, sync, sheet } = wire({ failures: 1 });
  queue.enqueue(setEvent("a", 12));
  queue.enqueue(setEvent("b", 14));
  queue.enqueue(setEvent("c", 16));

  const first = await sync.flush(); // network down → intact
  assert.equal(first.flushed, 0);
  assert.equal(queue.size(), 3);

  const second = await sync.flush(); // reconnected → all land
  assert.equal(second.flushed, 3);
  assert.equal(queue.size(), 0);

  // Even a redundant extra flush must not duplicate rows in the sheet.
  await sync.flush();
  assert.deepEqual(sheet.events.map((e) => e.event_id), ["a", "b", "c"]);
});

test("events already present server-side are acknowledged via `skipped` and dequeued (no dup on retry)", async () => {
  const sheet = new FakeSheet();
  sheet.append([setEvent("a", 12)]); // pretend a prior attempt actually landed
  const { queue, sync } = wire({ sheet });
  queue.enqueue(setEvent("a", 12)); // client didn't get the ack, retries

  const res = await sync.flush();

  assert.equal(res.flushed, 1);
  assert.equal(queue.size(), 0, "a skipped (already-present) event is still dequeued");
  assert.equal(sheet.events.length, 1, "no duplicate row");
});
