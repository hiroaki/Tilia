import { describe, it, expect, vi } from "vitest";
import { createApplicationComposition } from "../src/application-composition.js";
import {
  defineDomainKey,
  cloneAndFreezePlainData,
} from "../src/domains/index.js";
import { createScopeController } from "../src/ownership/index.js";
import { createSemanticFoundation } from "../src/semantic-foundation.js";
import { createRenderingCoordinator } from "../src/rendering/coordinator.js";
import { createDomainRendererRegistry } from "../src/rendering/registry.js";
import { createPaneManager } from "../src/map/panes.js";

const tick = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function evented() {
  const listeners = new Map();
  return {
    on: vi.fn((type, callback) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    }),
    off: vi.fn((type, callback) => listeners.get(type)?.delete(callback)),
    fire(type, event = {}) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn({ ...event, type });
    },
    listenerCount: () =>
      [...listeners.values()].reduce((a, b) => a + b.size, 0),
  };
}
function layer() {
  return {
    ...evented(),
    options: {},
    attached: false,
    addTo: vi.fn(function () {
      this.attached = true;
      return this;
    }),
    remove: vi.fn(function () {
      this.attached = false;
    }),
  };
}
async function fixture() {
  const appRoot = createScopeController({ label: "app" });
  await appRoot.commit();
  const map = evented(),
    errors = [];
  let semantic;
  const rendering = createRenderingCoordinator({
    applicationController: appRoot,
    map,
    getSemantics: () => semantic,
    onError: (error) => errors.push(error),
  });
  const controls = { reconcile: null, record: null };
  semantic = await createSemanticFoundation({
    entryRenderingLifecycle: {
      ...rendering.lifecycle,
      afterCreated(record) {
        controls.record = record;
        rendering.lifecycle.afterCreated(record);
      },
    },
    onError: (error) => errors.push(error),
  });
  const key = defineDomainKey({ id: "test-domain" }),
    providerRoot = createScopeController({ label: "provider" });
  semantic.domains
    .createFacade({
      scope: providerRoot.scope,
      stage: (d) => providerRoot.stage(d),
    })
    .provide(key, {
      prepareCreate: ({ value }) => ({
        instance: value,
        snapshot: cloneAndFreezePlainData({ value }),
      }),
      prepareMutation: ({ command }) => ({
        changed: true,
        nextInstance: command,
        nextSnapshot: cloneAndFreezePlainData({ value: command }),
        change: Object.freeze({ kind: "value" }),
      }),
      getSnapshot: (value) => cloneAndFreezePlainData({ value }),
      selection: {
        canonicalize: ({ revision }) => Object.freeze({ revision }),
        equals: (left, right) => left?.revision === right?.revision,
        resolve: ({ instance }) => Object.freeze({ value: instance }),
        reconcile: () => {
          controls.reconcile?.();
          return Object.freeze({ type: "refreshed" });
        },
      },
    });
  await providerRoot.commit();
  const consumer = appRoot.scope.child({ label: "consumer" });
  let nextPlugin = 0;
  async function register(definition) {
    const root = createScopeController({ label: `renderer-${++nextPlugin}` });
    const post = [];
    const handle = rendering.registry
      .createFacade({
        scope: root.scope,
        stage: (d) => root.stage(d),
        enqueuePostCommit: (fn) => post.push(fn),
      })
      .register(key, definition);
    await root.commit();
    post.forEach((fn) => fn());
    await tick();
    return { root, handle };
  }
  const create = () => semantic.entries.create(consumer, key, 1);
  const update = (id, value, revision) =>
    semantic.entries.update(consumer, id, key, value, {
      expectedRevision: revision,
    });
  const capabilities = rendering.createCapabilities({
    scope: consumer,
    stage: () => {},
  });
  return {
    appRoot,
    map,
    semantic,
    key,
    consumer,
    rendering,
    errors,
    register,
    create,
    update,
    capabilities,
    controls,
  };
}
function renderer(layers, extra = {}) {
  return {
    build(input) {
      const object = layer();
      layers.push(object);
      input.resources.own(object, () => {});
      input.map.attachLayer(object);
      return {
        presentation: { anchor: () => ({ lat: 35, lng: 135 }) },
        ...extra(input, object),
      };
    },
  };
}

