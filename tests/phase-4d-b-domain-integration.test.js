import { describe, expect, it, vi } from "vitest";
import { createSemanticFoundation } from "../src/semantic-foundation.js";
import { createApplicationSemanticApi, createSemanticCapabilityFactories } from "../src/semantic-capabilities.js";
import { createPluginRuntime } from "../src/plugins/runtime/index.js";
import { createScopeController } from "../src/ownership/index.js";
import { createPhotoFacade, gpxDomainKey, photoDomainKey, semanticErrorCodes } from "../src/domains/index.js";

const catalog = Object.freeze([
  Object.freeze({ id: "tilia-gpx-domain", requires: Object.freeze([]), load: () => import("../src/plugins/domains/gpx.js") }),
  Object.freeze({ id: "tilia-photo-domain", requires: Object.freeze([]), load: () => import("../src/plugins/domains/photo.js") }),
]);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

async function harness() {
  const foundation = await createSemanticFoundation();
  const runtime = createPluginRuntime({ catalog, capabilityFactories: createSemanticCapabilityFactories(foundation) });
  return { foundation, runtime, api: createApplicationSemanticApi(foundation) };
}

function gpxValue() {
  return {
    data: {
      name: "multi.gpx",
      tracks: [
        { name: "first", segments: [
          { points: [{ lat: 35, lon: 135, elevation: 10, timestamp: 1000 }] },
          { points: [{ lat: 36, lon: 136, elevation: null, timestamp: null }] },
        ] },
        { name: "second", segments: [{ points: [{ lat: 37, lon: 137, elevation: 20, timestamp: 2000 }] }] },
      ],
      routes: [{ name: "route", points: [{ lat: 34, lon: 134, name: "route point" }] }],
      waypoints: [{ lat: 33, lon: 133, name: "waypoint" }],
    },
    preferences: {
      tracksVisible: true,
      routesVisible: true,
      waypointsVisible: false,
      trackVisibility: { 1: false },
      stylePresetId: "red",
    },
  };
}

function photoValue(blob = null) {
  return {
    data: {
      name: "photo.jpg",
      coordinate: { lat: 35, lon: 135 },
      capturedAt: 1_700_000_000_000,
      make: "Camera",
      model: "Model",
      source: { mediaType: "image/jpeg", size: blob?.size ?? 123 },
    },
    preferences: { requestedTimeMode: "auto" },
    ...(blob ? { blob } : {}),
  };
}

