# Phase 4D — Semantic Core Implementation Plan

## 1. Executive Summary

Phase 4D replaces the legacy semantic authority with an application-owned `EntryStore` backed by semantic providers registered in `DomainRegistry`.

```text
Application semantic root
├── DomainRegistry
│   ├── gpxDomainKey   -> GPX provider registration
│   └── photoDomainKey -> Photo provider registration
└── EntryStore
    └── application-owned entry scopes
        ├── private provider instance
        └── provider lease
```

At completion:

- `EntryStore` is the sole generic entry authority.
- Domain providers are the sole domain-state authorities.
- Entries are valid without rendering, selection, popup, or UI.
- Provider removal is blocked while creation or entry leases exist.
- No legacy state mirror or compatibility entry shape remains.
- Domain implementations remain lazily loaded.

Provider public views partition state explicitly:

```ts
{
  data: unknown;          // portable domain/document data
  preferences: unknown;   // persistent domain-owned presentation preferences
  derived: unknown;       // reproducible derived values, when exposed
}
```

The architecture's term **semantic revision** is a currency covering both domain semantic data and persistent domain-owned presentation state. It does not imply that presentation preferences become document-semantic content.

## 2. Authoritative Requirements

Use this precedence:

```text
ARCHITECTURE.md
  -> MIGRATION-PLAN.md
  -> completed Phase 4A–4C contracts
  -> Phase 2/3 supporting design
  -> legacy implementation
```

Phase 4D preserves singular authority, transactional publication, application ownership, provider liveness, immutable public state, domain-neutral generic infrastructure, and headless entry validity.

## 3. Completed Phase 4A–4C Contracts Available

Reuse Scope liveness, child scopes, staged records, rollback, deterministic cleanup, PluginRuntime transactional setup, typed keys, guarded facades, post-commit notification, and Phase 4C subscription behavior. Do not introduce a second transaction, ownership, or notification system.

Provider registration is staged. Scope death revokes authority synchronously even if physical record removal occurs later.

## 4. Current Semantic Authority Inventory

The legacy authority consists of:

- `src/core/state.js`: mutable `entries`, `sources`, and `layers`; ID allocation; source/presentation replacement; array-aligned removal.
- `src/core/boot.js`: permanent GPX/JPEG handlers; GPX and Photo creation, mutation, visibility, deletion, rendering, interaction, selection, inference, and URL cleanup.
- `src/app.js`: public `app.core`, `app.state`, legacy refresh and interaction forwarding, and legacy error storage.
- Disabled UI and external plugins that read `core.state.entries`, `entry.source`, `entry.layer`, or `entry.interactions`.

The current generic entry is a mutable god object. `state.sources` and `state.layers` are duplicate indexes whose correctness depends on array alignment.

## 5. Semantic and Presentation Classification

| Current value | Classification | Target authority | Revision effect |
|---|---|---|---|
| GPX tracks, segments, points, routes, waypoints | semantic document data | GPX provider | increments |
| GPX/document metadata | semantic metadata | GPX provider | increments |
| Photo coordinate and captured timestamp | semantic Photo data | Photo provider | increments |
| Photo source metadata | domain metadata/provenance | Photo provider | increments when committed value changes |
| Whole-entry visibility | generic presentation preference | EntryStore | does not increment |
| GPX category visibility | domain-owned presentation preference | GPX provider | increments |
| GPX per-track visibility | domain-owned presentation preference | GPX provider | increments |
| GPX authoritative style | domain-owned presentation preference | GPX provider | increments |
| Photo requested time mode | domain-owned interpretation preference | Photo provider | increments |
| Photo resolved mode and inferred results | derived domain data | Photo provider | no independent increment |
| Layer, marker, polyline, renderer | rendering resource | later RenderGeneration | excluded |
| Interaction handles | interaction resource | later generation/binding | excluded |
| Popup, highlight, hover, focus | transient presentation state | later presenter/UI | excluded |
| Selection | semantic selection state | later SelectionStore | excluded |
| Bounds, summary, distance, timeline | derived data/query | domain provider | no independent increment |
| Browser object URL | entry-owned browser resource | private Photo instance/scope | excluded from snapshots and revision |
| `source` and `presentation` bags | legacy compatibility state | none | removed |

