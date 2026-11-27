import { describe, expect, it } from "vitest";
import {
  createDraftDocument,
  createInsertedDraftPoint,
  findDraftSegment,
  toGpxSource,
} from "../plugins/x-track-editor/draft.js";
import {
  applyOperation,
  createDeleteOperation,
  createInsertOperation,
  createPointPatchOperation,
  createPointsDeleteOperation,
} from "../plugins/x-track-editor/track-operations.js";
import { createHistory } from "../plugins/x-track-editor/history.js";
import { normalizeGpxDocument } from "../src/gpx/document.js";

function createSource() {
  return normalizeGpxDocument({
    name: "original.gpx",
    metadata: { name: "Journey", description: "Field notes", timestamp: 0 },
    tracks: [
      { name: "A", description: "First track", segments: [{ points: [{ lat: 35, lon: 135, elevation: 10, timestamp: 1000, name: "Camp", description: "Camp notes", symbol: "Tent" }] }] },
      { name: "B", segments: [{ points: [{ lat: 36, lon: 136, elevation: 20, timestamp: 2000 }, { lat: 36.1, lon: 136.1, elevation: 21, timestamp: 3000 }] }] },
    ],
    routes: [
      { name: "Planned", description: "Route notes", points: [
        { lat: 34.9, lon: 134.9, name: "Route point", description: "Turn", symbol: "Crossing", elevation: 1, timestamp: 2 },
        { lat: 34.8, lon: 134.8 },
      ] },
      { name: "Empty route", points: [] },
    ],
    waypoints: [
      { lat: 35, lon: 135, name: "Waypoint", description: "Water stop", symbol: "Water", elevation: 3, timestamp: 4 },
      { lat: 36, lon: 136 },
    ],
  });
}

