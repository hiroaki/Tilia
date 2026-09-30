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
          selectPoint(segment.id, point.id);
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
        onOperation?.(operation);
        selectPoint(segment.id, point.id);
      });
      layer.on("pointinsert", ({ index, latlng }) => {
        const point = createInsertedDraftPoint(draft, latlng);
        const operation = createInsertOperation({ trackId, segmentId: segment.id, index, point });
        applyOperation(draft, operation);
        onOperation?.(operation);
        selectPoint(segment.id, point.id);
      });
      layer.on("pointdelete", ({ index }) => {
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
        onOperation?.(operation);
        const remainingSegment = findDraftSegment(draft, trackId, segment.id);
        if (remainingSegment?.points.length) {
          const replacementIndex = Math.min(index, remainingSegment.points.length - 1);
          selectPoint(segment.id, remainingSegment.points[replacementIndex].id);
          return;
        }
        selectPoint(null, null);
        build();
      });
      layer.addTo(map);
    }
  }

  function sync(pointId = null) {
    build();
    if (!pointId) {
      return null;
    }
    for (const record of layerRecords) {
      const segment = findDraftTrack(draft, trackId)?.segments.find((candidate) => candidate.id === record.segmentId);
      const index = segment?.points.findIndex((point) => point.id === pointId) ?? -1;
      if (index >= 0) {
        return { record, point: segment.points[index] };
      }
    }
    selectPoint(null, null);
    return null;
  }

  function startEditingPoint(pointId) {
    for (const record of layerRecords) {
      const segment = findDraftTrack(draft, trackId)?.segments.find((candidate) => candidate.id === record.segmentId);
      const point = segment?.points.find((candidate) => candidate.id === pointId);
      if (!point) {
        continue;
      }
      record.layer.startEditing(new LatLng(point.lat, point.lon));
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
