import {
  OwnershipCleanupError,
  OwnershipError,
  ownershipErrorCodes,
} from "./errors.js";
import {
  createDisposableRecord,
  createStagedRecord,
  createTaskRecord,
} from "./records.js";

let nextRootId = 1;

function freeze(value) {
  if (Array.isArray(value)) {
    value.forEach(freeze);
  } else if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
  }
  return Object.freeze(value);
}

function causeSnapshot(error) {
  return freeze({
    name: typeof error?.name === "string" ? error.name : "Error",
    message: typeof error?.message === "string" ? error.message : String(error),
  });
}

function scopeDetails(node, label) {
  return {
    scopeId: node.id,
    scopePath: node.path,
    ...(label === undefined ? {} : { label }),
  };
}

function notAlive(node) {
  return new OwnershipError(`Scope "${node.path}" is not active`, {
    code: ownershipErrorCodes.scopeNotActive,
    ...scopeDetails(node),
  });
}

function assertAliveNode(node) {
  if (node.state !== "open-uncommitted" && node.state !== "active") {
    throw notAlive(node);
  }
}

function commitMutationFailure(node, action) {
  const operation = node.root.commitOperation;
  if (!operation) {
    return null;
  }
  const failure = new OwnershipError(
    `Scope "${node.path}" cannot ${action} while its ownership tree is committing`,
    {
      code: ownershipErrorCodes.scopeCommitInvalid,
      ...scopeDetails(node),
    },
  );
  operation.violation ??= failure;
  return failure;
}

function assertOwnershipMutationAllowed(node, action) {
  assertAliveNode(node);
  const failure = commitMutationFailure(node, action);
  if (failure) {
    throw failure;
  }
}

function assertRecordTransitionAllowed(node, action) {
  const failure = commitMutationFailure(node, action);
  if (failure) {
    throw failure;
  }
}

function nextSequence(node) {
  node.root.sequence += 1;
  return node.root.sequence;
}

function makeFailure(node, record, error, phase) {
  return {
    scopeId: node.id,
    scopePath: node.path,
    kind: record.kind,
    label: record.label,
    sequence: record.sequence,
    retry: record.retry ?? "never",
    phase,
    cause: error,
  };
}

function reportFor(node, failures = collectResiduals(node)) {
  const publicFailures = failures.map((failure) => freeze({
    scopeId: failure.scopeId,
    scopePath: failure.scopePath,
    kind: failure.kind,
    label: failure.label,
    sequence: failure.sequence,
    retry: failure.retry,
    phase: failure.phase,
    cause: causeSnapshot(failure.cause),
  }));
  return freeze({
    scopeId: node.id,
    scopePath: node.path,
    state: node.state,
    failures: publicFailures,
  });
}

function collectResiduals(node) {
  const failures = [];
  for (const child of node.children) {
    failures.push(...collectResiduals(child));
  }
  if (node.setupCleanup?.state === "failed") {
    failures.push(node.setupCleanup.failure);
  }
  for (const record of node.locals) {
    if (record.state === "failed") {
      failures.push(record.failure);
    }
  }
  for (const task of node.tasks) {
    if (task.cancelState === "failed") {
      failures.push(task.failure);
    }
  }
  return failures.sort((a, b) => b.sequence - a.sequence);
}

function cleanupError(node, failures, kind) {
  const code = kind === "rollback"
    ? ownershipErrorCodes.rollbackFailed
    : ownershipErrorCodes.disposalFailed;
  const report = reportFor(node, failures);
  return new OwnershipCleanupError(
    failures.map((failure) => failure.cause),
    `Scope "${node.path}" cleanup failed`,
    { code, report },
  );
}

function markTreeClosing(node) {
  if (node.state === "closing" || node.state === "closed" || node.state === "cleanup-failed") {
    return;
  }
  node.state = "closing";
  for (const child of node.children) {
    markTreeClosing(child);
  }
}

function abortTree(node) {
  if (!node.abortController.signal.aborted) {
    node.abortController.abort();
  }
  for (const child of node.children) {
    abortTree(child);
  }
}

function disposeRecord(node, record, phase) {
  if (record.state === "disposed" || record.state === "disposing") {
    return record.state === "disposing" ? record.disposePromise : Promise.resolve(null);
  }
  if (record.state === "failed" && record.retry !== "safe") {
    return Promise.resolve(record.failure);
  }
  record.state = "disposing";
  record.disposePromise = (async () => {
    try {
      if (record.kind === "staged") {
        await record.dispose({ committed: record.committed });
      } else {
        await record.dispose();
      }
      record.state = "disposed";
      record.lastError = null;
      record.failure = null;
      return null;
    } catch (error) {
      record.state = "failed";
      record.lastError = error;
      record.failure = makeFailure(node, record, error, phase);
      return record.failure;
    }
  })();
  return record.disposePromise;
}

