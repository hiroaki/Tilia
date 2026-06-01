import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as controlsModule from "../src/map/controls.js";

vi.mock("../src/map/controls.js", () => ({
  createButton: vi.fn(),
  createPanel: vi.fn(),
  createSelect: vi.fn(),
  installMapControl: vi.fn(),
}));

vi.mock("../src/map/layers.js", () => ({
  createPhotoThumbnailNode: vi.fn(() => null),
}));

class MockNode {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.style = {};
    this.attributes = {};
    this.title = "";
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = "";
    this.type = "";
    this.id = "";
    this.textContent = "";
    this.innerHTML = "";
    this.eventListeners = new Map();
    this.classList = {
      add: (...tokens) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        for (const token of tokens) {
          classes.add(token);
        }
        this.className = Array.from(classes).join(" ");
      },
      contains: (token) => this.className.split(/\s+/).filter(Boolean).includes(token),
    };
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name === "aria-label") {
      this.ariaLabel = value;
    }
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(name, listener) {
    const listeners = this.eventListeners.get(name) || [];
    listeners.push(listener);
    this.eventListeners.set(name, listeners);
  }

  dispatch(name, event = {}) {
    const listeners = this.eventListeners.get(name) || [];
    for (const listener of listeners) {
      listener({ target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...event });
    }
  }

  click() {
    this.dispatch("click");
  }

  closest(selector) {
    const selectors = selector.split(",").map((part) => part.trim().toUpperCase());
    let current = this;
    while (current) {
      if (selectors.includes(current.tagName)) {
        return current;
      }
      current = current.parentNode;
    }
    return null;
  }
}

function createDocumentStub() {
  return {
    createElement(tagName) {
      return new MockNode(tagName);
    },
  };
}

function findByClassName(root, className) {
  if (root.className.split(/\s+/).includes(className)) {
    return root;
  }
  for (const child of root.children) {
    const match = findByClassName(child, className);
    if (match) {
      return match;
    }
  }
  return null;
}

function findCheckboxById(root, id) {
  if (root.id === id) {
    return root;
  }
  for (const child of root.children) {
    const match = findCheckboxById(child, id);
    if (match) {
      return match;
    }
  }
  return null;
}

function getLastInstalledLauncher() {
  const results = controlsModule.installMapControl.mock.results;
  const lastResult = results[results.length - 1];
  return lastResult.value.content.children[0];
}

