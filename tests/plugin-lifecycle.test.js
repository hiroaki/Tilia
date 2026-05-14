import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBaseMap } from "../src/map/base.js";

vi.mock("../src/core/boot.js", () => ({
  createTiliaCore: vi.fn(() => ({
    state: {},
    registry: {
      dispatch: vi.fn(),
    },
    context: {},
    subscribeInteractions: vi.fn(() => () => {}),
  })),
}));

vi.mock("../src/core/state.js", () => ({
  setError: vi.fn(),
}));

vi.mock("../src/builtins.js", () => ({
  builtins: {},
}));

vi.mock("../src/map/base.js", async () => {
  const actual = await vi.importActual("../src/map/base.js");
  return {
    ...actual,
    createBaseMap: vi.fn(() => ({
      map: {},
      tileLayer: null,
      baseLayer: null,
      baseLayers: [],
    })),
  };
});

vi.mock("../src/map/controls.js", () => ({
  createButton: vi.fn(),
  createPanel: vi.fn(),
  createSelect: vi.fn(),
  installMapControl: vi.fn(),
}));

import { createDefaultTiliaApp, createTiliaApp } from "../src/app.js";

describe("createTiliaApp plugin lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates concurrent plugin installation while setup is pending", async () => {
    let resolveSetup;
    const setup = vi.fn(() => new Promise((resolve) => {
      resolveSetup = resolve;
    }));
    const plugin = {
      id: "vendor-pending",
      setup,
    };
    const app = createTiliaApp({ map: {}, builtins: {} });

    const firstInstall = app.use(plugin);
    const secondInstall = app.use(plugin);
    await Promise.resolve();
    resolveSetup({ ready: true });

    const [firstApi, secondApi] = await Promise.all([firstInstall, secondInstall]);

    expect(setup).toHaveBeenCalledTimes(1);
    expect(firstApi).toBe(secondApi);
    expect(firstApi).toEqual({ ready: true });
  });

  it("installs each plugin only once and reuses its API", async () => {
    const setup = vi.fn(async (app, options) => ({
      enabled: true,
      mode: options.mode,
      map: app.getMap(),
    }));
    const plugin = {
      id: "vendor-plugin",
      setup,
    };
    const map = { name: "map-stub" };
    const app = createTiliaApp({ map, builtins: {} });

    const firstApi = await app.use(plugin, { mode: "initial" });
    const secondApi = await app.use(plugin, { mode: "ignored" });

    expect(setup).toHaveBeenCalledTimes(1);
    expect(firstApi).toBe(secondApi);
    expect(firstApi).toEqual({
      enabled: true,
      mode: "initial",
      map,
    });
    expect(app.services[plugin.id]).toBe(firstApi);
  });

  it("bootstraps configured plugins in order and reuses app.ready through whenReady", async () => {
    const installOrder = [];
    const builtins = {
      "vendor-first": {
        id: "vendor-first",
        setup: vi.fn(async (app, options) => {
          installOrder.push(["vendor-first", options.mode, app.getMap().name]);
          return { mode: options.mode };
        }),
      },
      "vendor-second": {
        id: "vendor-second",
        setup: vi.fn(async (app, options) => {
          installOrder.push(["vendor-second", options.mode, app.getMap().name]);
          return { mode: options.mode };
        }),
      },
      "vendor-third": {
        id: "vendor-third",
        setup: vi.fn(async (app, options) => {
          installOrder.push(["vendor-third", options.mode, app.getMap().name]);
          return { mode: options.mode };
        }),
      },
    };

    const app = createTiliaApp({
      map: { name: "bootstrap-map" },
      builtins,
      plugins: [
        "vendor-first",
        ["vendor-second", { mode: "array" }],
        { plugin: "vendor-third", options: { mode: "object" } },
      ],
      pluginOptions: {
        "vendor-first": { mode: "string" },
      },
    });

    const readyApp = await app.ready;
    const whenReadyApp = await app.whenReady();

    expect(readyApp).toBe(app);
    expect(whenReadyApp).toBe(app);
    expect(installOrder).toEqual([
      ["vendor-first", "string", "bootstrap-map"],
      ["vendor-second", "array", "bootstrap-map"],
      ["vendor-third", "object", "bootstrap-map"],
    ]);
    expect(app.services["vendor-first"]).toEqual({ mode: "string" });
    expect(app.services["vendor-second"]).toEqual({ mode: "array" });
    expect(app.services["vendor-third"]).toEqual({ mode: "object" });
  });

  it("rejects invalid configured plugin entries during app bootstrap", async () => {
    const app = createTiliaApp({
      map: {},
      builtins: {},
      plugins: [42],
    });

    await expect(app.ready).rejects.toThrow(
      "Configured plugins must be a string, [plugin, options], or { plugin, options }",
    );
  });

  it("creates the base map and forwards it into the default app factory", () => {
    const builtins = {
      "vendor-default": {
        id: "vendor-default",
        setup: vi.fn(async () => ({ ready: true })),
      },
    };
    const map = { name: "default-map" };
    const tileLayer = { name: "default-tile" };
    const baseLayer = {
      id: "osm",
      label: "OpenStreetMap",
      provider: "osm",
      category: "street",
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      visibleInSelector: true,
    };
    const baseLayers = [baseLayer];
    createBaseMap.mockReturnValueOnce({ map, tileLayer, baseLayer, baseLayers });

    const app = createDefaultTiliaApp("map-root", {
      builtins,
      baseMapOptions: {
        zoom: 12,
      },
      plugins: ["vendor-default"],
    });

    expect(createBaseMap).toHaveBeenCalledWith("map-root", { zoom: 12 });
    expect(app.getMap()).toBe(map);
    expect(app.getBaseLayer()).toBe(tileLayer);
    expect(app.getBaseMap()).toEqual({ map, tileLayer });
  });

  it("publishes a base-map service and facade on the app", () => {
    const app = createTiliaApp({ map: {}, builtins: {} });

    expect(app.baseMaps).toBe(app.services["tilia-base-maps"]);
    expect(app.baseMaps.list()).toEqual([]);
    expect(app.baseMaps.getCurrent()).toBeNull();
  });

  it("rejects plugins whose required dependency is not installed", async () => {
    const setup = vi.fn();
    const plugin = {
      id: "vendor-dependent",
      requires: ["vendor-base"],
      setup,
    };
    const app = createTiliaApp({ map: {}, builtins: {} });

    await expect(app.use(plugin)).rejects.toThrow('Plugin "vendor-dependent" requires "vendor-base"');
    expect(setup).not.toHaveBeenCalled();
  });

  it("runs teardown and removes the provided service on unuse", async () => {
    const destroy = vi.fn(async () => {});
    const plugin = {
      id: "vendor-teardown",
      setup: vi.fn(() => destroy),
    };
    const app = createTiliaApp({ map: {}, builtins: {} });

    const api = await app.use(plugin);
    const removedApi = await app.unuse(plugin.id);

    expect(api).toEqual({ destroy });
    expect(removedApi).toBe(api);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(app.services[plugin.id]).toBeUndefined();
    expect(app.plugins.has(plugin.id)).toBe(false);
  });
});