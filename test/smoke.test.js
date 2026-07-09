// Smoke test: proves the node --test harness runs with zero dependencies.
// Later tasks add real tests under test/ mirroring app/js and backend module paths.
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("test harness runs", () => {
  assert.equal(1 + 1, 2);
});