describe("Phase 4F generation contracts", () => {
  it("keeps headless entries and attaches a later renderer without semantic recreation", async () => {
    const f = await fixture(),
      entry = await f.create();
    await tick();
    expect(f.rendering.applicationApi.getStatus(entry.id).state).toBe(
      "unavailable",
    );
    const layers = [];
    await f.register(renderer(layers, () => ({})));
    expect(f.rendering.applicationApi.getStatus(entry.id)).toMatchObject({
      state: "active",
      currentRevision: 1,
    });
    expect(layers[0].attached).toBe(true);
    expect(f.semantic.entries.list()).toEqual([entry]);
  });
  it("rejects duplicate live and staged registrations using exact domain identity", async () => {
    const registry = createDomainRendererRegistry();
    const root = createScopeController();
    const facade = registry.createFacade({
      scope: root.scope,
      stage: (d) => root.stage(d),
    });
    const key = defineDomainKey({ id: "same" });
    facade.register(key, { build: () => ({}) });
    facade.register(key, { build: () => ({}) });
    await expect(root.commit()).rejects.toMatchObject({
      cause: { code: "RENDERER_DUPLICATE" },
    });
    expect(registry.resolve(key)).toBeNull();
  });
  it("retains visible stale fallback only during preparation and retires it on definitive failure", async () => {
    const f = await fixture(),
      layers = [],
      wait = deferred();
    let input;
    await f.register({
      build(i) {
        if (i.semanticRevision > 1) {
          input = i;
          return wait.promise;
        }
        return renderer(layers, () => ({})).build(i);
      },
    });
    const entry = await f.create();
    await tick();
    const handle = f.capabilities.presentation.resolve(entry.id, {});
    await f.update(entry.id, 2, 1);
    await tick();
    expect(f.rendering.applicationApi.getStatus(entry.id)).toMatchObject({
      state: "building",
      currentToken: null,
      fallbackRevision: 1,
      fallbackDisplayed: true,
    });
    expect(handle.isCurrent()).toBe(false);
    expect(f.capabilities.presentation.resolve(entry.id, {})).toBeNull();
    await expect(input.selection.select({})).rejects.toMatchObject({
      code: "RENDERING_STALE",
    });
    wait.reject(new Error("build failed"));
    await tick();
    expect(layers[0].attached).toBe(false);
    expect(f.rendering.applicationApi.getStatus(entry.id).state).toBe("failed");
    expect(f.semantic.entries.getDomainView(entry.id, f.key).revision).toBe(2);
    await f.semantic.entries.setVisible(f.consumer, entry.id, false);
    await f.semantic.entries.setVisible(f.consumer, entry.id, true);
    expect(layers[0].attached).toBe(false);
  });
  it("publishes replacement with latest committed visibility and no stale resurrection", async () => {
    const f = await fixture(),
      layers = [],
      wait = deferred();
    let second;
    await f.register({
      build(i) {
        if (i.semanticRevision > 1) {
          second = i;
          return wait.promise;
        }
        return renderer(layers, () => ({})).build(i);
      },
    });
    const e = await f.create();
    await tick();
    await f.update(e.id, 2, 1);
    await tick();
    await f.semantic.entries.setVisible(f.consumer, e.id, false);
    const descriptor = renderer(layers, () => ({})).build(second);
    wait.resolve(descriptor);
    await tick();
    expect(layers.every((l) => !l.attached)).toBe(true);
    expect(f.rendering.applicationApi.getStatus(e.id)).toMatchObject({
      state: "active",
      currentRevision: 2,
      visible: false,
    });
    await f.semantic.entries.setVisible(f.consumer, e.id, true);
    expect(layers[1].attached).toBe(true);
    expect(layers[0].attached).toBe(false);
  });
  it("contains partial publication and executes all removal obligations", async () => {
    const f = await fixture(),
      a = layer(),
      b = layer();
    b.addTo = () => {
      b.attached = true;
      throw Error("partial");
    };
    await f.register({
      build(i) {
        for (const l of [a, b]) {
          i.resources.own(l, () => {});
          i.map.attachLayer(l);
        }
        return {};
      },
    });
    const e = await f.create();
    await tick();
    expect(f.rendering.applicationApi.getStatus(e.id).state).toBe("failed");
    expect(a.attached).toBe(false);
    expect(b.attached).toBe(false);
    expect(f.semantic.entries.get(e.id)).not.toBeNull();
  });
  it("does not let superseded rejection overwrite a newer generation", async () => {
    const f = await fixture(),
      wait = deferred(),
      layers = [];
    await f.register({
      build(i) {
        return i.semanticRevision === 2
          ? wait.promise
          : renderer(layers, () => ({})).build(i);
      },
    });
    const e = await f.create();
    await tick();
    await f.update(e.id, 2, 1);
    await tick();
    await f.update(e.id, 3, 2);
    await tick();
    const before = f.rendering.applicationApi.getStatus(e.id);
    wait.reject(Error("old"));
    await tick();
    expect(f.rendering.applicationApi.getStatus(e.id)).toMatchObject({
      state: "active",
      currentToken: before.currentToken,
      currentRevision: 3,
      lastFailure: null,
    });
  });
  it("performs safe property update without replacing token and permanently invalidates old handles", async () => {
    const f = await fixture(),
      layers = [];
    let input, updateInput;
    const definition = renderer(layers, (i, l) => {
      input = i;
      return {
        prepareUpdate(u) {
          updateInput = u;
          return {
            mode: "rollbackable",
            nextPresentation: {
              anchor: () => ({ lat: u.snapshot.value, lng: 1 }),
            },
            preflight() {},
            commit() {
              l.value = u.snapshot.value;
            },
            rollback() {
              l.value = 1;
            },
          };
        },
      };
    });
    definition.planChange = () => "update";
    await f.register(definition);
    const e = await f.create();
    await tick();
    const before = f.rendering.applicationApi.getStatus(e.id),
      old = f.capabilities.presentation.resolve(e.id, {});
    await f.update(e.id, 2, 1);
    await tick();
    expect(f.rendering.applicationApi.getStatus(e.id)).toMatchObject({
      state: "active",
      currentToken: before.currentToken,
      currentRevision: 2,
    });
    expect(old.isCurrent()).toBe(false);
    expect(f.capabilities.presentation.resolve(e.id, {}).anchor.lat).toBe(2);
    expect(Object.keys(updateInput).sort()).toEqual([
      "change",
      "entryId",
      "previousRevision",
      "revision",
      "snapshot",
      "token",
      "visible",
    ]);
    expect(layers).toHaveLength(1);
    expect(layers[0].value).toBe(2);
    expect(() => input.resources.stageEffect({})).toThrowError(
      expect.objectContaining({ code: "RENDER_PUBLICATION_SEALED" }),
    );
  });
  it.each([
    "own",
    "acquire",
    "effect",
    "surface",
    "binding",
    "scope",
    "task",
    "pane",
  ])(
    "forces replacement for caught retained %s registration during update",
    async (operation) => {
      const f = await fixture(),
        layers = [];
      let surface;
      const def = renderer(layers, (i, l) => {
        surface = i.interactions.createSurface({ id: "object", target: l });
        return {
          prepareUpdate() {
            try {
              ({
                own: () => i.resources.own({}, () => {}),
                acquire: () =>
                  i.resources.acquire(
                    () => ({}),
                    () => {},
                  ),
                effect: () => i.resources.stageEffect({}),
                surface: () =>
                  i.interactions.createSurface({ id: "new", target: l }),
                binding: () => i.interactions.bind({}),
                scope: () => i.scope.child(),
                task: () => i.scope.track(Promise.resolve()),
                pane: () => i.map.getPaneName("geometry"),
              })[operation]();
            } catch {}
            return {
              mode: "nonthrowing",
              nextPresentation: undefined,
              preflight() {},
              commit() {},
              rollback() {},
            };
          },
        };
      });
      def.planChange = () => "update";
      await f.register(def);
      const e = await f.create();
      await tick();
      const before = f.rendering.applicationApi.getStatus(e.id).currentToken;
      await f.update(e.id, 2, 1);
      await tick();
      expect(f.rendering.applicationApi.getStatus(e.id)).toMatchObject({
        state: "active",
        currentRevision: 2,
      });
      expect(f.rendering.applicationApi.getStatus(e.id).currentToken).not.toBe(
        before,
      );
      expect(layers).toHaveLength(2);
    },
  );
  it("keeps installed binding records and supplies latest semantic input after same-token update", async () => {
    const f = await fixture(),
      layers = [],
      seen = [];
    const def = renderer(layers, (i, l) => {
      const surface = i.interactions.createSurface({ id: "point", target: l });
      i.interactions.bind({
        id: "pick",
        surface,
        event: "click",
        resolve(event, current) {
          seen.push(current.semanticRevision);
          return {};
        },
      });
      return {
        prepareUpdate() {
          return {
            mode: "nonthrowing",
            nextPresentation: undefined,
            preflight() {},
            commit() {},
            rollback() {},
          };
        },
      };
    });
    def.planChange = () => "update";
    await f.register(def);
    const e = await f.create();
    await tick();
    layers[0].fire("click");
    await tick();
    await f.update(e.id, 2, 1);
    await tick();
    layers[0].fire("click");
    await tick();
    expect(seen).toEqual([1, 2]);
    expect(layers[0].on).toHaveBeenCalledTimes(1);
  });
  it.each(["planning", "preparation", "preflight", "commit", "rollback"])(
    "contains %s failure by replacement without semantic rollback",
    async (phase) => {
      const f = await fixture(),
        layers = [],
        rollback = vi.fn();
      const def = renderer(layers, () => ({
        prepareUpdate() {
          if (phase === "preparation") throw Error(phase);
          return {
            mode: "rollbackable",
            nextPresentation: undefined,
            preflight() {
              if (phase === "preflight") throw Error(phase);
            },
            commit() {
              if (["commit", "rollback"].includes(phase)) throw Error("commit");
            },
            rollback() {
              rollback();
              if (phase === "rollback") throw Error("rollback");
            },
          };
        },
      }));
      def.planChange = () => {
        if (phase === "planning") throw Error(phase);
        return "update";
      };
      await f.register(def);
      const e = await f.create();
      await tick();
      const token = f.rendering.applicationApi.getStatus(e.id).currentToken;
      await f.update(e.id, 2, 1);
      await tick();
      expect(f.rendering.applicationApi.getStatus(e.id)).toMatchObject({
        state: "active",
        currentRevision: 2,
      });
      expect(f.rendering.applicationApi.getStatus(e.id).currentToken).not.toBe(
        token,
      );
      expect(f.semantic.entries.getDomainView(e.id, f.key).revision).toBe(2);
      if (["commit", "rollback"].includes(phase))
        expect(rollback).toHaveBeenCalledOnce();
    },
  );
  it("hide invalidates old exposure permanently and show creates new authority", async () => {
    const f = await fixture(),
      layers = [];
    await f.register(renderer(layers, () => ({})));
    const e = await f.create();
    await tick();
    const old = f.capabilities.presentation.resolve(e.id, {}),
      token = old.token;
    await f.semantic.entries.setVisible(f.consumer, e.id, false);
    expect(old.isCurrent()).toBe(false);
    expect(layers[0].attached).toBe(false);
    await f.semantic.entries.setVisible(f.consumer, e.id, true);
    expect(f.capabilities.presentation.resolve(e.id, {}).token).toBe(token);
    expect(old.isCurrent()).toBe(false);
  });
  it("failed detach revokes all roles and visibility alone cannot recover them", async () => {
    const f = await fixture(),
      layers = [];
    await f.register(renderer(layers, () => ({})));
    const e = await f.create();
    await tick();
    layers[0].remove.mockImplementation(() => {
      throw Error("remove");
    });
    await f.semantic.entries.setVisible(f.consumer, e.id, false);
    expect(f.rendering.applicationApi.getStatus(e.id).state).toBe("failed");
    expect(f.semantic.entries.get(e.id).visible).toBe(false);
    await f.semantic.entries.setVisible(f.consumer, e.id, true);
    expect(f.rendering.applicationApi.getStatus(e.id).currentToken).toBeNull();
    layers[0].remove.mockImplementation(function () {
      this.attached = false;
    });
    await tick();
    await f.rendering.retryCleanup();
  });
  it("cleans detached late acquisitions after renderer withdrawal without affecting reinstall", async () => {
    const f = await fixture(),
      wait = deferred(),
      disposed = vi.fn();
    const first = await f.register({
      async build(i) {
        await i.resources.acquire(() => wait.promise, disposed);
        return {};
      },
    });
    const e = await f.create();
    await tick();
    await first.handle.dispose();
    await tick();
    const layers = [];
    await f.register(renderer(layers, () => ({})));
    const token = f.rendering.applicationApi.getStatus(e.id).currentToken;
    wait.resolve({});
    await tick();
    expect(disposed).toHaveBeenCalledOnce();
    expect(f.rendering.applicationApi.getStatus(e.id).currentToken).toBe(token);
  });
  it("retains safe late disposal failure for explicit cleanup retry", async () => {
    const f = await fixture(),
      wait = deferred();
    let fail = true;
    const disposed = vi.fn(() => {
      if (fail) throw Error("late disposal");
    });
    const first = await f.register({
      async build(i) {
        await i.resources.acquire(() => wait.promise, disposed, {
          retry: "safe",
        });
        return {};
      },
    });
    const e = await f.create();
    await tick();
    await first.handle.dispose();
    wait.resolve({});
    await tick();
    expect(f.rendering.inspect().residuals).toHaveLength(1);
    fail = false;
    await f.rendering.retryCleanup();
    expect(f.rendering.inspect().residuals).toHaveLength(0);
    expect(disposed).toHaveBeenCalledTimes(2);
  });
  it("awaitable acquisition keeps renderer teardown pending until settlement", async () => {
    const f = await fixture(),
      wait = deferred(),
      disposed = vi.fn();
    const first = await f.register({
      async build(i) {
        await i.resources.acquire(() => wait.promise, disposed, {
          settlement: "await",
        });
        return {};
      },
    });
    await f.create();
    await tick();
    let done = false;
    const close = first.handle.dispose().then(() => {
      done = true;
    });
    await tick();
    expect(done).toBe(false);
    wait.resolve({});
    await close;
    expect(disposed).toHaveBeenCalledOnce();
  });
  it("deletion closes rendering before provider instance disposal", async () => {
    const f = await fixture(),
      order = [];
    await f.register({
      build(i) {
        i.resources.own({}, () => order.push("render"));
        return {};
      },
    });
    const e = await f.create();
    await tick();
    await f.semantic.entries.remove(f.consumer, e.id);
    expect(order).toEqual(["render"]);
    expect(f.rendering.applicationApi.getStatus(e.id)).toBeNull();
  });
  it("root termination synchronously invalidates queries and pending publication while keeping semantics", async () => {
    const f = await fixture(),
      wait = deferred();
    await f.register({ build: () => wait.promise });
    const e = await f.create();
    await tick();
    const closing = f.rendering.close();
    expect(() => f.rendering.applicationApi.getStatus(e.id)).toThrowError(
      expect.objectContaining({ code: "RENDERING_TERMINATED" }),
    );
    await closing;
    wait.resolve({});
    await tick();
    expect(f.semantic.entries.get(e.id)).not.toBeNull();
  });
  it("controlled highlights belong to presenter scopes and close when exposure expires", async () => {
    const f = await fixture(),
      layers = [],
      highlight = layer();
    await f.register(
      renderer(layers, () => ({
        presentation: {
          anchor: () => ({ lat: 1, lng: 2 }),
          highlight(ref, ctx) {
            ctx.map.attachLayer(highlight);
          },
        },
      })),
    );
    const e = await f.create();
    await tick();
    const handle = f.capabilities.presentation.resolve(e.id, {});
    await handle.highlight({ scope: f.consumer });
    expect(highlight.attached).toBe(true);
    await f.semantic.entries.setVisible(f.consumer, e.id, false);
    await tick();
    expect(highlight.attached).toBe(false);
    expect(handle.isCurrent()).toBe(false);
  });
  it("uses namespaced shared bands and balanced private pane leases", async () => {
    const root = createScopeController();
    await root.commit();
    const created = new Map();
    const map = {
      getPane: (n) =>
        n === "mapPane"
          ? {
              appendChild(pane) {
                pane.attached = true;
              },
            }
          : created.get(n),
      createPane: (n) => {
        const pane = {
          style: {},
          attached: true,
          remove: vi.fn(function () {
            this.attached = false;
          }),
        };
        created.set(n, pane);
        return pane;
      },
    };
    const manager = createPaneManager({ map, scope: root.scope }),
      other = createPaneManager({ map, scope: root.scope });
    expect(manager.getPaneName("selection")).not.toBe(
      other.getPaneName("selection"),
    );
    const a = manager.acquire(
        "renderer",
        { name: "dots", band: "markers" },
        root.scope,
      ),
      b = manager.acquire(
        "renderer",
        { name: "dots", band: "markers" },
        root.scope,
      );
    expect(a.name).toBe(b.name);
    expect(created.get(a.name).style.zIndex).toBe("600");
    await a.dispose();
    expect(created.has(b.name)).toBe(true);
    await b.dispose();
    expect(created.get(b.name).attached).toBe(false);
  });
  it("exposes capabilities through the normal app runtime and awaits generation cleanup before plugin cleanup", async () => {
    const { app } = createApplicationComposition({
      map: { on() {}, off() {} },
      plugins: ["tilia-gpx-domain"],
    });
    await app.ready;
    const order = [];
    const key = (await import("../src/domains/keys.js")).gpxDomainKey;
    const plugin = {
      id: "test-renderer",
      setup(ctx) {
        expect(ctx).toHaveProperty("interactions");
        ctx.renderers.register(key, {
          build(i) {
            i.resources.own({}, () => order.push("generation"));
            return {};
          },
        });
        return () => order.push("plugin");
      },
    };
    await app.use(plugin);
    const e = await app.domains.gpx.create({
      tracks: [],
      routes: [],
      waypoints: [],
    });
    await tick();
    await app.unuse(plugin.id);
    expect(order).toEqual(["generation", "plugin"]);
    expect(app.entries.get(e.id)).not.toBeNull();
  });
});

