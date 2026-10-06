import { describe, expect, it, vi } from "vitest";
import { createScopeController } from "../src/ownership/index.js";
import { createPluginRuntime } from "../src/plugins/runtime/index.js";
import {
  cloneAndFreezePlainData,
  createDomainRegistry,
  defineDomainKey,
  semanticErrorCodes,
} from "../src/domains/index.js";
import { createEntryStore } from "../src/entries/index.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeProvider({ createGate = null, mutateGate = null, dispose = null } = {}) {
  return {
    async prepareCreate({ value }) {
      if (createGate) await createGate.promise;
      const instance = structuredClone(value);
      return { instance, snapshot: cloneAndFreezePlainData(instance), ...(dispose ? { dispose } : {}) };
    },
    async prepareMutation({ currentInstance, command }) {
      if (mutateGate) await mutateGate.promise;
      if (command.type === "noop") return { changed: false };
      if (command.type === "fail") throw new Error("mutation failed");
      const nextInstance = { ...structuredClone(currentInstance), ...structuredClone(command.patch) };
      return {
        changed: true,
        nextInstance,
        nextSnapshot: cloneAndFreezePlainData(nextInstance),
        change: cloneAndFreezePlainData({ type: "replaced" }),
      };
    },
    getSnapshot(instance) {
      return cloneAndFreezePlainData(instance);
    },
  };
}

async function fixture(options = {}) {
  const app = createScopeController({ label: "semantic-root" });
  const plugin = createScopeController({ label: "provider" });
  const requester = createScopeController({ label: "requester" });
  const registry = createDomainRegistry();
  const key = defineDomainKey({ id: options.domainId || "fake" });
  const postCommit = [];
  const facade = registry.createFacade({
    scope: plugin.scope,
    stage: (definition) => plugin.stage(definition),
    enqueuePostCommit: (callback) => postCommit.push(callback),
  });
  const registration = facade.provide(key, options.provider || fakeProvider());
  await Promise.all([app.commit(), requester.commit()]);
  const entries = createEntryStore({ applicationController: app, domainRegistry: registry, onError: options.onError });
  return {
    app,
    plugin,
    requester,
    registry,
    entries,
    key,
    facade,
    registration,
    async activate() {
      await plugin.commit();
      for (const callback of postCommit.splice(0)) callback();
    },
  };
}

describe("Phase 4D-A domain foundation", () => {
  it("uses frozen typed domain identities and rejects arbitrary strings", () => {
    const key = defineDomainKey({ id: "sample-domain" });
    expect(key).toEqual({ id: "sample-domain" });
    expect(Object.isFrozen(key)).toBe(true);
    expect(() => defineDomainKey({ id: "Bad Domain" })).toThrowError(expect.objectContaining({ code: semanticErrorCodes.domainKeyInvalid }));
  });

  it("keeps staged providers invisible, publishes after commit, and rolls back cleanly", async () => {
    const value = await fixture();
    expect(value.registry.inspect()).toEqual([]);
    expect(() => value.registry.resolve(value.key)).toThrowError(expect.objectContaining({ code: semanticErrorCodes.providerUnavailable }));
    await value.activate();
    expect(value.registry.inspect()).toMatchObject([{ domainId: "fake", registrationId: value.registration.registrationId }]);

    const rollback = createScopeController({ label: "rollback-provider" });
    const otherKey = defineDomainKey({ id: "rollback" });
    value.registry.createFacade({ scope: rollback.scope, stage: (definition) => rollback.stage(definition) })
      .provide(otherKey, fakeProvider());
    await rollback.abort();
    expect(() => value.registry.resolve(otherKey)).toThrowError(expect.objectContaining({ code: semanticErrorCodes.providerUnavailable }));
  });

  it("rejects duplicate providers transactionally", async () => {
    const value = await fixture();
    await value.activate();
    const duplicate = createScopeController({ label: "duplicate" });
    value.registry.createFacade({ scope: duplicate.scope, stage: (definition) => duplicate.stage(definition) })
      .provide(value.key, fakeProvider());
    await expect(duplicate.commit()).rejects.toMatchObject({ code: "OWNERSHIP_STAGE_INVALID" });
    expect(value.registry.inspect()).toHaveLength(1);
  });
});

