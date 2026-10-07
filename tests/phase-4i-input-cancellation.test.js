import { afterEach, describe, expect, it, vi } from "vitest";
import { createInputRegistry } from "../src/extensions/inputs.js";
import { createScopeController } from "../src/ownership/index.js";
import { parseGpxFile } from "../src/gpx/parse.js";
import { DOMParser } from "@xmldom/xmldom";
const controllers = [];
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
afterEach(async () => { vi.unstubAllGlobals(); for (const c of controllers.splice(0)) { try { await c.close(); } catch {} } });
async function fixture(handle, recognize = () => true) {
  const registry = createInputRegistry(), owner = createScopeController(), caller = createScopeController();
  controllers.push(owner, caller); const queue = [];
  registry.createFacade({ scope: owner.scope, stage: (v) => owner.stage(v), enqueuePostCommit: (f) => queue.push(f) })
    .register({ id: "test", recognize, handle });
  await owner.commit(); queue.forEach((f) => f()); await caller.commit();
  return { owner, caller, inputs: registry.createFacade({ scope: caller.scope }) };
}
describe("approved 4I dispatch cancellation", () => {
  it("validates native signals and prevents recognition on pre-abort", async () => {
    const recognize = vi.fn(() => true), handle = vi.fn(); const f = await fixture(handle, recognize);
    for (const options of [null, [], { signal: null }, { signal: { aborted: false } }, { other: 1 }, Object.create({ signal: new AbortController().signal })])
      await expect(f.inputs.dispatch({}, options)).rejects.toBeInstanceOf(TypeError);
    const op = new AbortController(); op.abort("before");
    await expect(f.inputs.dispatch({}, { signal: op.signal })).rejects.toMatchObject({ code: "INPUT_DISPATCH_CANCELLED", details: { semanticOutcome: "not-started" } });
    expect(recognize).not.toHaveBeenCalled(); expect(handle).not.toHaveBeenCalled();
  });
  it("preserves native errors and local commit evidence inside one unknown-outcome envelope", async () => {
    const local = Object.assign(new Error("second create failed"), { committed: false });
    const f = await fixture(async () => { throw local; });
    const error = await f.inputs.dispatch({}).catch((e) => e);
    expect(error).toMatchObject({ code: "INPUT_DISPATCH_FAILED", cause: local, details: { semanticOutcome: "unknown", handlerError: local } });
    expect(error).not.toHaveProperty("committed");
  });
  it("revokes one invocation without removing its plugin and retains a late success", async () => {
    const gate = deferred(); let scope; const f = await fixture(async (input) => { scope = input.scope; return gate.promise; });
    const op = new AbortController(); const pending = f.inputs.dispatch({}, { signal: op.signal }).catch((e) => e);
    op.abort("cancel"); expect(scope.alive).toBe(false); expect(f.owner.scope.alive).toBe(true);
    gate.resolve({ entry: { id: 1 } });
    expect(await pending).toMatchObject({ code: "INPUT_DISPATCH_CANCELLED", details: { handlerResult: { entry: { id: 1 } }, cancellationReason: "cancel" } });
  });
  it("does not wait for noncooperative work on caller or handler removal", async () => {
    const gate = deferred(); const f = await fixture(() => gate.promise);
    const pending = f.inputs.dispatch({}).catch((e) => e);
    await f.owner.close(); await f.caller.close(); gate.resolve("late");
    expect(await pending).toMatchObject({ code: "INPUT_DISPATCH_CANCELLED", details: { handlerResult: "late" } });
  });
  it("normal cleanup resolves and cancellation during resource cleanup stays visible", async () => {
    const f = await fixture(() => 42); expect(await f.inputs.dispatch({})).toBe(42);
    const cleanup = deferred(), entered = deferred();
    const g = await fixture(({ scope }) => { scope.defer(() => { entered.resolve(); return cleanup.promise; }); return 7; });
    const op = new AbortController(); const pending = g.inputs.dispatch({}, { signal: op.signal }).catch((e) => e);
    await entered.promise; op.abort("during cleanup"); cleanup.resolve();
    expect(await pending).toMatchObject({ code: "INPUT_DISPATCH_CANCELLED", details: { handlerResult: 7 } });
  });
  it("retains both handler and cleanup failures and permits safe residual retry", async () => {
    const original = new Error("handler"), cleanup = new Error("cleanup"); let calls = 0;
    const f = await fixture(({ scope }) => { scope.defer(() => { if (++calls === 1) throw cleanup; }, { retry: "safe" }); throw original; });
    const e = await f.inputs.dispatch({}).catch((v) => v);
    expect(e).toMatchObject({ code: "INPUT_DISPATCH_CLEANUP_FAILED", details: { handlerError: original } });
    expect(e.details.cleanupError).toBeDefined(); await f.caller.close(); expect(calls).toBe(2);
  });
  it("recognizer cancellation wins over claims and removal never invokes stale handler", async () => {
    const op = new AbortController(), handle = vi.fn(); const f = await fixture(handle, () => { op.abort(); return true; });
    await expect(f.inputs.dispatch({}, { signal: op.signal })).rejects.toMatchObject({ code: "INPUT_DISPATCH_CANCELLED" });
    expect(handle).not.toHaveBeenCalled();
    let owner; const g = await fixture(handle, () => { void owner.close(); return true; }); owner = g.owner;
    await expect(g.inputs.dispatch({})).rejects.toMatchObject({ code: "EXTENSION_UNAVAILABLE" });
    expect(handle).not.toHaveBeenCalled();
  });
});
describe("GPX actual cancellation boundaries", () => {
  it("calls FileReader.abort, settles without abort event, clears listeners and ignores late load", async () => {
    let reader, late; const abort = vi.fn();
    vi.stubGlobal("FileReader", class {
      constructor() { reader = this; this.readyState = 0; }
      readAsText() { this.readyState = 1; late = this.onload; }
      abort() { abort(); this.readyState = 2; }
    });
    const op = new AbortController(), scope = createScopeController(); controllers.push(scope);
    const pending = parseGpxFile(new File(["gpx"], "x.gpx"), { signal: op.signal, scope: scope.scope }).catch((e) => e);
    op.abort("cancel"); expect(await pending).toBe("cancel"); expect(abort).toHaveBeenCalledOnce();
    expect(reader.onload).toBeNull(); expect(reader.onerror).toBeNull(); reader.result = "<gpx/>"; late();
  });
  it("checks cancellation after synchronous parsing returns before create can run", async () => {
    const op = new AbortController(); let reads = 0;
    vi.stubGlobal("FileReader", class { readAsText() { reads++; this.result = "<gpx/>"; this.onload(); } });
    vi.stubGlobal("DOMParser", class { parseFromString(...args) { op.abort("during parse"); return new DOMParser().parseFromString(...args); } });
    await expect(parseGpxFile(new File(["<gpx/>"], "x.gpx"), { signal: op.signal })).rejects.toBe("during parse");
    expect(reads).toBe(1);
  });
});