it("rejects old queued semantic intent after same-token revision advancement and accepts fresh intent", async () => {
  const f = await fixture(),
    layers = [];
  let input, queued;
  const def = renderer(layers, (i) => {
    input = i;
    return {
      prepareUpdate() {
        return {
          mode: "nonthrowing",
          nextPresentation: undefined,
          preflight() {},
          commit() {},
          rollback() {},
        };
      },
    };
  });
  def.planChange = () => "update";
  await f.register(def);
  const e = await f.create();
  await tick();
  await input.selection.select({});
  const token = f.rendering.applicationApi.getStatus(e.id).currentToken;
  f.controls.reconcile = () => {
    queued = input.selection.select({});
    queued.catch(() => {});
  };
  await f.update(e.id, 2, 1);
  await tick();
  await expect(queued).rejects.toBeDefined();
  expect(f.rendering.applicationApi.getStatus(e.id).currentToken).toBe(token);
  f.controls.reconcile = null;
  await expect(input.selection.select({})).resolves.toMatchObject({
    entryId: e.id,
  });
});
it("validates none advancement with unchanged token and no resource setter", async () => {
  const f = await fixture(),
    layers = [],
    commit = vi.fn();
  const def = renderer(layers, () => ({
    prepareUpdate() {
      return {
        mode: "nonthrowing",
        nextPresentation: undefined,
        preflight() {},
        commit,
        rollback() {},
      };
    },
  }));
  def.planChange = () => "none";
  await f.register(def);
  const e = await f.create();
  await tick();
  const token = f.rendering.applicationApi.getStatus(e.id).currentToken;
  await f.update(e.id, 2, 1);
  await tick();
  expect(f.rendering.applicationApi.getStatus(e.id)).toMatchObject({
    currentToken: token,
    currentRevision: 2,
  });
  expect(layers).toHaveLength(1);
  expect(commit).toHaveBeenCalledOnce();
});
it.each(["acquisition", "preflight", "publication"])(
  "retires stale fallback on current %s failure while retaining reconciled selection",
  async (phase) => {
    const f = await fixture(),
      layers = [];
    let input;
    await f.register({
      async build(i) {
        if (i.semanticRevision === 1) {
          input = i;
          return renderer(layers, () => ({})).build(i);
        }
        if (phase === "acquisition")
          await i.resources.acquire(
            () => Promise.reject(Error("acquisition")),
            () => {},
          );
        i.resources.stageEffect({
          label: "fail",
          preflight() {
            if (phase === "preflight") throw Error(phase);
          },
          mount() {
            throw Error("publication");
          },
          withdraw() {},
          dispose() {},
        });
        return {};
      },
    });
    const e = await f.create();
    await tick();
    await input.selection.select({});
    await f.update(e.id, 2, 1);
    await tick();
    expect(f.rendering.applicationApi.getStatus(e.id).state).toBe("failed");
    expect(layers[0].attached).toBe(false);
    expect(
      f.semantic.selection.createFacade(f.consumer).getCurrent(),
    ).toMatchObject({ entryId: e.id });
  },
);
it("same-revision failed retry retains a healthy current generation", async () => {
  const f = await fixture(),
    layers = [];
  let fail = false;
  await f.register({
    build(i) {
      if (fail) throw Error("retry");
      return renderer(layers, () => ({})).build(i);
    },
  });
  const e = await f.create();
  await tick();
  const token = f.rendering.applicationApi.getStatus(e.id).currentToken;
  fail = true;
  f.rendering.applicationApi.retry(e.id);
  await tick();
  expect(f.rendering.applicationApi.getStatus(e.id)).toMatchObject({
    state: "active",
    currentToken: token,
    currentRevision: 1,
  });
  expect(layers[0].attached).toBe(true);
});
it.each(["planning", "preparation", "preflight", "commit", "rollback"])(
  "withdrawal during update %s never restores display or authority",
  async (phase) => {
    const f = await fixture(),
      layers = [],
      rollbacks = [];
    let registration;
    const withdraw = () => {
      void registration.handle.dispose().catch(() => {});
    };
    const def = renderer(layers, () => ({
      prepareUpdate() {
        if (phase === "preparation") withdraw();
        return {
          mode: "rollbackable",
          nextPresentation: undefined,
          preflight() {
            if (phase === "preflight") withdraw();
          },
          commit() {
            if (phase === "commit") withdraw();
            if (phase === "rollback") throw Error("commit");
          },
          rollback(options) {
            rollbacks.push(options.restoreDisplay);
            if (phase === "rollback") withdraw();
          },
        };
      },
    }));
    def.planChange = () => {
      if (phase === "planning") withdraw();
      return "update";
    };
    registration = await f.register(def);
    const e = await f.create();
    await tick();
    const old = f.capabilities.presentation.resolve(e.id, {});
    await f.update(e.id, 2, 1);
    await tick();
    expect(f.rendering.applicationApi.getStatus(e.id)).toMatchObject({
      state: "unavailable",
      currentToken: null,
      fallbackToken: null,
      pendingToken: null,
    });
    expect(old.isCurrent()).toBe(false);
    expect(layers[0].attached).toBe(false);
    if (["preparation", "preflight", "commit"].includes(phase))
      expect(rollbacks).toContain(false);
  },
);
it("withdrawal during mounting cleans a partial attachment without publication", async () => {
  const f = await fixture(),
    l = layer();
  let registration;
  const original = l.addTo;
  l.addTo = function (map) {
    original.call(this, map);
    void registration.handle.dispose().catch(() => {});
  };
  registration = await f.register({
    build(i) {
      i.resources.own(l, () => {});
      i.map.attachLayer(l);
      return {};
    },
  });
  const e = await f.create();
  await tick();
  expect(f.rendering.applicationApi.getStatus(e.id)).toMatchObject({
    state: "unavailable",
    currentToken: null,
  });
  expect(l.attached).toBe(false);
});
it("reentrant status retry cannot let an older attempt invalidate its replacement", async () => {
  const f = await fixture(),
    layers = [];
  await f.register(renderer(layers, () => ({})));
  let retried = false;
  f.rendering.applicationApi.subscribe(
    (status) => {
      if (!Array.isArray(status) && status.state === "building" && !retried) {
        retried = true;
        f.rendering.applicationApi.retry(status.entryId);
      }
    },
    { emitCurrent: false },
  );
  const e = await f.create();
  await tick();
  expect(f.rendering.applicationApi.getStatus(e.id)).toMatchObject({
    state: "active",
    currentToken: "2",
  });
  expect(layers).toHaveLength(1);
});
it("runtime quarantines known generation cleanup failure and blocks same-ID reinstall", async () => {
  const { app } = createApplicationComposition({
    map: { on() {}, off() {} },
    plugins: ["tilia-gpx-domain"],
  });
  await app.ready;
  const { gpxDomainKey } = await import("../src/domains/keys.js");
  const plugin = {
    id: "broken-renderer",
    setup(ctx) {
      ctx.renderers.register(gpxDomainKey, {
        build(i) {
          i.resources.own({}, () => {
            throw Error("cleanup");
          });
          return {};
        },
      });
    },
  };
  await app.use(plugin);
  await app.domains.gpx.create({ tracks: [], routes: [], waypoints: [] });
  await tick();
  await expect(app.unuse(plugin.id)).rejects.toBeDefined();
  await expect(app.use(plugin)).rejects.toMatchObject({
    code: "PLUGIN_QUARANTINED",
  });
});

