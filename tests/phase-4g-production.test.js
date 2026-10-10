import { afterEach, describe, expect, it, vi } from "vitest";
import { documentFixture, Element, byClass, settle } from "./helpers/scoped-dom.js";
vi.mock("leaflet", () => {
  class Layer {
    constructor(point, options = {}) { this.point = point; this.options = options; this.listeners = new Map(); }
    addTo(map) { this.map = map; map.layers.add(this); return this; }
    remove() { this.map?.layers.delete(this); this.fire("remove"); }
    on(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); return this; }
    off(type, fn) { this.listeners.get(type)?.delete(fn); return this; }
    fire(type, event = {}) { for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event); }
  }
  class MockPopup extends Layer { setLatLng(point) { this.point = point; return this; } setContent(content) { this.content = content; return this; } getElement() { return this.content; } }
  class Control { constructor(options) { this.options = options; } addTo(map) { this.container = this.onAdd(map); map.container.appendChild(this.container); return this; } remove() { this.container?.remove(); } }
  return { Marker: Layer, CircleMarker: Layer, Popup: MockPopup, TileLayer: Layer, Map: class {}, Control,
    DomUtil: { create: (tag, className) => { const node = document.createElement(tag); node.className = className; return node; } },
    DomEvent: { disableClickPropagation() {}, disableScrollPropagation() {}, on() {}, stopPropagation() {}, preventDefault() {} } };
});
import { Marker, Popup } from "leaflet";
import { createApplicationComposition } from "../src/application-composition.js";
import { photoDomainKey } from "../src/domains/keys.js";
import * as scopedDom from "../src/ui/scoped-dom.js";
import { panelServiceKey } from "../src/plugins/contracts/panel.js";