describe("Phase 4D-B GPX domain integration", () => {
  it("preserves canonical structure, immutable snapshots, revisions, visibility, and provider leases", async () => {
    const value = await harness();
    await value.runtime.use("tilia-gpx-domain");
    const events = [];
    value.api.entries.subscribe((event) => { if (!Array.isArray(event)) events.push(event.type); }, { emitCurrent: false });
    const input = gpxValue();
    const entry = await value.api.domains.gpx.create(input);
    input.data.tracks[0].segments[0].points[0].lat = 0;
    const first = value.api.domains.gpx.get(entry.id);

    expect(first).toMatchObject({
      revision: 1,
      snapshot: {
        data: { tracks: [{ segments: [{ points: [{ lat: 35 }] }, { points: [{ lat: 36 }] }] }, { name: "second" }], routes: [{ name: "route" }], waypoints: [{ name: "waypoint" }] },
        preferences: { tracksVisible: true, routesVisible: true, waypointsVisible: false, trackVisibility: { 1: false }, stylePresetId: "red" },
        derived: {},
      },
    });
    expect(Object.isFrozen(first.snapshot.data.tracks[0].segments[0].points)).toBe(true);
    expect(() => { first.snapshot.data.tracks.push({}); }).toThrow();
    await expect(value.runtime.unuse("tilia-gpx-domain")).rejects.toMatchObject({ code: semanticErrorCodes.providerInUse });

    const changed = await value.api.domains.gpx.replaceData(entry.id, {
      ...first.snapshot.data,
      name: "changed.gpx",
    }, { expectedRevision: 1 });
    expect(changed.revision).toBe(2);
    expect(first.snapshot.data.name).toBe("multi.gpx");
    expect((await value.api.domains.gpx.setCategoryVisibility(entry.id, { category: "routes", visible: false }, { expectedRevision: 2 })).revision).toBe(3);
    expect((await value.api.domains.gpx.setTrackVisibility(entry.id, { trackIndex: 0, visible: false }, { expectedRevision: 3 })).revision).toBe(4);
    expect((await value.api.domains.gpx.setStylePreset(entry.id, "blue", { expectedRevision: 4 })).revision).toBe(5);
    expect((await value.api.domains.gpx.recomputeDerived(entry.id, undefined, { expectedRevision: 5 })).revision).toBe(5);
    await value.api.entries.setVisible(entry.id, false);
    expect(value.api.domains.gpx.get(entry.id).revision).toBe(5);
    expect(value.api.entries.get(entry.id)).toEqual({ id: entry.id, domain: gpxDomainKey, visible: false });

    await value.api.entries.remove(entry.id);
    expect(events).toEqual(["created", "domain-changed", "domain-changed", "domain-changed", "domain-changed", "visibility-changed", "removed"]);
    await expect(value.runtime.unuse("tilia-gpx-domain")).resolves.toBeUndefined();
  });

  it("exposes stable semantic failures for invalid and wrong-domain operations", async () => {
    const value = await harness();
    await Promise.all([value.runtime.use("tilia-gpx-domain"), value.runtime.use("tilia-photo-domain")]);
    await expect(value.api.domains.gpx.create({ tracks: [{ segments: [{ points: [{ lat: 100, lon: 0 }] }] }], routes: [], waypoints: [] }))
      .rejects.toMatchObject({ code: semanticErrorCodes.inputInvalid });
    const photo = await value.api.domains.photo.create(photoValue());
    expect(() => value.api.domains.gpx.get(photo.id)).toThrowError(expect.objectContaining({ code: semanticErrorCodes.entryDomainMismatch }));
    await expect(value.api.domains.gpx.setStylePreset(999, "red", { expectedRevision: 1 }))
      .rejects.toMatchObject({ code: semanticErrorCodes.entryNotFound });
  });
});

