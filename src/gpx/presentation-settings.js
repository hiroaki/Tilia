import { gpxDomainKey } from "../domains/keys.js";
import { semanticErrorCodes } from "../domains/errors.js";
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
  let mode = initialMode;
  let applied = true;
  let tail = Promise.resolve();
  const changes = createSubscriptionChannel({ getSnapshot: () => mode });

  async function applyToEntry(id, entries, owner) {
    while (entries.get(id)) {
      const view = entries.getDomainView(id, gpxDomainKey);
      if (view.snapshot.derived.presentationMode === mode) return;
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
    get: () => mode,
    subscribe: changes.subscribe,
    set(next, { scope, owner, entries }) {
      const operation = tail.then(async () => {
        scope.assertAlive();
        owner.assertAlive();
        checkMode(next);
        if (next === mode && applied) return;
        applied = false;
        if (next !== mode) {
          mode = next;
          changes.deliver(mode);
        }
        const targets = await entries.listAfterPendingCreations(gpxDomainKey);
        for (const { id } of targets) {
          owner.assertAlive();
          await applyToEntry(id, entries, owner);
        }
        applied = true;
      });
      tail = operation.catch(() => {});
      return operation;
    },
  });
  settingsByProvider.set(provider, settings);
  return settings;
}
