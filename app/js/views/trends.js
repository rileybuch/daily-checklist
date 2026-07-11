// Thin DOM renderer for the Trends view (SPEC Section 5, view 3; task #005).
//
// Like today.js / week.js this layer is DELIBERATELY thin: it renders the habit
// picker and, for the selected habit, injects the pure SVG chart strings produced
// by the charts module. ALL decision logic (which charts, what data) lives in
// trendsModel + the #002/#005 core, which are unit-tested; the chart maths lives
// in the pure charts/svg module. This file is exercised by the DOM tests (via the
// fake-DOM shim) and the runtime smoke.
//
// Charts are hand-rolled inline SVG (no build step, no CDN, works offline — see
// charts/svg.js for the decision that resolves SPEC Open Question 1). Each chart's
// SVG string is set as innerHTML on its canvas element; browsers parse inline
// <svg> markup correctly, and the fake-DOM shim records the string for assertions.

import { buildTrends, pickableHabits } from "./trendsModel.js";
import { lineChartSvg, barChartSvg, heatmapSvg } from "./charts/svg.js";

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

/** Map a chart descriptor to its pure SVG-string builder. */
function chartSvg(chart) {
  switch (chart.kind) {
    case "counterDaily":
      return barChartSvg({ values: chart.counts, targets: chart.targets });
    case "weeklyTotal":
      return barChartSvg({ values: chart.totals });
    case "weeklyCompletion":
      return barChartSvg({ values: chart.rates });
    case "volume":
      return barChartSvg({ values: chart.values });
    case "rollingAvg":
    case "avgPerSet":
    case "progression":
      return lineChartSvg({ values: chart.values });
    case "heatmap":
      return heatmapSvg({ days: chart.days });
    default:
      return "";
  }
}

/**
 * Mount the Trends view into `root`, driven by the shared Today controller
 * (reused read-only for habits / rules / config / events).
 *
 * @param {HTMLElement} root
 * @param {object} controller createTodayController(...) instance
 * @param {{todayIso: string}} opts
 * @returns {{rerender: Function}}
 */
export function renderTrends(root, controller, { todayIso } = {}) {
  const pickable = pickableHabits(controller.getHabits());
  let selectedId = pickable.length ? pickable[0].habitId : null;

  function picker() {
    const bar = el("div", { class: "trend-picker" });
    for (const habit of pickable) {
      const btn = el("button", {
        class: `pick${habit.habitId === selectedId ? " active" : ""}`,
        text: habit.name,
        attrs: { "data-habit": habit.habitId },
      });
      btn.addEventListener("click", () => {
        selectedId = habit.habitId;
        paint();
      });
      bar.appendChild(btn);
    }
    return bar;
  }

  function chartCard(chart) {
    const canvas = el("div", { class: "chart-canvas" });
    canvas.innerHTML = chartSvg(chart);
    return el("section", { class: `chart-card kind-${chart.kind}` }, [
      el("h3", { class: "chart-title", text: chart.title }),
      canvas,
    ]);
  }

  function paint() {
    root.innerHTML = "";
    root.appendChild(picker());

    if (!selectedId) {
      root.appendChild(el("p", { class: "empty", text: "No habits to show." }));
      return;
    }

    const desc = buildTrends({
      habits: controller.getHabits(),
      rules: controller.getRules(),
      config: controller.getConfig(),
      events: controller.getEvents(),
      habitId: selectedId,
      today: todayIso,
    });

    const body = el("div", { class: "trend-body" });
    if (desc.empty) {
      body.appendChild(el("p", { class: "empty", text: "No data yet" }));
    } else {
      for (const chart of desc.charts) {
        body.appendChild(chartCard(chart));
      }
    }
    root.appendChild(body);
  }

  paint();
  return { rerender: paint };
}
