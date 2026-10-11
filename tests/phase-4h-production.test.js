import { afterEach, describe, expect, it, vi } from "vitest";
import { documentFixture, Element, byClass, settle } from "./helpers/scoped-dom.js";
vi.mock("leaflet", () => {
  class Layer {
    constructor(point, options = {}) { this.point = point; this.options = { ...options }; this.listeners = new Map(); }
    addTo(map) { this.map = map; map.layers.add(this); return this; }
    remove() { this.map?.layers.delete(this); this.fire("remove"); }
    on(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); return this; }
    off(type, fn) { this.listeners.get(type)?.delete(fn); return this; }
    fire(type, event = {}) { for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event); }
  }
  class MockPolyline extends Layer {}
  class MockMarker extends Layer {}
  class MockCircleMarker extends Layer {}
  class MockDivIcon { constructor(options) { this.options = options; } createIcon() { const n = document.createElement("div"); n.style = { setProperty: vi.fn() }; return n; } }
  class MockPopup extends Layer { setLatLng(point) { this.point = point; return this; } setContent(content) { this.content = content; return this; } getElement() { return this.content; } }
  class MockControl { constructor(options) { this.options = options; } addTo(map) { this.container = this.onAdd(map); map.container.appendChild(this.container); return this; } remove() { this.container?.remove(); } }
  return { Marker: MockMarker, CircleMarker: MockCircleMarker, Polyline: MockPolyline, DivIcon: MockDivIcon, Popup: MockPopup, TileLayer: Layer, Map: class {}, Control: MockControl,
    DomUtil: { create: (tag, className) => { const node = document.createElement(tag); node.className = className; return node; } },
    DomEvent: { disableClickPropagation() {}, disableScrollPropagation() {}, on() {}, stopPropagation() {}, preventDefault() {} } };
});
import { Polyline, Marker, Popup } from "leaflet";
import { builtinPluginCatalog } from "../src/builtins.js";
import gpxPlugin from "../src/plugins/domains/gpx.js";
import { createApplicationComposition } from "../src/application-composition.js";
import { gpxQueryServiceKey } from "../src/plugins/contracts/gpx-query.js";
import { cloneAndFreezePlainData } from "../src/domains/immutable.js";
import { gpxDomainKey } from "../src/domains/keys.js";
import { lookupTimestamp } from "../src/gpx/queries.js";
const fixtures = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const f of fixtures.splice(0)) {
    for (const entry of f.app.entries.list()) await f.app.entries.remove(entry.id);
    for (const id of [...f.app.listPlugins()].reverse()) await f.app.unuse(id);
    await f.foundations.rendering.close();
  }
  vi.unstubAllGlobals();
});
async function fixture(plugins = [], photoOptions = {}, gpxDispose = null, gpxCreateGate = null) {
  const doc = documentFixture(); vi.stubGlobal("document", doc); vi.stubGlobal("HTMLElement", Element);
  const map = { container: doc.createElement("div"), layers: new Set(), panes: new Map(), on() {}, off() {}, fitBounds: vi.fn(),
    getContainer() { return this.container; }, getPane(name) { return this.panes.get(name); },
    createPane(name) { const pane = doc.createElement("div"); this.panes.set(name, pane); return pane; } };
  let next = 0; const revoke = vi.fn();
  const catalog = gpxDispose || gpxCreateGate ? builtinPluginCatalog.map((entry) => entry.id !== "tilia-gpx-domain" ? entry : { ...entry, load: async () => ({ default: { ...gpxPlugin, setup(context) {
    gpxPlugin.setup({ ...context, domains: { ...context.domains, provide(key, provider) {
      return context.domains.provide(key, { ...provider, async prepareCreate(input) { const prepared = await provider.prepareCreate(input); if (gpxCreateGate) await gpxCreateGate(input); return { ...prepared, ...(gpxDispose ? { dispose: gpxDispose } : {}) }; } });
    } } });
  } } }) }) : builtinPluginCatalog;
  const f = createApplicationComposition({ map, builtins: catalog, plugins: ["tilia-gpx-domain", "tilia-photo-domain", ...plugins],
    pluginOptions: { "tilia-photo-domain": { createObjectURL: () => `blob:${++next}`, revokeObjectURL: revoke, ...photoOptions } } });
  await f.app.ready;
  let context; await f.app.use({ id: "x-4h-observer", setup(value) { context = value; } });
  const background = new Set(map.layers);
  const value = { ...f, map, doc, context, revoke, ownedLayers: () => [...map.layers].filter((layer) => !background.has(layer)) }; fixtures.push(value); return value;
}
const p = (lat, timestamp = null, elevation = null) => ({ lat, lon: 0, timestamp, elevation });
const evidence = () => ({ name: "evidence.gpx", tracks: [{ segments: [{ points: [p(0, 0, 0), p(10, 10000)] }] }] });
const photo = (f, capturedAt = 5000, extras = {}) => f.app.domains.photo.create({ data: { name: "estimate.jpg", capturedAt, ...extras }, blob: new Blob(["photo"]) });
const effective = (f, id) => f.app.domains.photo.get(id);

