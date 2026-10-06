import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/map/controls.js", () => ({ createButton: vi.fn(), createPanel: vi.fn(), createSelect: vi.fn(), installMapControl: vi.fn() }));

import { createTiliaApp } from "../src/app.js";

describe("createTiliaApp Phase 4B plugin boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates external definitions to PluginRuntime with guarded context", async () => {
    const setup = vi.fn((context, options) => {
      expect(Object.keys(context).sort()).toEqual(["baseMaps", "domains", "entries", "inputs", "interactions", "map", "plugin", "presentation", "renderers", "rendering", "scope", "selection", "services", "styles", "ui"]);
      expect(context).not.toHaveProperty("app");
      expect(context).not.toHaveProperty("core");
      expect(context).not.toHaveProperty("state");
      expect(options).toEqual({ mode: "test" });
    });
    const app = createTiliaApp({ map: {}, builtins: [] });
    await expect(app.use({ id: "vendor-plugin", setup }, { mode: "test" })).resolves.toEqual({ id: "vendor-plugin" });
    expect(app.hasPlugin("vendor-plugin")).toBe(true);
    expect(app.listPlugins()).toEqual(["vendor-plugin"]);
    expect(app).not.toHaveProperty("plugins");
  });

  it("deduplicates pending setup and returns one opaque handle", async () => {
    let release;
    const setup = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const plugin = { id: "vendor-pending", setup };
    const app = createTiliaApp({ map: {}, builtins: [] });
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
    const app = createTiliaApp({ map: {}, builtins: [] });
    await app.use({ id: "vendor-cleanup", setup: () => cleanup });
    await app.unuse("vendor-cleanup");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(app.hasPlugin("vendor-cleanup")).toBe(false);
  });

  it("bootstraps configured external definitions through the same runtime path", async () => {
    const events = [];
    const plugin = { id: "vendor-startup", setup: (_context, options) => { events.push(options.mode); } };
    const app = createTiliaApp({ map: {}, builtins: [], plugins: [[plugin, { mode: "ready" }]] });
    await expect(app.whenReady()).resolves.toBe(app);
    expect(events).toEqual(["ready"]);
  });

  it("rejects disabled repository plugins before loading", async () => {
    const load = vi.fn();
    const app = createTiliaApp({ map: {}, builtins: [{ id: "tilia-panel", requires: [], load }], plugins: ["tilia-panel"] });
    await expect(app.ready).rejects.toMatchObject({ code: "PLUGIN_DISABLED_BY_MIGRATION" });
    expect(load).not.toHaveBeenCalled();
  });

  it("rejects a disabled dependency before loading it or setting up its consumer", async () => {
    const disabledLoad = vi.fn();
    const consumerSetup = vi.fn();
    const app = createTiliaApp({
      map: {},
      builtins: [{ id: "tilia-panel", requires: [], load: disabledLoad }],
    });

    await expect(app.use({ id: "vendor-consumer", requires: ["tilia-panel"], setup: consumerSetup }))
      .rejects.toMatchObject({ code: "PLUGIN_DEPENDENCY_MISSING" });
    expect(disabledLoad).not.toHaveBeenCalled();
    expect(consumerSetup).not.toHaveBeenCalled();
  });

  it("rejects a transitive disabled dependency before loading any implementation", async () => {
    const disabledLoad = vi.fn();
    const middleLoad = vi.fn();
    const rootSetup = vi.fn();
    const app = createTiliaApp({
      map: {},
      builtins: [
        { id: "tilia-panel", requires: [], load: disabledLoad },
        { id: "vendor-middle", requires: ["tilia-panel"], load: middleLoad },
      ],
    });

    await expect(app.use({ id: "vendor-root", requires: ["vendor-middle"], setup: rootSetup }))
      .rejects.toMatchObject({ code: "PLUGIN_DEPENDENCY_MISSING" });
    expect(disabledLoad).not.toHaveBeenCalled();
    expect(middleLoad).not.toHaveBeenCalled();
    expect(rootSetup).not.toHaveBeenCalled();
  });

  it("exposes only target semantic authority after the Phase 4D cutover", async () => {
    const app = createTiliaApp({ map: {}, builtins: [] });
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
