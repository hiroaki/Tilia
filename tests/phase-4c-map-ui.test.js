import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createScopeController } from "../src/ownership/index.js";
import { createMapFacadeFactory } from "../src/map/facade.js";
import { createUiMountManager } from "../src/ui/mounts.js";

function element(ownerDocument) {
  return {
    ownerDocument, nodeType: 1, children: [], dataset: {}, style: {},
    appendChild(child) { child.parent = this; this.children = this.children.filter((item) => item !== child); this.children.push(child); },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((item) => item !== this); },
    setAttribute(name, value) { this[name] = value; },
  };
}

describe("Phase 4C map and UI ownership", () => {
  it("rejects invalid map listener registrations before calling Leaflet", () => {
    const map = { on: vi.fn(), off: vi.fn() };
    const controller = createScopeController();
    const facade = createMapFacadeFactory({ map })({ pluginId: "x-test", scope: controller.scope });
    const invalid = [
      ["", () => {}],
      ["   ", () => {}],
      [42, () => {}],
      ["click"],
      ["click", null],
      ["click", "listener"],
    ];
    for (const args of invalid) {
      expect(() => facade.listen(...args)).toThrow(TypeError);
      expect(map.on).not.toHaveBeenCalled();
    }
  });

  it("owns map listeners, layers, and controls", async () => {
    const handlers = new Map();
    const map = {
      on: vi.fn((type, callback) => handlers.set(type, callback)),
      off: vi.fn((type) => handlers.delete(type)),
      fitBounds: vi.fn(function () { return this; }),
      panTo: vi.fn(function () { return this; }),
      setView: vi.fn(function () { return this; }),
    };
    const controller = createScopeController();
    const facade = createMapFacadeFactory({ map })({ pluginId: "x-test", scope: controller.scope });
    const listener = vi.fn();
    const listenerHandle = facade.listen(" click ", listener);
    const layer = { addTo: vi.fn(), remove: vi.fn() };
    const control = { addTo: vi.fn(), remove: vi.fn() };
    facade.attachLayer(layer);
    facade.mountControl(control);
    await controller.commit();
    const originalEvent = { target: map };
    handlers.get("click")({ type: "click", latlng: { lat: 1, lng: 2 }, layerPoint: { x: 3, y: 4 }, originalEvent });
    const event = listener.mock.calls[0][0];
    expect(event).toEqual({ type: "click", latlng: { lat: 1, lng: 2 }, layerPoint: { x: 3, y: 4 }, containerPoint: null });
    expect(event).not.toHaveProperty("originalEvent");
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.latlng)).toBe(true);
    expect(Object.isFrozen(event.layerPoint)).toBe(true);
    expect(map.on).toHaveBeenCalledWith("click", expect.any(Function));
    expect(facade.fitBounds([])).toBeUndefined();
    expect(facade.panTo({ lat: 0, lng: 0 })).toBeUndefined();
    expect(facade.setView({ lat: 0, lng: 0 }, 5)).toBeUndefined();
    listenerHandle.dispose();
    listenerHandle.dispose();
    expect(map.off).toHaveBeenCalledTimes(1);
    expect(map.off).toHaveBeenCalledWith("click", expect.any(Function));
    const secondListener = facade.listen("move", () => {});
    expect(secondListener).toBeTruthy();
    await controller.close();
    expect(map.off).toHaveBeenCalledTimes(2);
    expect(map.off).toHaveBeenLastCalledWith("move", expect.any(Function));
    expect(layer.remove).toHaveBeenCalledOnce();
    expect(control.remove).toHaveBeenCalledOnce();
    expect(() => facade.panTo({ lat: 0, lng: 0 })).toThrowError(expect.objectContaining({ code: "SCOPE_NOT_ACTIVE" }));
  });

  it("keeps advanced raw-map access explicit in every Phase 4C migrated plugin", () => {
    const files = [
      "src/plugins/ui/status-control.js",
      "src/plugins/ui/base-map-control.js",
      "plugins/x-gsi-base-maps/loader.js",
      "plugins/x-opentopomap-base-maps/loader.js",
    ];
    for (const file of files) expect(readFileSync(file, "utf8")).not.toContain("advancedLeafletMap(");
  });

  it("gives plugins only assigned containers and removes mounts on rollback", async () => {
    const ownerDocument = { createElement: () => element(ownerDocument) };
    const mapContainer = element(ownerDocument);
    const manager = createUiMountManager({ scope: createScopeController({ label: "ui-host" }).scope, map: { getContainer: () => mapContainer } });
    const controller = createScopeController();
    let assigned;
    manager.createFacade({ pluginId: "x-test", scope: controller.scope }).mountSurface({
      id: "one", surface: "floating", rank: 1,
      mount({ container, scope }) { assigned = { container, scope }; container.appendChild(element(ownerDocument)); },
    });
    expect(assigned.container.dataset.tiliaSurfaceRoot).toBeUndefined();
    expect(mapContainer.children[0].children).toHaveLength(1);
    await controller.abort();
    expect(mapContainer.children[0].children).toHaveLength(0);
    expect(assigned.scope.alive).toBe(false);
  });

  it("coordinates synchronous mount failure with parent rollback", async () => {
    const ownerDocument = { createElement: () => element(ownerDocument) };
    const mapContainer = element(ownerDocument);
    const manager = createUiMountManager({ scope: createScopeController({ label: "ui-host" }).scope, map: { getContainer: () => mapContainer } });
    const controller = createScopeController();
    let releaseCleanup;
    const cleanupBlocker = new Promise((resolve) => { releaseCleanup = resolve; });
    let childScope;
    expect(() => manager.createFacade({ pluginId: "x-failing", scope: controller.scope }).mountSurface({
      id: "one",
      mount({ scope }) {
        childScope = scope;
        scope.defer(() => cleanupBlocker);
        throw new Error("mount failed");
      },
    })).toThrow("mount failed");
    expect(childScope.alive).toBe(false);
    expect(mapContainer.children[0].children).toHaveLength(1);
    let rolledBack = false;
    const rollback = controller.abort().then(() => { rolledBack = true; });
    await Promise.resolve();
    expect(rolledBack).toBe(false);
    releaseCleanup();
    await rollback;
    expect(mapContainer.children[0].children).toHaveLength(0);
  });

  it("removes wrappers after child cleanup failure and keeps repeated unmount idempotent", async () => {
    const ownerDocument = { createElement: () => element(ownerDocument) };
    const mapContainer = element(ownerDocument);
    const manager = createUiMountManager({ scope: createScopeController({ label: "ui-host" }).scope, map: { getContainer: () => mapContainer } });
    const controller = createScopeController();
    const handle = manager.createFacade({ pluginId: "x-cleanup", scope: controller.scope }).mountSurface({
      id: "one",
      mount({ scope }) { scope.defer(() => { throw new Error("cleanup failed"); }); },
    });
    const first = handle.unmount();
    const second = handle.unmount();
    expect(second).toBe(first);
    await expect(first).rejects.toMatchObject({ code: "SCOPE_DISPOSAL_FAILED" });
    expect(mapContainer.children[0].children).toHaveLength(0);
  });

  it("observes failed mount cleanup without an unhandled rejection", async () => {
    const ownerDocument = { createElement: () => element(ownerDocument) };
    const mapContainer = element(ownerDocument);
    const manager = createUiMountManager({ scope: createScopeController({ label: "ui-host" }).scope, map: { getContainer: () => mapContainer } });
    const controller = createScopeController();
    const unhandled = [];
    const observe = (reason) => unhandled.push(reason);
    process.on("unhandledRejection", observe);
    try {
      expect(() => manager.createFacade({ pluginId: "x-rejected", scope: controller.scope }).mountSurface({
        id: "one",
        mount({ scope }) {
          scope.defer(() => { throw new Error("cleanup failed"); });
          throw new Error("mount failed");
        },
      })).toThrow("mount failed");
      await expect(controller.abort()).rejects.toMatchObject({ code: "SCOPE_ROLLBACK_FAILED" });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
      expect(mapContainer.children[0].children).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", observe);
    }
  });

  it("supports uninstall and reinstall without duplicate or orphaned mounts", async () => {
    const ownerDocument = { createElement: () => element(ownerDocument) };
    const mapContainer = element(ownerDocument);
    const manager = createUiMountManager({ scope: createScopeController({ label: "ui-host" }).scope, map: { getContainer: () => mapContainer } });
    const install = async () => {
      const controller = createScopeController();
      manager.createFacade({ pluginId: "x-reinstall", scope: controller.scope }).mountSurface({ id: "one", mount() {} });
      await controller.commit();
      return controller;
    };
    const first = await install();
    expect(mapContainer.children[0].children).toHaveLength(1);
    await first.close();
    expect(mapContainer.children[0].children).toHaveLength(0);
    const second = await install();
    expect(mapContainer.children[0].children).toHaveLength(1);
    await second.close();
    expect(mapContainer.children[0].children).toHaveLength(0);
  });
});
