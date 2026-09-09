import { describe, expect, it, vi } from "vitest";

const leafletMocks = vi.hoisted(() => {
  const Marker = vi.fn(function Marker(latlng, options) {
    this.latlng = latlng;
    this.options = options;
    this.addTo = vi.fn(() => this);
    this.remove = vi.fn();
  });
  class DivIcon {
    constructor(options) {
      this.options = options;
    }
  }
  return { Marker, DivIcon };
});

vi.mock("leaflet", () => leafletMocks);

import { milestonePlugin } from "../plugins/x-milestone/loader.js";

function createLayer() {
  const handlers = new Map();
  return {
    on: vi.fn((event, handler) => handlers.set(event, handler)),
    emit(event) { handlers.get(event)?.(); },
  };
}

function createApp(entry) {
  const interactionHandlers = {};
  const mapHandlers = new Map();
  return {
    state: { entries: [entry] },
    getMap: () => ({
      getZoom: () => 20,
      hasLayer: () => true,
      on: (event, handler) => mapHandlers.set(event, handler),
      off: vi.fn(),
    }),
    subscribeInteractions: vi.fn((handlers) => {
      Object.assign(interactionHandlers, handlers);
      return vi.fn();
    }),
    addRefreshHandler: vi.fn(() => vi.fn()),
    emitTrackLayer(payload) { interactionHandlers.onTrackLayer(payload); },
  };
}

describe("x-milestone", () => {
  it("creates independent milestone series for each logical track", () => {
    const entry = {
      id: 7,
      visible: true,
      source: {
        tracks: [
          { segments: [{ points: [{ lat: 35, lon: 135 }, { lat: 35, lon: 135.002 }] }, { points: [{ lat: 35, lon: 135.004 }] }] },
          { segments: [{ points: [{ lat: 36, lon: 136 }, { lat: 36, lon: 136.003 }] }] },
        ],
      },
    };
    const app = createApp(entry);
    const plugin = milestonePlugin.setup(app, { intervalDefinition: { mapping: {}, minZoom: 5, maxZoom: 20, maxNumberOfSigns: 100, minIntervalMeters: 100 } });
    const firstLayer = createLayer();
    const secondLayer = createLayer();

    app.emitTrackLayer({ entry, layer: firstLayer, trackIndex: 0 });
    app.emitTrackLayer({ entry, layer: secondLayer, trackIndex: 1 });

    expect(plugin.getTrackCount()).toBe(2);
    expect(leafletMocks.Marker).toHaveBeenCalled();
    const labels = leafletMocks.Marker.mock.instances.map((marker) => marker.options.icon.options.html);
    expect(labels.filter((html) => html.includes("100 m"))).toHaveLength(2);
  });
});