export const phase4dPluginClassification = Object.freeze({
  enabled: Object.freeze([
    "tilia-status", "tilia-base-maps-control", "tilia-gpx-domain", "tilia-photo-domain",
    "x-gsi-base-maps", "x-opentopomap-base-maps",
    "tilia-panel", "tilia-layers", "tilia-settings", "tilia-file-import",
    "tilia-photo-renderer", "tilia-jpeg-input", "tilia-photo-ui", "tilia-map-selection-presenter",
  ]),
  disabled: Object.freeze([
    "tilia-elevation", "tilia-url-import", "tilia-query-import",
    "tilia-dropzone",
    "x-gpx-export", "x-route-search", "x-track-editor", "x-milestone",
  ]),
});

const enabled = new Set(phase4dPluginClassification.enabled);
const disabled = new Set(phase4dPluginClassification.disabled);

export function getPhase4dPluginClassification(pluginId) {
  if (enabled.has(pluginId)) return "enabled";
  if (disabled.has(pluginId)) return "disabled";
  return null;
}

export function assertPluginEnabledForComposition(pluginId) {
  if (enabled.has(pluginId)) return;
  const error = new Error(disabled.has(pluginId)
    ? `Plugin "${pluginId}" is disabled during the Phase 4G migration`
    : `Plugin "${pluginId}" is not classified by the Phase 4G migration allowlist`);
  error.code = disabled.has(pluginId)
    ? "PLUGIN_DISABLED_BY_MIGRATION"
    : "PLUGIN_NOT_CLASSIFIED_BY_MIGRATION";
  throw error;
}
