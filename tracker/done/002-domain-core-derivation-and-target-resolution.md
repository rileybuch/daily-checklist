# Domain Core: Derivation & Target Resolution

Status: pending
Tags: `data`, `core`
Depends on: #000
Blocks: #003, #004, #005, #006

## Scope

Implement the pure, framework-free JavaScript module that turns raw `habits` + `target_rules` + `events` into the derived state every view needs. This is the heart of the app — SPEC AC #3 (schedule expressible / week grid matches the printed calendar) and AC #4 (streak math matches hand computation) are proven here. **No DOM, no fetch, no Google globals** — pure functions only, exhaustively unit-tested. Later view tasks import this module.

Location: `app/js/core/` (ES modules importable both by `node --test` and by the browser via `<script type="module">` — no build step). Split into files by concern (e.g. `targets.js`, `derive.js`, `stats.js`, `dates.js`) at the SWE's discretion.

Implement per SPEC Section 3 "Resolution" and "Derivation rules":

**Date & week helpers (`dates.js`):**
- `weekStart(date)` → the Sunday of that date's week (weeks run Sun–Sat, SPEC-locked).
- `weekIndex(date, anchorDate)` → integer count of weeks elapsed since `anchor_date` (used for parity).
- `weekParity(date, anchorDate)` → `"even"` | `"odd"`.
- `dayOfWeek(date)` → `"sun".."sat"`.
- All operate on ISO date strings (`YYYY-MM-DD`), local-time semantics, no timezone surprises (do not use `Date` UTC parsing pitfalls — parse components explicitly).

**Target resolution (`targets.js`):**
- `resolveTarget(habitId, date, rules, config)` → `{ target: int, scheduled: bool }`.
- In-scope rules: `effective_from <= date <= effective_to` (blank `effective_to` = open-ended).
- Match on `days` (exact day beats `*`) and `week_parity` (parity match beats `*`).
- **Most-specific wins**, then newest `effective_from` breaks ties (SPEC Section 3).
- No matching rule → `{ scheduled: false }` (habit shown gray, excluded from streaks).
- `target = 0` → scheduled rest (`scheduled: true, target: 0`), NOT a failure.

**Event derivation (`derive.js`):**
- `voidedEventIds(events)` → set of `event_id`s that have a non-voided `undo` pointing at them (respect `kind:"undo"` + `undo_of`).
- `counterDayCount(habitId, date, events)` → number of non-voided `set` events for that habit/date (this is the count judged against the target **in sets**).
- `counterDayVolume(habitId, date, events)` → `{ totalValue, setCount, avgValue }` from non-voided `set` values (reps or seconds — for trends, not target completion).
- `binaryDayState(habitId, date, events, resolved, today)` → one of `"green"` (checked), `"red"` (missed: scheduled + past + no check), `"skip"` (hatched), `"pending"` (today, no event), `"unscheduled"`. Uses the **last non-voided** `check`/`uncheck`/`skip` event for the date.
- `counterDayState(habitId, date, events, resolved, today)` → `"green"` (count ≥ target > 0, or target 0 rest), `"amber"` (0 < count < target), `"red"` (0 on a scheduled past day, target > 0), `"pending"` (today), `"unscheduled"`.
- `measureSeries(habitId, events)` → `[{date, value}]` sorted by date from non-voided `measure` events.

**Stats (`stats.js`):**
- `currentStreak(habitId, asOfDate, ...)` and `bestStreak(habitId, ...)` — consecutive completed scheduled days; `skip` days are neutral (neither break nor extend? follow SPEC: skips excluded from denominators and from streak breaks — treat skip as not breaking the streak but not counting as a completed day either — document the exact chosen semantics in the docstring and test them).
- `completionRate(habitId, fromDate, toDate, ...)` → completed scheduled days / (scheduled days − skipped days); skips excluded from the denominator (SPEC Section 5 Stats + Section 3).

## Acceptance Criteria