describe("Phase 4H typed GPX queries and captured Photo estimates", () => {
  it("separates recorded/gap track distance from route distance, retains null samples and resets between tracks", async () => {
    const f = await fixture();
    const entry = await f.app.domains.gpx.create({ tracks: [{ segments: [{ points: [p(0, 0, 0), p(1)] }, { points: [] }, { points: [p(2), p(3)] }] }, { segments: [{ points: [p(50)] }] }, { segments: [] }], routes: [{ points: [p(60), p(80)] }] });
    const gpx = f.app.domains.gpx;
    expect(gpx.getDocument(entry.id).document).toBe(gpx.get(entry.id).snapshot.data);
    const distance = gpx.getDistance(entry.id);
    expect(distance.recordedMeters).toBeCloseTo(222389.85328911748);
    expect(distance.inferredGapMeters).toBeCloseTo(111194.92664455874);
    expect(distance.totalMeters).toBeCloseTo(333584.7799336762);
    expect(gpx.getDistance(entry.id, { target: { kind: "route", routeIndex: 0 } }).totalMeters).toBeGreaterThan(distance.totalMeters);
    const profiles = gpx.getElevationProfile(entry.id).profiles;
    expect(profiles).toHaveLength(4);
    expect(profiles[0].samples.map((s) => [s.elevation, s.edgeKind])).toEqual([[0, "start"], [null, "recorded"], [null, "inferred-gap"], [null, "recorded"]]);
    expect(profiles[1].samples[0].distanceMeters).toBe(0);
    expect(profiles[2].samples).toEqual([]);
    expect(gpx.getExtent(entry.id).bounds).toEqual({ southWest: { lat: 0, lon: 0 }, northEast: { lat: 80, lon: 0 } });
    expect(Object.isFrozen(profiles[0].samples[0].locator)).toBe(true);
  });
  it("uses approved query options with document defaults and explicit path targets", async () => {
    const f = await fixture(), gpx = f.app.domains.gpx;
    const entry = await gpx.create({ tracks: [{ segments: [{ points: [p(0, 0, 0), p(1, 1000, 10)] }] }], routes: [{ points: [p(60, null, 20), p(80, null, 30)] }] });
    for (const method of ["getExtent", "getDistance", "getElevationProfile"]) {
      const result = gpx[method](entry.id);
      expect(gpx[method](entry.id, {})).toEqual(result);
      expect(gpx[method](entry.id, { target: undefined })).toEqual(result);
      expect(gpx[method](entry.id, { target: { kind: "document" } })).toEqual(result);
    }
    const target = { kind: "route", routeIndex: 0 };
    expect(gpx.getExtent(entry.id, { target }).bounds).toEqual({ southWest: { lat: 60, lon: 0 }, northEast: { lat: 80, lon: 0 } });
    expect(gpx.getElevationProfile(entry.id, { target }).profiles[0].samples.map((sample) => sample.elevation)).toEqual([20, 30]);
    expect(gpx.getDistance(entry.id, { target }).totalMeters).toBeGreaterThan(gpx.getDistance(entry.id).totalMeters);
    expect(gpx.getNearestPoint(entry.id, { target, coordinate: { lat: 79, lon: 0 } }).match.target.pointIndex).toBe(1);
    const segment = { kind: "segment", trackIndex: 0, segmentIndex: 0 };
    expect(gpx.getDistance(entry.id, { target: segment })).toMatchObject({ totalMeters: gpx.getDistance(entry.id).totalMeters });
    expect(gpx.getExtent(entry.id, { target: segment }).bounds.northEast.lat).toBe(1);
  });
  it("rejects invalid query options and unapproved bare targets with semantic input errors", async () => {
    const f = await fixture(), gpx = f.app.domains.gpx;
    const entry = await gpx.create({ routes: [{ points: [p(0)] }] });
    const target = { kind: "route", routeIndex: 0 };
    const invalid = (call) => expect(call).toThrow(expect.objectContaining({ code: "SEMANTIC_INPUT_INVALID" }));
    for (const method of ["getExtent", "getDistance", "getElevationProfile"]) {
      for (const options of [null, [], 1, target, { target: null }, { target: { kind: "route", routeIndex: 1 } }, { target: { ...target, revision: 0 } }]) {
        invalid(() => gpx[method](entry.id, options));
      }
    }
    for (const options of [undefined, {}, target, { target }, { coordinate: { lat: 0, lon: 0 } }, { target, coordinate: { lat: NaN, lon: 0 } }, { target: { kind: "document" }, coordinate: { lat: 0, lon: 0 } }]) {
      invalid(() => gpx.getNearestPoint(entry.id, options));
    }
    invalid(() => gpx.getNearestPoint(entry.id, target, { lat: 0, lon: 0 }));
    expect(() => gpx.getExtent("missing", {})).toThrow(expect.objectContaining({ code: "ENTRY_NOT_FOUND" }));
  });
  it("preserves empty query results through approved options", async () => {
    const f = await fixture(), gpx = f.app.domains.gpx;
    const entry = await gpx.create({});
    for (const options of [undefined, {}, { target: { kind: "document" } }]) {
      expect(gpx.getExtent(entry.id, options).bounds).toBeNull();
      expect(gpx.getDistance(entry.id, options)).toMatchObject({ recordedMeters: 0, inferredGapMeters: 0, totalMeters: 0 });
      expect(gpx.getElevationProfile(entry.id, options).profiles).toEqual([]);
    }
    const paths = await gpx.create({ tracks: [{ segments: [{ points: [] }] }], routes: [{ points: [] }] });
    for (const target of [{ kind: "track", trackIndex: 0 }, { kind: "segment", trackIndex: 0, segmentIndex: 0 }, { kind: "route", routeIndex: 0 }]) {
      expect(gpx.getExtent(paths.id, { target }).bounds).toBeNull();
      expect(gpx.getDistance(paths.id, { target }).totalMeters).toBe(0);
      expect(gpx.getNearestPoint(paths.id, { target, coordinate: { lat: 0, lon: 0 } }).match).toBeNull();
    }
  });
  it("keeps valid antipodal distances finite despite geographic floating-point roundoff", async () => {
    const f = await fixture();
    const entry = await f.app.domains.gpx.create({ tracks: [{ segments: [{ points: [
      { lat: -85.5000000000002, lon: 0 }, { lat: 85.5000000000002, lon: 180 },
    ] }] }] });
    const expected = Math.PI * 6371000;
    expect(f.app.domains.gpx.getDistance(entry.id).totalMeters).toBeCloseTo(expected);
    expect(f.app.domains.gpx.getElevationProfile(entry.id).profiles[0].samples[1].distanceMeters).toBeCloseTo(expected);
  });
  it("distinguishes empty results from invalid targets, selects canonical first ties, and includes hidden geometry", async () => {
    const f = await fixture(), gpx = f.app.domains.gpx;
    const entry = await gpx.create({ tracks: [{ segments: [] }], routes: [{ points: [p(0), p(2)] }] });
    expect(gpx.getNearestPoint(entry.id, { target: { kind: "track", trackIndex: 0 }, coordinate: { lat: 1, lon: 0 } }).match).toBeNull();
    expect(gpx.getNearestPoint(entry.id, { target: { kind: "route", routeIndex: 0 }, coordinate: { lat: 1, lon: 0 } }).match.target.pointIndex).toBe(0);
    await gpx.setCategoryVisibility(entry.id, { category: "routes", visible: false }, { expectedRevision: 1 });
    expect(gpx.getExtent(entry.id).bounds.northEast.lat).toBe(2);
    expect(() => gpx.getDistance(entry.id, { target: { kind: "route", routeIndex: 1 } })).toThrow();
    expect(() => gpx.getExtent(entry.id, { target: { kind: "route", routeIndex: 0, revision: 1 } })).toThrow();
    const empty = await gpx.create({});
    expect(gpx.getExtent(empty.id).bounds).toBeNull();
    expect(gpx.getDistance(empty.id).totalMeters).toBe(0);
    expect(gpx.getElevationProfile(empty.id).profiles).toEqual([]);
  });
  it("captures duplicates/exact/final/singletons in committed insertion and traversal order independent of visibility", async () => {
    const f = await fixture();
    const a = await f.app.domains.gpx.create({ tracks: [{ segments: [{ points: [p(1, 0), p(2, 0)] }, { points: [p(3, 10)] }] }], routes: [{ points: [p(9, 5)] }] });
    const b = await f.app.domains.gpx.create({ tracks: [{ segments: [{ points: [p(4, 0)] }] }] });
    await f.app.entries.setVisible(a.id, false);
    const service = f.context.services.require(gpxQueryServiceKey), captured = service.captureTimeline();
    expect(captured.points.map((point) => point.lat)).toEqual([1, 2, 4, 3]);
    const zero = lookupTimestamp(captured, 0);
    expect(zero.exact).toHaveLength(3); expect(zero.before.lat).toBe(4); expect(zero.after.lat).toBe(3);
    expect(lookupTimestamp(captured, 10)).toMatchObject({ after: null, before: { lat: 3 } });
    await f.app.entries.remove(a.id); await f.app.entries.remove(b.id); await f.app.unuse("tilia-gpx-domain");
    expect(captured.points).toHaveLength(4);
    expect(() => service.captureTimeline()).toThrow();
    expect(f.context.services.optional(gpxQueryServiceKey)).toBeNull();
  });
  it("orders duplicate evidence by committed creation rather than requested ID/order", async () => {
    let release; const gate = new Promise((r) => { release = r; });
    const f = await fixture([], {}, null, ({ value }) => value.name === "first.gpx" ? gate : undefined);
    const first = f.app.domains.gpx.create({ name: "first.gpx", tracks: [{ segments: [{ points: [p(1, 0)] }] }] });
    await settle();
    const second = await f.app.domains.gpx.create({ name: "second.gpx", tracks: [{ segments: [{ points: [p(2, 0)] }] }] });
    release(); const completed = await first;
    expect(completed.id).toBeLessThan(second.id);
    expect(f.context.services.require(gpxQueryServiceKey).captureTimeline().points.map((p) => p.lat)).toEqual([2, 1]);
  });
  it("interpolates once, preserves preview on semantic work, and survives GPX update/delete/withdrawal without Photo work", async () => {
    const f = await fixture(); const track = await f.app.domains.gpx.create(evidence()); const image = await photo(f);
    const saved = effective(f, image.id), preview = f.app.domains.photo.getPreview(image.id);
    expect(saved.snapshot.data.coordinate).toBeNull();
    expect(saved.snapshot.derived).toEqual({ resolvedTimeMode: "local", inferredTimestamp: 5000, inferredLocation: { lat: 5, lon: 0 }, locationSource: "gpx-time-inference" });
    await f.app.domains.gpx.replaceData(track.id, { tracks: [] }, { expectedRevision: 1 });
    await f.app.entries.remove(track.id); await f.app.unuse("tilia-gpx-domain");
    expect(effective(f, image.id).snapshot).toBe(saved.snapshot); expect(effective(f, image.id).revision).toBe(1);
    await expect(f.app.domains.photo.recomputeDerived(image.id, undefined, { expectedRevision: 1 })).rejects.toThrow(/GPX timeline/);
    await expect(f.app.domains.photo.setRequestedTimeMode(image.id, "utc", { expectedRevision: 1 })).rejects.toThrow(/GPX timeline/);
    expect(effective(f, image.id).snapshot).toBe(saved.snapshot); expect(preview.isCurrent()).toBe(true); expect(f.revoke).not.toHaveBeenCalled();
    await f.app.use("tilia-gpx-domain"); await f.app.domains.gpx.create({ tracks: [{ segments: [{ points: [p(0, -86400000), p(20, 86400000)] }] }] });
    await f.app.domains.photo.setRequestedTimeMode(image.id, "utc", { expectedRevision: 1 });
    expect(effective(f, image.id).revision).toBe(2); expect(preview.isCurrent()).toBe(true);
  });
  it.each(["missing", "empty", "outside"])("permits unlocated mode preference without usable evidence: %s", async (kind) => {
    const f = await fixture();
    if (kind === "missing") await f.app.unuse("tilia-gpx-domain");
    if (kind === "outside") await f.app.domains.gpx.create(evidence());
    const image = await photo(f, 20000);
    for (const [mode, revision] of [["utc", 2], ["local", 3], ["auto", 4]]) {
      await f.app.domains.photo.setRequestedTimeMode(image.id, mode, { expectedRevision: revision - 1 });
      expect(effective(f, image.id)).toMatchObject({ revision, snapshot: { preferences: { requestedTimeMode: mode }, derived: { resolvedTimeMode: mode === "auto" ? null : mode, inferredLocation: null, inferredTimestamp: null, locationSource: null } } });
    }
    const snapshot = effective(f, image.id).snapshot;
    await f.app.domains.photo.setRequestedTimeMode(image.id, "auto", { expectedRevision: 4 });
    expect(effective(f, image.id).snapshot).toBe(snapshot);
    await expect(f.app.domains.photo.recomputeDerived(image.id, undefined, { expectedRevision: 4 })).rejects.toThrow();
    expect(effective(f, image.id).revision).toBe(4);
  });
  it("retains estimates for metadata and resource-only replacement, but invalidates on material own data changes; own GPS wins", async () => {
    const f = await fixture(); const track = await f.app.domains.gpx.create(evidence()); const image = await photo(f);
    const old = effective(f, image.id);
    await f.app.entries.remove(track.id);
    await f.app.domains.photo.replaceData(image.id, { ...old.snapshot.data, name: "renamed" }, { expectedRevision: 1 });
    const renamed = effective(f, image.id); expect(renamed.snapshot.derived).toEqual(old.snapshot.derived);
    await f.app.domains.photo.replaceData(image.id, { ...renamed.snapshot.data, blob: new Blob(["new"]) }, { expectedRevision: 2 });
    expect(effective(f, image.id).snapshot).toBe(renamed.snapshot); expect(effective(f, image.id).revision).toBe(2);
    expect(f.revoke).toHaveBeenCalledTimes(1);
    await f.app.domains.photo.replaceData(image.id, { ...renamed.snapshot.data, capturedAt: 6000 }, { expectedRevision: 2 });
    expect(effective(f, image.id).snapshot.derived.inferredLocation).toBeNull();
    await f.app.domains.photo.replaceData(image.id, { ...effective(f, image.id).snapshot.data, coordinate: { lat: 30, lon: 40 } }, { expectedRevision: 3 });
    expect(effective(f, image.id).snapshot.derived).toMatchObject({ inferredLocation: null, locationSource: "exif-gps" });
  });
  it("rejects unexpected inference errors and invalid commands without preference-only success", async () => {
    const f = await fixture(); await f.app.unuse("tilia-gpx-domain"); const image = await photo(f);
    await f.app.use({ id: "x-broken-query", setup(context) { context.services.provide(gpxQueryServiceKey, { captureTimeline() { throw new Error("unexpected evidence failure"); } }); } });
    const saved = effective(f, image.id);
    await expect(f.app.domains.photo.setRequestedTimeMode(image.id, "utc", { expectedRevision: 1 })).rejects.toThrow("unexpected evidence failure");
    await expect(f.app.domains.photo.setRequestedTimeMode(image.id, "custom", { expectedRevision: 1 })).rejects.toMatchObject({ code: "SEMANTIC_INPUT_INVALID" });
    expect(effective(f, image.id).snapshot).toBe(saved.snapshot); expect(f.revoke).not.toHaveBeenCalled();
  });
  it("commits a captured estimate after its GPX changes/deletes and its service disappears before Photo commit", async () => {
    let release; const gate = new Promise((r) => { release = r; });
    const f = await fixture([], { prepareGate: gate });
    const track = await f.app.domains.gpx.create(evidence());
    const pending = photo(f); await settle();
    expect(f.app.entries.list()).toHaveLength(1);
    await f.app.domains.gpx.replaceData(track.id, {}, { expectedRevision: 1 });
    await f.app.entries.remove(track.id); await f.app.unuse("tilia-gpx-domain");
    release(); const image = await pending;
    expect(effective(f, image.id).snapshot.derived.inferredLocation).toEqual({ lat: 5, lon: 0 });
    expect(effective(f, image.id).revision).toBe(1); expect(f.revoke).not.toHaveBeenCalled();
  });
  it("cancels captured Photo creation before publication and revokes its candidate preview", async () => {
    let release; const gate = new Promise((r) => { release = r; });
    const f = await fixture([], { prepareGate: gate }); await f.app.domains.gpx.create(evidence());
    const abort = new AbortController();
    const pending = f.app.domains.photo.create({ data: { capturedAt: 5000 }, blob: new Blob(["candidate"]) }, { signal: abort.signal }).catch((e) => e);
    await settle(); abort.abort("cancel inference publication"); release();
    expect(await pending).toMatchObject({ code: "ENTRY_CREATION_ABORTED", committed: false });
    expect(f.app.entries.list()).toHaveLength(1); expect(f.revoke).toHaveBeenCalledTimes(1);
  });
  it("does no Photo work when GPX appears after Photo import; explicit retry restores inference", async () => {
    const f = await fixture(); const image = await photo(f); const old = effective(f, image.id).snapshot;
    await f.app.domains.gpx.create(evidence());
    expect(effective(f, image.id).snapshot).toBe(old);
    await f.app.domains.photo.recomputeDerived(image.id, undefined, { expectedRevision: 1 });
    expect(effective(f, image.id).snapshot.derived.inferredLocation).toEqual({ lat: 5, lon: 0 });
    expect(effective(f, image.id).revision).toBe(2);
    const current = effective(f, image.id).snapshot;
    await f.app.domains.photo.recomputeDerived(image.id, undefined, { expectedRevision: 2 });
    expect(effective(f, image.id).snapshot).toBe(current); expect(f.revoke).not.toHaveBeenCalled();
  });
  it("serializes own-Photo deletion behind pending mutation and cleans both preview resources", async () => {
    let release; const gate = new Promise((r) => { release = r; });
    const f = await fixture([], { mutationGate: gate }); await f.app.domains.gpx.create(evidence());
    const image = await photo(f), old = effective(f, image.id);
    const pending = f.app.domains.photo.replaceData(image.id, { ...old.snapshot.data, capturedAt: 6000, blob: new Blob(["next"]) }, { expectedRevision: 1 }).catch((e) => e);
    await settle(); const removal = f.app.entries.remove(image.id); await settle();
    expect(f.app.entries.get(image.id)).not.toBeNull(); release();
    expect(await pending).not.toBeInstanceOf(Error); await removal; expect(f.app.entries.get(image.id)).toBeNull();
    expect(f.revoke).toHaveBeenCalledTimes(2);
  });
  it("saved Photo remains unchanged while individual GPX removal physical cleanup is pending", async () => {
    let release; const gate = new Promise((r) => { release = r; });
    const f = await fixture(["tilia-gpx-renderer"], {}, () => gate); const track = await f.app.domains.gpx.create(evidence()); await settle();
    const image = await photo(f), old = effective(f, image.id).snapshot;
    const events = []; f.app.entries.subscribe((e) => events.push(e.type), { emitCurrent: false });
    const pending = f.app.entries.remove(track.id); let settled = false; pending.then(() => { settled = true; }); await settle();
    expect(f.app.entries.get(track.id)).toBeNull(); expect(f.context.services.require(gpxQueryServiceKey).captureTimeline().points).toEqual([]);
    expect(settled).toBe(false); expect(events).not.toContain("removed"); expect(effective(f, image.id).snapshot).toBe(old);
    release(); await pending; expect(events).toContain("removed"); expect(effective(f, image.id).snapshot).toBe(old);
  });

});

