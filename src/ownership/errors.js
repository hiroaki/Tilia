export const ownershipErrorCodes = Object.freeze({
  scopeNotActive: "SCOPE_NOT_ACTIVE",
  scopeCommitInvalid: "SCOPE_COMMIT_INVALID",
  disposerInvalid: "OWNERSHIP_DISPOSER_INVALID",
  taskInvalid: "OWNERSHIP_TASK_INVALID",
  stageInvalid: "OWNERSHIP_STAGE_INVALID",
  rollbackFailed: "SCOPE_ROLLBACK_FAILED",
  disposalFailed: "SCOPE_DISPOSAL_FAILED",
});

export class OwnershipError extends Error {
  constructor(message, { code, scopeId, scopePath, label, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "OwnershipError";
    this.code = code;
    this.scopeId = scopeId;
    this.scopePath = scopePath;
    if (label !== undefined) {
      this.label = label;
    }
  }
}

export class OwnershipCleanupError extends AggregateError {
  constructor(errors, message, { code, report } = {}) {
    super(errors, message);
    this.name = "OwnershipCleanupError";
    this.code = code;
    this.report = report;
    Object.freeze(this.errors);
  }
}
