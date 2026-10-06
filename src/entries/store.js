import { createSubscriptionChannel } from "../extensions/subscriptions.js";
import { assertDomainKey } from "../domains/identity.js";
import { assertDeepImmutablePlainData } from "../domains/immutable.js";
import { SemanticError, semanticError, semanticErrorCodes } from "../domains/errors.js";

function entryView(record) {
  return Object.freeze({ id: record.id, domain: record.domainKey, visible: record.visible });
}

function domainView(record) {
  return Object.freeze({
    entry: entryView(record),
    revision: record.revision,
    snapshot: record.domainSnapshot,
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

export function createEntryStore({ applicationScope, domainRegistry, onError = () => {} } = {}) {
  if (!applicationScope || !domainRegistry) throw new TypeError("EntryStore requires an application Scope and DomainRegistry");
  const entries = new Map();
  const residuals = new Map();
  let nextEntryId = 1;
  let insertionSequence = 0;
  let mutationQueue = Promise.resolve();
  const channel = createSubscriptionChannel({ getSnapshot: list, onError });

  function enqueue(operation) {
    const result = mutationQueue.then(operation, operation);
    mutationQueue = result.catch(() => {});
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

  async function cleanupCandidate(prepared) {
    if (typeof prepared?.disposeNext === "function") await prepared.disposeNext();
  }

  async function create(requesterScope, domainKey, value, { visible = true } = {}) {
    requesterScope.assertAlive();
    applicationScope.assertAlive();
    assertDomainKey(domainKey);
    if (typeof visible !== "boolean") {
      throw semanticError(semanticErrorCodes.entryInvalid, "Entry visibility must be a boolean", { domainId: domainKey.id });
    }
    const id = nextEntryId++;
    const providerResolution = domainRegistry.resolve(domainKey);
    const lease = providerResolution.acquire(id);
    const entryScope = applicationScope.child({ label: `entry:${id}` });
    let prepared;
    try {
      prepared = await providerResolution.registration.provider.prepareCreate({
        entryId: id,
        value,
        entryScope,
        signal: entryScope.signal,
      });
      validatePreparedCreate(prepared, domainKey.id);
      requesterScope.assertAlive();
      applicationScope.assertAlive();
      if (!providerResolution.registration.owner.alive) {
        throw semanticError(semanticErrorCodes.providerUnavailable, `Provider for domain "${domainKey.id}" is unavailable`, { domainId: domainKey.id });
      }
      return await enqueue(async () => {
        requesterScope.assertAlive();
        applicationScope.assertAlive();
        if (!providerResolution.registration.owner.alive) {
          throw semanticError(semanticErrorCodes.providerUnavailable, `Provider for domain "${domainKey.id}" is unavailable`, { domainId: domainKey.id });
        }
        const record = {
          id,
          domainKey,
          visible,
          revision: 1,
          state: "active",
          insertionSequence: ++insertionSequence,
          scope: entryScope,
          providerRegistration: providerResolution.registration,
          providerLease: lease,
          instance: prepared.instance,
          domainSnapshot: prepared.snapshot,
          currentDispose: prepared.dispose ?? null,
        };
        entryScope.defer(() => record.currentDispose?.(), { label: `entry:${id}:provider-instance`, retry: "safe" });
        lease.promote();
        entries.set(id, record);
        const view = entryView(record);
        channel.deliver(Object.freeze({ type: "created", current: view }));
        return view;
      });
    } catch (cause) {
      let cleanupFailure = null;
      if (typeof prepared?.dispose === "function") {
        try { await prepared.dispose(); } catch (error) { cleanupFailure = error; }
      }
      try { await entryScope.dispose(); } catch (error) { cleanupFailure = error; }
      lease.release();
      if (cleanupFailure) {
        throw semanticError(semanticErrorCodes.cleanupFailed, `Entry "${id}" creation failed and cleanup was incomplete`, {
          cause: cleanupFailure,
          entryId: id,
          domainId: domainKey.id,
          committed: false,
          originalError: cause?.message,
        });
      }
      throw cause;
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
    assertDomainKey(domainKey);
    return enqueue(async () => {
      requesterScope.assertAlive();
      applicationScope.assertAlive();
      const record = requireRecord(id);
      assertDomain(record, domainKey);
      if (!Number.isInteger(expectedRevision) || expectedRevision !== record.revision) {
        throw semanticError(semanticErrorCodes.entryStaleRevision, `Entry "${id}" revision is stale`, {
          entryId: id,
          expectedRevision,
          actualRevision: record.revision,
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
            entryId: id,
            expectedRevision,
            actualRevision: record.revision,
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
        const event = Object.freeze({
          type: "domain-changed",
          entry: entryView(record),
          previousRevision,
          revision: record.revision,
          change: prepared.change ?? Object.freeze({}),
        });
        channel.deliver(event);
        try {
          await operationScope.dispose();
        } catch (cause) {
          throw semanticError(semanticErrorCodes.cleanupFailed, `Entry "${id}" update committed but operation cleanup failed`, {
            cause, committed: true, entryId: id, domainId: domainKey.id,
          });
        }
        const disposePrevious = prepared.disposePrevious ?? previousDispose;
        if (disposePrevious) {
          try { await disposePrevious(); } catch (cause) {
            throw semanticError(semanticErrorCodes.cleanupFailed, `Entry "${id}" update committed but previous state cleanup failed`, {
              cause, committed: true, entryId: id, domainId: domainKey.id,
            });
          }
        }
        return domainView(record);
      } catch (cause) {
        if (record.revision === expectedRevision) {
          try { await cleanupCandidate(prepared); } catch (error) { onError(error); }
        }
        try { await operationScope.dispose(); } catch (error) { onError(error); }
        throw cause;
      }
    });
  }

  function setVisible(requesterScope, id, visible) {
    requesterScope.assertAlive();
    if (typeof visible !== "boolean") {
      return Promise.reject(semanticError(semanticErrorCodes.entryInvalid, "Entry visibility must be a boolean", { entryId: id }));
    }
    return enqueue(() => {
      requesterScope.assertAlive();
      const record = requireRecord(id);
      if (record.visible === visible) return entryView(record);
      const previous = entryView(record);
      record.visible = visible;
      const current = entryView(record);
      channel.deliver(Object.freeze({ type: "visibility-changed", previous, current }));
      return current;
    });
  }

  function remove(requesterScope, id) {
    requesterScope.assertAlive();
    return enqueue(async () => {
      requesterScope.assertAlive();
      const record = entries.get(id);
      if (!record || record.state !== "active") return null;
      record.state = "removing";
      entries.delete(id);
      const previous = entryView(record);
      try {
        await record.scope.dispose();
      } catch (cause) {
        record.state = "cleanup-failed";
        residuals.set(id, record);
        const error = semanticError(semanticErrorCodes.cleanupFailed, `Entry "${id}" was removed but cleanup failed`, {
          cause, committed: true, entryId: id, domainId: record.domainKey.id,
        });
        onError(error);
        channel.deliver(Object.freeze({ type: "removed", previous }));
        throw error;
      }
      record.providerLease.release();
      record.state = "removed";
      channel.deliver(Object.freeze({ type: "removed", previous }));
      return previous;
    });
  }

  function subscribe(scope, listener, options) {
    return channel.subscribe(scope, listener, options);
  }

  function inspect() {
    return Object.freeze({
      nextEntryId,
      entries: Object.freeze([...entries.values()].filter((record) => record.state === "active").map((record) => Object.freeze({
        id: record.id,
        domainId: record.domainKey.id,
        visible: record.visible,
        revision: record.revision,
        providerRegistrationId: record.providerRegistration.id,
      }))),
      residuals: Object.freeze([...residuals.values()].map((record) => Object.freeze({
        id: record.id,
        domainId: record.domainKey.id,
        state: record.state,
        providerRegistrationId: record.providerRegistration.id,
      }))),
    });
  }

  return Object.freeze({ create, get, list, getDomainView, update, setVisible, remove, subscribe, inspect });
}