describe("dispatch residual/error edge cases", () => {
  it.each([undefined, null, false, 0, ""])("retains falsy rejection evidence %j", async (value) => {
    const f = await fixture(() => Promise.reject(value));
    const error = await f.inputs.dispatch({}).catch((e) => e);
    expect(error.code).toBe("INPUT_DISPATCH_FAILED"); expect(error.details.handlerOutcome).toBe("rejected"); expect(Object.hasOwn(error.details,"handlerError")).toBe(true); expect(error.details.handlerError).toBe(value);
  });
  it("retains failed source listener removal as cleanup evidence and supports explicit retry", async () => {
    const f = await fixture(() => "result"), op = new AbortController(); let failed = true;
    const remove = op.signal.removeEventListener.bind(op.signal);
    op.signal.removeEventListener = (...args) => { if (failed) throw new Error("detach failed"); remove(...args); };
    const error = await f.inputs.dispatch({}, {signal:op.signal}).catch((e)=>e);
    expect(error.code).toBe("INPUT_DISPATCH_CLEANUP_FAILED"); expect(error.details.handlerResult).toBe("result"); failed=false; await f.caller.close();
  });
  it("retains failed physical GPX abort and retries the reader under its resource owner", async () => {
    const owner=createScopeController();controllers.push(owner);const op=new AbortController();let reader,failed=true;
    vi.stubGlobal("FileReader",class{constructor(){reader=this;this.readyState=0;}readAsText(){this.readyState=1;}abort(){if(failed)throw new Error("abort failed");this.readyState=2;}});
    const read=parseGpxFile(new File(["x"],"x.gpx"),{signal:op.signal,scope:owner.scope}).catch((e)=>e);
    op.abort("cancel");expect(await read).toBe("cancel");await expect(owner.close()).rejects.toMatchObject({code:"SCOPE_DISPOSAL_FAILED"});expect(reader.onload).toBeNull();failed=false;await owner.retryCleanup();expect(reader.readyState).toBe(2);
  });
});
