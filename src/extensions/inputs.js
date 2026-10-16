import { forwardAbort, signalAborted, signalReason } from "../ownership/abort.js";
import { InputDispatchError, extensionError, extensionErrorCodes } from "./errors.js";
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
      async dispatch(input, options) {
        scope.assertAlive();
        if (options !== undefined && (!options || typeof options !== "object" || Array.isArray(options)
            || Reflect.ownKeys(options).some((key) => key !== "signal")
            || (!Object.hasOwn(options, "signal") && "signal" in options))) throw new TypeError("Invalid dispatch options");
        const external = options?.signal;
        if (external !== undefined) signalAborted(external); // native brand, including cross-realm
        const cancelledBefore = () => {
          scope.assertAlive();
          if (external !== undefined && signalAborted(external)) throw new InputDispatchError("INPUT_DISPATCH_CANCELLED", {
            phase: "before-handler", semanticOutcome: "not-started", handlerOutcome: "not-started",
            cancelled: true, cancellationReason: signalReason(external),
          });
        };
        cancelledBefore();
        const claims = [];
        for (const record of liveHandlers()) {
          cancelledBefore();
          try { if (record.recognize(input)) claims.push(record); } catch (error) { onError(error); }
          cancelledBefore();
        }
        cancelledBefore();
        if (!claims.length) throw extensionError(extensionErrorCodes.inputUnsupported, `Unsupported input: ${input?.name || "unknown"}`);
        const highest = Math.max(...claims.map((record) => record.priority));
        const winners = claims.filter((record) => record.priority === highest);
        cancelledBefore();
        if (winners.length !== 1) throw extensionError(extensionErrorCodes.inputConflict, "Multiple input handlers claimed the input", { handlers: winners.map(({ id }) => id) });
        const handler = winners[0];
        const assertHandler = () => {
          scope.assertAlive();
          if (handlers.get(handler.id) !== handler || !handler.owner.alive)
            throw extensionError(extensionErrorCodes.unavailable, `Input handler "${handler.id}" is unavailable`);
        };
        assertHandler(); cancelledBefore();
        const invocation = scope.child({ label: `input:${handler.id}` });
        const registrationAbort = new AbortController();
        let forwarding, closing, cleanupError, cancellationReason, lifetimeError;
        let cancelled = false, entered = false, result, failure, preError, rejected = false;
        const observeClose = () => {
          if (!closing) {
            closing = invocation.dispose();
            void closing.catch((error) => { cleanupError = error; onError(error); });
          }
          return closing;
        };
        const onAbort = () => {
          if (!cancelled) { cancelled = true; cancellationReason = signalReason(forwarding.signal); }
          handler.operations.delete(registrationAbort);
          try { forwarding.dispose(); } catch (error) { cleanupError = error; }
          forwarding.signal.removeEventListener("abort", onAbort);
          if (invocation.alive) observeClose();
        };
        invocation.defer(() => {
          forwarding?.signal.removeEventListener("abort", onAbort);
          forwarding?.dispose();
          handler.operations.delete(registrationAbort);
        }, { label: "input-forwarding", retry: "safe" });
        let settleHandler;
        const work = new Promise((resolve) => { settleHandler = resolve; });
        invocation.track(work, { label: "input-handler-observer", await: false });
        try {
          forwarding = forwardAbort([invocation.signal, handler.owner.signal, registrationAbort.signal,
            ...(external === undefined ? [] : [external])], { scope: invocation });
          handler.operations.add(registrationAbort);
          forwarding.signal.addEventListener("abort", onAbort, { once: true });
          if (signalAborted(forwarding.signal)) onAbort();
          assertHandler(); cancelledBefore();
          if (!invocation.alive || signalAborted(forwarding.signal)) throw new InputDispatchError("INPUT_DISPATCH_CANCELLED", {
            phase: "before-handler", semanticOutcome: "not-started", handlerOutcome: "not-started", cancelled: true, cancellationReason,
          });
          entered = true;
          try { result = await handler.handle({ input, signal: forwarding.signal, scope: invocation }); }
          catch (error) { rejected = true; failure = error; }
        } catch (error) { preError = error; }
        finally {
          settleHandler();
          if (forwarding?.signal.aborted && !cancelled) { cancelled = true; cancellationReason = signalReason(forwarding.signal); }
          // Normal Scope disposal must not abort the logical operation.
          forwarding?.signal.removeEventListener("abort", onAbort);
          try { forwarding?.dispose(); } catch (error) { cleanupError = error; }
          handler.operations.delete(registrationAbort);
          try { await observeClose(); } catch (error) { cleanupError = error; }
        }
        if (!scope.alive || !handler.owner.alive || handlers.get(handler.id) !== handler) {
          cancelled = true;
          lifetimeError = extensionError(extensionErrorCodes.unavailable, "Input operation lifetime ended");
        }
        if (external !== undefined && signalAborted(external)) {
          cancelled = true; cancellationReason ??= signalReason(external);
        }
        const details = { phase: cleanupError ? "cleanup" : preError ? "before-handler" : rejected ? "handling" : "completion",
          handlerId: handler.id, semanticOutcome: entered ? "unknown" : "not-started",
          handlerOutcome: entered ? rejected ? "rejected" : "fulfilled" : "not-started", cancelled,
          ...(entered && !rejected ? { handlerResult: result } : {}), ...(rejected ? { handlerError: failure } : {}),
          ...(cancelled ? { cancellationReason } : {}), ...(lifetimeError ? { lifetimeError } : {}),
          ...(cleanupError ? { cleanupError } : {}) };
        if (cleanupError) throw new InputDispatchError("INPUT_DISPATCH_CLEANUP_FAILED", details);
        if (preError) throw preError;
        if (cancelled) throw new InputDispatchError("INPUT_DISPATCH_CANCELLED", details);
        if (rejected) throw new InputDispatchError("INPUT_DISPATCH_FAILED", details);
        return result;
      },
      getSnapshot,
      subscribe(listener, options) { return channel.subscribe(scope, listener, options); },
    });
  }

  return Object.freeze({ createFacade });
}