Domain-owned presentation preferences are not document content. They nevertheless advance semantic revision because `ARCHITECTURE.md` explicitly defines that revision as covering domain semantic and domain-presentation state. Whole-entry visibility, selection, renderer state, and transient UI state remain separate currencies.

## 6. Current-to-Target Mapping

| Legacy authority | Target |
|---|---|
| `state.entries` | private EntryStore records plus immutable views |
| `state.sources` | provider-private instance plus typed domain snapshot |
| `state.layers` | later generation scopes; no Phase 4D equivalent |
| `entry.source` | typed domain snapshot/query |
| `entry.presentation` | generic visibility plus explicit provider preferences |
| `entry.layer/interactions` | later rendering/interaction infrastructure |
| boot GPX/Photo branches | lazy domain plugins |
| core semantic methods | guarded entry/domain facades |

## 7. Domain Identity

Use exported frozen typed key objects, registered in a private `WeakSet`:

```js
export const gpxDomainKey = defineDomainKey({ id: "gpx", createFacade });
export const photoDomainKey = defineDomainKey({ id: "photo", createFacade });
```

Each key has a stable diagnostic ID, unforgeable object identity, provider validator, and typed public-facade factory. EntryStore and later renderer/selection registries use key identity. Diagnostics serialize `key.id`. Domain keys are distinct from plugin IDs, input formats, services, and renderers.

## 8. DomainRegistry Design

`DomainRegistry` allows one active provider registration per domain key. It owns staged registration records, exact provider-registration identities, availability subscriptions, liveness checks, lease accounting, and immutable diagnostics.

Conceptual internal API:

```js
defineDomainKey(definition)
createDomainRegistry({ onError })
registry.createProviderFacade(capabilityInput)
registry.resolveForEntryStore(domainKey)
registry.getDiagnostics()
```

The registry contains semantic providers only and imports no GPX, Photo, Leaflet, renderer, selection, popup, interaction, or UI implementation.

## 9. DomainProvider Contract

```ts
interface DomainProvider {
  prepareCreate({ entryId, value, entryScope, signal }):
    PreparedInstance | Promise<PreparedInstance>;

  prepareMutation({
    entryId,
    currentInstance,
    command,
    expectedRevision,
    operationScope,
    signal,
  }): PreparedMutation | Promise<PreparedMutation>;

  getSnapshot(instance, revision): DomainSnapshot;
}

interface PreparedInstance {
  readonly instance: unknown;
  readonly snapshot: DeepReadonlyPlainData;
  readonly dispose?: () => void | Promise<void>;
}

interface PreparedMutation {
  readonly changed: boolean;
  readonly nextInstance?: unknown;
  readonly nextSnapshot?: DeepReadonlyPlainData;
  readonly change?: DeepReadonlyPlainData;
  readonly disposePrevious?: () => void | Promise<void>;
}
```

Providers validate and normalize before commit. They contain no rendering, selection, popup, DOM, Leaflet, or interaction behavior. EntryStore treats private instances and change descriptors as opaque.

## 10. Provider Registration and Identity

Domain identity identifies the semantic contract. Provider registration identity identifies one concrete installed provider instance. Existing entries permanently depend on the exact registration used for their creation and never dynamically re-resolve a replacement provider by domain key.

`context.domains.provide(key, provider)` stages registration through the existing Scope transaction. Duplicate live or staged providers reject during preflight. Publication is synchronous and callback-free; availability notification follows plugin activation.

## 11. Provider Leases and Removal

Only EntryStore acquires leases. A lease records registration identity, domain key, purpose (`creation` or `entry`), optional entry ID, and release state.

Creation ordering is normative:

```text
reserve entry ID
-> resolve exact live registration
-> acquire creation lease
-> perform async provider preparation
-> atomically convert the same lease to an entry lease
-> publish entry
```

There is no release/reacquire gap.

