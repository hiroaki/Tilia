import { describe, expect, it, vi } from "vitest";
import { createSemanticFoundation } from "../src/semantic-foundation.js";
import { createApplicationSemanticApi, createSemanticCapabilityFactories } from "../src/semantic-capabilities.js";
import { createPluginRuntime } from "../src/plugins/runtime/index.js";
import { createScopeController } from "../src/ownership/index.js";
import { cloneAndFreezePlainData, defineDomainKey } from "../src/domains/index.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const catalog = [
  { id: "tilia-gpx-domain", requires: [], load: () => import("../src/plugins/domains/gpx.js") },
  { id: "tilia-photo-domain", requires: [], load: () => import("../src/plugins/domains/photo.js") },
];
const gpxData = () => ({ name: "sample.gpx", tracks: [{ segments: [{ points: [{ lat: 35, lon: 135, elevation: 10, timestamp: 1000 }] }] }], routes: [], waypoints: [] });

async function production() {
  const foundation = await createSemanticFoundation();
  const runtime = createPluginRuntime({ catalog, capabilityFactories: createSemanticCapabilityFactories(foundation) });
  await runtime.use("tilia-gpx-domain");
  await runtime.use("tilia-photo-domain");
  return { foundation, runtime, api: createApplicationSemanticApi(foundation) };
}

async function synthetic({ dispose = null, gate = null, onError = () => {} } = {}) {
  const foundation = await createSemanticFoundation({ onError });
  const owner = createScopeController({ label: "synthetic-domain" });
  const key = defineDomainKey({ id: "synthetic" });
  const started = deferred();
  const adapter = {
    canonicalize: ({ target }) => ({ id: target.id }),
    equals: (left, right) => left.id === right.id,
    resolve: ({ instance, ref }) => instance.ids.includes(ref.id) ? cloneAndFreezePlainData({ id: ref.id, label: instance.label }) : null,
    reconcile: ({ command, ref }) => command.effect ?? { type: "refreshed", ref },
  };
  const rollbackDispose = vi.fn();
  const provider = {
    selection: adapter,
    async prepareCreate({ value }) {
      const snapshot = cloneAndFreezePlainData(value);
      return { instance: snapshot, snapshot, ...(dispose ? { dispose } : {}) };
    },
    async prepareMutation({ currentInstance, command }) {
      started.resolve();
      if (gate) await gate.promise;
      if (command.fail) throw new Error("prepare failed");
      const next = cloneAndFreezePlainData({ ...currentInstance, ...command.patch });
      return { changed: true, nextInstance: next, nextSnapshot: next,
        change: cloneAndFreezePlainData({ type: "synthetic" }), disposeNext: rollbackDispose };
    },
    getSnapshot: (instance) => instance,
  };
  foundation.domains.createFacade({ scope: owner.scope, stage: (value) => owner.stage(value) }).provide(key, provider);
  await owner.commit();
  const entry = await foundation.entries.create(foundation.scope, key, { ids: ["a", "b"], label: "old" });
  const domain = foundation.selection.createDomainFacade(foundation.scope, key);
  const api = foundation.selection.createFacade(foundation.scope);
  return { foundation, owner, key, provider, adapter, entry, domain, api, started, rollbackDispose,
    update(command, expectedRevision = 1) {
      return foundation.entries.update(foundation.scope, entry.id, key, command, { expectedRevision });
    },
    candidate(id = "a") { return domain.createCandidate(entry.id, { id }); },
  };
}

