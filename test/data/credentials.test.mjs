// Unit tests for app/js/data/credentials.js — one-time token/URL bootstrap.
// AC: first load with no stored token prompts once and persists; later loads
// don't re-prompt. Verified against a fake localStorage.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  loadCredentials,
  hasCredentials,
  saveCredentials,
  ensureCredentials,
} from "../../app/js/data/credentials.js";
import { FakeStorage } from "../helpers/fakes.mjs";

test("loadCredentials returns null when nothing is stored", () => {
  assert.equal(loadCredentials(new FakeStorage()), null);
  assert.equal(hasCredentials(new FakeStorage()), false);
});

test("saveCredentials persists token + baseUrl and loadCredentials reads them back", () => {
  const storage = new FakeStorage();
  saveCredentials(storage, { token: "sekret", baseUrl: "https://x/exec" });
  assert.deepEqual(loadCredentials(storage), { token: "sekret", baseUrl: "https://x/exec" });
  assert.equal(hasCredentials(storage), true);
});

test("ensureCredentials prompts once on first load, persists, and does not re-prompt", () => {
  const storage = new FakeStorage();
  const answers = ["  my-token  ", "  https://script/exec  "];
  let prompts = 0;
  const prompt = () => {
    prompts += 1;
    return answers.shift();
  };

  const first = ensureCredentials(storage, prompt);
  assert.deepEqual(first, { token: "my-token", baseUrl: "https://script/exec" });
  assert.equal(prompts, 2, "prompts once for token and once for URL on first load");

  // A subsequent load (new call) must read from storage without prompting.
  const second = ensureCredentials(storage, () => {
    throw new Error("must not prompt again");
  });
  assert.deepEqual(second, { token: "my-token", baseUrl: "https://script/exec" });
});

test("ensureCredentials returns null (no persist) when the user cancels a prompt", () => {
  const storage = new FakeStorage();
  const creds = ensureCredentials(storage, () => null);
  assert.equal(creds, null);
  assert.equal(hasCredentials(storage), false);
});
