import { createDomainContributions } from "./ui/domain-contributions.js";
import { builtins as defaultBuiltins } from "./builtins.js";
import { createTileLayer, defaultBaseLayerDefinitions } from "./map/base.js";
import { createPluginRuntime } from "./plugins/runtime/index.js";
import { setScopeOperationalCheck } from "./ownership/scope.js";
import { applicationError, applicationErrorCodes } from "./application-errors.js";
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

// Private composition injection for isolated machinery tests; not a public factory.
export function createApplicationComposition({
  map,
  builtins = defaultBuiltins,
  ...options
} = {}, { removeMap = () => {} } = {}) {
  if (!map) {
    throw new Error("Application composition requires a Leaflet map");
  }

  const baseMap = { map };
  const diagnostics = [];
  const onDiagnostic = (error) => diagnostics.push(error);
  let terminal = false;
  let destroyPromise = null;
  let readySettled = false;
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  ready.catch(() => {});
  const assertOperational = () => {
    if (terminal) throw applicationError(applicationErrorCodes.destroyed, "Application is destroyed");
  };
  const appController = createScopeController({
    label: "application-foundations",
  });
  setScopeOperationalCheck(appController.scope, assertOperational);
  let semanticFoundation = null;
  let rendering, pluginRuntime, baseMapCatalog;
  let semanticFoundationReady;
  try {
    options.tileLayer?.remove?.();
    rendering = createRenderingCoordinator({
      applicationController: appController,
      map,
      getSemantics: () => semanticFoundation,
      onError: onDiagnostic,
    });
    let semanticApi = null;
    semanticFoundationReady = createSemanticFoundation({
      onError: onDiagnostic,
      entryRenderingLifecycle: rendering.lifecycle,
    }).then((foundation) => {
      semanticFoundation = foundation;
      setScopeOperationalCheck(foundation.scope, assertOperational);
      if (terminal) foundation.entries.beginShutdown();
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
    baseMapCatalog = createBaseMapCatalog({ map, scope: appController.scope, onError: onDiagnostic });
    const mapFactory = createMapFacadeFactory({ map, panes: rendering.panes });
    const appPostCommit = [];
    const appCapabilityInput = {
      pluginId: "tilia-application",
      scope: appController.scope,
      stage: (definition) => appController.stage(definition),
      enqueuePostCommit: (callback) => appPostCommit.push(callback),
      diagnostics: Object.freeze({ report: onDiagnostic }),
    };
    const inputController = appController.createChildController({ label: "application-inputs" });
    const backgroundSelectionController = appController.createChildController({ label: "background-selection" });
    const appInputs = inputRegistry.createFacade({ ...appCapabilityInput, scope: inputController.scope });
    const appBaseMaps = baseMapCatalog.createFacade(appCapabilityInput);
    if ((map.getContainer?.()?.ownerDocument ?? globalThis.document)?.head) {
      stylesheetManager.acquire(appController.scope, {
        id: "tilia-core-ui",
        href: new URL("./ui/styles.css", import.meta.url).href,
      });
    }
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
    pluginRuntime = createPluginRuntime({
      catalog: builtins,
      assertOperational,
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
      get map() { assertOperational(); return map; },
      get rendering() { assertOperational(); return rendering.applicationApi; },
      get entries() {
        assertOperational();
        if (!semanticApi) throw new Error("Semantic foundation is not ready");
        return semanticApi.entries;
      },
      get domains() {
        assertOperational();
        if (!semanticApi) throw new Error("Semantic foundation is not ready");
        return semanticApi.domains;
      },
      get selection() {
        assertOperational();
        if (!semanticApi) throw new Error("Semantic foundation is not ready");
        return semanticApi.selection;
      },
      // Expose the underlying Leaflet map when callers need direct access.
      getMap() {
        assertOperational();
        return baseMap.map;
      },
      // Expose the current base tile layer without leaking internal storage shape.
      getBaseLayer() {
        assertOperational();
        return baseMapCatalog.getSelectedLayer();
      },
      // Return the full base-map bundle created or attached to this app.
      getBaseMap() {
        assertOperational();
        return {
          ...baseMap,
          tileLayer: baseMapCatalog.getSelectedLayer(),
        };
      },
      async load(input) {
        assertOperational();
        await ready;
        assertOperational();
        return appInputs.dispatch(input);
      },
      use(pluginOrId, pluginOptions = {}) {
        try { pluginRuntime.assertLifecycleEntry(); assertOperational(); } catch (error) { return Promise.reject(error); }
        return semanticFoundationReady.then(() => { assertOperational(); return pluginRuntime.use(pluginOrId, pluginOptions); });
      },
      unuse(pluginOrId) {
        try { pluginRuntime.assertLifecycleEntry(); assertOperational(); } catch (error) { return Promise.reject(error); }
        const pluginId = typeof pluginOrId === "string" ? pluginOrId : pluginOrId?.id;
        return semanticFoundationReady.then(() => { assertOperational(); return pluginRuntime.unuse(pluginId); });
      },
      destroy,
      hasPlugin(pluginId) {
        return !terminal && pluginRuntime.has(pluginId);
      },
      listPlugins() {
        return terminal ? Object.freeze([]) : pluginRuntime.list();
      },
    };

    // `plugins: [...]` is a bootstrap convenience only. The real installation path remains `app.use(...)`
    // so startup sugar does not fork the plugin lifecycle or create a second implementation path.
    const bootstrap = (async () => {
      await semanticFoundationReady;
      assertOperational();
      const backgroundScope = backgroundSelectionController.scope;
      const interactions = rendering.createCapabilities({ scope: backgroundScope }).interactions;
      const selection = semanticFoundation.selection.createFacade(backgroundScope);
      interactions.bind({
        id: "selection-clear-background", surface: interactions.mapSurface(), event: "click", tier: "background",
        handle: () => ({ consume: true, run: () => selection.clear() }),
      });
      const definitions =
        Array.isArray(options.baseLayers) && options.baseLayers.length
          ? options.baseLayers
          : options.baseLayer
            ? [options.baseLayer]
            : defaultBaseLayerDefinitions;
      for (const [index, definition] of definitions.entries()) {
        assertOperational();
        appBaseMaps.register({
          ...definition,
          rank: Number.isFinite(definition.rank) ? definition.rank : index,
          createLayer: () => createTileLayer(definition),
        });
      }
      await appController.commit();
      for (const callback of appPostCommit.splice(0)) {
        assertOperational();
        try {
          callback();
        } catch (error) {
          onDiagnostic(error);
        }
      }
      assertOperational();
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
        assertOperational();
        await pluginRuntime.use(
          configuredPlugin.plugin,
          configuredPlugin.options,
        );
      }
      assertOperational();
      return app;
    })();
    bootstrap.then(value => { if (!readySettled) { readySettled = true; resolveReady(value); } }, error => {
      if (!readySettled) { readySettled = true; rejectReady(error); }
      destroy().catch(onDiagnostic);
    });

    // Keep the async boundary explicit for advanced callers even if simple samples hide it.
    app.ready = ready;
    app.whenReady = function whenReady() {
      return ready;
    };

    function destroy() {
      try { pluginRuntime.assertLifecycleEntry(); } catch (error) { return Promise.reject(error); }
      if (destroyPromise) return destroyPromise;
      let resolve, reject;
      destroyPromise = new Promise((yes, no) => { resolve = yes; reject = no; });
      destroyPromise.catch(() => {});
      const diagnosticStart = diagnostics.length;
      terminal = true;
      if (!readySettled) { readySettled = true; rejectReady(applicationError(applicationErrorCodes.destroyed, "Application destroyed during initialization")); }
      baseMapCatalog.beginShutdown();
      pluginRuntime.beginShutdown();
      semanticFoundation?.entries.beginShutdown();
      const inputClose = inputController.close();
      inputClose.catch(onDiagnostic);
      // Revoke interaction authority before asynchronous teardown reaches selection.
      const backgroundSelectionClose = backgroundSelectionController.close();
      backgroundSelectionClose.catch(() => {});
      (async () => {
        const failures = [];
        const attempt = async (resource, operation) => {
          try { return await operation(); } catch (cause) { failures.push({ resource, cause }); }
        };
        const foundation = await attempt("semantic acquisition", () => semanticFoundationReady);
        await attempt("background selection", () => backgroundSelectionClose);
        const retained = pluginRuntime.retainedClosure(foundation?.domains.leasedOwners() ?? []);
        for (const cause of await attempt("ordinary plugin drain", () => pluginRuntime.drainShutdown(retained)) ?? []) failures.push({ resource: "plugin", cause });
        if (foundation) await attempt("selection", () => foundation.selection.terminate());
        await attempt("presentation invalidation", () => rendering.terminate());
        if (foundation) for (const cause of await attempt("entry drain", () => foundation.entries.drainShutdown()) ?? []) failures.push({ resource: "entry", cause });
        const withheld = pluginRuntime.retainedClosure(foundation?.domains.leasedOwners() ?? []);
        for (const cause of await attempt("retained plugin drain", () => pluginRuntime.drainShutdown(withheld)) ?? []) failures.push({ resource: "plugin", cause });
        const blocked = pluginRuntime.retainedClosure(foundation?.domains.leasedOwners() ?? []);
        const blockedRecords = pluginRuntime.finishShutdown(blocked);
        if (blockedRecords.length) failures.push({ resource: "cleanup prerequisite", cause: new Error("Cleanup prerequisites retained because provider leases or cleanup residuals remain"), blocked: blockedRecords });
        if (foundation) await attempt("semantic foundation", () => foundation.dispose());
        await attempt("rendering", () => rendering.close());
        const renderResiduals = rendering.inspect().residuals;
        if (renderResiduals.length) failures.push({ resource: "render acquisition", cause: new Error("Renderer acquisition cleanup remains incomplete"), residuals: renderResiduals });
        await attempt("input invocations", () => inputClose);
        await attempt("application resources", () => appController.close());
        await attempt("map", removeMap);
        for (const cause of diagnostics.slice(diagnosticStart)) {
          // Retirement rejects acquisition/build publication normally; it is
          // still diagnostic evidence, not a failed captured cleanup.
          if (cause?.code === "RENDERING_STALE" && cause.cause === undefined) continue;
          if (!failures.some(failure => failure.cause === cause)) failures.push({ resource: "shutdown diagnostic", cause });
        }
        if (failures.length) throw applicationError(applicationErrorCodes.cleanupFailed, "Application destruction completed with cleanup failures", { failures });
      })().then(resolve, reject);
      return destroyPromise;
    }
    return Object.freeze({ app, foundations: Object.freeze({ rendering }) });
  } catch (error) {
    terminal = true;
    if (!readySettled) { readySettled = true; rejectReady(error); }
    baseMapCatalog?.beginShutdown();
    pluginRuntime?.beginShutdown();
    const cleanup = async () => {
      if (pluginRuntime) for (const failure of await pluginRuntime.drainShutdown()) onDiagnostic(failure);
      if (semanticFoundationReady) {
        try { const foundation = await semanticFoundationReady; foundation.entries.beginShutdown(); await foundation.entries.drainShutdown(); await foundation.dispose(); }
        catch (failure) { onDiagnostic(failure); }
      }
      try { await appController.close(); } catch (failure) { onDiagnostic(failure); }
      try { await removeMap(); } catch (failure) { onDiagnostic(failure); }
    };
    // No application was returned: keep rollback failure observable on the
    // existing internal error path without changing the initiating exception.
    const reportRollback = failure => { onDiagnostic(failure); console.error("Application construction rollback failed", failure); };
    cleanup().then(() => { for (const failure of diagnostics) console.error("Application construction rollback failed", failure); }, reportRollback);
    throw error;
  }
}
