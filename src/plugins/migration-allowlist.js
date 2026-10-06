export const phase4cPluginClassification = Object.freeze({
  enabled: Object.freeze([
    "tilia-status", "tilia-base-maps-control", "x-gsi-base-maps", "x-opentopomap-base-maps",
  ]),
  disabled: Object.freeze([
    "tilia-panel", "tilia-layers",
    "tilia-elevation", "tilia-file-import", "tilia-url-import", "tilia-query-import",
    "tilia-settings", "tilia-dropzone",
    "x-gpx-export", "x-route-search", "x-track-editor", "x-milestone",
  ]),
});

const enabled = new Set(phase4cPluginClassification.enabled);
const disabled = new Set(phase4cPluginClassification.disabled);

export function getPhase4cPluginClassification(pluginId) {
  if (enabled.has(pluginId)) return "enabled";
  if (disabled.has(pluginId)) return "disabled";
  return null;
}

export function assertPluginEnabledForComposition(pluginId) {
  if (enabled.has(pluginId)) return;
  const error = new Error(disabled.has(pluginId)
    ? `Plugin "${pluginId}" is disabled during the Phase 4C migration`
    : `Plugin "${pluginId}" is not classified by the Phase 4C migration allowlist`);
  error.code = disabled.has(pluginId)
    ? "PLUGIN_DISABLED_BY_MIGRATION"
    : "PLUGIN_NOT_CLASSIFIED_BY_MIGRATION";
  throw error;
}
