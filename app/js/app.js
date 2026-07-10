// App entry point — wires the data/sync layer to the Today view (SPEC M2).
//
// Responsibilities (all glue; the logic lives in the tested modules):
//   1. Resolve credentials (one-time prompt) — or enter demo mode with ?demo=1.
//   2. Cache the bootstrap response in localStorage so the shell renders instantly
//      from cache and refreshes in the background.
//   3. Build the queue / api client / sync engine / controller and mount Today.
//   4. Flush the outbound queue on a short debounce after activity, on app open,
//      and whenever connectivity is regained (`online`) — the offline-queue
//      guarantee from SPEC Section 4 / AC #6.
//
// This file is never imported by tests; it is exercised by the runtime smoke and
// the [HUMAN] on-device checks.

import { ensureCredentials } from "./data/credentials.js";
import { createApiClient } from "./data/apiClient.js";
import { createQueue } from "./data/queue.js";
import { createSyncEngine } from "./data/sync.js";
import { createTodayController } from "./controllers/todayController.js";
import { newEventId } from "./data/ids.js";
import { renderToday } from "./views/today.js";
import { renderWeek } from "./views/week.js";
import { renderTrends } from "./views/trends.js";
import { renderStats } from "./views/stats.js";
import { renderManage } from "./views/manage.js";
import { createManageController } from "./controllers/manageController.js";
import { createDemoTransport } from "./data/demoTransport.js";

const CACHE_KEY = "dc.bootstrapCache";
const FLUSH_DEBOUNCE_MS = 1200;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function setupPrompt(root) {
  root.innerHTML = "";
  const box = document.createElement("div");
  box.className = "setup";
  box.innerHTML =
    "<h2>Setup needed</h2>" +
    "<p>This tracker needs your shared secret token and the Web App URL to sync. " +
    "Reload the page to enter them, or append <code>?demo=1</code> to try it with sample data.</p>" +
    '<button id="setup-retry">Enter credentials</button>';
  root.appendChild(box);
  box.querySelector("#setup-retry").addEventListener("click", () => window.location.reload());
}

function readCache() {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(data) {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

async function main() {
  const root = document.getElementById("app");
  const params = new URLSearchParams(window.location.search);
  const demo = params.get("demo") === "1";

  // 1. Credentials / transport.
  let baseUrl;
  let token;
  let transport;
  if (demo) {
    const stub = createDemoTransport();
    ({ baseUrl, token, transport } = stub);
  } else {
    const creds = ensureCredentials(window.localStorage, window.prompt.bind(window));
    if (!creds) {
      setupPrompt(root);
      return;
    }
    baseUrl = creds.baseUrl;
    token = creds.token;
    transport = window.fetch.bind(window);
  }

  const apiClient = createApiClient({ baseUrl, token, transport });
  const queue = createQueue({ storage: window.localStorage });
  const sync = createSyncEngine({ queue, apiClient });

  // Debounced background flush + re-render.
  let view = null;
  let controller = null;
  let manageController = null;
  let activeView = "today"; // "today" | "week" | "trends" | "stats" | "manage"
  let viewRoot = null;
  let flushTimer = null;
  async function flushNow() {
    await sync.flush();
    if (view) {
      view.rerender();
    }
  }
  function scheduleFlush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(flushNow, FLUSH_DEBOUNCE_MS);
  }

  function build(data) {
    // Manage shares the same bootstrap arrays as Today, so archiving a habit or
    // adding a rule here is reflected in Today/Week on the next render.
    manageController = createManageController({
      bootstrapData: data,
      apiClient,
      newId: newEventId,
      todayIso: todayIso(),
    });
    return createTodayController({
      bootstrapData: data,
      queue,
      sync,
      newId: newEventId,
      now: () => new Date().toISOString(),
      todayIso: todayIso(),
    });
  }

  function mountActiveView() {
    viewRoot.innerHTML = "";
    if (activeView === "week") {
      view = renderWeek(viewRoot, controller, {
        todayIso: todayIso(),
        // Backfill: tapping a past cell opens that date's Today view (SPEC 5.2).
        onOpenDate: (iso) => {
          controller.setDate(iso);
          switchView("today");
        },
      });
    } else if (activeView === "trends") {
      view = renderTrends(viewRoot, controller, { todayIso: todayIso() });
    } else if (activeView === "stats") {
      view = renderStats(viewRoot, controller, { todayIso: todayIso() });
    } else if (activeView === "manage") {
      view = renderManage(viewRoot, manageController, { todayIso: todayIso() });
    } else {
      view = renderToday(viewRoot, controller, { todayIso: todayIso(), onActivity: scheduleFlush });
    }
  }

  function navBar() {
    const nav = document.createElement("div");
    nav.className = "view-nav";
    for (const [name, label] of [["today", "Today"], ["week", "Week"], ["trends", "Trends"], ["stats", "Stats"], ["manage", "Manage"]]) {
      const btn = document.createElement("button");
      btn.textContent = label;
      if (name === activeView) {
        btn.className = "active";
      }
      btn.addEventListener("click", () => switchView(name));
      nav.appendChild(btn);
    }
    return nav;
  }

  function renderShell() {
    root.innerHTML = "";
    root.appendChild(navBar());
    viewRoot = document.createElement("div");
    viewRoot.className = "view-root";
    root.appendChild(viewRoot);
    mountActiveView();
  }

  function switchView(name) {
    activeView = name;
    renderShell();
  }

  // 2. Render instantly from cache if present.
  const cached = readCache();
  if (cached) {
    controller = build(cached);
    renderShell();
  }

  // 3. Refresh bootstrap in the background (or do the initial load if no cache).
  try {
    const fresh = await apiClient.bootstrap();
    const bootstrapData = {
      habits: fresh.habits || [],
      target_rules: fresh.target_rules || [],
      config: fresh.config || {},
      events: fresh.events || [],
    };
    writeCache(bootstrapData);
    if (controller) {
      controller.setServerEvents(bootstrapData.events);
      view.rerender();
    } else {
      controller = build(bootstrapData);
      renderShell();
    }
  } catch (err) {
    if (!controller) {
      setupPrompt(root);
      return;
    }
    console.warn("bootstrap refresh failed; using cached data", err);
  }

  // 4. Flush triggers: on open now, and whenever connectivity returns.
  window.addEventListener("online", flushNow);
  flushNow();
}

main();
