// Outbound event queue, persisted in localStorage (SPEC Section 4).
//
// Every mutating action is enqueued here with its client-generated `event_id`
// before it is ever sent. The queue lives in `localStorage`, so it survives a
// force-close or a dead connection at the gym: a fresh page load recovers it and
// the flusher (sync.js) retries. `localStorage` is injected so the queue is
// unit-testable with a fake — the store just needs `getItem`/`setItem`.

const DEFAULT_KEY = "dc.queue";

/**
 * Create a persistent outbound queue over an injected storage object.
 *
 * @param {{storage: {getItem: Function, setItem: Function}, key?: string}} deps
 * @returns {{enqueue: Function, list: Function, size: Function,
 *            remove: Function, update: Function, clear: Function}}
 */
export function createQueue({ storage, key = DEFAULT_KEY }) {
  function read() {
    try {
      const raw = storage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Corrupt payload → degrade to an empty queue rather than crashing the app.
      return [];
    }
  }

  function write(list) {
    storage.setItem(key, JSON.stringify(list));
  }

  return {
    /** Append an event and persist. Returns the event. */
    enqueue(event) {
      const list = read();
      list.push(event);
      write(list);
      return event;
    },
    /** A shallow copy of the queued events, in order. */
    list() {
      return read();
    },
    /** Number of queued events. */
    size() {
      return read().length;
    },
    /** Remove every event whose `event_id` is in `ids`. */
    remove(ids) {
      const drop = new Set(ids);
      write(read().filter((event) => !drop.has(event.event_id)));
    },
    /**
     * Patch a queued event in place (e.g. the inline stepper adjusting a set's
     * value before flush). Returns true if an event was found and patched.
     */
    update(eventId, patch) {
      const list = read();
      const index = list.findIndex((event) => event.event_id === eventId);
      if (index === -1) {
        return false;
      }
      list[index] = { ...list[index], ...patch };
      write(list);
      return true;
    },
    /** Empty the queue. */
    clear() {
      write([]);
    },
  };
}
