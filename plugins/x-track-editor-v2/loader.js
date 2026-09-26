import { createButton, createPanel, createSelect, installMapControl } from "../../src/map/controls.js";
import { createDraftDocument, findDraftPoint, toGpxSource } from "./draft.js";
import { createActiveTrackLayers } from "./editing-layers.js";
import { createPointForm, isFormTarget } from "./form.js";
import { applyOperation, createHistory, createPointPatchOperation } from "./history.js";

function getGpxEntries(core) {
  return core.state.entries.filter((entry) => entry.kind === "gpx");
}

function createEditedSourceName(name = "track.gpx") {
  const suffix = " (edited)";
  return name.toLowerCase().endsWith(".gpx")
    ? `${name.slice(0, -4)}${suffix}.gpx`
    : `${name}${suffix}`;
}

export const trackEditorV2Plugin = {
  id: "x-track-editor-v2",
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

    function getSelection() {
      if (!session?.selected) {
        return null;
      }
      const point = findDraftPoint(session.draft, session.selected.trackId, session.selected.segmentId, session.selected.pointId);
      return point ? { ...session.selected, point } : null;
    }

    function renderPanel() {
      panel.rerenderPanel("track-editor-v2");
    }

    function deactivateTrack() {
      if (!session?.active) {
        return;
      }
      session.active.layers.destroy();
      core.setGpxTrackVisibility(session.originalEntryId, session.active.originalTrackIndex, session.active.previousVisibility);
      session.active = null;
      session.selected = null;
    }

    function syncActiveTrack() {
      if (session?.active) {
        session.active.layers.sync(session.selected?.pointId || null);
      }
    }

    function activateTrack(entry, trackIndex) {
      if (!session || entry.id !== session.originalEntryId) {
        return;
      }
      // The normal visible Leaflet layer is the only activation route. This
      // own-preference check also avoids bypassing a track hidden by the user.
      if (core.getGpxTrackVisibility(entry.id, trackIndex) !== true) {
        return;
      }
      const draftTrack = session.draft.tracks.find((track) => track.originalTrackIndex === trackIndex);
      if (!draftTrack) {
        return;
      }
      if (session.active?.trackId === draftTrack.id) {
        return;
      }

      deactivateTrack();
      const previousVisibility = core.getGpxTrackVisibility(entry.id, trackIndex);
      if (previousVisibility !== true || core.setGpxTrackVisibility(entry.id, trackIndex, false) !== false) {
        return;
      }
      map.closePopup?.();
      session.active = {
        trackId: draftTrack.id,
        originalTrackIndex: trackIndex,
        previousVisibility,
        layers: createActiveTrackLayers({
          map,
          draft: session.draft,
          trackId: draftTrack.id,
          options: { editablePointRadius },
          onOperation(operation) {
            session.history.record(operation);
            renderPanel();
          },
          onPointSelect(selection) {
            session.selected = selection;
            renderPanel();
          },
        }),
      };
      setStatus(`editing ${entry.source.name} track ${trackIndex + 1}`);
      renderPanel();
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
        active: null,
        selected: null,
      };
      setStatus("session started; click a visible track to edit it");
      renderPanel();
    }

    function finishSession({ save }) {
      if (!session) {
        return;
      }
      const finished = session;
      deactivateTrack();
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
      syncActiveTrack();
      renderPanel();
    }

    function applyHistory(direction) {
      if (!session) {
        return;
      }
      const operation = direction === "undo" ? session.history.undo(session.draft) : session.history.redo(session.draft);
      if (!operation) {
        return;
      }
      if (session.active?.trackId === operation.trackId) {
        syncActiveTrack();
      }
      renderPanel();
    }

    function buildPanelContent() {
      const root = document.createElement("div");
      root.className = "tilia-track-editor-v2-panel";
      root.classList.toggle("tilia-track-editor-v2-is-editing", session != null);
      const entries = getGpxEntries(core);
      const selectedEntry = getSelectedEntry();
      const intro = document.createElement("p");
      intro.className = "tilia-track-editor-v2-intro";
      intro.textContent = session
        ? "Click a visible non-active track to switch editing targets."
        : "Start a session, then click a visible track to edit its segments.";
      root.appendChild(intro);

      const source = createSelect(entries.map((entry) => ({
        value: String(entry.id),
        label: entry.source?.name || `Layer ${entry.id}`,
        selected: entry.id === selectedEntry?.id,
      })), "tilia-track-editor-v2-select");
      source.disabled = session != null || entries.length === 0;
      source.addEventListener("change", () => {
        selectedEntryId = Number(source.value);
      });
      root.appendChild(source);

      const primaryActions = document.createElement("div");
      primaryActions.className = "tilia-track-editor-v2-actions tilia-track-editor-v2-actions-primary";
      const start = createButton("Start Edit", "tilia-track-editor-v2-action tilia-track-editor-v2-start");
      start.disabled = session != null || !selectedEntry;
      start.addEventListener("click", startEditing);
      const save = createButton("Save Copy", "tilia-track-editor-v2-action");
      save.disabled = !session;
      save.addEventListener("click", () => finishSession({ save: true }));
      const cancel = createButton("Cancel", "tilia-track-editor-v2-action");
      cancel.disabled = !session;
      cancel.addEventListener("click", () => finishSession({ save: false }));
      primaryActions.append(start, save, cancel);
      root.appendChild(primaryActions);

      const historyActions = document.createElement("div");
      historyActions.className = "tilia-track-editor-v2-actions tilia-track-editor-v2-actions-history";
      const undo = createButton("Undo", "tilia-track-editor-v2-action");
      undo.disabled = !session?.history.canUndo();
      undo.addEventListener("click", () => applyHistory("undo"));
      const redo = createButton("Redo", "tilia-track-editor-v2-action");
      redo.disabled = !session?.history.canRedo();
      redo.addEventListener("click", () => applyHistory("redo"));
      historyActions.append(undo, redo);
      root.appendChild(historyActions);

      const selection = getSelection();
      const pointMeta = document.createElement("p");
      pointMeta.className = "tilia-track-editor-v2-point-meta";
      pointMeta.textContent = selection ? "Selected track point" : "No editable point selected";
      root.appendChild(pointMeta);
      root.appendChild(createPointForm(selection, applyFormPatch));
      return root;
    }

    const control = installMapControl({
      map,
      position,
      priority,
      className: "tilia-track-editor-v2-control",
      createContent() {
        const wrap = createPanel("tilia-control-panel-compact");
        const button = createButton("T2", "tilia-control-button-icon");
        button.title = "Track editor v2";
        button.setAttribute("aria-label", "Track editor v2");
        button.addEventListener("click", () => panel.togglePanel({
          panelId: "track-editor-v2",
          title: "Track Editor",
          render: buildPanelContent,
        }));
        wrap.appendChild(button);
        return wrap;
      },
    });

    const unsubscribeInteractions = app.subscribeInteractions({
      onTrackLayer({ entry, layer, trackIndex }) {
        const onClick = () => {
          if (!session) {
            selectedEntryId = entry.id;
            renderPanel();
            return;
          }
          activateTrack(entry, trackIndex);
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
    const onMapClick = () => session?.active?.layers.endEditing();
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

export default trackEditorV2Plugin;
