# Tilia Plugin Architecture Migration Plan

## 1. Purpose and Authority

This document is the authoritative implementation roadmap for replacing Tilia's current plugin architecture with the target defined by `plugin-architecture/ARCHITECTURE.md`.

It defines implementation order, authority cutovers, permitted temporary feature loss, legacy deletion, verification gates, and phase completion. It does not define line-by-line coding tasks or override the target architecture.

Implementation phases begin at Phase 4 because Phases 0–3 established principles, inventory, architecture, and migration dependencies.

The plan contains eleven implementation phases:

1. Phase 4A — Ownership Kernel
2. Phase 4B — Plugin Runtime and Guarded Context
3. Phase 4C — Typed Extension Foundations
4. Phase 4D — Semantic Core
5. Phase 4E — Selection Foundation
6. Phase 4F — Rendering and Interaction Foundation
7. Phase 4G — Photo Vertical Slice
8. Phase 4H — GPX Vertical Slice
9. Phase 4I — Standard UI and Presentation
10. Phase 4J — Complex Plugin Migration
11. Phase 4K — Lifecycle Closure and Legacy Purge

These boundaries are architectural review units. They do not prescribe an arbitrary number of commits within a phase.

## 2. Inputs and Precedence

When documents differ, use this precedence:

```text
ARCHITECTURE.md
        ↓
phase-3/MIGRATION-ANALYSIS.md
        ↓
Phase 2 design reports
        ↓
PHASE-1-INVENTORY.md
        ↓
DESIGN.md
```

- `ARCHITECTURE.md` defines required target contracts and invariants.
- `MIGRATION-ANALYSIS.md` defines current source dependencies, knots, reusable logic, and safe cutovers.
- Phase 2 reports provide rationale and alternatives.
- Phase 1 and Phase 0 describe the old factual baseline and original principles.

No contradiction between the authoritative architecture and migration analysis requires resolution before implementation.

## 3. Migration Principles

1. **One authority at every cutover.** Old and new entry, selection, rendering, or registration systems MUST NOT be synchronized as coequal authorities.
2. **Direct replacement.** Temporary feature absence is preferable to a permanent old-app facade, mutable entry adapter, or raw-layer bridge.
3. **Foundations may exist unused before cutover.** Unit-tested target infrastructure may coexist with legacy code only while it has no production authority.
4. **Authority deletion is immediate.** Once a target subsystem becomes authoritative, its obsolete predecessor is removed or disconnected in the same phase.
5. **Intermediate phases need not be releasable.** They MUST remain coherent, testable, and explicit about unavailable features.
6. **Behavior and architecture are tested separately.** Domain/product behavior remains protected; obsolete internal-shape tests may be replaced.
7. **No architectural exceptions by convenience.** A genuine contradiction stops the affected work until architecture documentation is deliberately resolved.
8. **No target renderer resources enter legacy APIs.** RenderGeneration remains private from its first implementation.
9. **PartiallyEditablePolyline remains external.** Its internals MUST NOT be modified during migration.
10. **No calendar estimates.** Phase gates are objective technical conditions, not dates.

## 4. Approved Migration Strategy

The migration uses foundation-first implementation, coordinated authority cutovers, and domain vertical validation:

```text
Ownership kernel
      ↓
PluginRuntime + guarded PluginContext
      ↓
typed registries + MapFacade + foundational host primitives
      ↓
DomainRegistry/provider leases + EntryStore + minimal providers
      ↓
SelectionStore
      ↓
renderer/coordinator/generation + interaction host
      ↓
Photo vertical slice
      ↓
GPX vertical slice + Photo/GPX inference restoration
      ↓
standard UI/presentation
      ↓
export -> route search -> track editor -> milestone
      ↓
complete app.destroy + allowlist removal + legacy purge
```

Selection is deliberately separated from the semantic-core phase. It is an independent authority cutover with distinct invariants and tests. EntryStore and domain references are prerequisites; rendering consumes SelectionStore later but does not own it. Popup presentation may temporarily disappear after the selection cutover.

PluginRuntime and PluginContext are grouped in one phase because changing runtime authority while continuing to pass the broad mutable `app` would preserve the principal escape hatch and create an artificial intermediate contract. Internal runtime work may be committed in reviewable steps, but the production cutover is one phase gate.

Typed contribution infrastructure and minimal host/mount primitives belong to Phase 4C. Product-specific layers/settings/elevation hosts and adapters belong to Phase 4I. InputRegistry lands in 4C; domain handlers migrate with their Photo/GPX slices, while transport UI migrates in 4I.

GPX export migrates in 4J because it is a consumer of stable GPX snapshots and UI contributions, not part of the GPX provider's semantic authority. Interaction Hub is disconnected from production when old entries disappear in 4D and deleted in 4H after GPX generation bindings prove its replacement. It is never fed target generations.

## 5. Final Implementation Dependency Graph

### 5.1 Strict prerequisites and independent work

```text
Phase 4A Scope/ownership
  |
  +--> Phase 4B Runtime + PluginContext
          |
          +--> Phase 4C registries/resources/MapFacade/host primitives
                  |
                  +--> Phase 4D DomainRegistry + EntryStore + providers
                          |
                          +--> Phase 4E SelectionStore
                          |
                          +--> Phase 4F rendering foundation
                                   ^
                                   |
                         Phase 4E interaction intent target
                                   |
                                   +--> Phase 4G Photo slice
                                   +--> Phase 4H GPX slice
                                              |
                                              +--> Photo-from-GPX inference
                                              +--> Phase 4I product UI
                                              +--> Phase 4J complex consumers
                                                         |
                                                         +--> Phase 4K closure
```

The ownership kernel strictly precedes every owned target mechanism. Runtime and context precede plugin-published target contracts. EntryStore requires DomainRegistry and provider leases. Selection requires committed entries and domain reference adapters. Rendering requires scopes, EntryStore, domain snapshots, MapFacade, and the semantic intent target. Photo and GPX require all those foundations.

Within these constraints, some work may be developed independently before its authority cutover:

- runtime dependency planner and Scope internals;
- ServiceRegistry, InputRegistry, contribution store, MapFacade, and host primitives after 4A;
- Photo and GPX stable domain-algorithm adapters after provider contracts are defined;
- UI host rendering mechanics after contribution contracts exist;
- preserved editor/route domain tests throughout the migration.

Independent development MUST NOT create a second production authority.

### 5.2 Authority cutover order

```text
plugin lifecycle/context (4B)
  -> extension publication/resources (4C)
  -> semantic entries/domains (4D)
  -> selection (4E)
  -> primary map rendering/physical interaction (4F–4H)
  -> product UI/presentation (4I)
  -> external consumers (4J)
  -> complete app lifetime (4K)
```

### 5.3 Critical path

```text
4A -> 4B -> 4C -> 4D -> 4E -> 4F -> 4G -> 4H -> 4I -> 4J -> 4K
```

Some implementation and tests can overlap conceptually, but no later phase may declare completion before its strict prerequisites meet their gates.

## 6. Phase Overview

| Phase | Authority gained | Major legacy authority removed | Product state allowed at exit |
|---|---|---|---|
| 4A | ownership primitives for target code | none | current product unchanged |
| 4B | PluginRuntime and PluginContext | old `use/unuse`, broad setup `app`, eager built-ins, auto-services | reduced plugin allowlist |
| 4C | typed extensions/resources/map facade | mutable services/registry paths for migrated composition | shell/status/base-map validation |
| 4D | DomainRegistry and EntryStore | `app.state`, legacy `core/state.js`, semantic boot authority | headless entries; many features absent |
| 4E | SelectionStore | Selection Hub and popup-owned selection | semantic selection without popup allowed |
| 4F | target rendering/interaction infrastructure | no target use of legacy rendering; remaining old renderer disconnected | fake/headless renderer validation |
| 4G | Photo end-to-end | old Photo boot/map/UI branches | GPS Photo flow restored; no GPX inference yet |
| 4H | GPX end-to-end | old GPX overlay bookkeeping and Interaction Hub | main GPX viewer semantics/rendering restored |
| 4I | standard UI/presentation | `refreshView`, domain branches in generic UI | normal built-ins and UI restored |
| 4J | public-contract complex plugins | external mutable-core/internal/raw-layer integration | export/route/editor/milestone restored |
| 4K | complete terminal app lifecycle | allowlist and all residual legacy code | full migrated product |

## 7. Phase 4A — Ownership Kernel

### Goal

Implement the ownership foundation required by every later target subsystem.

### Why this phase exists

Scope hierarchy, liveness, cancellation, staging, and deterministic cleanup are prerequisites for safe plugin setup, registrations, entries, generations, UI mounts, tasks, and destruction. Keeping this phase domain-free makes failures local and synthetic tests exhaustive.

### Prerequisites

None beyond the current toolchain and test environment.

### Target architecture responsibilities

- hierarchical scopes and child scopes;
- scope state and `AbortSignal` propagation;
- immediate disposable records;
- staged-registration record protocol;
- tracked async work with optional cancellation/settlement;
- reverse child and LIFO local cleanup;
- setup-cleanup ordering support;
- best-effort aggregate failure reporting;
- retry-safe versus terminal failed records;
- liveness/callback guards;
- cleanup-failed state data needed by runtime quarantine.

### Implementation scope

Introduce internal ownership modules and constrained scope handles. Provide generic `defer`, child, task tracking, liveness assertion, commit/abort support, early disposal handles, and diagnostics. Provide test-only fake staged registrations. Do not yet migrate product resources broadly.

### Authority before

Individual functions and plugins manually retain cleanup callbacks. No common authority exists.

### Authority after

The ownership kernel is authoritative for every newly implemented target resource. Legacy product code may still use manual cleanup until its owning subsystem migrates; no legacy subsystem is retrofitted merely to preserve it.

