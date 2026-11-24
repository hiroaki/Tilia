import { gpxDomainKey } from "../../domains/keys.js";
import { gpxLayerColorKey } from "../contracts/gpx-layer-color.js";
import { createGpxLayerColors } from "../../gpx/layer-colors.js";
import { createGpxRenderer } from "../../gpx/renderer.js";
export default Object.freeze({ id: "tilia-gpx-renderer", requires: ["tilia-gpx-domain"], setup(context) {
  context.domains.require(gpxDomainKey);
  context.styles.use({ id: "tilia-gpx", href: new URL("../../gpx/styles.css", import.meta.url).href });
  const colors = createGpxLayerColors(context);
  context.services.provide(gpxLayerColorKey, colors);
  context.renderers.register(gpxDomainKey, createGpxRenderer(colors));
} });
