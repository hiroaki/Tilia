import { createDomainFacade, createEntryFacade, createGpxFacade, createPhotoFacade } from "./domains/index.js";

export function createSemanticCapabilityFactories(foundation) {
  return Object.freeze({
    domains(input) {
      return createDomainFacade({
        scope: input.scope,
        entries: foundation.entries,
        registryFacade: foundation.domains.createFacade(input),
      });
    },
    entries(input) {
      return createEntryFacade({ scope: input.scope, entries: foundation.entries });
    },
  });
}

export function createApplicationSemanticApi(foundation) {
  return Object.freeze({
    entries: createEntryFacade({ scope: foundation.scope, entries: foundation.entries }),
    domains: Object.freeze({
      gpx: createGpxFacade({ scope: foundation.scope, entries: foundation.entries }),
      photo: createPhotoFacade({ scope: foundation.scope, entries: foundation.entries }),
    }),
  });
}
