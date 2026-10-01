import { createButton, createPanel, createSelect, installMapControl } from "../../src/map/controls.js";
import { createDraftDocument, findDraftSegment, toGpxSource } from "./draft.js";
import { createDraftTrackLayers } from "./editing-layers.js";
import { createPointForm, describePointSelection, isFormTarget } from "./form.js";
import {
  applyOperation,
  createHistory,
  createPointPatchOperation,
  createPointsDeleteOperation,
} from "./history.js";
import {
  createEmptySelection,
  createPointSelection,
  reconcileSelection,
  resolveEditablePointDomain,
  resolveSelectedPoints,
} from "./selection.js";
import { createSelectionOverlay } from "./selection-overlay.js";
import {
  createRectangleSelection,
  selectPointIdsInContainerBounds,
} from "./rectangle-selection.js";

function getGpxEntries(core) {
  return core.state.entries.filter((entry) => entry.kind === "gpx");
}

function createEditedSourceName(name = "track.gpx") {
  const suffix = " (edited)";
  return name.toLowerCase().endsWith(".gpx")
    ? `${name.slice(0, -4)}${suffix}.gpx`
    : `${name}${suffix}`;
}

export function recoverSelectionConsistencyFailure({
  details,
  reportError = console.error,
  cancelRectangleSelection,
  detachLocalEditing,
  clearSelection,
  syncSelectionPresentation,
  setStatus,
}) {
  reportError("Track editor selection consistency failure", details);
  cancelRectangleSelection();
  detachLocalEditing();
  clearSelection();
  syncSelectionPresentation();
  setStatus("The selected points no longer match the current track; editing was reset. Select the track and try again");
}