it("awaitable disposal failure participates in teardown and is never automatically retried", async () => {
  const f = await fixture(),
    wait = deferred(),
    dispose = vi.fn(() => {
      throw Error("awaited cleanup");
    });
  const registration = await f.register({
    async build(i) {
      await i.resources.acquire(() => wait.promise, dispose, {
        settlement: "await",
      });
      return {};
    },
  });
  await f.create();
  await tick();
  const closing = registration.handle.dispose();
  closing.catch(() => {});
  wait.resolve({});
  await expect(closing).rejects.toBeDefined();
  expect(dispose).toHaveBeenCalledOnce();
  expect(f.rendering.inspect().residuals).toHaveLength(0);
});
it("rejects new registration after rendering subsystem termination", async () => {
  const f = await fixture();
  await f.rendering.close();
  await expect(f.register({ build: () => ({}) })).rejects.toMatchObject({
    code: "RENDERING_TERMINATED",
  });
});
it("rollback failure runs once even when commit loses authority", async () => {
  const f = await fixture(),
    layers = [],
    rollback = vi.fn(() => {
      throw Error("rollback");
    });
  let registration;
  const def = renderer(layers, () => ({
    prepareUpdate() {
      return {
        mode: "rollbackable",
        nextPresentation: undefined,
        preflight() {},
        commit() {
          void registration.handle.dispose().catch(() => {});
        },
        rollback,
      };
    },
  }));
  def.planChange = () => "update";
  registration = await f.register(def);
  const e = await f.create();
  await tick();
  await f.update(e.id, 2, 1);
  await tick();
  expect(rollback).toHaveBeenCalledOnce();
  expect(layers[0].attached).toBe(false);
});