### Allowed temporary feature loss

None required. The kernel may initially be unused by production composition.

### Legacy code removed

None required. Remove only superseded experimental ownership helpers if introduced during the phase.

### Temporary scaffolding

None. Test fakes are permanent test infrastructure, not product bridges.

### Required tests

**New contract tests**

- state transitions, commit once, close once, and idempotent disposal;
- child creation/early close/parent propagation and reverse order;
- cancellation before child/local cleanup;
- awaitable/non-awaitable task handling;
- LIFO local records and setup-cleanup placement;
- one cleanup failure not stopping later records;
- successful records never rerun;
- retry only explicitly retry-safe residuals;
- stale callback/API rejection after close;
- app-style abort during pending async work;
- staged record discard/commit/dispose primitives.

**Preserved behavior tests**

None are migrated yet. Existing full unit/smoke baseline should remain green because production behavior is untouched.

**Integration/smoke tests**

Current complete suite remains expected at this phase.

Old tests deleted/rewritten: none.

### Completion criteria

- all ownership contract tests pass;
- cleanup ordering and failure aggregation are deterministic;
- no domain, plugin, DOM, or Leaflet knowledge exists in the kernel;
- no public transfer/detach primitive exists;
- `git diff --check` passes and existing product tests remain green.

### Architecture invariants at risk

Single ownership, child lifetime, authority revocation before cleanup, LIFO cleanup, retry safety, and best-effort failure isolation.

### Explicit non-goals

Plugin resolution, product PluginContext, typed registries, entry/domain state, map helpers, rendering, UI, and app destruction orchestration.

## 8. Phase 4B — Plugin Runtime and Guarded Context

### Goal

Replace the current plugin lifecycle with the target graph-aware runtime and make guarded PluginContext the sole plugin setup contract.

### Why this phase exists

Runtime and context form one authority boundary. Leaving setup on broad mutable `app` after runtime replacement would permit every later ownership and liveness rule to be bypassed.

### Prerequisites

Phase 4A ownership kernel.

### Target architecture responsibilities

- lazy literal built-in loaders and explicit external descriptor/catalog resolution;
- descriptor validation and stable IDs;
- full dependency graph planning and cycle diagnostics;
- deterministic dependency-first setup;
- installed/pending/tearing-down/quarantine states;
- concurrent `use()` deduplication;
- per-plugin scopes and guarded context construction;
- transactional setup and staged registration batch hook;
- rollback and cleanup-failed quarantine;
- dependent uninstall rejection;
- dependencies remaining until explicit removal;
- runtime terminal/destroying state skeleton;
- explicit cleanup result, never automatic service publication.

### Implementation scope

Replace plugin resolution, `use`, `unuse`, pending/installed records, and built-in registration in `src/app.js`/`src/builtins.js` or successor modules. Introduce the target PluginContext shell whose capabilities are initially limited to scope, diagnostics, and foundations implemented so far. Introduce the temporary migrated-plugin composition allowlist.

### Authority before

`createTiliaApp()` owns eager built-ins, convention loading, validation-only dependencies, broad setup `app`, mutable plugin/service maps, and manual `destroy()` extraction.

### Authority after

PluginRuntime owns every plugin lifecycle transition; PluginContext is the only supported setup capability surface. The broad plugin `app` contract ends in this phase.

### Allowed temporary feature loss

All unmigrated built-ins and external plugins may be disabled. Application composition may contain only synthetic/test plugins and the first migrated simple plugin once available.

### Legacy code removed

- convention-based default external path discovery;
- eager built-in implementation descriptor imports;
- validation-only dependency loop;
- broad `setup(app, options)` invocation;
- setup-result auto-service publication;
- `{destroy()}` lifecycle inference;
- descriptor stylesheet processing;
- mutable public plugin map as lifecycle authority.

### Temporary scaffolding

**Migrated-plugin composition allowlist**

- Purpose: enable only plugins already converted to PluginContext.
- Authority: PluginRuntime remains sole lifecycle authority; the list performs no state translation.
- Lifetime: Phase 4B through Phase 4K.
- Removal: Phase 4K after all intended plugins migrate.

### Required tests

**New contract tests**

- built-in lazy loader not invoked until requested;
- external object and explicit catalog resolution;
- invalid/duplicate IDs and descriptor shapes;
- recursive dependencies, shared dependencies, stable order, missing dependencies;
- direct/indirect cycles rejected before setup;
- concurrent same-ID use shares result/failure;
- setup staging invisible until commit;
- rollback, quarantine, retry-safe cleanup;
- dependency uninstall protection and idempotent unuse;
- use/unuse during pending/teardown;
- context liveness and reentrant lifecycle rejection;
- setup result cleanup validation;
- destruction start rejects new operations and pending setup cannot commit.

**Preserved behavior tests**

Rewrite current plugin lifecycle tests for target semantics; retain ID, async setup, duplicate/pending, and cleanup outcomes where applicable.

**Integration/smoke tests**

Only a shell/runtime boot smoke is required. The existing 28 product smoke tests may intentionally fail or be skipped under the documented allowlist.

Old tests may delete expectations for auto-services, `{destroy()}`, descriptor stylesheets, convention loading, and validation-only dependencies.

### Completion criteria

- new runtime/context contract tests pass;
- no production plugin setup receives the broad app object;
- built-in registry contains loaders only and importing runtime does not eagerly import implementations;
- source searches show no target runtime path using `normalizePluginStylesheets`, auto-publication, or old dependency validation;
- allowlist tests enumerate every intentionally enabled and disabled plugin;
- runtime authority is singular.

### Architecture invariants at risk

No half-installed state, deterministic dependencies, one live instance per ID, transactional setup, liveness revocation, dependency protection, and truthful quarantine.

### Explicit non-goals

Complete service/input/contribution APIs, semantic entries, real domain plugins, renderer/UI restoration, and complete `app.destroy()` cleanup of resource categories not yet migrated.

## 9. Phase 4C — Typed Extension Foundations

### Goal

Provide the scoped, typed extension and map-resource capabilities required by domains and product plugins.

### Why this phase exists

Entry/domain and renderer phases need owned registries, guarded facades, resources, and map access. These mechanisms can be validated independently using simple plugins and must not be hidden inside domain migration.

### Prerequisites

Phases 4A–4B.

### Target architecture responsibilities

- internal owned registration store;
- ServiceRegistry with guarded explicit facades;
- target InputRegistry registration/metadata/priority/conflict/dispatch foundation;
- contribution store with typed point validators and deterministic ordering;
- typed subscription delivery primitive;
- stylesheet/shared-resource leases;
- MapFacade listener/layer/control/viewport/pane ownership and advanced escape hatch;
- foundational surface/mount child primitives;
- owned base-map catalog registration boundary;
- post-commit notification isolation.

These remain distinct public concepts even if internal machinery is shared. There is no universal public registry, Capability Registry, command bus, or global event bus.

### Implementation scope

Implement the registries/facades and connect them to PluginContext. Migrate `tilia-status` as the first explicit service/control plugin. Migrate base-map providers/catalog/selector sufficiently to validate owned multi-provider contributions and application infrastructure. Migrate panel shell service/mount ownership only if needed for foundational host validation; product panels remain later.

### Authority before

Mutable `app.services`, append-only input registry, irreversible base-map definitions, permanent stylesheet links, direct map/control helpers, and ad hoc surface manager handles.

### Authority after

Target typed registries and scoped resource managers are authoritative for migrated composition. MapFacade is the supported map effect path; advanced raw map access is explicit and caller-owned.

### Allowed temporary feature loss

Domain imports, layers/settings/elevation, file/drop/URL/query UI, and external plugins may remain disabled. Shell/status/base-map behavior should be available for validation.

### Legacy code removed

- mutable service object and `provide()` from migrated composition;
- old stylesheet insertion path;
- old base-map provider registration without owned removal;
- direct control/resource helpers as PluginContext surface;
- old input registry once no enabled plugin depends on it; otherwise disconnect it here and delete its file in 4D.

### Temporary scaffolding

The Phase 4B composition allowlist remains. No data or registry bridge is added.

### Required tests

**New contract tests**

- staging/preflight/atomic publication across registry categories;
- single-provider service conflicts and guarded provider/consumer liveness;
- optional/required service behavior;
- input IDs, priority winner, tied conflict, matcher isolation, metadata snapshots;
- contribution group/rank/item ordering independent of install order;
- registration/mount removal and callback isolation;
- stylesheet shared leases/conflicts/removal;
- MapFacade listener/layer/control/pane cleanup and caller-owned map preservation;
- raw escape-hatch effects remain caller-owned;
- base-map definition removal and selection consistency.

**Preserved behavior tests**

Adapt status, base-map, controls, surfaces, and input-registry conceptual tests. Preserve visible status and base-map selection behavior.

**Integration/smoke tests**

Restore shell/base-map-selector smoke and a status integration smoke. Other smoke groups may remain unavailable.

Delete tests for mutable service overwrite, append-only first-match input, permanent styles, and installation-order contribution behavior.

### Completion criteria

- migrated plugins use typed PluginContext capabilities only;
- registration commit remains callback-free and notification errors are isolated;
- contribution order is deterministic;
- MapFacade owns every normal migrated map effect;
- status and base-map validation plugins install/uninstall cleanly;
- no universal public registry exists;
- shell/base-map smoke milestone passes.

### Architecture invariants at risk

Distinct extension semantics, staged visibility, guarded handles, deterministic ordering, shared-resource leases, caller-owned infrastructure, and no ambient mutable map/core authority.

### Explicit non-goals

EntryStore, domain provider leases, product input handlers, selection, render generations, product layers/settings/elevation hosts, and complex plugins.

## 10. Phase 4D — Semantic Core

### Goal

