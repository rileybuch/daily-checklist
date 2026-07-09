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

- [ ] `weekParity` and `weekIndex` correctly alternate week-to-week from a given `anchor_date`; a test seeds an anchor and asserts parity for 6 consecutive weeks.
- [ ] `resolveTarget` implements most-specific-wins: given a `days=*` rule and a `days=sat` rule both in scope for a Saturday, the `sat` rule's target is returned — unit-tested.
- [ ] `resolveTarget` implements parity: alternating-Saturday rules (`sat`+`even`→3, `sat`+`odd`→0) return the correct target for consecutive Saturdays — unit-tested.
- [ ] `resolveTarget` implements newest-`effective_from` tie-break: after Riley adds a rule with a later `effective_from`, dates on/after it use the new target while earlier dates still use the old one — unit-tested.
- [ ] A habit/date with no matching rule returns `{ scheduled: false }` — unit-tested.
- [ ] **SPEC AC #3:** Riley's full GTG schedule is expressed as `target_rules` fixtures — Pushups/Pullups/Squats: Mon–Fri 6, alt-Sat 3/0, Sun 0; Wall-sits: Mon–Fri 4, alt-Sat 2/0, Sun 0 — and `resolveTarget` returns those exact targets across a two-week span (Weeks 1–2). A test asserts the full 14-day target vector per habit.
- [ ] `counterDayCount` counts only non-voided `set` events; an `undo` of a set reduces the count by one — unit-tested.
- [ ] `counterDayVolume` returns correct total, count, and average from per-set reps/seconds values — unit-tested.
- [ ] `binaryDayState` returns `green`/`red`/`skip`/`pending`/`unscheduled` correctly, using the last non-voided event for the date — unit-tested for each state.
- [ ] **SPEC AC #4:** a seeded week of Bible Study binary events produces the expected green/red/skip day states AND `currentStreak`/`bestStreak` match a hand-computed value stated in the test — unit-tested.
- [ ] `completionRate` excludes `skip` days from the denominator — unit-tested with a week containing a skip.
- [ ] `measureSeries` returns `measure` values sorted by date (drives the progression chart) — unit-tested.
- [ ] The module imports no DOM, no `fetch`, no Google globals; it runs identically under `node --test` and in the browser as an ES module.
- [ ] `make unit-tests` passes with all core tests, 0 failures.

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
