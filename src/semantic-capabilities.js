import { createDomainFacade, createEntryFacade, createGpxFacade, createPhotoFacade } from "./domains/index.js";

export function createSemanticCapabilityFactories(foundation) {
  return Object.freeze({
    domains(input) {
      return createDomainFacade({
        scope: input.scope,
        entries: foundation.entries,
        selection: foundation.selection,
        registryFacade: foundation.domains.createFacade(input),
      });
    },
    entries(input) {
      return createEntryFacade({ scope: input.scope, entries: foundation.entries });
    },
    selection(input) {
      return foundation.selection.createFacade(input.scope);
    },
  });
}

export function createApplicationSemanticApi(foundation) {
  return Object.freeze({
    entries: createEntryFacade({ scope: foundation.scope, entries: foundation.entries }),
    selection: foundation.selection.createFacade(foundation.scope),
    domains: Object.freeze({
      gpx: createGpxFacade({ scope: foundation.scope, entries: foundation.entries, selection: foundation.selection }),
      photo: createPhotoFacade({ scope: foundation.scope, entries: foundation.entries, selection: foundation.selection }),
    }),
  });
}
