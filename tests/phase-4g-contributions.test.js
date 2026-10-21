import { describe, expect, it, vi } from "vitest";
import { createDomainContributions } from "../src/ui/domain-contributions.js";
import { createScopeController } from "../src/ownership/index.js";
import { defineDomainKey } from "../src/domains/index.js";

function facade(host, controller, queue = []) {
  return host.createFacade({ scope: controller.scope, stage: (d) => controller.stage(d), enqueuePostCommit: (fn) => queue.push(fn) });
}
async function commit(controller, queue) { await controller.commit(); queue.splice(0).forEach((fn) => fn()); }
describe("Phase 4G fixed typed domain contributions", () => {
  it.each(["layers", "popup"])("stages %s by exact key and rejects competing primaries without publication", async (kind) => {
    const host = createDomainContributions(), owner = createScopeController(), consumer = createScopeController(), q = [];
    const key = defineDomainKey({ id: "photo" }), other = defineDomainKey({ id: "photo" });
    await consumer.commit(); const point = facade(host, consumer)[kind];
    const events = vi.fn(); point.subscribe(events, { emitCurrent: false });
    facade(host, owner, q)[kind].register(key, { mount() {} });
    expect(point.get(key)).toBeNull(); await commit(owner, q);
    expect(point.get(other)).toBeNull(); expect(point.get(key)).not.toBeNull(); expect(events).toHaveBeenCalledTimes(1);
    const duplicate = createScopeController(); facade(host, duplicate)[kind].register(key, { mount() {} });
    await expect(duplicate.commit()).rejects.toMatchObject({ code: "OWNERSHIP_STAGE_INVALID" });
    await duplicate.close(); expect(point.get(key)).not.toBeNull();
    const closing = owner.close(); expect(point.get(key)).toBeNull(); await closing; await consumer.close();
  });
  it.each(["layers", "popup"])("rejects duplicate %s adapters in the same staged setup", async (kind) => {
    const host = createDomainContributions(), owner = createScopeController();
    const point = facade(host, owner)[kind], key = defineDomainKey({ id: "photo" });
    point.register(key, { mount() {} }); point.register(key, { mount() {} });
    await expect(owner.commit()).rejects.toMatchObject({ code: "OWNERSHIP_STAGE_INVALID" });
    await owner.close();
  });
  it("pairs contributor/host lifetimes and refuses stale cached mounts", async () => {
    const host = createDomainContributions(), owner = createScopeController(), consumer = createScopeController(), q = [];
    const key = defineDomainKey({ id: "photo" }), cleanup = vi.fn();
    facade(host, owner, q).popup.register(key, { mount({ scope }) { scope.defer(cleanup, { retry: "safe" }); } });
    await commit(owner, q); await consumer.commit();
    const adapter = facade(host, consumer).popup.get(key), scope = consumer.scope.child();
    adapter.mount({ scope, container: {} }); const closing = owner.close();
    expect(scope.alive).toBe(false); await closing; await scope.dispose(); expect(cleanup).toHaveBeenCalledOnce();
    expect(() => adapter.mount({ scope: consumer.scope.child(), container: {} })).toThrow(); await consumer.close();
  });
  async function mounted(kind, cleanup) {
    const diagnostic = vi.fn(), host = createDomainContributions({ onError: diagnostic });
    const owner = createScopeController({ label: "contributor" }), consumer = createScopeController({ label: "host" }), q = [];
    const key = defineDomainKey({ id: "test-mount" });
    const point = facade(host, owner, q)[kind];
    const descriptor = { supports: () => true, mount({ scope }) { scope.defer(cleanup, { label: "mount-resource", retry: "safe" }); } };
    if (kind === "settings") point.register({ id: "test", descriptor }); else point.register(key, descriptor);
    await commit(owner, q); await consumer.commit();
    const mounts = consumer.createChildController({ label: "mount" });
    const read = facade(host, consumer)[kind];
    const adapter = kind === "settings" ? read.getSnapshot()[0].descriptor : read.get(key);
    adapter.mount({ scope: mounts.scope, container: {} });
    return { owner, consumer, mounts, adapter, diagnostic };
  }
  it.each(["layers", "popup", "settings"].flatMap((kind) => [[kind, "contributor-first"], [kind, "host-first"]]))("%s %s teardown waits for captured asynchronous mount cleanup", async (kind, order) => {
    let finish, started;
    const gate = new Promise((r) => { finish = r; }), invoked = new Promise((r) => { started = r; });
    const cleanup = vi.fn(async () => { started(); await gate; });
    const f = await mounted(kind, cleanup);
    let settled = false;
    const hostClosing = order === "host-first" ? f.mounts.close() : null;
    const closing = f.owner.close().then(() => { settled = true; });
    expect(f.mounts.scope.alive).toBe(false);
    await invoked; for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(settled).toBe(false);
    const repeated = f.owner.close();
    finish(); await closing; await repeated; await hostClosing; expect(cleanup).toHaveBeenCalledOnce();
    await f.owner.close(); await f.consumer.close(); expect(cleanup).toHaveBeenCalledOnce();
  });
  it.each(["layers", "popup", "settings"].flatMap((kind) => [[kind, "contributor-first"], [kind, "host-first"]]))("%s %s cleanup failure is diagnosed, retained and recovered by contributor retry", async (kind, order) => {
    let fail = true;
    const cleanup = vi.fn(() => { if (fail) throw new Error("mount cleanup failed"); });
    const f = await mounted(kind, cleanup);
    if (order === "host-first") await expect(f.mounts.close()).rejects.toMatchObject({ code: "SCOPE_DISPOSAL_FAILED" });
    await expect(f.owner.close()).rejects.toMatchObject({ code: "SCOPE_DISPOSAL_FAILED" });
    expect(f.diagnostic).toHaveBeenCalled();
    expect(f.owner.snapshot()).toMatchObject({ state: "cleanup-failed", residuals: [{ retry: "safe" }] });
    expect(f.mounts.snapshot()).toMatchObject({ state: "cleanup-failed", residuals: [{ label: "mount-resource" }] });
    await expect(f.owner.retryCleanup()).rejects.toMatchObject({ code: "SCOPE_DISPOSAL_FAILED" });
    fail = false; await f.owner.retryCleanup();
    expect(f.owner.snapshot()).toMatchObject({ state: "closed", residuals: [] });
    expect(f.mounts.snapshot()).toMatchObject({ state: "closed", residuals: [] });
    const calls = cleanup.mock.calls.length;
    await f.owner.close(); await f.consumer.close(); expect(cleanup).toHaveBeenCalledTimes(calls);
  });
  it.each(["layers", "popup", "settings"])("%s host-first closure detaches cross-lifetime listeners and is idempotent", async (kind) => {
    const cleanup = vi.fn(), f = await mounted(kind, cleanup);
    const remove = vi.spyOn(f.owner.scope.signal, "removeEventListener");
    await f.mounts.close(); expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    await f.owner.close(); await f.owner.close(); await f.consumer.close();
    expect(cleanup).toHaveBeenCalledOnce();
  });

});
