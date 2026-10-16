import { builtins as defaultBuiltins } from "./builtins.js";
import { createBaseMap } from "./map/base.js";
import {
  createApplicationComposition,
  mergeBaseLayerOverrides,
} from "./application-composition.js";

// Sole public application factory. The container is borrowed; the Map is owned.
export function createDefaultTiliaApp(container, options = {}) {
  if (Object.hasOwn(options, "map")) throw new TypeError("External Map initialization is not supported");
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
  return createApplicationComposition({
    ...appOptions,
    builtins,
    map: baseMap.map,
    baseLayer: baseMap.baseLayer,
    baseLayers: baseMap.baseLayers,
    baseLayerOverrides,
    selectedBaseLayerId: baseMap.baseLayer?.id || null,
    tileLayer: baseMap.tileLayer,
  }, { removeMap: () => baseMap.map.remove() }).app;
}
