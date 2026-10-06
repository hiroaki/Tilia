import { builtins as defaultBuiltins } from "./builtins.js";
import { createBaseMap } from "./map/base.js";
import {
  createApplicationComposition,
  mergeBaseLayerOverrides,
} from "./application-composition.js";

export function createTiliaApp(options = {}) {
  return createApplicationComposition(options).app;
}

// High-level factory for the common case: create the Leaflet base map and attach Tilia to it.
export function createDefaultTiliaApp(container, options = {}) {
  const {
    builtins = defaultBuiltins,
    baseMapOptions = {},
    ...appOptions
  } = options;
  const baseLayerOverrides = mergeBaseLayerOverrides(
    baseMapOptions.baseLayerOverrides,
    appOptions.baseLayerOverrides,
  );
  const resolvedBaseMapOptions = baseLayerOverrides
    ? {
        ...baseMapOptions,
        baseLayerOverrides,
      }
    : baseMapOptions;
  const baseMap = createBaseMap(container, resolvedBaseMapOptions);
  return createTiliaApp({
    ...appOptions,
    builtins,
    map: baseMap.map,
    baseLayer: baseMap.baseLayer,
    baseLayers: baseMap.baseLayers,
    baseLayerOverrides,
    selectedBaseLayerId: baseMap.baseLayer?.id || null,
    tileLayer: baseMap.tileLayer,
  });
}
