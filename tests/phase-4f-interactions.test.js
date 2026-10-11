import { it, expect, vi } from "vitest";
import { createInteractionHost } from "../src/interactions/host.js";
import { createScopeController } from "../src/ownership/index.js";
function target() {
  const listeners = new Map();
  return {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    off(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    fire(type, event) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(event);
    },
  };
}
async function fixture() {
  const root = createScopeController();
  await root.commit();
  const map = target(),
    errors = [];
  const host = createInteractionHost({
    map,
    scope: root.scope,
    onError: (e) => errors.push(e),
  });
  const scope = root.scope.child();
  return { root, map, host, scope, api: host.createFacade(scope), errors };
}
it("intercepts modal at map root before object and later bubbling, with physical-type deduplication", async () => {
  const f = await fixture(),
    object = target(),
    surface = f.api.createSurface({ id: "object", target: object }),
    order = [];
  f.api.bind({
    id: "modal",
    surface: f.api.mapSurface(),
    event: "click",
    tier: "modal",
    handle: () => ({ consume: true, run: () => order.push("modal") }),
  });
  f.api.bind({
    id: "object",
    surface,
    event: "click",
    tier: "object",
    handle: () => ({ consume: true, run: () => order.push("object") }),
  });
  f.api.bind({
    id: "background",
    surface: f.api.mapSurface(),
    event: "click",
    tier: "background",
    handle: () => ({ consume: true, run: () => order.push("background") }),
  });
  const carrier = { stopPropagation: vi.fn() };
  object.fire("click", { originalEvent: carrier });
  f.map.fire("click", { originalEvent: carrier });
  expect(order).toEqual(["modal"]);
  expect(carrier.stopPropagation).toHaveBeenCalled();
});
it("orders ancestor modals deepest-first and falls through unconsumed decisions", async () => {
  const f = await fixture(),
    a = target(),
    b = target(),
    parent = f.api.createSurface({ id: "parent", target: a }),
    child = f.api.createSurface({ id: "child", target: b, parent }),
    order = [];
  f.api.bind({
    id: "root-modal",
    surface: f.api.mapSurface(),
    event: "click",
    tier: "modal",
    handle: () => {
      order.push("root");
      return { consume: false };
    },
  });
  f.api.bind({
    id: "child-modal",
    surface: parent,
    event: "click",
    tier: "modal",
    handle: () => {
      order.push("parent");
      return { consume: false };
    },
  });
  f.api.bind({
    id: "object",
    surface: child,
    event: "click",
    tier: "object",
    handle: () => ({ consume: true, run: () => order.push("object") }),
  });
  b.fire("click", {});
  expect(order).toEqual(["parent", "root", "object"]);
});
it("rejects primary conflicts, foreign handles, unrelated scopes and unsupported events", async () => {
  const f = await fixture(),
    other = await fixture(),
    object = target(),
    surface = f.api.createSurface({ id: "object", target: object });
  const binding = {
    id: "first",
    surface,
    event: "click",
    tier: "object",
    handle: () => ({ consume: false }),
  };
  f.api.bind(binding);
  expect(() => f.api.bind({ ...binding, id: "second" })).toThrow("Duplicate");
  expect(() =>
    f.api.bind({ ...binding, surface: other.api.mapSurface() }),
  ).toThrow();
  expect(() => f.api.bind({ ...binding, scope: other.scope })).toThrow();
  expect(() => f.api.bind({ ...binding, event: "invented" })).toThrow();
});
it("parent closure invalidates descendants without closing their independent owner", async () => {
  const f = await fixture(),
    parentScope = f.scope.child(),
    childScope = f.scope.child(),
    a = target(),
    b = target();
  const parent = f.api.createSurface({
    id: "parent",
    target: a,
    scope: parentScope,
  });
  const child = f.api.createSurface({
    id: "child",
    target: b,
    parent,
    scope: childScope,
  });
  const run = vi.fn();
  f.api.bind({
    id: "child-action",
    surface: child,
    event: "click",
    tier: "object",
    scope: childScope,
    handle: () => ({ consume: true, run }),
  });
  await parentScope.dispose();
  b.fire("click", {});
  expect(run).not.toHaveBeenCalled();
  expect(childScope.alive).toBe(true);
});
it.each(["throw", "promise", "invalid", "run-reject"])(
  "contains %s handler failure without lower-tier execution or unhandled rejection",
  async (mode) => {
    const f = await fixture(),
      background = vi.fn();
    f.api.bind({
      id: "modal",
      surface: f.api.mapSurface(),
      event: "click",
      tier: "modal",
      handle() {
        if (mode === "throw") throw Error("handler");
        if (mode === "promise") return Promise.reject(Error("async decision"));
        if (mode === "invalid") return {};
        return { consume: true, run: () => Promise.reject(Error("run")) };
      },
    });
    f.api.bind({
      id: "background",
      surface: f.api.mapSurface(),
      event: "click",
      tier: "background",
      handle: () => ({ consume: true, run: background }),
    });
    f.map.fire("click", {});
    await Promise.resolve();
    await Promise.resolve();
    expect(background).not.toHaveBeenCalled();
    expect(f.errors.length).toBeGreaterThan(0);
  },
);
it("treats preclick and click as separate occurrences on one native carrier", async () => {
  const f = await fixture(),
    run = vi.fn();
  for (const event of ["preclick", "click"])
    f.api.bind({
      id: event,
      surface: f.api.mapSurface(),
      event,
      tier: "background",
      handle: () => ({ consume: true, run }),
    });
  const carrier = {};
  for (const event of ["preclick", "click", "click"])
    f.map.fire(event, { originalEvent: carrier });
  expect(run).toHaveBeenCalledTimes(2);
});