- [x] `weekParity` and `weekIndex` correctly alternate week-to-week from a given `anchor_date`; a test seeds an anchor and asserts parity for 6 consecutive weeks.
- [x] `resolveTarget` implements most-specific-wins: given a `days=*` rule and a `days=sat` rule both in scope for a Saturday, the `sat` rule's target is returned — unit-tested.
- [x] `resolveTarget` implements parity: alternating-Saturday rules (`sat`+`even`→3, `sat`+`odd`→0) return the correct target for consecutive Saturdays — unit-tested.
- [x] `resolveTarget` implements newest-`effective_from` tie-break: after Riley adds a rule with a later `effective_from`, dates on/after it use the new target while earlier dates still use the old one — unit-tested.
- [x] A habit/date with no matching rule returns `{ scheduled: false }` — unit-tested.
- [x] **SPEC AC #3:** Riley's full GTG schedule is expressed as `target_rules` fixtures — Pushups/Pullups/Squats: Mon–Fri 6, alt-Sat 3/0, Sun 0; Wall-sits: Mon–Fri 4, alt-Sat 2/0, Sun 0 — and `resolveTarget` returns those exact targets across a two-week span (Weeks 1–2). A test asserts the full 14-day target vector per habit.
- [x] `counterDayCount` counts only non-voided `set` events; an `undo` of a set reduces the count by one — unit-tested.
- [x] `counterDayVolume` returns correct total, count, and average from per-set reps/seconds values — unit-tested.
- [x] `binaryDayState` returns `green`/`red`/`skip`/`pending`/`unscheduled` correctly, using the last non-voided event for the date — unit-tested for each state.
- [x] **SPEC AC #4:** a seeded week of Bible Study binary events produces the expected green/red/skip day states AND `currentStreak`/`bestStreak` match a hand-computed value stated in the test — unit-tested.
- [x] `completionRate` excludes `skip` days from the denominator — unit-tested with a week containing a skip.
- [x] `measureSeries` returns `measure` values sorted by date (drives the progression chart) — unit-tested.
- [x] The module imports no DOM, no `fetch`, no Google globals; it runs identically under `node --test` and in the browser as an ES module.
- [x] `make unit-tests` passes with all core tests, 0 failures.

## User Stories

### Story: The week grid asks "what was Pushups' target on this Saturday?"
1. A view calls `resolveTarget("pushups", "2026-07-11", rules, config)` (a Saturday in an even parity week).
2. The rules contain `sat`+`even`→3 and `sat`+`odd`→0 and `*`→6.
3. The function returns `{ target: 3, scheduled: true }` (the `sat` rule beats `*`, the `even` parity matches).
4. For the following Saturday `2026-07-18` (odd week) it returns `{ target: 0, scheduled: true }` — a scheduled rest, not a failure.

### Story: Riley records a test day and updates his target going forward
1. Old rule: Pushups Mon–Fri target 6, `effective_from` 2026-06-01, open-ended.
2. Riley adds a rule: Pushups Mon–Fri target 8, `effective_from` 2026-07-09.
3. `resolveTarget("pushups","2026-07-08",...)` returns 6; `resolveTarget("pushups","2026-07-09",...)` returns 8.
4. History before the change is still judged against 6.

### Story: Streak math matches hand computation for Bible Study
1. A test seeds a week of Bible Study events: checked Sun–Wed, skip Thu, checked Fri, no event Sat (past) → red.
2. `binaryDayState` yields green,green,green,green,skip,green,red for Sun–Sat.
3. `currentStreak` and `bestStreak` equal the hand-computed values asserted in the test, with the Thu skip not breaking the streak and not counting toward it.

### Story: An undo removes a counter set from the day's count
1. A test seeds three `set` events for Pushups on a date, then one `undo` voiding the third.
2. `counterDayCount` returns 2.
3. `counterDayVolume.setCount` is 2 and the average reflects only the two remaining sets.

---

Blocked by: #000

## Log

### [PM] 2026-07-08 12:10 — Grooming

**Summary**
The pure domain core: date/week-parity helpers, `target_rules` resolution (most-specific-wins + parity + newest-effective_from tie-break), event derivation (counter counts/volume, binary/counter day states, undo handling, measure series), and streak/completion stats. Framework-free ES modules, exhaustively unit-tested, importable by both `node --test` and the browser.

