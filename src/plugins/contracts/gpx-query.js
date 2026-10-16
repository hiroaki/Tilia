import { defineServiceKey } from "../../extensions/services.js";
export const gpxQueryServiceKey = defineServiceKey({
  id: "tilia-gpx-query",
  validate: (value) => typeof value?.captureTimeline === "function",
  createFacade({ implementation, assertAvailable }) {
    return { captureTimeline() { assertAvailable(); return implementation.captureTimeline(); } };
  },
});
