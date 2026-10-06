import { createTiliaCore } from "./core/boot.js";
import { setError as setStateError } from "./core/state.js";
import { builtins as defaultBuiltins } from "./builtins.js";
import { createBaseLayerManager, createBaseMap } from "./map/base.js";
import { createButton, createPanel, createSelect, installMapControl } from "./map/controls.js";
import { ensureBuiltinUiStyles, registerStylesheet } from "./ui/styles.js";
import { createUiSurfaceManager } from "./ui/surfaces.js";
import { createPluginRuntime } from "./plugins/runtime/index.js";
import { getPhase4bPluginClassification } from "./plugins/migration-allowlist.js";

function normalizeConfiguredPlugin(entry, pluginOptionsMap) {
  if (typeof entry === "string") {
    return {
      plugin: entry,
      options: pluginOptionsMap?.[entry] || {},
    };
  }

  if (Array.isArray(entry) && entry.length > 0) {
    return {
      plugin: entry[0],
      options: entry[1] || {},
    };
  }

  if (entry && typeof entry === "object" && entry.plugin) {
    return {
      plugin: entry.plugin,
      options: entry.options || {},
    };
  }

  throw new Error("Configured plugins must be a string, [plugin, options], or { plugin, options }");
}

function mergeBaseLayerOverrides(baseMapOverrides, appOverrides) {
  const sources = [baseMapOverrides, appOverrides].filter((value) => value && typeof value === "object");
  if (sources.length === 0) {
    return null;
  }

  const merged = {};
  for (const source of sources) {
    for (const [id, override] of Object.entries(source)) {
      if (!override || typeof override !== "object") {
        merged[id] = override;
        continue;
      }

      const previous = merged[id];
      const previousOptions = previous && typeof previous === "object" && previous.options && typeof previous.options === "object"
        ? previous.options
        : null;
      const nextOptions = override.options && typeof override.options === "object"
        ? override.options
        : null;

      merged[id] = {
        ...(previous && typeof previous === "object" ? previous : {}),
        ...override,
        options: previousOptions || nextOptions
          ? {
            ...(previousOptions || {}),
            ...(nextOptions || {}),
          }
          : override.options,
      };
    }
  }

  return merged;
}

