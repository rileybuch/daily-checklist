// Thin DOM renderer for the Manage screens (SPEC Section 5, view 5).
//
// Like the other views this layer is DELIBERATELY thin: it turns the Manage
// controller's state into forms + lists and wires each control to a controller
// method, then re-paints. All validation, slug derivation, and schedule
// resolution live in the pure manageModel / the #002 core (both unit-tested);
// this file is proven by the DOM tests (via the fake-DOM shim) and the runtime
// smoke.
//
// Interactions:
//   - Add habit (name → live slug, type → conditional unit field, sort_order).
//   - Edit habit (name / unit / sort_order / active; habit_id + type are shown
//     read-only — immutable after creation).
//   - Archive / reactivate a habit (active toggle; history is retained).
//   - Edit schedule: list a habit's target rules, add a new (append-only) rule
//     with a live plain-language weekly preview, and a "raise target" shortcut
//     that defaults effective_from to tomorrow.

import { deriveSlug, typeHasUnit } from "./manageModel.js";

const DAYS = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
];
const TYPES = [
  ["counter", "Counter"],
  ["binary", "Binary"],
  ["measurement", "Measurement"],
];
const PARITIES = [
  ["*", "Every week"],
  ["even", "Even weeks"],
  ["odd", "Odd weeks"],
];

