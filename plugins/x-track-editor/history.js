import {
  cloneDraftPoint,
  cloneDraftSegment,
  cloneDraftTrack,
  findDraftPoint,
  findDraftSegment,
  findDraftTrack,
} from "./draft.js";

function findIndex(items, id) {
  return items.findIndex((item) => item.id === id);
}

function setPoint(point, values) {
  Object.assign(point, values);
}

function removePointAndEmptyParents(draft, operation) {
  const track = findDraftTrack(draft, operation.trackId);
  const segment = findDraftSegment(draft, operation.trackId, operation.segmentId);
  if (!track || !segment) {
    return;
  }

  const pointIndex = findIndex(segment.points, operation.point.id);
  if (pointIndex < 0) {
    return;
  }
  segment.points.splice(pointIndex, 1);
  if (segment.points.length > 0) {
    return;
  }

  const segmentIndex = findIndex(track.segments, operation.segmentId);
  if (segmentIndex >= 0) {
    track.segments.splice(segmentIndex, 1);
  }
  if (track.segments.length === 0) {
    const trackIndex = findIndex(draft.tracks, operation.trackId);
    if (trackIndex >= 0) {
      draft.tracks.splice(trackIndex, 1);
    }
  }
}

function restoreDeletedPoint(draft, operation) {
  let track = findDraftTrack(draft, operation.trackId);
  if (!track) {
    draft.tracks.splice(operation.trackIndex, 0, cloneDraftTrack(operation.trackSnapshot));
    return;
  }

  let segment = findDraftSegment(draft, operation.trackId, operation.segmentId);
  if (!segment) {
    track.segments.splice(operation.segmentIndex, 0, cloneDraftSegment(operation.segmentSnapshot));
    return;
  }

  if (!findDraftPoint(draft, operation.trackId, operation.segmentId, operation.point.id)) {
    segment.points.splice(operation.pointIndex, 0, cloneDraftPoint(operation.point));
  }
}

function removePointsAndEmptyParents(draft, operation) {
  const track = findDraftTrack(draft, operation.trackId);
  const segment = findDraftSegment(draft, operation.trackId, operation.segmentId);
  if (!track || !segment) return;

  const deletedIds = new Set(operation.deletedPoints.map(({ point }) => point.id));
  const resolvedCount = segment.points.filter((point) => deletedIds.has(point.id)).length;
  if (resolvedCount !== deletedIds.size) return;
  segment.points = segment.points.filter((point) => !deletedIds.has(point.id));
  if (segment.points.length > 0) return;

  const segmentIndex = findIndex(track.segments, operation.segmentId);
  if (segmentIndex >= 0) track.segments.splice(segmentIndex, 1);
  if (track.segments.length > 0) return;

  const trackIndex = findIndex(draft.tracks, operation.trackId);
  if (trackIndex >= 0) draft.tracks.splice(trackIndex, 1);
}

function restoreDeletedPoints(draft, operation) {
  let track = findDraftTrack(draft, operation.trackId);
  if (!track) {
    draft.tracks.splice(operation.trackIndex, 0, cloneDraftTrack(operation.trackSnapshot));
    return;
  }

  let segment = findDraftSegment(draft, operation.trackId, operation.segmentId);
  if (!segment) {
    track.segments.splice(operation.segmentIndex, 0, cloneDraftSegment(operation.segmentSnapshot));
    return;
  }

  if (operation.deletedPoints.some(({ point }) => (
    findDraftPoint(draft, operation.trackId, operation.segmentId, point.id)
  ))) return;

  for (const { index, point } of operation.deletedPoints) {
    segment.points.splice(Math.min(index, segment.points.length), 0, cloneDraftPoint(point));
  }
}

export function createPointPatchOperation(draft, { trackId, segmentId, pointId, patch }) {
  const point = findDraftPoint(draft, trackId, segmentId, pointId);
  if (!point) {
    return null;
  }
  const before = {};
  const after = {};
  for (const [key, value] of Object.entries(patch)) {
    if (Object.hasOwn(point, key) && !Object.is(point[key], value)) {
      before[key] = point[key];
      after[key] = value;
    }
  }
  if (Object.keys(after).length === 0) {
    return null;
  }
  return { type: "point-patch", trackId, segmentId, pointId, before, after };
}

