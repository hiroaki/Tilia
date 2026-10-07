export class Element extends EventTarget {
  constructor(tag, ownerDocument) {
    super(); this.tagName = tag.toUpperCase(); this.ownerDocument = ownerDocument;
    this.children = []; this.style = {}; this.dataset = {}; this.attributes = {};
    this.className = ""; this.value = ""; this.textContent = "";
    this.classList = {
      add: (...items) => { this.className = [...new Set([...this.className.split(/\s+/), ...items])].join(" ").trim(); },
      remove: (...items) => { this.className = this.className.split(/\s+/).filter((x) => !items.includes(x)).join(" "); },
      contains: (x) => this.className.split(/\s+/).includes(x),
    };
  }
  appendChild(child) { child.remove(); this.children.push(child); child.parentNode = this; return child; }
  replaceChildren(...children) { for (const child of [...this.children]) child.remove(); children.forEach((child) => this.appendChild(child)); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this); this.parentNode = null; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
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
