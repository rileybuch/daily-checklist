# Trends & Stats Views (M4)

Status: pending
Tags: `ui`
Depends on: #002, #003
Blocks: —

## Scope

Implement SPEC Milestone 4 — the **Trends** (per-habit charts) and **Stats** (per-habit summary numbers) views. All numbers come from the domain core (#002); this task is presentation + charting over that data. Plain static ES modules, no build step, mobile-first.

**Charting decision (SPEC Open Question 1):** choose hand-rolled SVG **or** a CDN charting lib (uPlot/Chart.js via `<script>` tag) — but **no build step and no bundler** either way. If a CDN lib is used it must be referenced by `<script>`/CDN URL, degrade gracefully if the CDN is unreachable (charts optional, numbers still render), and not become a runtime dependency of the core app shell. Document the choice in a short comment/README note. Prefer the simplest option that satisfies the charts below (hand-rolled SVG is acceptable and dependency-free).

**Trends (per habit, SPEC Section 5 view 3):**
- **Binary:** completion % by week (bar or line) + a calendar heatmap of green/red/skip days.
- **Counter:** daily sets vs. the **target-at-the-time** (uses #002 `resolveTarget` per date, so historical targets are respected), a 7-day rolling average of daily sets, and a weekly total. Plus **volume trends** from per-set values: total reps/seconds per day and average per set (from #002 `counterDayVolume`).
- **Measurement:** value over time — the test-day max progression line chart (from #002 `measureSeries`).
- A habit picker selects which habit's trends to show; the chart set shown depends on the habit's `type`.

**Stats (per habit, SPEC Section 5 view 4):**
- Current streak, best streak, and completion % over the last **30** and **90** days, with `skip` days excluded from the denominator (from #002 `currentStreak`/`bestStreak`/`completionRate`).
- Rendered as a compact per-habit summary (one card/row per active habit).

**Empty states:** a habit with no events yet shows "No data yet" rather than a broken/empty chart; a measurement habit with fewer than 2 points shows the point(s) without erroring.

## Acceptance Criteria

- [ ] Selecting a **counter** habit renders: daily-sets-vs-target series, 7-day rolling average, weekly total, and volume (total + average per set) — each value verified against #002 outputs on a seeded fixture (DOM/data tested).
- [ ] The counter daily-sets chart compares against the **target-at-the-time** (a fixture where the target changed mid-range shows both targets correctly) — tested.
- [ ] Selecting a **binary** habit renders weekly completion % and a calendar heatmap reflecting seeded green/red/skip days — tested.
- [ ] Selecting a **measurement** habit renders a progression line for its `measure` values in date order — tested. **SPEC AC #5:** four seeded "Pushup max" measurements render a progression line chart with four points.
- [ ] Stats shows current streak, best streak, and 30/90-day completion % per active habit, matching #002 computations on a fixture; `skip` days are excluded from the completion denominator — tested.
- [ ] A habit with no events renders "No data yet" (no error, no broken chart) — DOM tested.
- [ ] If a CDN chart lib is used, the app still renders numbers/stats when the CDN is blocked (charts degrade gracefully) — tested or documented as verified; no build step is introduced.
- [ ] `make unit-tests` passes with new tests, 0 failures.
- [ ] [HUMAN] Visual spot-check on the phone: the counter volume and rolling-average trends look sensible for real logged data, and the Pushup-max progression chart reads as a clear upward line over test days.

## User Stories

### Story: Riley checks whether his pushup volume is trending up
1. Riley opens Trends and picks Pushups.
2. He sees daily sets vs. his target-at-the-time, a 7-day rolling average line, this week's total, and a per-day volume (total reps) chart.
3. The rolling average reflects the last 7 days of logged sets.

### Story: Riley views his tested-max progression (SPEC AC #5)
1. Riley picks the "Pushup max" measurement habit in Trends.
2. A line chart plots his four recorded max values in date order.
3. The line reads as his progression across test days.

### Story: Riley checks his Bible Study streak
1. Riley opens Stats.
2. The Bible Study card shows current streak, best streak, and 30/90-day completion %.
3. A week containing a skip does not lower the completion % (skip excluded from the denominator).

### Story: A brand-new habit shows no misleading chart
1. Riley adds a new habit and opens its Trends before logging anything.
2. Instead of a broken/empty chart, he sees "No data yet".

---

Blocked by: #002, #003

## Log

### [PM] 2026-07-08 12:25 — Grooming

**Summary**
SPEC M4 — Trends (per-habit charts: binary completion %/heatmap, counter sets-vs-target-at-the-time + rolling average + weekly total + per-set volume, measurement progression line) and Stats (current/best streak, 30/90-day completion % with skips excluded). Presentation over the #002 domain core. Reaches SPEC AC #5.

**Key decisions**
- Resolves SPEC Open Question 1 by leaving the chart-lib-vs-hand-rolled-SVG choice to the SWE but constraining it hard: no build step, no bundler, CDN libs must degrade gracefully; hand-rolled SVG is the dependency-free default.
- Counter trends compare against target-at-the-time via #002 `resolveTarget`, honoring SPEC's historical-target semantics — pinned by a fixture where the target changes mid-range.
- All stats numbers come from #002 so they're already unit-proven; this task verifies rendering + empty states.

**Dependencies**
- #002 — all series and stat computations.
- #003 — app shell, navigation, and cached data.

**User stories**
- 4 stories: pushup volume trend, measurement progression (AC #5), streak stats with skip exclusion, empty-state for a new habit.

**Open questions**
- None — chart library choice explicitly delegated to SWE within the no-build-step constraint.

Ready for implementation.
