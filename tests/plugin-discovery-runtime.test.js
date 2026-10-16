import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/plugins/runtime/discovery.js", () => ({ loadDirectoryDefinition: vi.fn() }));
import { loadDirectoryDefinition } from "../src/plugins/runtime/discovery.js";
import { normalizeDirectDefinition } from "../src/plugins/runtime/catalog.js";
import { createPluginRuntime } from "../src/plugins/runtime/runtime.js";
import { pluginError, pluginErrorCodes } from "../src/plugins/runtime/errors.js";

let runtime;
const gate = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const plugin = (id, requires = [], setup = () => {}) => ({ id, requires, setup });
function discover(definitions) {
  loadDirectoryDefinition.mockImplementation(async id => {
    if (!definitions[id]) throw pluginError(pluginErrorCodes.resolutionFailed, "missing", { pluginId: id });
    return normalizeDirectDefinition(definitions[id]);
  });
}
beforeEach(() => { loadDirectoryDefinition.mockReset(); runtime = createPluginRuntime(); });
afterEach(async () => { await runtime.destroy().catch(() => {}); });
describe("discovery before the existing planner and lifecycle", () => {
  it("discovers transitive shared dependencies in declaration order and forwards root options", async () => {
    const order = [], options = { enabled: true };
    discover({
      "company-root": plugin("company-root", ["vendor-left", "vendor-right"], (_context, received) => { expect(received).toBe(options); order.push("root"); }),
      "vendor-left": plugin("vendor-left", ["company-base"], (_context, received) => { expect(received).toEqual({}); order.push("left"); }),
      "vendor-right": plugin("vendor-right", ["company-base"], () => { order.push("right"); }),
      "company-base": plugin("company-base", [], () => { order.push("base"); }),
    });
    const first = runtime.use("company-root", options), second = runtime.use("company-root", { enabled: false });
    expect(first).toBe(second);
    await first;
    expect(order).toEqual(["base", "left", "right", "root"]);
    expect(loadDirectoryDefinition).toHaveBeenCalledTimes(4);
    await expect(runtime.unuse("company-base")).rejects.toMatchObject({ code: "PLUGIN_HAS_DEPENDENTS" });
    await runtime.unuse("company-root"); await runtime.use("company-root", options);
    expect(loadDirectoryDefinition).toHaveBeenCalledTimes(4);
  });
  it("discovers overlapping queued roots while installing their shared dependency once", async () => {
    const setup = vi.fn();
    discover({ "company-a": plugin("company-a", ["vendor-base"]), "company-b": plugin("company-b", ["vendor-base"]), "vendor-base": plugin("vendor-base", [], setup) });
    await Promise.all([runtime.use("company-a"), runtime.use("company-b")]);
    expect(setup).toHaveBeenCalledOnce(); expect(loadDirectoryDefinition).toHaveBeenCalledTimes(3);
  });
  it("finds a missing late branch before setting up any newly required plugin", async () => {
    const setup = vi.fn();
    discover({ "company-root": plugin("company-root", ["company-base", "vendor-helper"], setup), "company-base": plugin("company-base", [], setup), "vendor-helper": plugin("vendor-helper", ["vendor-missing"], setup) });
    await expect(runtime.use("company-root")).rejects.toMatchObject({ code: "PLUGIN_DEPENDENCY_FAILED", details: { dependencyId: "vendor-missing", path: ["company-root", "vendor-helper", "vendor-missing"] }, cause: { code: "PLUGIN_RESOLUTION_FAILED" } });
    expect(setup).not.toHaveBeenCalled(); expect(runtime.list()).toEqual([]);
  });
  it("leaves cycle diagnosis to the planner before setup", async () => {
    const setup = vi.fn();
    discover({ "company-a": plugin("company-a", ["vendor-b"], setup), "vendor-b": plugin("vendor-b", ["company-a"], setup) });
    await expect(runtime.use("company-a")).rejects.toMatchObject({ code: "PLUGIN_DEPENDENCY_CYCLE", details: { cycle: ["company-a", "vendor-b", "company-a"] } });
    expect(setup).not.toHaveBeenCalled(); expect(loadDirectoryDefinition).toHaveBeenCalledTimes(2);
  });
  it("uses explicit catalog metadata and built-in dependencies without discovering their implementations", async () => {
    const order = [], load = vi.fn(() => plugin("tilia-base", [], () => { order.push("base"); }));
    runtime = createPluginRuntime({ catalog: [{ id: "tilia-base", load }, { id: "company-explicit", load: () => plugin("company-explicit") }] });
    discover({ "company-root": plugin("company-root", ["tilia-base"], () => { order.push("root"); }) });
    await runtime.use("company-explicit"); expect(loadDirectoryDefinition).not.toHaveBeenCalled();
    await runtime.use("company-root"); expect(order).toEqual(["base", "root"]); expect(load).toHaveBeenCalledOnce();
    expect(loadDirectoryDefinition).toHaveBeenCalledTimes(1);
  });
  it("never discovers unknown tilia IDs, including dependencies", async () => {
    expect(() => runtime.use("tilia-missing")).toThrowError(expect.objectContaining({ code: "PLUGIN_ID_INVALID" }));
    await expect(runtime.use(plugin("company-root", ["tilia-missing"]))).rejects.toMatchObject({ code: "PLUGIN_DEPENDENCY_MISSING" });
    expect(loadDirectoryDefinition).not.toHaveBeenCalled();
  });
  it.each(["PLUGIN_RESOLUTION_FAILED", "PLUGIN_IMPLEMENTATION_INVALID"])("retries %s without retaining failed discovery", async code => {
    loadDirectoryDefinition.mockRejectedValueOnce(pluginError(code, "failed")).mockResolvedValueOnce(normalizeDirectDefinition(plugin("company-retry")));
    await expect(runtime.use("company-retry")).rejects.toMatchObject({ code });
    await runtime.use("company-retry"); expect(loadDirectoryDefinition).toHaveBeenCalledTimes(2);
  });
  it("rejects different implementations with matching metadata during pending import, then consistently uses the registered direct definition", async () => {
    const pending = gate(), entered = gate(), importedSetup = vi.fn(), directSetup = vi.fn();
    const imported = plugin("company-conflict", [], importedSetup);
    const direct = plugin("company-conflict", [], directSetup);
    loadDirectoryDefinition.mockImplementation(() => { entered.resolve(); return pending.promise; });
    const first = runtime.use("company-conflict"); await entered.promise;
    // Registration happens synchronously, before same-ID operation sharing.
    const sameOperation = runtime.use(direct); expect(sameOperation).toBe(first);
    pending.resolve(normalizeDirectDefinition(imported));
    await expect(first).rejects.toMatchObject({ code: "PLUGIN_DESCRIPTOR_CONFLICT" });
    await expect(sameOperation).rejects.toMatchObject({ code: "PLUGIN_DESCRIPTOR_CONFLICT" });
    expect(runtime.list()).toEqual([]);
    expect(importedSetup).not.toHaveBeenCalled(); expect(directSetup).not.toHaveBeenCalled();
    await runtime.use("company-conflict");
    await runtime.unuse("company-conflict"); await runtime.use("company-conflict");
    expect(directSetup).toHaveBeenCalledTimes(2); expect(importedSetup).not.toHaveBeenCalled();
    expect(loadDirectoryDefinition).toHaveBeenCalledOnce();
  });
  it("accepts the identical direct definition during pending import and retains first-request options", async () => {
    const pending = gate(), entered = gate(), setup = vi.fn(), options = { enabled: true };
    const definition = plugin("company-identical", [], setup);
    loadDirectoryDefinition.mockImplementation(() => { entered.resolve(); return pending.promise; });
    const first = runtime.use(definition.id, options); await entered.promise;
    expect(runtime.use(definition, { enabled: false })).toBe(first);
    pending.resolve(normalizeDirectDefinition(definition)); await first;
    expect(setup).toHaveBeenCalledOnce(); expect(setup.mock.calls[0][1]).toBe(options);
    await runtime.unuse(definition.id); await runtime.use(definition.id);
    expect(setup).toHaveBeenCalledTimes(2); expect(loadDirectoryDefinition).toHaveBeenCalledOnce();
  });
  it.each(["resolve", "reject"])("finishes shutdown without waiting for import and ignores late %s", async completion => {
    const pending = gate(), entered = gate(), setup = vi.fn();
    loadDirectoryDefinition.mockImplementation(() => { entered.resolve(); return pending.promise; });
    const installing = runtime.use("company-late");
    const failure = expect(installing).rejects.toMatchObject({ code: "PLUGIN_RUNTIME_DESTROYING" });
    await entered.promise; await runtime.destroy(); await failure;
    if (completion === "resolve") pending.resolve(normalizeDirectDefinition(plugin("company-late", [], setup)));
    else pending.reject(new Error("late failure"));
    await pending.promise.catch(() => {}); await Promise.resolve();
    expect(setup).not.toHaveBeenCalled(); expect(runtime.list()).toEqual([]); expect(runtime.state).toBe("destroyed");
  });
  it("rolls back discovered setup failure while preserving successful prerequisites", async () => {
    const cleanup = vi.fn();
    discover({ "vendor-base": plugin("vendor-base"), "company-root": plugin("company-root", ["vendor-base"], context => { context.scope.defer(cleanup); throw new Error("setup failed"); }) });
    await expect(runtime.use("company-root")).rejects.toMatchObject({ code: "PLUGIN_SETUP_FAILED" });
    expect(cleanup).toHaveBeenCalledOnce(); expect(runtime.list()).toEqual(["vendor-base"]);
  });
});
