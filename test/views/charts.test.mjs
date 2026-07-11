// Unit tests for app/js/views/charts/svg.js — the hand-rolled, dependency-free
// SVG chart module (task #005, resolving SPEC Open Question 1). Everything here
// is PURE: geometry helpers (values → coordinates) and builders that return SVG
// markup strings. The DOM view (trends.js) only injects these strings, so the
// chart maths is fully proven under `node --test` with no browser.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  yBounds,
  linePoints,
  barRects,
  pathData,
  lineChartSvg,
  barChartSvg,
  heatmapSvg,
} from "../../app/js/views/charts/svg.js";

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// --- yBounds ----------------------------------------------------------------

test("yBounds floors at zero by default and covers the max", () => {
  assert.deepEqual(yBounds([2, 5, 3]), { min: 0, max: 5 });
});

test("yBounds pads a flat series so the range is never zero-height", () => {
  const b = yBounds([4, 4, 4]);
  assert.equal(b.min, 0);
  assert.ok(b.max > b.min);
});

test("yBounds of an empty series is a safe unit range", () => {
  assert.deepEqual(yBounds([]), { min: 0, max: 1 });
});

// --- linePoints -------------------------------------------------------------

test("linePoints spreads samples evenly across the width", () => {
  const pts = linePoints([0, 1, 2], { width: 100, height: 100, padX: 10, padTop: 10, padBottom: 10 });
  assert.equal(pts.length, 3);
  assert.equal(pts[0].x, 10); // first at left padding
  assert.equal(pts[2].x, 90); // last at right padding
  assert.equal(pts[1].x, 50); // middle centered
});

test("linePoints centers a single sample", () => {
  const pts = linePoints([7], { width: 120 });
  assert.equal(pts.length, 1);
  assert.equal(pts[0].x, 60);
});

test("linePoints maps larger values to smaller y (SVG y grows downward)", () => {
  const pts = linePoints([10, 20, 40], { height: 100 });
  assert.ok(pts[0].y > pts[1].y, "10 sits lower on screen than 20");
  assert.ok(pts[1].y > pts[2].y, "20 sits lower on screen than 40");
});

// --- barRects ---------------------------------------------------------------

test("barRects returns one rect per value with height proportional to value", () => {
  const rects = barRects([1, 2], { width: 100, height: 100, padX: 0, padTop: 0, padBottom: 0 });
  assert.equal(rects.length, 2);
  assert.ok(rects[1].height > rects[0].height);
  // Taller bar starts higher up (smaller y).
  assert.ok(rects[1].y < rects[0].y);
});

// --- pathData ---------------------------------------------------------------

test("pathData builds an M/L polyline path string", () => {
  assert.equal(pathData([{ x: 0, y: 0 }, { x: 10, y: 5 }]), "M 0 0 L 10 5");
});

// --- lineChartSvg (measurement progression / rolling average) ---------------

test("lineChartSvg with four points draws a polyline and four markers (SPEC AC #5)", () => {
  const svg = lineChartSvg({ values: [40, 42, 45, 48] });
  assert.match(svg, /<svg/);
  assert.equal(count(svg, "<circle"), 4, "one marker per measurement");
  assert.equal(count(svg, "<polyline"), 1, "a single connecting line");
});

test("lineChartSvg with a single point draws just the marker, no polyline", () => {
  const svg = lineChartSvg({ values: [40] });
  assert.equal(count(svg, "<circle"), 1);
  assert.equal(count(svg, "<polyline"), 0);
});

// --- barChartSvg (weekly totals / volume / completion) ----------------------

test("barChartSvg renders one bar rect per value", () => {
  const svg = barChartSvg({ values: [3, 6, 2] });
  assert.equal(count(svg, 'class="bar"'), 3);
});

test("barChartSvg draws a target tick per bar and reflects a mid-range target change", () => {
  // Counts [6, 3] against targets [6, 8] — the two ticks must sit at different
  // heights (SPEC target-at-the-time), proving both targets render.
  const svg = barChartSvg({ values: [6, 3], targets: [6, 8], height: 100 });
  assert.equal(count(svg, "target-tick"), 2);
  const ys = [...svg.matchAll(/target-tick"[^>]*\by1="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.equal(ys.length, 2);
  assert.notEqual(ys[0], ys[1], "different targets draw ticks at different heights");
  assert.ok(ys[1] < ys[0], "the higher target (8) sits higher on screen");
});

test("barChartSvg tolerates a null target (unscheduled day) without a tick", () => {
  const svg = barChartSvg({ values: [6, 0], targets: [6, null] });
  assert.equal(count(svg, "target-tick"), 1);
});

// --- heatmapSvg (binary calendar) -------------------------------------------

test("heatmapSvg renders one state-classed cell per day", () => {
  const days = [
    { date: "2026-06-07", state: "green" },
    { date: "2026-06-08", state: "red" },
    { date: "2026-06-09", state: "skip" },
  ];
  const svg = heatmapSvg({ days });
  assert.equal(count(svg, "<rect"), 3);
  assert.equal(count(svg, "hm-green"), 1);
  assert.equal(count(svg, "hm-red"), 1);
  assert.equal(count(svg, "hm-skip"), 1);
});

test("heatmapSvg places consecutive weeks in separate columns", () => {
  // Sat 2026-06-13 (week of Jun 7) then Sun 2026-06-14 (next week) → 2 columns.
  const days = [
    { date: "2026-06-13", state: "green" },
    { date: "2026-06-14", state: "green" },
  ];
  const svg = heatmapSvg({ days });
  const xs = [...svg.matchAll(/<rect[^>]*\bx="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.equal(new Set(xs).size, 2, "the two days land in different week columns");
});
