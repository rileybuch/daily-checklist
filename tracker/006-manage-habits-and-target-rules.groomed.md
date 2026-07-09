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

- [ ] Adding a habit derives a unique slug from the name, sets `type`/`unit`/`sort_order`/`created_at`/`active=true`, and posts via `POST /habits`; a duplicate slug is rejected with a clear message — tested (api client with fake transport).
- [ ] `unit` field is shown for counter/measurement and hidden/blank for binary — DOM tested.
- [ ] Editing a habit can change `name`/`unit`/`sort_order`/`active` but not `habit_id` or `type` (those controls are absent or disabled) — DOM tested.
- [ ] Archiving a habit sets `active=false` so it leaves Today/Week but its history is retained; reactivating restores it — tested (state + that events are untouched).
- [ ] Adding/editing a target rule posts the correct `days`/`week_parity`/`target`/`effective_from`/`effective_to` via `POST /rules` — tested.
- [ ] The rule preview renders a plain-language schedule for the current week using #002 `resolveTarget`, e.g. "Mon–Fri 6, Sat 3, Sun rest", and updates as the form changes — DOM tested against a fixture matching Riley's GTG schedule.
- [ ] Editing a target after a test day creates a NEW rule with a later `effective_from` (default: tomorrow) rather than overwriting the old rule — tested (old rule still present; both exist).
- [ ] Invalid input is rejected with clear messages: empty name, duplicate slug, `effective_to` before `effective_from` — tested.
- [ ] `make unit-tests` passes with new tests, 0 failures.
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
