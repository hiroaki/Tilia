import { createScopeController } from "../../ownership/index.js";
import { setScopeCleanupInvoker, setScopeOperationalCheck, isScopeWithin } from "../../ownership/scope.js";
import {
  assertPluginId,
  normalizeCatalog,
  normalizeDirectDefinition,
  sameMetadata,
  validateImplementation,
} from "./catalog.js";
import { createPluginContext } from "./context.js";
import { PluginError, pluginError, pluginErrorCodes } from "./errors.js";
import { planDependencies } from "./planner.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function cleanupFor(result, pluginId) {
  if (result === undefined) return null;
  if (typeof result === "function") return result;
  if (result && typeof result === "object" && typeof result.dispose === "function"
      && Object.keys(result).every((key) => key === "dispose")) {
    return result.dispose.bind(result);
  }
  throw pluginError(pluginErrorCodes.descriptorInvalid, `Plugin "${pluginId}" setup must return cleanup only`, { pluginId });
}

function frozenDiagnostic(record) {
  return Object.freeze({
    id: record.id,
    state: record.state,
    requires: Object.freeze([...record.metadata.requires]),
    ...(record.controller ? { ownership: record.controller.snapshot() } : {}),
    ...(record.error ? { error: Object.freeze({ name: record.error.name, message: record.error.message, code: record.error.code }) } : {}),
  });
}

