# Project Bootstrap & Test Harness

Status: pending
Tags: `infra`, `tooling`
Depends on: None
Blocks: #001, #002, #003, #004, #005, #006, #007

## Scope

Stand up the minimal, no-build-step project skeleton so every later task has a place to put static app code, Apps Script backend code, and tests — and a single command to run them. Nothing here may introduce a bundler, transpiler, or framework build step. The served app must be plain static files.

**Directory layout to create** (empty-but-present dirs get a `.gitkeep`):

```
/                     # repo root (already has CLAUDE.md, SPEC.md, README.md)
├── app/              # the static PWA — served as-is, no build
│   ├── index.html    # minimal placeholder shell for now (title + "Daily Checklist" + empty <main>)
│   ├── css/          # .gitkeep
│   └── js/           # .gitkeep
├── backend/          # Google Apps Script source, authored as plain testable JS
│   └── .gitkeep
├── test/             # node --test suite (mirrors app/js and backend module paths)
│   └── smoke.test.js # a trivial passing test proving the harness runs
├── scripts/
│   └── serve.sh      # starts a static server rooted at app/ (python3 -m http.server 8000 --directory app)
├── package.json      # DEV-ONLY: scripts, no runtime deps required to serve the app
└── Makefile          # thin wrapper the process/tooling expects
```

**`package.json`** — dev convenience only, no `dependencies` block that the app needs to run. Include:
- `"private": true`
- `"scripts"`: `"test": "node --test"`, `"serve": "bash scripts/serve.sh"`
- No framework, no bundler, no transpiler. `devDependencies` should stay empty unless a zero-config lint helper is added; if added it must not be needed to serve or test.

**`Makefile`** — map the process doc's standard hooks onto this stack so `/night` gates work. Targets (each may be a no-op echo where not applicable, but must exit 0):
- `format-fix`, `format-check`, `lint-fix`, `lint-check` — run whatever zero-config formatter/linter is chosen, or echo a clear "no-op (no linter configured)" and exit 0. Do NOT add a linter that requires a build.
- `pre-commit` — currently runs `make unit-tests` (nothing else to hook yet).
- `unit-tests` — runs `node --test` over `test/`.
- `integration-tests` — echoes "no integration tests (backend requires live Google deploy — see [HUMAN] steps in task 001)" and exits 0.
- `tests` — runs `unit-tests` then `integration-tests`.

**`scripts/serve.sh`** — one-liner static server for local preview on desktop and iPhone-on-LAN. Uses `python3 -m http.server` rooted at `app/`. Must print the URL it serves.

**`app/index.html`** — placeholder only: valid HTML5 doc, `<meta name="viewport" content="width=device-width, initial-scale=1">`, title "Daily Checklist", a visible "Daily Checklist" heading, and an empty `<main id="app"></main>`. No frameworks. This is replaced/filled by later tasks.

**README** — add a short "Development" section documenting: how to run tests (`make unit-tests` or `npm test`), how to serve locally (`make`/`npm run serve` → open `http://localhost:8000`), and the rule that the app is plain static files with no build step. Insert without restructuring the existing README (append a `## Development` section before "What This Replaces" or at the end).

## Acceptance Criteria

- [x] `app/`, `backend/`, `test/`, `scripts/` directories exist and are tracked (via files or `.gitkeep`).
- [x] `make unit-tests` runs `node --test` and reports the smoke test passing, with 0 failures.
- [x] `make tests` runs unit then integration targets and exits 0; the integration target prints the "no integration tests" explanation.
- [x] `make pre-commit`, `make format-check`, `make lint-check`, `make format-fix`, `make lint-fix` each exit 0 (no-op is acceptable, but must not error).
- [x] `npm test` is equivalent to `make unit-tests` (both invoke `node --test`).
- [x] `package.json` declares no runtime `dependencies`; nothing in it is required to serve `app/`.
- [x] Serving `app/` (via `scripts/serve.sh` / `npm run serve`) returns `app/index.html` at `http://localhost:8000/` with HTTP 200, containing the text "Daily Checklist".
- [x] `app/index.html` is a valid HTML5 document with a mobile viewport meta tag and an empty `<main id="app"></main>`.
- [x] No bundler, transpiler, or framework build step exists anywhere in the repo.
- [x] README has a "Development" section describing test + serve commands and the no-build-step rule.

## User Stories

### Story: Riley runs the test suite for the first time
1. Riley clones the repo and runs `make unit-tests` (or `npm test`) from the repo root.
2. `node --test` discovers `test/smoke.test.js`.
3. The terminal shows the smoke test passing and `0` failures, exit code 0.

### Story: Riley previews the app shell in a browser
1. Riley runs `npm run serve` (or `bash scripts/serve.sh`).
2. The script prints `Serving app/ at http://localhost:8000`.
3. Riley opens `http://localhost:8000/` and sees a page titled "Daily Checklist" with a "Daily Checklist" heading and an empty content area.
4. Riley confirms no build/compile step ran — the served file is byte-for-byte `app/index.html`.