it("suppresses mounting-generated events at all managed tiers rather than treating them as user intent", async () => {
  const f = await fixture(),
    l = layer(),
    background = vi.fn();
  f.capabilities.interactions.bind({
    id: "background",
    surface: f.capabilities.interactions.mapSurface(),
    event: "click",
    tier: "background",
    handle: () => ({ consume: true, run: background }),
  });
  l.addTo.mockImplementation(function () {
    this.attached = true;
    const carrier = {};
    this.fire("click", { originalEvent: carrier });
    f.map.fire("click", { originalEvent: carrier });
  });
  await f.register({
    build(i) {
      i.resources.own(l, () => {});
      i.map.attachLayer(l);
      const surface = i.interactions.createSurface({ id: "object", target: l });
      i.interactions.bind({
        id: "select",
        surface,
        event: "click",
        resolve: () => ({}),
      });
      return {};
    },
  });
  const e = await f.create();
  await tick();
  expect(f.rendering.applicationApi.getStatus(e.id).state).toBe("active");
  expect(background).not.toHaveBeenCalled();
  expect(f.semantic.selection.createFacade(f.consumer).getCurrent()).toBeNull();
});
it("registers a generation private pane once and rejects foreign attachments and surfaces", async () => {
  const f = await fixture(),
    l = layer();
  let input;
  await f.register({
    build(i) {
      input = i;
      expect(() => i.map.attachLayer(layer())).toThrow("owned");
      expect(() =>
        i.interactions.createSurface({ id: "foreign", target: layer() }),
      ).toThrow("owned");
      i.resources.own(l, () => {});
      const pane = i.map.createPane({ name: "private", band: "markers" });
      i.map.attachLayer(l, { pane });
      return {};
    },
  });
  const e = await f.create();
  await tick();
  expect(f.rendering.applicationApi.getStatus(e.id).state).toBe("active");
  expect(l.options.pane).toContain("private");
  expect(() =>
    input.map.createPane({ name: "new", band: "markers" }),
  ).toThrowError(
    expect.objectContaining({ code: "RENDER_PUBLICATION_SEALED" }),
  );
});
it("isolates rendering observer failure and revokes old presentation before semantic notification", async () => {
  const f = await fixture(),
    layers = [];
  await f.register(renderer(layers, () => ({})));
  const e = await f.create();
  await tick();
  const old = f.capabilities.presentation.resolve(e.id, {});
  const observations = [];
  f.rendering.applicationApi.subscribe(
    () => {
      throw Error("observer");
    },
    { emitCurrent: false },
  );
  f.semantic.entries.subscribe(
    f.consumer,
    (event) => {
      if (event.type === "domain-changed") observations.push(old.isCurrent());
    },
    { emitCurrent: false },
  );
  await f.update(e.id, 2, 1);
  await tick();
  expect(observations).toEqual([false]);
  expect(f.rendering.applicationApi.getStatus(e.id)).toMatchObject({
    state: "active",
    currentRevision: 2,
  });
});
it("deletion during pending build prevents stale completion and disposes every owned resource", async () => {
  const f = await fixture(),
    wait = deferred(),
    disposed = vi.fn();
  await f.register({
    build(i) {
      i.resources.own({}, disposed);
      return wait.promise;
    },
  });
  const e = await f.create();
  await tick();
  await f.semantic.entries.remove(f.consumer, e.id);
  wait.resolve({});
  await tick();
  expect(disposed).toHaveBeenCalledOnce();
  expect(f.rendering.applicationApi.getStatus(e.id)).toBeNull();
});
it.each(
  ["planning", "preparation", "preflight", "commit", "rollback"].flatMap(
    (phase) =>
      ["supersession", "deletion", "termination"].map((action) => [
        phase,
        action,
      ]),
  ),
)(
  "%s reentrancy through committed %s cannot advance or restore invalidated authority",
  async (phase, action) => {
    const f = await fixture(),
      layers = [],
      rollbacks = [];
    let triggered = false;
    const trigger = () => {
      if (triggered) return;
      triggered = true;
      if (action === "termination") {
        void f.rendering.close().catch(() => {});
        return;
      }
      const record = f.controls.record;
      if (action === "deletion") {
        record.state = "removing";
        f.rendering.lifecycle.afterLogicalRemoval(record);
        return;
      }
      // Inject the private postcommit collaboration at an external hook boundary,
      // preserving the same ordering as EntryStore's synchronous commit hooks.
      record.revision = 3;
      record.instance = 3;
      record.domainSnapshot = Object.freeze({ value: 3 });
      f.rendering.lifecycle.afterDomainCommit(
        record,
        Object.freeze({ kind: "value" }),
      );
    };
    const def = renderer(layers, () => ({
      prepareUpdate() {
        if (phase === "preparation") trigger();
        return {
          mode: "rollbackable",
          nextPresentation: undefined,
          preflight() {
            if (phase === "preflight") trigger();
          },
          commit() {
            if (phase === "commit") trigger();
            if (phase === "rollback") throw Error("commit");
          },
          rollback(options) {
            rollbacks.push(options.restoreDisplay);
            if (phase === "rollback") trigger();
          },
        };
      },
    }));
    def.planChange = () => {
      if (phase === "planning") trigger();
      return "update";
    };
    await f.register(def);
    const e = await f.create();
    await tick();
    const old = f.capabilities.presentation.resolve(e.id, {});
    await f.update(e.id, 2, 1);
    await tick();
    expect(old.isCurrent()).toBe(false);
    expect(layers[0].attached).toBe(false);
    if (action === "supersession")
      expect(f.rendering.applicationApi.getStatus(e.id)).toMatchObject({
        state: "active",
        currentRevision: 3,
        currentToken: "2",
      });
    if (action === "deletion")
      expect(f.rendering.applicationApi.getStatus(e.id)).toBeNull();
    if (action === "termination")
      expect(() => f.rendering.applicationApi.getStatus(e.id)).toThrowError(
        expect.objectContaining({ code: "RENDERING_TERMINATED" }),
      );
    if (["preparation", "preflight", "commit"].includes(phase))
      expect(rollbacks).toContain(false);
  },
);
it("keeps failed highlight cleanup within presenter ownership without changing primary rendering", async () => {
  const f = await fixture(),
    layers = [],
    highlight = layer();
  highlight.addTo.mockImplementation(function () {
    this.attached = true;
    throw Error("partial highlight");
  });
  await f.register(
    renderer(layers, () => ({
      presentation: {
        highlight(ref, ctx) {
          ctx.map.attachLayer(highlight);
        },
      },
    })),
  );
  const e = await f.create();
  await tick();
  await expect(
    f.capabilities.presentation
      .resolve(e.id, {})
      .highlight({ scope: f.consumer }),
  ).rejects.toThrow("partial");
  await tick();
  expect(highlight.attached).toBe(false);
  expect(f.rendering.applicationApi.getStatus(e.id).state).toBe("active");
});

