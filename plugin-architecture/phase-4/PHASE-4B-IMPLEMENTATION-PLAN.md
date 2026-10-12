> Current contract amendment: Phase 4B intentionally removed convention discovery. That historical deletion policy below is superseded by the current [architecture contract](../ARCHITECTURE.md) and [plugin guide](../../docs/PLUGIN-OPERATIONS.md). Unknown third-party IDs now use fixed sibling `plugins/<id>/loader.js` discovery before dependency planning. The official catalog contains only `tilia-*`; direct definitions and explicit application catalogs remain supported. No configurable directories or old loader options are restored.

# Phase 4B — Plugin Runtime and Guarded Context Implementation Plan

> Subsequent amendment (approved 2026-10-08): The narrow lifecycle.afterCommit capability supplements PluginContext after successful own activation, without exposing internal queues or adding uninstall work-settlement guarantees. See [4I approved amendments](PHASE-4I-CONTRACT-AMENDMENTS.md). Original completed-phase text below remains the historical acceptance record.

## 1. Executive Summary

Phase 4B replaces the legacy plugin lifecycle with a graph-aware `PluginRuntime` and makes a guarded `PluginContext` the only setup contract for enabled plugins. Installation becomes lazy, dependency-planned, transactional, concurrency-safe, and Scope-owned. Uninstall protects active dependencies, incomplete cleanup enters quarantine, and runtime destruction is terminal.

The production migration allowlist is intentionally empty at the end of this phase. Every existing repository plugin depends on broad `app` authority or capabilities scheduled for Phase 4C or later. The application shell and legacy core may continue to exist, but no enabled plugin receives them.

## 2. Authoritative Requirements

The implementation follows this precedence:

```text
ARCHITECTURE.md
  -> MIGRATION-PLAN.md
  -> completed Phase 4A ownership contract
  -> Phase 2/3 design records
  -> current legacy implementation
```

The cutover must preserve one lifecycle authority, dependency-first deterministic setup, transactional publication, Scope-bound liveness, cleanup-only setup results, truthful quarantine, and lazy implementation loading. It must not introduce Phase 4C registries or compatibility bridges.

## 3. Phase 4A Ownership API Actually Available

`createScopeController({label})` returns a frozen controller containing:

- `scope`: frozen consumer handle with `signal`, `alive`, `child()`, `defer()`, `track()`, `assertAlive()`, and `guard()`;
- `setSetupCleanup()`: one dedicated cleanup slot;
- `stage()`: synchronous preflight/commit plus async disposal records;
- `commit()`: commits the complete live tree after preflighting all staged records;
- `abort()`: rolls back an uncommitted tree;
- `close()`: revokes authority synchronously and performs best-effort cleanup;
- `retryCleanup()`: retries only `retry: "safe"` residuals;
- `snapshot()`: deeply frozen state and residual diagnostics.

The root begins `open-uncommitted`, becomes `active` only after `commit()`, and becomes dead synchronously when close starts. Cleanup order is task cancellation, awaited tasks, children in reverse creation order, setup cleanup, then local records in LIFO order. A cleanup-failed Scope remains dead. Phase 4B requires no ownership-kernel expansion.

## 4. Current Plugin Runtime Inventory

The legacy authority is concentrated in `src/app.js` and the eager descriptors in `src/builtins.js`:

- built-ins are implementation objects imported eagerly;
- external string IDs use convention-based `plugins/<id>/loader.js`, `pluginUrls`, or `pluginLoader`;
- dependencies are validation-only and must already be installed;
- setup receives broad mutable `app`;
- descriptor stylesheets are installed before setup and never transactionally owned;
- arbitrary setup results are published through mutable `app.services`;
- cleanup is inferred from a function or `{destroy()}`;
- public mutable `app.plugins` and private `pendingPlugins` maps are lifecycle state;
- uninstall neither protects dependencies nor quarantines cleanup failure;
- no runtime destruction operation exists.

Startup `plugins` configuration is sequential sugar over `app.use()`. All built-ins and repository external plugins consume at least one legacy capability: `app.map`, `app.core`, `app.state`, services, input registry/context, UI surfaces, base-map mutation, interaction subscription, refresh handlers, or descriptor stylesheets.

## 5. Current-to-Target Mapping

