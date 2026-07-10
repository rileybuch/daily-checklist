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

- [x] `app/manifest.webmanifest` is valid JSON with `name`, `short_name`, `start_url` (relative), `display: standalone`, theme/background colors, and an `icons` array referencing existing icon files — validated by a test (parse + required keys + referenced icon files exist). — `test/pwa/manifest.test.mjs`
- [x] `index.html` links the manifest and includes the apple-touch-icon and iOS web-app meta tags. — `test/pwa/shell-html.test.mjs`
- [x] Icon files exist at the required sizes (≥ 180×180 apple-touch, 192×192, 512×512) and are referenced by the manifest/HTML — file-existence tested. — `test/pwa/manifest.test.mjs` + `shell-html.test.mjs`
- [x] `app/sw.js` precaches the shell asset list on install and serves those assets cache-first on fetch — unit-testable pieces (cache list correctness, cache-version constant, install/activate handlers) covered by a `node --test` using a fake Cache/SW context or by asserting the asset manifest list matches actual files. — `test/pwa/sw-precache.test.mjs` (list-matches-files) + `shell-html.test.mjs` (handlers present)
- [x] The service worker does NOT cache the Apps Script `/exec` data requests (POST/data calls bypass the cache) — asserted in the fetch-handler logic/test. — `test/pwa/sw-precache.test.mjs::shouldBypassCache`
- [x] On `activate`, caches whose version differs from the current constant are deleted — tested. — `test/pwa/sw-precache.test.mjs::cachesToDelete`
- [x] All PWA assets are plain static files; no build/generation step is added — verified (grep/inspection; `make` still needs no build).
- [x] Paths/scope are relative so it works under a GitHub Pages subpath — verified by inspection/test (no root-absolute `/` asset URLs in the shell/manifest).
- [x] `make unit-tests` passes with new tests, 0 failures. — 307 pass / 0 fail
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

### [SWE] 2026-07-09 21:05 — Implementation

**Files created**
- `app/manifest.webmanifest` — web app manifest: name/short_name/start_url (relative `./`)/display standalone/theme+background colors/portrait/icons (192, 512, 512-maskable).
- `app/sw.js` — module service worker: install → precache shell; activate → delete stale caches + claim; fetch → cache-first for same-origin GET, bypass everything else. Thin wiring over the pure module.
- `app/sw-precache.js` — pure, unit-tested cache policy: `CACHE_VERSION`, `PRECACHE_URLS` (36 relative shell URLs), `shouldBypassCache()`, `cachesToDelete()`. No SW globals — testable under `node --test`.
- `app/icons/icon-192.png`, `app/icons/icon-512.png`, `app/icons/apple-touch-icon.png` — committed static PNGs (green tile + white check), 192/512/180.
- `scripts/gen-icons.mjs` — dev-time icon generator (self-contained PNG encoder). NOT a serve-time step; re-run only to change the art.
- `docs/INSTALL.md` — numbered "Install to iPhone (Add to Home Screen)" + offline + new-release notes.
- `test/pwa/sw-precache.test.mjs`, `test/pwa/manifest.test.mjs`, `test/pwa/shell-html.test.mjs` — 27 new tests.

**Files modified**
- `app/index.html` — `<link rel="manifest">`, theme-color, apple-touch-icon, iOS web-app meta tags (capable/status-bar/title), `viewport-fit=cover`, and feature-detected best-effort SW registration (`{ type: "module", scope: "./" }`, `.catch` → runs online-only).

