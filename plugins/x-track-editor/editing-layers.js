import { CircleMarker, LatLng } from "leaflet";
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
  onLayersChanged,
  options = {},
}) {
  let layerRecords = [];
  let building = false;

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
    building = true;
    try { buildLayers(); }
    finally { building = false; }
    restoreMarkerOrder();
  }

  function buildLayers() {
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
      const layer = new PartiallyEditablePolyline(toDraftCoordinates(segment), { ...options, interactive: true,
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
      const bind = (type, callback, target = layer) => {
        const guarded = child.guard(callback);
        child.defer(() => target.off(type, guarded), { retry: "safe" });
        target.on(type, guarded);
      };
      let singlePointMarker = null;
      let editing = false;
      let attached = false;
      const requestEditing = event => onLocalEditingRequest?.({
        trackId, segmentId: segment.id, layer, latlng: event.latlng,
      });
      function syncSinglePointMarker() {
        if (!child.alive || terminated) return;
        const current = findDraftSegment(draft, trackId, segment.id);
        if (!attached || editing || current?.points.length !== 1) {
          singlePointMarker?.remove();
          return;
        }
        const point = current.points[0];
        if (!singlePointMarker) {
          // Share the draft renderer: an upper Canvas pane would intercept line clicks.
          singlePointMarker = new CircleMarker([point.lat, point.lon], {
            pane: options.pane,
            radius: 6, fillColor: layer.options.color, fillOpacity: 1,
            color: "#fff", weight: 2, opacity: 1,
            interactive: true, bubblingPointerEvents: false,
            className: "tilia-track-editor-single-point",
          });
          const marker = singlePointMarker;
          child.defer(() => marker.remove(), { label: "single-point-marker", retry: "safe" });
          bind("click", requestEditing, marker);
        }
        singlePointMarker.setLatLng([point.lat, point.lon]);
        singlePointMarker.addTo(map);
      }
      const record = { segmentId: segment.id, layer, scope: child,
        raiseSinglePoint: () => singlePointMarker?.bringToFront() };
      layerRecords.push(record);

      bind("click", requestEditing);
      bind("add", () => {
        attached = true;
        syncSinglePointMarker();
        if (!building) restoreMarkerOrder();
      });
      bind("remove", () => {
        attached = false;
        singlePointMarker?.remove();
      });
      bind("editingstart", ({ index }) => {
        editing = true;
        syncSinglePointMarker();
        const point = getPointAt(segment, index);
        if (point) {
          if (notifySelectionOnEditingStart) {
            selectPoint(segment.id, point.id);
          }
        }
      });
      bind("editingend", () => {
        editing = false;
        syncSinglePointMarker();
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
        syncSinglePointMarker();
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

  function restoreMarkerOrder() {
    if (onLayersChanged) onLayersChanged(bringSinglePointsToFront);
    else bringSinglePointsToFront();
  }

  function bringSinglePointsToFront() {
    for (const record of layerRecords) record.raiseSinglePoint();
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
  return { destroy, endEditing, sync, startEditingPoint, bringSinglePointsToFront };
}