| Concern | Current behavior | Target behavior | Phase 4B action |
|---|---|---|---|
| Identity | descriptor ID; permissive module guessing | validated stable ID | normalize and validate metadata/implementation |
| Dependencies | installed-state validation only | complete graph plan | pure deterministic planner |
| Built-ins | eager implementation imports | literal lazy loaders | replace built-in registry |
| External loading | convention/path discovery | direct object or explicit catalog | remove discovery policy |
| Setup context | broad mutable `app` | frozen guarded `PluginContext` | replace completely |
| Setup return | API/service and cleanup inference | cleanup only | accept function or `{dispose()}` |
| Publication | plugin/services visible after arbitrary setup | active only after Scope commit | transactional installation |
| Stylesheets | descriptor metadata | owned style capability in 4C | reject/remove; dependent plugins disabled |
| Uninstall | manual cleanup, no dependent protection | Scope close and dependency guard | replace |
| Failure | ambiguous partial state | inactive or quarantined | explicit states and diagnostics |

## 6. Plugin Definition Contract

Direct external definitions use:

```js
{
  id: "acme-example",
  requires: ["tilia-foundation"],
  async setup(context, options) {
    return () => {};
  },
}
```

`id` and `requires` are metadata. `setup` is implementation. IDs are lower-kebab strings; only catalogued built-ins may use `tilia-*`. `requires` defaults to a frozen empty array, contains unique hard plugin IDs, and cannot contain the plugin itself. Optional dependency fields are invalid. Descriptor stylesheets, services, contributions, versions, and teardown methods are not supported.

## 7. Plugin Catalog and Lazy Resolution

Lazy catalog entries use:

```js
{
  id: "tilia-example",
  requires: ["tilia-foundation"],
  load: () => import("./example/plugin.js"),
}
```

The built-in catalog is immutable and contains only metadata plus literal loader functions. A direct definition is normalized internally into equivalent metadata and a resolver for its already-supplied implementation.

Resolution rules:

- metadata is available before implementation loading;
- the canonical production module shape is a default `{id, setup}` export;
- the resolved ID must equal the catalog ID;
- successful resolution is cached for the runtime lifetime, including after uninstall;
- a failed resolution is removed from the pending cache and is retryable;
- concurrent resolution of one ID shares one promise;
- implementation completion order never determines dependency order.

## 8. Dependency Semantics

Every `requires` edge is hard. Required dependencies must be active before consumer setup and remain active while the consumer is active. Missing dependencies reject before setup. Optional dependencies do not exist in the descriptor model; optional integration belongs to later typed availability APIs.

Active dependencies are reused. Successfully installed dependencies remain installed after consumer failure or uninstall. Provider uninstall rejects while direct active dependents exist. There is no cascade, force removal, reference counting, or orphan cleanup.

## 9. Dependency Planner

The planner is a pure, independently tested function over normalized metadata and an active-ID snapshot. It uses depth-first traversal with `unvisited`, `visiting`, and `visited` states and returns a stable dependency-first postorder plus dependency edges.

Sibling traversal follows the declared `requires` order. For `A -> [B,D]`, `B -> C`, and `D -> C`, the plan is `C,B,D,A`. Cycles include an actionable repeated-endpoint path. Unknown metadata, duplicate/conflicting definitions, and cycles reject before any setup begins.

## 10. Runtime State Machine

| State | Scope | Meaning |
|---|---|---|
| known/inactive | none | catalogued and eligible for install |
| resolving | none | implementation resolution shared by callers |
| installing | open-uncommitted | setup transaction in progress |
| active | active | committed and discoverable |
| uninstalling | closing | unavailable; teardown in progress |
| quarantined | cleanup-failed/dead | unavailable, reserved, residual cleanup |

Setup/resolution failures with complete rollback do not create a durable failed state; the ID returns to inactive and may be retried. Quarantine is durable until all eligible residual cleanup succeeds. Runtime state is `active`, `destroying`, or terminal `destroyed`.

## 11. `use()` Semantics

`app.use(idOrDefinition, options)` resolves to a frozen `{id}` handle. Already-active calls return the same handle. The first accepted options win; later calls do not reconfigure the instance.

The runtime resolves and validates the complete graph, then installs the stable postorder. Same-ID callers share one operation. Overlapping graphs reuse the same dependency operation. Dependency failure prevents consumer setup. A quarantined ID rejects. A call during uninstall waits for teardown and installs a fresh instance only after complete cleanup.

## 12. Transactional Setup

