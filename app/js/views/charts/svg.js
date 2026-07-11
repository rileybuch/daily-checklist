// Hand-rolled, dependency-free SVG charts for the Trends view (task #005).
//
// CHART-LIBRARY DECISION (resolves SPEC Open Question 1): the app is strict
// static files with NO build step and must work offline (SPEC Section 2 / AC #6).
// A bundler is forbidden and a runtime CDN <script> would break offline and add a
// dependency the core shell must not have. Therefore charts are hand-rolled as
// inline SVG generated in vanilla JS — zero dependencies, works offline, trivially
// unit-testable.
//
// This module is PURE: geometry helpers turn values into coordinates, and the
// builders return SVG MARKUP STRINGS. The DOM view (trends.js) only injects those
// strings via innerHTML, so all chart maths is proven here under `node --test`
// with no browser and no createElementNS. Colours live in CSS (via state classes),
// not in these strings, so the charts stay themeable.

import { dayOfWeek, weekIndex } from "../../core/dates.js";

const WIDTH = 320;
const HEIGHT = 120;
const PAD = 10;
const DOW_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** Round to 2 decimals to keep the emitted SVG compact and deterministic. */
function r2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Y-axis bounds for a value series. Floors at zero by default (bar/line charts
 * read best from a zero baseline) and pads a flat or empty series so the range is
 * never zero-height (which would divide by zero when mapping).
 *
 * @param {Array<number>} values
 * @param {{includeZero?: boolean}} [opts]
 * @returns {{min: number, max: number}}
 */
export function yBounds(values, { includeZero = true } = {}) {
  if (values.length === 0) {
    return { min: 0, max: 1 };
  }
  let max = Math.max(...values);
  let min = includeZero ? 0 : Math.min(...values);
  if (max === min) {
    max = min + 1;
  }
  return { min, max };
}

/**
 * Map a value series to evenly-spaced points across the plot area. A single
 * sample is centered; SVG y grows downward, so larger values map to smaller y.
 *
 * @param {Array<number>} values
 * @param {object} [opts] width/height/padding + optional yMin/yMax overrides
 * @returns {Array<{x: number, y: number}>}
 */
export function linePoints(values, opts = {}) {
  const { width = WIDTH, height = HEIGHT, padX = PAD, padTop = PAD, padBottom = PAD } = opts;
  const bounds = opts.yMax === undefined ? yBounds(values) : { min: opts.yMin ?? 0, max: opts.yMax };
  const plotH = height - padTop - padBottom;
  const span = bounds.max - bounds.min || 1;
  const n = values.length;
  return values.map((v, i) => {
    const x = n === 1 ? width / 2 : padX + (i * (width - 2 * padX)) / (n - 1);
    const y = padTop + ((bounds.max - v) / span) * plotH;
    return { x: r2(x), y: r2(y) };
  });
}

/**
 * Lay out a value series as bars sharing a zero baseline.
 *
 * @param {Array<number>} values
 * @param {object} [opts] width/height/padding + gap + optional yMax override
 * @returns {Array<{x: number, y: number, width: number, height: number}>}
 */
export function barRects(values, opts = {}) {
  const { width = WIDTH, height = HEIGHT, padX = PAD, padTop = PAD, padBottom = PAD, gap = 4 } = opts;
  const max = opts.yMax === undefined ? yBounds(values).max : opts.yMax;
  const baseline = height - padBottom;
  const plotH = height - padTop - padBottom;
  const slot = (width - 2 * padX) / Math.max(1, values.length);
  const barW = Math.max(1, slot - gap);
  return values.map((v, i) => {
    const h = max === 0 ? 0 : (v / max) * plotH;
    const x = padX + i * slot + gap / 2;
    return { x: r2(x), y: r2(baseline - h), width: r2(barW), height: r2(h) };
  });
}

/**
 * SVG path `d` string ("M x y L x y ...") for a list of points.
 * @param {Array<{x: number, y: number}>} points
 * @returns {string}
 */
