// A tiny, dependency-free DOM shim for exercising the thin view layer under
// `node --test`. The project ships zero runtime/test dependencies and no build
// step, so we cannot pull in jsdom; this covers exactly the DOM surface the views
// use (createElement, className/textContent, appendChild, setAttribute, style,
// addEventListener + click dispatch, innerHTML reset) plus enough querying to
// assert on the rendered tree.
//
// FIDELITY (see PR #1 rollup #008): the shim MUST mirror the real DOM contract
// for the two accessors that previously hid on-device bugs, otherwise "green in
// CI, broken in Safari" defects slip through:
//   1. `Element.children` is a getter with NO setter — assigning to it throws a
//      `TypeError` in strict mode (ES modules are always strict). We back it with
//      a private `_children` array and expose a getter only.
//   2. `querySelectorAll` returns a `NodeList`, which is iterable and indexable
//      but has NO array methods (`.filter` / `.map` / `.find` / …). We return a
//      `FakeNodeList`; call sites that need array methods must spread it first.

/**
 * A minimal `NodeList`-like: iterable, indexable, with `length`, `item`, and
 * `forEach` — but deliberately WITHOUT `.filter` / `.map` / `.find` / `.some`,
 * exactly like a real `NodeList`. This is what makes DOM-API misuse (calling
 * array methods on a query result) fail the suite instead of passing.
 */
class FakeNodeList {
  constructor(nodes) {
    this.length = nodes.length;
    for (let i = 0; i < nodes.length; i += 1) {
      this[i] = nodes[i];
    }
    Object.defineProperty(this, "_nodes", { value: nodes, enumerable: false });
  }

  item(index) {
    return this._nodes[index] ?? null;
  }

  forEach(callback, thisArg) {
    this._nodes.forEach(callback, thisArg);
  }

  [Symbol.iterator]() {
    return this._nodes[Symbol.iterator]();
  }
}

class FakeElement {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.className = "";
    this.textContent = "";
    this._children = [];
    this.parentNode = null;
    this.attributes = {};
    this.style = {};
    this.dataset = {};
    this.disabled = false;
    this._listeners = {};
    this._innerHTML = "";
  }

  // Getter-only, like the real DOM: `element.children = ...` throws in strict
  // mode. Internal mutation goes through `_children` / appendChild / innerHTML.
  get children() {
    return this._children;
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
    this._children.push(child);
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
      this._children = [];
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
    for (const child of this._children) {
      out.push(child);
      child._descendants(out);
    }
    return out;
  }

  querySelectorAll(selector) {
    const { tag, classes } = parseSelector(selector);
    const matched = this._descendants().filter((node) => matches(node, tag, classes));
    return new FakeNodeList(matched);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector).item(0);
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
