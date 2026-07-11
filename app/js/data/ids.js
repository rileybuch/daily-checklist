// Client-generated event ids for the outbound queue.
//
// Every mutating action carries a UUID `event_id` generated ON THE CLIENT
// (SPEC Section 3, events tab). This is what makes retries idempotent: the
// backend dedupes on `event_id`, so re-sending a queued event after a dropped
// connection can never double-count.
//
// Uses the platform `crypto.randomUUID` (available in modern browsers and in
// Node ≥ 19 via `globalThis.crypto`), with a small RFC-4122-shaped fallback so
// the app never fails to produce an id.

/**
 * Generate a fresh RFC-4122 v4 UUID string.
 * @returns {string}
 */
export function newEventId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  // Fallback: build a v4 UUID from whatever randomness is available.
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
  const g = (from, to) => hex.slice(from, to).join("");
  return `${g(0, 4)}-${g(4, 6)}-${g(6, 8)}-${g(8, 10)}-${g(10, 16)}`;
}
