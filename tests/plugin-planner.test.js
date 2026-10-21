import { describe, expect, it } from "vitest";
import { planDependencies } from "../src/plugins/runtime/index.js";

const meta = (id, requires = []) => ({ id, requires });

describe("plugin dependency planner", () => {
  it("produces deterministic dependency-first postorder with shared dependencies", () => {
    const catalog = new Map([
      ["x-a", meta("x-a", ["x-b", "x-d"])],
      ["x-b", meta("x-b", ["x-c"])],
      ["x-c", meta("x-c")],
      ["x-d", meta("x-d", ["x-c"])],
    ]);
    expect(planDependencies("x-a", catalog).order).toEqual(["x-c", "x-b", "x-d", "x-a"]);
    expect(planDependencies("x-a", catalog, new Set(["x-c"])).order).toEqual(["x-b", "x-d", "x-a"]);
  });

  it("reports missing dependencies before execution", () => {
    expect(() => planDependencies("x-a", new Map([["x-a", meta("x-a", ["x-missing"])]])))
      .toThrowError(expect.objectContaining({ code: "PLUGIN_DEPENDENCY_MISSING" }));
  });

  it("reports direct and transitive cycle paths", () => {
    const catalog = new Map([
      ["x-a", meta("x-a", ["x-b"])],
      ["x-b", meta("x-b", ["x-c"])],
      ["x-c", meta("x-c", ["x-a"])],
    ]);
    expect(() => planDependencies("x-a", catalog)).toThrowError(expect.objectContaining({
      code: "PLUGIN_DEPENDENCY_CYCLE",
      details: expect.objectContaining({ cycle: ["x-a", "x-b", "x-c", "x-a"] }),
    }));
  });
});