async function cancelTasks(node, retryOnly) {
  const failures = [];
  for (const task of [...node.tasks].sort((a, b) => b.sequence - a.sequence)) {
    if (!task.cancel || task.settled || task.cancelState === "done") {
      continue;
    }
    if (task.cancelState === "failed" && retryOnly) {
      continue;
    }
    task.cancelState = "running";
    try {
      const result = task.cancel();
      if (result && typeof result.then === "function") {
        // Cancellation is deliberately synchronous. Observe a violating
        // thenable only to prevent an unhandled rejection; never await it.
        Promise.resolve(result).catch(() => {});
        throw new TypeError("Task cancel must be synchronous");
      }
      task.cancelState = "done";
      task.failure = null;
    } catch (error) {
      task.cancelState = "failed";
      task.lastError = error;
      task.failure = makeFailure(node, { ...task, retry: "never" }, error, "task-cancel");
      failures.push(task.failure);
    }
  }
  return failures;
}

async function cleanupNode(node, kind, retryOnly = false) {
  const failures = [];
  failures.push(...await cancelTasks(node, retryOnly));

  const awaitable = node.tasks.filter((task) => task.await && !task.settled);
  await Promise.all(awaitable.map((task) => task.reflected));

  for (const child of [...node.children].sort((a, b) => b.sequence - a.sequence)) {
    if (child.state === "closed") {
      continue;
    }
    try {
      if (child.state === "cleanup-failed") {
        await retryNode(child, kind);
      } else {
        await closeNode(child, kind);
      }
    } catch {
      failures.push(...collectResiduals(child));
    }
  }

  if (node.setupCleanup) {
    const failure = await disposeRecord(node, node.setupCleanup, "setup-cleanup");
    if (failure) {
      failures.push(failure);
    }
  }

  for (const record of [...node.locals].sort((a, b) => b.sequence - a.sequence)) {
    if (retryOnly && record.state !== "failed") {
      continue;
    }
    const failure = await disposeRecord(node, record, record.kind === "staged" ? "staged-dispose" : "dispose");
    if (failure) {
      failures.push(failure);
    }
  }

  return collectResiduals(node).length > 0 ? collectResiduals(node) : failures;
}

function finalizeClose(node, failures, kind) {
  if (failures.length === 0) {
    node.state = "closed";
    node.closeReport = reportFor(node, []);
    node.closeError = null;
    return node.closeReport;
  }
  node.state = "cleanup-failed";
  node.closeError = cleanupError(node, failures, kind);
  throw node.closeError;
}

function closeNode(node, kind = "dispose") {
  if (node.state === "closed") {
    return Promise.resolve(node.closeReport);
  }
  if (node.state === "cleanup-failed") {
    return Promise.reject(node.closeError);
  }
  if (node.closePromise) {
    return node.closePromise;
  }

  // Authority is revoked for the complete tree before the first asynchronous
  // cleanup step. Callers never need to await close to observe dead scopes.
  markTreeClosing(node);
  abortTree(node);
  node.closeKind = kind;
  node.closePromise = cleanupNode(node, kind).then(
    (failures) => finalizeClose(node, failures, kind),
  );
  return node.closePromise;
}

function retryNode(node, kind = node.closeKind ?? "dispose") {
  if (node.state === "closed") {
    return Promise.resolve(node.closeReport);
  }
  if (node.state !== "cleanup-failed") {
    return Promise.reject(new OwnershipError(`Scope "${node.path}" has no failed cleanup to retry`, {
      code: ownershipErrorCodes.scopeCommitInvalid,
      ...scopeDetails(node),
    }));
  }
  node.state = "closing";
  node.closePromise = cleanupNode(node, kind, true).then(
    (failures) => finalizeClose(node, failures, kind),
  );
  return node.closePromise;
}

function collectStaged(node, result = []) {
  for (const record of node.locals) {
    if (record.kind === "staged" && record.state === "staged") {
      result.push({ node, record });
    }
  }
  for (const child of node.children) {
    collectStaged(child, result);
  }
  return result.sort((a, b) => a.record.sequence - b.record.sequence);
}

function activateTree(node) {
  if (node.state === "open-uncommitted") {
    node.state = "active";
  }
  for (const child of node.children) {
    activateTree(child);
  }
}

