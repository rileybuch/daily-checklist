# Apps Script JSON API Backend (M1)

Status: pending
Tags: `backend`, `api`, `data`
Depends on: #000
Blocks: #003, #006

## Scope

Implement SPEC Milestone 1 — the Google Apps Script Web App JSON API — as **plain, testable JavaScript in this repo**. Agents have no access to Riley's Google account, so the code is structured as pure functions (routing, validation, token auth, idempotency, row<->object mapping) plus a **thin adapter layer** around `SpreadsheetApp`/`ContentService` that is faked in unit tests. Live deployment and any live round-trip verification are marked `[HUMAN]` with exact instructions.

Follow SPEC Sections 3 (data model), 4 (API), and 2 (security model). All files live under `backend/`.

**Sheet schema (documented + created by adapter setup, verified [HUMAN]):** tabs `habits`, `target_rules`, `events`, `config` with exactly the columns listed in SPEC Section 3, header row first. Provide a `setupSheet()` function (in the adapter layer) that creates the four tabs with headers if missing — Riley runs it once from the Apps Script editor.

**Pure core (fully unit-tested, no Google globals):**
- `handleRequest(request, store)` — dispatches on method + path to the handlers below. `request` = `{ method, path, query, body }`; `store` = injected data-access object (the fake in tests, the real Sheet adapter in production).
- **Token auth:** every request must carry `token`; compare against the configured secret (compare a hash of the provided token to `config.secret_token_hash`, matching SPEC). Missing/invalid token → `{ status: 401, body: { error: "unauthorized" } }`. Never leak whether the token was missing vs wrong beyond a generic message.
- `GET /bootstrap` → `{ habits, target_rules, config (secret hash omitted), events: <last N days, default 30> }`.
- `GET /events?since=<ISO date>` → events with `date >= since`.
- `POST /events` → body is an **array** of event objects; append-only; **idempotent on `event_id`** (an `event_id` already present in the sheet is skipped, not duplicated); returns `{ inserted: [ids], skipped: [ids] }`.
- `POST /habits` → create or update a habit by `habit_id` (upsert).
- `POST /rules` → create or update a target rule by `rule_id` (upsert).
- **Validation:** reject malformed payloads with `{ status: 400, body: { error, detail } }` — unknown habit `type`, missing required fields, `event.kind` not in the allowed enum, non-numeric `value` on `set`/`measure`. Validation lives in pure functions.
- **Response shaping:** a pure function turns `{ status, body }` into whatever the adapter hands to `ContentService` — keep `ContentService`/`SpreadsheetApp` out of the pure layer.

**Adapter layer (`backend/adapter.gs.js` or similar, thin, not unit-tested against live Google):**
- `doGet(e)` / `doPost(e)` entrypoints that parse the Apps Script event object into the pure `request` shape, build a real `store` backed by `SpreadsheetApp`, call `handleRequest`, and return via `ContentService.createTextOutput(JSON).setMimeType(JSON)`.
- A `SheetStore` implementing the same interface the fake implements: `getHabits()`, `getRules()`, `getConfig()`, `getEvents(sinceDate)`, `appendEvents(rows)`, `upsertHabit(h)`, `upsertRule(r)`.
- `setupSheet()` as described above.

**Test double:** an in-memory `FakeStore` (in `test/`) implementing the store interface over plain arrays, used to unit-test the entire pure core including idempotency and auth.

**Docs:** `backend/DEPLOY.md` — copy-paste-able, numbered deployment runbook for Riley (see `[HUMAN]` criteria). Include the exact `curl` commands to smoke-test each endpoint against his deployed URL.

## Acceptance Criteria