describe("createTrackStyleSwatch", () => {
  const originalDocument = globalThis.document;
  const originalHTMLElement = globalThis.HTMLElement;
  const originalNode = globalThis.Node;

  beforeEach(() => {
    controlsModule.createButton.mockReset();
    controlsModule.createPanel.mockReset();
    controlsModule.createSelect.mockReset();
    controlsModule.installMapControl.mockReset();
    controlsModule.createButton.mockImplementation((label, className = "") => {
      const button = globalThis.document.createElement("button");
      button.className = className;
      button.textContent = label;
      return button;
    });
    controlsModule.createPanel.mockImplementation((className = "") => {
      const panel = globalThis.document.createElement("div");
      panel.className = `tilia-control-panel ${className}`.trim();
      return panel;
    });
    controlsModule.createSelect.mockImplementation(() => globalThis.document.createElement("select"));
    controlsModule.installMapControl.mockImplementation(({ createContent }) => ({
      content: createContent(),
    }));
  });

  beforeEach(() => {
    globalThis.document = createDocumentStub();
    globalThis.HTMLElement = MockNode;
    globalThis.Node = MockNode;
  });

  afterEach(() => {
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }

    if (originalHTMLElement === undefined) {
      delete globalThis.HTMLElement;
    } else {
      globalThis.HTMLElement = originalHTMLElement;
    }

    if (originalNode === undefined) {
      delete globalThis.Node;
    } else {
      globalThis.Node = originalNode;
    }
  });

  it("creates a color swatch for GPX entries from the assigned preset", async () => {
    const { createTrackStyleSwatch } = await import("../src/plugins/ui/layers-control.js");

    const swatch = createTrackStyleSwatch({
      kind: "gpx",
      presentation: { trackStylePresetIndex: 3 },
    });

    expect(swatch.className).toBe("tilia-layer-style-chip");
    expect(swatch.style.backgroundColor).toBe("#d1495b");
    expect(swatch.attributes["aria-hidden"]).toBe("true");
  });

  it("returns null for non-track entries", async () => {
    const { createTrackStyleSwatch } = await import("../src/plugins/ui/layers-control.js");

    expect(createTrackStyleSwatch({ kind: "photo" })).toBeNull();
  });

  it("renders global GPX track and waypoint toggles in the action row and wires them to core", async () => {
    const panel = {
      togglePanel: vi.fn(),
    };
    const core = {
      state: {
        entries: [
          {
            id: 1,
            kind: "gpx",
            visible: true,
            source: {
              name: "sample.gpx",
              trackPoints: [[35.0, 135.0], [35.1, 135.1]],
              waypoints: [{ lat: 35.0, lon: 135.0, name: "Start" }],
            },
            presentation: { trackStylePresetIndex: 0 },
          },
        ],
      },
      getGpxVisibility: vi.fn(() => ({ tracks: true, waypoints: false })),
      setGpxTracksVisibility: vi.fn(),
      setGpxWaypointsVisibility: vi.fn(),
      setEntryVisibility: vi.fn(),
      removeEntry: vi.fn(),
      fitEntryToView: vi.fn(),
      updatePhotoTimeMode: vi.fn(),
      subscribeInteractions: vi.fn(),
      selectWaypoint: vi.fn(),
      selectPhoto: vi.fn(),
      clearAll: vi.fn(),
    };
    const onStatus = vi.fn();
    const { installLayersControl } = await import("../src/plugins/ui/layers-control.js");

    installLayersControl({
      map: {},
      core,
      panel,
      onStatus,
      onError: vi.fn(),
    });

    const launcher = getLastInstalledLauncher();
    launcher.click();

    expect(panel.togglePanel).toHaveBeenCalledTimes(1);
    const content = panel.togglePanel.mock.calls[0][0].render();
    const actions = findByClassName(content, "tilia-layer-actions");
    const tracksToggle = findCheckboxById(actions, "tilia-gpx-tracks-toggle");
    const waypointsToggle = findCheckboxById(actions, "tilia-gpx-waypoints-toggle");
    const clearButton = findByClassName(actions, "tilia-layer-clear-button");

    expect(tracksToggle.checked).toBe(true);
    expect(tracksToggle.disabled).toBe(false);
    expect(waypointsToggle.checked).toBe(false);
    expect(waypointsToggle.disabled).toBe(false);
    expect(clearButton.disabled).toBe(false);

    tracksToggle.checked = false;
    tracksToggle.dispatch("change");
    expect(core.setGpxTracksVisibility).toHaveBeenCalledWith(false);
    expect(onStatus).toHaveBeenCalledWith("Hiding tracks for all GPX layers");

    waypointsToggle.checked = true;
    waypointsToggle.dispatch("change");
    expect(core.setGpxWaypointsVisibility).toHaveBeenCalledWith(true);
    expect(onStatus).toHaveBeenCalledWith("Showing waypoints for all GPX layers");
  });

  it("disables global GPX toggles when no GPX entries are loaded", async () => {
    const panel = {
      togglePanel: vi.fn(),
    };
    const core = {
      state: {
        entries: [],
      },
      getGpxVisibility: vi.fn(() => ({ tracks: true, waypoints: true })),
      setGpxTracksVisibility: vi.fn(),
      setGpxWaypointsVisibility: vi.fn(),
      setEntryVisibility: vi.fn(),
      removeEntry: vi.fn(),
      fitEntryToView: vi.fn(),
      updatePhotoTimeMode: vi.fn(),
      subscribeInteractions: vi.fn(),
      selectWaypoint: vi.fn(),
      selectPhoto: vi.fn(),
      clearAll: vi.fn(),
    };
    const { installLayersControl } = await import("../src/plugins/ui/layers-control.js");

    installLayersControl({
      map: {},
      core,
      panel,
      onStatus: vi.fn(),
      onError: vi.fn(),
    });

    const launcher = getLastInstalledLauncher();
    launcher.click();
    const content = panel.togglePanel.mock.calls[0][0].render();
    const actions = findByClassName(content, "tilia-layer-actions");
    const tracksToggle = findCheckboxById(actions, "tilia-gpx-tracks-toggle");
    const waypointsToggle = findCheckboxById(actions, "tilia-gpx-waypoints-toggle");
    const clearButton = findByClassName(actions, "tilia-layer-clear-button");

    expect(tracksToggle.disabled).toBe(true);
    expect(waypointsToggle.disabled).toBe(true);
    expect(clearButton.disabled).toBe(true);
  });
});