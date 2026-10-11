import { extensionError, extensionErrorCodes } from "./errors.js";
import { createSubscriptionChannel } from "./subscriptions.js";

const serviceKeys = new WeakSet();

export function defineServiceKey({ id, validate = null, createFacade }) {
  if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)
      || typeof createFacade !== "function" || (validate !== null && typeof validate !== "function")) {
    throw extensionError(extensionErrorCodes.serviceKeyInvalid, "Invalid typed service key", { serviceId: id });
  }
  const key = Object.freeze({ id, validate, createFacade });
  serviceKeys.add(key);
  return key;
}

function assertKey(key) {
  if (!key || !serviceKeys.has(key)) {
    throw extensionError(extensionErrorCodes.serviceKeyInvalid, "A typed service key is required");
  }
}

export function createServiceRegistry({ onError = () => {} } = {}) {
  const providers = new Map();
  const pending = new Map();
  const channels = new Map();

  function visible(key) {
    const record = providers.get(key);
    return record?.owner.alive ? record : null;
  }

  function snapshot(key) {
    return Object.freeze({ id: key.id, available: !!visible(key) });
  }

  function channelFor(key) {
    let channel = channels.get(key);
    if (!channel) {
      channel = createSubscriptionChannel({ getSnapshot: () => snapshot(key), onError });
      channels.set(key, channel);
    }
    return channel;
  }

  function createFacade(key, consumer) {
    const record = visible(key);
    if (!record) return null;
    const assertAvailable = () => {
      consumer.assertAlive();
      if (!record.owner.alive || providers.get(key) !== record) {
        throw extensionError(extensionErrorCodes.unavailable, `Service "${key.id}" is unavailable`, { serviceId: key.id });
      }
    };
    return Object.freeze(key.createFacade({ implementation: record.implementation, assertAvailable }));
  }

  function createFacadeForOwner({ scope, stage, enqueuePostCommit }) {
    return Object.freeze({
      provide(key, implementation) {
        scope.assertAlive();
        assertKey(key);
        if (key.validate && !key.validate(implementation)) {
          throw extensionError(extensionErrorCodes.serviceKeyInvalid, `Invalid implementation for service "${key.id}"`, { serviceId: key.id });
        }
        const record = { key, implementation, owner: scope };
        if (!pending.has(key)) pending.set(key, new Set());
        pending.get(key).add(record);
        stage({
          label: `service:${key.id}`,
          preflight() {
            if (visible(key) || [...pending.get(key)].some((candidate) => candidate !== record && candidate.owner.alive)) {
              throw extensionError(extensionErrorCodes.serviceDuplicate, `Service "${key.id}" already has a provider`, { serviceId: key.id });
            }
          },
          commit() {
            providers.set(key, record);
            enqueuePostCommit(() => channelFor(key).deliver(snapshot(key)));
          },
          dispose({ committed }) {
            pending.get(key)?.delete(record);
            if (pending.get(key)?.size === 0) pending.delete(key);
            if (committed && providers.get(key) === record) {
              providers.delete(key);
              channelFor(key).deliver(snapshot(key));
            }
          },
          retry: "safe",
        });
        return Object.freeze({ id: key.id });
      },
      require(key) {
        scope.assertAlive();
        assertKey(key);
        const facade = createFacade(key, scope);
        if (!facade) throw extensionError(extensionErrorCodes.serviceNotFound, `Required service "${key.id}" is unavailable`, { serviceId: key.id });
        return facade;
      },
      optional(key) {
        scope.assertAlive();
        assertKey(key);
        return createFacade(key, scope);
      },
      subscribe(key, listener, options) {
        scope.assertAlive();
        assertKey(key);
        return channelFor(key).subscribe(scope, listener, options);
      },
    });
  }

  return Object.freeze({ createFacade: createFacadeForOwner, has: (key) => !!visible(key) });
}
