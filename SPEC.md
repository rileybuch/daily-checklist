# Daily Checklist — Project Spec

**Status:** Draft v1 — 2026-07-08
**Owner:** Riley
**Decisions locked:** static app + Google Sheets backend · scheduled targets (no program logic) · per-set event logging · all four trend views · week starts Sunday · each set logs a value (reps or seconds)

## 1. Problem & Goal

Replace two tools with one:

1. **Way of Life** (iPhone app) — tracks binary habits as green/red/gray day cells with weekly grids and trends, but can't count anything.
2. **Printed Google Sheet** (8-week GTG calendar) — tracks sets of pushups/pullups/squats/wall-sits with day-of-week and week-alternating schedules, but is paper: no history, no trends, no averages.

The app is a **mobile-first web app** (added to the iPhone home screen) that tracks **binary habits**, **counter habits** (one tap logs a set with its reps or seconds, counted toward a daily set target), and **measurement habits** (record a value, e.g. tested max reps), with all data persisted in a **Google Sheet in Riley's Drive**.

Single user. No accounts, no social features, no notifications in v1.

## 2. Architecture

```
iPhone Safari (PWA)                      Riley's Google Drive
┌─────────────────────┐    HTTPS/JSON   ┌──────────────────────┐
│ Static SPA           │ ──────────────▶│ Apps Script Web App   │
│ GitHub Pages         │ ◀────────────── │  (execute-as-owner)   │
│ HTML/CSS/vanilla JS  │                 │        │              │
│ manifest + SW cache  │                 │        ▼              │
└─────────────────────┘                 │ Google Sheet (data)   │
                                        └──────────────────────┘
```

- **Frontend:** static single-page app, no build step required (vanilla JS + a small chart lib, or Preact via CDN — decide at implementation). Hosted on GitHub Pages from this repo. Web app manifest + service worker so it installs to the home screen and the shell loads offline.
- **Backend:** Google Apps Script deployed as a Web App, **Execute as: me / Access: anyone with the link**, exposing a small JSON API over `doGet`/`doPost`. All requests carry a shared-secret token; requests without it are rejected.
- **Storage:** one Google Sheet with append-only event rows plus small config tabs. The sheet itself stays human-readable — it doubles as the export format and the escape hatch if the app dies.

### Security model (accepted trade-off)

Auth is a single shared-secret token baked into the client after a one-time prompt (stored in `localStorage`). Anyone with the token can read/write habit data — acceptable for a single-user personal tracker containing no sensitive data. No OAuth in v1.

### Known constraints (accepted)

- Apps Script round-trip latency is ~0.5–2 s. The UI must be **optimistic**: taps update the screen instantly and sync in the background.
- Apps Script daily quotas (20k URL-fetch-free `doPost` calls/day for consumer accounts) are far above expected volume (~30–60 events/day).
- No true concurrency control; single user makes conflicts unlikely. Last write wins.

## 3. Data Model (Sheet tabs)

### `habits`

| column | type | notes |
|---|---|---|
| habit_id | string | slug, immutable (`pushups`, `bible_study`) |
| name | string | display name |
| type | enum | `binary` \| `counter` \| `measurement` |
| unit | string | unit of the per-set value for counters (`reps` for pushups/pullups/squats, `seconds` for wall-sits), unit of the recorded value for measurements; blank for binary. Counter daily targets are always in **sets**. |
| sort_order | int | display order |
| active | bool | archived habits keep history but leave the checklist |
| created_at | ISO date | |

### `target_rules`

Targets are resolved per habit per date from ordered rules — this is what replaces the printed calendar's day-of-week and alternating-Saturday structure without the app knowing what a "program" is.

| column | type | notes |
|---|---|---|
| rule_id | string | |
| habit_id | string | |
| days | string | comma list `mon,tue,...` or `*` |
| week_parity | enum | `even` \| `odd` \| `*` (parity of weeks elapsed since `anchor_date` in `config`) |
| target | int | daily target; `0` = scheduled rest (not shown as failure) |
| effective_from | ISO date | rule applies from this date forward |
| effective_to | ISO date | blank = open-ended |

**Resolution:** for a given habit and date, take rules in scope (`effective_from ≤ date ≤ effective_to`), most specific wins (exact day beats `*`; parity match beats `*`); newest `effective_from` breaks ties. No matching rule → habit not scheduled that day (shown gray, excluded from streaks). Riley updates targets manually after a test day by adding a new rule with `effective_from` = next day — full target history is preserved, so old days are always judged against the target that applied *then*.

Binary habits use the same table with `target = 1` to express scheduling (e.g. "No Alcohol" every day, "Flossing" daily, a Sunday-only habit).

### `events` (append-only)

