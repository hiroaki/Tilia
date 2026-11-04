import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("leaflet", async () => {
  const base = await import("./helpers/leaflet-ui.js");
  class LayerGroup extends base.Layer {
    constructor() { super(); this.layers = new Set(); }
    addLayer(layer) { this.layers.add(layer); if (this.map) layer.addTo(this.map); return this; }
    removeLayer(layer) { this.layers.delete(layer); layer.remove(); return this; }
    clearLayers() { for (const layer of [...this.layers]) this.removeLayer(layer); return this; }
    remove() { this.clearLayers(); super.remove(); }
  }
  return { ...base, LayerGroup };
});
import { uiFixture, settle } from "./helpers/production-ui.js";
import { Layer } from "./helpers/leaflet-ui.js";
import { gpxDomainKey } from "../src/domains/index.js";
import distanceMarkers from "../plugins/x-distance-markers/loader.js";
import { buildSeries, placeMarkers, visibleMarkers, niceInterval, DEFAULT_MAX_MARKERS } from "../plugins/x-distance-markers/placement.js";

let f;
afterEach(async () => { vi.restoreAllMocks(); await f?.close(); f = null; });
const data = { tracks: [
  { segments: [{ points: [{ lat: 35, lon: 135 }, { lat: 35, lon: 135.03 }] }, { points: [{ lat: 35, lon: 135.06 }] }] },
  { segments: [{ points: [{ lat: 36, lon: 136 }, { lat: 36, lon: 136.03 }] }] },
], routes: [{ points: [{ lat: 34, lon: 134 }] }] };
const markers = () => [...f.map.layers].filter(layer => layer.options.icon?.options.className === "x-distance-marker");
async function setup(options, resolveSelection) {
  f = await uiFixture(["tilia-gpx-domain"]);
  f.map.getZoom = () => 16;
  f.map.project = ({ lat, lng }, z) => ({ x: lng * 2 ** z, y: -lat * 2 ** z });
  f.map.unproject = ({ x, y }, z) => ({ lat: -y / 2 ** z, lng: x / 2 ** z });
  const handlers = new Map();
  f.map.on = (event, fn) => handlers.set(event, fn);
  f.map.off = (event, fn) => { if (handlers.get(event) === fn) handlers.delete(event); };
  const entry = await f.app.domains.gpx.create(data);
  const plugin = resolveSelection ? {
    ...distanceMarkers,
    setup(context, options) {
      const gpx = context.domains.require(gpxDomainKey);
      const selection = {
        ...gpx.selection,
        resolve(...args) {
          resolveSelection(...args);
          return gpx.selection.resolve(...args);
        },
      };
      distanceMarkers.setup({ ...context, domains: { require: () => ({ ...gpx, selection }) } }, options);
    },
  } : "x-distance-markers";
  await f.app.use(plugin, options);
  const select = (target = { kind: "track", trackIndex: 0 }) => f.app.selection.request(f.app.domains.gpx.selection.createCandidate(entry.id, target));
  return { entry, select, handlers };
}

describe("distance marker placement", () => {
  it("interpolates exact thresholds, including inferred gaps, using public cumulative samples", async () => {
    const { entry } = await setup();
    const view = f.app.domains.gpx.get(entry.id);
    const samples = f.app.domains.gpx.getElevationProfile(entry.id, { target: { kind: "track", trackIndex: 0 } }).profiles[0].samples;
    expect(samples[2].edgeKind).toBe("inferred-gap");
    const series = buildSeries(view.snapshot.data.tracks[0], samples, f.context.map.project);
    expect(series.total).toBeCloseTo(f.app.domains.gpx.getDistance(entry.id, { target: { kind: "track", trackIndex: 0 } }).totalMeters);
    const placed = placeMarkers(series, 16);
    const first = placed[0];
    expect(first.distance).toBe(500);
    expect(first.x).toBeCloseTo(135 + .03 * first.distance / samples[1].distanceMeters, 10);
    expect(placed.some(p => p.x > 135.03 && p.x < 135.06)).toBe(true);
    const coarse = placeMarkers(series, 14);
    for (const p of coarse) expect(placed.find(q => q.distance === p.distance)).toEqual(p);
  });
  it("bounds generation for remote points and handles zero distances and duplicate points", () => {
    const huge = { points: [{ x: 0, y: 0, distance: 0 }, { x: 180, y: 0, distance: 20_000_000 }], total: 20_000_000, pixels: 180 };
    expect(placeMarkers(huge, 30)).toHaveLength(DEFAULT_MAX_MARKERS);
    expect(placeMarkers(huge, 30, 220, 1)).toHaveLength(1);
    expect(placeMarkers(huge, 30, 220, 1000)).toHaveLength(1000);
    expect(placeMarkers({ points: [], total: 0, pixels: 0 }, 20)).toEqual([]);
    const duplicates = { points: [{ x: 0, y: 0, distance: 0 }, { x: 0, y: 0, distance: 0 }, { x: 1, y: 0, distance: 1000 }], total: 1000, pixels: 1 };
    expect(placeMarkers(duplicates, 20).every(p => Number.isFinite(p.x))).toBe(true);
    expect(niceInterval(210)).toBe(500);
    expect(niceInterval(Infinity)).toBe(Infinity);
  });
  it("culls offscreen and colliding labels without shifting anchors", () => {
    const points = [{ x: 0, y: 0 }, { x: .01, y: .01 }, { x: 1, y: 0 }];
    expect(visibleMarkers(points, 10)).toEqual([points[0], points[2]]);
    expect(visibleMarkers(points, 10, { left: .5, right: 2, top: -1, bottom: 1 })).toEqual([points[2]]);
  });
});