### Story: An agent verifies the CI hooks resolve on this stack
1. An agent runs `make pre-commit`.
2. The target runs the unit tests (the only hook wired so far) and exits 0.
3. Running `make format-check && make lint-check` also exits 0 without requiring any build tool.

---

Blocked by: (none)

## Log

### [PM] 2026-07-08 12:00 — Grooming

**Summary**
Bootstrap the greenfield repo with a no-build-step static app skeleton (`app/`), a place for Apps Script backend code (`backend/`), and a zero-dependency `node --test` harness wired into a Makefile matching the process doc's standard hooks.

**Key decisions**
- Tests use Node's built-in `node --test` (zero deps) per project constraint; `package.json` is dev-only with no runtime dependencies.
- Static serving via `python3 -m http.server` rooted at `app/` — no bundler, no framework build.
- `Makefile` maps `format-*`/`lint-*`/`pre-commit`/`*-tests` hooks so `/night` gates resolve on this JS stack; `integration-tests` is an explicit no-op because backend integration requires the live Google deploy (task 001 [HUMAN] steps).

**Dependencies**
- None (first task).

**User stories**
- 3 stories: run tests, preview shell, verify CI hooks resolve.

Ready for implementation.

### [SWE] 2026-07-08 21:40 — Implementation

**Files modified**
- `app/index.html` — placeholder HTML5 shell: viewport meta, "Daily Checklist" title + heading, empty `<main id="app">`.
- `app/css/.gitkeep`, `app/js/.gitkeep`, `backend/.gitkeep` — track empty dirs for later tasks.
- `test/smoke.test.js` — trivial `node --test` case proving the zero-dependency harness runs.
- `scripts/serve.sh` — `python3 -m http.server` rooted at `app/`; prints the serve URL. Executable.
- `package.json` — dev-only manifest: `private: true`, `test`→`node --test`, `serve`→`bash scripts/serve.sh`. No `dependencies`/`devDependencies`.
- `Makefile` — process hooks: `format-*`/`lint-*` no-op (exit 0), `unit-tests`→`node --test`, `integration-tests`→explanatory no-op, `tests`→unit+integration, `pre-commit`→unit-tests.
- `README.md` — added `## Development` section (test + serve commands, no-build-step rule) before "What This Replaces".

**Tests**
- Unit: 1 passing, 0 failing — `make unit-tests` / `npm test` (both `node --test`).
- Integration: N/A — `make integration-tests` is an explicit no-op (backend needs live Google deploy, task 001 [HUMAN] steps).

**Acceptance criteria** — all 10 verified (no [HUMAN] items):
- [x] Dirs `app/ backend/ test/ scripts/` exist and tracked (`.gitkeep` where empty) — `find` output below.
- [x] `make unit-tests` → smoke test passes, 0 failures, exit 0.
- [x] `make tests` → unit then integration, prints "no integration tests" explanation, exit 0.
- [x] `make pre-commit/format-check/lint-check/format-fix/lint-fix` each exit 0.
- [x] `npm test` equivalent to `make unit-tests` (both `node --test`).
- [x] `package.json` has no runtime `dependencies` (verified: `dependencies: null`).
- [x] Serving `app/` returns index.html at `http://localhost:8000/` HTTP 200 with "Daily Checklist"; served bytes diff-identical to source.
- [x] `app/index.html` valid HTML5, viewport meta, empty `<main id="app"></main>`.
- [x] No bundler/transpiler/framework build step anywhere (config grep clean).
- [x] README has "Development" section with test/serve commands + no-build-step rule.

**Evidence**
```
$ make unit-tests
node --test
✔ test harness runs (0.803333ms)
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ duration_ms 61.544291

$ make tests
node --test
✔ test harness runs
ℹ pass 1  ℹ fail 0
no integration tests (backend requires live Google deploy — see [HUMAN] steps in task 001)

$ for t in format-fix lint-fix format-check lint-check pre-commit; do make $t; echo EXIT=$?; done
format-fix: no-op (no formatter configured — plain static files, no build step)   EXIT=0
lint-fix: no-op (no linter configured — plain static files, no build step)         EXIT=0
format-check: no-op (no formatter configured — plain static files, no build step)  EXIT=0
lint-check: no-op (no linter configured — plain static files, no build step)       EXIT=0
pre-commit: node --test → pass 1 fail 0                                             EXIT=0

$ # e2e serve smoke
$ bash scripts/serve.sh &   # → "Serving app/ at http://localhost:8000"
$ curl -s -i http://localhost:8000/ | head -1
HTTP/1.0 200 OK
$ curl -s http://localhost:8000/ | diff - app/index.html && echo IDENTICAL
IDENTICAL
$ curl -s http://localhost:8000/ | grep -c "Daily Checklist"
2

$ node -e "const p=require('./package.json'); console.log(p.dependencies||null, p.devDependencies||null)"
null null

$ ls -a | grep -Ei 'webpack|rollup|vite|babel|tsconfig|esbuild|parcel|gulp|grunt' || echo "none found (clean)"
none found (clean)

$ find app backend test scripts -type f | sort
app/css/.gitkeep
app/index.html
app/js/.gitkeep
backend/.gitkeep
scripts/serve.sh
test/smoke.test.js
```

