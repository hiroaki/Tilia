import { gpxQueryServiceKey } from "../contracts/gpx-query.js";
import { photoDomainKey } from "../../domains/index.js";
import { createPhotoProvider } from "./photo-provider.js";

export default Object.freeze({
  id: "tilia-photo-domain",
  setup(context, options) {
    context.domains.provide(photoDomainKey, createPhotoProvider({
      ...options,
      captureTimeline() {
        const query = context.services?.optional(gpxQueryServiceKey);
        return query?.captureTrackSources
          ? { sources: query.captureTrackSources() }
          : query?.captureTimeline() ?? { points: [] };
      },
    }));
  },
});
