# Daily Checklist and Habit Tracker

A personal, mobile-first habit tracker that merges Way of Life–style binary habit tracking with counted grease-the-groove workout sets — full spec in [SPEC.md](SPEC.md).

## Project Status

**Last Updated:** 2026-07-08

### Current State
Spec phase — no application code yet. [SPEC.md](SPEC.md) defines a static PWA (GitHub Pages) backed by a Google Apps Script JSON API writing to a Google Sheet in Riley's Drive. Three habit types: binary (green/red/skip), counter (tap-per-set with reps/seconds values, judged against a daily set target), and measurement (e.g. tested max reps). Targets vary by day of week and week parity via dated `target_rules`, replacing the printed 8-week GTG calendar.

### Recent Changes
- Wrote SPEC.md v1: architecture, Sheet data model (`habits`, `target_rules`, `events`, `config`), API surface, views, acceptance criteria, milestones
- Resolved open questions: weeks run Sun–Sat; wall-sits are counters with seconds per set; every set log captures an editable reps/seconds value
- Repo bootstrapped from the project starter template (CLAUDE.md, `.claude/settings.json`, `.gitignore`)

### Up Next / Open Questions
- Milestone 1: create the Google Sheet schema and Apps Script endpoints with token auth, verified via `curl`
- Milestone 2: Today view with optimistic logging and an offline queue (app becomes daily-usable; retire the printout)
- Open: chart library choice (hand-rolled SVG vs. CDN lib) — decide at Milestone 4

## What This Replaces

1. **Way of Life** (iPhone app) — binary habits only; no counts.
2. **A printed Google Sheet** — an 8-week grease-the-groove calendar (pushups, pullups, squats, wall-sits) with per-day set circles; no history or trends.