```text
resolve implementation and validate ID/setup
  -> ensure dependencies active
  -> create plugin root Scope controller
  -> construct guarded PluginContext
  -> await setup
  -> validate/register setup cleanup
  -> preflight and commit staged records
  -> publish active runtime record and edges
```

The active record is published only after `controller.commit()` succeeds. On setup, return validation, preflight, or commit failure, rollback completes before callers receive failure. Complete rollback returns to inactive; residual cleanup enters quarantine. Successfully installed dependencies are not rolled back with the consumer.

## 13. Setup Return Contract

Accepted results are `undefined`, a cleanup function, `{dispose()}`, or a Promise of one of those forms. Cleanup is registered through `setSetupCleanup()` so Phase 4A guarantees its position in teardown order. `{destroy()}`, arbitrary API objects, and automatic service publication are rejected.

## 14. PluginContext Design

Phase 4B exposes only:

```js
{
  plugin: Object.freeze({ id }),
  scope: {
    signal, alive, child, defer, track, assertAlive, guard
  },
}
```

The context, identity object, and capability facades are frozen. It exposes neither `app`, core/state, runtime, Scope controller, mutable registries, nor a general capability bag.

Lifecycle reentrancy is a capability-boundary rule, not a JavaScript sandbox guarantee. Plugin setup and cleanup receive no `PluginRuntime` or lifecycle-mutation capability and must not invoke `use()`, `unuse()`, or `destroy()`. The runtime defensively rejects direct synchronous reentrancy while invoking setup or cleanup, but does not claim to identify calls made after `await` through an externally captured runtime reference. Browser-compatible JavaScript provides no reliable provenance for distinguishing such a call from unrelated host code.

## 15. Capability Injection Strategy

An internal context builder accepts explicit named capability factories. Each future factory receives plugin identity, the public Scope, and narrowly scoped internal staging plumbing, then returns one frozen typed facade. Context properties are added deliberately (`services`, `inputs`, `map`, and so on), not through public string lookup. Phase 4B installs no product capability factories.

## 16. Liveness Enforcement

Mutating facade methods must call `scope.assertAlive()` before starting and again immediately before committing asynchronous results. `AbortSignal` requests cooperative cancellation but is not mutation authority. Event/listener callbacks may be wrapped with `scope.guard()` and become no-ops after death; explicit stale API calls reject.

## 17. Staged Registration Integration

Future registry facades receive a private staging adapter backed by `ScopeController.stage()`. Plugins receive only typed registration methods. Staged records remain invisible during setup, all preflight before publication, commit synchronously without callbacks, and are withdrawn through the owner Scope. No universal public registration abstraction is introduced.

## 18. Uninstall Semantics

Absent/inactive uninstall is idempotent. Installing uninstall waits for install/rollback and removes the plugin if it became active. Concurrent uninstall shares one teardown. Active direct dependents block removal and are reported deterministically. Allowed uninstall removes the plugin from discovery, synchronously revokes Scope authority, and awaits `close()`. Dependencies remain installed.

## 19. Cleanup Failure and Quarantine

An `OwnershipCleanupError` produces a frozen diagnostic snapshot. A quarantined plugin is dead and non-active but not absent: its ID, definition identity, dependency edges, controller, and copied residual diagnostics remain reserved internally. Fresh `use()` rejects. Repeated `unuse()` calls `retryCleanup()` and therefore retries only `retry: "safe"` residuals. A terminal residual keeps the plugin quarantined for the runtime lifetime.

## 20. Runtime Destruction

`PluginRuntime.destroy()` is asynchronous, idempotent, and terminal. It immediately marks the runtime destroying, rejects new lifecycle requests, revokes pending setup authority/signals, and prevents late setup commit. Active plugins are removed in dependent-first topological order with reverse activation order as the tie-breaker. Quarantined retry-safe residuals are attempted and cleanup failures are aggregated after all possible work.

Authority revocation is separate from Promise cancellation. Destruction must not wait forever for a non-cooperative setup Promise. A pending setup is detached after its Scope is synchronously revoked/aborted; its eventual settlement is observed to prevent unhandled rejection and can never publish. Resources already registered with the Scope are cleaned immediately. The diagnostic snapshot records detached pending work. Final application/EntryStore/map destruction remains Phase 4K.

## 21. Temporary Composition Allowlist