Make DomainRegistry and EntryStore the sole semantic entry authority and introduce minimum headless GPX and Photo providers.

### Why this phase exists

Persistent application data, provider lifetime, identity, visibility, revision, and removal must be coherent before selection or rendering. Combining SelectionStore here would enlarge the authority cut and obscure separate invariants, so selection is Phase 4E.

### Prerequisites

Phases 4A–4C.

### Target architecture responsibilities

- DomainRegistry single-provider registration and guarded public/private split;
- provider entry/creation leases and uninstall diagnostics;
- app-owned EntryStore and entry scopes;
- never-reused IDs and `{id, domain, visible}` snapshots;
- semantic/domain revision ownership;
- domain creation transaction and typed entry/domain changes;
- whole-entry visibility, lookup/list/remove/clear;
- removal authority revocation and residual cleanup tracking;
- provider-aware teardown ordering foundation;
- minimum GPX and Photo provider contracts with no Leaflet resources.

### Implementation scope

Implement DomainRegistry/leases and EntryStore. Extract minimal provider implementations using stable existing algorithms:

- GPX: normalize/create, immutable semantic snapshot, extent/geometry data needed later, revision/change foundation, disposal, future selection/renderer input, serialization-compatible snapshot.
- Photo: normalized semantic snapshot, entry-scoped preview resource ownership, time-mode semantic state, revision/change foundation, disposal, future selection/renderer input.

Inputs may use test-only/domain creation calls; product transports need not yet be restored. `boot.js` loses semantic authority and becomes thin composition or is replaced.

### Authority before

`core/state.js`, mutable entries, parallel sources/layers, and semantic methods in `core/boot.js`.

### Authority after

EntryStore is the sole generic entry authority; DomainProviders are the sole domain semantic authorities. Entries are deliberately headless until target renderers arrive.

### Allowed temporary feature loss

Map rendering, map interactions, popup, layers/settings/elevation, file/drop/URL/query workflows, Photo-from-GPX inference, and complex plugins may be absent. Headless semantic operations and tests must work.

### Legacy code removed

- public `app.state` and `core.state` entry authority;
- legacy `core/state.js` representation and parallel `entries/sources/layers` helpers;
- mutable generic `entry.source`, `entry.presentation`, `entry.layer`, and `entry.interactions` fields;
- generic/core GPX and Photo semantic branches and creation/mutation methods in `boot.js`;
- permanent core GPX/JPEG handler registration and old registry/context if still present;
- old public `addGpxSource`, Photo time-mode, GPX visibility, and generic entry methods on `app.core`.

Old rendering modules may remain physically present but are disconnected and receive no target entries.

### Temporary scaffolding

The composition allowlist remains. Headless domains are permanent target behavior, not a bridge. No state mirror or mutable entry adapter is allowed.

### Required tests

**New contract tests**

- domain registration conflict/staging/liveness;
- creation and live-entry provider leases;
- provider removal blocked with entry diagnostics;
- app-owned entry IDs, gaps, no reuse, immutable domain association;
- creation rollback and destination-scope cleanup;
- minimal envelope/list/lookup;
- whole visibility notifications without semantic revision increment;
- domain mutation revision increments and typed descriptors;
- remove authority revocation, reverse clear order, cleanup residual behavior;
- provider retained through entry disposal;
- headless entry validity.

**Preserved behavior tests**

Reuse/adapt GPX normalization/parsing/interpretation/serialization and Photo time/inference-independent semantic tests. Preserve current ID monotonicity, creation failure, visibility, removal, and cleanup outcomes without old shapes.

**Integration/smoke tests**

Headless GPX/Photo creation integration is required. Product map smoke tests may intentionally remain unavailable; shell/base-map smoke from 4C remains.

Delete/replace `state.test.js` and `boot.test.js` assertions for mutable entries, parallel arrays, `entry.layer/interactions/source`, and boot-owned domains.

### Completion criteria

- EntryStore and DomainRegistry/provider leases are authoritative;
- source searches in production paths find no `app.state`, `core.state.entries`, `state.sources`, `state.layers`, `entry.source`, `entry.layer`, or `entry.interactions` access;
- generic entry snapshots have only target generic fields;
- providers contain no Leaflet imports/resources;
- headless domain tests pass;
- disabled feature inventory is explicit in the allowlist.

### Architecture invariants at risk

Application entry ownership, never-reused identity, domain-neutral core, provider leases, semantic revision, semantic/render separation, and truthful removal after cleanup failure.

### Explicit non-goals

Selection authority, real rendering, physical interaction, popup/UI restoration, full domain UI APIs, and complex plugin migration.

## 11. Phase 4E — Selection Foundation

### Goal

Make SelectionStore the sole semantic selection authority using domain-qualified immutable references.

### Why this phase exists

Selection can be implemented and tested headlessly, has independent reentrancy/removal/reconciliation invariants, and is consumed by rendering rather than owned by it. Its cutover intentionally removes old popup-coupled selection before presentation is restored.

### Prerequisites

Phase 4D EntryStore, DomainRegistry, minimum provider APIs, semantic revisions, and typed mutations.

### Target architecture responsibilities

- zero-or-one immutable `{entryId, domain, ref}` selection;
- domain ref validation/canonicalization/equality/resolution;
- `unchanged/refreshed/remapped/invalid` reconciliation;
- serialized selection updates and reentrant queueing;
- change-only typed subscriptions and reasons;
- entry removal/app destruction invalidation;
- hidden entry/target selection persistence;
- no popup, renderer, DOM, chart, hover, or editor draft state.

### Implementation scope

Implement SelectionStore and minimum GPX/Photo selection adapters sufficient for provider unit tests. Integrate selection reconciliation into domain mutation transactions and selection clear into EntryStore removal ordering.

### Authority before

Legacy Selection Hub stores mutable entry/domain payloads and Leaflet popup state.

### Authority after

SelectionStore is the only application semantic selection authority. UI/renderers may later request/observe it but never own it.

### Allowed temporary feature loss

Popup/highlight and map-click selection may be absent. Programmatic/domain-test selection must work. Popup close behavior is intentionally unavailable until the presenter phase.

### Legacy code removed

- `src/core/selection-hub.js` and its combined state/popup authority;
- domain-specific `selectTrackPoint/selectWaypoint/selectPhoto` core methods;
- popup-close-clears-selection behavior;
- mutable entry/domain selection payloads.

Popup formatting helpers may remain unreferenced until moved to domain UI adapters in 4G/4H, but no selection code may import them.

### Temporary scaffolding

None. Selection is allowed to have no visual presenter. It is not synchronized with the old hub.

### Required tests

**New contract tests**

- initial null/select/replace/equal no-op/clear;
- unknown entry, domain mismatch, invalid ref rejection;
- immutable descriptors and current synchronous resolution;
- reconciliation outcomes and revision-scoped refs;
- hidden selection persistence;
- entry removal ordering and app destruction clear;
- subscription snapshot protocol, reasons, isolation, unsubscribe;
- reentrant select/clear queue behavior;
- provider failure/invariant handling.

**Preserved behavior tests**

Adapt meaningful single-selection, entry invalidation, nearest-target identity, and reentrant transition coverage. Popup behavior moves to later presenter tests.

**Integration/smoke tests**

Headless domain selection integration required. Map popup/selection smoke tests may remain disabled.

Delete old tests asserting popup ownership, popup-close clear, immediate replay, mutable entry payloads, or Leaflet coupling.

### Completion criteria

- SelectionStore is singular authority and old hub source is deleted;
- no selection snapshot contains mutable domain/render/presentation objects;
- every mutation affecting current selection returns and applies reconciliation;
- hiding does not clear selection;
- no SelectionStore module imports Leaflet or DOM code;
- all new contract tests pass.

### Architecture invariants at risk

Semantic identity, domain-only ref interpretation, selection/render independence, entry-removal ordering, notification commit order, and reentrancy serialization.

### Explicit non-goals

Physical interaction bindings, popup/highlight, renderer anchor resolution, elevation/tree presentation, and editor-local selection migration.

## 12. Phase 4F — Rendering and Interaction Foundation

### Goal

Implement the generic target rendering lifecycle and physical-to-semantic interaction infrastructure, validated with fake domains/renderers.

### Why this phase exists

Renderer registry, controllers, generation currency, replacement, interaction liveness, and failure semantics form one coherent ownership boundary. Splitting production interaction from RenderGeneration would recreate raw-layer publication.

### Prerequisites

Phases 4A–4E, especially EntryStore/domain snapshots, SelectionStore intent target, and MapFacade.

### Target architecture responsibilities

- DomainRendererRegistry with one optional renderer per domain;
- RenderingCoordinator and one controller per committed entry;
- RenderGeneration destination scopes and tokens;
- semantic revision/generation currency checks;
- initial build and replacement transaction;
- safe in-generation update contract;
- availability `unavailable/building/active/failed`;
- renderer dynamic install/remove/reinstall;
- stale async supersession and callback rejection;
- generic visibility forwarding/attachment;
- pane bands/private leases;
- modal/object/background interaction host;
- generation-owned physical bindings producing semantic intent;
- immutable anchor/bounds/status and controlled highlight contract;
- generation cleanup and error isolation.

### Implementation scope

Build infrastructure modules and fake renderer fixtures. Integrate controllers with EntryStore lifecycle/domain changes/visibility and SelectionStore requests. Establish app rendering/presentation status subscriptions. No real GPX/Photo Leaflet implementation is required yet.

### Authority before

Old rendering was disconnected at semantic cutover; no current target primary renderer exists. Legacy files may remain but are not authoritative.

### Authority after

RenderingCoordinator/DomainRendererRegistry/RenderGeneration are the only supported target primary-rendering path. Physical object interaction must use generation bindings; no target resource is public.

### Allowed temporary feature loss

