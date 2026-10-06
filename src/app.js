import { createTiliaCore } from "./core/boot.js";
import { setError as setStateError } from "./core/state.js";
import { builtins as defaultBuiltins } from "./builtins.js";
import { createBaseMap, createTileLayer, defaultBaseLayerDefinitions } from "./map/base.js";
import { createPluginRuntime } from "./plugins/runtime/index.js";
import { getPhase4cPluginClassification } from "./plugins/migration-allowlist.js";
import { createScopeController } from "./ownership/index.js";
import { createInputRegistry, createServiceRegistry } from "./extensions/index.js";
import { createStylesheetManager } from "./resources/stylesheets.js";
import { createUiMountManager } from "./ui/mounts.js";
import { createMapFacadeFactory } from "./map/facade.js";
import { createBaseMapCatalog } from "./map/base-map-catalog.js";

function phase4cRuntimeCatalog(builtins) {
  const entries = Array.isArray(builtins) ? builtins : Object.values(builtins);
  return entries.filter(({ id } = {}) => getPhase4cPluginClassification(id) !== "disabled");
}

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

  const core = createTiliaCore(map, options);
  const baseMap = { map };
  options.tileLayer?.remove?.();
  const diagnostics = [];
  const onDiagnostic = (error) => diagnostics.push(error);
  const serviceRegistry = createServiceRegistry({ onError: onDiagnostic });
  const inputRegistry = createInputRegistry({ onError: onDiagnostic });
  const stylesheetManager = createStylesheetManager({
    document: map.getContainer?.()?.ownerDocument ?? globalThis.document,
    onError: onDiagnostic,
  });
  const uiMountManager = createUiMountManager({ map });
  const baseMapCatalog = createBaseMapCatalog({ map, onError: onDiagnostic });
  const mapFactory = createMapFacadeFactory({ map });
  const appController = createScopeController({ label: "application-foundations" });
  const appPostCommit = [];
  const appCapabilityInput = {
    pluginId: "tilia-application",
    scope: appController.scope,
    stage: (definition) => appController.stage(definition),
    enqueuePostCommit: (callback) => appPostCommit.push(callback),
    diagnostics: Object.freeze({ report: onDiagnostic }),
  };
  const appInputs = inputRegistry.createFacade(appCapabilityInput);
  const appBaseMaps = baseMapCatalog.createFacade(appCapabilityInput);
  if ((map.getContainer?.()?.ownerDocument ?? globalThis.document)?.head) {
    stylesheetManager.acquire(appController.scope, {
      id: "tilia-core-ui",
      href: new URL("./ui/styles.css", import.meta.url).href,
    });
  }
  const refreshHandlers = new Set();
  // Disabled repository metadata is excluded from the production graph. This
  // makes a disabled transitive dependency fail during planning, before either
  // its loader or the consumer setup can run.
  const capabilityFactories = {
    services: (input) => serviceRegistry.createFacade(input),
    inputs: (input) => inputRegistry.createFacade(input),
    styles: (input) => stylesheetManager.createFacade(input),
    ui: (input) => uiMountManager.createFacade(input),
    map: mapFactory,
    baseMaps: (input) => baseMapCatalog.createFacade(input),
  };
  const pluginRuntime = createPluginRuntime({ catalog: phase4cRuntimeCatalog(builtins), capabilityFactories, onDiagnostic });
  const configuredPlugins = Array.isArray(options.plugins) ? options.plugins : [];
  const configuredPluginOptions = options.pluginOptions && typeof options.pluginOptions === "object"
    ? options.pluginOptions
    : null;
  const app = {
    map,
    core,
    state: core.state,
    // Expose the underlying Leaflet map when callers need direct access.
    getMap() {
      return baseMap.map;
    },
    // Expose the current base tile layer without leaking internal storage shape.
    getBaseLayer() {
      return baseMapCatalog.getSelectedLayer();
    },
    // Return the full base-map bundle created or attached to this app.
    getBaseMap() {
      return {
        ...baseMap,
        tileLayer: baseMapCatalog.getSelectedLayer(),
      };
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
    setError(error) {
      setStateError(core.state, error);
    },
    async load(input) {
      await ready;
      return appInputs.dispatch(input);
    },
    use(pluginOrId, pluginOptions = {}) {
      const pluginId = typeof pluginOrId === "string" ? pluginOrId : pluginOrId?.id;
      if (getPhase4cPluginClassification(pluginId) === "disabled") {
        const error = new Error(`Plugin "${pluginId}" is disabled during the Phase 4C migration`);
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

  // `plugins: [...]` is a bootstrap convenience only. The real installation path remains `app.use(...)`
  // so startup sugar does not fork the plugin lifecycle or create a second implementation path.
  const ready = (async () => {
    const definitions = Array.isArray(options.baseLayers) && options.baseLayers.length
      ? options.baseLayers
      : options.baseLayer ? [options.baseLayer] : defaultBaseLayerDefinitions;
    for (const [index, definition] of definitions.entries()) {
      appBaseMaps.register({
        ...definition,
        rank: Number.isFinite(definition.rank) ? definition.rank : index,
        createLayer: () => createTileLayer(definition),
      });
    }
    await appController.commit();
    for (const callback of appPostCommit.splice(0)) {
      try { callback(); } catch (error) { onDiagnostic(error); }
    }
    if (options.selectedBaseLayerId && appBaseMaps.get(options.selectedBaseLayerId)) {
      appBaseMaps.select(options.selectedBaseLayerId);
    }
    for (const entry of configuredPlugins) {
      const configuredPlugin = normalizeConfiguredPlugin(entry, configuredPluginOptions);
      const pluginId = typeof configuredPlugin.plugin === "string"
        ? configuredPlugin.plugin
        : configuredPlugin.plugin?.id;
      if (getPhase4cPluginClassification(pluginId) === "disabled") {
        const error = new Error(`Plugin "${pluginId}" is disabled during the Phase 4C migration`);
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