describe("Phase 4D-A EntryStore", () => {
  it("creates immutable app-owned entries without retaining caller mutation", async () => {
    const value = await fixture();
    await value.activate();
    const input = { nested: { values: [1, 2] } };
    const entry = await value.entries.create(value.requester.scope, value.key, input);
    input.nested.values.push(3);
    await value.requester.close();

    expect(entry).toEqual({ id: 1, domain: value.key, visible: true });
    expect(Object.isFrozen(entry)).toBe(true);
    const domain = value.entries.getDomainView(entry.id, value.key);
    expect(domain.revision).toBe(1);
    expect(domain.snapshot).toEqual({ nested: { values: [1, 2] } });
    expect(Object.isFrozen(domain.snapshot.nested.values)).toBe(true);
    expect(() => domain.snapshot.nested.values.push(4)).toThrow();
    expect(value.entries.get(entry.id)).toEqual(entry);
  });

  it("increments revision once, preserves old snapshots, and rejects stale updates", async () => {
    const value = await fixture();
    await value.activate();
    const entry = await value.entries.create(value.requester.scope, value.key, { count: 1 });
    const original = value.entries.getDomainView(entry.id, value.key);
    const updated = await value.entries.update(value.requester.scope, entry.id, value.key, {
      type: "patch", patch: { count: 2 },
    }, { expectedRevision: 1 });

    expect(updated.revision).toBe(2);
    expect(updated.snapshot.count).toBe(2);
    expect(original.snapshot.count).toBe(1);
    await expect(value.entries.update(value.requester.scope, entry.id, value.key, {
      type: "patch", patch: { count: 3 },
    }, { expectedRevision: 1 })).rejects.toMatchObject({ code: semanticErrorCodes.entryStaleRevision });
    expect(value.entries.getDomainView(entry.id, value.key).revision).toBe(2);
  });

  it("does not revise for visibility or no-op commands and preserves state on failure", async () => {
    const value = await fixture();
    await value.activate();
    const entry = await value.entries.create(value.requester.scope, value.key, { count: 1 });
    await value.entries.setVisible(value.requester.scope, entry.id, false);
    expect(value.entries.getDomainView(entry.id, value.key).revision).toBe(1);
    expect((await value.entries.update(value.requester.scope, entry.id, value.key, { type: "noop" }, { expectedRevision: 1 })).revision).toBe(1);
    await expect(value.entries.update(value.requester.scope, entry.id, value.key, { type: "fail" }, { expectedRevision: 1 })).rejects.toThrow("mutation failed");
    expect(value.entries.getDomainView(entry.id, value.key)).toMatchObject({ revision: 1, snapshot: { count: 1 } });
  });

  it("serializes overlapping updates so async completion cannot win", async () => {
    const gate = deferred();
    const value = await fixture({ provider: fakeProvider({ mutateGate: gate }) });
    await value.activate();
    const entry = await value.entries.create(value.requester.scope, value.key, { count: 1 });
    const first = value.entries.update(value.requester.scope, entry.id, value.key, { type: "patch", patch: { count: 2 } }, { expectedRevision: 1 });
    const second = value.entries.update(value.requester.scope, entry.id, value.key, { type: "patch", patch: { count: 3 } }, { expectedRevision: 1 });
    gate.resolve();
    await expect(first).resolves.toMatchObject({ revision: 2, snapshot: { count: 2 } });
    await expect(second).rejects.toMatchObject({ code: semanticErrorCodes.entryStaleRevision });
  });

  it("holds one continuous lease through async creation and releases it after deletion", async () => {
    const gate = deferred();
    const value = await fixture({ provider: fakeProvider({ createGate: gate }) });
    await value.activate();
    const creating = value.entries.create(value.requester.scope, value.key, { value: 1 });
    await vi.waitFor(() => expect(value.registry.inspect()[0].creationCount).toBe(1));
    await expect(value.registration.dispose()).rejects.toMatchObject({ code: semanticErrorCodes.providerInUse });
    gate.resolve();
    const entry = await creating;
    expect(value.registry.inspect()[0]).toMatchObject({ creationCount: 0, entryCount: 1, entryIds: [entry.id] });
    await expect(value.registration.dispose()).rejects.toMatchObject({ code: semanticErrorCodes.providerInUse });
    await value.entries.remove(value.app.scope, entry.id);
    expect(value.registry.inspect()[0].entryCount).toBe(0);
    await expect(value.registration.dispose()).resolves.toBeUndefined();
  });

  it("releases a creation lease after failed preparation and never reuses its ID", async () => {
    const provider = fakeProvider();
    provider.prepareCreate = vi.fn(async ({ value }) => {
      if (value.fail) throw new Error("create failed");
      return { instance: structuredClone(value), snapshot: cloneAndFreezePlainData(value) };
    });
    const value = await fixture({ provider });
    await value.activate();
    await expect(value.entries.create(value.requester.scope, value.key, { fail: true })).rejects.toThrow("create failed");
    expect(value.registry.inspect()[0]).toMatchObject({ creationCount: 0, entryCount: 0 });
    const entry = await value.entries.create(value.requester.scope, value.key, { ok: true });
    expect(entry.id).toBe(2);
  });

  it("disposes a rejected prepared candidate and publishes no partial entry", async () => {
    const dispose = vi.fn();
    const provider = fakeProvider();
    provider.prepareCreate = vi.fn(async () => ({
      instance: { value: 1 },
      snapshot: { mutable: true },
      dispose,
    }));
    const value = await fixture({ provider });
    await value.activate();
    await expect(value.entries.create(value.requester.scope, value.key, { value: 1 }))
      .rejects.toMatchObject({ code: semanticErrorCodes.providerResultInvalid });
    expect(dispose).toHaveBeenCalledOnce();
    expect(value.entries.list()).toEqual([]);
    expect(value.registry.inspect()[0]).toMatchObject({ creationCount: 0, entryCount: 0 });
  });

  it("revokes lookup before failed cleanup and retains the provider lease", async () => {
    const dispose = vi.fn(async () => { throw new Error("cleanup failed"); });
    const diagnostics = [];
    const value = await fixture({ provider: fakeProvider({ dispose }), onError: (error) => diagnostics.push(error) });
    await value.activate();
    const entry = await value.entries.create(value.requester.scope, value.key, { value: 1 });
    await expect(value.entries.remove(value.requester.scope, entry.id)).rejects.toMatchObject({
      code: semanticErrorCodes.cleanupFailed,
      committed: true,
    });
    expect(value.entries.get(entry.id)).toBeNull();
    expect(value.entries.inspect().residuals).toMatchObject([{ id: entry.id, state: "cleanup-failed" }]);
    expect(value.registry.inspect()[0]).toMatchObject({ entryCount: 1, entryIds: [entry.id] });
    expect(diagnostics).toHaveLength(1);
  });

  it("delivers immutable ordered events, isolates failures, and queues reentrant mutation", async () => {
    const errors = [];
    const value = await fixture({ onError: (error) => errors.push(error) });
    await value.activate();
    const events = [];
    value.entries.subscribe(value.requester.scope, (event) => {
      if (Array.isArray(event)) return;
      events.push(event.type);
      if (event.type === "created") value.entries.setVisible(value.requester.scope, event.current.id, false);
    }, { emitCurrent: false });
    value.entries.subscribe(value.requester.scope, (event) => {
      if (!Array.isArray(event)) throw new Error("listener failed");
    }, { emitCurrent: false });
    const entry = await value.entries.create(value.requester.scope, value.key, { value: 1 });
    await vi.waitFor(() => expect(value.entries.get(entry.id).visible).toBe(false));
    await value.entries.remove(value.requester.scope, entry.id);
    expect(events).toEqual(["created", "visibility-changed", "removed"]);
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects domain mismatch and lets delete win before a later update", async () => {
    const value = await fixture();
    await value.activate();
    const entry = await value.entries.create(value.requester.scope, value.key, { value: 1 });
    const other = defineDomainKey({ id: "other" });
    expect(() => value.entries.getDomainView(entry.id, other)).toThrowError(expect.objectContaining({ code: semanticErrorCodes.entryDomainMismatch }));
    const removing = value.entries.remove(value.requester.scope, entry.id);
    const updating = value.entries.update(value.requester.scope, entry.id, value.key, { type: "patch", patch: { value: 2 } }, { expectedRevision: 1 });
    await expect(removing).resolves.toMatchObject({ id: entry.id });
    await expect(updating).rejects.toMatchObject({ code: semanticErrorCodes.entryNotFound });
    await expect(value.entries.remove(value.requester.scope, entry.id)).resolves.toBeNull();
  });
});

