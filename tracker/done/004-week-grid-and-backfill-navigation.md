# Week Grid & Backfill Navigation (M3)

Status: pending
Tags: `ui`
Depends on: #002, #003
Blocks: —

## Scope

Implement SPEC Milestone 3 — the Way of Life–style **week grid** with week paging. Reuses the domain core (#002) for target resolution and day-state derivation, and the app shell + data layer (#003) for events/config. Plain static ES modules, no build step, mobile-first.

Per SPEC Section 5 view 2:
- **Layout:** rows = habits (ordered by `sort_order`), columns = **Sun–Sat** of the selected week (week starts Sunday, SPEC-locked). A header row labels the seven day columns with dates.
- **Binary cells:** green (checked) / red (missed: scheduled, past, no check) / gray-hatched (`skip`) / light gray (unscheduled or future). Driven by #002 `binaryDayState`.
- **Counter cells:** show `n/target`; colored **green** when the target is met (count ≥ target, or a `target=0` rest), **amber** when partial (0 < count < target), **red** when 0 on a scheduled past day. Driven by #002 `counterDayState` + `counterDayCount` + `resolveTarget`. A `target=0` scheduled-rest cell reads as a rest (e.g. "rest" / neutral), never red.
- **Measurement rows:** measurements have no daily state; render neutral cells (e.g. a dot when a `measure` exists that day, blank otherwise) — never red.
- **Navigation:** swipe and/or on-screen arrows page to the previous/next week; the current week is the default. Future weeks render as light-gray/unscheduled (no red). A visible label shows which week is displayed (date range).
- **Backfill affordance:** tapping a past binary cell (or a counter cell) navigates to / opens the Today view for that date so Riley can edit it (reuse #003's date-switch; no new logging UI needed in the grid itself). At minimum, the grid must let Riley reach a past day for editing.

## Acceptance Criteria

- [ ] The grid renders one row per active habit (ordered by `sort_order`) and seven columns Sun–Sat with correct date headers for the selected week — DOM tested.
- [ ] Binary cells show green/red/hatched-skip/light-gray correctly for a seeded week of events — DOM tested against a fixture.
- [ ] Counter cells show `n/target` with green (met), amber (partial), red (0 on scheduled past day) coloring — DOM tested for each color.
- [ ] A `target=0` scheduled-rest cell renders as a rest and is never red — DOM tested.
- [ ] Future days and unscheduled days render light-gray and are never red — DOM tested.
- [ ] Paging arrows/swipe move to the previous and next week and re-render with that week's schedule and events; the week label updates — DOM tested.
- [ ] Tapping a past cell lets Riley reach that date's editable Today view (backfill path) — DOM/integration tested.
- [ ] Measurement rows render neutral cells (dot on measure days, blank otherwise), never red — DOM tested.
- [ ] `make unit-tests` passes with new grid tests, 0 failures.
- [ ] [HUMAN] **SPEC AC #3 (visual):** with Riley's GTG `target_rules` loaded, the week grid for Weeks 1 and 2 visually matches the printed 8-week calendar — Mon–Fri 6 (wall-sits 4), alternating Sat 3/0 (wall-sits 2/0), Sun rest — confirmed by eye against the printout.

## User Stories

### Story: Riley reviews his week at a glance
1. Riley opens the Week grid; rows list Pushups, Pullups, Squats, Wall-sits, Bible Study in sort order.
2. Columns are Sun–Sat with the current week's dates.
3. Mon–Fri Pushups cells that hit 6 sets are green; a day with 3/6 is amber; a scheduled past day with 0 is red; Sunday reads as rest (neutral, not red).

### Story: Riley pages back to last week
1. Riley taps the left arrow (or swipes right).
2. The grid re-renders with last week's Sun–Sat dates and that week's states; the week label updates to the prior date range.
3. He taps the right arrow to return to the current week.

### Story: Riley notices a missed day and fixes it
1. Riley sees a red Bible Study cell on Tuesday.
2. He taps it and lands on Tuesday's Today view.
3. He toggles Bible Study green; returning to the grid, Tuesday now reads green.

### Story: [HUMAN] The grid matches the printed calendar
1. Riley loads his real GTG rules and opens Week 1 in the grid.
2. He compares each habit row's targets to the printed 8-week calendar's Week 1.
3. Week 1 and Week 2 (opposite Saturday parity) match the paper exactly.

---

Blocked by: #002, #003

## Log

### [PM] 2026-07-08 12:20 — Grooming

**Summary**
SPEC M3 — the Way of Life–style Sun–Sat week grid with binary color states, counter `n/target` coloring, scheduled-rest handling, week paging, and a backfill path into the Today view for past days. All coloring/derivation comes from the #002 domain core.

**Key decisions**
- No new derivation logic — the grid is a pure presentation over #002; this keeps AC #3's "matches the printed calendar" resting on already-proven target resolution, with the final visual match as a `[HUMAN]` check.
- Backfill reuses #003's date-switch Today view rather than adding logging UI inside grid cells (simplest thing that works).

**Dependencies**
- #002 — target resolution + day-state derivation for every cell.
- #003 — app shell, data layer (events/config), and the date-switch Today view used for backfill.

**User stories**
- 4 stories: week-at-a-glance, page back a week, fix a missed day via backfill, and the [HUMAN] printed-calendar match.

Ready for implementation.
