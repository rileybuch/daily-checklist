// Guards the pure/adapter split (AC): the pure core must reference NO Google
// globals — those live only in the adapter. If someone reaches for
// SpreadsheetApp / ContentService / Utilities inside core.gs.js, this fails.

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const CORE_PATH = path.join(__dirname, "..", "..", "backend", "core.gs.js");
const GOOGLE_GLOBALS = ["SpreadsheetApp", "ContentService", "Utilities", "Logger"];

// Strip block comments, line comments, and string literals so a mention of a
// global in a doc comment (e.g. "this file references no SpreadsheetApp") is not
// counted as a code reference. We only want to catch actual usage.
function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/\/\/[^\n]*/g, " ") // line comments
    .replace(/"(?:[^"\\]|\\.)*"/g, '""') // double-quoted strings
    .replace(/'(?:[^'\\]|\\.)*'/g, "''"); // single-quoted strings
}

test("pure core references no Google globals", () => {
  const code = stripCommentsAndStrings(fs.readFileSync(CORE_PATH, "utf8"));
  for (const name of GOOGLE_GLOBALS) {
    assert.ok(
      !new RegExp(`\\b${name}\\b`).test(code),
      `backend/core.gs.js must not reference the Google global "${name}" in code`,
    );
  }
});

test("pure core is importable in plain Node (CommonJS) with no Google runtime", () => {
  const core = require("../../backend/core.gs.js");
  assert.equal(typeof core.handleRequest, "function");
  assert.equal(typeof core.shapeResponse, "function");
  assert.equal(typeof core.sha256Hex, "function");
});