function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.class) {
    node.className = opts.class;
  }
  if (opts.text !== undefined) {
    node.textContent = opts.text;
  }
  if (opts.value !== undefined) {
    node.value = opts.value;
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

function select(cls, options, selected) {
  const node = el("select", { class: cls });
  for (const [value, label] of options) {
    node.appendChild(el("option", { text: label, value, attrs: { value } }));
  }
  node.value = selected;
  return node;
}

function isActive(habit) {
  return habit.active === true || String(habit.active).toLowerCase() === "true" || habit.active === undefined;
}

function errorBox(cls, errors) {
  const box = el("div", { class: cls });
  for (const message of errors) {
    box.appendChild(el("p", { class: "error", text: message }));
  }
  return box;
}

/**
 * Mount the Manage screens into `root`, driven by `controller`.
 *
 * @param {HTMLElement} root
 * @param {object} controller createManageController(...) instance
 * @param {{todayIso: string}} opts
 * @returns {{rerender: Function, whenIdle: Function}}
 *   `whenIdle()` resolves once the most recent async write (add/edit/archive/rule)
 *   has settled — used by the DOM tests to await a click.
 */
export function renderManage(root, controller, { todayIso } = {}) {
  let editingId = null; // habit currently in inline-edit mode
  let scheduleId = null; // habit whose schedule editor is open
  let pending = Promise.resolve();

  /** Track an async write so the DOM tests can await it via whenIdle(). */
  function track(promise) {
    pending = promise;
    return promise;
  }

  /** Render validation messages into an error box without a full re-paint. */
  function showErrors(box, errors) {
    box.innerHTML = "";
    for (const message of errors) {
      box.appendChild(el("p", { class: "error", text: message }));
    }
  }

  // --- Add habit -----------------------------------------------------------

  function addHabitForm() {
    const form = el("form", { class: "manage-add-habit" });
    form.appendChild(el("h3", { text: "Add habit" }));

    const name = el("input", { class: "habit-name", attrs: { type: "text", placeholder: "Name" } });
    const slug = el("span", { class: "habit-slug-preview", text: "" });
    name.addEventListener("input", () => {
      slug.textContent = deriveSlug(name.value) || "—";
    });

    const type = select("habit-type", TYPES, "counter");
    const unitSlot = el("div", { class: "unit-slot" });
    function renderUnitSlot() {
      unitSlot.innerHTML = "";
      if (typeHasUnit(type.value)) {
        unitSlot.appendChild(
          el("input", { class: "habit-unit", attrs: { type: "text", placeholder: "unit (reps / seconds)" } }),
        );
      }
    }
    renderUnitSlot();
    type.addEventListener("change", renderUnitSlot);

    const sort = el("input", { class: "habit-sort", value: "0", attrs: { type: "number", inputmode: "numeric" } });
    const errors = el("div", { class: "habit-error" });
    const submit = el("button", { class: "add-habit-submit", text: "Add habit", attrs: { type: "button" } });

    submit.addEventListener("click", () =>
      track(
        (async () => {
          const unitInput = unitSlot.querySelector(".habit-unit");
          const res = await controller.addHabit({
            name: name.value,
            type: type.value,
            unit: unitInput ? unitInput.value : "",
            sort_order: sort.value,
          });
          if (!res.ok) {
            showErrors(errors, res.errors);
            return;
          }
          paint();
        })(),
      ),
    );

    form.appendChild(
      el("div", { class: "field" }, [
        el("label", { text: "Name" }),
        name,
        el("span", { class: "slug-hint", text: "id: " }, [slug]),
      ]),
    );
    form.appendChild(el("div", { class: "field" }, [el("label", { text: "Type" }), type]));
    form.appendChild(unitSlot);
    form.appendChild(el("div", { class: "field" }, [el("label", { text: "Sort order" }), sort]));
    form.appendChild(errors);
    form.appendChild(submit);
    return form;
  }

  // --- Edit habit ----------------------------------------------------------

  function editHabitForm(habit) {
    const form = el("form", { class: "edit-habit-form" });

    // habit_id + type are IMMUTABLE — shown read-only, never as editable controls.
    form.appendChild(
      el("div", { class: "field readonly" }, [
        el("label", { text: "id" }),
        el("span", { class: "habit-id-static", text: habit.habit_id }),
      ]),
    );
    form.appendChild(
      el("div", { class: "field readonly" }, [
        el("label", { text: "type" }),
        el("span", { class: "habit-type-static", text: habit.type }),
      ]),
    );

    const name = el("input", { class: "habit-name", value: habit.name, attrs: { type: "text" } });
    const sort = el("input", { class: "habit-sort", value: String(habit.sort_order || 0), attrs: { type: "number" } });
    const unitInput = typeHasUnit(habit.type)
      ? el("input", { class: "habit-unit", value: habit.unit || "", attrs: { type: "text" } })
      : null;
    const errors = el("div", { class: "habit-error" });

    const save = el("button", { class: "save-habit", text: "Save", attrs: { type: "button" } });
    save.addEventListener("click", () =>
      track(
        (async () => {
          const patch = { name: name.value, sort_order: sort.value };
          if (unitInput) {
            patch.unit = unitInput.value;
          }
          const res = await controller.editHabit(habit.habit_id, patch);
          if (!res.ok) {
            showErrors(errors, res.errors);
            return;
          }
          editingId = null;
          paint();
        })(),
      ),
    );

    const cancel = el("button", { class: "cancel-edit", text: "Cancel", attrs: { type: "button" } });
    cancel.addEventListener("click", () => {
      editingId = null;
      paint();
    });

    form.appendChild(el("div", { class: "field" }, [el("label", { text: "Name" }), name]));
    if (unitInput) {
      form.appendChild(el("div", { class: "field" }, [el("label", { text: "Unit" }), unitInput]));
    }
    form.appendChild(el("div", { class: "field" }, [el("label", { text: "Sort order" }), sort]));
    form.appendChild(errors);
    form.appendChild(el("div", { class: "actions" }, [save, cancel]));
    return form;
  }

  // --- Schedule (target rules) editor --------------------------------------

  function ruleList(habit) {
    const list = el("div", { class: "rule-list" });
    const rules = controller.getRulesFor(habit.habit_id);
    if (rules.length === 0) {
      list.appendChild(el("p", { class: "empty", text: "No target rules yet." }));
      return list;
    }
    for (const rule of rules) {
      const target = Number(rule.target) === 0 ? "rest" : String(rule.target);
      const parity = rule.week_parity && rule.week_parity !== "*" ? ` (${rule.week_parity})` : "";
      const to = rule.effective_to ? ` → ${rule.effective_to}` : " → open";
      list.appendChild(
        el("div", { class: "rule-item", attrs: { "data-rule-id": rule.rule_id } }, [
          el("span", { class: "rule-days", text: rule.days }),
          el("span", { class: "rule-target", text: target }),
          el("span", { class: "rule-parity", text: parity }),
          el("span", { class: "rule-window", text: `from ${rule.effective_from}${to}` }),
        ]),
      );
    }
    return list;
  }

  function scheduleEditor(habit) {
    const wrap = el("div", { class: "rule-editor" });
    wrap.appendChild(el("h4", { text: "Schedule" }));

    // Saved schedule for the current week (SPEC preview — reuses #002 resolveTarget).
    const savedPreview = controller.preview(habit.habit_id, undefined, todayIso);
    wrap.appendChild(el("p", { class: "habit-preview", text: `This week: ${savedPreview.text}` }));

    wrap.appendChild(ruleList(habit));

    // Add-rule form (append-only; never mutates history).
    const form = el("form", { class: "add-rule-form" });

    const dayBoxes = el("div", { class: "rule-days-picker" });
    for (const [day, label] of DAYS) {
      const box = el("input", { class: "rule-day", attrs: { type: "checkbox", "data-day": day } });
      box.checked = false;
      box.addEventListener("change", updatePreview);
      dayBoxes.appendChild(el("label", { class: "day-label", text: label }, [box]));
    }

    const parity = select("rule-parity-input", PARITIES, "*");
    parity.addEventListener("change", updatePreview);

    const target = el("input", { class: "rule-target-input", value: "", attrs: { type: "number", inputmode: "numeric", placeholder: "sets (0 = rest)" } });
    target.addEventListener("input", updatePreview);

    const from = el("input", { class: "rule-from", value: todayIso, attrs: { type: "date" } });
    from.addEventListener("change", updatePreview);
    const to = el("input", { class: "rule-to", value: "", attrs: { type: "date" } });

    const preview = el("p", { class: "rule-preview", text: "" });

    function readForm() {
      const days = [...dayBoxes.querySelectorAll(".rule-day")].filter((box) => box.checked).map((box) => box.dataset.day);
      return {
        days: days.length ? days : "*",
        week_parity: parity.value,
        target: target.value,
        effective_from: from.value,
        effective_to: to.value,
      };
    }

    function updatePreview() {
      const draft = readForm();
      // resolveTarget expects `days` as a comma string or "*"; readForm gives an array.
      const days = Array.isArray(draft.days) ? (draft.days.length ? draft.days.join(",") : "*") : draft.days;
      // Only preview a numeric target; otherwise show the saved schedule.
      const draftRule =
        draft.target !== "" && Number.isInteger(Number(draft.target))
          ? {
              days,
              week_parity: draft.week_parity,
              target: Number(draft.target),
              effective_from: draft.effective_from,
              effective_to: draft.effective_to,
            }
          : undefined;
      const result = controller.preview(habit.habit_id, draftRule, todayIso);
      preview.textContent = `This week: ${result.text}`;
    }
    updatePreview();

    const errors = el("div", { class: "rule-error" });

    const raise = el("button", { class: "raise-target", text: "Raise target (from tomorrow)", attrs: { type: "button" } });
    raise.addEventListener("click", () => {
      from.value = controller.tomorrow();
      // Default to the weekday work set when raising a target for the first time.
      for (const box of dayBoxes.querySelectorAll(".rule-day")) {
        box.checked = ["mon", "tue", "wed", "thu", "fri"].includes(box.dataset.day);
      }
      updatePreview();
    });

    const submit = el("button", { class: "add-rule-submit", text: "Add rule", attrs: { type: "button" } });
    submit.addEventListener("click", () =>
      track(
        (async () => {
          const res = await controller.addRule(habit.habit_id, readForm());
          if (!res.ok) {
            showErrors(errors, res.errors);
            return;
          }
          paint();
        })(),
      ),
    );

    form.appendChild(el("div", { class: "field" }, [el("label", { text: "Days" }), dayBoxes]));
    form.appendChild(el("div", { class: "field" }, [el("label", { text: "Weeks" }), parity]));
    form.appendChild(el("div", { class: "field" }, [el("label", { text: "Target" }), target]));
    form.appendChild(el("div", { class: "field" }, [el("label", { text: "Effective from" }), from]));
    form.appendChild(el("div", { class: "field" }, [el("label", { text: "Effective to" }), to]));
    form.appendChild(raise);
    form.appendChild(preview);
    form.appendChild(errors);
    form.appendChild(submit);
    wrap.appendChild(form);
    return wrap;
  }

  // --- Habit card ----------------------------------------------------------

  function habitCard(habit) {
    const active = isActive(habit);
    const card = el("div", { class: `manage-habit type-${habit.type}${active ? "" : " archived"}`, attrs: { "data-habit-id": habit.habit_id } });

    const unit = habit.unit ? ` · ${habit.unit}` : "";
    const status = active ? "" : " · archived";
    card.appendChild(
      el("div", { class: "habit-head" }, [
        el("span", { class: "habit-title", text: habit.name }),
        el("span", { class: "habit-meta", text: `${habit.type}${unit}${status}` }),
      ]),
    );

    const edit = el("button", { class: "edit-habit", text: "Edit", attrs: { type: "button" } });
    edit.addEventListener("click", () => {
      editingId = editingId === habit.habit_id ? null : habit.habit_id;
      paint();
    });

    const schedule = el("button", { class: "edit-schedule", text: "Schedule", attrs: { type: "button" } });
    schedule.addEventListener("click", () => {
      scheduleId = scheduleId === habit.habit_id ? null : habit.habit_id;
      paint();
    });

    const archive = el("button", {
      class: "archive-toggle",
      text: active ? "Archive" : "Reactivate",
      attrs: { type: "button" },
    });
    archive.addEventListener("click", () =>
      track(
        (async () => {
          await controller.setActive(habit.habit_id, !active);
          paint();
        })(),
      ),
    );

    card.appendChild(el("div", { class: "habit-actions" }, [edit, schedule, archive]));

    if (editingId === habit.habit_id) {
      card.appendChild(editHabitForm(habit));
    }
    if (scheduleId === habit.habit_id) {
      card.appendChild(scheduleEditor(habit));
    }
    return card;
  }

  function paint() {
    root.innerHTML = "";
    const wrap = el("div", { class: "manage" });
    wrap.appendChild(addHabitForm());

    const listWrap = el("div", { class: "manage-habit-list" });
    const habits = controller.getHabits();
    if (habits.length === 0) {
      listWrap.appendChild(el("p", { class: "empty", text: "No habits yet — add one above." }));
    } else {
      for (const habit of habits) {
        listWrap.appendChild(habitCard(habit));
      }
    }
    wrap.appendChild(listWrap);
    root.appendChild(wrap);
  }

  paint();
  return { rerender: paint, whenIdle: () => pending };
}
