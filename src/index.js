// Keep the public API behind one module so internal file moves do not leak to users.
export { createDefaultTiliaApp, createTiliaApp } from "./app.js";
export { builtins } from "./builtins.js";
export { createBaseMap } from "./map/base.js";
export { defineServiceKey, ExtensionError, extensionErrorCodes } from "./extensions/index.js";
export { statusServiceKey } from "./plugins/contracts/status.js";
export {
  SemanticError,
  semanticErrorCodes,
  defineDomainKey,
  cloneAndFreezePlainData,
  createDomainRegistry,
} from "./domains/index.js";
export { createEntryStore } from "./entries/index.js";
export { createSemanticFoundation } from "./semantic-foundation.js";
