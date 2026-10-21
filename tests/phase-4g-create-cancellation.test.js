import { describe, expect, it, vi } from "vitest";
import { createScopeController } from "../src/ownership/index.js";
import { createDomainRegistry, defineDomainKey, cloneAndFreezePlainData } from "../src/domains/index.js";
import { createEntryStore } from "../src/entries/index.js";
import { createPhotoProvider } from "../src/plugins/domains/photo-provider.js";
import { createPluginRuntime } from "../src/plugins/runtime/index.js";

const gate = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const tick = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const result = (dispose) => ({ instance: {}, snapshot: Object.freeze({}), ...(dispose ? { dispose } : {}) });
async function fixture(prepareCreate = () => result()) {
  const app = createScopeController({ label: "entries" });
  const requester = createScopeController({ label: "creator" });
  await Promise.all([app.commit(), requester.commit()]);
  const registry = createDomainRegistry();
  const key = defineDomainKey({ id: "test-create" });
  const provider = {
    prepareCreate,
    prepareMutation() { return { changed: false }; },
    getSnapshot() { return cloneAndFreezePlainData({}); },
  };
  const runtime = createPluginRuntime({ capabilityFactories: { domains: (input) => registry.createFacade(input) } });
  await runtime.use({ id: "x-create-provider", setup(context) { context.domains.provide(key, provider); } });
  const entries = createEntryStore({ applicationController: app, domainRegistry: registry });
  return { app, requester, registry, runtime, entries, key,
    create: (signal) => entries.create(requester.scope, key, {}, signal === undefined ? {} : { signal }),
  };
}

