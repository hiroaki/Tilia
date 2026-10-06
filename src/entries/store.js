import { createSubscriptionChannel } from "../extensions/subscriptions.js";
import { assertDomainKey } from "../domains/identity.js";
import { assertDeepImmutablePlainData } from "../domains/immutable.js";
import { semanticError, semanticErrorCodes } from "../domains/errors.js";

function entryView(record) {
  return Object.freeze({ id: record.id, domain: record.domainKey, visible: record.visible });
}

function domainView(record) {
  return Object.freeze({ entry: entryView(record), revision: record.revision, snapshot: record.domainSnapshot });
}

function errorSummary(error) {
  return Object.freeze({
    name: typeof error?.name === "string" ? error.name : "Error",
    message: typeof error?.message === "string" ? error.message : String(error),
    ...(typeof error?.code === "string" ? { code: error.code } : {}),
  });
}

function validatePreparedCreate(value, domainId) {
  if (!value || typeof value !== "object" || !("instance" in value) || !("snapshot" in value)
      || (value.dispose !== undefined && typeof value.dispose !== "function")) {
    throw semanticError(semanticErrorCodes.providerResultInvalid, `Provider for domain "${domainId}" returned an invalid creation result`, { domainId });
  }
  assertDeepImmutablePlainData(value.snapshot);
}

function validatePreparedMutation(value, domainId) {
  if (!value || typeof value !== "object" || typeof value.changed !== "boolean") {
    throw semanticError(semanticErrorCodes.providerResultInvalid, `Provider for domain "${domainId}" returned an invalid mutation result`, { domainId });
  }
  if (!value.changed) return;
  if (!("nextInstance" in value) || !("nextSnapshot" in value)
      || (value.change !== undefined && (value.change === null || typeof value.change !== "object"))
      || (value.disposePrevious !== undefined && typeof value.disposePrevious !== "function")
      || (value.disposeNext !== undefined && typeof value.disposeNext !== "function")) {
    throw semanticError(semanticErrorCodes.providerResultInvalid, `Provider for domain "${domainId}" returned an invalid mutation result`, { domainId });
  }
  assertDeepImmutablePlainData(value.nextSnapshot);
  if (value.change !== undefined) assertDeepImmutablePlainData(value.change, "change");
}

