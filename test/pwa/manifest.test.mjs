// Unit tests for app/manifest.webmanifest — task #007 AC:
// valid JSON, required keys, relative start_url, icons array referencing real
// icon files at the required sizes, and no root-absolute URLs (subpath-safe).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(HERE, "..", "..", "app");
const MANIFEST_PATH = join(APP_DIR, "manifest.webmanifest");

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

test("manifest.webmanifest is valid JSON", () => {
  assert.doesNotThrow(loadManifest);
});

test("manifest has the required PWA keys", () => {
  const m = loadManifest();
  for (const key of ["name", "short_name", "start_url", "display", "theme_color", "background_color", "icons"]) {
    assert.ok(m[key] !== undefined && m[key] !== "", `missing manifest key: ${key}`);
  }
  assert.equal(m.display, "standalone");
});

test("start_url is relative (GitHub Pages subpath-safe)", () => {
  const m = loadManifest();
  assert.ok(!m.start_url.startsWith("/"), `start_url must be relative, got: ${m.start_url}`);
});

test("theme_color and background_color are hex colors", () => {
  const m = loadManifest();
  assert.match(m.theme_color, /^#[0-9a-fA-F]{6}$/);
  assert.match(m.background_color, /^#[0-9a-fA-F]{6}$/);
});

test("icons is a non-empty array whose every src references an existing file", () => {
  const m = loadManifest();
  assert.ok(Array.isArray(m.icons) && m.icons.length > 0);
  for (const icon of m.icons) {
    assert.ok(icon.src, "icon missing src");
    assert.ok(icon.sizes, `icon missing sizes: ${icon.src}`);
    assert.ok(icon.type, `icon missing type: ${icon.src}`);
    assert.ok(!icon.src.startsWith("/"), `icon src must be relative: ${icon.src}`);
    assert.ok(existsSync(join(APP_DIR, icon.src.replace(/^\.\//, ""))), `icon file missing: ${icon.src}`);
  }
});

test("icons include the 192x192 and 512x512 sizes PWA install requires", () => {
  const m = loadManifest();
  const sizes = new Set(m.icons.map((i) => i.sizes));
  assert.ok(sizes.has("192x192"), "missing 192x192 icon");
  assert.ok(sizes.has("512x512"), "missing 512x512 icon");
});

test("no manifest URL is root-absolute", () => {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  const m = JSON.parse(raw);
  assert.ok(!m.start_url.startsWith("/"));
  for (const icon of m.icons) {
    assert.ok(!icon.src.startsWith("/"), `root-absolute icon src: ${icon.src}`);
  }
});