Provider removal preflights leases before Scope authority is revoked. With live leases it rejects using `DOMAIN_PROVIDER_IN_USE` and reports domain ID, creation count, entry count, and dependent entry IDs. It does not cascade-delete entries or leave inert records. Reinstall is permitted only after complete cleanup and creates a new registration identity.

## 12. EntryStore Design

Private record:

```ts
interface EntryRecord {
  readonly id: EntryId;
  readonly domainKey: DomainKey;
  visible: boolean;
  revision: number;
  state: "preparing" | "active" | "removing" | "cleanup-failed" | "removed";
  readonly insertionSequence: number;
  readonly scopeController: ScopeController;
  readonly providerRegistration: unknown;
  readonly providerLease: unknown;
  instance: unknown;
  domainSnapshot: unknown;
}
```

Only active records are publicly discoverable. EntryStore owns IDs, exact domain and provider-registration association, whole-entry visibility, revision, entry scopes, create/update/delete serialization, subscriptions, cleanup residuals, and diagnostics.

## 13. Public Entry View

```js
Object.freeze({
  id,
  domain,
  visible,
})
```

These are the only generic fields. Revision appears only in typed domain snapshots/events. Public values expose no provider instance, scope/controller, lease, source bag, presentation bag, renderer, DOM, Leaflet object, or mutable internal record.

## 14. Snapshot Immutability

- Providers copy and normalize caller input.
- Standard providers recursively freeze public arrays and plain records.
- Public snapshots contain no mutable `Date`, `File`, `Blob`, DOM, Leaflet, or private provider values.
- Dates are exposed as finite epoch-millisecond numbers.
- EntryStore freezes generic views and event records.
- Development/tests recursively validate plain-data immutability.
- Immutable structural sharing is allowed.
- Caller mutation after creation/update cannot alter stored authority.
- Prior snapshots remain stable after later commits.

EntryStore does not clone opaque private instances, and JSON serialization is not used as a cloning mechanism.

## 15. Semantic Revision

Revision starts at `1` and increments once for each committed revisioned domain mutation.

It increments for GPX document changes, GPX persistent category/per-track visibility, GPX authoritative style, Photo semantic data, and Photo requested time-mode changes. It does not increment for idempotent or failed commands, whole-entry visibility, derived recomputation alone, preview-resource changes, selection, rendering, generation, popup, or transient UI state.

One command produces at most one increment even when dependent derived fields also change.

## 16. Creation Transaction

```text
validate caller/app liveness
-> reserve never-reused ID
-> resolve live provider registration
-> acquire creation lease
-> create uncommitted app-owned entry scope
-> provider validates, normalizes, freezes, and registers cleanup
-> recheck caller/app/provider currentness
-> atomically insert active record at revision 1
-> convert creation lease to entry lease
-> emit committed notifications
-> return frozen generic view
```

Failure publishes nothing, closes the destination scope, releases the lease, preserves the ID gap, and records cleanup residuals privately.

## 17. Update Transaction

```text
enqueue per-entry operation
-> assert liveness/domain/expected revision
-> prepare candidate without changing current state
-> recheck revision and deletion state
-> atomically swap instance/snapshot
-> increment revision once
-> emit typed domain and generic entry changes
-> dispose superseded resources best-effort
```

Pre-commit failure leaves the previous instance, snapshot, revision, visibility, and lease intact. Post-commit cleanup or notification failure does not roll back state. Cross-domain replacement is prohibited and requires remove plus create.

## 18. Visibility Transaction

`setVisible()` is serialized with entry mutations. It commits only when the boolean changes, emits `visibility-changed`, and never increments semantic revision. Phase 4D does not require a renderer callback.

## 19. Deletion Transaction

```text
enqueue removal
-> mark removing and revoke operation authority
-> remove from public lookup/list synchronously
-> dispose private instance and entry scope best-effort
-> retain retry-safe residuals privately
-> release provider lease last after complete cleanup
-> mark removed
-> publish final removed notification
```

Repeated removal returns `null`. Cleanup failure never restores public authority, the ID remains reserved, and the provider lease remains while cleanup residuals require the provider. `clear()` removes entries in reverse insertion order, continues after failures, and reports an aggregate result.

## 20. Subscription Semantics