describe("x-track-editor draft and history", () => {
  it("keeps a detached copy of the canonical GPX document and omits internal IDs on save", () => {
    const source = structuredClone(createSource());
    const expected = structuredClone(source);
    const draft = createDraftDocument(source);

    expect(toGpxSource(draft)).toEqual(expected);
    const ids = [
      ...draft.waypoints.map(point => point.id),
      ...draft.routes.flatMap(route => [route.id, ...route.points.map(point => point.id)]),
      ...draft.tracks.flatMap(track => [track.id, ...track.segments.flatMap(segment => [
        segment.id, ...segment.points.map(point => point.id),
      ])]),
    ];
    expect(ids.every(id => typeof id === "string")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);

    source.metadata.name = "Changed externally";
    source.routes[0].points.reverse();
    source.waypoints[0].description = "Changed externally";
    draft.tracks[0].segments[0].points[0].lat = 35.5;
    expect(source.tracks[0].segments[0].points[0].lat).toBe(35);

    expected.tracks[0].segments[0].points[0].lat = 35.5;
    expected.name = "original (edited).gpx";
    const output = toGpxSource(draft, expected.name);
    expect(output).toEqual(expected);
    output.metadata.name = "Changed after saving";
    output.waypoints[0].symbol = "Changed after saving";
    output.routes[0].points[0].name = "Changed after saving";
    output.tracks[0].segments[0].points.length = 0;
    expect(toGpxSource(draft, expected.name)).toEqual(expected);
  });

  it.each([["tracks", 0], ["tracks and waypoints", 1], ["tracks and routes", 2]])("copies %s without requiring the other feature types", (_, index) => {
    const all = createSource();
    const source = normalizeGpxDocument({
      tracks: all.tracks,
      waypoints: index === 1 ? all.waypoints : [],
      routes: index === 2 ? all.routes : [],
    });
    expect(toGpxSource(createDraftDocument(source))).toEqual(source);
  });

  it("filters only routes and waypoints from a tracks-only payload", () => {
    const source = createSource();
    const draft = createDraftDocument(source);
    expect(toGpxSource(draft, source.name, { tracksOnly: true })).toEqual({
      ...source, waypoints: [], routes: [],
    });
    expect(toGpxSource(draft)).toEqual(source);
  });

  it("records point patches, inserts null metadata points, and invalidates redo after a new edit", () => {
    const draft = createDraftDocument(createSource());
    const history = createHistory((operation, direction) => applyOperation(draft, operation, direction));
    const track = draft.tracks[1];
    const segment = track.segments[0];
    const point = segment.points[0];
    const patch = createPointPatchOperation(draft, {
      trackId: track.id,
      segmentId: segment.id,
      pointId: point.id,
      patch: { lat: 36.5, elevation: null, timestamp: null },
    });
    applyOperation(draft, patch);
    history.record(patch);

    const inserted = createInsertedDraftPoint(draft, { lat: 36.6, lng: 136.6 });
    const insert = createInsertOperation({ trackId: track.id, segmentId: segment.id, index: 1, point: inserted });
    applyOperation(draft, insert);
    history.record(insert);

    expect(segment.points[1]).toMatchObject({ lat: 36.6, lon: 136.6, elevation: null, timestamp: null });
    history.undo();
    expect(segment.points).toHaveLength(2);
    history.undo();
    expect(point).toMatchObject({ lat: 36, elevation: 20, timestamp: 2000 });

    const nextPatch = createPointPatchOperation(draft, {
      trackId: track.id,
      segmentId: segment.id,
      pointId: point.id,
      patch: { lon: 136.5 },
    });
    applyOperation(draft, nextPatch);
    history.record(nextPatch);
    expect(history.canRedo()).toBe(false);
  });

  it("restores an emptied segment and track through undo", () => {
    const draft = createDraftDocument(createSource());
    const history = createHistory((operation, direction) => applyOperation(draft, operation, direction));
    const track = draft.tracks[0];
    const segment = track.segments[0];
    const originalTrack = structuredClone(track);
    const operation = createDeleteOperation(draft, {
      trackId: track.id,
      segmentId: segment.id,
      pointId: segment.points[0].id,
    });

    applyOperation(draft, operation);
    history.record(operation);
    expect(draft.tracks.map((candidate) => candidate.name)).toEqual(["B"]);

    history.undo();
    expect(draft.tracks.map((candidate) => candidate.name)).toEqual(["A", "B"]);
    expect(findDraftSegment(draft, track.id, segment.id)).toEqual(originalTrack.segments[0]);
    expect(draft.tracks[0]).toEqual(originalTrack);
    expect(draft.tracks[0]).not.toBe(track);
    expect(draft.tracks[0].segments[0].points[0]).not.toBe(operation.point);
    history.redo();
    expect(draft.tracks.map((candidate) => candidate.name)).toEqual(["B"]);
  });

  it("atomically deletes and restores multiple points in original order", () => {
    const draft = createDraftDocument(createSource());
    const history = createHistory((operation, direction) => applyOperation(draft, operation, direction));
    const track = draft.tracks[1];
    const segment = track.segments[0];
    const originalPoints = segment.points.map((point) => ({ ...point }));
    const { operation, error } = createPointsDeleteOperation(draft, {
      trackId: track.id,
      segmentId: segment.id,
      pointIds: [segment.points[1].id, segment.points[0].id],
    });

    expect(error).toBeNull();
    expect(operation.deletedPoints.map(({ point }) => point.id)).toEqual(
      originalPoints.map((point) => point.id),
    );
    applyOperation(draft, operation);
    history.record(operation);
    expect(findDraftSegment(draft, track.id, segment.id)).toBeNull();
    expect(history.canUndo()).toBe(true);

    history.undo();
    expect(findDraftSegment(draft, track.id, segment.id).points).toEqual(originalPoints);
    expect(history.canUndo()).toBe(false);
    history.redo();
    expect(findDraftSegment(draft, track.id, segment.id)).toBeNull();
    expect(history.canRedo()).toBe(false);
  });

  it("preserves remaining point data and positions across partial bulk delete Undo and Redo", () => {
    const draft = createDraftDocument(normalizeGpxDocument({
      name: "partial.gpx",
      tracks: [{ segments: [{ points: [
        { lat: 1, lon: 11, elevation: 21, timestamp: 31 },
        { lat: 2, lon: 12, elevation: 22, timestamp: 32 },
        { lat: 3, lon: 13, elevation: 23, timestamp: 33 },
        { lat: 4, lon: 14, elevation: 24, timestamp: 34 },
      ] }] }],
      waypoints: [],
    }));
    const history = createHistory((operation, direction) => applyOperation(draft, operation, direction));
    const track = draft.tracks[0];
    const segment = track.segments[0];
    const originalPoints = segment.points.map((point) => ({ ...point }));
    const { operation } = createPointsDeleteOperation(draft, {
      trackId: track.id,
      segmentId: segment.id,
      pointIds: [originalPoints[2].id, originalPoints[0].id],
    });

    applyOperation(draft, operation);
    history.record(operation);
    expect(segment.points).toEqual([originalPoints[1], originalPoints[3]]);
    history.undo();
    expect(segment.points).toEqual(originalPoints);
    history.redo();
    expect(segment.points).toEqual([originalPoints[1], originalPoints[3]]);
  });

  it("restores a track removed by one atomic multiple-point deletion", () => {
    const draft = createDraftDocument(createSource());
    const history = createHistory((operation, direction) => applyOperation(draft, operation, direction));
    const track = draft.tracks[0];
    const segment = track.segments[0];
    const originalTrack = structuredClone(track);
    const { operation } = createPointsDeleteOperation(draft, {
      trackId: track.id,
      segmentId: segment.id,
      pointIds: segment.points.map((point) => point.id),
    });

    applyOperation(draft, operation);
    history.record(operation);
    expect(draft.tracks.some((candidate) => candidate.id === track.id)).toBe(false);
    history.undo();
    expect(draft.tracks.find((candidate) => candidate.id === track.id)).toEqual(originalTrack);
  });

  it("rejects unresolved selected IDs without mutating the draft or history", () => {
    const draft = createDraftDocument(createSource());
    const history = createHistory((operation, direction) => applyOperation(draft, operation, direction));
    const track = draft.tracks[1];
    const segment = track.segments[0];
    const before = structuredClone(draft.tracks);
    const result = createPointsDeleteOperation(draft, {
      trackId: track.id,
      segmentId: segment.id,
      pointIds: [segment.points[0].id, "missing-point"],
    });

    expect(result.operation).toBeNull();
    expect(result.error).toMatchObject({
      code: "inconsistent-selection",
      expectedCount: 2,
      resolvedCount: 1,
      trackFound: true,
      segmentFound: true,
    });
    expect(draft.tracks).toEqual(before);
    expect(history.canUndo()).toBe(false);
  });
});
