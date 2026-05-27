import { createButton, createPanel, createSelect, installMapControl } from "../../src/map/controls.js";
import { serializeGpxSource } from "../../src/gpx/serialize.js";
import { makeFileName } from "./helpers.js";

function getTrackEntries(core) {
  return core.state.entries.filter((entry) => entry.kind === "gpx");
}

function ensureSelectedEntryId(core, selectedEntryId) {
  const tracks = getTrackEntries(core);
  if (tracks.length === 0) {
    return null;
  }
  if (tracks.some((entry) => entry.id === selectedEntryId)) {
    return selectedEntryId;
  }
  return tracks[0].id;
}

function downloadTextFile(fileName, text) {
  const blob = new Blob([text], { type: "application/gpx+xml" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

export const gpxExportPlugin = {
  id: "x-gpx-export",
  requires: ["tilia-panel", "tilia-status"],
  stylesheets: [
    new URL("./styles.css", import.meta.url).href,
  ],
  setup(app, options = {}) {
    const map = app.getMap();
    const core = app.core;
    const panel = app.services["tilia-panel"];
    const position = options.position || "topleft";
    const priority = options.priority || "normal";
    const creator = options.creator || "Tilia";

    let selectedEntryId = null;

    function renderPanel() {
      const root = document.createElement("div");
      root.className = "tilia-gpx-export-panel";

      const intro = document.createElement("p");
      intro.className = "tilia-gpx-export-intro";
      intro.textContent = "Export any GPX layer to a local .gpx file.";
      root.appendChild(intro);

      selectedEntryId = ensureSelectedEntryId(core, selectedEntryId);
      const tracks = getTrackEntries(core);
      const hasTracks = tracks.length > 0;

      const label = document.createElement("label");
      label.className = "tilia-gpx-export-label";
      label.textContent = "Layer";
      root.appendChild(label);

      const select = createSelect(
        tracks.map((entry) => ({
          value: String(entry.id),
          label: entry.source?.name || `Layer ${entry.id}`,
          selected: entry.id === selectedEntryId,
        })),
        "tilia-gpx-export-select",
      );
      select.disabled = !hasTracks;
      select.addEventListener("change", () => {
        selectedEntryId = Number(select.value);
      });
      root.appendChild(select);

      const exportButton = createButton("Export GPX", "tilia-gpx-export-action");
      exportButton.disabled = !hasTracks || selectedEntryId == null;
      exportButton.addEventListener("click", () => {
        const entry = core.state.entries.find((candidate) => candidate.id === selectedEntryId);
        if (!entry || entry.kind !== "gpx") {
          app.setStatus("GPX export: no GPX entry selected");
          return;
        }

        const text = serializeGpxSource(entry.source, { creator });
        const fileName = makeFileName(entry.source?.name || `track-${entry.id}`);
        downloadTextFile(fileName, text);
        app.setStatus(`GPX export: downloaded ${fileName}`);
      });
      root.appendChild(exportButton);

      return root;
    }

    const control = installMapControl({
      map,
      position,
      priority,
      className: "tilia-gpx-export-control",
      createContent() {
        const wrap = createPanel("tilia-control-panel-compact");
        const button = createButton("G", "tilia-control-button-icon");
        button.title = "GPX export";
        button.setAttribute("aria-label", "GPX export");
        button.addEventListener("click", () => {
          panel.togglePanel({
            panelId: "gpx-export",
            title: "GPX Export",
            render: renderPanel,
          });
        });
        wrap.appendChild(button);
        return wrap;
      },
    });

    const removeRefreshHandler = app.addRefreshHandler(() => {
      panel.rerenderPanel("gpx-export");
    });

    return {
      destroy() {
        removeRefreshHandler();
        control.remove?.();
      },
    };
  },
};

export default gpxExportPlugin;