Generic events are `created`, `visibility-changed`, `domain-changed`, `removed`, and `cleared`. Domain events include `entryId`, previous revision, current revision, and a typed immutable change descriptor.

Subscriptions reuse Phase 4C semantics: optional synchronous initial snapshot, commit before notification, deterministic subscriber snapshots, callback failure isolation, Scope ownership, idempotent unsubscribe, dead-scope suppression, and queued reentrant mutations. No generic event bus is introduced.

## 21. Ownership Topology

```text
Application semantic Scope/controller
└── EntryStore
    └── entry child Scope
        ├── exact provider-registration lease
        ├── private provider instance cleanup
        ├── optional Photo preview resource
        └── future rendering/selection children
```

EntryStore creates the destination child directly beneath the application semantic root. The creator supplies values and live authority but never owns the committed entry. No detach, transfer, or adoption API is added.

## 22. Minimal GPX Provider

The GPX public view is partitioned:

```ts
{
  data: {
    name,
    tracks: [{ name?, segments: [{ points: [{ lat, lon, elevation, timestamp }] }] }],
    routes: [{ name?, points: [{ lat, lon, name }] }],
    waypoints: [{ lat, lon, name }],
  },
  preferences: {
    tracksVisible,
    routesVisible,
    waypointsVisible,
    trackVisibility,
    stylePresetId,
  },
  derived: {},
}
```

Tracks, segments, routes, waypoints, and order remain separate. Normalization never flattens or merges them. Summary, extent, distance, and timeline remain pure queries. No Leaflet or interaction resource appears.

## 23. Minimal Photo Provider

```ts
{
  data: {
    name,
    coordinate,
    capturedAt,
    hasGps,
    make,
    model,
    source: { mediaType, size },
  },
  preferences: {
    requestedTimeMode,
  },
  derived: {
    resolvedTimeMode,
    inferredTimestamp,
    inferredLocation,
    locationSource,
  },
}
```

Captured timestamp and coordinates are semantic data. Requested mode is a revisioned interpretation preference. Resolved mode and inferred values are derived and do not mutate independently. Photo-from-GPX inference remains deferred to Phase 4H; therefore unresolved Phase 4D Photos retain null derived location values.

## 24. Browser Resource Treatment

If a Blob is supplied, the Photo provider creates its object URL inside the destination entry scope. The URL remains private in the provider instance and is absent from semantic data, preferences, derived snapshots, events, and diagnostics.

It is revoked on failed creation, deletion, clear, and destruction. Phase 4G may expose it through a narrow guarded Photo resource query such as `getPreview(entryId)`. Phase 4D lifecycle tests use an injected URL factory/revoker without exposing the URL publicly.

## 25. Input Integration Boundary

Phase 4D tests call typed domain creation APIs directly. Product file/drop/URL/query transports and GPX/JPEG handlers remain disabled. InputRegistry does not auto-install domains and no legacy source converter is introduced.

## 26. PluginContext Capabilities

Add frozen `domains` and `entries` capabilities:

```js
context.domains.provide(key, provider)
context.domains.require(key)
context.domains.optional(key)
context.domains.subscribe(key, listener, options)

context.entries.list()
context.entries.get(id)
context.entries.setVisible(id, visible)
context.entries.remove(id)
context.entries.subscribe(listener, options)
```

Provider hooks, lease mutation, app-owned scope creation, registry/store maps, and Scope controllers remain internal. No generic capability lookup is added.

## 27. Public Application API

Expose guarded application facades:

```js
app.entries
app.domains.gpx
app.domains.photo
```

Remove public `app.state`, `app.core`, legacy source/time-mode/visibility methods, raw interaction subscriptions, and direct state access at the 4D-C authority cutover.

## 28. Legacy Authority and Rendering Status

Phase 4D does not bridge target entries into legacy renderers. Old rendering, Selection Hub, and Interaction Hub files may remain temporarily for disabled code but are unreachable from target composition. Interaction Hub is physically deleted in Phase 4H.

The final 4D cutover deletes `src/core/state.js` and removes semantic authority from `src/core/boot.js`. No state translation or synchronization survives.

## 29. Migration Allowlist and Lazy Loading

