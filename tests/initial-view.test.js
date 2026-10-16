import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet", async () => ({
  ...await import("./helpers/leaflet-ui.js"),
  ...await import("../node_modules/leaflet/src/geo/LatLngBounds.js"),
}));
import { createApplicationComposition } from "../src/application-composition.js";
import { documentFixture, Element, byClass } from "./helpers/scoped-dom.js";
import initialView from "../src/plugins/input/initial-view.js";
import { statusServiceKey } from "../src/plugins/contracts/status.js";

let app;
afterEach(async () => { await app?.destroy(); app = null; vi.unstubAllGlobals(); });
async function fixture(query, { status = true, options = {}, geolocation } = {}) {
  const doc = documentFixture(), container = doc.createElement("div"), listeners = new Map();
  doc.body.appendChild(container);
  vi.stubGlobal("document", doc); vi.stubGlobal("HTMLElement", Element);
  vi.stubGlobal("window", { location: { search: query } });
  const locate = vi.fn(geolocation ?? (() => {})); vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: locate } });
  const map = {
    container, layers: new Set(), panes: new Map(),
    getPane(name) { return this.panes.get(name); }, createPane(name) { const pane = doc.createElement("div"); this.panes.set(name, pane); return pane; },
    options: { crs: { projection: { MAX_LATITUDE: 85.0511287798 } }, ...options },
    center: { lat: 10, lng: 20 }, zoom: 7,
    getContainer: () => container, getCenter() { return this.center; }, getZoom() { return this.zoom; },
    getMinZoom: () => 2, getMaxZoom: () => 19,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    off(type, fn) { listeners.get(type)?.delete(fn); },
    fire(type) { for (const fn of [...(listeners.get(type) ?? [])]) fn({ type }); },
    setView: vi.fn((point, zoom) => { map.fire("movestart"); map.center = { lat: point[0], lng: point[1] }; map.zoom = zoom; }),
    fitBounds: vi.fn(() => { map.fire("movestart"); map.center = { lat: 30, lng: 40 }; }),
  };
  app = createApplicationComposition({ map, plugins: [...(status ? ["tilia-status"] : []), "tilia-initial-view"] }).app;
  await app.ready;
  return { map, locate, container, listeners, status: () => byClass(container, "tilia-status-text")[0]?.textContent,
    success: (lat = 35, lng = 139) => locate.mock.calls[0][0]({ coords: { latitude: lat, longitude: lng } }),
    failure: () => locate.mock.calls[0][1]({ code: 1 }) };
}

