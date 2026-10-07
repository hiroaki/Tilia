# Phase 4C — Typed Extension Foundations Implementation Plan

## 1. Executive Summary

Phase 4C establishes the Scope-owned typed extension foundations required by later domain migrations: ServiceRegistry, target InputRegistry, typed contribution stores and subscriptions, stylesheet leases, foundational UI surfaces and mounts, MapFacade, an owned base-map catalog/controller, and explicit PluginContext capabilities.

The first production migrations are `tilia-status`, `tilia-base-maps-control`, `x-gsi-base-maps`, and `x-opentopomap-base-maps`. GPX, Photo, entries, selection, rendering, standard input transports, product panels, and complex plugins remain disabled.

## 2. Authoritative Requirements

Use this precedence:

```text
ARCHITECTURE.md
  -> MIGRATION-PLAN.md
  -> completed Phase 4A/4B contracts
  -> Phase 2/3 supporting designs
  -> legacy implementation
```

Phase 4C preserves one authority per concern, transactional publication, deterministic cleanup, stale-capability rejection, and the Phase 4B runtime boundary.

## 3. Completed Phase 4A/4B Contracts Available

The implementation uses Scope liveness/signals/children/disposers/tasks/guards, `ScopeController.stage()`, callback-free staged commit, PluginRuntime transactional setup/dependencies/quarantine, and explicit frozen capability factories. No second transaction system is introduced.

A registration becomes publicly unavailable as soon as its owner Scope dies. Physical index deletion may happen later during staged-record cleanup, but lookup and cached facades must exclude dead owners immediately.

## 4. Current Extension Mechanism Inventory

| Concern | Current path | Problem |
|---|---|---|
| Services | `app.services`, `provide()` | mutable strings, overwrite, no liveness |
| Inputs | `core/input-registry.js` | anonymous append-only first-match dispatch |
| Status | implicit service lookup | no typed contract or ownership |
| Base maps | `createBaseLayerManager()` | irreversible provider registration |
| Styles | `ui/styles.js` | document dedupe without leases/removal |
| Contributions | ad hoc controls/panels | no typed store or deterministic contract |
| Subscriptions | refresh handlers/hubs | coarse and inconsistent failure behavior |
| UI surfaces | surface manager | ad hoc replacement and cleanup |
| Map access | raw map/direct helpers | unguarded, manually cleaned |

Legacy `app.core` and `app.state` remain until 4D but are unavailable to PluginContext.

## 5. Current-to-Target Mapping

| Concern | Current authority | Target authority | Phase 4C action |
|---|---|---|---|
| Services | mutable service object | ServiceRegistry | replace |
| Inputs | legacy first-match registry | target InputRegistry | cut over active dispatch |
| Contributions | embedded UI items | typed contribution store | introduce foundation |
| Status | implicit service/control | typed service + owned control | migrate |
| Styles | permanent links | stylesheet lease manager | replace plugin path |
| UI mounts | arbitrary element mounting | host-owned mount manager | replace plugin path |
| Map effects | raw helpers | MapFacade | make migrated path authoritative |
| Base maps | legacy manager | typed catalog/controller | replace |
| Refresh | `refreshView()` | typed subscriptions | prohibit for migrated plugins |

## 6. ServiceRegistry Design

Services use exported frozen typed key objects, not strings or symbols:

```js
const statusServiceKey = defineServiceKey({
  id: "tilia-status",
  createFacade({ implementation, assertAvailable }) {
    return Object.freeze({
      set(text) {
        assertAvailable();
        return implementation.set(text);
      },
    });
  },
});
```

Plugin API:

```js
context.services.provide(key, implementation)
context.services.require(key)
context.services.optional(key)
context.services.subscribe(key, listener, { emitCurrent: true })
```

One live provider is allowed per key. Required lookup throws, optional lookup returns `null`, and lookup returns the key-defined frozen facade rather than the raw implementation or a Proxy.

## 7. Service Identity and Ownership

Each key contains a stable diagnostic ID, private identity token, facade factory, and optional implementation validator. Provider Scope owns registration; consumer facades capture provider and consumer liveness. Duplicate registration, including by the same plugin, rejects.

## 8. Service Staging and Lookup Semantics

`provide()` creates a staged registration. Full-batch preflight precedes callback-free Scope commit. PluginRuntime then publishes the active record and flushes post-commit availability notifications.

