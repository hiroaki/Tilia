export { SemanticError, semanticError, semanticErrorCodes } from "./errors.js";
export { defineDomainKey, assertDomainKey } from "./identity.js";
export { cloneAndFreezePlainData, assertDeepImmutablePlainData } from "./immutable.js";
export { createDomainRegistry } from "./registry.js";
export { gpxDomainKey, photoDomainKey } from "./keys.js";
export { createDomainFacade, createEntryFacade, createGpxFacade, createPhotoFacade } from "./facades.js";