**Key decisions**
- Extracted as its own foundational task (not folded into the Today view) because it underpins M2–M5 and carries the two highest-risk acceptance criteria (AC #3 schedule expressiveness, AC #4 streak math). Testing it in isolation is far cheaper and more reliable than through the UI.
- ES modules with explicit component-wise ISO date parsing to avoid timezone pitfalls; no build step, so the same files load in the browser.
- SPEC AC #3 and #4 are pinned directly to unit-test fixtures here (14-day target vectors; hand-computed streaks) so downstream view tasks can rely on proven logic.

**Dependencies**
- #000 — needs the repo skeleton and `node --test` harness.

**User stories**
- 4 stories: Saturday parity resolution, forward-dated target change, Bible Study streak math, undo reducing a counter count.

**Open questions**
- Exact skip-vs-streak semantics (neutral vs excluded) to be fixed in the docstring and locked by tests during implementation, consistent with SPEC "skips excluded from streak breaks and denominators".

Ready for implementation.

### [SWE] 2026-07-09 10:20 — Implementation

**Files created**
- `app/package.json` — dev-only `{"type":"module"}` marker so Node resolves `app/js/core/*.js` as ES modules under `node --test`; keeps root/backend CommonJS untouched. Inert for static serving.
- `app/js/core/dates.js` — timezone-safe date/week helpers (component-wise ISO parse via Hinnant serial-day integer math): `weekStart`, `weekIndex`, `weekParity`, `dayOfWeek`, `addDays`, `serialOf`.
- `app/js/core/targets.js` — `resolveTarget` (in-scope filter, day/parity match, most-specific-wins with day dominating parity, newest-`effective_from` tie-break; target 0 = scheduled rest; no match → `{scheduled:false}`).
- `app/js/core/derive.js` — `voidedEventIds`, `counterDayCount`, `counterDayVolume`, `binaryDayState`, `counterDayState`, `measureSeries` (undo voiding, last-non-voided-event-wins).
- `app/js/core/stats.js` — `currentStreak`, `bestStreak`, `completionRate`; skip semantics documented in the module header and locked by tests.
- `test/core/fixtures.mjs` — pinned SPEC AC #3 GTG rules + 14-day expected target vectors, and the AC #4 seeded Bible Study week.
- `test/core/{dates,targets,derive,stats,purity}.test.mjs` — unit tests (ESM, discovered by `node --test`).

**Tests**
- Unit: 114 passing, 0 failing (`make unit-tests` / `make pre-commit`) — includes the 22 pre-existing backend/smoke tests, no regressions.
- Integration: N/A — no infra changes (integration target is a no-op stub for the live Google deploy).

**Acceptance criteria** — all 14 verified:
- [x] parity/weekIndex alternate over 6 weeks — `test/core/dates.test.mjs::weekParity alternates even/odd across 6 consecutive weeks`.
- [x] most-specific-wins (sat beats *) — `targets.test.mjs::most-specific-wins`.
- [x] parity resolution (even→3/odd→0) — `targets.test.mjs::parity: alternating Saturdays`.
- [x] newest-`effective_from` tie-break — `targets.test.mjs::newest effective_from wins the tie`.
- [x] no matching rule → `{scheduled:false}` — `targets.test.mjs::no matching rule`.
- [x] **SPEC AC #3** full 14-day GTG vectors, 4 exercises — `targets.test.mjs::SPEC AC #3` + `fixtures.mjs` (GTG_EXPECTED).
- [x] `counterDayCount` + undo drops count — `derive.test.mjs::counterDayCount counts only non-voided`.
- [x] `counterDayVolume` total/count/avg — `derive.test.mjs::counterDayVolume totals per-set values`.
- [x] `binaryDayState` all five states, last-event-wins — `derive.test.mjs` (per-state tests).
- [x] **SPEC AC #4** Bible week states + hand-computed streaks — `derive.test.mjs::SPEC AC #4` and `stats.test.mjs::SPEC AC #4` (states green,green,green,green,skip,green,red; currentStreak 5/0; bestStreak 5).
- [x] `completionRate` excludes skips (5/6) — `stats.test.mjs::completionRate excludes skip days`.
- [x] `measureSeries` sorted by date — `derive.test.mjs::measureSeries returns ... sorted ascending`.
- [x] no DOM/fetch/Google globals, runs in Node + browser — `purity.test.mjs` (source scan + clean dynamic import) and served-file check below.
- [x] `make unit-tests` passes, 0 failures.

**Evidence**
```
$ make pre-commit   # (tail)
ℹ tests 114
ℹ suites 0
ℹ pass 114
ℹ fail 0
ℹ duration_ms 112.57

$ make format-fix && make lint-fix && make format-check && make lint-check
format-fix: no-op (no formatter configured — plain static files, no build step)
lint-fix:   no-op (...)
format-check: no-op (...)
lint-check: no-op (...)

# End-to-end: drove the four user stories through the real ESM modules
Story 1  2026-07-11 (sat, even) -> target=3 scheduled=true ; 2026-07-18 (sat, odd) -> target=0 scheduled=true
Story 4  count after undo: 2 ; volume {"totalValue":38,"setCount":2,"avgValue":19} ; state amber
Story 3  states green,green,green,green,skip,green,red ; currentStreak 5 ; bestStreak 5 ; completionRate 0.8333

# Static serving still works (app/package.json is inert)
GET /              -> HTTP 200 text/html   ("Daily Checklist")
GET /js/core/targets.js -> HTTP 200 text/javascript
```

**Notes**
- Skip semantics (locked): a `skip` day is NEUTRAL for streaks (neither breaks nor extends — the run carries across it) and is EXCLUDED from the completion-rate denominator. `pending` (today/future, nothing logged) also never breaks a streak nor counts. Documented in `stats.js` and `derive.js` headers; pinned by `stats.test.mjs`.
- Specificity ordering: day specificity dominates parity specificity (an exact-day/any-parity rule outranks an any-day/specific-parity rule), then newest `effective_from`. SPEC states "exact day beats *; parity match beats *" without a cross-dimension order; day-dominant is the deterministic choice and matches Riley's schedule. Flagged here for Tester/PM awareness — no collisions occur in the GTG fixture.
- Undo-of-undo ("redo") is out of v1 scope: an `undo` always voids its target. Binary flip-flops use explicit check/uncheck/skip with last-event-wins, not undo.
- ESM approach: `app/package.json` marks `app/` as `type:module` so `.js` core files load as ES modules in both Node and the browser with no build step and no `.mjs` MIME risk on GitHub Pages. Tests use `.mjs` so `node --test` treats them as ESM regardless of location.
- NOT RUN: none. Integration tests are an intentional no-op stub (live Google deploy is a [HUMAN] step from task #001).

### [Tester] 2026-07-09 15:30 — QA

**Test summary**
- Format / lint / pre-commit: PASS (format/lint are documented no-ops for this no-build static stack; `make pre-commit` runs the suite)
- Unit tests: 114 passed / 0 failed (`make unit-tests` → `node --test`)
- Integration tests: N/A — documented no-op stub (backend needs live Google deploy, [HUMAN] step in #001)
- Warnings: 0

**E2E adversarial pass** (pure-logic module — adversarial = hand-verify pinned fixtures against SPEC + probe edge cases via ad-hoc node scripts + mechanical browser-compat check)

*Fixture hand-verification (independent recompute from SPEC printed-calendar rules):*
- GTG 14-day target vector, anchor 2026-07-05 (Sun, weekIndex 0 = even): recomputed Sun→0, Mon–Fri→6, Sat 07-11(even)→3, Sun 07-12→0, Mon–Fri→6, Sat 07-18(odd)→0 = `[0,6,6,6,6,6,3,0,6,6,6,6,6,0]`; wall-sits 4/2 variant `[0,4,4,4,4,4,2,0,4,4,4,4,4,0]`. Matches `GTG_EXPECTED` exactly for all four exercises, and 07-11 even→3 / 07-18 odd→0 matches SPEC §6 AC #3 worked example. PASS
- Bible Study streak, seeded 06-07..06-13 (today 06-20): recomputed check×4 → skip Thu (neutral, run carries at 4) → check Fri (run 5) → eventless past Sat → red. Confirmed asserted `currentStreak(06-12)=5`, `currentStreak(06-13)=0`, `bestStreak=5`, `completionRate=5/6`. PASS

*Happy path:* `resolveTarget("pushups","2026-07-11",GTG_RULES,GTG_CONFIG)` → `{target:3,scheduled:true}`; following odd Sat 2026-07-18 → `{target:0,scheduled:true}`. Matches SPEC user story. PASS

*Break paths (ad-hoc node scripts against the real ESM modules):*
- Break 1 (DST-transition dates, America/New_York): `addDays("2026-03-08",1)`→`2026-03-09`, `addDays("2026-11-01",1)`→`2026-11-02`. Integer serial-day math is DST-immune. PASS
- Break 2 (parity for dates BEFORE anchor — negative week indexes): `2026-06-28`→idx -1/odd, `2026-06-21`→idx -2/even, `2020-01-01`→-340/even, `1999-12-31`→-1384/even. Negative modulo handled, no sign errors. PASS
- Break 3 (boundary: effective_to/effective_from exactly on query date): both inclusive — `effective_to==date`→scheduled, `effective_from==date`→scheduled. PASS
- Break 4 (malformed: undo pointing at nonexistent event_id): `counterDayCount` returns 1, no crash — ghost undo_of is harmless. PASS
- Break 5 (year/leap boundaries): `addDays("2024-12-31",1)`→`2025-01-01`, `addDays("2024-02-28",1)`→`2024-02-29` (leap). PASS
- Break 6 (two rules equal in specificity AND effective_from): resolves by array order (SPEC defines no further tie-break) — deterministic given input; documented by SWE, no collision in GTG fixture. PASS (acceptable)
- Break 7 (empty rules / other-habit isolation): `resolveTarget` with `[]`→`{scheduled:false}`; count ignores other habits/dates/kinds (unit-tested). PASS
- Break 8 (malformed: `unskip` event on a past skipped day): returns `"skip"`, NOT reverted — see Other issues. (informational, no AC covers it)

*Browser-compat (mechanical):* grep of `app/js/core/*.js` for node builtins/`require`/`process`/`node:`/`fs.` → NONE. Served via `scripts/serve.sh`: `GET /js/core/targets.js`→HTTP 200 `text/javascript`, relative `./dates.js` import resolves→HTTP 200. `app/package.json` `{"type":"module"}` makes `node --test` treat `.js` as ESM; browser loads the same files as `<script type="module">`. PASS

**Acceptance criteria** — all 14 verified with evidence:
- [x] PASS — weekParity/weekIndex alternate over 6 weeks — `dates.test.mjs::weekParity alternates ... 6 consecutive weeks`; independently reconfirmed incl. negative indices.
- [x] PASS — most-specific-wins (sat beats *) — `targets.test.mjs` line 15; `targets.js:89-103` day-dominant sort.
- [x] PASS — parity (even→3/odd→0) — `targets.test.mjs` line 30.
- [x] PASS — newest effective_from tie-break — `targets.test.mjs` line 53; 07-08→6, 07-09→8.
- [x] PASS — no matching rule → `{scheduled:false}` — `targets.test.mjs` line 78; reconfirmed with empty rules.
- [x] PASS — SPEC AC #3 full 14-day GTG vectors, 4 exercises — `targets.test.mjs` line 100 + hand-recomputed above.
- [x] PASS — counterDayCount + undo drops count — `derive.test.mjs` line 46 (3→2 after undo).
- [x] PASS — counterDayVolume total/count/avg — `derive.test.mjs` line 73 (54/3/18); undone-set exclusion line 82.
- [x] PASS — binaryDayState all five states, last-event-wins — `derive.test.mjs` lines 105-152.
- [x] PASS — SPEC AC #4 Bible week states + hand-computed streaks — `derive.test.mjs` line 192 (states) + `stats.test.mjs` lines 34-61; hand-recomputed above.
- [x] PASS — completionRate excludes skips (5/6) — `stats.test.mjs` line 93.
- [x] PASS — measureSeries sorted by date — `derive.test.mjs` line 203; voided-exclusion line 217.
- [x] PASS — no DOM/fetch/Google globals, Node + browser — `purity.test.mjs` + mechanical served-file check above.
- [x] PASS — `make unit-tests` passes, 0 failures — 114/114.

**Evidence**
```
$ make pre-commit   # (tail)
ℹ tests 114
ℹ suites 0
ℹ pass 114
ℹ fail 0
ℹ duration_ms 113.71

$ curl served core module
targets.js: HTTP 200 type=text/javascript
dates.js:  HTTP 200   (relative ./dates.js import resolves)
```

**Other issues found** (none block this task's ACs — for PM/follow-up):
- `unskip` gap (most substantive): SPEC §3 events enum lists `unskip` as a valid kind, but `binaryDayState` only considers `check`/`uncheck`/`skip` (`derive.js:113`). A `skip` followed by an `unskip` stays `"skip"` — the intended reversal is silently ignored. The task's derive.js spec enumerated only check/uncheck/skip, so no AC covers `unskip`; flagging so PM decides whether reversing a skip is needed in v1 (likely a follow-up task, since the Today view exposes skip).
- Defensive nit: `resolveTarget` with `config === undefined` AND a parity-specific rule throws `RangeError: invalid ISO date: undefined` (via `weekParity(date, undefined)`). Not reachable in the real flow (bootstrap always supplies `config.anchor_date`); a parity rule with no anchor is genuinely broken config. Non-blocking.
- Tie-break nit: rules equal in specificity AND `effective_from` resolve by array order. SPEC defines no further tie-break and the GTG fixture has no such collision; SWE documented this. Acceptable.

**VERDICT: PASS**
