import { captureGpxTimeline } from "../../gpx/queries.js";
import { gpxQueryServiceKey } from "../contracts/gpx-query.js";
import { gpxDomainKey } from "../../domains/index.js";
import { createGpxProvider } from "./gpx-provider.js";

export default Object.freeze({
  id: "tilia-gpx-domain",
  setup(context) {
    context.domains.provide(gpxDomainKey, createGpxProvider());
    context.services?.provide(gpxQueryServiceKey, {
      captureTimeline() {
        const gpx = context.domains.require(gpxDomainKey);
        return captureGpxTimeline(context.entries.list().filter((entry) => entry.domain === gpxDomainKey).map((entry) => gpx.get(entry.id)));
      },
    });
  },
});
