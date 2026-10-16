// DOM insertion moves nodes without invoking their public remove() method.
function detach(node) {
  if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node);
  node.parentNode = null;
}

export class Element extends EventTarget {
  constructor(tag, ownerDocument) {
    super(); this.tagName = tag.toUpperCase(); this.ownerDocument = ownerDocument;
    this.children = []; this.style = {}; this.dataset = {}; this.attributes = {};
    this.className = ""; this.value = ""; this.textContent = "";
    this.classList = {
      add: (...items) => { this.className = [...new Set([...this.className.split(/\s+/), ...items])].join(" ").trim(); },
      remove: (...items) => { this.className = this.className.split(/\s+/).filter((x) => !items.includes(x)).join(" "); },
      toggle: (x, force) => { const include = force ?? !this.classList.contains(x); this.classList[include ? "add" : "remove"](x); return include; },
      contains: (x) => this.className.split(/\s+/).includes(x),
    };
  }
  get isConnected() { return !!this.parentNode || this === this.ownerDocument.body || this === this.ownerDocument.head; }
  appendChild(child) { detach(child); this.children.push(child); child.parentNode = this; return child; }
  insertBefore(child, reference) {
    if (child === reference) return child;
    if (reference == null) return this.appendChild(child);
    if (!this.children.includes(reference)) throw new Error("Reference is not a child");
    detach(child); this.children.splice(this.children.indexOf(reference), 0, child); child.parentNode = this; return child;
  }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  replaceChildren(...children) { for (const child of [...this.children]) child.remove(); children.forEach((child) => this.appendChild(child)); }
  remove() { detach(this); }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === "class") this.className = String(value); }
  removeAttribute(key) { delete this.attributes[key]; if (key === "src") this.src = ""; }
  focus() { this.ownerDocument.activeElement = this; }
  click() { this.dispatchEvent(new Event("click")); }
}
export function documentFixture() {
  const doc = { createElement(tag) { return new Element(tag, doc); }, activeElement: null };
  doc.head = new Element("head", doc);
  doc.body = new Element("body", doc);
  return doc;
}
export function find(root, predicate) {
  const result = predicate(root) ? [root] : [];
  for (const child of root.children) result.push(...find(child, predicate));
  return result;
}
export function byClass(root, name) { return find(root, (node) => node.classList.contains(name)); }
export const settle = async () => { for (let i = 0; i < 70; i++) await Promise.resolve(); };
