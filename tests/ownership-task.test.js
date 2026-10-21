import { describe, expect, it, vi } from "vitest";

import { OwnershipCleanupError, createScopeController } from "../src/ownership/index.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("owned asynchronous tasks", () => {
  it("cancels pending tasks in reverse order before child and local cleanup", async () => {
    const controller = createScopeController();
    const events = [];
    const first = deferred();
    const second = deferred();
    controller.scope.track(first.promise, { cancel: () => events.push("cancel-1") });
    const child = controller.scope.child();
    child.defer(() => events.push("child"));
    controller.scope.track(second.promise, { cancel: () => events.push("cancel-2") });
    controller.scope.defer(() => events.push("local"));
    await controller.commit();

    await controller.close();

    expect(events).toEqual(["cancel-2", "cancel-1", "child", "local"]);
  });

  it("waits for awaitable tasks after cancellation", async () => {
    const controller = createScopeController();
    const task = deferred();
    const events = [];
    controller.scope.track(task.promise, {
      await: true,
      cancel: () => events.push("cancel"),
    });
    controller.scope.defer(() => events.push("cleanup"));
    await controller.commit();

    let closed = false;
    const closing = controller.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(events).toEqual(["cancel"]);
    expect(closed).toBe(false);

    task.resolve("done");
    await closing;
    expect(events).toEqual(["cancel", "cleanup"]);
  });

  it("rejects a thenable cancellation contract without waiting for it", async () => {
    const controller = createScopeController();
    const task1 = deferred();
    const task2 = deferred();
    const events = [];
    controller.scope.track(task1.promise, { cancel: () => events.push("cancel-1") });
    controller.scope.track(task2.promise, {
      cancel: () => {
        events.push("cancel-2");
        return new Promise(() => {});
      },
    });
    controller.scope.defer(() => events.push("cleanup"));
    await controller.commit();

    await expect(controller.close()).rejects.toBeInstanceOf(OwnershipCleanupError);

    expect(events).toEqual(["cancel-2", "cancel-1", "cleanup"]);
    expect(controller.snapshot().residuals[0]).toMatchObject({
      kind: "task",
      phase: "task-cancel",
      cause: { message: "Task cancel must be synchronous" },
    });
  });

  it("observes rejection from a violating cancellation thenable", async () => {
    const controller = createScopeController();
    const task = deferred();
    controller.scope.track(task.promise, {
      cancel: () => Promise.reject(new Error("async cancel rejected")),
    });
    await controller.commit();

    await expect(controller.close()).rejects.toBeInstanceOf(OwnershipCleanupError);
    await Promise.resolve();
    expect(controller.snapshot().state).toBe("cleanup-failed");
  });

  it("does not wait for non-awaitable work and handles later rejection", async () => {
    const controller = createScopeController();
    const task = deferred();
    controller.scope.track(task.promise);
    await controller.commit();

    await controller.close();
    task.reject(new Error("late"));
    await Promise.resolve();

    expect(controller.snapshot().state).toBe("closed");
  });

  it("treats task rejection as settlement rather than cleanup failure", async () => {
    const controller = createScopeController();
    controller.scope.track(Promise.reject(new Error("work failed")), { await: true });
    await controller.commit();
    await controller.close();
    expect(controller.snapshot().state).toBe("closed");
  });

  it("aggregates cancellation failures without stopping other cleanup", async () => {
    const controller = createScopeController();
    const task = deferred();
    const cleanup = vi.fn();
    controller.scope.track(task.promise, {
      cancel: () => {
        throw new Error("cancel failed");
      },
    });
    controller.scope.defer(cleanup);
    await controller.commit();

    await expect(controller.close()).rejects.toBeInstanceOf(OwnershipCleanupError);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(controller.snapshot().residuals[0]).toMatchObject({
      kind: "task",
      phase: "task-cancel",
      retry: "never",
    });
  });

  it("does not invoke cancellation for already-settled work", async () => {
    const controller = createScopeController();
    const cancel = vi.fn();
    controller.scope.track(Promise.resolve(), { cancel });
    await Promise.resolve();
    await controller.commit();
    await controller.close();
    expect(cancel).not.toHaveBeenCalled();
  });
});
