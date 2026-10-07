import { gpxQueryServiceKey } from "../contracts/gpx-query.js";
import { photoDomainKey } from "../../domains/index.js";
import { createPhotoProvider } from "./photo-provider.js";

export default Object.freeze({
  id: "tilia-photo-domain",
  setup(context, options) {
    context.domains.provide(photoDomainKey, createPhotoProvider({ ...options, captureTimeline: () => context.services?.optional(gpxQueryServiceKey)?.captureTimeline() ?? { points: [] } }));
  },
});