// Low-level factory for callers that already own a Leaflet map instance.
export function createTiliaApp({ map, builtins = defaultBuiltins, ...options } = {}) {
  if (!map) {
    throw new Error("createTiliaApp requires a Leaflet map");
  }

  ensureBuiltinUiStyles({ map });
  const surfaceManager = createUiSurfaceManager({ map });

  const core = createTiliaCore(map, options);
  const baseMap = { map };
  const baseLayerManager = createBaseLayerManager({
    map,
    definitions: Array.isArray(options.baseLayers) ? options.baseLayers : [],
    currentLayer: options.tileLayer || null,
    currentDefinition: options.baseLayer || null,
    selectedBaseLayerId: options.selectedBaseLayerId || null,
    overrides: options.baseLayerOverrides || null,
  });
  const services = Object.create(null);
  const refreshHandlers = new Set();
  const pluginRuntime = createPluginRuntime({ catalog: Array.isArray(builtins) ? builtins : Object.values(builtins) });
  const configuredPlugins = Array.isArray(options.plugins) ? options.plugins : [];
  const configuredPluginOptions = options.pluginOptions && typeof options.pluginOptions === "object"
    ? options.pluginOptions
    : null;
  let appRef = null;

  const baseMaps = {
    list() {
      return baseLayerManager.list();
    },
    listVisible() {
      return baseLayerManager.listVisible();
    },
    get(id) {
      return baseLayerManager.get(id);
    },
    has(id) {
      return baseLayerManager.has(id);
    },
    getCurrent() {
      return baseLayerManager.getCurrent();
    },
    getCurrentLayer() {
      return baseLayerManager.getCurrentLayer();
    },
    register(definition) {
      const registered = baseLayerManager.register(definition);
      appRef?.refreshView();
      return registered;
    },
    registerMany(definitions) {
      const registered = baseLayerManager.registerMany(definitions);
      appRef?.refreshView();
      return registered;
    },
    select(id) {
      const selection = baseLayerManager.select(id);
      if (appRef) {
        appRef.tileLayer = selection.layer;
        appRef.refreshView();
      }
      return selection;
    },
  };

  const app = {
    map,
    tileLayer: baseLayerManager.getCurrentLayer(),
    baseMaps,
    core,
    state: core.state,
    registry: core.registry,
    context: core.context,
    services,
    ui: {
      installMapControl,
      createPanel,
      createButton,
      createSelect,
      surfaceManager,
      mountSurface(surfaceItem) {
        return surfaceManager.mount(surfaceItem);
      },
      registerStylesheet(stylesheet) {
        return registerStylesheet({
          map,
          ...stylesheet,
        });
      },
    },
    // Expose the underlying Leaflet map when callers need direct access.
    getMap() {
      return baseMap.map;
    },
    // Expose the current base tile layer without leaking internal storage shape.
    getBaseLayer() {
      return baseLayerManager.getCurrentLayer();
    },
    // Return the full base-map bundle created or attached to this app.
    getBaseMap() {
      return {
        ...baseMap,
        tileLayer: baseLayerManager.getCurrentLayer(),
      };
    },
    // Plugins can publish shared services here for other plugins to consume.
    provide(name, service) {
      services[name] = service;
      return service;
    },
    // Refresh hooks let plugins coordinate rerenders without hard-coding each other.
    addRefreshHandler(handler) {
      if (typeof handler === "function") {
        refreshHandlers.add(handler);
      }
      return () => {
        refreshHandlers.delete(handler);
      };
    },
    refreshView() {
      for (const handler of refreshHandlers) {
        handler();
      }
    },
    // Expose interaction subscriptions without requiring third-party plugins to reach into core.
    subscribeInteractions(handlers) {
      return core.subscribeInteractions(handlers);
    },
    setStatus(text) {
      services["tilia-status"]?.setStatus?.(text);
    },
    setError(error) {
      setStateError(core.state, error);
    },
    async load(input) {
      return core.registry.dispatch(core.context, input);
    },
    use(pluginOrId, pluginOptions = {}) {
      const pluginId = typeof pluginOrId === "string" ? pluginOrId : pluginOrId?.id;
      if (getPhase4bPluginClassification(pluginId) === "disabled") {
        const error = new Error(`Plugin "${pluginId}" is disabled during the Phase 4B migration`);
        error.code = "PLUGIN_DISABLED_BY_MIGRATION";
        return Promise.reject(error);
      }
      return pluginRuntime.use(pluginOrId, pluginOptions);
    },
    unuse(pluginOrId) {
      const pluginId = typeof pluginOrId === "string" ? pluginOrId : pluginOrId?.id;
      return pluginRuntime.unuse(pluginId);
    },
    hasPlugin(pluginId) {
      return pluginRuntime.has(pluginId);
    },
    listPlugins() {
      return pluginRuntime.list();
    },
  };
  appRef = app;
  app.provide("tilia-base-maps", baseMaps);
  app.provide("tilia-ui-surfaces", surfaceManager);

  // `plugins: [...]` is a bootstrap convenience only. The real installation path remains `app.use(...)`
  // so startup sugar does not fork the plugin lifecycle or create a second implementation path.
  const ready = (async () => {
    for (const entry of configuredPlugins) {
      const configuredPlugin = normalizeConfiguredPlugin(entry, configuredPluginOptions);
      const pluginId = typeof configuredPlugin.plugin === "string"
        ? configuredPlugin.plugin
        : configuredPlugin.plugin?.id;
      if (getPhase4bPluginClassification(pluginId) === "disabled") {
        const error = new Error(`Plugin "${pluginId}" is disabled during the Phase 4B migration`);
        error.code = "PLUGIN_DISABLED_BY_MIGRATION";
        throw error;
      }
      await app.use(configuredPlugin.plugin, configuredPlugin.options);
    }
    return app;
  })();

  // Keep the async boundary explicit for advanced callers even if simple samples hide it.
  app.ready = ready;
  app.whenReady = function whenReady() {
    return ready;
  };

  return app;
}

// High-level factory for the common case: create the Leaflet base map and attach Tilia to it.
export function createDefaultTiliaApp(container, options = {}) {
  const {
    builtins = defaultBuiltins,
    baseMapOptions = {},
    ...appOptions
  } = options;
  const baseLayerOverrides = mergeBaseLayerOverrides(baseMapOptions.baseLayerOverrides, appOptions.baseLayerOverrides);
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
