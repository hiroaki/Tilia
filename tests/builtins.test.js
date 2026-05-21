import { beforeEach, describe, expect, it, vi } from "vitest";

const builtinMocks = vi.hoisted(() => ({
  installDropzonePlugin: vi.fn(),
  installFileImportControl: vi.fn(),
  installUrlImportControl: vi.fn(),
  installElevationPanelControl: vi.fn(),
  installBaseMapControl: vi.fn(),
  installLayersControl: vi.fn(),
  installPanelPlugin: vi.fn(),
  installSettingsPanelControl: vi.fn(),
  installStatusControl: vi.fn(),
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
  settings,
  status,
  urlImport,
} from "../src/builtins.js";

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
    addRefreshHandler: vi.fn(),
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
    expect(builtins.settings).toBe(settings);
    expect(builtins.dropzone).toBe(dropzone);
    expect(builtins["tilia-panel"]).toBe(panel);
    expect(builtins["tilia-status"]).toBe(status);
    expect(builtins["tilia-base-maps-control"]).toBe(baseMaps);
    expect(builtins["tilia-layers"]).toBe(layers);
    expect(builtins["tilia-elevation"]).toBe(elevation);
    expect(builtins["tilia-file-import"]).toBe(fileImport);
    expect(builtins["tilia-url-import"]).toBe(urlImport);
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

  it("wires layers and elevation plugins with panel dependencies and refresh hooks", () => {
    const app = createAppStub();
    const layersApi = { render: vi.fn() };
    const elevationApi = { refresh: vi.fn() };
    builtinMocks.installLayersControl.mockReturnValue(layersApi);
    builtinMocks.installElevationPanelControl.mockReturnValue(elevationApi);

    const layersResult = layers.setup(app, { color: "teal" });
    const elevationResult = elevation.setup(app, { compact: true });

    expect(layers.requires).toEqual(["tilia-panel", "tilia-status"]);
    expect(elevation.requires).toEqual(["tilia-panel", "tilia-status"]);
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

  it("wires input and settings plugins with app services and callbacks", () => {
    const app = createAppStub();
    const fileImportApi = { id: "file-import-api" };
    const urlImportApi = { id: "url-import-api" };
    const settingsApi = { id: "settings-api" };
    builtinMocks.installFileImportControl.mockReturnValue(fileImportApi);
    builtinMocks.installUrlImportControl.mockReturnValue(urlImportApi);
    builtinMocks.installSettingsPanelControl.mockReturnValue(settingsApi);

    expect(fileImport.setup(app, { accept: ".gpx" })).toBe(fileImportApi);
    expect(urlImport.setup(app, { timeoutMs: 5000 })).toBe(urlImportApi);
    expect(settings.setup(app, { allowUtc: true })).toBe(settingsApi);
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
    expect(defaultApi).toEqual({ target: { id: "default-drop-target" } });
    expect(explicitApi).toEqual({ target: explicitTarget });
  });
});