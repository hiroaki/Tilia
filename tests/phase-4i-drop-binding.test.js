import { describe, expect, it, vi } from "vitest";
import { createScopeController } from "../src/ownership/index.js";
import { createDropTarget } from "../src/ui/drop-target.js";
import { documentFixture } from "./helpers/scoped-dom.js";
async function fixture() {
  const host = createScopeController(), owner = createScopeController(); await host.commit();
  const container = documentFixture().body, queue = [];
  const facade = createDropTarget({ container, hostScope: host.scope })({ scope: owner.scope, stage: (v) => owner.stage(v),
    enqueuePostCommit: (f) => queue.push(f), isInstalling: () => owner.snapshot().state === "open-uncommitted", isActive: () => owner.snapshot().state === "active" });
  const commit = async () => { await owner.commit(); queue.splice(0).forEach((f) => f()); };
  const drop = (files, types = ["Files"]) => {
    const event = new Event("drop", { cancelable: true }); Object.defineProperty(event, "dataTransfer", { value: { files, types } }); container.dispatchEvent(event); return event;
  };
  return { host, owner, container, bind: facade, commit, drop };
}
describe("approved host Drop binding", () => {
  it("publishes after commit, snapshots files and finishes teardown before resource-free callback", async () => {
    const f = await fixture(); let release, invocation; const work = new Promise((r) => { release = r; });
    const callback = vi.fn((payload) => { invocation = payload.scope; expect(Object.isFrozen(payload)).toBe(true); expect(Object.isFrozen(payload.files)).toBe(true); expect(Object.keys(payload).sort()).toEqual(["files", "scope"]); return work; });
    const lease = f.bind({ id: "files", onDrop: callback }); f.drop([new File(["x"], "x.gpx")]); expect(callback).not.toHaveBeenCalled();
    await f.commit(); const event = f.drop([new File(["x"], "x.gpx")]); expect(event.defaultPrevented).toBe(true);
    await f.owner.close(); expect(invocation.alive).toBe(false); f.drop([new File(["y"], "y.gpx")]); expect(callback).toHaveBeenCalledOnce();
    release(); await work; await lease.dispose(); await f.host.close();
  });
  it("rejects exclusive/headless, ignores empty/nonfile and explicit setup disposal cannot activate", async () => {
    const f = await fixture(), callback = vi.fn(); const lease = f.bind({ id: "first", onDrop: callback });
    expect(() => f.bind({ id: "other", onDrop() {} })).toThrowError(expect.objectContaining({ code: "RESOURCE_CONFLICT" }));
    await lease.dispose(); await f.commit(); f.drop([new File(["x"], "x")]); expect(callback).not.toHaveBeenCalled();
    const second = f.bind({ id: "second", onDrop: callback });
    expect(f.drop([], ["Files"]).defaultPrevented).toBe(true); expect(f.drop([], ["text/plain"]).defaultPrevented).toBe(false); expect(callback).not.toHaveBeenCalled();
    await second.dispose(); await f.owner.close(); await f.host.close();
    const c = createScopeController(); expect(() => createDropTarget({})({ scope: c.scope })({ id: "x", onDrop() {} })).toThrowError(expect.objectContaining({ code: "UI_SURFACE_UNAVAILABLE" })); await c.close();
  });
});