| column | type | notes |
|---|---|---|
| event_id | uuid | client-generated (enables idempotent retry) |
| ts | ISO datetime | client local time |
| date | ISO date | the checklist day the event belongs to (supports backfill) |
| habit_id | string | |
| kind | enum | `set` \| `check` \| `uncheck` \| `skip` \| `unskip` \| `measure` \| `undo` |
| value | number | per-set value for `set` (reps or seconds, per the habit's `unit`), measured value for `measure`, blank otherwise |
| undo_of | uuid | for `undo`: the event being voided |

**Derivation rules (computed client-side from events):**
- Counter habit daily count = number of non-voided `set` events for that date, judged against the target **in sets**. Per-set `value`s (reps/seconds) feed trend views (total volume per day, average per set) but not target completion.
- Binary habit day state = last non-voided `check`/`uncheck`/`skip` event for that date; no event → *missed* if scheduled and date is past, *pending* if today.
- `skip` = the Way of Life hatched cell: excluded from both streak breaks and completion-rate denominators.
- Measurement habits plot `measure` values over time; no daily state.

### `config`

Key–value tab: `anchor_date` (defines week-parity phase and week numbering), `week_start` (fixed to `sun` — weeks run Sun–Sat, matching the printed calendar), `secret_token_hash`.

## 4. API (Apps Script Web App)

All JSON. `token` required on every call.

| endpoint | verb | purpose |
|---|---|---|
| `/bootstrap` | GET | habits + target_rules + config + last N days of events, one call to open the app |
| `/events?since=date` | GET | incremental event fetch |
| `/events` | POST | append a batch of events (array; idempotent on `event_id`) |
| `/habits` | POST | create/update a habit |
| `/rules` | POST | create/update a target rule |

Client keeps an outbound queue in `localStorage`; events post in batches and survive a dead connection at the gym (retry on next open/regained connectivity). This gives ~80 % of local-first behavior without the sync engine.

## 5. Views

1. **Today (default, the daily driver)**
   - One row per scheduled habit, ordered by `sort_order`.
   - Binary: single tap toggles green/red; long-press (or secondary control) = skip.
   - Counter: big **＋** button — one tap logs one set **immediately**, with its value (reps or seconds) pre-filled from the previous set of that habit (first set of the day: last-used value). An inline stepper on the just-logged set lets you adjust the value without blocking or delaying the log. Progress shown as `4 / 6 sets` with a fill bar; a small − / undo affordance voids the last set.
   - Measurement habits appear with a "record value" field only (they are never red).
   - Date switcher to backfill yesterday.

2. **Week grid (Way of Life style)**
   - Rows = habits, columns = Sun–Sat of the current week.
   - Binary: green / red / gray-hatched (skip) / light gray (unscheduled or future).
   - Counter: cell shows `n/target`, colored green when target met, amber when partial, red when 0 on a scheduled past day.
   - Swipe/arrows to page through past weeks.

3. **Trends (per habit)**
   - Binary: completion % by week (bar/line), calendar heatmap.
   - Counter: daily sets vs. target-at-the-time, 7-day rolling average, weekly total; plus volume trends from per-set values (total reps/seconds per day, average per set).
   - Measurement: value over time (this is the test-day max progression chart).

4. **Stats**
   - Per habit: current streak, best streak, completion % over 30/90 days (skips excluded from denominator).

5. **Manage**
   - Add/edit/archive habits; edit target rules with a preview ("this week: Mon–Fri 6, Sat 3, Sun rest").

## 6. Success Criteria (v1 acceptance)

1. From an iPhone home-screen icon, the Today view is interactive in < 3 s on cellular.
2. Tapping ＋ on Pushups updates the count instantly and logs a set with an editable reps value (pre-filled from the previous set); the event row appears in the Google Sheet within 30 s; force-closing the app immediately after tapping does not lose the event (queued & re-sent on next open). Same flow on Wall-sits captures seconds instead of reps.
3. Riley's current GTG schedule is fully expressible in `target_rules`: Mon–Fri 6 sets (4 for wall-sits), alternating Saturdays 3 sets (2 for wall-sits) vs. 0, Sunday 0 — verified by the week-grid rendering matching the printed calendar for Weeks 1–2.
4. A binary habit ("Bible Study") shows the correct green/red/skip cells for a seeded week of events, and streak math matches hand computation.
5. Recording four "Pushup max" measurements renders a progression line chart.
6. Airplane-mode test: open app (shell loads from cache), log 3 sets, reconnect → events appear in the sheet exactly once.
7. All data is visible and legible directly in the Google Sheet with no tooling.

## 7. Milestones

1. **M1 — Sheet + API:** create Sheet schema, Apps Script endpoints, token auth; verify with `curl`.
2. **M2 — Today view:** bootstrap load, optimistic logging, offline queue. *(App is daily-usable here — retire the printout.)*
3. **M3 — Week grid** + backfill.
4. **M4 — Trends & stats** charts.
5. **M5 — Manage screens** (until then, habits/rules are edited directly in the Sheet — which is fine, it's a spreadsheet).
6. **M6 — PWA polish:** manifest, icons, service worker, install instructions.

## 8. Out of Scope (v1)

- Program awareness (auto-computing targets from test maxes), reminders/notifications, multi-user/auth beyond the token, native app, Apple Health integration, per-set value targets (targets are set counts; reps/seconds are recorded and charted but nothing turns red for a light set).

## 9. Open Questions

1. Chart library: hand-rolled SVG vs. a CDN lib (uPlot/Chart.js) — decide at M4; no build step either way.

### Resolved (2026-07-08)

- **Week start:** Sunday (Sun–Sat weeks, matching the printed calendar).
- **Wall-sits:** a counter habit like the others; per-set value is seconds instead of reps.
- **Per-set values:** every set log captures a value (reps or seconds). One tap still logs the set immediately; the value is pre-filled and editable inline.
