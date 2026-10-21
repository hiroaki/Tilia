export const pluginErrorCodes = Object.freeze({
  idInvalid: "PLUGIN_ID_INVALID",
  descriptorInvalid: "PLUGIN_DESCRIPTOR_INVALID",
  descriptorConflict: "PLUGIN_DESCRIPTOR_CONFLICT",
  unknown: "PLUGIN_UNKNOWN",
  resolutionFailed: "PLUGIN_RESOLUTION_FAILED",
  implementationInvalid: "PLUGIN_IMPLEMENTATION_INVALID",
  dependencyMissing: "PLUGIN_DEPENDENCY_MISSING",
  dependencyCycle: "PLUGIN_DEPENDENCY_CYCLE",
  dependencyFailed: "PLUGIN_DEPENDENCY_FAILED",
  setupFailed: "PLUGIN_SETUP_FAILED",
  commitFailed: "PLUGIN_COMMIT_FAILED",
  hasDependents: "PLUGIN_HAS_DEPENDENTS",
  reentrant: "PLUGIN_LIFECYCLE_REENTRANT",
  quarantined: "PLUGIN_QUARANTINED",
  teardownFailed: "PLUGIN_TEARDOWN_FAILED",
  destroying: "PLUGIN_RUNTIME_DESTROYING",
  destroyed: "PLUGIN_RUNTIME_DESTROYED",
  destroyFailed: "PLUGIN_RUNTIME_DESTROY_FAILED",
});

export class PluginError extends Error {
  constructor(message, { code, cause, ...details } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "PluginError";
    this.code = code;
    this.details = deepFreeze({ ...details });
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

export function pluginError(code, message, details = {}) {
  return new PluginError(message, { code, ...details });
}
