import { describe, expect, it, vi } from "vitest";
import { createScopeController } from "../src/ownership/index.js";
import { cloneAndFreezePlainData, defineDomainKey } from "../src/domains/index.js";
import { createSelectionStore } from "../src/selection/store.js";

async function fixture({ onError = () => {} } = {}) {
  const app = createScopeController({ label: "selection-root" });
  const owner = createScopeController({ label: "provider" });
  const consumer = createScopeController({ label: "consumer" });
  await Promise.all([app.commit(), owner.commit(), consumer.commit()]);
  const key = defineDomainKey({ id: "sample" });
  let resolvable = true;
  const adapter = {
    canonicalize({ target }) {
      if (!target || typeof target.id !== "string") throw new Error("bad target");
      return { target: { id: target.id } };
    },
    equals: (left, right) => left.target.id === right.target.id,
    resolve({ instance, ref }) {
      return resolvable && instance.ids.includes(ref.target.id) ? cloneAndFreezePlainData({ id: ref.target.id }) : null;
    },
    reconcile: () => ({ type: "unchanged" }),
  };
  const registration = { id: 1, owner: owner.scope, provider: { selection: adapter } };
  const records = new Map([[1, { id: 1, domainKey: key, revision: 1, instance: { ids: ["a", "b"] }, providerRegistration: registration }]]);
  const store = createSelectionStore({
    applicationScope: app.scope,
    getTarget(id, domain) {
      const record = records.get(id);
      if (!record) throw Object.assign(new Error("not found"), { code: "ENTRY_NOT_FOUND" });
      if (record.domainKey !== domain) throw Object.assign(new Error("mismatch"), { code: "ENTRY_DOMAIN_MISMATCH" });
      return record;
    },
    onError,
  });
  const api = store.createFacade(consumer.scope);
  const domain = store.createDomainFacade(consumer.scope, key);
  const candidate = (id = "a") => domain.createCandidate(1, { id });
  return { app, owner, consumer, key, store, api, domain, candidate, records, registration, adapter,
    setResolvable(value) { resolvable = value; } };
}

