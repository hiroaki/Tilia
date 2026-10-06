import { gpxDomainKey } from "../../domains/index.js";
import { createGpxProvider } from "./gpx-provider.js";

export default Object.freeze({
  id: "tilia-gpx-domain",
  setup(context) {
    context.domains.provide(gpxDomainKey, createGpxProvider());
  },
});
