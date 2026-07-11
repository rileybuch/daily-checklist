// AC: the core modules import no DOM, no fetch, no Google globals, and no Node
// built-ins — they must run identically under `node --test` and in the browser
// as ES modules. This guards that boundary by scanning source + importing.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORE_DIR = path.join(HERE, "..", "..", "app", "js", "core");
const CORE_FILES = ["dates.js", "targets.js", "derive.js", "stats.js"];

// Browser-forbidden environment references and Google Apps Script globals.
const FORBIDDEN = [
  "document",
  "window",
  "fetch",
  "localStorage",
  "sessionStorage",
  "XMLHttpRequest",
  "navigator",
  "require",
  "process",
  "SpreadsheetApp",
  "ContentService",
  "Utilities",
  "Logger",
  "PropertiesService",
  "Session",
];

// Strip comments and string literals so a mention in prose is not miscounted.
function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

for (const file of CORE_FILES) {
  test(`${file} references no DOM / fetch / Node / Google globals`, () => {
    const code = stripCommentsAndStrings(fs.readFileSync(path.join(CORE_DIR, file), "utf8"));
    for (const name of FORBIDDEN) {
      assert.ok(
        !new RegExp(`\\b${name}\\b`).test(code),
        `${file} must not reference "${name}" in code`,
      );
    }
  });

  test(`${file} imports only from sibling core modules (relative paths)`, () => {
    const code = fs.readFileSync(path.join(CORE_DIR, file), "utf8");
    const importRe = /\bimport\b[^;]*?\bfrom\s+["']([^"']+)["']/g;
    let m;
    while ((m = importRe.exec(code)) !== null) {
      const spec = m[1];
      assert.ok(
        spec.startsWith("./") || spec.startsWith("../"),
        `${file} imports a non-relative specifier "${spec}" — core must be self-contained`,
      );
    }
  });
}

test("every core module imports cleanly in a plain (non-DOM, non-Google) runtime", async () => {
  const dates = await import("../../app/js/core/dates.js");
  const targets = await import("../../app/js/core/targets.js");
  const derive = await import("../../app/js/core/derive.js");
  const stats = await import("../../app/js/core/stats.js");

  assert.equal(typeof dates.weekParity, "function");
  assert.equal(typeof targets.resolveTarget, "function");
  assert.equal(typeof derive.binaryDayState, "function");
  assert.equal(typeof stats.currentStreak, "function");
});
