import { describe, expect, it, vi } from "vitest";
import { createScopeController } from "../src/ownership/index.js";
import { createPluginContext } from "../src/plugins/runtime/index.js";

describe("guarded PluginContext", () => {
  it("exposes only identity, public Scope, and explicit named capabilities", async () => {
    const controller = createScopeController();
    const context = createPluginContext({
      pluginId: "x-example",
      scope: controller.scope,
      capabilityFactories: { example: ({ scope }) => ({ assert: () => scope.assertAlive() }) },
    });
    expect(Object.keys(context).sort()).toEqual(["example", "plugin", "scope"]);
    expect(context.plugin).toEqual({ id: "x-example" });
    expect(context).not.toHaveProperty("app");
    expect(context).not.toHaveProperty("runtime");
    expect(context).not.toHaveProperty("use");
    expect(context).not.toHaveProperty("unuse");
    expect(context).not.toHaveProperty("destroy");
    expect(context.scope).not.toHaveProperty("commit");
    expect(Object.isFrozen(context)).toBe(true);
    await controller.commit();
    context.example.assert();
    await controller.close();
    expect(() => context.example.assert()).toThrowError(expect.objectContaining({ code: "SCOPE_NOT_ACTIVE" }));
  });

  it("turns guarded callbacks into stale no-ops", async () => {
    const controller = createScopeController();
    const callback = vi.fn();
    const guarded = controller.scope.guard(callback);
    await controller.commit();
    guarded();
    await controller.close();
    guarded();
    expect(callback).toHaveBeenCalledOnce();
  });
});
