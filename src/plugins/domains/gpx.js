import { captureGpxTimeline } from "../../gpx/queries.js";
import { gpxQueryServiceKey } from "../contracts/gpx-query.js";
import { gpxDomainKey } from "../../domains/index.js";
import { createGpxProvider } from "./gpx-provider.js";

export default Object.freeze({
  id: "tilia-gpx-domain",
  setup(context, options) {
    context.domains.provide(gpxDomainKey, createGpxProvider(options));
    const views = () => {
      const gpx = context.domains.require(gpxDomainKey);
      return context.entries.list().filter(entry => entry.domain === gpxDomainKey).map(entry => gpx.get(entry.id));
    };
    context.services?.provide(gpxQueryServiceKey, {
      captureTimeline() {
        return captureGpxTimeline(views());
      },
      captureTrackSources() {
        return Object.freeze(views().map(view => view.snapshot.data));
      },
    });
  },
});