it("continues effect resource disposal after withdrawal fails and retries only unfinished cleanup", async () => {
  const f = await fixture(),
    dispose = vi.fn(),
    withdraw = vi.fn(() => {
      throw Error("withdraw");
    });
  const registration = await f.register({
    build(i) {
      i.resources.stageEffect({
        label: "partial",
        preflight() {},
        mount() {},
        withdraw,
        dispose,
        retry: "safe",
      });
      return {};
    },
  });
  await f.create();
  await tick();
  await expect(registration.handle.dispose()).rejects.toBeDefined();
  expect(dispose).toHaveBeenCalledOnce();
  withdraw.mockImplementation(() => {});
  await f.rendering.retryCleanup();
  expect(dispose).toHaveBeenCalledOnce();
});
it("treats renderer-closed candidate scope as definitive failure instead of leaving building forever", async () => {
  const f = await fixture();
  await f.register({
    build(i) {
      void i.scope.dispose().catch(() => {});
      return {};
    },
  });
  const e = await f.create();
  await tick();
  expect(f.rendering.applicationApi.getStatus(e.id)).toMatchObject({
    state: "failed",
    pendingToken: null,
    currentToken: null,
  });
});

it("suppresses generation selection subscriptions during fallback and observes active map listener rejections", async () => {
  const f = await fixture(),
    layers = [],
    wait = deferred(),
    listener = vi.fn();
  let input;
  await f.register({
    build(i) {
      if (i.semanticRevision > 1) return wait.promise;
      input = i;
      i.selection.subscribe(listener);
      i.map.listen("click", () => Promise.reject(Error("map-listener")));
      return renderer(layers, () => ({})).build(i);
    },
  });
  const e = await f.create();
  await tick();
  await input.selection.select({});
  expect(listener).toHaveBeenCalledOnce();
  f.map.fire("click");
  await tick();
  expect(f.errors.some((e) => e.message === "map-listener")).toBe(true);
  await f.update(e.id, 2, 1);
  await tick();
  expect(listener).toHaveBeenCalledOnce();
  wait.reject(Error("done"));
  await tick();
});

