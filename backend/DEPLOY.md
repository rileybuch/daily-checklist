# Backend Deployment Runbook (M1)

This is the one-time, copy-paste runbook for standing up the Daily Checklist
backend: a Google Apps Script Web App backed by a Google Sheet. It covers every
`[HUMAN]` acceptance criterion for task #001.

The code is already written and unit-tested in this repo:

- `backend/core.gs.js` — pure routing / validation / auth / idempotency (no Google
  globals; unit-tested with `make unit-tests`).
- `backend/adapter.gs.js` — the thin Google layer: `doGet`/`doPost`, `SheetStore`,
  `setupSheet()`, `computeTokenHash()`.

You only need to paste those two files into the Apps Script editor and follow the
steps below. No build step, no dependencies.

---

## 1. Create the Google Sheet

1. Go to <https://sheets.google.com> and create a **new blank spreadsheet**.
2. Rename it something like `Daily Checklist Data`.
3. Leave the default `Sheet1` for now — `setupSheet()` creates the real tabs in
   step 3.

## 2. Open the bound Apps Script project and paste the code

1. In the Sheet: **Extensions → Apps Script**. This opens a script *bound* to this
   Sheet (so `SpreadsheetApp.getActive()` returns it).
2. In the editor, delete the placeholder `Code.gs` contents.
3. Create two script files (the **+** next to "Files → Script"):
   - `core` → paste the entire contents of `backend/core.gs.js`.
   - `adapter` → paste the entire contents of `backend/adapter.gs.js`.

   (File names in the editor don't need the `.gs.js` suffix; Apps Script adds
   `.gs`. Order doesn't matter — Apps Script concatenates all files into one
   global scope, so the adapter can call the core's functions.)
4. Click **Save** (disk icon).

## 3. Create the four tabs (run `setupSheet` once)

1. In the editor's function dropdown (top toolbar), select **`setupSheet`**.
2. Click **Run**.
3. First run triggers an authorization prompt: **Review permissions → choose your
   Google account → Advanced → Go to (project) → Allow**. This is the
   execute-as-owner grant; there is no OAuth in the app itself.
4. After it runs, check the Sheet: you now have tabs **`habits`**,
   **`target_rules`**, **`events`**, and **`config`**, each with a frozen header
   row matching SPEC Section 3. You may delete the leftover `Sheet1`.

## 4. Set the config values

1. Pick a **secret token** — any hard-to-guess string, e.g. `hunter2-correct-horse`.
   This is the shared secret the app sends on every request.
2. Compute its hash: in the editor function dropdown pick **`computeTokenHash`**,
   but first pass your token. The easiest way: open the editor, temporarily add a
   throwaway function and run it, or use the built-in approach:
   - In the editor, select `computeTokenHash` in the dropdown is not enough (it
     takes an argument). Instead paste this one-liner as a new temporary function,
     select it, and Run:

     ```javascript
     function _printMyHash() {
       Logger.log(computeTokenHash("hunter2-correct-horse")); // ← your token
     }
     ```
   - Open **View → Logs** (or **Execution log**) and copy the 64-character hex
     hash it printed. Delete `_printMyHash` afterward.
3. In the `config` tab, add these rows (column `key`, column `value`):

   | key | value |
   |---|---|
   | `anchor_date` | `2026-01-04` (a Sunday — defines week-parity phase; pick the Sunday that starts your "Week 1") |
   | `week_start` | `sun` |
   | `secret_token_hash` | *(paste the 64-char hash from step 4.2)* |

## 5. Deploy as a Web App

1. In the editor: **Deploy → New deployment**.
2. Click the gear → select type **Web app**.
3. Configure:
   - **Description:** `Daily Checklist API v1`
   - **Execute as:** `Me`
   - **Who has access:** `Anyone with the link`
4. Click **Deploy**, authorize if prompted, and **copy the Web app URL** — it ends
   in `/exec`. Call it `$URL` below.

> Re-deploying after code edits: **Deploy → Manage deployments → edit (pencil) →
> Version: New version → Deploy**. Editing the existing deployment keeps the same
> `/exec` URL.

---

## 6. Smoke-test with `curl`

Set your variables (use the token *plaintext*, not the hash — the server hashes it):

```bash
URL="https://script.google.com/macros/s/XXXXXXXX/exec"
TOKEN="hunter2-correct-horse"
```

> **Pass the route as `?path=<name>`, not as a path suffix.** Use
> `"$URL?path=bootstrap&token=$TOKEN"`, never `"$URL/bootstrap?token=$TOKEN"`.
> Appending a segment after `/exec` (e.g. `/exec/bootstrap`) makes an anonymous
> Apps Script Web App redirect the request to `accounts.google.com/ServiceLogin`
> before your code runs — so `curl` gets an HTML sign-in page instead of JSON. The
> `?path=` query form (which the app's own client and the adapter use) reaches the
> script directly. `$URL` must end in `/exec` with nothing after it.
>
> `-L` is also required: Apps Script responds with a 302 redirect to a
> `googleusercontent.com` URL that carries the actual JSON body.

### 6a. Bootstrap with the correct token → 200 JSON with four sections

```bash
curl -sSL "$URL?path=bootstrap&token=$TOKEN"
```

Expect JSON like:

```json
{"status":200,"habits":[...],"target_rules":[...],"config":{"anchor_date":"2026-01-04","week_start":"sun"},"events":[...]}
```

Note: `config` does **not** contain `secret_token_hash`, and `status` is folded
into the body (Apps Script always returns HTTP 200 at the transport level).

### 6b. Bootstrap with a wrong token → 401

```bash
curl -sSL "$URL?path=bootstrap&token=nope"
```

Expect:

```json
{"status":401,"error":"unauthorized"}
```

### 6c. Post one event → `inserted:["evt-smoke-1"]`, row appears in the Sheet

```bash
curl -sSL "$URL?path=events&token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"event_id":"evt-smoke-1","ts":"2026-07-08T09:00:00","date":"2026-07-08","habit_id":"pushups","kind":"set","value":20,"undo_of":""}]'
```

Expect:

```json
{"status":200,"inserted":["evt-smoke-1"],"skipped":[]}
```

Open the Sheet → `events` tab: a new row with `event_id = evt-smoke-1` is visible.

### 6d. Idempotency check — re-post the same event → `skipped`

```bash
curl -sSL "$URL?path=events&token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"event_id":"evt-smoke-1","ts":"2026-07-08T09:00:00","date":"2026-07-08","habit_id":"pushups","kind":"set","value":20,"undo_of":""}]'
```

Expect `{"status":200,"inserted":[],"skipped":["evt-smoke-1"]}` and **no second
row** added to the `events` tab.

### 6e. (optional) Incremental events fetch

```bash
curl -sSL "$URL?path=events&token=$TOKEN&since=2026-07-01"
```

Returns `{"status":200,"events":[...]}` with only events whose `date >= 2026-07-01`.

---

## 7. Confirm the Sheet is legible (SPEC AC #7)

Open the Sheet and eyeball the four tabs: `habits`, `target_rules`, `events`,
`config`. Every column header matches SPEC Section 3, and the event rows you
posted are plain, human-readable values — no encoding, no tooling required. The
Sheet doubles as the export format and the escape hatch.

---

## Endpoint reference

All requests require `token` (query param). Pass the endpoint name as `?path=<name>`
(e.g. `$URL?path=bootstrap&token=$TOKEN`). The adapter also reads `e.pathInfo`, but a
`/exec/<name>` path suffix makes an anonymous Web App redirect to a Google sign-in
page (see the note in Section 6), so `?path=` is the form to use — it's also what the
app's own client sends.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/bootstrap` | — | `{ habits, target_rules, config, events }` (last 30 days of events) |
| GET | `/events?since=<ISO date>` | — | `{ events }` with `date >= since` |
| POST | `/events` | JSON **array** of events | `{ inserted:[ids], skipped:[ids] }` (idempotent on `event_id`) |
| POST | `/habits` | one habit object | `{ ok, habit_id }` (upsert by `habit_id`) |
| POST | `/rules` | one rule object | `{ ok, rule_id }` (upsert by `rule_id`) |

Missing/invalid token → `{ status:401, error:"unauthorized" }`.
Malformed payload → `{ status:400, error, detail }`.
