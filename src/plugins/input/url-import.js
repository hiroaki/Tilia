import { DomEvent } from "leaflet";
import { processInputItems } from "./file-import.js";
import { createButton, createPanel, installMapControl } from "../../map/controls.js";
import {
  DEFAULT_URL_IMPORT_MAX_BYTES,
  DEFAULT_URL_IMPORT_TIMEOUT_MS,
  getContentLength,
  isSupportedRemoteGpxContent,
  parseHttpUrl,
  resolveRemoteFileName,
} from "../../core/input-utils.js";

function createTimeoutController(timeoutMs) {
  const controller = new AbortController();
  const timerId = window.setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs} ms`));
  }, timeoutMs);

  return {
    signal: controller.signal,
    dispose() {
      window.clearTimeout(timerId);
    },
  };
}

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

  const runImport = async () => {
    const rawUrl = String(urlInput.value || "").trim();
    if (!rawUrl) {
      onStatus("URL is empty");
      return;
    }

    const parsedUrl = parseHttpUrl(rawUrl);
    if (!parsedUrl) {
      onStatus("URL import failed: only http:// and https:// URLs are supported");
      return;
    }

    try {
      const timeoutController = createTimeoutController(timeoutMs);

      try {
        const response = await fetch(parsedUrl.toString(), {
          mode: "cors",
          signal: timeoutController.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const declaredLength = getContentLength(response);
        if (declaredLength !== null && declaredLength > maxBytes) {
          throw new Error(`Remote file is too large (${declaredLength} bytes > ${maxBytes} bytes)`);
        }

        const body = await response.blob();
        if (body.size > maxBytes) {
          throw new Error(`Remote file is too large (${body.size} bytes > ${maxBytes} bytes)`);
        }

        const fileName = resolveRemoteFileName(parsedUrl.toString(), response);
        const type = body.type || response.headers.get("content-type") || "application/gpx+xml";
        if (!isSupportedRemoteGpxContent(fileName, type)) {
          throw new Error(`Unsupported remote content type: ${type || "unknown"}`);
        }

        const file = new File([body], fileName, { type });

        await processInputItems({
          items: [file],
          registry,
          context,
          onStatus,
          onError,
          sourceLabel: "url",
          onItemLoaded,
        });
      } finally {
        timeoutController.dispose();
      }
    } catch (error) {
      onError(error);
      const detail = error instanceof TypeError
        ? "network error or CORS blocked the request"
        : error.message;
      onStatus(`URL import failed: ${detail}`);
    }
  };

  loadButton.addEventListener("click", runImport);
  urlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runImport();
    }
  });
}

function createUrlImportPanel({ map, registry, context, onStatus, onError, onItemLoaded, timeoutMs, maxBytes }) {
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

  map.getContainer().appendChild(panel);

  return {
    panel,
    focus() {
      queueMicrotask(() => {
        urlInput.focus();
      });
    },
  };
}

export function installUrlImportControl({
  map,
  registry,
  context,
  onStatus,
  onError,
  onItemLoaded,
  position = "topleft",
  timeoutMs = DEFAULT_URL_IMPORT_TIMEOUT_MS,
  maxBytes = DEFAULT_URL_IMPORT_MAX_BYTES,
}) {
  const floatingPanel = createUrlImportPanel({
    map,
    registry,
    context,
    onStatus,
    onError,
    onItemLoaded,
    timeoutMs,
    maxBytes,
  });

  installMapControl({
    map,
    position,
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
}
