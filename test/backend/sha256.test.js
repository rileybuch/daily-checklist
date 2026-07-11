// Verifies the pure-JS sha256Hex in backend/core.gs.js against Node's built-in
// crypto for a range of inputs (empty, ASCII, long, multibyte). This is the
// safety net that lets us ship a hand-rolled SHA-256 — the core can't use
// Apps Script's Utilities.computeDigest (Google global), and Node and Apps
// Script must hash a token to the SAME digest for token auth to work.

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { sha256Hex } = require("../../backend/core.gs.js");

function reference(str) {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

const CASES = [
  "",
  "a",
  "abc",
  "good",
  "hello world",
  "The quick brown fox jumps over the lazy dog",
  "a".repeat(1000),
  "token-with-symbols!@#$%^&*()_+",
  "unicode: café ☕ 日本語 🏋️",
];

for (const input of CASES) {
  test(`sha256Hex matches node:crypto for ${JSON.stringify(input.slice(0, 24))}`, () => {
    assert.equal(sha256Hex(input), reference(input));
  });
}

test("sha256Hex returns 64 lowercase hex chars", () => {
  const digest = sha256Hex("anything");
  assert.match(digest, /^[0-9a-f]{64}$/);
});