**Tests**
- Unit: 307 passing, 0 failing (`make unit-tests` / `make pre-commit`). 27 are new PWA tests; red→green confirmed (manifest/shell-html failed before assets existed, sw-precache passed pre-asset).
- Integration: N/A — no backend/infra changes (integration target is the [HUMAN] Google-deploy checks from #001).

**Acceptance criteria** — see checkboxes above; all 9 machine-verifiable ACs `[x]`, 3 `[HUMAN]` on-device checks remain `[ ]`.

**Evidence**
```
$ make pre-commit
node --test
... ℹ tests 307 / ℹ pass 307 / ℹ fail 0

$ node --test test/pwa/*.test.mjs   # the new tests in isolation
ℹ tests 27 / ℹ pass 27 / ℹ fail 0

$ node --check app/sw.js && node --check app/sw-precache.js   # module graph parses
sw.js: OK / sw-precache.js: OK

$ PORT=8137 bash scripts/serve.sh   # runtime smoke (served, then curled)
index.html  → rel="manifest", theme-color, apple-mobile-web-app-*, apple-touch-icon, serviceWorker.register present
manifest    → HTTP 200 application/manifest+json, parses (name=Daily Checklist, short_name=Checklist, 3 icons)
sw.js/sw-precache.js → 200 text/javascript ; icons/*.png → 200 image/png
all 36 precache URLs return 200 over HTTP (incl. "./" → index.html)

$ grep -iE '"build"|webpack|rollup|vite|esbuild|parcel' package.json app/package.json Makefile
no build scripts/bundlers referenced   # no-build constraint holds
```

**Notes / [HUMAN] items (cannot run here — device-bound)**
- [HUMAN] SPEC AC #1 — Today interactive < 3 s from the home-screen icon on cellular. Runbook: `docs/INSTALL.md` steps 1–5, time first paint on an LTE/5G connection.
- [HUMAN] SPEC AC #6 (shell half) — open installed app once, enable airplane mode, reopen from icon → shell loads from cache (no blank error). Runbook: `docs/INSTALL.md` "Using it offline".
- [HUMAN] Add-to-Home-Screen shows correct icon + name "Checklist" and opens standalone (no browser chrome). Runbook: `docs/INSTALL.md` steps 2–5.
- Design note (not a fork): SW registered as a **module** worker (`{ type: "module" }`) so `sw.js` can `import` the pure policy from `sw-precache.js` — the task's "the SW imports/uses [the module]" wording. Module service workers are supported in Safari 16.4+ (2023); on any browser without support, registration rejects and is caught → app runs online-only (graceful degradation, still fully usable). Existing app behavior unchanged; `sw.js` never intercepts the cross-origin Apps Script `/exec` calls, so the #003 offline queue is untouched.
- Not committed — handing to Tester first per process.

### [Tester] 2026-07-09 22:10 — QA

**Test summary**
- Format / lint / pre-commit: PASS (`make format-check lint-check` → no-op by design; `make pre-commit` → 307/307)
- Unit tests: 307 passed / 0 failed (27 new PWA tests pass in isolation too)
- Integration tests: N/A by design (backend requires live Google deploy — [HUMAN] from #001); `make integration-tests` is a documented no-op
- Warnings: 0

**E2E adversarial pass**
- Happy path: served `app/` via `python3 -m http.server` and curled all 36 `PRECACHE_URLS` → every one 200 with a sane content-type (index text/html, manifest `application/manifest+json`, css text/css, js text/javascript, icons image/png). PASS
- Break path 1 (crucial correctness — data calls must NEVER cache): ran an independent 25-case `shouldBypassCache` harness with the REAL endpoints — Apps Script `https://script.google.com/macros/s/AKfycb.../exec` (bootstrap GET, events POST, habits POST) and the demo `https://demo.local/exec` (GET+POST) all → bypass=true; same-origin shell GETs (`/css/*`, `/js/app.js`, `index.html`, start_url `./`) → bypass=false (cached). PASS
- Break path 2 (method/origin edges): same-origin POST/PUT/DELETE/HEAD → bypass=true; lowercase `get`/`post` handled (case-insensitive); undefined method defaults to GET; cross-origin CDN GET → bypass; http-vs-https / subdomain / port mismatches all → bypass. PASS
- Break path 3 (malformed input): `"not a url"`, `""`, `"//script.google.com/exec"` → bypass=true, no throw (try/catch on `new URL`). PASS
- Break path 4 (precache drift, independent of SWE test): bash `find` of real shell files vs `PRECACHE_URLS` → perfect sync in both directions; only `css/.gitkeep` + `js/.gitkeep` on disk-not-precached, correctly excluded (placeholders, not shell assets). No dead precache entries (would fail `cache.addAll`). No duplicates. `sw.js`/`sw-precache.js` correctly NOT self-precached. PASS
- Break path 5 (cache versioning / release rollout): `cachesToDelete(["dc-shell-v1","dc-shell-v2","other"], "dc-shell-v2")` → deletes v1+other, keeps v2; default keeps `CACHE_VERSION`; `[]` and single-current inputs safe. Version bump invalidates old shell. PASS
- Break path 6 (graceful degradation): registration is entirely inside `if ("serviceWorker" in navigator)` + `.catch`; `app/js/app.js` has zero SW references, so the shell boots without a SW. `node --check` on both SW files OK. PASS

**Acceptance criteria**
- [x] PASS — manifest valid JSON w/ required keys + relative start_url + icons→real files — `test/pwa/manifest.test.mjs` (7 tests); independent JSON parse + curl `application/manifest+json`
- [x] PASS — index.html links manifest + apple-touch-icon + iOS meta tags — `test/pwa/shell-html.test.mjs`; `app/index.html:9-16`
- [x] PASS — icons at required sizes — `file` confirms icon-192.png=192×192, icon-512.png=512×512, apple-touch-icon.png=180×180; all curl 200 image/png
- [x] PASS — sw.js precaches shell on install + cache-first fetch — `sw-precache.test.mjs` (list-matches-files, both directions) + all 36 URLs serve 200; `app/sw.js:21-64`
- [x] PASS — SW does NOT cache Apps Script /exec data calls — independent 25-case harness: every real data URL (script.google.com + demo.local, GET+POST) bypasses; `app/sw-precache.js:97-108`
- [x] PASS — activate deletes stale caches — `cachesToDelete` verified incl. version-bump invalidation; `app/sw.js:32-40`
- [x] PASS — all plain static, no build step — Makefile has no bundler; `gen-icons.mjs` is dev-only, not a serve step; no build scripts
- [x] PASS — relative paths/scope (subpath-safe) — no root-absolute URLs in manifest/index/precache (tested + inspected); scope `./`
- [x] PASS — `make unit-tests` 307/0 — reproduced firsthand
- [ ] [HUMAN] SPEC AC #1 (<3 s from home-screen on cellular) — genuinely device-bound; runbook `docs/INSTALL.md` steps 1–5 complete. Awaiting human verification.
- [ ] [HUMAN] SPEC AC #6 shell half (airplane-mode reopen loads shell) — device-bound; runbook "Using it offline" complete. Awaiting human verification.
- [ ] [HUMAN] Add-to-Home-Screen icon/name + standalone — device-bound; runbook steps 2–5 complete. Awaiting human verification.

**Evidence**
```
$ make pre-commit
ℹ tests 307 / ℹ pass 307 / ℹ fail 0

$ node -e '<independent shouldBypassCache harness, 25 realistic cases>'
... ADVERSARIAL FAILURES: 0

$ <serve app/ + curl every PRECACHE_URL>
TOTAL 36 FAILURES 0   (manifest → application/manifest+json)

$ <bash find shell files vs PRECACHE_URLS>
on-disk-not-precached: ./css/.gitkeep ./js/.gitkeep (placeholders, correctly excluded)
precached-not-on-disk: (none)
```

**Other issues found (non-blocking — PASS with note)**
- Manifest maskable icon reuses `icon-512.png` (a solid tile w/ centered check, no maskable safe-zone padding). iOS ignores `maskable`; on Android the mask could clip the glyph edge. Not in scope (spec targets iPhone) and not an AC — cosmetic follow-up if Android install is ever wanted.
- The 3 `[HUMAN]` items are correctly device-bound (first-paint timing on cellular, real airplane-mode SW cache hit, Safari standalone chrome) — cannot be simulated here; `docs/INSTALL.md` runbook covers all three end to end.

**VERDICT: PASS**

QA note: uncommitted diff is scoped to the PWA task (index.html + new manifest/sw/icons/docs/tests) — no unrelated files. Not yet committed (per process, Tester before commit).