export function createInsertOperation({ trackId, segmentId, index, point }) {
  return { type: "insert", trackId, segmentId, index, point: cloneDraftPoint(point) };
}

export function createDeleteOperation(draft, { trackId, segmentId, pointId }) {
  const track = findDraftTrack(draft, trackId);
  const segment = findDraftSegment(draft, trackId, segmentId);
  const point = findDraftPoint(draft, trackId, segmentId, pointId);
  if (!track || !segment || !point) {
    return null;
  }
  return {
    type: "delete",
    trackId,
    segmentId,
    point: cloneDraftPoint(point),
    trackIndex: findIndex(draft.tracks, trackId),
    segmentIndex: findIndex(track.segments, segmentId),
    pointIndex: findIndex(segment.points, pointId),
    trackSnapshot: cloneDraftTrack(track),
    segmentSnapshot: cloneDraftSegment(segment),
  };
}

export function createPointsDeleteOperation(draft, { trackId, segmentId, pointIds }) {
  const ids = new Set(pointIds || []);
  const track = findDraftTrack(draft, trackId);
  const segment = findDraftSegment(draft, trackId, segmentId);
  const resolved = segment?.points
    .map((point, index) => ({ index, point }))
    .filter(({ point }) => ids.has(point.id)) || [];

  if (!track || !segment || ids.size === 0 || resolved.length !== ids.size) {
    return {
      operation: null,
      error: {
        code: "inconsistent-selection",
        trackId,
        segmentId,
        expectedCount: ids.size,
        resolvedCount: resolved.length,
        trackFound: Boolean(track),
        segmentFound: Boolean(segment),
      },
    };
  }

  return {
    operation: {
      type: "points-delete",
      trackId,
      segmentId,
      deletedPoints: resolved.map(({ index, point }) => ({
        index,
        point: cloneDraftPoint(point),
      })),
      trackIndex: findIndex(draft.tracks, trackId),
      segmentIndex: findIndex(track.segments, segmentId),
      trackSnapshot: cloneDraftTrack(track),
      segmentSnapshot: cloneDraftSegment(segment),
    },
    error: null,
  };
}

export function applyOperation(draft, operation, direction = "forward") {
  if (!operation) {
    return;
  }
  const forward = direction === "forward";
  if (operation.type === "point-patch") {
    const point = findDraftPoint(draft, operation.trackId, operation.segmentId, operation.pointId);
    if (point) {
      setPoint(point, forward ? operation.after : operation.before);
    }
    return;
  }

  if (operation.type === "insert") {
    const segment = findDraftSegment(draft, operation.trackId, operation.segmentId);
    if (!segment) {
      return;
    }
    if (forward) {
      if (findIndex(segment.points, operation.point.id) < 0) {
        segment.points.splice(operation.index, 0, cloneDraftPoint(operation.point));
      }
    } else {
      const index = findIndex(segment.points, operation.point.id);
      if (index >= 0) {
        segment.points.splice(index, 1);
      }
    }
    return;
  }

  if (operation.type === "delete") {
    if (forward) {
      removePointAndEmptyParents(draft, operation);
    } else {
      restoreDeletedPoint(draft, operation);
    }
    return;
  }

  if (operation.type === "points-delete") {
    if (forward) {
      removePointsAndEmptyParents(draft, operation);
    } else {
      restoreDeletedPoints(draft, operation);
    }
  }
}

export function createHistory() {
  const undoStack = [];
  const redoStack = [];
  return {
    record(operation) {
      if (!operation) {
        return false;
      }
      undoStack.push(operation);
      redoStack.length = 0;
      return true;
    },
    undo(draft) {
      const operation = undoStack.pop();
      if (!operation) {
        return null;
      }
      applyOperation(draft, operation, "reverse");
      redoStack.push(operation);
      return operation;
    },
    redo(draft) {
      const operation = redoStack.pop();
      if (!operation) {
        return null;
      }
      applyOperation(draft, operation, "forward");
      undoStack.push(operation);
      return operation;
    },
    canUndo() {
      return undoStack.length > 0;
    },
    canRedo() {
      return redoStack.length > 0;
    },
    clear() {
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };
}
