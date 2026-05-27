import { DivIcon, Marker } from "leaflet";
import { createButton, createPanel, createSelect, installMapControl } from "../../src/map/controls.js";
import { cloneGpxSource, updateTrackPoint } from "../../src/gpx/source.js";

function getTrackEntries(core) {
  return core.state.entries.filter((entry) => entry.kind === "gpx");
}

function getEntryById(core, entryId) {
  return core.state.entries.find((entry) => entry.id === entryId) || null;
}

function getNearestTrackPointIndex(source, latlng) {
  const details = source?.trackPointDetails || [];
  if (!latlng || details.length === 0) {
    return -1;
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < details.length; index += 1) {
    const point = details[index];
    const deltaLat = point.lat - latlng.lat;
    const deltaLon = point.lon - latlng.lng;
    const distance = (deltaLat * deltaLat) + (deltaLon * deltaLon);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  return nearestIndex;
}

function formatIso(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return new Date(value).toISOString().slice(0, 16);
}

function parseIsoLocal(value) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function createEditorSourceName(sourceName = "track.gpx") {
  const suffix = " (edited)";
  if (sourceName.endsWith(".gpx")) {
    const base = sourceName.slice(0, -4);
    return `${base}${suffix}.gpx`;
  }
  return `${sourceName}${suffix}`;
}

export const trackEditorPlugin = {
  id: "x-track-editor",
  requires: ["tilia-panel", "tilia-status"],
  stylesheets: [
    new URL("./styles.css", import.meta.url).href,
  ],
  setup(app, options = {}) {
    const core = app.core;
    const map = app.getMap();
    const panel = app.services["tilia-panel"];
    const position = options.position || "topleft";
    const priority = options.priority || "normal";

    let activeSession = null;
    let selectedEntryId = null;
    let dragHandle = null;
    let dragActive = false;

    function setStatus(text) {
      app.setStatus?.(text);
    }

    function getDraftEntry() {
      if (!activeSession) {
        return null;
      }
      return getEntryById(core, activeSession.draftEntryId);
    }

    function clearDragHandle() {
      if (!dragHandle) {
        return;
      }
      dragHandle.remove();
      dragHandle = null;
      dragActive = false;
    }

    function syncDragHandle() {
      const draftEntry = getDraftEntry();
      if (!activeSession || !draftEntry) {
        clearDragHandle();
        return;
      }

      const point = draftEntry.source?.trackPointDetails?.[activeSession.selectedPointIndex] || null;
      if (!point) {
        clearDragHandle();
        return;
      }

      const latlng = [point.lat, point.lon];
      if (dragHandle && dragActive) {
        return;
      }

      if (!dragHandle) {
        dragHandle = new Marker(latlng, {
          draggable: true,
          keyboard: false,
          zIndexOffset: 1500,
          icon: new DivIcon({
            className: "tilia-track-editor-handle",
            html: "",
          }),
        });

        dragHandle.on("click", (event) => {
          event.originalEvent?.preventDefault?.();
          event.originalEvent?.stopPropagation?.();
          map.closePopup();
        });

        dragHandle.on("dragstart", () => {
          dragActive = true;
          map.closePopup();
        });

        dragHandle.on("drag", () => {
          map.closePopup();
        });

        dragHandle.on("dragend", () => {
          if (!activeSession) {
            dragActive = false;
            return;
          }

          const moved = dragHandle.getLatLng();
          updateDraftPoint(activeSession.selectedPointIndex, {
            lat: moved.lat,
            lon: moved.lng,
          });
          dragActive = false;
          setStatus("Track editor: moved selected point");
          panel.rerenderPanel("track-editor");
        });

        dragHandle.addTo(map);
      }

      dragHandle.setLatLng(latlng);
    }

    function ensureSelectedEntryId() {
      const tracks = getTrackEntries(core).filter((entry) => entry.id !== activeSession?.draftEntryId);
      if (tracks.length === 0) {
        selectedEntryId = null;
        return null;
      }
      if (tracks.some((entry) => entry.id === selectedEntryId)) {
        return selectedEntryId;
      }
      selectedEntryId = tracks[0].id;
      return selectedEntryId;
    }

    function updateDraftPoint(index, patch) {
      const draftEntry = getDraftEntry();
      if (!draftEntry) {
        return;
      }
      const nextSource = updateTrackPoint(draftEntry.source, index, patch);
      core.updateGpxSource(draftEntry.id, nextSource, { fitToView: false });
      syncDragHandle();
      app.refreshView();
    }

    function stopEditing({ keepDraft }) {
      if (!activeSession) {
        return;
      }

      const originalEntry = getEntryById(core, activeSession.originalEntryId);
      if (originalEntry) {
        core.setEntryVisibility(originalEntry.id, true);
      }

      if (!keepDraft) {
        core.removeEntry(activeSession.draftEntryId);
      }

      clearDragHandle();
      activeSession = null;
      app.refreshView();
      panel.rerenderPanel("track-editor");
    }

    function startEditing(entryId) {
      const originalEntry = getEntryById(core, entryId);
      if (!originalEntry || originalEntry.kind !== "gpx") {
        setStatus("Track editor: select a GPX track first");
        return;
      }
      if (activeSession) {
        stopEditing({ keepDraft: false });
      }

      const draftSource = cloneGpxSource(originalEntry.source);
      draftSource.name = createEditorSourceName(originalEntry.source?.name || `Layer ${originalEntry.id}`);
      const draftEntry = core.addGpxSource(draftSource, {
        fitToView: false,
        visible: true,
      });
      core.setEntryVisibility(originalEntry.id, false);

      activeSession = {
        originalEntryId: originalEntry.id,
        draftEntryId: draftEntry.id,
        selectedPointIndex: 0,
      };
      selectedEntryId = originalEntry.id;
      syncDragHandle();

      setStatus(`Track editor: editing ${draftSource.name}`);
      app.refreshView();
      panel.rerenderPanel("track-editor");
    }

    function buildEditorContent() {
      const root = document.createElement("div");
      root.className = "tilia-track-editor-panel";

      const intro = document.createElement("p");
      intro.className = "tilia-track-editor-intro";
      intro.textContent = "Create a working copy, edit track points, then save as a new layer.";
      root.appendChild(intro);

      const tracks = getTrackEntries(core).filter((entry) => entry.id !== activeSession?.draftEntryId);
      const selectedId = ensureSelectedEntryId();

      const sourceLabel = document.createElement("label");
      sourceLabel.className = "tilia-track-editor-label";
      sourceLabel.textContent = "Source track";
      root.appendChild(sourceLabel);

      const sourceSelect = createSelect(
        tracks.map((entry) => ({
          value: String(entry.id),
          label: entry.source?.name || `Layer ${entry.id}`,
          selected: entry.id === selectedId,
        })),
        "tilia-track-editor-select",
      );
      sourceSelect.disabled = activeSession != null;
      sourceSelect.addEventListener("change", () => {
        selectedEntryId = Number(sourceSelect.value);
      });
      root.appendChild(sourceSelect);

      const actions = document.createElement("div");
      actions.className = "tilia-track-editor-actions";

      const startButton = createButton("Start Edit", "tilia-track-editor-action");
      startButton.disabled = activeSession != null || selectedId == null;
      startButton.addEventListener("click", () => {
        startEditing(Number(sourceSelect.value));
      });
      actions.appendChild(startButton);

      const saveButton = createButton("Save Copy", "tilia-track-editor-action");
      saveButton.disabled = activeSession == null;
      saveButton.addEventListener("click", () => {
        if (!activeSession) {
          return;
        }
        stopEditing({ keepDraft: true });
        setStatus("Track editor: saved edited copy as a new layer");
      });
      actions.appendChild(saveButton);

      const cancelButton = createButton("Cancel", "tilia-track-editor-action");
      cancelButton.disabled = activeSession == null;
      cancelButton.addEventListener("click", () => {
        stopEditing({ keepDraft: false });
        setStatus("Track editor: discarded working copy");
      });
      actions.appendChild(cancelButton);

      root.appendChild(actions);

      const draftEntry = getDraftEntry();
      const details = draftEntry?.source?.trackPointDetails || [];
      const selectedPoint = details[activeSession?.selectedPointIndex || 0] || null;

      const pointMeta = document.createElement("div");
      pointMeta.className = "tilia-track-editor-point-meta";
      pointMeta.textContent = selectedPoint
        ? `Selected point #${(activeSession?.selectedPointIndex || 0) + 1} / ${details.length}`
        : "No point selected";
      root.appendChild(pointMeta);

      const latInput = document.createElement("input");
      latInput.type = "number";
      latInput.step = "0.000001";
      latInput.className = "tilia-control-select tilia-track-editor-input";
      latInput.value = selectedPoint ? String(selectedPoint.lat) : "";
      latInput.disabled = !selectedPoint;

      const lonInput = document.createElement("input");
      lonInput.type = "number";
      lonInput.step = "0.000001";
      lonInput.className = "tilia-control-select tilia-track-editor-input";
      lonInput.value = selectedPoint ? String(selectedPoint.lon) : "";
      lonInput.disabled = !selectedPoint;

      const eleInput = document.createElement("input");
      eleInput.type = "number";
      eleInput.step = "0.1";
      eleInput.className = "tilia-control-select tilia-track-editor-input";
      eleInput.value = selectedPoint?.elevation == null ? "" : String(selectedPoint.elevation);
      eleInput.disabled = !selectedPoint;

      const timeInput = document.createElement("input");
      timeInput.type = "datetime-local";
      timeInput.className = "tilia-control-select tilia-track-editor-input";
      timeInput.value = formatIso(selectedPoint?.timestamp);
      timeInput.disabled = !selectedPoint;

      const form = document.createElement("div");
      form.className = "tilia-track-editor-form";

      const latLabel = document.createElement("label");
      latLabel.className = "tilia-track-editor-label";
      latLabel.textContent = "Latitude";
      form.appendChild(latLabel);
      form.appendChild(latInput);

      const lonLabel = document.createElement("label");
      lonLabel.className = "tilia-track-editor-label";
      lonLabel.textContent = "Longitude";
      form.appendChild(lonLabel);
      form.appendChild(lonInput);

      const eleLabel = document.createElement("label");
      eleLabel.className = "tilia-track-editor-label";
      eleLabel.textContent = "Elevation (m)";
      form.appendChild(eleLabel);
      form.appendChild(eleInput);

      const timeLabel = document.createElement("label");
      timeLabel.className = "tilia-track-editor-label";
      timeLabel.textContent = "Timestamp";
      form.appendChild(timeLabel);
      form.appendChild(timeInput);

      root.appendChild(form);

      const pointActions = document.createElement("div");
      pointActions.className = "tilia-track-editor-actions";

      const applyButton = createButton("Apply Fields", "tilia-track-editor-action");
      applyButton.disabled = !selectedPoint;
      applyButton.addEventListener("click", () => {
        if (!activeSession || !selectedPoint) {
          return;
        }
        updateDraftPoint(activeSession.selectedPointIndex, {
          lat: Number(latInput.value),
          lon: Number(lonInput.value),
          elevation: eleInput.value === "" ? null : Number(eleInput.value),
          timestamp: parseIsoLocal(timeInput.value),
        });
        setStatus("Track editor: updated selected point");
        panel.rerenderPanel("track-editor");
      });
      pointActions.appendChild(applyButton);

      root.appendChild(pointActions);

      const dragHint = document.createElement("p");
      dragHint.className = "tilia-track-editor-hint";
      dragHint.textContent = selectedPoint
        ? "Drag the highlighted point handle on the map to move it."
        : "Select a point to enable drag editing.";
      root.appendChild(dragHint);

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
        button.addEventListener("click", () => {
          panel.togglePanel({
            panelId: "track-editor",
            title: "Track Editor",
            render: buildEditorContent,
          });
        });
        wrap.appendChild(button);
        return wrap;
      },
    });

    const unsubscribeInteractions = app.subscribeInteractions({
      onTrackLayer({ entry, layer }) {
        layer.on("click", (event) => {
          if (!activeSession) {
            selectedEntryId = entry.id;
            panel.rerenderPanel("track-editor");
            return;
          }
          if (entry.id !== activeSession.draftEntryId) {
            return;
          }

          const draftEntry = getDraftEntry();
          if (!draftEntry) {
            return;
          }
          const nextIndex = getNearestTrackPointIndex(draftEntry.source, event.latlng);
          if (nextIndex < 0) {
            return;
          }
          event.originalEvent?.preventDefault?.();
          event.originalEvent?.stopPropagation?.();
          map.closePopup();
          activeSession.selectedPointIndex = nextIndex;
          syncDragHandle();
          setStatus(`Track editor: selected point #${nextIndex + 1}`);
          panel.rerenderPanel("track-editor");
        });
      },
    });

    const onPopupOpen = () => {
      if (activeSession) {
        map.closePopup();
      }
    };
    map.on("popupopen", onPopupOpen);

    const removeRefreshHandler = app.addRefreshHandler(() => {
      if (activeSession && !getDraftEntry()) {
        activeSession = null;
        clearDragHandle();
      }
      syncDragHandle();
      panel.rerenderPanel("track-editor");
    });

    return {
      startEditing,
      cancelEditing() {
        stopEditing({ keepDraft: false });
      },
      saveEditing() {
        stopEditing({ keepDraft: true });
      },
      destroy() {
        map.off("popupopen", onPopupOpen);
        unsubscribeInteractions();
        removeRefreshHandler();
        control.remove?.();
        clearDragHandle();
        if (activeSession) {
          stopEditing({ keepDraft: false });
        }
      },
    };
  },
};

export default trackEditorPlugin;