Add metadata-only built-ins `tilia-gpx-domain` and `tilia-photo-domain`, each using a literal dynamic import. At final Phase 4D completion the enabled set is:

```text
tilia-status
tilia-base-maps-control
tilia-gpx-domain
tilia-photo-domain
x-gsi-base-maps
x-opentopomap-base-maps
```

Domain implementation modules are not loaded unless installed. Inputs, renderers, selection, popup, layers/settings/elevation, export, route search, editor, and milestone remain disabled.

## 30. Failure and Concurrency Semantics

- Registry/plugin lifecycle mutations use existing runtime serialization.
- Entry operations use deterministic per-entry FIFO queues.
- Mutations require exact `expectedRevision`.
- Two overlapping updates cannot use async completion order as conflict resolution.
- Delete prevents later updates; cleanup never resurrects an entry.
- Creation leases block uninstall throughout async preparation.
- Entry leases block uninstall through deletion cleanup.
- Reentrant subscriber mutations run after current delivery.
- Notification failure never changes committed state.
- New provider registrations never adopt instances belonging to an older registration.

## 31. ID Model

Entry IDs are opaque, app-local, monotonic integers reserved before preparation and never reused, including after failure or deletion. Callers cannot supply IDs. IDs are unrelated to provider-registration identity, filenames, source IDs, GPX metadata, or future share IDs.

## 32. Errors and Diagnostics

Use one shallow `SemanticError` with stable codes:

```text
DOMAIN_KEY_INVALID
DOMAIN_PROVIDER_INVALID
DOMAIN_PROVIDER_DUPLICATE
DOMAIN_PROVIDER_UNAVAILABLE
DOMAIN_PROVIDER_IN_USE
ENTRY_INVALID
ENTRY_NOT_FOUND
ENTRY_DOMAIN_MISMATCH
ENTRY_STALE_REVISION
ENTRY_REMOVING
SEMANTIC_INPUT_INVALID
SEMANTIC_CLEANUP_FAILED
SEMANTIC_CAPABILITY_STALE
SEMANTIC_STORE_DESTROYING
```

Errors include `committed`, domain ID, entry ID, expected/actual revision, and cause when applicable. Diagnostics expose frozen IDs, liveness, lease counts, active entry summaries, and cleanup failures without providers, instances, scopes, controllers, promises, preview URLs, or release functions.

## 33. Test Plan

Contract tests cover:

- domain key validation and identity;
- provider staging, rollback, conflicts, liveness, removal, and reinstall;
- creation-to-entry lease continuity and uninstall races;
- IDs, immutable views, snapshot stability, and domain immutability;
- create, list, lookup, update, visibility, remove, and clear;
- stale revisions, domain mismatch, and deterministic async updates;
- failed create/update preservation;
- deletion authority revocation and cleanup residuals;
- subscription ordering, reentrancy, dead subscribers, and callback failures;
- importer Scope independence;
- GPX structure/order/preferences without Leaflet values;
- Photo data/preferences/derived partitioning;
- preview URL absence from snapshots and deterministic resource cleanup;
- lazy domain module loading;
- no legacy semantic-state mutation.

Replace mutable-shape assertions in `state.test.js` and semantic portions of `boot.test.js` rather than preserving obsolete structures.

## 34. Smoke Milestones and Product Impact

The final Phase 4D smoke gate proves headless GPX/Photo creation, immutable reads, revisioned updates, non-revisioned whole visibility, deterministic subscriptions, provider uninstall protection, deletion, clean uninstall/reinstall, and absence of overlays or popups.

Later restoration remains:

- 4E: SelectionStore.
- 4F: renderer registry, coordinator, generations, interactions.
- 4G: Photo input/rendering, preview resource query, popup/settings.
- 4H: full GPX behavior and Photo-from-GPX inference.
- 4I: standard inputs and UI/presentation.
- 4J: export, route search, editor, milestone.
- 4K: terminal destruction and final legacy purge.

Compatibility code must not be added to improve the intentionally reduced product smoke count.

## 35. Implementation Sequence

