import { describe, expect, it } from "vitest";
import { createDraftDocument } from "../plugins/x-track-editor/draft.js";
import {
  createEmptySelection,
  createPointSelection,
  reconcileSelection,
  resolveEditablePointDomain,
  resolveSelectedPoints,
} from "../plugins/x-track-editor/selection.js";

function createDraft() {
  return createDraftDocument({
    name: "selection.gpx",
    tracks: [{
      name: "Track",
      segments: [{
        points: Array.from({ length: 6 }, (_, index) => ({
          lat: 35 + index,
          lon: 135 + index,
          elevation: index,
          timestamp: index * 1000,
        })),
      }],
    }],
    waypoints: [],
  });
}

describe("x-track-editor selection helpers", () => {
  it("resolves inclusive editable ranges, including truncated edge ranges", () => {
    const draft = createDraft();
    const track = draft.tracks[0];
    const segment = track.segments[0];

    expect(resolveEditablePointDomain(draft, {
      trackId: track.id,
      segmentId: segment.id,
    }, { startIndex: 1, endIndex: 3 }).points.map((point) => point.id)).toEqual(
      segment.points.slice(1, 4).map((point) => point.id),
    );
    expect(resolveEditablePointDomain(draft, {
      trackId: track.id,
      segmentId: segment.id,
    }, { startIndex: 0, endIndex: 1 }).points).toHaveLength(2);
    expect(resolveEditablePointDomain(draft, {
      trackId: track.id,
      segmentId: segment.id,
    }, { startIndex: 4, endIndex: 5 }).points).toHaveLength(2);
  });

  it("rejects null and invalid editable ranges", () => {
    const draft = createDraft();
    const track = draft.tracks[0];
    const segment = track.segments[0];
    const ref = { trackId: track.id, segmentId: segment.id };

    expect(resolveEditablePointDomain(draft, ref, null)).toBeNull();
    expect(resolveEditablePointDomain(draft, ref, { startIndex: -1, endIndex: 2 })).toBeNull();
    expect(resolveEditablePointDomain(draft, ref, { startIndex: 3, endIndex: 2 })).toBeNull();
    expect(resolveEditablePointDomain(draft, ref, { startIndex: 0, endIndex: 6 })).toBeNull();
    expect(resolveEditablePointDomain(draft, ref, { startIndex: 0.5, endIndex: 2 })).toBeNull();
  });

  it("intersects arbitrary-cardinality selections without selecting newly entered points", () => {
    const draft = createDraft();
    const track = draft.tracks[0];
    const segment = track.segments[0];
    const selection = createPointSelection({
      trackId: track.id,
      segmentId: segment.id,
      pointIds: [segment.points[0].id, segment.points[2].id, segment.points[4].id, "missing"],
    });
    const domain = resolveEditablePointDomain(draft, selection, { startIndex: 1, endIndex: 4 });
    const reconciled = reconcileSelection(selection, domain);

    expect([...reconciled.pointIds]).toEqual([segment.points[2].id, segment.points[4].id]);
    expect(reconciled.pointIds.has(segment.points[1].id)).toBe(false);
    expect(reconcileSelection(createEmptySelection(), domain)).toEqual(createEmptySelection());
  });

  it("resolves selected points in segment order and ignores stale IDs", () => {
    const draft = createDraft();
    const track = draft.tracks[0];
    const segment = track.segments[0];
    const selection = createPointSelection({
      trackId: track.id,
      segmentId: segment.id,
      pointIds: [segment.points[4].id, "missing", segment.points[1].id, segment.points[3].id],
    });

    expect(resolveSelectedPoints(draft, selection).map(({ pointId }) => pointId)).toEqual([
      segment.points[1].id,
      segment.points[3].id,
      segment.points[4].id,
    ]);
    expect(resolveSelectedPoints(draft, createEmptySelection())).toEqual([]);
  });
});
