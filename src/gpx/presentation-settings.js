import { gpxDomainKey } from "../domains/keys.js";
import { semanticError, semanticErrorCodes } from "../domains/errors.js";
import { createSubscriptionChannel } from "../extensions/subscriptions.js";
import { invalidGpx } from "./document.js";

// Only built-in GPX providers can receive the privileged entry store during reconciliation.
const settingsByProvider = new WeakMap();

export function getPresentationSettings(provider) {
  return settingsByProvider.get(provider);
}

function checkMode(mode) {
  if (mode !== "track" && mode !== "segment") invalidGpx("Expected track or segment presentation mode");
}

export function createPresentationSettings(provider, initialMode) {
  checkMode(initialMode);
  let status = Object.freeze({ mode: initialMode, state: "applied" });
  let tail = Promise.resolve();
  const changes = createSubscriptionChannel({ getSnapshot: () => status.mode });
  const statusChanges = createSubscriptionChannel({ getSnapshot: () => status });

  function publish(mode, state) {
    status = Object.freeze({ mode, state });
    statusChanges.deliver(status);
  }

  async function applyToEntry(id, entries, owner) {
    while (entries.get(id)) {
      const view = entries.getDomainView(id, gpxDomainKey);
      if (view.snapshot.derived.presentationMode === status.mode) return;
      try {
        await entries.update(owner, id, gpxDomainKey, { type: "apply-presentation-mode" }, { expectedRevision: view.revision });
        return;
      } catch (error) {
        if (error.code === semanticErrorCodes.entryStaleRevision) continue;
        if ([semanticErrorCodes.entryRemoving, semanticErrorCodes.entryNotFound].includes(error.code)) return;
        throw error;
      }
    }
  }

  const settings = Object.freeze({
    get: () => status.mode,
    getStatus: () => status,
    subscribeStatus: statusChanges.subscribe,
    subscribe: changes.subscribe,
    set(next, { scope, owner, entries, signal }) {
      function assertRegistered() {
        if (signal.aborted) throw semanticError(semanticErrorCodes.providerUnavailable, "GPX provider registration has ended");
      }
      const operation = tail.then(async () => {
        scope.assertAlive();
        assertRegistered();
        checkMode(next);
        const changed = next !== status.mode;
        if (!changed && status.state === "applied") return;

        publish(next, "applying");
        if (changed) changes.deliver(next);
        try {
          const targets = await entries.listAfterPendingCreations(gpxDomainKey);
          for (const { id } of targets) {
            assertRegistered();
            await applyToEntry(id, entries, owner);
          }
          assertRegistered();
        } catch (error) {
          publish(next, "failed");
          throw error;
        }
        publish(next, "applied");
      });
      tail = operation.catch(() => {});
      return operation;
    },
  });
  settingsByProvider.set(provider, settings);
  return settings;
}
