import { describe, expect, it, vi } from "vitest";
import { createScopeController } from "../src/ownership/index.js";
import {
  createContributionPoint,
  createInputRegistry,
  createServiceRegistry,
  defineServiceKey,
} from "../src/extensions/index.js";
import { createSubscriptionChannel } from "../src/extensions/subscriptions.js";

function owner(controller, queue = []) {
  return {
    scope: controller.scope,
    stage: (definition) => controller.stage(definition),
    enqueuePostCommit: (callback) => queue.push(callback),
  };
}

async function commit(controller, queue) {
  await controller.commit();
  for (const callback of queue.splice(0)) callback();
}

const key = defineServiceKey({
  id: "vendor-counter",
  validate: (value) => typeof value?.increment === "function",
  createFacade: ({ implementation, assertAvailable }) => ({
    increment() { assertAvailable(); return implementation.increment(); },
  }),
});

describe("Phase 4C typed extensions", () => {
  it("stages services, exposes key-defined facades, and revokes authority synchronously", async () => {
    const registry = createServiceRegistry();
    const provider = createScopeController();
    const consumer = createScopeController();
    const queue = [];
    let value = 0;
    registry.createFacade(owner(provider, queue)).provide(key, { increment: () => ++value });
    expect(registry.has(key)).toBe(false);
    await commit(provider, queue);
    await consumer.commit();
    const service = registry.createFacade(owner(consumer)).require(key);
    expect(service.increment()).toBe(1);
    const closing = provider.close();
    expect(registry.has(key)).toBe(false);
    expect(() => service.increment()).toThrowError(expect.objectContaining({ code: "EXTENSION_UNAVAILABLE" }));
    await closing;
  });

  it("publishes no service when setup preflight fails", async () => {
    const registry = createServiceRegistry();
    const first = createScopeController();
    const second = createScopeController();
    const queue = [];
    registry.createFacade(owner(first, queue)).provide(key, { increment() {} });
    await commit(first, queue);
    registry.createFacade(owner(second, [])).provide(key, { increment() {} });
    await expect(second.commit()).rejects.toMatchObject({ code: "OWNERSHIP_STAGE_INVALID" });
    expect(registry.has(key)).toBe(true);
  });

  it("revokes a cached service facade when its consumer scope closes", async () => {
    const registry = createServiceRegistry();
    const provider = createScopeController();
    const consumer = createScopeController();
    const queue = [];
    registry.createFacade(owner(provider, queue)).provide(key, { increment: () => 1 });
    await commit(provider, queue);
    await consumer.commit();
    const service = registry.createFacade(owner(consumer)).require(key);
    await consumer.close();
    expect(() => service.increment()).toThrowError(expect.objectContaining({ code: "SCOPE_NOT_ACTIVE" }));
  });

  it("rejects duplicate services staged by one setup batch", async () => {
    const registry = createServiceRegistry();
    const provider = createScopeController();
    const facade = registry.createFacade(owner(provider, []));
    facade.provide(key, { increment() {} });
    facade.provide(key, { increment() {} });
    await expect(provider.commit()).rejects.toMatchObject({ code: "OWNERSHIP_STAGE_INVALID" });
    expect(registry.has(key)).toBe(false);
  });

  it("dispatches inputs by priority rather than installation order and rejects ties", async () => {
    const registry = createInputRegistry();
    const low = createScopeController();
    const high = createScopeController();
    const consumer = createScopeController();
    const q1 = []; const q2 = [];
    registry.createFacade(owner(low, q1)).register({ id: "z-low", priority: 1, recognize: () => true, handle: async () => "low" });
    registry.createFacade(owner(high, q2)).register({ id: "a-high", priority: 2, recognize: () => true, handle: async () => "high" });
    await commit(low, q1); await commit(high, q2); await consumer.commit();
    expect(await registry.createFacade(owner(consumer)).dispatch({ name: "x" })).toBe("high");
    const tie = createScopeController(); const q3 = [];
    registry.createFacade(owner(tie, q3)).register({ id: "b-high", priority: 2, recognize: () => true, handle: async () => "tie" });
    await commit(tie, q3);
    await expect(registry.createFacade(owner(consumer)).dispatch({ name: "x" })).rejects.toMatchObject({ code: "INPUT_HANDLER_CONFLICT" });
  });

  it("orders immutable contributions and isolates subscriber failures", async () => {
    const errors = [];
    const point = createContributionPoint({ id: "test", groups: ["first", "second"], validateDescriptor: (value) => !!value, onError: (error) => errors.push(error) });
    const contributor = createScopeController(); const queue = [];
    const subscriber = createScopeController();
    await subscriber.commit();
    const observed = [];
    const subscriberFacade = point.createFacade(owner(subscriber));
    subscriberFacade.subscribe(() => { throw new Error("subscriber"); });
    subscriberFacade.subscribe((snapshot) => observed.push(snapshot.map(({ id }) => id)));
    const facade = point.createFacade(owner(contributor, queue));
    facade.register({ id: "z", group: "second", rank: 0, descriptor: { label: "Z" } });
    facade.register({ id: "b", group: "first", rank: 1, descriptor: { label: "B" } });
    facade.register({ id: "a", group: "first", rank: 1, descriptor: { label: "A" } });
    expect(point.getSnapshot()).toEqual([]);
    await commit(contributor, queue);
    expect(point.getSnapshot().map(({ id }) => id)).toEqual(["a", "b", "z"]);
    expect(Object.isFrozen(point.getSnapshot()[0].descriptor)).toBe(true);
    expect(observed.at(-1)).toEqual(["a", "b", "z"]);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it("queues reentrant subscription delivery deterministically", () => {
    const observed = [];
    const scope = createScopeController();
    const channel = createSubscriptionChannel();
    channel.subscribe(scope.scope, (value) => {
      observed.push(`first:${value}`);
      if (value === 1) channel.deliver(2);
    }, { emitCurrent: false });
    channel.subscribe(scope.scope, (value) => observed.push(`second:${value}`), { emitCurrent: false });
    channel.deliver(1);
    expect(observed).toEqual(["first:1", "second:1", "first:2", "second:2"]);
  });

  it("flushes runtime post-commit notifications only after active publication", async () => {
    const { createPluginRuntime } = await import("../src/plugins/runtime/index.js");
    let runtime;
    const states = [];
    runtime = createPluginRuntime({
      catalog: [{ id: "x-provider", requires: [], load: () => ({ default: { id: "x-provider", setup(context) { context.testing.publish(); } } }) }],
      capabilityFactories: { testing: ({ enqueuePostCommit }) => ({ publish: () => enqueuePostCommit(() => states.push(runtime.has("x-provider"))) }) },
    });
    await runtime.use("x-provider");
    expect(states).toEqual([true]);
  });

  it("isolates post-commit notification failures without rolling back installation", async () => {
    const { createPluginRuntime } = await import("../src/plugins/runtime/index.js");
    const diagnostics = [];
    const runtime = createPluginRuntime({
      catalog: [{ id: "x-provider", requires: [], load: () => ({ default: { id: "x-provider", setup(context) { context.testing.publish(); } } }) }],
      capabilityFactories: { testing: ({ enqueuePostCommit }) => ({ publish: () => enqueuePostCommit(() => { throw new Error("notification"); }) }) },
      onDiagnostic: (error) => diagnostics.push(error),
    });
    await expect(runtime.use("x-provider")).resolves.toEqual({ id: "x-provider" });
    expect(runtime.has("x-provider")).toBe(true);
    expect(diagnostics).toHaveLength(1);
  });
});