describe("Phase 4H production rendering and independent presentation", () => {
  it("owns one line per track, gaps only within tracks, route dash/numbered markers and waypoint markers", async () => {
    const f = await fixture(["tilia-gpx-renderer"]);
    const entry = await f.app.domains.gpx.create({ tracks: [{ segments: [{ points: [p(0), p(1)] }, { points: [p(2)] }] }, { segments: [{ points: [p(20), p(21)] }] }], routes: [{ points: [p(30), p(31)] }], waypoints: [p(40)] }); await settle();
    const lines = [...f.map.layers].filter((l) => l instanceof Polyline);
    expect(lines.map((l) => l.point)).toEqual([[{ lat: 0, lng: 0 }, { lat: 1, lng: 0 }, { lat: 2, lng: 0 }], [{ lat: 20, lng: 0 }, { lat: 21, lng: 0 }], [{ lat: 30, lng: 0 }, { lat: 31, lng: 0 }]]);
    expect(lines[2].options).toMatchObject({ dashArray: "8 6", weight: 4, color: "#0099cc" });
    const markers = [...f.map.layers].filter((l) => l instanceof Marker);
    expect(markers).toHaveLength(3); expect(markers.slice(0, 2).map((m) => m.options.icon.options.html)).toEqual(["1", "2"]);
    lines[0].fire("click", { latlng: { lat: 1.9, lng: 0 } }); await settle();
    expect(f.app.selection.getCurrent()).toMatchObject({ entryId: entry.id, ref: { kind: "track-point", trackIndex: 0, segmentIndex: 1, pointIndex: 0 } });
    markers[0].fire("click"); await settle();
    expect(f.app.selection.getCurrent().ref).toMatchObject({ kind: "route-point", pointIndex: 0 });
    markers[2].fire("click"); await settle(); expect(f.app.selection.getCurrent().ref.kind).toBe("waypoint");
  });
  it("uses style fallback, revokes old interaction and handles singleton/empty geometry without cross-track highlight", async () => {
    const f = await fixture(["tilia-gpx-renderer", "tilia-gpx-ui", "tilia-map-selection-presenter"]);
    const entry = await f.app.domains.gpx.create({ tracks: [{ segments: [{ points: [p(1)] }] }, { segments: [] }], waypoints: [p(20), p(40)] }); await settle();
    await f.app.selection.request(f.app.domains.gpx.selection.createCandidate(entry.id, { kind: "document" })); await settle();
    expect([...f.map.layers].filter((l) => l instanceof Polyline)).toHaveLength(0);
    expect([...f.map.layers].filter((l) => l.options.radius === 18)).toHaveLength(3);
    const old = f.context.presentation.resolve(entry.id, { kind: "document" });
    const marker = [...f.map.layers].find((l) => l instanceof Marker);
    await f.app.domains.gpx.setStylePreset(entry.id, "unknown", { expectedRevision: 1 }); await settle();
    expect(old.signal.aborted).toBe(true); expect(old.isCurrent()).toBe(false);
    expect([...f.map.layers].find((l) => l.options.radius === 5).options.color).toBe("#0099cc");
    marker.fire("click"); await settle(); expect(f.app.selection.getCurrent().ref.kind).toBe("document");
    await f.app.entries.setVisible(entry.id, false); await settle();
    expect(f.app.selection.getCurrent()).not.toBeNull(); expect(f.ownedLayers()).toHaveLength(0);
    await f.app.entries.setVisible(entry.id, true); await settle();
    const popup = [...f.map.layers].find((l) => l instanceof Popup); popup.remove(); await settle();
    expect([...f.map.layers].filter((l) => l.options.radius === 18)).toHaveLength(3);
    await f.app.unuse("tilia-gpx-renderer"); await settle(); expect(f.ownedLayers()).toHaveLength(0); expect(f.app.selection.getCurrent()).not.toBeNull();
  });
  it("withdraws presentation for a selected hidden track while retaining semantic selection and query/timeline evidence", async () => {
    const f = await fixture(["tilia-gpx-renderer", "tilia-gpx-ui", "tilia-map-selection-presenter"]);
    const entry = await f.app.domains.gpx.create(evidence()); await settle();
    await f.app.selection.request(f.app.domains.gpx.selection.createCandidate(entry.id, { kind: "track", trackIndex: 0 })); await settle();
    const old = f.context.presentation.resolve(entry.id, f.app.selection.getCurrent().ref);
    await f.app.domains.gpx.setTrackVisibility(entry.id, { trackIndex: 0, visible: false }, { expectedRevision: 1 }); await settle();
    expect(old.signal.aborted).toBe(true); expect(f.ownedLayers()).toHaveLength(0);
    expect(f.app.selection.getCurrent().ref.revision).toBe(2);
    const hidden = f.context.presentation.resolve(entry.id, f.app.selection.getCurrent().ref);
    expect(hidden.anchor).toBeNull(); expect(hidden.bounds).toBeNull();
    expect(f.app.domains.gpx.getExtent(entry.id).bounds).not.toBeNull();
    expect(f.context.services.require(gpxQueryServiceKey).captureTimeline().points).toHaveLength(2);
    await f.app.domains.gpx.setCategoryVisibility(entry.id, { category: "tracks", visible: false }, { expectedRevision: 2 }); await settle();
    expect(f.ownedLayers()).toHaveLength(0); expect(f.app.selection.getCurrent().ref.revision).toBe(3);
    await f.app.domains.gpx.setCategoryVisibility(entry.id, { category: "tracks", visible: true }, { expectedRevision: 3 });
    await f.app.domains.gpx.setTrackVisibility(entry.id, { trackIndex: 0, visible: true }, { expectedRevision: 4 }); await settle();
    expect(f.ownedLayers().length).toBeGreaterThan(0);
  });
  it("withdraws stale render/presentation on newer-revision render failure and recovers after reinstall", async () => {
    const f = await fixture(["tilia-gpx-renderer", "tilia-gpx-ui", "tilia-map-selection-presenter"]);
    const entry = await f.app.domains.gpx.create(evidence()); await settle();
    await f.app.selection.request(f.app.domains.gpx.selection.createCandidate(entry.id, { kind: "track", trackIndex: 0 })); await settle();
    const handle = f.context.presentation.resolve(entry.id, f.app.selection.getCurrent().ref);
    const spy = vi.spyOn(Polyline.prototype, "addTo").mockImplementation(() => { throw new Error("attachment failed"); });
    await f.app.domains.gpx.setStylePreset(entry.id, "indigo", { expectedRevision: 1 }); await settle();
    expect(f.app.rendering.getStatus(entry.id).state).toBe("failed"); expect(handle.signal.aborted).toBe(true); expect(f.ownedLayers()).toHaveLength(0);
    expect(f.app.selection.getCurrent().ref.revision).toBe(2);
    spy.mockRestore(); await f.app.unuse("tilia-gpx-renderer"); await f.app.use("tilia-gpx-renderer"); await settle();
    expect(f.app.rendering.getStatus(entry.id).state).toBe("active");
    expect([...f.map.layers].find((l) => l instanceof Polyline && l.options.interactive !== false).options.color).toBe("#5c6bc0");
  });
  it("mounts semantic hierarchy and revisioned visibility/style controls with independent adapter lifetimes", async () => {
    const f = await fixture(["tilia-gpx-renderer", "tilia-gpx-ui", "tilia-map-selection-presenter", "tilia-layers", "tilia-settings"]);
    const entry = await f.app.domains.gpx.create(evidence()); await settle();
    byClass(f.map.container, "tilia-control-button")[0].click(); await settle();
    expect(byClass(f.map.container, "tilia-gpx-segment")).toHaveLength(1);
    const toggle = byClass(f.map.container, "tilia-gpx-category-visible")[0]; toggle.checked = false; toggle.dispatchEvent(new Event("change")); await settle();
    expect(f.app.domains.gpx.get(entry.id).revision).toBe(2); expect(f.ownedLayers()).toHaveLength(0);
    byClass(f.map.container, "tilia-settings-control")[0].children[0].click(); await settle();
    const style = byClass(f.map.container, "tilia-gpx-style-select")[0]; style.value = "amber"; style.dispatchEvent(new Event("change")); await settle();
    expect(f.app.domains.gpx.get(entry.id).snapshot.preferences.stylePresetId).toBe("amber");
    byClass(f.map.container, "tilia-layers-control")[0].children[0].click(); await settle();
    await f.app.unuse("tilia-gpx-ui"); await settle(); expect(byClass(f.map.container, "tilia-gpx-tree")).toHaveLength(0);
    toggle.checked = true; toggle.dispatchEvent(new Event("change")); await settle(); expect(f.app.domains.gpx.get(entry.id).revision).toBe(3);
    await f.app.use("tilia-gpx-ui"); await settle(); expect(byClass(f.map.container, "tilia-gpx-tree")).toHaveLength(1);
  });
  it.each(["unknown", "malformed"])("handles %s independent descriptors without semantic rollback or partial highlights", async (kind) => {
    const f = await fixture(["tilia-map-selection-presenter"]);
    await f.app.use({ id: "x-descriptor", setup(context) { context.renderers.register(gpxDomainKey, { planChange: () => "replace", build() {
      return { presentation: { anchor: () => ({ lat: 0, lng: 0 }), highlightDescriptor: () => cloneAndFreezePlainData(kind === "unknown"
        ? { kind: "future" } : { kind: "geometry", lines: [[{ lat: 0, lng: 0 }, { lat: 1, lng: 0 }]], points: [{ lat: null, lng: 0 }] }) } };
    } }); } });
    const entry = await f.app.domains.gpx.create(evidence()); await settle();
    await f.app.selection.request(f.app.domains.gpx.selection.createCandidate(entry.id, { kind: "document" })); await settle();
    expect(f.app.selection.getCurrent().entryId).toBe(entry.id); expect(f.ownedLayers()).toHaveLength(0);
    expect(f.app.rendering.getStatus(entry.id).state).toBe("active");
  });

});
