import { createTiliaCore } from "./core/boot.js";
import { setError as setStateError } from "./core/state.js";
import { builtins as defaultBuiltins } from "./builtins.js";
import { createBaseLayerManager, createBaseMap } from "./map/base.js";
import { createButton, createPanel, createSelect, installMapControl } from "./map/controls.js";

function isPluginObject(value) {
  return !!value && typeof value === "object" && typeof value.setup === "function";
}

const pluginIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isBuiltinPluginId(pluginId, builtinsRegistry) {
  return builtinsRegistry[pluginId]?.id === pluginId;
}

function assertPluginId(pluginId, builtinsRegistry) {
  if (!pluginIdPattern.test(pluginId)) {
    throw new Error(`Plugin ids must be lower-kebab-case: ${pluginId}`);
  }

  if (isBuiltinPluginId(pluginId, builtinsRegistry)) {
    return pluginId;
  }

  if (pluginId.startsWith("tilia-")) {
    throw new Error(`The \"tilia-\" namespace is reserved for built-in plugins: ${pluginId}`);
  }

  if (!pluginId.includes("-")) {
    throw new Error(`Third-party plugin ids must include a vendor or experimental prefix: ${pluginId}`);
  }

  return pluginId;
}

function resolvePluginModule(pluginModule, pluginId) {
  if (isPluginObject(pluginModule)) {
    return pluginModule;
  }

  if (!pluginModule || typeof pluginModule !== "object") {
    return null;
  }

  if (isPluginObject(pluginModule.default)) {
    return pluginModule.default;
  }

  for (const candidate of Object.values(pluginModule)) {
    if (isPluginObject(candidate) && candidate.id === pluginId) {
      return candidate;
    }
  }

  for (const candidate of Object.values(pluginModule)) {
    if (isPluginObject(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function resolvePlugin(pluginOrId, builtinsRegistry, pluginLoader) {
  if (typeof pluginOrId === "string") {
    assertPluginId(pluginOrId, builtinsRegistry);
    const resolved = builtinsRegistry[pluginOrId];
    if (resolved?.id === pluginOrId) {
      return resolved;
    }

    if (typeof pluginLoader === "function") {
      const loadedPlugin = await pluginLoader(pluginOrId);
      const dynamicPlugin = resolvePluginModule(loadedPlugin, pluginOrId);
      if (dynamicPlugin) {
        return dynamicPlugin;
      }
      throw new Error(`Plugin loader did not return a valid plugin for "${pluginOrId}"`);
    }

    throw new Error(`Unknown plugin: ${pluginOrId}`);
  }

  if (!isPluginObject(pluginOrId)) {
    throw new Error("Plugins must be a string id or an object with setup(app, options)");
  }

  if (!pluginOrId.id) {
    throw new Error("Plugins must define an id");
  }

  assertPluginId(pluginOrId.id, builtinsRegistry);

  return pluginOrId;
}

function createPluginLoader(pluginUrls, customPluginLoader) {
  if (typeof customPluginLoader === "function") {
    return customPluginLoader;
  }

  const pluginUrlMap = pluginUrls && typeof pluginUrls === "object" ? pluginUrls : null;

  return async function loadPlugin(pluginId) {
    // Dynamic loading stays convention-based by default so casual users only need the plugin id.
    assertPluginId(pluginId, defaultBuiltins);
    const source = pluginUrlMap?.[pluginId]
      || new URL(`../plugins/${pluginId}/loader.js`, import.meta.url).href;
    if (typeof source === "function") {
      const loaded = await source(pluginId);
      if (typeof loaded === "string") {
        return import(new URL(loaded, document.baseURI).href);
      }
      return loaded;
    }
    return import(new URL(source, document.baseURI).href);
  };
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
  const baseLayerManager = createBaseLayerManager({
    map,
    definitions: Array.isArray(options.baseLayers) ? options.baseLayers : [],
    currentLayer: options.tileLayer || null,
    currentDefinition: options.baseLayer || null,
    selectedBaseLayerId: options.selectedBaseLayerId || null,
    overrides: options.baseLayerOverrides || null,
  });
  const services = Object.create(null);
  const plugins = new Map();
  const pendingPlugins = new Map();
  const refreshHandlers = new Set();
  const pluginLoader = createPluginLoader(options.pluginUrls, options.pluginLoader);
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
    plugins,
    ui: {
      installMapControl,
      createPanel,
      createButton,
      createSelect,
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
    // The public plugin entrypoint. Accepts a built-in id, a dynamically loaded id, or a plugin object.
    async use(pluginOrId, pluginOptions = {}) {
      const plugin = await resolvePlugin(pluginOrId, builtins, pluginLoader);
      const existing = plugins.get(plugin.id);
      if (existing) {
        return existing.api;
      }
      const pending = pendingPlugins.get(plugin.id);
      if (pending) {
        return pending;
      }

      const installPromise = (async () => {
        for (const requiredPluginId of plugin.requires || []) {
          if (!plugins.has(requiredPluginId)) {
            throw new Error(`Plugin "${plugin.id}" requires "${requiredPluginId}"`);
          }
        }

        const setupResult = await plugin.setup(app, pluginOptions);
        const api = typeof setupResult === "function"
          ? { destroy: setupResult }
          : setupResult;
        const destroy = typeof setupResult === "function"
          ? setupResult
          : typeof setupResult?.destroy === "function"
            ? setupResult.destroy.bind(setupResult)
            : null;
        plugins.set(plugin.id, { plugin, api, destroy });
        if (api !== undefined) {
          app.provide(plugin.id, api);
        }
        return api;
      })();

      pendingPlugins.set(plugin.id, installPromise);
      try {
        return await installPromise;
      } finally {
        pendingPlugins.delete(plugin.id);
      }
    },
    // Allow plugins with teardown logic to be removed cleanly during experimentation.
    async unuse(pluginOrId) {
      const pluginId = typeof pluginOrId === "string" ? pluginOrId : pluginOrId?.id;
      if (!pluginId) {
        throw new Error("Plugins must define an id");
      }

      const record = plugins.get(pluginId);
      if (!record) {
        return null;
      }

      if (typeof record.destroy === "function") {
        await record.destroy();
      }
      delete services[pluginId];
      plugins.delete(pluginId);
      return record.api;
    },
  };
  appRef = app;
  app.provide("tilia-base-maps", baseMaps);

  // `plugins: [...]` is a bootstrap convenience only. The real installation path remains `app.use(...)`
  // so startup sugar does not fork the plugin lifecycle or create a second implementation path.
  const ready = (async () => {
    for (const entry of configuredPlugins) {
      const configuredPlugin = normalizeConfiguredPlugin(entry, configuredPluginOptions);
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
