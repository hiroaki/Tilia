import { scopeIsOperational } from "../ownership/scope.js";
import { createSubscriptionChannel } from "../extensions/subscriptions.js";
import { cloneAndFreezePlainData, assertDeepImmutablePlainData } from "../domains/immutable.js";
import { assertDomainKey } from "../domains/identity.js";
import { semanticError, semanticErrorCodes as codes } from "../domains/errors.js";
import { createCandidateBroker } from "./candidates.js";

export function createSelectionStore({ applicationScope, getTarget, onError = () => {} }) {
  const broker = createCandidateBroker();
  let current = null;
  let registration = null;
  let generation = 0n;
  let terminal = false;
  let barrier = 0;
  let draining = false;
  let removeProviderMonitor = () => {};
  const queue = [];
  const pendingTickets = new Set();
  const subscriptions = new Set();
  const report = (error) => { try { onError(error); } catch { /* Diagnostics cannot revoke committed state or peer delivery. */ } };
  const channel = createSubscriptionChannel({ onError: report });
  const requests = createSubscriptionChannel({ onError: report });
  const destroyed = () => semanticError(codes.selectionStoreDestroyed, "Selection authority has terminated");

  function assertActive() {
    if (terminal || !scopeIsOperational(applicationScope)) throw destroyed();
  }

  function assertCaller(scope) {
    assertActive();
    scope.assertAlive();
  }

  function adapterFor(target) {
    const provider = target.providerRegistration;
    if (!scopeIsOperational(provider.owner)) {
      throw semanticError(codes.providerUnavailable, "Selection provider is unavailable", { entryId: target.id, domainId: target.domainKey.id });
    }
    const adapter = provider.provider.selection;
    if (!adapter) throw semanticError(codes.selectionUnsupported, "Domain does not support selection", { domainId: target.domainKey.id });
    return adapter;
  }

  function invariant(message, cause) {
    return semanticError(codes.selectionProviderInvariant, message, { cause });
  }

  function copyRef(ref) {
    try { return cloneAndFreezePlainData(ref, "selection.ref"); }
    catch (cause) { throw invariant("Provider returned an invalid semantic reference", cause); }
  }

  function equals(adapter, left, right) {
    let result;
    try { result = adapter.equals(left, right); }
    catch (cause) {
      if (cause?.code === codes.selectionReferenceInvalid) throw cause;
      throw invariant("Domain selection equality failed", cause);
    }
    if (typeof result !== "boolean") throw invariant("Selection equality must be synchronous and boolean");
    return result;
  }

  function resolveWith(adapter, target, ref) {
    let value;
    try { value = adapter.resolve({ instance: target.instance, revision: target.revision, ref }); }
    catch (cause) {
      if (cause?.code === codes.selectionReferenceInvalid) throw cause;
      throw invariant("Domain selection resolution failed", cause);
    }
    if (value !== null) {
      try { assertDeepImmutablePlainData(value, "selection.resolved"); }
      catch (cause) { throw invariant("Selection resolution must return immutable semantic data or null", cause); }
    }
    return value;
  }

  function ticketMatches(ticket) {
    return !terminal && scopeIsOperational(applicationScope) && current !== null
      && generation === ticket.generation && current.entryId === ticket.entryId
      && current.domain === ticket.domainKey && registration === ticket.providerRegistration;
  }

  function capture(cause) {
    return current === null ? null : Object.freeze({
      generation, entryId: current.entryId, domainKey: current.domain,
      providerRegistration: registration, ref: current.ref, cause,
    });
  }

  function armProviderMonitor() {
    removeProviderMonitor();
    removeProviderMonitor = () => {};
    if (current === null || terminal) return;
    const ticket = capture("provider-aborted");
    const signal = registration.owner.signal;
    const callback = () => { if (ticketMatches(ticket)) enqueueInvalidation(ticket); };
    signal.addEventListener("abort", callback, { once: true });
    removeProviderMonitor = () => signal.removeEventListener("abort", callback);
    if (!registration.owner.alive) callback();
  }

  function transition(next, provider, reason) {
    const previous = current;
    current = next;
    registration = provider;
    generation += 1n;
    armProviderMonitor();
    return Object.freeze({ previous, current: next, reason });
  }

  function notify(event) {
    if (!terminal && event) channel.deliver(event);
  }

  function runCommit(operation) {
    barrier += 1;
    try { return operation(); }
    finally {
      barrier -= 1;
      if (barrier === 0) drain();
    }
  }

  function drain() {
    if (draining || barrier > 0 || terminal) return;
    draining = true;
    try {
      while (queue.length && !terminal) {
        const command = queue.shift();
        runCommit(() => {
          try {
            if (command.internal) command.execute();
            else {
              assertCaller(command.scope);
              const { result, event, requested } = command.execute();
              // Settle at commit, before any callback can terminate/reenter.
              command.resolve(result);
              notify(event);
              if (!terminal && applicationScope.alive && command.scope.alive && requested) {
                requests.deliver(Object.freeze({ selection: requested, issuer: command.scope }));
              }
            }
          } catch (error) {
            if (command.internal) report(error);
            else command.reject(error);
          }
        });
      }
    } finally { draining = false; }
  }

  function enqueue(scope, execute) {
    return new Promise((resolve, reject) => {
      try { assertCaller(scope); }
      catch (error) { reject(error); return; }
      queue.push({ scope, execute, resolve, reject });
      drain();
    });
  }

  function enqueueInvalidation(ticket) {
    if (!ticketMatches(ticket) || pendingTickets.has(ticket.generation)) return;
    pendingTickets.add(ticket.generation);
    queue.push({ internal: true, execute() {
      pendingTickets.delete(ticket.generation);
      if (!ticketMatches(ticket)) return;
      let target;
      try { target = getTarget(ticket.entryId, ticket.domainKey); }
      catch (cause) { report(invariant("Entry disappeared without ordered selection invalidation", cause)); return; }
      if (target.providerRegistration !== ticket.providerRegistration) {
        report(invariant("Selection provider registration changed without invalidation"));
        return;
      }
      if (target.providerRegistration.owner.alive) {
        try {
          if (resolveWith(adapterFor(target), target, current.ref) !== null) return;
        } catch (cause) { report(invariant("Current selection could not be revalidated", cause)); }
      }
      if (!ticketMatches(ticket)) return;
      const event = transition(null, null, "domain-invalidated");
      report(semanticError(codes.selectionProviderInvariant, "Current semantic selection lost its target or provider", {
        committed: true, entryId: ticket.entryId, domainId: ticket.domainKey.id,
      }));
      notify(event);
    } });
    drain();
  }

  function createDomainFacade(scope, domainKey, { defaultTarget } = {}) {
    assertDomainKey(domainKey);
    return Object.freeze({
      createCandidate(entryId, target = defaultTarget) {
        assertCaller(scope);
        return runCommit(() => {
          const entry = getTarget(entryId, domainKey);
          const adapter = adapterFor(entry);
          let canonical;
          try { canonical = adapter.canonicalize({ instance: entry.instance, revision: entry.revision, target }); }
          catch (cause) {
            throw semanticError(codes.selectionReferenceInvalid, "Domain selection target is invalid", { cause, entryId, domainId: domainKey.id });
          }
          const ref = copyRef(canonical);
          if (resolveWith(adapter, entry, ref) === null) {
            throw semanticError(codes.selectionReferenceInvalid, "Domain selection target does not exist", { entryId, domainId: domainKey.id });
          }
          assertCaller(scope);
          return broker.issue({ entryId, domainKey, providerRegistration: entry.providerRegistration, canonicalRef: ref, issuingScope: scope });
        });
      },
      resolve(entryId, ref) {
        assertCaller(scope);
        return runCommit(() => {
          const entry = getTarget(entryId, domainKey);
          let copied;
          try { copied = cloneAndFreezePlainData(ref, "selection.ref"); }
          catch (cause) { throw semanticError(codes.selectionReferenceInvalid, "Malformed selection reference", { cause, entryId }); }
          const adapter = adapterFor(entry);
          const isCurrent = current !== null && current.entryId === entryId && current.domain === domainKey
            && registration === entry.providerRegistration && equals(adapter, current.ref, copied);
          const ticket = isCurrent ? capture("resolution-failed") : null;
          try {
            const result = resolveWith(adapter, entry, copied);
            if (result === null && ticket) enqueueInvalidation(ticket);
            return result;
          } catch (cause) {
            if (ticket && cause?.code !== codes.selectionReferenceInvalid) enqueueInvalidation(ticket);
            if (cause?.code === codes.selectionReferenceInvalid) throw cause;
            throw invariant("Domain selection resolution failed", cause);
          }
        });
      },
    });
  }

  function createFacade(scope) {
    return Object.freeze({
      getCurrent() { assertCaller(scope); return current; },
      request(candidate) {
        return enqueue(scope, () => {
          const value = broker.read(candidate);
          if (!value || value.issuingScope !== scope) {
            throw semanticError(codes.selectionCandidateInvalid, "A candidate issued to this consumer by this application is required");
          }
          value.issuingScope.assertAlive();
          const target = getTarget(value.entryId, value.domainKey);
          if (target.providerRegistration !== value.providerRegistration) {
            throw semanticError(codes.selectionCandidateInvalid, "Selection candidate belongs to a stale provider registration");
          }
          const adapter = adapterFor(target);
          if (resolveWith(adapter, target, value.canonicalRef) === null) {
            throw semanticError(codes.selectionReferenceInvalid, "Selection candidate no longer resolves", { entryId: value.entryId });
          }
          assertCaller(scope);
          const equal = current && current.entryId === value.entryId && current.domain === value.domainKey
            && equals(adapter, current.ref, value.canonicalRef);
          assertCaller(scope);
          if (equal) return { result: current, requested: current };
          const next = Object.freeze({ entryId: value.entryId, domain: value.domainKey, ref: value.canonicalRef });
          return { result: next, requested: next, event: transition(next, value.providerRegistration, "requested") };
        });
      },
      clear({ ifCurrent } = {}) {
        return enqueue(scope, () => {
          if (ifCurrent !== undefined && current !== null) {
            if (!ifCurrent || current.entryId !== ifCurrent.entryId || current.domain !== ifCurrent.domain) return { result: undefined };
            const target = getTarget(current.entryId, current.domain);
            if (!equals(adapterFor(target), current.ref, ifCurrent.ref)) return { result: undefined };
            assertCaller(scope);
          }
          return { result: undefined, event: current === null ? null : transition(null, null, "cleared") };
        });
      },
      subscribe(listener) {
        return subscribe(scope, channel, listener);
      },
      subscribeRequests(listener) {
        return subscribe(scope, requests, listener);
      },
    });
  }

  function subscribe(scope, source, listener) {
    assertCaller(scope);
    if (typeof listener !== "function") throw new TypeError("Selection subscriber must be a function");
    const underlying = source.subscribe(scope, (event) => {
      if (terminal || !applicationScope.alive) return;
      if (source === requests) {
        if (event.issuer.alive) listener(event.selection);
      } else listener(event);
    }, { emitCurrent: false });
    const handle = Object.freeze({ unsubscribe() { underlying.unsubscribe(); subscriptions.delete(handle); } });
    subscriptions.add(handle);
    scope.defer(handle.unsubscribe, { label: "selection-subscription-index", retry: "safe" });
    return handle;
  }

  function prepareDomainCommit({ record, prepared, command, nextRevision }) {
    assertActive();
    if (!current || current.entryId !== record.id) return Object.freeze({ commit() {}, notify() {} });
    if (current.domain !== record.domainKey || registration !== record.providerRegistration) {
      throw invariant("Selected entry does not match its captured domain/provider registration");
    }
    const adapter = adapterFor(record);
    let effect;
    try {
      effect = adapter.reconcile({
        previousInstance: record.instance, nextInstance: prepared.nextInstance,
        previousRevision: record.revision, nextRevision, command, change: prepared.change, ref: current.ref,
      });
    } catch (cause) { throw invariant("Domain selection reconciliation failed before commit", cause); }
    const type = effect?.type;
    if (!["unchanged", "refreshed", "remapped", "invalid"].includes(type)) {
      throw invariant("Domain returned an invalid selection reconciliation result");
    }
    const ref = type === "remapped" ? copyRef(effect.ref) : current.ref;
    if (type !== "invalid") {
      const nextTarget = { ...record, instance: prepared.nextInstance, revision: nextRevision };
      try {
        if (resolveWith(adapter, nextTarget, ref) === null) throw invariant("Reconciled reference does not resolve against prepared semantics");
      } catch (cause) { throw invariant("Provider reconciliation returned an invalid current reference", cause); }
    }
    const next = type === "invalid" ? null : type === "remapped"
      ? Object.freeze({ entryId: current.entryId, domain: current.domain, ref }) : current;
    const nextProvider = next === null ? null : registration;
    assertActive();
    let event = null;
    return Object.freeze({
      commit() {
        if (type === "unchanged") return;
        event = transition(next, nextProvider, type === "invalid" ? "domain-invalidated" : type);
      },
      notify() { notify(event); },
    });
  }

  function invalidateEntry(entryId) {
    if (terminal || current?.entryId !== entryId) return;
    notify(transition(null, null, "entry-removed"));
  }

  function terminate() {
    if (terminal) return;
    terminal = true;
    generation += 1n;
    current = null;
    registration = null;
    removeProviderMonitor();
    removeProviderMonitor = () => {};
    applicationScope.signal.removeEventListener("abort", terminate);
    for (const handle of [...subscriptions]) handle.unsubscribe();
    for (const command of queue.splice(0)) if (!command.internal) command.reject(destroyed());
    pendingTickets.clear();
  }

  applicationScope.signal.addEventListener("abort", terminate, { once: true });
  if (!scopeIsOperational(applicationScope)) terminate();
  return Object.freeze({ createFacade, createDomainFacade, runCommit, prepareDomainCommit, invalidateEntry, terminate });
}
