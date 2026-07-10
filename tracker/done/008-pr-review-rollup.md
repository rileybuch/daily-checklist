# [PR review rollup] Daily Checklist habit tracker v1

Status: pending
Tags: `rollup`, `pr-review`
Refs: PR #1 (branch: `feat/habit-tracker-v1`, base: `dev`)

## Scope

PR Reviewer found **2 Blockers** and **3 Nits** in the diff. Both Blockers are real
runtime bugs in `app/js/views/manage.js` — DOM-API misuse that throws in a real
browser (Safari on iPhone) but is masked green by an over-permissive fake-DOM shim
(`test/helpers/domStub.mjs`). The whole Manage screen (SPEC view 5 / task #006) is
non-functional on-device as shipped.

The SWE must fix both Blockers (and may fix Nits at their discretion) in a single
coordinated pass, then hand back to the Tester. Pipeline re-runs from QA →
PM acceptance → push → re-review.

## Acceptance Criteria

- [x] Blocker 1: `manage.js` no longer assigns to `element.children`; the Manage
      view renders against a real-DOM-parity harness (the tightened shim now throws
      on `children` assignment exactly as Safari does). Verified by
      `test/views/manage.test.mjs::Manage mounts and its Schedule editor opens
      without throwing`. [HUMAN] final on-device Safari confirmation still owed.
- [x] Blocker 2: `manage.js` reads checked day boxes via `[...querySelectorAll(...)]`
      before `.filter`/`.map`; opening a habit's Schedule editor and adding a rule
      works. Verified by the schedule/add-rule tests + the mount-and-open regression.
- [x] Regression coverage: `test/helpers/domStub.mjs` tightened — `children` is a
      getter-only accessor (assignment throws `TypeError`) and `querySelectorAll`
      returns a `FakeNodeList` (iterable, indexable, `.forEach`/`.item`, but NO
      `.filter`/`.map`). Confirmed RED against the pre-fix code (12→5 failing across
      the two staged bugs) then GREEN after the fixes (310/310). See Log for output.
- [x] Tester re-runs the full `node --test` suite and PASSES, and exercises the
      Manage → Schedule flow the way the user will (add habit, open Schedule, tick
      days, add rule). Verified 2026-07-09 — see [Tester] log below (310/310, e2e
      happy path + 5 break paths all green, RED reproduced for both blockers).
- [ ] PM re-runs acceptance review and ACCEPTS.
- [ ] PR Reviewer re-runs and reports `NO BLOCKERS`.

## Blockers (detail)

### 1. [Correctness — real defect] — `app/js/views/manage.js:421` (also `:108`, `:130`)

- **What's wrong:** `paint()` does `root.children = []` immediately after
  `root.innerHTML = ""`. In a real browser `Element.children` is a **getter-only**
  accessor on the prototype; because ES modules always run in strict mode,
  assigning to it throws `TypeError: Cannot set property children ... which has only
  a getter`. The same pattern appears in `showErrors` (`box.children = []`, line 108)
  and `renderUnitSlot` (`unitSlot.children = []`, line 130).
- **Why it's a Blocker:** `paint()` is the first thing `renderManage` runs (line 438),
  so the Manage view throws on mount and renders nothing on-device — the entire
  Manage screen (SPEC view 5 / task #006: add/edit/archive habits, edit target
  rules) is dead in Safari. Tests stay green only because `domStub` models `children`
  as a plain writable array (`this.children = []` in the constructor).
- **Suggested fix:** Delete the `*.children = []` lines. `innerHTML = ""` already
  empties the element in both the real DOM and the shim, so they are redundant as
  well as illegal.
- **Regression test:** Give the shim's `children` a getter with no setter (or add a
  real-DOM/jsdom-free Manage smoke) so an assignment to `children` fails the suite.

### 2. [Correctness — real defect] — `app/js/views/manage.js:298`

- **What's wrong:** `readForm()` does
  `dayBoxes.querySelectorAll(".rule-day").filter((box) => box.checked).map((box) => box.dataset.day)`.
  In a real browser `querySelectorAll` returns a `NodeList`, which has **no `.filter`
  or `.map`** — this throws `TypeError: ...filter is not a function`.