const fixtures = [];
afterEach(async () => {
  for (const f of fixtures.splice(0)) {
    for (const entry of f.app.entries.list()) await f.app.entries.remove(entry.id);
    for (const id of [...f.app.listPlugins()].reverse()) await f.app.unuse(id);
    await f.foundations.rendering.close();
  }
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function fixture(plugins = ["tilia-photo-ui", "tilia-photo-renderer", "tilia-map-selection-presenter", "tilia-layers", "tilia-settings", "tilia-file-import"], providerOptions = {}) {
  const doc = documentFixture(); vi.stubGlobal("document", doc); vi.stubGlobal("HTMLElement", Element);
  const map = { container: doc.createElement("div"), layers: new Set(), panes: new Map(), on() {}, off() {},
    getContainer() { return this.container; }, getPane(name) { return this.panes.get(name); },
    createPane(name) { const pane = doc.createElement("div"); this.panes.set(name, pane); return pane; },
  };
  const revoke = vi.fn();
  let next = 0;
  const f = createApplicationComposition({ map, plugins: ["tilia-photo-domain", ...plugins.filter((id) => id !== "tilia-photo-domain")],
    pluginOptions: { "tilia-photo-domain": { createObjectURL: () => `blob:${++next}`, revokeObjectURL: revoke, ...providerOptions } } });
  await f.app.ready;
  let context;
  await f.app.use({ id: "x-observer", setup(value) { context = value; } });
  const value = { ...f, map, doc, revoke, context }; fixtures.push(value); return value;
}
async function photo(f, coordinate = { lat: 35, lon: 135 }) {
  const entry = await f.app.domains.photo.create({ data: { name: "photo.jpg", coordinate, capturedAt: 0 }, blob: new Blob(["photo"]) });
  await settle(); return entry;
}
function click(f, label) { const button = byClass(f.map.container, "tilia-control-button").find((n) => n.attributes["aria-label"] === label); button.click(); }

describe("Phase 4G actual production plugins", () => {
  it("renders owned geographic marker, canonical click selection and independent popup/highlight", async () => {
    const f = await fixture(); const entry = await photo(f);
    const marker = [...f.map.layers].find((l) => l.options.title === "photo.jpg");
    expect(marker.point).toEqual({ lat: 35, lng: 135 });
    marker.fire("click"); await settle();
    expect(f.app.selection.getCurrent()).toMatchObject({ entryId: entry.id, ref: { kind: "photo" } });
    const popup = [...f.map.layers].find((l) => l instanceof Popup);
    expect(byClass(popup.content, "tilia-popup-value").some((n) => n.textContent.includes("1970"))).toBe(true);
    popup.remove(); await settle();
    expect([...f.map.layers].filter((l) => l.options.radius === 18)).toHaveLength(1);
    expect([...f.map.layers].filter((l) => l instanceof Popup)).toHaveLength(0);
    expect(f.app.selection.getCurrent()).not.toBeNull();
  });

  it("removes popup adapter independently from highlight and closes both on rendering termination", async () => {
    const f = await fixture(); const entry = await photo(f);
    f.app.selection.request(f.app.domains.photo.selection.createCandidate(entry.id)); await settle();
    await f.app.unuse("tilia-photo-ui"); await settle();
    expect([...f.map.layers].filter((l) => l instanceof Popup)).toHaveLength(0);
    expect([...f.map.layers].filter((l) => l.options.radius === 18)).toHaveLength(1);
    await f.app.use("tilia-photo-ui"); await settle();
    expect([...f.map.layers].filter((l) => l instanceof Popup)).toHaveLength(1);
    const handle = f.context.presentation.resolve(entry.id, { kind: "photo" });
    const status = vi.fn(); f.context.rendering.subscribe(status, { emitCurrent: false });
    await f.foundations.rendering.close();
    expect(handle.signal.aborted).toBe(true); expect(handle.isCurrent()).toBe(false);
    expect(status).not.toHaveBeenCalled();
    expect([...f.map.layers].filter((l) => l instanceof Popup || l.options.radius === 18)).toHaveLength(0);
    expect(f.app.selection.getCurrent()).not.toBeNull(); expect(f.revoke).not.toHaveBeenCalled();
  });

  it("provides generic fallback rows and keeps visibility/deletion controls without a domain adapter", async () => {
    const f = await fixture(["tilia-photo-domain", "tilia-layers"]); const entry = await photo(f);
    click(f, "Layers"); await settle();
    expect(byClass(f.map.container, "tilia-layer-name")[0].textContent).toBe(`photo ${entry.id}`);
    const toggle = byClass(f.map.container, "tilia-layer-visible")[0]; toggle.checked = false; toggle.dispatchEvent(new Event("change")); await settle();
    expect(f.app.entries.get(entry.id).visible).toBe(false);
    byClass(f.map.container, "tilia-layer-delete-button")[0].click(); await settle();
    expect(f.app.entries.get(entry.id)).toBeNull(); expect(byClass(f.map.container, "tilia-layer-item")).toHaveLength(0);
  });

  it("mounts timestamp-only Photos with three per-entry settings, no inference and no marker", async () => {
    const f = await fixture(); const entry = await photo(f, null);
    expect(f.app.rendering.getStatus(entry.id).state).toBe("active");
    click(f, "Layers"); await settle(); byClass(f.map.container, "tilia-layer-name")[0].click(); await settle();
    expect(f.app.selection.getCurrent()?.entryId).toBe(entry.id);
    expect([...f.map.layers].filter((l) => l.options.title === "photo.jpg")).toHaveLength(0);
    click(f, "Settings"); await settle();
    const select = byClass(f.map.container, "tilia-photo-time-mode-select")[0];
    expect(select.children.map((n) => n.value)).toEqual(["auto", "local", "utc"]);
    select.value = "utc"; select.dispatchEvent(new Event("change")); await settle();
    expect(f.app.domains.photo.get(entry.id)).toMatchObject({ revision: 2, snapshot: { preferences: { requestedTimeMode: "utc" }, derived: { inferredLocation: null } } });
  });

  it("preview consumers lose access on closure/logical deletion, while resource-only replacement preserves rendering", async () => {
    const f = await fixture(); const entry = await photo(f);
    const scope = f.context.scope.child();
    const preview = f.context.domains.photo.getPreview(entry.id, { scope });
    expect(preview.readUrl()).toBe("blob:1"); await scope.dispose();
    expect(preview.signal.aborted).toBe(true); expect(() => preview.readUrl()).toThrow(); expect(f.revoke).not.toHaveBeenCalled();
    const original = f.app.domains.photo.getPreview(entry.id);
    const oldStatus = f.app.rendering.getStatus(entry.id);
    await f.app.domains.photo.replaceData(entry.id, { ...f.app.domains.photo.get(entry.id).snapshot.data, blob: new Blob(["next"]) }, { expectedRevision: 1 });
    expect(original.signal.aborted).toBe(true); expect(() => original.readUrl()).toThrow();
    expect(f.app.domains.photo.get(entry.id).revision).toBe(1);
    expect(f.app.rendering.getStatus(entry.id).currentToken).toBe(oldStatus.currentToken);
    const current = f.app.domains.photo.getPreview(entry.id);
    f.app.selection.request(f.app.domains.photo.selection.createCandidate(entry.id));
    let checkedLogicalDeletion = false;
    f.app.selection.subscribe((event) => {
      if (event.current === null) {
        checkedLogicalDeletion = true;
        expect(current.isCurrent()).toBe(false); expect(() => current.readUrl()).toThrow();
        expect(f.revoke).toHaveBeenCalledTimes(1); // old Blob only; current cleanup still pending
      }
    });
    await f.app.entries.remove(entry.id);
    expect(checkedLogicalDeletion).toBe(true); expect(f.revoke).toHaveBeenCalledTimes(2);
  });

  it("resource replacement clears mounted image before URL revoke and reacquires without revision", async () => {
    const imagesAtRevoke = [];
    const f = await fixture(undefined, { revokeObjectURL(url) {
      imagesAtRevoke.push(byClass(f.map.container, "tilia-layer-thumbnail").map((n) => n.src));
    } });
    const entry = await photo(f); click(f, "Layers"); await settle();
    expect(byClass(f.map.container, "tilia-layer-thumbnail")[0].src).toBe("blob:1");
    await f.app.domains.photo.replaceData(entry.id, { ...f.app.domains.photo.get(entry.id).snapshot.data, blob: new Blob(["next"]) }, { expectedRevision: 1 }); await settle();
    expect(imagesAtRevoke[0]).toEqual([""]);
    expect(byClass(f.map.container, "tilia-layer-thumbnail")[0].src).toBe("blob:2");
  });

  it("definitive replacement failure retires stale marker while selection/semantic entry survive", async () => {
    const f = await fixture(); const entry = await photo(f);
    const marker = [...f.map.layers].find((l) => l.options.title === "photo.jpg");
    marker.fire("click"); await settle();
    vi.spyOn(Marker.prototype, "addTo").mockImplementation(() => { throw new Error("renderer attach failed"); });
    await f.app.domains.photo.setRequestedTimeMode(entry.id, "local", { expectedRevision: 1 }); await settle();
    expect(f.app.rendering.getStatus(entry.id).state).toBe("failed");
    expect(f.map.layers.has(marker)).toBe(false);
    expect(f.app.entries.get(entry.id)).not.toBeNull(); expect(f.app.selection.getCurrent()?.entryId).toBe(entry.id);
    expect(f.revoke).not.toHaveBeenCalled();
  });

  it("uses generation-safe panel handles, contributor lifetimes and owned control cleanup", async () => {
    const f = await fixture(); await photo(f); click(f, "Layers"); await settle();
    const panel = f.context.services.require(panelServiceKey);
    const old = panel.open({ id: "old", title: "Old", mount() {} });
    panel.open({ id: "new", title: "New", mount() {} }); await old.dispose();
    expect(panel.isOpen("new")).toBe(true);
    for (const id of ["tilia-file-import", "tilia-settings", "tilia-layers"]) await f.app.unuse(id);
    await f.app.unuse("tilia-panel");
    expect(byClass(f.map.container, "tilia-side-panel")).toHaveLength(0);
    expect(byClass(f.map.container, "tilia-file-import-control")).toHaveLength(0);
    expect(byClass(f.map.container, "tilia-settings-control")).toHaveLength(0);
    expect(byClass(f.map.container, "tilia-layers-control")).toHaveLength(0);
    expect(f.app.entries.list()).toHaveLength(1);
  });

  it("file transport uses registry discovery, continues after failures, reports names and resets input", async () => {
    const f = await fixture(["tilia-file-import", "tilia-status"]);
    const dispatches = [];
    await f.app.use({ id: "x-input", setup(context) { context.inputs.register({ id: "test-file", discovery: { extensions: [".test"] }, recognize: () => true,
      async handle({ input }) { dispatches.push(input.name); if (input.name === "bad.test") throw new Error("bad input"); return { name: input.name }; } }); } });
    const input = byClass(f.map.container, "tilia-file-label")[0].children[0];
    expect(input.accept).toBe(".test"); input.files = [{ name: "bad.test" }, { name: "good.test" }]; input.value = "chosen";
    input.dispatchEvent(new Event("change")); await settle();
    expect(dispatches).toEqual(["bad.test", "good.test"]); expect(input.value).toBe("");
    expect(byClass(f.map.container, "tilia-status-text")[0].textContent).toContain("Loaded 1 file(s) from file. bad.test: bad input; good.test");
  });
  it("popup adapter failure leaves semantic selection and independently owned highlight intact", async () => {
    const f = await fixture(); const entry = await photo(f);
    await f.app.unuse("tilia-photo-ui");
    await f.app.use({ id: "x-broken-popup", setup(context) {
      context.contributions.popup.register(photoDomainKey, { mount() { throw new Error("popup mount failed"); } });
    } });
    f.app.selection.request(f.app.domains.photo.selection.createCandidate(entry.id)); await settle();
    expect(f.app.selection.getCurrent()?.entryId).toBe(entry.id);
    expect(f.app.rendering.getStatus(entry.id).state).toBe("active");
    expect([...f.map.layers].filter((l) => l instanceof Popup)).toHaveLength(0);
    expect([...f.map.layers].filter((l) => l.options.radius === 18)).toHaveLength(1);
  });

  it("retries owned popup removal without blocking highlight withdrawal during invalidation", async () => {
    const f = await fixture(); const entry = await photo(f);
    f.app.selection.request(f.app.domains.photo.selection.createCandidate(entry.id)); await settle();
    const popup = [...f.map.layers].find((l) => l instanceof Popup);
    vi.spyOn(popup, "remove").mockImplementationOnce(() => { throw new Error("popup removal failed once"); });
    await f.foundations.rendering.close(); await settle();
    expect([...f.map.layers].filter((l) => l instanceof Popup || l.options.radius === 18)).toHaveLength(0);
    expect(f.app.selection.getCurrent()?.entryId).toBe(entry.id);
  });

  it("withdraws selection/rendering/presenter before physical URL revocation on deletion", async () => {
    let f;
    const ordering = vi.fn(() => {
      expect(f.app.selection.getCurrent()).toBeNull();
      expect([...f.map.layers].filter((l) => l.options.title === "photo.jpg" || l instanceof Popup || l.options.radius === 18)).toHaveLength(0);
    });
    f = await fixture(undefined, { revokeObjectURL: ordering }); const entry = await photo(f);
    f.app.selection.request(f.app.domains.photo.selection.createCandidate(entry.id)); await settle();
    await f.app.entries.remove(entry.id); expect(ordering).toHaveBeenCalledOnce();
  });

  it("isolates a throwing layers adapter while preserving the panel, generic controls and unrelated rows", async () => {
    const f = await fixture(["tilia-layers"]); const broken = await photo(f), other = await photo(f);
    let finish;
    const gate = new Promise((r) => { finish = r; });
    const cleanup = vi.fn(async (id) => { if (id === broken.id) await gate; });
    await f.app.use({ id: "x-throwing-layer", setup(context) {
      context.contributions.layers.register(photoDomainKey, { mount({ container, scope, entry }) {
        const node = container.ownerDocument.createElement("div"); node.className = "partial-adapter"; container.appendChild(node);
        scope.defer(async () => { await cleanup(entry.id); container.replaceChildren(); }, { retry: "safe" });
        if (entry.id === broken.id) throw new Error("layers adapter failed");
        node.textContent = "Other row";
      } });
    } });
    click(f, "Layers"); await settle();
    const panel = f.context.services.require(panelServiceKey);
    expect(panel.isOpen("layers")).toBe(true);
    expect(byClass(f.map.container, "tilia-layer-item")).toHaveLength(2);
    expect(byClass(f.map.container, "tilia-layer-name")[0].textContent).toBe(`photo ${broken.id}`);
    expect(cleanup).toHaveBeenCalledWith(broken.id);
    expect(byClass(f.map.container, "partial-adapter")).toHaveLength(1);
    finish(); await settle();
    expect(byClass(f.map.container, "tilia-layer-name")[0].textContent).toBe(`photo ${broken.id}`);
    let toggles = byClass(f.map.container, "tilia-layer-visible");
    toggles[0].checked = false; toggles[0].dispatchEvent(new Event("change")); await settle();
    expect(f.app.entries.get(broken.id).visible).toBe(false); expect(panel.isOpen("layers")).toBe(true);
    toggles = byClass(f.map.container, "tilia-layer-visible");
    toggles[1].checked = false; toggles[1].dispatchEvent(new Event("change")); await settle();
    expect(f.app.entries.get(other.id).visible).toBe(false);
    byClass(f.map.container, "tilia-layer-delete-button")[0].click(); await settle();
    expect(f.app.entries.get(broken.id)).toBeNull(); expect(panel.isOpen("layers")).toBe(true);
    expect(byClass(f.map.container, "tilia-layer-item")).toHaveLength(1);
    byClass(f.map.container, "tilia-layer-delete-button")[0].click(); await settle();
    expect(f.app.entries.get(other.id)).toBeNull(); expect(panel.isOpen("layers")).toBe(true);
  });

  it("cleans a failed old panel generation without closing a same-ID reentrant replacement", async () => {
    const f = await fixture(["tilia-panel"]), panel = f.context.services.require(panelServiceKey);
    const cleanup = vi.fn(), action = vi.fn(); let oldScope, oldContainer, newer;
    expect(() => panel.open({ id: "same", title: "Old", mount({ container, scope }) {
      oldScope = scope; oldContainer = container;
      scope.defer(() => { expect(scope.alive).toBe(false); cleanup(); }, { retry: "safe" });
      newer = panel.open({ id: "same", title: "New", mount({ container, scope }) {
        const button = container.ownerDocument.createElement("button"); button.className = "replacement-action";
        container.appendChild(button); button.focus(); const listener = scope.guard(action);
        button.addEventListener("click", listener);
        scope.defer(() => button.removeEventListener("click", listener), { retry: "safe" });
      } });
      throw new Error("old mount failed");
    } })).toThrow("old mount failed");
    expect(oldScope.alive).toBe(false); expect(panel.isOpen("same")).toBe(true);
    await settle(); expect(cleanup).toHaveBeenCalledOnce(); expect(oldContainer.parentNode).toBeNull();
    expect(byClass(f.map.container, "tilia-side-panel")[0].classList.contains("tilia-side-panel-hidden")).toBe(false);
    expect(byClass(f.map.container, "tilia-side-panel-title")[0].textContent).toBe("New");
    expect(f.doc.activeElement).toBe(byClass(f.map.container, "replacement-action")[0]);
    byClass(f.map.container, "replacement-action")[0].click(); expect(action).toHaveBeenCalledOnce();
    await newer.dispose(); expect(panel.isOpen("same")).toBe(false);
  });

  it("quarantines a contributor on host-mount cleanup failure and retries it through app.unuse", async () => {
    const f = await fixture(["tilia-layers"]); await photo(f);
    let fail = true;
    const cleanup = vi.fn(() => { if (fail) throw new Error("adapter cleanup failed"); });
    const plugin = { id: "x-residual-adapter", setup(context) {
      context.contributions.layers.register(photoDomainKey, { mount({ scope }) {
        scope.defer(cleanup, { label: "adapter-resource", retry: "safe" });
      } });
    } };
    await f.app.use(plugin); click(f, "Layers"); await settle();
    await expect(f.app.unuse(plugin.id)).rejects.toMatchObject({ code: "PLUGIN_TEARDOWN_FAILED" });
    expect(f.app.hasPlugin(plugin.id)).toBe(false);
    await expect(f.app.use(plugin)).rejects.toMatchObject({ code: "PLUGIN_QUARANTINED" });
    await expect(f.app.unuse(plugin.id)).rejects.toMatchObject({ code: "PLUGIN_TEARDOWN_FAILED" });
    fail = false; await f.app.unuse(plugin.id);
    const calls = cleanup.mock.calls.length; await f.app.unuse(plugin.id); expect(cleanup).toHaveBeenCalledTimes(calls);
    expect(f.context.services.require(panelServiceKey).isOpen("layers")).toBe(true);
    expect(f.app.entries.list()).toHaveLength(1);
    await f.app.use(plugin); expect(f.app.hasPlugin(plugin.id)).toBe(true);
  });

  it.each(["abort", "focus", "cleanup"].flatMap((source) => [[source, "same-ID"], [source, "different-ID"]]))(
    "%s reentrant panel opening (%s) leaves only the latest request live", async (source, identity) => {
      const f = await fixture(["tilia-panel"]), panel = f.context.services.require(panelServiceKey);
      const records = [], requestedMount = vi.fn();
      const id = (label) => identity === "same-ID" ? "same" : label;
      const outside = f.doc.createElement("button"); f.doc.body.appendChild(outside); outside.focus();
      let intervening, finish, started;
      const gate = new Promise((r) => { finish = r; }), cleaning = new Promise((r) => { started = r; });
      const open = (label) => panel.open({ id: id(label), title: label, mount({ container, scope }) {
        const action = vi.fn(), cleanup = vi.fn();
        const button = f.doc.createElement("button"); button.textContent = label; container.appendChild(button); button.focus();
        const click = scope.guard(action); button.addEventListener("click", click);
        scope.defer(() => { expect(scope.alive).toBe(false); button.removeEventListener("click", click); cleanup(); }, { retry: "safe" });
        records.push({ label, container, scope, button, action, cleanup });
        if (label === "requested") requestedMount();
        if (label === "old" && source === "abort") scope.signal.addEventListener("abort", () => {
          expect(scope.alive).toBe(false); intervening = open("intervening");
        }, { once: true });
        if (label === "old" && source === "cleanup") scope.defer(async () => {
          started(); await gate; expect(scope.alive).toBe(false); intervening = open("intervening");
        }, { retry: "safe" });
      } });
      const old = open("old");
      if (source === "focus") {
        let fired = false;
        const focus = outside.focus.bind(outside);
        vi.spyOn(outside, "focus").mockImplementation(() => {
          expect(records[0].scope.alive).toBe(false); focus();
          if (!fired) { fired = true; intervening = open("intervening"); }
        });
      }
      const requested = open("requested");
      expect(byClass(f.map.container, "tilia-panel-content")).toHaveLength(1);
      expect(records.filter((r) => r.scope.alive).map((r) => r.label))
        .toEqual([source === "cleanup" ? "requested" : "intervening"]);
      if (source === "cleanup") {
        await cleaning;
        expect(panel.isOpen(id("requested"))).toBe(true);
        expect(byClass(f.map.container, "tilia-panel-content")).toHaveLength(1);
        finish();
      }
      await old.dispose(); await requested.dispose();
      expect(requestedMount).toHaveBeenCalledTimes(source === "cleanup" ? 1 : 0);
      expect(records.filter((r) => r.scope.alive).map((r) => r.label)).toEqual(["intervening"]);
      expect(panel.isOpen(id("intervening"))).toBe(true);
      const winner = records.find((r) => r.label === "intervening");
      expect(byClass(f.map.container, "tilia-panel-content")).toEqual([winner.container]);
      expect(byClass(f.map.container, "tilia-side-panel-title")[0].textContent).toBe("intervening");
      expect(byClass(f.map.container, "tilia-side-panel")[0].classList.contains("tilia-side-panel-hidden")).toBe(false);
      expect(f.doc.activeElement).toBe(winner.button);
      winner.button.click(); expect(winner.action).toHaveBeenCalledOnce();
      for (const record of records.filter((r) => r !== winner)) {
        expect(record.scope.alive).toBe(false); expect(record.container.parentNode).toBeNull();
        expect(record.cleanup).toHaveBeenCalledOnce(); record.button.click(); expect(record.action).not.toHaveBeenCalled();
      }
      await old.dispose(); await requested.dispose();
      expect(f.doc.activeElement).toBe(winner.button); expect(winner.scope.alive).toBe(true);
      await panel.close(); await intervening.dispose();
      expect(records.every((r) => !r.scope.alive)).toBe(true);
      expect(byClass(f.map.container, "tilia-panel-content")).toHaveLength(0);
      expect(byClass(f.map.container, "tilia-side-panel")[0].classList.contains("tilia-side-panel-hidden")).toBe(true);
      for (const record of records) expect(record.cleanup).toHaveBeenCalledOnce();
    },
  );

  it("reports superseded panel cleanup failure, retains quarantine and retries without changing the newer panel", async () => {
    const f = await fixture(["tilia-panel"]), panel = f.context.services.require(panelServiceKey);
    const report = vi.spyOn(scopedDom, "reportError");
    let fail = true, oldScope, replacementScope, replacement, oldContainer;
    const cleanup = vi.fn(() => { if (fail) throw new Error("old panel cleanup failed"); });
    const old = panel.open({ id: "old", title: "Old", mount({ container, scope }) {
      oldScope = scope; oldContainer = container;
      scope.defer(cleanup, { retry: "safe" });
      scope.signal.addEventListener("abort", () => {
        replacement = panel.open({ id: "replacement", title: "Replacement", mount({ scope }) { replacementScope = scope; } });
      }, { once: true });
    } });
    const requested = panel.open({ id: "requested", title: "Requested", mount() {} });
    await expect(old.dispose()).rejects.toMatchObject({ code: "SCOPE_DISPOSAL_FAILED" });
    expect(report).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ code: "SCOPE_DISPOSAL_FAILED" }));
    expect(oldScope.alive).toBe(false); expect(oldContainer.parentNode).toBeNull();
    expect(replacementScope.alive).toBe(true); expect(panel.isOpen("replacement")).toBe(true);
    await requested.dispose(); expect(panel.isOpen("replacement")).toBe(true);
    await expect(f.app.unuse("tilia-panel")).rejects.toMatchObject({ code: "PLUGIN_TEARDOWN_FAILED" });
    await expect(f.app.use("tilia-panel")).rejects.toMatchObject({ code: "PLUGIN_QUARANTINED" });
    fail = false; await f.app.unuse("tilia-panel");
    expect(replacementScope.alive).toBe(false); expect(cleanup).toHaveBeenCalledTimes(3);
    await f.app.use("tilia-panel");
    const fresh = f.context.services.require(panelServiceKey);
    fresh.open({ id: "fresh", title: "Fresh", mount() {} });
    await old.dispose(); await replacement.dispose();
    expect(fresh.isOpen("fresh")).toBe(true);
  });

  it.each(["same-ID", "different-ID"])("ordinary close preserves an abort-opened %s panel and its focus", async (identity) => {
    const f = await fixture(["tilia-panel"]), panel = f.context.services.require(panelServiceKey);
    const outside = f.doc.createElement("button"); f.doc.body.appendChild(outside); outside.focus();
    let oldScope, nextScope, next, button;
    const action = vi.fn();
    const old = panel.open({ id: "old", title: "Old", mount({ scope }) {
      oldScope = scope;
      scope.signal.addEventListener("abort", () => {
        next = panel.open({ id: identity === "same-ID" ? "old" : "next", title: "Next", mount({ container, scope }) {
          nextScope = scope; button = f.doc.createElement("button"); container.appendChild(button); button.focus();
          const listener = scope.guard(action); button.addEventListener("click", listener);
          scope.defer(() => button.removeEventListener("click", listener), { retry: "safe" });
        } });
      }, { once: true });
    } });
    await panel.close();
    expect(oldScope.alive).toBe(false); expect(nextScope.alive).toBe(true);
    expect(byClass(f.map.container, "tilia-panel-content")).toHaveLength(1);
    expect(byClass(f.map.container, "tilia-side-panel-title")[0].textContent).toBe("Next");
    expect(f.doc.activeElement).toBe(button);
    await old.dispose(); expect(nextScope.alive).toBe(true); expect(f.doc.activeElement).toBe(button);
    button.click(); expect(action).toHaveBeenCalledOnce();
    await next.dispose(); expect(nextScope.alive).toBe(false);
    expect(byClass(f.map.container, "tilia-panel-content")).toHaveLength(0);
  });

  it("reports a throwing reentrant focus callback while preserving its newer panel", async () => {
    const f = await fixture(["tilia-panel"]), panel = f.context.services.require(panelServiceKey);
    const report = vi.spyOn(scopedDom, "reportError");
    const outside = f.doc.createElement("button"); f.doc.body.appendChild(outside); outside.focus();
    let button, newer, fired = false;
    const old = panel.open({ id: "old", title: "Old", mount() {} });
    vi.spyOn(outside, "focus").mockImplementation(() => {
      if (fired) return; fired = true;
      newer = panel.open({ id: "new", title: "New", mount({ container }) {
        button = f.doc.createElement("button"); container.appendChild(button); button.focus();
      } });
      throw new Error("focus callback failed");
    });
    const mounted = vi.fn();
    const requested = panel.open({ id: "requested", title: "Requested", mount: mounted });
    await old.dispose(); await requested.dispose();
    expect(mounted).not.toHaveBeenCalled(); expect(panel.isOpen("new")).toBe(true);
    expect(f.doc.activeElement).toBe(button); expect(byClass(f.map.container, "tilia-panel-content")).toHaveLength(1);
    expect(report).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ message: "focus callback failed" }));
    await newer.dispose();
  });

});
