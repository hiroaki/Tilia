import { gpxDomainKey } from "../../src/domains/index.js";
import { panelServiceKey } from "../../src/plugins/contracts/panel.js";
import { statusServiceKey } from "../../src/plugins/contracts/status.js";
import { listen, reportError } from "../../src/ui/scoped-dom.js";
import { registerLauncher } from "../../src/ui/toolbar-launcher.js";
import { createButton, createSelect } from "../../src/map/controls.js";
import { createDraftDocument, findDraftSegment, toGpxSource } from "./draft.js";
import { createDraftTrackLayers } from "./editing-layers.js";
import {
  createPointInspector,
  describePointSelection,
  isFormTarget,
  parsePointProperty,
} from "./form.js";
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
  requires: ["tilia-gpx-domain", "tilia-panel", "tilia-toolbar"],
  setup(context, options = {}) {
    const gpx = context.domains.require(gpxDomainKey);
    const panel = context.services.require(panelServiceKey);
    const status = context.services.optional(statusServiceKey);
    const map = context.map.advancedLeafletMap();
    const report = error => reportError(context, error);
    context.styles.use({ id: "x-track-editor", href: new URL("./styles.css", import.meta.url).href });
    context.styles.use({ id: "x-track-editor-vendor", href: new URL("./vendor/leaflet-partially-editable-polyline.css", import.meta.url).href });
    let mount, rows, gestureContainer;
    const panelHandles = new Set();
    context.scope.defer(async () => { for (const handle of panelHandles) await handle.dispose(); }, { retry: "safe" });
    context.ui.mountSurface({ id: "editor-gestures", surface: "floating", ariaLabel: "Track editor gestures",
      mount({ container }) {
        gestureContainer = container;
        Object.assign(container.style, { position: "absolute", inset: "0", pointerEvents: "none" });
      } });
    const editablePointRadius = options.editablePointRadius ?? 100;
    let selectedEntryId = null;
    let session = null;

    function setStatus(message) {
      if (context.scope.alive) { try { status?.set(`Track editor: ${message}`); } catch (error) { report(error); } }
    }

    function getEntry(entryId) {
      return context.entries.get(entryId);
    }

    function getSelectedEntry() {
      const entries = context.entries.list().filter(entry => entry.domain === gpxDomainKey);
      if (!entries.some((entry) => entry.id === selectedEntryId)) {
        selectedEntryId = entries[0]?.id || null;
      }
      return getEntry(selectedEntryId);
    }

    function setPointSelection(selection) {
      if (!session || session.saving) {
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

    function renderPanel() {
      if (!context.scope.alive || !mount?.scope.alive) return;
      const old = rows; rows = mount.scope.child({ label: "editor-form-rows" });
      void old?.dispose().catch(report);
      mount.container.replaceChildren(buildPanelContent());
    }

    function cancelRectangleSelection() {
      session?.rectangleSelection.cancel();
    }

    function syncSelectionPresentation() {
      if (!session) return;
      const selectedPoints = resolveSelectedPoints(session.draft, session.selection);
      const selectedIds = new Set(selectedPoints.map(({ pointId }) => pointId));
      if (!selectedIds.has(session.inspector.focusedPointId)) session.inspector.focusedPointId = null;
      if (!selectedIds.has(session.inspector.editingCell?.pointId)) session.inspector.editingCell = null;
      session.selectionOverlay.sync(session.localEditing ? selectedPoints : [], {
        focusedPointId: session.inspector.focusedPointId,
      });
      renderPanel();
    }

    function syncInspectorFocus() {
      if (!session) return;
      const selectedPoints = resolveSelectedPoints(session.draft, session.selection);
      session.selectionOverlay.sync(session.localEditing ? selectedPoints : [], {
        focusedPointId: session.inspector.focusedPointId,
      });
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

    function startLocalEditing({ trackId, segmentId, layer, latlng }) {
      if (!session || session.saving) {
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

    function restoreSinglePointOrder(raiseChangedTrack) {
      if (!session?.scope.alive) return;
      for (const layers of session.layersByTrackId.values()) {
        if (layers.bringSinglePointsToFront !== raiseChangedTrack) layers.bringSinglePointsToFront();
      }
      // Includes the initial controller before it has been registered in the session.
      raiseChangedTrack();
    }

    function createTrackLayers(draftTrack) {
      const controller = createDraftTrackLayers({
        map,
        scope: session.scope.child({ label: `draft-track:${draftTrack.id}` }),
        report,
        draft: session.draft,
        trackId: draftTrack.id,
        options: { editablePointRadius, pane: session.draftPane.name, handlePane: session.handlesPane.name },
        onOperation(operation, context) {
          if (!session || session.saving) return;
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
        onLayersChanged: restoreSinglePointOrder,
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
      const view = gpx.get(entry.id);
      const scope = context.scope.child({ label: "editor-session" });
      session = {
        scope,
        saving: null,
        originalEntryId: entry.id,
        draft: createDraftDocument(view.snapshot.data),
        history: createHistory(),
        selection: createEmptySelection(),
        layersByTrackId: new Map(),
        suppression: [],
        draftPane: null,
        handlesPane: null,
        localEditing: null,
        selectionOverlay: createSelectionOverlay({ context, scope, report }),
        rectangleSelection: null,
        inspector: { focusedPointId: null, editingCell: null, scrollTop: 0 },
      };
      const initialized = session;
      scope.defer(() => { if (session === initialized) session = null; }, { label: "draft-authority", retry: "safe" });
      try {
        let draftPane, handlesPane;
        scope.defer(() => draftPane?.dispose(), { label: "editor-draft-pane", retry: "safe" });
        draftPane = context.map.createPane({ name: "editor-draft", band: "modal" });
        initialized.draftPane = draftPane;
        scope.defer(() => handlesPane?.dispose(), { label: "editor-handles-pane", retry: "safe" });
        handlesPane = context.map.createPane({ name: "editor-handles", band: "modal" });
        initialized.handlesPane = handlesPane;
        session.rectangleSelection = createRectangleSelection({
          report,
          map,
          scope: scope.child({ label: "editor-rectangle" }),
          parent: gestureContainer,
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
        for (const draftTrack of initialized.draft.tracks) {
          const trackIndex = draftTrack.originalTrackIndex, preferences = view.snapshot.preferences;
          if (!view.entry.visible || !preferences.tracksVisible || preferences.trackVisibility[trackIndex] === false) continue;
          try {
            initialized.suppression.push(context.rendering.suppress({ entryId: entry.id, domain: gpxDomainKey,
              target: { kind: "track", trackIndex }, expectedRevision: view.revision, scope }));
          } catch (error) {
            // Source presentation admission is optional after draft initialization.
            // Source disappearance/revision changes cannot revoke draft authority.
            report(error);
          }
          if (!scope.alive || session !== initialized) break;
          createTrackLayers(draftTrack);
        }
      } catch (error) {
        if (session === initialized) session = null;
        void scope.dispose().catch(report); report(error); renderPanel(); return;
      }
      setStatus("session started; click a draft track segment to edit it");
      renderPanel();
    }

    function finishSession({ save }) {
      if (!session) return Promise.resolve();
      const finished = session;
      if (!save) {
        session = null;
        const closing = finished.scope.dispose();
        void closing.catch(report);
        setStatus("discarded draft"); renderPanel(); return closing;
      }
      if (finished.saving) return finished.saving;
      commitInspectorCell();
      if (finished.inspector.editingCell?.error) return Promise.resolve();
      finished.rectangleSelection.cancel();
      detachLocalEditing();
      const source = toGpxSource(finished.draft, createEditedSourceName(finished.draft.name));
      const output = { name: source.name, tracks: source.tracks, waypoints: [] };
      const operation = finished.scope.child({ label: "editor-save" });
      const saving = Promise.resolve().then(async () => {
        try {
          const entry = await gpx.create(output, { visible: true, signal: operation.signal });
          if (session === finished && finished.scope.alive) {
            session = null; void finished.scope.dispose().catch(report);
            setStatus("saved edited copy as a new layer"); renderPanel();
          }
          return entry;
        } catch (error) {
          if (session === finished && finished.scope.alive) {
            finished.saving = null; setStatus(`save failed: ${error.message}`); report(error); renderPanel();
          }
        } finally { void operation.dispose().catch(report); }
      });
      finished.saving = saving;
      operation.track(saving, { label: "save-outcome", await: false });
      renderPanel(); return saving;
    }

    function commitInspectorCell() {
      const editingCell = session?.inspector.editingCell;
      if (!session || session.saving || !editingCell) return;
      const selection = resolveSelectedPoints(session.draft, session.selection)
        .find(({ pointId }) => pointId === editingCell.pointId);
      if (!selection) {
        session.inspector.editingCell = null;
        syncSelectionPresentation();
        return;
      }
      const parsed = parsePointProperty(editingCell.property, editingCell.draftValue);
      if (!parsed.valid) {
        editingCell.error = "Enter a valid value.";
        renderPanel();
        return;
      }
      const operation = createPointPatchOperation(session.draft, {
        trackId: selection.trackId,
        segmentId: selection.segmentId,
        pointId: selection.pointId,
        patch: { [editingCell.property]: parsed.value },
      });
      if (!operation) {
        session.inspector.editingCell = null;
        renderPanel();
        return;
      }
      session.inspector.editingCell = null;
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
      if (!session || session.saving || session.selection.pointIds.size === 0) return;
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
      if (session?.saving) return;
      if (!session || session.saving) {
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
      const entries = context.entries.list().filter(entry => entry.domain === gpxDomainKey);
      const selectedEntry = getSelectedEntry();
      const intro = document.createElement("p");
      intro.className = "tilia-track-editor-intro";
      intro.textContent = session
        ? "Click a draft track segment to edit its points."
        : "Start a session to display editable draft track segments.";
      root.appendChild(intro);

      const ids = entries.map(entry => entry.id);
      const source = createSelect(entries.map((entry, index) => ({
        value: String(index),
        label: gpx.getDocument(entry.id).document.name || `Layer ${entry.id}`,
        selected: entry.id === selectedEntry?.id,
      })), "tilia-track-editor-select");
      source.disabled = session != null || entries.length === 0;
      listen(rows, source, "change", () => {
        selectedEntryId = ids[Number(source.value)] ?? null;
      });
      root.appendChild(source);

      const primaryActions = document.createElement("div");
      primaryActions.className = "tilia-track-editor-actions tilia-track-editor-actions-primary";
      const start = createButton("Start Edit", "tilia-track-editor-action tilia-track-editor-start");
      start.disabled = session != null || !selectedEntry;
      listen(rows, start, "click", startEditing);
      const save = createButton("Save Copy", "tilia-track-editor-action");
      save.disabled = !session || Boolean(session.saving);
      listen(rows, save, "click", () => finishSession({ save: true }));
      const cancel = createButton("Cancel", "tilia-track-editor-action");
      cancel.disabled = !session;
      listen(rows, cancel, "click", () => finishSession({ save: false }));
      primaryActions.append(start, save, cancel);
      root.appendChild(primaryActions);

      const historyActions = document.createElement("div");
      historyActions.className = "tilia-track-editor-actions tilia-track-editor-actions-history";
      const undo = createButton("Undo", "tilia-track-editor-action");
      undo.disabled = !session?.history.canUndo() || Boolean(session.saving);
      listen(rows, undo, "click", () => applyHistory("undo"));
      const redo = createButton("Redo", "tilia-track-editor-action");
      redo.disabled = !session?.history.canRedo() || Boolean(session.saving);
      listen(rows, redo, "click", () => applyHistory("redo"));
      historyActions.append(undo, redo);
      root.appendChild(historyActions);

      const selectionActions = document.createElement("div");
      selectionActions.className = "tilia-track-editor-actions tilia-track-editor-actions-selection";
      const selectArea = createButton("Select area", "tilia-track-editor-action tilia-track-editor-select-area");
      const rectangleSelectionActive = session?.rectangleSelection.isActive() === true;
      selectArea.disabled = !session?.localEditing || Boolean(session.saving);
      selectArea.classList.toggle("tilia-track-editor-select-area-active", rectangleSelectionActive);
      selectArea.setAttribute("aria-pressed", String(rectangleSelectionActive));
      listen(rows, selectArea, "click", () => {
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
        listen(rows, deletePoints, "click", deleteSelectedPoints);
        selectedPointActions.appendChild(deletePoints);
        root.appendChild(selectedPointActions);
      }
      root.appendChild(createPointInspector(selectedPoints, session?.inspector || {
        focusedPointId: null, editingCell: null, scrollTop: 0,
      }, {
        onFocus(pointId) {
          if (!session) return;
          session.inspector.focusedPointId = pointId;
          syncInspectorFocus();
        },
        onBeginEdit(editingCell) {
          if (!session) return;
          session.inspector.focusedPointId = editingCell.pointId;
          session.inspector.editingCell = { ...editingCell, error: null };
          syncInspectorFocus();
          renderPanel();
        },
        onDraftChange(draftValue) {
          if (!session?.inspector.editingCell) return;
          session.inspector.editingCell.draftValue = draftValue;
          session.inspector.editingCell.error = null;
        },
        onCommit: commitInspectorCell,
        onCancel() {
          if (!session) return;
          session.inspector.editingCell = null;
          renderPanel();
        },
        onScroll(scrollTop) {
          if (session) session.inspector.scrollTop = scrollTop;
        },
      }, { scope: rows, report }));
      return root;
    }

    registerLauncher(context, options, { kind: "action", label: "Track editor", iconText: "T",
      className: "tilia-track-editor-control", activate() {
        if (panel.isOpen("track-editor")) return panel.close("track-editor");
        const handle = panel.open({ id: "track-editor", title: "Track Editor", mount(value) {
          mount = value;
          value.scope.defer(() => { if (mount === value) mount = null; }, { retry: "safe" });
          renderPanel();
        } });
        panelHandles.add(handle);
      } });
    context.selection.subscribe(() => {
      if (session) return;
      const selected = context.selection.getCurrent();
      if (selected?.domain === gpxDomainKey && ["track","segment","track-point"].includes(selected.ref.kind)) {
        selectedEntryId = selected.entryId; renderPanel();
      }
    });
    context.entries.subscribe(renderPanel, { emitCurrent: false });
    context.map.listen("click", () => {
      if (!session || session.saving) return;
      endUserLocalEditing();
    });
    const onKeyDown = context.scope.guard(event => {
      if (!session || session.saving || isFormTarget(event.target) || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z") { event.preventDefault(); applyHistory(event.shiftKey ? "redo" : "undo"); }
      else if (key === "y" && event.ctrlKey) { event.preventDefault(); applyHistory("redo"); }
    });
    const container = map.getContainer();
    context.scope.defer(() => container.removeEventListener("keydown", onKeyDown, true), { retry: "safe" });
    container.addEventListener("keydown", onKeyDown, true);
  },
};
export default trackEditorPlugin;
