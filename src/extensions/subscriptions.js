import { extensionError, extensionErrorCodes } from "./errors.js";

export function createSubscriptionChannel({ getSnapshot = null, onError = () => {} } = {}) {
  const subscribers = new Set();
  let delivering = false;
  const queued = [];

  function deliver(value) {
    if (delivering) {
      queued.push(value);
      return;
    }
    delivering = true;
    let current = value;
    try {
      do {
        for (const record of [...subscribers]) {
          if (!record.scope.alive) continue;
          try {
            record.listener(current);
          } catch (error) {
            onError(extensionError(
              extensionErrorCodes.subscriptionInvalid,
              "Subscription callback failed after commit",
              { cause: error, committed: true },
            ));
          }
        }
        current = queued.shift();
      } while (current !== undefined);
    } finally {
      delivering = false;
    }
  }

  function subscribe(scope, listener, { emitCurrent = true } = {}) {
    scope.assertAlive();
    if (typeof listener !== "function") {
      throw extensionError(extensionErrorCodes.subscriptionInvalid, "Subscription listener must be a function");
    }
    const record = { scope, listener: scope.guard(listener) };
    subscribers.add(record);
    let active = true;
    const unsubscribe = () => {
      if (!active) return;
      active = false;
      subscribers.delete(record);
    };
    scope.defer(unsubscribe, { label: "typed-subscription", retry: "safe" });
    if (emitCurrent && getSnapshot) {
      try {
        record.listener(getSnapshot());
      } catch (error) {
        onError(extensionError(
          extensionErrorCodes.subscriptionInvalid,
          "Subscription callback failed during initial delivery",
          { cause: error, committed: true },
        ));
      }
    }
    return Object.freeze({ unsubscribe });
  }

  return Object.freeze({ subscribe, deliver });
}
