# Feature Plan: Daily Checklist Habit Tracker v1

## Summary

Deliver SPEC.md's v1: a mobile-first, no-build-step static PWA (vanilla JS ES modules, GitHub Pages-ready) backed by a Google Apps Script JSON API writing to a Google Sheet. Supports three habit types — binary, counter (per-set reps/seconds values judged against a daily **set** target), and measurement — with dated `target_rules` that schedule targets by day-of-week and week parity, append-only events with client-generated IDs, and an offline outbound queue. Views: Today, Week grid, Trends, Stats, Manage, plus PWA install polish. Because agents have no access to Riley's Google account, the Apps Script backend is authored as plain testable JS (pure core + fakeable adapter) and every live-deployment/round-trip check is marked `[HUMAN]` with a step-by-step runbook.

## Tasks (in order)

1. **#000** — Project Bootstrap & Test Harness — no-build static skeleton (`app/`, `backend/`, `test/`), zero-dep `node --test` runner, dev-only `package.json`, `Makefile` mapping the process hooks, static serve script.
2. **#001** — Apps Script JSON API Backend (M1) — the five endpoints + token auth + `event_id` idempotency + validation as a pure core driven by an injected store, thin `SpreadsheetApp`/`ContentService` adapter, `FakeStore` unit tests, `DEPLOY.md`; live deploy/round-trip `[HUMAN]`. Depends on #000.
3. **#002** — Domain Core: Derivation & Target Resolution — pure ES-module logic for week parity, `target_rules` resolution (most-specific-wins + parity + newest-`effective_from` tie-break), event derivation, day states, streaks & completion; exhaustively unit-tested (carries SPEC AC #3 and #4). Depends on #000.
4. **#003** — Today View + Optimistic Logging & Offline Queue (M2) — data/sync layer (token bootstrap, injectable API client, `localStorage` outbound queue with idempotent retry) + Today UI (binary toggle/skip, counter ＋ with pre-filled editable per-set value + inline stepper + undo, measurement field, date-switch backfill). App becomes daily-usable. Reaches SPEC AC #2, #6. Depends on #001, #002.
5. **#004** — Week Grid & Backfill Navigation (M3) — Sun–Sat Way-of-Life grid with binary color states and counter `n/target` coloring, scheduled-rest handling, week paging, backfill path. Depends on #002, #003.
6. **#005** — Trends & Stats Views (M4) — per-habit charts (binary completion %/heatmap; counter sets-vs-target-at-the-time, rolling average, weekly total, per-set volume; measurement progression line) and streak/completion stats; resolves the chart-lib open question under a no-build constraint. Reaches SPEC AC #5. Depends on #002, #003.
7. **#006** — Manage Habits & Target Rules (M5) — add/edit/archive habits (immutable slug + type, conditional unit) and add/edit target rules with a plain-language weekly preview; target changes append a forward-dated rule. Depends on #001, #002, #003.
8. **#007** — PWA Polish: Manifest, Service Worker, Install (M6) — web app manifest, iOS install meta tags, static icons, versioned service worker precaching the shell (bypassing the Apps Script data calls), install docs. Reaches SPEC AC #1 and the shell half of #6. Depends on #003.

## Out of scope (intentional)

- Everything in SPEC Section 8: program-awareness (auto-computing targets from test maxes), reminders/notifications, multi-user/auth beyond the shared-secret token, native app, Apple Health integration, and **per-set value targets** (targets are set counts; reps/seconds are recorded and charted but nothing turns red for a light set).
- OAuth — the accepted trade-off is a single shared-secret token in `localStorage` (SPEC Section 2).
- True concurrency control — single user, last-write-wins (SPEC Section 2).
- Any agent-run live Google verification — agents have no access to Riley's Google account, so live Sheet creation, Web App deployment, and round-trip confirmation are `[HUMAN]` criteria in #001, #003, #004, #006, #007 with exact instructions. No task pretends to verify a live round-trip.

## Notes for the orchestrator

- **Base branch is `dev`** for this feature (not `main`).
- **No build step, ever** — the served app is plain static files; `package.json` is dev-only (`node --test`, serve script) and never required to run the app. This is a hard constraint restated in every task.
- **Tests** use Node's built-in `node --test` (zero dependencies). Frontend logic is authored as ES modules so the same files run under `node --test` and load in the browser.
- **`[HUMAN]` criteria** are the only path to verifying live Google behavior. The orchestrator should surface these to Riley at the end of the run rather than treating them as agent-blocking — the automated tests cover the mechanics against fakes.
- This project **opted out of ADRs and a glossary** — none exist, none are created (confirmed: no `docs/adr/`, no `docs/glossary.md`).

## Documentation updates (this grooming round)

Not applicable — this project opted out of ADRs and a glossary (`docs/adr/` and `docs/glossary.md` do not exist). No new terms or ADRs were authored; SPEC.md remains the source of truth for scope and vocabulary.

## Open questions

- None blocking plan approval. SPEC Open Question 1 (chart library: hand-rolled SVG vs. CDN lib) is deferred to #005 as designed and delegated to the SWE under the no-build-step constraint; it does not gate the plan.

