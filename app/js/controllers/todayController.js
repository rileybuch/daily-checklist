// Today controller — the DOM-agnostic orchestration the Today view delegates to.
//
// Holds the in-memory app state (habits, rules, config, and the optimistically
// applied event list) and exposes the interactions the UI needs: log a set,
// edit its value, undo, toggle/skip a binary, record a measurement, switch the
// date, and flush the queue. Keeping this DOM-free is what makes the whole
// interactive surface unit-testable under `node --test` (see the controller
// tests); today.js is a thin renderer over `rows()` plus these methods.
//
// Optimistic apply: every mutating action is enqueued AND merged into the local
// event list immediately, so the derived count/state updates before any network
// round-trip. On open, still-queued (unflushed) events are re-merged so a prior
// force-close doesn't drop them from the on-screen state.

import { buildTodayRows } from "../views/todayModel.js";
import { nextSetValue } from "../data/prefill.js";
import { resolveTarget } from "../core/targets.js";
import { binaryDayState, voidedEventIds } from "../core/derive.js";

/**
 * @param {object} deps
 * @param {{habits: Array, target_rules: Array, config: object, events: Array}} deps.bootstrapData
 * @param {object} deps.queue outbound queue (data/queue.js)
 * @param {{flush: Function}} [deps.sync] flusher (data/sync.js); optional
 * @param {() => string} deps.newId client id generator
 * @param {() => string} deps.now ISO datetime clock for `ts`
 * @param {string} deps.todayIso ISO date treated as "today"
 * @param {number} [deps.defaultSetValue] fallback pre-fill for a brand-new habit
 */
export function createTodayController({
  bootstrapData,
  queue,
  sync,
  newId,
  now,
  todayIso,
  defaultSetValue = 1,
}) {
  const habits = bootstrapData.habits || [];
  const rules = bootstrapData.target_rules || [];
  const config = bootstrapData.config || {};

  // Optimistic event list = bootstrap events ∪ still-queued local events.
  let events = mergeById(bootstrapData.events || [], queue.list());
  let selectedDate = todayIso;

  function mergeById(serverEvents, localEvents) {
    const byId = new Map();
    for (const event of serverEvents) {
      byId.set(event.event_id, event);
    }
    for (const event of localEvents) {
      if (!byId.has(event.event_id)) {
        byId.set(event.event_id, event);
      }
    }
    return [...byId.values()];
  }

  function enqueue(event) {
    queue.enqueue(event);
    events.push(event);
    return event;
  }

  function makeEvent(habitId, kind, value, undoOf) {
    return {
      event_id: newId(),
      ts: now(),
      date: selectedDate,
      habit_id: habitId,
      kind,
      value: value === undefined ? "" : value,
      undo_of: undoOf || "",
    };
  }

  /** The last non-voided `set` for a habit on the selected date, or null. */
  function lastLiveSet(habitId) {
    const voided = voidedEventIds(events);
    let best = null;
    let bestTs = null;
    let bestIndex = -1;
    events.forEach((event, index) => {
      if (
        event.habit_id !== habitId ||
        event.date !== selectedDate ||
        event.kind !== "set" ||
        voided.has(event.event_id)
      ) {
        return;
      }
      const ts = event.ts || "";
      if (best === null || ts > bestTs || (ts === bestTs && index > bestIndex)) {
        best = event;
        bestTs = ts;
        bestIndex = index;
      }
    });
    return best;
  }

  return {
    /** Habits + config are read-only from the caller's perspective. */
    getHabits: () => habits,
    getConfig: () => config,
    getSelectedDate: () => selectedDate,

    /** Switch the selected date (backfill). Re-render via rows() afterward. */
    setDate(date) {
      selectedDate = date;
    },

    /** The ordered Today rows for the selected date. */
    rows() {
      return buildTodayRows({ habits, rules, config, events, date: selectedDate, today: todayIso });
    },

    /** Log one set (optimistic), value pre-filled from the habit's previous set. */
    logSet(habitId) {
      const value = nextSetValue(habitId, events, defaultSetValue);
      return enqueue(makeEvent(habitId, "set", value));
    },

    /** Adjust a queued/logged set's value in place — count is unaffected. */
    editSetValue(eventId, value) {
      const num = Number(value);
      const local = events.find((event) => event.event_id === eventId);
      if (local) {
        local.value = num;
      }
      queue.update(eventId, { value: num });
      return local || null;
    },

    /** Void the last set for a habit on the selected date. No-op if none. */
    undoLast(habitId) {
      const target = lastLiveSet(habitId);
      if (!target) {
        return null;
      }
      return enqueue(makeEvent(habitId, "undo", "", target.event_id));
    },

    /** Toggle a binary habit: check when not green, uncheck when green. */
    toggleBinary(habitId) {
      const resolved = resolveTarget(habitId, selectedDate, rules, config);
      const state = binaryDayState(habitId, selectedDate, events, resolved, todayIso);
      const kind = state === "green" ? "uncheck" : "check";
      return enqueue(makeEvent(habitId, kind, ""));
    },

    /** Mark a binary habit skipped (neutral for streaks). */
    skipBinary(habitId) {
      return enqueue(makeEvent(habitId, "skip", ""));
    },

    /** Record a measurement value. */
    recordMeasure(habitId, value) {
      return enqueue(makeEvent(habitId, "measure", Number(value)));
    },

    /** Count of events still awaiting flush (drives the "N pending" indicator). */
    pendingCount() {
      return queue.size();
    },

    /** Flush the outbound queue if a sync engine was provided. */
    flush() {
      if (!sync) {
        return Promise.resolve({ flushed: 0, pending: queue.size() });
      }
      return sync.flush();
    },

    /** Merge a fresh server event set (e.g. background bootstrap refresh). */
    setServerEvents(serverEvents) {
      events = mergeById(serverEvents, queue.list());
    },
  };
}
