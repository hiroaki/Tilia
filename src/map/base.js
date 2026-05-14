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
  Object.freeze({
    id: "gsi-std",
    label: "GSI Standard",
    provider: "gsi",
    category: "street",
    url: "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
    options: {
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">GSI Tiles</a>',
    },
    attributionLabel: "GSI Tiles",
    isDefault: false,
    visibleInSelector: true,
  }),
  Object.freeze({
    id: "gsi-pale",
    label: "GSI Pale",
    provider: "gsi",
    category: "street",
    url: "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
    options: {
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">GSI Tiles</a>',
    },
    attributionLabel: "GSI Tiles",
    isDefault: false,
    visibleInSelector: true,
  }),
]);

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
} = {}) {
  if (!map) {
    throw new Error("createBaseLayerManager requires a Leaflet map");
  }

  const registry = new Map();
  let activeLayer = currentLayer;
  let activeDefinition = currentDefinition ? normalizeBaseLayerDefinition(currentDefinition) : null;

  function register(definition) {
    const normalized = normalizeBaseLayerDefinition(definition);
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

  if (!activeDefinition && !activeLayer) {
    const initialBaseLayerId = selectedBaseLayerId
      || Array.from(registry.values()).find((definition) => definition.isDefault)?.id
      || registry.keys().next().value
      || null;

    if (initialBaseLayerId) {
      select(initialBaseLayerId);
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
  if (Array.isArray(options.baseLayers) && options.baseLayers.length > 0) {
    return options.baseLayers;
  }

  if (typeof options.tileUrl === "string" && options.tileUrl.trim()) {
    return [{
      ...defaultBaseLayerDefinition,
      url: options.tileUrl.trim(),
      options: {
        ...defaultBaseLayerDefinition.options,
        ...(options.tileOptions && typeof options.tileOptions === "object" ? options.tileOptions : {}),
      },
    }];
  }

  return defaultBaseLayerDefinitions;
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
