import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testMocks = vi.hoisted(() => ({
  controls: [],
  entries: [],
  mounts: [],
  mapHandlers: new Map(),
}));

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.listeners = new Map();
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.classList = {
      add: (...names) => this.#setClasses(names, true),
      remove: (...names) => this.#setClasses(names, false),
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const enabled = force ?? !this.classList.contains(name);
        this.#setClasses([name], enabled);
        return enabled;
      },
    };
  }

  #setClasses(names, enabled) {
    const classes = new Set(this.className.split(/\s+/).filter(Boolean));
    for (const name of names) enabled ? classes.add(name) : classes.delete(name);
    this.className = [...classes].join(" ");
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  remove() {}
}

vi.mock("../src/core/boot.js", () => ({
  createTiliaCore: vi.fn(() => ({
    state: { entries: testMocks.entries },
    registry: { dispatch: vi.fn() },
    context: {},
    subscribeInteractions: vi.fn(() => () => {}),
    getEffectiveGpxTrackVisibility: vi.fn(),
    getGpxTrackVisibility: vi.fn(),
    setGpxTrackVisibility: vi.fn(),
    addGpxSource: vi.fn(),
  })),
}));

vi.mock("../src/core/state.js", () => ({ setError: vi.fn() }));

vi.mock("../src/ui/styles.js", () => ({
  ensureBuiltinUiStyles: vi.fn(),
  registerStylesheet: vi.fn(),
}));

vi.mock("../src/ui/surfaces.js", () => ({
  createUiSurfaceManager: vi.fn(() => ({
    mount(item) {
      testMocks.mounts.push(item);
      return { unmount: vi.fn() };
    },
  })),
}));

vi.mock("../src/map/controls.js", () => ({
  createButton(label, className = "") {
    const element = new FakeElement("button");
    element.textContent = label;
    element.className = className;
    return element;
  },
  createPanel(className = "") {
    const element = new FakeElement("div");
    element.className = className;
    return element;
  },
  createSelect: vi.fn(() => new FakeElement("select")),
  installMapControl(options) {
    const content = options.createContent();
    testMocks.controls.push({ options, content });
    return { remove: vi.fn() };
  },
}));

vi.mock("leaflet", () => {
  class ChainableLayer {
    addTo() { return this; }
    clearLayers() { return this; }
    remove() { return this; }
    on() { return this; }
    off() { return this; }
  }
  return {
    LatLng: class LatLng {},
    Marker: class Marker extends ChainableLayer {},
    Polyline: class Polyline extends ChainableLayer {},
    DivIcon: class DivIcon {},
    FeatureGroup: class FeatureGroup extends ChainableLayer {},
    LayerGroup: class LayerGroup extends ChainableLayer {},
    Control: class Control {},
    DomEvent: {
      on: vi.fn(),
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
      disableScrollPropagation: vi.fn(),
    },
    DomUtil: {},
  };
});

import { createTiliaApp } from "../src/app.js";
import { gpxExportPlugin } from "../plugins/x-gpx-export/loader.js";
import { routeSearchPlugin } from "../plugins/x-route-search/loader.js";
import { trackEditorPlugin } from "../plugins/x-track-editor/loader.js";

function createMap() {
  const container = new FakeElement("div");
  return {
    getContainer: () => container,
    on: vi.fn((type, handler) => testMocks.mapHandlers.set(type, handler)),
    off: vi.fn(),
    closePopup: vi.fn(),
  };
}

function createApp() {
  const panelService = {
    togglePanel: vi.fn(),
    rerenderPanel: vi.fn(),
  };
  const panelPlugin = {
    id: "tilia-panel",
    setup: vi.fn(() => panelService),
  };
  const statusSink = vi.fn();
  const statusPlugin = {
    id: "tilia-status",
    setup: vi.fn(() => ({ setStatus: statusSink })),
  };
  const app = createTiliaApp({
    map: createMap(),
    builtins: {
      "tilia-panel": panelPlugin,
      "tilia-status": statusPlugin,
    },
  });
  return { app, panelService, statusSink };
}

