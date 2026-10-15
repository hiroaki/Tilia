import { it, expect, vi, onTestFinished } from "vitest";
import { createScopeController } from "../src/ownership/index.js";
import { documentFixture } from "./helpers/scoped-dom.js";
import { createPaneManager } from "../src/map/panes.js";

function leafletPaneMap() {
  const index = new Map();
  const doc = documentFixture();
  const container = doc.createElement("div");
  index.set("mapPane", container);
  return {
    index,
    getPane: (name) => index.get(name),
    createPane(name) {
      const pane = doc.createElement("div");
      const remove = pane.remove.bind(pane);
      pane.remove = vi.fn(remove);
      container.appendChild(pane);
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
  const create = map.createPane;
  const container = map.getPane("mapPane"), insert = container.insertBefore;
  onTestFinished(async () => {
    // Restore instance-scoped fault injections before fallback cleanup, including
    // when an assertion fails before the test's explicit close/retry.
    map.createPane = create;
    container.insertBefore = insert;
    for (const pane of map.index.values()) {
      if (vi.isMockFunction(pane.remove))
        pane.remove.mockImplementation(() => Object.getPrototypeOf(pane).remove.call(pane));
    }
    await root.close();
  });
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
  expect(oldPane.parentNode).toBeNull();
  const next = manager.acquire(
    "renderer",
    { name: "dots", band: "markers" },
    root.scope,
  );
  const newPane = map.getPane(next.name);
  expect(newPane.parentNode).toBe(map.getPane("mapPane"));
  expect(newPane).toBe(oldPane);
  await first.dispose();
  expect(newPane.parentNode).toBe(map.getPane("mapPane"));
  await next.dispose();
  expect(newPane.parentNode).toBeNull();
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
  expect(pane.parentNode).toBe(map.getPane("mapPane"));
  await a.dispose();
  expect(pane.parentNode).toBe(map.getPane("mapPane"));
  await next.dispose();
  expect(pane.parentNode).toBeNull();
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
    Object.getPrototypeOf(this).remove.call(this);
  });
  await old.dispose();
  const pane = map.getPane(next.name);
  expect(pane).not.toBe(oldPane);
  expect(pane.parentNode).toBe(map.getPane("mapPane"));
  await old.dispose();
  expect(pane.parentNode).toBe(map.getPane("mapPane"));
  await next.dispose();
  expect(pane.parentNode).toBeNull();
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
  expect(newPane.parentNode).toBe(map.getPane("mapPane"));
  oldPane.remove.mockImplementation(function () {
    Object.getPrototypeOf(this).remove.call(this);
  });
  await old.dispose();
  expect(newPane.parentNode).toBe(map.getPane("mapPane"));
  await next.dispose();
  expect(newPane.parentNode).toBeNull();
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
  expect(foreign.parentNode).toBe(map.getPane("mapPane"));
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
  const oldPane = [...map.index.entries()].find(
    ([name]) => name !== "mapPane",
  )[1];
  await vi.waitFor(() => expect(oldPane.parentNode).toBeNull());
  fail = false;
  const lease = manager.acquire(
    "renderer",
    { name: "dots", band: "markers" },
    root.scope,
  );
  expect(map.getPane(lease.name).parentNode).toBe(map.getPane("mapPane"));
  expect(map.getPane(lease.name)).toBe(oldPane);
  await lease.dispose();
  expect(map.getPane(lease.name).parentNode).toBeNull();
});

it("restores creation order across reverse reacquisition, shared panes and external siblings", async () => {
  const { root, map, manager } = await fixture();
  const acquire = name => manager.acquire("editor", { name, band: "modal" }, root.scope);
  const draft = acquire("draft");
  const shared = manager.getPaneName("modal");
  const handles = acquire("handles");
  const container = map.getPane("mapPane");
  const external = map.createPane("external");
  const elements = [draft.name, shared, handles.name].map(name => map.getPane(name));
  expect(container.children.slice(0, 3)).toEqual(elements);
  const duplicate = acquire("draft");
  await draft.dispose();
  expect(container.children.slice(0, 3)).toEqual(elements);
  await duplicate.dispose();
  await handles.dispose();
  const newer = acquire("newer");
  const againHandles = acquire("handles"), againDraft = acquire("draft");
  expect(container.children.filter(pane => pane !== external)).toEqual([...elements, map.getPane(newer.name)]);
  expect(external.parentNode).toBe(container);
  expect(external.remove).toHaveBeenCalledTimes(0);
  await root.close();
  expect(external.parentNode).toBe(container);
  expect(external.remove).toHaveBeenCalledTimes(0);
});

it("cleans failed reattachment and preserves order on retry", async () => {
  const { root, map, manager } = await fixture();
  const acquire = name => manager.acquire("editor", { name, band: "modal" }, root.scope);
  const first = acquire("first"), second = acquire("second");
  await first.dispose();
  const container = map.getPane("mapPane"), insert = container.insertBefore;
  container.insertBefore = () => { throw Error("insert failed"); };
  expect(() => acquire("first")).toThrow("insert failed");
  await vi.waitFor(() => expect(map.getPane(first.name).parentNode).toBeNull());
  container.insertBefore = insert;
  const retry = acquire("first");
  expect(container.children).toEqual([map.getPane(retry.name), map.getPane(second.name)]);
  await root.close();
});

