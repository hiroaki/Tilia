import { createToolbarPoint } from "./toolbar-contributions.js";
import { guardedMount } from "./contribution-mount.js";
import { assertDomainKey } from "../domains/identity.js";
import { createContributionPoint } from "../extensions/contributions.js";
import { createSubscriptionChannel } from "../extensions/subscriptions.js";


function primaryPoint(id, onError) {
  const records = new Map(), pending = new Map();
  const snapshot = () => Object.freeze([...records.values()].filter((r) => r.owner.alive)
    .map((r) => Object.freeze({ domain: r.domain, descriptor: r.descriptor })));
  const channel = createSubscriptionChannel({ getSnapshot: snapshot, onError });
  return (input) => Object.freeze({
    register(domain, descriptor) {
      input.scope.assertAlive();
      assertDomainKey(domain);
      if (typeof descriptor?.mount !== "function") throw new TypeError(`Invalid ${id} adapter`);
      const record = { domain, owner: input.scope,
        descriptor: Object.freeze({ mount: guardedMount(input.scope, descriptor.mount, onError) }) };
      if (!pending.has(domain)) pending.set(domain, new Set());
      pending.get(domain).add(record);
      const notify = () => channel.deliver(snapshot());
      input.scope.signal.addEventListener("abort", notify, { once: true });
      input.stage({ label: `${id}:${domain.id}`, retry: "safe",
        preflight() {
          if (records.get(domain)?.owner.alive || [...pending.get(domain)].some((r) => r !== record && r.owner.alive))
            throw new Error(`Duplicate ${id} adapter for ${domain.id}`);
        },
        commit() { records.set(domain, record); input.enqueuePostCommit(notify); },
        dispose({ committed }) {
          input.scope.signal.removeEventListener("abort", notify);
          pending.get(domain)?.delete(record);
          if (pending.get(domain)?.size === 0) pending.delete(domain);
          if (committed && records.get(domain) === record) { records.delete(domain); notify(); }
        },
      });
    },
    get(domain) {
      input.scope.assertAlive(); assertDomainKey(domain);
      const r = records.get(domain);
      return r?.owner.alive ? r.descriptor : null;
    },
    getSnapshot() { input.scope.assertAlive(); return snapshot(); },
    subscribe(fn, options) { return channel.subscribe(input.scope, fn, options); },
  });
}

export function createDomainContributions({ onError = () => {} } = {}) {
  const toolbar = createToolbarPoint(onError);
  const layers = primaryPoint("layers", onError), popup = primaryPoint("popup", onError);
  const settings = createContributionPoint({ id: "entry-settings", onError,
    validateDescriptor: (d) => typeof d?.mount === "function" && typeof d?.supports === "function" });
  return Object.freeze({ createFacade(input) {
    const facade = settings.createFacade(input);
    return Object.freeze({ toolbar: toolbar(input), layers: layers(input), popup: popup(input), settings: Object.freeze({
      ...facade,
      register(value) {
        input.scope.assertAlive();
        if (typeof value?.descriptor?.supports !== "function" || typeof value?.descriptor?.mount !== "function")
          throw new TypeError("Invalid settings contribution");
        facade.register({ ...value, descriptor: {
          supports: input.scope.guard(value.descriptor.supports),
          mount: guardedMount(input.scope, value.descriptor.mount, onError),
        } });
      },
    }) });
  } });
}
