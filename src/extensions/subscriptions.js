import { extensionError, extensionErrorCodes } from "./errors.js";

// A retained public handle must not hold the listener or either owner's scope
// after withdrawal. Its only reference is cleared by the owned cleanup.
function subscriptionHandle(binding) {
  return Object.freeze({ unsubscribe() { binding.stop?.(); } });
}

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
          if (!record.scope.alive || record.registrationSignal?.aborted) continue;
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

  function subscribe(scope, listener, { emitCurrent = true } = {}, registrationSignal) {
    scope.assertAlive();
    if (typeof listener !== "function") {
      throw extensionError(extensionErrorCodes.subscriptionInvalid, "Subscription listener must be a function");
    }
    const record = { scope, listener: scope.guard(listener), registrationSignal };
    const binding = { stop: null };
    const handle = subscriptionHandle(binding);
    const cleanup = scope.defer(() => {
      subscribers.delete(record);
      registrationSignal?.removeEventListener("abort", handle.unsubscribe);
      binding.stop = null;
    }, { label: "typed-subscription", retry: "safe" });
    binding.stop = () => { void cleanup.dispose().catch(onError); };
    subscribers.add(record);
    registrationSignal?.addEventListener("abort", handle.unsubscribe, { once: true });
    if (registrationSignal?.aborted) {
      handle.unsubscribe();
      return handle;
    }
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
    return handle;
  }

  return Object.freeze({ subscribe, deliver });
}
