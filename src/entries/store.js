import { forwardAbort, signalAborted, signalReason } from "../ownership/abort.js";
import { createSubscriptionChannel } from "../extensions/subscriptions.js";
import { assertDomainKey } from "../domains/identity.js";
import { assertDeepImmutablePlainData } from "../domains/immutable.js";
import { semanticError, semanticErrorCodes } from "../domains/errors.js";
import { isScopeWithin, retryScopeCleanup } from "../ownership/scope.js";

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
      || (value.revisioned !== undefined && typeof value.revisioned !== "boolean")
      || (value.change !== undefined && (value.change === null || typeof value.change !== "object"))
      || (value.disposePrevious !== undefined && value.disposePrevious !== null && typeof value.disposePrevious !== "function")
      || (value.disposeNext !== undefined && typeof value.disposeNext !== "function")) {
    throw semanticError(semanticErrorCodes.providerResultInvalid, `Provider for domain "${domainId}" returned an invalid mutation result`, { domainId });
  }
  assertDeepImmutablePlainData(value.nextSnapshot);
  if (value.change !== undefined) assertDeepImmutablePlainData(value.change, "change");
}

export function createEntryStore({ applicationController, domainRegistry, semanticLifecycle = null, entryRenderingLifecycle = null, onError = () => {} } = {}) {
  if (!applicationController?.scope || typeof applicationController.createChildController !== "function" || !domainRegistry) {
    throw new TypeError("EntryStore requires an application ScopeController and DomainRegistry");
  }
  const applicationScope = applicationController.scope;
  function renderingHook(name, ...args) {
    try { entryRenderingLifecycle?.[name]?.(...args); }
    catch (error) { try { onError(error); } catch {} }
  }
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
    const obligations = record.cleanupObligations.map((obligation) => Object.freeze({
      phase: obligation.phase,
      committed: true,
      cleanupError: errorSummary(obligation.cleanupError),
    }));
    const terminal = record.terminalResidual;
    return Object.freeze({
      id: record.id,
      domainId: record.domainKey.id,
      phase: terminal?.phase ?? "update",
      state: "cleanup-failed",
      providerRegistrationId: record.providerRegistration.id,
      committed: terminal ? terminal.phase === "deletion" : true,
      originalError: terminal?.originalError ? errorSummary(terminal.originalError) : null,
      cleanupError: terminal?.cleanupError ? errorSummary(terminal.cleanupError) : null,
      obligations: Object.freeze(obligations),
    });
  }

  function retainResidual(record, phase, originalError, cleanupError) {
    record.state = "cleanup-failed";
    record.terminalResidual = { phase, originalError, cleanupError };
    residuals.set(record.id, record);
  }

  function retainCleanupObligation(record, phase, cleanup, cleanupError, controller = null) {
    record.cleanupObligations.push({ phase, cleanup, cleanupError, controller });
    residuals.set(record.id, record);
  }

  function pruneCompletedControlledObligations(record) {
    record.cleanupObligations = record.cleanupObligations.filter((obligation) => (
      !obligation.controller || obligation.controller.snapshot().state !== "closed"
    ));
    for (const obligation of record.cleanupObligations) {
      const residual = obligation.controller?.snapshot().residuals[0];
      if (residual?.cause) obligation.cleanupError = residual.cause;
    }
  }

  function finishResidualState(record) {
    pruneCompletedControlledObligations(record);
    if (record.terminalResidual || record.cleanupObligations.length > 0) {
      residuals.set(record.id, record);
      return false;
    }
    residuals.delete(record.id);
    if (record.state !== "active") {
      record.providerLease.release();
      record.state = "removed";
    }
    return true;
  }

  async function create(requesterScope, domainKey, value, { visible = true, signal } = {}) {
    requesterScope.assertAlive();
    assertMutationAllowed();
    assertDomainKey(domainKey);
    if (typeof visible !== "boolean") {
      throw semanticError(semanticErrorCodes.entryInvalid, "Entry visibility must be a boolean", { domainId: domainKey.id });
    }
    if (signal !== undefined) {
      try { signalAborted(signal); }
      catch {
        throw semanticError(semanticErrorCodes.entryInvalid, "Creation signal must be an AbortSignal", { domainId: domainKey.id });
      }
    }
    const abortError = (entryId, cause) => semanticError(
      semanticErrorCodes.entryCreationAborted, "Entry creation was cancelled", {
        domainId: domainKey.id,
        ...(entryId === undefined ? {} : { entryId }),
        cause: cause ?? signalReason(signal),
        committed: false,
      },
    );
    if (signal !== undefined && signalAborted(signal)) throw abortError();
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
      terminalResidual: null,
      cleanupObligations: [],
      presentationBindings: new Set(),
    };
    let forwarding = null;
    let committed = false;
    try {
      // Reserve the disposer handoff before provider code or cancellation can
      // close the destination. Closing still revokes authority immediately.
      entryScope.defer(() => record.currentDispose?.(), { label: `entry:${id}:provider-instance`, retry: "safe" });
      forwarding = forwardAbort([
        entryScope.signal, requesterScope.signal, applicationScope.signal,
        ...(signal === undefined ? [] : [signal]),
      ]);
      const preparation = Promise.resolve().then(async () => {
        // Setup and provider invocation are separated by a microtask. Never
        // acquire provider resources after any destination/caller authority dies.
        requesterScope.assertAlive();
        assertMutationAllowed();
        entryScope.assertAlive();
        if (!providerResolution.registration.owner.alive) {
          throw semanticError(semanticErrorCodes.providerUnavailable, `Provider for domain "${domainKey.id}" is unavailable`, { domainId: domainKey.id });
        }
        if (signal !== undefined && signalAborted(signal)) throw abortError(id);
        const prepared = await providerResolution.registration.provider.prepareCreate({
          entryId: id, value, entryScope, signal: forwarding.signal,
        });
        record.currentDispose = typeof prepared?.dispose === "function" ? prepared.dispose : null;
        return prepared;
      });
      entryScope.track(preparation, { label: `entry:${id}:preparation`, await: true });
      const prepared = await preparation;
      if (signal !== undefined && signalAborted(signal)) throw abortError(id);
      validatePreparedCreate(prepared, domainKey.id);
      requesterScope.assertAlive();
      assertMutationAllowed();
      if (!providerResolution.registration.owner.alive) {
        throw semanticError(semanticErrorCodes.providerUnavailable, `Provider for domain "${domainKey.id}" is unavailable`, { domainId: domainKey.id });
      }
      entryScope.assertAlive();
      // Read provider-owned properties before the final guard: getters must
      // never execute inside the callback-free publication block.
      const instance = prepared.instance;
      const snapshot = prepared.snapshot;
      assertDeepImmutablePlainData(snapshot);
      requesterScope.assertAlive();
      assertMutationAllowed();
      entryScope.assertAlive();
      if (!providerResolution.registration.owner.alive) {
        throw semanticError(semanticErrorCodes.providerUnavailable, `Provider for domain "${domainKey.id}" is unavailable`, { domainId: domainKey.id });
      }
      if (signal !== undefined && signalAborted(signal)) throw abortError(id);
      record.instance = instance;
      record.domainSnapshot = snapshot;
      record.revision = 1;
      record.state = "active";
      record.insertionSequence = ++insertionSequence;
      lease.promote();
      entries.set(id, record);
      committed = true;
      forwarding.dispose();
      renderingHook("afterCreated", record);
      const view = entryView(record);
      channel.deliver(Object.freeze({ type: "created", current: view }));
      return view;
    } catch (failure) {
      // Post-publication failure/cancellation cannot roll back an app-owned entry.
      if (committed) throw failure;
      let cleanupError = null;
      try { await entryController.close(); } catch (error) { cleanupError = error; }
      const originalError = signal !== undefined && signalAborted(signal)
        ? (failure?.code === semanticErrorCodes.entryCreationAborted ? failure : abortError(id, failure))
        : failure;
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
    } finally {
      forwarding?.dispose();
    }
  }

  function getDomainView(id, domainKey) {
    assertDomainKey(domainKey);
    const record = requireRecord(id);
    assertDomain(record, domainKey);
    return domainView(record);
  }

  // Privileged semantic composition only; never exposed through EntryFacade.
  function getSemanticTarget(id, domainKey) {
    assertDomainKey(domainKey);
    const record = requireRecord(id);
    assertDomain(record, domainKey);
    return Object.freeze({
      id: record.id, domainKey: record.domainKey, revision: record.revision,
      instance: record.instance, providerRegistration: record.providerRegistration,
    });
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
      const operationController = record.scopeController.createChildController({ label: `entry:${id}:update:${record.revision}` });
      const operationScope = operationController.scope;
      let prepared;
      let committed = false;
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
        applicationScope.assertAlive();
        if (!record.providerRegistration.owner.alive) {
          throw semanticError(semanticErrorCodes.providerUnavailable, "Domain provider lost mutation authority", { entryId: id, domainId: domainKey.id });
        }
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
        const revisioned = prepared.revisioned !== false;
        if (!revisioned && prepared.nextSnapshot !== record.domainSnapshot) {
          throw semanticError(semanticErrorCodes.providerResultInvalid, `Provider for domain "${domainKey.id}" changed its public snapshot without revision`, {
            entryId: id,
            domainId: domainKey.id,
          });
        }
        const previousRevision = record.revision;
        const previousDispose = record.currentDispose;
        const commit = () => {
          const effect = semanticLifecycle?.prepareDomainCommit({
            record, prepared, command, nextRevision: previousRevision + (revisioned ? 1 : 0),
          });
          const presentationEffect = entryRenderingLifecycle?.prepareDomainCommit?.({
            record, prepared, command, nextRevision: previousRevision + (revisioned ? 1 : 0),
          });
          requesterScope.assertAlive();
          applicationScope.assertAlive();
          record.instance = prepared.nextInstance;
          record.domainSnapshot = prepared.nextSnapshot;
          record.currentDispose = prepared.disposeNext ?? null;
          if (revisioned) record.revision += 1;
          effect?.commit();
          presentationEffect?.commit();
          committed = true;
          if (revisioned) {
            renderingHook("afterDomainCommit", record, prepared.change ?? Object.freeze({}));
            channel.deliver(Object.freeze({
              type: "domain-changed",
              entry: entryView(record),
              previousRevision,
              revision: record.revision,
              change: prepared.change ?? Object.freeze({}),
            }));
          }
          presentationEffect?.notify();
          effect?.notify();
        };
        if (semanticLifecycle) semanticLifecycle.runCommit(commit);
        else commit();
        const cleanupErrors = [];
        try {
          await operationController.close();
        } catch (cleanupError) {
          retainCleanupObligation(
            record,
            "update-operation-scope",
            () => operationController.retryCleanup(),
            cleanupError,
            operationController,
          );
          cleanupErrors.push(cleanupError);
        }
        const disposePrevious = prepared.disposePrevious !== undefined ? prepared.disposePrevious : previousDispose;
        if (disposePrevious) {
          try {
            await disposePrevious();
          } catch (cleanupError) {
            retainCleanupObligation(record, "update-previous-instance", disposePrevious, cleanupError);
            cleanupErrors.push(cleanupError);
          }
        }
        if (cleanupErrors.length > 0) {
          const cause = cleanupErrors[0];
          throw semanticError(semanticErrorCodes.cleanupFailed, `Entry "${id}" update committed but cleanup failed`, {
            cause,
            committed: true,
            entryId: id,
            domainId: domainKey.id,
            failures: Object.freeze(cleanupErrors.map(errorSummary)),
          });
        }
        return domainView(record);
      } catch (cause) {
        if (committed) throw cause;
        if (record.revision === expectedRevision && typeof prepared?.disposeNext === "function") {
          try { await prepared.disposeNext(); } catch (error) { onError(error); }
        }
        try { await operationController.close(); } catch (error) { onError(error); }
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
      renderingHook("afterVisibilityCommit", record);
      const current = entryView(record);
      channel.deliver(Object.freeze({ type: "visibility-changed", previous, current }));
      return current;
    });
  }

  function bindPresentationLifetime(consumer, id, { scope } = {}) {
    consumer.assertAlive();
    applicationScope.assertAlive();
    if (scope === consumer || !isScopeWithin(scope, consumer)) {
      throw new TypeError("Presentation lifetime requires a consumer-owned child Scope");
    }
    scope.assertAlive();
    const record = requireRecord(id);
    let closePromise = null;
    const binding = { close() {
      if (!closePromise) {
        // dispose revokes authority synchronously; this association never
        // transfers ownership or admits arbitrary plugin work.
        // Reserve the join before abort callbacks can reenter this lease.
        let resolveClose, rejectClose;
        closePromise = new Promise((resolve, reject) => {
          resolveClose = resolve; rejectClose = reject;
        });
        void closePromise.then(() => record.presentationBindings.delete(binding), () => {});
        try { void scope.dispose().then(resolveClose, rejectClose); }
        catch (error) { rejectClose(error); }
      }
      return closePromise;
    } };
    // Entry cleanup retains failed captured-scope joins. An explicit retry
    // delegates to the existing Scope machinery: only safe failed records run.
    let joined = false;
    record.scope.defer(() => {
      const operation = joined ? retryScopeCleanup(scope) : binding.close();
      joined = true;
      return operation;
    }, { label: `entry:${id}:bound-presentation`, retry: "safe" });
    record.presentationBindings.add(binding);
    return Object.freeze({ dispose: () => binding.close().then(() => {}) });
  }

  async function removeRecord(record, { notify = true } = {}) {
    record.state = "removing";
    entries.delete(record.id);
    semanticLifecycle?.afterLogicalRemoval(record);
    renderingHook("afterLogicalRemoval", record, { deferSuppressionNotification: true });
    const presentationAttempts = [...record.presentationBindings].map(binding => binding.close());
    renderingHook("afterPresentationWithdrawal", record);
    const previous = entryView(record);
    let cleanupError = null;
    // All independent presentation attempts begin before awaiting any one.
    // Remaining entry resources are still attempted after presentation failure.
    await Promise.allSettled(presentationAttempts);
    try { await record.scopeController.close(); } catch (error) { cleanupError = error; }
    pruneCompletedControlledObligations(record);
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
    record.state = "cleanup-failed";
    finishResidualState(record);
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
      const phases = [];
      const failures = [];
      const retriedTerminalController = Boolean(record.terminalResidual);
      if (record.terminalResidual) {
        phases.push(record.terminalResidual.phase);
        try {
          await record.scopeController.retryCleanup();
          record.terminalResidual = null;
        } catch (cleanupError) {
          record.terminalResidual.cleanupError = cleanupError;
          failures.push(cleanupError);
        }
        pruneCompletedControlledObligations(record);
      }
      for (const obligation of [...record.cleanupObligations]) {
        if (!record.cleanupObligations.includes(obligation)) continue;
        phases.push(obligation.phase);
        if (obligation.controller?.snapshot().state === "closed") {
          record.cleanupObligations.splice(record.cleanupObligations.indexOf(obligation), 1);
          continue;
        }
        if (retriedTerminalController && obligation.controller) continue;
        try {
          await obligation.cleanup();
          record.cleanupObligations.splice(record.cleanupObligations.indexOf(obligation), 1);
        } catch (cleanupError) {
          obligation.cleanupError = cleanupError;
          failures.push(cleanupError);
        }
      }
      if (failures.length > 0) {
        residuals.set(id, record);
        const cleanupError = failures[0];
        const error = semanticError(semanticErrorCodes.cleanupFailed, `Entry "${id}" residual cleanup remains incomplete`, {
          cause: cleanupError,
          committed: record.terminalResidual?.phase !== "creation",
          entryId: id,
          domainId: record.domainKey.id,
          phases: Object.freeze(phases),
          failures: Object.freeze(failures.map(errorSummary)),
          ...(record.terminalResidual?.originalError ? { originalError: errorSummary(record.terminalResidual.originalError) } : {}),
        });
        onError(error);
        throw error;
      }
      finishResidualState(record);
      const uniquePhases = [...new Set(phases)];
      const result = Object.freeze({ id, phase: uniquePhases.length === 1 ? uniquePhases[0] : "multiple", cleaned: true });
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

  return Object.freeze({ create, get, list, getDomainView, getSemanticTarget, update, setVisible, remove, retryCleanup, clear, subscribe, bindPresentationLifetime, inspect });
}
