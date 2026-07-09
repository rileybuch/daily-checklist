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

- [ ] On first load with no stored token, the app prompts once for the shared secret + Web App URL and persists them to `localStorage`; subsequent loads don't re-prompt — unit/integration tested with a fake `localStorage`.
- [ ] The API client attaches `token` to every request and targets the correct endpoint/verb — unit-tested with a fake transport (5 endpoints).
- [ ] Tapping ＋ on a counter habit enqueues one `set` event with a client-generated UUID `event_id` and the value pre-filled from the previous set of that habit; the on-screen count increments immediately (before any network call) — unit/DOM tested.
- [ ] The inline stepper edits the just-logged set's `value` without adding or removing a set (count unchanged) — tested.
- [ ] The undo affordance enqueues an `undo` of the last set and the count decrements immediately — tested.
- [ ] Wall-sits log a `set` whose `value` is treated as **seconds** (per `unit`), Pushups as **reps** — tested that the enqueued event/unit differ appropriately.
- [ ] Binary tap enqueues `check`/`uncheck`; long-press/secondary control enqueues `skip`; the cell color reflects `binaryDayState` — tested.
- [ ] Measurement submit enqueues a `measure` event with the entered value — tested.
- [ ] The outbound queue survives a simulated force-close: events enqueued but not yet flushed remain in `localStorage` and are re-sent on the next open; a failing-then-succeeding transport results in each `event_id` posted until acknowledged, with no duplicates after success — unit-tested against the fake transport + fake `localStorage`.
- [ ] Only habits scheduled for the selected date render; the date switcher changes the selected date and re-renders using the new date's schedule (backfill) — DOM tested.
- [ ] Empty state ("Nothing scheduled") and unconfigured-token setup prompt render instead of a blank/broken screen — DOM tested.
- [ ] `make unit-tests` passes with all new tests, 0 failures. `make tests` exits 0.
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
