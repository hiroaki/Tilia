import { it, expect, vi } from "vitest";
import { createInteractionHost } from "../src/interactions/host.js";
import { createScopeController } from "../src/ownership/index.js";
import { setScopeOperationalCheck } from "../src/ownership/scope.js";
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

it("skips a binding disposed by a declining modal and still runs valid background work", async () => {
  const f = await fixture(), object = target(),
    surface = f.api.createSurface({ id: "object", target: object }),
    handle = vi.fn(() => ({ consume: true })), run = vi.fn();
  const binding = f.api.bind({ id: "object", surface, event: "click", tier: "object", handle });
  let disposal;
  f.api.bind({ id: "modal", surface: f.api.mapSurface(), event: "click", tier: "modal",
    handle() { disposal = binding.dispose(); return { consume: false }; } });
  f.api.bind({ id: "background", surface: f.api.mapSurface(), event: "click", tier: "background",
    handle: () => ({ consume: true, run }) });
  object.fire("click", {});
  expect(handle).not.toHaveBeenCalled();
  expect(run).toHaveBeenCalledTimes(1);
  await disposal;
  await f.root.close();
});

it("preserves consumption but skips run after self-disposal", async () => {
  const f = await fixture(), run = vi.fn(), background = vi.fn(), carrier = { stopPropagation: vi.fn() };
  let binding, disposal;
  binding = f.api.bind({ id: "modal", surface: f.api.mapSurface(), event: "click", tier: "modal",
    handle() { disposal = binding.dispose(); return { consume: true, run }; } });
  f.api.bind({ id: "background", surface: f.api.mapSurface(), event: "click", tier: "background",
    handle: background });
  f.map.fire("click", { originalEvent: carrier });
  expect(run).not.toHaveBeenCalled();
  expect(background).not.toHaveBeenCalled();
  expect(carrier.stopPropagation).toHaveBeenCalled();
  await disposal;
  await f.root.close();
});

it.each(["before", "during"])("fences an alive but non-operational binding owner %s handle", async (when) => {
  const f = await fixture(), owner = createScopeController(), run = vi.fn();
  await owner.commit();
  let operational = true;
  setScopeOperationalCheck(owner.scope, () => { if (!operational) throw Error("shutdown"); });
  const api = f.host.createFacade(owner.scope);
  const handle = vi.fn(() => { operational = false; return { consume: true, run }; });
  api.bind({ id: "modal", surface: api.mapSurface(), event: "click", tier: "modal", handle });
  if (when === "before") operational = false;
  f.map.fire("click", {});
  expect(owner.scope.alive).toBe(true);
  expect(handle).toHaveBeenCalledTimes(when === "before" ? 0 : 1);
  expect(run).not.toHaveBeenCalled();
  await owner.close();
  await f.root.close();
});

it("fences the host root even while an independent consumer remains operational", async () => {
  const f = await fixture(), owner = createScopeController(), handle = vi.fn();
  await owner.commit();
  let operational = true;
  setScopeOperationalCheck(f.root.scope, () => { if (!operational) throw Error("shutdown"); });
  const api = f.host.createFacade(owner.scope);
  api.bind({ id: "modal", surface: api.mapSurface(), event: "click", tier: "modal", handle });
  operational = false;
  f.map.fire("click", {});
  expect(f.root.scope.alive).toBe(true);
  expect(handle).not.toHaveBeenCalled();
  await owner.close();
  await f.root.close();
});

it.each(["close-owner", "stale-generation"])("rechecks %s before a lower candidate and before run", async (mode) => {
  const f = await fixture(), owner = f.scope.child(), object = target(),
    surface = f.api.createSurface({ id: "object", target: object, scope: owner }), run = vi.fn();
  let current = true, closing;
  const api = f.host.createFacade(owner, { isCurrent: () => current });
  const invalidate = () => { if (mode === "close-owner") closing = owner.dispose(); else current = false; };
  const handle = vi.fn(() => ({ consume: true, run }));
  api.bind({ id: "object", surface, event: "click", tier: "object", handle });
  const modal = f.api.bind({ id: "modal", surface: f.api.mapSurface(), event: "click", tier: "modal",
    handle() { invalidate(); return { consume: false }; } });
  object.fire("click", {});
  expect(handle).not.toHaveBeenCalled();
  await closing;
  await modal.dispose();
  const actionOwner = f.scope.child();
  current = true;
  const actionApi = f.host.createFacade(actionOwner, { isCurrent: () => current });
  actionApi.bind({ id: "modal-action", surface: actionApi.mapSurface(), event: "click", tier: "modal",
    handle() {
      if (mode === "close-owner") closing = actionOwner.dispose(); else current = false;
      return { consume: true, run };
    } });
  f.map.fire("click", {});
  expect(run).not.toHaveBeenCalled();
  await closing;
  await f.root.close();
});

it("does not route through an origin surface closed by a declining ancestor handler", async () => {
  const f = await fixture(), object = target(), owner = f.scope.child(), background = vi.fn();
  const surface = f.api.createSurface({ id: "object", target: object, scope: owner });
  f.api.bind({ id: "object", surface, event: "click", tier: "object", scope: owner,
    handle: () => ({ consume: false }) });
  let closing;
  f.api.bind({ id: "modal", surface: f.api.mapSurface(), event: "click", tier: "modal",
    handle() { closing = owner.dispose(); return { consume: false }; } });
  f.api.bind({ id: "background", surface: f.api.mapSurface(), event: "click", tier: "background", handle: background });
  object.fire("click", {});
  expect(background).not.toHaveBeenCalled();
  await closing;
  await f.root.close();
});

it.each([false, true])("rechecks origin generation currency after a modal decision (consume:%s)", async (consume) => {
  const f = await fixture(), object = target(), run = vi.fn(), background = vi.fn();
  let current = true;
  const api = f.host.createFacade(f.scope, { isCurrent: () => current });
  const surface = api.createSurface({ id: "generation-object", target: object });
  api.bind({ id: "object", surface, event: "click", tier: "object",
    handle: () => ({ consume: true, run }) });
  f.api.bind({ id: "modal", surface: f.api.mapSurface(), event: "click", tier: "modal",
    handle() { current = false; return { consume, run }; } });
  f.api.bind({ id: "background", surface: f.api.mapSurface(), event: "click", tier: "background", handle: background });
  const carrier = { stopPropagation: vi.fn() };
  object.fire("click", { originalEvent: carrier });
  f.map.fire("click", { originalEvent: carrier });
  expect(run).not.toHaveBeenCalled();
  expect(background).not.toHaveBeenCalled();
  expect(carrier.stopPropagation).toHaveBeenCalled();
  await f.root.close();
});

it("revokes a binding before failing listener removal can dispatch reentrantly", async () => {
  const f = await fixture(), handle = vi.fn(() => ({ consume: true }));
  const binding = f.api.bind({ id: "modal", surface: f.api.mapSurface(), event: "click", tier: "modal", handle });
  const off = f.map.off;
  f.map.off = () => { f.map.fire("click", {}); throw Error("remove failed"); };
  await expect(binding.dispose()).rejects.toThrow();
  f.map.fire("click", {});
  expect(handle).not.toHaveBeenCalled();
  f.map.off = off;
  await f.root.close();
});
