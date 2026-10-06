import { describe, expect, it, vi } from "vitest";
import { createScopeController } from "../src/ownership/index.js";
import { createMapFacadeFactory } from "../src/map/facade.js";
import { createUiMountManager } from "../src/ui/mounts.js";

function element(ownerDocument) {
  return {
    ownerDocument, nodeType: 1, children: [], dataset: {},
    appendChild(child) { child.parent = this; this.children = this.children.filter((item) => item !== child); this.children.push(child); },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((item) => item !== this); },
    setAttribute(name, value) { this[name] = value; },
  };
}

describe("Phase 4C map and UI ownership", () => {
  it("owns map listeners, layers, and controls", async () => {
    const handlers = new Map();
    const map = {
      on: vi.fn((type, callback) => handlers.set(type, callback)),
      off: vi.fn((type) => handlers.delete(type)),
    };
    const controller = createScopeController();
    const facade = createMapFacadeFactory({ map })({ pluginId: "x-test", scope: controller.scope });
    const listener = vi.fn();
    facade.listen("click", listener);
    const layer = { addTo: vi.fn(), remove: vi.fn() };
    const control = { addTo: vi.fn(), remove: vi.fn() };
    facade.attachLayer(layer);
    facade.mountControl(control);
    await controller.commit();
    handlers.get("click")({ type: "click", latlng: { lat: 1, lng: 2 } });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ latlng: { lat: 1, lng: 2 } }));
    await controller.close();
    expect(map.off).toHaveBeenCalled();
    expect(layer.remove).toHaveBeenCalledOnce();
    expect(control.remove).toHaveBeenCalledOnce();
    expect(() => facade.panTo({ lat: 0, lng: 0 })).toThrowError(expect.objectContaining({ code: "SCOPE_NOT_ACTIVE" }));
  });

  it("gives plugins only assigned containers and removes mounts on rollback", async () => {
    const ownerDocument = { createElement: () => element(ownerDocument) };
    const mapContainer = element(ownerDocument);
    const manager = createUiMountManager({ map: { getContainer: () => mapContainer } });
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
});
