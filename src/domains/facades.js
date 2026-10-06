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

export function createGpxFacade({ scope, entries }) {
  return domainFacade(scope, entries, gpxDomainKey, {
    replaceData: (data) => Object.freeze({ type: "replace-data", data }),
    setCategoryVisibility: ({ category, visible }) => Object.freeze({ type: "set-category-visibility", category, visible }),
    setTrackVisibility: ({ trackIndex, visible }) => Object.freeze({ type: "set-track-visibility", trackIndex, visible }),
    setStylePreset: (stylePresetId) => Object.freeze({ type: "set-style-preset", stylePresetId }),
    recomputeDerived: () => Object.freeze({ type: "recompute-derived" }),
  });
}

export function createPhotoFacade({ scope, entries }) {
  return domainFacade(scope, entries, photoDomainKey, {
    replaceData: (data) => Object.freeze({ type: "replace-data", data }),
    setRequestedTimeMode: (requestedTimeMode) => Object.freeze({ type: "set-requested-time-mode", requestedTimeMode }),
    recomputeDerived: () => Object.freeze({ type: "recompute-derived" }),
  });
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

export function createDomainFacade({ scope, entries, registryFacade }) {
  const gpx = createGpxFacade({ scope, entries });
  const photo = createPhotoFacade({ scope, entries });
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
