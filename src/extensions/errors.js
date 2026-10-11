export const extensionErrorCodes = Object.freeze({
  serviceKeyInvalid: "SERVICE_KEY_INVALID",
  serviceDuplicate: "SERVICE_DUPLICATE",
  serviceNotFound: "SERVICE_NOT_FOUND",
  unavailable: "EXTENSION_UNAVAILABLE",
  inputInvalid: "INPUT_HANDLER_INVALID",
  inputDuplicate: "INPUT_HANDLER_DUPLICATE",
  inputUnsupported: "INPUT_UNSUPPORTED",
  inputConflict: "INPUT_HANDLER_CONFLICT",
  contributionInvalid: "CONTRIBUTION_INVALID",
  contributionDuplicate: "CONTRIBUTION_DUPLICATE",
  subscriptionInvalid: "SUBSCRIPTION_INVALID",
  resourceConflict: "RESOURCE_CONFLICT",
  resourceAcquisitionFailed: "RESOURCE_ACQUISITION_FAILED",
  uiSurfaceUnavailable: "UI_SURFACE_UNAVAILABLE",
  uiMountInvalid: "UI_MOUNT_INVALID",
  baseMapInvalid: "BASE_MAP_PROVIDER_INVALID",
  baseMapDuplicate: "BASE_MAP_PROVIDER_DUPLICATE",
  baseMapUnknown: "BASE_MAP_PROVIDER_UNKNOWN",
  baseMapSelectionFailed: "BASE_MAP_SELECTION_FAILED",
});

export class ExtensionError extends Error {
  constructor(code, message, { cause, committed = false, ...details } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ExtensionError";
    this.code = code;
    this.committed = committed;
    this.details = Object.freeze({ ...details });
  }
}

export function extensionError(code, message, details) {
  return new ExtensionError(code, message, details);
}

// Dispatch is a sequence of arbitrary handler effects, not one semantic commit.
export class InputDispatchError extends Error {
  constructor(code, details) {
    const cause = Object.hasOwn(details, "cleanupError") ? details.cleanupError
      : Object.hasOwn(details, "handlerError") ? details.handlerError
      : Object.hasOwn(details, "lifetimeError") ? details.lifetimeError : details.cancellationReason;
    super(code === "INPUT_DISPATCH_CANCELLED" ? "Import cancelled; committed entries remain" :
      code === "INPUT_DISPATCH_CLEANUP_FAILED" ? "Input cleanup failed" : "Input handler failed",
      cause === undefined ? undefined : { cause });
    this.name = "InputDispatchError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