describe("Phase 4D-B Photo domain integration", () => {
  it("retains unchanged resources and distinguishes resource-only from semantic replacement", async () => {
    const created = [];
    const revoked = [];
    const value = await harness();
    await value.runtime.use("tilia-photo-domain", {
      createObjectURL(blob) { const url = `blob:test-${created.length + 1}`; created.push([url, blob]); return url; },
      revokeObjectURL(url) { revoked.push(url); },
    });
    const blob = new Blob(["photo"], { type: "image/jpeg" });
    const entry = await value.api.domains.photo.create(photoValue(blob));
    const events = [];
    value.api.entries.subscribe((event) => { if (!Array.isArray(event)) events.push(event); }, { emitCurrent: false });
    const first = value.api.domains.photo.get(entry.id);
    expect(first).toMatchObject({
      revision: 1,
      snapshot: {
        data: { name: "photo.jpg", coordinate: { lat: 35, lon: 135 }, capturedAt: 1_700_000_000_000, hasGps: true },
        preferences: { requestedTimeMode: "auto" },
        derived: { resolvedTimeMode: null, inferredTimestamp: null, inferredLocation: null, locationSource: "exif-gps" },
      },
    });
    expect(JSON.stringify(first.snapshot)).not.toMatch(/previewUrl|objectUrl|blob:/);
    expect(Object.isFrozen(first.snapshot.data.coordinate)).toBe(true);

    const updated = await value.api.domains.photo.setRequestedTimeMode(entry.id, "utc", { expectedRevision: 1 });
    expect(updated).toMatchObject({ revision: 2, snapshot: { preferences: { requestedTimeMode: "utc" }, derived: { resolvedTimeMode: "utc" } } });
    expect(created).toHaveLength(1);
    expect(revoked).toEqual([]);
    const dataUpdated = await value.api.domains.photo.replaceData(entry.id, { ...updated.snapshot.data, name: "renamed.jpg" }, { expectedRevision: 2 });
    expect(dataUpdated).toMatchObject({ revision: 3, snapshot: { data: { name: "renamed.jpg" } } });
    expect(created).toHaveLength(1);
    expect(revoked).toEqual([]);

    const replacementBlob = new Blob(["other"], { type: "image/jpeg" });
    const resourceOnly = await value.api.domains.photo.replaceData(entry.id, {
      ...dataUpdated.snapshot.data,
      blob: replacementBlob,
    }, { expectedRevision: 3 });
    expect(resourceOnly).toMatchObject({ revision: 3, snapshot: dataUpdated.snapshot });
    expect(created).toHaveLength(2);
    expect(revoked).toEqual(["blob:test-1"]);
    expect(events.filter(({ type }) => type === "domain-changed")).toHaveLength(2);

    const combinedBlob = new Blob(["third"], { type: "image/jpeg" });
    const combined = await value.api.domains.photo.replaceData(entry.id, {
      ...resourceOnly.snapshot.data,
      name: "combined.jpg",
      blob: combinedBlob,
    }, { expectedRevision: 3 });
    expect(combined).toMatchObject({ revision: 4, snapshot: { data: { name: "combined.jpg" } } });
    expect(created).toHaveLength(3);
    expect(revoked).toEqual(["blob:test-1", "blob:test-2"]);
    expect(events.filter(({ type }) => type === "domain-changed")).toHaveLength(3);
    expect((await value.api.domains.photo.recomputeDerived(entry.id, undefined, { expectedRevision: 4 })).revision).toBe(4);
    await value.api.entries.setVisible(entry.id, false);
    expect(value.api.domains.photo.get(entry.id).revision).toBe(4);
    expect(value.foundation.inspect().entries.residuals).toEqual([]);
    expect(JSON.stringify(events)).not.toMatch(/previewUrl|objectUrl|blob:/);
    expect(JSON.stringify(value.api.entries.get(entry.id))).not.toMatch(/previewUrl|objectUrl|blob:/);
    expect(JSON.stringify(value.foundation.inspect())).not.toMatch(/previewUrl|objectUrl|blob:/);

    await expect(value.runtime.unuse("tilia-photo-domain")).rejects.toMatchObject({ code: semanticErrorCodes.providerInUse });
    await value.api.entries.remove(entry.id);
    expect(revoked).toEqual(["blob:test-1", "blob:test-2", "blob:test-3"]);
    await expect(value.runtime.unuse("tilia-photo-domain")).resolves.toBeUndefined();
    await value.foundation.dispose();
    expect(revoked).toEqual(["blob:test-1", "blob:test-2", "blob:test-3"]);
  });

  it("revokes a preview acquired by creation when requester authority disappears", async () => {
    const gate = deferred();
    const revoked = vi.fn();
    const value = await harness();
    await value.runtime.use("tilia-photo-domain", {
      createObjectURL: () => "blob:pending",
      revokeObjectURL: revoked,
      prepareGate: gate.promise,
    });
    const requester = createScopeController({ label: "photo-requester" });
    await requester.commit();
    const photo = createPhotoFacade({ scope: requester.scope, entries: value.foundation.entries });
    const creating = photo.create(photoValue(new Blob(["photo"])));
    await vi.waitFor(() => expect(value.foundation.inspect().domains[0].creationCount).toBe(1));
    await expect(value.runtime.unuse("tilia-photo-domain")).rejects.toMatchObject({ code: semanticErrorCodes.providerInUse });
    await requester.close();
    gate.resolve();
    await expect(creating).rejects.toMatchObject({ code: "SCOPE_NOT_ACTIVE" });
    expect(revoked).toHaveBeenCalledOnce();
    expect(value.api.entries.list()).toEqual([]);
    await expect(value.runtime.unuse("tilia-photo-domain")).resolves.toBeUndefined();
  });

  it("revokes an uncommitted replacement candidate and retains the committed resource", async () => {
    const gate = deferred();
    const created = [];
    const revoked = [];
    const value = await harness();
    await value.runtime.use("tilia-photo-domain", {
      createObjectURL(blob) { const url = `blob:candidate-${created.length + 1}`; created.push([url, blob]); return url; },
      revokeObjectURL(url) { revoked.push(url); },
      mutationGate: gate.promise,
    });
    const requester = createScopeController({ label: "photo-mutation-requester" });
    await requester.commit();
    const photo = createPhotoFacade({ scope: requester.scope, entries: value.foundation.entries });
    const entry = await photo.create(photoValue(new Blob(["first"])));

    await expect(photo.replaceData(entry.id, { ...photo.get(entry.id).snapshot.data, blob: new Blob(["other"]) }, { expectedRevision: 99 }))
      .rejects.toMatchObject({ code: semanticErrorCodes.entryStaleRevision });
    expect(created).toHaveLength(1);
    const replacing = photo.replaceData(entry.id, { ...photo.get(entry.id).snapshot.data, blob: new Blob(["other"]) }, { expectedRevision: 1 });
    await vi.waitFor(() => expect(created).toHaveLength(2));
    await requester.close();
    gate.resolve();

    await expect(replacing).rejects.toMatchObject({ code: "SCOPE_NOT_ACTIVE" });
    expect(revoked).toEqual(["blob:candidate-2"]);
    expect(value.api.domains.photo.get(entry.id).revision).toBe(1);
    await value.api.entries.remove(entry.id);
    expect(revoked).toEqual(["blob:candidate-2", "blob:candidate-1"]);
  });

  it("preserves the committed resource when candidate URL creation fails", async () => {
    const revoked = [];
    let createCount = 0;
    const value = await harness();
    await value.runtime.use("tilia-photo-domain", {
      createObjectURL() {
        createCount += 1;
        if (createCount === 2) throw new Error("URL creation failed");
        return "blob:committed";
      },
      revokeObjectURL(url) { revoked.push(url); },
    });
    const entry = await value.api.domains.photo.create(photoValue(new Blob(["first"])));
    await expect(value.api.domains.photo.replaceData(entry.id, {
      ...value.api.domains.photo.get(entry.id).snapshot.data,
      blob: new Blob(["other"]),
    }, { expectedRevision: 1 })).rejects.toThrow("URL creation failed");
    expect(value.api.domains.photo.get(entry.id).revision).toBe(1);
    expect(revoked).toEqual([]);
    await value.api.entries.remove(entry.id);
    expect(revoked).toEqual(["blob:committed"]);
  });

  it("revokes a candidate when asynchronous resource preparation fails", async () => {
    const gate = deferred();
    const created = [];
    const revoked = [];
    const value = await harness();
    await value.runtime.use("tilia-photo-domain", {
      createObjectURL() { const url = `blob:prepare-${created.length + 1}`; created.push(url); return url; },
      revokeObjectURL(url) { revoked.push(url); },
      mutationGate: gate.promise,
    });
    const entry = await value.api.domains.photo.create(photoValue(new Blob(["first"])));
    const replacing = value.api.domains.photo.replaceData(entry.id, {
      ...value.api.domains.photo.get(entry.id).snapshot.data,
      blob: new Blob(["other"]),
    }, { expectedRevision: 1 });
    await vi.waitFor(() => expect(created).toHaveLength(2));
    gate.reject(new Error("preparation failed"));

    await expect(replacing).rejects.toThrow("preparation failed");
    expect(revoked).toEqual(["blob:prepare-2"]);
    expect(value.api.domains.photo.get(entry.id).revision).toBe(1);
    await value.api.entries.remove(entry.id);
    expect(revoked).toEqual(["blob:prepare-2", "blob:prepare-1"]);
  });

  it("retains retryable cleanup when a resource-only replacement commits but old revocation fails", async () => {
    const attempts = [];
    let createCount = 0;
    const value = await harness();
    await value.runtime.use("tilia-photo-domain", {
      createObjectURL() { createCount += 1; return `blob:cleanup-${createCount}`; },
      revokeObjectURL(url) {
        attempts.push(url);
        if (url === "blob:cleanup-1" && attempts.filter((item) => item === url).length === 1) throw new Error("revoke failed");
      },
    });
    const entry = await value.api.domains.photo.create(photoValue(new Blob(["first"])));
    const events = [];
    value.api.entries.subscribe((event) => { if (!Array.isArray(event)) events.push(event); }, { emitCurrent: false });

    await expect(value.api.domains.photo.replaceData(entry.id, {
      ...value.api.domains.photo.get(entry.id).snapshot.data,
      blob: new Blob(["other"]),
    }, { expectedRevision: 1 })).rejects.toMatchObject({ code: semanticErrorCodes.cleanupFailed, committed: true });
    expect(value.api.domains.photo.get(entry.id).revision).toBe(1);
    expect(events.filter(({ type }) => type === "domain-changed")).toEqual([]);
    expect(value.foundation.inspect().entries.residuals[0].obligations).toMatchObject([{ phase: "update-previous-instance" }]);
    await value.foundation.entries.retryCleanup(value.foundation.scope, entry.id);
    expect(attempts).toEqual(["blob:cleanup-1", "blob:cleanup-1"]);
    await value.api.entries.remove(entry.id);
    expect(attempts).toEqual(["blob:cleanup-1", "blob:cleanup-1", "blob:cleanup-2"]);
  });

  it("rejects invalid Photo input and stale revisions without exposing resources", async () => {
    const value = await harness();
    await value.runtime.use("tilia-photo-domain");
    await expect(value.api.domains.photo.create({ data: { ...photoValue().data, capturedAt: new Date() } }))
      .rejects.toMatchObject({ code: semanticErrorCodes.inputInvalid });
    const entry = await value.api.domains.photo.create(photoValue());
    await expect(value.api.domains.photo.setRequestedTimeMode(entry.id, "mars", { expectedRevision: 1 }))
      .rejects.toMatchObject({ code: semanticErrorCodes.inputInvalid });
    await value.api.domains.photo.setRequestedTimeMode(entry.id, "local", { expectedRevision: 1 });
    await expect(value.api.domains.photo.setRequestedTimeMode(entry.id, "utc", { expectedRevision: 1 }))
      .rejects.toMatchObject({ code: semanticErrorCodes.entryStaleRevision });
  });
});