describe("selected-track lifecycle", () => {
  it("validates public options through the plugin runtime and accepts both candidate limit boundaries", async () => {
    const { handlers } = await setup();
    await f.app.unuse("x-distance-markers");
    for (const maxMarkers of [0, -1, 1.5, "100", NaN, Infinity, null, 1001, Number.MAX_SAFE_INTEGER]) {
      await expect(f.app.use("x-distance-markers", { maxMarkers })).rejects.toMatchObject({
        code: "PLUGIN_SETUP_FAILED",
        cause: { message: "maxMarkers must be an integer from 1 to 1000" },
      });
    }
    for (const spacing of ["dense", ["small"], null]) {
      await expect(f.app.use("x-distance-markers", { spacing })).rejects.toMatchObject({
        code: "PLUGIN_SETUP_FAILED",
        cause: { message: "Distance marker spacing must be small, medium, or large" },
      });
    }
    expect(handlers.size).toBe(0);
    for (const maxMarkers of [1, 1000]) {
      await f.app.use("x-distance-markers", { maxMarkers });
      await f.app.unuse("x-distance-markers");
    }
  });

  it("skips repeated viewport work and updates when the viewport bounds change", async () => {
    const { select, handlers } = await setup();
    let west = 134;
    f.map.getBounds = () => ({
      getSouthWest: () => ({ lat: 34, lng: west }),
      getNorthEast: () => ({ lat: 36, lng: 137 }),
    });
    const project = vi.spyOn(f.map, "project");
    await select();
    expect(markers().length).toBeGreaterThan(0);
    project.mockClear();
    handlers.get("zoomend")();
    handlers.get("moveend")();
    expect(project).not.toHaveBeenCalled();
    west = 136;
    handlers.get("moveend")();
    expect(markers()).toHaveLength(0);
  });

  it("uses semantic track/segment/point selection and clears for route/document/unselected targets", async () => {
    const { select } = await setup();
    expect(markers()).toHaveLength(0);
    await select(); expect(markers().length).toBeGreaterThan(0);
    for (const marker of markers()) expect(marker.options).toMatchObject({ interactive: false, keyboard: false, pane: expect.stringContaining("modal") });
    await select({ kind: "track-point", trackIndex: 1, segmentIndex: 0, pointIndex: 0 });
    expect(markers().length).toBeGreaterThan(0);
    expect(markers().every(m => m.point.lat === 36)).toBe(true);
    await select({ kind: "segment", trackIndex: 0, segmentIndex: 1 }); expect(markers()[0].point.lat).toBe(35);
    await select({ kind: "route", routeIndex: 0 }); expect(markers()).toHaveLength(0);
    await select(); await select({ kind: "document" }); expect(markers()).toHaveLength(0);
    await select(); await f.app.selection.clear(); expect(markers()).toHaveLength(0);
  });
  it("honors visibility and overlapping suppression while preserving semantic selection", async () => {
    const { entry, select } = await setup(); await select();
    const suppress = scope => f.context.rendering.suppress({ entryId: entry.id, domain: gpxDomainKey, target: { kind: "track", trackIndex: 0 }, expectedRevision: 1, scope });
    const a = suppress(f.context.scope.child()), b = suppress(f.context.scope.child());
    expect(markers()).toHaveLength(0); await a.dispose(); expect(markers()).toHaveLength(0);
    await b.dispose(); expect(markers().length).toBeGreaterThan(0);
    await f.app.entries.setVisible(entry.id, false); expect(markers()).toHaveLength(0);
    await f.app.entries.setVisible(entry.id, true); expect(markers().length).toBeGreaterThan(0);
    await f.app.domains.gpx.setTrackVisibility(entry.id, { trackIndex: 0, visible: false }, { expectedRevision: 1 }); expect(markers()).toHaveLength(0);
    await f.app.domains.gpx.setTrackVisibility(entry.id, { trackIndex: 0, visible: true }, { expectedRevision: 2 }); expect(markers().length).toBeGreaterThan(0);
    await f.app.domains.gpx.setCategoryVisibility(entry.id, { category: "tracks", visible: false }, { expectedRevision: 3 }); expect(markers()).toHaveLength(0);
    expect(f.app.selection.getCurrent()).not.toBeNull();
  });
  it("refreshes edits, withdraws replacements/deletions, and disposes listeners and layers", async () => {
    const { entry, select, handlers } = await setup(); await select(); const original = markers();
    await f.app.domains.gpx.updatePoint(entry.id, { target: { kind: "track-point", trackIndex: 0, segmentIndex: 0, pointIndex: 1 }, patch: { lon: 135.04 } }, { expectedRevision: 1 });
    expect(markers().length).toBeGreaterThan(0);
    expect(markers().every(m => !original.includes(m))).toBe(true);
    await f.app.domains.gpx.replaceData(entry.id, data, { expectedRevision: 2 }); expect(markers()).toHaveLength(0);
    await select(); const stale = handlers.get("zoomend");
    await f.app.unuse("x-distance-markers"); expect(markers()).toHaveLength(0); expect(handlers.size).toBe(0);
    expect([...f.map.layers].some(layer => layer.layers instanceof Set)).toBe(false);
    stale(); expect(markers()).toHaveLength(0);
    await f.app.use("x-distance-markers"); expect(markers().length).toBeGreaterThan(0);
    await f.app.entries.remove(entry.id); expect(markers()).toHaveLength(0);
  });
  it.each([
    { options: undefined, limit: 100 },
    { options: { maxMarkers: 1000 }, limit: 1000 },
  ])("bounds layer generation for widely separated points at limit $limit", async ({ options, limit }) => {
    const { entry, select, handlers } = await setup(options);
    await f.app.domains.gpx.replaceData(entry.id, { tracks: [{ segments: [{ points: [{ lat: 0, lon: 0 }, { lat: 0, lon: 179 }] }] }] }, { expectedRevision: 1 });
    await select();
    const count = markers().length;
    expect(count).toBeGreaterThan(limit / 2);
    expect(count).toBeLessThanOrEqual(limit);
    f.map.getZoom = () => 0; handlers.get("zoomend")(); expect(markers().length).toBeLessThanOrEqual(2);
    await f.app.destroy(); expect(markers()).toHaveLength(0);
  });
  it("resolves selection once per refresh even when rebuilding hundreds of markers", async () => {
    const resolveSelection = vi.fn();
    const { entry, select, handlers } = await setup({ maxMarkers: 1000 }, resolveSelection);
    await f.app.domains.gpx.replaceData(entry.id, {
      tracks: [{ segments: [{ points: [{ lat: 0, lon: 0 }, { lat: 0, lon: 179 }] }] }],
    }, { expectedRevision: 1 });

    f.map.getZoom = () => 2;
    await select();
    expect(markers()).toHaveLength(1);
    expect(resolveSelection).toHaveBeenCalledTimes(1);

    resolveSelection.mockClear();
    f.map.getZoom = () => 16;
    handlers.get("zoomend")();
    expect(markers().length).toBeGreaterThan(500);
    expect(resolveSelection).toHaveBeenCalledTimes(1);
  });

  it("cannot resurrect labels when a marker attachment deletes the source", async () => {
    const { entry, select } = await setup();
    let removal;
    const original = Layer.prototype.addTo;
    vi.spyOn(Layer.prototype, "addTo").mockImplementation(function(map) {
      const result = original.call(this, map);
      if (this.options.icon?.options.className === "x-distance-marker" && !removal) removal = f.app.entries.remove(entry.id);
      return result;
    });
    await select(); await removal; await settle(); expect(markers()).toHaveLength(0);
  });
  it("withdraws a reentrantly suppressed track and recovers without a GPX renderer", async () => {
    const { entry, select } = await setup();
    let lease;
    const original = Layer.prototype.addTo;
    vi.spyOn(Layer.prototype, "addTo").mockImplementation(function(map) {
      const result = original.call(this, map);
      if (this.options.icon?.options.className === "x-distance-marker" && !lease) {
        lease = f.context.rendering.suppress({ entryId: entry.id, domain: gpxDomainKey,
          target: { kind: "track", trackIndex: 0 }, expectedRevision: 1, scope: f.context.scope.child() });
      }
      return result;
    });
    await select(); expect(markers()).toHaveLength(0);
    await lease.dispose(); expect(markers().length).toBeGreaterThan(0);
    const originalMarkers = markers();
    await f.app.use("tilia-gpx-renderer"); await settle(); expect(markers()).toEqual(originalMarkers);
    await f.app.unuse("tilia-gpx-renderer"); expect(markers()).toEqual(originalMarkers);
  });
});
