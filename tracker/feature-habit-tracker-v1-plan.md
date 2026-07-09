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