it.each(["retry", "deletion", "withdrawal", "termination"])(
  "revalidates activation when old controlled highlight removal triggers %s",
  async (action) => {
    const f = await fixture(),
      layers = [],
      highlight = layer();
    let input,
      triggered = false,
      retryToken;
    const registration = await f.register(
      renderer(layers, (i) => {
        input = i;
        const object = layers.at(-1);
        const surface = i.interactions.createSurface({
          id: "object",
          target: object,
        });
        i.interactions.bind({
          id: "pick",
          surface,
          event: "click",
          resolve: () => ({}),
        });
        return {
          presentation: {
            anchor: () => ({ lat: 1, lng: 2 }),
            highlight(ref, context) {
              context.map.attachLayer(highlight);
            },
          },
        };
      }),
    );
    const entry = await f.create();
    await tick();
    const oldHandle = f.capabilities.presentation.resolve(entry.id, {});
    await oldHandle.highlight({ scope: f.consumer });
    highlight.remove.mockImplementation(function () {
      this.attached = false;
      if (triggered) return;
      triggered = true;
      if (action === "retry")
        retryToken = f.rendering.applicationApi.retry(entry.id).pendingToken;
      if (action === "deletion") {
        f.controls.record.state = "removing";
        f.rendering.lifecycle.afterLogicalRemoval(f.controls.record);
      }
      if (action === "withdrawal")
        void registration.handle.dispose().catch(() => {});
      if (action === "termination") void f.rendering.close().catch(() => {});
    });
    f.rendering.applicationApi.retry(entry.id);
    await tick();
    expect(triggered).toBe(true);
    expect(oldHandle.isCurrent()).toBe(false);
    expect(highlight.attached).toBe(false);
    expect(layers[0].attached).toBe(false);
    expect(layers[1].attached).toBe(false);
    if (action === "retry") {
      expect(retryToken).toBe("3");
      expect(f.rendering.applicationApi.getStatus(entry.id)).toMatchObject({
        state: "active",
        currentToken: retryToken,
        pendingToken: null,
        fallbackToken: null,
      });
      expect(layers.map((object) => object.attached)).toEqual([
        false,
        false,
        true,
      ]);
      const freshHandle = f.capabilities.presentation.resolve(entry.id, {});
      expect(freshHandle.token).toBe(retryToken);
      expect(freshHandle.isCurrent()).toBe(true);
      layers[1].fire("click");
      await tick();
      expect(
        f.semantic.selection.createFacade(f.consumer).getCurrent(),
      ).toBeNull();
      layers[2].fire("click");
      await tick();
      expect(
        f.semantic.selection.createFacade(f.consumer).getCurrent(),
      ).toMatchObject({ entryId: entry.id });
      await expect(input.selection.select({})).resolves.toMatchObject({
        entryId: entry.id,
      });
    } else {
      expect(layers.every((object) => !object.attached)).toBe(true);
      if (action === "termination")
        expect(() =>
          f.rendering.applicationApi.getStatus(entry.id),
        ).toThrowError(
          expect.objectContaining({ code: "RENDERING_TERMINATED" }),
        );
      else {
        expect(f.capabilities.presentation.resolve(entry.id, {})).toBeNull();
        expect(f.rendering.applicationApi.getStatus(entry.id)).toEqual(
          action === "deletion"
            ? null
            : expect.objectContaining({
                state: "unavailable",
                currentToken: null,
                pendingToken: null,
              }),
        );
      }
      for (const object of layers) object.fire("click");
      await tick();
      expect(
        f.semantic.selection.createFacade(f.consumer).getCurrent(),
      ).toBeNull();
    }
  },
);

it("retries failed rendering with the same private pane identity on a Leaflet-like persistent index", async () => {
  const f = await fixture(),
    panes = new Map(),
    layers = [];
  let fail = true;
  f.map.getPane = (name) =>
    name === "mapPane"
      ? {
          appendChild(pane) {
            pane.attached = true;
          },
        }
      : panes.get(name);
  f.map.createPane = (name) => {
    const pane = {
      style: {},
      attached: true,
      remove() {
        this.attached = false;
      },
    };
    panes.set(name, pane);
    return pane;
  };
  await f.register({
    build(i) {
      const pane = i.map.createPane({ name: "dots", band: "markers" }),
        object = layer();
      layers.push(object);
      i.resources.own(object, () => {});
      i.map.attachLayer(object, { pane });
      i.resources.stageEffect({
        label: "failure",
        preflight() {
          if (fail) throw Error("preflight");
        },
        mount() {},
        withdraw() {},
        dispose() {},
      });
      return {};
    },
  });
  const e = await f.create();
  await tick();
  const name = layers[0].options.pane,
    oldPane = panes.get(name);
  expect(oldPane.attached).toBe(false);
  expect(f.rendering.applicationApi.getStatus(e.id).state).toBe("failed");
  fail = false;
  f.rendering.applicationApi.retry(e.id);
  await tick();
  expect(layers[1].options.pane).toBe(name);
  expect(panes.get(name)).toBe(oldPane);
  expect(panes.get(name).attached).toBe(true);
  expect(layers[1].attached).toBe(true);
  expect(f.rendering.applicationApi.getStatus(e.id)).toMatchObject({
    state: "active",
    currentToken: "2",
  });
  await f.semantic.entries.remove(f.consumer, e.id);
  expect(panes.get(name).attached).toBe(false);
  expect(layers.every((l) => !l.attached)).toBe(true);
});