describe("SelectionStore contracts", () => {
  it("starts null; requests, replaces, clears, and suppresses canonical no-ops", async () => {
    const f = await fixture();
    const events = [];
    f.api.subscribe((event) => events.push(event));
    expect(f.api.getCurrent()).toBeNull();
    expect(events).toEqual([]);
    const a = await f.api.request(f.candidate());
    await f.api.request(f.candidate());
    const b = await f.api.request(f.candidate("b"));
    await f.api.clear();
    await f.api.clear();
    expect(a.ref.target.id).toBe("a");
    expect(b.ref.target.id).toBe("b");
    expect(events.map((event) => event.reason)).toEqual(["requested", "requested", "cleared"]);
    expect(events[1]).toMatchObject({ previous: a, current: b });
  });

  it("copies/freeze refs and exposes exactly the three semantic fields", async () => {
    const f = await fixture();
    const input = { id: "a" };
    const issued = f.domain.createCandidate(1, input);
    input.id = "b";
    const selected = await f.api.request(issued);
    expect(Object.keys(selected)).toEqual(["entryId", "domain", "ref"]);
    expect(Object.isFrozen(selected.ref.target)).toBe(true);
    expect(() => { selected.ref.target.id = "b"; }).toThrow();
    await f.api.request(f.candidate("b"));
    expect(selected.ref.target.id).toBe("a");
  });

  it("rejects fabricated, copied, and foreign-store candidates without committing", async () => {
    const f = await fixture();
    const other = await fixture();
    const current = await f.api.request(f.candidate());
    for (const invalid of [{}, { ...f.candidate() }, other.candidate(), current, null]) {
      await expect(f.api.request(invalid)).rejects.toMatchObject({ code: "SELECTION_CANDIDATE_INVALID", committed: false });
    }
    expect(f.api.getCurrent()).toBe(current);
  });

  it("revalidates entry, registration, issuer and reference at request execution", async () => {
    const f = await fixture();
    const candidate = f.candidate();
    f.records.get(1).instance = { ids: [] };
    await expect(f.api.request(candidate)).rejects.toMatchObject({ code: "SELECTION_REFERENCE_INVALID" });
    f.records.get(1).instance = { ids: ["a"] };
    f.records.get(1).providerRegistration = { ...f.registration, id: 2 };
    await expect(f.api.request(candidate)).rejects.toMatchObject({ code: "SELECTION_CANDIDATE_INVALID" });
    f.records.get(1).providerRegistration = f.registration;
    await f.consumer.close();
    await expect(f.api.request(candidate)).rejects.toMatchObject({ code: "SCOPE_NOT_ACTIVE" });
  });

  it("rejects missing/domain-mismatched entries, malformed targets and unsupported providers", async () => {
    const f = await fixture();
    expect(() => f.domain.createCandidate(99, { id: "a" })).toThrowError(expect.objectContaining({ code: "ENTRY_NOT_FOUND" }));
    const foreign = f.store.createDomainFacade(f.consumer.scope, defineDomainKey({ id: "other" }));
    expect(() => foreign.createCandidate(1, { id: "a" })).toThrowError(expect.objectContaining({ code: "ENTRY_DOMAIN_MISMATCH" }));
    expect(() => f.domain.createCandidate(1, {})).toThrowError(expect.objectContaining({ code: "SELECTION_REFERENCE_INVALID" }));
    f.registration.provider.selection = undefined;
    expect(() => f.candidate()).toThrowError(expect.objectContaining({ code: "SELECTION_UNSUPPORTED" }));
  });

  it("queues reentrant commands until every subscriber observes the committed event", async () => {
    const f = await fixture();
    const order = [];
    let pending;
    f.api.subscribe((event) => {
      order.push(`first:${event.current?.ref.target.id ?? "null"}`);
      if (event.current?.ref.target.id === "a") pending = f.api.request(f.candidate("b"));
    });
    f.api.subscribe((event) => order.push(`second:${event.current?.ref.target.id}:${f.api.getCurrent()?.ref.target.id}`));
    const result = await f.api.request(f.candidate());
    await pending;
    expect(result.ref.target.id).toBe("a");
    expect(order).toEqual(["first:a", "second:a:a", "first:b", "second:b:b"]);
  });

  it("uses stable subscription snapshots, idempotent unsubscribe and dead-scope suppression", async () => {
    const f = await fixture();
    const order = [];
    let later;
    f.api.subscribe(() => {
      order.push("first");
      later.unsubscribe();
      f.api.subscribe(() => order.push("new"));
    });
    later = f.api.subscribe(() => order.push("second"));
    await f.api.request(f.candidate());
    expect(order).toEqual(["first", "second"]);
    later.unsubscribe();
    await f.api.clear();
    expect(order).toEqual(["first", "second", "first", "new"]);
    await f.consumer.close();
    await f.store.createFacade(f.app.scope).clear();
  });

  it("isolates listener and diagnostic reporter failures", async () => {
    const f = await fixture({ onError() { throw new Error("reporter"); } });
    f.api.subscribe(() => { throw new Error("listener"); });
    const peer = vi.fn();
    f.api.subscribe(peer);
    await expect(f.api.request(f.candidate())).resolves.toMatchObject({ entryId: 1 });
    expect(peer).toHaveBeenCalledOnce();
  });

  it("rechecks consumer liveness immediately before commit even when a provider violates hook purity", async () => {
    const f = await fixture();
    const a = await f.api.request(f.candidate());
    const b = f.candidate("b");
    let closing;
    f.adapter.equals = () => { closing = f.consumer.close(); return false; };
    await expect(f.api.request(b)).rejects.toMatchObject({ code: "SCOPE_NOT_ACTIVE" });
    await closing;
    expect(f.store.createFacade(f.app.scope).getCurrent()).toBe(a);
  });
});

