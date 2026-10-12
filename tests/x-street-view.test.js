import { afterEach, describe, expect, it, vi } from "vitest";
import { documentFixture, byClass, settle } from "./helpers/scoped-dom.js";
import { createScopeController } from "../src/ownership/index.js";
import { setScopeOperationalCheck } from "../src/ownership/scope.js";
import { createPluginContext } from "../src/plugins/runtime/context.js";
import { createMapFacadeFactory } from "../src/map/facade.js";
import { createUiMountManager } from "../src/ui/mounts.js";

vi.mock("leaflet", async () => {
  const helpers = await import("./helpers/leaflet-ui.js");
  return { ...helpers, Marker: class extends helpers.Layer {
    setIcon(icon) { this.options.icon = icon; return this; }
  } };
});
import plugin from "../plugins/x-street-view/loader.js";
import { Marker } from "leaflet";
import { PanDirectionTracker } from "../plugins/x-street-view/vendor/leaflet-pan-direction/src/panDirectionTracker.js";

const fixtures = [];
afterEach(async () => {
  for (const f of fixtures.splice(0)) await f.root.close().catch(() => {});
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fixture({ commit = true, failMount = false, failListen = false } = {}) {
  const document = documentFixture();
  vi.stubGlobal("document", document);
  const open = vi.fn(); vi.stubGlobal("window", { open });
  const root = createScopeController(), container = document.createElement("div");
  document.body.appendChild(container);
  const listeners = new Map();
  const map = {
    layers: new Set(), center: { lat: 0, lng: 0 },
    getContainer: () => container,
    getCenter() { return this.center; }, getZoom: () => 10,
    latLngToContainerPoint: point => ({ x: point.lng * 100, y: -point.lat * 100 }),
    project: point => ({ x: point.lng * 100, y: -point.lat * 100 }),
    on(type, callback) {
      if (failListen && type === "click") throw Error("injected click attachment failure");
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    off(type, callback) { listeners.get(type)?.delete(callback); },
    fire(type, event = {}) { for (const callback of [...listeners.get(type) ?? []]) callback(event); },
  };
  const queue = [], errors = [], styles = [], ui = createUiMountManager({ map, scope: root.scope, onError: e => errors.push(e) });
  let installing = true, active = false, operational = true;
  setScopeOperationalCheck(root.scope, () => { if (!operational) throw Error("shutdown"); });
  const context = createPluginContext({
    pluginId: plugin.id, scope: root.scope,
    enqueuePostCommit: callback => queue.push(callback),
    isInstalling: () => installing, isActive: () => active,
    diagnostics: { report: error => errors.push(error) },
    capabilityFactories: {
      map: createMapFacadeFactory({ map }),
      ui: input => failMount ? { mountSurface() { throw Error("mount failure"); } } : ui.createFacade(input),
      styles: () => ({ use: value => styles.push(value) }),
      diagnostics: () => ({ report: error => errors.push(error) }),
    },
  });
  const f = {
    root, container, map, listeners, errors, open, styles,
    panel: () => byClass(container, "x-street-view-panel")[0],
    marker: () => [...map.layers][0],
    click: (lat = 35, lng = 135) => map.fire("click", { latlng: { lat, lng } }),
    async commit() { await root.commit(); installing = false; active = true; queue.splice(0).forEach(callback => callback()); },
    shutdown() { operational = false; },
    pan(points) {
      map.center = points[0]; map.fire("dragstart");
      for (const point of points.slice(1, -1)) { map.center = point; map.fire("drag"); }
      map.center = points.at(-1); map.fire("dragend");
    },
    count: type => listeners.get(type)?.size ?? 0,
  };
  fixtures.push(f);
  const createElement = document.createElement.bind(document);
  document.createElement = (...args) => {
    const element = createElement(...args);
    element.getBoundingClientRect = () => ({ width: 100, height: 44 });
    return element;
  };
  plugin.setup(context);
  if (commit) await f.commit();
  return f;
}

describe("x-street-view lifecycle and local selection", () => {
  it("starts only after commit with a north arrow and URL before any drag", async () => {
    const trackerHeading = vi.spyOn(PanDirectionTracker.prototype, "getLastHeading");
    const f = await fixture({ commit: false });
    expect(f.count("click")).toBe(0); expect(f.count("dragend")).toBe(0); expect(f.panel()).toBeUndefined();
    await f.commit();
    expect(f.styles[0].href).toMatch(/x-street-view\/styles.css$/);
    expect(f.count("dragend")).toBe(2); expect(f.panel().hidden).toBe(true);
    f.click(); expect(f.panel().hidden).toBe(false); expect(f.map.layers.size).toBe(1);
    expect(f.marker().options.icon.options.html).toContain('data-heading="0"');
    const button = f.panel().children[0];
    // The minimal EventTarget fixture does not implement DOM bubbling.
    const event = new Event("click"); Object.defineProperty(event, "target", { value: button });
    f.panel().dispatchEvent(event);
    expect(f.open).toHaveBeenCalledTimes(1);
    expect(new URL(f.open.mock.calls[0][0]).searchParams.get("heading")).toBe("0");
    expect(f.open.mock.calls[0].slice(1)).toEqual(["_blank", "noopener,noreferrer"]);
    expect(f.panel().hidden).toBe(false);
    expect(trackerHeading.mock.results.every(result => result.value === null)).toBe(true);
  });

  it("alternates selection/clear and updates heading without moving the selected origin", async () => {
    const f = await fixture();
    f.pan([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }]);
    f.click(35, 495);
    const marker = f.marker();
    expect(marker.point).toEqual({ lat: 35, lng: 135 });
    expect(marker.options).toMatchObject({ interactive: false, keyboard: false });
    expect(marker.options.icon.options.html).toContain('data-heading="90"');
    f.pan([{ lat: 0, lng: 1 }, { lat: 1, lng: 1 }]);
    expect(f.marker()).toBe(marker); expect(marker.point).toEqual({ lat: 35, lng: 135 });
    expect(marker.options.icon.options.html).toContain('data-heading="0"');
    const event = new Event("click"); Object.defineProperty(event, "target", { value: f.panel().children[0] });
    f.panel().dispatchEvent(event);
    expect(new URL(f.open.mock.calls[0][0]).searchParams.get("heading")).toBe("0");
    const remove = vi.spyOn(marker, "remove");
    f.click(36, 136);
    expect(f.panel().hidden).toBe(true); expect(f.map.layers.size).toBe(0);
    f.click(37, 137); expect(f.marker().point).toEqual({ lat: 37, lng: 137 });
    const replacement = f.marker();
    await settle();
    expect(f.marker()).toBe(replacement);
    expect(remove).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 8; i++) { f.click(); f.click(); }
    expect(f.map.layers.size).toBe(1); expect(f.count("click")).toBe(1); expect(f.count("dragend")).toBe(2);
    expect(f.errors).toEqual([]);
    await f.root.close();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("preserves the location and panel after partial indicator attachment failure and recovers on pan", async () => {
    const f = await fixture();
    f.pan([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }]);
    const failure = Error("indicator add failure"), addTo = Marker.prototype.addTo;
    vi.spyOn(Marker.prototype, "addTo").mockImplementationOnce(function (map) {
      addTo.call(this, map);
      throw failure;
    });
    f.click(35, 135);
    expect(f.panel().hidden).toBe(false);
    expect(f.map.layers.size).toBe(0);
    expect(f.errors).toEqual([failure]);
    f.pan([{ lat: 0, lng: 1 }, { lat: 1, lng: 1 }]);
    expect(f.marker().point).toEqual({ lat: 35, lng: 135 });
    expect(f.marker().options.icon.options.html).toContain('data-heading="0"');
    expect(f.errors).toEqual([failure]);
    f.click();
    expect(f.panel().hidden).toBe(true); expect(f.map.layers.size).toBe(0);
    await f.root.close();
    expect(f.errors).toEqual([failure]);
  });

  it("keeps selection after icon update failures and opens the current URL despite optional rendering failure", async () => {
    const f = await fixture();
    f.pan([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }]); f.click(35, 135);
    const marker = f.marker(), failure = Error("icon update failure");
    vi.spyOn(marker, "setIcon").mockImplementationOnce(() => { throw failure; })
      .mockImplementationOnce(() => { throw failure; });
    f.pan([{ lat: 0, lng: 1 }, { lat: 1, lng: 1 }]);
    expect(f.panel().hidden).toBe(false); expect(f.marker()).toBe(marker);
    expect(f.errors).toEqual([failure]);
    const event = new Event("click"); Object.defineProperty(event, "target", { value: f.panel().children[0] });
    f.panel().dispatchEvent(event);
    expect(f.open).toHaveBeenCalledTimes(1);
    const url = new URL(f.open.mock.calls[0][0]);
    expect(url.searchParams.get("viewpoint")).toBe("35,135");
    expect(url.searchParams.get("heading")).toBe("0");
    expect(f.errors).toEqual([failure, failure]); // Once for each failed refresh.
    f.pan([{ lat: 1, lng: 1 }, { lat: 0, lng: 1 }]);
    expect(marker.options.icon.options.html).toContain('data-heading="180"');
    expect(f.errors).toEqual([failure, failure]);
  });

  it("reuses the initial north indicator after the first pan and preserves it through zoom and programmatic movement", async () => {
    const f = await fixture(); f.click();
    const initialMarker = f.marker();
    expect(initialMarker.options.icon.options.html).toContain('data-heading="0"');
    f.pan([{ lat: 0, lng: 0 }, { lat: 0, lng: -1 }]);
    const marker = f.marker(), icon = marker.options.icon;
    expect(marker).toBe(initialMarker);
    f.map.center = { lat: 10, lng: 10 }; f.map.fire("moveend"); f.map.fire("zoomend");
    expect(marker.point).toEqual({ lat: 35, lng: 135 }); expect(marker.options.icon).toBe(icon);
    expect(icon.options.iconSize).toEqual([128, 128]);
    f.pan([{ lat: 10, lng: 10 }, { lat: 10, lng: 10 }]);
    expect(marker.options.icon.options.html).toContain('data-heading="270"');
  });

  it("reprojects the geographic anchor on movement, zoom and resize without changing heading", async () => {
    const f = await fixture(); f.click(1, 2);
    expect(f.panel().style.left).toBe("200px");
    expect(f.panel().style.top).toBe("-182px");
    f.pan([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }]);
    expect(f.panel().style.left).toBe("310px");
    for (const type of ["move", "zoom", "resize"]) {
      f.map.latLngToContainerPoint = () => ({ x: 400, y: 300 });
      f.map.fire(type);
      expect(f.panel().style.left).toBe("510px");
      expect(parseFloat(f.panel().style.top)).toBeCloseTo(300);
      expect(f.marker().point).toEqual({ lat: 1, lng: 2 });
      expect(f.count(type)).toBe(1);
    }
  });

  it("owns size observation and ignores stale callbacks after disposal", async () => {
    const observers = [];
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe = vi.fn();
      disconnect = vi.fn();
    });
    const f = await fixture(); f.click(1, 2);
    const panel = f.panel();
    const observer = observers.find(item => item.observe.mock.calls.some(([target]) => target === panel));
    expect(observer).toBeDefined();
    panel.getBoundingClientRect = () => ({ width: 200, height: 88 });
    observer.callback(); expect(panel.style.top).toBe("-204px");
    await f.root.close();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    panel.getBoundingClientRect = () => { throw Error("stale measurement"); };
    observer.callback();
    expect(f.errors).toEqual([]);
  });

  it("ignores invalid initial coordinates", async () => {
    const f = await fixture(); f.click(NaN); f.map.fire("click", {});
    expect(f.panel().hidden).toBe(true); expect(f.map.layers.size).toBe(0); expect(f.errors).toEqual([]);
  });

  it.each(["plugin", "map", "shutdown"])("revokes effects on %s destruction", async kind => {
    const f = await fixture(); f.click();
    f.pan([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }]);
    const panel = f.panel(), callback = [...f.listeners.get("click")][0];
    if (kind === "shutdown") {
      f.shutdown(); callback({ latlng: { lat: 36, lng: 136 } });
      expect(f.map.layers.size).toBe(1);
      await f.root.close();
    } else if (kind === "map") { f.map.fire("unload"); await settle(); }
    else await f.root.close();
    expect(f.map.layers.size).toBe(0); expect(f.panel()).toBeUndefined();
    for (const type of ["click", "dragstart", "drag", "dragend", "unload", "move", "zoom", "resize"]) expect(f.count(type)).toBe(0);
    callback({ latlng: { lat: 1, lng: 1 } }); panel.click();
    expect(f.open).not.toHaveBeenCalled(); expect(f.errors).toEqual([]);
  });

  it("rolls back failed setup before activation", async () => {
    const f = await fixture({ commit: false });
    await f.root.abort();
    expect(f.count("click")).toBe(0); expect(f.count("dragend")).toBe(0); expect(f.panel()).toBeUndefined();
  });

  it.each([{ failMount: true }, { failListen: true }])("cleans partial afterCommit startup %j", async faults => {
    const f = await fixture(faults); await settle();
    expect(f.errors).toHaveLength(1); expect(f.panel()).toBeUndefined();
    for (const type of ["click", "dragstart", "drag", "dragend"]) expect(f.count(type)).toBe(0);
    expect(f.map.layers.size).toBe(0);
  });
});
