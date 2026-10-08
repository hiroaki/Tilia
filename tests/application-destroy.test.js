import { afterEach, describe, expect, it, vi } from "vitest";
import { documentFixture, settle } from "./helpers/scoped-dom.js";

const faults = vi.hoisted(() => ({ maps: [], setView: null, tileAdd: null, tileRemove: null, foundationGate: null, foundationStarted: null }));
vi.mock("../src/semantic-foundation.js", async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, async createSemanticFoundation(options) {
    const foundation = await actual.createSemanticFoundation(options);
    faults.foundationStarted?.resolve(foundation);
    if (faults.foundationGate) await faults.foundationGate.promise;
    return foundation;
  } };
});
vi.mock("leaflet", async () => {
  const helpers = await import("./helpers/leaflet-ui.js");
  return { ...helpers, TileLayer: class extends helpers.TileLayer {
    addTo(map) { super.addTo(map); if (faults.tileAdd) throw faults.tileAdd; return this; }
    remove() { if (faults.tileRemove) { const cause = faults.tileRemove; faults.tileRemove = null; throw cause; } return super.remove(); }
  }, Map: class {
    constructor(container, options) {
      this.container = container; this.options = options; faults.maps.push(this);
      this.layers = new Set(); this.panes = new globalThis.Map(); this.events = [];
      this.remove = vi.fn(() => {
        this.events.push("map");
        if (this.removeFailure) throw this.removeFailure;
        for (const layer of [...this.layers]) layer.remove();
      });
    }
    getContainer() { return this.container; }
    setView() { if (faults.setView) throw faults.setView; return this; }
    on() {} off() {}
    getPane(name) { return this.panes.get(name); }
    createPane(name) { const pane = document.createElement("div"); this.container.appendChild(pane); this.panes.set(name, pane); return pane; }
  } };
});
import * as publicApi from "../src/index.js";
import { createDefaultTiliaApp } from "../src/app.js";
import { gpxDomainKey } from "../src/domains/keys.js";
import { defineServiceKey } from "../src/extensions/services.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
let app;
afterEach(async () => {
  if (app) await app.destroy().catch(() => {}); // Every fault test asserts its outcome itself.
  app = null; Object.assign(faults, { maps: [], setView: null, tileAdd: null, tileRemove: null, foundationGate: null, foundationStarted: null }); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function construct(options = {}) {
  const doc = documentFixture(); vi.stubGlobal("document", doc);
  const container = doc.createElement("div"); doc.body.appendChild(container);
  app = createDefaultTiliaApp(container, { builtins: [], ...options });
  return { app, container, map: app.map };
}

describe("public application lifetime", () => {
  it("exports the sole factory without privileged infrastructure constructors", () => {
    for (const name of ["createTiliaApp", "createEntryStore", "createDomainRegistry", "createSemanticFoundation", "createSemanticCapabilityFactories", "createApplicationSemanticApi"])
      expect(publicApi).not.toHaveProperty(name);
    expect(publicApi.createDefaultTiliaApp).toBe(createDefaultTiliaApp);
    expect(() => createDefaultTiliaApp({}, { map: {} })).toThrow("External Map");
  });

  it("fences cached capabilities synchronously and removes the Map after plugin resources", async () => {
    const f = construct(); await app.ready;
    const order = f.map.events;
    let context;
    await app.use({ id: "x-owned", setup(value) {
      context = value;
      value.scope.defer(() => order.push("plugin"));
    } });
    const entries = app.entries, domain = app.domains.gpx, rendering = app.rendering;
    const guarded = context.scope.guard(vi.fn());
    const closing = app.destroy();
    expect(app.destroy()).toBe(closing);
    for (const operation of [() => app.map, () => entries.list(), () => domain.get(1), () => rendering.list(), () => context.scope.child(), () => context.scope.defer(() => {}), () => context.scope.track(Promise.resolve())])
      expect(operation).toThrow();
    expect(guarded()).toBeUndefined();
    expect(app.hasPlugin("x-owned")).toBe(false); expect(app.listPlugins()).toEqual([]);
    await expect(app.load({})).rejects.toMatchObject({ code: "APP_DESTROYED" });
    await closing;
    expect(order).toEqual(["plugin", "map"]); expect(f.map.remove).toHaveBeenCalledOnce();
    expect(app.destroy()).toBe(closing); expect(await app.ready).toBe(app);
    expect(f.container.parentNode).not.toBeNull();
  });

  it("rejects pending ready immediately on destroy without a ready/cleanup wait cycle", async () => {
    const f = construct();
    const ready = app.ready;
    const closing = app.destroy();
    await expect(ready).rejects.toMatchObject({ code: "APP_DESTROYED" });
    expect(app.whenReady()).toBe(ready);
    await closing; expect(f.map.remove).toHaveBeenCalledOnce();
  });

  it("does not wait for resource-free resolution and never starts its late setup", async () => {
    const gate = deferred(), started = deferred(), setup = vi.fn();
    construct({ builtins: [{ id: "x-lazy", requires: [], load() { started.resolve(); return gate.promise; } }], plugins: ["x-lazy"] });
    await started.promise;
    await app.destroy();
    await expect(app.ready).rejects.toMatchObject({ code: "APP_DESTROYED" });
    gate.resolve({ default: { id: "x-lazy", setup } }); await settle();
    expect(setup).not.toHaveBeenCalled();
  });

  it("preserves the initiating bootstrap failure and reports cleanup failure separately", async () => {
    const cause = new Error("setup failed");
    const f = construct({ plugins: [[{ id: "x-broken", setup(context) {
      context.scope.defer(() => { throw new Error("cleanup failed"); });
      throw cause;
    } }]] });
    await expect(app.ready).rejects.toMatchObject({ code: "PLUGIN_SETUP_FAILED", cause });
    const closing = app.destroy();
    await expect(closing).rejects.toMatchObject({ code: "APP_CLEANUP_FAILED" });
    expect(app.destroy()).toBe(closing); expect(f.map.remove).toHaveBeenCalledOnce();
  });

  it("continues independent cleanup and retains the same terminal rejection after Map removal failure", async () => {
    const f = construct(); await app.ready;
    const cleanup = vi.fn();
    await app.use({ id: "x-first", setup: () => cleanup });
    await app.use({ id: "x-fail", setup: () => () => { throw new Error("plugin failed"); } });
    f.map.removeFailure = new Error("map failed");
    const closing = app.destroy();
    const error = await closing.catch(error => error);
    expect(error.code).toBe("APP_CLEANUP_FAILED");
    expect(error.details.failures.map(item => item.resource)).toEqual(expect.arrayContaining(["plugin", "map"]));
    expect(Object.isFrozen(error.details.failures)).toBe(true);
    expect(cleanup).toHaveBeenCalledOnce(); expect(f.map.remove).toHaveBeenCalledOnce();
    expect(app.destroy()).toBe(closing); await expect(app.destroy()).rejects.toBe(error);
  });

  it("rejects identifiable app destroy from setup, registered cleanup and pending destruction", async () => {
    construct(); await app.ready;
    let duringSetup, duringCleanup;
    await app.use({ id: "x-owner", setup(context) {
      duringSetup = app.destroy(); duringSetup.catch(() => {});
      context.scope.defer(() => { duringCleanup = app.destroy(); return duringCleanup; });
    } });
    await expect(duringSetup).rejects.toMatchObject({ code: "PLUGIN_LIFECYCLE_REENTRANT" });
    await expect(app.destroy()).rejects.toMatchObject({ code: "APP_CLEANUP_FAILED" });
    await expect(duringCleanup).rejects.toMatchObject({ code: "PLUGIN_LIFECYCLE_REENTRANT" });
  });
});

async function dependentProvider({ prepareGate = null, failures = 0, providerFailure = null } = {}) {
  const f = construct(); await app.ready;
  const key = defineServiceKey({ id: "x-prerequisite", createFacade: ({ implementation, assertAvailable }) => ({ acquire() { assertAvailable(); return implementation.acquire(); } }) });
  const order = f.map.events;
  let disposed = false, attempts = 0, providerContext;
  await app.use({ id: "x-dependency", setup(context) {
    context.services.provide(key, { acquire() { return () => {
      attempts += 1; order.push("instance");
      if (disposed) throw new Error("prerequisite already disposed");
      if (attempts <= failures) throw new Error("instance failure");
    }; } });
    return () => { disposed = true; order.push("dependency"); };
  } });
  await app.use({ id: "x-provider", requires: ["x-dependency"], setup(context) {
    providerContext = context;
    const dependency = context.services.require(key);
    context.domains.provide(gpxDomainKey, {
      async prepareCreate() {
        const dispose = dependency.acquire();
        if (prepareGate) await prepareGate.promise;
        return { instance: {}, snapshot: Object.freeze({}), dispose };
      }, prepareMutation() {}, getSnapshot() {},
    });
    return () => { order.push("provider"); if (providerFailure) throw providerFailure; };
  } });
  await app.use({ id: "x-independent", setup: () => () => order.push("independent") });
  return { ...f, providerContext, order, attempts: () => attempts };
}

describe("entry handoff and retained prerequisites", () => {
  it("awaits required late creation handoff without publication and releases its prerequisite last", async () => {
    const gate = deferred();
    const f = await dependentProvider({ prepareGate: gate });
    const creation = app.domains.gpx.create({}).catch(error => error);
    await settle();
    const closing = app.destroy(); let done = false; closing.then(() => { done = true; });
    await settle(); expect(done).toBe(false);
    expect(f.order).toEqual(["independent"]);
    expect(f.providerContext.scope.alive).toBe(true);
    expect(() => f.providerContext.scope.child()).toThrow();
    expect(() => f.providerContext.domains.gpx.create({})).toThrow();
    gate.resolve(); await creation; await closing;
    expect(f.order).toEqual(["independent", "instance", "provider", "dependency", "map"]);
  });

  it("allows an eligible safe attempt before closing provider/dependency and preserves earlier error evidence", async () => {
    const f = await dependentProvider({ failures: 1 });
    await app.domains.gpx.create({});
    await expect(app.destroy()).rejects.toMatchObject({ code: "APP_CLEANUP_FAILED" });
    expect(f.attempts()).toBe(2);
    expect(f.order).toEqual(["independent", "instance", "instance", "provider", "dependency", "map"]);
  });

  it("reports blocked roots conservatively without force-releasing a permanent residual lease", async () => {
    const f = await dependentProvider({ failures: Infinity });
    await app.domains.gpx.create({});
    const error = await app.destroy().catch(error => error);
    expect(error.code).toBe("APP_CLEANUP_FAILED");
    const blocked = error.details.failures.find(item => item.resource === "cleanup prerequisite");
    expect(blocked.blocked.map(item => item.id).sort()).toEqual(["x-dependency", "x-provider"]);
    expect(f.order).toEqual(["independent", "instance", "instance", "map"]);
    expect(f.providerContext.scope.alive).toBe(true);
    expect(() => f.providerContext.scope.defer(() => {})).toThrow();
  });
});


describe("initial acquisition and race boundaries", () => {
  it.each(["setView", "tileAdd"])("rolls back the owned Map when %s fails and preserves the initiating exception", phase => {
    const cause = new Error(phase); faults[phase] = cause;
    expect(() => construct()).toThrow(cause);
    expect(faults.maps).toHaveLength(1);
    expect(faults.maps[0].remove).toHaveBeenCalledOnce();
    expect(faults.maps[0].layers.size).toBe(0);
  });

  it("observes asynchronous composition rollback while preserving a synchronous acquisition error", async () => {
    const cause = new Error("initial tile removal"); faults.tileRemove = cause;
    expect(() => construct()).toThrow(cause);
    await settle();
    expect(faults.maps[0].remove).toHaveBeenCalledOnce();
  });

  it("rejects ready before a late foundation handoff and joins that handoff before Map removal", async () => {
    const gate = deferred(), started = deferred();
    faults.foundationGate = gate; faults.foundationStarted = started;
    const f = construct(); const foundation = await started.promise;
    const closing = app.destroy();
    await expect(app.ready).rejects.toMatchObject({ code: "APP_DESTROYED" });
    expect(f.map.remove).not.toHaveBeenCalled();
    gate.resolve(); await closing;
    expect(foundation.inspect().ownership.state).toBe("closed");
    expect(f.map.remove).toHaveBeenCalledOnce();
  });

  it("lets external destruction win ready over a later bootstrap rejection", async () => {
    const started = deferred(), gate = deferred();
    const f = construct({ plugins: [[{ id: "x-pending", setup() { started.resolve(); return gate.promise; } }]] });
    await started.promise;
    const closing = app.destroy();
    await expect(app.ready).rejects.toMatchObject({ code: "APP_DESTROYED" });
    await closing;
    gate.reject(new Error("late setup failure")); await settle();
    expect(f.map.remove).toHaveBeenCalledOnce();
    await expect(app.ready).rejects.toMatchObject({ code: "APP_DESTROYED" });
  });
});

describe("failed dependents and exact hard closure", () => {
  it.each([false, true])("holds shared transitive prerequisites through safe cleanup (permanent=%s)", async permanent => {
    const f = construct(); await app.ready;
    const order = f.map.events; let attempts = 0;
    await app.use({ id: "x-root", setup: () => () => order.push("root") });
    await app.use({ id: "x-middle", requires: ["x-root"], setup: () => () => order.push("middle") });
    await app.use({ id: "x-other", requires: ["x-root"], setup: () => () => order.push("other") });
    await app.use({ id: "x-failed", requires: ["x-middle"], setup(context) {
      context.scope.defer(() => { order.push("failed"); if (++attempts === 1 || permanent) throw new Error("held dependency"); }, { retry: "safe" });
    } });
    const error = await app.destroy().catch(error => error);
    expect(error.code).toBe("APP_CLEANUP_FAILED");
    expect(attempts).toBe(2);
    expect(order).toEqual(permanent ? ["failed", "failed", "other", "map"] : ["failed", "failed", "other", "middle", "root", "map"]);
    const blocked = error.details.failures.find(item => item.resource === "cleanup prerequisite");
    if (permanent) expect(blocked.blocked.map(item => item.id).sort()).toEqual(["x-failed", "x-middle", "x-root"]);
    else expect(blocked).toBeUndefined();
  });
});

async function mutableProvider({ mutationGate, disposalGate } = {}) {
  const f = construct(); await app.ready;
  const started = deferred(); let context, signal, attempts = 0;
  await app.use({ id: "x-mutable", setup(value) {
    context = value;
    value.domains.provide(gpxDomainKey, {
      prepareCreate() { return { instance: {}, snapshot: Object.freeze({}), async dispose() { attempts++; f.map.events.push("instance"); if (disposalGate) { started.resolve(); await disposalGate.promise; } } }; },
      async prepareMutation(input) {
        signal = input.signal; started.resolve(); await mutationGate.promise;
        return { changed: true, nextInstance: {}, nextSnapshot: Object.freeze({}), disposeNext() { f.map.events.push("candidate"); } };
      }, getSnapshot() {},
    });
    return () => f.map.events.push("provider");
  } });
  const entry = await app.domains.gpx.create({});
  return { ...f, entry, context, started, signal: () => signal, attempts: () => attempts };
}

describe("pending semantic operations", () => {
  it("aborts and joins a pending mutation, disposes its late candidate, and never publishes a revision", async () => {
    const gate = deferred(); const f = await mutableProvider({ mutationGate: gate });
    const changes = vi.fn(); f.context.entries.subscribe(changes, { emitCurrent: false });
    const operation = app.domains.gpx.replaceData(f.entry.id, {}, { expectedRevision: 1 }).catch(error => error);
    await f.started.promise;
    const closing = app.destroy(); expect(f.signal().aborted).toBe(true);
    await settle(); expect(f.map.remove).not.toHaveBeenCalled();
    gate.resolve(); await operation; await closing;
    expect(f.map.events).toEqual(["candidate", "instance", "provider", "map"]);
    expect(changes).not.toHaveBeenCalled();
  });

  it.each(["remove", "clear"])("joins pending %s once before provider and Map disposal", async method => {
    const gate = deferred(); const f = await mutableProvider({ disposalGate: gate });
    const operation = method === "remove" ? app.entries.remove(f.entry.id) : app.entries.clear();
    await f.started.promise;
    const closing = app.destroy(); await settle();
    expect(f.map.remove).not.toHaveBeenCalled(); expect(f.attempts()).toBe(1);
    gate.resolve(); await operation; await closing;
    expect(f.map.events).toEqual(["instance", "provider", "map"]);
  });
});

describe("owned resources and independent failures", () => {
  it("attempts both observers, a failed DOM listener, UI root and Map independently", async () => {
    const order = [];
    vi.stubGlobal("MutationObserver", class { observe() {} disconnect() { order.push("mutation"); throw new Error("mutation disconnect"); } });
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() { order.push("resize"); throw new Error("resize disconnect"); } });
    const f = construct(); await app.ready;
    await app.use({ id: "x-ui-fault", setup(context) {
      context.ui.mountSurface({ id: "fault", mount({ container, scope }) {
        const callback = scope.guard(vi.fn()); container.addEventListener("click", callback);
        scope.defer(() => { order.push("listener"); throw new Error("listener removal"); }, { retry: "never" });
      } });
    } });
    const root = f.container.children.find(node => node.className.startsWith("tilia-ui-surface-root"));
    const remove = root.remove.bind(root);
    root.remove = () => { order.push("root"); remove(); };
    f.map.remove.mockImplementation(() => order.push("map"));
    order.length = 0;
    const error = await app.destroy().catch(error => error);
    expect(error.code).toBe("APP_CLEANUP_FAILED");
    expect(order).toEqual(["listener", "root", "mutation", "resize", "map"]);
    expect(root.parentNode).toBeNull();
  });

  it("retains a failed stylesheet release for one eligible safe attempt without affecting caller styles", async () => {
    const f = construct(); await app.ready;
    const caller = document.createElement("link"); document.head.appendChild(caller);
    let link, attempts = 0;
    await app.use({ id: "x-style-fault", setup(context) {
      context.styles.use({ id: "x-test", href: "/test.css" });
      link = document.head.children.find(node => node.dataset.tiliaStylesheet === "x-test");
      const remove = link.remove.bind(link);
      link.remove = () => { if (++attempts === 1) throw new Error("style remove"); remove(); };
    } });
    await expect(app.destroy()).rejects.toMatchObject({ code: "APP_CLEANUP_FAILED" });
    expect(attempts).toBe(2); expect(link.parentNode).toBeNull();
    expect(caller.parentNode).toBe(document.head); expect(f.map.remove).toHaveBeenCalledOnce();
  });

  it("captures a failed departing base tile and reports it even when final Map removal succeeds", async () => {
    const f = construct(); await app.ready;
    const layer = app.getBaseLayer(); let attempts = 0;
    const remove = layer.remove.bind(layer);
    layer.remove = () => { attempts++; throw new Error("tile remove"); };
    f.map.remove.mockImplementation(() => { f.map.events.push("map"); remove(); });
    const error = await app.destroy().catch(error => error);
    expect(error.code).toBe("APP_CLEANUP_FAILED");
    expect(attempts).toBeGreaterThan(0); expect(f.map.remove).toHaveBeenCalledOnce();
    expect(f.map.layers.size).toBe(0);
  });
});


