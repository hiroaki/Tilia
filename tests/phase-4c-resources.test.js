import { describe, expect, it, vi } from "vitest";
import { createScopeController } from "../src/ownership/index.js";
import { createStylesheetManager } from "../src/resources/stylesheets.js";
import { createBaseMapCatalog } from "../src/map/base-map-catalog.js";

function fakeDocument() {
  const head = { children: [], appendChild(node) { node.parent = this; this.children.push(node); } };
  return {
    head,
    createElement() {
      const listeners = {};
      return {
        dataset: {},
        addEventListener(type, callback) { listeners[type] = callback; },
        dispatch(type) { listeners[type]?.({ type }); },
        remove() { if (this.parent) this.parent.children = this.parent.children.filter((item) => item !== this); },
      };
    },
  };
}

function owner(controller, queue = []) {
  return { scope: controller.scope, stage: (value) => controller.stage(value), enqueuePostCommit: (callback) => queue.push(callback) };
}
async function commit(controller, queue) { await controller.commit(); for (const callback of queue.splice(0)) callback(); }

describe("Phase 4C resources and base maps", () => {
  it("balances shared stylesheet leases and removes the final link", async () => {
    const document = fakeDocument();
    const manager = createStylesheetManager({ document });
    const left = createScopeController(); const right = createScopeController();
    const a = manager.acquire(left.scope, { id: "shared", href: "/shared.css" });
    const b = manager.acquire(right.scope, { id: "shared", href: "/shared.css" });
    expect(document.head.children).toHaveLength(1);
    document.head.children[0].dispatch("load");
    await expect(a.ready).resolves.toBeUndefined();
    await left.abort();
    expect(document.head.children).toHaveLength(1);
    b.release(); b.release();
    expect(document.head.children).toHaveLength(0);
  });

  it("rejects conflicting stylesheet definitions", () => {
    const manager = createStylesheetManager({ document: fakeDocument() });
    const scope = createScopeController();
    manager.acquire(scope.scope, { id: "same", href: "/a.css" });
    expect(() => manager.acquire(scope.scope, { id: "same", href: "/b.css" })).toThrowError(expect.objectContaining({ code: "RESOURCE_CONFLICT" }));
  });

  it("rejects failed stylesheet loads and permits retry after the final lease releases", async () => {
    const document = fakeDocument();
    const manager = createStylesheetManager({ document });
    const first = createScopeController();
    const failed = manager.acquire(first.scope, { id: "retry", href: "/retry.css" });
    document.head.children[0].dispatch("error");
    await expect(failed.ready).rejects.toMatchObject({ code: "RESOURCE_ACQUISITION_FAILED" });
    expect(document.head.children).toHaveLength(0);
    failed.release();
    const second = createScopeController();
    const retried = manager.acquire(second.scope, { id: "retry", href: "/retry.css" });
    expect(document.head.children).toHaveLength(1);
    document.head.children[0].dispatch("load");
    await expect(retried.ready).resolves.toBeUndefined();
  });

  it("removes a selected provider layer and deterministically falls back", async () => {
    const events = [];
    const map = {};
    const catalog = createBaseMapCatalog({ map });
    const first = createScopeController(); const second = createScopeController();
    const q1 = []; const q2 = [];
    const layer = (id) => ({ addTo: vi.fn(() => events.push(`add:${id}`)), remove: vi.fn(() => events.push(`remove:${id}`)) });
    catalog.createFacade(owner(first, q1)).register({ id: "first", isDefault: true, createLayer: () => layer("first") });
    catalog.createFacade(owner(second, q2)).register({ id: "second", createLayer: () => layer("second") });
    await commit(first, q1); await commit(second, q2);
    expect(catalog.getSnapshot().selected.id).toBe("first");
    await first.close();
    expect(catalog.getSnapshot().selected.id).toBe("second");
    expect(events).toContain("remove:first");
  });

  it("ends coherently with null selection when every fallback fails", async () => {
    const errors = [];
    const catalog = createBaseMapCatalog({ map: {}, onError: (error) => errors.push(error) });
    const first = createScopeController(); const broken = createScopeController();
    const q1 = []; const q2 = [];
    const departing = { addTo() {}, remove: vi.fn() };
    catalog.createFacade(owner(first, q1)).register({ id: "first", isDefault: true, createLayer: () => departing });
    catalog.createFacade(owner(broken, q2)).register({ id: "broken", createLayer: () => { throw new Error("broken"); } });
    await commit(first, q1); await commit(broken, q2);
    await first.close();
    expect(catalog.getSnapshot().selected).toBeNull();
    expect(departing.remove).toHaveBeenCalled();
    expect(errors).toHaveLength(1);
  });
});
