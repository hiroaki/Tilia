import { defineServiceKey } from "../../extensions/services.js";

// Internal connection between the built-in GPX renderer and Layers adapter.
export const gpxLayerColorKey = defineServiceKey({
  id: "tilia-gpx-layer-color",
  createFacade({ implementation, assertAvailable }) {
    return {
      get(entryId, target) { assertAvailable(); return implementation.get(entryId, target); },
      set(entryId, target, token, color) { assertAvailable(); return implementation.set(entryId, target, token, color); },
    };
  },
});
