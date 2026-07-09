// Pure view-model builder for the Today view (SPEC Section 5, view 1).
//
// This holds ALL of the Today view's decision logic with zero DOM, so it is
// unit-testable under `node --test`. The DOM layer (today.js) is a thin renderer
// that turns these row descriptors into elements. All derivation is delegated to
// the domain core (#002) — schedule resolution, counts, and day-states are never
// reimplemented here.
//
// A habit renders for the selected date iff it is ACTIVE and SCHEDULED that day
// (via resolveTarget). Rows are ordered by `sort_order`. An empty result drives
// the "Nothing scheduled" empty state.

import { resolveTarget } from "../core/targets.js";
import {
  binaryDayState,
  counterDayState,
  counterDayCount,
  counterDayVolume,
  measureSeries,
  voidedEventIds,
} from "../core/derive.js";

/** The most recent non-voided `set` for a habit/date, as {event_id, value}, or null. */
function lastLiveSet(habitId, date, events) {
  const voided = voidedEventIds(events);
  let best = null;
  let bestTs = null;
  let bestIndex = -1;
  events.forEach((event, index) => {
    if (
      event.habit_id !== habitId ||
      event.date !== date ||
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
  return best ? { event_id: best.event_id, value: Number(best.value) } : null;
}

/** Archived habits keep their history but leave the checklist. */
function isActive(habit) {
  if (habit.active === undefined || habit.active === null || habit.active === "") {
    return true;
  }
  return habit.active === true || String(habit.active).toLowerCase() === "true";
}

/**
 * Build the ordered list of Today rows for a date.
 *
 * @param {{habits: Array, rules: Array, config: object, events: Array,
 *          date: string, today: string}} params
 * @returns {Array<object>} row descriptors, one per scheduled active habit
 */
export function buildTodayRows({ habits, rules, config, events, date, today }) {
  const rows = [];

  for (const habit of habits) {
    if (!isActive(habit)) {
      continue;
    }
    const resolved = resolveTarget(habit.habit_id, date, rules, config);
    if (!resolved.scheduled) {
      continue;
    }

    const base = {
      habitId: habit.habit_id,
      name: habit.name,
      type: habit.type,
      unit: habit.unit || "",
      sortOrder: Number(habit.sort_order || 0),
      target: Number(resolved.target),
    };

    if (habit.type === "counter") {
      const count = counterDayCount(habit.habit_id, date, events);
      const volume = counterDayVolume(habit.habit_id, date, events);
      const fillRatio = base.target > 0 ? Math.min(count / base.target, 1) : 1;
      rows.push({
        ...base,
        count,
        volume,
        fillRatio,
        lastSet: lastLiveSet(habit.habit_id, date, events),
        state: counterDayState(habit.habit_id, date, events, resolved, today),
      });
    } else if (habit.type === "binary") {
      rows.push({
        ...base,
        state: binaryDayState(habit.habit_id, date, events, resolved, today),
      });
    } else if (habit.type === "measurement") {
      const series = measureSeries(habit.habit_id, events);
      const forDate = series.filter((point) => point.date === date);
      rows.push({
        ...base,
        state: "measurement", // never red — measurements have no pass/fail day-state
        series,
        lastValue: series.length ? series[series.length - 1].value : null,
        loggedToday: forDate.length > 0,
      });
    }
  }

  rows.sort((a, b) => a.sortOrder - b.sortOrder);
  return rows;
}
