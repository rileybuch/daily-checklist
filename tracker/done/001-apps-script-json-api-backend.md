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

- [x] `handleRequest` dispatches all five endpoints (`GET /bootstrap`, `GET /events`, `POST /events`, `POST /habits`, `POST /rules`) — unit-tested against `FakeStore`.
- [x] A request with a missing or wrong `token` returns status 401 with a generic error body, for every endpoint — unit-tested.
- [x] `POST /events` with a batch containing a duplicate `event_id` (already in the store) inserts new ids once and reports the duplicate under `skipped`; the store contains exactly one row per unique `event_id` — unit-tested.
- [x] `GET /bootstrap` returns habits, target_rules, config (with `secret_token_hash` omitted), and events from the last 30 days — unit-tested.
- [x] `GET /events?since=2026-07-01` returns only events with `date >= 2026-07-01` — unit-tested.
- [x] Malformed payloads (bad `type`, bad `kind`, non-numeric `value` on `set`, missing required field) return status 400 with an error detail — unit-tested, at least 4 distinct cases.
- [x] `POST /habits` and `POST /rules` upsert by id (insert when new, replace when the id exists) — unit-tested.
- [x] The pure core imports no Google globals (`SpreadsheetApp`, `ContentService`, `Utilities`) — those appear only in the adapter file. Verified by grep in the test or a lint assertion.
- [x] `backend/DEPLOY.md` exists with numbered steps and copy-paste `curl` smoke tests.
- [x] `make unit-tests` passes with the new backend tests included, 0 failures.
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

### [SWE] 2026-07-08 23:10 — Implementation

**Files created**
- `backend/core.gs.js` — pure core (plain-script style + CommonJS export guard): `handleRequest` routing, token auth, all five handlers, validation, `shapeResponse`, and a self-contained pure-JS `sha256Hex`. No Google globals.
- `backend/adapter.gs.js` — thin Google layer: `doGet`/`doPost`, `SheetStore` (over the bound Sheet), `setupSheet()`, `computeTokenHash()`. The only file referencing `SpreadsheetApp`/`ContentService`/`Logger`. Not unit-tested against live Google.
- `backend/DEPLOY.md` — numbered [HUMAN] runbook (create Sheet → paste code → `setupSheet()` → config → deploy → `curl` smoke tests incl. idempotency) + endpoint reference.
- `test/backend/fake_store.js` — in-memory `FakeStore` implementing the store interface over arrays (returns copies).
- `test/backend/core.test.js` — full pure-core suite: dispatch, auth (401 for every endpoint, no missing-vs-wrong leak), idempotency (retry + intra-batch dedupe), bootstrap shape (hash omitted, 30-day window), `?since` filter, ≥4 validation cases, upserts, response shaping.
- `test/backend/sha256.test.js` — verifies `sha256Hex` against `node:crypto` for empty/ASCII/long/multibyte inputs (the safety net for the hand-rolled SHA-256).
- `test/backend/purity.test.js` — grep guard: core references no Google globals in code (comments/strings stripped); core importable in plain Node.
- `backend/.gitkeep` — removed (dir now has real files).

**Key decisions**
- **Pure/adapter split via plain-script + CommonJS guard.** Core uses `var`/`function` top-level declarations (Apps Script globals) with `if (typeof module !== "undefined") module.exports = {...}` at the bottom (skipped in Apps Script, active in Node). One source, both runtimes.
- **Token hashing = pure-JS SHA-256, not `Utilities.computeDigest`.** The AC forbids `Utilities` in the core, and Node + Apps Script must produce identical digests for auth to work. A self-contained FIPS 180-4 SHA-256 does that; correctness is proven against `node:crypto`. `computeTokenHash()` in the adapter reuses the same function so Riley's config hash and the request-path hash always match. This is within the PM's "hash vs plaintext left to SWE" note — not an architectural fork.
- **Idempotency lives in the pure core** (reads existing `event_id`s, dedupes across the batch too), so the store stays a dumb append. Unit-tested per SPEC.
- **Apps Script can't set HTTP status** → `shapeResponse` folds the logical status into the JSON body (`{status, ...body}`); real transport is always 200. Documented in DEPLOY.md.
- Path routing via `e.pathInfo` (`.../exec/bootstrap`) with `?path=` fallback.

**Tests**
- Unit: 52 passing, 0 failing — `make unit-tests` output below.
- Integration: N/A — backend integration requires live Google deploy (Makefile `integration-tests` is the documented no-op; live round-trip is the [HUMAN] `curl` block in DEPLOY.md).