## Log

### [PM] 2026-07-09 21:30 — Feature Acceptance Review

**VERDICT: ACCEPT**

Reviewed all 8 task records (SWE + Tester evidence), read the user-facing source, and independently drove the real `?demo=1` module chain (demoTransport → apiClient → queue → sync → controllers → views) headlessly through the fake-DOM shim. `make unit-tests` reproduced: 307 pass / 0 fail.

Walked Riley's journeys (a)–(g), each rendered from the real modules:
- (a) Today shows the 5 scheduled habits with live `n/target sets` and a friendly "Today · Fri Jul 10" header; empty state copy present ("Nothing scheduled for this day.").
- (b) ＋ on Pushups increments the count instantly (2→3) before any network call, pre-fills reps from the previous set (11), the inline stepper edits the value (11→12) without changing the count, and undo decrements (3→2). All optimistic.
- (c) Wall-sits ＋ logs a set with `unit === "seconds"` (value 35) — reps/seconds disambiguation confirmed.
- (d) Week grid renders Sun–Sat headers, "This week · Jul 5 – 11", correct `n/target` text and color-state classes (counter amber/green/red, binary green/skip, measurement neutral) matching the GTG schedule.
- (e) Trends picker lists all 5 habits; Pushups → 5 SVG chart cards (daily-vs-target bars, rolling-avg line, weekly total, volume); Pushup max → Progression line chart with 4 circles + 1 polyline (**SPEC AC #5**); Bible Study → weekly completion % + heatmap.
- (f) Stats renders a card per habit (Bible Study streak 6/best 6; measurement card shows dashes — no daily state).
- (g) Manage adds a habit (slug auto-derived `dips`), appends a forward-dated target rule (pushups 1→2 rules, old rule preserved), live weekly preview, and rejects duplicate slug + inverted date range with clear messages.

**[HUMAN] criteria are correctly scoped, not failures.** Every live-Google / on-device criterion (SPEC AC #1 <3s cellular; the "row in the Sheet" halves of AC #2/#6; AC #7 legibility) is device-bound and has a complete copy-paste runbook: `backend/DEPLOY.md` (Sheet setup, deploy, curl smoke tests for token-auth 401, idempotency skip, legibility) and `docs/INSTALL.md` (Add to Home Screen, offline, release rollout). The logic underneath each is unit-verified: offline-queue idempotency (`sync.test`, force-close recovery), target resolution + 14-day GTG vectors (`targets.test`), streak/completion math (`stats.test`), SW precache list + `/exec` bypass (`sw-precache.test`).

**Follow-up candidates (not defects, not grounds for reject — noted for a future round):**
1. Completion %/streaks judge every scheduled past day, so a rule whose `effective_from` predates a habit's first event counts pre-start days as misses (visible as low demo 30/90-day %s). SPEC-consistent locked #002 semantics; a "floor completion at first event" option would be a separate #002 change (flagged by SWE + Tester).
2. `unskip` is a valid SPEC §3 event kind but `binaryDayState` ignores it; the Today UI never emits `unskip` (tap toggles out of skip), so it is unreachable, not user-facing.
3. `DEPLOY.md` §4.2 (computing the token hash) is slightly convoluted though it provides a working `_printMyHash` snippet — a doc-polish nit.

### [PR Reviewer] 2026-07-09 22:10 — Review (rollup)

**VERDICT: BLOCKERS**

Read the entire diff (91 files, ~11,757 lines) against `git merge-base HEAD origin/dev`. Re-ran `node --test`: 307 pass / 0 fail. Reviewed all four dimensions (E skipped — no `docs/adr/` or `docs/glossary.md`). Backend token auth / hand-rolled SHA-256 / input validation / event_id idempotency, the SW `/exec` cache-bypass, and the domain core (target resolution, streak/completion, component-wise ISO date math) are all sound. Accepted SPEC trade-offs (shared-secret auth, last-write-wins, pre-first-event completion semantics, unreachable `unskip`, per-set value targets) were NOT filed as Blockers.

Filed rollup task: `tracker/008-pr-review-rollup.groomed.md`.

Blockers: 2 — both real-browser runtime bugs in `app/js/views/manage.js` (DOM-API misuse: assigning to getter-only `element.children` throws in strict-mode ES modules; `querySelectorAll(...).filter/.map` throws because `NodeList` has neither). Both are masked green by `test/helpers/domStub.mjs` (writable `children`, `Array`-returning `querySelectorAll`) — which is also why the PM's fake-DOM walkthrough of Manage passed. Confirmed the strict-mode `TypeError`s with an isolated repro. The Manage screen (SPEC view 5 / task #006) is non-functional on-device as shipped.

Nits: 3 — unguarded `JSON.parse` at the Apps Script POST boundary; repeated `voidedEventIds` rescans on the stats cold path; the `domStub` divergence that hid both Blockers.

Pipeline re-runs from inner loop on rollup #008; re-invoke me after PM ACCEPT + re-push.

All acceptance criteria verified from the user's POV. If Riley opens this right now (in demo mode, or after following the runbooks for live sync), he will be satisfied. SWE may commit.
