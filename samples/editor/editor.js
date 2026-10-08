import { createDefaultTiliaApp } from "../../src/index.js";

export function createEditorApp(phloemUrlBase) {
  return createDefaultTiliaApp("map", {
    plugins: [
      "tilia-gpx-domain", "tilia-gpx-input", "tilia-gpx-renderer", "tilia-gpx-ui",
      "tilia-map-selection-presenter", "tilia-file-import",
      "tilia-panel",
      "tilia-status",
      "tilia-dropzone",
      "x-route-search",
      "tilia-layers",
      "x-track-editor",
      "x-gpx-export",
    ],
    pluginOptions: {
      "x-route-search": {
        endpoint: `${phloemUrlBase}/route`,
        defaultProfile: "car",
        profileOptions: ["car", "bike", "foot"]
      }
    }
  });
}
