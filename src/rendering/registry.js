import { createSubscriptionChannel } from "../extensions/subscriptions.js";
import { assertDomainKey } from "../domains/identity.js";
import { renderingError, renderingErrorCodes as codes } from "./errors.js";

export function createDomainRendererRegistry({
  onChange = () => {},
  onError = () => {},
  assertActive = () => {},
} = {}) {
  const active = new Map(),
    pending = new Map();
  let sequence = 0;
  const report = (error) => {
    try {
      onError(error);
    } catch {}
  };
  const channel = createSubscriptionChannel({ onError: report });
  const notify = (record) => {
    try {
      onChange(record);
      channel.deliver(
        Object.freeze({ domain: record.key, available: !!resolve(record.key) }),
      );
    } catch (error) {
      report(error);
    }
  };
  const resolve = (key) => {
    assertDomainKey(key);
    const r = active.get(key);
    return r?.live && r.owner.alive ? r : null;
  };
  function createFacade({ scope, stage, enqueuePostCommit = (fn) => fn() }) {
    return Object.freeze({
      register(key, definition) {
        assertActive();
        scope.assertAlive();
        assertDomainKey(key);
        if (
          !definition ||
          typeof definition.build !== "function" ||
          (definition.planChange !== undefined &&
            typeof definition.planChange !== "function")
        ) {
          throw renderingError(codes.invalid, "Invalid renderer definition");
        }
        const lifetime = scope.child({
          label: `renderer-registration:${key.id}`,
        });
        const record = {
          id: String(++sequence),
          key,
          owner: scope,
          live: false,
          definition: Object.freeze({
            build: definition.build.bind(definition),
            planChange: definition.planChange?.bind(definition),
          }),
          generations: new Set(),
        };
        const withdraw = () => {
          if (!record.live) return;
          record.live = false;
          if (active.get(key) === record) active.delete(key);
          notify(record);
        };
        scope.signal.addEventListener("abort", withdraw, { once: true });
        lifetime.defer(
          async () => {
            withdraw();
            const results = await Promise.allSettled(
              [...record.generations].map((generation) => generation.close()),
            );
            const failures = results
              .filter((result) => result.status === "rejected")
              .map((result) => result.reason);
            if (failures.length)
              throw new AggregateError(
                failures,
                "Renderer generation cleanup failed",
              );
          },
          { label: "renderer-generations-close", retry: "safe" },
        );
        if (!pending.has(key)) pending.set(key, new Set());
        pending.get(key).add(record);
        let handle;
        try {
          handle = stage({
            label: `renderer:${key.id}`,
            retry: "safe",
            preflight() {
              assertActive();
              if (
                resolve(key) ||
                [...(pending.get(key) ?? [])].some(
                  (r) => r !== record && r.owner.alive,
                )
              ) {
                throw renderingError(
                  codes.duplicate,
                  `Renderer for ${key.id} already registered`,
                );
              }
            },
            commit() {
              assertActive();
              record.live = true;
              active.set(key, record);
              enqueuePostCommit(() => {
                if (record.live) notify(record);
              });
            },
            async dispose() {
              pending.get(key)?.delete(record);
              if (!pending.get(key)?.size) pending.delete(key);
              withdraw();
              await lifetime.dispose();
              scope.signal.removeEventListener("abort", withdraw);
            },
          });
        } catch (error) {
          pending.get(key).delete(record);
          void lifetime.dispose().catch(report);
          throw error;
        }
        return Object.freeze({
          domain: key,
          registrationId: record.id,
          async dispose() {
            withdraw();
            await lifetime.dispose();
            await handle.dispose();
          },
        });
      },
    });
  }
  return Object.freeze({
    resolve,
    createFacade,
    subscribe: (scope, listener, options) =>
      channel.subscribe(scope, listener, options),
    inspect: () =>
      Object.freeze(
        [...active.values()]
          .filter((r) => r.live && r.owner.alive)
          .sort((a, b) => a.key.id.localeCompare(b.key.id))
          .map((r) =>
            Object.freeze({ domainId: r.key.id, registrationId: r.id }),
          ),
      ),
  });
}
