import { createDefaultTiliaApp } from "../../src/index.js";
import { GeoJSON } from "leaflet";

export function createEditorApp(phloemUrlBase) {
  return createDefaultTiliaApp("map", {
    plugins: [
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