- [ ] `handleRequest` dispatches all five endpoints (`GET /bootstrap`, `GET /events`, `POST /events`, `POST /habits`, `POST /rules`) — unit-tested against `FakeStore`.
- [ ] A request with a missing or wrong `token` returns status 401 with a generic error body, for every endpoint — unit-tested.
- [ ] `POST /events` with a batch containing a duplicate `event_id` (already in the store) inserts new ids once and reports the duplicate under `skipped`; the store contains exactly one row per unique `event_id` — unit-tested.
- [ ] `GET /bootstrap` returns habits, target_rules, config (with `secret_token_hash` omitted), and events from the last 30 days — unit-tested.
- [ ] `GET /events?since=2026-07-01` returns only events with `date >= 2026-07-01` — unit-tested.
- [ ] Malformed payloads (bad `type`, bad `kind`, non-numeric `value` on `set`, missing required field) return status 400 with an error detail — unit-tested, at least 4 distinct cases.
- [ ] `POST /habits` and `POST /rules` upsert by id (insert when new, replace when the id exists) — unit-tested.
- [ ] The pure core imports no Google globals (`SpreadsheetApp`, `ContentService`, `Utilities`) — those appear only in the adapter file. Verified by grep in the test or a lint assertion.
- [ ] `backend/DEPLOY.md` exists with numbered steps and copy-paste `curl` smoke tests.
- [ ] `make unit-tests` passes with the new backend tests included, 0 failures.
- [ ] [HUMAN] Create the Google Sheet in Drive, open Extensions → Apps Script, paste the `backend/` code, run `setupSheet()` once (creates the 4 tabs with headers), set `anchor_date`, `week_start=sun`, and `secret_token_hash` in the `config` tab.
- [ ] [HUMAN] Deploy → New deployment → type "Web app", Execute as "Me", Access "Anyone with the link"; copy the `/exec` URL.
- [ ] [HUMAN] Run the `curl` smoke tests from `DEPLOY.md`: a `GET /bootstrap` with the correct token returns 200 JSON with the four sections; the same call with a wrong token returns 401; a `POST /events` with one event returns `inserted:[id]` and the row is visible in the `events` tab of the Sheet.
- [ ] [HUMAN] Confirm the four tabs and their rows are legible directly in the Sheet with no tooling (SPEC AC #7).

## User Stories

### Story: An agent verifies routing and auth without any Google access
1. The agent runs `make unit-tests`.
2. Tests construct a `FakeStore` seeded with 2 habits, 3 rules, and 5 events.
3. `handleRequest({ method:"GET", path:"/bootstrap", query:{token:"good"} }, store)` returns status 200 and a body with `habits`, `target_rules`, `config`, `events`, and no `secret_token_hash`.
4. The same call with `token:"wrong"` returns status 401.

### Story: The client retries a batch after a dropped connection (idempotency)
1. A test calls `POST /events` with `[{event_id:"A",...},{event_id:"B",...}]` → response `{inserted:["A","B"],skipped:[]}`.
2. The same batch is posted again (simulating a retry) → response `{inserted:[],skipped:["A","B"]}`.
3. The store contains exactly one row each for `A` and `B`.

### Story: The API rejects garbage
1. A test posts an event with `kind:"frobnicate"` → status 400, error mentions the invalid kind.
2. A test posts a `set` event with `value:"lots"` → status 400, error mentions the non-numeric value.
3. A test posts a habit with `type:"quantum"` → status 400.

### Story: [HUMAN] Riley deploys the backend and smoke-tests it live
1. Riley follows `backend/DEPLOY.md`: creates the Sheet, pastes the code, runs `setupSheet()`, fills `config`.
2. Riley deploys the Web App (Execute as me, Anyone with the link) and copies the `/exec` URL.
3. Riley runs the `curl` bootstrap smoke test with his token → 200 JSON; with a bad token → 401.
4. Riley posts one test event via `curl` and sees the row appear in the `events` tab of his Sheet.

---

Blocked by: #000

## Log

### [PM] 2026-07-08 12:05 — Grooming

**Summary**
SPEC M1 backend, authored as plain testable JS in `backend/`: pure routing/validation/auth/idempotency core driven by an injected store, plus a thin `SpreadsheetApp`/`ContentService` adapter. All logic unit-tested against an in-memory `FakeStore`; live deploy + round-trip are `[HUMAN]`.

**Key decisions**
- Agents have no Google access, so the pure/adapter split is mandatory — Google globals confined to the adapter file, everything else unit-tested with a fake. This is the crux of making M1 verifiable in CI.
- Idempotency on `event_id` and token auth are first-class, unit-tested behaviors (SPEC AC #2, #6 depend on them downstream).
- Live Sheet creation, Web App deployment, and the curl round-trip are `[HUMAN]` with a copy-paste runbook in `backend/DEPLOY.md`; no task pretends to verify a live round-trip.

**Dependencies**
- #000 — needs the repo skeleton, `backend/` dir, and `node --test` harness.

**User stories**
- 4 stories covering routing/auth, idempotent retry, validation rejection, and the [HUMAN] live deploy/smoke test.

**Open questions**
- None. Token-hash comparison detail (hash vs plaintext) left to SWE within SPEC's `secret_token_hash` intent.

Ready for implementation.
