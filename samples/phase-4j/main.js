import { Map } from "leaflet";
import { createApplicationComposition } from "../../src/application-composition.js";
const map = new Map("map").setView([35.68,139.76], 13);
const composition = createApplicationComposition({ map, plugins: [
  "tilia-gpx-input", "tilia-gpx-renderer", "tilia-gpx-ui", "tilia-map-selection-presenter",
  "tilia-file-import", "tilia-layers", "tilia-settings", "x-gpx-export",
] });
await composition.app.ready;
let context;
await composition.app.use({ id: "x-phase4j-observer", setup(value) { context = value; } });
window.phase4j = { app: composition.app, map, context };
document.body.dataset.phase4jReady = "true";
