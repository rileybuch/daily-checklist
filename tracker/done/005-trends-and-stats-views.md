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

- [x] Selecting a **counter** habit renders: daily-sets-vs-target series, 7-day rolling average, weekly total, and volume (total + average per set) — each value verified against #002 outputs on a seeded fixture (DOM/data tested).
- [x] The counter daily-sets chart compares against the **target-at-the-time** (a fixture where the target changed mid-range shows both targets correctly) — tested.
- [x] Selecting a **binary** habit renders weekly completion % and a calendar heatmap reflecting seeded green/red/skip days — tested.
- [x] Selecting a **measurement** habit renders a progression line for its `measure` values in date order — tested. **SPEC AC #5:** four seeded "Pushup max" measurements render a progression line chart with four points.
- [x] Stats shows current streak, best streak, and 30/90-day completion % per active habit, matching #002 computations on a fixture; `skip` days are excluded from the completion denominator — tested.
- [x] A habit with no events renders "No data yet" (no error, no broken chart) — DOM tested.
- [x] No CDN chart lib is used — charts are hand-rolled inline SVG (resolves SPEC Open Question 1), so there is no CDN dependency to degrade and no build step is introduced. Numbers/stats render independently of any chart. (Verified: zero external `<script>`/CDN references; charts are pure SVG strings.)
- [x] `make unit-tests` passes with new tests, 0 failures.
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

### [SWE] 2026-07-09 16:20 — Implementation

