// One-time credential bootstrap (SPEC Section 2 security model).
//
// Auth is a single shared-secret token plus the Apps Script Web App `/exec`
// base URL, both stored in `localStorage` after a one-time prompt. There is no
// OAuth in v1. `localStorage` is injected (a `getItem`/`setItem`-shaped object)
// and the prompt function is injected too, so this whole flow is unit-testable
// with fakes — no browser required.

const TOKEN_KEY = "dc.token";
const BASE_URL_KEY = "dc.baseUrl";

/**
 * Read stored credentials, or null when either piece is missing.
 * @param {{getItem: Function}} storage
 * @returns {{token: string, baseUrl: string} | null}
 */
export function loadCredentials(storage) {
  const token = storage.getItem(TOKEN_KEY);
  const baseUrl = storage.getItem(BASE_URL_KEY);
  if (token && baseUrl) {
    return { token, baseUrl };
  }
  return null;
}

/**
 * True iff both a token and a base URL are stored.
 * @param {{getItem: Function}} storage
 * @returns {boolean}
 */
export function hasCredentials(storage) {
  return loadCredentials(storage) !== null;
}

/**
 * Persist credentials to storage. Values are trimmed at the boundary.
 * @param {{setItem: Function}} storage
 * @param {{token: string, baseUrl: string}} credentials
 */
export function saveCredentials(storage, { token, baseUrl }) {
  storage.setItem(TOKEN_KEY, String(token).trim());
  storage.setItem(BASE_URL_KEY, String(baseUrl).trim());
}

/**
 * Return stored credentials if present; otherwise prompt once (token, then URL),
 * persist, and return them. Returns null if the user cancels either prompt
 * (nothing is persisted) so the caller can show the setup prompt instead of
 * failing silently.
 *
 * @param {{getItem: Function, setItem: Function}} storage
 * @param {(message: string) => (string|null)} prompt injected prompt function
 * @returns {{token: string, baseUrl: string} | null}
 */
export function ensureCredentials(storage, prompt) {
  const existing = loadCredentials(storage);
  if (existing) {
    return existing;
  }
  const token = prompt("Shared secret token:");
  const baseUrl = prompt("Web App /exec URL:");
  if (!token || !baseUrl || !String(token).trim() || !String(baseUrl).trim()) {
    return null;
  }
  const credentials = { token: String(token).trim(), baseUrl: String(baseUrl).trim() };
  saveCredentials(storage, credentials);
  return credentials;
}
