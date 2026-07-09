// A tiny, dependency-free DOM shim for exercising the thin view layer under
// `node --test`. The project ships zero runtime/test dependencies and no build
// step, so we cannot pull in jsdom; this covers exactly the DOM surface the views
// use (createElement, className/textContent, appendChild, setAttribute, style,
// addEventListener + click dispatch, innerHTML reset) plus enough querying to
// assert on the rendered tree.

class FakeElement {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.className = "";
    this.textContent = "";
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.style = {};
    this.dataset = {};
    this.disabled = false;
    this._listeners = {};
    this._innerHTML = "";
  }

  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key.startsWith("data-")) {
      const name = key
        .slice(5)
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[name] = String(value);
    }
  }

  getAttribute(key) {
    return Object.prototype.hasOwnProperty.call(this.attributes, key) ? this.attributes[key] : null;
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }

  dispatch(type, event = {}) {
    for (const fn of this._listeners[type] || []) {
      fn(event);
    }
  }

  /** Convenience for tests: simulate a user tap. */
  click() {
    this.dispatch("click", { type: "click" });
  }

  set innerHTML(value) {
    this._innerHTML = value;
    if (value === "") {
      this.children = [];
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  get classList() {
    const self = this;
    return {
      contains(name) {
        return self.className.split(/\s+/).includes(name);
      },
    };
  }

  /** Depth-first descendants (excludes self), in document order. */
  _descendants(out = []) {
    for (const child of this.children) {
      out.push(child);
      child._descendants(out);
    }
    return out;
  }

  querySelectorAll(selector) {
    const { tag, classes } = parseSelector(selector);
    return this._descendants().filter((node) => matches(node, tag, classes));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function parseSelector(selector) {
  const classes = [];
  let tag = null;
  const trimmed = selector.trim();
  const parts = trimmed.split(".");
  if (parts[0]) {
    tag = parts[0].toUpperCase();
  }
  for (const cls of parts.slice(1)) {
    if (cls) {
      classes.push(cls);
    }
  }
  return { tag, classes };
}

function matches(node, tag, classes) {
  if (tag && node.tagName !== tag) {
    return false;
  }
  const nodeClasses = node.className.split(/\s+/);
  return classes.every((c) => nodeClasses.includes(c));
}

/** A `document`-shaped object exposing only `createElement`. */
export function makeDocument() {
  return {
    createElement(tag) {
      return new FakeElement(tag);
    },
  };
}

/**
 * Install a fresh fake document on `globalThis` (views reference the global
 * `document`, like today.js). Returns { document, root, restore }.
 */
export function installDom() {
  const previous = globalThis.document;
  const document = makeDocument();
  globalThis.document = document;
  const root = document.createElement("div");
  return {
    document,
    root,
    restore() {
      globalThis.document = previous;
    },
  };
}
