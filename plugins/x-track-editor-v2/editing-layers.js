import { LatLng } from "leaflet";
import { PartiallyEditablePolyline } from "./vendor/leaflet-partially-editable-polyline.js";
import {
  createInsertedDraftPoint,
  findDraftPoint,
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

export function createActiveTrackLayers({
  map,
  draft,
  trackId,
  onOperation,
  onPointSelect,
  options = {},
}) {
  let layerRecords = [];
  let selectedPointId = null;

  function selectPoint(segmentId, pointId) {
    const point = findDraftPoint(draft, trackId, segmentId, pointId);
    if (!point) {
      selectedPointId = null;
      onPointSelect?.(null);
      return;
    }
    selectedPointId = point.id;
    onPointSelect?.({ trackId, segmentId, pointId: point.id, point });
  }

  function clear() {
    for (const record of layerRecords) {
      record.layer.off();
      record.layer.endEditing();
      record.layer.remove();
    }
    layerRecords = [];
  }

  function build() {
    clear();
    const track = findDraftTrack(draft, trackId);
    if (!track) {
      selectPoint(null, null);
      return;
    }

    for (const segment of track.segments) {
      if (segment.points.length === 0) {
        continue;
      }
      const layer = new PartiallyEditablePolyline(toDraftCoordinates(segment), options);
      const record = { segmentId: segment.id, layer };
      layerRecords.push(record);

      layer.on("click", (event) => {
        layer.startEditing(event.latlng);
      });
      layer.on("editingstart", ({ index }) => {
        const point = getPointAt(segment, index);
        if (point) {
          selectPoint(segment.id, point.id);
        }
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
        build();
      });
      layer.addTo(map);
    }
  }

  function sync(pointId = selectedPointId) {
    build();
    if (!pointId) {
      return;
    }
    for (const record of layerRecords) {
      const segment = findDraftTrack(draft, trackId)?.segments.find((candidate) => candidate.id === record.segmentId);
      const index = segment?.points.findIndex((point) => point.id === pointId) ?? -1;
      if (index >= 0) {
        const point = segment.points[index];
        record.layer.startEditing(new LatLng(point.lat, point.lon));
        return;
      }
    }
    selectPoint(null, null);
  }

  function destroy() {
    clear();
    selectedPointId = null;
  }

  function endEditing() {
    for (const record of layerRecords) {
      record.layer.endEditing();
    }
  }

  build();
  return { destroy, endEditing, sync, getSelectedPointId: () => selectedPointId };
}