describe("repository plugins with optional status UI", () => {
  beforeEach(() => {
    testMocks.controls.length = 0;
    testMocks.entries.length = 0;
    testMocks.mounts.length = 0;
    testMocks.mapHandlers.clear();
    globalThis.document = {
      createElement: (tagName) => new FakeElement(tagName),
    };
  });

  afterEach(() => {
    delete globalThis.document;
  });

  it.each([
    [trackEditorPlugin.id, trackEditorPlugin],
    [gpxExportPlugin.id, gpxExportPlugin],
  ])("still enforces the panel dependency for %s", async (pluginId, plugin) => {
    const { app } = createApp();

    await expect(app.use(plugin)).rejects.toThrow(
      `Plugin "${pluginId}" requires "tilia-panel"`,
    );
  });

  it("installs the track editor without status and starts an editing session", async () => {
    testMocks.entries.push({
      id: 1,
      kind: "gpx",
      source: { type: "gpx", name: "track.gpx", tracks: [], routes: [], waypoints: [] },
    });
    const { app, panelService } = createApp();
    await app.use("tilia-panel");

    const api = await app.use(trackEditorPlugin);

    expect(api).toEqual(expect.objectContaining({
      startEditing: expect.any(Function),
      saveEditing: expect.any(Function),
      cancelEditing: expect.any(Function),
      undo: expect.any(Function),
      redo: expect.any(Function),
      destroy: expect.any(Function),
    }));
    expect(testMocks.controls.at(-1).options.className).toBe("tilia-track-editor-control");
    expect(() => api.startEditing()).not.toThrow();
    expect(panelService.rerenderPanel).toHaveBeenCalledWith("track-editor");
  });

  it("installs GPX export without status and initializes its panel control", async () => {
    testMocks.entries.push({
      id: 1,
      kind: "gpx",
      source: { type: "gpx", name: "track.gpx", tracks: [], routes: [], waypoints: [] },
    });
    const { app, panelService } = createApp();
    await app.use("tilia-panel");

    const api = await app.use(gpxExportPlugin);
    const installed = testMocks.controls.at(-1);
    const button = installed.content.children[0];
    button.listeners.get("click")();

    expect(api.destroy).toEqual(expect.any(Function));
    expect(installed.options.className).toBe("tilia-gpx-export-control");
    expect(panelService.togglePanel).toHaveBeenCalledWith(expect.objectContaining({
      panelId: "gpx-export",
      render: expect.any(Function),
    }));
    const [{ render }] = panelService.togglePanel.mock.calls[0];
    const exportPanel = render();
    expect(exportPanel.children.at(-2).disabled).toBe(false);
    expect(exportPanel.children.at(-1).disabled).toBe(false);
  });

  it("installs route search without panel or status and initializes its form and map handlers", async () => {
    const { app } = createApp();

    const api = await app.use(routeSearchPlugin);

    expect(api.destroy).toEqual(expect.any(Function));
    expect(testMocks.controls.at(-1).options.className).toBe("tilia-route-search-control");
    expect(testMocks.mounts.map(({ id }) => id)).toEqual([
      "tilia-route-search-panel",
      "tilia-route-search-menu",
    ]);
    expect([...testMocks.mapHandlers.keys()]).toEqual(expect.arrayContaining([
      "contextmenu",
      "click",
      "movestart",
    ]));
  });

  it("routes only subsequent status messages while the provider is installed", async () => {
    const { app, statusSink } = createApp();
    await app.use("tilia-panel");
    const editor = await app.use(trackEditorPlugin);

    expect(() => editor.startEditing()).not.toThrow();
    expect(statusSink).not.toHaveBeenCalled();

    await app.use("tilia-status");
    editor.startEditing();
    expect(statusSink).toHaveBeenCalledWith("Track editor: select a GPX layer first");

    await app.unuse("tilia-status");
    expect(() => editor.startEditing()).not.toThrow();
    expect(statusSink).toHaveBeenCalledTimes(1);
  });
});