describe("guarded deferred invalidation", () => {
  it.each(["replace", "reselect"])("does not clear a newer selection after %s", async (operation) => {
    const f = await fixture();
    await f.api.request(f.candidate());
    const a = f.api.getCurrent();
    const next = f.candidate(operation === "replace" ? "b" : "a");
    const pending = [];
    // Make the new target unresolvable only after its request commits. An
    // unguarded old ticket would now clear it even after fresh revalidation.
    f.api.subscribe((event) => { if (event.reason === "requested") f.setResolvable(false); });
    f.store.runCommit(() => {
      if (operation === "reselect") pending.push(f.api.clear());
      pending.push(f.api.request(next));
      f.setResolvable(false);
      expect(f.domain.resolve(1, a.ref)).toBeNull();
      f.setResolvable(true);
    });
    await Promise.all(pending);
    expect(f.api.getCurrent().ref.target.id).toBe(operation === "replace" ? "b" : "a");
  });

  it("refreshing the same descriptor supersedes a queued invalidation generation", async () => {
    const f = await fixture();
    await f.api.request(f.candidate());
    const selected = f.api.getCurrent();
    f.adapter.reconcile = () => ({ type: "refreshed" });
    f.api.subscribe((event) => { if (event.reason === "refreshed") f.setResolvable(false); });
    f.store.runCommit(() => {
      f.setResolvable(false);
      f.domain.resolve(1, selected.ref);
      f.setResolvable(true);
      const record = f.records.get(1);
      const effect = f.store.prepareDomainCommit({ record, prepared: { nextInstance: record.instance }, command: {}, nextRevision: 2 });
      record.revision = 2;
      effect.commit();
      effect.notify();
    });
    expect(f.api.getCurrent()).toBe(selected);
  });

  it("ignores an old provider callback after switching exact registrations", async () => {
    const f = await fixture();
    let oldCallback;
    const original = f.owner.scope.signal.addEventListener.bind(f.owner.scope.signal);
    vi.spyOn(f.owner.scope.signal, "addEventListener").mockImplementation((type, callback, options) => {
      oldCallback ??= callback;
      original(type, callback, options);
    });
    await f.api.request(f.candidate());
    await f.api.clear();
    const replacement = createScopeController({ label: "replacement-provider" });
    await replacement.commit();
    f.records.get(1).providerRegistration = { ...f.registration, id: 2, owner: replacement.scope };
    await f.api.request(f.candidate());
    f.setResolvable(false);
    oldCallback();
    expect(f.api.getCurrent()).not.toBeNull();
  });

  it("diagnoses a current provider resolution failure, clears once, and does not retry forever", async () => {
    const diagnostics = [];
    const f = await fixture({ onError: (error) => diagnostics.push(error) });
    await f.api.request(f.candidate());
    f.adapter.resolve = () => { throw new Error("broken provider"); };
    expect(() => f.domain.resolve(1, f.api.getCurrent().ref)).toThrowError(expect.objectContaining({ code: "SELECTION_PROVIDER_INVARIANT" }));
    expect(f.api.getCurrent()).toBeNull();
    expect(diagnostics.some((error) => error.committed)).toBe(true);
  });

  it("revalidates current semantics rather than clearing from the failed snapshot", async () => {
    const f = await fixture();
    await f.api.request(f.candidate());
    const events = vi.fn();
    f.api.subscribe(events);
    f.store.runCommit(() => {
      f.setResolvable(false);
      expect(f.domain.resolve(1, f.api.getCurrent().ref)).toBeNull();
      f.setResolvable(true);
    });
    expect(f.api.getCurrent()).not.toBeNull();
    expect(events).not.toHaveBeenCalled();
  });

  it("coalesces unresolved tickets and clears once", async () => {
    const f = await fixture();
    await f.api.request(f.candidate());
    const events = vi.fn();
    f.api.subscribe(events);
    f.setResolvable(false);
    f.store.runCommit(() => {
      const ref = f.api.getCurrent().ref;
      f.domain.resolve(1, ref);
      f.domain.resolve(1, ref);
    });
    expect(f.api.getCurrent()).toBeNull();
    expect(events).toHaveBeenCalledOnce();
    expect(events.mock.calls[0][0].reason).toBe("domain-invalidated");
  });

  it("does not schedule invalidation when resolving a different ref", async () => {
    const f = await fixture();
    await f.api.request(f.candidate());
    f.setResolvable(false);
    expect(f.domain.resolve(1, { target: { id: "b" } })).toBeNull();
    expect(f.api.getCurrent().ref.target.id).toBe("a");
  });

  it("ignores delayed provider callbacks after reselection or termination", async () => {
    const f = await fixture();
    const callbacks = [];
    const original = f.owner.scope.signal.addEventListener.bind(f.owner.scope.signal);
    vi.spyOn(f.owner.scope.signal, "addEventListener").mockImplementation((type, callback, options) => {
      callbacks.push(callback);
      original(type, callback, options);
    });
    await f.api.request(f.candidate());
    const old = callbacks[0];
    await f.api.clear();
    await f.api.request(f.candidate());
    f.setResolvable(false);
    old();
    expect(f.api.getCurrent()).not.toBeNull();
    f.store.terminate();
    for (const callback of callbacks) callback();
    expect(() => f.api.getCurrent()).toThrowError(expect.objectContaining({ code: "SELECTION_STORE_DESTROYED" }));
  });

  it("invalidates the matching dead provider without invoking its hooks", async () => {
    const f = await fixture();
    await f.api.request(f.candidate());
    const resolve = vi.spyOn(f.adapter, "resolve");
    await f.owner.close();
    expect(f.api.getCurrent()).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe("SelectionStore termination", () => {
  it.each([true, false])("emits no terminal event and revokes every operation (selected=%s)", async (selected) => {
    const f = await fixture();
    const candidate = f.candidate();
    if (selected) await f.api.request(candidate);
    const listener = vi.fn();
    const handle = f.api.subscribe(listener);
    f.store.terminate();
    f.store.terminate();
    expect(listener).not.toHaveBeenCalled();
    expect(() => f.api.getCurrent()).toThrowError(expect.objectContaining({ code: "SELECTION_STORE_DESTROYED" }));
    expect(() => f.api.subscribe(listener)).toThrowError(expect.objectContaining({ code: "SELECTION_STORE_DESTROYED" }));
    expect(() => f.candidate()).toThrowError(expect.objectContaining({ code: "SELECTION_STORE_DESTROYED" }));
    expect(() => f.domain.resolve(1, { target: { id: "a" } })).toThrowError(expect.objectContaining({ code: "SELECTION_STORE_DESTROYED" }));
    await expect(f.api.request(candidate)).rejects.toMatchObject({ code: "SELECTION_STORE_DESTROYED", committed: false });
    await expect(f.api.clear()).rejects.toMatchObject({ code: "SELECTION_STORE_DESTROYED", committed: false });
    handle.unsubscribe();
    await f.consumer.close();
    expect(() => f.api.getCurrent()).toThrowError(expect.objectContaining({ code: "SELECTION_STORE_DESTROYED" }));
  });

  it("preserves committed success, rejects reentrant commands, and stops remaining delivery", async () => {
    const f = await fixture();
    const candidate = f.candidate();
    const b = f.candidate("b");
    const pending = [];
    f.api.subscribe(() => {
      pending.push(f.api.request(b), f.api.clear());
      f.store.terminate();
      pending.push(f.api.clear());
    });
    const peer = vi.fn();
    f.api.subscribe(peer);
    await expect(f.api.request(candidate)).resolves.toMatchObject({ ref: { target: { id: "a" } } });
    for (const promise of pending) await expect(promise).rejects.toMatchObject({ code: "SELECTION_STORE_DESTROYED", committed: false });
    expect(peer).not.toHaveBeenCalled();
  });

  it("preserves a committed clear even if its observer terminates", async () => {
    const f = await fixture();
    await f.api.request(f.candidate());
    f.api.subscribe(() => f.store.terminate());
    await expect(f.api.clear()).resolves.toBeUndefined();
  });

  it("preserves already completed no-op results after termination", async () => {
    const f = await fixture();
    const candidate = f.candidate();
    const selected = await f.api.request(candidate);
    const equal = f.api.request(candidate);
    await f.api.clear();
    const empty = f.api.clear();
    f.store.terminate();
    await expect(equal).resolves.toBe(selected);
    await expect(empty).resolves.toBeUndefined();
  });

  it("root abort terminates synchronously and drops deferred invalidation", async () => {
    const f = await fixture();
    await f.api.request(f.candidate());
    const events = vi.fn();
    f.api.subscribe(events);
    let closing;
    f.store.runCommit(() => {
      f.setResolvable(false);
      f.domain.resolve(1, f.api.getCurrent().ref);
      closing = f.app.close();
      expect(() => f.api.getCurrent()).toThrowError(expect.objectContaining({ code: "SELECTION_STORE_DESTROYED" }));
    });
    await closing;
    expect(events).not.toHaveBeenCalled();
  });
});
