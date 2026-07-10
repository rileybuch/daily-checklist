// Service worker (SPEC Section 2, task #007) — a module service worker.
//
// Responsibility: make the app SHELL load offline. On install it precaches the
// static shell (HTML/CSS/JS/manifest/icons); on fetch it serves those same-origin
// GETs cache-first; on activate it deletes any cache whose version differs from
// the current one so a version bump rolls out cleanly.
//
// It deliberately does NOT touch the Apps Script `/exec` data calls: those are
// cross-origin (and the writes are POSTs), so `shouldBypassCache` sends them
// straight to the network, where the #003 offline queue owns ret/replay. Caching
// them here would double-write events and serve stale data — an explicit AC.
//
// All cache DECISIONS live in the pure, unit-tested ./sw-precache.js. This file
// is only the thin Cache-API wiring (not unit tested — it needs the real SW
// lifecycle; exercised by the [HUMAN] on-device checks).

import { CACHE_VERSION, PRECACHE_URLS, shouldBypassCache, cachesToDelete } from "./sw-precache.js";

// Precache the shell. `{ cache: "reload" }` skips the HTTP cache so a version
// bump always fetches fresh bytes for the new shell.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

// Evict superseded shells, then take control of open clients.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(cachesToDelete(names, CACHE_VERSION).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

// Cache-first for same-origin shell GETs; everything else (cross-origin Apps
// Script data calls, any non-GET) bypasses the cache and hits the network.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (shouldBypassCache(request.url, self.location.origin, request.method)) {
    return; // let the browser handle it against the network / #003 queue
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }
      // Not precached (or a shell asset added mid-session): fetch and cache it.
      const response = await fetch(request);
      if (response && response.ok && response.type === "basic") {
        cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
