import { DomEvent } from "leaflet";
import { processInputItems } from "./file-import.js";
import { createButton, createPanel, installMapControl } from "../../map/controls.js";

function fileNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.split("/").filter(Boolean);
    return path[path.length - 1] || "remote.gpx";
  } catch {
    return "remote.gpx";
  }
}

function parseHttpUrl(value) {
  try {
    const parsed = new URL(value, window.location.href);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function resolveRemoteFileName(url, response) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
  const candidate = match ? decodeURIComponent(match[1].replace(/"/g, "")) : fileNameFromUrl(url);
  const contentType = (response.headers.get("content-type") || "").toLowerCase();

  if (/\.gpx$/i.test(candidate)) {
    return candidate;
  }

  if (contentType.includes("gpx") || contentType.includes("xml")) {
    return `${candidate || "remote"}.gpx`;
  }

  return candidate || "remote.gpx";
}

export function installUrlImportPlugin({ urlInput, loadButton, registry, context, onStatus, onError, onItemLoaded }) {
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
      const response = await fetch(parsedUrl.toString(), { mode: "cors" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = await response.blob();
      const fileName = resolveRemoteFileName(parsedUrl.toString(), response);
      const type = body.type || "application/gpx+xml";
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

function createUrlImportPanel({ map, registry, context, onStatus, onError, onItemLoaded }) {
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

export function installUrlImportControl({ map, registry, context, onStatus, onError, onItemLoaded, position = "topleft" }) {
  const floatingPanel = createUrlImportPanel({
    map,
    registry,
    context,
    onStatus,
    onError,
    onItemLoaded,
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
