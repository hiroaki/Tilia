import { describe, expect, it, vi } from "vitest";
import { createScopeController } from "../src/ownership/index.js";
import { createPluginRuntime } from "../src/plugins/runtime/index.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("Phase 4K Scope completion reservation", () => {
  it("joins child close started by the same parent abort while required work is pending", async () => {
    const owner = createScopeController();
    const required = deferred();
    const child = owner.scope.child();
    const cause = new Error("child first attempt");
    const cleanup = vi.fn().mockRejectedValueOnce(cause).mockResolvedValue(undefined);
    child.defer(cleanup, { retry: "safe" });
    owner.scope.track(required.promise, { await: true });
    let childClose;
    owner.scope.signal.addEventListener("abort", () => {
      childClose = child.dispose();
      childClose.catch(() => {});
    });
    await owner.commit();
    const closing = owner.close();
    closing.catch(() => {});
    await expect(childClose).rejects.toMatchObject({ errors: [cause] });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(owner.snapshot().state).toBe("closing");
    required.resolve();
    await expect(closing).rejects.toMatchObject({ errors: [cause] });
    expect(cleanup).toHaveBeenCalledOnce();
    // Explicit residual retry remains accepted and distinct from this attempt.
    await owner.retryCleanup();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it.each(["success", "never", "safe", "safe-once"])(
    "shares abort-reentrant completion without implicitly retrying %s cleanup",
    async (scenario) => {
      const owner = createScopeController();
      const cause = new Error("first attempt failed");
      let attempts = 0;
      owner.scope.defer(() => {
        attempts += 1;
        if (scenario !== "success" && (scenario !== "safe-once" || attempts === 1)) throw cause;
      }, { retry: scenario.startsWith("safe") ? "safe" : "never" });
      let reentrant;
      owner.scope.signal.addEventListener("abort", () => { reentrant = owner.close(); });
      await owner.commit();

      const outer = owner.close();
      expect(reentrant).toBe(outer);
      expect(owner.close()).toBe(outer);
      const [a, b] = await Promise.allSettled([outer, reentrant]);
      expect(attempts).toBe(1);
      expect(b.status).toBe(a.status);
      if (scenario === "success") {
        expect(a.status).toBe("fulfilled");
        expect(owner.snapshot().state).toBe("closed");
      } else {
        expect(a.status).toBe("rejected");
        expect(b.reason).toBe(a.reason);
        expect(a.reason.errors).toContain(cause);
        expect(owner.snapshot().state).toBe("cleanup-failed");
        await expect(owner.close()).rejects.toBe(a.reason);
        expect(attempts).toBe(1);
      }
      if (scenario === "safe-once") {
        await owner.retryCleanup();
        expect(attempts).toBe(2);
        expect(owner.snapshot().state).toBe("closed");
      }
    },
  );

  it("shares rollback completion when abort reenters close", async () => {
    const owner = createScopeController();
    const cleanup = vi.fn();
    owner.scope.defer(cleanup);
    let reentrant;
    owner.scope.signal.addEventListener("abort", () => { reentrant = owner.close(); });
    const outer = owner.abort();
    expect(reentrant).toBe(outer);
    await outer;
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("joins awaitable work through abort and cancellation reentry without awaiting plain work", async () => {
    const owner = createScopeController();
    const required = deferred();
    const plain = deferred();
    const events = [];
    let fromAbort;
    let fromCancel;
    owner.scope.signal.addEventListener("abort", () => { fromAbort = owner.close(); });
    owner.scope.track(plain.promise, { await: false });
    owner.scope.track(required.promise, {
      await: true,
      cancel() { events.push("cancel"); fromCancel = owner.close(); },
    });
    owner.scope.defer(() => events.push("local"));
    await owner.commit();
    const outer = owner.close();
    expect(fromAbort).toBe(outer);
    expect(fromCancel).toBe(outer);
    let settled = false;
    outer.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(events).toEqual(["cancel"]);
    required.resolve();
    await outer;
    expect(events).toEqual(["cancel", "local"]);
    plain.reject(new Error("late plain failure"));
    await Promise.resolve();
  });

  it("preserves cancellation failure and reverse child/setup/local ordering under reentry", async () => {
    const owner = createScopeController();
    const events = [];
    const cause = new Error("cancel failed");
    let reentrant;
    owner.scope.track(new Promise(() => {}), {
      cancel() { reentrant = owner.close(); events.push("cancel"); throw cause; },
    });
    owner.scope.child({ label: "first" }).defer(() => events.push("child-1"));
    owner.scope.child({ label: "second" }).defer(() => events.push("child-2"));
    owner.setSetupCleanup(() => events.push("setup"));
    owner.scope.defer(() => events.push("local-1"));
    owner.scope.defer(() => events.push("local-2"));
    await owner.commit();
    const outer = owner.close();
    expect(reentrant).toBe(outer);
    const [a, b] = await Promise.allSettled([outer, reentrant]);
    expect(a.status).toBe("rejected");
    expect(b.reason).toBe(a.reason);
    expect(a.reason.errors).toContain(cause);
    expect(events).toEqual(["cancel", "child-2", "child-1", "setup", "local-2", "local-1"]);
  });
});

describe("Phase 4K identifiable Runtime callback reentry", () => {
  it.each(["setup-return", "local", "child", "staged"])(
    "rejects destroy from %s cleanup even when destruction is already pending",
    async (kind) => {
      let runtime;
      let nested;
      const cleanup = vi.fn(() => {
        nested = runtime.destroy();
        return nested;
      });
      runtime = createPluginRuntime({ capabilityFactories: {
        testing: ({ stage }) => ({ register(dispose) {
          stage({ preflight() {}, commit() {}, dispose });
        } }),
      } });
      await runtime.use({ id: "x-owner", setup(context) {
        if (kind === "setup-return") return cleanup;
        if (kind === "local") context.scope.defer(cleanup);
        if (kind === "child") context.scope.child().defer(cleanup);
        if (kind === "staged") context.testing.register(cleanup);
      } });
      const outer = runtime.destroy();
      await expect(outer).rejects.toMatchObject({ code: "PLUGIN_RUNTIME_DESTROY_FAILED" });
      await expect(nested).rejects.toMatchObject({ code: "PLUGIN_LIFECYCLE_REENTRANT" });
      expect(nested).not.toBe(outer);
      expect(runtime.destroy()).toBe(outer);
      expect(runtime.state).toBe("destroyed");
      expect(cleanup).toHaveBeenCalledOnce();
    },
  );

  it("rejects lifecycle entry during synchronous task cancellation but continues cleanup", async () => {
    let runtime;
    let nested;
    let useError;
    const cleanup = vi.fn();
    runtime = createPluginRuntime();
    await runtime.use({ id: "x-owner", setup(context) {
      context.scope.defer(cleanup);
      context.scope.track(new Promise(() => {}), { cancel() {
        try { runtime.use("x-owner"); } catch (error) { useError = error; }
        nested = runtime.destroy();
        // Cancellation remains synchronous; observe the rejected request.
        nested.catch(() => {});
      } });
    } });
    await runtime.destroy();
    expect(useError.code).toBe("PLUGIN_LIFECYCLE_REENTRANT");
    await expect(nested).rejects.toMatchObject({ code: "PLUGIN_LIFECYCLE_REENTRANT" });
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("reserves Runtime completion before installing-scope abort notification", async () => {
    const setupGate = deferred();
    const started = deferred();
    let reentrant;
    const runtime = createPluginRuntime();
    const installing = runtime.use({ id: "x-owner", setup(context) {
      context.scope.signal.addEventListener("abort", () => { reentrant = runtime.destroy(); });
      started.resolve();
      return setupGate.promise;
    } });
    const installOutcome = installing.catch((error) => error);
    await started.promise;
    const outer = runtime.destroy();
    expect(reentrant).toBe(outer);
    await outer;
    expect((await installOutcome).code).toBe("PLUGIN_RUNTIME_DESTROYING");
    expect(runtime.inspect("x-owner").state).toBe("detached-pending");
    setupGate.resolve();
  });

  it("does not impose one Runtime's callback prohibition on another Runtime", async () => {
    const other = createPluginRuntime();
    const otherCleanup = vi.fn();
    await other.use({ id: "x-other", setup: () => otherCleanup });
    const runtime = createPluginRuntime();
    await runtime.use({ id: "x-owner", setup: () => () => other.destroy() });
    await runtime.destroy();
    expect(other.state).toBe("destroyed");
    expect(otherCleanup).toHaveBeenCalledOnce();
  });

  it("rejects identifiable lifecycle entry from detached late cleanup", async () => {
    const setupGate = deferred();
    const started = deferred();
    const notified = deferred();
    const runtime = createPluginRuntime({ onDiagnostic: (error) => notified.resolve(error) });
    const installing = runtime.use({ id: "x-owner", setup() {
      started.resolve();
      return setupGate.promise;
    } });
    const installOutcome = installing.catch((error) => error);
    await started.promise;
    await runtime.destroy();
    await installOutcome;
    setupGate.resolve(() => runtime.destroy());
    expect(await notified.promise).toMatchObject({ code: "PLUGIN_LIFECYCLE_REENTRANT" });
    expect(runtime.inspect("x-owner").state).toBe("detached-cleanup-failed");
  });

  it.each(["rejection", "cleanup-failure"])("reports detached setup %s through the existing diagnostic path", async (kind) => {
    const setupGate = deferred();
    const started = deferred();
    const notified = deferred();
    const cause = new Error("late failure");
    const onDiagnostic = vi.fn((error) => notified.resolve(error));
    const runtime = createPluginRuntime({ onDiagnostic });
    const installing = runtime.use({ id: "x-owner", setup() {
      started.resolve();
      return setupGate.promise;
    } });
    const installOutcome = installing.catch((error) => error);
    await started.promise;
    await runtime.destroy();
    await installOutcome;
    if (kind === "rejection") setupGate.reject(cause);
    else setupGate.resolve(() => { throw cause; });
    expect(await notified.promise).toBe(cause);
    expect(onDiagnostic).toHaveBeenCalledOnce();
    expect(runtime.inspect("x-owner")).toMatchObject({
      state: kind === "rejection" ? "detached-rejected" : "detached-cleanup-failed",
      error: { message: "late failure" },
    });
  });
});
