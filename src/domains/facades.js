import { isScopeWithin } from "../ownership/scope.js";
import { gpxDomainKey, photoDomainKey } from "./keys.js";
import { assertDomainKey } from "./identity.js";
import { semanticError, semanticErrorCodes } from "./errors.js";

function domainFacade(scope, entries, key, commands) {
  return Object.freeze({
    create(value, options) {
      scope.assertAlive();
      return entries.create(scope, key, value, options);
    },
    get(id) {
      scope.assertAlive();
      return entries.getDomainView(id, key);
    },
    ...Object.fromEntries(Object.entries(commands).map(([name, makeCommand]) => [name,
      (id, value, options = {}) => {
        scope.assertAlive();
        return entries.update(scope, id, key, makeCommand(value), options);
      },
    ])),
  });
}

export function createGpxFacade({ scope, entries, selection }) {
  const facade = domainFacade(scope, entries, gpxDomainKey, {
    replaceData: (data) => Object.freeze({ type: "replace-data", data }),
    setCategoryVisibility: ({ category, visible }) => Object.freeze({ type: "set-category-visibility", category, visible }),
    setTrackVisibility: ({ trackIndex, visible }) => Object.freeze({ type: "set-track-visibility", trackIndex, visible }),
    setStylePreset: (stylePresetId) => Object.freeze({ type: "set-style-preset", stylePresetId }),
    recomputeDerived: () => Object.freeze({ type: "recompute-derived" }),
  });
  return selection ? Object.freeze({ ...facade, selection: selection.createDomainFacade(scope, gpxDomainKey) }) : facade;
}

export function createPhotoFacade({ scope, entries, selection }) {
  const facade = domainFacade(scope, entries, photoDomainKey, {
    replaceData: (data) => Object.freeze({ type: "replace-data", data }),
    setRequestedTimeMode: (requestedTimeMode) => Object.freeze({ type: "set-requested-time-mode", requestedTimeMode }),
    recomputeDerived: () => Object.freeze({ type: "recompute-derived" }),
  });
  const previewFacade = Object.freeze({ ...facade,
    getPreview(id, { scope: consumer = scope } = {}) {
      scope.assertAlive();
      if (!isScopeWithin(consumer, scope)) throw new TypeError("Preview scope must belong to the consumer");
      consumer.assertAlive();
      const target = entries.getSemanticTarget(id, photoDomainKey);
      if (!target.providerRegistration.owner.alive) throw semanticError(semanticErrorCodes.providerUnavailable, "Photo provider is unavailable");
      return target.providerRegistration.provider.getPreview(target.instance, {
        scope: consumer,
        isCurrent() {
          if (!scope.alive || !target.providerRegistration.owner.alive) return false;
          try {
            const current = entries.getSemanticTarget(id, photoDomainKey);
            return current.providerRegistration === target.providerRegistration &&
              current.instance.preview === target.instance.preview;
          } catch { return false; }
        },
      });
    },
  });
  return selection ? Object.freeze({ ...previewFacade, selection: selection.createDomainFacade(scope, photoDomainKey, { defaultTarget: Object.freeze({ kind: "photo" }) }) }) : previewFacade;
}

export function createEntryFacade({ scope, entries }) {
  return Object.freeze({
    list() { scope.assertAlive(); return entries.list(); },
    get(id) { scope.assertAlive(); return entries.get(id); },
    setVisible(id, visible) { scope.assertAlive(); return entries.setVisible(scope, id, visible); },
    remove(id) { scope.assertAlive(); return entries.remove(scope, id); },
    subscribe(listener, options) { scope.assertAlive(); return entries.subscribe(scope, listener, options); },
  });
}

export function createDomainFacade({ scope, entries, selection, registryFacade }) {
  const gpx = createGpxFacade({ scope, entries, selection });
  const photo = createPhotoFacade({ scope, entries, selection });
  const facadeFor = (key) => {
    assertDomainKey(key);
    if (key === gpxDomainKey) return gpx;
    if (key === photoDomainKey) return photo;
    return null;
  };
  return Object.freeze({
    provide: registryFacade.provide,
    has: registryFacade.has,
    subscribe: registryFacade.subscribe,
    require(key) {
      scope.assertAlive();
      const facade = facadeFor(key);
      if (!facade || !registryFacade.has(key)) {
        throw semanticError(semanticErrorCodes.providerUnavailable, `Provider for domain "${key.id}" is unavailable`, { domainId: key.id });
      }
      return facade;
    },
    optional(key) {
      scope.assertAlive();
      const facade = facadeFor(key);
      return facade && registryFacade.has(key) ? facade : null;
    },
    gpx,
    photo,
  });
}