function commitNode(node) {
  if (node.root.commitOperation) {
    const failure = new OwnershipError(`Scope "${node.path}" commit is already in progress`, {
      code: ownershipErrorCodes.scopeCommitInvalid,
      ...scopeDetails(node),
    });
    node.root.commitOperation.violation ??= failure;
    throw failure;
  }
  if (node.state !== "open-uncommitted") {
    return Promise.reject(new OwnershipError(`Scope "${node.path}" cannot be committed from ${node.state}`, {
      code: ownershipErrorCodes.scopeCommitInvalid,
      ...scopeDetails(node),
    }));
  }

  const operation = { violation: null };
  node.root.commitOperation = operation;
  const staged = collectStaged(node);
  const assertCommitAuthority = () => {
    if (operation.violation) {
      throw operation.violation;
    }
    if (node.root.commitOperation !== operation || node.state !== "open-uncommitted") {
      throw new OwnershipError(`Scope "${node.path}" lost commit authority`, {
        code: ownershipErrorCodes.scopeCommitInvalid,
        ...scopeDetails(node),
      });
    }
  };
  const rollbackFailure = (failure, message) => {
    if (node.root.commitOperation === operation) {
      node.root.commitOperation = null;
    }
    return closeNode(node, "rollback").then(
      () => Promise.reject(failure),
      (cleanupFailure) => Promise.reject(new OwnershipCleanupError(
        [failure, ...cleanupFailure.errors],
        message,
        { code: ownershipErrorCodes.rollbackFailed, report: cleanupFailure.report },
      )),
    );
  };

  try {
    for (const entry of staged) {
      const result = entry.record.preflight();
      if (result && typeof result.then === "function") {
        Promise.resolve(result).catch(() => {});
        throw new TypeError("Staged preflight must be synchronous");
      }
      assertCommitAuthority();
    }
  } catch (cause) {
    const failure = cause instanceof OwnershipError
      ? cause
      : new OwnershipError(`Scope "${node.path}" staged preflight failed`, {
        code: ownershipErrorCodes.stageInvalid,
        ...scopeDetails(node),
        cause,
      });
    return rollbackFailure(failure, `Scope "${node.path}" preflight and rollback failed`);
  }

  try {
    // A staged commit is synchronous, callback-free, and expected not to fail.
    // This catch is defensive containment for a broken registry implementation.
    for (const entry of staged) {
      // Mark first so defensive rollback attempts withdrawal even when a broken
      // commit callback publishes and then throws before returning.
      entry.record.committed = true;
      const result = entry.record.commit();
      if (result && typeof result.then === "function") {
        Promise.resolve(result).catch(() => {});
        throw new TypeError("Staged commit must be synchronous");
      }
      assertCommitAuthority();
      entry.record.state = "active";
    }
    assertCommitAuthority();
    activateTree(node);
    node.root.commitOperation = null;
    return Promise.resolve();
  } catch (cause) {
    const failure = cause instanceof OwnershipError
      ? cause
      : new OwnershipError(`Scope "${node.path}" staged commit failed`, {
        code: ownershipErrorCodes.stageInvalid,
        ...scopeDetails(node),
        cause,
      });
    return rollbackFailure(failure, `Scope "${node.path}" commit and rollback failed`);
  }
}

function recordHandle(node, record) {
  return Object.freeze({
    get state() {
      return record.state;
    },
    dispose() {
      assertRecordTransitionAllowed(node, "dispose an ownership record");
      if (record.state === "disposed") {
        return Promise.resolve();
      }
      if (record.handleDisposePromise) {
        return record.handleDisposePromise;
      }
      const operation = disposeRecord(node, record, "early-dispose").then((failure) => {
        if (failure) {
          throw cleanupError(node, [failure], "dispose");
        }
      });
      record.handleDisposePromise = operation;
      operation.finally(() => {
        if (record.handleDisposePromise === operation) {
          record.handleDisposePromise = null;
        }
      }).catch(() => {});
      return operation;
    },
  });
}