**Chart-library decision (resolves SPEC Open Question 1)**
Charts are **hand-rolled inline SVG generated in vanilla JS** — no bundler, no CDN, no runtime dependency. The strict-static-files + no-build-step + offline (SPEC AC #6) constraints forbid a bundler and forbid a runtime CDN `<script>` (it would break offline and add a dependency the core shell must not carry). Chart geometry (points→coordinates, scales, paths, SVG markup) lives in a **pure** module (`app/js/views/charts/svg.js`) unit-tested under `node --test`; the DOM layer only injects the returned SVG strings via `innerHTML`. Colours live in CSS via state classes, so charts stay themeable.

**Architecture (mirrors #003/#004: pure model/geometry + thin DOM view)**
- New aggregations the charts need were added as pure tested functions **in the domain core** (`app/js/core/series.js`) — never computed ad-hoc in the view. They layer on #002 (`resolveTarget`, `counterDayCount`, `counterDayVolume`, `completionRate`) and add no new derivation rules. Streaks/completion for Stats come straight from #002 (`currentStreak`/`bestStreak`/`completionRate`); measurement progression from #002 `measureSeries`.
- Target-at-the-time (SPEC 5.3) is honoured because `counterDailySeries` resolves the target per date via #002 `resolveTarget` — a fixture whose target changes mid-range yields both targets (tested in core + surfaced as differing-height target ticks in the SVG, tested).

**Files modified**
- `app/js/core/series.js` — NEW. Pure trend aggregations: `counterDailySeries` (count + target-at-the-time per day), `counterVolumeSeries`, `rollingAverage`, `weeklyTotals`, `weeklyCompletionSeries`.
- `app/js/views/charts/svg.js` — NEW. Pure geometry (`yBounds`/`linePoints`/`barRects`/`pathData`) + SVG-string builders (`lineChartSvg`/`barChartSvg`/`heatmapSvg`). Zero deps.
- `app/js/views/trendsModel.js` — NEW. Pure descriptor builder: selects the chart set by habit `type`, fills each chart's series from core, flags empty state. `pickableHabits` for the picker.
- `app/js/views/statsModel.js` — NEW. Pure per-habit Stats rows (streaks + 30/90-day completion); measurement habits marked not-applicable (no daily state).
- `app/js/views/trends.js` — NEW. Thin DOM view: habit picker + inline-SVG injection + "No data yet" empty state.
- `app/js/views/stats.js` — NEW. Thin DOM view: one stat card per active habit.
- `app/css/trends.css` — NEW. Mobile-first styles for picker, chart cards, SVG classes, heatmap, stat cards (reuses today.css tokens).
- `app/js/app.js` — added Trends + Stats to the view nav and mount switch.
- `app/index.html` — link `css/trends.css`.
- `app/js/data/demoTransport.js` — enriched the `?demo=1` seed (anchor-relative 2-week history incl. four Pushup-max measurements) so every chart type is populated for the runtime/[HUMAN] demo. Additive; no test depends on the seed.
- Tests (NEW): `test/core/series.test.mjs`, `test/views/charts.test.mjs`, `test/views/trendsModel.test.mjs`, `test/views/statsModel.test.mjs`, `test/views/trends.test.mjs`, `test/views/stats.test.mjs`.

**Tests**
- Unit + DOM: 238 passing, 0 failing (`make unit-tests` / `make pre-commit`). New: 52 tests across the 6 new files.
- Integration: N/A — no infra changes (backend requires a live Google deploy).

**Acceptance criteria**
- [x] Counter charts (daily-vs-target, rolling avg, weekly total, volume total + avg-per-set) — `test/views/trendsModel.test.mjs`, `test/core/series.test.mjs`.
- [x] Target-at-the-time on a mid-range change — `test/core/series.test.mjs::counterDailySeries reports each day's ... target-at-the-time`, `test/views/charts.test.mjs::barChartSvg ... mid-range target change`.
- [x] Binary weekly completion + heatmap (green/red/skip) — `test/views/trendsModel.test.mjs`, `test/views/trends.test.mjs`.
- [x] Measurement progression in date order + **SPEC AC #5** four points — `test/views/trendsModel.test.mjs::measurement ...`, `test/views/charts.test.mjs::lineChartSvg with four points ...`, `test/views/trends.test.mjs::... four-point progression (SPEC AC #5)`.
- [x] Stats streaks + 30/90-day completion, skip excluded from denominator — `test/views/statsModel.test.mjs`, `test/views/stats.test.mjs`.
- [x] "No data yet" empty state — `test/views/trendsModel.test.mjs`, `test/views/trends.test.mjs`.
- [x] No CDN lib / no build step; numbers render independently — decision above; hand-rolled SVG.
- [x] `make unit-tests` passes, 0 failures.
- [ ] [HUMAN] On-device visual spot-check of the trends/charts (needs a phone + real logged data).

**Evidence**

```
$ make pre-commit
node --test
...
ℹ tests 238
ℹ pass 238
ℹ fail 0
```

Runtime smoke — drove the exact `?demo=1` seed (`createDemoTransport` bootstrap, 187 events) through the real `renderTrends`/`renderStats` via the fake-DOM shim:

```
?demo=1 bootstrap: 5 habits, 187 seed events
counter: 5 charts render inline SVG (daily-vs-target ticks + volume bars)  OK
binary: weekly completion + heatmap (green/skip cells) render  OK
measurement: AC #5 progression line draws with 4 points + 1 polyline  OK
stats: Pushups [streak,best,30d,90d] = ["0","2","27%","9%"]
stats: Bible  [streak,best,30d,90d] = ["6","6","41%","13%"]
stats: measurement card renders dashes  OK
ALL ?demo=1 SMOKE CHECKS PASSED
```

**Notes**
- The `?demo=1` 30/90-day completion %s read low because the demo rules schedule habits daily since 2026-01-01 while the seeded history is only ~2 weeks; the pre-history days are honest scheduled misses per the locked #002 `completionRate`. Not a bug — the [HUMAN] check is against real data. Left the demo rules untouched to avoid scope creep.
- Design note for the Tester/PM: a binary habit's first partial week (and its heatmap's leading Sunday) can include scheduled days *before* the habit's first event as misses, because `completionRate`/`binaryDayState` judge every scheduled past day. This is consistent with the #002 semantics and is asserted in `trendsModel.test.mjs` (week-of-7/5 rate = 1/3). Flagging in case the PM wants a "floor at first event" follow-up.
- Measurement habits are excluded from streak/completion Stats (rendered as "—") because they have no daily pass/fail state per SPEC Section 3. They still get the progression chart in Trends.
- NOT RUN: on-device browser visual check ([HUMAN]) — requires a phone; smoke above verifies the same render path headlessly.

### [Tester] 2026-07-09 17:10 — QA

**Test summary**
- Format / lint / pre-commit: PASS (`make format-check`/`lint-check` are documented no-ops for this no-build static stack; `make pre-commit` runs `node --test`)
- Unit tests: 238 passed / 0 failed
- Integration tests: N/A (documented — backend needs a live Google deploy)
- Warnings: 0

**E2E adversarial pass** (drove the real `?demo=1` `createDemoTransport` bootstrap — 5 habits / 187 events — through real `renderTrends`/`renderStats` via the fake-DOM shim, plus an independent hand-checked math script; both scripts written by me, not the SWE)
- Happy path: Trends counter (Pushups) → 5 chart cards, every `.chart-canvas` emits `<svg>`, no NaN (PASS). Binary (Bible Study) → heatmap + weekly completion, no NaN (PASS). Measurement (Pushup max) → 4 `<circle>` + 1 `<polyline>` (PASS). wall_sits seconds-counter → volume + avg-per-set (PASS). Stats → 5 cards, measurement card renders `—,—,—,—` (PASS).
- Break 1 (boundary: zero-event habit): `renderTrends` on an events=[] habit → `.chart-card` count 0, `.empty` = "No data yet", no crash/NaN (PASS).
- Break 2 (degenerate: 1-point measurement): single `measure` event → 1 `<circle>`, 0 `<polyline>`, no NaN (PASS).
- Break 3 (state edge: target changed mid-history): rule 6→3 across the range → `counterDaily.targets` shows 6 on the old date and 3 on the new date; bar SVG draws target ticks at ≥2 distinct heights. Confirms target-at-the-time uses the historical target per date, not today's (PASS).
- Break 4 (state edge: binary with only skips): heatmap renders `hm-skip` cells, Stats renders `["0","0","0%","0%"]` — completion denominator of 0 yields 0%, no NaN/crash (PASS).
- Break 5 (large inputs): billion/trillion-scale counts → finite bar+line geometry, no NaN/Infinity in path strings (PASS).
- Purity/degenerate geometry: `yBounds([])`→{0,1}; flat/all-equal series padded so span≠0; empty bar/line/heatmap SVG all finite; all-zero bars emit `height="0"` not NaN (PASS).

**Independent math re-derivation** (my own fixtures, hand-computed, not reusing SWE fixtures)
- `rollingAverage` trailing means with a shrinking leading window — matches by hand.
- `weeklyTotals` Sun–Sat bucketing — matches by hand.
- `completionRate` with skip+pending excluded → 1.0; one injected miss → 2/3.
- `currentStreak`/`bestStreak` carry across a skip (=3), break on a miss (=1).
- AC #5: 4 out-of-order `measure` events → sorted ascending [40,42,45,48], upward line (rising values → falling y).

**Offline-safety / no-CDN (AC #7)**: grepped entire `app/` + `index.html` — the only `<script>` is the local `js/app.js` module; only `https://` string is the fake `demo.local/exec` base URL (not a fetched resource). Zero CDN/`unpkg`/`jsdelivr`/`chart.js`/`uplot`/`d3` references. Charts are pure SVG strings. Confirmed.

**Acceptance criteria**
- [x] PASS — Counter charts (daily-vs-target, 7-day rolling avg, weekly total, volume total + avg-per-set) — verified vs #002 outputs in my independent script; runtime smoke shows 5 cards.
- [x] PASS — Counter daily-sets uses target-at-the-time on a mid-range change — Break 3, hand-checked (targets 6 then 3 per date).
- [x] PASS — Binary weekly completion % + green/red/skip heatmap — runtime smoke (Bible Study heatmap has `hm-green`+`hm-skip`).
- [x] PASS — Measurement progression in date order + SPEC AC #5 four points — 4 `<circle>`+1 `<polyline>` from both the demo seed and my own out-of-order fixture.
- [x] PASS — Stats current/best streak + 30/90-day completion, skip excluded from denominator — independent hand-check + runtime smoke.
- [x] PASS — Zero-event habit → "No data yet", no error/broken chart — Break 1.
- [x] PASS — No CDN chart lib; hand-rolled inline SVG; numbers render independently — grep evidence above.
- [x] PASS — `make unit-tests` passes, 0 failures — 238/0.
- [ ] [HUMAN] On-device visual spot-check — Awaiting human verification (requires a phone; headless render path verified green).

**Evidence**
```
$ make pre-commit
node --test
ℹ tests 238
ℹ pass 238
ℹ fail 0

$ node verify.mjs        # my independent hand-checked math
ALL INDEPENDENT VERIFICATIONS PASSED   (14 checks incl. AC#5 + target-at-the-time)

$ node smoke2.mjs        # my runtime smoke over real ?demo=1 + break paths
?demo=1 bootstrap: 5 habits, 187 events
ALL RUNTIME SMOKE + BREAK PATHS PASSED (9 checks)
```

**Other issues found**
- No stray `console.*`/`debugger`/`alert` in the new library code; diff is scoped (only #005 files + tracker).
- CONFIRMED (not a bug): the SWE-flagged behavior — a fixed 30/90-day window (or a binary habit's first partial week / leading heatmap Sunday) counts scheduled days *before* the habit's first event as misses, because `completionRate`/`binaryDayState` judge every scheduled past day. I reproduced it (3/28 over a pre-history window) and confirm it is consistent with the **locked #002** `completionRate` semantics, not a #005 defect. A "floor completion at first event" would be a separate #002 change — worth a PM follow-up but out of scope here.

**VERDICT: PASS**