export function createEntryStore({ applicationController, domainRegistry, onError = () => {} } = {}) {
  if (!applicationController?.scope || typeof applicationController.createChildController !== "function" || !domainRegistry) {
    throw new TypeError("EntryStore requires an application ScopeController and DomainRegistry");
  }
  const applicationScope = applicationController.scope;
  const entries = new Map();
  const residuals = new Map();
  const queues = new Map();
  let nextEntryId = 1;
  let insertionSequence = 0;
  let clearing = false;
  const channel = createSubscriptionChannel({ getSnapshot: list, onError });

  function enqueueFor(entryId, operation) {
    const previous = queues.get(entryId) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.catch(() => {});
    queues.set(entryId, tail);
    tail.then(
      () => { if (queues.get(entryId) === tail) queues.delete(entryId); },
      () => { if (queues.get(entryId) === tail) queues.delete(entryId); },
    );
    return result;
  }

  function list() {
    return Object.freeze([...entries.values()]
      .filter((record) => record.state === "active")
      .sort((left, right) => left.insertionSequence - right.insertionSequence)
      .map(entryView));
  }

  function get(id) {
    const record = entries.get(id);
    return record?.state === "active" ? entryView(record) : null;
  }

  function requireRecord(id) {
    const record = entries.get(id);
    if (!record || record.state !== "active") {
      throw semanticError(semanticErrorCodes.entryNotFound, `Entry "${id}" was not found`, { entryId: id });
    }
    return record;
  }

  function assertDomain(record, domainKey) {
    if (record.domainKey !== domainKey) {
      throw semanticError(semanticErrorCodes.entryDomainMismatch, `Entry "${record.id}" does not belong to domain "${domainKey.id}"`, {
        entryId: record.id,
        expectedDomainId: domainKey.id,
        actualDomainId: record.domainKey.id,
      });
    }
  }

  function assertMutationAllowed() {
    applicationScope.assertAlive();
    if (clearing) throw semanticError(semanticErrorCodes.entryRemoving, "EntryStore is clearing entries");
  }

  function residualDiagnostic(record) {
    return Object.freeze({
      id: record.id,
      domainId: record.domainKey.id,
      phase: record.residualPhase,
      state: "cleanup-failed",
      providerRegistrationId: record.providerRegistration.id,
      originalError: record.originalError ? errorSummary(record.originalError) : null,
      cleanupError: record.cleanupError ? errorSummary(record.cleanupError) : null,
    });
  }

  function retainResidual(record, phase, originalError, cleanupError) {
    record.state = "cleanup-failed";
    record.residualPhase = phase;
    record.originalError = originalError;
    record.cleanupError = cleanupError;
    residuals.set(record.id, record);
  }

  async function create(requesterScope, domainKey, value, { visible = true } = {}) {
    requesterScope.assertAlive();
    assertMutationAllowed();
    assertDomainKey(domainKey);
    if (typeof visible !== "boolean") {
      throw semanticError(semanticErrorCodes.entryInvalid, "Entry visibility must be a boolean", { domainId: domainKey.id });
    }
    const id = nextEntryId++;
    const providerResolution = domainRegistry.resolve(domainKey);
    const lease = providerResolution.acquire(id);
    const entryController = applicationController.createChildController({ label: `entry:${id}` });
    const entryScope = entryController.scope;
    const record = {
      id,
      domainKey,
      visible,
      revision: 0,
      state: "preparing",
      insertionSequence: 0,
      scope: entryScope,
      scopeController: entryController,
      providerRegistration: providerResolution.registration,
      providerLease: lease,
      instance: null,
      domainSnapshot: null,
      currentDispose: null,
      residualPhase: null,
      originalError: null,
      cleanupError: null,
    };
    try {
      const prepared = await providerResolution.registration.provider.prepareCreate({
        entryId: id,
        value,
        entryScope,
        signal: entryScope.signal,
      });
      record.currentDispose = typeof prepared?.dispose === "function" ? prepared.dispose : null;
      entryScope.defer(() => record.currentDispose?.(), { label: `entry:${id}:provider-instance`, retry: "safe" });
      validatePreparedCreate(prepared, domainKey.id);
      requesterScope.assertAlive();
      assertMutationAllowed();
      if (!providerResolution.registration.owner.alive) {
        throw semanticError(semanticErrorCodes.providerUnavailable, `Provider for domain "${domainKey.id}" is unavailable`, { domainId: domainKey.id });
      }
      record.instance = prepared.instance;
      record.domainSnapshot = prepared.snapshot;
      record.revision = 1;
      record.state = "active";
      record.insertionSequence = ++insertionSequence;
      lease.promote();
      entries.set(id, record);
      const view = entryView(record);
      channel.deliver(Object.freeze({ type: "created", current: view }));
      return view;
    } catch (originalError) {
      let cleanupError = null;
      try { await entryController.close(); } catch (error) { cleanupError = error; }
      if (cleanupError) {
        retainResidual(record, "creation", originalError, cleanupError);
        const error = semanticError(semanticErrorCodes.cleanupFailed, `Entry "${id}" creation failed and cleanup was incomplete`, {
          cause: cleanupError,
          committed: false,
          entryId: id,
          domainId: domainKey.id,
          originalError: errorSummary(originalError),
        });
        onError(error);
        throw error;
      }
      lease.release();
      throw originalError;
    }
  }

  function getDomainView(id, domainKey) {
    assertDomainKey(domainKey);
    const record = requireRecord(id);
    assertDomain(record, domainKey);
    return domainView(record);
  }

  function update(requesterScope, id, domainKey, command, { expectedRevision } = {}) {
    requesterScope.assertAlive();
    assertMutationAllowed();
    assertDomainKey(domainKey);
    return enqueueFor(id, async () => {
      requesterScope.assertAlive();
      applicationScope.assertAlive();
      const record = requireRecord(id);
      assertDomain(record, domainKey);
      if (!Number.isInteger(expectedRevision) || expectedRevision !== record.revision) {
        throw semanticError(semanticErrorCodes.entryStaleRevision, `Entry "${id}" revision is stale`, {
          entryId: id, expectedRevision, actualRevision: record.revision,
        });
      }
      const operationScope = record.scope.child({ label: `entry:${id}:update:${record.revision}` });
      let prepared;
      try {
        prepared = await record.providerRegistration.provider.prepareMutation({
          entryId: id,
          currentInstance: record.instance,
          command,
          expectedRevision,
          operationScope,
          signal: operationScope.signal,
        });
        validatePreparedMutation(prepared, domainKey.id);
        requesterScope.assertAlive();
        if (record.state !== "active" || entries.get(id) !== record) {
          throw semanticError(semanticErrorCodes.entryRemoving, `Entry "${id}" is being removed`, { entryId: id });
        }
        if (record.revision !== expectedRevision) {
          throw semanticError(semanticErrorCodes.entryStaleRevision, `Entry "${id}" revision is stale`, {
            entryId: id, expectedRevision, actualRevision: record.revision,
          });
        }
        if (!prepared.changed) {
          await operationScope.dispose();
          return domainView(record);
        }
        const previousRevision = record.revision;
        const previousDispose = record.currentDispose;
        record.instance = prepared.nextInstance;
        record.domainSnapshot = prepared.nextSnapshot;
        record.currentDispose = prepared.disposeNext ?? null;
        record.revision += 1;
        channel.deliver(Object.freeze({
          type: "domain-changed",
          entry: entryView(record),
          previousRevision,
          revision: record.revision,
          change: prepared.change ?? Object.freeze({}),
        }));
        try {
          await operationScope.dispose();
          const disposePrevious = prepared.disposePrevious ?? previousDispose;
          if (disposePrevious) await disposePrevious();
        } catch (cause) {
          throw semanticError(semanticErrorCodes.cleanupFailed, `Entry "${id}" update committed but cleanup failed`, {
            cause, committed: true, entryId: id, domainId: domainKey.id,
          });
        }
        return domainView(record);
      } catch (cause) {
        if (record.revision === expectedRevision && typeof prepared?.disposeNext === "function") {
          try { await prepared.disposeNext(); } catch (error) { onError(error); }
        }
        try { await operationScope.dispose(); } catch (error) { onError(error); }
        throw cause;
      }
    });
  }

  function setVisible(requesterScope, id, visible) {
    requesterScope.assertAlive();
    assertMutationAllowed();
    if (typeof visible !== "boolean") {
      return Promise.reject(semanticError(semanticErrorCodes.entryInvalid, "Entry visibility must be a boolean", { entryId: id }));
    }
    return enqueueFor(id, () => {
      requesterScope.assertAlive();
      applicationScope.assertAlive();
      const record = requireRecord(id);
      if (record.visible === visible) return entryView(record);
      const previous = entryView(record);
      record.visible = visible;
      const current = entryView(record);
      channel.deliver(Object.freeze({ type: "visibility-changed", previous, current }));
      return current;
    });
  }

  async function removeRecord(record, { notify = true } = {}) {
    record.state = "removing";
    entries.delete(record.id);
    const previous = entryView(record);
    let cleanupError = null;
    try { await record.scopeController.close(); } catch (error) { cleanupError = error; }
    if (cleanupError) {
      retainResidual(record, "deletion", null, cleanupError);
      const error = semanticError(semanticErrorCodes.cleanupFailed, `Entry "${record.id}" was removed but cleanup failed`, {
        cause: cleanupError,
        committed: true,
        entryId: record.id,
        domainId: record.domainKey.id,
      });
      onError(error);
      if (notify) channel.deliver(Object.freeze({ type: "removed", previous }));
      throw error;
    }
    record.providerLease.release();
    record.state = "removed";
    if (notify) channel.deliver(Object.freeze({ type: "removed", previous }));
    return previous;
  }

  function remove(requesterScope, id) {
    requesterScope.assertAlive();
    assertMutationAllowed();
    return enqueueFor(id, async () => {
      requesterScope.assertAlive();
      applicationScope.assertAlive();
      const record = entries.get(id);
      if (!record || record.state !== "active") return null;
      return removeRecord(record);
    });
  }

  function retryCleanup(requesterScope, id) {
    requesterScope.assertAlive();
    applicationScope.assertAlive();
    return enqueueFor(id, async () => {
      requesterScope.assertAlive();
      const record = residuals.get(id);
      if (!record) return null;
      try {
        await record.scopeController.retryCleanup();
      } catch (cleanupError) {
        record.cleanupError = cleanupError;
        const error = semanticError(semanticErrorCodes.cleanupFailed, `Entry "${id}" residual cleanup remains incomplete`, {
          cause: cleanupError,
          committed: record.residualPhase === "deletion",
          entryId: id,
          domainId: record.domainKey.id,
          phase: record.residualPhase,
          ...(record.originalError ? { originalError: errorSummary(record.originalError) } : {}),
        });
        onError(error);
        throw error;
      }
      const result = Object.freeze({ id, phase: record.residualPhase, cleaned: true });
      record.providerLease.release();
      residuals.delete(id);
      record.state = "removed";
      return result;
    });
  }

  async function clear(requesterScope) {
    requesterScope.assertAlive();
    assertMutationAllowed();
    clearing = true;
    const targets = [...entries.values()]
      .filter((record) => record.state === "active")
      .sort((left, right) => right.insertionSequence - left.insertionSequence);
    const removed = Object.freeze(targets.map(entryView));
    const failures = [];
    try {
      for (const record of targets) {
        try {
          await enqueueFor(record.id, async () => {
            if (record.state !== "active" || entries.get(record.id) !== record) return null;
            return removeRecord(record, { notify: false });
          });
        } catch (error) {
          failures.push(error);
        }
      }
      channel.deliver(Object.freeze({ type: "cleared", removed }));
    } finally {
      clearing = false;
    }
    if (failures.length > 0) {
      throw semanticError(semanticErrorCodes.cleanupFailed, "EntryStore clear completed with cleanup failures", {
        committed: true,
        failures: Object.freeze(failures.map(errorSummary)),
      });
    }
    return removed;
  }

  function subscribe(scope, listener, options) {
    return channel.subscribe(scope, listener, options);
  }

  function inspect() {
    return Object.freeze({
      nextEntryId,
      queueEntryIds: Object.freeze([...queues.keys()].sort((a, b) => a - b)),
      entries: Object.freeze([...entries.values()]
        .filter((record) => record.state === "active")
        .sort((left, right) => left.insertionSequence - right.insertionSequence)
        .map((record) => Object.freeze({
          id: record.id,
          domainId: record.domainKey.id,
          visible: record.visible,
          revision: record.revision,
          providerRegistrationId: record.providerRegistration.id,
        }))),
      residuals: Object.freeze([...residuals.values()]
        .sort((left, right) => left.id - right.id)
        .map(residualDiagnostic)),
    });
  }

  return Object.freeze({ create, get, list, getDomainView, update, setVisible, remove, retryCleanup, clear, subscribe, inspect });
}