describe("Phase 4D-B capability and lazy-loading boundaries", () => {
  it("provides guarded typed domain and generic entry capabilities to plugins", async () => {
    const value = await harness();
    let captured;
    const consumer = {
      id: "x-semantic-consumer",
      setup(context) {
        captured = context;
        expect(Object.keys(context).sort()).toEqual(["domains", "entries", "plugin", "scope"]);
        expect(context).not.toHaveProperty("entryStore");
        expect(context).not.toHaveProperty("domainRegistry");
        expect(context.domains.optional(gpxDomainKey)).toBeNull();
      },
    };
    await value.runtime.use(consumer);
    expect(Object.isFrozen(captured.domains.gpx)).toBe(true);
    expect(Object.isFrozen(captured.domains.photo)).toBe(true);
    await value.runtime.unuse("x-semantic-consumer");
    expect(() => captured.entries.list()).toThrowError(expect.objectContaining({ code: "SCOPE_NOT_ACTIVE" }));
  });

  it("keeps a committed production entry after its creating plugin disappears", async () => {
    const value = await harness();
    await value.runtime.use("tilia-gpx-domain");
    let entryId;
    await value.runtime.use({
      id: "x-gpx-creator",
      async setup(context) {
        expect(context.domains.require(gpxDomainKey)).toBe(context.domains.gpx);
        entryId = (await context.domains.gpx.create(gpxValue())).id;
      },
    });
    await value.runtime.unuse("x-gpx-creator");
    expect(value.api.domains.gpx.get(entryId)).toMatchObject({ revision: 1, snapshot: { data: { name: "multi.gpx" } } });
    await value.api.entries.remove(entryId);
    await value.runtime.unuse("tilia-gpx-domain");
  });
});
