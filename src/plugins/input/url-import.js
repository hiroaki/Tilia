import { DomEvent } from "leaflet";
import { createButton, createPanel, installMapControl } from "../../map/controls.js";
import { TILIA_CONTROL_PRIORITY, TILIA_UI_LAYER } from "../../ui/protocol.js";
import { importRemoteUrl } from "../../core/remote-url-import.js";
import {
  DEFAULT_URL_IMPORT_MAX_BYTES,
  DEFAULT_URL_IMPORT_TIMEOUT_MS,
} from "../../core/input-utils.js";

export function installUrlImportPlugin({
  urlInput,
  loadButton,
  registry,
  context,
  onStatus,
  onError,
  onItemLoaded,
  timeoutMs = DEFAULT_URL_IMPORT_TIMEOUT_MS,
  maxBytes = DEFAULT_URL_IMPORT_MAX_BYTES,
}) {
  if (!urlInput || !loadButton) {
    return;
  }

  const runImport = () =>
    importRemoteUrl({
      url: urlInput.value,
      registry,
      context,
      onStatus,
      onError,
      onItemLoaded,
      timeoutMs,
      maxBytes,
    });

  loadButton.addEventListener("click", runImport);
  urlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runImport();
    }
  });
}

function createUrlImportPanel({ map, surfaces = null, registry, context, onStatus, onError, onItemLoaded, timeoutMs, maxBytes }) {
  const panel = createPanel("tilia-url-floating-panel tilia-url-floating-panel-hidden");
  const form = createPanel("tilia-url-box");
  const urlInput = document.createElement("input");
  urlInput.className = "tilia-url-input";
  urlInput.type = "url";
  urlInput.placeholder = "https://example.com/track.gpx";

  const loadButton = createButton("Load", "tilia-url-load-button");
  const closeButton = createButton("Close", "tilia-url-close-button");
  closeButton.addEventListener("click", () => {
    panel.classList.add("tilia-url-floating-panel-hidden");
  });

  form.appendChild(urlInput);
  form.appendChild(loadButton);
  form.appendChild(closeButton);
  panel.appendChild(form);

  installUrlImportPlugin({
    urlInput,
    loadButton,
    registry,
    context,
    onStatus,
    onError,
    onItemLoaded,
    timeoutMs,
    maxBytes,
  });

  for (const eventName of ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup"]) {
    DomEvent.on(panel, eventName, DomEvent.stopPropagation);
  }
  DomEvent.on(panel, "dblclick", DomEvent.preventDefault);
  DomEvent.disableScrollPropagation(panel);

  const mountedSurface = surfaces?.mount({
    id: "tilia-url-import-floating-panel",
    surface: TILIA_UI_LAYER.floating,
    element: panel,
    priority: TILIA_CONTROL_PRIORITY.high,
  });
  if (!mountedSurface) {
    map.getContainer().appendChild(panel);
  }

  return {
    panel,
    destroy() {
      mountedSurface?.unmount?.();
      panel.remove?.();
    },
    focus() {
      queueMicrotask(() => {
        urlInput.focus();
      });
    },
  };
}

export function installUrlImportControl({
  map,
  surfaces = null,
  registry,
  context,
  onStatus,
  onError,
  onItemLoaded,
  position = "topleft",
  priority = "normal",
  timeoutMs = DEFAULT_URL_IMPORT_TIMEOUT_MS,
  maxBytes = DEFAULT_URL_IMPORT_MAX_BYTES,
}) {
  const floatingPanel = createUrlImportPanel({
    map,
    surfaces,
    registry,
    context,
    onStatus,
    onError,
    onItemLoaded,
    timeoutMs,
    maxBytes,
  });

  const control = installMapControl({
    map,
    position,
    priority,
    className: "tilia-url-import-control",
    createContent() {
      const wrap = createPanel("tilia-control-panel-compact");
      const button = createButton("U", "tilia-control-button-icon");
      button.title = "Load URL";
      button.setAttribute("aria-label", "Load URL");
      button.addEventListener("click", () => {
        const isHidden = floatingPanel.panel.classList.contains("tilia-url-floating-panel-hidden");
        floatingPanel.panel.classList.toggle("tilia-url-floating-panel-hidden", !isHidden);
        if (isHidden) {
          floatingPanel.focus();
        }
      });
      wrap.appendChild(button);
      return wrap;
    },
  });

  return {
    control,
    destroy() {
      floatingPanel.destroy();
      control.remove?.();
    },
  };
}
