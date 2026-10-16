import { assertPluginId, normalizeDirectDefinition, validateImplementation } from "./catalog.js";
import { pluginError, pluginErrorCodes } from "./errors.js";

// Distribution contract: src/ and plugins/ are siblings, independent of the page.
export function buildPluginLoaderUrl(id) {
  assertPluginId(id);
  return new URL(`${id}/loader.js`, new URL("../../../plugins/", import.meta.url));
}

export function normalizeDiscoveredDefinition(module, id) {
  validateImplementation(module?.default, { id });
  return normalizeDirectDefinition(module.default);
}

export async function loadDirectoryDefinition(id) {
  const url = buildPluginLoaderUrl(id);
  let module;
  try {
    module = await import(url.href);
  } catch (cause) {
    throw pluginError(pluginErrorCodes.resolutionFailed, `Failed to discover plugin "${id}"`, {
      pluginId: id, url: url.href, cause,
    });
  }
  return normalizeDiscoveredDefinition(module, id);
}