The Phase 4B enabled set is empty. The disabled set explicitly contains every repository plugin ID. An exhaustive test enumerates repository plugin definitions and requires every ID to be classified exactly once. Disabled implementations are not imported by composition. The allowlist performs no adaptation and is removed in Phase 4K.

## 22. Authority Cutover

In one change set, `createTiliaApp()` delegates `use/unuse` to `PluginRuntime`, startup configuration uses that same path, enabled setup receives only `PluginContext`, and the eager built-in registry becomes the lazy catalog. No enabled plugin runs through both systems. Allowlist rejection occurs before implementation loading.

## 23. Legacy Runtime Deletion

Remove the old pending/installed maps, validation-only dependency loop, convention loader, `pluginUrls`/arbitrary `pluginLoader` policy, permissive module export guessing, broad setup call, setup-result service publication, `{destroy()}` inference, descriptor stylesheet handling, and mutable public `app.plugins`.

Legacy implementation files remain disabled until their migration phases. `app.core` and `app.state` may physically remain for later semantic cutover but are unreachable through PluginContext.

## 24. Stylesheet Transition

Descriptor stylesheets are invalid in the target definition. Plugins depending on them remain disabled. The shell's current core stylesheet may remain as application infrastructure until Phase 4C introduces the owned shared-style mechanism; it is not exposed as plugin descriptor behavior.

## 25. Service-Publication Transition

Setup returns never publish services. Plugins that return APIs or consume `app.services` remain disabled. Mutable legacy services may physically remain until the Phase 4C registry cutover, but the new context cannot reach them.

## 26. Built-In Loading Strategy

`src/builtins.js` becomes or delegates to a lightweight immutable catalog containing IDs, dependency metadata, and literal dynamic imports only. Importing the runtime/catalog must not evaluate plugin implementation modules. Disabled allowlist entries reject without invoking their loaders.

## 27. Public Application API Boundary

The application exposes `use`, `unuse`, `hasPlugin`, and `listPlugins` as narrow runtime delegates. `use` returns the opaque frozen ID handle; `unuse` resolves `undefined`. Runtime debugging may expose copied snapshots through a narrow diagnostic method, but not maps, Scope objects, promises, implementation values, or cleanup handles. Complete public `app.destroy()` remains a later application-lifecycle concern.

## 28. Error Model

Use one `PluginError` with stable `code`, structured frozen details, and `cause`:

- `PLUGIN_ID_INVALID`, `PLUGIN_DESCRIPTOR_INVALID`, `PLUGIN_DESCRIPTOR_CONFLICT`;
- `PLUGIN_UNKNOWN`, `PLUGIN_RESOLUTION_FAILED`, `PLUGIN_IMPLEMENTATION_INVALID`;
- `PLUGIN_DEPENDENCY_MISSING`, `PLUGIN_DEPENDENCY_CYCLE`, `PLUGIN_DEPENDENCY_FAILED`;
- `PLUGIN_SETUP_FAILED`, `PLUGIN_COMMIT_FAILED`;
- `PLUGIN_HAS_DEPENDENTS`, `PLUGIN_LIFECYCLE_REENTRANT`;
- `PLUGIN_QUARANTINED`, `PLUGIN_TEARDOWN_FAILED`;
- `PLUGIN_RUNTIME_DESTROYING`, `PLUGIN_RUNTIME_DESTROYED`, `PLUGIN_RUNTIME_DESTROY_FAILED`.

Ownership errors remain available as causes and retain cleanup reports rather than being flattened.

## 29. Test Plan

Add deterministic tests for catalog/ID validation, lazy resolution, successful caching, failed retry, resolver deduplication, implementation validation, all dependency graph cases, transactional setup/rollback, setup cleanup, commit failure, same-ID and overlapping concurrency, context isolation/liveness, lifecycle reentrancy, uninstall/dependent protection, quarantine/retry policy, destruction including never-settling setup, allowlist exhaustiveness, and absence of eager disabled imports.

Phase 4A ownership tests remain unchanged and must pass.

## 30. Existing Test Migration

Replace legacy runtime expectations in `plugin-lifecycle.test.js`, eager/broad-app assertions in `builtins.test.js`, and runtime portions of status optional-plugin tests. Remove expectations for auto-services, `{destroy()}`, descriptor stylesheets, manual dependency ordering, mutable `app.plugins`, and convention loading. Preserve independent domain, UI/control, map, input, and external-plugin algorithm tests.