describe("Phase 4D-A runtime provider-removal preflight", () => {
  it("blocks unuse before provider Scope death and permits reinstall after entry deletion", async () => {
    const key = defineDomainKey({ id: "runtime-fake" });
    const registry = createDomainRegistry();
    const app = createScopeController({ label: "semantic-root" });
    const requester = createScopeController({ label: "requester" });
    await Promise.all([app.commit(), requester.commit()]);
    const entries = createEntryStore({ applicationController: app, domainRegistry: registry });
    const registrations = [];
    const plugin = {
      id: "x-provider",
      setup(context) {
        registrations.push(context.domains.provide(key, fakeProvider()));
      },
    };
    const runtime = createPluginRuntime({
      capabilityFactories: { domains: (input) => registry.createFacade(input) },
    });

    await runtime.use(plugin);
    const entry = await entries.create(requester.scope, key, { value: 1 });
    await expect(runtime.unuse("x-provider")).rejects.toMatchObject({ code: semanticErrorCodes.providerInUse });
    expect(runtime.has("x-provider")).toBe(true);
    expect(registry.resolve(key).registration.owner.alive).toBe(true);
    await entries.remove(requester.scope, entry.id);
    await runtime.unuse("x-provider");
    expect(runtime.has("x-provider")).toBe(false);
    await runtime.use(plugin);
    expect(registrations[1].registrationId).not.toBe(registrations[0].registrationId);
  });
});