**Acceptance criteria**
- [x] Dispatch all five endpoints — `test/backend/core.test.js` (5 dispatch tests + 404).
- [x] Missing/wrong token → 401 generic, every endpoint — parametrized over all 5 × {missing, wrong} + no-leak test.
- [x] Idempotent `POST /events` (retry + one row per id) — `::POST /events is idempotent...`, `...dedupes duplicate ids within a single batch`, `...skips an id already present`.
- [x] Bootstrap shape (hash omitted, 30-day events) — `::GET /bootstrap omits secret_token_hash...`, `...returns only events from the last 30 days`.
- [x] `GET /events?since` filter — `::GET /events?since returns only events with date >= since`.
- [x] Malformed → 400, ≥4 cases — bad kind, non-numeric set value, missing field, non-array body, non-numeric measure, bad habit type, missing name, non-numeric target, bad week_parity (9 cases).
- [x] Upsert habits & rules by id — `::POST /habits inserts...then updates in place`, `::POST /rules inserts...then updates in place`.
- [x] Pure core no Google globals — `test/backend/purity.test.js` (comment/string-stripped grep).
- [x] `backend/DEPLOY.md` with numbered steps + `curl` smoke tests — present.
- [x] `make unit-tests` passes, 0 failures — 52/0.
- [ ] [HUMAN] Create Sheet, paste code, run `setupSheet()`, fill `config` — NOT RUN: no access to Riley's Google account. Runbook = `backend/DEPLOY.md` §1–4.
- [ ] [HUMAN] Deploy Web App (Execute as me / Anyone with link), copy `/exec` URL — NOT RUN: no Google access. Runbook = DEPLOY.md §5.
- [ ] [HUMAN] Run `curl` smoke tests (200/401/insert visible in Sheet) — NOT RUN: no Google access. Runbook = DEPLOY.md §6. Request path pre-verified in Node against `FakeStore` (evidence below) so the shapes match what the live `curl` will return.
- [ ] [HUMAN] Confirm four tabs legible in the Sheet (SPEC AC #7) — NOT RUN: no Google access. DEPLOY.md §7.

**Evidence**
```
$ make unit-tests
node --test
... (52 subtests, all ✔) ...
ℹ tests 52
ℹ pass 52
ℹ fail 0
ℹ duration_ms 66.87

$ make format-fix && make lint-fix && make format-check && make lint-check && make pre-commit
format-fix / lint-fix / format-check / lint-check: no-op (exit 0)
pre-commit: node --test → tests 52  pass 52  fail 0

# E2E: request path driven exactly as adapter+curl would (FakeStore, sha256Hex(token) as config hash)
$ node scratchpad/e2e_drive.js
GET /bootstrap?token=nope            → {"status":401,"error":"unauthorized"}
GET /bootstrap?token=<good>          → {"status":200,"habits":[...],"target_rules":[...],"config":{"anchor_date":"2026-01-04","week_start":"sun"},"events":[]}   # no secret_token_hash
POST /events (evt-smoke-1)           → {"status":200,"inserted":["evt-smoke-1"],"skipped":[]}
POST /events (evt-smoke-1 retry)     → {"status":200,"inserted":[],"skipped":["evt-smoke-1"]}   # store row count for evt-smoke-1: 1
POST /events kind:"frobnicate"       → {"status":400,"error":"invalid_kind","detail":"invalid event kind: frobnicate"}
GET /events?since=2026-07-01         → {"status":200,"events":[{...evt-smoke-1...}]}
```

**Notes**
- Node v24.1.0. Zero runtime deps; tests use only `node:test`, `node:assert`, `node:crypto`, `node:fs`.
- `test/backend/fake_store.js` is a helper, not a test file, but node's default runner executes every `.js` under `test/`; it imports cleanly with no `test()` calls, so it shows as an empty passing "test file" (harmless).
- Adapter (`backend/adapter.gs.js`) is intentionally not unit-tested — it only wires Google globals to the verified core. Its behavior is verified [HUMAN] via the DEPLOY.md `curl` block.
- All four [HUMAN] criteria left unchecked with the runbook intact, per task constraints. No commit made — handing to Tester first.

### [Tester] 2026-07-08 23:55 — QA

**Test summary**
- Format / lint / pre-commit: PASS (`make format-check`/`make lint-check` are documented no-ops for this no-build static stack; `make pre-commit` = `node --test`)
- Unit tests: 52 passed / 0 failed (`make unit-tests`)
- Integration tests: N/A — documented no-op (backend needs live Google deploy; live round-trip is [HUMAN])
- Warnings: 0

**E2E adversarial pass** (drove `handleRequest` through `FakeStore` exactly as the adapter would; script + full output captured)
- Happy path: `bootstrap` (200, four sections, no `secret_token_hash`) → `POST /events [A,B]` → `{inserted:[A,B],skipped:[]}` → `GET /events?since=2026-07-01` returns A,B; store count 2. PASS
- Break 1 (auth — missing/wrong/empty token, and POST before insert): all → `{status:401,error:"unauthorized"}`; missing-body === wrong-body (no leak); 401 body carries NO habits/config/events; store still empty after unauthorized POST; server with NO hash configured fails closed → 401. PASS
- Break 2 (idempotency/replay): first `[A,B]` inserts both; exact replay → all skipped; intra-batch `[D,D]` → `inserted:[D],skipped:[D]`; store has exactly 1 row each for A/B/D. PASS
- Break 3 (malformed/garbage bodies): non-array (object/null/string/number) → 400 `invalid_body`; `[null]`/`[[]]` → 400 `invalid_event`; missing & empty-string `event_id` → 400 `missing_field`; bad kind → 400; `value:"lots"`/`NaN`/`Infinity` on set → 400 `invalid_value`; `value:0` boundary accepted; store unchanged by every rejected post. PASS
- Break 4 (habits/rules validation): `type:quantum`, array/null habit body, `target:"six"`, bad `week_parity` → 400; `target:0` rest-day rule accepted (SPEC "0 = scheduled rest"). PASS
- Break 5 (unknown route/method): auth'd `GET /nope`/`DELETE /events`/`POST /bootstrap`/case-mismatch → 404 clean JSON; **unauth `GET /nope` → 401 not 404** (no route enumeration). PASS
- Break 6 (large input): 5000-event batch → inserted 5000 in 2ms; exact replay → skipped 5000, store stays 5000 (no double-insert). PASS
- Purity guard verified to actually bite: injected `SpreadsheetApp.getActive()` into a scratchpad copy of core → the comment/string-stripped grep in `purity.test.js` correctly flagged it. The guard is not a no-op.

**Acceptance criteria**
- [x] PASS — dispatch all five endpoints — `core.test.js` 5 dispatch tests + 404; e2e confirms each.
- [x] PASS — missing/wrong token → 401 generic, every endpoint — 10 parametrized tests + no-leak test; e2e confirms 401 fires before any insert and body carries no data.
- [x] PASS — idempotent `POST /events` (retry + one row/id) — `core.test.js:203/225/237`; e2e replay + intra-batch + 5000-replay all one-row-per-id.
- [x] PASS — bootstrap shape (hash omitted, 30-day window) — `core.test.js:252/260`; e2e config has no `secret_token_hash`.
- [x] PASS — `GET /events?since` filter — `core.test.js:280` (edge date inclusive); e2e confirms.
- [x] PASS — malformed → 400, ≥4 cases — 9 test cases + ~15 more e2e cases (all reject cleanly, store untouched).
- [x] PASS — upsert habits & rules by id — `core.test.js:392/405` (insert-then-replace, count invariants).
- [x] PASS — pure core no Google globals — `purity.test.js`; independently confirmed the guard fails on an injected global.
- [x] PASS — `backend/DEPLOY.md` numbered steps + curl smoke tests — present, §1–7, curl for bootstrap 200/401, POST insert, idempotency re-post, `?since`; complete and plausible for all 4 [HUMAN] ACs.
- [x] PASS — `make unit-tests` passes, 0 failures — 52/0.
- [ ] [HUMAN] Create Sheet / paste code / `setupSheet()` / fill config — Awaiting human verification (no Google access). Runbook DEPLOY.md §1–4 complete.
- [ ] [HUMAN] Deploy Web App, copy `/exec` — Awaiting human verification. Runbook §5 complete.
- [ ] [HUMAN] curl smoke tests (200/401/insert visible) — Awaiting human verification. Runbook §6; request-path shapes pre-verified in Node.
- [ ] [HUMAN] Four tabs legible in Sheet — Awaiting human verification. Runbook §7.

**Evidence**
```
$ make unit-tests
node --test
... 52 subtests all ✔ ...
ℹ tests 52   ℹ pass 52   ℹ fail 0   ℹ duration_ms 69.64

$ node scratchpad/e2e_adversarial.js   # (driver in tester scratchpad)
HAPPY: bootstrap 200 (no secret_token_hash) / POST [A,B] inserted / since round-trips; store=2
AUTH:  missing|wrong|empty token -> 401; no-leak true; unauthorized POST leaves store empty; no-hash server -> 401
REPLAY: replay all skipped; [D,D] -> inserted[D]/skipped[D]; rows A=1 B=1 D=1
MALFORMED: object/null/string/number/[null]/[[]]/missing-id/empty-id/bad-kind/lots/NaN/Infinity -> 400; value:0 ok
ROUTE: auth'd /nope -> 404; UNAUTH /nope -> 401 (no route leak)
LARGE: 5000 inserted (2ms), replay 5000 skipped, store=5000 (no dup)
PURITY GUARD CORRECTLY FAILS on tainted core: found SpreadsheetApp
```

**Other issues found** (none blocking; follow-ups for the orchestrator/PM)
- `adapter.gs.js:60` — `JSON.parse(e.postData.contents)` is unguarded and runs *before* `handleRequest` (before auth). A malformed-JSON POST body throws an uncaught exception → Apps Script's default HTML error page instead of a clean `{status:400}`. Not a data leak (throws before any store read) and not covered by any AC (adapter is [HUMAN]-verified), but a `try/catch` returning `shapeResponse({status:400,...})` would harden the live endpoint. Recommend a small follow-up task.
- Sheet-formula injection: `event_id`/`value` strings are written verbatim; a value with a leading `=` (e.g. `=HYPERLINK(...)`) could be interpreted as a formula when Riley opens the Sheet. In practice `event_id` is a client-generated UUID and this is single-user with no untrusted input, so out of M1 scope — noting only for awareness.
- `handlePostEvents` reads the full events set on every POST to build the idempotency seen-set (O(n) per post). Fine at personal-tracker volume (~30–60 events/day); not a hot path. No action needed.

**VERDICT: PASS**
