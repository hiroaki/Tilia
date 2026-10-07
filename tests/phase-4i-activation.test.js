import { describe, expect, it, vi } from "vitest";
import { createPluginRuntime } from "../src/plugins/runtime/index.js";
describe("approved own-commit lifecycle", () => {
  it("runs only after own commit, cancels rollback and disallows late registration", async () => {
    const callback = vi.fn(), rolledBack = vi.fn(); let captured;
    const runtime = createPluginRuntime();
    await runtime.use({ id: "test-own-commit", setup(context) { captured = context; context.lifecycle.afterCommit(callback); expect(callback).not.toHaveBeenCalled(); } });
    expect(callback).toHaveBeenCalledOnce();
    expect(() => captured.lifecycle.afterCommit(() => {})).toThrowError(expect.objectContaining({ code: "EXTENSION_UNAVAILABLE" }));
    await expect(runtime.use({ id: "test-rollback", setup(context) { context.lifecycle.afterCommit(rolledBack); throw new Error("rollback"); } })).rejects.toBeDefined();
    expect(rolledBack).not.toHaveBeenCalled(); await runtime.unuse("test-own-commit");
  });
  it("idempotent cancel and diagnostic callback failures never undo commit", async () => {
    const errors = [], called = vi.fn(); const runtime = createPluginRuntime({ onDiagnostic: (e) => errors.push(e) });
    await runtime.use({ id: "test-cancel", setup(context) {
      const lease = context.lifecycle.afterCommit(called); lease.cancel(); lease.cancel();
      context.lifecycle.afterCommit(() => { throw new Error("callback"); });
      context.lifecycle.afterCommit(() => Promise.reject(new Error("thenable")));
    } });
    expect(called).not.toHaveBeenCalled(); expect(runtime.has("test-cancel")).toBe(true);
    await Promise.resolve(); expect(errors.length).toBeGreaterThanOrEqual(2); await runtime.unuse("test-cancel");
  });
});
