import { createDomainContributions } from "./ui/domain-contributions.js";
import { builtins as defaultBuiltins } from "./builtins.js";
import { createTileLayer, defaultBaseLayerDefinitions } from "./map/base.js";
import { createPluginRuntime } from "./plugins/runtime/index.js";
import { getPhase4dPluginClassification } from "./plugins/migration-allowlist.js";
import { createScopeController } from "./ownership/index.js";
import {
  createInputRegistry,
  createServiceRegistry,
} from "./extensions/index.js";
import { createStylesheetManager } from "./resources/stylesheets.js";
import { createUiMountManager } from "./ui/mounts.js";
import { createMapFacadeFactory } from "./map/facade.js";
import { createBaseMapCatalog } from "./map/base-map-catalog.js";
import { createSemanticFoundation } from "./semantic-foundation.js";
import {
  createApplicationSemanticApi,
  createSemanticCapabilityFactories,
} from "./semantic-capabilities.js";

import { createRenderingCoordinator } from "./rendering/coordinator.js";

function phase4dRuntimeCatalog(builtins) {
  const entries = Array.isArray(builtins) ? builtins : Object.values(builtins);
  return entries.filter(
    ({ id } = {}) => getPhase4dPluginClassification(id) !== "disabled",
  );
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

  throw new Error(
    "Configured plugins must be a string, [plugin, options], or { plugin, options }",
  );
}

