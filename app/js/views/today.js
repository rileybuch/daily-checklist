// Thin DOM renderer for the Today view (SPEC Section 5, view 1).
//
// This layer is DELIBERATELY thin: it turns the pure row descriptors from
// todayModel (via the controller) into elements and wires each control to a
// controller method, then re-paints. All decision logic lives in the controller
// and the domain core, which are unit-tested; this file is exercised by the
// runtime smoke and the [HUMAN] on-device checks. Keeping it logic-free is what
// lets us test the feature without a DOM dependency.

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_PRESS_MS = 500;

function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.class) {
    node.className = opts.class;
  }
  if (opts.text !== undefined) {
    node.textContent = opts.text;
  }
  for (const [key, value] of Object.entries(opts.attrs || {})) {
    node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child) {
      node.appendChild(child);
    }
  }
  return node;
}

/** Format an ISO date as a friendly label like "Mon Jul 6". */
function dateLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const serial = Date.UTC(y, m - 1, d) / 86400000;
  const dow = DOW[(((serial % 7) + 4) % 7 + 7) % 7];
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `${dow} ${month} ${d}`;
}

/** Add whole days to an ISO date without timezone drift. */
function addDaysIso(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/**
 * Mount the Today view into `root`, driven by `controller`.
 * `onActivity` is called after every mutating action so the app can schedule a
 * background flush.
 *
 * @param {HTMLElement} root
 * @param {object} controller createTodayController(...) instance
 * @param {{onActivity?: Function, todayIso: string}} opts
 * @returns {{rerender: Function}}
 */
export function renderToday(root, controller, { onActivity = () => {}, todayIso } = {}) {
  function act(fn) {
    fn();
    onActivity();
    paint();
  }

  function header() {
    const date = controller.getSelectedDate();
    const prev = el("button", { class: "nav", text: "‹", attrs: { "aria-label": "Previous day" } });
    prev.addEventListener("click", () => act(() => controller.setDate(addDaysIso(date, -1))));

    const next = el("button", { class: "nav", text: "›", attrs: { "aria-label": "Next day" } });
    if (date >= todayIso) {
      next.disabled = true;
    } else {
      next.addEventListener("click", () => act(() => controller.setDate(addDaysIso(date, 1))));
    }

    const label = el("button", { class: "date-label", text: date === todayIso ? `Today · ${dateLabel(date)}` : dateLabel(date) });
    label.addEventListener("click", () => act(() => controller.setDate(todayIso)));

    const pending = controller.pendingCount();
    const badge = pending > 0 ? el("span", { class: "pending", text: `${pending} pending` }) : null;

    return el("header", { class: "today-header" }, [prev, label, next, badge]);
  }

  function counterRow(row) {
    const meta = el("div", { class: "row-meta" }, [
      el("span", { class: "habit-name", text: row.name }),
      el("span", { class: "progress", text: `${row.count} / ${row.target} sets` }),
    ]);

    const fill = el("div", { class: "fill" });
    fill.style.width = `${Math.round(row.fillRatio * 100)}%`;
    const bar = el("div", { class: "fill-bar" }, [fill]);

    const plus = el("button", { class: "plus", text: "＋", attrs: { "aria-label": `Log a ${row.name} set` } });
    plus.addEventListener("click", () => act(() => controller.logSet(row.habitId)));

    const controls = [plus];
    if (row.lastSet) {
      const dec = el("button", { class: "step", text: "−", attrs: { "aria-label": "Decrease value" } });
      dec.addEventListener("click", () => act(() => controller.editSetValue(row.lastSet.event_id, row.lastSet.value - 1)));
      const val = el("span", { class: "set-value", text: `${row.lastSet.value} ${row.unit}` });
      const inc = el("button", { class: "step", text: "+", attrs: { "aria-label": "Increase value" } });
      inc.addEventListener("click", () => act(() => controller.editSetValue(row.lastSet.event_id, row.lastSet.value + 1)));
      const undo = el("button", { class: "undo", text: "undo", attrs: { "aria-label": "Undo last set" } });
      undo.addEventListener("click", () => act(() => controller.undoLast(row.habitId)));
      controls.push(el("div", { class: "stepper" }, [dec, val, inc]), undo);
    }

    return el("div", { class: `row counter state-${row.state}` }, [meta, bar, el("div", { class: "controls" }, controls)]);
  }

  function binaryRow(row) {
    const cell = el("button", { class: `cell binary state-${row.state}`, text: row.name });

    // Tap toggles; long-press (or the secondary ⋯ button) skips.
    let timer = null;
    let longFired = false;
    const startPress = () => {
      longFired = false;
      timer = setTimeout(() => {
        longFired = true;
        act(() => controller.skipBinary(row.habitId));
      }, LONG_PRESS_MS);
    };
    const endPress = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    cell.addEventListener("pointerdown", startPress);
    cell.addEventListener("pointerup", endPress);
    cell.addEventListener("pointerleave", endPress);
    cell.addEventListener("click", () => {
      if (longFired) {
        return; // the long-press already handled it as a skip
      }
      act(() => controller.toggleBinary(row.habitId));
    });

    const skip = el("button", { class: "skip", text: "skip", attrs: { "aria-label": `Skip ${row.name}` } });
    skip.addEventListener("click", () => act(() => controller.skipBinary(row.habitId)));

    return el("div", { class: `row binary state-${row.state}` }, [cell, skip]);
  }

  function measurementRow(row) {
    const input = el("input", { class: "measure-input", attrs: { type: "number", inputmode: "numeric", placeholder: row.unit || "value" } });
    const last = row.lastValue === null ? "—" : `${row.lastValue} ${row.unit}`;
    const meta = el("div", { class: "row-meta" }, [
      el("span", { class: "habit-name", text: row.name }),
      el("span", { class: "progress", text: `last: ${last}` }),
    ]);
    const record = el("button", { class: "record", text: "Record" });
    record.addEventListener("click", () => {
      const value = Number(input.value);
      if (Number.isFinite(value) && input.value !== "") {
        act(() => controller.recordMeasure(row.habitId, value));
      }
    });
    return el("div", { class: "row measurement" }, [meta, el("div", { class: "controls" }, [input, record])]);
  }

  function renderRow(row) {
    if (row.type === "counter") {
      return counterRow(row);
    }
    if (row.type === "binary") {
      return binaryRow(row);
    }
    return measurementRow(row);
  }

  function paint() {
    root.innerHTML = "";
    root.appendChild(header());
    const rows = controller.rows();
    if (rows.length === 0) {
      root.appendChild(el("p", { class: "empty", text: "Nothing scheduled for this day." }));
      return;
    }
    const list = el("div", { class: "rows" }, rows.map(renderRow));
    root.appendChild(list);
  }

  paint();
  return { rerender: paint };
}
