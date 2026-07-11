# Manage Habits & Target Rules (M5)

Status: pending
Tags: `ui`, `data`
Depends on: #001, #002, #003
Blocks: —

## Scope

Implement SPEC Milestone 5 — the **Manage** screens for adding/editing/archiving habits and editing target rules, so Riley no longer has to edit the Sheet by hand (though the Sheet remains a valid escape hatch). Uses the `POST /habits` and `POST /rules` endpoints (#001), the domain core (#002) for the rule preview, and the app shell + data layer (#003). Plain static ES modules, no build step, mobile-first.

Per SPEC Section 5 view 5:

**Manage habits:**
- List active + archived habits (ordered by `sort_order`).
- **Add habit:** form for `name`, `type` (`binary`/`counter`/`measurement`), `unit` (shown only for counter/measurement — `reps`/`seconds`/free text; blank for binary), `sort_order`. `habit_id` is a slug auto-derived from the name (immutable once created; editable only at creation) — validate uniqueness against existing habits. Sets `created_at`, `active=true`. Submits via `POST /habits` (through the offline queue/api client where appropriate).
- **Edit habit:** change `name`, `unit`, `sort_order`, `active`. `habit_id` and `type` are immutable after creation (SPEC: `habit_id` immutable; type change would corrupt history — disallow).
- **Archive habit:** toggle `active=false` — the habit leaves the checklist/Today but keeps its history (SPEC Section 3 `active` note). Archived habits can be reactivated.

**Manage target rules:**
- Per habit, list its `target_rules` (days, week_parity, target, effective_from/to).
- **Add/edit rule:** form for `days` (multi-select mon–sun or `*`), `week_parity` (`even`/`odd`/`*`), `target` (int, 0 = rest), `effective_from`, `effective_to` (blank = open-ended). Submits via `POST /rules`.
- **Preview:** using #002 `resolveTarget`, show a plain-language preview of the resolved schedule for the current week, e.g. "This week: Mon–Fri 6, Sat 3, Sun rest" (SPEC Section 5 view 5). The preview updates as the form changes and reflects most-specific-wins + parity.
- Editing targets after a test day is done by **adding a new rule with a later `effective_from`** (SPEC Section 3) — the UI must make this the natural path (don't destructively overwrite history); a helper "apply from date" defaults `effective_from` to tomorrow.

**Validation & edge states:** duplicate slug rejected with a clear message; empty name rejected; a rule with `effective_to < effective_from` rejected; the preview shows "not scheduled" for days no rule covers.

## Acceptance Criteria

- [x] Adding a habit derives a unique slug from the name, sets `type`/`unit`/`sort_order`/`created_at`/`active=true`, and posts via `POST /habits`; a duplicate slug is rejected with a clear message — tested (api client with fake transport).
- [x] `unit` field is shown for counter/measurement and hidden/blank for binary — DOM tested.
- [x] Editing a habit can change `name`/`unit`/`sort_order`/`active` but not `habit_id` or `type` (those controls are absent or disabled) — DOM tested.
- [x] Archiving a habit sets `active=false` so it leaves Today/Week but its history is retained; reactivating restores it — tested (state + that events are untouched).
- [x] Adding/editing a target rule posts the correct `days`/`week_parity`/`target`/`effective_from`/`effective_to` via `POST /rules` — tested.
- [x] The rule preview renders a plain-language schedule for the current week using #002 `resolveTarget`, e.g. "Mon–Fri 6, Sat 3, Sun rest", and updates as the form changes — DOM tested against a fixture matching Riley's GTG schedule.
- [x] Editing a target after a test day creates a NEW rule with a later `effective_from` (default: tomorrow) rather than overwriting the old rule — tested (old rule still present; both exist).
- [x] Invalid input is rejected with clear messages: empty name, duplicate slug, `effective_to` before `effective_from` — tested.
- [x] `make unit-tests` passes with new tests, 0 failures.
- [ ] [HUMAN] Against the live backend (#001): creating a habit and adding a rule in Manage writes the corresponding rows to the `habits`/`target_rules` tabs of the Sheet, and they appear on next bootstrap.

## User Stories

### Story: Riley adds a new counter habit
1. Riley opens Manage → Add habit.
2. He types name "Dips", picks type "counter", unit "reps", sort order 5.
3. The slug auto-fills to `dips`; he submits.
4. `POST /habits` fires; Dips appears in the habit list and (once scheduled) on Today.

### Story: Riley sets up the wall-sit schedule and previews it
1. Riley opens Manage → Wall-sits → target rules.
2. He adds rules: Mon–Fri target 4; Sat + even → 2; Sat + odd → 0; Sun → 0.
3. The preview reads "This week: Mon–Fri 4, Sat 2, Sun rest" (for an even week).
4. He submits; the rules persist.

### Story: Riley raises his pushup target after a test day
1. Riley opens Pushups' rules and taps "raise target".
2. He enters target 8, effective_from defaults to tomorrow.
3. Submitting creates a NEW rule; the old target-6 rule is still listed, so past days keep their old target.

### Story: Riley archives a habit he's paused
1. Riley opens Manage, finds "Flossing", toggles it to archived.
2. Flossing disappears from Today and the Week grid but its history remains in Stats/Trends.
3. Later he reactivates it and it returns to Today.

### Story: Manage rejects bad input
1. Riley tries to add a habit with the name of an existing one → clear "slug already exists" message, no post.
2. Riley tries a rule with effective_to before effective_from → clear error, no post.

---

Blocked by: #001, #002, #003

## Log

### [PM] 2026-07-08 12:30 — Grooming

**Summary**
SPEC M5 — Manage screens: add/edit/archive habits (slug immutable, type immutable, unit conditional on type) and add/edit target rules with a plain-language weekly preview driven by #002 `resolveTarget`. Target changes after a test day create a new forward-dated rule rather than overwriting history.

**Key decisions**
- `habit_id` and `type` are immutable after creation (SPEC says `habit_id` immutable; changing `type` would corrupt derivation of existing events) — the UI omits/disables those controls on edit.
- Target edits follow SPEC's append-a-new-rule model (`effective_from` defaults to tomorrow) so full target history is preserved and old days stay judged against the target that applied then.
- Rule preview reuses #002 so the "what will this schedule to" logic is the same code that renders the grid — no divergence between preview and reality.

**Dependencies**
- #001 — `POST /habits` and `POST /rules` endpoints (live write is [HUMAN]).
- #002 — `resolveTarget` for the schedule preview.
- #003 — app shell, navigation, api client/queue.

**User stories**
- 5 stories: add counter habit, set up + preview wall-sit schedule, raise target via new rule, archive/reactivate, input validation.

Ready for implementation.

### [SWE] 2026-07-09 16:20 — Implementation

**Files modified**
- `app/js/views/manageModel.js` — NEW. Pure Manage logic: `deriveSlug`, `typeHasUnit`, `validateHabitInput`, `validateRuleInput`, `buildWeekPreview` (plain-language weekly schedule built over the #002 `resolveTarget`).
- `app/js/controllers/manageController.js` — NEW. DOM-free write orchestration: `addHabit`/`editHabit`/`setActive`/`addRule`/`preview`/`tomorrow`; persists via the #003 apiClient `postHabit`/`postRule`; shares the Today bootstrap arrays so archiving reflects in Today/Week.
- `app/js/views/manage.js` — NEW. Thin DOM renderer: add-habit form (live slug + conditional unit), edit-habit form (id/type read-only), archive/reactivate toggle, schedule editor with append-only rules + live preview + "raise target" (defaults effective_from to tomorrow).
- `app/css/manage.css` — NEW. Mobile-first styles reusing the shared tokens.
- `app/index.html` — link `css/manage.css`.
- `app/js/app.js` — wire a `manageController` (built alongside the Today controller from the same bootstrap object) and mount `renderManage` under a new "Manage" nav tab.
- `test/views/manageModel.test.mjs` — NEW (18 tests): slug derivation, habit/rule validation edge states, GTG preview (even/odd week), "not scheduled" days.
- `test/controllers/manageController.test.mjs` — NEW (12 tests): POST /habits + /rules shapes via the REAL apiClient + recording transport, immutable id/type on edit, archive/reactivate leaves events untouched, append-only forward-dated rule, preview.
- `test/views/manage.test.mjs` — NEW (12 tests): conditional unit field, live slug, immutable id/type controls on edit, archive toggle, saved + live preview, append-only rule flow, invalid-input rejection (no POST), raise-target.

**Tests**
- Unit: 280 passing, 0 failing (`make unit-tests`) — 238 prior + 42 new. Output below.
- Integration: N/A — no infra changes (live Google write is the [HUMAN] AC).

**Acceptance criteria**
- [x] Add habit derives unique slug + defaults + POST /habits; duplicate rejected — `manageController.test.mjs` (addHabit tests), `manage.test.mjs` (add/duplicate).
- [x] Unit field shown for counter/measurement, hidden for binary — `manage.test.mjs::add-habit unit field...`.
- [x] Edit changes name/unit/sort/active, not habit_id/type — `manageController.test.mjs::editHabit...`, `manage.test.mjs::editing a habit exposes...`.
- [x] Archive sets active=false, events untouched, reactivation restores — `manageController.test.mjs::setActive...`, `manage.test.mjs::archiving...`.
- [x] Add/edit rule posts correct fields via POST /rules — `manageController.test.mjs::addRule...`, `manage.test.mjs::adding a rule...`.
- [x] Plain-language weekly preview via #002 resolveTarget, updates as form changes — `manageModel.test.mjs::buildWeekPreview...` (GTG fixture → "Mon–Fri 6, Sat 3, Sun rest"), `manage.test.mjs::the rule preview updates live...`.
- [x] Target change appends a NEW forward-dated rule (default tomorrow), old rule preserved — `manageController.test.mjs::raising a target...`.
- [x] Invalid input rejected with clear messages (empty name, dup slug, effective_to<from) — covered across all three suites.
- [x] `make unit-tests` passes, 0 failures.
- [ ] [HUMAN] Live-backend write to the `habits`/`target_rules` Sheet tabs — NOT RUN (requires the deployed Apps Script Web App; demo transport verified in smoke).

**Evidence**
```
$ make unit-tests
node --test
...
ℹ tests 280
ℹ suites 0
ℹ pass 280
ℹ fail 0
ℹ duration_ms 279.71

$ node smoke_manage.mjs   # drives the real ?demo=1 module path via the fake DOM
mounted Manage with 5 seeded habits
added habit -> card present: true | slug: dips
live rule preview: This week: Mon–Fri 5, Sat–Sun not scheduled
rule persisted -> rule-items: 1
saved schedule preview: This week: Mon–Fri 5, Sat–Sun not scheduled
Pushups view preview: This week: Mon–Sun 6
Pushups direct resolveTarget: mon=6 tue=6 wed=6 thu=6 fri=6 sat=6 sun=6
SMOKE OK
```

**Notes**
- Persistence path: habits/rules are config (not append-only events), so they POST directly via the #003 apiClient (`postHabit`/`postRule`) rather than through the event offline-queue — the queue stays events-only. Local state updates after the POST resolves.
- Manage and Today share the same `bootstrapData.habits`/`target_rules` arrays (built together in `app.js`), so archiving a habit or adding a rule is visible in Today/Week on the next render without a bootstrap round-trip.
- Preview ordering is Monday-first (`Mon–Fri … Sat … Sun`) to match the SPEC example string; resolution itself is unchanged Sun–Sat.
- Rule editing is append-only by design (SPEC Section 3): the form always creates a new forward-dated rule; there is no destructive edit of an existing rule (that would corrupt target history). The "raise target" shortcut defaults effective_from to tomorrow.
- Runtime smoke was driven headlessly through the real demo modules (demoTransport → apiClient → manageController → renderManage) via the fake-DOM shim, since the app is a browser PWA with no local Node UI; on-device browser verification remains part of the [HUMAN] step.

### [Tester] 2026-07-09 15:05 — QA

**Test summary**
- Format / lint / pre-commit: PASS (`make pre-commit` → 280 pass / 0 fail; format+lint are no-ops for this no-build static stack per Makefile)
- Unit tests: 280 passed / 0 failed (42 new for #006)
- Integration tests: N/A (backend requires live Google deploy — `make integration-tests` is a documented no-op; live write is the [HUMAN] AC)
- Warnings: 0

**E2E adversarial pass** (independent scripts, not the SWE's suite)
- Happy path: `?demo=1` chain (demoTransport → apiClient → manageController → renderManage via fake-DOM) — add "Dips" (live slug `dips`, card renders), open schedule, set Mon–Fri 5 → live preview `This week: Mon–Wed not scheduled, Thu–Fri 5, Sat–Sun not scheduled`, submit persists rule, archive "Bible Study" → active=false and still listed. (PASS) — preview byte-equal to an independent resolveTarget sweep.
- Break path 1 (crux: append-only forward-dated rule): raise pushups 6→8 effective tomorrow → (a) NEW rule appended with future `effective_from`, (b) old rule byte-for-byte unchanged, (c) `resolveTarget` past date=6, on/after new effective_from=8; exactly one POST /rules. (PASS)
- Break path 2 (preview == direct sweep, 5 configs): GTG even (`Mon–Fri 6, Sat 3, Sun rest`), GTG odd/alt-Saturday (`Mon–Fri 6, Sat–Sun rest`), all-days daily (`Mon–Sun 5`), rest+unscheduled (`Mon–Fri 6, Sat not scheduled, Sun rest`), and a week straddling the new rule's effective_from (mixed old/new) — every one equals a direct resolveTarget sweep. (PASS)
- Break path 3 (immutability): `editHabit("pushups", { habit_id:"hacked", type:"binary", name:"Push-ups" })` → habit_id stays `pushups`, type stays `counter`, only name changes; POST body keeps original id/type. No code path mutates slug/type. (PASS)
- Break path 4 (validation, boundary/malformed): whitespace-only name rejected; case-variant dup `PUSHUPS` rejected; `push   ups`→`push_ups` collapse dup rejected; binary+unit → unit blanked; target −2 / `3.5` / `abc` / empty-days / missing-from / effective_to<from all rejected with no POST. (PASS)
- Break path 5 (archive integrity): archive → `active=false`, events array and target_rules byte-for-byte untouched; reactivate restores. (PASS)

**Acceptance criteria**
- [x] PASS — Add habit derives unique slug + defaults + POST /habits, dup rejected — `manageController.test.mjs::addHabit...`; my adv script §4 (case/whitespace dup variants); smoke added `dips`.
- [x] PASS — `unit` shown for counter/measurement, blank/hidden for binary — `manage.test.mjs::add-habit unit field...`; adv §4 binary+unit → unit blanked (`manageController.js:76`).
- [x] PASS — Edit changes name/unit/sort/active, not habit_id/type — `manageController.test.mjs::editHabit...`; adv §3 proves patch injection of id/type is ignored; `manage.js:184-195` renders id/type as static spans.
- [x] PASS — Archive sets active=false, events retained, reactivate restores — `manageController.test.mjs::setActive...`; adv §5 (events+rules byte-identical after archive).
- [x] PASS — Add/edit rule POSTs correct days/parity/target/from/to via POST /rules — `manageController.test.mjs::addRule...`; smoke persisted a rule via demo backend.
- [x] PASS — Plain-language weekly preview via #002 resolveTarget, updates live — `manageModel.test.mjs::buildWeekPreview...`; adv §2 proves preview == direct sweep across 5 configs incl. parity + straddle; smoke confirms live update on form change.
- [x] PASS — Target change appends NEW forward-dated rule (default tomorrow), old preserved — `manageController.test.mjs::raising a target...`; adv §1 (a/b/c) independently confirms history preservation + resolveTarget past=old/future=new.
- [x] PASS — Invalid input rejected (empty name, dup slug, effective_to<from) — covered across suites; adv §4 adds negative/non-integer/non-numeric target, empty days, missing from, case/whitespace dup.
- [x] PASS — `make unit-tests` passes, 0 failures — 280/280.
- [ ] Awaiting human verification — [HUMAN] live-backend write to `habits`/`target_rules` Sheet tabs + reappearance on next bootstrap (requires deployed Apps Script).

**Evidence**
```
$ make pre-commit
node --test
ℹ tests 280
ℹ pass 280
ℹ fail 0
ℹ duration_ms ~280

$ node adv.mjs           # independent model/controller adversarial suite
ALL ADVERSARIAL CHECKS PASSED (24 assertion groups)

$ node tester006_smoke.mjs   # real demo module chain via fake-DOM
mounted Manage with 5 seeded habits
added habit -> Dips card present: true | slug: dips
live rule preview: "This week: Mon–Wed not scheduled, Thu–Fri 5, Sat–Sun not scheduled"
preview == direct sweep: true
rule persisted -> dips rules: 1
archived Bible Study -> active: false
SMOKE OK
```

**Other issues found** (non-blocking — PASS with note; candidates for a follow-up)
- Live preview cosmetic: `manage.js::updatePreview` previews any integer target, so typing a negative target (e.g. `-2`) renders `... -2` in the live preview even though submit correctly rejects it. Cosmetic only — no bad rule can be saved. Consider gating the draft preview on `target >= 0`.
- No upper bound on `target` (validateRuleInput accepts `1000000` / large integer-valued floats). Harmless for a personal set-count tracker; flag only if a sane cap is wanted.
- `app.js` (glue, exercised only by [HUMAN] on-device): on the cache-present path, a background bootstrap refresh calls `controller.setServerEvents(...)` but does not rebuild `manageController`, so Manage's habits/rules refresh on next open rather than mid-session. This mirrors the existing Today-controller behavior (habits/rules aren't hot-refreshed either), converges within one round-trip, and is out of #006's testable scope — noting for the [HUMAN] check.

**VERDICT: PASS**
