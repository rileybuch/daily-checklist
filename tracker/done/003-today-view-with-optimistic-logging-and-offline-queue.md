# Today View with Optimistic Logging & Offline Queue (M2)

Status: pending
Tags: `ui`, `data`, `api`
Depends on: #001, #002
Blocks: #004, #005, #006, #007

## Scope

Implement SPEC Milestone 2 — the daily driver. After this task the app is usable day-to-day and Riley can retire the printout. Combines the **data/sync layer** (API client + offline outbound queue) with the **Today view UI**, because the queue exists specifically to serve optimistic logging and Today is its first and primary consumer. Uses the domain core (#002) for all derivation; talks to the backend contract from (#001). Plain static ES modules, no build step.

**Data/sync layer (`app/js/data/`):**
- **Token bootstrap:** on first load, if no token in `localStorage`, prompt Riley once for the shared secret and the Web App `/exec` base URL; store both in `localStorage`. (SPEC Section 2 security model.)
- **API client:** `fetch`-based wrapper for the five endpoints (`GET /bootstrap`, `GET /events`, `POST /events`, `POST /habits`, `POST /rules`), always attaching `token`. Written so the transport is injectable (pass a `fetch`-like fn) → unit-testable with a fake, no live server.
- **Bootstrap load:** on open, call `/bootstrap`, cache the response (habits, rules, config, recent events) in `localStorage` so the shell renders instantly from cache and refreshes in the background.
- **Outbound queue:** every mutating action enqueues an event with a **client-generated `event_id`** (UUID) into a `localStorage` queue. A flusher `POST`s the queue in batches; on success, dequeues by `event_id`; on network failure, leaves the queue intact for retry on next open / regained connectivity (`online` event + on app open). Idempotency on `event_id` (backend #001) makes retries safe — no double-counting.
- **Optimistic apply:** enqueued events are immediately merged into the in-memory event list so the UI updates before the network round-trip.

**Today view UI (`app/js/views/today.js` + CSS):** one row per habit **scheduled for the selected date** (via #002 `resolveTarget`), ordered by `sort_order`. Mobile-first, thumb-friendly targets.
- **Binary:** single tap toggles green/red (enqueues `check`/`uncheck`); long-press or a secondary control = `skip`. Reflects `binaryDayState`.
- **Counter:** a large **＋** button — one tap logs **one set immediately** (enqueues a `set` event) with its `value` **pre-filled from the previous set of that habit** (first set of the day: last-used value for that habit; ultimate fallback: a sensible default). An **inline stepper** on the just-logged set adjusts the value without blocking or delaying the log (edits the enqueued event's `value` in place before/after flush). Progress shows `n / target sets` with a fill bar. A `−` / undo affordance voids the last set (enqueues an `undo`). Wall-sits behave identically but the value is **seconds** (per the habit's `unit`).
- **Measurement:** a "record value" field only; never red. Submitting enqueues a `measure` event.
- **Date switcher:** move to a previous date to **backfill** (events carry the chosen `date`); today is the default.
- **Empty/edge states:** if no habits are scheduled for the date, show a clear "Nothing scheduled today" message, not a blank screen. If the token/URL isn't configured, show a clear setup prompt rather than silent failure. If a flush fails, show an unobtrusive "N pending" indicator (not an error dump).

## Acceptance Criteria

- [x] On first load with no stored token, the app prompts once for the shared secret + Web App URL and persists them to `localStorage`; subsequent loads don't re-prompt — unit/integration tested with a fake `localStorage`.
- [x] The API client attaches `token` to every request and targets the correct endpoint/verb — unit-tested with a fake transport (5 endpoints).
- [x] Tapping ＋ on a counter habit enqueues one `set` event with a client-generated UUID `event_id` and the value pre-filled from the previous set of that habit; the on-screen count increments immediately (before any network call) — unit/DOM tested.
- [x] The inline stepper edits the just-logged set's `value` without adding or removing a set (count unchanged) — tested.
- [x] The undo affordance enqueues an `undo` of the last set and the count decrements immediately — tested.
- [x] Wall-sits log a `set` whose `value` is treated as **seconds** (per `unit`), Pushups as **reps** — tested that the enqueued event/unit differ appropriately.
- [x] Binary tap enqueues `check`/`uncheck`; long-press/secondary control enqueues `skip`; the cell color reflects `binaryDayState` — tested.
- [x] Measurement submit enqueues a `measure` event with the entered value — tested.
- [x] The outbound queue survives a simulated force-close: events enqueued but not yet flushed remain in `localStorage` and are re-sent on the next open; a failing-then-succeeding transport results in each `event_id` posted until acknowledged, with no duplicates after success — unit-tested against the fake transport + fake `localStorage`.
- [x] Only habits scheduled for the selected date render; the date switcher changes the selected date and re-renders using the new date's schedule (backfill) — DOM tested.
- [x] Empty state ("Nothing scheduled") and unconfigured-token setup prompt render instead of a blank/broken screen — DOM tested.
- [x] `make unit-tests` passes with all new tests, 0 failures. `make tests` exits 0.
- [ ] [HUMAN] Against the live deployed backend (from #001): tapping ＋ on Pushups updates the count instantly and the event row appears in the Google Sheet within 30 s; force-closing the app immediately after the tap does not lose the event — it is re-sent on next open (SPEC AC #2).
- [ ] [HUMAN] Same flow on Wall-sits records a `seconds` value in the Sheet (SPEC AC #2, second half).
- [ ] [HUMAN] Airplane-mode test: with the app already opened once (data cached), enable airplane mode, log 3 sets (UI updates), re-enable networking → the 3 events appear in the Sheet exactly once (SPEC AC #6).

## User Stories

### Story: Riley logs a pushup set at the gym
1. Riley opens the app; the Today view shows Pushups with `0 / 6 sets` and a large ＋.
2. Riley taps ＋. The count jumps to `1 / 6` instantly; the just-logged set shows a value pre-filled to his last-used reps (e.g. 12) with a small stepper.
3. Riley taps the stepper up twice → the set now reads 14 reps; the count stays `1 / 6`.
4. Within 30 s the row (habit=pushups, kind=set, value=14) appears in the Sheet.

### Story: Riley's phone dies right after a tap (no data loss)
1. Riley taps ＋ on Squats; the count updates and the event is enqueued with a UUID.
2. Riley force-closes the app before the batch flush completes.
3. Riley reopens the app later on a connection; the queued Squats set flushes and appears in the Sheet exactly once (idempotent on `event_id`).

### Story: Riley logs offline in a basement gym (airplane mode)
1. The app was opened earlier, so the shell + data are cached.
2. Riley turns on airplane mode and logs 3 wall-sit sets; each updates the UI and shows a small "3 pending" indicator.
3. Riley leaves and regains signal; on reconnect the queue flushes and all 3 seconds-valued sets land in the Sheet exactly once.

### Story: Riley backfills yesterday's Bible Study
1. Riley taps the date switcher and selects yesterday.
2. The Today view re-renders with yesterday's scheduled habits.
3. Riley taps Bible Study to green; the `check` event carries yesterday's `date` and is enqueued.

### Story: First-time setup
1. Riley opens the app for the first time; there is no token stored.
2. A one-time prompt asks for the shared secret and the Web App URL.
3. Riley enters both; they persist, the app bootstraps, and he isn't asked again on later opens.

---

Blocked by: #001, #002

## Log

### [PM] 2026-07-08 12:15 — Grooming

**Summary**
SPEC M2 — the daily driver. Bundles the data/sync layer (token bootstrap, injectable-transport API client, `localStorage` outbound queue with client-generated UUIDs and idempotent retry, optimistic in-memory apply) with the Today view UI (binary toggle/skip, counter ＋ with pre-filled editable per-set value + inline stepper + undo, measurement field, date-switcher backfill). Reaches SPEC AC #2 and #6.

**Key decisions**
- Data/sync layer is folded into this task (not split out) because the offline queue exists to serve optimistic logging and Today is its only consumer at M2 — matching SPEC's own M2 definition ("bootstrap load, optimistic logging, offline queue").
- Transport and `localStorage` are injected so the entire queue/retry/idempotency behavior is unit-testable with fakes — no live server needed for CI.
- Live-backend behaviors (row appears in Sheet within 30 s, force-close-no-loss, airplane-mode exactly-once) are `[HUMAN]` and depend on the deployment from #001; automated tests cover the queue mechanics against fakes.

**Dependencies**
- #001 — the API contract/endpoints (and the live deploy the [HUMAN] criteria exercise).
- #002 — domain core for schedule resolution and day-state derivation used to render rows.

**User stories**
- 5 stories: log a set (optimistic + stepper), force-close no-loss, airplane-mode offline, backfill yesterday, first-time setup.

**Open questions**
- None. Pre-fill fallback for the very first set of a brand-new habit left to SWE (a sensible default), noted in scope.

Ready for implementation.

### [SWE] 2026-07-09 14:30 — Implementation

**Files created — data/sync layer (`app/js/data/`)**
- `ids.js` — client-generated RFC-4122 v4 `event_id` (platform `crypto.randomUUID` + fallback); enables idempotent retry.
- `credentials.js` — one-time token + `/exec` URL bootstrap over injected `localStorage` + injected prompt (SPEC Section 2).
- `apiClient.js` — injectable-`transport` client for all 5 endpoints; attaches `token`, routes via `?path=`, folds Apps Script's in-body `status` into thrown errors.
- `queue.js` — `localStorage` outbound queue: enqueue / list / size / remove-by-id / in-place value `update` / clear; corrupt-payload safe.
- `sync.js` — flusher: posts the batch, dequeues acked (`inserted` ∪ `skipped`), leaves queue intact on network failure, single in-flight guard.
- `prefill.js` — per-set value pre-fill (habit's most recent non-voided set, else default).
- `demoTransport.js` — in-memory stub backend for `?demo=1` dev/runtime smoke (NOT production).

**Files created — view/controller**
- `views/todayModel.js` — pure Today view-model builder (scheduled+active rows, counter/binary/measurement descriptors, fill ratio, `lastSet`); delegates all derivation to core #002.
- `controllers/todayController.js` — DOM-agnostic orchestration: logSet/editSetValue/undoLast/toggleBinary/skipBinary/recordMeasure/setDate/flush/pendingCount + optimistic apply and force-close recovery.
- `views/today.js` — thin DOM renderer: ＋/stepper/undo, binary tap + long-press skip, measurement field, date switcher, `N pending` indicator, empty state.
- `app.js` — entry wiring: credentials/demo, cache-first render, background bootstrap refresh, debounced flush + `online`/on-open flush.
- `css/today.css` — mobile-first styles (56px tap targets, state colors, fill bar).

**Files modified**
- `app/index.html` — link `css/today.css`, load `js/app.js` as `type="module"`.

**Tests created (all `node --test`, zero deps)**
- `test/helpers/fakes.mjs` — FakeStorage, FakeSheet (id-dedup), sheetTransport, flakyTransport, seqIds.
- `test/data/credentials.test.mjs`, `apiClient.test.mjs`, `queue.test.mjs`, `sync.test.mjs`, `prefill.test.mjs`.
- `test/views/todayModel.test.mjs`, `test/controllers/todayController.test.mjs`.

**Tests**
- Unit: 160 passing, 0 failing (`make unit-tests`) — 42 new this task, plus the pre-existing core/backend suites (no regressions). Output below.
- Integration: N/A — `make integration-tests` is a no-op (backend needs live Google deploy); `make tests` exits 0.

**DOM-test note (per task constraint):** no jsdom introduced (would add a runtime dependency for little value). Instead the DOM decision logic is fully extracted into `todayModel.js` + `todayController.js` and unit-tested; the thin `today.js`/`app.js` glue is verified by the runtime smoke below and by `?demo=1` in a real browser (the [HUMAN] on-device checks).

**Acceptance criteria**
- [x] token prompt once + persist, no re-prompt — `test/data/credentials.test.mjs`
- [x] API client attaches token, correct verb/path × 5 — `test/data/apiClient.test.mjs`
- [x] ＋ enqueues `set` w/ UUID + pre-filled value, count increments pre-network — `test/controllers/todayController.test.mjs`
- [x] inline stepper edits value, count unchanged — `todayController.test.mjs::editSetValue...`
- [x] undo enqueues `undo`, count decrements — `todayController.test.mjs::undoLast...`
- [x] wall-sits seconds vs pushups reps — `todayController.test.mjs` + `todayModel.test.mjs`
- [x] binary check/uncheck + long-press skip, color reflects `binaryDayState` — `todayController.test.mjs` (state) + `today.js` (wiring, smoke)
- [x] measurement submit enqueues `measure` — `todayController.test.mjs::recordMeasure`
- [x] queue survives force-close + failing-then-succeeding = exactly once — `test/data/sync.test.mjs` + `todayController.test.mjs`
- [x] only scheduled habits render + date switcher re-renders (backfill) — `todayModel.test.mjs` + `todayController.test.mjs::setDate`
- [x] empty state + unconfigured-token setup prompt — `todayModel.test.mjs` (empty) + `credentials.test.mjs` (unconfigured → setupPrompt in `app.js`)
- [x] `make unit-tests` passes (160, 0 fail); `make tests` exits 0
- [ ] [HUMAN] live backend: ＋ Pushups → row in Sheet < 30s, force-close no loss (SPEC AC #2) — needs #001 live deploy
- [ ] [HUMAN] live backend: Wall-sits records a `seconds` value (SPEC AC #2) — needs #001 live deploy
- [ ] [HUMAN] airplane-mode: log 3 sets offline → land exactly once (SPEC AC #6) — needs #001 live deploy + a real phone

**Evidence — `make unit-tests`**
```
ℹ tests 160
ℹ pass 160
ℹ fail 0
```

**Evidence — runtime smoke (served static files + wired stack against demo stub)**
```
$ PORT=8123 bash scripts/serve.sh   # then curl:
index.html: HTTP 200 (text/html)   <script type="module" src="js/app.js">
js/app.js: HTTP 200 (text/javascript)
js/controllers/todayController.js: HTTP 200 (text/javascript)
css/today.css: HTTP 200 (text/css)

# Headless drive of app.js's exact wiring (demoTransport→apiClient→queue→sync→controller):
tap +  → count 1, pre-filled value=1 reps (pending=1)
stepper +2 → count still 1, value=3 (count unchanged)
tap + again → count 2, next set pre-filled from previous=3
logged 3 wall-sit sets offline → row 3/4 seconds, pending=5
reopened (force-close): pending queue recovered = 5, pushups optimistic count = 2
binary: pending → green → pending → skip
record pushup_max 47 → lastValue=47
date switch 2026-07-05 (backfill) → pushups target=6, state=red
flush #1 → flushed=9, pending=0 ; flush #2 (redundant) → flushed=0
stub sheet holds 11 events; duplicate event_ids = 0 ; wall_sit sets = 3 (seconds)
```

**Runtime smoke — how to reproduce in a browser**
`bash scripts/serve.sh` then open `http://localhost:8000/?demo=1` — the app loads seeded sample habits against the in-memory demo transport (no Google account); tap ＋, use the stepper/undo, toggle/long-press a binary, record a measurement, page the date switcher. Live-backend flows are the [HUMAN] items above.

**Notes**
- Escalations: none. Pre-fill fallback for a brand-new habit is the SWE-chosen "sensible default" left open in grooming: `defaultSetValue = 1` (overridable).
- `ts` is emitted as ISO-8601 (UTC) via `new Date().toISOString()`; derivation only uses `ts` for stable ordering within a date, so UTC is deterministic and safe. Flagged in case a future view wants local wall-clock time.
- `editSetValue` patches the in-memory event and the queued copy in place; if a set were edited after its batch already flushed there is no update-event kind in v1 (out of scope), but the debounced flush leaves ample time to adjust before send.
- `docs/adr/` and `docs/glossary.md` do not exist in this repo — documentation-discipline checks N/A.
- DO NOT COMMIT — Tester goes first.

### [Tester] 2026-07-09 16:10 — QA

**Test summary**
- Format / lint / pre-commit: PASS (`make format-check`/`make lint-check` no-op by design; `make pre-commit` = unit-tests, green)
- Unit tests: 160 passed / 0 failed
- Integration tests: no-op by design (backend needs live Google deploy — see #001 [HUMAN]); `make tests` exits 0
- Warnings: 0

**E2E adversarial pass** (drove the wired stack headlessly through my OWN scripts — demoTransport→apiClient→queue→sync→controller — not the SWE's smoke)
- Static-asset serve: `PORT=8123 bash scripts/serve.sh` then curl of all 15 referenced assets → every one HTTP 200 with correct content-type (`/`=text/html, `js/app.js`=text/javascript, `css/today.css`=text/css, plus every module app.js imports). index.html references resolve.
- Happy path: `node e2e_happy.mjs` → bootstrap; tap pushups ×2 (count 0→1→2, pre-network); stepper edit set#2 to 14 (count unchanged, queued copy patched); undo (count→1); binary check→skip→re-check (green→skip→green); record pushup_max 47 (never red); switch to yesterday + backfill tap (set carries `date=2026-07-08`). Flushed batch asserted exactly: kinds `[set,set,undo,check,skip,check,measure,set]`, 8 unique RFC-4122 v4 event_ids, measure value=47, yesterday-dated set present. Flush #1 acked 8/pending 0; flush #2 = 0 (no double-post); sheet holds 2 seeds + 8 = 10, zero duplicate ids. **PASS**
- Break 1 (failure mode — mid-batch network death): transport persists 2 of 3 server-side then throws → flush #1 surfaces error, queue stays INTACT at 3 (no partial dequeue); re-flush drains queue, sheet has exactly 3 distinct event_ids (idempotent, no double-insert). **PASS**
- Break 2 (malformed input — corrupt localStorage queue): 6 garbage payloads (`{not json`, `"a string"`, `42`, `null`, `{"k":1}`, `[{bad}]`) each degrade to empty array without throwing and stay usable; controller boots over corrupt queue and renders rows. **PASS**
- Break 3 (concurrency — rapid double-tap same second): frozen clock → both sets share identical `ts` but get DISTINCT event_ids; both count (count=2), neither dropped. **PASS**
- Break 4 (state edge — undo on empty day): returns null, does not throw, nothing enqueued. **PASS**
- Break 5 (security — missing/blank credentials): cancelled prompt → null and nothing persisted (app.js shows setupPrompt and `return`s BEFORE building apiClient, so no unauthenticated request is ever sent); whitespace-only creds rejected; valid creds captured once and NOT re-prompted on second load. **PASS**
- Extra (AC#6 units): wall_sits row unit=`seconds`, pushups=`reps`, both enqueue `set`; value is a plain number, unit disambiguates. Force-close recovery: unflushed events survive into a fresh queue+controller over the same storage (count re-merged = 2). Empty state: Thursday with Monday-only rules → 0 rows. **PASS**

**Acceptance criteria**
- [x] PASS — one-time token+URL prompt, persist, no re-prompt — `test/data/credentials.test.mjs`; my Break 5 confirmed cancel→null/no-persist and no re-prompt on 2nd load
- [x] PASS — API client attaches token, correct verb/path ×5 — `test/data/apiClient.test.mjs`; my drive exercised bootstrap/getEvents/postEvents live against the stub
- [x] PASS — ＋ enqueues `set` w/ UUID + pre-filled value, count increments pre-network — `test/controllers/todayController.test.mjs`; my happy path: count 0→1 before any flush, prefill=1 then 14
- [x] PASS — inline stepper edits value, count unchanged — my happy path: set#2 → 14, count stayed 2, queued copy patched
- [x] PASS — undo enqueues `undo`, count decrements — my happy path: count 2→1; Break 4: empty-day undo safe/no-op
- [x] PASS — wall-sits seconds vs pushups reps — `todayModel`/`todayController` tests + my Extra probe (unit=seconds vs reps)
- [x] PASS — binary check/uncheck + long-press skip, color reflects `binaryDayState` — my happy path: green→skip→green state transitions
- [x] PASS — measurement submit enqueues `measure` — my happy path: pushup_max 47, row never red
- [x] PASS — queue survives force-close + failing-then-succeeding = exactly once — `test/data/sync.test.mjs`; my Break 1 (mid-batch death, no double-insert) + Extra force-close recovery
- [x] PASS — only scheduled habits render + date switcher backfill re-render — my happy path (yesterday backfill) + Extra empty-state (Mon-only rules on Thursday → 0 rows)
- [x] PASS — empty state + unconfigured-token setup prompt — Extra empty-state probe + Break 5 (setupPrompt before any request)
- [x] PASS — `make unit-tests` passes (160/0); `make tests` exits 0 — reproduced
- [ ] [HUMAN] live backend: ＋ Pushups → row in Sheet <30s, force-close no loss — Awaiting human verification (needs #001 live Google Apps Script deploy; genuinely unattemptable locally — `make integration-tests` is a no-op, no live endpoint exists). Runbook in AC text is complete: tap ＋ Pushups, confirm instant count, confirm row within 30s, force-close, reopen, confirm single row.
- [ ] [HUMAN] live backend: Wall-sits records a `seconds` value — Awaiting human verification (same live-deploy dependency). Runbook complete.
- [ ] [HUMAN] airplane-mode: log 3 sets offline → land exactly once — Awaiting human verification (needs live deploy + a real phone in airplane mode). Runbook complete: open once to cache, airplane mode, log 3, reconnect, confirm exactly 3 rows.

**Evidence**
```
$ make pre-commit
ℹ tests 160
ℹ pass 160
ℹ fail 0
$ make tests ; echo exit=$?
exit=0
$ node e2e_happy.mjs   → HAPPY PATH DONE, exitCode= 0 (exact batch [set,set,undo,check,skip,check,measure,set], 8 unique v4 uuids)
$ node e2e_break.mjs   → BREAK PATHS DONE, exitCode= 0 (mid-batch idempotency, corrupt-queue recovery, distinct ids, empty-undo, creds)
$ node e2e_extra.mjs   → EXTRA DONE, exitCode= 0 (units, force-close recovery, empty state)
$ curl 15 assets       → all HTTP 200, correct content-types
```

**Other issues found**
- None blocking. Notes for later (not defects, not AC): (1) editing a set's value AFTER its batch has flushed is a no-op on the server — there is no `update` event kind in v1 (SWE flagged; out of scope). (2) `ts` is UTC ISO; fine for intra-date ordering, flagged by SWE for any future local-wall-clock view. (3) `console.warn` in app.js glue on bootstrap-refresh failure is appropriate (passes the error, no framework logger in a no-build static app).

**VERDICT: PASS**
