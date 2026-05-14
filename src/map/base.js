import { Map as LeafletMap, TileLayer } from "leaflet";

export const defaultBaseLayerDefinition = Object.freeze({
  id: "osm",
  label: "OpenStreetMap",
  provider: "osm",
  category: "street",
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  options: {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  attributionLabel: "OpenStreetMap",
  isDefault: true,
  visibleInSelector: true,
});

export const defaultBaseLayerDefinitions = Object.freeze([
  defaultBaseLayerDefinition,
]);

function applyBaseLayerOverride(definition, override) {
  if (!override || typeof override !== "object") {
    return definition;
  }

  return {
    ...definition,
    ...override,
    id: definition.id,
    options: override.options && typeof override.options === "object"
      ? {
        ...(definition.options && typeof definition.options === "object" ? definition.options : {}),
        ...override.options,
      }
      : definition.options,
  };
}

function applyBaseLayerOverrides(definitions, overrides) {
  if (!overrides || typeof overrides !== "object") {
    return definitions;
  }

  return definitions.map((definition) => applyBaseLayerOverride(definition, getBaseLayerOverride(overrides, definition)));
}

function getBaseLayerOverride(overrides, definition) {
  if (!overrides || typeof overrides !== "object" || !definition || typeof definition !== "object") {
    return null;
  }

  const id = typeof definition.id === "string" ? definition.id.trim() : "";
  return id ? overrides[id] : null;
}

function cloneBaseLayerDefinition(definition) {
  if (!definition) {
    return null;
  }

  return {
    ...definition,
    options: definition.options ? { ...definition.options } : {},
  };
}

export function normalizeBaseLayerDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    throw new Error("Base layer definitions must be objects");
  }

  const id = typeof definition.id === "string" ? definition.id.trim() : "";
  if (!id) {
    throw new Error("Base layer definitions must include an id");
  }

  const url = typeof definition.url === "string" ? definition.url.trim() : "";
  if (!url) {
    throw new Error(`Base layer \"${id}\" must include a url`);
  }

  return {
    id,
    label: typeof definition.label === "string" && definition.label.trim()
      ? definition.label.trim()
      : id,
    provider: typeof definition.provider === "string" && definition.provider.trim()
      ? definition.provider.trim()
      : "custom",
    category: typeof definition.category === "string" && definition.category.trim()
      ? definition.category.trim()
      : "general",
    url,
    options: definition.options && typeof definition.options === "object"
      ? { ...definition.options }
      : {},
    attributionLabel: typeof definition.attributionLabel === "string" && definition.attributionLabel.trim()
      ? definition.attributionLabel.trim()
      : null,
    isDefault: definition.isDefault === true,
    visibleInSelector: definition.visibleInSelector !== false,
  };
}

export function createTileLayer(definition) {
  const normalized = normalizeBaseLayerDefinition(definition);
  return new TileLayer(normalized.url, {
    maxZoom: 19,
    ...normalized.options,
  });
}

