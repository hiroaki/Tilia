import { findDraftSegment } from "./draft.js";

export function createEmptySelection() {
  return {
    trackId: null,
    segmentId: null,
    pointIds: new Set(),
  };
}

export function createPointSelection({ trackId, segmentId, pointIds }) {
  const ids = new Set(pointIds || []);
  if (trackId == null || segmentId == null || ids.size === 0) {
    return createEmptySelection();
  }
  return { trackId, segmentId, pointIds: ids };
}

export function resolveEditablePointDomain(draft, { trackId, segmentId } = {}, range) {
  const segment = findDraftSegment(draft, trackId, segmentId);
  if (!segment || !range
    || !Number.isInteger(range.startIndex)
    || !Number.isInteger(range.endIndex)
    || range.startIndex < 0
    || range.endIndex < range.startIndex
    || range.endIndex >= segment.points.length) {
    return null;
  }

  return {
    trackId,
    segmentId,
    startIndex: range.startIndex,
    endIndex: range.endIndex,
    points: segment.points.slice(range.startIndex, range.endIndex + 1),
  };
}

export function reconcileSelection(selection, domain) {
  if (!selection || !domain
    || selection.trackId !== domain.trackId
    || selection.segmentId !== domain.segmentId) {
    return createEmptySelection();
  }

  const domainIds = new Set(domain.points.map((point) => point.id));
  return createPointSelection({
    trackId: selection.trackId,
    segmentId: selection.segmentId,
    pointIds: [...selection.pointIds].filter((pointId) => domainIds.has(pointId)),
  });
}

export function resolveSelectedPoints(draft, selection) {
  if (!selection || selection.pointIds.size === 0) {
    return [];
  }
  const segment = findDraftSegment(draft, selection.trackId, selection.segmentId);
  if (!segment) {
    return [];
  }
  return segment.points
    .filter((point) => selection.pointIds.has(point.id))
    .map((point) => ({
      trackId: selection.trackId,
      segmentId: selection.segmentId,
      pointId: point.id,
      point,
    }));
}