Real GPX/Photo map rendering, popup, product layers/elevation, and external overlays may remain absent. Fake renderer integration and headless entries are sufficient.

### Legacy code removed

Any still-connected boot-level layer attachment, selection binder, `_tilia*Bound` flag, or generic raw-layer publication path. Old domain overlay builder files may remain as source material until 4G/4H but cannot be imported by generic infrastructure.

### Temporary scaffolding

Fake domain renderer and map resources exist only in tests. The composition allowlist remains. No legacy renderer adapter or Interaction Hub publication is permitted.

### Required tests

**New contract tests**

- committed entry with no renderer and late renderer install;
- initial build success/failure without semantic rollback;
- replacement build/preflight/mount/switch/disposal ordering;
- retain prior generation only when semantically current;
- stale visual fallback non-interactive/non-resolvable;
- async build supersession and entry removal during pending build;
- renderer removal/reinstall with entries retained;
- whole visibility in-place attachment without semantic revision;
- domain revision stale checks and validated in-place advancement;
- token/liveness rejection of late callbacks;
- interaction tier arbitration and duplicate primary conflict;
- generation cleanup of layers/listeners/tasks/panes/bindings;
- immutable presentation resolution and scoped highlight;
- notification errors do not roll back generation commit.

**Preserved behavior tests**

Adapt generic replacement-failure and visibility lifecycle concepts from boot/layers tests, without asserting concrete domain layers.

**Integration/smoke tests**

Fake renderer integration is required. Real map product smoke tests remain optional/disabled.

Old tests for raw Interaction Hub/entry layer publication are not ported to target infrastructure.

### Completion criteria

- fake renderer covers every availability/failure/replacement path;
- render failure never removes or reverses a semantic entry;
- target generations are private and absent from EntrySnapshot/domain public APIs;
- no generic rendering module imports GPX/Photo code;
- no target path imports or publishes through Interaction Hub;
- stale async/listener tests pass.

### Architecture invariants at risk

One generation owner, no half-published generation, semantic/render transaction independence, currentness checks, interaction authority withdrawal, and no foreign layers.

### Explicit non-goals

Real Photo/GPX styling, popup DOM, product UI, milestone/elevation/editor overlays, and final performance tuning.

## 13. Phase 4G — Photo Vertical Slice

### Goal

Deliver the first complete target-architecture domain from lazy JPEG input through semantic entry, rendering, selection, popup/settings/tree presentation, uninstall, and cleanup.

### Why this phase exists

Photo is the lowest-complexity real visual slice that still exercises optional module loading, provider leases, object URL ownership, semantic revision, generation replacement, presentation separation, and dynamic removal.

### Prerequisites

Phases 4A–4F plus minimal typed UI host/presenter primitives from 4C/4F.

### Target architecture responsibilities

- lazy Photo domain and JPEG/EXIF input roles;
- Photo provider creation/snapshots/time mode/revision/selection refs;
- entry-scoped preview URL;
- Photo renderer and one-marker generation;
- replacement on coordinate/time-mode changes;
- generation interaction selecting semantic Photo ref;
- map-selection popup adapter/presenter and highlight as applicable;
- layers fallback/Photo adapter and settings contribution;
- handler/provider/renderer/UI removal semantics;
- GPX-only composition not importing EXIF.

### Implementation scope

Move Photo/EXIF behavior out of core and shared map/UI modules. Use GPS-tagged Photo import as the first visual path. Implement Photo input registration metadata and integrate file input transport minimally if needed for the visual smoke. Normalize EXIF data before provider creation; provider creates persistent preview URL inside entry scope.

The 2026-10-07 review approves only two supporting generic contract amendments for this slice: permanent `PresentationHandle.signal` invalidation and optional domain-create `options.signal` cancellation at the publication boundary. Their consolidated definitions and historical boundaries are in the [contract-amendment record](phase-4/PHASE-4G-CONTRACT-AMENDMENTS.md); [ARCHITECTURE.md](ARCHITECTURE.md) §§33/40 retain the current normative requirements, and the [Phase 4G plan](phase-4/PHASE-4G-IMPLEMENTATION-PLAN.md) records future work. Both amendments are approved, implementation pending; neither is already provided by the accepted Phase 4F implementation. The minimum Photo popup/presentation, settings/tree contribution, and JPEG input remain required here. Settings expose only the accepted per-Photo `auto`/`local`/`utc` preference. Global defaults/custom offsets and broader standard UI remain in 4I, Photo-from-GPX inference remains in 4H, and public application destruction remains in 4K. RenderingCoordinator and SelectionStore are consumed without redesign.

### Authority before

Target Photo provider exists minimally/headlessly; no production Photo input/render/presentation is complete. Legacy Photo paths are disconnected.

### Authority after

Photo DomainProvider, renderer, input handler, SelectionStore adapter, and Photo presentation contributions are the sole Photo authorities.

### Allowed temporary feature loss

Photo location inference from GPX is explicitly deferred until Phase 4H because no complete target GPX semantic capability yet exists. GPX viewer and most standard UI may remain unavailable.

### Legacy code removed

- Photo/JPEG/EXIF imports and handlers from generic core/boot;
- old `buildPhotoOverlay` path and Photo `entry.interactions` logic;
- Photo branches in old Selection Hub/shared popup authority;
- Photo branches in generic layers/settings implementation;
- core-owned Photo preview URL cleanup;
- Photo feature CSS from global core stylesheet where replacement style lease exists.

### Temporary scaffolding

The composition allowlist enables the Photo slice and only required migrated dependencies. GPS-only test fixtures temporarily define supported Photo integration; the GPX-inference omission is documented and removed in 4H.

### Required tests

**New contract tests**

- Photo modules/EXIF lazy loader not requested in GPX-only composition;
- JPEG handler metadata/priority and scoped parsing;
- provider lease and provider-removal rejection;
- preview URL created/revoked on failure/removal/destroy;
- semantic revision for time mode, not whole visibility;
- initial marker generation, anchor/bounds, click semantic selection;
- time-mode generation replacement and stale callback rejection;
- initial/replacement render failure leaves semantic entry committed;
- renderer uninstall/reinstall while entry remains;
- popup close independent of selection;
- settings/tree contribution dynamic add/remove;
- input/UI/renderer removal versus provider removal with live entry.

**Preserved behavior tests**

Adapt Photo parsing, GPS marker, time-mode, thumbnail/popup/settings, visibility, removal, and cleanup behavior. GPX inference tests remain preserved but marked pending restoration in 4H rather than deleted.

**Integration/smoke tests**

Restore GPS Photo import, Photo marker, Photo selection/popup, and Photo settings smoke milestones. The current inference smoke is allowed to remain disabled.

Replace old boot/layers/selection tests with provider/renderer/presenter contract tests.

### Completion criteria

- GPS-tagged Photo works end to end solely through target contracts;
- unused Photo does not load EXIF implementation;
- no generic core/UI module contains Photo branches;
- provider/renderer/UI lifetimes are independently tested;
- all Photo-owned resources clean up through scopes;
- documented temporary lack of GPX inference is the only Photo behavior gap.

### Architecture invariants at risk

True optionality, app-owned entry lifetime, provider lease, semantic/render separation, revision currency, presenter-owned popup, and entry-owned URL cleanup.

### Explicit non-goals

GPX-based Photo inference, full generic layers/settings product UI, GPX domain rendering, and complex external plugins.

## 14. Phase 4H — GPX Vertical Slice

### Goal

Deliver the complete rich GPX semantic and rendering domain, remove the legacy raw-layer architecture, and restore Photo-from-GPX inference through semantic APIs.

### Why this phase exists

GPX is the primary complexity proof: multiple geometry types, visibility levels, styles, semantic references, hit testing, export/editor snapshots, and many consumers. It should land after infrastructure and Photo validate lifecycle boundaries.

### Prerequisites

Phases 4A–4G.

### Target architecture responsibilities

- lazy GPX provider and input handler;
- normalized multi-track/segment/route/waypoint semantics;
- immutable document and specialized query snapshots;
- distance/elevation/time and nearest-point behavior;
- category/per-track visibility and style commands/revisions;
- selection refs and reconciliation;
- semantic extent/bounds;
- GPX renderer generations for tracks, routes, route points, waypoints;
- generation-local hit testing/bindings;
- safe visibility/style in-generation updates where valid;
- popup/tree domain adapters required for domain proof;
- target Photo inference integration using GPX semantic timeline capability;
- removal of old GPX renderer/Interaction Hub authority.

### Implementation scope

Adapt stable GPX parse/source/interpretation/serialize logic behind the provider. Split old overlay building into renderer-private generation construction and domain popup UI adapter. Register GPX file input through target InputRegistry. Implement renderer interactions without exposing Leaflet layers. Add explicit GPX timeline/query capability used by Photo inference.

### Authority before

Minimal headless GPX provider exists, but the main GPX viewer/render/input behavior is absent. Legacy raw-layer consumers are disabled by allowlist.

### Authority after

GPX DomainProvider and DomainRenderer are sole GPX semantic/map authorities. Target generation bindings are the sole committed GPX physical-interaction path.

### Allowed temporary feature loss

Full layers/elevation UI and external export/route/editor/milestone plugins may remain disabled until 4I/4J. Basic GPX tree/popup adapters needed for vertical proof may be minimal target versions.

### Legacy code removed

- old GPX input handler and GPX semantic/render branches in boot;
- old `buildGpxOverlay` public integration and mutable overlay bookkeeping;
- all `entry.layer`, `entry.interactions`, `state.layers`, binding flags, and foreign-layer publication remnants;
- `src/core/interaction-hub.js` and its tests;
- old GPX popup builders in shared renderer module after adapters replace them;
- any dormant target-incompatible fit/visibility helpers.

