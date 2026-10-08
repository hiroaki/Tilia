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
  scope,
  report = () => {},
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
    const old = layerRecords; layerRecords = [];
    const work = Promise.all(old.map(record => record.scope.dispose()));
    void work.catch(report);
    return work;
  }

  function build() {
    if (!scope.alive) return;
    clear();
    const track = findDraftTrack(draft, trackId);
    if (!track) {
      return;
    }

    for (const segment of track.segments) {
      if (segment.points.length === 0) {
        continue;
      }
      const child = scope.child({ label: `draft-segment:${segment.id}` });
      const layer = new PartiallyEditablePolyline(toDraftCoordinates(segment), { ...options, interactive: false,
        className: "tilia-track-editor-draft" });
      let terminationError = null, terminated = false;
      const terminate = () => {
        if (terminated) return;
        terminated = true;
        try { layer.disableEditing(); } catch (error) { terminationError = error; }
      };
      // Vendor onRemove/helper cleanup has no verified safe retry after failure.
      child.defer(() => layer.remove(), { label: "vendor-composite-remove", retry: "never" });
      child.defer(() => { terminate(); if (terminationError) throw terminationError; }, { label: "vendor-edit-termination", retry: "never" });
      child.signal.addEventListener("abort", terminate, { once: true });
      child.defer(() => child.signal.removeEventListener("abort", terminate), { retry: "safe" });
      const bind = (type, callback) => {
        const guarded = child.guard(callback);
        child.defer(() => layer.off(type, guarded), { retry: "safe" });
        layer.on(type, guarded);
      };
      const record = { segmentId: segment.id, layer, scope: child };
      layerRecords.push(record);

      bind("click", (event) => onLocalEditingRequest?.({
        trackId,
        segmentId: segment.id,
        layer,
        latlng: event.latlng,
      }));
      bind("editingstart", ({ index }) => {
        const point = getPointAt(segment, index);
        if (point) {
          if (notifySelectionOnEditingStart) {
            selectPoint(segment.id, point.id);
          }
        }
      });
      bind("editingend", () => {
        onLocalEditingEnd?.({ trackId, segmentId: segment.id, layer });
      });
      bind("pointchange", ({ index, latlng }) => {
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
      bind("pointinsert", ({ index, latlng }) => {
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
      bind("pointdelete", ({ index }) => {
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
      bind("pointclick", ({ index }) => {
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

  function destroy() { return clear(); }

  function endEditing() {
    for (const record of layerRecords) {
      record.layer.endEditing();
    }
  }

  build();
  function nearestEditingRequest(latlng) {
    if (!scope.alive) return null;
    const clicked = map.latLngToContainerPoint(latlng);
    let result = null;
    for (const record of layerRecords) {
      if (!record.scope.alive) continue;
      const segment = findDraftSegment(draft, trackId, record.segmentId);
      const pixels = segment.points.map(point => map.latLngToContainerPoint([point.lat, point.lon]));
      for (let index = 0; index < pixels.length; index++) {
        const a = pixels[index], b = pixels[index + 1] ?? a;
        const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
        const t = length ? Math.max(0, Math.min(1, ((clicked.x-a.x)*dx+(clicked.y-a.y)*dy)/length)) : 0;
        const distance = (clicked.x-a.x-t*dx)**2 + (clicked.y-a.y-t*dy)**2;
        if (distance <= 100 && (!result || distance < result.distance))
          result = { distance, trackId, segmentId: record.segmentId, layer: record.layer, latlng: new LatLng(latlng.lat, latlng.lng) };
      }
    }
    return result;
  }
  return { destroy, endEditing, sync, startEditingPoint, nearestEditingRequest };
}