describe("Phase 4G domain-create cancellation", () => {
  it("rejects invalid and pre-aborted signals before reserving IDs or preparing", async () => {
    const prepare = vi.fn(() => result());
    const f = await fixture(prepare);
    for (const signal of [null, {}, { aborted: false, addEventListener() {} }]) {
      await expect(f.create(signal)).rejects.toMatchObject({ code: "ENTRY_INVALID", committed: false });
    }
    const controller = new AbortController();
    controller.abort("cancel");
    await expect(f.create(controller.signal)).rejects.toMatchObject({ code: "ENTRY_CREATION_ABORTED", committed: false, cause: "cancel" });
    expect(prepare).not.toHaveBeenCalled();
    expect(f.registry.inspect()[0].creationCount).toBe(0);
    expect((await f.create()).id).toBe(1);
  });

  it.each(["application", "requester", "cancellation"])(
    "does not invoke Photo preparation when %s closes before its microtask", async (loss) => {
      const acquire = vi.fn(() => "blob:never");
      const revoke = vi.fn();
      const photo = createPhotoProvider({ createObjectURL: acquire, revokeObjectURL: revoke });
      const prepare = vi.fn((input) => photo.prepareCreate({ ...input, value: { blob: new Blob(["photo"]) } }));
      const f = await fixture(prepare);
      const controller = new AbortController();
      const outcome = f.create(controller.signal).catch((error) => error);
      let closing;
      if (loss === "application") closing = f.app.close();
      if (loss === "requester") closing = f.requester.close();
      if (loss === "cancellation") controller.abort("before invocation");
      const error = await outcome;
      await closing;
      expect(error.code).toBe(loss === "cancellation" ? "ENTRY_CREATION_ABORTED" : "SCOPE_NOT_ACTIVE");
      expect(prepare).not.toHaveBeenCalled();
      expect(acquire).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
      expect(f.entries.list()).toEqual([]);
      expect(f.entries.inspect().residuals).toEqual([]);
      expect(f.registry.inspect()[0]).toMatchObject({ creationCount: 0, entryCount: 0 });
      await f.runtime.unuse("x-create-provider");
    },
  );

  it("reserves Photo cleanup before URL acquisition reenters application closure", async () => {
    let f, closing;
    const revoke = vi.fn();
    const photo = createPhotoProvider({ createObjectURL() {
      closing = f.app.close(); return "blob:reentrant";
    }, revokeObjectURL: revoke });
    f = await fixture((input) => photo.prepareCreate({ ...input, value: { blob: new Blob(["photo"]) } }));
    await expect(f.create()).rejects.toMatchObject({ code: "SCOPE_NOT_ACTIVE" });
    await closing;
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:reentrant");
    expect(f.entries.list()).toEqual([]); expect(f.entries.inspect().residuals).toEqual([]);
    expect(f.registry.inspect()[0].creationCount).toBe(0);
    await f.runtime.unuse("x-create-provider");
  });

  it("retains the lease until non-cooperative preparation and late cleanup settle, preserving ID gaps", async () => {
    const preparation = gate(), cleanup = gate();
    const dispose = vi.fn(() => cleanup.promise);
    let providerSignal;
    const f = await fixture(async ({ signal }) => { providerSignal = signal; await preparation.promise; return result(dispose); });
    const controller = new AbortController();
    const outcome = f.create(controller.signal).catch((error) => error);
    await tick();
    controller.abort("cancel late");
    expect(providerSignal.aborted).toBe(true);
    await expect(f.runtime.unuse("x-create-provider")).rejects.toMatchObject({ code: "DOMAIN_PROVIDER_IN_USE" });
    expect(f.registry.inspect()[0].creationCount).toBe(1);
    expect(f.entries.list()).toEqual([]);
    preparation.resolve();
    await tick();
    expect(dispose).toHaveBeenCalledOnce();
    expect(f.registry.inspect()[0].creationCount).toBe(1);
    cleanup.resolve();
    expect(await outcome).toMatchObject({ code: "ENTRY_CREATION_ABORTED", committed: false });
    expect(f.entries.list()).toEqual([]);
    expect(f.registry.inspect()[0].creationCount).toBe(0);
    expect((await f.create()).id).toBe(2);
  });

  it("preserves cancellation as original cause when cooperative preparation rejects", async () => {
    const started = gate();
    const f = await fixture(({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("provider cancelled")), { once: true });
      started.resolve();
    }));
    const controller = new AbortController();
    const outcome = f.create(controller.signal).catch((error) => error);
    await started.promise;
    controller.abort("user cancelled");
    expect(await outcome).toMatchObject({ code: "ENTRY_CREATION_ABORTED", committed: false, cause: { message: "provider cancelled" } });
    expect(f.registry.inspect()[0].creationCount).toBe(0);
  });

  it("recovers late resources after application closure without registering in a dead scope", async () => {
    const preparation = gate(), started = gate();
    const dispose = vi.fn();
    const f = await fixture(async () => { started.resolve(); await preparation.promise; return result(dispose); });
    const outcome = f.create().catch((error) => error);
    await started.promise;
    let closed = false;
    const closing = f.app.close().then(() => { closed = true; });
    await tick();
    expect(closed).toBe(false);
    expect(f.registry.inspect()[0].creationCount).toBe(1);
    preparation.resolve();
    await closing;
    expect((await outcome).code).toBe("SCOPE_NOT_ACTIVE");
    expect(dispose).toHaveBeenCalledOnce();
    expect(f.entries.list()).toEqual([]);
    expect(f.registry.inspect()[0].creationCount).toBe(0);
  });

  it("forwards requester closure without weakening requester lifetime guards", async () => {
    const preparation = gate(), started = gate();
    let forwarded;
    const dispose = vi.fn();
    const f = await fixture(async ({ signal }) => { forwarded = signal; started.resolve(); await preparation.promise; return result(dispose); });
    const outcome = f.create().catch((error) => error);
    await started.promise;
    await f.requester.close();
    expect(forwarded.aborted).toBe(true);
    preparation.resolve();
    expect((await outcome).code).toBe("SCOPE_NOT_ACTIVE");
    expect(dispose).toHaveBeenCalledOnce();
    expect(f.entries.list()).toEqual([]);
  });

  it("checks cancellation after provider result getters, just before publication", async () => {
    const controller = new AbortController();
    const dispose = vi.fn();
    let reads = 0;
    const f = await fixture(() => ({
      instance: {}, dispose,
      get snapshot() {
        // First read validates. The next read captures publication data.
        if (++reads === 2) controller.abort("at boundary");
        return Object.freeze({});
      },
    }));
    await expect(f.create(controller.signal)).rejects.toMatchObject({ code: "ENTRY_CREATION_ABORTED", committed: false });
    expect(f.entries.list()).toEqual([]);
    expect(dispose).toHaveBeenCalledOnce();
    expect(f.registry.inspect()[0].creationCount).toBe(0);
  });

  it("never rolls back cancellation from a post-commit observer and removes forwarding listeners", async () => {
    const dispose = vi.fn();
    const f = await fixture(() => result(dispose));
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, "addEventListener");
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    f.entries.subscribe(f.requester.scope, (event) => {
      if (event.type === "created") controller.abort("after commit");
    }, { emitCurrent: false });
    const entry = await f.create(controller.signal);
    expect(f.entries.get(entry.id)).toEqual(entry);
    expect(f.registry.inspect()[0]).toMatchObject({ creationCount: 0, entryCount: 1 });
    expect(dispose).not.toHaveBeenCalled();
    expect(added).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledWith("abort", added.mock.calls[0][1]);
  });

  it("reports cancellation delivered while failed preparation rolls back asynchronously", async () => {
    const cleanup = gate(), cleaning = gate();
    const f = await fixture(({ entryScope }) => {
      entryScope.defer(async () => { cleaning.resolve(); await cleanup.promise; }, { retry: "safe" });
      throw new Error("preparation failed");
    });
    const controller = new AbortController();
    const outcome = f.create(controller.signal).catch((error) => error);
    await cleaning.promise;
    controller.abort("during rollback");
    expect(f.registry.inspect()[0].creationCount).toBe(1);
    cleanup.resolve();
    expect(await outcome).toMatchObject({ code: "ENTRY_CREATION_ABORTED", committed: false,
      cause: { message: "preparation failed" } });
    expect(f.registry.inspect()[0].creationCount).toBe(0);
  });

  it("cancellation plus URL revoke failure retains creation residual/lease until successful retry", async () => {
    const preparation = gate();
    const revoke = vi.fn(() => { throw new Error("URL revocation failed"); });
    const photo = createPhotoProvider({ createObjectURL: () => "blob:private", revokeObjectURL: revoke, prepareGate: preparation.promise });
    const f = await fixture((input) => photo.prepareCreate({ ...input, value: { blob: new Blob(["photo"]) } }));
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    const outcome = f.create(controller.signal).catch((error) => error);
    await tick();
    controller.abort("cancel photo");
    preparation.resolve();
    const failure = await outcome;
    expect(failure).toMatchObject({ code: "SEMANTIC_CLEANUP_FAILED", committed: false,
      details: { originalError: { code: "ENTRY_CREATION_ABORTED" } } });
    expect(f.entries.inspect().residuals).toMatchObject([{ phase: "creation", committed: false,
      originalError: { code: "ENTRY_CREATION_ABORTED" } }]);
    expect(f.entries.list()).toEqual([]);
    expect(f.registry.inspect()[0].creationCount).toBe(1);
    expect(removed).toHaveBeenCalled();
    await expect(f.runtime.unuse("x-create-provider")).rejects.toMatchObject({ code: "DOMAIN_PROVIDER_IN_USE" });
    await expect(f.entries.retryCleanup(f.app.scope, 1)).rejects.toMatchObject({ code: "SEMANTIC_CLEANUP_FAILED" });
    expect(f.registry.inspect()[0].creationCount).toBe(1);
    revoke.mockImplementation(() => {});
    await f.entries.retryCleanup(f.app.scope, 1);
    expect(f.entries.inspect().residuals).toEqual([]);
    expect(f.registry.inspect()[0].creationCount).toBe(0);
    expect(f.entries.list()).toEqual([]);
    await f.runtime.unuse("x-create-provider");
  });

  it("handles cancellation during listener registration without leaked forwarding listeners", async () => {
    const controller = new AbortController();
    const nativeAdd = controller.signal.addEventListener.bind(controller.signal);
    let listener;
    vi.spyOn(controller.signal, "addEventListener").mockImplementation((type, fn, options) => {
      listener = fn;
      controller.abort("registration race");
      nativeAdd(type, fn, options);
    });
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    const f = await fixture();
    await expect(f.create(controller.signal)).rejects.toMatchObject({ code: "ENTRY_CREATION_ABORTED" });
    expect(removed).toHaveBeenCalledWith("abort", listener);
    expect(f.entries.list()).toEqual([]);
    expect(f.registry.inspect()[0].creationCount).toBe(0);
  });
});
