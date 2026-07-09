# Week Grid & Backfill Navigation (M3)

Status: pending
Tags: `ui`
Depends on: #002, #003
Blocks: —

## Scope

Implement SPEC Milestone 3 — the Way of Life–style **week grid** with week paging. Reuses the domain core (#002) for target resolution and day-state derivation, and the app shell + data layer (#003) for events/config. Plain static ES modules, no build step, mobile-first.

Per SPEC Section 5 view 2:
- **Layout:** rows = habits (ordered by `sort_order`), columns = **Sun–Sat** of the selected week (week starts Sunday, SPEC-locked). A header row labels the seven day columns with dates.
- **Binary cells:** green (checked) / red (missed: scheduled, past, no check) / gray-hatched (`skip`) / light gray (unscheduled or future). Driven by #002 `binaryDayState`.
- **Counter cells:** show `n/target`; colored **green** when the target is met (count ≥ target, or a `target=0` rest), **amber** when partial (0 < count < target), **red** when 0 on a scheduled past day. Driven by #002 `counterDayState` + `counterDayCount` + `resolveTarget`. A `target=0` scheduled-rest cell reads as a rest (e.g. "rest" / neutral), never red.
- **Measurement rows:** measurements have no daily state; render neutral cells (e.g. a dot when a `measure` exists that day, blank otherwise) — never red.
- **Navigation:** swipe and/or on-screen arrows page to the previous/next week; the current week is the default. Future weeks render as light-gray/unscheduled (no red). A visible label shows which week is displayed (date range).
- **Backfill affordance:** tapping a past binary cell (or a counter cell) navigates to / opens the Today view for that date so Riley can edit it (reuse #003's date-switch; no new logging UI needed in the grid itself). At minimum, the grid must let Riley reach a past day for editing.

## Acceptance Criteria

- [x] The grid renders one row per active habit (ordered by `sort_order`) and seven columns Sun–Sat with correct date headers for the selected week — DOM tested.
- [x] Binary cells show green/red/hatched-skip/light-gray correctly for a seeded week of events — DOM tested against a fixture.
- [x] Counter cells show `n/target` with green (met), amber (partial), red (0 on scheduled past day) coloring — DOM tested for each color.
- [x] A `target=0` scheduled-rest cell renders as a rest and is never red — DOM tested.
- [x] Future days and unscheduled days render light-gray and are never red — DOM tested.
- [x] Paging arrows/swipe move to the previous and next week and re-render with that week's schedule and events; the week label updates — DOM tested.
- [x] Tapping a past cell lets Riley reach that date's editable Today view (backfill path) — DOM/integration tested.
- [x] Measurement rows render neutral cells (dot on measure days, blank otherwise), never red — DOM tested.
- [x] `make unit-tests` passes with new grid tests, 0 failures.
- [ ] [HUMAN] **SPEC AC #3 (visual):** with Riley's GTG `target_rules` loaded, the week grid for Weeks 1 and 2 visually matches the printed 8-week calendar — Mon–Fri 6 (wall-sits 4), alternating Sat 3/0 (wall-sits 2/0), Sun rest — confirmed by eye against the printout.

## User Stories

### Story: Riley reviews his week at a glance
1. Riley opens the Week grid; rows list Pushups, Pullups, Squats, Wall-sits, Bible Study in sort order.
2. Columns are Sun–Sat with the current week's dates.
3. Mon–Fri Pushups cells that hit 6 sets are green; a day with 3/6 is amber; a scheduled past day with 0 is red; Sunday reads as rest (neutral, not red).

### Story: Riley pages back to last week
1. Riley taps the left arrow (or swipes right).
2. The grid re-renders with last week's Sun–Sat dates and that week's states; the week label updates to the prior date range.
3. He taps the right arrow to return to the current week.

### Story: Riley notices a missed day and fixes it
1. Riley sees a red Bible Study cell on Tuesday.
2. He taps it and lands on Tuesday's Today view.
3. He toggles Bible Study green; returning to the grid, Tuesday now reads green.

### Story: [HUMAN] The grid matches the printed calendar
1. Riley loads his real GTG rules and opens Week 1 in the grid.
2. He compares each habit row's targets to the printed 8-week calendar's Week 1.
3. Week 1 and Week 2 (opposite Saturday parity) match the paper exactly.

---

Blocked by: #002, #003

## Log

### [PM] 2026-07-08 12:20 — Grooming

**Summary**
SPEC M3 — the Way of Life–style Sun–Sat week grid with binary color states, counter `n/target` coloring, scheduled-rest handling, week paging, and a backfill path into the Today view for past days. All coloring/derivation comes from the #002 domain core.

**Key decisions**
- No new derivation logic — the grid is a pure presentation over #002; this keeps AC #3's "matches the printed calendar" resting on already-proven target resolution, with the final visual match as a `[HUMAN]` check.
- Backfill reuses #003's date-switch Today view rather than adding logging UI inside grid cells (simplest thing that works).

**Dependencies**
- #002 — target resolution + day-state derivation for every cell.
- #003 — app shell, data layer (events/config), and the date-switch Today view used for backfill.

**User stories**
- 4 stories: week-at-a-glance, page back a week, fix a missed day via backfill, and the [HUMAN] printed-calendar match.

Ready for implementation.

### [SWE] 2026-07-09 09:20 — Implementation

**Files created**
- `app/js/views/weekModel.js` — pure Week-grid view-model (`buildWeekGrid`); projects the #002 domain core (`resolveTarget`, `binaryDayState`, `counterDayState`, `counterDayCount`, `measureSeries`) into per-cell descriptors (state, `n/target`/`rest` text, editable flag) + Sun–Sat headers and the week label. No DOM.
- `app/js/views/week.js` — thin DOM renderer (`renderWeek`); paints the matrix, wires the prev/next paging arrows + the label "jump to current week", and the backfill tap that calls `onOpenDate(iso)`. Mirrors the today.js split.
- `app/css/week.css` — grid + view-switcher styles (green/amber/red/hatched-skip/rest/light-gray cell states); reuses today.css tokens. `today.css` left untouched.
- `test/views/weekModel.test.mjs` — 14 model unit tests (rows/order/headers/label, binary states, counter colours, rest, future/unscheduled, measurement dots, editable, prev/next paging incl. odd-parity Saturday flip).
- `test/views/week.test.mjs` — 11 DOM tests through a fake-DOM shim (headers, rows, cell colours/text, rest, measurement dot, label, paging, future non-editable divs, backfill tap, backfill→green re-render).
- `test/helpers/domStub.mjs` — dependency-free `document`/element shim (createElement, className/textContent, appendChild, setAttribute, style, addEventListener + click, innerHTML reset, querySelector[All]).

**Files modified**
- `app/js/controllers/todayController.js` — added read-only `getRules()` / `getEvents()` getters so the Week grid reuses the same optimistic event list (no data-layer fork).
- `app/js/app.js` — integrated the grid as a second view: a Today/Week nav bar + `viewRoot`; the Week view's `onOpenDate` switches to Today at that date (backfill). Shell not forked — same controller, queue, sync, flush.
- `app/index.html` — linked `css/week.css`.

**Reuse (per constraints)**
- All cell day-states/targets come from #002 (`app/js/core/`) — no derivation or target logic reimplemented; a `target=0` scheduled rest is surfaced as its own `rest` state (never red).
- Backfill reuses #003's `controller.setDate(...)` + Today view — the grid adds no logging UI.
- No build step, zero runtime/test dependencies, vanilla ES modules.

**Tests**
- Unit: 186 passing, 0 failing — `make pre-commit` / `make unit-tests` (`node --test`). 25 new (14 model + 11 DOM).
- Integration: N/A — no backend/infra changes (live Google path stays [HUMAN]).

**Acceptance criteria**
- [x] rows per active habit, Sun–Sat headers/dates — `test/views/weekModel.test.mjs` + `test/views/week.test.mjs`
- [x] binary green/red/hatched-skip/light-gray — both suites
- [x] counter `n/target` green/amber/red — `week.test.mjs::counter cells render n/target...`
- [x] `target=0` rest, never red — both suites
- [x] future/unscheduled light-gray, never red — both suites
- [x] paging prev/next, label updates — both suites
- [x] backfill tap reaches the date's Today view — `week.test.mjs::tapping a past cell...` + `...backfilling then re-rendering...`
- [x] measurement neutral (dot/blank), never red — both suites
- [x] `make unit-tests` green (186/0)
- [ ] [HUMAN] SPEC AC #3 (visual): with Riley's real GTG `target_rules` loaded, Weeks 1 & 2 match the printed 8-week calendar by eye. NOT RUN — requires the live Google Sheet / on-device render; the demo seeds all-daily rules (not GTG), so the rest/alt-Saturday structure is proven by the GTG-fixture tests, not by the demo. Runbook: open `?demo=1` after loading real GTG rules (or point at the live backend), page to Weeks 1–2, compare each row's targets to the printout (Mon–Fri 6 / wall-sits 4; alt-Sat 3/0, wall-sits 2/0; Sun rest).

**Evidence**
```
$ make pre-commit
node --test
... ✔ (all suites) ...
ℹ tests 186
ℹ pass 186
ℹ fail 0
```
Runtime smoke (headless, real `?demo=1` data path: demoTransport → apiClient.bootstrap → todayController → renderWeek):
```
--- current week: This week · Jul 5 – 11 ---
               Sun5    Mon6    Tue7    Wed8    Thu9   Fri10   Sat11
Pushups     0/6/red 0/6/red 0/6/red 0/6/red 2/6/amber  ·/pending  ·/pending
Bible Study   ·/red   ·/red   ·/red   ·/red   ·/pending  ·/pending  ·/pending
Pushup max  ·/measurement (all week, neutral)
--- after tap prev-week arrow: Jun 28 – Jul 4 --- (all past → red)
Monday pushups cell: <BUTTON> editable=true
onOpenDate captured: ["2026-07-06"]
```
(Two sets logged "today" render `2/6` amber; past days red; today/future pending; paging + backfill tap verified.)

**Notes**
- Did NOT modify `app/js/data/demoTransport.js` (it is #003's, seeds all-daily rules). Consequence: the `?demo=1` grid shows Sundays as `0/6` red rather than a rest, because the demo has no Sunday-rest rule. Rest/alt-Saturday rendering is fully covered by the GTG-fixture unit + DOM tests. If a GTG-shaped demo is wanted for the [HUMAN] eyeball check without the live backend, that's a small follow-up on the demo seeds.
- No architectural forks encountered; grid is pure presentation over #002 as groomed.

### [Tester] 2026-07-09 13:52 — QA

**Test summary**
- Format / lint / pre-commit: PASS (`make pre-commit` → `node --test`, no formatter/linter configured for the static stack)
- Unit tests: 186 passed / 0 failed (25 new: 14 model + 11 DOM)
- Integration tests: N/A (no backend; `make integration-tests` is a documented no-op)
- Warnings: 0

**E2E adversarial pass** (independent script feeding the GTG `target_rules` fixture straight into `buildWeekGrid` — 40 assertions, all green after a self-inflicted fixture correction; see below)
- Happy path (CRUX — full GTG state/label matrix, seeded week Sun 07-05..Sat 07-11): every cell verified against the #002 core — Sun target-0 → `rest`/"rest" (not red); Mon 6/6 green; Tue 3/6 amber; Wed 0/6 red; Thu 6/6 green; Fri 1/6 amber; even-Sat 3/3 green; wall_sits distinct targets (Mon 0/4 red, even-Sat 0/2, Sun rest); binary Mon green / Tue skip / Wed red / Sun (daily) red. PASS
- target=0 → REST claim: proven via GTG rule directly (even Sunday AND odd-parity Saturday), even with a stray set logged on the rest day → still `rest`, never red/green-by-count. PASS. Confirms the SWE's demo-Sunday note is purely `demoTransport` all-daily seed data (verified in `app/js/data/demoTransport.js::seedRules` — no Sunday-rest rule), NOT a grid mishandling of target=0.
- Break 1 (boundary: month boundary, Jun 28 – Jul 4): dates cross month, dayNum resets 28→4, label correct. PASS
- Break 2 (boundary: year boundary, Dec 27 2026 – Jan 2 2027): dates + label cross year correctly. PASS
- Break 3 (state edge: far future, 52 weeks ahead): NO red anywhere; counter cells pending with empty display; binary pending; all cells non-editable. PASS
- Break 4 (state edge: far past): with in-scope rules (effective_from 2020), Sunday=rest, Mon–Fri red, no spurious red on rest, no crash, label sane. PASS. (Note: with GTG rules effective 2026, a 2025 week correctly returns `unscheduled` — never red — which is the desired pre-schedule behavior.)
- Break 5 (state edge: habit created mid-week / rule `effective_from` mid-week): days before effective_from → `unscheduled` (not red); on/after → red as scheduled. PASS. Scheduling is entirely rule-driven; `created_at` is intentionally unused (correct per SPEC §3).
- Break 6 (archived habit, active:false): excluded from rows; did not usurp the sort_order-0 slot. PASS
- Break 7 (malformed/empty: habit with zero rules): all 7 cells `unscheduled`, none red, empty display. PASS
- Break 8 (spec-intent: future-day backfill): future cells are non-editable `<div>`s (no click handler) → future days cannot fire `onOpenDate`; past/today cells are `<button>`s. Future days are never presented as backfillable failures. PASS — matches SPEC 5.2 intent.
- Break 9 (boundary: today itself, 0 sets): counter today → `pending` (editable), never red; `isToday` flag set. PASS

**Acceptance criteria**
- [x] PASS — rows per active habit, ordered by sort_order; 7 Sun–Sat headers with dates — `weekModel.test.mjs::one row per active habit...` + `::seven Sun–Sat day headers...`; my script confirms header dates/labels/dayNums across normal, month- and year-boundary weeks.
- [x] PASS — binary green/red/hatched-skip/light-gray — `week.test.mjs::binary cells render green / skip / red`; my matrix confirms green/skip/red + unscheduled light-gray.
- [x] PASS — counter n/target green/amber/red — `week.test.mjs::counter cells render n/target...`; my matrix confirms 6/6 green, 3/6 amber, 0/6 red, 1/6 amber, plus wall_sits distinct 4/2 targets.
- [x] PASS — target=0 rest, never red — `weekModel.test.mjs` + `week.test.mjs`; independently proven via GTG even-Sun AND odd-Sat parity rule, robust to a stray logged set.
- [x] PASS — future/unscheduled light-gray, never red — far-future break path: zero red cells across all rows; unscheduled + zero-rule habits also never red.
- [x] PASS — paging prev/next, label updates — `week.test.mjs::paging back re-renders...`; model paging + label verified across month/year boundaries.
- [x] PASS — backfill tap reaches the date's Today view — `week.test.mjs::tapping a past cell invokes onOpenDate` + `::backfilling then re-rendering reflects the new event`; `app.js` wires `onOpenDate → controller.setDate(iso) + switchView("today")`.
- [x] PASS — measurement neutral (dot/blank), never red — `week.test.mjs::measurement cells show a dot...`; my matrix confirms `state==="measurement"`, hasMeasure dot logic.
- [x] PASS — `make unit-tests` green — 186 passed / 0 failed.
- [ ] [HUMAN] SPEC AC #3 (visual match to printed calendar) — Awaiting human verification. The underlying target logic (which drives the visual) is independently proven correct against the GTG fixture here; the remaining gap is the pixel/eyeball match on-device, which requires the live Sheet or a GTG-shaped demo seed.

**Evidence**
```
$ make pre-commit
node --test
ℹ tests 186
ℹ pass 186
ℹ fail 0

$ node adversarial.mjs   # independent GTG-fixture harness
==== 40 assertions passed ====
(2 initial fixture-error lines corrected: 2025 week under 2026-effective rules
 → 'unscheduled', which is correct/never-red; re-run with 2020-effective rules
 confirms far-past rest/red logic.)
```

**Other issues found**
- Cosmetic demo-data gap (SWE-flagged, confirmed non-blocking): `?demo=1` seeds all-daily rules so demo Sundays render `0/6` red instead of rest. This is `demoTransport` seed data, not a grid defect — proven above. Worth a small follow-up (GTG-shaped demo seed) so the [HUMAN] visual check is possible without the live backend. Does not affect any AC.
- `created_at` is not consulted by the grid; scheduling is fully rule-driven (correct per SPEC §3). No action needed.

**VERDICT: PASS**