Add a Phase 4B shell/runtime smoke gate. Keep the existing 28 product smoke scenarios as restoration milestones; do not delete or unconditionally skip them to make the intermediate phase green. The 4B gate, rather than the full product suite, is the phase acceptance smoke command.

## 31. Implementation Sequence

1. Errors, ID validation, and metadata normalization.
2. Lazy catalog/resolver cache.
3. Pure dependency planner.
4. Frozen PluginContext builder and capability-factory boundary.
5. Runtime state records, operation sharing, and lifecycle coordinator.
6. Scope-backed setup transaction and cleanup validation.
7. Uninstall, dependent protection, quarantine, and retry.
8. Terminal destruction with detached non-cooperative setup handling.
9. Application delegation and startup composition cutover.
10. Empty allowlist and exhaustive classification test.
11. Lazy built-in catalog and legacy lifecycle deletion.
12. Contract, unit, smoke, search, and diff verification.

## 32. Expected Files Added, Modified, and Deleted

Add runtime modules under `src/plugins/runtime/` for errors, catalog normalization/resolution, planning, context construction, and runtime coordination; add the migration allowlist and focused tests. Modify `src/app.js`, `src/builtins.js`, `src/index.js`, affected lifecycle tests, and test scripts/configuration for the 4B smoke gate. No existing plugin implementation is migrated. Legacy lifecycle code is deleted from its current files rather than retained beside the new runtime.

## 33. Explicit Non-Goals

ServiceRegistry, InputRegistry, contributions, stylesheet leases, MapFacade, EntryStore, DomainRegistry, SelectionStore, rendering, Photo, GPX, product UI restoration, package discovery, version solving, optional dependencies, parallel setup, automatic orphan removal, and complete application destruction are out of scope.

## 34. Architecture Invariant Checklist

- At most one live lifecycle record per plugin ID.
- Every active plugin has all hard dependencies active.
- Cycles and missing dependencies fail before setup.
- Concurrent use never executes setup twice.
- Active publication follows successful Scope commit.
- Stale context cannot mutate.
- Active dependents prevent provider uninstall.
- Dependencies are never removed implicitly.
- Complete rollback is retryable; residual cleanup is quarantined.
- Only retry-safe residuals rerun.
- Runtime destruction is terminal and late setup cannot publish.
- Disabled plugins are not eagerly loaded.
- No broad application authority reaches PluginContext.
- No second lifecycle authority remains.

## 35. Risks and Edge Cases

The principal risks are operation deadlock during direct synchronous reentrancy, resolver timing influencing order, partial publication after broken commit, quarantine being mistaken for absence, and destruction hanging on non-cooperative setup. Mitigations are structural removal of lifecycle authority from PluginContext plus defensive synchronous reentrancy rejection, planning before execution, Phase 4A defensive rollback, distinct quarantined records, and synchronous authority revocation plus detached observation of never-settling setup.

Conflicting same-ID direct definitions reject. Loader failure is retryable. An uninstall request during install waits for its outcome. A use request during teardown waits and reinstalls only after clean completion. Destroying during setup makes commit impossible even if setup later resolves.

## 36. Questions or Contradictions Discovered

No architecture contradiction was found. The implementation must make one wording refinement explicit: runtime destruction cannot await an arbitrary non-cooperative setup Promise forever. It therefore revokes/cleans the Scope immediately, observes late settlement, records detached work diagnostically, and completes destruction without granting late commit authority. This preserves both terminal destruction and the architectural statement that Promise cancellation is impossible.

## 37. Phase 4B Completion Criteria

- PluginRuntime is the sole production plugin lifecycle authority.
- Enabled setup receives only guarded PluginContext.
- Built-in metadata is available without eager implementation loading.
- Planner, concurrency, setup transaction, uninstall, quarantine, and destruction tests pass.
- The production allowlist is empty and exhaustively validated.
- Disabled implementation loaders are not called.
- Legacy runtime searches are clean in the active path.
- Phase 4A and unaffected unit tests pass.
- The Phase 4B shell/runtime smoke gate passes.
- Full product smoke status is reported as an intentional migration-stage baseline, not hidden.
- `git diff --check` passes and no Phase 4C implementation is included.

## 38. Recommendation on Whether Implementation Can Begin

Implementation can begin. The architecture, runtime boundaries, state transitions, public contracts, failure behavior, allowlist, test policy, and later-phase exclusions are decision-complete. No unresolved human decision or ownership-kernel change is required.
