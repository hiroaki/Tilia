// Keep the public API behind one module so internal file moves do not leak to users.
export { createDefaultTiliaApp } from "./app.js";
export { builtins } from "./builtins.js";
export { createBaseMap } from "./map/base.js";
export { defineServiceKey, ExtensionError, extensionErrorCodes } from "./extensions/index.js";
export { statusServiceKey } from "./plugins/contracts/status.js";
export {
  SemanticError,
  semanticErrorCodes,
  defineDomainKey,
  cloneAndFreezePlainData,
  gpxDomainKey,
  photoDomainKey,
} from "./domains/index.js";
export { RenderingError, renderingErrorCodes } from './rendering/index.js';

export { panelServiceKey } from "./plugins/contracts/panel.js";

export { gpxQueryServiceKey } from "./plugins/contracts/gpx-query.js";

export { applicationErrorCodes } from "./application-errors.js";
