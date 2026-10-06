import { extensionError, extensionErrorCodes } from "./errors.js";
import { createSubscriptionChannel } from "./subscriptions.js";

function freezeDiscovery(value = {}) {
  return Object.freeze({
    extensions: Object.freeze([...(value.extensions || [])]),
    mimeTypes: Object.freeze([...(value.mimeTypes || [])]),
  });
}

export function createInputRegistry({ onError = () => {} } = {}) {
  const handlers = new Map();
  const pending = new Map();
  const channel = createSubscriptionChannel({ getSnapshot, onError });

  function liveHandlers() {
    return [...handlers.values()].filter((record) => record.owner.alive).sort((a, b) => a.id.localeCompare(b.id));
  }
  function getSnapshot() {
    return Object.freeze(liveHandlers().map(({ id, priority, discovery }) => Object.freeze({ id, priority, discovery })));
  }

  function createFacade({ scope, stage, enqueuePostCommit }) {
    return Object.freeze({
      register(definition) {
        scope.assertAlive();
        if (!definition || typeof definition.id !== "string" || typeof definition.recognize !== "function"
            || typeof definition.handle !== "function" || !Number.isFinite(definition.priority ?? 0)) {
          throw extensionError(extensionErrorCodes.inputInvalid, "Invalid input handler definition");
        }
        const record = {
          id: definition.id,
          priority: definition.priority ?? 0,
          discovery: freezeDiscovery(definition.discovery),
          recognize: definition.recognize,
          handle: definition.handle,
          owner: scope,
          operations: new Set(),
        };
        if (!pending.has(record.id)) pending.set(record.id, new Set());
        pending.get(record.id).add(record);
        stage({
          label: `input:${record.id}`,
          preflight() {
            const current = handlers.get(record.id);
            if (current?.owner.alive || [...pending.get(record.id)].some((candidate) => candidate !== record && candidate.owner.alive)) {
              throw extensionError(extensionErrorCodes.inputDuplicate, `Input handler "${record.id}" already exists`, { handlerId: record.id });
            }
          },
          commit() {
            handlers.set(record.id, record);
            enqueuePostCommit(() => channel.deliver(getSnapshot()));
          },
          dispose({ committed }) {
            pending.get(record.id)?.delete(record);
            if (pending.get(record.id)?.size === 0) pending.delete(record.id);
            if (!committed || handlers.get(record.id) !== record) return;
            handlers.delete(record.id);
            for (const operation of record.operations) operation.abort();
            channel.deliver(getSnapshot());
          },
          retry: "safe",
        });
      },
      async dispatch(input) {
        scope.assertAlive();
        const claims = [];
        for (const record of liveHandlers()) {
          try {
            if (record.recognize(input)) claims.push(record);
          } catch (error) {
            onError(error);
          }
        }
        if (!claims.length) throw extensionError(extensionErrorCodes.inputUnsupported, `Unsupported input: ${input?.name || "unknown"}`);
        const highest = Math.max(...claims.map((record) => record.priority));
        const winners = claims.filter((record) => record.priority === highest);
        if (winners.length !== 1) throw extensionError(extensionErrorCodes.inputConflict, "Multiple input handlers claimed the input", { handlers: winners.map(({ id }) => id) });
        const handler = winners[0];
        const invocation = scope.child({ label: `input:${handler.id}` });
        const operation = new AbortController();
        const abort = () => operation.abort();
        invocation.signal.addEventListener("abort", abort, { once: true });
        handler.owner.signal.addEventListener("abort", abort, { once: true });
        handler.operations.add(operation);
        try {
          const result = await handler.handle({ input, signal: operation.signal });
          invocation.assertAlive();
          if (!handler.owner.alive) throw extensionError(extensionErrorCodes.unavailable, `Input handler "${handler.id}" is unavailable`);
          return result;
        } finally {
          handler.operations.delete(operation);
          invocation.signal.removeEventListener("abort", abort);
          handler.owner.signal.removeEventListener("abort", abort);
          await invocation.dispose();
        }
      },
      getSnapshot,
      subscribe(listener, options) { return channel.subscribe(scope, listener, options); },
    });
  }

  return Object.freeze({ createFacade });
}
