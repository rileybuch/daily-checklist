// Unit tests for app/js/data/queue.js — the localStorage outbound queue.
// AC: enqueued events persist in localStorage (survive a force-close), can be
// listed, value-patched in place, and removed by event_id after acknowledgement.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createQueue } from "../../app/js/data/queue.js";
import { FakeStorage } from "../helpers/fakes.mjs";

const KEY = "dc.queue";

function ev(id, value = 0) {
  return { event_id: id, kind: "set", value, undo_of: "" };
}

test("enqueue appends and list/size reflect the queued events", () => {
  const q = createQueue({ storage: new FakeStorage(), key: KEY });
  q.enqueue(ev("a", 10));
  q.enqueue(ev("b", 12));
  assert.equal(q.size(), 2);
  assert.deepEqual(q.list().map((e) => e.event_id), ["a", "b"]);
});

test("a fresh queue instance over the same storage recovers queued events (force-close)", () => {
  const storage = new FakeStorage();
  const q1 = createQueue({ storage, key: KEY });
  q1.enqueue(ev("a"));
  q1.enqueue(ev("b"));

  // Simulate the app being killed and reopened: brand-new queue, same storage.
  const q2 = createQueue({ storage, key: KEY });
  assert.equal(q2.size(), 2);
  assert.deepEqual(q2.list().map((e) => e.event_id), ["a", "b"]);
});

test("remove drops only the acknowledged event_ids", () => {
  const q = createQueue({ storage: new FakeStorage(), key: KEY });
  q.enqueue(ev("a"));
  q.enqueue(ev("b"));
  q.enqueue(ev("c"));
  q.remove(["a", "c"]);
  assert.deepEqual(q.list().map((e) => e.event_id), ["b"]);
});

test("update patches a queued event's value in place without changing its position", () => {
  const q = createQueue({ storage: new FakeStorage(), key: KEY });
  q.enqueue(ev("a", 12));
  q.enqueue(ev("b", 20));
  const ok = q.update("a", { value: 14 });
  assert.equal(ok, true);
  assert.deepEqual(q.list().map((e) => [e.event_id, e.value]), [["a", 14], ["b", 20]]);
});

test("update returns false for an event_id no longer in the queue", () => {
  const q = createQueue({ storage: new FakeStorage(), key: KEY });
  assert.equal(q.update("missing", { value: 1 }), false);
});

test("a corrupt storage value degrades to an empty queue rather than throwing", () => {
  const storage = new FakeStorage({ [KEY]: "{not json" });
  const q = createQueue({ storage, key: KEY });
  assert.deepEqual(q.list(), []);
});