it("renews retained same-revision authority if reentrant retry supersedes activation then fails", async () => {
  const f = await fixture(),
    layers = [],
    highlight = layer();
  let count = 0,
    triggered = false;
  await f.register({
    build(i) {
      if (++count === 3) throw Error("latest retry failed");
      return renderer(layers, () => ({
        presentation: {
          anchor: () => ({ lat: 1, lng: 2 }),
          highlight(ref, ctx) {
            ctx.map.attachLayer(highlight);
          },
        },
      })).build(i);
    },
  });
  const entry = await f.create();
  await tick();
  const old = f.capabilities.presentation.resolve(entry.id, {});
  await old.highlight({ scope: f.consumer });
  highlight.remove.mockImplementation(function () {
    this.attached = false;
    if (!triggered) {
      triggered = true;
      f.rendering.applicationApi.retry(entry.id);
    }
  });
  f.rendering.applicationApi.retry(entry.id);
  await tick();
  expect(f.rendering.applicationApi.getStatus(entry.id)).toMatchObject({
    state: "active",
    currentToken: "1",
    pendingToken: null,
  });
  expect(layers.map((l) => l.attached)).toEqual([true, false]);
  expect(old.isCurrent()).toBe(false);
  const fresh = f.capabilities.presentation.resolve(entry.id, {});
  expect(fresh.token).toBe("1");
  expect(fresh.isCurrent()).toBe(true);
});

// Phase 4G contract amendment: retain the accepted 4F generation fixture and
// verify the additional notification without changing rendering/status policy.
describe("Phase 4G presentation invalidation signal", () => {
  it.each(["hide", "replacement", "withdrawal", "deletion", "consumer", "termination"])(
    "revokes authority before abort delivery on %s and removes both forwarding listeners",
    async (trigger) => {
      const f = await fixture();
      let exposure;
      const registration = await f.register({
        build(input) {
          exposure = input;
          return { presentation: { anchor: () => ({ lat: 35, lng: 135 }) } };
        },
      });
      const entry = await f.create();
      await tick();
      const added = vi.spyOn(AbortSignal.prototype, "addEventListener");
      const removed = vi.spyOn(AbortSignal.prototype, "removeEventListener");
      const handle = f.capabilities.presentation.resolve(entry.id, {});
      const sources = added.mock.calls.map((args, index) => ({ args, source: added.mock.contexts[index] }));
      expect(sources).toHaveLength(2);
      const abort = vi.fn(() => expect(handle.isCurrent()).toBe(false));
      handle.signal.addEventListener("abort", abort);
      const status = vi.fn();
      f.capabilities.rendering.subscribe(status, { emitCurrent: false });
      if (trigger === "hide") await f.semantic.entries.setVisible(f.consumer, entry.id, false);
      if (trigger === "replacement") await f.update(entry.id, 2, 1);
      if (trigger === "withdrawal") await registration.handle.dispose();
      if (trigger === "deletion") await f.semantic.entries.remove(f.consumer, entry.id);
      if (trigger === "consumer") await f.consumer.dispose();
      if (trigger === "termination") await f.rendering.close();
      await tick();
      expect(handle.signal.aborted).toBe(true);
      expect(abort).toHaveBeenCalledOnce();
      for (const { args, source } of sources) {
        expect(removed.mock.calls.some((call, index) => call[0] === "abort" &&
          call[1] === args[1] && removed.mock.contexts[index] === source)).toBe(true);
      }
      added.mockRestore();
      removed.mockRestore();
      if (trigger === "termination") expect(status).not.toHaveBeenCalled();
      if (trigger === "hide") {
        await f.semantic.entries.setVisible(f.consumer, entry.id, true);
        await tick();
        const fresh = f.capabilities.presentation.resolve(entry.id, {});
        expect(fresh.token).toBe(handle.token);
        expect(fresh.signal.aborted).toBe(false);
        expect(handle.isCurrent()).toBe(false);
      }
      expect(exposure).toBeDefined();
    },
  );

  it("permanently invalidates a handle on revision advancement with the same token", async () => {
    const f = await fixture();
    await f.register({
      build() { return { presentation: { anchor: () => ({ lat: 35, lng: 135 }) },
        prepareUpdate: () => ({ mode: "nonthrowing", nextPresentation: {
          anchor: () => ({ lat: 35, lng: 135 }),
        }, preflight() {}, commit() {}, rollback() {} }) }; },
      planChange: () => "update",
    });
    const entry = await f.create();
    await tick();
    const old = f.capabilities.presentation.resolve(entry.id, {});
    await f.update(entry.id, 2, 1);
    await tick();
    const fresh = f.capabilities.presentation.resolve(entry.id, {});
    expect(fresh.token).toBe(old.token);
    expect(fresh.revision).toBe(2);
    expect(old.signal.aborted).toBe(true);
    expect(old.isCurrent()).toBe(false);
    expect(fresh.signal.aborted).toBe(false);
  });

  it("returns null and removes partial listeners if consumer closure races registration", async () => {
    const f = await fixture();
    await f.register({ build() { return { presentation: { anchor: () => ({ lat: 35, lng: 135 }) } }; } });
    const entry = await f.create();
    await tick();
    const nativeAdd = f.consumer.signal.addEventListener.bind(f.consumer.signal);
    let closing, forwarder;
    vi.spyOn(f.consumer.signal, "addEventListener").mockImplementation((type, fn, options) => {
      forwarder = fn;
      closing = f.consumer.dispose();
      nativeAdd(type, fn, options);
    });
    const remove = vi.spyOn(f.consumer.signal, "removeEventListener");
    expect(f.capabilities.presentation.resolve(entry.id, {})).toBeNull();
    await closing;
    expect(remove).toHaveBeenCalledWith("abort", forwarder);
  });
});


it("Phase 4G invalidation removes a listener attached after exposure termination during registration", async () => {
  const f = await fixture();
  await f.register({ build() { return { presentation: { anchor: () => ({ lat: 35, lng: 135 }) } }; } });
  const entry = await f.create();
  await tick();
  const nativeAdd = AbortSignal.prototype.addEventListener;
  let closing, forwarder, source;
  const added = vi.spyOn(AbortSignal.prototype, "addEventListener").mockImplementation(function (type, fn, options) {
    if (!source) {
      source = this;
      forwarder = fn;
      closing = f.rendering.close();
    }
    nativeAdd.call(this, type, fn, options);
  });
  const removed = vi.spyOn(AbortSignal.prototype, "removeEventListener");
  try {
    expect(f.capabilities.presentation.resolve(entry.id, {})).toBeNull();
    await closing;
    expect(removed.mock.calls.some((args, index) => args[0] === "abort" &&
      args[1] === forwarder && removed.mock.contexts[index] === source)).toBe(true);
  } finally {
    added.mockRestore();
    removed.mockRestore();
  }
});