export function mergeBaseLayerOverrides(baseMapOverrides, appOverrides) {
  const sources = [baseMapOverrides, appOverrides].filter(
    (value) => value && typeof value === "object",
  );
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
      const previousOptions =
        previous &&
        typeof previous === "object" &&
        previous.options &&
        typeof previous.options === "object"
          ? previous.options
          : null;
      const nextOptions =
        override.options && typeof override.options === "object"
          ? override.options
          : null;

      merged[id] = {
        ...(previous && typeof previous === "object" ? previous : {}),
        ...override,
        options:
          previousOptions || nextOptions
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
export function createApplicationComposition({
  map,
  builtins = defaultBuiltins,
  ...options
} = {}) {
  if (!map) {
    throw new Error("createTiliaApp requires a Leaflet map");
  }

  const baseMap = { map };
  options.tileLayer?.remove?.();
  const diagnostics = [];
  const onDiagnostic = (error) => diagnostics.push(error);
  const appController = createScopeController({
    label: "application-foundations",
  });
  let semanticFoundation = null;
  const rendering = createRenderingCoordinator({
    applicationController: appController,
    map,
    getSemantics: () => semanticFoundation,
    onError: onDiagnostic,
  });
  let semanticApi = null;
  const semanticFoundationReady = createSemanticFoundation({
    onError: onDiagnostic,
    entryRenderingLifecycle: rendering.lifecycle,
  }).then((foundation) => {
    semanticFoundation = foundation;
    semanticApi = createApplicationSemanticApi(foundation);
    return foundation;
  });
  const domainContributions = createDomainContributions({ onError: onDiagnostic });
  const serviceRegistry = createServiceRegistry({ onError: onDiagnostic });
  const inputRegistry = createInputRegistry({ onError: onDiagnostic });
  const stylesheetManager = createStylesheetManager({
    document: map.getContainer?.()?.ownerDocument ?? globalThis.document,
    onError: onDiagnostic,
  });
  const uiMountManager = createUiMountManager({ map, scope: appController.scope, onError: onDiagnostic });
  const baseMapCatalog = createBaseMapCatalog({ map, onError: onDiagnostic });
  const mapFactory = createMapFacadeFactory({ map, panes: rendering.panes });
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
  // Disabled repository metadata is excluded from the production graph. This
  // makes a disabled transitive dependency fail during planning, before either
  // its loader or the consumer setup can run.
  const capabilityFactories = {
    diagnostics: (input) => input.diagnostics,
    contributions: (input) => domainContributions.createFacade(input),
    renderers: (input) => rendering.createCapabilities(input).renderers,
    rendering: (input) => rendering.createCapabilities(input).rendering,
    interactions: (input) => rendering.createCapabilities(input).interactions,
    presentation: (input) => rendering.createCapabilities(input).presentation,
    services: (input) => serviceRegistry.createFacade(input),
    inputs: (input) => inputRegistry.createFacade(input),
    styles: (input) => stylesheetManager.createFacade(input),
    ui: (input) => uiMountManager.createFacade(input),
    map: mapFactory,
    baseMaps: (input) => baseMapCatalog.createFacade(input),
    domains: (input) =>
      createSemanticCapabilityFactories(semanticFoundation).domains(input),
    entries: (input) =>
      createSemanticCapabilityFactories(semanticFoundation).entries(input),
    selection: (input) =>
      createSemanticCapabilityFactories(semanticFoundation).selection(input),
  };
  const pluginRuntime = createPluginRuntime({
    catalog: phase4dRuntimeCatalog(builtins),
    capabilityFactories,
    onDiagnostic,
  });
  const configuredPlugins = Array.isArray(options.plugins)
    ? options.plugins
    : [];
  const configuredPluginOptions =
    options.pluginOptions && typeof options.pluginOptions === "object"
      ? options.pluginOptions
      : null;
  const app = {
    map,
    rendering: rendering.applicationApi,
    get entries() {
      if (!semanticApi) throw new Error("Semantic foundation is not ready");
      return semanticApi.entries;
    },
    get domains() {
      if (!semanticApi) throw new Error("Semantic foundation is not ready");
      return semanticApi.domains;
    },
    get selection() {
      if (!semanticApi) throw new Error("Semantic foundation is not ready");
      return semanticApi.selection;
    },
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
    async load(input) {
      await ready;
      return appInputs.dispatch(input);
    },
    use(pluginOrId, pluginOptions = {}) {
      const pluginId =
        typeof pluginOrId === "string" ? pluginOrId : pluginOrId?.id;
      if (getPhase4dPluginClassification(pluginId) === "disabled") {
        const error = new Error(
          `Plugin "${pluginId}" is disabled during the Phase 4H migration`,
        );
        error.code = "PLUGIN_DISABLED_BY_MIGRATION";
        return Promise.reject(error);
      }
      return semanticFoundationReady.then(() =>
        pluginRuntime.use(pluginOrId, pluginOptions),
      );
    },
    unuse(pluginOrId) {
      const pluginId =
        typeof pluginOrId === "string" ? pluginOrId : pluginOrId?.id;
      return semanticFoundationReady.then(() => pluginRuntime.unuse(pluginId));
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
    await semanticFoundationReady;
    const definitions =
      Array.isArray(options.baseLayers) && options.baseLayers.length
        ? options.baseLayers
        : options.baseLayer
          ? [options.baseLayer]
          : defaultBaseLayerDefinitions;
    for (const [index, definition] of definitions.entries()) {
      appBaseMaps.register({
        ...definition,
        rank: Number.isFinite(definition.rank) ? definition.rank : index,
        createLayer: () => createTileLayer(definition),
      });
    }
    await appController.commit();
    for (const callback of appPostCommit.splice(0)) {
      try {
        callback();
      } catch (error) {
        onDiagnostic(error);
      }
    }
    if (
      options.selectedBaseLayerId &&
      appBaseMaps.get(options.selectedBaseLayerId)
    ) {
      appBaseMaps.select(options.selectedBaseLayerId);
    }
    for (const entry of configuredPlugins) {
      const configuredPlugin = normalizeConfiguredPlugin(
        entry,
        configuredPluginOptions,
      );
      const pluginId =
        typeof configuredPlugin.plugin === "string"
          ? configuredPlugin.plugin
          : configuredPlugin.plugin?.id;
      if (getPhase4dPluginClassification(pluginId) === "disabled") {
        const error = new Error(
          `Plugin "${pluginId}" is disabled during the Phase 4H migration`,
        );
        error.code = "PLUGIN_DISABLED_BY_MIGRATION";
        throw error;
      }
      await pluginRuntime.use(
        configuredPlugin.plugin,
        configuredPlugin.options,
      );
    }
    return app;
  })();

  // Keep the async boundary explicit for advanced callers even if simple samples hide it.
  app.ready = ready;
  app.whenReady = function whenReady() {
    return ready;
  };

  return Object.freeze({ app, foundations: Object.freeze({ rendering }) });
}
