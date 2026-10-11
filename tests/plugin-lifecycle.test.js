import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/map/controls.js", () => ({ createButton: vi.fn(), createPanel: vi.fn(), createSelect: vi.fn(), installMapControl: vi.fn() }));

import { createApplicationComposition } from "../src/application-composition.js";
const createMachineryApp = options => createApplicationComposition(options).app;

describe("createMachineryApp Phase 4B plugin boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates external definitions to PluginRuntime with guarded context", async () => {
    const setup = vi.fn((context, options) => {
      expect(Object.keys(context).sort()).toEqual(["baseMaps", "contributions", "diagnostics", "domains", "entries", "inputs", "interactions", "lifecycle", "map", "plugin", "presentation", "renderers", "rendering", "scope", "selection", "services", "styles", "ui"]);
      expect(context).not.toHaveProperty("app");
      expect(context).not.toHaveProperty("core");
      expect(context).not.toHaveProperty("state");
      expect(options).toEqual({ mode: "test" });
    });
    const app = createMachineryApp({ map: {}, builtins: [] });
    await expect(app.use({ id: "vendor-plugin", setup }, { mode: "test" })).resolves.toEqual({ id: "vendor-plugin" });
    expect(app.hasPlugin("vendor-plugin")).toBe(true);
    expect(app.listPlugins()).toEqual(["vendor-plugin"]);
    expect(app).not.toHaveProperty("plugins");
  });

  it("deduplicates pending setup and returns one opaque handle", async () => {
    let release;
    const setup = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const plugin = { id: "vendor-pending", setup };
    const app = createMachineryApp({ map: {}, builtins: [] });
    const first = app.use(plugin);
    const second = app.use(plugin);
    while (!release) await Promise.resolve();
    release();
    const [firstHandle, secondHandle] = await Promise.all([first, second]);
    expect(firstHandle).toBe(secondHandle);
    expect(setup).toHaveBeenCalledOnce();
  });

  it("uses cleanup-only setup results and removes through the runtime", async () => {
    const cleanup = vi.fn();
    const app = createMachineryApp({ map: {}, builtins: [] });
    await app.use({ id: "vendor-cleanup", setup: () => cleanup });
    await app.unuse("vendor-cleanup");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(app.hasPlugin("vendor-cleanup")).toBe(false);
  });

  it("bootstraps configured external definitions through the same runtime path", async () => {
    const events = [];
    const plugin = { id: "vendor-startup", setup: (_context, options) => { events.push(options.mode); } };
    const app = createMachineryApp({ map: {}, builtins: [], plugins: [[plugin, { mode: "ready" }]] });
    await expect(app.whenReady()).resolves.toBe(app);
    expect(events).toEqual(["ready"]);
  });

  it("loads the final migrated repository plugin through the normal runtime", async () => {
    const setup = vi.fn();
    const load = vi.fn(async () => ({ default: { id: "x-milestone", requires: [], setup } }));
    const app = createMachineryApp({ map: {}, builtins: [{ id: "x-milestone", requires: [], load }], plugins: ["x-milestone"] });
    await expect(app.ready).resolves.toBe(app);
    expect(load).toHaveBeenCalledOnce();
    expect(setup).toHaveBeenCalledOnce();
    await app.unuse("x-milestone");
  });

  it("rejects a missing dependency before setting up its consumer", async () => {
    const consumerSetup = vi.fn();
    const app = createMachineryApp({
      map: {},
      builtins: [],
    });

    await expect(app.use({ id: "vendor-consumer", requires: ["x-milestone"], setup: consumerSetup }))
      .rejects.toMatchObject({ code: "PLUGIN_DEPENDENCY_MISSING" });
    expect(consumerSetup).not.toHaveBeenCalled();
  });

  it("rejects a transitive missing dependency before loading any implementation", async () => {
    const middleLoad = vi.fn();
    const rootSetup = vi.fn();
    const app = createMachineryApp({
      map: {},
      builtins: [
        { id: "vendor-middle", requires: ["x-milestone"], load: middleLoad },
      ],
    });

    await expect(app.use({ id: "vendor-root", requires: ["vendor-middle"], setup: rootSetup }))
      .rejects.toMatchObject({ code: "PLUGIN_DEPENDENCY_MISSING" });
    expect(middleLoad).not.toHaveBeenCalled();
    expect(rootSetup).not.toHaveBeenCalled();
  });

  it("exposes only target semantic authority after the Phase 4D cutover", async () => {
    const app = createMachineryApp({ map: {}, builtins: [] });
    await app.ready;
    expect(app).not.toHaveProperty("core");
    expect(app).not.toHaveProperty("state");
    expect(app).not.toHaveProperty("refreshView");
    expect(app).not.toHaveProperty("addRefreshHandler");
    expect(app).not.toHaveProperty("subscribeInteractions");
    expect(Object.isFrozen(app.entries)).toBe(true);
    expect(Object.isFrozen(app.domains)).toBe(true);
    expect(Object.isFrozen(app.domains.gpx)).toBe(true);
    expect(Object.isFrozen(app.domains.photo)).toBe(true);
    await app.use({ id: "vendor-isolated", setup(context) {
      expect(context).not.toHaveProperty("core");
      expect(context).not.toHaveProperty("state");
    } });
  });
});
