# Phase 4A — Ownership Kernel Implementation Plan

## Summary

Phase 4A introduces a new ownership kernel independent of product functionality. Existing plugins and UI will not be migrated; the implementation scope is limited to Scope, child Scope, disposal records, asynchronous tasks, staging, liveness, and failure diagnostics.

Baseline verification results:

- Unit: 37 files / 336 tests passed
- Smoke: 28 tests passed
- `git diff --check`: passed
- Working tree changes: none
- Contradictions between the architecture documents and current code that would block Phase 4A: none

## Implementation Design

### Module Structure

Planned additions:

- `src/ownership/scope.js`
  - Scope implementation, hierarchy, state transitions, close/commit, and liveness
- `src/ownership/records.js`
  - Internal records for disposers, tasks, staged records, and setup cleanup
- `src/ownership/errors.js`
  - Stable error codes and aggregate cleanup errors
- `src/ownership/index.js`
  - Restricted exports for later phases
- `tests/ownership-scope.test.js`
- `tests/ownership-task.test.js`
- `tests/ownership-staging.test.js`

The kernel will have no dependencies on DOM, Leaflet, PluginRuntime, registries, GPX, or Photo.

### Scope API

The internal factory separates a mutable controller from a frozen consumer handle.

```js
const controller = createScopeController({ label });
const scope = controller.scope;
```

Consumer handle:

```ts
interface Scope {
  readonly signal: AbortSignal;
  readonly alive: boolean;

  child(options?: { label?: string }): ChildScope;
  defer(disposer, options?: {
    label?: string;
    retry?: "never" | "safe";
  }): DisposableHandle;
  track(promise, options?: {
    label?: string;
    cancel?: () => void;
    await?: boolean;
  }): void;

  assertAlive(): void;
  guard<T extends Function>(callback: T): T;
}

interface ChildScope extends Scope {
  dispose(): Promise<CleanupReport>;
}
```

Internal controller:

```ts
interface ScopeController {
  readonly scope: Scope;

  setSetupCleanup(disposer): void;
  stage(record): StagedHandle;
  commit(): void;
  abort(): Promise<CleanupReport>;
  close(): Promise<CleanupReport>;
  retryCleanup(): Promise<CleanupReport>;
  snapshot(): ScopeDiagnostic;
}
```

Only the future runtime retains close/commit authority for a plugin root. An owner may terminate a child Scope early. No transfer/detach API will be provided.

### State Model

```text
open-uncommitted ──commit──> active
       │                         │
       └────abort────┐           └────close────┐
                     v                        v
                   closing ──success──────> closed
                      │
                      └──residual failure──> cleanup-failed
                                               │
                                  retryCleanup │
                                               v
                              closing -> closed / cleanup-failed
```

Rules:

- Only `open-uncommitted` and `active` are alive.
- When closing begins, synchronously revoke authority for the complete Scope tree and abort every signal.
- Concurrent `close()` calls share the same operation, and calls after closed are idempotent.
- Duplicate commit, registration against a closed Scope, and child creation during cleanup produce coded errors.
- cleanup-failed remains dead. Normal close calls reuse the failure result; only explicit `retryCleanup()` retries cleanup.
- When a parent commits, children created during setup recursively transition to active. A child created beneath an active parent is immediately active.

### Ownership Records and Cleanup Order

Internal records retain their kind, label, acquisition order, state, retry policy, and latest error. Mutable arrays are not exposed externally.

The close order is fixed as follows:

1. Mark the Scope tree closing and abort its signals
2. Invoke cancellation for pending tasks in reverse acquisition order
3. Wait for settlement of tasks with `await: true`
4. Dispose child Scopes in reverse creation order
5. Run setup-return cleanup
6. Dispose parent-local records in reverse acquisition order
7. Record closed or cleanup-failed

Every stage continues after failures. Successfully completed records never execute twice.

### Asynchronous Tasks

- Promises are not treated as cancellable.
- `cancel` is called once and only for pending tasks.
- Only `await: true` contributes to the close completion condition.
- A rejection handler is attached immediately even for `await: false`, preventing unhandled rejections.
- Rejection of the task itself means the task has settled and is not a cleanup failure.
- Exceptions from cancellation callbacks are aggregated as cleanup failures.
- Prevention of mutation by stale continuations does not rely on the signal alone; `assertAlive()` or guarded-facade revalidation is mandatory.

### Staged Protocol

The following internal contract, which contains no registry knowledge, will be adopted.

```ts
stage({
  label,
  preflight: () => void,
  commit: () => void,
  dispose: ({ committed: boolean }) => void | Promise<void>,
  retry?: "never" | "safe"
})
```

