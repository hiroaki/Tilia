import { vi } from "vitest";
import { createApplicationComposition } from "../../src/application-composition.js";
import { documentFixture, Element, byClass, settle } from "./scoped-dom.js";
export { byClass, settle };
export async function uiFixture(plugins = [], options = {}) {
  const doc = documentFixture(); vi.stubGlobal("document", doc); vi.stubGlobal("HTMLElement", Element);
  const container = doc.createElement("div"); doc.body.appendChild(container);
  const map = { container, layers: new Set(), panes: new Map(), on() {}, off() {}, fitBounds: vi.fn(), panTo: vi.fn(),
    getContainer() { return this.container; }, getPane(name) { return this.panes.get(name); }, createPane(name) { const p = doc.createElement("div"); this.panes.set(name, p); return p; } };
  const f = createApplicationComposition({ map, plugins, ...options }); await f.app.ready;
  let context; await f.app.use({ id: "x-ui-observer", setup(value) { context = value; } });
  return { ...f, map, doc, context, click(label) { byClass(container, "tilia-control-button").find((n) => n.attributes["aria-label"] === label).click(); }, async close() {
    for (const entry of f.app.entries.list()) await f.app.entries.remove(entry.id);
    for (const id of [...f.app.listPlugins()].reverse()) await f.app.unuse(id);
    await f.foundations.rendering.close(); vi.unstubAllGlobals();
  } };
}