**Notes**
- Node v24.1.0, Python 3.10.6 on the machine — `node --test` and `python3 -m http.server` both present.
- Formatter/linter targets are deliberate no-ops: the task forbids adding any linter that requires a build. If a zero-config helper is wanted later, it must not be needed to serve or test.
- No commit made — handing to Tester first per process. Tracker file renamed to `.in-progress.md`.

### [Tester] 2026-07-08 22:20 — QA

**Test summary**
- Format / lint / pre-commit: PASS (`format-check`/`lint-check`/`format-fix`/`lint-fix` each exit 0; `pre-commit` runs `node --test` → pass 1 fail 0, exit 0)
- Unit tests: 1 passed / 0 failed (`make unit-tests`, exit 0)
- Integration tests: 0 (explicit no-op by design — prints the "backend requires live Google deploy" explanation, exit 0)
- Warnings: 0

**E2E adversarial pass**
- Happy path: `bash scripts/serve.sh` then `curl -s -i http://localhost:8000/` → prints `Serving app/ at http://localhost:8000`, `HTTP/1.0 200 OK`, body byte-identical to `app/index.html` (`diff` → IDENTICAL), contains "Daily Checklist" (2 occurrences: title + h1), viewport meta and `<main id="app"></main>` present (PASS)
- Break path 1 (failure-mode: does the harness fail loud?): injected `test/_temp_fail.test.js` with a failing assert → `make unit-tests` exit 2, `make pre-commit` exit 2, node prints the failing test + stack; removed temp file → back to exit 0 (PASS — non-zero propagates, so CI gates will actually catch red)
- Break path 2 (hostile input: directory escape): served on PORT=8137, `curl --path-as-is http://localhost:8137/../../CLAUDE.md` → 404, encoded `..%2f..%2f` → 404, no `CLAUDE.md` content leaked (grep "About Me" → 0); missing file → 404; root still 200 (PASS — python http.server sanitizes traversal, no app-root escape)
- Break path 3 (concurrency + zero-deps): `node_modules` absent, `npm test` and serve both work with no install; 20 parallel requests → 20× HTTP 200; empty `css/`/`js/` dirs → 200; `PORT` override respected in both bind and startup message (PASS)

**Acceptance criteria** (all 10 verified, no [HUMAN] items)
- [x] PASS — `app/ backend/ test/ scripts/` exist and are tracked — `git add -n` stages `app/css/.gitkeep app/index.html app/js/.gitkeep backend/.gitkeep scripts/serve.sh test/smoke.test.js`; none git-ignored
- [x] PASS — `make unit-tests` runs `node --test`, smoke test passes, 0 failures — output above, exit 0
- [x] PASS — `make tests` runs unit then integration and exits 0; integration prints the "no integration tests" explanation — confirmed in one run
- [x] PASS — `make pre-commit/format-check/lint-check/format-fix/lint-fix` each exit 0 — all EXIT=0
- [x] PASS — `npm test` equivalent to `make unit-tests` — `package.json` `test` = `node --test`; ran `npm test` → pass 1 fail 0
- [x] PASS — `package.json` declares no runtime `dependencies` — `dependencies: null`, `devDependencies: null`; app serves with no `node_modules`
- [x] PASS — serving `app/` returns `index.html` at `/` HTTP 200 containing "Daily Checklist" — `HTTP/1.0 200 OK`, byte-identical, 2 matches
- [x] PASS — `app/index.html` valid HTML5, viewport meta, empty `<main id="app"></main>` — `<!DOCTYPE html>`, `<html lang="en">`, viewport meta present, exactly one empty `main#app`
- [x] PASS — no bundler/transpiler/framework build step anywhere — recursive grep for webpack/rollup/vite/babel/tsconfig/esbuild/parcel → none anywhere
- [x] PASS — README has a "Development" section with test/serve commands and the no-build-step rule — present (README.md:22-40), inserted before "What This Replaces", existing structure intact

**Evidence**
```
$ make pre-commit
node --test
✔ test harness runs (0.612334ms)
ℹ tests 1  ℹ pass 1  ℹ fail 0
EXIT=0

$ make tests
node --test
✔ test harness runs   ℹ pass 1  ℹ fail 0
no integration tests (backend requires live Google deploy — see [HUMAN] steps in task 001)
EXIT=0

$ # break path 1 — failing test injected
$ make unit-tests
✖ deliberately failing ... 2 !== 3
make: *** [unit-tests] Error 1   MAKE_EXIT=2

$ # break path 2 — traversal
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8137/../../CLAUDE.md   # via --path-as-is
404

$ # break path 3 — 20 concurrent
20 200
```

**Other issues found**
- None blocking. Note (non-blocking): `.gitignore` still carries Python-template leftovers (`dist/`, `build/`, `.venv/`, `*.egg-info/`) that don't apply to this JS/static stack. Harmless — `node_modules/` and secrets are correctly ignored, and nothing needed is hidden. Leave as-is or trim in a later cleanup task; out of scope for #000's AC.

**VERDICT: PASS**
