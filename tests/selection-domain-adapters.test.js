import { describe, expect, it } from "vitest";
import { createGpxProvider } from "../src/plugins/domains/gpx-provider.js";
import { createPhotoProvider } from "../src/plugins/domains/photo-provider.js";
import { createSemanticFoundation } from "../src/semantic-foundation.js";
import { createScopeController } from "../src/ownership/index.js";
import { defineDomainKey } from "../src/domains/index.js";

const data = {
  name: "structured",
  tracks: [
    { name: "first", segments: [
      { points: [{ lat: 35, lon: 135 }, { lat: 35, lon: 135 }] },
      { points: [{ lat: 36, lon: 136 }] },
    ] },
    { name: "second", segments: [{ points: [{ lat: 37, lon: 137 }] }] },
  ],
  routes: [{ name: "route", points: [{ lat: 34, lon: 134, name: "route point" }] }],
  waypoints: [{ lat: 33, lon: 133, name: "waypoint" }],
};

describe("minimum GPX selection adapter", () => {
  it.each([
    [{ kind: "document" }, { name: "structured" }],
    [{ kind: "track", trackIndex: 1 }, { name: "second" }],
    [{ kind: "segment", trackIndex: 0, segmentIndex: 1 }, { points: [{ lat: 36 }] }],
    [{ kind: "track-point", trackIndex: 0, segmentIndex: 1, pointIndex: 0 }, { lat: 36 }],
    [{ kind: "route", routeIndex: 0 }, { name: "route" }],
    [{ kind: "route-point", routeIndex: 0, pointIndex: 0 }, { name: "route point" }],
    [{ kind: "waypoint", waypointIndex: 0 }, { name: "waypoint" }],
  ])("canonicalizes and resolves %j in its preserved hierarchy", async (target, expected) => {
    const provider = createGpxProvider();
    const { instance } = await provider.prepareCreate({ value: data });
    const ref = provider.selection.canonicalize({ instance, revision: 3, target });
    const value = provider.selection.resolve({ instance, revision: 3, ref });
    expect(value).toMatchObject(expected);
    expect(Object.isFrozen(value)).toBe(true);
    expect(ref.revision).toBe(target.kind === "document" ? undefined : 3);
    expect(provider.selection.equals(ref, { ...ref })).toBe(true);
    if (target.kind !== "document") expect(provider.selection.resolve({ instance, revision: 4, ref })).toBeNull();
  });

  it.each([
    null, {}, { kind: "renderer" }, { kind: "track", trackIndex: -1 },
    { kind: "track", trackIndex: 0.1 }, { kind: "track", trackIndex: 99 },
    { kind: "track-point", trackIndex: 0, segmentIndex: 99, pointIndex: 0 },
    { kind: "route-point", routeIndex: 0, pointIndex: 99 },
    { kind: "waypoint", waypointIndex: 99 },
    { kind: "document", layer: {} },
  ])("rejects malformed/missing target %j", async (target) => {
    const provider = createGpxProvider();
    const { instance } = await provider.prepareCreate({ value: data });
    expect(() => provider.selection.canonicalize({ instance, revision: 1, target }))
      .toThrowError(expect.objectContaining({ code: "SELECTION_REFERENCE_INVALID" }));
  });

  it("keeps coincident points distinct and rejects malformed canonical refs", async () => {
    const provider = createGpxProvider();
    const { instance } = await provider.prepareCreate({ value: data });
    const target = { kind: "track-point", trackIndex: 0, segmentIndex: 0, pointIndex: 0 };
    const a = provider.selection.canonicalize({ instance, revision: 1, target });
    const b = provider.selection.canonicalize({ instance, revision: 1, target: { ...target, pointIndex: 1 } });
    expect(provider.selection.equals(a, b)).toBe(false);
    expect(() => provider.selection.resolve({ instance, revision: 1, ref: target }))
      .toThrowError(expect.objectContaining({ code: "SELECTION_REFERENCE_INVALID" }));
  });
});

describe("Photo selection and optional provider boundary", () => {
  it("resolves a GPS-less Photo without leaking private resources", async () => {
    const provider = createPhotoProvider({ createObjectURL: () => "blob:private", revokeObjectURL: () => {} });
    const prepared = await provider.prepareCreate({ value: { data: { name: "photo" }, blob: new Blob(["x"]) }, entryScope: { defer() {} } });
    const ref = provider.selection.canonicalize({ target: { kind: "photo" } });
    expect(provider.selection.resolve({ instance: prepared.instance, ref }).data.coordinate).toBeNull();
    expect(JSON.stringify(provider.selection.resolve({ instance: prepared.instance, ref }))).not.toMatch(/blob:private|previewUrl/);
    expect(() => provider.selection.canonicalize({ target: { kind: "photo", previewUrl: "blob:private" } })).toThrow();
    prepared.dispose();
  });

  it("requires a complete adapter when supplied without requiring every provider to support selection", async () => {
    const foundation = await createSemanticFoundation();
    const owner = createScopeController({ label: "provider" });
    const key = defineDomainKey({ id: "optional-selection" });
    const facade = foundation.domains.createFacade({ scope: owner.scope, stage: (value) => owner.stage(value) });
    const provider = { prepareCreate() {}, prepareMutation() {}, getSnapshot() {} };
    expect(() => facade.provide(key, { ...provider, selection: {} })).toThrowError(expect.objectContaining({ code: "DOMAIN_PROVIDER_INVALID" }));
    facade.provide(key, provider);
    await owner.commit();
    expect(facade.has(key)).toBe(true);
    await owner.close();
    await foundation.dispose();
  });
});
