// Unit tests for the shell HTML + service-worker wiring — task #007 AC:
// index.html links the manifest, includes the apple-touch-icon and iOS web-app
// meta tags, registers the service worker behind a feature check, and uses only
// relative asset URLs. Also asserts sw.js wires the tested pure policy into the
// install/activate/fetch lifecycle.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(HERE, "..", "..", "app");
const html = readFileSync(join(APP_DIR, "index.html"), "utf8");
const sw = readFileSync(join(APP_DIR, "sw.js"), "utf8");

test("index.html links the web app manifest", () => {
  assert.match(html, /<link[^>]+rel=["']manifest["'][^>]+href=["'](\.\/)?manifest\.webmanifest["']/);
});

test("index.html includes an apple-touch-icon pointing at an existing file", () => {
  const m = html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/);
  assert.ok(m, "no apple-touch-icon link");
  const href = m[1];
  assert.ok(!href.startsWith("/"), `apple-touch-icon href must be relative: ${href}`);
  assert.ok(existsSync(join(APP_DIR, href.replace(/^\.\//, ""))), `apple-touch-icon file missing: ${href}`);
});

test("index.html declares the iOS standalone web-app meta tags", () => {
  assert.match(html, /<meta[^>]+name=["']apple-mobile-web-app-capable["'][^>]+content=["']yes["']/);
  assert.match(html, /<meta[^>]+name=["']apple-mobile-web-app-status-bar-style["']/);
  assert.match(html, /<meta[^>]+name=["']apple-mobile-web-app-title["']/);
});

test("index.html sets theme-color meta matching a hex color", () => {
  const m = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-fA-F]{6})["']/);
  assert.ok(m, "no theme-color meta");
});

test("index.html registers the service worker behind a feature check", () => {
  assert.match(html, /serviceWorker/); // feature-detected registration
  assert.match(html, /['"]serviceWorker['"]\s*in\s*navigator|navigator\.serviceWorker/);
  assert.match(html, /register\(\s*["']\.\/sw\.js["']/);
});

test("index.html uses no root-absolute asset URLs (subpath-safe)", () => {
  const badHref = html.match(/(?:href|src)=["']\/[^"']*["']/g) || [];
  assert.deepEqual(badHref, [], `root-absolute asset URLs found: ${badHref.join(", ")}`);
});

test("sw.js imports the pure cache policy instead of hardcoding it", () => {
  assert.match(sw, /import\s*\{[^}]*\}\s*from\s*["']\.\/sw-precache\.js["']/);
  for (const symbol of ["CACHE_VERSION", "PRECACHE_URLS", "shouldBypassCache", "cachesToDelete"]) {
    assert.match(sw, new RegExp(symbol), `sw.js should use ${symbol} from the tested module`);
  }
});

test("sw.js wires install, activate, and fetch lifecycle handlers", () => {
  assert.match(sw, /addEventListener\(\s*["']install["']/);
  assert.match(sw, /addEventListener\(\s*["']activate["']/);
  assert.match(sw, /addEventListener\(\s*["']fetch["']/);
});
