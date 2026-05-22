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

function createDocumentStub() {
  const links = [];
  return {
    head: {
      querySelectorAll(selector) {
        if (selector === "link[data-tilia-stylesheet]") {
          return links;
        }
        return [];
      },
      appendChild(node) {
        links.push(node);
        return node;
      },
    },
    createElement(tagName) {
      return {
        tagName,
        dataset: {},
      };
    },
    get stylesheetLinks() {
      return links;
    },
  };
}

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

  it("uses one merged baseLayerOverrides map for initial creation and plugin-registered entries", async () => {
    const baseLayer = {
      id: "osm",
      label: "OpenStreetMap",
      provider: "osm",
      category: "street",
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      visibleInSelector: true,
    };
    const map = {
      addLayer: vi.fn(),
    };
    createBaseMap.mockReturnValueOnce({
      map,
      tileLayer: null,
      baseLayer,
      baseLayers: [baseLayer],
    });
    const app = createDefaultTiliaApp("map-root", {
      builtins: {},
      baseMapOptions: {
        baseLayerOverrides: {
          "vendor-street": {
            label: "Vendor Street Custom",
            options: { maxZoom: 17 },
          },
        },
      },
      baseLayerOverrides: {
        "vendor-street": {
          visibleInSelector: false,
          options: { minZoom: 4 },
        },
      },
    });

    await app.use({
      id: "vendor-base-map-provider",
      setup(runtimeApp) {
        runtimeApp.baseMaps.register({
          id: "vendor-street",
          label: "Vendor Street",
          provider: "vendor",
          category: "street",
          url: "https://example.com/street/{z}/{x}/{y}.png",
          visibleInSelector: true,
        });
      },
    });

    expect(createBaseMap).toHaveBeenCalledWith("map-root", {
      baseLayerOverrides: {
        "vendor-street": {
          label: "Vendor Street Custom",
          visibleInSelector: false,
          options: {
            maxZoom: 17,
            minZoom: 4,
          },
        },
      },
    });
    expect(app.baseMaps.get("vendor-street")).toEqual(expect.objectContaining({
      id: "vendor-street",
      label: "Vendor Street Custom",
      visibleInSelector: false,
      options: expect.objectContaining({
        maxZoom: 17,
        minZoom: 4,
      }),
    }));
  });

  it("injects the built-in stylesheet only once per document", () => {
    const ownerDocument = createDocumentStub();
    const map = {
      getContainer() {
        return { ownerDocument };
      },
    };

    createTiliaApp({ map, builtins: {} });
    createTiliaApp({ map, builtins: {} });

    expect(ownerDocument.stylesheetLinks).toHaveLength(1);
    expect(ownerDocument.stylesheetLinks[0].rel).toBe("stylesheet");
    expect(ownerDocument.stylesheetLinks[0].dataset.tiliaStylesheet).toBe("tilia-core-ui");
  });

  it("registers plugin declared stylesheets before setup", async () => {
    const ownerDocument = createDocumentStub();
    const map = {
      getContainer() {
        return { ownerDocument };
      },
    };
    const setup = vi.fn(() => ({ ready: true }));
    const app = createTiliaApp({ map, builtins: {} });

    await app.use({
      id: "vendor-styled-plugin",
      stylesheets: [
        "https://example.com/vendor.css",
        { href: "https://example.com/vendor-extra.css", id: "vendor-extra" },
      ],
      setup,
    });

    expect(setup).toHaveBeenCalledTimes(1);
    expect(ownerDocument.stylesheetLinks).toHaveLength(3);
    expect(ownerDocument.stylesheetLinks.map((link) => link.href)).toEqual([
      expect.stringContaining("/src/ui/styles.css"),
      "https://example.com/vendor.css",
      "https://example.com/vendor-extra.css",
    ]);
  });

  it("publishes a base-map service and facade on the app", () => {
    const app = createTiliaApp({ map: {}, builtins: {} });

    expect(app.baseMaps).toBe(app.services["tilia-base-maps"]);
    expect(app.baseMaps.list()).toEqual([]);
    expect(app.baseMaps.getCurrent()).toBeNull();
  });

  it("lets plugins contribute base-map definitions through the public facade", async () => {
    const refreshHandler = vi.fn();
    const plugin = {
      id: "vendor-base-map-provider",
      setup(app) {
        app.baseMaps.registerMany([
          {
            id: "vendor-street",
            label: "Vendor Street",
            provider: "vendor",
            category: "street",
            url: "https://example.com/street/{z}/{x}/{y}.png",
          },
          {
            id: "vendor-hidden",
            label: "Vendor Hidden",
            provider: "vendor",
            category: "street",
            url: "https://example.com/hidden/{z}/{x}/{y}.png",
            visibleInSelector: false,
          },
        ]);
        return { registered: true };
      },
    };
    const app = createTiliaApp({ map: {}, builtins: {} });
    app.addRefreshHandler(refreshHandler);

    await app.use(plugin);

    expect(app.baseMaps.list().map((definition) => definition.id)).toEqual([
      "vendor-street",
      "vendor-hidden",
    ]);
    expect(app.baseMaps.listVisible().map((definition) => definition.id)).toEqual([
      "vendor-street",
    ]);
    expect(refreshHandler).toHaveBeenCalledTimes(1);
  });

  it("applies configured base-layer overrides to plugin-contributed definitions", async () => {
    const plugin = {
      id: "vendor-base-map-provider",
      setup(app) {
        app.baseMaps.register({
          id: "vendor-street",
          label: "Vendor Street",
          provider: "vendor",
          category: "street",
          url: "https://example.com/street/{z}/{x}/{y}.png",
          visibleInSelector: true,
        });
        return { registered: true };
      },
    };
    const app = createTiliaApp({
      map: {},
      builtins: {},
      baseLayerOverrides: {
        "vendor-street": {
          label: "Vendor Street Hidden",
          visibleInSelector: false,
        },
      },
    });

    await app.use(plugin);

    expect(app.baseMaps.get("vendor-street")).toEqual(expect.objectContaining({
      id: "vendor-street",
      label: "Vendor Street Hidden",
      visibleInSelector: false,
    }));
    expect(app.baseMaps.listVisible()).toEqual([]);
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