1. Domain keys, semantic errors, and immutable plain-data utilities.
2. DomainRegistry staged registrations and availability.
3. Provider registration identities and lease/removal preflight.
4. Application semantic root and EntryStore.
5. Create/update/visibility/delete transactions and subscriptions.
6. PluginContext and caller-facing generic semantic facades.
7. Minimal GPX provider.
8. Minimal Photo provider and private preview ownership.
9. Lazy built-in metadata and allowlist update.
10. Point-of-no-return legacy state/boot cutover.
11. Contract, integration, smoke, and forbidden-pattern validation.

This may be implemented through bounded checkpoints, but later checkpoints must extend rather than replace the foundation contracts.

## 36. Expected Files

Expected additions include:

```text
src/domains/identity.js
src/domains/registry.js
src/domains/errors.js
src/entries/store.js
src/entries/errors.js
src/plugins/domains/gpx.js
src/plugins/domains/photo.js
tests/domain-registry.test.js
tests/entry-store.test.js
tests/gpx-domain.test.js
tests/photo-domain.test.js
tests/smoke/phase-4d.spec.js
samples/phase-4d/index.html
```

Modify application composition, built-in catalog, migration allowlist, PluginContext integration, public exports, and applicable GPX normalization. Delete `src/core/state.js`; delete or reduce `src/core/boot.js` to domain-neutral composition.

## 37. Forbidden Patterns

After the final Phase 4D cutover, active production paths must be clean for:

```text
app.state
app.core
core.state
state.entries
state.sources
state.layers
entry.source
entry.presentation
entry.layer
entry.interactions
addGpxSource
updateGpxSource
updatePhotoTimeMode
buildGpxOverlay
buildPhotoOverlay
subscribeInteractions
```

Matches in disconnected legacy files are permitted only until their scheduled deletion and must remain unreachable from enabled composition.

## 38. Explicit Non-Goals

Do not implement SelectionStore, semantic selection, renderers, RenderingCoordinator, RenderGeneration, Leaflet rendering, physical interaction, popups, presentation anchors, elevation, standard input UI, Photo-from-GPX inference, full domain UI APIs, export, route search, editor, milestone, or final Phase 4K destruction orchestration.

## 39. Architecture Invariant Checklist

- EntryStore is the sole generic semantic entry authority after cutover.
- Providers are semantic authorities and contain no Leaflet resources.
- Headless entries are valid.
- Every preparing/live entry holds one exact-registration lease.
- Provider authority cannot disappear beneath an entry.
- Snapshots are externally deeply immutable.
- Revision covers domain data and persistent domain-owned presentation only.
- Whole-entry visibility, selection, rendering, and resources use separate state/lifetimes.
- Creator uninstall does not delete committed entries.
- Entry deletion releases resources deterministically and the provider lease last.
- No old/new state synchronization, generic event bus, universal registry, or ownership transfer exists.
- Optional domains remain lazy.

## 40. Risks and Edge Cases

- Uninstall must preflight leases before Scope death.
- IDs must be reserved before asynchronous preparation.
- Creation-to-entry lease conversion must have no gap.
- Cleanup-failed entries remain absent but retain necessary leases.
- A replacement provider must not adopt old-registration instances.
- Deep immutability must reject mutable browser/runtime values in public snapshots.
- Reentrant notifications must not interleave transactions.
- Domain presentation must not be confused with either document data or generic visibility.
- Preview ownership must not leak browser handles into portable snapshots.

## 41. Questions or Contradictions Discovered

No architecture contradiction was found. The apparent semantic/presentation conflict is resolved by the normative definition of semantic revision as covering both domain semantic and domain-presentation state. The Photo preview URL is an entry-owned resource, not semantic snapshot content.

## 42. Completion Criteria and Recommendation

Phase 4D is complete when DomainRegistry, provider leases, EntryStore, minimal lazy GPX/Photo providers, typed facades, authority cutover, contract tests, and headless smoke validation all satisfy this plan; active legacy semantic authority is absent; and required unit/smoke/diff/search checks pass.

Implementation can begin. The architecture, state classification, revision rules, provider lifetime, ownership topology, transactions, resource treatment, and phase boundaries are decision-complete.