describe("selection and EntryStore transactions", () => {
  it("remaps GPX preference revisions atomically without selection changing revision", async () => {
    const f = await production();
    const entry = await f.api.domains.gpx.create(gpxData());
    const point = { kind: "track-point", trackIndex: 0, segmentIndex: 0, pointIndex: 0 };
    const oldCandidate = f.api.domains.gpx.selection.createCandidate(entry.id, point);
    await f.api.selection.request(oldCandidate);
    const order = [];
    f.api.entries.subscribe((event) => {
      if (event.type === "domain-changed") {
        const current = f.api.selection.getCurrent();
        expect(current.ref.revision).toBe(event.revision);
        expect(f.api.domains.gpx.selection.resolve(entry.id, current.ref).lat).toBe(35);
        order.push("domain");
      }
    }, { emitCurrent: false });
    f.api.selection.subscribe((event) => order.push(event.reason));
    await f.api.domains.gpx.setCategoryVisibility(entry.id, { category: "tracks", visible: false }, { expectedRevision: 1 });
    await f.api.domains.gpx.setTrackVisibility(entry.id, { trackIndex: 0, visible: false }, { expectedRevision: 2 });
    await f.api.domains.gpx.setStylePreset(entry.id, "red", { expectedRevision: 3 });
    expect(order).toEqual(["domain", "remapped", "domain", "remapped", "domain", "remapped"]);
    expect(f.api.domains.gpx.get(entry.id).revision).toBe(4);
    await expect(f.api.selection.request(oldCandidate)).rejects.toMatchObject({ code: "SELECTION_REFERENCE_INVALID" });
    await f.api.entries.setVisible(entry.id, false);
    await f.api.selection.request(f.api.domains.gpx.selection.createCandidate(entry.id, point));
    await f.api.selection.clear();
    expect(f.api.domains.gpx.get(entry.id).revision).toBe(4);
    await f.api.entries.remove(entry.id);
    await f.runtime.destroy();
    await f.foundation.dispose();
  });

  it("invalidates positional GPX selection on replacement but refreshes document selection", async () => {
    const f = await production();
    const entry = await f.api.domains.gpx.create(gpxData());
    await f.api.selection.request(f.api.domains.gpx.selection.createCandidate(entry.id, { kind: "track", trackIndex: 0 }));
    await f.api.domains.gpx.replaceData(entry.id, { ...gpxData(), name: "replaced" }, { expectedRevision: 1 });
    expect(f.api.selection.getCurrent()).toBeNull();
    await f.api.selection.request(f.api.domains.gpx.selection.createCandidate(entry.id, { kind: "document" }));
    const events = vi.fn();
    f.api.selection.subscribe(events);
    await f.api.domains.gpx.replaceData(entry.id, { ...gpxData(), name: "renamed" }, { expectedRevision: 2 });
    expect(events.mock.calls[0][0].reason).toBe("refreshed");
    expect(f.api.domains.gpx.selection.resolve(entry.id, f.api.selection.getCurrent().ref).name).toBe("renamed");
  });

  it("keeps Photo identity through semantic changes and does not refresh for private resource-only changes", async () => {
    const f = await production();
    const entry = await f.api.domains.photo.create({ data: { name: "photo" }, blob: new Blob(["a"]) });
    await f.api.selection.request(f.api.domains.photo.selection.createCandidate(entry.id));
    const first = f.api.selection.getCurrent();
    const events = vi.fn();
    f.api.selection.subscribe(events);
    await f.api.domains.photo.setRequestedTimeMode(entry.id, "utc", { expectedRevision: 1 });
    expect(f.api.selection.getCurrent()).toBe(first);
    expect(events.mock.calls[0][0]).toMatchObject({ reason: "refreshed", previous: first, current: first });
    const view = f.api.domains.photo.get(entry.id);
    await f.api.domains.photo.replaceData(entry.id, { ...view.snapshot.data, blob: new Blob(["b"]) }, { expectedRevision: 2 });
    expect(events).toHaveBeenCalledOnce();
    expect(f.api.domains.photo.get(entry.id).revision).toBe(2);
    expect(JSON.stringify(f.api.domains.photo.selection.resolve(entry.id, first.ref))).not.toMatch(/blob:|previewUrl/);
    await f.api.entries.remove(entry.id);
  });

  it("clears selected entry before cleanup; unrelated removal preserves selection", async () => {
    const observed = [];
    let f;
    f = await synthetic({ dispose() {
      observed.push("cleanup");
      expect(f.api.getCurrent()).toBeNull();
      expect(f.foundation.entries.get(f.entry.id)).toBeNull();
    } });
    await f.api.request(f.candidate());
    // Use a separate disposer-free instance for the unrelated removal.
    f.provider.prepareCreate = async ({ value }) => ({ instance: cloneAndFreezePlainData(value), snapshot: cloneAndFreezePlainData(value) });
    const plain = await f.foundation.entries.create(f.foundation.scope, f.key, { ids: ["x"], label: "plain" });
    await f.foundation.entries.remove(f.foundation.scope, plain.id);
    expect(f.api.getCurrent()).not.toBeNull();
    f.api.subscribe((event) => {
      observed.push(event.reason);
      expect(f.foundation.entries.get(f.entry.id)).toBeNull();
    });
    await f.foundation.entries.remove(f.foundation.scope, f.entry.id);
    expect(observed).toEqual(["entry-removed", "cleanup"]);
    expect(f.foundation.entries.list()).toEqual([]);
  });

  it("clear retains reverse deletion order and invalidates the selected middle entry before its disposer", async () => {
    const order = [];
    const f = await synthetic({ dispose: () => order.push("old") });
    f.provider.prepareCreate = async ({ value }) => {
      const snapshot = cloneAndFreezePlainData(value);
      return { instance: snapshot, snapshot, dispose() {
        if (value.label === "middle") expect(f.api.getCurrent()).toBeNull();
        order.push(value.label);
      } };
    };
    const middle = await f.foundation.entries.create(f.foundation.scope, f.key, { ids: ["a"], label: "middle" });
    await f.foundation.entries.create(f.foundation.scope, f.key, { ids: ["a"], label: "last" });
    await f.api.request(f.domain.createCandidate(middle.id, { id: "a" }));
    const entryEvents = [];
    f.foundation.entries.subscribe(f.foundation.scope, (event) => entryEvents.push(event.type), { emitCurrent: false });
    f.api.subscribe((event) => order.push(event.reason));
    await f.foundation.entries.clear(f.foundation.scope);
    expect(order).toEqual(["last", "entry-removed", "middle", "old"]);
    expect(entryEvents).toEqual(["cleared"]);
  });

  it("reentrant requests cannot select a logically removed entry but can select another live entry", async () => {
    const f = await synthetic();
    const other = await f.foundation.entries.create(f.foundation.scope, f.key, { ids: ["b"], label: "other" });
    const removedCandidate = f.candidate();
    const otherCandidate = f.domain.createCandidate(other.id, { id: "b" });
    await f.api.request(removedCandidate);
    let stale;
    let live;
    f.api.subscribe((event) => {
      if (event.reason === "entry-removed") {
        stale = f.api.request(removedCandidate);
        live = f.api.request(otherCandidate);
      }
    });
    await f.foundation.entries.remove(f.foundation.scope, f.entry.id);
    await expect(stale).rejects.toMatchObject({ code: "ENTRY_NOT_FOUND" });
    await expect(live).resolves.toMatchObject({ entryId: other.id });
    expect(f.api.getCurrent().entryId).toBe(other.id);
  });

  it("cleanup failure leaves selection cleared and retry does not republish it", async () => {
    let fail = true;
    const f = await synthetic({ dispose() { if (fail) throw new Error("cleanup"); } });
    await f.api.request(f.candidate());
    const events = vi.fn();
    f.api.subscribe(events);
    await expect(f.foundation.entries.remove(f.foundation.scope, f.entry.id)).rejects.toMatchObject({ committed: true });
    expect(f.api.getCurrent()).toBeNull();
    fail = false;
    await f.foundation.entries.retryCleanup(f.foundation.scope, f.entry.id);
    expect(events).toHaveBeenCalledOnce();
  });

  it.each(["unchanged", "refreshed", "remapped", "invalid"])("applies %s reconciliation with commit-before-observation", async (type) => {
    const f = await synthetic();
    await f.api.request(f.candidate());
    const previous = f.api.getCurrent();
    const events = [];
    f.api.subscribe((event) => {
      expect(f.foundation.entries.getDomainView(f.entry.id, f.key).revision).toBe(2);
      events.push(event);
    });
    const effect = type === "remapped" ? { type, ref: { id: "b" } } : { type };
    await f.update({ patch: type === "unchanged" ? {} : { label: "new" }, effect });
    if (type === "unchanged") { expect(events).toEqual([]); expect(f.api.getCurrent()).toBe(previous); }
    else expect(events[0].reason).toBe(type === "invalid" ? "domain-invalidated" : type);
    if (type === "invalid") expect(f.api.getCurrent()).toBeNull();
    else expect(f.domain.resolve(f.entry.id, f.api.getCurrent().ref).id).toBe(type === "remapped" ? "b" : "a");
  });

  it.each(["malformed", "throw", "bad-remap"])("rolls back semantics and selection when reconciliation is %s", async (failure) => {
    const f = await synthetic();
    await f.api.request(f.candidate());
    const previous = f.api.getCurrent();
    f.adapter.reconcile = () => {
      if (failure === "throw") throw new Error("adapter");
      return failure === "malformed" ? { type: "unknown" } : { type: "remapped", ref: { id: "missing" } };
    };
    await expect(f.update({ patch: { label: "new" } })).rejects.toMatchObject({ code: "SELECTION_PROVIDER_INVARIANT", committed: false });
    expect(f.foundation.entries.getDomainView(f.entry.id, f.key)).toMatchObject({ revision: 1, snapshot: { label: "old" } });
    expect(f.api.getCurrent()).toBe(previous);
    expect(f.rollbackDispose).toHaveBeenCalledOnce();
  });

  it("reconciles commit-time selection after asynchronous preparation", async () => {
    const gate = deferred();
    const f = await synthetic({ gate });
    await f.api.request(f.candidate());
    const updating = f.update({ patch: { ids: ["b"] }, effect: { type: "refreshed" } });
    await f.started.promise;
    await f.api.request(f.candidate("b"));
    gate.resolve();
    await updating;
    expect(f.domain.resolve(f.entry.id, f.api.getCurrent().ref).id).toBe("b");
  });

  it("queues selection intent behind both domain and selection notification batches", async () => {
    const f = await synthetic();
    await f.api.request(f.candidate());
    let queued;
    const order = [];
    f.foundation.entries.subscribe(f.foundation.scope, (event) => {
      if (event.type === "domain-changed") {
        order.push("domain");
        queued = f.api.request(f.candidate("b"));
      }
    }, { emitCurrent: false });
    f.api.subscribe((event) => order.push(`${event.reason}:${event.current.ref.id}`));
    await f.update({ patch: { label: "new" } });
    await queued;
    expect(order).toEqual(["domain", "refreshed:a", "requested:b"]);
  });

  it("keeps selection live after rejected foundation disposal and revokes it after valid disposal", async () => {
    const f = await synthetic();
    await f.api.request(f.candidate());
    await expect(f.foundation.dispose()).rejects.toThrow("cannot close");
    expect(f.api.getCurrent()).not.toBeNull();
    await f.foundation.entries.remove(f.foundation.scope, f.entry.id);
    let queued;
    let closing;
    f.foundation.selection.runCommit(() => {
      queued = f.api.clear();
      closing = f.foundation.dispose();
      expect(() => f.api.getCurrent()).toThrowError(expect.objectContaining({ code: "SELECTION_STORE_DESTROYED" }));
    });
    await expect(queued).rejects.toMatchObject({ code: "SELECTION_STORE_DESTROYED" });
    await closing;
    await f.foundation.dispose();
  });

  it("does not terminate selection for disposal rejected by cleanup residuals", async () => {
    let fail = true;
    const f = await synthetic({ dispose() { if (fail) throw new Error("residual"); } });
    await f.api.request(f.candidate());
    await expect(f.foundation.entries.remove(f.foundation.scope, f.entry.id)).rejects.toMatchObject({ committed: true });
    await expect(f.foundation.dispose()).rejects.toThrow("cannot close");
    await expect(f.api.clear()).resolves.toBeUndefined();
    fail = false;
    await f.foundation.entries.retryCleanup(f.foundation.scope, f.entry.id);
    await f.foundation.dispose();
    await expect(f.api.clear()).rejects.toMatchObject({ code: "SELECTION_STORE_DESTROYED" });
  });

  it("remains terminal if semantic-root cleanup fails", async () => {
    const foundation = await createSemanticFoundation();
    const api = createApplicationSemanticApi(foundation);
    foundation.scope.defer(() => { throw new Error("root cleanup"); });
    const listener = vi.fn();
    api.selection.subscribe(listener);
    await expect(foundation.dispose()).rejects.toMatchObject({ code: "SCOPE_DISPOSAL_FAILED" });
    expect(listener).not.toHaveBeenCalled();
    expect(() => api.selection.getCurrent()).toThrowError(expect.objectContaining({ code: "SELECTION_STORE_DESTROYED" }));
    await expect(api.selection.clear()).rejects.toMatchObject({ code: "SELECTION_STORE_DESTROYED" });
  });

  it("uses scope-owned capabilities and preserves selection when its requesting plugin uninstalls", async () => {
    const f = await production();
    let context;
    await f.runtime.use({ id: "x-selection-consumer", setup(value) { context = value; } });
    const entry = await f.api.domains.photo.create({ name: "selected" });
    const candidate = context.domains.photo.selection.createCandidate(entry.id);
    await context.selection.request(candidate);
    const listener = vi.fn();
    context.selection.subscribe(listener);
    await f.runtime.unuse("x-selection-consumer");
    expect(f.api.selection.getCurrent().entryId).toBe(entry.id);
    await expect(context.selection.clear()).rejects.toMatchObject({ code: "SCOPE_NOT_ACTIVE" });
    expect(() => context.domains.photo.selection.resolve(entry.id, { kind: "photo" })).toThrowError(expect.objectContaining({ code: "SCOPE_NOT_ACTIVE" }));
    await f.api.selection.clear();
    expect(listener).not.toHaveBeenCalled();
  });
});
