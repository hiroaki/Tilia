import { createDefaultTiliaApp } from "../../../src/index.js";
const composition = { app: createDefaultTiliaApp("map", { baseMapOptions: { center: [35.68,139.76], zoom: 13 }, plugins: [
  "tilia-gpx-input", "tilia-gpx-renderer", "tilia-gpx-ui", "tilia-map-selection-presenter",
  "tilia-file-import", "tilia-layers", "tilia-settings", "x-gpx-export", "x-route-search", "x-track-editor", "x-milestone",
] }) };
await composition.app.ready;
const map = composition.app.map;
let context;
await composition.app.use({ id: "x-phase4j-observer", setup(value) { context = value; } });
window.phase4j = { app: composition.app, map, context };
document.body.dataset.phase4jReady = "true";