describe("experimental initial view", () => {
  it.each([["35,139,12", 12], ["35,139", 7], ["0,0,2", 2], ["-35,-139,19", 19], ["35,139,12.5", 12.5]])("applies %s without geolocation or status", async (value, zoom) => {
    const f = await fixture(`?tilia.c=${value}`);
    expect(f.map.setView).toHaveBeenCalledWith(value.split(",").slice(0, 2).map(Number), zoom, { animate: false });
    expect(f.locate).not.toHaveBeenCalled(); expect(f.status()).toBe("Ready");
  });
  it.each(["", "35", "35,139,", "35,,12", "NaN,139", "Infinity,139", "0x10,139", "86,139", "-91,0", "35,181", "35,-181", "35,139,1", "35,139,20", "35,139,3,4", "locate,", "locate,20", "locate,12,x", "LOCATE"])("ignores invalid %s", async (value) => {
    const f = await fixture(`?tilia.c=${value}`);
    expect(f.map.setView).not.toHaveBeenCalled(); expect(f.locate).not.toHaveBeenCalled(); expect(f.status()).toBe("Ready");
  });
  it("does nothing without tilia.c and uses the first duplicate", async () => {
    const f = await fixture("?c=locate"); expect(f.locate).not.toHaveBeenCalled(); expect(f.map.setView).not.toHaveBeenCalled();
    await app.destroy(); app = null;
    const second = await fixture("?tilia.c=invalid&tilia.c=locate"); expect(second.locate).not.toHaveBeenCalled();
  });
  it("honors maxBounds and the active CRS latitude limit", async () => {
    const f = await fixture("?tilia.c=35,139", { options: { maxBounds: [[0, 0], [20, 20]] } }); expect(f.map.setView).not.toHaveBeenCalled();
    await app.destroy(); app = null;
    const other = await fixture("?tilia.c=89,0", { options: { crs: { projection: {} } } }); expect(other.map.setView).toHaveBeenCalled();
  });
  it.each([["locate", 7], ["locate,12", 12]])("requests %s once and reports success", async (value, zoom) => {
    const f = await fixture(`?tilia.c=${value}`); expect(f.locate).toHaveBeenCalledTimes(1); expect(f.status()).toBe("Obtaining current location…");
    expect(f.locate.mock.calls[0][2]).toEqual({ timeout: 15000 });
    f.success(); expect(f.map.setView).toHaveBeenCalledWith([35, 139], zoom, { animate: false }); expect(f.status()).toBe("Current location obtained.");
    f.failure(); f.success(); expect(f.map.setView).toHaveBeenCalledTimes(1); expect(f.status()).toBe("Current location obtained.");
  });
  it("preserves the view on denial, invalid location, or changed constraints", async () => {
    const f = await fixture("?tilia.c=locate"); f.failure(); expect(f.map.center).toEqual({ lat: 10, lng: 20 }); expect(f.status()).toBe("Could not obtain current location.");
    await app.destroy(); app = null;
    const invalid = await fixture("?tilia.c=locate"); invalid.success(100); expect(invalid.map.setView).not.toHaveBeenCalled();
    await app.destroy(); app = null;
    const changed = await fixture("?tilia.c=locate,12"); changed.map.getMaxZoom = () => 10; changed.success(); expect(changed.map.setView).not.toHaveBeenCalled();
  });
  it.each(["pointerdown", "mousedown", "touchstart", "wheel", "keydown"])("discards callbacks after %s even before map movement", async (type) => {
    const f = await fixture("?tilia.c=locate"); f.container.dispatchEvent(new Event(type));
    expect(f.status()).toBe("Applying current location was canceled."); f.success(); f.failure(); expect(f.map.setView).not.toHaveBeenCalled();
    expect(["movestart", "zoomstart", "dragstart"].every((type) => f.listeners.get(type).size === 0)).toBe(true);
  });
  it("yields to earlier GPX fitBounds but permits later auto-fit", async () => {
    const f = await fixture("?tilia.c=locate"); f.map.fitBounds(); f.success(); expect(f.map.center).toEqual({ lat: 30, lng: 40 }); expect(f.map.setView).not.toHaveBeenCalled();
    await app.destroy(); app = null;
    const later = await fixture("?tilia.c=locate"); later.success(); later.map.fitBounds(); expect(later.map.center).toEqual({ lat: 30, lng: 40 });
  });
  it("ignores callbacks after uninstall and destroy and cleans listeners", async () => {
    const f = await fixture("?tilia.c=locate"); await app.unuse("tilia-initial-view"); f.success(); f.failure(); expect(f.map.setView).not.toHaveBeenCalled();
    expect(["movestart", "zoomstart", "dragstart"].every((type) => f.listeners.get(type).size === 0)).toBe(true);
    await app.destroy(); app = null;
    const destroyed = await fixture("?tilia.c=locate"); await app.destroy(); destroyed.success(); destroyed.failure(); expect(destroyed.map.setView).not.toHaveBeenCalled();
  });
  it("tolerates missing status, missing geolocation, and synchronous browser errors", async () => {
    const f = await fixture("?tilia.c=locate", { status: false }); f.success(); expect(f.map.setView).toHaveBeenCalled();
    await app.destroy(); app = null;
    const error = await fixture("?tilia.c=locate", { geolocation: () => { throw new Error("denied"); } }); expect(error.status()).toBe("Could not obtain current location.");
    await app.destroy(); app = null;
    vi.stubGlobal("navigator", {});
    const callbacks = []; initialView.setup({ lifecycle: { afterCommit: (fn) => callbacks.push(fn) }, map: { advancedLeafletMap: () => error.map, listen: () => ({ dispose() {} }) }, scope: { alive: true, signal: { aborted: false }, assertAlive() {}, defer() {} }, services: { optional: () => ({ set: vi.fn() }) }, diagnostics: { report: vi.fn() } });
    expect(() => callbacks[0]()).not.toThrow();
  });
  it("documents the accepted last-writer-wins status limitation", async () => {
    const f = await fixture("?tilia.c=locate");
    await app.use({ id: "x-status-writer", setup(c) { c.lifecycle.afterCommit(() => c.services.require(statusServiceKey).set("Other operation")); } });
    expect(f.status()).toBe("Other operation"); f.success(); expect(f.status()).toBe("Current location obtained.");
  });
  it("defers all effects until commit and rollback does not request location", () => {
    vi.stubGlobal("window", { location: { search: "?tilia.c=locate" } });
    const callbacks = [], map = vi.fn(); initialView.setup({ lifecycle: { afterCommit: (fn) => callbacks.push(fn) }, map: { advancedLeafletMap: map } });
    expect(callbacks).toHaveLength(1); expect(map).not.toHaveBeenCalled();
  });
});