Interaction Hub deletion is safe because its old consumers remain disabled and Phase 4J migrates them directly to semantic/MapFacade contracts. Target generations are never exposed through it.

### Temporary scaffolding

The composition allowlist remains. Disabled GPX-dependent plugins are explicitly enumerated. No raw-layer bridge is introduced.

### Required tests

**New contract tests**

- GPX creation/snapshot/revision/change contracts;
- tracks/segments/routes/route points/waypoints identity and selection refs;
- reconciliation for point move/delete/replacement;
- semantic extent and timeline capability;
- renderer resources and target mapping for every geometry kind;
- polyline nearest-point hit test without per-point bindings;
- whole/category/per-track visibility semantics and interaction suppression;
- style updates/replacements and currency;
- renderer failure/removal/reinstall/cleanup;
- no foreign layer exposure;
- Photo inference consumes guarded GPX capability and reacts to correct data.

**Preserved behavior tests**

Retain/adapt all GPX parse/source/interpretation/serialize suites and relevant layers/boot behavior: multiple tracks/segments, routes, route markers, waypoints, styles, visibility, nearest point, replacement failure, fit/reveal. Restore Photo inference outcome tests through the new boundary.

**Integration/smoke tests**

Restore GPX file import/render, route-point popup, selection, whole/per-track visibility integration, and Photo inference smoke. Layers/elevation/editor smoke may remain disabled until later phases.

Delete old Interaction Hub tests and mutable layer/entry assertions; replace their meaningful interaction/withdrawal coverage with generation-binding tests.

### Completion criteria

- GPX works end to end through target provider/renderer/input/selection contracts;
- Photo-from-GPX inference is restored without generic source scanning;
- source searches find no `entry.layer`, `entry.interactions`, `state.layers`, `subscribeInteractions`, `interaction-hub`, or raw committed-render layer access;
- renderer and provider modules remain separate;
- preserved GPX domain and core viewer smoke milestones pass;
- disabled consumer list is limited to standard UI not yet restored and Phase 4J plugins.

### Architecture invariants at risk

Domain neutrality, semantic identity versus Leaflet identity, generation currency, target-binding validity, visibility/revision distinction, provider/renderer separation, and no foreign layer access.

### Explicit non-goals

Full elevation/layers host UX, GPX export UI, route search, editor, milestone, and final app destruction closure.

## 15. Phase 4I — Standard UI and Presentation

### Goal

Restore normal built-in product UI and input transports using typed hosts, contributions, subscriptions, presenters, and target semantic contracts.

### Why this phase exists

Host infrastructure can be built earlier, but product UI needs stable Photo/GPX domain, selection, and renderer-facing contracts. Migrating it now avoids temporary legacy-shaped adapters.

### Prerequisites

Phases 4A–4H.

### Target architecture responsibilities

- panel/toolbar/layers/settings host implementations;
- deterministic contribution/mount lifecycle;
- generic layers tree with domain adapters and fallback;
- map-selection popup/highlight presenter;
- Photo/GPX popup/tree/settings adapters at product completeness;
- elevation presentation plugin using GPX/SelectionStore/MapFacade;
- status and base-map product UI completion;
- file/drop/URL/query transport UI over target InputRegistry;
- typed entry/domain/selection/render subscriptions;
- host accessibility/focus/error isolation;
- feature stylesheet ownership;
- removal of coarse global refresh correctness.

### Implementation scope

Split generic host behavior from domain adapters. Migrate current layers, settings, elevation, panel, status, input controls, and base-map selector. URL/query operations receive scoped cancellation/liveness. Preserve complex forms only where they belong to their plugin; do not create a universal UI framework.

### Authority before

Minimal domain adapters/presenters prove Photo/GPX slices; full standard UI is absent or partial. `refreshView` may remain only in disconnected/disabled legacy plugins.

### Authority after

Typed hosts/contributions/subscriptions and scoped presenters are sole standard UI authority. `refreshView()` no longer exists as a correctness mechanism.

### Allowed temporary feature loss

External complex plugins in Phase 4J may remain disabled. Standard viewer, Photo/GPX UI, inputs, elevation, status, and base-map behavior should be restored.

### Legacy code removed

- `refreshView`, refresh handler set, and all standard UI refresh callbacks;
- generic layers/settings branches on GPX/Photo mutable objects;
- Selection Hub-style popup ownership remnants;
- direct `app.core`/`app.state` UI reads;
- unowned controls/surfaces/listeners/timers;
- feature-specific rules remaining in core global CSS;
- old transport callbacks carrying registry/context/status/error manually.

### Temporary scaffolding

The composition allowlist remains for Phase 4J external plugins. No UI data adapter for legacy shapes exists.

### Required tests

**New contract tests**

- known/dormant points, schema/group validation, stable ordering;
- mount child ownership, remount/update, dynamic add/remove;
- host/contributor liveness and action guarding;
- fallback layers row and domain adapter rendering;
- popup anchor/generation re-resolution, close independence, presenter uninstall;
- settings values remain provider/config authority;
- elevation semantic selection and presenter-owned marker/highlight;
- URL/query cancellation/stale completion;
- accessibility labels, keyboard host behavior, focus restoration;
- no global refresh dependency.

**Preserved behavior tests**

Adapt layers-control, settings, elevation, panel, status, base-map, file/drop/URL/query, controls, and UI surface tests. Preserve product-visible behavior rather than old constructor/core fixtures.

**Integration/smoke tests**

Restore layers/settings/elevation, popup/selection, file import, dropzone, URL import, base-map selector, viewer, and embed smoke groups. Editor smoke remains disabled until 4J.

Old tests for refresh handlers, mutable core entry fixtures, popup-owned selection, installation order, or unowned surfaces are replaced.

### Completion criteria

- all intended standard built-ins in this phase use PluginContext only;
- `rg` finds no production `refreshView` or `addRefreshHandler`;
- generic hosts contain no GPX/Photo branches;
- SelectionStore contains no popup/presentation state;
- standard viewer/input/UI smoke milestones pass;
- only Phase 4J external plugins remain allowlisted off.

### Architecture invariants at risk

Host/contributor ownership, UI state separation, deterministic ordering, typed subscriptions, presenter-owned popup/highlight, callback liveness, and domain-neutral generic UI.

### Explicit non-goals

Migrating GPX export, route search, editor, milestone, or declaring app destruction complete.

## 16. Phase 4J — Complex Plugin Migration

### Goal

Migrate all remaining repository external/complex plugins directly to public target contracts.

### Why this phase exists

These consumers require stable GPX, UI, selection, MapFacade, and ownership contracts. Migrating them earlier would force compatibility adapters or churn. They should be restored one cohesive plugin at a time within one phase gate.

### Prerequisites

Phases 4A–4I.

### Migration order

```text
1. GPX export
2. x-route-search
3. x-track-editor
4. x-milestone
```

Export is the smallest GPX snapshot/UI consumer. Route search validates operation children and persistent semantic output. Editor is the most complex session milestone and benefits from stable contracts. Milestone then proves derived overlays require no foreign renderer access.

### Target architecture responsibilities

- public GPX semantic snapshots/creation/visibility commands;
- typed UI contributions/surfaces;
- child scopes and tracked async work;
- MapFacade caller-owned overlays and advanced raw-map access;
- plugin-owned session interaction/presentation;
- app-owned committed results;
- cleanup and stale authority on uninstall/destroy.

### Implementation scope

Migrate the four plugins in the following order, using one authority cut per plugin and updating the composition allowlist after each successful cut.

#### Implementation scope by plugin

#### GPX export

- Prerequisites: GPX immutable serialization snapshot, contribution host, Scope object URL/timer helpers.
- Reuse: serializer and filename logic.
- Replace: `app.core/state`, internal controls, refresh handlers.
- Ownership: plugin UI scope; each download child owns anchor, object URL, and revoke timer.
- Map resources: none required beyond launcher placement.
- Commit behavior: read-only semantic snapshot; no entry mutation.
- Regression tests: entries appear/disappear through subscriptions, selected export, serialized content/name, URL cleanup/uninstall.

#### `x-route-search`

- Prerequisites: GPX creation, MapFacade, UI host/surface, Scope operation children, status service.
- Reuse: client, profiles, coordinate validation, response normalization, form semantics.
- Replace: broad app, `core.addGpxSource`, raw surface/control helpers, refresh.
- Ownership: plugin UI scope and per-request child; cancellation tied to child/plugin.
- Map resources: session-owned origin/via/destination/preview overlays through MapFacade.
- Commit behavior: successful route converts to GPX semantic creation; committed entry is app-owned and survives plugin teardown. It does not use InputRegistry.
- Regression tests: cancellation/stale result, marker/form behavior, result persistence, cleanup/uninstall.

#### `x-track-editor`

- Prerequisites: GPX editor snapshot/create/visibility commands, EntryStore subscriptions, UI hosts, MapFacade advanced escape hatch, nested scopes.
- Reuse: draft model, stable local IDs, history, local selection, form, editing-layer controller, rectangle selection, PartiallyEditablePolyline unchanged.
- Replace: `app.core`, mutable entries/sources, Interaction Hub, foreign renderer layers, refresh, manual root/session cleanup.
- Ownership: plugin scope -> editor-session child -> rectangle/operation children. Draft UI/layers/history/local selection remain session-owned.
- Map resources: temporary session resources only; advanced Leaflet map access permitted for PartiallyEditablePolyline with immediate ownership registration.
- Commit behavior: Save Copy sends semantic GPX to provider, producing a new app-owned entry and fresh normal render generation; no draft resource transfer. Cancel commits nothing.
- Required behavior: track/segment structure, point move/insert/delete, undo/redo, rectangle/local multi-selection, form editing, Save Copy, cancel/restart, original removal cancellation, visibility restoration, track switching.
- Regression tests: existing editor unit and smoke behaviors adapted to target APIs plus uninstall/destroy/stale callback/resource cleanup.