function createNode({ label = "scope", parent = null, root = null, sequence = 0 } = {}) {
  const actualRoot = root ?? { id: nextRootId++, sequence: 0, commitOperation: null };
  const id = parent ? `${actualRoot.id}.${sequence}` : String(actualRoot.id);
  const path = parent ? `${parent.path}/${label}` : label;
  const node = {
    id,
    label,
    path,
    parent,
    root: actualRoot,
    sequence,
    state: parent?.state === "active" ? "active" : "open-uncommitted",
    abortController: new AbortController(),
    children: [],
    locals: [],
    tasks: [],
    setupCleanup: null,
    closePromise: null,
    closeReport: null,
    closeError: null,
    closeKind: null,
    scope: null,
  };

  const scope = {
    get signal() {
      return node.abortController.signal;
    },
    get alive() {
      return node.state === "open-uncommitted" || node.state === "active";
    },
    child(options = {}) {
      assertOwnershipMutationAllowed(node, "create a child scope");
      if (options === null || typeof options !== "object" || Array.isArray(options)) {
        throw new OwnershipError("Child scope options must be an object", {
          code: ownershipErrorCodes.scopeNotActive,
          ...scopeDetails(node),
        });
      }
      if (options.label !== undefined && typeof options.label !== "string") {
        throw new OwnershipError("Child scope label must be a string", {
          code: ownershipErrorCodes.scopeCommitInvalid,
          ...scopeDetails(node),
        });
      }
      const childSequence = nextSequence(node);
      const child = createNode({
        label: options.label ?? `child-${childSequence}`,
        parent: node,
        root: actualRoot,
        sequence: childSequence,
      });
      node.children.push(child);
      return child.scope;
    },
    defer(disposer, options = {}) {
      assertOwnershipMutationAllowed(node, "register a disposer");
      const record = createDisposableRecord(
        disposer,
        options,
        scopeDetails(node, options?.label),
        nextSequence(node),
      );
      node.locals.push(record);
      return recordHandle(node, record);
    },
    track(work, options = {}) {
      assertOwnershipMutationAllowed(node, "track asynchronous work");
      const task = createTaskRecord(
        work,
        options,
        scopeDetails(node, options?.label),
        nextSequence(node),
      );
      node.tasks.push(task);
    },
    assertAlive() {
      assertAliveNode(node);
    },
    guard(callback) {
      if (typeof callback !== "function") {
        throw new OwnershipError("Guarded callback must be a function", {
          code: ownershipErrorCodes.disposerInvalid,
          ...scopeDetails(node),
        });
      }
      return function guardedCallback(...args) {
        if (node.state !== "open-uncommitted" && node.state !== "active") {
          return undefined;
        }
        return callback.apply(this, args);
      };
    },
  };

  if (parent) {
    scope.dispose = () => {
      assertRecordTransitionAllowed(node, "dispose a child scope");
      return closeNode(node, "dispose");
    };
  }
  node.scope = Object.freeze(scope);
  return node;
}

function snapshotNode(node) {
  return freeze({
    id: node.id,
    label: node.label,
    path: node.path,
    state: node.state,
    alive: node.state === "open-uncommitted" || node.state === "active",
    signalAborted: node.abortController.signal.aborted,
    counts: {
      children: node.children.length,
      locals: node.locals.length,
      tasks: node.tasks.length,
      staged: node.locals.filter((record) => record.state === "staged").length,
      disposing: node.locals.filter((record) => record.state === "disposing").length
        + (node.setupCleanup?.state === "disposing" ? 1 : 0),
    },
    residuals: collectResiduals(node).map((failure) => ({
      scopeId: failure.scopeId,
      scopePath: failure.scopePath,
      kind: failure.kind,
      label: failure.label,
      sequence: failure.sequence,
      retry: failure.retry,
      phase: failure.phase,
      cause: causeSnapshot(failure.cause),
    })),
  });
}

export function createScopeController(options = {}) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new OwnershipError("Scope options must be an object", {
      code: ownershipErrorCodes.scopeCommitInvalid,
    });
  }
  if (options.label !== undefined && typeof options.label !== "string") {
    throw new OwnershipError("Scope label must be a string", {
      code: ownershipErrorCodes.scopeCommitInvalid,
    });
  }
  const node = createNode({ label: options.label ?? "scope" });
  return Object.freeze({
    scope: node.scope,
    setSetupCleanup(disposer, cleanupOptions = {}) {
      assertOwnershipMutationAllowed(node, "register setup cleanup");
      if (node.setupCleanup) {
        throw new OwnershipError("Setup cleanup is already registered", {
          code: ownershipErrorCodes.disposerInvalid,
          ...scopeDetails(node),
        });
      }
      node.setupCleanup = createDisposableRecord(
        disposer,
        cleanupOptions,
        scopeDetails(node, cleanupOptions?.label),
        nextSequence(node),
      );
    },
    stage(definition) {
      assertOwnershipMutationAllowed(node, "stage an ownership record");
      const record = createStagedRecord(
        definition,
        scopeDetails(node, definition?.label),
        nextSequence(node),
      );
      node.locals.push(record);
      return recordHandle(node, record);
    },
    commit() {
      return commitNode(node);
    },
    abort() {
      if (node.state === "active") {
        return Promise.reject(new OwnershipError("An active scope cannot be aborted", {
          code: ownershipErrorCodes.scopeCommitInvalid,
          ...scopeDetails(node),
        }));
      }
      return closeNode(node, "rollback");
    },
    close() {
      return closeNode(node, "dispose");
    },
    retryCleanup() {
      return retryNode(node);
    },
    snapshot() {
      return snapshotNode(node);
    },
  });
}