export function createPluginRuntime({ catalog = [], capabilityFactories = {}, onDiagnostic = () => {}, assertOperational = () => {} } = {}) {
  const metadata = normalizeCatalog(catalog);
  const builtinIds = new Set([...metadata.keys()].filter((id) => id.startsWith("tilia-")));
  const resolved = new Map();
  const resolving = new Map();
  const records = new Map();
  const useOperations = new Map();
  const unuseOperations = new Map();
  const detachedSetups = new Map();
  let state = "active";
  let activationSequence = 0;
  let queue = Promise.resolve();
  let callbackDepth = 0;
  let destroyPromise = null;
  const destruction = deferred();

  function invokePluginCallback(callback) {
    callbackDepth += 1;
    try { return callback(); } finally { callbackDepth -= 1; }
  }

  const enqueue = (operation) => {
    const result = queue.then(operation, operation);
    queue = result.catch(() => {});
    return result;
  };

  function assertRequestAllowed() {
    if (callbackDepth > 0) {
      throw pluginError(pluginErrorCodes.reentrant, "Plugin lifecycle mutation is not allowed from setup or cleanup");
    }
    assertOperational();
    if (state === "destroying") throw pluginError(pluginErrorCodes.destroying, "Plugin runtime is destroying");
    if (state === "destroyed") throw pluginError(pluginErrorCodes.destroyed, "Plugin runtime is destroyed");
  }

  function registerDirect(definition) {
    const normalized = normalizeDirectDefinition(definition, builtinIds);
    const existing = metadata.get(normalized.id);
    if (existing && !sameMetadata(existing, normalized)) {
      throw pluginError(pluginErrorCodes.descriptorConflict, `Conflicting plugin definition "${normalized.id}"`, { pluginId: normalized.id });
    }
    if (!existing) metadata.set(normalized.id, normalized);
    return normalized.id;
  }

  async function resolveImplementation(id) {
    if (resolved.has(id)) return resolved.get(id);
    if (resolving.has(id)) return resolving.get(id);
    const entry = metadata.get(id);
    if (!entry) throw pluginError(pluginErrorCodes.unknown, `Unknown plugin "${id}"`, { pluginId: id });
    const operation = Promise.resolve().then(() => entry.load()).then(
      (value) => {
        const implementation = validateImplementation(value, entry);
        resolved.set(id, implementation);
        resolving.delete(id);
        return implementation;
      },
      (cause) => {
        resolving.delete(id);
        if (cause instanceof PluginError) throw cause;
        throw pluginError(pluginErrorCodes.resolutionFailed, `Failed to resolve plugin "${id}"`, { pluginId: id, cause });
      },
    );
    resolving.set(id, operation);
    return operation;
  }

  async function installOne(id, options) {
    const existing = records.get(id);
    if (existing?.state === "active") return existing.handle;
    if (existing?.state === "quarantined") {
      throw pluginError(pluginErrorCodes.quarantined, `Plugin "${id}" is quarantined`, { pluginId: id });
    }
    const implementation = await Promise.race([resolveImplementation(id), destruction.promise.then(() => { throw pluginError(pluginErrorCodes.destroying, "Plugin resolution interrupted by shutdown", { pluginId: id }); })]);
    if (state !== "active") throw pluginError(pluginErrorCodes.destroying, "Plugin runtime is destroying", { pluginId: id });
    const controller = createScopeController({ label: `plugin:${id}` });
    setScopeCleanupInvoker(controller.scope, invokePluginCallback);
    setScopeOperationalCheck(controller.scope, assertOperational);
    const record = {
      id,
      metadata: metadata.get(id),
      implementation,
      controller,
      state: "installing",
      handle: Object.freeze({ id }),
      sequence: 0,
      error: null,
      abortPromise: null,
      postCommit: [],
      teardownPreflights: [],
    };
    records.set(id, record);
    const context = createPluginContext({
      pluginId: id,
      scope: controller.scope,
      isInstalling: () => record.state === "installing",
      isActive: () => record.state === "active",
      stage: (definition) => controller.stage(definition),
      enqueuePostCommit(callback) {
        if (typeof callback !== "function") throw new TypeError("Post-commit notification must be a function");
        record.postCommit.push(callback);
      },
      diagnostics: Object.freeze({ report: onDiagnostic }),
      addTeardownPreflight(callback) {
        if (typeof callback !== "function") throw new TypeError("Teardown preflight must be a function");
        record.teardownPreflights.push(callback);
      },
      capabilityFactories,
    });
    const stopped = destruction.promise.then(() => { throw pluginError(pluginErrorCodes.destroying, "Plugin runtime destruction interrupted setup", { pluginId: id }); });
    stopped.catch(() => {});
    let setupPromise;
    let setupSettled = false;
    let phase = "setup";
    try {
      const setupResultPromise = invokePluginCallback(() => implementation.setup(context, options));
      setupPromise = Promise.resolve(setupResultPromise);
      const setupResult = await Promise.race([setupPromise, stopped]);
      setupSettled = true;
      const cleanup = cleanupFor(setupResult, id);
      if (cleanup) controller.setSetupCleanup(cleanup, { label: `${id}:setup-cleanup` });
      if (state !== "active") throw pluginError(pluginErrorCodes.destroying, "Plugin runtime destruction prevented setup commit", { pluginId: id });
      phase = "commit";
      await controller.commit();
      const scopeState = controller.snapshot().state;
      if (state !== "active" || scopeState !== "active") {
        throw pluginError(
          state === "destroyed" ? pluginErrorCodes.destroyed : pluginErrorCodes.destroying,
          "Plugin runtime destruction prevented active publication",
          { pluginId: id, scopeState },
        );
      }
      record.state = "active";
      record.sequence = ++activationSequence;
      for (const callback of record.postCommit.splice(0)) {
        try {
          callback();
        } catch (error) {
          onDiagnostic(error);
        }
      }
      return record.handle;
    } catch (cause) {
      if (setupPromise && !setupSettled && cause?.code === pluginErrorCodes.destroying) {
        const detached = { id, state: "detached-pending", error: null };
        detachedSetups.set(id, detached);
        setupPromise.then(async (lateResult) => {
          try {
            const cleanup = cleanupFor(lateResult, id);
            if (cleanup) await invokePluginCallback(cleanup);
            detached.state = "detached-settled";
          } catch (error) {
            detached.state = "detached-cleanup-failed";
            detached.error = error;
            onDiagnostic(error);
          }
        }, (error) => {
          detached.state = "detached-rejected";
          detached.error = error;
          onDiagnostic(error);
        });
      } else {
        setupPromise?.catch(() => {});
      }
      let cleanupFailure = null;
      try {
        if (record.abortPromise) await record.abortPromise;
        else {
          const scopeState = controller.snapshot().state;
          if (scopeState === "open-uncommitted") await controller.abort();
          else if (scopeState === "active") await controller.close();
        }
      } catch (error) {
        cleanupFailure = error;
      }
      if (cleanupFailure || controller.snapshot().state === "cleanup-failed") {
        record.state = "quarantined";
        record.error = cleanupFailure ?? cause;
      } else {
        records.delete(id);
      }
      if (cause instanceof PluginError) throw cause;
      if (phase === "commit") {
        throw pluginError(pluginErrorCodes.commitFailed, `Plugin "${id}" staged commit failed`, { pluginId: id, cause });
      }
      throw pluginError(pluginErrorCodes.setupFailed, `Plugin "${id}" setup failed`, { pluginId: id, cause });
    }
  }

  async function installRoot(id, options) {
    if (!metadata.has(id)) {
      throw pluginError(pluginErrorCodes.unknown, `Unknown plugin "${id}"`, { pluginId: id });
    }
    const plan = planDependencies(id, metadata, new Set([...records].filter(([, record]) => record.state === "active").map(([pluginId]) => pluginId)));
    for (const pluginId of plan.order) {
      try {
        await installOne(pluginId, pluginId === id ? options : {});
      } catch (cause) {
        if (pluginId === id) throw cause;
        throw pluginError(pluginErrorCodes.dependencyFailed, `Dependency "${pluginId}" failed for plugin "${id}"`, { pluginId: id, dependencyId: pluginId, cause });
      }
    }
    return records.get(id).handle;
  }

  function use(pluginOrId, options = {}) {
    assertRequestAllowed();
    const id = typeof pluginOrId === "string"
      ? assertPluginId(pluginOrId, { builtinIds })
      : registerDirect(pluginOrId);
    if (useOperations.has(id)) return useOperations.get(id);
    if (!unuseOperations.has(id) && records.get(id)?.state === "active") {
      return Promise.resolve(records.get(id).handle);
    }
    const precedingUnuse = unuseOperations.get(id);
    let operation;
    operation = enqueue(async () => {
      assertRequestAllowed();
      if (precedingUnuse) await precedingUnuse.catch(() => {});
      return installRoot(id, options);
    }).finally(() => {
      if (useOperations.get(id) === operation) useOperations.delete(id);
    });
    useOperations.set(id, operation);
    return operation;
  }

  function activeDependents(id) {
    return [...records.values()]
      .filter((record) => record.state === "active" && record.metadata.requires.includes(id))
      .map((record) => record.id)
      .sort();
  }

  async function teardownRecord(record, { retry = false, skipPreflight = false } = {}) {
    if (record.state === "quarantined") {
      try {
        await record.controller.retryCleanup();
        records.delete(record.id);
        return;
      } catch (cause) {
        record.error = cause;
        throw pluginError(pluginErrorCodes.teardownFailed, `Plugin "${record.id}" cleanup remains incomplete`, { pluginId: record.id, cause });
      }
    }
    if (record.state !== "active") return;
    if (!skipPreflight) {
      for (const preflight of record.teardownPreflights) {
        const result = preflight();
        if (result && typeof result.then === "function") {
          Promise.resolve(result).catch(() => {});
          throw new TypeError("Plugin teardown preflight must be synchronous");
        }
      }
    }
    record.state = "uninstalling";
    try {
      await record.controller.close();
      records.delete(record.id);
    } catch (cause) {
      record.state = "quarantined";
      record.error = cause;
      throw pluginError(pluginErrorCodes.teardownFailed, `Plugin "${record.id}" teardown failed`, { pluginId: record.id, cause, retry });
    }
  }

  function unuse(id) {
    assertRequestAllowed();
    if (typeof id !== "string") id = id?.id;
    assertPluginId(id, { builtinIds });
    if (unuseOperations.has(id)) return unuseOperations.get(id);
    const precedingUse = useOperations.get(id);
    let operation;
    operation = enqueue(async () => {
      assertRequestAllowed();
      if (precedingUse) await precedingUse.catch(() => {});
      const record = records.get(id);
      if (!record) return;
      const dependents = activeDependents(id);
      if (dependents.length) {
        throw pluginError(pluginErrorCodes.hasDependents, `Plugin "${id}" has active dependents: ${dependents.join(", ")}`, { pluginId: id, dependents });
      }
      await teardownRecord(record, { retry: record.state === "quarantined" });
    }).finally(() => {
      if (unuseOperations.get(id) === operation) unuseOperations.delete(id);
    });
    unuseOperations.set(id, operation);
    return operation;
  }

  function assertLifecycleEntry() {
    if (callbackDepth > 0) throw pluginError(pluginErrorCodes.reentrant, "Lifecycle entry is not allowed from setup or cleanup");
  }
  function beginShutdown() {
    assertLifecycleEntry();
    if (state !== "active") return;
    state = "destroying";
    destruction.resolve();
    for (const record of records.values()) {
      if (record.state === "installing") {
        record.abortPromise = record.controller.snapshot().state === "active"
          ? record.controller.close()
          : record.controller.abort();
        record.abortPromise.catch(() => {});
      }
    }
  }
  function retainedClosure(owners) {
    const retained = new Set();
    for (const record of records.values()) {
      if (!record.shutdownBlocked && !owners.some(owner => isScopeWithin(owner, record.controller.scope))) continue;
      for (const id of planDependencies(record.id, metadata, new Set()).order) retained.add(id);
    }
    return retained;
  }
  function drainShutdown(excluded = new Set()) {
    return enqueue(async () => {
      const failures = [];
      const withheld = new Set([...excluded, ...retainedClosure([])]);
      const remaining = [...records.values()].filter(record => !withheld.has(record.id) && !record.shutdownAttempted).sort((a, b) => b.sequence - a.sequence);
      while (remaining.length) {
        const index = remaining.findIndex(candidate => !remaining.some(other => other.metadata.requires.includes(candidate.id)));
        const [record] = remaining.splice(index < 0 ? 0 : index, 1);
        if (withheld.has(record.id)) continue;
        record.shutdownAttempted = true;
        const wasResidual = record.state === "quarantined";
        if (wasResidual && record.error) failures.push(record.error);
        try { await teardownRecord(record, { retry: true }); }
        catch (error) {
          failures.push(error);
          // Hold explicit prerequisites through the one eligible safe attempt.
          // A second drain must neither repeat this record nor close its closure.
          if (!wasResidual && record.state === "quarantined") {
            try { await teardownRecord(record, { retry: true }); }
            catch (retryError) { failures.push(retryError); }
          }
          if (records.has(record.id)) {
            record.shutdownBlocked = true;
            for (const id of planDependencies(record.id, metadata, new Set()).order) withheld.add(id);
          }
        }
      }
      return failures;
    });
  }
  function finishShutdown(blocked) {
    state = "destroyed";
    return Object.freeze([...blocked].filter(id => records.has(id)).map(id => frozenDiagnostic(records.get(id))));
  }

  function destroy() {
    if (callbackDepth > 0) return Promise.reject(pluginError(pluginErrorCodes.reentrant, "Runtime destruction is not allowed from setup or cleanup"));
    if (destroyPromise) return destroyPromise;
    const completion = deferred();
    destroyPromise = completion.promise;
    beginShutdown();
    enqueue(async () => {
      const failures = [];
      const remaining = [...records.values()].sort((a, b) => b.sequence - a.sequence);
      while (remaining.length) {
        const removableIndex = remaining.findIndex((candidate) => !remaining.some((other) => other.metadata.requires.includes(candidate.id)));
        const [record] = remaining.splice(removableIndex < 0 ? 0 : removableIndex, 1);
        try { await teardownRecord(record, { retry: true, skipPreflight: true }); } catch (error) { failures.push(error); }
      }
      state = "destroyed";
      if (failures.length) {
        throw pluginError(pluginErrorCodes.destroyFailed, "Plugin runtime destruction completed with cleanup failures", { errors: Object.freeze(failures) });
      }
    }).then(completion.resolve, completion.reject);
    return destroyPromise;
  }

  return Object.freeze({
    use,
    unuse,
    assertLifecycleEntry, beginShutdown, retainedClosure, drainShutdown, finishShutdown,
    destroy,
    has(id) { return records.get(id)?.state === "active"; },
    list() { return Object.freeze([...records.values()].filter((record) => record.state === "active").sort((a, b) => a.sequence - b.sequence).map((record) => record.id)); },
    inspect(id) {
      const record = records.get(id);
      if (record) return frozenDiagnostic(record);
      const detached = detachedSetups.get(id);
      return detached ? Object.freeze({
        id,
        state: detached.state,
        ...(detached.error ? { error: Object.freeze({ name: detached.error.name, message: detached.error.message, code: detached.error.code }) } : {}),
      }) : null;
    },
    get state() { return state; },
  });
}