it("reports a retained provider's new cleanup residual and holds its dependency after lease release", async () => {
  const f = await dependentProvider({ providerFailure: new Error("provider cleanup failure") });
  await app.domains.gpx.create({});
  const error = await app.destroy().catch(error => error);
  expect(error.code).toBe("APP_CLEANUP_FAILED");
  const blocked = error.details.failures.find(item => item.resource === "cleanup prerequisite");
  expect(blocked.blocked.map(item => item.id).sort()).toEqual(["x-dependency", "x-provider"]);
  expect(f.order).toEqual(["independent", "instance", "provider", "map"]);
});

describe("renderer acquisition settlement at public destruction", () => {
  it.each(["detach", "await"])("preserves %s acquisition policy and captured disposal without late publication", async settlement => {
    const f = await mutableProvider(); const gate = deferred(), started = deferred();
    const dispose = vi.fn(() => f.map.events.push("acquisition")); let input;
    await app.use({ id: "x-renderer", requires: ["x-mutable"], setup(context) {
      context.renderers.register(gpxDomainKey, { async build(value) {
        input = value; started.resolve();
        await value.resources.acquire(() => gate.promise, dispose, { settlement });
        return {};
      } });
    } });
    await started.promise;
    const closing = app.destroy(); let done = false; closing.then(() => done = true, () => {});
    if (settlement === "detach") await closing;
    else await settle();
    expect(done).toBe(settlement === "detach");
    expect(f.map.remove).toHaveBeenCalledTimes(settlement === "detach" ? 1 : 0);
    expect(() => input.map.attachLayer({ addTo: vi.fn() })).toThrow();
    gate.resolve({}); await closing; await settle();
    expect(dispose).toHaveBeenCalledOnce(); expect(f.map.remove).toHaveBeenCalledOnce();
    expect(f.map.events.at(settlement === "detach" ? -1 : -4)).toBe("acquisition");
  });

  it("keeps a settled destroy outcome stable when detached acquisition cleanup fails later", async () => {
    const f = await mutableProvider(); const gate = deferred(), started = deferred();
    const dispose = vi.fn(() => { throw new Error("late acquisition cleanup"); });
    await app.use({ id: "x-renderer", setup(context) {
      context.renderers.register(gpxDomainKey, { async build(input) {
        started.resolve(); await input.resources.acquire(() => gate.promise, dispose); return {};
      } });
    } });
    await started.promise; const closing = app.destroy(); await closing;
    gate.resolve({}); await settle();
    expect(dispose).toHaveBeenCalledOnce(); expect(app.destroy()).toBe(closing);
    await expect(closing).resolves.toBeUndefined(); expect(f.map.remove).toHaveBeenCalledOnce();
  });
});