export function createBaseLayerManager({
  map,
  definitions = [],
  currentLayer = null,
  currentDefinition = null,
  selectedBaseLayerId = null,
  overrides = null,
} = {}) {
  if (!map) {
    throw new Error("createBaseLayerManager requires a Leaflet map");
  }

  const registry = new Map();
  let activeLayer = currentLayer;
  let activeDefinition = currentDefinition
    ? normalizeBaseLayerDefinition(applyBaseLayerOverride(currentDefinition, getBaseLayerOverride(overrides, currentDefinition)))
    : null;

  function register(definition) {
    const normalized = normalizeBaseLayerDefinition(
      applyBaseLayerOverride(definition, getBaseLayerOverride(overrides, definition)),
    );

    if (registry.has(normalized.id)) {
      throw new Error(`Base layer already registered: ${normalized.id}`);
    }

    registry.set(normalized.id, normalized);
    return cloneBaseLayerDefinition(normalized);
  }

  function registerMany(entries = []) {
    return entries.map((entry) => register(entry));
  }

  function list() {
    return Array.from(registry.values(), (definition) => cloneBaseLayerDefinition(definition));
  }

  function listVisible() {
    return list().filter((definition) => definition.visibleInSelector !== false);
  }

  function get(id) {
    const definition = registry.get(id);
    return definition ? cloneBaseLayerDefinition(definition) : null;
  }

  function has(id) {
    return registry.has(id);
  }

  function getCurrent() {
    return cloneBaseLayerDefinition(activeDefinition);
  }

  function getCurrentLayer() {
    return activeLayer;
  }

  function select(id) {
    const definition = registry.get(id);
    if (!definition) {
      throw new Error(`Unknown base layer: ${id}`);
    }

    if (activeDefinition?.id === definition.id && activeLayer) {
      return {
        definition: cloneBaseLayerDefinition(activeDefinition),
        layer: activeLayer,
      };
    }

    const nextLayer = createTileLayer(definition);
    activeLayer?.remove?.();
    nextLayer.addTo(map);
    activeLayer = nextLayer;
    activeDefinition = definition;
    return {
      definition: cloneBaseLayerDefinition(definition),
      layer: nextLayer,
    };
  }

  registerMany(definitions);

  const initialBaseLayerId = selectedBaseLayerId
    || activeDefinition?.id
    || Array.from(registry.values()).find((definition) => definition.isDefault)?.id
    || registry.keys().next().value
    || null;

  if (!activeDefinition && initialBaseLayerId) {
    activeDefinition = registry.get(initialBaseLayerId) || null;
  }

  if (!activeLayer && activeDefinition) {
    const nextLayer = createTileLayer(activeDefinition);
    nextLayer.addTo(map);
    activeLayer = nextLayer;
  }

  if (!activeDefinition && !activeLayer && initialBaseLayerId) {
    select(initialBaseLayerId);
  }

  if (!activeDefinition && activeLayer && selectedBaseLayerId) {
    const selectedDefinition = registry.get(selectedBaseLayerId);
    if (selectedDefinition) {
      activeDefinition = selectedDefinition;
    }
  }

  return {
    register,
    registerMany,
    list,
    listVisible,
    get,
    has,
    getCurrent,
    getCurrentLayer,
    select,
  };
}

function resolveBaseLayerDefinitions(options) {
  let definitions = null;
  const tileUrl = typeof options.tileUrl === "string" ? options.tileUrl.trim() : "";
  const tileOptions = options.tileOptions && typeof options.tileOptions === "object"
    ? options.tileOptions
    : null;

  if (Array.isArray(options.baseLayers) && options.baseLayers.length > 0) {
    definitions = options.baseLayers;
  }

  if (!definitions && (tileUrl || tileOptions)) {
    const resolvedUrl = tileUrl || defaultBaseLayerDefinition.url;
    const useDefaultOsmMetadata = resolvedUrl === defaultBaseLayerDefinition.url;
    definitions = [{
      ...(useDefaultOsmMetadata
        ? defaultBaseLayerDefinition
        : {
          ...defaultBaseLayerDefinition,
          id: "custom",
          label: "Custom",
          provider: "custom",
          category: "general",
          attributionLabel: null,
        }),
      url: resolvedUrl,
      options: useDefaultOsmMetadata
        ? {
          ...defaultBaseLayerDefinition.options,
          ...(tileOptions || {}),
        }
        : (tileOptions ? { ...tileOptions } : {}),
    }];
  }

  return applyBaseLayerOverrides(definitions || defaultBaseLayerDefinitions, options.baseLayerOverrides);
}

// Create a reusable Leaflet base map without coupling it to the Tilia runtime.
export function createBaseMap(containerId, options = {}) {
  const {
    mapOptions = {},
    center = [35.681236, 139.767125],
    zoom = 10,
    selectedBaseLayerId = null,
  } = options;

  const map = new LeafletMap(containerId, {
    closePopupOnClick: false,
    zoomControl: true,
    ...mapOptions,
  });

  map.setView(center, zoom);

  const baseLayerManager = createBaseLayerManager({
    map,
    definitions: resolveBaseLayerDefinitions(options),
    selectedBaseLayerId,
  });

  return {
    map,
    tileLayer: baseLayerManager.getCurrentLayer(),
    baseLayer: baseLayerManager.getCurrent(),
    baseLayers: baseLayerManager.list(),
    baseLayerManager,
  };
}
