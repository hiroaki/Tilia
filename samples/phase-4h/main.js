import { Polyline } from "leaflet";
import { createApplicationComposition } from "../../src/application-composition.js";
import { createBaseMap } from "../../src/map/base.js";
import { gpxQueryServiceKey } from "../../src/plugins/contracts/gpx-query.js";
const { map } = createBaseMap("map");
const created = [], revoked = [];
const fixture = createApplicationComposition({ map, plugins: [
  "tilia-status", "tilia-base-maps-control", "tilia-gpx-domain", "tilia-gpx-renderer", "tilia-gpx-input", "tilia-gpx-ui",
  "tilia-photo-domain", "tilia-photo-renderer", "tilia-jpeg-input", "tilia-photo-ui",
  "tilia-map-selection-presenter", "tilia-layers", "tilia-settings", "tilia-file-import",
], pluginOptions: { "tilia-photo-domain": {
  createObjectURL(blob) { const url = URL.createObjectURL(blob); created.push(url); return url; },
  revokeObjectURL(url) { revoked.push(url); URL.revokeObjectURL(url); },
} } });
await fixture.app.ready;
let context;
await fixture.app.use({ id: "x-phase4h-observer", setup(value) { context = value; } });
window.phase4h = { app: fixture.app, map, created, revoked, context, Polyline,
  timeline: () => context.services.optional(gpxQueryServiceKey)?.captureTimeline() ?? { points: [] },
  handle: (id, ref) => context.presentation.resolve(id, ref),
  terminateRendering: () => fixture.foundations.rendering.close(),
};
document.body.dataset.phase4hReady = "true";
