// Thin DOM renderer for the Week grid (SPEC Section 5, view 2).
//
// Like today.js this layer is DELIBERATELY thin: it turns the pure descriptors
// from weekModel (states, `n/target` text, day headers, week label, editable
// flags) into a Way-of-Life-style matrix and wires the paging arrows and the
// backfill taps. All decision logic lives in weekModel + the #002 domain core,
// which are unit-tested; this file is verified by the DOM tests (via the fake-DOM
// shim) and the runtime smoke.

import { buildWeekGrid } from "./weekModel.js";
import { weekStart, addDays } from "../core/dates.js";

function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.class) {
    node.className = opts.class;
  }
  if (opts.text !== undefined) {
    node.textContent = opts.text;
  }
  for (const [key, value] of Object.entries(opts.attrs || {})) {
    node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child) {
      node.appendChild(child);
    }
  }
  return node;
}

/**
 * Mount the Week grid into `root`, driven by `controller` (the shared Today
 * controller — reused read-only for habits / rules / config / events).
 *
 * @param {HTMLElement} root
 * @param {object} controller createTodayController(...) instance
 * @param {{todayIso: string, onOpenDate?: (iso: string) => void}} opts
 *   `onOpenDate` is called when Riley taps a past/today cell — the app switches to
 *   the Today view for that date so he can backfill (reuses #003's date switch).
 * @returns {{rerender: Function}}
 */
export function renderWeek(root, controller, { todayIso, onOpenDate = () => {} } = {}) {
  let weekStartDate = weekStart(todayIso);

  function model() {
    return buildWeekGrid({
      habits: controller.getHabits(),
      rules: controller.getRules(),
      config: controller.getConfig(),
      events: controller.getEvents(),
      weekStartDate,
      today: todayIso,
    });
  }

  function page(deltaWeeks) {
    weekStartDate = addDays(weekStartDate, deltaWeeks * 7);
    paint();
  }

  function nav(grid) {
    const prev = el("button", { class: "nav nav-prev", text: "‹", attrs: { "aria-label": "Previous week" } });
    prev.addEventListener("click", () => page(-1));

    const next = el("button", { class: "nav nav-next", text: "›", attrs: { "aria-label": "Next week" } });
    next.addEventListener("click", () => page(1));

    const isCurrent = grid.weekStart === weekStart(todayIso);
    const label = el("button", {
      class: "week-label",
      text: isCurrent ? `This week · ${grid.label}` : grid.label,
      attrs: { "aria-label": "Jump to current week" },
    });
    label.addEventListener("click", () => {
      weekStartDate = weekStart(todayIso);
      paint();
    });

    return el("header", { class: "week-header" }, [prev, label, next]);
  }

  function headerRow(grid) {
    const cells = [el("div", { class: "week-corner" })];
    for (const day of grid.days) {
      const mods = [day.isToday ? "is-today" : "", day.isFuture ? "is-future" : ""].filter(Boolean).join(" ");
      cells.push(
        el("div", { class: `week-day ${mods}`.trim() }, [
          el("span", { class: "dow", text: day.label }),
          el("span", { class: "dom", text: String(day.dayNum) }),
        ]),
      );
    }
    return el("div", { class: "week-row week-head" }, cells);
  }

  function cellNode(row, cell) {
    const dot = row.type === "measurement" && cell.hasMeasure ? "•" : cell.display;
    const cls = `week-cell type-${row.type} state-${cell.state}${cell.editable ? " editable" : ""}`;
    const label = `${row.name} ${cell.date}`;

    if (cell.editable) {
      const btn = el("button", { class: cls, text: dot, attrs: { "aria-label": label, "data-date": cell.date } });
      btn.addEventListener("click", () => onOpenDate(cell.date));
      return btn;
    }
    return el("div", { class: cls, text: dot, attrs: { "aria-label": label, "data-date": cell.date } });
  }

  function habitRow(row) {
    const cells = [el("div", { class: "week-habit", text: row.name })];
    for (const cell of row.cells) {
      cells.push(cellNode(row, cell));
    }
    return el("div", { class: `week-row type-${row.type}` }, cells);
  }

  function paint() {
    const grid = model();
    root.innerHTML = "";
    const table = el("div", { class: "week-grid" }, [headerRow(grid), ...grid.rows.map(habitRow)]);
    root.appendChild(nav(grid));
    if (grid.rows.length === 0) {
      root.appendChild(el("p", { class: "empty", text: "No habits to show." }));
    } else {
      root.appendChild(table);
    }
  }

  paint();
  return { rerender: paint };
}
