// Pure service-worker cache policy (SPEC Section 2, task #007).
//
// This module holds every cache DECISION the service worker makes — the cache
// version, the exact app-shell precache list, which requests bypass the cache,
// and which stale caches to delete on activate. It is intentionally free of any
// service-worker globals (`self`, `caches`, `fetch`, `FetchEvent`): everything
// here is a pure value or a pure function of its arguments, so it can be unit
// tested under `node --test` without simulating the SW lifecycle. `sw.js`
// imports these and wires them to the real Cache API.
//
// Everything is relative (no leading "/") so the app works under a GitHub Pages
// project subpath: the URLs resolve against the service-worker scope, not the
// origin root.

/**
 * Cache version. Bump this string to ship a new shell: on `activate` the SW
 * deletes every cache whose name is not exactly this, so the old shell is
 * evicted and clients pick up the new assets. Format: `dc-shell-v<N>`.
 */
export const CACHE_VERSION = "dc-shell-v1";

/**
 * The app-shell precache list: every static, same-origin asset needed to render
 * the shell offline (HTML, CSS, JS modules, manifest, icons). Relative URLs,
 * resolved against the SW scope. Kept in sync with the real files by
 * test/pwa/sw-precache.test.mjs, which fails if a shell file is added or removed
 * without updating this list.
 *
 * Deliberately excludes the cross-origin Apps Script data calls — those are
 * owned by the #003 offline queue and must always hit the network (see
 * `shouldBypassCache`).
 */
export const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",

  "./css/today.css",
  "./css/week.css",
  "./css/trends.css",
  "./css/manage.css",

  "./js/app.js",
  "./js/controllers/manageController.js",
  "./js/controllers/todayController.js",
  "./js/core/dates.js",
  "./js/core/derive.js",
  "./js/core/series.js",
  "./js/core/stats.js",
  "./js/core/targets.js",
  "./js/data/apiClient.js",
  "./js/data/credentials.js",
  "./js/data/demoTransport.js",
  "./js/data/ids.js",
  "./js/data/prefill.js",
  "./js/data/queue.js",
  "./js/data/sync.js",
  "./js/views/manage.js",
  "./js/views/manageModel.js",
  "./js/views/stats.js",
  "./js/views/statsModel.js",
  "./js/views/today.js",
  "./js/views/todayModel.js",
  "./js/views/trends.js",
  "./js/views/trendsModel.js",
  "./js/views/week.js",
  "./js/views/weekModel.js",
  "./js/views/charts/svg.js",

  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

/**
 * Decide whether a request must bypass the cache and always hit the network.
 *
 * The SW only ever caches same-origin GETs for the static shell. Everything else
 * bypasses:
 *   - any non-GET method (POST/PUT/...), so event batches are never cached;
 *   - any cross-origin request — the Apps Script Web App `/exec` data calls live
 *     on `script.google.com`, a different origin, so bootstrap GETs and event
 *     POSTs both bypass and stay on the #003 network queue.
 *
 * @param {string} requestUrl absolute request URL
 * @param {string} scopeOrigin the SW's own origin (e.g. `self.location.origin`)
 * @param {string} [method] HTTP method; defaults to GET
 * @returns {boolean} true if the request should skip the cache entirely
 *
 * @example
 * shouldBypassCache("https://script.google.com/macros/s/A/exec?path=events", "https://me.github.io", "POST")
 * // => true
 * @example
 * shouldBypassCache("https://me.github.io/checklist/css/today.css", "https://me.github.io", "GET")
 * // => false
 */
export function shouldBypassCache(requestUrl, scopeOrigin, method = "GET") {
  if (String(method).toUpperCase() !== "GET") {
    return true;
  }
  let origin;
  try {
    origin = new URL(requestUrl).origin;
  } catch {
    return true;
  }
  return origin !== scopeOrigin;
}

/**
 * Given the cache names that currently exist, return the ones to delete on
 * `activate` — every cache except the current {@link CACHE_VERSION}. This is how
 * a version bump evicts the previous shell.
 *
 * @param {string[]} existingNames names returned by `caches.keys()`
 * @param {string} [keep] the version to retain; defaults to {@link CACHE_VERSION}
 * @returns {string[]} names to pass to `caches.delete`
 *
 * @example
 * cachesToDelete(["dc-shell-v1", "dc-shell-v2", "other"], "dc-shell-v2")
 * // => ["dc-shell-v1", "other"]
 */
export function cachesToDelete(existingNames, keep = CACHE_VERSION) {
  return existingNames.filter((name) => name !== keep);
}
