// Outbound-queue flusher (SPEC Section 4).
//
// Posts the queued events as one idempotent batch. On success, every event the
// backend acknowledges — whether freshly `inserted` or already-present
// (`skipped`) — is dequeued, so a retry after a lost acknowledgement can never
// double-count. On network failure the queue is left completely intact for the
// next open / regained-connectivity retry. A single in-flight flush is enforced
// so a burst of taps plus an `online` event can't post the same batch twice
// concurrently.

/**
 * Create a sync engine over a queue and an API client.
 *
 * @param {{queue: object, apiClient: {postEvents: Function}}} deps
 * @returns {{flush: () => Promise<{flushed: number, pending: number, error?: Error}>}}
 */
export function createSyncEngine({ queue, apiClient }) {
  let inFlight = false;

  async function flush() {
    if (inFlight) {
      return { flushed: 0, pending: queue.size() };
    }
    const batch = queue.list();
    if (batch.length === 0) {
      return { flushed: 0, pending: 0 };
    }

    inFlight = true;
    try {
      const result = await apiClient.postEvents(batch);
      const acknowledged = [...(result.inserted || []), ...(result.skipped || [])];
      queue.remove(acknowledged);
      return { flushed: acknowledged.length, pending: queue.size() };
    } catch (error) {
      // Leave the queue intact: nothing is lost, it retries next time.
      return { flushed: 0, pending: queue.size(), error };
    } finally {
      inFlight = false;
    }
  }

  return { flush };
}
