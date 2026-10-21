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
  createHistory,
  createInsertOperation,
  createPointPatchOperation,
  createPointsDeleteOperation,
} from "../plugins/x-track-editor/history.js";

function createSource() {
  return {
    name: "original.gpx",
    tracks: [
      { name: "A", segments: [{ points: [{ lat: 35, lon: 135, elevation: 10, timestamp: 1000 }] }] },
      { name: "B", segments: [{ points: [{ lat: 36, lon: 136, elevation: 20, timestamp: 2000 }, { lat: 36.1, lon: 136.1, elevation: 21, timestamp: 3000 }] }] },
    ],
    routes: [{ name: "Ignored GPX route", points: [{ lat: 34.9, lon: 134.9, name: "Route point" }] }],
    waypoints: [{ lat: 35, lon: 135, name: "Ignored on save" }],
  };
}

describe("x-track-editor draft and history", () => {
  it("creates a detached draft for every track and emits track-only GPX output", () => {
    const source = createSource();
    const draft = createDraftDocument(source);

    draft.tracks[0].segments[0].points[0].lat = 35.5;

    expect(source.tracks[0].segments[0].points[0].lat).toBe(35);
    expect(source.routes).toHaveLength(1);
    expect(draft).not.toHaveProperty("routes");
    expect(draft.tracks.map((track) => track.name)).toEqual(["A", "B"]);
    expect(toGpxSource(draft, "original (edited).gpx")).toEqual({
      type: "gpx",
      name: "original (edited).gpx",
      tracks: [
        { name: "A", segments: [{ points: [{ lat: 35.5, lon: 135, elevation: 10, timestamp: 1000 }] }] },
        { name: "B", segments: [{ points: [{ lat: 36, lon: 136, elevation: 20, timestamp: 2000 }, { lat: 36.1, lon: 136.1, elevation: 21, timestamp: 3000 }] }] },
      ],
      waypoints: [],
    });
  });

  it("records point patches, inserts null metadata points, and invalidates redo after a new edit", () => {
    const draft = createDraftDocument(createSource());
    const history = createHistory();
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
    history.undo(draft);
    expect(segment.points).toHaveLength(2);
    history.undo(draft);
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
    const history = createHistory();
    const track = draft.tracks[0];
    const segment = track.segments[0];
    const operation = createDeleteOperation(draft, {
      trackId: track.id,
      segmentId: segment.id,
      pointId: segment.points[0].id,
    });

    applyOperation(draft, operation);
    history.record(operation);
    expect(draft.tracks.map((candidate) => candidate.name)).toEqual(["B"]);

    history.undo(draft);
    expect(draft.tracks.map((candidate) => candidate.name)).toEqual(["A", "B"]);
    expect(findDraftSegment(draft, track.id, segment.id).points).toHaveLength(1);
    history.redo(draft);
    expect(draft.tracks.map((candidate) => candidate.name)).toEqual(["B"]);
  });

  it("atomically deletes and restores multiple points in original order", () => {
    const draft = createDraftDocument(createSource());
    const history = createHistory();
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

    history.undo(draft);
    expect(findDraftSegment(draft, track.id, segment.id).points).toEqual(originalPoints);
    expect(history.canUndo()).toBe(false);
    history.redo(draft);
    expect(findDraftSegment(draft, track.id, segment.id)).toBeNull();
    expect(history.canRedo()).toBe(false);
  });

  it("preserves remaining point data and positions across partial bulk delete Undo and Redo", () => {
    const draft = createDraftDocument({
      name: "partial.gpx",
      tracks: [{ segments: [{ points: [
        { lat: 1, lon: 11, elevation: 21, timestamp: 31 },
        { lat: 2, lon: 12, elevation: 22, timestamp: 32 },
        { lat: 3, lon: 13, elevation: 23, timestamp: 33 },
        { lat: 4, lon: 14, elevation: 24, timestamp: 34 },
      ] }] }],
      waypoints: [],
    });
    const history = createHistory();
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
    history.undo(draft);
    expect(segment.points).toEqual(originalPoints);
    history.redo(draft);
    expect(segment.points).toEqual([originalPoints[1], originalPoints[3]]);
  });

  it("restores a track removed by one atomic multiple-point deletion", () => {
    const draft = createDraftDocument(createSource());
    const history = createHistory();
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
    history.undo(draft);
    expect(draft.tracks.find((candidate) => candidate.id === track.id)).toEqual(originalTrack);
  });

  it("rejects unresolved selected IDs without mutating the draft or history", () => {
    const draft = createDraftDocument(createSource());
    const history = createHistory();
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