#### `x-milestone`

- Prerequisites: GPX geometry/distance snapshots, typed entry/domain subscriptions, MapFacade overlay band.
- Reuse: milestone distance calculation/labels where valid.
- Replace: raw track-layer subscription, `app.state`, anonymous foreign-layer listeners, arbitrary z-index offsets.
- Ownership: plugin scope plus per-entry overlay children.
- Map resources: independent derived markers in the derived-overlay band.
- Commit behavior: read-only derived presentation; no semantic mutation.
- Regression tests: positions/visibility/zoom refresh, entry/domain change, uninstall/destroy cleanup, no renderer dependency.

### Authority before

These plugins are disabled by the migration allowlist and their old integration code may remain as non-production source.

### Authority after

Every listed plugin uses target public contracts and owns its effects through scopes. No repository external plugin requires mutable core, internal renderer layers, or global refresh.

### Allowed temporary feature loss

Within the phase, later plugins in the order may remain disabled until their sub-cut completes. Phase exit requires all intended repository plugins restored.

### Legacy code removed

- all external imports/use of private mutable core/state/renderer integration;
- old control/surface/refresh integration;
- dormant raw-layer editor/milestone code;
- manual cleanup structures superseded by scope ownership, while plugin-private cleanup logic still needed by owned records remains.

### Temporary scaffolding

The allowlist is updated after each plugin sub-cut. It remains until Phase 4K verifies complete composition and removes the scaffold.

### Required tests

**New contract tests**

- each plugin installs/uninstalls/destroys without leaked registrations/resources;
- cached facades and async callbacks reject after owner close;
- route/editor committed entries survive creator teardown;
- temporary resources never enter committed generations;
- milestone works without renderer/raw layers.

**Preserved behavior tests**

Adapt all `x-gpx-export`, route-search, track-editor, and milestone tests without weakening domain/session outcomes. Vendor-library tests/source remain untouched.

**Integration/smoke tests**

Restore route-search integration if present, full editor smoke group, export integration, and milestone behavior. All product smoke tests should be capable of running by phase exit, though terminal destroy cases complete in 4K.

Delete old tests whose only contract is `app.core`, Interaction Hub, refresh, or foreign layer identity; replace meaningful behavior with semantic/subscription/overlay tests.

### Completion criteria

- every intended repository external plugin is enabled through PluginContext;
- `rg` finds no external production `app.core`, `app.state`, `core.state`, `subscribeInteractions`, `refreshView`, or foreign committed layer access;
- editor vendor files are unchanged;
- route/editor output entries survive plugin teardown;
- full editor smoke passes;
- allowlist contains no remaining feature exclusion, though the scaffold file remains until 4K.

### Architecture invariants at risk

Creator versus entry ownership, nested session lifetime, async liveness, no foreign renderer access, semantic-only commit, guarded public APIs, and cleanup completeness.

### Explicit non-goals

Changing editor product semantics, modifying PartiallyEditablePolyline, introducing a renderer augmentation registry, or treating route search as InputRegistry input.

## 17. Phase 4K — Lifecycle Closure and Legacy Purge

### Goal

Complete terminal application destruction, restore full composition and tests, remove the migration scaffold, and prove no legacy architecture remains.

### Why this phase exists

`app.destroy()` must be designed from 4A/4B onward, but complete ordering can only be validated after every real resource category and plugin has migrated. Final source/import searches and optionality verification require the full composition.

### Prerequisites

Phases 4A–4J complete.

### Target architecture responsibilities

- terminal, asynchronous, idempotent `app.destroy()`;
- immediate rejection of new lifecycle/semantic work;
- pending setup cancellation and lost commit authority;
- dependent-first ordinary plugin teardown;
- retention of providers/dependency closure while entries dispose;
- global selection/presentation/interaction invalidation;
- reverse entry disposal and provider lease release;
- retained provider/dependency teardown;
- core/runtime/UI/render/map resource disposal;
- caller-owned versus factory-owned map/container distinction;
- aggregate cleanup errors and residual diagnostics;
- full import-graph optionality.

### Implementation scope

Finish application coordinator ordering, failure aggregation, and factory ownership. Exercise all migrated plugins/resources. Remove the composition allowlist and every residual legacy module/API/test fixture/doc reference that presents the old architecture as supported. Update samples and public documentation to target APIs.

### Authority before

Runtime has terminal-state skeleton and each subsystem owns local cleanup, but complete product-wide destroy ordering has not yet been accepted as a full-system contract.

### Authority after

The application lifetime coordinator is authoritative from creation through terminal destruction. The target architecture is the only repository architecture.

### Allowed temporary feature loss

None. Phase exit is the full-product completion gate.

### Legacy code removed

- temporary migrated-plugin allowlist/scaffold;
- any remaining `app.core`, `app.state`, legacy state/hub/refresh/entry-layer modules or exports;
- unused old tests/mocks/fixtures for obsolete contracts;
- obsolete API/operations documentation and sample usage;
- permanent feature CSS/resources not owned by target scopes;
- any dead compatibility or migration helper not part of target architecture.

### Temporary scaffolding

Remove the Phase 4B composition allowlist. No migration scaffold remains.

### Required tests

**New contract tests**

- destroy idempotence and terminal rejection;
- destroy during pending setup and operational tasks;
- dependency/provider-aware ordering with live entries;
- every scope/registration/generation/presenter/overlay/control/listener/task disposed;
- cleanup failures aggregated after later cleanup continues;
- retry-safe versus terminal residual reporting;
- caller-supplied map/container preserved with all Tilia attachments removed;
- factory-created map removed last;
- GPX-only composition never resolves/imports Photo/EXIF;
- renderer/UI/provider absent configurations remain coherent.

**Preserved behavior tests**

All migrated domain, UI, input, base-map, export, route, editor, milestone, and sample behavior tests.

**Integration/smoke tests**

Full migrated unit suite and all 28 current smoke behaviors, updated for intentional target changes such as popup-close independence. Add destroy/recreate integration where appropriate.

Delete only obsolete architecture tests whose meaningful behaviors have target replacements.

### Completion criteria

- all full-product completion criteria in section 30 pass;
- the allowlist is removed and normal composition enumerates intended plugins;
- full unit and smoke suites pass;
- legacy symbol/import searches are clean except historical documentation references clearly marked as removed;
- source import graph verifies optional Photo/EXIF isolation;
- `app.destroy()` satisfies all ordering/error/ownership tests;
- `git diff --check` and architecture compliance review pass.

### Architecture invariants at risk

Terminal destruction, provider-aware ordering, complete cleanup, caller-owned infrastructure, aggregate failure truth, optional module isolation, and absence of compatibility bridges.

### Explicit non-goals

New product features, domain redesign, compatibility restoration, performance work unrelated to correctness, or a new plugin framework.

## 18. Photo–GPX Cross-Domain Restoration

Photo-from-GPX location inference is intentionally absent at the end of Phase 4G and restored within Phase 4H after the target GPX provider exposes its semantic timeline/query capability.

Required target flow:

```text
Photo/JPEG import operation
        -> optional guarded GPX timeline capability
        -> Photo inference algorithm
        -> normalized Photo creation request
        -> app-owned Photo entry
```

It MUST NOT scan EntryStore internals, generic entry fields, `state.sources`, or GPX renderer resources. The Photo provider/input integration defines behavior when GPX capability is unavailable. Existing inference outcomes and smoke coverage return before Phase 4H completes.

## 19. Temporary Composition Allowlist

### Purpose

After PluginContext cutover, current plugins cannot safely run until migrated. The allowlist explicitly enables only migrated plugins so intermediate composition remains truthful and testable.

### Rules

- It contains plugin IDs/composition configuration only.
- It performs no API adaptation, state translation, registry mirroring, or fallback loading.
- A disabled plugin is intentionally absent; callers receive normal unavailable/unknown behavior according to configuration.
- Runtime remains sole installation authority.
- Tests maintain an explicit expected enabled/disabled inventory at every phase gate.
- Each phase updates the inventory when a plugin migrates.
- No product code branches on “migration mode” beyond composition choice.

### Lifetime

Introduced in Phase 4B. Updated through Phases 4C–4J. Removed in Phase 4K when all intended plugins are migrated and full composition is restored.

### Anti-permanence tests

- one test enumerates all repository plugin definitions and requires each to be classified;
- Phase 4K changes the test to require no migration exclusions and no allowlist module/configuration;
- source search at final gate rejects migration-allowlist identifiers.

## 20. Legacy Deletion Matrix

