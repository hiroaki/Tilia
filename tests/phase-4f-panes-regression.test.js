import { it, expect, vi } from "vitest";
import { createScopeController } from "../src/ownership/index.js";
import { createPaneManager } from "../src/map/panes.js";

function leafletPaneMap() {
  const index = new Map();
  index.set("mapPane", {
    appendChild(pane) {
      pane.attached = true;
    },
  });
  return {
    index,
    getPane: (name) => index.get(name),
    createPane(name) {
      const pane = {
        style: {},
        dataset: {},
        attached: true,
        remove: vi.fn(function () {
          this.attached = false;
        }),
      };
      index.set(name, pane);
      return pane;
    },
  };
}
async function fixture() {
  const root = createScopeController();
  await root.commit();
  const map = leafletPaneMap(),
    manager = createPaneManager({ map, scope: root.scope });
  return { root, map, manager };
}
it("reacquires an attached private pane after final release leaves the Leaflet index intact", async () => {
  const { root, map, manager } = await fixture();
  const first = manager.acquire(
    "renderer",
    { name: "dots", band: "markers" },
    root.scope,
  );
  const oldPane = map.getPane(first.name);
  await first.dispose();
  expect(map.getPane(first.name)).toBe(oldPane);
  expect(oldPane.attached).toBe(false);
  const next = manager.acquire(
    "renderer",
    { name: "dots", band: "markers" },
    root.scope,
  );
  const newPane = map.getPane(next.name);
  expect(newPane.attached).toBe(true);
  expect(newPane).toBe(oldPane);
  await first.dispose();
  expect(newPane.attached).toBe(true);
  await next.dispose();
  expect(newPane.attached).toBe(false);
});
it("balances overlapping generation leases and keeps the pane attached until the final owner closes", async () => {
  const { root, map, manager } = await fixture(),
    old = root.scope.child(),
    next = root.scope.child();
  const a = manager.acquire("renderer", { name: "dots", band: "markers" }, old),
    b = manager.acquire("renderer", { name: "dots", band: "markers" }, next);
  expect(a.name).toBe(b.name);
  const pane = map.getPane(b.name);
  await old.dispose();
  expect(pane.attached).toBe(true);
  await a.dispose();
  expect(pane.attached).toBe(true);
  await next.dispose();
  expect(pane.attached).toBe(false);
});
it("keeps newer pane work intact when acquisition reenters old final removal", async () => {
  const { root, map, manager } = await fixture();
  const old = manager.acquire(
      "renderer",
      { name: "dots", band: "markers" },
      root.scope,
    ),
    oldPane = map.getPane(old.name);
  let next;
  oldPane.remove.mockImplementation(function () {
    next = manager.acquire(
      "renderer",
      { name: "dots", band: "markers" },
      root.scope,
    );
    this.attached = false;
  });
  await old.dispose();
  const pane = map.getPane(next.name);
  expect(pane).not.toBe(oldPane);
  expect(pane.attached).toBe(true);
  await old.dispose();
  expect(pane.attached).toBe(true);
  await next.dispose();
  expect(pane.attached).toBe(false);
});
it("retries only old failed removal even after a newer pane is acquired", async () => {
  const { root, map, manager } = await fixture();
  const old = manager.acquire(
      "renderer",
      { name: "dots", band: "markers" },
      root.scope,
    ),
    oldPane = map.getPane(old.name);
  oldPane.remove.mockImplementation(() => {
    throw Error("remove failed");
  });
  await expect(old.dispose()).rejects.toBeDefined();
  const next = manager.acquire(
      "renderer",
      { name: "dots", band: "markers" },
      root.scope,
    ),
    newPane = map.getPane(next.name);
  expect(newPane.attached).toBe(true);
  oldPane.remove.mockImplementation(function () {
    this.attached = false;
  });
  await old.dispose();
  expect(newPane.attached).toBe(true);
  await next.dispose();
  expect(newPane.attached).toBe(false);
});
it("preserves caller-owned panes and band conflicts without taking over a replaced index entry", async () => {
  const { root, map, manager } = await fixture();
  const first = manager.acquire(
    "renderer",
    { name: "dots", band: "markers" },
    root.scope,
  );
  expect(() =>
    manager.acquire("renderer", { name: "dots", band: "modal" }, root.scope),
  ).toThrow("Conflicting");
  await first.dispose();
  const foreign = map.createPane(first.name);
  expect(() =>
    manager.acquire("renderer", { name: "dots", band: "markers" }, root.scope),
  ).toThrow("caller-owned");
  await Promise.resolve();
  await root.close();
  expect(map.getPane(first.name)).toBe(foreign);
  expect(foreign.attached).toBe(true);
  expect(foreign.remove).not.toHaveBeenCalled();
});

it("cleans a partially created indexed pane and can reacquire after failure", async () => {
  const { root, map, manager } = await fixture();
  const create = map.createPane;
  let fail = true;
  map.createPane = function (name) {
    const pane = create.call(this, name);
    if (fail) throw Error("partial create");
    return pane;
  };
  expect(() =>
    manager.acquire("renderer", { name: "dots", band: "markers" }, root.scope),
  ).toThrow("partial");
  for (let i = 0; i < 10; i++) await Promise.resolve();
  const oldPane = [...map.index.entries()].find(
    ([name]) => name !== "mapPane",
  )[1];
  expect(oldPane.attached).toBe(false);
  fail = false;
  const lease = manager.acquire(
    "renderer",
    { name: "dots", band: "markers" },
    root.scope,
  );
  expect(map.getPane(lease.name).attached).toBe(true);
  expect(map.getPane(lease.name)).toBe(oldPane);
  await lease.dispose();
  expect(map.getPane(lease.name).attached).toBe(false);
});