export function pathData(points) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function svgOpen(width, height, klass) {
  return `<svg viewBox="0 0 ${width} ${height}" class="chart ${klass}" preserveAspectRatio="none" role="img">`;
}

/**
 * Line chart for a value series (measurement progression, rolling average). One
 * marker per sample; a connecting polyline when there are ≥ 2 samples. Assumes at
 * least one value (the view shows "No data yet" for an empty series).
 *
 * @param {{values: Array<number>, width?: number, height?: number}} params
 * @returns {string} SVG markup
 */
export function lineChartSvg({ values, width = WIDTH, height = HEIGHT }) {
  const pts = linePoints(values, { width, height });
  const parts = [svgOpen(width, height, "chart-line")];
  if (pts.length >= 2) {
    parts.push(`<polyline class="spark-line" points="${pts.map((p) => `${p.x},${p.y}`).join(" ")}" />`);
  }
  for (const p of pts) {
    parts.push(`<circle class="spark-pt" cx="${p.x}" cy="${p.y}" r="3" />`);
  }
  parts.push("</svg>");
  return parts.join("");
}

/**
 * Bar chart for a value series, with an optional per-bar target tick drawn at the
 * target's height on the same scale — this is how the counter daily-sets chart
 * shows the TARGET-AT-THE-TIME (a mid-range target change draws ticks at
 * different heights). A null target (unscheduled day) draws no tick.
 *
 * @param {{values: Array<number>, targets?: Array<number|null>,
 *          width?: number, height?: number}} params
 * @returns {string} SVG markup
 */
export function barChartSvg({ values, targets = null, width = WIDTH, height = HEIGHT }) {
  const scaleValues = targets ? values.concat(targets.filter((t) => t !== null && t !== undefined)) : values;
  const yMax = yBounds(scaleValues).max;
  const rects = barRects(values, { width, height, yMax });
  const parts = [svgOpen(width, height, "chart-bar")];
  rects.forEach((rect) => {
    parts.push(`<rect class="bar" x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" />`);
  });
  if (targets) {
    const plotH = height - 2 * PAD;
    const baseline = height - PAD;
    rects.forEach((rect, i) => {
      const t = targets[i];
      if (t === null || t === undefined) {
        return;
      }
      const y = r2(baseline - (t / yMax) * plotH);
      parts.push(
        `<line class="target-tick" x1="${rect.x}" y1="${y}" x2="${r2(rect.x + rect.width)}" y2="${y}" />`,
      );
    });
  }
  parts.push("</svg>");
  return parts.join("");
}

/**
 * Calendar heatmap for a binary habit: one cell per day, coloured by state via a
 * `hm-<state>` CSS class. Columns are Sun–Sat weeks (SPEC-locked week start),
 * rows are weekdays (Sun at top). Days may be sparse; columns span the first to
 * the last day's week.
 *
 * @param {{days: Array<{date: string, state: string}>, cell?: number, gap?: number}} params
 * @returns {string} SVG markup
 */
export function heatmapSvg({ days, cell = 14, gap = 3 }) {
  if (days.length === 0) {
    return `${svgOpen(cell, cell * 7 + gap * 6, "chart-heatmap")}</svg>`;
  }
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const anchor = sorted[0].date;
  const step = cell + gap;
  const numCols = weekIndex(sorted[sorted.length - 1].date, anchor) + 1;
  const width = numCols * step - gap;
  const height = 7 * step - gap;
  const parts = [svgOpen(Math.max(cell, width), height, "chart-heatmap")];
  for (const day of sorted) {
    const col = weekIndex(day.date, anchor);
    const row = DOW_INDEX[dayOfWeek(day.date)];
    const x = r2(col * step);
    const y = r2(row * step);
    parts.push(
      `<rect class="hm hm-${day.state}" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" />`,
    );
  }
  parts.push("</svg>");
  return parts.join("");
}
