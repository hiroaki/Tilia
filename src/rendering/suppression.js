import { isScopeWithin } from "../ownership/scope.js";
import { cloneAndFreezePlainData } from "../domains/immutable.js";
import { gpxDomainKey } from "../domains/keys.js";

// Logical semantic-target state has no renderer registration/generation owner.
export function createSuppressionState({ getSemantics, assertAlive, onChange, report }) {
  const leases = new Set(), subscribers = new Set(), queue = [];
  let last = Object.freeze([]), delivering = false;
  const target = lease => {
    if (!lease.active || !lease.scope.alive) return null;
    try {
      const value = getSemantics().entries.getSemanticTarget(lease.entryId, lease.domain);
      if (value.providerRegistration !== lease.provider || !value.providerRegistration.owner.alive) return null;
      const adapter = value.providerRegistration.provider.selection;
      return adapter.resolve({ instance: value.instance, revision: value.revision, ref: lease.ref }) === null ? null : value;
    } catch { return null; }
  };
  const sameRecord = (left, right) => left.entryId === right.entryId && left.domain === right.domain
    && left.ref.kind === right.ref.kind && left.ref.trackIndex === right.ref.trackIndex && left.ref.revision === right.ref.revision;
  function snapshot() {
    const values = [];
    for (const lease of leases) {
      if (!target(lease)) continue;
      const value = Object.freeze({ entryId: lease.entryId, domain: lease.domain, ref: lease.ref });
      if (!values.some(existing => sameRecord(existing, value))) values.push(value);
    }
    return Object.freeze(values);
  }
  function drain() {
    if (delivering) return;
    delivering = true;
    try {
      while (queue.length) {
        const item = queue.shift();
        if (item.changed) { try { onChange(item.entryIds); } catch (error) { report(error); } }
        for (const subscriber of item.subscribers) {
          if (!subscriber.active || !subscriber.scope.alive) continue;
          try { subscriber.listener(item.snapshot); } catch (error) { report(error); }
        }
      }
    } finally { delivering = false; }
  }
  function publish() {
    const next = snapshot();
    if (last.length === next.length && last.every(value => next.some(candidate => sameRecord(value, candidate)))) return;
    const previous = last;
    const ids = new Set([...previous, ...next].map(value => value.entryId));
    const entryIds = [...ids].filter(id => {
      const a = previous.filter(value => value.entryId === id), b = next.filter(value => value.entryId === id);
      return a.length !== b.length || a.some(value => !b.some(candidate => sameRecord(value, candidate)));
    });
    last = next;
    queue.push({ snapshot: next, subscribers: [...subscribers], changed: true, entryIds });
    drain();
  }
  function release(lease) {
    if (!lease.active) return Promise.resolve();
    lease.active = false; leases.delete(lease);
    lease.scope.signal.removeEventListener("abort", lease.abort);
    publish();
    return Promise.resolve();
  }
  function facade(consumer) {
    return {
      suppress({ entryId, domain, target: requested, expectedRevision, scope } = {}) {
        assertAlive(); consumer.assertAlive();
        if (!scope || !isScopeWithin(scope, consumer)) throw new TypeError("Suppression scope must belong to its consumer");
        scope.assertAlive();
        if (domain !== gpxDomainKey || requested?.kind !== "track") throw new TypeError("Phase 4J suppression requires a GPX track target");
        const value = getSemantics().entries.getSemanticTarget(entryId, domain);
        if (value.revision !== expectedRevision) throw new TypeError("Suppression requires the current semantic revision");
        const adapter = value.providerRegistration.provider.selection;
        const ref = cloneAndFreezePlainData(adapter.canonicalize({ instance: value.instance, revision: value.revision, target: requested }));
        if (adapter.resolve({ instance: value.instance, revision: value.revision, ref }) === null) throw new TypeError("Suppression target is unavailable");
        scope.assertAlive(); consumer.assertAlive();
        const lease = { entryId, domain, ref, scope, provider: value.providerRegistration, active: true };
        lease.abort = () => { void release(lease); };
        scope.defer(() => release(lease), { label: "presentation-suppression", retry: "safe" });
        scope.signal.addEventListener("abort", lease.abort, { once: true });
        leases.add(lease); publish();
        return Object.freeze({ dispose: () => release(lease) });
      },
      getSuppressionSnapshot() { assertAlive(); consumer.assertAlive(); return snapshot(); },
      subscribeSuppression(listener, { scope = consumer, emitCurrent = true } = {}) {
        assertAlive(); consumer.assertAlive();
        if (!isScopeWithin(scope, consumer) || typeof listener !== "function" || typeof emitCurrent !== "boolean") throw new TypeError("Invalid suppression subscription");
        scope.assertAlive();
        const record = { scope, listener, active: true };
        const unsubscribe = () => { record.active = false; subscribers.delete(record); };
        scope.defer(unsubscribe, { label: "suppression-subscription", retry: "safe" });
        subscribers.add(record);
        if (emitCurrent) { queue.push({ snapshot: snapshot(), subscribers: [record], changed: false }); drain(); }
        return Object.freeze({ unsubscribe });
      },
    };
  }
  function prepare({ record, prepared, command, nextRevision }) {
    const effects = [];
    for (const lease of leases) {
      if (!lease.active || lease.entryId !== record.id) continue;
      const adapter = record.providerRegistration.provider.selection;
      const result = adapter.reconcile({ previousInstance: record.instance, nextInstance: prepared.nextInstance,
        previousRevision: record.revision, nextRevision, command, change: prepared.change, ref: lease.ref });
      if (!result || !["unchanged", "refreshed", "remapped", "invalid"].includes(result.type)) throw new TypeError("Invalid suppression reconciliation");
      const ref = result.type === "remapped" ? cloneAndFreezePlainData(result.ref) : lease.ref;
      if (result.type !== "invalid" && adapter.resolve({ instance: prepared.nextInstance, revision: nextRevision, ref }) === null)
        throw new TypeError("Suppression reconciliation did not resolve");
      effects.push({ lease, ref, invalid: result.type === "invalid" });
    }
    return Object.freeze({ commit() {
      for (const effect of effects) {
        if (!effect.lease.active) continue;
        if (effect.invalid) { effect.lease.active = false; leases.delete(effect.lease); effect.lease.scope.signal.removeEventListener("abort", effect.lease.abort); }
        else effect.lease.ref = effect.ref;
      }
    }, notify: publish });
  }
  function remove(entryId) {
    for (const lease of [...leases]) if (lease.entryId === entryId) {
      lease.active = false; leases.delete(lease); lease.scope.signal.removeEventListener("abort", lease.abort);
    }
    publish();
  }
  return Object.freeze({ facade, prepare, remove, publish, isSuppressed(entryId, ref, revision) {
    return snapshot().some(value => value.entryId === entryId && value.ref.trackIndex === ref.trackIndex && value.ref.revision === revision);
  } });
}
