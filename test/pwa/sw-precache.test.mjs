// Unit tests for app/sw-precache.js — the pure service-worker cache policy.
// Covers task #007 ACs: cache-version constant, precache list matches the real
// shell files (both directions), Apps Script /exec data calls bypass the cache,
// and stale caches are selected for deletion on activate.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

import { CACHE_VERSION, PRECACHE_URLS, shouldBypassCache, cachesToDelete } from "../../app/sw-precache.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(HERE, "..", "..", "app");
const ORIGIN = "https://riley.github.io";

/** Recursively collect files under dir, returned as POSIX paths relative to APP_DIR. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(relative(APP_DIR, full).split(/[\\/]/).join("/"));
    }
  }
  return out;
}

/** Map a precache URL ("./css/today.css") to an absolute path under app/. */
function toAppPath(url) {
  return join(APP_DIR, url.replace(/^\.\//, ""));
}

test("CACHE_VERSION is a bumpable dc-shell-v<N> constant", () => {
  assert.match(CACHE_VERSION, /^dc-shell-v\d+$/);
});

test("every precache URL is relative (GitHub Pages subpath-safe, no root-absolute)", () => {
  for (const url of PRECACHE_URLS) {
    assert.ok(url.startsWith("./"), `precache URL must be relative: ${url}`);
    assert.ok(!url.startsWith("/"), `precache URL must not be root-absolute: ${url}`);
  }
});

test("every precache URL (except the start_url) points at a file that exists", () => {
  for (const url of PRECACHE_URLS) {
    if (url === "./") {
      continue; // start_url — served as index.html, no distinct file
    }
    assert.ok(existsSync(toAppPath(url)), `precache URL has no backing file: ${url}`);
  }
});

test("precache list matches the real shell files (no drift in either direction)", () => {
  // Shell = index.html + manifest + every css/js/icon under app/. If a future
  // task adds a shell asset, this fails until it is added to PRECACHE_URLS.
  const shellFiles = walk(APP_DIR).filter(
    (p) =>
      !p.split("/").pop().startsWith(".") && // ignore .gitkeep and other dotfiles
      (p === "index.html" ||
        p === "manifest.webmanifest" ||
        p.startsWith("css/") ||
        p.startsWith("js/") ||
        p.startsWith("icons/")),
  );

  const precached = new Set(PRECACHE_URLS.filter((u) => u !== "./").map((u) => u.replace(/^\.\//, "")));

  for (const file of shellFiles) {
    assert.ok(precached.has(file), `shell file not in PRECACHE_URLS: ${file}`);
  }
  for (const url of precached) {
    assert.ok(shellFiles.includes(url), `PRECACHE_URLS references a non-shell/missing file: ${url}`);
  }
});

test("app.js and sw-precache.js are NOT double-listed; sw.js itself is not precached", () => {
  // sw.js must not precache itself (browsers manage the SW script separately);
  // sw-precache.js is imported by the module SW, so it is loaded by the browser
  // as part of registering sw.js and does not belong in the shell asset cache.
  const precached = new Set(PRECACHE_URLS);
  assert.ok(!precached.has("./sw.js"), "sw.js should not precache itself");
  assert.ok(!precached.has("./sw-precache.js"), "sw-precache.js should not be in the shell cache");
});

test("shouldBypassCache: cross-origin Apps Script GET and POST both bypass the cache", () => {
  const exec = "https://script.google.com/macros/s/AKID/exec?path=events&token=t";
  assert.equal(shouldBypassCache(exec, ORIGIN, "POST"), true);
  assert.equal(shouldBypassCache(exec, ORIGIN, "GET"), true);
});

test("shouldBypassCache: any non-GET method bypasses even same-origin", () => {
  const sameOrigin = `${ORIGIN}/checklist/js/app.js`;
  assert.equal(shouldBypassCache(sameOrigin, ORIGIN, "POST"), true);
  assert.equal(shouldBypassCache(sameOrigin, ORIGIN, "PUT"), true);
});

test("shouldBypassCache: same-origin GET for a shell asset is cacheable (not bypassed)", () => {
  assert.equal(shouldBypassCache(`${ORIGIN}/checklist/css/today.css`, ORIGIN, "GET"), false);
  assert.equal(shouldBypassCache(`${ORIGIN}/checklist/index.html`, ORIGIN, "GET"), false);
});

test("shouldBypassCache: a malformed URL bypasses rather than throwing", () => {
  assert.equal(shouldBypassCache("not a url", ORIGIN, "GET"), true);
});

test("cachesToDelete keeps the current version and returns all others", () => {
  const existing = ["dc-shell-v1", "dc-shell-v2", "unrelated-cache"];
  assert.deepEqual(cachesToDelete(existing, "dc-shell-v2"), ["dc-shell-v1", "unrelated-cache"]);
});

test("cachesToDelete defaults to keeping CACHE_VERSION", () => {
  const existing = ["dc-shell-old", CACHE_VERSION];
  assert.deepEqual(cachesToDelete(existing), ["dc-shell-old"]);
});

test("cachesToDelete returns nothing when only the current cache exists", () => {
  assert.deepEqual(cachesToDelete([CACHE_VERSION]), []);
});
