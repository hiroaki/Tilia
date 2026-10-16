import { describe, expect, it, vi } from "vitest";

import {
  OwnershipCleanupError,
  OwnershipError,
  createScopeController,
} from "../src/ownership/index.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("ownership scope lifecycle", () => {
  it("starts uncommitted and commits its complete live child tree once", async () => {
    const controller = createScopeController({ label: "plugin" });
    const child = controller.scope.child({ label: "session" });

    expect(controller.snapshot()).toMatchObject({
      path: "plugin",
      state: "open-uncommitted",
      alive: true,
      signalAborted: false,
    });
    expect(child.alive).toBe(true);

    await controller.commit();

    expect(controller.snapshot().state).toBe("active");
    child.assertAlive();
    await expect(controller.commit()).rejects.toMatchObject({
      code: "SCOPE_COMMIT_INVALID",
    });
  });

  it("aborts an uncommitted scope and disposes it", async () => {
    const controller = createScopeController();
    await controller.abort();
    expect(controller.snapshot()).toMatchObject({
      state: "closed",
      alive: false,
      signalAborted: true,
    });
  });

  it("revokes the complete tree synchronously before cleanup", async () => {
    const controller = createScopeController({ label: "root" });
    const child = controller.scope.child({ label: "child" });
    const events = [];
    controller.scope.defer(() => {
      events.push([controller.scope.alive, controller.scope.signal.aborted, child.alive]);
    });
    await controller.commit();

    const closing = controller.close();

    expect(controller.scope.alive).toBe(false);
    expect(child.alive).toBe(false);
    expect(controller.scope.signal.aborted).toBe(true);
    expect(child.signal.aborted).toBe(true);
    await closing;
    expect(events).toEqual([[false, true, false]]);
  });

  it("revokes the whole tree before any abort listener can mutate another scope", async () => {
    const controller = createScopeController({ label: "root" });
    const first = controller.scope.child({ label: "first" });
    const grandchild = first.child({ label: "grandchild" });
    const sibling = controller.scope.child({ label: "sibling" });
    const events = [];
    const rejected = [];

    controller.scope.signal.addEventListener("abort", () => {
      events.push("abort-root");
      expect(first.alive).toBe(false);
      expect(grandchild.alive).toBe(false);
      expect(sibling.alive).toBe(false);
      for (const operation of [
        () => first.defer(() => {}),
        () => grandchild.track(Promise.resolve()),
        () => sibling.child(),
      ]) {
        try {
          operation();
        } catch (error) {
          rejected.push(error.code);
        }
      }
    });
    first.signal.addEventListener("abort", () => {
      events.push("abort-first");
      expect(sibling.alive).toBe(false);
      expect(grandchild.alive).toBe(false);
      expect(() => sibling.defer(() => {})).toThrowError(expect.objectContaining({
        code: "SCOPE_NOT_ACTIVE",
      }));
      expect(() => grandchild.child()).toThrowError(expect.objectContaining({
        code: "SCOPE_NOT_ACTIVE",
      }));
    });
    grandchild.signal.addEventListener("abort", () => events.push("abort-grandchild"));
    sibling.signal.addEventListener("abort", () => events.push("abort-sibling"));
    controller.scope.defer(() => events.push("cleanup-root"));
    first.defer(() => events.push("cleanup-first"));
    grandchild.defer(() => events.push("cleanup-grandchild"));
    sibling.defer(() => events.push("cleanup-sibling"));
    await controller.commit();

    await controller.close();

    expect(rejected).toEqual([
      "SCOPE_NOT_ACTIVE",
      "SCOPE_NOT_ACTIVE",
      "SCOPE_NOT_ACTIVE",
    ]);
    const firstCleanup = events.findIndex((event) => event.startsWith("cleanup"));
    expect(events.slice(0, firstCleanup)).toEqual([
      "abort-root",
      "abort-first",
      "abort-grandchild",
      "abort-sibling",
    ]);
  });

  it("shares concurrent close work and is idempotent after closing", async () => {
    const controller = createScopeController();
    const gate = deferred();
    const dispose = vi.fn(() => gate.promise);
    controller.scope.defer(dispose);
    await controller.commit();

    const first = controller.close();
    const second = controller.close();
    expect(second).toBe(first);
    gate.resolve();
    const report = await first;
    expect(await controller.close()).toBe(report);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("disposes children in reverse creation order before setup cleanup and LIFO locals", async () => {
    const controller = createScopeController();
    const events = [];
    controller.scope.defer(() => events.push("local-1"));
    const first = controller.scope.child({ label: "first" });
    first.defer(() => events.push("child-1"));
    controller.scope.defer(() => events.push("local-2"));
    const second = controller.scope.child({ label: "second" });
    second.defer(() => events.push("child-2"));
    controller.setSetupCleanup(() => events.push("setup"));
    await controller.commit();

    await controller.close();

    expect(events).toEqual(["child-2", "child-1", "setup", "local-2", "local-1"]);
  });

  it("supports idempotent early child and disposer cleanup", async () => {
    const controller = createScopeController();
    const child = controller.scope.child();
    const childDispose = vi.fn();
    const localDispose = vi.fn();
    child.defer(childDispose);
    const handle = controller.scope.defer(localDispose);
    await controller.commit();

    await child.dispose();
    await child.dispose();
    await handle.dispose();
    await handle.dispose();
    await controller.close();

    expect(childDispose).toHaveBeenCalledOnce();
    expect(localDispose).toHaveBeenCalledOnce();
  });

  it("shares an in-flight early disposer without executing it twice", async () => {
    const controller = createScopeController();
    const gate = deferred();
    const dispose = vi.fn(() => gate.promise);
    const handle = controller.scope.defer(dispose);

    const first = handle.dispose();
    const second = handle.dispose();
    expect(second).toBe(first);
    gate.resolve();
    await first;
    await controller.abort();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("continues cleanup after failures and aggregates residual diagnostics", async () => {
    const controller = createScopeController({ label: "owner" });
    const events = [];
    controller.scope.defer(() => events.push("first"));
    controller.scope.defer(() => {
      events.push("failed");
      throw new Error("broken");
    }, { label: "broken-resource" });
    controller.scope.defer(() => events.push("last"));
    await controller.commit();

    await expect(controller.close()).rejects.toBeInstanceOf(OwnershipCleanupError);

    expect(events).toEqual(["last", "failed", "first"]);
    expect(controller.snapshot()).toMatchObject({
      state: "cleanup-failed",
      alive: false,
      residuals: [{
        scopePath: "owner",
        label: "broken-resource",
        retry: "never",
        cause: { name: "Error", message: "broken" },
      }],
    });
  });

  it("retries only explicitly retry-safe residuals and never reruns successes", async () => {
    const controller = createScopeController();
    const safe = vi.fn()
      .mockRejectedValueOnce(new Error("again"))
      .mockResolvedValueOnce(undefined);
    const terminal = vi.fn(() => {
      throw new Error("terminal");
    });
    const success = vi.fn();
    controller.scope.defer(success);
    controller.scope.defer(terminal);
    controller.scope.defer(safe, { retry: "safe" });
    await controller.commit();
    await expect(controller.close()).rejects.toBeInstanceOf(OwnershipCleanupError);

    await expect(controller.retryCleanup()).rejects.toBeInstanceOf(OwnershipCleanupError);

    expect(safe).toHaveBeenCalledTimes(2);
    expect(terminal).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledOnce();
    expect(controller.snapshot().residuals).toHaveLength(1);
    expect(controller.snapshot().residuals[0].retry).toBe("never");
  });

  it("keeps early child cleanup failures visible at the active parent boundary", async () => {
    const controller = createScopeController();
    const child = controller.scope.child({ label: "session" });
    child.defer(() => {
      throw new Error("session cleanup failed");
    }, { label: "session-resource" });
    await controller.commit();

    await expect(child.dispose()).rejects.toBeInstanceOf(OwnershipCleanupError);
    expect(controller.scope.alive).toBe(true);
    expect(controller.snapshot().residuals[0]).toMatchObject({
      scopePath: "scope/session",
      label: "session-resource",
    });

    await expect(controller.close()).rejects.toBeInstanceOf(OwnershipCleanupError);
    expect(controller.snapshot().state).toBe("cleanup-failed");
  });

  it("allows parent close to clear a retry-safe early child residual", async () => {
    const controller = createScopeController();
    const child = controller.scope.child({ label: "session" });
    const cleanup = vi.fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(undefined);
    child.defer(cleanup, { retry: "safe" });
    await controller.commit();

    await expect(child.dispose()).rejects.toBeInstanceOf(OwnershipCleanupError);
    await controller.close();

    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(controller.snapshot().state).toBe("closed");
  });

  it("rejects stale API calls while guarded callbacks become no-ops", async () => {
    const controller = createScopeController();
    const callback = vi.fn((value) => value * 2);
    const guarded = controller.scope.guard(callback);
    await controller.commit();
    expect(guarded(2)).toBe(4);

    await controller.close();

    expect(() => controller.scope.assertAlive()).toThrow(OwnershipError);
    expect(() => controller.scope.defer(() => {})).toThrowError(expect.objectContaining({
      code: "SCOPE_NOT_ACTIVE",
    }));
    expect(() => controller.scope.child()).toThrowError(expect.objectContaining({
      code: "SCOPE_NOT_ACTIVE",
    }));
    expect(guarded(3)).toBeUndefined();
    expect(callback).toHaveBeenCalledOnce();
    expect("detach" in controller.scope).toBe(false);
    expect("transfer" in controller.scope).toBe(false);
  });

  it("returns deeply frozen diagnostic data", async () => {
    const controller = createScopeController();
    await controller.commit();
    const snapshot = controller.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.counts)).toBe(true);
    expect(Object.isFrozen(snapshot.residuals)).toBe(true);
  });
});