it("shares the reserved app completion with ordinary plugin abort notification reentry", async () => {
  construct(); await app.ready; let nested;
  await app.use({ id: "x-abort", setup(context) {
    context.scope.signal.addEventListener("abort", () => { nested = app.destroy(); });
  } });
  const closing = app.destroy(); await closing;
  expect(nested).toBe(closing);
});

it("reports an awaitable renderer disposer failure and conservatively retains its provider prerequisite", async () => {
  const f = await mutableProvider(); const gate = deferred(), started = deferred();
  const dispose = vi.fn(() => { throw new Error("awaited render cleanup"); });
  await app.use({ id: "x-renderer", requires: ["x-mutable"], setup(context) {
    context.renderers.register(gpxDomainKey, { async build(input) {
      started.resolve(); await input.resources.acquire(() => gate.promise, dispose, { settlement: "await" }); return {};
    } });
  } });
  await started.promise; const closing = app.destroy();
  gate.resolve({}); const error = await closing.catch(error => error);
  expect(error.code).toBe("APP_CLEANUP_FAILED");
  expect(error.details.failures.some(item => item.resource === "cleanup prerequisite")).toBe(true);
  expect(dispose).toHaveBeenCalledOnce(); expect(f.map.remove).toHaveBeenCalledOnce();
  expect(f.map.events).not.toContain("provider");
});

it("owns a stylesheet before partial composition acquisition fails and preserves the initiating error", async () => {
  const doc = documentFixture(); vi.stubGlobal("document", doc);
  const container = doc.createElement("div"); doc.body.appendChild(container);
  const append = doc.head.appendChild.bind(doc.head), cause = new Error("head append after acquisition");
  doc.head.appendChild = node => { append(node); throw cause; };
  expect(() => createDefaultTiliaApp(container, { builtins: [] })).toThrow(cause);
  await settle();
  expect(doc.head.children).toEqual([]); expect(container.parentNode).toBe(doc.body);
  expect(faults.maps[0].remove).toHaveBeenCalledOnce();
});
