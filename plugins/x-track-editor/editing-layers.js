import { LatLng } from "leaflet";
import { PartiallyEditablePolyline } from "./vendor/leaflet-partially-editable-polyline.js";
import {
  createInsertedDraftPoint,
  findDraftPoint,
  findDraftSegment,
  findDraftTrack,
  toDraftCoordinates,
} from "./draft.js";
import {
  applyOperation,
  createDeleteOperation,
  createInsertOperation,
  createPointPatchOperation,
} from "./history.js";

function getPointAt(segment, index) {
  return segment?.points[index] || null;
}

export function createDraftTrackLayers({
  map,
  draft,
  trackId,
  onOperation,
  onPointSelect,
  onLocalEditingRequest,
  onLocalEditingEnd,
  options = {},
}) {
  let layerRecords = [];

  function selectPoint(segmentId, pointId) {
    const point = findDraftPoint(draft, trackId, segmentId, pointId);
    if (!point) {
      onPointSelect?.(null);
      return;
    }
    onPointSelect?.({ trackId, segmentId, pointId: point.id, point });
  }

  function clear() {
    for (const record of layerRecords) {
      record.layer.endEditing();
      record.layer.off();
      record.layer.remove();
    }
    layerRecords = [];
  }

  function build() {
    clear();
    const track = findDraftTrack(draft, trackId);
    if (!track) {
      return;
    }

    for (const segment of track.segments) {
      if (segment.points.length === 0) {
        continue;
      }
      const layer = new PartiallyEditablePolyline(toDraftCoordinates(segment), options);
      const record = { segmentId: segment.id, layer };
      layerRecords.push(record);

      layer.on("click", (event) => onLocalEditingRequest?.({
        trackId,
        segmentId: segment.id,
        layer,
        latlng: event.latlng,
      }));
      layer.on("editingstart", ({ index }) => {
        const point = getPointAt(segment, index);
        if (point) {
          if (notifySelectionOnEditingStart) {
            selectPoint(segment.id, point.id);
          }
        }
      });
      layer.on("editingend", () => {
        onLocalEditingEnd?.({ trackId, segmentId: segment.id, layer });
      });
      layer.on("pointchange", ({ index, latlng }) => {
        const point = getPointAt(segment, index);
        const operation = point && createPointPatchOperation(draft, {
          trackId,
          segmentId: segment.id,
          pointId: point.id,
          patch: { lat: latlng.lat, lon: latlng.lng },
        });
        if (!operation) {
          return;
        }
        applyOperation(draft, operation);
        onOperation?.(operation, {
          type: "pointchange",
          trackId,
          segmentId: segment.id,
          pointId: point.id,
          range: layer.getEditablePointRange(),
        });
      });
      layer.on("pointinsert", ({ index, latlng }) => {
        const range = layer.getEditablePointRange();
        const point = createInsertedDraftPoint(draft, latlng);
        const operation = createInsertOperation({ trackId, segmentId: segment.id, index, point });
        applyOperation(draft, operation);
        onOperation?.(operation, {
          type: "pointinsert",
          trackId,
          segmentId: segment.id,
          pointId: point.id,
          range,
        });
      });
      layer.on("pointdelete", ({ index }) => {
        const range = layer.getEditablePointRange();
        const point = getPointAt(segment, index);
        const operation = point && createDeleteOperation(draft, {
          trackId,
          segmentId: segment.id,
          pointId: point.id,
        });
        if (!operation) {
          return;
        }
        applyOperation(draft, operation);
        onOperation?.(operation, {
          type: "pointdelete",
          trackId,
          segmentId: segment.id,
          pointId: point.id,
          range,
        });
        const remainingSegment = findDraftSegment(draft, trackId, segment.id);
        if (remainingSegment?.points.length) {
          return;
        }
        build();
      });
      layer.on("pointclick", ({ index }) => {
        const point = getPointAt(segment, index);
        if (point) {
          selectPoint(segment.id, point.id);
        }
      });
      layer.addTo(map);
    }
  }

  function sync() {
    build();
  }

  let notifySelectionOnEditingStart = true;

  function startEditingPoint(pointId, { selectPoint: shouldSelectPoint = true } = {}) {
    for (const record of layerRecords) {
      const segment = findDraftTrack(draft, trackId)?.segments.find((candidate) => candidate.id === record.segmentId);
      const point = segment?.points.find((candidate) => candidate.id === pointId);
      if (!point) {
        continue;
      }
      notifySelectionOnEditingStart = shouldSelectPoint;
      try {
        record.layer.startEditing(new LatLng(point.lat, point.lon));
      } finally {
        notifySelectionOnEditingStart = true;
      }
      return { trackId, segmentId: record.segmentId, layer: record.layer };
    }
    return null;
  }

  function destroy() {
    clear();
  }

  function endEditing() {
    for (const record of layerRecords) {
      record.layer.endEditing();
    }
  }

  build();
  return { destroy, endEditing, sync, startEditingPoint };
}
