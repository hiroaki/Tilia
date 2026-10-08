import { createSubscriptionChannel } from "../extensions/subscriptions.js";
import { createDomainRendererRegistry } from "./registry.js";
import { createSuppressionState } from "./suppression.js";
import { createGeneration } from "./generation.js";
import { createPaneManager } from "../map/panes.js";
import { createInteractionHost } from "../interactions/host.js";
import {
  createPresentationFacade,
  validatePresentation,
} from "./presentation.js";
import { renderingError, renderingErrorCodes as codes } from "./errors.js";

const summary = (error) =>
  Object.freeze({
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    ...(error?.code ? { code: error.code } : {}),
  });
export function createRenderingCoordinator({
  applicationController,
  map,
  getSemantics,
  onError = () => {},
}) {
  const root = applicationController.createChildController({
    label: "rendering-root",
  });
  const resourceOwners = new WeakMap();
  const controllers = new Map(),
    residuals = new Set(),
    late = new Set();
  let terminated = false;
  const report = (error) => {
    try {
      onError(error);
    } catch {}
  };
  const assertAlive = () => {
    if (terminated || !root.scope.alive)
      throw renderingError(
        codes.terminated,
        "Rendering subsystem is terminated",
      );
  };
  const panes = createPaneManager({ map, scope: applicationController.scope });
  const host = createInteractionHost({
    map,
    scope: root.scope,
    onError: report,
  });
  const channel = createSubscriptionChannel({
    getSnapshot: () => list(),
    onError: report,
  });
  const suppression = createSuppressionState({ getSemantics, assertAlive, report, onChange(entryIds) {
    for (const id of entryIds) { const c = controllers.get(id); if (c) applyVisibility(c); }
  } });
  function truth(c) {
    try {
      const entries = getSemantics().entries;
      if (!entries.get(c.id)) return null;
      return entries.getDomainView(c.id, c.domain);
    } catch {
      return null;
    }
  }
  function valid(c, g, revision = g.revision) {
    const view = truth(c);
    return (
      !terminated &&
      root.scope.alive &&
      c.lifetime.scope.alive &&
      c.entryScope.alive &&
      g.scope.alive &&
      g.healthy &&
      controllers.get(c.id) === c &&
      view?.revision === revision &&
      registry.resolve(c.domain) === g.registration
    );
  }
  function status(c) {
    const view = truth(c);
    return Object.freeze({
      entryId: c.id,
      domain: c.domain,
      state: c.state,
      visible: view?.entry.visible ?? c.visible,
      semanticRevision: view?.revision ?? c.revision,
      currentToken: c.current?.token ?? null,
      currentRevision: c.current?.revision ?? null,
      pendingToken: c.pending?.token ?? null,
      pendingRevision: c.pending?.revision ?? null,
      fallbackToken: c.fallback?.token ?? null,
      fallbackRevision: c.fallback?.revision ?? null,
      fallbackDisplayed: !!c.fallback?.displayed,
      lastFailure: c.failure,
      cleanupResidualCount:
        [...residuals].filter((g) => g.entryId === c.id).length +
        [...late].filter((r) => r.generation.entryId === c.id).length,
    });
  }
  function list() {
    assertAlive();
    return Object.freeze([...controllers.values()].map(status));
  }
  function notify(c) {
    if (!terminated && controllers.get(c.id) === c) channel.deliver(status(c));
  }
  function retire(g) {
    if (!g) return;
    const operation = g.close();
    operation.catch((error) => {
      residuals.add(g);
      report(error);
    });
    return operation;
  }
  function lateResidual(generation, retry, error, policy) {
    late.add({ generation, retry, error, policy });
    report(error);
  }
  function cancelPending(c) {
    const g = c.pending;
    c.pending = null;
    retire(g);
  }
  function clearRoles(c) {
    const generations = [
      ...new Set([c.current, c.pending, c.fallback].filter(Boolean)),
    ];
    c.current = c.pending = c.fallback = null;
    for (const g of generations) retire(g);
    return generations;
  }
  function closeController(c) {
    if (c.closed) {
      if (c.lifetime.snapshot().state === "cleanup-failed")
        c.closed = c.lifetime.retryCleanup();
      return c.closed;
    }
    clearRoles(c);
    controllers.delete(c.id);
    c.closed = c.lifetime.close();
    return c.closed;
  }
  function invalidateVisibility(c, error) {
    clearRoles(c);
    c.failure = summary(error);
    c.state = registry.resolve(c.domain) ? "failed" : "unavailable";
    report(error);
    notify(c);
  }
  function applyVisibility(c) {
    for (const g of new Set([c.current, c.fallback, c.pending?.publicationReady ? c.pending : null].filter(Boolean))) {
      g.revoke();
      const epoch = c.epoch,
        visible = c.visible;
      const remainsOwned = () =>
        !terminated &&
        controllers.get(c.id) === c &&
        c.epoch === epoch &&
        (c.current === g || c.fallback === g || c.pending === g) &&
        registry.resolve(c.domain) === g.registration &&
        g.scope.alive;
      try {
        g.applyVisibility(
          visible,
          c.pending === g,
          () => remainsOwned() && c.visible === visible,
        );
        if (c.current === g) g.renew();
      } catch (error) {
        if (remainsOwned()) invalidateVisibility(c, error);
        return;
      }
    }
    notify(c);
  }
  function start(c) {
    if (terminated || !c.lifetime.scope.alive || controllers.get(c.id) !== c)
      return;
    const view = truth(c),
      registration = registry.resolve(c.domain);
    if (!view) return;
    cancelPending(c);
    if (!registration) {
      clearRoles(c);
      c.state = "unavailable";
      c.failure = null;
      notify(c);
      return;
    }
    const generation = createGeneration({
      controller: c.lifetime,
      registration,
      token: String(++c.sequence),
      revision: view.revision,
      snapshot: view.snapshot,
      root: c,
      map,
      panes,
      host,
      selection: getSemantics().selection,
      report,
      lateResidual,
      resourceOwners,
      isTargetVisible: (ref, revision) => {
        if (!["track", "segment", "track-point"].includes(ref?.kind)) return true;
        const view = truth(c);
        return view?.revision === revision && !suppression.isSuppressed(c.id, ref, revision);
      },
    });
    generation.entryId = c.id;
    c.pending = generation;
    c.state = "building";
    c.failure = null;
    generation.candidateCurrent = () =>
      c.pending === generation && valid(c, generation);
    generation.current = () =>
      c.current === generation &&
      valid(c, generation) &&
      c.visible &&
      generation.displayed;
    const attempt = Promise.resolve()
      .then(() => {
        if (!generation.candidateCurrent())
          throw renderingError(codes.stale, "Build superseded");
        return registration.definition.build(generation.input);
      })
      .then((descriptor) => {
        if (!generation.candidateCurrent()) {
          if (
            c.pending === generation &&
            controllers.get(c.id) === c &&
            !terminated
          )
            throw renderingError(
              codes.stale,
              "Current candidate lost its lifetime",
            );
          retire(generation);
          return;
        }
        if (
          !descriptor ||
          typeof descriptor !== "object" ||
          (descriptor.prepareUpdate !== undefined &&
            typeof descriptor.prepareUpdate !== "function")
        )
          throw new TypeError("Invalid prepared render descriptor");
        generation.descriptor = Object.freeze({
          presentation: validatePresentation(descriptor.presentation),
          prepareUpdate: descriptor.prepareUpdate?.bind(descriptor),
        });
        if (!generation.candidateCurrent())
          throw renderingError(
            codes.stale,
            "Descriptor validation lost authority",
          );
        generation.seal();
        generation.preflight();
        generation.publicationReady = true;
        const visible = truth(c).entry.visible;
        generation.applyVisibility(visible, true);
        const assertPublicationCurrent = () => {
          if (
            !generation.candidateCurrent() ||
            truth(c)?.entry.visible !== visible ||
            c.visible !== visible ||
            generation.displayed !== visible
          )
            throw renderingError(codes.stale, "Publication authority changed");
        };
        assertPublicationCurrent();
        const old = [...new Set([c.current, c.fallback].filter(Boolean))];
        for (const g of old) {
          // Exposure invalidation can synchronously call presenter cleanup and
          // reenter retry/deletion/withdrawal. Never overwrite a newer attempt.
          g.revoke();
          assertPublicationCurrent();
        }
        c.current = generation;
        c.pending = c.fallback = null;
        c.visible = visible;
        c.state = "active";
        c.failure = null;
        generation.renew();
        for (const g of old) retire(g);
        notify(c);
      })
      .catch((error) => {
        const owns =
          c.pending === generation &&
          !terminated &&
          controllers.get(c.id) === c;
        if (owns) {
          const fallback = c.fallback;
          const invalidCurrent =
            c.current && !valid(c, c.current) ? c.current : null;
          c.pending = c.fallback = null;
          if (invalidCurrent) c.current = null;
          c.failure = summary(error);
          c.state = c.current
            ? "active"
            : registry.resolve(c.domain)
              ? "failed"
              : "unavailable";
          // Settle this attempt's roles before cleanup can reenter. Cleanup
          // operates on captured generations and cannot clear newer work.
          retire(fallback);
          retire(invalidCurrent);
          if (c.current?.current() && !c.current.exposure?.alive)
            c.current.renew();
        }
        retire(generation);
        report(error);
        if (owns) notify(c);
      });
    generation.scope.track(attempt, { label: "renderer-build", await: false });
    notify(c);
  }
  function schedule(c, fn) {
    const epoch = ++c.epoch;
    queueMicrotask(() => {
      if (!terminated && controllers.get(c.id) === c && c.epoch === epoch) {
        try {
          fn();
        } catch (error) {
          report(error);
          invalidateVisibility(c, error);
        }
      }
    });
  }
  function revisionChanged(c, change) {
    const previous = c.current;
    if (previous) {
      previous.revoke();
      if (c.fallback && c.fallback !== previous) retire(c.fallback);
      c.current = null;
      c.fallback = previous;
    }
    cancelPending(c);
    c.state = registry.resolve(c.domain) ? "building" : "unavailable";
    c.failure = null;
    schedule(c, () => {
      const view = truth(c);
      if (!view) return;
      const generation = previous;
      const canUpdate =
        generation &&
        c.fallback === generation &&
        registry.resolve(c.domain) === generation.registration;
      const epoch = c.epoch;
      if (canUpdate && update(c, generation, view, change)) return;
      if (
        c.epoch === epoch &&
        truth(c)?.revision === view.revision &&
        controllers.get(c.id) === c
      )
        start(c);
    });
  }
  function update(c, g, view, change) {
    const revision = view.revision,
      visible = view.entry.visible;
    const current = () =>
      c.fallback === g &&
      valid(c, g, revision) &&
      truth(c)?.entry.visible === visible &&
      c.visible === visible &&
      g.displayed === visible;
    const input = Object.freeze({
      entryId: c.id,
      previousRevision: g.revision,
      revision,
      snapshot: view.snapshot,
      change,
    });
    let prepared,
      committed = false,
      rollbackAttempted = false;
    const rollback = (restoreDisplay) => {
      rollbackAttempted = true;
      try {
        host.withPublication(() =>
          g.hook(prepared.rollback.bind(prepared), { restoreDisplay }),
        );
      } catch (error) {
        if (c.fallback === g) c.fallback = null;
        retire(g);
        throw error;
      }
    };
    try {
      const strategy = g.registration.definition.planChange
        ? g.hook(g.registration.definition.planChange, input)
        : "replace";
      if (!current()) return false;
      if (!["replace", "update", "none"].includes(strategy))
        throw new TypeError("Invalid render change strategy");
      if (strategy === "replace" || !g.descriptor.prepareUpdate) return false;
      prepared = g.hook(
        g.descriptor.prepareUpdate,
        Object.freeze({ ...input, token: g.token, visible: c.visible }),
      );
      if (!current()) {
        if (typeof prepared?.rollback === "function") rollback(false);
        return false;
      }
      if (
        !prepared ||
        !["nonthrowing", "rollbackable"].includes(prepared.mode) ||
        !Object.hasOwn(prepared, "nextPresentation") ||
        ["preflight", "commit", "rollback"].some(
          (key) => typeof prepared[key] !== "function",
        )
      )
        throw new TypeError("Invalid prepared update");
      const nextPresentation = validatePresentation(prepared.nextPresentation);
      g.hook(prepared.preflight.bind(prepared));
      if (!current()) {
        rollback(false);
        return false;
      }
      committed = true;
      host.withPublication(() => g.hook(prepared.commit.bind(prepared)));
      if (!current()) {
        rollback(false);
        return false;
      }
      g.revision = revision;
      g.snapshot = view.snapshot;
      g.descriptor = Object.freeze({
        ...g.descriptor,
        presentation: nextPresentation,
      });
      c.current = g;
      c.fallback = null;
      c.state = "active";
      c.failure = null;
      g.renew();
      notify(c);
      return true;
    } catch (error) {
      report(error);
      if (
        committed &&
        !rollbackAttempted &&
        typeof prepared?.rollback === "function"
      ) {
        try {
          rollback(current());
        } catch (rollbackError) {
          report(rollbackError);
          if (c.fallback === g) c.fallback = null;
          retire(g);
        }
      }
      return false;
    }
  }
  const registry = createDomainRendererRegistry({
    onError: report,
    assertActive: assertAlive,
    onChange(record) {
      for (const c of controllers.values()) {
        if (c.domain !== record.key) continue;
        if (!registry.resolve(c.domain)) {
          c.epoch++;
          clearRoles(c);
          c.state = "unavailable";
          c.failure = null;
          notify(c);
        } else schedule(c, () => start(c));
      }
    },
  });
  const lifecycle = Object.freeze({
    prepareDomainCommit: input => suppression.prepare(input),
    afterCreated(record) {
      assertAlive();
      const lifetime = root.createChildController({
        label: `render-entry:${record.id}`,
      });
      const c = {
        id: record.id,
        domain: record.domainKey,
        visible: record.visible,
        revision: record.revision,
        lifetime,
        entryScope: record.scope,
        sequence: 0n,
        epoch: 0,
        current: null,
        pending: null,
        fallback: null,
        failure: null,
        state: "unavailable",
        closed: null,
      };
      controllers.set(c.id, c);
      record.scope.signal.addEventListener(
        "abort",
        () => {
          void closeController(c).catch(report);
        },
        { once: true },
      );
      record.scope.defer(() => closeController(c), {
        label: "render-controller-close",
        retry: "safe",
      });
      schedule(c, () => start(c));
    },
    afterDomainCommit(record, change) {
      if (terminated) return;
      const c = controllers.get(record.id);
      if (!c) return;
      c.visible = record.visible;
      c.revision = record.revision;
      revisionChanged(c, change);
    },
    afterVisibilityCommit(record) {
      if (terminated) return;
      const c = controllers.get(record.id);
      if (c) {
        c.visible = record.visible;
        applyVisibility(c);
      }
    },
    afterLogicalRemoval(record, { deferSuppressionNotification = false } = {}) {
      suppression.remove(record.id, { notify: !deferSuppressionNotification });
      const c = controllers.get(record.id);
      if (c) {
        c.epoch++;
        void closeController(c).catch(report);
      }
    },
    afterPresentationWithdrawal() { suppression.publish(); },
  });
  const readFacade = (scope) =>
    Object.freeze({
      ...suppression.facade(scope),
      getStatus(entryId) {
        assertAlive();
        scope.assertAlive();
        const c = controllers.get(entryId);
        return c ? status(c) : null;
      },
      list() {
        assertAlive();
        scope.assertAlive();
        return list();
      },
      subscribe(listener, options) {
        assertAlive();
        return channel.subscribe(scope, listener, options);
      },
      retry(entryId) {
        assertAlive();
        scope.assertAlive();
        const c = controllers.get(entryId);
        if (!c) throw new Error("Entry not found");
        c.epoch++;
        start(c);
        return status(c);
      },
    });
  function terminate() {
    if (terminated) return;
    terminated = true;
    for (const c of [...controllers.values()].reverse()) {
      c.epoch++;
      void closeController(c).catch(report);
    }
  }
  root.scope.signal.addEventListener("abort", terminate, { once: true });
  return Object.freeze({
    registry,
    lifecycle,
    panes,
    createCapabilities(input) {
      return Object.freeze({
        renderers: registry.createFacade(input),
        rendering: readFacade(input.scope),
        interactions: host.createFacade(input.scope),
        presentation: createPresentationFacade({
          scope: input.scope,
          getGeneration: (id) => controllers.get(id)?.current,
          map,
          panes,
          report,
          assertAlive,
        }),
      });
    },
    applicationApi: readFacade(root.scope),
    async close() {
      terminate();
      await root.close();
    },
    async retryCleanup() {
      for (const g of [...residuals]) {
        try {
          await g.close();
          residuals.delete(g);
        } catch (error) {
          report(error);
        }
      }
      for (const r of [...late])
        if (r.policy === "safe") {
          try {
            await r.retry();
            late.delete(r);
          } catch (error) {
            r.error = error;
            report(error);
          }
        }
      if (root.snapshot().state === "cleanup-failed") await root.retryCleanup();
    },
    inspect: () =>
      Object.freeze({
        ownership: root.snapshot(),
        residuals: Object.freeze(
          [...late].map((r) =>
            Object.freeze({
              entryId: r.generation.entryId,
              token: r.generation.token,
              registrationId: r.generation.registration.id,
              scopeId: r.generation.lifetime.snapshot().id,
              scopePath: r.generation.lifetime.snapshot().path,
              error: summary(r.error),
              retry: r.policy,
            }),
          ),
        ),
      }),
  });
}
