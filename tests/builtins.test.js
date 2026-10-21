import { beforeEach, describe, expect, it, vi } from "vitest";

const builtinMocks = vi.hoisted(() => ({
  installDropzonePlugin: vi.fn(),
  installFileImportControl: vi.fn(),
  installUrlImportControl: vi.fn(),
  installQueryImportPlugin: vi.fn(),
  installElevationPanelControl: vi.fn(),
  installBaseMapControl: vi.fn(),
  installLayersControl: vi.fn(),
  installPanelPlugin: vi.fn(),
  installSettingsPanelControl: vi.fn(),
  installStatusControl: vi.fn(),
}));

vi.mock("../src/core/boot.js", () => ({
  createTiliaCore: vi.fn(() => ({
    state: { entries: [] },
    registry: { dispatch: vi.fn() },
    context: {},
    subscribeInteractions: vi.fn(() => () => {}),
  })),
}));

vi.mock("../src/core/state.js", () => ({
  setError: vi.fn(),
}));

vi.mock("../src/plugins/input/dropzone.js", () => ({
  installDropzonePlugin: builtinMocks.installDropzonePlugin,
}));

vi.mock("../src/plugins/input/file-import.js", () => ({
  installFileImportControl: builtinMocks.installFileImportControl,
}));

vi.mock("../src/plugins/input/url-import.js", () => ({
  installUrlImportControl: builtinMocks.installUrlImportControl,
}));

vi.mock("../src/plugins/input/query-import.js", () => ({
  installQueryImportPlugin: builtinMocks.installQueryImportPlugin,
}));

vi.mock("../src/plugins/ui/elevation-panel.js", () => ({
  installElevationPanelControl: builtinMocks.installElevationPanelControl,
}));

vi.mock("../src/plugins/ui/base-map-control.js", () => ({
  installBaseMapControl: builtinMocks.installBaseMapControl,
}));

vi.mock("../src/plugins/ui/layers-control.js", () => ({
  installLayersControl: builtinMocks.installLayersControl,
}));

vi.mock("../src/plugins/ui/panel.js", () => ({
  installPanelPlugin: builtinMocks.installPanelPlugin,
}));

vi.mock("../src/plugins/ui/settings-panel.js", () => ({
  installSettingsPanelControl: builtinMocks.installSettingsPanelControl,
}));

vi.mock("../src/plugins/ui/status-control.js", () => ({
  installStatusControl: builtinMocks.installStatusControl,
}));

import {
  baseMaps,
  builtins,
  dropzone,
  elevation,
  fileImport,
  layers,
  panel,
  queryImport,
  settings,
  status,
  urlImport,
} from "../src/builtins.js";
import { createTiliaApp } from "../src/app.js";

function createAppStub(overrides = {}) {
  return {
    map: {
      getContainer: vi.fn(() => ({ id: "default-drop-target" })),
    },
    core: { id: "core" },
    registry: { id: "registry" },
    context: { id: "context" },
    services: {
      "tilia-panel": { id: "panel-service" },
    },
    baseMaps: { id: "base-maps-service" },
    setStatus: vi.fn(),
    setError: vi.fn(),
    refreshView: vi.fn(),
    addRefreshHandler: vi.fn(() => vi.fn()),
    ...overrides,
  };
}

