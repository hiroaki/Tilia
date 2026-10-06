function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

export const semanticErrorCodes = Object.freeze({
  domainKeyInvalid: "DOMAIN_KEY_INVALID",
  providerInvalid: "DOMAIN_PROVIDER_INVALID",
  providerDuplicate: "DOMAIN_PROVIDER_DUPLICATE",
  providerUnavailable: "DOMAIN_PROVIDER_UNAVAILABLE",
  providerInUse: "DOMAIN_PROVIDER_IN_USE",
  providerResultInvalid: "DOMAIN_PROVIDER_RESULT_INVALID",
  entryInvalid: "ENTRY_INVALID",
  entryNotFound: "ENTRY_NOT_FOUND",
  entryDomainMismatch: "ENTRY_DOMAIN_MISMATCH",
  entryStaleRevision: "ENTRY_STALE_REVISION",
  entryRemoving: "ENTRY_REMOVING",
  inputInvalid: "SEMANTIC_INPUT_INVALID",
  cleanupFailed: "SEMANTIC_CLEANUP_FAILED",
  capabilityStale: "SEMANTIC_CAPABILITY_STALE",
  selectionCandidateInvalid: "SELECTION_CANDIDATE_INVALID",
  selectionReferenceInvalid: "SELECTION_REFERENCE_INVALID",
  selectionUnsupported: "SELECTION_UNSUPPORTED",
  selectionProviderInvariant: "SELECTION_PROVIDER_INVARIANT",
  selectionStoreDestroyed: "SELECTION_STORE_DESTROYED",
});

export class SemanticError extends Error {
  constructor(code, message, { cause, committed = false, ...details } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "SemanticError";
    this.code = code;
    this.committed = committed;
    this.details = deepFreeze({ ...details });
  }
}

export function semanticError(code, message, details = {}) {
  return new SemanticError(code, message, details);
}
