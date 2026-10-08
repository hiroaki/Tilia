import { createSubscriptionChannel } from "../extensions/subscriptions.js";
import { assertDomainKey } from "./identity.js";
import { semanticError, semanticErrorCodes } from "./errors.js";

let nextRegistrationId = 1;

function validateProvider(provider, domainId) {
  if (!provider || typeof provider !== "object"
      || typeof provider.prepareCreate !== "function"
      || typeof provider.prepareMutation !== "function"
      || typeof provider.getSnapshot !== "function") {
    throw semanticError(semanticErrorCodes.providerInvalid, `Invalid provider for domain "${domainId}"`, { domainId });
  }
  if (provider.selection !== undefined && (!provider.selection ||
      ["canonicalize", "equals", "resolve", "reconcile"].some((method) => typeof provider.selection[method] !== "function"))) {
    throw semanticError(semanticErrorCodes.providerInvalid, `Invalid selection adapter for domain "${domainId}"`, { domainId });
  }
}

export function createDomainRegistry({ onError = () => {} } = {}) {
  const providers = new Map();
  const pending = new Map();
  const channels = new Map();

  function visible(key) {
    const record = providers.get(key);
    return record?.owner.alive ? record : null;
  }

  function availability(key) {
    return Object.freeze({ domain: key, available: !!visible(key) });
  }

  function channelFor(key) {
    let channel = channels.get(key);
    if (!channel) {
      channel = createSubscriptionChannel({ getSnapshot: () => availability(key), onError });
      channels.set(key, channel);
    }
    return channel;
  }

  function inUseError(record) {
    const entryIds = [...record.leases.values()]
      .filter((lease) => lease.purpose === "entry")
      .map((lease) => lease.entryId)
      .sort((left, right) => left - right);
    const creationCount = [...record.leases.values()].filter((lease) => lease.purpose === "creation").length;
    return semanticError(
      semanticErrorCodes.providerInUse,
      `Provider for domain "${record.key.id}" is in use`,
      { domainId: record.key.id, creationCount, entryCount: entryIds.length, entryIds },
    );
  }

  function assertRemovable(record) {
    if (record.leases.size > 0) throw inUseError(record);
  }

  function acquire(record, entryId) {
    if (!record.owner.alive || providers.get(record.key) !== record) {
      throw semanticError(semanticErrorCodes.providerUnavailable, `Provider for domain "${record.key.id}" is unavailable`, { domainId: record.key.id });
    }
    const token = Object.freeze({});
    const lease = { purpose: "creation", entryId, released: false };
    record.leases.set(token, lease);
    return Object.freeze({
      registration: record,
      promote() {
        if (lease.released) throw semanticError(semanticErrorCodes.providerUnavailable, "Provider lease was released", { domainId: record.key.id, entryId });
        lease.purpose = "entry";
      },
      release() {
        if (lease.released) return;
        lease.released = true;
        record.leases.delete(token);
      },
    });
  }

  function resolve(key) {
    assertDomainKey(key);
    const record = visible(key);
    if (!record) {
      throw semanticError(semanticErrorCodes.providerUnavailable, `Provider for domain "${key.id}" is unavailable`, { domainId: key.id });
    }
    return Object.freeze({ registration: record, acquire: (entryId) => acquire(record, entryId) });
  }

  function createFacade({ scope, stage, enqueuePostCommit = (callback) => callback(), addTeardownPreflight = null }) {
    return Object.freeze({
      provide(key, provider) {
        scope.assertAlive();
        assertDomainKey(key);
        validateProvider(provider, key.id);
        const record = {
          id: nextRegistrationId++,
          key,
          provider,
          owner: scope,
          leases: new Map(),
        };
        if (!pending.has(key)) pending.set(key, new Set());
        pending.get(key).add(record);
        const stagedHandle = stage({
          label: `domain:${key.id}`,
          preflight() {
            if (visible(key) || [...pending.get(key)].some((candidate) => candidate !== record && candidate.owner.alive)) {
              throw semanticError(semanticErrorCodes.providerDuplicate, `Domain "${key.id}" already has a provider`, { domainId: key.id });
            }
          },
          commit() {
            providers.set(key, record);
            enqueuePostCommit(() => channelFor(key).deliver(availability(key)));
          },
          dispose({ committed }) {
            pending.get(key)?.delete(record);
            if (pending.get(key)?.size === 0) pending.delete(key);
            if (!committed || providers.get(key) !== record) return;
            assertRemovable(record);
            providers.delete(key);
            channelFor(key).deliver(availability(key));
          },
          retry: "safe",
        });
        addTeardownPreflight?.(() => assertRemovable(record));
        return Object.freeze({ domain: key, registrationId: record.id, dispose: async () => {
          assertRemovable(record);
          await stagedHandle.dispose();
        } });
      },
      has(key) {
        scope.assertAlive();
        assertDomainKey(key);
        return !!visible(key);
      },
      subscribe(key, listener, options) {
        scope.assertAlive();
        assertDomainKey(key);
        return channelFor(key).subscribe(scope, listener, options);
      },
    });
  }

  function inspect() {
    return Object.freeze([...providers.values()]
      .filter((record) => record.owner.alive)
      .sort((left, right) => left.key.id.localeCompare(right.key.id))
      .map((record) => {
        const leases = [...record.leases.values()];
        const entryIds = leases.filter((lease) => lease.purpose === "entry").map((lease) => lease.entryId).sort((a, b) => a - b);
        return Object.freeze({
          domainId: record.key.id,
          registrationId: record.id,
          alive: true,
          creationCount: leases.filter((lease) => lease.purpose === "creation").length,
          entryCount: entryIds.length,
          entryIds: Object.freeze(entryIds),
        });
      }));
  }

  return Object.freeze({ createFacade, resolve, inspect, leasedOwners: () => [...providers.values()].filter(record => record.leases.size > 0).map(record => record.owner) });
}
