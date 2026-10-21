import { isScopeWithin, scopeIsOperational } from "../ownership/scope.js";
import { synchronous } from "../rendering/errors.js";

const supported = new Set([
  "click",
  "preclick",
  "dblclick",
  "mousedown",
  "mouseup",
  "mousemove",
  "mouseover",
  "mouseout",
  "contextmenu",
  "keydown",
  "keyup",
  "pointerdown",
  "pointerup",
  "pointermove",
  "touchstart",
  "touchend",
]);
const point = (value) =>
  value ? Object.freeze({ lat: value.lat, lng: value.lng }) : null;
export function interactionInput(event, type) {
  const carrier = event?.originalEvent ?? event;
  return Object.freeze({
    type,
    latlng: point(event?.latlng),
    key: typeof carrier?.key === "string" ? carrier.key : null,
    button: Number.isInteger(carrier?.button) ? carrier.button : null,
    shiftKey: !!carrier?.shiftKey,
    ctrlKey: !!carrier?.ctrlKey,
    altKey: !!carrier?.altKey,
    metaKey: !!carrier?.metaKey,
  });
}
function listen(target, type, callback) {
  if (typeof target?.on === "function" && typeof target?.off === "function") {
    target.on(type, callback);
    return () => target.off(type, callback);
  }
  if (
    typeof target?.addEventListener === "function" &&
    typeof target?.removeEventListener === "function"
  ) {
    target.addEventListener(type, callback);
    return () => target.removeEventListener(type, callback);
  }
  throw new TypeError("Interaction target must be DOM or Leaflet Evented");
}
export function createInteractionHost({ map, scope, onError = () => {} }) {
  const surfaces = new WeakMap(),
    records = new Set(),
    occurrences = new WeakMap();
  let publishing = 0;
  const report = (error) => {
    try {
      onError(error);
    } catch {}
  };
  const rootHandle = Object.freeze(Object.create(null));
  const root = {
    handle: rootHandle,
    id: "map",
    target: map,
    scope,
    parent: null,
    depth: 0,
    closed: false,
    isCurrent: () => true,
  };
  surfaces.set(rootHandle, root);
  function live(surface) {
    return (
      !!surface &&
      !surface.closed &&
      scopeIsOperational(surface.scope) &&
      (!surface.parent || live(surface.parent))
    );
  }
  function eligible(record) {
    return (
      record.active &&
      !record.disposed &&
      scopeIsOperational(record.scope) &&
      live(record.surface) &&
      record.isCurrent()
    );
  }
  function read(handle) {
    const surface = surfaces.get(handle);
    if (!live(surface))
      throw new TypeError("Invalid or closed interaction surface");
    return surface;
  }
  function stop(event) {
    const carrier = event?.originalEvent ?? event;
    carrier?.stopPropagation?.();
    // Leaflet's documented DomEvent.stopPropagation carrier convention.
    if (event?.originalEvent) event.originalEvent._stopped = true;
  }
  function dispatch(surface, type, event) {
    if (!live(surface)) return;
    const carrier = event?.originalEvent ?? event;
    if (
      !carrier ||
      (typeof carrier !== "object" && typeof carrier !== "function")
    )
      return;
    let types = occurrences.get(carrier);
    if (!types) {
      types = new Map();
      occurrences.set(carrier, types);
    }
    if (publishing || !surface.isCurrent()) {
      types.set(type, { consumed: true });
      stop(event);
      return;
    }
    if (types.has(type)) {
      if (types.get(type).consumed) stop(event);
      return;
    }
    const occurrence = { consumed: false };
    types.set(type, occurrence);
    const ancestors = [];
    for (let current = surface; current; current = current.parent)
      ancestors.push(current);
    const applicable = [...records].filter(
      (r) => r.event === type && eligible(r),
    );
    const ordered = [
      ...ancestors.flatMap((s) =>
        applicable.filter((r) => r.tier === "modal" && r.surface === s),
      ),
      ...applicable.filter((r) => r.tier === "object" && r.surface === surface),
      ...applicable.filter(
        (r) => r.tier === "background" && r.surface === root,
      ),
    ];
    for (const record of ordered) {
      // Earlier handlers may revoke the origin or a snapshotted candidate.
      if (!live(surface)) break;
      if (publishing || !surface.isCurrent()) {
        occurrence.consumed = true;
        stop(event);
        break;
      }
      if (!eligible(record)) continue;
      let decision;
      try {
        decision = synchronous(record.handle, interactionInput(event, type));
        if (
          !decision ||
          typeof decision.consume !== "boolean" ||
          (decision.run !== undefined && typeof decision.run !== "function")
        ) {
          throw new TypeError("Invalid synchronous InteractionDecision");
        }
      } catch (error) {
        report(error);
        decision = { consume: true };
      }
      if (!decision.consume) continue;
      occurrence.consumed = true;
      stop(event);
      if (
        decision.run &&
        live(surface) &&
        surface.isCurrent() &&
        eligible(record)
      ) {
        try {
          Promise.resolve(decision.run()).catch(report);
        } catch (error) {
          report(error);
        }
      }
      break;
    }
  }
  function facade(
    consumerScope,
    {
      assertRegistration = () => {},
      stageEffect = null,
      isCurrent = () => true,
    } = {},
  ) {
    const assertOwner = (owner) => {
      consumerScope.assertAlive();
      owner.assertAlive();
      if (!isScopeWithin(owner, consumerScope))
        throw new TypeError(
          "Interaction owner must be the consumer scope or its child",
        );
    };
    return Object.freeze({
      mapSurface() {
        consumerScope.assertAlive();
        return rootHandle;
      },
      createSurface({
        id,
        target,
        parent = rootHandle,
        scope: owner = consumerScope,
      } = {}) {
        assertRegistration();
        assertOwner(owner);
        const ancestor = read(parent);
        if (typeof id !== "string" || !id || !target)
          throw new TypeError("Invalid interaction surface");
        const handle = Object.freeze(Object.create(null));
        const surface = {
          handle,
          id,
          target,
          scope: owner,
          parent: ancestor,
          depth: ancestor.depth + 1,
          closed: false,
          isCurrent,
        };
        surfaces.set(handle, surface);
        owner.defer(
          () => {
            surface.closed = true;
          },
          { label: `surface:${id}`, retry: "safe" },
        );
        return handle;
      },
      bind({
        id,
        surface: surfaceHandle,
        event,
        tier,
        scope: owner = consumerScope,
        handle,
      } = {}) {
        assertRegistration();
        assertOwner(owner);
        const surface = read(surfaceHandle);
        if (surface !== root && !isScopeWithin(surface.scope, consumerScope))
          throw new TypeError("Foreign interaction surface");
        if (
          typeof id !== "string" ||
          !id ||
          !supported.has(event) ||
          !["modal", "object", "background"].includes(tier) ||
          typeof handle !== "function"
        )
          throw new TypeError("Invalid interaction binding");
        if (tier === "background" && surface !== root)
          throw new TypeError("Background binding requires map root");
        const record = {
          id,
          surface,
          event,
          tier,
          scope: owner,
          handle,
          isCurrent,
          active: false,
          remove: null,
          disposed: false,
        };
        const preflight = () => {
          if (
            [...records].some(
              (r) =>
                r !== record &&
                !r.disposed &&
                r.scope.alive &&
                r.surface === surface &&
                r.event === event &&
                r.tier === tier,
            )
          )
            throw new Error("Duplicate primary interaction binding");
        };
        // Reserve immediately, including staged bindings.
        preflight();
        records.add(record);
        const withdraw = () => {
          record.active = false;
          if (record.remove) {
            record.remove();
            record.remove = null;
          }
        };
        const dispose = () => {
          withdraw();
          record.disposed = true;
          records.delete(record);
        };
        const mount = () => {
          record.active = true;
          // The removal obligation exists before adapter attachment, including a partial throw.
          const callback = (eventObject) =>
            dispatch(surface, event, eventObject);
          record.remove = () => {
            if (typeof surface.target.off === "function")
              surface.target.off(event, callback);
            else surface.target.removeEventListener(event, callback);
          };
          listen(surface.target, event, callback);
        };
        if (stageEffect)
          return stageEffect({
            label: `binding:${id}`,
            preflight,
            mount,
            withdraw,
            dispose,
            retry: "safe",
          });
        const owned = owner.defer(dispose, {
          label: `binding:${id}`,
          retry: "safe",
        });
        try {
          mount();
        } catch (error) {
          void owned.dispose().catch(report);
          throw error;
        }
        return owned;
      },
    });
  }
  return Object.freeze({
    createFacade: facade,
    withPublication(callback) {
      publishing++;
      try {
        return callback();
      } finally {
        publishing--;
      }
    },
  });
}
