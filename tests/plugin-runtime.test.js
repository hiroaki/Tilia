import { describe, expect, it, vi } from "vitest";
import { createPluginRuntime } from "../src/plugins/runtime/index.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const entry = (id, requires, setup) => ({
  id,
  requires,
  load: () => ({ default: { id, setup } }),
});

describe("PluginRuntime", () => {
  it("distinguishes invalid and unknown requested IDs", async () => {
    const runtime = createPluginRuntime();
    expect(() => runtime.use("Bad")).toThrowError(expect.objectContaining({ code: "PLUGIN_ID_INVALID" }));
    await expect(runtime.use("x-unknown")).rejects.toMatchObject({ code: "PLUGIN_UNKNOWN" });
  });

  it("installs dependencies once in deterministic order and returns opaque handles", async () => {
    const order = [];
    const runtime = createPluginRuntime({ catalog: [
      entry("x-root", ["x-left", "x-right"], () => { order.push("root"); }),
      entry("x-left", ["x-shared"], () => { order.push("left"); }),
      entry("x-right", ["x-shared"], () => { order.push("right"); }),
      entry("x-shared", [], () => { order.push("shared"); }),
    ] });
    await expect(runtime.use("x-root")).resolves.toEqual({ id: "x-root" });
    expect(order).toEqual(["shared", "left", "right", "root"]);
    expect(runtime.list()).toEqual(["x-shared", "x-left", "x-right", "x-root"]);
  });

  it("deduplicates concurrent same-plugin setup", async () => {
    const gate = deferred();
    const setup = vi.fn(() => gate.promise);
    const runtime = createPluginRuntime({ catalog: [entry("x-one", [], setup)] });
    const first = runtime.use("x-one");
    const second = runtime.use("x-one");
    await Promise.resolve();
    gate.resolve();
    const results = await Promise.all([first, second]);
    expect(setup).toHaveBeenCalledOnce();
    expect(results[0]).toBe(results[1]);
  });

  it("shares dependencies across overlapping requested graphs", async () => {
    const sharedSetup = vi.fn();
    const runtime = createPluginRuntime({ catalog: [
      entry("x-left", ["x-shared"], () => {}),
      entry("x-right", ["x-shared"], () => {}),
      entry("x-shared", [], sharedSetup),
    ] });
    await Promise.all([runtime.use("x-left"), runtime.use("x-right")]);
    expect(sharedSetup).toHaveBeenCalledOnce();
  });

  it("rolls back failed setup and permits retry while retaining successful dependencies", async () => {
    const cleanup = vi.fn();
    const rootSetup = vi.fn()
      .mockRejectedValueOnce(new Error("broken"))
      .mockResolvedValueOnce(undefined);
    const runtime = createPluginRuntime({ catalog: [
      entry("x-root", ["x-dep"], rootSetup),
      entry("x-dep", [], () => cleanup),
    ] });
    await expect(runtime.use("x-root")).rejects.toMatchObject({ code: "PLUGIN_SETUP_FAILED" });
    expect(runtime.has("x-dep")).toBe(true);
    await expect(runtime.use("x-root")).resolves.toEqual({ id: "x-root" });
    expect(rootSetup).toHaveBeenCalledTimes(2);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("quarantines setup rollback when owned cleanup leaves a residual", async () => {
    const runtime = createPluginRuntime({ catalog: [entry("x-one", [], (context) => {
      context.scope.defer(() => { throw new Error("rollback residual"); });
      throw new Error("setup failed");
    })] });
    await expect(runtime.use("x-one")).rejects.toMatchObject({ code: "PLUGIN_SETUP_FAILED" });
    expect(runtime.inspect("x-one").state).toBe("quarantined");
    await expect(runtime.use("x-one")).rejects.toMatchObject({ code: "PLUGIN_QUARANTINED" });
  });

  it.each([
    [{ destroy() {} }, "PLUGIN_DESCRIPTOR_INVALID"],
    [{ api: true }, "PLUGIN_DESCRIPTOR_INVALID"],
  ])("rejects removed setup return contracts", async (result, code) => {
    const runtime = createPluginRuntime({ catalog: [entry("x-one", [], () => result)] });
    await expect(runtime.use("x-one")).rejects.toMatchObject({ code });
    expect(runtime.has("x-one")).toBe(false);
  });

  it("runs setup cleanup through the dedicated Scope slot", async () => {
    const cleanup = vi.fn();
    const runtime = createPluginRuntime({ catalog: [entry("x-one", [], () => ({ dispose: cleanup }))] });
    await runtime.use("x-one");
    await runtime.unuse("x-one");
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("keeps staged capability publication invisible until setup commits", async () => {
    const publications = [];
    const gate = deferred();
    const runtime = createPluginRuntime({
      catalog: [entry("x-one", [], async (context) => {
        context.testing.register("owned");
        expect(publications).toEqual([]);
        await gate.promise;
      })],
      capabilityFactories: {
        testing: ({ stage }) => ({
          register(id) {
            stage({
              label: id,
              preflight() {},
              commit() { publications.push(id); },
              dispose({ committed }) {
                if (committed) publications.splice(publications.indexOf(id), 1);
              },
            });
          },
        }),
      },
    });
    const installing = runtime.use("x-one");
    while (!runtime.inspect("x-one")) await Promise.resolve();
    expect(publications).toEqual([]);
    gate.resolve();
    await installing;
    expect(publications).toEqual(["owned"]);
    await runtime.unuse("x-one");
    expect(publications).toEqual([]);
  });

  it("rolls back all staged records when preflight fails", async () => {
    const publications = [];
    const discarded = [];
    const runtime = createPluginRuntime({
      catalog: [entry("x-one", [], (context) => {
        context.testing.register("first", false);
        context.testing.register("broken", true);
      })],
      capabilityFactories: {
        testing: ({ stage }) => ({
          register(id, fail) {
            stage({
              label: id,
              preflight() { if (fail) throw new Error("conflict"); },
              commit() { publications.push(id); },
              dispose({ committed }) { discarded.push(`${id}:${committed}`); },
            });
          },
        }),
      },
    });
    await expect(runtime.use("x-one")).rejects.toMatchObject({ code: "PLUGIN_COMMIT_FAILED" });
    expect(publications).toEqual([]);
    expect(discarded).toEqual(["broken:false", "first:false"]);
  });

  it("rejects provider uninstall while direct dependents are active", async () => {
    const runtime = createPluginRuntime({ catalog: [
      entry("x-provider", [], () => {}),
      entry("x-zed", ["x-provider"], () => {}),
      entry("x-alpha", ["x-provider"], () => {}),
    ] });
    await runtime.use("x-zed");
    await runtime.use("x-alpha");
    await expect(runtime.unuse("x-provider")).rejects.toMatchObject({
      code: "PLUGIN_HAS_DEPENDENTS",
      details: expect.objectContaining({ dependents: ["x-alpha", "x-zed"] }),
    });
    await runtime.unuse("x-alpha");
    await runtime.unuse("x-zed");
    await runtime.unuse("x-provider");
  });

  it("serializes uninstall requested during installation", async () => {
    const gate = deferred();
    const cleanup = vi.fn();
    const runtime = createPluginRuntime({ catalog: [entry("x-one", [], async () => {
      await gate.promise;
      return cleanup;
    })] });
    const installing = runtime.use("x-one");
    while (!runtime.inspect("x-one")) await Promise.resolve();
    const removing = runtime.unuse("x-one");
    gate.resolve();
    await installing;
    await removing;
    expect(cleanup).toHaveBeenCalledOnce();
    expect(runtime.has("x-one")).toBe(false);
  });

  it("waits for uninstall before installing a fresh instance", async () => {
    const cleanupGate = deferred();
    let setups = 0;
    const definition = { id: "x-one", setup() {
      setups += 1;
      return setups === 1 ? () => cleanupGate.promise : undefined;
    } };
    const runtime = createPluginRuntime();
    const firstHandle = await runtime.use(definition);
    const removing = runtime.unuse("x-one");
    const reinstalling = runtime.use(definition);
    await Promise.resolve();
    expect(setups).toBe(1);
    cleanupGate.resolve();
    await removing;
    const secondHandle = await reinstalling;
    expect(setups).toBe(2);
    expect(secondHandle).not.toBe(firstHandle);
  });

  it("quarantines cleanup failure, blocks reinstall, and retries only safe residuals", async () => {
    const safe = vi.fn().mockRejectedValueOnce(new Error("again")).mockResolvedValueOnce(undefined);
    const runtime = createPluginRuntime({ catalog: [entry("x-one", [], (context) => {
      context.scope.defer(safe, { retry: "safe" });
    })] });
    await runtime.use("x-one");
    await expect(runtime.unuse("x-one")).rejects.toMatchObject({ code: "PLUGIN_TEARDOWN_FAILED" });
    expect(runtime.inspect("x-one").state).toBe("quarantined");
    await expect(runtime.use("x-one")).rejects.toMatchObject({ code: "PLUGIN_QUARANTINED" });
    await runtime.unuse("x-one");
    expect(safe).toHaveBeenCalledTimes(2);
    expect(runtime.inspect("x-one")).toBeNull();
  });

  it("never retries terminal cleanup residuals", async () => {
    const terminal = vi.fn(() => { throw new Error("terminal"); });
    const runtime = createPluginRuntime({ catalog: [entry("x-one", [], (context) => {
      context.scope.defer(terminal);
    })] });
    await runtime.use("x-one");
    await expect(runtime.unuse("x-one")).rejects.toMatchObject({ code: "PLUGIN_TEARDOWN_FAILED" });
    await expect(runtime.unuse("x-one")).rejects.toMatchObject({ code: "PLUGIN_TEARDOWN_FAILED" });
    expect(terminal).toHaveBeenCalledOnce();
    expect(runtime.inspect("x-one").state).toBe("quarantined");
  });

  it("rejects synchronous lifecycle reentrancy from setup", async () => {
    let runtime;
    runtime = createPluginRuntime({ catalog: [entry("x-one", [], () => runtime.use("x-one"))] });
    await expect(runtime.use("x-one")).rejects.toMatchObject({ code: "PLUGIN_LIFECYCLE_REENTRANT" });
  });

  it("destroys dependents first", async () => {
    const events = [];
    const runtime = createPluginRuntime({ catalog: [
      entry("x-provider", [], () => () => events.push("provider")),
      entry("x-consumer", ["x-provider"], () => () => events.push("consumer")),
    ] });
    await runtime.use("x-consumer");
    await runtime.destroy();
    expect(events).toEqual(["consumer", "provider"]);
    expect(runtime.state).toBe("destroyed");
    expect(() => runtime.use("x-provider")).toThrowError(expect.objectContaining({ code: "PLUGIN_RUNTIME_DESTROYED" }));
  });

  it("does not hang on non-cooperative setup or allow late publication", async () => {
    const setupGate = deferred();
    const lateCleanup = vi.fn();
    const runtime = createPluginRuntime({ catalog: [entry("x-stuck", [], () => setupGate.promise)] });
    const installing = runtime.use("x-stuck");
    while (!runtime.inspect("x-stuck")) await Promise.resolve();
    await expect(runtime.destroy()).resolves.toBeUndefined();
    await expect(installing).rejects.toMatchObject({ code: "PLUGIN_RUNTIME_DESTROYING" });
    expect(runtime.inspect("x-stuck").state).toBe("detached-pending");
    setupGate.resolve(lateCleanup);
    while (runtime.inspect("x-stuck").state === "detached-pending") await Promise.resolve();
    expect(runtime.has("x-stuck")).toBe(false);
    expect(runtime.inspect("x-stuck").state).toBe("detached-settled");
    expect(lateCleanup).toHaveBeenCalledOnce();
  });
});
