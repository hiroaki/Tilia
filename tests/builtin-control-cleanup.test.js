import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cleanupMocks = vi.hoisted(() => ({
  controls: [],
}));

vi.mock("../src/map/controls.js", () => ({
  createButton: vi.fn(),
  createPanel: vi.fn(),
  createSelect: vi.fn(),
  installMapControl: vi.fn(() => {
    const control = { remove: vi.fn() };
    cleanupMocks.controls.push(control);
    return control;
  }),
}));

vi.mock("../src/gpx/popup.js", () => ({
  createTrackPointPopupContent: vi.fn(() => null),
}));

vi.mock("../src/core/input-processing.js", () => ({
  processInputItems: vi.fn(),
}));

vi.mock("leaflet", () => ({
  CircleMarker: class CircleMarker {
    addTo() { return this; }
    remove() {}
  },
}));

import { installBaseMapControl } from "../src/plugins/ui/base-map-control.js";
import { installElevationPanelControl } from "../src/plugins/ui/elevation-panel.js";

function createPanelService(openPanelId = null) {
  return {
    closePanel: vi.fn(),
    isOpen: vi.fn((panelId) => panelId === openPanelId),
    rerenderPanel: vi.fn(),
  };
}

describe("built-in map control cleanup", () => {
  beforeEach(() => {
    cleanupMocks.controls.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });



  it("removes the base-map control", () => {
    const api = installBaseMapControl({ map: {}, baseMaps: {} });

    api.destroy();

    expect(cleanupMocks.controls[0].remove).toHaveBeenCalledOnce();
  });





  it("releases every elevation subscription, event handler, timer, panel, and control", () => {
    vi.useFakeTimers();
    const mapHandlers = new Map();
    const map = {
      on: vi.fn((eventName, handler) => mapHandlers.set(eventName, handler)),
      off: vi.fn(),
    };
    const unsubscribeSelection = vi.fn();
    const core = {
      state: { entries: [] },
      subscribeSelection: vi.fn(() => unsubscribeSelection),
    };
    const panel = createPanelService("elevation");
    const api = installElevationPanelControl({ map, core, panel, onStatus: vi.fn() });
    mapHandlers.get("popupclose")({ popup: { getContent: () => ({ dataset: { tiliaRevealVersion: "1" } }) } });
    expect(vi.getTimerCount()).toBe(1);

    api.destroy();

    expect(unsubscribeSelection).toHaveBeenCalledOnce();
    expect(map.off).toHaveBeenCalledWith("popupopen", mapHandlers.get("popupopen"));
    expect(map.off).toHaveBeenCalledWith("popupclose", mapHandlers.get("popupclose"));
    expect(vi.getTimerCount()).toBe(0);
    expect(panel.closePanel).toHaveBeenCalledOnce();
    expect(cleanupMocks.controls[0].remove).toHaveBeenCalledOnce();
  });
});
