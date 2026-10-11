import { extensionError, extensionErrorCodes } from "./errors.js";
import { createSubscriptionChannel } from "./subscriptions.js";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  }
  return value;
}

export function createContributionPoint({ id, groups = ["default"], validateDescriptor = () => true, onError = () => {} }) {
  const groupOrder = new Map(groups.map((group, index) => [group, index]));
  const items = new Map();
  const pending = new Map();
  const channel = createSubscriptionChannel({ getSnapshot, onError });

  function getSnapshot() {
    return Object.freeze([...items.values()].filter(({ owner }) => owner.alive).sort((a, b) =>
      groupOrder.get(a.group) - groupOrder.get(b.group) || a.rank - b.rank || a.id.localeCompare(b.id),
    ).map(({ id: itemId, group, rank, descriptor }) => Object.freeze({ id: itemId, group, rank, descriptor })));
  }

  function createFacade({ scope, stage, enqueuePostCommit }) {
    return Object.freeze({
      register({ id: itemId, group = "default", rank = 0, descriptor }) {
        scope.assertAlive();
        if (typeof itemId !== "string" || !itemId || !groupOrder.has(group) || !Number.isFinite(rank) || !validateDescriptor(descriptor)) {
          throw extensionError(extensionErrorCodes.contributionInvalid, `Invalid contribution for point "${id}"`, { pointId: id, itemId });
        }
        const record = { id: itemId, group, rank, descriptor: deepFreeze(copy(descriptor)), owner: scope };
        if (!pending.has(itemId)) pending.set(itemId, new Set());
        pending.get(itemId).add(record);
        stage({
          label: `contribution:${id}:${itemId}`,
          preflight() {
            if (items.get(itemId)?.owner.alive || [...pending.get(itemId)].some((candidate) => candidate !== record && candidate.owner.alive)) {
              throw extensionError(extensionErrorCodes.contributionDuplicate, `Duplicate contribution "${itemId}"`, { pointId: id, itemId });
            }
          },
          commit() { items.set(itemId, record); enqueuePostCommit(() => channel.deliver(getSnapshot())); },
          dispose({ committed }) {
            pending.get(itemId)?.delete(record);
            if (pending.get(itemId)?.size === 0) pending.delete(itemId);
            if (committed && items.get(itemId) === record) { items.delete(itemId); channel.deliver(getSnapshot()); }
          },
          retry: "safe",
        });
      },
      getSnapshot,
      subscribe(listener, options) { return channel.subscribe(scope, listener, options); },
    });
  }
  return Object.freeze({ id, createFacade, getSnapshot });
}
