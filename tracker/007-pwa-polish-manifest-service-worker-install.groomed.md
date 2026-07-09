# PWA Polish: Manifest, Icons, Service Worker, Install (M6)

Status: pending
Tags: `infra`, `ui`
Depends on: #003
Blocks: —

## Scope

Implement SPEC Milestone 6 — make the app installable to the iPhone home screen and load its shell offline. This is the final polish milestone; it must not introduce a build step (manifest, service worker, and icons are all plain static files served as-is from `app/`). Depends on the app shell existing (#003); later view tasks (#004–#006) are additive and cache the same way.

Per SPEC Section 2 (manifest + SW cache) and Section 6 AC #1/#6:

**Web App Manifest (`app/manifest.webmanifest`):**
- `name`, `short_name` ("Checklist" or similar), `start_url` (relative, GitHub Pages-safe), `display: "standalone"`, `theme_color`, `background_color`, `orientation: "portrait"`, and an `icons` array.
- Linked from `index.html` via `<link rel="manifest">` plus the iOS-specific `<link rel="apple-touch-icon">` and `<meta name="apple-mobile-web-app-capable" content="yes">` / status-bar meta tags so it installs cleanly from iPhone Safari's "Add to Home Screen".

**Icons (`app/icons/`):** static PNG app icons at the sizes iOS/PWA need (at minimum 180×180 apple-touch-icon, 192×192 and 512×512 for the manifest). Simple is fine (a solid-color tile with a check glyph). Committed as files — no generation step at serve time.

**Service worker (`app/sw.js`):**
- Registered from `index.html` (guard for browsers without SW support).
- **App-shell precache:** on install, cache the static shell assets (HTML, CSS, JS modules, manifest, icons) so the shell loads with no network (SPEC AC #6 "shell loads from cache").
- **Fetch strategy:** cache-first (or stale-while-revalidate) for shell/static assets; **never cache API `POST`s or the Apps Script `/exec` data calls** — those must always hit the network / go through the offline queue from #003 (the SW must not interfere with or duplicate the data queue). Same-origin static assets only; the cross-origin Apps Script calls bypass the SW cache.
- **Versioned cache + cleanup:** a cache version constant; on `activate`, delete old caches so updates roll out (bump the version to ship new assets).
- Must work under the GitHub Pages subpath (scope/paths relative, not root-absolute).

**Docs:** add an "Install to iPhone" section (README or `docs/INSTALL.md`) — numbered: open the GitHub Pages URL in Safari → Share → Add to Home Screen → open from the icon.

## Acceptance Criteria

- [ ] `app/manifest.webmanifest` is valid JSON with `name`, `short_name`, `start_url` (relative), `display: standalone`, theme/background colors, and an `icons` array referencing existing icon files — validated by a test (parse + required keys + referenced icon files exist).
- [ ] `index.html` links the manifest and includes the apple-touch-icon and iOS web-app meta tags.
- [ ] Icon files exist at the required sizes (≥ 180×180 apple-touch, 192×192, 512×512) and are referenced by the manifest/HTML — file-existence tested.
- [ ] `app/sw.js` precaches the shell asset list on install and serves those assets cache-first on fetch — unit-testable pieces (cache list correctness, cache-version constant, install/activate handlers) covered by a `node --test` using a fake Cache/SW context or by asserting the asset manifest list matches actual files.
- [ ] The service worker does NOT cache the Apps Script `/exec` data requests (POST/data calls bypass the cache) — asserted in the fetch-handler logic/test.
- [ ] On `activate`, caches whose version differs from the current constant are deleted — tested.
- [ ] All PWA assets are plain static files; no build/generation step is added — verified (grep/inspection; `make` still needs no build).
- [ ] Paths/scope are relative so it works under a GitHub Pages subpath — verified by inspection/test (no root-absolute `/` asset URLs in the shell/manifest).
- [ ] `make unit-tests` passes with new tests, 0 failures.
- [ ] [HUMAN] **SPEC AC #1:** from the iPhone home-screen icon (after "Add to Home Screen"), the Today view is interactive in < 3 s on cellular.
- [ ] [HUMAN] **SPEC AC #6 (shell half):** with the app installed and opened once, enabling airplane mode and reopening from the home-screen icon still loads the app shell from cache (the data-queue half of AC #6 is covered in #003).
- [ ] [HUMAN] Installing via Safari "Add to Home Screen" shows the correct icon and name and opens in standalone (no browser chrome).

## User Stories

### Story: Riley installs the app on his iPhone
1. Riley opens the GitHub Pages URL in iPhone Safari.
2. He taps Share → Add to Home Screen; the correct icon and name "Checklist" appear.
3. He taps the new home-screen icon; the app opens standalone (no Safari chrome) and the Today view is interactive within 3 s on cellular.

### Story: Riley opens the app with no signal
1. Riley has opened the installed app at least once (shell cached).
2. In airplane mode, he taps the home-screen icon.
3. The app shell loads from cache and he can view/log (logs queue via #003 for later sync) — no blank error screen.

### Story: A new release rolls out cleanly
1. The SWE bumps the service-worker cache version and ships new assets.
2. On next open, the SW activates, deletes the old cache, and serves the new shell.
3. A test asserts old-versioned caches are removed on `activate`.

---

Blocked by: #003

## Log

### [PM] 2026-07-08 12:35 — Grooming

**Summary**
SPEC M6 — PWA polish: web app manifest, iOS install meta tags, static app icons, and a versioned service worker that precaches the app shell for offline load while explicitly bypassing the Apps Script data calls (which stay on the #003 offline queue). All plain static files, GitHub Pages subpath-safe, no build step.

**Key decisions**
- The service worker caches only same-origin static shell assets and must NOT cache or duplicate the cross-origin Apps Script data calls — data sync stays owned by #003's queue to avoid double-write/stale-data bugs. This boundary is an explicit AC.
- Relative paths/scope throughout so it works under the GitHub Pages project subpath.
- Testable pieces (manifest validity, icon existence, precache list matches real files, cache-version cleanup, POST-bypass logic) are unit-tested; the genuinely device-bound checks (<3 s from home-screen on cellular, standalone install, offline shell load) are `[HUMAN]` — SPEC AC #1 and the shell half of AC #6.

**Dependencies**
- #003 — the app shell must exist to be cached; the data queue this SW must not interfere with lives there.

**User stories**
- 3 stories: install to home screen (AC #1), open with no signal (AC #6 shell), clean release via cache-version bump.

Ready for implementation.