describe("built-in plugins", () => {
  beforeEach(() => {
    Object.values(builtinMocks).forEach((mock) => mock.mockReset());
  });

  it("exposes canonical aliases for each built-in plugin", () => {
    expect(builtins.panel).toBe(panel);
    expect(builtins.status).toBe(status);
    expect(builtins.baseMaps).toBe(baseMaps);
    expect(builtins.layers).toBe(layers);
    expect(builtins.elevation).toBe(elevation);
    expect(builtins.fileImport).toBe(fileImport);
    expect(builtins.urlImport).toBe(urlImport);
    expect(builtins.queryImport).toBe(queryImport);
    expect(builtins.settings).toBe(settings);
    expect(builtins.dropzone).toBe(dropzone);
    expect(builtins["tilia-panel"]).toBe(panel);
    expect(builtins["tilia-status"]).toBe(status);
    expect(builtins["tilia-base-maps-control"]).toBe(baseMaps);
    expect(builtins["tilia-layers"]).toBe(layers);
    expect(builtins["tilia-elevation"]).toBe(elevation);
    expect(builtins["tilia-file-import"]).toBe(fileImport);
    expect(builtins["tilia-url-import"]).toBe(urlImport);
    expect(builtins["tilia-query-import"]).toBe(queryImport);
    expect(builtins["tilia-settings"]).toBe(settings);
    expect(builtins["tilia-dropzone"]).toBe(dropzone);
  });

  it("wires panel and status installers directly from the app map", () => {
    const panelApi = { id: "panel-api" };
    const statusApi = { id: "status-api" };
    const baseMapsApi = { render: vi.fn() };
    const app = createAppStub({ map: { id: "map" } });
    builtinMocks.installPanelPlugin.mockReturnValue(panelApi);
    builtinMocks.installStatusControl.mockReturnValue(statusApi);
    builtinMocks.installBaseMapControl.mockReturnValue(baseMapsApi);

    expect(panel.setup(app)).toBe(panelApi);
    expect(status.setup(app)).toBe(statusApi);
    expect(baseMaps.setup(app)).toBe(baseMapsApi);
    expect(builtinMocks.installPanelPlugin).toHaveBeenCalledWith({ map: app.map });
    expect(builtinMocks.installStatusControl).toHaveBeenCalledWith({
      map: app.map,
      position: "bottomleft",
      priority: "low",
    });
    expect(builtinMocks.installBaseMapControl).toHaveBeenCalledWith({
      map: app.map,
      baseMaps: app.baseMaps,
      onStatus: app.setStatus,
      position: "topright",
      priority: "normal",
    });
    expect(baseMapsApi.render).toHaveBeenCalledTimes(1);
  });

  it("forwards explicit tilia-status options to installStatusControl", () => {
    const app = createAppStub({ map: { id: "map" } });

    status.setup(app, {
      position: "topright",
      priority: "high",
      edgePolicy: "keep",
    });

    expect(builtinMocks.installStatusControl).toHaveBeenCalledWith({
      map: app.map,
      position: "topright",
      priority: "high",
      edgePolicy: "keep",
    });
  });

  it("wires layers and elevation plugins with panel dependencies and refresh hooks", () => {
    const app = createAppStub();
    const layersApi = { render: vi.fn() };
    const elevationApi = { refresh: vi.fn() };
    builtinMocks.installLayersControl.mockReturnValue(layersApi);
    builtinMocks.installElevationPanelControl.mockReturnValue(elevationApi);

    const layersResult = layers.setup(app, { color: "teal" });
    const elevationResult = elevation.setup(app, { compact: true });

    expect(layers.requires).toEqual(["tilia-panel"]);
    expect(elevation.requires).toEqual(["tilia-panel"]);
    expect(layersResult).toBe(layersApi);
    expect(elevationResult).toBe(elevationApi);
    expect(builtinMocks.installLayersControl).toHaveBeenCalledWith(expect.objectContaining({
      map: app.map,
      core: app.core,
      panel: app.services["tilia-panel"],
      onStatus: app.setStatus,
      onError: app.setError,
      color: "teal",
    }));
    expect(builtinMocks.installElevationPanelControl).toHaveBeenCalledWith(expect.objectContaining({
      map: app.map,
      core: app.core,
      panel: app.services["tilia-panel"],
      onStatus: app.setStatus,
      compact: true,
    }));
    expect(layersApi.render).toHaveBeenCalledTimes(1);
    expect(elevationApi.refresh).toHaveBeenCalledTimes(1);
    expect(app.addRefreshHandler).toHaveBeenCalledTimes(2);
  });

  it("releases built-in refresh handlers before destroying their controls", () => {
    const removeRefreshHandlers = [vi.fn(), vi.fn(), vi.fn()];
    let refreshHandlerIndex = 0;
    const app = createAppStub({
      addRefreshHandler: vi.fn(() => removeRefreshHandlers[refreshHandlerIndex++]),
    });
    const controlDestroyers = [vi.fn(), vi.fn(), vi.fn()];
    const installers = [
      [builtinMocks.installBaseMapControl, baseMaps, { render: vi.fn(), destroy: controlDestroyers[0] }],
      [builtinMocks.installLayersControl, layers, { render: vi.fn(), destroy: controlDestroyers[1] }],
      [builtinMocks.installElevationPanelControl, elevation, { refresh: vi.fn(), destroy: controlDestroyers[2] }],
    ];
    const installed = installers.map(([installer, plugin, api]) => {
      installer.mockReturnValue(api);
      return { api, installedApi: plugin.setup(app) };
    });

    installed.forEach(({ installedApi }) => installedApi.destroy());

    removeRefreshHandlers.forEach((remove) => expect(remove).toHaveBeenCalledOnce());
    controlDestroyers.forEach((destroy) => expect(destroy).toHaveBeenCalledOnce());
  });

  it("installs panel-based built-ins without a status plugin", async () => {
    builtinMocks.installPanelPlugin.mockReturnValue({ id: "panel-api" });
    builtinMocks.installLayersControl.mockReturnValue({ render: vi.fn() });
    builtinMocks.installElevationPanelControl.mockReturnValue({ refresh: vi.fn() });
    builtinMocks.installSettingsPanelControl.mockReturnValue({ id: "settings-api" });
    const app = createTiliaApp({ map: {}, builtins });

    await app.use("tilia-panel");
    await expect(app.use("tilia-layers")).resolves.toBeDefined();
    await expect(app.use("tilia-elevation")).resolves.toBeDefined();
    await expect(app.use("tilia-settings")).resolves.toBeDefined();

    expect(app.plugins.has("tilia-status")).toBe(false);
  });

  it("does not refresh uninstalled built-ins and supports clean reinstall", async () => {
    const panelApi = { id: "panel-api" };
    const baseMapsApi = { render: vi.fn(), destroy: vi.fn() };
    const reinstalledBaseMapsApi = { render: vi.fn(), destroy: vi.fn() };
    const layersApi = { render: vi.fn(), destroy: vi.fn() };
    const elevationApi = { refresh: vi.fn(), destroy: vi.fn() };
    builtinMocks.installPanelPlugin.mockReturnValue(panelApi);
    builtinMocks.installBaseMapControl
      .mockReturnValueOnce(baseMapsApi)
      .mockReturnValueOnce(reinstalledBaseMapsApi);
    builtinMocks.installLayersControl.mockReturnValue(layersApi);
    builtinMocks.installElevationPanelControl.mockReturnValue(elevationApi);
    const app = createTiliaApp({ map: {}, builtins });

    await app.use("tilia-panel");
    await app.use("tilia-base-maps-control");
    await app.use("tilia-layers");
    await app.use("tilia-elevation");
    await app.unuse("tilia-elevation");
    await app.unuse("tilia-layers");
    await app.unuse("tilia-base-maps-control");
    const callsAfterUninstall = [
      baseMapsApi.render.mock.calls.length,
      layersApi.render.mock.calls.length,
      elevationApi.refresh.mock.calls.length,
    ];

    app.refreshView();

    expect([
      baseMapsApi.render.mock.calls.length,
      layersApi.render.mock.calls.length,
      elevationApi.refresh.mock.calls.length,
    ]).toEqual(callsAfterUninstall);
    await expect(app.use("tilia-base-maps-control")).resolves.toBe(reinstalledBaseMapsApi);
    expect(app.plugins.has("tilia-base-maps-control")).toBe(true);
  });

  it.each([
    ["tilia-layers", layers],
    ["tilia-elevation", elevation],
    ["tilia-settings", settings],
  ])("still enforces the panel dependency for %s", async (pluginId, plugin) => {
    const app = createTiliaApp({ map: {}, builtins });

    await expect(app.use(pluginId)).rejects.toThrow(
      `Plugin "${plugin.id}" requires "tilia-panel"`,
    );
  });

  it("wires input and settings plugins with app services and callbacks", () => {
    const app = createAppStub();
    const fileImportApi = { id: "file-import-api" };
    const urlImportApi = { id: "url-import-api" };
    const queryImportApi = { id: "query-import-api" };
    const settingsApi = { id: "settings-api" };
    builtinMocks.installFileImportControl.mockReturnValue(fileImportApi);
    builtinMocks.installUrlImportControl.mockReturnValue(urlImportApi);
    builtinMocks.installQueryImportPlugin.mockReturnValue(queryImportApi);
    builtinMocks.installSettingsPanelControl.mockReturnValue(settingsApi);

    expect(fileImport.setup(app, { accept: ".gpx" })).toBe(fileImportApi);
    expect(urlImport.setup(app, { timeoutMs: 5000 })).toBe(urlImportApi);
    expect(queryImport.setup(app, { parameterName: "track" })).toBe(queryImportApi);
    expect(settings.setup(app, { allowUtc: true })).toBe(settingsApi);
    expect(settings.requires).toEqual(["tilia-panel"]);
    expect(builtinMocks.installFileImportControl).toHaveBeenCalledWith(expect.objectContaining({
      map: app.map,
      registry: app.registry,
      context: app.context,
      onStatus: app.setStatus,
      onError: app.setError,
      accept: ".gpx",
    }));
    expect(builtinMocks.installUrlImportControl).toHaveBeenCalledWith(expect.objectContaining({
      map: app.map,
      registry: app.registry,
      context: app.context,
      onStatus: app.setStatus,
      onError: app.setError,
      timeoutMs: 5000,
    }));
    expect(builtinMocks.installQueryImportPlugin).toHaveBeenCalledWith(expect.objectContaining({
      registry: app.registry,
      context: app.context,
      onStatus: app.setStatus,
      onError: app.setError,
      parameterName: "track",
    }));
    expect(builtinMocks.installSettingsPanelControl).toHaveBeenCalledWith(expect.objectContaining({
      map: app.map,
      core: app.core,
      panel: app.services["tilia-panel"],
      onStatus: app.setStatus,
      allowUtc: true,
    }));
  });

  it("uses the explicit or default drop target for the dropzone plugin", () => {
    const app = createAppStub();
    const explicitTarget = { id: "explicit-target" };
    const defaultDestroy = vi.fn();
    const explicitDestroy = vi.fn();
    builtinMocks.installDropzonePlugin
      .mockReturnValueOnce(defaultDestroy)
      .mockReturnValueOnce(explicitDestroy);

    const defaultApi = dropzone.setup(app, {});
    const explicitApi = dropzone.setup(app, { target: explicitTarget });

    expect(builtinMocks.installDropzonePlugin).toHaveBeenNthCalledWith(1, expect.objectContaining({
      dropTarget: { id: "default-drop-target" },
      registry: app.registry,
      context: app.context,
      onStatus: app.setStatus,
      onError: app.setError,
    }));
    expect(builtinMocks.installDropzonePlugin).toHaveBeenNthCalledWith(2, expect.objectContaining({
      dropTarget: explicitTarget,
    }));
    expect(defaultApi).toEqual({ destroy: defaultDestroy, target: { id: "default-drop-target" } });
    expect(explicitApi).toEqual({ destroy: explicitDestroy, target: explicitTarget });
  });
});