| Legacy mechanism | Target replacement | Deletion/disconnection phase | Prerequisites | Proof deletion is safe |
|---|---|---|---|---|
| broad plugin `app` setup object | guarded PluginContext | 4B | Scope/runtime | all enabled plugins setup with context; source search |
| old `use/unuse` runtime | PluginRuntime graph/state | 4B | 4A | runtime contract tests |
| setup-result auto-service | explicit ServiceRegistry | 4B/4C | runtime then service registry | no auto-service tests; status explicit service |
| descriptor stylesheets | scoped style leases | 4B/4C | Scope/style manager | shared/remove/rollback tests |
| eager built-in implementation imports | literal lazy loaders | 4B | runtime loader | import/loader-not-called tests |
| mutable services/public registries | typed guarded facades | 4C | 4A–4B | liveness/conflict tests and searches |
| old input registry/context | target InputRegistry/domain handlers | disconnect 4C, delete 4D/vertical slices | registry foundation/providers | target handler/dispatch tests |
| `app.core` semantic API | EntryStore/domain/selection/map facades | disconnect 4B, semantic deletion 4D, final search 4K | relevant target facades | no enabled consumer; repository search |
| `app.state` | EntryStore snapshots/domain APIs | 4D | DomainRegistry/EntryStore | entry tests; no production references |
| legacy `core/state.js` | EntryStore/private provider instances | 4D | semantic core | lifecycle/revision/removal tests |
| parallel `state.sources/layers` | provider state/generation ownership | 4D | semantic core | no snapshot fields/search; headless tests |
| `entry.source` | domain snapshots | 4D | providers | consumer compile/tests and search |
| `entry.layer`, `entry.interactions` | private RenderGeneration | removed from model 4D; renderer proof/dead code purge 4F–4H | EntryStore then rendering | envelope tests and search |
| Selection Hub | SelectionStore + presenter | 4E | EntryStore/domain refs | selection contract tests |
| popup ownership inside selection | map-selection presenter | authority removed 4E; presentation restored 4G/4I | SelectionStore then presenter | close-independence tests |
| boot renderer/binding authority | RenderingCoordinator/domain renderers | disconnect 4D; delete 4F/4G/4H by domain | renderer foundation | generation/domain tests |
| Interaction Hub | generation bindings + semantic overlays | disconnect 4D; delete 4H | GPX renderer, consumers disabled | source search and generation tests |
| target-incompatible `build*Overlay` integration | domain renderer build | Photo 4G, GPX 4H | rendering foundation | renderer behavior tests |
| foreign renderer-layer access | domain snapshots + MapFacade overlays | 4H for core; 4J for plugins | domain APIs/MapFacade | searches and overlay tests |
| `refreshView`/handlers | typed subscriptions/host reconciliation | 4I | semantic/render/UI subscriptions | no-symbol search and UI tests |
| domain branches in generic layers/settings | domain UI adapters/contributions | Photo 4G, complete 4I | host/domain contracts | host neutrality tests |
| direct/unowned controls/listeners/timers | MapFacade/Scope helpers | per plugin 4C–4J | ownership helpers | teardown/leak tests |
| manual cleanup conventions | scope records/child scopes | per owner migration; final purge 4K | 4A | cleanup inventory/destroy tests |
| old sample/API usage | target public APIs | 4J–4K | migrated product | sample smoke and doc search |

Deletion occurs when authority moves, not in one final cleanup batch. Phase 4K catches only residual dead code and documentation.

## 21. Point-of-No-Return Cutovers

| Cutover | Prerequisites | Old authority removed | Temporarily lost features | Required tests | Rollback model |
|---|---|---|---|---|---|
| PluginRuntime/PluginContext (4B) | Scope | old lifecycle, broad setup app, eager built-ins, auto-service/style behavior | unmigrated plugins | graph/concurrency/rollback/context/lazy loader | source-control revert |
| typed extension/resource authority (4C) | runtime/context | mutable services and unowned migrated registries/resources | most domains/UI | registry/MapFacade/status/base-map | source-control revert |
| semantic authority (4D) | registries/Scope | mutable state/entries, parallel arrays, boot semantics | rendering, inputs, UI, plugins | EntryStore/provider/lease/revision/headless integration | source-control revert |
| SelectionStore (4E) | EntryStore/domain refs | Selection Hub and popup-owned selection | popup/map selection | ref/reconciliation/removal/reentrancy | source-control revert |
| RenderGeneration path (4F) | semantic/selection/map foundations | connected legacy rendering/physical binding path | real maps until domain slices | transaction/failure/currentness/dynamic renderer | source-control revert |
| Photo vertical (4G) | renderer foundation | old Photo boot/map/UI | GPX inference only | Photo optionality/lifecycle/render/presentation | source-control revert |
| GPX vertical (4H) | proven renderer/domain infra | old GPX overlay/binders and Interaction Hub | advanced consumers/UI | full GPX behavior/generation/inference | source-control revert |
| typed UI/refresh (4I) | domain/presentation contracts | global refresh and old generic domain UI | external plugins only | hosts/popup/elevation/inputs/smoke groups | source-control revert |
| complete app lifetime (4K) | every owner migrated | allowlist/residual legacy/ad hoc lifetime | none | full destroy/import graph/unit/smoke | source-control revert |

No runtime compatibility rollback is required or permitted.

## 22. Testing Strategy

### Contract tests

Each target mechanism receives focused tests before product use:

- Scope/state/cleanup/task/staging;
- runtime graph/concurrency/rollback/quarantine;
- typed registries/facades/subscriptions/resources;
- provider leases/EntryStore/revisions/removal;
- SelectionStore/reconciliation/reentrancy;
- renderer/controller/generation/currentness/failure;
- UI host/mount/presenter lifecycles;
- terminal app destruction.

Contract tests SHOULD use synthetic resources and fake providers/renderers to isolate mechanism failures.

### Domain behavior tests

Existing GPX parse/source/interpretation/serialize and Photo inference/time behavior are retained and adapted. Domain algorithms should remain directly testable without runtime, Leaflet, or DOM where possible. New provider tests cover snapshot/command/ref/change behavior.

### Plugin regression tests

Status/base-map prove early contracts. Photo and GPX prove vertical slices. Export, route search, editor, and milestone retain product behavior but replace legacy integration fixtures. Every migrated plugin gains install/uninstall/app-destroy and stale-authority coverage.

### Integration tests

Integration boundaries include:

- runtime -> staged registries;
- InputRegistry -> domain creation -> EntryStore;
- domain mutation -> selection reconciliation -> render replacement;
- renderer interaction -> semantic selection -> presenter;
- host snapshot -> mount scope -> action;
- creator plugin -> app-owned committed entry;
- entries/provider leases -> destroy ordering.

### Smoke tests

Smoke suites protect restored product behavior at explicit milestones, not every intermediate phase. A phase may skip known unavailable groups only when the plan records them and the allowlist inventory test confirms the absence is intentional.

### Every phase gate

- relevant contract/domain/plugin/integration tests pass;
- required smoke milestone passes;
- `git diff --check` passes;
- no unintended source/test/document changes;
- migrated-subsystem forbidden-symbol searches pass;
- architecture invariant review is recorded.

## 23. Smoke-Test Restoration Milestones

| Milestone | Phase | Current smoke coverage to restore/adapt |
|---|---|---|
| shell and base map | 4C | `viewer.spec.js`, `viewer-base-map-selector.spec.js`, basic embed boot as feasible |
| Photo GPS import | 4G | `viewer-photo-import.spec.js`, Photo popup/settings subset |
| GPX viewer/render/import | 4H | `viewer-file-import.spec.js`, GPX route-point popup |
| Photo-from-GPX inference | 4H | `viewer-photo-inference.spec.js` |
| selection/popup and elevation | 4I | all `viewer-elevation.spec.js`, migrated popup semantics |
| layers/settings/standard inputs | 4I | `viewer-settings.spec.js`, `viewer-dropzone.spec.js`, `viewer-url-import.spec.js`, embed viewer behavior |
| editor | 4J | all `editor.spec.js` scenarios |
| full suite and destruction additions | 4K | all 28 current behavior scenarios plus new lifecycle smoke/integration |

Tests may be reorganized or renamed. The milestone refers to behavior, not file identity. Intentional architecture changes, especially popup close independence, require updated expectations rather than preservation of obsolete behavior.

## 24. Test Rewrite/Deletion Policy

An existing test may be rewritten or deleted when its sole contract is removed architecture, including:

- mutable `entry.layer`, `entry.interactions`, `entry.source`;
- parallel `state.entries/sources/layers` structure;
- raw-layer Interaction Hub replay/dedupe;
- Selection Hub popup ownership or popup-close selection clearing;
- broad `app.core`/`app.state` access;
- global refresh handlers;
- setup-result auto-service publication;
- descriptor stylesheet permanence;
- validation-only dependencies;
- installation-order UI behavior.

Meaningful behavior MUST move to a target test:

| Old meaningful concern | Target replacement test |
|---|---|
| replacement preserves valid old visual state | RenderGeneration replacement/failure test |
| removal clears selection | EntryStore + SelectionStore ordered invalidation test |
| layer click selects nearest GPX point | GPX generation binding + domain ref test |
| popup transition/reentrancy safety | presenter generation/token and SelectionStore queue tests |
| layer visibility | EntryStore visibility + GPX renderer effective visibility test |
| interaction subscriber cleanup | generation binding/Scope disposal test |
| refresh rerenders UI | typed subscription/host reconciliation test |
| plugin cleanup | scope-owned uninstall/destroy test |

Coverage removal without a target equivalent requires an explicit statement that the behavior is intentionally removed by `ARCHITECTURE.md`.

## 25. Phase Completion Gates

Every phase uses the detailed criteria in its section plus these universal gates:

1. new contract tests pass;
2. relevant preserved behavior tests pass or have documented later restoration phase;
3. required smoke milestone passes;
4. one and only one authority owns every migrated responsibility;
5. temporary scaffolding has purpose, authority, lifetime, and removal phase documented;
6. forbidden-symbol/import searches pass for migrated subsystems;
7. no target API exposes mutable internal registries, entries, scopes, providers, or renderer layers;
8. ownership and failure-path tests cover every new resource category;
9. architecture invariants at risk receive explicit review;
10. `git diff --check` and repository status review pass;
11. no unrelated source changes are mixed into the phase.

Authority-cutover searches include, as applicable:

```text
setup(app
app.core
app.state
core.state
state.entries
state.sources
state.layers
entry.source
entry.layer
entry.interactions
selection-hub
interaction-hub
subscribeInteractions
refreshView
addRefreshHandler
buildGpxOverlay
buildPhotoOverlay
```

Matches in historical architecture documents are allowed. Matches in explicitly disabled code are allowed only until its scheduled deletion phase and must be listed by the allowlist inventory test. Final Phase 4K permits no supported production match.

## 26. Architecture Drift Policy

Implementation convenience MUST NOT redefine the architecture.

If a phase discovers a genuine contradiction:

