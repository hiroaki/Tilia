import { cloneAndFreezePlainData } from "../domains/immutable.js";
import {
  renderingError,
  renderingErrorCodes as codes,
  synchronous,
} from "./errors.js";

export function createGeneration({
  controller,
  registration,
  token,
  revision,
  snapshot,
  root,
  map,
  panes,
  host,
  selection,
  report,
  lateResidual,
  resourceOwners,
  isTargetVisible = () => true,
}) {
  const lifetime = controller.createChildController({
    label: `generation:${token}`,
  });
  const scope = lifetime.scope,
    effects = [],
    ownedValues = new WeakSet(),
    paneLeases = new WeakMap();
  const groups = new WeakMap(), surfaceGroups = new WeakMap();
  const groupVisible = group => !group || isTargetVisible(groups.get(group), generation.revision);
  let sealed = false,
    retired = false,
    updateHook = false,
    violation = null,
    issuer = null,
    exposure = null;
  let closePromise = null;
  const generation = {
    token,
    isTargetVisible: ref => isTargetVisible(ref, generation.revision),
    revision,
    snapshot,
    registration,
    scope,
    lifetime,
    descriptor: null,
    healthy: true,
    displayed: false,
    effects,
    candidateCurrent: () => false,
    current: () => false,
    get exposure() {
      return exposure;
    },
    get issuer() {
      return issuer;
    },
    assertMutation() {
      if (updateHook) {
        violation ??= renderingError(
          codes.updateForbidden,
          "Update hooks cannot change rendering registrations",
        );
        throw violation;
      }
    },
    assertRegistration() {
      generation.assertMutation();
      scope.assertAlive();
      if (sealed)
        throw renderingError(
          codes.sealed,
          "Generation publication ledger is sealed",
        );
      if (!generation.candidateCurrent())
        throw renderingError(codes.stale, "Generation is stale");
    },
    hook(callback, ...args) {
      updateHook = true;
      violation = null;
      try {
        const value = synchronous(callback, ...args);
        if (violation) throw violation;
        return value;
      } finally {
        updateHook = false;
      }
    },
    revoke() {
      const oldIssuer = issuer,
        oldExposure = exposure;
      issuer = null;
      exposure = null;
      if (oldIssuer) void oldIssuer.dispose().catch(report);
      if (oldExposure) void oldExposure.dispose().catch(report);
    },
    renew() {
      generation.revoke();
      if (!generation.current()) return;
      issuer = scope.child({ label: "interaction-authority" });
      exposure = scope.child({ label: "presentation-exposure" });
    },
    seal() {
      sealed = true;
    },
    preflight() {
      return host.withPublication(() => {
        assertCandidate();
        for (const effect of effects) {
          if (effect.disposed) continue;
          synchronous(effect.definition.preflight);
          assertCandidate();
        }
      });
    },
    applyVisibility(visible, candidate = false, validate = () => true) {
      return host.withPublication(() => {
        if (candidate) assertCandidate();
        if (!validate())
          throw renderingError(codes.stale, "Visibility authority changed");
        // Ungrouped listener effects mount once; grouped layers follow current target gates.
        for (const effect of effects) {
          if (effect.disposed) continue;
          const expose = (visible || !effect.visibility) && groupVisible(effect.group);
          if (expose && !effect.attempted) {
            effect.attempted = true;
            synchronous(effect.definition.mount);
          } else if (!expose && effect.attempted) {
            synchronous(effect.definition.withdraw);
            effect.attempted = false;
          }
          if (candidate) assertCandidate();
          if (!validate()) throw renderingError(codes.stale, "Visibility authority changed");
          // A mount callback may acquire suppression without changing entry revision.
          if (effect.attempted && !groupVisible(effect.group)) {
            synchronous(effect.definition.withdraw); effect.attempted = false;
          }
        }
        generation.displayed = visible;
      });
    },
    withdraw() {
      return host.withPublication(() => {
        generation.revoke();
        generation.displayed = false;
        const errors = [];
        for (const effect of [...effects].reverse()) {
          if (!effect.attempted) continue;
          try {
            synchronous(effect.definition.withdraw);
            effect.attempted = false;
          } catch (error) {
            errors.push(error);
            report(error);
          }
        }
        if (errors.length)
          throw new AggregateError(errors, "Generation withdrawal failed");
      });
    },
    close() {
      if (closePromise) {
        if (lifetime.snapshot().state === "cleanup-failed") {
          closePromise = lifetime.retryCleanup();
          closePromise.then(
            () => registration.generations.delete(generation),
            () => {},
          );
        }
        return closePromise;
      }
      retired = true;
      generation.healthy = false;
      try {
        generation.withdraw();
      } catch {
        /* scope-owned obligations retry withdrawal */
      }
      closePromise = lifetime.close();
      closePromise.then(
        () => registration.generations.delete(generation),
        () => {},
      );
      return closePromise;
    },
  };
  registration.generations.add(generation);
  scope.signal.addEventListener(
    "abort",
    () => {
      retired = true;
      generation.healthy = false;
      try {
        generation.withdraw();
      } catch {}
    },
    { once: true },
  );
  function assertCandidate() {
    if (!generation.candidateCurrent())
      throw renderingError(codes.stale, "Candidate lost publication authority");
  }
  function remember(value) {
    if (value && (typeof value === "object" || typeof value === "function")) {
      ownedValues.add(value);
      resourceOwners.set(value, scope);
    }
  }
  function stageEffect(definition, visibility = false, group = null) {
    generation.assertRegistration();
    if (
      !definition ||
      ["preflight", "mount", "withdraw", "dispose"].some(
        (name) => typeof definition[name] !== "function",
      )
    )
      throw new TypeError("Invalid staged rendering effect");
    const effect = {
      definition: Object.freeze({
        label: definition.label,
        retry: definition.retry,
        ...Object.fromEntries(
          ["preflight", "mount", "withdraw", "dispose"].map((key) => [
            key,
            definition[key].bind(definition),
          ]),
        ),
      }),
      attempted: false,
      group,
      visibility,
      disposed: false,
      released: false,
    };
    const handle = scope.defer(
      async () => {
        const failures = [];
        if (effect.attempted) {
          try {
            host.withPublication(() => synchronous(effect.definition.withdraw));
            effect.attempted = false;
          } catch (error) {
            failures.push(error);
          }
        }
        if (!effect.released) {
          try {
            await effect.definition.dispose();
            effect.released = true;
          } catch (error) {
            failures.push(error);
          }
        }
        if (failures.length)
          throw new AggregateError(failures, "Staged effect cleanup failed");
        effect.disposed = true;
      },
      { label: definition.label, retry: definition.retry ?? "never" },
    );
    effects.push(effect);
    assertCandidate();
    return Object.freeze({
      dispose: () => {
        generation.assertMutation();
        return handle.dispose();
      },
    });
  }
  const visibility = Object.freeze({
    createGroup(target) {
      generation.assertRegistration();
      if (!target || target.kind !== "track" || !Number.isInteger(target.trackIndex) || target.trackIndex < 0)
        throw new TypeError("Invalid track visibility target");
      const handle = Object.freeze(Object.create(null));
      groups.set(handle, cloneAndFreezePlainData(target));
      return handle;
    },
    isVisible(target) { scope.assertAlive(); return isTargetVisible(target, generation.revision); },
  });
  const resources = Object.freeze({
    own(value, dispose, options = {}) {
      generation.assertRegistration();
      if (
        value &&
        (typeof value === "object" || typeof value === "function") &&
        resourceOwners.has(value)
      )
        throw new TypeError("Resource already has generation ownership");
      if (typeof dispose !== "function")
        throw new TypeError("Resource disposer required");
      const handle = scope.defer(() => dispose(value), {
        label: options.label ?? "render-resource",
        retry: options.retry ?? "never",
      });
      remember(value);
      if (value && (typeof value === "object" || typeof value === "function"))
        resourceOwners.set(value, scope);
      assertCandidate();
      return Object.freeze({
        value,
        dispose: () => {
          generation.assertMutation();
          return handle.dispose();
        },
      });
    },
    acquire(factory, dispose, options = {}) {
      generation.assertRegistration();
      if (
        typeof factory !== "function" ||
        typeof dispose !== "function" ||
        (options.settlement !== undefined &&
          !["detach", "await"].includes(options.settlement))
      )
        throw new TypeError("Invalid resource acquisition");
      let value,
        fulfilled = false,
        disposed = false,
        closing = false,
        ticketDetached = false,
        disposing = null;
      const release = () => {
        if (!fulfilled || disposed) return Promise.resolve();
        if (disposing) return disposing;
        disposing = Promise.resolve()
          .then(() => dispose(value))
          .then(
            () => {
              disposed = true;
            },
            (error) => {
              disposing = null;
              throw error;
            },
          );
        return disposing;
      };
      // Ticket is owned before factory invocation. Late settlement never mutates a dead scope.
      const ticket = scope.defer(
        () => {
          closing = true;
          if (!fulfilled) {
            ticketDetached = true;
            return;
          }
          return release();
        },
        {
          label: options.label ?? "acquisition-ticket",
          retry: options.retry ?? "never",
        },
      );
      const work = Promise.resolve()
        .then(() => factory(scope.signal))
        .then(async (result) => {
          if (
            result &&
            (typeof result === "object" || typeof result === "function") &&
            resourceOwners.has(result)
          )
            throw new TypeError(
              "Acquisition returned a resource already owned by a generation",
            );
          value = result;
          fulfilled = true;
          remember(value);
          if (closing || retired || !generation.candidateCurrent()) {
            if (ticketDetached) {
              try {
                await release();
              } catch (error) {
                lateResidual(
                  generation,
                  release,
                  error,
                  options.retry ?? "never",
                );
              }
            } else if (!retired) {
              // Publication finished before an unawaited ticket. It cannot add effects.
              try {
                await ticket.dispose();
              } catch (error) {
                report(error);
              }
            }
            // Otherwise closing Scope still owns disposal. Awaitable settlement
            // failures therefore reach plugin teardown rather than the late ledger.
            throw renderingError(
              codes.stale,
              "Acquisition settled after generation retirement",
            );
          }
          return Object.freeze({
            value,
            dispose: () => {
              generation.assertMutation();
              return ticket.dispose();
            },
          });
        });
      scope.track(work, {
        label: options.label ?? "render-acquisition",
        await: options.settlement === "await",
        cancel: options.cancel,
      });
      work.catch(() => {});
      return work;
    },
    stageEffect: (effect) => stageEffect(effect, true),
  });
  // The renderer may retain this facade, so ownership-changing methods stay guarded after build.
  const guardedScope = (original) =>
    Object.freeze({
      get alive() {
        return original.alive;
      },
      get signal() {
        return original.signal;
      },
      assertAlive: () => original.assertAlive(),
      guard: (callback) =>
        original.guard(function (...args) {
          if (generation.candidateCurrent() || generation.current())
            return callback.apply(this, args);
        }),
      child(options) {
        generation.assertRegistration();
        return guardedScope(original.child(options));
      },
      defer(...args) {
        generation.assertRegistration();
        const handle = original.defer(...args);
        return Object.freeze({
          get state() {
            return handle.state;
          },
          dispose() {
            generation.assertMutation();
            return handle.dispose();
          },
        });
      },
      track(...args) {
        generation.assertRegistration();
        return original.track(...args);
      },
      ...(original.dispose
        ? {
            dispose: () => {
              generation.assertMutation();
              return original.dispose();
            },
          }
        : {}),
    });
  const readMap = {
    getViewport() {
      scope.assertAlive();
      const bounds = map.getBounds?.();
      return Object.freeze({
        center: copyPoint(map.getCenter?.()),
        zoom: map.getZoom?.(),
        bounds: bounds
          ? Object.freeze({
              southWest: copyPoint(bounds.getSouthWest()),
              northEast: copyPoint(bounds.getNorthEast()),
            })
          : null,
      });
    },
    project(point, zoom) {
      scope.assertAlive();
      const value = map.project(point, zoom);
      return Object.freeze({ x: value.x, y: value.y });
    },
    unproject(pixel, zoom) {
      scope.assertAlive();
      return copyPoint(map.unproject(pixel, zoom));
    },
    getPaneName(band) {
      generation.assertRegistration();
      return panes.getPaneName(band);
    },
  };
  const generationMap = Object.freeze({
    ...readMap,
    createPane(options) {
      generation.assertRegistration();
      const lease = panes.acquire(
        `renderer:${registration.id}:entry:${root.id}`,
        options,
        scope,
      );
      remember(lease);
      assertCandidate();
      const handle = Object.freeze({
        name: lease.name,
        band: lease.band,
        dispose() {
          generation.assertMutation();
          return lease.dispose();
        },
      });
      paneLeases.set(handle, lease);
      remember(handle);
      return handle;
    },
    attachLayer(layer, options = {}) {
      generation.assertRegistration();
      if (options.group && !groups.has(options.group)) throw new TypeError("Foreign visibility group");
      if (!ownedValues.has(layer))
        throw new TypeError("Layer must be owned by this generation");
      if (
        options.pane &&
        !panes.isOwnedBy(paneLeases.get(options.pane) ?? options.pane, scope)
      )
        throw new TypeError("Pane lease must be owned by this generation");
      const paneName =
        options.pane?.name ?? panes.getPaneName(options.band ?? "geometry");
      if (layer.options) layer.options.pane = paneName;
      const handle = stageEffect(
        {
          label: "render-layer",
          preflight() {
            if (
              typeof layer.addTo !== "function" ||
              typeof layer.remove !== "function"
            )
              throw new TypeError("Invalid layer attachment");
          },
          mount: () => layer.addTo(map),
          withdraw: () => layer.remove(),
          dispose() {},
          retry: "safe",
        },
        true,
        options.group ?? null,
      );
      return Object.freeze({
        id: `${token}:attachment:${effects.length}`,
        dispose: handle.dispose,
      });
    },
    listen(type, listener) {
      generation.assertRegistration();
      if (typeof type !== "string" || typeof listener !== "function")
        throw new TypeError("Invalid map listener");
      const callback = (event) => {
        if (!generation.current()) return;
        try {
          Promise.resolve(
            listener(Object.freeze({ type, latlng: copyPoint(event?.latlng) })),
          ).catch(report);
        } catch (error) {
          report(error);
        }
      };
      return stageEffect({
        label: `render-map-listener:${type}`,
        preflight() {},
        mount: () => map.on(type, callback),
        withdraw: () => map.off(type, callback),
        dispose() {},
        retry: "safe",
      });
    },
  });
  const ordinary = host.createFacade(scope, {
    assertRegistration: generation.assertRegistration,
    stageEffect,
    isCurrent: () => generation.current(),
  });
  function select(target) {
    generation.assertMutation();
    if (!generation.current() || !issuer?.alive || !isTargetVisible(target, generation.revision))
      return Promise.reject(
        renderingError(codes.stale, "No current interaction authority"),
      );
    const captured = issuer;
    const candidate = selection
      .createDomainFacade(captured, registration.key)
      .createCandidate(root.id, target);
    if (!generation.current() || issuer !== captured)
      return Promise.reject(
        renderingError(codes.stale, "Interaction authority changed"),
      );
    return selection.createFacade(captured).request(candidate);
  }
  const interactions = Object.freeze({
    createSurface(options) {
      generation.assertRegistration();
      if (!ownedValues.has(options?.target))
        throw new TypeError("Interaction target must be generation-owned");
      if (options.group && !groups.has(options.group)) throw new TypeError("Foreign visibility group");
      const surface = ordinary.createSurface(options);
      surfaceGroups.set(surface, options.group ?? null);
      return surface;
    },
    bind({ id, surface, event, consume = true, resolve }) {
      generation.assertRegistration();
      if (typeof resolve !== "function" || typeof consume !== "boolean")
        throw new TypeError("Invalid generation resolver");
      return ordinary.bind({
        id,
        surface,
        event,
        tier: "object",
        handle(input) {
          if (!generation.current() || !groupVisible(surfaceGroups.get(surface))) return { consume: false };
          const target = synchronous(
            resolve,
            input,
            Object.freeze({
              entryId: root.id,
              domain: registration.key,
              semanticRevision: generation.revision,
              semanticSnapshot: generation.snapshot,
            }),
          );
          if (target === null || target === undefined || !generation.current() || !groupVisible(surfaceGroups.get(surface)))
            return { consume: false };
          // Even consume:false permits the semantic object action, while background processing continues.
          if (!consume) {
            void select(target).catch(report);
            return { consume: false };
          }
          return { consume: true, run: () => select(target) };
        },
      });
    },
  });
  generation.input = Object.freeze({
    entryId: root.id,
    domain: registration.key,
    semanticRevision: revision,
    semanticSnapshot: snapshot,
    visible: root.visible,
    scope: guardedScope(scope),
    signal: scope.signal,
    currency: Object.freeze({
      token,
      isCurrent: () => generation.candidateCurrent() || generation.current(),
    }),
    map: generationMap,
    visibility,
    resources,
    interactions,
    selection: Object.freeze({
      getCurrent: () => selection.createFacade(scope).getCurrent(),
      subscribe(listener, options) {
        generation.assertRegistration();
        return selection.createFacade(scope).subscribe((event) => {
          if (generation.current()) return listener(event);
        }, options);
      },
      select,
    }),
  });
  return generation;
}
export function copyPoint(value) {
  if (!value) return null;
  if (
    !Number.isFinite(value.lat) ||
    !Number.isFinite(value.lng) ||
    Math.abs(value.lat) > 90 ||
    Math.abs(value.lng) > 180
  )
    throw new TypeError("Invalid geographic point");
  return Object.freeze({ lat: value.lat, lng: value.lng });
}