export const trackEditorPlugin = {
  id: "x-track-editor",
  requires: ["tilia-panel", "tilia-status"],
  stylesheets: [
    new URL("./styles.css", import.meta.url).href,
    new URL("./vendor/leaflet-partially-editable-polyline.css", import.meta.url).href,
  ],
  setup(app, options = {}) {
    const core = app.core;
    const map = app.getMap();
    const panel = app.services["tilia-panel"];
    const position = options.position || "topleft";
    const priority = options.priority || "normal";
    const editablePointRadius = options.editablePointRadius ?? 100;
    let selectedEntryId = null;
    let session = null;
    const trackClickBindings = [];

    function setStatus(message) {
      app.setStatus?.(`Track editor: ${message}`);
    }

    function getEntry(entryId) {
      return core.state.entries.find((entry) => entry.id === entryId) || null;
    }

    function getSelectedEntry() {
      const entries = getGpxEntries(core);
      if (!entries.some((entry) => entry.id === selectedEntryId)) {
        selectedEntryId = entries[0]?.id || null;
      }
      return getEntry(selectedEntryId);
    }

    function setPointSelection(selection) {
      if (!session) {
        return;
      }
      session.selection = selection ? createPointSelection({
        trackId: selection.trackId,
        segmentId: selection.segmentId,
        pointIds: [selection.pointId],
      }) : createEmptySelection();
    }

    function clearSelection() {
      if (session) {
        session.selection = createEmptySelection();
      }
    }

    function getSelection() {
      if (!session) return null;
      const selectedPoints = resolveSelectedPoints(session.draft, session.selection);
      return selectedPoints.length === 1 ? selectedPoints[0] : null;
    }

    function renderPanel() {
      panel.rerenderPanel("track-editor");
    }

    function cancelRectangleSelection() {
      session?.rectangleSelection.cancel();
    }

    function syncSelectionPresentation() {
      if (!session) return;
      const selectedPoints = resolveSelectedPoints(session.draft, session.selection);
      session.selectionOverlay.sync(session.localEditing ? selectedPoints : []);
      renderPanel();
    }

    function detachLocalEditing() {
      const localEditing = session?.localEditing;
      if (!localEditing) {
        return;
      }
      session.localEditing = null;
      localEditing.layer.endEditing();
    }

    function endUserLocalEditing() {
      cancelRectangleSelection();
      if (!session?.localEditing) {
        return;
      }
      detachLocalEditing();
      clearSelection();
      syncSelectionPresentation();
    }

    function reconcileSelectionWithRange({ trackId, segmentId }, range) {
      if (!session) return;
      const domain = resolveEditablePointDomain(session.draft, { trackId, segmentId }, range);
      session.selection = reconcileSelection(session.selection, domain);
    }

    function reconcileSelectionWithDraft() {
      if (!session) return;
      const selectedPoints = resolveSelectedPoints(session.draft, session.selection);
      session.selection = createPointSelection({
        trackId: session.selection.trackId,
        segmentId: session.selection.segmentId,
        pointIds: selectedPoints.map(({ pointId }) => pointId),
      });
    }

    function captureRestoreHint() {
      const localEditing = session?.localEditing;
      if (!localEditing) return null;
      const range = localEditing.layer.getEditablePointRange();
      const domain = resolveEditablePointDomain(session.draft, localEditing, range);
      if (!domain?.points.length) return null;
      const offset = Math.floor((domain.points.length - 1) / 2);
      return {
        trackId: localEditing.trackId,
        segmentId: localEditing.segmentId,
        pointId: domain.points[offset].id,
        index: domain.startIndex + offset,
      };
    }

    function resolveRestorePointId(hint) {
      if (!session || !hint) return null;
      const segment = findDraftSegment(session.draft, hint.trackId, hint.segmentId);
      if (!segment?.points.length) return null;
      if (segment.points.some((point) => point.id === hint.pointId)) {
        return hint.pointId;
      }
      return segment.points[Math.min(hint.index, segment.points.length - 1)]?.id || null;
    }

    // Vendored editor markers have no Leaflet click listener. In Leaflet v2,
    // their click can therefore fall through to map click handling despite
    // bubblingPointerEvents: false. Exclude their DOM targets from background
    // clicks until upstream makes marker click targeting self-contained.
    function isEditorMarkerClick(event) {
      const target = event?.originalEvent?.target;
      return typeof Element !== "undefined"
        && target instanceof Element
        && target.closest(".leaflet-partially-editable-polyline-point, .leaflet-partially-editable-polyline-new-point");
    }

    function startLocalEditing({ trackId, segmentId, layer, latlng }) {
      if (!session) {
        return;
      }
      cancelRectangleSelection();
      if (session.localEditing?.layer !== layer) {
        detachLocalEditing();
      }
      clearSelection();
      layer.startEditing(latlng);
      session.localEditing = { trackId, segmentId, layer };
      syncSelectionPresentation();
    }

    function syncTrackLayers(trackId, restoreHint = null) {
      const controller = session?.layersByTrackId.get(trackId);
      if (!controller) {
        return;
      }
      if (session.rectangleSelection.isDragging()) {
        cancelRectangleSelection();
      }
      const restoreLocalEditing = session.localEditing?.trackId === trackId;
      if (restoreLocalEditing) {
        detachLocalEditing();
      }
      controller.sync();
      if (restoreLocalEditing) {
        const pointId = resolveRestorePointId(restoreHint);
        if (pointId) {
          session.localEditing = controller.startEditingPoint(pointId, { selectPoint: false });
          if (session.localEditing) {
            reconcileSelectionWithRange(
              session.localEditing,
              session.localEditing.layer.getEditablePointRange(),
            );
          }
        }
      }
      reconcileSelectionWithDraft();
      syncSelectionPresentation();
    }

    function createTrackLayers(draftTrack) {
      const controller = createDraftTrackLayers({
        map,
        draft: session.draft,
        trackId: draftTrack.id,
        options: { editablePointRadius },
        onOperation(operation, context) {
          session.history.record(operation);
          if (context.type === "pointdelete"
            && session.selection.trackId === context.trackId
            && session.selection.segmentId === context.segmentId) {
            session.selection.pointIds.delete(context.pointId);
          }
          if (context.type === "pointinsert" || context.type === "pointdelete") {
            reconcileSelectionWithRange(context, context.range);
          }
          syncSelectionPresentation();
        },
        onPointSelect(selection) {
          setPointSelection(selection);
          syncSelectionPresentation();
        },
        onLocalEditingRequest: startLocalEditing,
        onLocalEditingEnd({ layer }) {
          if (session?.localEditing?.layer === layer) {
            cancelRectangleSelection();
            session.localEditing = null;
            clearSelection();
            syncSelectionPresentation();
          }
        },
      });
      session.layersByTrackId.set(draftTrack.id, controller);
    }

    function startEditing() {
      const entry = getSelectedEntry();
      if (!entry) {
        setStatus("select a GPX layer first");
        return;
      }
      if (session) {
        return;
      }
      session = {
        originalEntryId: entry.id,
        draft: createDraftDocument(entry.source),
        history: createHistory(),
        selection: createEmptySelection(),
        layersByTrackId: new Map(),
        hiddenTracks: [],
        localEditing: null,
        selectionOverlay: createSelectionOverlay(map),
        rectangleSelection: null,
      };
      session.rectangleSelection = createRectangleSelection({
        map,
        onComplete(bounds) {
          const localEditing = session?.localEditing;
          if (!localEditing) return "cancel";
          const range = localEditing.layer.getEditablePointRange();
          const domain = resolveEditablePointDomain(session.draft, localEditing, range);
          if (!domain) return "cancel";
          const pointIds = selectPointIdsInContainerBounds(map, domain, bounds);
          if (pointIds.length === 0) return "retry";
          session.selection = createPointSelection({
            trackId: localEditing.trackId,
            segmentId: localEditing.segmentId,
            pointIds,
          });
          syncSelectionPresentation();
          return "success";
        },
        onActiveChange() {
          renderPanel();
        },
      });
      for (const draftTrack of session.draft.tracks) {
        const trackIndex = draftTrack.originalTrackIndex;
        if (core.getEffectiveGpxTrackVisibility(entry.id, trackIndex) !== true) {
          continue;
        }
        const previousVisibility = core.getGpxTrackVisibility(entry.id, trackIndex);
        if (core.setGpxTrackVisibility(entry.id, trackIndex, false) !== false) {
          continue;
        }
        session.hiddenTracks.push({ trackIndex, previousVisibility });
        createTrackLayers(draftTrack);
      }
      map.closePopup?.();
      setStatus("session started; click a draft track segment to edit it");
      renderPanel();
    }

    function finishSession({ save }) {
      if (!session) {
        return;
      }
      const finished = session;
      finished.rectangleSelection.destroy();
      detachLocalEditing();
      for (const controller of finished.layersByTrackId.values()) {
        controller.destroy();
      }
      finished.selectionOverlay.destroy();
      for (const { trackIndex, previousVisibility } of finished.hiddenTracks) {
        core.setGpxTrackVisibility(finished.originalEntryId, trackIndex, previousVisibility);
      }
      session = null;
      if (save) {
        const originalEntry = getEntry(finished.originalEntryId);
        if (!originalEntry) {
          setStatus("discarded draft because its original layer was removed");
          renderPanel();
          return;
        }
        const sourceName = createEditedSourceName(originalEntry?.source?.name || finished.draft.name);
        core.addGpxSource(toGpxSource(finished.draft, sourceName), { fitToView: false, visible: true });
        app.refreshView();
        setStatus("saved edited copy as a new layer");
      } else {
        setStatus("discarded draft");
      }
      renderPanel();
    }

    function applyFormPatch(patch) {
      const selection = getSelection();
      if (!session || !selection) {
        return;
      }
      const operation = createPointPatchOperation(session.draft, {
        trackId: selection.trackId,
        segmentId: selection.segmentId,
        pointId: selection.pointId,
        patch,
      });
      if (!operation) {
        return;
      }
      applyOperation(session.draft, operation);
      session.history.record(operation);
      syncTrackLayers(selection.trackId, captureRestoreHint());
    }

    function resetAfterSelectionConsistencyFailure(details) {
      recoverSelectionConsistencyFailure({
        details,
        cancelRectangleSelection,
        detachLocalEditing,
        clearSelection,
        syncSelectionPresentation,
        setStatus,
      });
    }

    function deleteSelectedPoints() {
      if (!session || session.selection.pointIds.size === 0) return;
      const { trackId, segmentId, pointIds } = session.selection;
      const localEditing = session.localEditing;
      if (!localEditing
        || localEditing.trackId !== trackId
        || localEditing.segmentId !== segmentId) {
        resetAfterSelectionConsistencyFailure({
          reason: "editing-context-mismatch",
          selectionTrackId: trackId,
          selectionSegmentId: segmentId,
          editingTrackId: localEditing?.trackId || null,
          editingSegmentId: localEditing?.segmentId || null,
          expectedCount: pointIds.size,
        });
        return;
      }

      const { operation, error } = createPointsDeleteOperation(session.draft, {
        trackId,
        segmentId,
        pointIds,
      });
      if (!operation) {
        resetAfterSelectionConsistencyFailure(error);
        return;
      }

      const restoreHint = captureRestoreHint();
      cancelRectangleSelection();
      applyOperation(session.draft, operation);
      session.history.record(operation);
      clearSelection();
      syncTrackLayers(trackId, restoreHint);
    }

    function applyHistory(direction) {
      if (!session) {
        return;
      }
      const restoreHint = captureRestoreHint();
      const operation = direction === "undo" ? session.history.undo(session.draft) : session.history.redo(session.draft);
      if (!operation) {
        return;
      }
      syncTrackLayers(operation.trackId, restoreHint);
    }

    function buildPanelContent() {
      const root = document.createElement("div");
      root.className = "tilia-track-editor-panel";
      root.classList.toggle("tilia-track-editor-is-editing", session != null);
      const entries = getGpxEntries(core);
      const selectedEntry = getSelectedEntry();
      const intro = document.createElement("p");
      intro.className = "tilia-track-editor-intro";
      intro.textContent = session
        ? "Click a draft track segment to edit its points."
        : "Start a session to display editable draft track segments.";
      root.appendChild(intro);

      const source = createSelect(entries.map((entry) => ({
        value: String(entry.id),
        label: entry.source?.name || `Layer ${entry.id}`,
        selected: entry.id === selectedEntry?.id,
      })), "tilia-track-editor-select");
      source.disabled = session != null || entries.length === 0;
      source.addEventListener("change", () => {
        selectedEntryId = Number(source.value);
      });
      root.appendChild(source);

      const primaryActions = document.createElement("div");
      primaryActions.className = "tilia-track-editor-actions tilia-track-editor-actions-primary";
      const start = createButton("Start Edit", "tilia-track-editor-action tilia-track-editor-start");
      start.disabled = session != null || !selectedEntry;
      start.addEventListener("click", startEditing);
      const save = createButton("Save Copy", "tilia-track-editor-action");
      save.disabled = !session;
      save.addEventListener("click", () => finishSession({ save: true }));
      const cancel = createButton("Cancel", "tilia-track-editor-action");
      cancel.disabled = !session;
      cancel.addEventListener("click", () => finishSession({ save: false }));
      primaryActions.append(start, save, cancel);
      root.appendChild(primaryActions);

      const historyActions = document.createElement("div");
      historyActions.className = "tilia-track-editor-actions tilia-track-editor-actions-history";
      const undo = createButton("Undo", "tilia-track-editor-action");
      undo.disabled = !session?.history.canUndo();
      undo.addEventListener("click", () => applyHistory("undo"));
      const redo = createButton("Redo", "tilia-track-editor-action");
      redo.disabled = !session?.history.canRedo();
      redo.addEventListener("click", () => applyHistory("redo"));
      historyActions.append(undo, redo);
      root.appendChild(historyActions);

      const selectionActions = document.createElement("div");
      selectionActions.className = "tilia-track-editor-actions tilia-track-editor-actions-selection";
      const selectArea = createButton("Select area", "tilia-track-editor-action tilia-track-editor-select-area");
      const rectangleSelectionActive = session?.rectangleSelection.isActive() === true;
      selectArea.disabled = !session?.localEditing;
      selectArea.classList.toggle("tilia-track-editor-select-area-active", rectangleSelectionActive);
      selectArea.setAttribute("aria-pressed", String(rectangleSelectionActive));
      selectArea.addEventListener("click", () => {
        if (!session?.localEditing) return;
        if (session.rectangleSelection.isActive()) {
          session.rectangleSelection.cancel();
        } else {
          session.rectangleSelection.activate();
        }
      });
      selectionActions.appendChild(selectArea);
      root.appendChild(selectionActions);

      const selectedPoints = session ? resolveSelectedPoints(session.draft, session.selection) : [];
      const selectionPresentation = describePointSelection(selectedPoints);
      const pointMeta = document.createElement("p");
      pointMeta.className = "tilia-track-editor-point-meta";
      pointMeta.textContent = selectionPresentation.label;
      root.appendChild(pointMeta);
      if (selectionPresentation.count > 0) {
        const selectedPointActions = document.createElement("div");
        selectedPointActions.className = "tilia-track-editor-actions tilia-track-editor-actions-selected-points";
        const deletePoints = createButton(
          `Delete ${selectionPresentation.count} ${selectionPresentation.count === 1 ? "point" : "points"}`,
          "tilia-track-editor-action tilia-track-editor-delete-points",
        );
        deletePoints.addEventListener("click", deleteSelectedPoints);
        selectedPointActions.appendChild(deletePoints);
        root.appendChild(selectedPointActions);
      }
      if (selectionPresentation.kind !== "multiple") {
        root.appendChild(createPointForm(selectedPoints[0] || null, applyFormPatch));
      }
      return root;
    }

    const control = installMapControl({
      map,
      position,
      priority,
      className: "tilia-track-editor-control",
      createContent() {
        const wrap = createPanel("tilia-control-panel-compact");
        const button = createButton("T", "tilia-control-button-icon");
        button.title = "Track editor";
        button.setAttribute("aria-label", "Track editor");
        button.addEventListener("click", () => panel.togglePanel({
          panelId: "track-editor",
          title: "Track Editor",
          render: buildPanelContent,
        }));
        wrap.appendChild(button);
        return wrap;
      },
    });

    const unsubscribeInteractions = app.subscribeInteractions({
      onTrackLayer({ entry, layer }) {
        const onClick = () => {
          if (!session) {
            selectedEntryId = entry.id;
            renderPanel();
          }
        };
        layer.on("click", onClick);
        trackClickBindings.push({ layer, onClick });
      },
    });
    const removeRefreshHandler = app.addRefreshHandler(() => {
      if (session && !getEntry(session.originalEntryId)) {
        finishSession({ save: false });
        return;
      }
      renderPanel();
    });
    const onMapClick = (event) => {
      if (!isEditorMarkerClick(event)) {
        endUserLocalEditing();
      }
    };
    map.on("click", onMapClick);
    const onKeyDown = (event) => {
      if (!session || isFormTarget(event.target) || !(event.ctrlKey || event.metaKey)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        applyHistory(event.shiftKey ? "redo" : "undo");
      } else if (key === "y" && event.ctrlKey) {
        event.preventDefault();
        applyHistory("redo");
      }
    };
    map.getContainer().addEventListener("keydown", onKeyDown, true);

    return {
      startEditing,
      saveEditing() { finishSession({ save: true }); },
      cancelEditing() { finishSession({ save: false }); },
      undo() { applyHistory("undo"); },
      redo() { applyHistory("redo"); },
      destroy() {
        finishSession({ save: false });
        for (const { layer, onClick } of trackClickBindings) {
          layer.off("click", onClick);
        }
        unsubscribeInteractions();
        removeRefreshHandler();
        map.off("click", onMapClick);
        map.getContainer().removeEventListener("keydown", onKeyDown, true);
        control.remove?.();
      },
    };
  },
};

export default trackEditorPlugin;
