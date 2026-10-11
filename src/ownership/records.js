import { OwnershipError, ownershipErrorCodes } from "./errors.js";

const RETRY_POLICIES = new Set(["never", "safe"]);

function requireFunction(value, code, message, details) {
  if (typeof value !== "function") {
    throw new OwnershipError(message, { code, ...details });
  }
}

export function normalizeRecordOptions(
  options = {},
  details = {},
  code = ownershipErrorCodes.disposerInvalid,
) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new OwnershipError("Ownership record options must be an object", {
      code,
      ...details,
    });
  }
  const retry = options.retry ?? "never";
  if (!RETRY_POLICIES.has(retry)) {
    throw new OwnershipError('Ownership retry must be "never" or "safe"', {
      code,
      ...details,
    });
  }
  if (options.label !== undefined && typeof options.label !== "string") {
    throw new OwnershipError("Ownership record label must be a string", {
      code,
      ...details,
    });
  }
  return { label: options.label, retry };
}

export function createDisposableRecord(dispose, options, details, sequence) {
  requireFunction(
    dispose,
    ownershipErrorCodes.disposerInvalid,
    "Owned disposer must be a function",
    details,
  );
  const normalized = normalizeRecordOptions(options, details);
  return {
    kind: "disposable",
    sequence,
    label: normalized.label,
    retry: normalized.retry,
    state: "active",
    dispose,
    lastError: null,
  };
}

export function createTaskRecord(work, options = {}, details, sequence) {
  if (work === null || (typeof work !== "object" && typeof work !== "function")
    || typeof work.then !== "function") {
    throw new OwnershipError("Tracked work must be a Promise or thenable", {
      code: ownershipErrorCodes.taskInvalid,
      ...details,
    });
  }
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new OwnershipError("Task options must be an object", {
      code: ownershipErrorCodes.taskInvalid,
      ...details,
    });
  }
  if (options.cancel !== undefined) {
    requireFunction(
      options.cancel,
      ownershipErrorCodes.taskInvalid,
      "Task cancel must be a function",
      details,
    );
  }
  if (options.await !== undefined && typeof options.await !== "boolean") {
    throw new OwnershipError("Task await must be a boolean", {
      code: ownershipErrorCodes.taskInvalid,
      ...details,
    });
  }
  if (options.label !== undefined && typeof options.label !== "string") {
    throw new OwnershipError("Task label must be a string", {
      code: ownershipErrorCodes.taskInvalid,
      ...details,
    });
  }

  const record = {
    kind: "task",
    sequence,
    label: options.label,
    await: options.await === true,
    cancel: options.cancel ?? null,
    cancelState: "pending",
    settled: false,
    outcome: null,
    reflected: null,
    lastError: null,
  };

  // Attach both branches immediately. Tracking does not make a Promise cancellable,
  // but it must never introduce an unhandled rejection for fire-and-forget work.
  record.reflected = Promise.resolve(work).then(
    (value) => {
      record.settled = true;
      record.outcome = { status: "fulfilled", value };
      return record.outcome;
    },
    (reason) => {
      record.settled = true;
      record.outcome = { status: "rejected", reason };
      return record.outcome;
    },
  );
  return record;
}

export function createStagedRecord(definition, details, sequence) {
  if (definition === null || typeof definition !== "object" || Array.isArray(definition)) {
    throw new OwnershipError("Staged record definition must be an object", {
      code: ownershipErrorCodes.stageInvalid,
      ...details,
    });
  }
  requireFunction(
    definition.preflight,
    ownershipErrorCodes.stageInvalid,
    "Staged record preflight must be a function",
    details,
  );
  requireFunction(
    definition.commit,
    ownershipErrorCodes.stageInvalid,
    "Staged record commit must be a function",
    details,
  );
  requireFunction(
    definition.dispose,
    ownershipErrorCodes.stageInvalid,
    "Staged record dispose must be a function",
    details,
  );
  const normalized = normalizeRecordOptions(
    definition,
    details,
    ownershipErrorCodes.stageInvalid,
  );
  return {
    kind: "staged",
    sequence,
    label: normalized.label,
    retry: normalized.retry,
    state: "staged",
    committed: false,
    preflight: definition.preflight,
    commit: definition.commit,
    dispose: definition.dispose,
    lastError: null,
  };
}