it("recovers creation failure before an element exists without changing its position", async () => {
  const { root, map, manager } = await fixture();
  const create = map.createPane;
  map.createPane = () => { throw Error("before create"); };
  const acquire = name => manager.acquire("editor", { name, band: "modal" }, root.scope);
  expect(() => acquire("draft")).toThrow("before create");
  // Let the asynchronous cleanup obligation finish before retrying acquisition.
  await new Promise(resolve => setTimeout(resolve, 0));
  map.createPane = create;
  const handles = acquire("handles"), draft = acquire("draft");
  expect(map.getPane("mapPane").children).toEqual([map.getPane(draft.name), map.getPane(handles.name)]);
  expect(map.getPane(draft.name).style.zIndex).toBe("660");
  await root.close();
});

it("keeps bands and application instances independent", async () => {
  const a = await fixture(), b = await fixture();
  const draft = a.manager.acquire("editor", { name: "draft", band: "modal" }, a.root.scope);
  const geometry = a.manager.acquire("editor", { name: "geometry", band: "geometry" }, a.root.scope);
  const other = b.manager.acquire("editor", { name: "draft", band: "modal" }, b.root.scope);
  expect(draft.name).not.toBe(other.name);
  expect(a.map.getPane(geometry.name).style.zIndex).toBe("400");
  expect(a.map.getPane(draft.name).style.zIndex).toBe("660");
  await a.root.close();
  expect(b.map.getPane(other.name).parentNode).toBe(b.map.getPane("mapPane"));
  await b.root.close();
});

// These tests verify observable lifecycle and stacking behavior. Removal of
// superseded references from creationOrder is established by source review,
// not by inspecting private state or relying on garbage-collection timing.
it("preserves reuse and stacking through repeated reentrant pane replacement", async () => {
  const { root, map, manager } = await fixture();
  const acquire = name => manager.acquire("editor", { name, band: "modal" }, root.scope);
  let current = acquire("handles");
  const draft = acquire("draft");
  const draftPane = map.getPane(draft.name);
  for (let i = 0; i < 20; i++) {
    const old = current, oldPane = map.getPane(old.name);
    const remove = oldPane.remove.getMockImplementation();
    oldPane.remove.mockImplementation(function () {
      current = acquire("handles");
      remove.call(this);
    });
    await old.dispose();
    expect(current.name).not.toBe(old.name);
    expect(map.getPane(current.name)).not.toBe(oldPane);
    expect(oldPane.parentNode).toBeNull();
    // An old disposed lease must not remove its replacement.
    await old.dispose();
    expect(oldPane.remove).toHaveBeenCalledTimes(1);
    expect(map.getPane("mapPane").children).toEqual([draftPane, map.getPane(current.name)]);
  }
  const name = current.name, element = map.getPane(name);
  await current.dispose();
  expect(element.parentNode).toBeNull();
  current = acquire("handles");
  expect(current.name).toBe(name);
  expect(map.getPane(current.name)).toBe(element);
  await draft.dispose();
  const againDraft = acquire("draft");
  expect(map.getPane("mapPane").children).toEqual([draftPane, element]);
  await root.close();
  expect(map.getPane("mapPane").children).toEqual([]);
});

it("preserves old cleanup retry and stacking after failed-cleanup pane replacement", async () => {
  const { root, map, manager } = await fixture();
  const acquire = name => manager.acquire("editor", { name, band: "modal" }, root.scope);
  const old = acquire("handles"), oldPane = map.getPane(old.name);
  const remove = oldPane.remove.getMockImplementation();
  oldPane.remove.mockImplementation(() => { throw Error("cleanup failed"); });
  await expect(old.dispose()).rejects.toBeDefined();
  const draft = acquire("draft"), replacement = acquire("handles");
  expect(replacement.name).not.toBe(old.name);
  expect(map.getPane(replacement.name)).not.toBe(oldPane);
  expect(oldPane.remove).toHaveBeenCalledTimes(1);
  expect(oldPane.parentNode).toBe(map.getPane("mapPane"));
  oldPane.remove.mockImplementation(remove);
  await old.dispose();
  expect(oldPane.remove).toHaveBeenCalledTimes(2);
  expect(oldPane.parentNode).toBeNull();
  expect(map.getPane(replacement.name).parentNode).toBe(map.getPane("mapPane"));
  expect(map.getPane("mapPane").children).toEqual([map.getPane(draft.name), map.getPane(replacement.name)]);
  await draft.dispose();
  const again = acquire("draft");
  expect(map.getPane("mapPane").children).toEqual([map.getPane(again.name), map.getPane(replacement.name)]);
  await root.close();
  expect(map.getPane("mapPane").children).toEqual([]);
});

it("models DOM node moves without invoking remove or duplicating children", () => {
  const doc = documentFixture();
  const parent = doc.createElement("div"), other = doc.createElement("div");
  const a = doc.createElement("div"), b = doc.createElement("div"), c = doc.createElement("div");
  a.remove = vi.fn(a.remove.bind(a));
  parent.append(a, b, c);
  parent.appendChild(a);
  expect(parent.children).toEqual([b, c, a]);
  parent.insertBefore(a, b);
  expect(parent.children).toEqual([a, b, c]);
  other.insertBefore(a, null);
  expect(parent.children).toEqual([b, c]);
  expect(other.children).toEqual([a]);
  expect(a.parentNode).toBe(other);
  expect(a.remove).not.toHaveBeenCalled();
  a.remove();
  expect(other.children).toEqual([]);
  expect(a.parentNode).toBeNull();
  parent.insertBefore(a, c);
  expect(parent.children).toEqual([b, a, c]);
  expect(a.remove).toHaveBeenCalledOnce();
});
