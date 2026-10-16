import { describe, expect, it } from "vitest";
import { createDraftDocument, toGpxSource } from "../plugins/x-track-editor/draft.js";
import { normalizeGpxDocument, updateGpxPoint } from "../src/gpx/document.js";

const sourceInput = { name: "route.gpx", tracks: [{ segments: [{ points: [{ lat: 35, lon: 135, elevation: 10, timestamp: 1000 }, { lat: 35.1, lon: 135.1, elevation: null, timestamp: null }] }] }] };

describe("canonical GPX and detached draft replacement coverage", () => {
  it("accepts omitted routes and always returns the canonical collections", () => {
    const source = normalizeGpxDocument({ tracks: [], waypoints: [] });

    expect(source).toMatchObject({ tracks: [], routes: [], waypoints: [] });
  });

  it("normalizes routes without conflating route points with track points", () => {
    const source = normalizeGpxDocument({
      routes: [
        { name: "Planned", points: [{ lat: 35, lon: 135, name: "Start", elevation: null, timestamp: null }] },
        { name: "", points: [] },
      ],
    });

    expect(source.routes).toEqual([
      { name: "Planned", points: [{ lat: 35, lon: 135, name: "Start", elevation: null, timestamp: null }] },
      { points: [] },
    ]);
    expect(source.tracks).toEqual([]);
  });

  it("does not apply XML import limits to programmatically supplied routes", () => {
    const routes = Array.from({ length: 21 }, (_, routeIndex) => ({
      name: `Route ${routeIndex + 1}`,
      points: Array.from({ length: 101 }, (_, pointIndex) => ({
        lat: 35 + (pointIndex / 1000),
        lon: 135,
        name: "",
      })),
    }));

    const source = normalizeGpxDocument({ routes });

    expect(source.routes).toHaveLength(21);
    expect(source.routes[0].points).toHaveLength(101);
  });

  it("normalizes hierarchy and leaves unnamed tracks unnamed", () => {
    const source = normalizeGpxDocument(sourceInput);
    expect(source.tracks[0].name).toBeUndefined();
    expect(source.tracks[0].segments[0].points).toHaveLength(2);
    expect(source).not.toHaveProperty("trackPoints");
  });
  it("clones nested source objects without retaining point identity", () => {
    const source = normalizeGpxDocument({
      ...sourceInput,
      routes: [{ name: "Planned", points: [{ lat: 34.9, lon: 134.9, name: "Start" }] }],
    });
    const cloned = normalizeGpxDocument(source);
    expect(cloned).toEqual(source);
    expect(cloned.tracks[0].segments[0].points[0]).not.toBe(source.tracks[0].segments[0].points[0]);
    expect(cloned.routes[0]).not.toBe(source.routes[0]);
    expect(cloned.routes[0].points[0]).not.toBe(source.routes[0].points[0]);
  });
  it("updates one point through its structural locator", () => {
    const route = { name: "Planned", points: [{ lat: 34.9, lon: 134.9, name: "Start" }] };
    const updated = updateGpxPoint(normalizeGpxDocument({ ...sourceInput, routes: [route] }), { target: { kind: "track-point", trackIndex: 0, segmentIndex: 0, pointIndex: 1 }, patch: { lat: 35.2, elevation: 20, timestamp: 2000 } });
    expect(updated.tracks[0].segments[0].points[1]).toEqual({ lat: 35.2, lon: 135.1, elevation: 20, timestamp: 2000 });
    expect(updated.routes).toEqual(normalizeGpxDocument({ routes: [route] }).routes);
  });
  it("rejects invalid coordinate patches without mutating the authoritative snapshot", () => {
    const source = normalizeGpxDocument(sourceInput);
    expect(() => updateGpxPoint(source, { target: {kind:"track-point",trackIndex:0,segmentIndex:0,pointIndex:1},patch:{lat:"",lon:"bad"} })).toThrow();
    expect(source.tracks[0].segments[0].points[1]).toMatchObject({lat:35.1,lon:135.1});
    expect(() => normalizeGpxDocument({ routes:[{points:[{lat:"bad",lon:136}]}] })).toThrow();
  });
});

it("copies canonical empty hierarchy without shifting original track indices or expanding the draft", () => {
  const source=normalizeGpxDocument({tracks:[{segments:[]},{segments:[{points:[]},{points:[{lat:0,lon:0,elevation:0,timestamp:0}]}]}],routes:[{points:[{lat:1,lon:1}]}],waypoints:[{lat:2,lon:2}]});
  const draft=createDraftDocument(source);
  expect(draft.tracks.map(track=>track.originalTrackIndex)).toEqual([0,1]);
  expect(draft.tracks[0].segments).toEqual([]);expect(draft.tracks[1].segments[0].points).toEqual([]);
  draft.tracks[1].segments[1].points[0].lat=5;
  expect(source.tracks[1].segments[1].points[0].lat).toBe(0);
  const saved=normalizeGpxDocument(toGpxSource(draft));expect(saved.routes).toEqual([]);expect(saved.waypoints).toEqual([]);
  expect(saved.tracks[1].segments[1].points[0]).toMatchObject({lat:5,elevation:0,timestamp:0});
});