1. stop the affected architectural work;
2. record the exact source evidence and conflicting normative clauses;
3. determine whether the implementation assumption, migration plan, or architecture is wrong;
4. obtain deliberate review;
5. amend `ARCHITECTURE.md` if and only if the target contract changes;
6. amend this plan if sequencing or phase scope changes;
7. continue only after documentation and tests express the accepted resolution.

Do not hide an exception in a compatibility helper, raw access path, test-only flag used by production, or code comment.

## 27. Documentation During Migration

- This plan MAY record phase status, completion commit, intentional feature absences, and scaffold inventory.
- Material implementation decisions that clarify but do not alter architecture SHOULD be recorded near the owning subsystem or in a focused decision note when they affect later phases.
- Every temporary scaffold MUST name its removal phase here or in an approved plan amendment.
- Public plugin/API and sample documentation MUST migrate with the phase that makes its replacement usable.
- A change to ownership, authority, lifecycle, dependency direction, or invariants requires a deliberate `ARCHITECTURE.md` update.
- Trivial internal naming or data-structure choices need no process document.

## 28. Commit Strategy

Commits should follow coherent concepts and authority cuts, for example:

- ownership state and cleanup kernel;
- runtime graph planner and install transaction;
- PluginContext authority cutover;
- one typed registry/resource family;
- semantic EntryStore/provider cutover;
- SelectionStore cutover;
- render-generation transaction;
- Photo vertical slice;
- GPX vertical slice;
- one complex plugin migration;
- terminal destroy and final purge.

Commits need not keep the whole product releasable. They MUST be reviewable, preserve one authority within their completed scope, and pass tests relevant to the contract they introduce. Do not keep old architecture active solely to make every commit product-complete. Do not combine unrelated cleanup or feature work with migration commits.

## 29. Risk Register

| Risk | Failure mode | Mitigation |
|---|---|---|
| Scope correctness | leaks, double cleanup, wrong dependency order | synthetic exhaustive state/order/failure tests before consumers |
| Runtime concurrency | duplicate setup, late commit after destroy, dependency race | serialized planner, shared per-ID operation, adversarial promise tests |
| setup transaction | half-published registrations | batch preflight/callback-free commit/rollback tests |
| EntryStore cutover | dual state or lost data behavior | no mirror, coordinated deletion, headless provider tests and searches |
| provider leases | provider disappears before entry cleanup | lease diagnostics and provider-aware destroy tests |
| SelectionStore reentrancy | stale/recursive state transitions | serialized queue, current snapshot, reconciliation/reentrancy tests |
| semantic revision | visibility or selection incorrectly invalidates generation | explicit revision matrix tests for GPX/Photo/generic visibility |
| RenderGeneration async | stale build/callback becomes current | token+revision+scope preflight and supersession/removal tests |
| renderer failure | semantic entry rolled back or old stale interaction remains | independent transaction tests and interaction withdrawal assertions |
| GPX renderer complexity | visibility/targets/routes regress | domain tests plus per-kind generation and smoke tests |
| UI lifecycle | detached listeners/DOM, stale actions, focus loss | mount scopes, host snapshot tests, accessibility/focus tests |
| Photo optionality | EXIF remains eager | import-graph/lazy-loader test in 4G and 4K |
| track editor | session leaks or editing behavior regression | nested scopes, unchanged vendor, full unit/smoke restoration |
| route async | result commits after uninstall | operation child signal plus commit-time liveness test |
| app destruction | provider/resource disposed in wrong order | explicit staged destroy integration with failure injection |
| allowlist permanence | forgotten disabled feature | exhaustive inventory test and mandatory 4K removal search |

Risks are mitigated primarily by architecture boundaries, singular authority, early contract tests, and phase gates—not by compatibility layers.

## 30. Full Migration Completion Criteria

The migration is complete only when all of the following are true:

- every intended built-in and external repository plugin installs through guarded PluginContext;
- PluginRuntime owns graph resolution, setup transactions, uninstall, quarantine, and terminal lifecycle;
- Scope owns every Tilia-visible registration/resource/task or a specialized shared lease does;
- typed services, domains, inputs, contributions, subscriptions, and map facades are authoritative;
- EntryStore is the sole generic semantic entry authority;
- every committed entry is app-owned and holds the required provider lease;
- GPX and Photo semantics live in DomainProviders without Leaflet resources;
- primary rendering uses DomainRendererRegistry, controllers, and private RenderGenerations;
- semantic selection is independent of renderer and popup state;
- no plugin reads or mutates foreign primary-renderer resources;
- standard UI uses typed hosts, contributions, adapters, and subscriptions;
- export, route search, editor, and milestone use public target contracts;
- editor temporary layers remain session-owned and PartiallyEditablePolyline is unchanged;
- Photo-from-GPX inference uses a guarded GPX semantic capability;
- `app.destroy()` is terminal, provider-aware, best-effort, and fully tested;
- caller-owned maps/containers survive with all Tilia attachments removed;
- factory-created infrastructure is destroyed last;
- temporary composition allowlist and every migration scaffold are gone;
- legacy runtime/state/hub/refresh/entry-layer APIs and modules are deleted;
- all meaningful preserved behavior has target tests;
- complete migrated unit and smoke suites pass;
- GPX-only composition demonstrably does not import/resolve Photo/EXIF code;
- final architecture compliance checklist passes with no undocumented exception.

## 31. Architecture Compliance Checklist

Use this checklist for every implementation review.

### Authority and dependencies

- [ ] Exactly one subsystem is authoritative for each changed responsibility.
- [ ] Dependency direction points from plugin/domain implementation to stable mechanisms.
- [ ] Plugin dependency order is explicit and deterministic.
- [ ] No compatibility bridge or migration scaffold is undocumented.
- [ ] Every scaffold has a tested removal phase.

### Ownership and lifecycle

- [ ] Every registration/resource/task has one scope or shared lease owner.
- [ ] Child scopes cannot detach or outlive parents.
- [ ] Closing revokes callback/mutation authority before cleanup.
- [ ] Cleanup order is deterministic and continues after failure.
- [ ] Successful cleanup records cannot run twice.
- [ ] Async work is canceled/settled or has no stale mutation authority.

### Plugin setup and extensions

- [ ] Setup observers cannot see half-published registrations.
- [ ] Registration batch is preflighted and callback-free at commit.
- [ ] Services/domains/inputs/contributions/subscriptions/resources remain distinct.
- [ ] No universal public registry, event bus, command bus, or capability registry appears.
- [ ] Public facades are guarded and expose no raw provider/registry internals.

### Semantic state

- [ ] EntryStore owns committed entry identity/lifetime.
- [ ] Generic entry state remains only `id`, `domain`, and `visible`.
- [ ] Generic core contains no GPX/Photo branches.
- [ ] Provider leases protect live/in-progress entry semantics.
- [ ] Domain mutations use explicit commands and semantic revisions.
- [ ] Whole-entry visibility does not incorrectly advance semantic revision.

### Selection and interaction

- [ ] Selection stores only semantic `{entryId, domain, ref}`.
- [ ] Domain adapter validates/resolves/reconciles refs.
- [ ] Selection is independent of popup and rendering.
- [ ] Entry removal invalidates selection before resource disposal.
- [ ] Interaction maps physical input to semantic intent under an owner scope.
- [ ] Stale binding/callback authority is rejected.

### Rendering and presentation

- [ ] Renderer absence/failure cannot invalidate semantic entry commit.
- [ ] Every generation has one scope, token, and source semantic revision.
- [ ] Replacement publishes no half-built generation.
- [ ] Obsolete generations cannot interact or resolve presentation.
- [ ] No raw renderer layer is public or used as semantic identity.
- [ ] Popup/highlight is presenter-owned and popup close does not clear selection by default.
- [ ] Plugin overlays use semantic data and own independent resources.

### UI and map

- [ ] Host owns placement/container/focus; contributor owns assigned subtree resources.
- [ ] Contribution order is independent of installation time.
- [ ] UI state is not semantic/configuration authority.
- [ ] Normal map effects use MapFacade ownership.
- [ ] Advanced raw-map use creates only caller/plugin-owned resources.
- [ ] Caller-owned infrastructure is never destroyed by Tilia.

### Failure, teardown, and verification

- [ ] Errors distinguish pre-commit failure from committed follow-up failure.
- [ ] One cleanup/notification/render/presentation failure does not suppress peers.
- [ ] Provider-aware destroy disposes entries before providers.
- [ ] New contract and preserved-behavior tests pass.
- [ ] Required smoke milestone and forbidden-symbol searches pass.
- [ ] No undocumented architecture exception was introduced.

## 32. Decisions Deferred to Implementation

The following remain intentionally undecided because they do not affect architecture or phase order:

- exact file/directory names and whether modules use functions or classes;
- exact method names for Scope, registries, facades, and controllers;
- concrete opaque representations for IDs, revisions, and generation tokens;
- exact error-code spelling and diagnostic serialization;
- internal data structures for graph planning, registry indexes, entry storage, and render caches;
- exact wrapper-generation technique for guarded service/domain facades;
- detailed DOM construction approach within host ownership rules;
- exact pane numeric values within the prescribed semantic bands;
- renderer performance optimizations that preserve currency and ownership;
- packaging granularity when one built-in package initially registers provider/input/renderer/UI roles;
- commit count within a phase;
- visual styling, icons, localization, and unrelated product polish.

No architecture-level decision remains unresolved. If implementation evidence challenges that conclusion, section 26 applies.

---

No application source code was modified. This planning task created only `plugin-architecture/MIGRATION-PLAN.md`.

- Unit tests: `npm test` — 37 files passed, 336 tests passed.
- Smoke tests: `npm run test:smoke` — 28 tests passed.
- Formatting: Markdown/diff whitespace checks passed.
