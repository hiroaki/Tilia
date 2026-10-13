import { createApplicationComposition } from "../../../src/application-composition.js";
import { createBaseMap } from "../../../src/map/base.js";
const { map } = createBaseMap("map");
const created = [], revoked = [];
const optional = new URL(location.href).searchParams.has("optional");
const fixture = createApplicationComposition({ map, plugins: optional ? ["tilia-status", "tilia-base-maps-control"] : [
  "tilia-status", "tilia-base-maps-control", "tilia-photo-domain", "tilia-photo-renderer",
  "tilia-jpeg-input", "tilia-photo-ui", "tilia-map-selection-presenter", "tilia-layers", "tilia-settings", "tilia-file-import",
], pluginOptions: { "tilia-photo-domain": {
  createObjectURL(blob) { const url = URL.createObjectURL(blob); created.push(url); return url; },
  revokeObjectURL(url) { revoked.push(url); URL.revokeObjectURL(url); },
} } });
await fixture.app.ready;
const app = fixture.app;
let presentation;
await app.use({ id: "x-phase4g-observer", setup(context) { presentation = context.presentation; } });
window.phase4g = { app, map, created, revoked,
  ringCount() { let count = 0; map.eachLayer((layer) => { if (layer.options?.radius === 18) count++; }); return count; },
  handle: (id) => presentation.resolve(id, { kind: "photo" }),
  terminateRendering: () => fixture.foundations.rendering.close(),
};
document.body.dataset.phase4gReady = "true";
