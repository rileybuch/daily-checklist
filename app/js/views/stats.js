// Thin DOM renderer for the Stats view (SPEC Section 5, view 4; task #005).
//
// A compact card per active habit showing current streak, best streak, and 30/90
// day completion %. All numbers come from statsModel (which reads the #002 core);
// this layer only formats them. Measurement habits have no daily state, so their
// streak/completion cells render a dash. Exercised by the DOM tests + runtime smoke.

import { buildStats } from "./statsModel.js";

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

/** Format a [0,1] rate as a whole-percent string, or a dash when not applicable. */
function pct(rate) {
  return rate === null || rate === undefined ? "—" : `${Math.round(rate * 100)}%`;
}

function statCell(label, value) {
  return el("div", { class: "stat-cell" }, [
    el("span", { class: "stat-value", text: value }),
    el("span", { class: "stat-label", text: label }),
  ]);
}

function card(row) {
  const streak = row.applicable ? String(row.currentStreak) : "—";
  const best = row.applicable ? String(row.bestStreak) : "—";
  const cells = el("div", { class: "stat-cells" }, [
    statCell("streak", streak),
    statCell("best", best),
    statCell("30d", pct(row.completion30)),
    statCell("90d", pct(row.completion90)),
  ]);
  const header = el("div", { class: "stat-head" }, [
    el("span", { class: "stat-name", text: row.name }),
    row.hasData ? null : el("span", { class: "stat-nodata", text: "No data yet" }),
  ]);
  return el("section", { class: `stat-card type-${row.type}`, attrs: { "data-habit": row.habitId } }, [header, cells]);
}

/**
 * Mount the Stats view into `root`, driven by the shared Today controller.
 *
 * @param {HTMLElement} root
 * @param {object} controller createTodayController(...) instance
 * @param {{todayIso: string}} opts
 * @returns {{rerender: Function}}
 */
export function renderStats(root, controller, { todayIso } = {}) {
  function paint() {
    const rows = buildStats({
      habits: controller.getHabits(),
      rules: controller.getRules(),
      config: controller.getConfig(),
      events: controller.getEvents(),
      today: todayIso,
    });
    root.innerHTML = "";
    if (rows.length === 0) {
      root.appendChild(el("p", { class: "empty", text: "No habits to show." }));
      return;
    }
    const list = el("div", { class: "stat-list" });
    for (const row of rows) {
      list.appendChild(card(row));
    }
    root.appendChild(list);
  }

  paint();
  return { rerender: paint };
}