On rollback the service never becomes visible. On uninstall, Scope death synchronously removes public authority and invalidates cached facades before physical index removal and remaining owned cleanup.

## 9. InputRegistry Design

```js
context.inputs.register({
  id: "vendor-handler",
  priority: 0,
  discovery: { extensions: [".ext"], mimeTypes: ["type/subtype"] },
  recognize(input) { return true; },
  async handle({ input, signal }) { return result; },
});

await context.inputs.dispatch(input);
```

Handler IDs are unique. Recognition is synchronous and side-effect-free. Dispatch evaluates a committed live snapshot in lexical handler-ID order, chooses the unique highest-priority claimant, reports ties explicitly, isolates recognizer errors, and never uses installation order. Each invocation is caller-owned and aborts when caller or handler owner closes. Removal blocks new calls and aborts in-flight work.

Historical note: the related domain-creation publication contract was subsequently amended during Phase 4G planning; implementation is pending. See the [contract-amendment record §3](PHASE-4G-CONTRACT-AMENDMENTS.md#3-domain-create-commit-boundary-cancellation). This does not change the Phase 4C contract implemented and accepted here.

## 10. Input Transport Boundary

Phase 4C implements registration, discovery metadata, matching/dispatch, cancellation, removal, and diagnostics only. File picker, drag/drop, URL/query import, GPX/JPEG handlers, parsing, normalization, and semantic creation remain later phases.

## 11. Contribution Store Design

Implement an internal engine configured by typed points. Public code receives only point-specific facades, never `register(pointName, value)`.

Identity is `(point identity, item ID)`. Descriptors are copied/frozen. Unknown groups, non-finite ranks, and duplicate items reject. Ordering is host group order, ascending rank, then lexical item ID. Registration is staged and Scope-owned.

Base maps remain a dedicated catalog because selection and layer lifetime exceed a plain contribution contract.

## 12. Subscription Semantics

Typed stores expose frozen `getSnapshot()` and `subscribe(listener, {emitCurrent:true})`. Initial delivery is synchronous from committed state. Later delivery is synchronous after mutation commit, uses a stable subscriber snapshot, guards owner liveness, isolates failures, and queues reentrant mutations. Unsubscribe is idempotent and Scope-owned. Callback promises are not awaited.

## 13. Stylesheet/Shared Resource Lease Design

```js
const lease = context.styles.use({
  id: "plugin-style",
  href: new URL("./styles.css", import.meta.url).href,
  media: "all",
});
await lease.ready;
lease.release();
```

One app/document manager owns physical links. Equivalent definitions share a link; conflicting definitions under one ID reject. Each acquisition creates a balanced Scope-owned lease. Final release removes the link; release is idempotent. Load failure rejects `ready`, removes the failed link, records diagnostics, and permits retry after failed leases are released. This remains stylesheet-specific.

## 14. UI Surface and Mount Foundation

```js
context.ui.mountSurface({
  id: "floating-panel",
  surface: "floating",
  rank: 0,
  ariaLabel: "Example",
  mount({ container, scope }) {},
});
```

The app owns roots, placement, wrappers, and ordering. Identity is `(pluginId,mountId)` and ordering is rank then qualified ID. Each mount receives only an empty assigned container and child Scope. Cleanup closes the child before removing its wrapper. Phase 4C supports `panel` and `floating`; full Phase 4I hosts remain out of scope.

## 15. Status Migration

`tilia-status` mounts its control through MapFacade and explicitly provides `statusServiceKey`. The plugin owns DOM/listeners/control. Status is a singleton service rather than a contribution. Multiple consumers may call it; the last completed call controls display. Legacy mutable service/status paths are removed from active composition.

## 16. MapFacade Design

```js
listen(type, listener)
attachLayer(layer, { band } = {})
mountControl(control, { position, priority, edgePolicy } = {})
createPane({ name, band })
fitBounds(bounds, options)
panTo(point, options)
setView(point, zoom, options)
getViewport()
project(point, zoom)
unproject(pixel, zoom)
advancedLeafletMap()
```

Resource-producing methods return frozen idempotent handles and register cleanup with Scope. Viewport and event data use frozen plain geographic records. The facade exposes no entry, renderer, or base-map layers or mutable registries. The raw map escape hatch is advanced and effects created through it remain caller-owned.

## 17. Map Event Ownership

`listen()` validates arguments, wraps callbacks with `scope.guard()`, normalizes known events, registers one Leaflet listener, and removes it automatically or through an idempotent handle. Map/app teardown removes listeners even if later plugin cleanup fails.

## 18. Base-Map Catalog Design

```js
context.baseMaps.register({
  id: "opentopomap",
  label: "OpenTopoMap",
  provider: "opentopomap",
  category: "topo",
  rank: 0,
  visibleInSelector: true,
  isDefault: false,
  createLayer() { return layer; },
});
```

Catalog snapshots expose immutable metadata; factories remain private. Provider IDs are unique and registrations staged/owned. The app-owned controller exclusively owns the selected Leaflet layer. Selection attaches a candidate before committing state and removing the old layer; failure preserves the old selection.

Removing the selected provider deterministically tries remaining defaults then ordered candidates. Failed candidates are diagnosed and skipped. If all fail, selection becomes `null` and the departing provider layer is removed.

## 19. Base-Map Migration

Migrate default/configured definitions as app-owned registrations, GSI and OpenTopoMap through their external plugins, and the selector through catalog subscriptions and MapFacade. The selector optionally reports through `statusServiceKey`. Disconnect the refresh-driven legacy base-map facade.

## 20. PluginContext Capability Expansion

Phase 4C-enabled plugins receive frozen explicit `services`, `inputs`, `styles`, `ui`, `map`, and `baseMaps` properties in addition to `plugin` and `scope`. No generic capability or contribution lookup is added.

## 21. Capability Factory Integration

Internal factories receive `{pluginId, scope, stage, enqueuePostCommit, diagnostics}` and close over one specific host subsystem. `PluginRuntime.installOne()` commits Scope, verifies authority, publishes the active runtime record, then flushes isolated post-commit notifications. Notification failure never rolls back committed installation.

## 22. Ownership Matrix

| Item | Owner | Publication/cleanup |
|---|---|---|
| Service registration | provider Scope | staged; invalid at Scope death; remove index |
| Service subscription | consumer Scope | immediate; unsubscribe |
| Input handler | provider Scope | staged; remove and abort operations |
| Contribution | contributor Scope | staged; remove item |
| Subscription | subscriber Scope | immediate; unsubscribe |
| Stylesheet lease | acquiring Scope | immediate; release/final link removal |
| UI mount | plugin/mount child | immediate; close child/remove wrapper |
| Map listener/layer/control | caller Scope | immediate; detach/remove |
| Base provider | provider/app Scope | staged; remove/reconcile selection |
| Selected base layer | app controller | replace/remove concrete layer |
| Status service/control | status plugin Scope | staged service + owned control |

## 23. Authority Cutovers

Replace mutable services, active legacy input dispatch, implicit status lookup, plugin-facing permanent stylesheet/surface APIs, migrated raw map helpers, and the legacy base-map facade. Generic refresh remains only for disabled legacy code until 4I. No state translation or mirroring is allowed.

## 24. Migration Allowlist Update

Enable exactly:

```text
tilia-status
tilia-base-maps-control
x-gsi-base-maps
x-opentopomap-base-maps
```

Keep panel, layers, elevation, file/drop/URL/query inputs, settings, export, route search, editor, and milestone disabled for their scheduled phases. Classification remains exhaustive.

## 25. Legacy Services Transition

Remove active mutable `services`, `provide()`, implicit status lookup, and automatic base-map/surface service publication. Disabled sources may retain references until migration but cannot be reached through enabled composition. No translation layer survives.

## 26. Legacy InputRegistry Transition

Route active application dispatch to target InputRegistry, initially with no domain handlers. Remove public `app.registry`/`app.context`; if required for retained direct tests, the legacy registry remains physically disconnected until 4D. Existing embed import behavior may remain unavailable until target domain slices.

## 27. Error Model

Use one shallow `ExtensionError` with stable codes and frozen details: service key/duplicate/missing/unavailable; input invalid/duplicate/unsupported/conflict/recognition failure; contribution invalid/duplicate; subscription invalid; resource conflict/acquisition/released; UI unavailable/invalid; and base-map invalid/duplicate/unknown/selection failure. Reuse `SCOPE_NOT_ACTIVE` for stale capability calls and ownership errors for cleanup failure.

## 28. Test Plan

Add contract coverage for service staging/liveness/conflicts/removal; input registration/order/conflicts/async cancellation; contribution immutability/order/subscription/reentrancy; stylesheet balancing/failure; surface mount ordering/rollback/host teardown; MapFacade operations and cleanup; base-map defaults/selection/provider removal/fallback failures; status lifecycle; runtime post-commit ordering; zero-publication rollback; stale capabilities; allowlist completeness; and disabled-loader isolation.

Retain Phase 4A/4B tests and adapt status, base-map, control, surface, and conceptual input tests to target contracts.

## 29. Phase 4C Smoke Milestone

The Phase 4C gate proves shell/map boot, the four enabled plugins, status `Ready`, four ordered base-map options, OpenTopoMap selection/status, selector uninstall cleanup, provider uninstall/reinstall without duplicates, status uninstall/reinstall without orphans, and no requirement for GPX/Photo/input/layers/settings/elevation/editor behavior.

## 30. Existing Product Smoke Impact

Measured planning baseline: unit 45 files/397 tests passed; Phase 4B smoke 1/1 passed; full smoke 2 passed/27 failed; diff check passed; worktree clean. Restore only shell/status/base-map behavior in 4C. Photo remains 4G; GPX and inference 4H; standard inputs/layers/settings/elevation 4I; editor 4J. Update embed expectations because legacy input dispatch is disconnected.

## 31. Implementation Sequence

1. Extension errors, typed keys, internal registration utilities.
2. Runtime post-commit queue.
3. ServiceRegistry.
4. InputRegistry.
5. Contribution/subscription foundation.
6. Stylesheet leases.
7. UI mounts.
8. MapFacade.
9. Base-map catalog/controller.
10. Capability/composition wiring.
11. Status migration.
12. Base-map plugin migrations.
13. Allowlist and legacy disconnection.
14. Phase 4C smoke gate.
15. Complete verification.

## 32. Expected Files Added, Modified, and Deleted

Add cohesive extension, resource, map-facade/base-map, and UI-mount modules plus focused tests and Phase 4C smoke assets. Modify runtime/context integration, application composition, built-in catalog, allowlist, public exports, four migrated plugins, and scripts. Delete active mutable service/base-map/plugin-resource paths and obsolete tests; retain only explicitly disconnected legacy input source until 4D if needed.

## 33. Explicit Non-Goals

Do not implement DomainRegistry, EntryStore, GPX/Photo semantics, SelectionStore, rendering, interaction arbitration, domain input handlers, full standard UI, export, route search, editor, milestone, or final application destruction orchestration.

## 34. Architecture Invariant Checklist

- One active authority per migrated concern.
- One Scope/lease owner per registration/resource.
- No visibility before complete plugin commit.
- Callback-free synchronous publication and isolated post-commit notifications.
- Immediate authority loss for dead scopes.
- Installation-independent input/contribution ordering.
- No GPX/Photo knowledge in generic mechanisms.
- No ambient core, event bus, universal registry, or capability bag.
- Distinct host-root/plugin-subtree ownership.
- Balanced shared-resource leases.
- No ordinary raw Leaflet authority or foreign resources.
- No compatibility bridge.

## 35. Risks and Edge Cases

Scope local staged disposal follows setup-return cleanup, so visibility must use owner liveness rather than physical deletion. Runtime post-commit ordering must be explicit rather than microtask-based. Provider removal and fallback must never retain a departing layer or stale selection. Style loading is asynchronous and separate from synchronous registry commit. Raw-map access is an integrity rather than security boundary. Legacy core remains physically present until 4D and must be distinguished from active composition.

## 36. Questions or Contradictions Discovered

No architecture-blocking contradiction was found. The cleanup-order concern is resolved by synchronous Scope-liveness-based authority withdrawal before physical index cleanup. The observed full smoke suite contains 29 tests rather than the older documented 28-test baseline.

## 37. Phase 4C Completion Criteria

All new contracts pass; exactly four plugins are enabled through PluginContext; status/base-map behavior uses target mechanisms; rollback/uninstall leave no visibility or resources; active mutable service/input/base-map paths are absent; migrated plugins use no broad app/core/state/refresh/raw unowned paths; Phase 4A/4B and full unit tests pass; Phase 4B/4C smoke gates pass; later full-smoke failures are documented; diff/search/status reviews pass.

## 38. Recommendation on Whether Implementation Can Begin

Implementation can begin. Contracts, authority cutovers, ownership, allowlist, error behavior, testing, and later-phase exclusions are decision-complete.