- **Why it's a Blocker:** `readForm()` is called by `updatePreview()` (line 309),
  which runs during `scheduleEditor()` construction (line 326) and on the "Add rule"
  submit (line 344). So opening a habit's Schedule editor — and therefore adding a
  forward-dated target rule (core to SPEC AC #3, expressing the GTG schedule) —
  throws on-device. Tests pass only because the shim's `querySelectorAll` returns a
  real `Array` (`this._descendants().filter(...)`).
- **Suggested fix:** Convert to an array first, e.g.
  `Array.from(dayBoxes.querySelectorAll(".rule-day")).filter(...).map(...)`, or use
  `[...dayBoxes.querySelectorAll(".rule-day")]`. (The `for...of` at line 334 is fine —
  `NodeList` is iterable.)
- **Regression test:** Have the shim return a `NodeList`-like object without
  `.filter`/`.map` from `querySelectorAll` (keep it iterable + `.forEach`), so this
  misuse fails the suite.

## Nits (non-blocking; will be appended to PR description if pipeline advances)

### 1. [Standards — input validation] — `backend/adapter.gs.js:60`

- **Suggestion:** `handleAppsScriptRequest` calls `JSON.parse(e.postData.contents)`
  with no try/catch, before auth. A malformed POST body throws an unhandled
  exception and yields an Apps Script error page instead of a clean JSON 400. Wrap
  the parse and return `{ status: 400, error: "invalid_json" }` on failure. Low
  severity (single-user, client-controlled body), but it's the one boundary that can
  throw instead of returning the folded-status JSON the client expects.

### 2. [Performance — cold path] — `app/js/core/derive.js` / `app/js/core/stats.js`

- **Suggestion:** `counterDayCount` / `counterDayVolume` / `binaryDayState` each
  recompute `voidedEventIds(events)` (a full scan of the event list) on every call,
  and the stats scans (`currentStreak` / `bestStreak` / `completionRate`) call them
  once per day across the window. Well within budget for a single user's ~30-day
  event window, so not a blocker — but if the event set ever grows, hoisting the
  voided set once per render pass would remove the repeated O(events) rescans.

### 3. [Clean code — test infra] — `test/helpers/domStub.mjs`

- **Suggestion:** The shim silently diverges from real DOM in exactly the two spots
  that hid the Blockers above (writable `children`, `Array`-returning
  `querySelectorAll`). Tightening it to mirror the real API contract (getter-only
  `children`, `NodeList`-like return) turns this whole class of "green in CI, broken
  on device" bug into a test failure. (Folded into the Blocker regression AC; noted
  here so it isn't lost if the SWE fixes the call sites without touching the shim.)

---

Refs: PR #1

## Log

### [SWE] 2026-07-09 14:20 — Implementation

**Files modified**
- `app/js/views/manage.js` — Blocker 1: removed the three illegal `X.children = []`
  assignments (lines 108/130/421 — `showErrors`, `renderUnitSlot`, `paint`); the
  preceding `innerHTML = ""` already clears children. Blocker 2: `readForm` now spreads
  the day-box `NodeList` (`[...dayBoxes.querySelectorAll(".rule-day")]`) before
  `.filter`/`.map`. The `for...of` at (old) line 334 left untouched — `NodeList` is iterable.
- `test/helpers/domStub.mjs` — tightened to real-DOM fidelity: `children` is now a
  getter-only accessor backed by `_children` (assignment throws `TypeError` in strict
  mode, like a real `Element`); `querySelectorAll` returns a new `FakeNodeList`
  (iterable, indexable, `length`, `item`, `forEach` — but NO `.filter`/`.map`/`.find`).
- `test/views/manage.test.mjs` — spread NodeLists at test-side array-method call sites;
  added 3 focused regression tests (children getter-only guard, NodeList-no-array-methods
  guard, Manage-mounts-and-schedule-opens-without-throwing covering bug 1 + bug 2).
- `test/views/trends.test.mjs`, `test/views/stats.test.mjs`, `test/views/week.test.mjs`
  — spread `querySelectorAll` results before `.filter`/`.map`/`.find`/`.some` (test-side
  helpers only; required collateral of the faithful shim, no assertion logic changed).

**Tests**
- Unit: 310 passing, 0 failing — `node --test` (was 307; +3 regression tests).
- Integration: N/A — no infra changes (backend requires live Google deploy).

**Acceptance criteria**
- [x] Blocker 1 — no `element.children` assignment; verified by regression test.
- [x] Blocker 2 — day boxes read via spread; verified by schedule/add-rule tests.
- [x] Regression coverage — shim tightened; RED→GREEN evidence below.
- [ ] Tester re-runs full suite + exercises Manage→Schedule flow.
- [ ] PM re-runs acceptance.
- [ ] PR Reviewer re-runs → NO BLOCKERS.

**Evidence — RED → GREEN (staged, one bug at a time)**

Phase 0 — spread test-side NodeList usages only (loose shim still in place): 307 pass, 0 fail.

Phase 1 — tightened the shim, BEFORE any manage.js fix (RED, bug 1 surfaces on mount):
```
ℹ tests 307
ℹ pass 295
ℹ fail 12
✖ ... TypeError: Cannot set property children of #<FakeElement> which has only a getter
      at paint (app/js/views/manage.js:421:19)
      at renderManage (app/js/views/manage.js:438:3)
```
(All 12 Manage tests died on mount at the `root.children = []` setter — bug 1 masked bug 2.)

Phase 2 — removed the 3 `.children = []` lines, BEFORE the bug-2 fix (RED, bug 2 now isolated):
```
ℹ tests 307
ℹ pass 302
ℹ fail 5
✖ ... TypeError: dayBoxes.querySelectorAll(...).filter is not a function
      at readForm (app/js/views/manage.js:296:59)
      at updatePreview (app/js/views/manage.js:307:21)
```
(The 5 schedule-editor tests failed on the `NodeList.filter` call — bug 2.)

Phase 3 — spread the day-box NodeList + added regression tests (GREEN):
```
$ make pre-commit && make unit-tests
ℹ tests 310
ℹ pass 310
ℹ fail 0
```

**Runtime sanity check**
- `node --check app/js/views/manage.js` → syntax OK.
- Served `app/` (`scripts/serve.sh`, port 8137): `index.html` 200, `js/views/manage.js` 200.
- Confirmed no `X.children =` assignments remain in the served module (only match is the
  `el(tag, opts, children = [])` parameter default, which is unrelated).
- The tightened shim is now a real-DOM-parity harness for the two accessors in question:
  the "Manage mounts and Schedule editor opens without throwing" regression test exercises
  the exact code paths that threw in Safari, and passes only because both fixes are in place.

**Notes**
- `make format-*` / `make lint-*` are documented no-ops for this no-build static stack.
- NOT RUN — headless/on-device Safari execution: no jsdom or browser runner is available
  in this environment (project ships zero test deps by design). Final on-device Safari
  confirmation of the Manage screen is a [HUMAN] step left for the Tester/human. The
  tightened shim reproduces both real-DOM `TypeError`s exactly, so this is regression-safe.
- Nits (backend JSON try/catch, voided-set hoisting) intentionally left for the Tester/PM
  to decide on — out of scope for the two Blockers; not touched to avoid unrelated churn.

### [Tester] 2026-07-09 22:35 — QA

**Test summary**
- Format / lint / pre-commit: PASS (`make pre-commit` → 310 pass / 0 fail; format/lint are documented no-ops for this no-build static stack)
- Unit tests: 310 passed / 0 failed (`make unit-tests` = `node --test`)
- Integration tests: N/A — `make integration-tests` is a documented no-op (backend requires a live Google Apps Script deploy; [HUMAN])
- Warnings: 0

**E2E adversarial pass** (drove the REAL `renderManage` + `createManageController` through the tightened shim — my own harness, independent of the SWE's tests)
- Happy path: mount Manage → open Pushups Schedule → tick Sat → set target 3 → Add rule → `{days:"sat",target:3}` POSTed; view painted, preview `"This week: Mon–Fri 6, Sat–Sun not scheduled"` (PASS)
- Break 1 (boundary: zero days ticked): submit rule with no `.rule-day` checked → `readForm` returns `days:"*"`, rule POSTed, no throw (PASS — the empty-filter fallback the old `.filter` crash would have hidden)
- Break 2 (state edge: tick all 7 days + fire `change` on each → readForm re-runs live): no throw, preview renders (PASS)
- Break 3 (boundary: empty bootstrap — zero habits, zero rules): Manage still paints `.manage`, no throw (PASS)
- Break 4 (add-habit + hammer type toggles counter↔binary↔measurement → exercises old bug-1 `renderUnitSlot` line 130 + `paint` re-render): no throw, habit POSTed, new card appears (PASS)
- Break 5 (invalid rule to<from → forces `showErrors` render, old bug-1 line 108): no throw, no POST, error surfaced (PASS)

**RED reproduction (proving the regression is real, not theater)**
- Temporarily reverted ONLY the bug-2 fix (`[...qsa]` → `qsa`) in a scratchpad edit; ran `node --test`: **6 fail**, all with the exact `TypeError: dayBoxes.querySelectorAll(...).filter is not a function at readForm (manage.js:296:59)`. Restored the fix; suite back to 310/0. `git diff` for manage.js is exactly the SWE's fix (−4/+1), repo left unmodified.
- Verified shim fidelity directly (isolated harness on `makeDocument()`): `el.children = []` throws `TypeError: Cannot set property children ... which has only a getter`; `children` getter still readable; `innerHTML=""` still clears; `querySelectorAll` returns a `FakeNodeList` with `.filter`/`.map` === `undefined` but `.forEach`/`.item` present, iterable + indexable. The shim is genuinely faithful — not a fake that silently passes.

**Broader-risk sweep (the crux — same anti-pattern in views the reviewer never examined)**
- `grep -rn "\.children\s*=" app/js` → **zero hits**. `grep -rn "\.children" app/js` → **zero** references remain anywhere in app code.
- `grep -rnE "querySelectorAll\(...\)\.(filter|map|reduce|forEach|find|some|every|slice|sort|...)" app/js` → **zero hits**. Only two `querySelectorAll` usages exist in all of `app/js`, both in `manage.js`: line 296 (now spread) and line 332 (`for...of`, legal — NodeList is iterable).
- No other collection-returning DOM APIs (`getElementsByClassName`/`getElementsByTagName`/`childNodes`) anywhere in `app/js`.
- `app/index.html` inline script is service-worker registration only — no DOM-collection misuse.
- **Conclusion: `manage.js` was the ONLY offender.** today.js/week.js/trends.js/stats.js and all models are clean. No new blockers to fold in.

**No-regression check**
- Removed `X.children = []` lines are pure dead code: `innerHTML = ""` already empties the element in both real DOM and the shim (`_children=[]`), so rendered output is unchanged (verified: children cleared, cards/editors still render, preview text intact).
- `readForm` day-selection still read correctly (Break 1/happy path both confirm checked-day extraction and the `"*"` fallback).
- Test-side spreads in stats/trends/week test helpers are legitimate collateral of the faithful shim (test helper functions only, no assertion logic or app code changed).

**Acceptance criteria**
- [x] PASS — Blocker 1: no `element.children` assignment. Evidence: zero `.children =` hits in `app/js`; `test/views/manage.test.mjs` "Manage mounts and its Schedule editor opens without throwing" + "children getter-only guard" pass; direct shim repro confirms assignment throws. [HUMAN] on-device Safari confirmation still owed.
- [x] PASS — Blocker 2: day boxes read via `[...querySelectorAll(...)]`; opening Schedule + adding a rule works. Evidence: e2e happy path POSTs a rule; RED repro shows reverting the fix → 6 fail with the exact `readForm` TypeError.
- [x] PASS — Regression coverage: `domStub.mjs` tightened — `children` getter-only (assignment throws), `querySelectorAll` returns array-method-free `FakeNodeList`. Evidence: isolated shim harness above; RED (6 fail) → GREEN (310/310).
- [ ] Tester exercises Manage→Schedule flow — now [x] above (this entry).
- [ ] PM re-runs acceptance — downstream, unchanged.
- [ ] PR Reviewer re-runs → NO BLOCKERS — downstream, unchanged.
- [HUMAN] Final on-device Safari confirmation of the Manage screen — awaiting human verification (no browser runner in this environment by design).

**Evidence**
```
$ make pre-commit
ℹ tests 310
ℹ pass 310
ℹ fail 0

# RED repro — bug-2 fix reverted:
ℹ tests 310
ℹ pass 304
ℹ fail 6
TypeError: dayBoxes.querySelectorAll(...).filter is not a function
    at readForm (app/js/views/manage.js:296:59)
# fix restored → 310/310

$ grep -rn "\.children\s*=" app/js   → (no hits)
$ grep -rnE "querySelectorAll\(...\)\.(filter|map|...)" app/js  → (no hits)
```

**Other issues found**
- None blocking. Nit 1 (backend `JSON.parse` without try/catch) remains open for PM/SWE — genuinely reachable on a malformed POST body, but out of scope for this Blocker rollup and correctly left untouched. Nits 2/3 are non-blocking as filed.

**VERDICT: PASS** — both Blockers fixed and independently RED-reproduced, the shim is faithfully tightened (verified in isolation), the broader-risk sweep confirms `manage.js` was the sole offender, full suite 310/0 with 0 warnings, e2e happy path + 5 break paths all green, no app-behavior regression. Only the [HUMAN] on-device Safari confirmation remains outstanding.