describe("Phase 4D-A residual cleanup and per-entry races", () => {
  it("releases the lease after creation preparation failure with successful cleanup", async () => {
    const cleanup = vi.fn();
    const provider = fakeProvider();
    provider.prepareCreate = vi.fn(async ({ entryScope }) => {
      entryScope.defer(cleanup, { retry: "safe" });
      throw new Error("prepare failed");
    });
    const value = await fixture({ provider });
    await value.activate();

    await expect(value.entries.create(value.requester.scope, value.key, {})).rejects.toThrow("prepare failed");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(value.entries.inspect().residuals).toEqual([]);
    expect(value.registry.inspect()[0]).toMatchObject({ creationCount: 0, entryCount: 0 });
  });

  it("retains a failed-creation lease until private residual retry succeeds", async () => {
    const original = new Error("prepare failed");
    const cleanup = vi.fn()
      .mockRejectedValueOnce(new Error("cleanup failed"))
      .mockResolvedValueOnce(undefined);
    const provider = fakeProvider();
    provider.prepareCreate = vi.fn(async ({ entryScope }) => {
      entryScope.defer(cleanup, { retry: "safe" });
      throw original;
    });
    const value = await fixture({ provider });
    await value.activate();

    await expect(value.entries.create(value.requester.scope, value.key, {})).rejects.toMatchObject({
      code: semanticErrorCodes.cleanupFailed,
      committed: false,
      details: { originalError: { message: "prepare failed" } },
    });
    expect(value.entries.list()).toEqual([]);
    expect(value.entries.inspect().residuals).toMatchObject([{
      id: 1,
      phase: "creation",
      providerRegistrationId: value.registration.registrationId,
      originalError: { message: "prepare failed" },
      cleanupError: { message: expect.stringContaining("cleanup failed") },
    }]);
    expect(value.registry.inspect()[0]).toMatchObject({ creationCount: 1, entryCount: 0 });
    await expect(value.registration.dispose()).rejects.toMatchObject({ code: semanticErrorCodes.providerInUse });

    await expect(value.entries.retryCleanup(value.app.scope, 1)).resolves.toEqual({ id: 1, phase: "creation", cleaned: true });
    await expect(value.entries.retryCleanup(value.app.scope, 1)).resolves.toBeNull();
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(value.entries.inspect().residuals).toEqual([]);
    expect(value.registry.inspect()[0]).toMatchObject({ creationCount: 0, entryCount: 0 });
    await expect(value.registration.dispose()).resolves.toBeUndefined();

    const replacementOwner = createScopeController({ label: "replacement-provider" });
    const replacement = value.registry.createFacade({
      scope: replacementOwner.scope,
      stage: (definition) => replacementOwner.stage(definition),
    }).provide(value.key, fakeProvider());
    await replacementOwner.commit();
    expect(replacement.registrationId).not.toBe(value.registration.registrationId);
  });

  it("retries failed deletion cleanup without resurrecting authority or double disposal", async () => {
    const cleanup = vi.fn()
      .mockRejectedValueOnce(new Error("delete cleanup failed"))
      .mockResolvedValueOnce(undefined);
    const value = await fixture({ provider: fakeProvider({ dispose: cleanup }) });
    await value.activate();
    const entry = await value.entries.create(value.requester.scope, value.key, { value: 1 });

    await expect(value.entries.remove(value.requester.scope, entry.id)).rejects.toMatchObject({
      code: semanticErrorCodes.cleanupFailed,
      committed: true,
    });
    expect(value.entries.get(entry.id)).toBeNull();
    expect(value.entries.list()).toEqual([]);
    expect(value.registry.inspect()[0]).toMatchObject({ entryCount: 1, entryIds: [entry.id] });
    await expect(value.registration.dispose()).rejects.toMatchObject({ code: semanticErrorCodes.providerInUse });

    await expect(value.entries.retryCleanup(value.app.scope, entry.id)).resolves.toEqual({ id: entry.id, phase: "deletion", cleaned: true });
    expect(value.entries.get(entry.id)).toBeNull();
    await expect(value.entries.retryCleanup(value.app.scope, entry.id)).resolves.toBeNull();
    await expect(value.entries.remove(value.app.scope, entry.id)).resolves.toBeNull();
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(value.registry.inspect()[0].entryCount).toBe(0);
    await expect(value.registration.dispose()).resolves.toBeUndefined();
  });

  it("clear removes in reverse insertion order and emits one cleared event", async () => {
    const order = [];
    const provider = fakeProvider();
    provider.prepareCreate = vi.fn(async ({ entryId, value }) => ({
      instance: structuredClone(value),
      snapshot: cloneAndFreezePlainData(value),
      dispose: () => order.push(entryId),
    }));
    const value = await fixture({ provider });
    await value.activate();
    const events = [];
    value.entries.subscribe(value.requester.scope, (event) => {
      if (!Array.isArray(event)) events.push(event);
    }, { emitCurrent: false });
    await value.entries.create(value.requester.scope, value.key, { value: 1 });
    await value.entries.create(value.requester.scope, value.key, { value: 2 });
    await value.entries.create(value.requester.scope, value.key, { value: 3 });
    events.length = 0;

    const removed = await value.entries.clear(value.requester.scope);
    expect(order).toEqual([3, 2, 1]);
    expect(removed.map(({ id }) => id)).toEqual([3, 2, 1]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "cleared" });
    expect(events[0].removed.map(({ id }) => id)).toEqual([3, 2, 1]);
  });

  it("clear continues after cleanup failure and retains only failed residuals", async () => {
    const order = [];
    const provider = fakeProvider();
    provider.prepareCreate = vi.fn(async ({ entryId, value }) => ({
      instance: structuredClone(value),
      snapshot: cloneAndFreezePlainData(value),
      dispose: entryId === 2
        ? vi.fn().mockImplementationOnce(async () => { order.push(entryId); throw new Error("two failed"); }).mockImplementationOnce(async () => { order.push(entryId); })
        : () => order.push(entryId),
    }));
    const value = await fixture({ provider });
    await value.activate();
    await value.entries.create(value.requester.scope, value.key, { value: 1 });
    await value.entries.create(value.requester.scope, value.key, { value: 2 });
    await value.entries.create(value.requester.scope, value.key, { value: 3 });

    await expect(value.entries.clear(value.requester.scope)).rejects.toMatchObject({
      code: semanticErrorCodes.cleanupFailed,
      committed: true,
    });
    expect(order).toEqual([3, 2, 1]);
    expect(value.entries.list()).toEqual([]);
    expect(value.entries.inspect().residuals).toMatchObject([{ id: 2, phase: "deletion" }]);
    expect(value.registry.inspect()[0]).toMatchObject({ entryCount: 1, entryIds: [2] });
    await value.entries.retryCleanup(value.app.scope, 2);
    expect(order).toEqual([3, 2, 1, 2]);
  });

  it("does not let a slow update on entry A block entry B", async () => {
    const gate = deferred();
    const provider = fakeProvider();
    provider.prepareMutation = vi.fn(async ({ currentInstance, command }) => {
      if (command.wait) await gate.promise;
      const nextInstance = { ...currentInstance, value: command.value };
      return {
        changed: true,
        nextInstance,
        nextSnapshot: cloneAndFreezePlainData(nextInstance),
        change: cloneAndFreezePlainData({ value: command.value }),
      };
    });
    const value = await fixture({ provider });
    await value.activate();
    const first = await value.entries.create(value.requester.scope, value.key, { value: 0 });
    const second = await value.entries.create(value.requester.scope, value.key, { value: 0 });
    const slow = value.entries.update(value.requester.scope, first.id, value.key, { wait: true, value: 1 }, { expectedRevision: 1 });
    const independent = value.entries.update(value.requester.scope, second.id, value.key, { value: 2 }, { expectedRevision: 1 });

    await expect(independent).resolves.toMatchObject({ revision: 2, snapshot: { value: 2 } });
    expect(value.entries.getDomainView(first.id, value.key).revision).toBe(1);
    gate.resolve();
    await expect(slow).resolves.toMatchObject({ revision: 2, snapshot: { value: 1 } });
  });

  it("keeps provider removal blocked until in-flight deletion cleanup releases the lease", async () => {
    const cleanupGate = deferred();
    const cleanupStarted = deferred();
    const cleanup = vi.fn(async () => {
      cleanupStarted.resolve();
      await cleanupGate.promise;
    });
    const value = await fixture({ provider: fakeProvider({ dispose: cleanup }) });
    await value.activate();
    const entry = await value.entries.create(value.requester.scope, value.key, { value: 1 });

    const removing = value.entries.remove(value.requester.scope, entry.id);
    await cleanupStarted.promise;
    expect(value.entries.get(entry.id)).toBeNull();
    await expect(value.registration.dispose()).rejects.toMatchObject({ code: semanticErrorCodes.providerInUse });
    cleanupGate.resolve();
    await expect(removing).resolves.toMatchObject({ id: entry.id });
    await expect(value.registration.dispose()).resolves.toBeUndefined();
  });

  it("orders update before delete and retains the update notification before removal", async () => {
    const gate = deferred();
    const provider = fakeProvider();
    provider.prepareMutation = vi.fn(async ({ currentInstance }) => {
      await gate.promise;
      const nextInstance = { ...currentInstance, value: 2 };
      return {
        changed: true,
        nextInstance,
        nextSnapshot: cloneAndFreezePlainData(nextInstance),
        change: cloneAndFreezePlainData({ type: "updated" }),
      };
    });
    const value = await fixture({ provider });
    await value.activate();
    const entry = await value.entries.create(value.requester.scope, value.key, { value: 1 });
    const events = [];
    value.entries.subscribe(value.requester.scope, (event) => {
      if (!Array.isArray(event)) events.push(event);
    }, { emitCurrent: false });
    const update = value.entries.update(value.requester.scope, entry.id, value.key, {}, { expectedRevision: 1 });
    const remove = value.entries.remove(value.requester.scope, entry.id);
    gate.resolve();

    await expect(update).resolves.toMatchObject({ revision: 2 });
    await expect(remove).resolves.toMatchObject({ id: entry.id });
    expect(events.map(({ type }) => type)).toEqual(["domain-changed", "removed"]);
    expect(events[0]).toMatchObject({ previousRevision: 1, revision: 2, change: { type: "updated" } });
  });

  it("disposes each replaced provider instance exactly once", async () => {
    const firstDispose = vi.fn();
    const secondDispose = vi.fn();
    const provider = fakeProvider({ dispose: firstDispose });
    provider.prepareMutation = vi.fn(async () => ({
      changed: true,
      nextInstance: { value: 2 },
      nextSnapshot: cloneAndFreezePlainData({ value: 2 }),
      change: cloneAndFreezePlainData({ type: "updated" }),
      disposeNext: secondDispose,
    }));
    const value = await fixture({ provider });
    await value.activate();
    const entry = await value.entries.create(value.requester.scope, value.key, { value: 1 });

    await value.entries.update(value.requester.scope, entry.id, value.key, {}, { expectedRevision: 1 });
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).not.toHaveBeenCalled();
    await value.entries.remove(value.requester.scope, entry.id);
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).toHaveBeenCalledOnce();
  });

  it("suppresses dead subscribers and preserves reentrant delivery order", async () => {
    const value = await fixture();
    await value.activate();
    const dead = createScopeController({ label: "dead-subscriber" });
    await dead.commit();
    const deadListener = vi.fn();
    value.entries.subscribe(dead.scope, deadListener, { emitCurrent: false });
    await dead.close();
    const order = [];
    value.entries.subscribe(value.requester.scope, (event) => {
      if (Array.isArray(event)) return;
      order.push(event.type);
      if (event.type === "created") value.entries.setVisible(value.requester.scope, event.current.id, false);
    }, { emitCurrent: false });

    const entry = await value.entries.create(value.requester.scope, value.key, { value: 1 });
    await vi.waitFor(() => expect(value.entries.get(entry.id).visible).toBe(false));
    expect(deadListener).not.toHaveBeenCalled();
    expect(order).toEqual(["created", "visibility-changed"]);
  });
});
