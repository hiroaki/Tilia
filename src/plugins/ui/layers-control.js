import { createButton, createPanel, createSelect, installMapControl } from "../../map/controls.js";
import { createPhotoThumbnailNode } from "../../map/layers.js";

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

function createLayerToggle(entry, onVisibilityChange) {
  const label = document.createElement("label");
  label.className = "tilia-layer-toggle";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = entry.visible !== false;
  checkbox.addEventListener("change", () => {
    onVisibilityChange(entry, checkbox.checked);
  });

  const text = document.createElement("span");
  text.className = "tilia-layer-name";
  text.textContent = entry.source?.name || `Layer ${entry.id}`;

  label.appendChild(checkbox);
  label.appendChild(text);
  return label;
}

function createPhotoModeField(entry, onModeChange) {
  if (entry.kind !== "photo" || !entry.photoOriginal || entry.photoOriginal.hasGps) {
    return null;
  }

  const wrap = document.createElement("div");
  wrap.className = "tilia-layer-option";

  const caption = document.createElement("span");
  caption.className = "tilia-layer-option-label";
  caption.textContent = "Photo time";

  const select = createSelect([
    { value: "local", label: "Local", selected: entry.photoTimeMode === "local" },
    { value: "jst", label: "JST", selected: entry.photoTimeMode === "jst" },
    { value: "utc", label: "UTC", selected: entry.photoTimeMode === "utc" },
  ], "tilia-layer-mode-select");
  select.addEventListener("change", async () => {
    await onModeChange(entry, select.value);
  });

  wrap.appendChild(caption);
  wrap.appendChild(select);
  return wrap;
}

function createLayerMeta(entry) {
  const meta = document.createElement("div");
  meta.className = "tilia-layer-meta";

  if (entry.kind === "photo") {
    meta.textContent = [
      formatDateTime(entry.source?.dateTimeOriginal),
      entry.source?.locationSource || "-",
    ].join(" / ");
    return meta;
  }

  if (entry.kind === "gpx") {
    const trackPoints = entry.source?.trackPoints?.length || 0;
    const waypoints = entry.source?.waypoints?.length || 0;
    meta.textContent = `${trackPoints} track points / ${waypoints} waypoints`;
    return meta;
  }

  meta.textContent = entry.kind || "layer";
  return meta;
}

function createLayerCard(entry, handlers) {
  const item = document.createElement("li");
  item.className = "tilia-layer-item";

  const card = document.createElement("div");
  card.className = "tilia-layer-card";
  card.title = "Double-click to fit this layer on the map";
  card.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.target instanceof HTMLElement && event.target.closest("input, select, option, button")) {
      return;
    }
    handlers.onFit(entry);
  });

  const body = document.createElement("div");
  body.className = "tilia-layer-card-body";

  const header = document.createElement("div");
  header.className = "tilia-layer-header";
  header.appendChild(createLayerToggle(entry, handlers.onVisibilityChange));

  const deleteButton = createButton("x", "tilia-layer-delete-button");
  deleteButton.title = `Remove ${entry.source?.name || `Layer ${entry.id}`}`;
  deleteButton.setAttribute("aria-label", `Remove ${entry.source?.name || `Layer ${entry.id}`}`);
  deleteButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handlers.onDelete(entry);
  });
  header.appendChild(deleteButton);

  body.appendChild(header);
  body.appendChild(createLayerMeta(entry));

  const modeField = createPhotoModeField(entry, handlers.onModeChange);
  if (modeField) {
    body.appendChild(modeField);
  }

  card.appendChild(body);

  const thumbnail = entry.kind === "photo"
    ? createPhotoThumbnailNode(entry.source, "tilia-layer-thumbnail")
    : null;
  if (thumbnail) {
    card.classList.add("tilia-layer-card-with-thumbnail");
    card.appendChild(thumbnail);
  }

  item.appendChild(card);
  return item;
}

export function installLayersControl({ map, core, panel, onStatus, onError, onEntriesChanged = null, position = "topleft" }) {
  let listNode = null;
  let clearAllButton = null;

  function buildLayerContent() {
    const content = document.createElement("div");
    content.className = "tilia-layers-panel-content";

    const intro = document.createElement("p");
    intro.className = "tilia-settings-panel-text";
    intro.textContent = "Layers panel: show or hide layers, and adjust photo time interpretation where needed.";

    const actions = document.createElement("div");
    actions.className = "tilia-layer-actions";

    clearAllButton = createButton("Delete all", "tilia-layer-clear-button");
    clearAllButton.addEventListener("click", () => {
      if (core.state.entries.length === 0) {
        return;
      }
      core.clearAll();
      onEntriesChanged?.();
      render();
      onStatus("Cleared all layers and sources");
    });
    actions.appendChild(clearAllButton);

    listNode = document.createElement("ul");
    listNode.className = "tilia-layer-list";

    content.appendChild(intro);
    content.appendChild(actions);
    content.appendChild(listNode);
    render();
    return content;
  }

  function render() {
    if (!listNode) {
      return;
    }

    if (clearAllButton) {
      clearAllButton.disabled = core.state.entries.length === 0;
    }

    listNode.innerHTML = "";
    if (core.state.entries.length === 0) {
      const empty = document.createElement("li");
      empty.className = "tilia-layer-item tilia-layer-empty";
      empty.textContent = "No layers";
      listNode.appendChild(empty);
      return;
    }

    for (const entry of core.state.entries) {
      listNode.appendChild(createLayerCard(entry, {
        onVisibilityChange(targetEntry, visible) {
          core.setEntryVisibility(targetEntry.id, visible);
        },
        onDelete(targetEntry) {
          const removed = core.removeEntry(targetEntry.id);
          onEntriesChanged?.();
          render();
          if (removed) {
            onStatus(`Removed ${removed.source?.name || `Layer ${removed.id}`}`);
          }
        },
        onFit(targetEntry) {
          core.fitEntryToView(targetEntry.id);
          onStatus(`Fitted ${targetEntry.source?.name || `Layer ${targetEntry.id}`} to map view`);
        },
        async onModeChange(targetEntry, mode) {
          try {
            core.updatePhotoTimeMode(targetEntry.id, mode);
            onEntriesChanged?.();
            render();
            onStatus(`Updated ${targetEntry.source.name} photo time mode to ${mode.toUpperCase()}`);
          } catch (error) {
            onError(error);
            onStatus(`Failed to update ${targetEntry.source.name}: ${error.message}`);
            render();
          }
        },
      }));
    }
  }

  installMapControl({
    map,
    position,
    className: "tilia-layers-control",
    createContent() {
      const wrap = createPanel("tilia-control-panel-compact");
      const button = createButton("L", "tilia-control-button-icon");
      button.title = "Layers";
      button.setAttribute("aria-label", "Layers");
      button.addEventListener("click", () => {
        panel.togglePanel({
          panelId: "layers",
          title: "Layers",
          render: buildLayerContent,
        });
      });
      wrap.appendChild(button);
      return wrap;
    },
  });

  core.subscribeInteractions({
    onWaypointLayer({ entry, waypoint, layer }) {
      layer.on("click", () => {
        core.selectWaypoint(entry, waypoint);
        onStatus(`Selected waypoint ${waypoint?.name || entry.source.name}`);
      });
    },
    onPhotoMarker({ entry, layer }) {
      layer.on("click", () => {
        core.selectPhoto(entry);
        onStatus(`Selected photo ${entry.source.name}`);
      });
    },
  });

  return { render };
}