- A record is not externally published when staged.
- Controller commit synchronously commits records in acquisition order after preflight completes for every staged record.
- Commit callbacks are contractually synchronous, callback-free, and prevalidated.
- A preflight failure publishes no records.
- Setup rollback discards unpublished records with `committed: false`.
- Close after commit unregisters records with `committed: true`.
- Invalid repeated commit/discard operations produce coded errors.
- An unexpected commit exception rolls back published records in reverse order and then aborts the entire Scope.

### Early Disposal and Failure Retry

- Disposers and child close may execute early.
- Successfully completed records are ignored by parent close.
- Failed records remain with the parent as residuals.
- Only residuals explicitly marked `retry: "safe"` are retried.
- `retry: "never"` is not rerun and keeps the Scope cleanup-failed.
- An early child cleanup failure does not immediately make the parent dead, but its unresolved residuals propagate to the parent's diagnostics.

### Liveness

- `alive`: lightweight read access.
- `assertAlive()`: rejects stale API calls with `SCOPE_NOT_ACTIVE`.
- `guard(callback)`: ignores event callbacks after close without side effects.
- `assertAlive()` is rerun before an asynchronous commit.
- Signals are used for cooperative cancellation, while liveness separately enforces mutation authority.

### Errors and Diagnostics

Rather than creating a deep class hierarchy, errors are limited to the following two types.

- `OwnershipError`
  - `code`, `scopeId`, `scopePath`, `label`, `cause`
- `OwnershipCleanupError extends AggregateError`
  - `code`, `report`, `errors`

Primary codes:

- `SCOPE_NOT_ACTIVE`
- `SCOPE_COMMIT_INVALID`
- `OWNERSHIP_DISPOSER_INVALID`
- `OWNERSHIP_TASK_INVALID`
- `OWNERSHIP_STAGE_INVALID`
- `SCOPE_ROLLBACK_FAILED`
- `SCOPE_DISPOSAL_FAILED`

An immutable diagnostic snapshot includes Scope ID/path/state, signal state, record counts, and the kind, label, retry policy, and cause of residuals. Promises, mutable collections, and release methods are not exposed.

## Test Plan

Tests use deterministic deferred Promises and recording fake disposers/staged registrations. Fake timers are limited to cases that specifically require timer behavior.

Verification cases:

- open → active → closing → closed
- abort and cleanup-failed transitions
- commit-once constraint
- concurrent close sharing and idempotence after completion
- child creation, early close, parent propagation, and reverse disposal order
- signal abort before cleanup
- task cancellation in reverse order before child/local cleanup
- awaitable tasks are awaited and non-awaitable tasks are not
- rejected tasks do not produce unhandled rejections
- setup cleanup runs between children and local records
- strict LIFO order for local disposers
- all cleanup continues after one failure
- successfully completed records do not rerun
- only retry-safe residuals are retried
- terminal residuals remain in quarantine diagnostics
- stale API rejection and guarded callback suppression
- close while work is pending
- staged-record preflight, commit, discard, and post-commit disposal
- zero publication on preflight failure
- reverse rollback after unexpected commit failure
- child/resource creation is rejected beneath a closed parent
- children cannot detach or transfer

Run the following again at completion:

- `npm test`
- `npm run test:smoke`
- `git diff --check`
- Search to confirm that the ownership directory has no DOM/Leaflet/product dependencies

## Documentation Deliverable and Sequence

1. Organize the investigation results and finalized design above into the specified 30 sections of `plugin-architecture/phase-4/PHASE-4A-IMPLEMENTATION-PLAN.md`.
2. Classify current cleanup patterns as requirements for future consumers rather than reusable implementation.
3. Include diagrams and pseudocode APIs for Scope state, record state, cleanup ordering, and staged transactions.
4. State the planned files, test cases, and implementation order.
5. Establish existing consumer migration, PluginRuntime, PluginContext, registries, and application-destruction orchestration as non-goals.
6. After creating the document, report `git diff --check` and the change list.

During the implementation phase, use test-driven development in the following order: errors → records → basic Scope state → children → cleanup → tasks → staging → diagnostics.

## Assumptions and Completion Criteria

- Phase 4A does not modify existing product source code.
- Existing cleanup helpers remain untouched and are not reused as a generic kernel.
- Production composition does not yet use the new kernel.
- Setup cleanup uses a dedicated slot instead of ordinary `defer()`, guaranteeing the normative order.
- A cleanup-failed Scope provides a complete residual snapshot that the future PluginRuntime can use for quarantine decisions.
- There are currently no unresolved questions requiring human decision.
- Phase 4A implementation may begin when the contracts above, all new tests, the existing 336 unit tests, the 28 smoke tests, and `git diff --check` pass.
