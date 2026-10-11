# Phase 3A — Migration Dependency Analysis

## 1. Executive Summary

The recommended migration is a **hybrid foundation-first strategy with coordinated authority cutovers and domain vertical validation**:

```text
runtime + ownership foundations
        -> typed registries + guarded PluginContext + MapFacade
        -> semantic foundations (DomainRegistry, EntryStore, SelectionStore)
        -> rendering foundations
        -> one coordinated production authority cutover
        -> Photo vertical validation
        -> GPX vertical completion
        -> UI/presentation hosts and complex plugins
        -> legacy deletion and destruction hardening
```

The first implementation dependency is the ownership `Scope` and its staging/liveness protocol. PluginRuntime, typed registrations, guarded callbacks, asynchronous work, map resources, entry lifetimes, render generations, UI mounts, and teardown all depend on it. Runtime graph planning can be developed beside it, but neither can reach the target contract without ownership.

The repository is small enough that a permanently parallel old/new architecture is unnecessary and would be riskier than coordinated cuts. New foundations can be implemented and unit-tested before they become production authority, but at every product cutover there must be exactly one authority. In particular, Tilia should not synchronize two entry stores or two selection stores.

The largest architectural knot is `src/core/boot.js`, which currently owns entry creation, GPX and Photo semantics, input registration, rendering, visibility, selection interaction, replacement, cleanup, and public APIs. The second knot is the mutable entry itself: `entry.source`, `entry.layer`, `entry.interactions`, `entry.presentation`, and `visible` jointly serve semantic, rendering, interaction, UI, and lifecycle responsibilities. The third knot is the broad `app` object, which exposes runtime, mutable state, map, UI, services, and coarse refresh coordination to every plugin.

`EntryStore` and `SelectionStore` can be implemented and tested before rendering. They should not become production authority until a minimal RenderingCoordinator and domain contracts exist. Interaction cannot be cleanly cut over before render generations because current physical bindings are created from renderer-owned Leaflet resources. Selection state can precede rendering; renderer-originated interaction must migrate with each target renderer.

Photo should be the first fully migrated domain. It is a smaller vertical slice but exercises lazy optional loading, input separation, provider lease, object URL ownership, semantic revision, renderer replacement, selection/popup, time mode, and uninstall. GPX follows once those mechanisms work, preserving its richer structure and many dependent plugins.

No architecture-level human decision blocks a final migration plan. The analysis provides enough dependency and cutover information to write `MIGRATION-PLAN.md`. Exact file names, method spellings, and whether some foundation commits are grouped remain implementation-detail decisions.

## 2. Inputs and Migration Policy

Primary target authority:

- `plugin-architecture/ARCHITECTURE.md`.

Current factual and principle inputs:

- `plugin-architecture/PHASE-1-INVENTORY.md`;
- `plugin-architecture/DESIGN.md`.

Supporting design records:

- Phase 2A runtime;
- Phase 2B ownership;
- Phase 2C entries/domains;
- Phase 2D extension mechanisms;
- Phase 2E selection/interaction;
- Phase 2F UI/presentation;
- Phase 2G rendering.

Migration rules used in this analysis:

1. The target architecture is fixed unless source evidence makes it impossible. No such contradiction was found.
2. Backward compatibility for mutable internal APIs is not a requirement.
3. Intermediate phases need coherent authority and meaningful tests, but need not be product releases or preserve every feature.
4. Direct replacement is preferred to adapters.
5. A bridge is acceptable only with one authority, a named deletion phase, and tests that forbid its permanence.
6. Existing tests protect behavior only where that behavior remains part of the product. Tests of removed shapes are migration evidence, not target contracts.
7. PartiallyEditablePolyline remains an independent dependency and is not modified.

## 3. Current Repository Dependency Map

### 3.1 High-level graph

```text
src/index.js / samples
        |
        v
src/app.js
  |-- eager src/builtins.js ---------------------------+
  |-- src/core/boot.js                                  |
  |-- map/base.js, map/controls.js                      |
  |-- ui/styles.js, ui/surfaces.js                      |
  |-- mutable services/plugins/refresh state            |
  |                                                      |
  +--> built-in plugins <---- broad app ----------------+
  |      |-- input plugins -> core input registry/context
  |      |-- UI plugins -> app.core/state/services/map
  |
  +--> external plugins
         |-- internal control/GPX modules
         |-- app.core/app.state/raw map/raw layers
         +-- panel service/refresh/Interaction Hub

src/core/boot.js
  |-- core/state.js
  |-- input-registry.js
  |-- selection-hub.js -> map/layers.js popup builders
  |-- interaction-hub.js -> mutable entry interactions
  |-- gpx parse/source/interpretation
  |-- photo exif/inference/time mode
  +-- map/layers.js -> Leaflet + GPX interpretation
```

### 3.2 Responsibility dependencies

| Current subsystem | Reads/writes | Resources | Current integration boundary | Dependents |
|---|---|---|---|---|
| `app.js` runtime/composition | plugin maps, mutable services, refresh handlers, core state | styles, UI roots, map/base manager | broad `app` object | all built-ins, external plugins, samples |
| `builtins.js` | `app.core`, registry, services, UI, map | controls/panels/listeners | eager descriptors and installer functions | startup/plugin tests |
| `core/state.js` | mutable parallel entries/sources/layers | none directly | public mutable state object | boot, plugins, tests |
| `core/boot.js` | all entry/domain/presentation state | layers, bindings, URLs | large returned core API | app, built-ins, external plugins |
| GPX modules | GPX values | FileReader in parser | direct module imports | boot, renderer, editor/export/elevation/milestone |
| Photo modules | EXIF/Photo values; GPX timeline for inference | FileReader/object URL | direct boot imports | boot only, tests |
| input registry/processing | handler list and `context.state.layers` | fetch/controller/timer in URL path | `app.registry`, `app.context` | file/drop/url/query plugins |
| map rendering | GPX/Photo data | FeatureGroups, polylines, markers | `{layer, interactions}` | boot, popup/UI helpers, tests |
| Selection Hub | mutable entries/domain objects | Leaflet Popup/map listener | domain-specific methods | boot/elevation/tests |
| Interaction Hub | `entry.interactions`, raw layers | subscriber binding state | raw-layer callbacks | editor/milestone/tests |
| panel/surface UI | panel service and roots | DOM, Leaflet controls/listeners | service + `app.ui` | layers/elevation/settings/editor |
| layers/settings/elevation | mutable core entries/domain APIs | DOM/control/chart/markers/timers | `app.core`, panel, refresh | product UI |
| track editor | GPX sources and raw track layers | extensive session DOM/Leaflet/listeners | internal modules + broad app | editor sample/tests |
| route search | own state plus `core.addGpxSource` | fetch, surfaces, markers, listeners | broad app + internal modules | sample/tests |
| milestone | raw published track layers | markers/layer/map listeners | Interaction Hub + `app.state` | plugin test |
| base map | own catalog and TileLayer | tile layers/control | app facade + refresh | providers/selector |
| GPX export | mutable GPX entries | DOM/control/object URL/timer | core state + serializer | plugin usage/tests |

### 3.3 Mutable authority today

The same mutable entry object is read or retained by boot, layers UI, elevation, editor, export, milestone, Selection Hub, Interaction Hub, and tests. `app.core` is the de facto command API; `app.state` and `core.state` are the de facto query API. `refreshView()` is the invalidation channel when no typed notification exists.

This graph explains why file-by-file migration would create adapters: most consumers share object identity and raw Leaflet handles rather than stable contracts.

## 4. Current Architectural Knots

### 4.1 `core/boot.js`

Participating responsibilities:

- application semantic-state construction;
- permanent GPX/JPEG input registration;
- GPX and Photo validation/normalization;
- Photo/GPX cross-domain inference;
- entry ID/list/source/layer mutation;
- GPX presentation preferences and visibility;
- Photo time-mode mutation;
- renderer construction/replacement/attachment;
- physical interaction bindings;
- semantic selection and popup entry points;
- Interaction Hub publication;
- entry removal/clear and Photo URL cleanup;
- public domain and generic APIs.

Target owners are DomainRegistry/DomainProviders, EntryStore, SelectionStore, InputRegistry, DomainRendererRegistry, RenderingCoordinator, MapFacade, and presentation plugins. A naive extraction of only entries leaves rendering and interaction fields in the new envelope; extracting only rendering leaves source mutation and selection in boot. The knot must be cut by building target foundations first, then replacing production authority in a coordinated cut.

### 4.2 Mutable entry and parallel arrays

`entry.source`, `entry.layer`, `entry.interactions`, `entry.presentation`, and `state.sources/layers` simultaneously carry:

- semantic data;
- renderer resources;
- visibility state;
- selection/hit-test data;
- extension handles;
- cleanup lookup.

Target owners are DomainProvider private instances, EntryStore envelope, RenderGeneration, interaction bindings, and scopes. A legacy-shaped adapter would reproduce the knot. The cut is to introduce an app-owned minimal envelope and keep domain/render state in private stores from the first production EntryStore commit.

### 4.3 Selection Hub plus popup

The hub stores semantic focus and Leaflet popup state, imports domain popup builders, and clears selection on popup close. Render bindings call domain-specific selection methods with mutable entries.

Target owners are SelectionStore, domain selection adapters, renderer-generation bindings, and a map-selection presenter. Replacing only the storage while delegating popup back to the old hub would create two lifecycle authorities. The smallest cut is SelectionStore plus domain ref adapters first, followed by generation interaction and presenter cutover; old Hub is not synchronized with new state.

### 4.4 Interaction Hub as foreign-layer distribution

The hub reads `entry.interactions`, replays raw layers, has no withdrawal, and supports only a historical domain subset. Editor and milestone then attach their own events.

Target owners are generation-local semantic bindings and independent plugin overlays. There is no useful generic logic to retain. Delete it when the last GPX renderer/editor consumer migrates; do not wrap it.

### 4.5 Broad application facade

The current `app` combines runtime, services, mutable core, map, UI helpers, input state, status, error handling, and refresh. Target authority is a scope-bound PluginContext with typed facades.

Changing only its surface while forwarding to old internals would become a compatibility layer. Runtime/PluginContext cutover should be direct; not-yet-migrated plugins may be temporarily disabled rather than supported through `app.core` forwarding.

### 4.6 `map/layers.js`

This module mixes domain rendering, popup DOM, Photo thumbnails, fit behavior, and GPX style/geometry. It should split by responsibility:

- GPX renderer implementation;
- Photo renderer implementation;
- GPX/Photo popup UI adapters;
- generic geographic bounds/map-facade utility where justified.

The algorithms are reusable, but the module boundary is not.

### 4.7 UI plus domain state

Layers control is simultaneously generic entry host and GPX/Photo UI. Settings is currently Photo policy UI. Elevation owns GPX query, selection, popup coordination, chart, markers, and timers. Their target dependencies cannot exist until EntryStore, domain APIs, SelectionStore, and presentation resolution are available.

## 5. Target Subsystem Inventory

| Target subsystem | Implementation responsibility | Public/internal |
|---|---|---|
| Scope/ownership engine | hierarchy, abort/liveness, records, LIFO cleanup, tasks, quarantine data | internal engine; constrained public handle |
| PluginRuntime | lazy resolution, graph planning, state, concurrency, install/uninstall/destroy | public lifecycle + internal coordinator |
| PluginContext | scoped capability composition | public plugin API |
| owned registration engine | staging/preflight/commit/withdrawal | internal |
| ServiceRegistry | single-provider guarded services | public facade/internal index |
| DomainRegistry | providers, public API facades, private hooks, leases | public domain facade/internal lease engine |
| InputRegistry | owned claimant metadata, priority/conflict dispatch | public facade/internal dispatcher |
| Contribution infrastructure | typed points, ordering, snapshots | typed public hosts/internal store |
| EntryStore | app-owned IDs/envelopes/lifecycle/visibility/changes | guarded public facade/internal state |
| DomainProviders | GPX/Photo semantic snapshots, commands, refs, revisions | domain-facing contracts |
| SelectionStore | zero-or-one semantic reference/reconciliation | guarded public facade/internal state |
| interaction host | modal/object/background semantic dispatch | presentation/internal infrastructure |
| MapFacade | owned map effects, viewport, pane bands, raw escape hatch | public plugin API |
| DomainRendererRegistry | one primary renderer per domain | internal presentation contract |
| RenderingCoordinator | controllers, availability, discovery, orchestration | internal |
| EntryRenderController | per-entry current/pending generation and currency | internal |
| RenderGeneration scope | projection resources/bindings/resolvers/tasks | internal/private |
| UI host infrastructure | typed contributions and mount scopes | public typed facades/internal hosts |
| presentation infrastructure | popup/highlight and domain UI adapter discovery | plugin/presentation-facing |
| application destroy coordinator | provider-aware teardown stages | internal runtime/app |

These are responsibility units, not required one-class or one-file mappings.

## 6. Current-to-Target Responsibility Mapping

| Target responsibility | Current implementation | Reusable logic | Legacy coupling | Replacement type |
|---|---|---|---|---|
| Scope | manual cleanup functions | individual disposer knowledge | no hierarchy/staging/liveness | new |
| PluginRuntime | `app.js use/unuse`, pending map | async dedupe, ID rules | eager built-ins, validation-only deps, no rollback | replace/evolve |
| PluginContext | broad `app` | some convenience intent | ambient mutable authority | replace |
| ServiceRegistry | `services`, `provide`, setup result | named lookup use cases | overwrite/raw values/auto-publication | replace |
| DomainRegistry | none | domain modules | semantics embedded in boot | new |
| InputRegistry | `core/input-registry.js` | dispatch concept | append-only first-match, no metadata/ownership | replace |
| Contributions | base-map catalog, panel callbacks, UI surfaces | keyed aggregation/surfaces | irreversible or ad hoc | extract/new |
| EntryStore | `state.js` + boot entry methods | monotonic IDs, visibility/removal behavior | mutable domain/render fields, parallel arrays | rewrite |
| GPX provider | GPX modules + boot GPX methods | parsing, normalization, interpretation, serialization | rendering/UI/core state mixed in | extract |
| Photo provider | Photo modules + boot Photo methods | EXIF normalization/inference/time rules | core imports, URL/render/UI mixed | split/extract |
| SelectionStore | Selection Hub state/transition tests | reentrancy concerns, single selection | popup/domain objects/Leaflet | replace |
| Interaction | boot listeners + Interaction Hub | nearest-point algorithm | raw layers, no withdrawal | replace/delete |
| MapFacade | `getMap`, controls/surfaces helpers | Leaflet utilities | no automatic ownership; foreign access | new/extract |
| renderer registry/coordinator | boot branching | replacement-first behavior in tests | entry-layer identity | new |
| GPX/Photo renderers | `map/layers.js`, boot bindings/visibility | overlay construction and styles | popup/UI and mutable entry handles | split/move |
| UI hosts | panel/layers/settings/controls | DOM behavior and product layout | state polling/domain branching | split/rewrite |
| presentation | Selection Hub/elevation/layers popup code | content formatting/chart behavior | semantic/popup/renderer coupling | split/rewrite |
| destroy | individual plugin destroy | some local cleanup sequences | no app boundary/aggregation | new |

## 7. Stable Domain Logic vs Architectural Glue

### 7.1 Likely reusable with focused adaptation

- `src/gpx/parse.js`: parsing and normalization behavior; FileReader acquisition needs scoped invocation integration.
- `src/gpx/source.js`: normalization/cloning logic.
- `src/gpx/interpretation.js`: coordinates, nearest-point, distance/elevation/timeline calculations.
- `src/gpx/serialize.js`: GPX serialization.
- `src/photo/exif.js`: EXIF extraction logic; persistent preview URL creation should move to Photo entry scope.
- `src/photo/infer-location.js` and `photo-time-utils.js`: inference/time semantics, though cross-domain access must use GPX snapshots rather than `state.sources`.
- `track-style-presets.js`: domain renderer/presentation definitions.
- route-search client, coordinate/profile/response normalization.
- editor draft, history, selection, and form-domain logic.
- PartiallyEditablePolyline as an unchanged independent library.
- GPX export filename/serialization logic.

### 7.2 Architectural glue to replace

- `core/boot.js` orchestration and returned API;
- `core/state.js` mutable entry/source/layer representation;
- `core/interaction-hub.js` entirely;
- `core/selection-hub.js` as a combined subsystem;
- `{layer, interactions}` as renderer output exposed to core/plugins;
- `app.core`, `app.state`, mutable `app.services`, `app.registry/context`;
- `refreshView` and refresh handlers;
- eager built-in descriptors/imports;
- permanent stylesheet registration;
- direct internal control imports as plugin API;
- UI domain branches and foreign-layer listeners.

“Rewrite” here concerns integration and ownership, not deletion of validated algorithms or user behavior.

## 8. `boot.js` Decomposition Analysis

| Current symbol/responsibility | Target owner |
|---|---|
| state/registry/hub construction | composition root creates EntryStore, registries, SelectionStore, RenderingCoordinator |
| permanent GPX/JPEG handler registration | GPX/JPEG input plugins through InputRegistry |
| `resolvePhotoSource` | Photo provider/import integration using guarded GPX query |
| track presentation normalization | GPX provider |
| GPX visibility helpers | GPX provider state/commands and GPX renderer plan |
| layer membership helpers | renderer-private implementation |
| click binding helpers | GPX/Photo RenderGeneration bindings |
| `addGpxEntry` | GPX provider creation + EntryStore commit; rendering follows |
| default Photo mode | Photo/configuration service or provider configuration |
| GPX global/category setters | GPX domain commands |
| `addGpxSource`, `updateGpxSource` | GPX domain API |
| `updatePhotoTimeMode` | Photo domain command |
| generic visibility/remove/clear | EntryStore |
| fit-to-view | domain semantic extent/renderer presentation through MapFacade |
| selection methods | SelectionStore + domain selection adapters |
| `openPopup` | map-selection presenter |
| interaction subscription | delete; target semantic bindings/overlays |
| Photo URL revocation | Photo entry scope |

End state: the current `boot.js` should disappear or become a thin composition module that creates generic mechanisms and installs configured plugins. It should retain no GPX/Photo branch, overlay builder, popup logic, or mutable entry API.

## 9. Plugin Runtime Migration

### Reusable behavior

- lower-kebab validation and reserved `tilia-*` intent;
- asynchronous `use()`;
- installed/pending duplicate protection;
- startup configuration normalization.

### Replace directly

- eager `builtins.js` registry with literal lazy loader records;
- arbitrary convention-path discovery with external objects/explicit catalog;
- validation-only `requires` with graph planning and recursive install;
- setup return/service conflation;
- descriptor stylesheet insertion;
- mutable public `plugins` and `services`;
- uninstall without dependent checks;
- absence of rollback/quarantine/destroy.

Runtime graph resolution and state transitions can be implemented against test descriptors without migrated product plugins. The production PluginContext cutover should then disable or migrate built-ins rather than passing the broad old `app` through a compatibility facade.

The smallest first validation uses synthetic plugins plus one simple real plugin (`tilia-status` or a base-map provider) migrated to scoped resource/service registration.

## 10. Ownership Migration

### Immediate high-value adopters

- plugin setup and setup-return cleanup;
- staged services/registrations;
- DOM and Leaflet listeners;
- controls/surfaces;
- stylesheet leases;
- timers/object URLs;
- route/URL fetch operation children;
- editor-session and rectangle-selection children;
- RenderGeneration scopes.

### Do not retrofit before deletion

- raw Interaction Hub subscriber binding bookkeeping;
- `entry.layer` and `entry.interactions` cleanup;
- Selection Hub popup lifecycle;
- `refreshView` handlers;
- boot's anonymous domain renderer listeners.

Adding Scope wrappers to those legacy mechanisms would spend effort making rejected architecture more durable. Introduce generic ownership first, then use it only for target paths and real plugins as they migrate.

Acquisition helpers should cover common listener/timer/control/layer/URL patterns, but exact helper names are implementation details. Scope tests must precede product migration because later failures are otherwise difficult to localize.

## 11. EntryStore Migration

### Current creation paths

- GPX file handler in `boot.js`;
- JPEG handler in `boot.js`;
- `core.addGpxSource` used by route search and editor save;
- `app.load()` through current input dispatch;
- query/URL/file/drop transports funneling to that dispatch.

### Option comparison

| Option | Benefit | Failure/cost | Assessment |
|---|---|---|---|
| A. EntryStore first, adapt legacy rendering | semantic authority can move early | adapter needs hidden source/layer/interaction coupling and risks becoming a second boot | reject as production path |
| B. EntryStore + DomainProviders | clean semantic authority and headless tests | product has no rendering until renderer foundation/cutover | recommended implementation foundation |
| C. EntryStore only with rendering replaced simultaneously | no hybrid shape | makes one very large untestable implementation step | reject as development sequence |

Recommended distinction:

- Implement and test EntryStore + DomainRegistry/leases before rendering.
- Do not route production entries into it until minimal renderer/controller infrastructure exists.
- At authority cutover, remove old mutable state rather than mirroring it.

No long-lived hybrid entry shape should exist. The only generic public snapshot from the first production cut is `{id, domain, visible}`.

## 12. DomainProvider Migration

### GPX provider prerequisites and API pressure

The GPX provider must expose enough semantic contract for:

- creation from normalized GPX;
- immutable document/editor/export snapshots;
- geometry and extent queries;
- tracks/routes/waypoints and nearest-point resolution;
- category/per-track visibility and style commands;
- semantic revision and typed change descriptors;
- selection ref validation/resolution/reconciliation;
- renderer snapshot/build inputs.

Parsing, source normalization, interpretation, and serialization stay domain logic. Current global/entry GPX visibility and style state move out of generic state. The provider must not expose Leaflet resources.

### Photo provider prerequisites and API pressure

The Photo provider must own:

- normalized Photo semantic state;
- entry-scoped preview URL creation/revocation;
- time-mode command and revision;
- current coordinate/location/inference snapshot;
- Photo selection reference/resolve behavior;
- renderer snapshot/change descriptors;
- semantic extent/anchor data.

JPEG recognition and EXIF parsing should be a distinct input role. GPX inference must query an explicit GPX semantic capability, not scan generic sources. The provider should retain normalized timestamp/GPS values so later time-mode changes do not need the EXIF library.

### Order

Both provider contracts and registry/lease mechanics should exist before production EntryStore cutover. Photo is the first full vertical implementation; GPX can initially exist as a headless provider under unit tests, then complete rendering and dependents.

## 13. Input Migration

Current file/drop/URL/query plugins depend on current registry/context, `processInputItems`, status/error callbacks, and refresh. URL helpers additionally assume GPX content. The core registry permanently supplies GPX/JPEG semantics.

Inputs can migrate after EntryStore + DomainProvider public APIs exist and before a domain renderer is available because semantic entry commit is independent of rendering. That is architecturally clean. Product tests at that intermediate point should assert committed headless entries and render status `unavailable`, not map layers.

Required changes:

- separate transports from domain handlers;
- register owned identified handlers with metadata and priority;
- give each dispatch an operation child scope/signal;
- remove `context.state.layers` from status text;
- make URL transport format-neutral or explicitly a GPX input plugin;
- use typed status service optionally rather than callbacks on broad app;
- render/UI refresh comes from typed entry changes, not `onItemLoaded`.

File and dropzone are good early real-plugin tests after the target input registry exists. Query import is less suitable because doing work during setup complicates lifecycle validation. URL import is valuable later for cancellation/liveness.

## 14. Rendering Migration

### Current-to-target mapping

| Current | Target |
|---|---|
| `buildGpxOverlay`, `buildPhotoOverlay` | GPX/Photo DomainRenderer build logic |
| `entry.layer` | current private RenderGeneration resources |
| `entry.interactions` | generation-local bindings/resolvers |
| `state.layers` | eliminated; scope ownership/controller indexes |
| layer attachment in boot | controller/generation transaction through MapFacade |
| GPX child membership mutation | renderer safe in-generation visibility update |
| source/time-mode replacement | semantic revision then independent generation replacement |
| `fitMapToGroup` | semantic extent first, renderer bounds fallback |
| popup builders in `map/layers.js` | domain popup UI adapters |

Shared infrastructure—MapFacade, pane bands, renderer registry, coordinator, controller, generation scopes, status, currentness checks—must exist before the first target renderer.

Photo and GPX renderer implementations can migrate one at a time after that foundation. The application can temporarily support only the migrated domain; this is preferable to retaining old `entry.layer` for the other domain. Once a domain uses target EntryStore, it must use target rendering or remain deliberately headless.

Photo validates initial/replacement failure and time-mode revision with one marker. GPX then validates multiple geometry kinds, child visibility, hit testing, style, and performance.

## 15. Selection / Interaction / Renderer Coupling

### Can SelectionStore precede renderer infrastructure?

Yes. SelectionStore, domain refs, validation, reconciliation, entry-removal ordering, and subscriptions are semantic and can be unit-tested without Leaflet. UI/domain APIs can also request a semantic selection while unrendered.

### Can Interaction precede rendering?

Only its generic arbitration primitive can. Production object bindings originate from renderer resources and must be owned by RenderGeneration. Building a complete interaction migration first would either invent artificial surfaces or wrap raw layers.

### Smallest coherent cut

```text
SelectionStore + domain ref adapters
        |
minimal interaction host (tiers, liveness, semantic intent)
        |
RenderingCoordinator + one DomainRenderer
        |
generation-local physical bindings
        |
map-selection presenter
```

SelectionStore is authoritative from its cutover; the old Selection Hub is removed rather than synchronized. Until the map presenter exists, selection may have no popup. That temporary loss is acceptable. Interaction Hub survives only until the last old renderer/editor raw-layer consumer is removed; it never receives target generations.

## 16. Presentation Migration

| Current surface | Prerequisites | Target cut |
|---|---|---|
| selection popup | SelectionStore, domain popup adapter, renderer anchor/status, MapFacade | replace Hub popup entirely |
| layers panel | EntryStore, domain tree adapters, contributions, selection optional | split generic host from GPX/Photo adapters |
| settings | settings host/contributions, Photo configuration/domain API | move Photo fields to contribution |
| elevation | GPX API, SelectionStore, MapFacade, optional popup presenter | rewrite integration; retain chart algorithms/UX |
| toolbar/simple controls | contribution host + map/control helper | migrate independently after hosts exist |
| panel shell | scoped service/host/mount ownership | early UI validation candidate |
| status | ServiceRegistry + control/map ownership | earliest real service candidate |

UI host infrastructure can be implemented independently and tested with synthetic contributions. Real layers/settings/elevation migration depends on semantic/domain contracts. Popup depends additionally on renderer-facing anchor resolution. Therefore UI framework work may start early, but domain-facing UI cutover is late.

Hosts should not receive a temporary mutable-entry adapter. A temporarily absent layers panel is safer than encoding the legacy shape into the new host.

## 17. Map Facade Migration

### Direct Leaflet access classification

| Use | Classification |
|---|---|
| add/remove caller-owned layer/control | normal MapFacade owned helper |
| map/DOM/Leaflet event subscription | normal owned helper |
| fit/pan/viewport | normal facade operation |
| UI surfaces/collision roots | application shell/facade |
| standard pane bands/private pane lease | normal facade operation |
| PartiallyEditablePolyline-specific Leaflet operations | advanced raw-map escape hatch plus session ownership |
| route-search marker mechanics | facade helpers or advanced own-resource access |
| reading/mutating `entry.layer`/foreign renderer layer | prohibited; must disappear |
| base TileLayer manager | application infrastructure, not entry rendering |

MapFacade should be introduced with ownership foundations, before renderers and plugin overlays. It can be tested using caller-owned fake/Leaflet maps and migrated simple controls. It must not wrap foreign-layer access for editor/milestone.

## 18. Built-In Plugin Migration

| Built-in | Current privileged dependency | Target needs | Relative order/difficulty |
|---|---|---|---|
| status | auto service/setup result, control | ServiceRegistry, MapFacade/control, Scope | early / low |
| panel | surfaces, raw listeners, returned service | scoped service/host/mount | early / medium |
| base-map providers/control | app baseMaps + refresh | owned catalog contribution/service + control host | early-medium |
| dropzone | old input registry/context, DOM listeners | InputRegistry, scope, status service | early after inputs / low |
| file import | old registry/context, control | InputRegistry, toolbar/control host | early after inputs / low-medium |
| URL import | old registry/context, fetch, surfaces | operation child/cancellation, InputRegistry, status | medium |
| query import | setup-time import | scoped async setup/operation decision | medium |
| layers | full core state and GPX/Photo branches | EntryStore, hosts, domain adapters, renderer reveal | late / high |
| settings | Photo core methods | settings host + Photo API/config | after Photo / medium |
| elevation | GPX state, selection/popup/map | GPX API, SelectionStore, presenter/MapFacade | after GPX / high |

Status is the best first public-context validation because it proves explicit service publication and owned control cleanup without semantic state. Dropzone/file import validate InputRegistry once semantic creation exists. Panel validates service dependency plus complex DOM ownership.

## 19. `x-track-editor` Migration

### Reusable

- draft creation/cloning and local stable IDs;
- history/undo/redo;
- local multi-selection and reconciliation;
- form logic;
- PartiallyEditablePolyline and editing-layer behavior;
- rectangle-selection behavior once its resources are scope-owned.

### Replace integration

- `core.state.entries` enumeration with EntryStore plus GPX snapshots;
- `entry.source` reads with GPX immutable editor snapshot;
- raw Interaction Hub layer clicks with semantic selection/action or explicit GPX entry choice;
- GPX visibility core calls with GPX commands;
- `addGpxSource` with GPX creation;
- refresh handlers with typed entry/domain changes;
- raw control/panel installation with contributions/surfaces;
- manual session cleanup with child scopes and MapFacade.

### Prerequisites

The editor should migrate only after GPX provider, EntryStore subscriptions, GPX visibility commands, MapFacade, Scope children, UI host/service, and committed GPX creation exist. It does not require primary renderer layer access. Its temporary rendering remains session-owned through the advanced Leaflet escape hatch where PartiallyEditablePolyline requires it.

Save Copy commits semantic GPX only; normal renderer creates fresh generation resources. Original entry removal cancels the session via typed EntryStore changes. PartiallyEditablePolyline internals remain untouched.

## 20. `x-route-search` Migration

Reusable route client, coordinate/profile validation, request/result transformation, form semantics, and local marker behavior should remain.

Replace broad app access, direct surfaces/control helpers, raw map listener cleanup, `core.addGpxSource`, refresh, and unmanaged request lifetime.

Prerequisites:

- Scope/operation children and MapFacade;
- UI surface/control ownership;
- status service if retained;
- GPX provider creation API and EntryStore;
- input is not required because this plugin creates domain data directly.

Temporary markers remain plugin/session-owned. Request cancellation derives from the scope. Successful route results become app-owned GPX entries and survive plugin uninstall. It can migrate after the GPX domain but before editor if desired; its integration surface is smaller.

## 21. `x-milestone` Migration

The current implementation is replaceable. It consumes raw track layers, attaches anonymous layer listeners, checks `app.state`, uses arbitrary z-index offsets, and refreshes globally.

Target dependency is exactly:

```text
GPX DomainProvider snapshots/geometry
        + typed entry/domain subscriptions
        + MapFacade derived-overlay band
        + plugin/per-entry child scopes
```

It should rebuild independently owned markers from semantic track distance data and viewport/zoom changes. It must not depend on DomainRenderer, Interaction Hub, or foreign layers. Because rewriting it validates relatively little new infrastructure beyond GPX overlays, it is not an early architecture milestone; migrate it after GPX contracts are stable.

## 22. Base Map Boundary

`src/map/base.js` is already separate from entry rendering and contains reusable base definition normalization/selection and TileLayer management. It should remain application map infrastructure.

Migration needs are limited to:

- owned reversible provider registrations;
- scoped selected layer and control resources;
- typed snapshot/selection notification rather than refresh;
- cleanup during app destroy;
- caller/factory map ownership distinction.

Base maps do not block EntryStore, domains, selection, or renderer generations. They are useful early validation for ContributionRegistry and owned removal because their semantic boundary is already relatively clean.

## 23. Test Suite Classification

### A. User-visible/domain behavior to preserve

- GPX parse/source/interpretation/serialize tests;
- Photo inference and time-mode outcomes currently exercised by boot/smoke tests;
- route-search client/helpers and committed result behavior;
- editor draft/history/selection/form/rectangle and smoke behavior;
- map rendering outcomes: tracks, routes, route-point/waypoint markers, Photo marker;
- whole/per-track/category visibility product behavior;
- selection outcomes, nearest-point behavior, entry invalidation, replacement semantics where still valid;
- file/drop/URL/query import user behavior;
- layers/settings/elevation/status/base-map visible behavior;
- all smoke scenarios as milestone regression coverage, adapted to new internals.

### B. Target-useful architectural tests to rewrite/evolve

- plugin lifecycle duplicate/pending/setup/cleanup tests;
- base-map duplicate/list/select behavior;
- input matching/dispatch tests;
- UI surface mount/unmount tests;
- replacement failure preserving valid prior state;
- selection reentrancy/notification isolation;
- control cleanup tests.

These concepts remain, but fixtures and asserted APIs change.

### C. Legacy internal-contract tests to replace/delete

- `state.test.js` assertions for parallel `sources/layers`, mutable entry fields, and presentation replacement;
- `boot.test.js` assertions that entries expose `layer/interactions/source` or that boot imports overlay builders;
- `interaction-hub.test.js` raw-layer replay/dedupe contract;
- Selection Hub tests that popup lives in selection and popup close clears selection;
- built-in tests based on broad `app.core`, mutable services, refresh handlers, or setup result auto-publication;
- layers-control tests whose fixtures are mutable GPX/Photo entries rather than typed adapters;
- tests preserving permanent stylesheet or validation-only dependency behavior.

### D. Smoke/integration coverage

The 28 Playwright tests are valuable milestone gates. They should not be required after every temporarily non-functional cut, but must be restored in groups: shell/basic map, Photo, GPX import/layers/popup/elevation, editor, URL/dropzone, settings, and base map.

### Target gaps

New contract tests are required for:

- graph planning, cycles, dependency uninstall protection, concurrent use;
- staged setup publication and rollback;
- Scope ordering, child failure, retry-safe cleanup, stale callback rejection;
- explicit services and guarded facade invalidation;
- provider leases and provider-aware destroy;
- EntryStore creation/removal/clear/visibility and private residual cleanup;
- semantic revision and selection reconciliation;
- renderer absence/install/removal, generation tokens, async supersession, replacement failure;
- RenderGeneration complete cleanup;
- host contribution ordering/mount scopes;
- terminal app destruction and caller-owned map preservation;
- GPX-only composition not importing Photo/EXIF.

## 24. Natural Replacement Boundaries

1. **Scope + staged registration kernel.** One correctness unit for ownership, staging, liveness, and cleanup.
2. **PluginRuntime + PluginContext + basic ServiceRegistry/style ownership.** Setup transaction and public authority must change together.
3. **Contribution/Input registries + MapFacade helpers.** Independent typed mechanisms over the ownership kernel.
4. **DomainRegistry + provider leases + EntryStore.** Persistent semantic ownership and uninstall protection form one invariant set.
5. **SelectionStore + domain selection adapters.** One semantic authority with entry/domain lifecycle integration.
6. **Renderer registry + coordinator + controllers + generation transaction + interaction host.** Physical binding authority and generation currency form one unit.
7. **One domain vertical slice.** Provider, input, renderer, selection adapter, popup/tree/settings pieces needed to validate end-to-end behavior.
8. **UI hosts + domain adapters.** Host infrastructure may be built earlier, but layers/settings product cutover is cohesive.
9. **Complex plugin session migrations.** Each plugin migrates as one owned session/integration unit after dependencies exist.
10. **App destruction and residual legacy removal.** Destruction is designed early but fully validated after all resource categories migrate.

Splitting within these boundaries would create dual authority or make tests observe half-defined lifecycle semantics.

## 25. Implementation Dependency Graph

```text
Scope / ownership kernel
  |-- staged registration protocol
  |-- async liveness/task tracking
  |-- resource helpers
  |
  +--> PluginRuntime graph/state/transactions
  |      +--> guarded PluginContext
  |             |-- ServiceRegistry
  |             |-- InputRegistry
  |             |-- Contribution infrastructure
  |             |-- style/shared-resource manager
  |             +-- MapFacade
  |
  +--> DomainRegistry + provider leases
             |
             +--> EntryStore
                    |-- DomainProviders (Photo, GPX)
                    |-- SelectionStore + domain refs
                    +-- RenderingCoordinator
                          |-- DomainRendererRegistry
                          |-- EntryRenderController
                          |-- RenderGeneration
                          +-- interaction host/bindings
                                 |
                                 +--> map presenter / renderer-facing presentation

Contribution infrastructure + semantic facades
  +--> UI hosts
        +--> domain tree/settings/popup adapters

GPX provider + EntryStore + MapFacade + UI hosts
  +--> route search
  +--> track editor
  +--> GPX export
  +--> elevation
  +--> milestone

All migrated resource categories + provider-aware ordering
  +--> complete app.destroy validation
```

### Node properties

| Node | Prerequisites | Independent validation? | Legacy coexistence |
|---|---|---|---|
| Scope | none | yes, synthetic resources | may exist unused; do not retrofit rejected hubs |
| Runtime graph | Scope for full install semantics | yes, synthetic plugins | can replace old runtime before product features are restored |
| registries/context | Scope/runtime | yes | old app facade should not be mirrored |
| MapFacade | Scope/app map boundary | yes | raw old code may coexist only until its plugin cutover |
| DomainRegistry/EntryStore | Scope/registration | yes, headless | must not mirror old state when authoritative |
| SelectionStore | EntryStore/domain refs | yes, headless | no synchronization with Selection Hub |
| rendering foundation | EntryStore/DomainRegistry/MapFacade/Scope | yes with fake renderer | old renderer may exist only for old authority before coordinated cut |
| domain renderer | rendering foundation + provider | yes/integration | one domain at a time after authority cut, others headless/disabled |
| presentation | selection + renderer resolution + contributions | partly | old popup removed at selection authority cut |
| complex plugins | stable downstream contracts | mostly existing domain tests | migrate one plugin atomically |

### Critical path

```text
Scope -> PluginRuntime/Context -> DomainRegistry/EntryStore
      -> Rendering foundation -> Photo vertical -> GPX vertical
      -> GPX-dependent UI/complex plugins -> final destroy/legacy purge
```

SelectionStore branches after EntryStore and rejoins before Photo/GPX popup/interaction completion. UI host infrastructure can proceed in parallel conceptually, but implementation should remain coordinated through the final plan.

## 26. Migration Cycles

### 26.1 Renderer ↔ interaction

- Cycle: new interaction binding needs renderer resources; renderer click behavior needs interaction routing.
- Nature: real for production object interaction, incidental for generic arbitration.
- Cut: implement small interaction host contract with rendering foundation; each RenderGeneration owns concrete bindings.
- Scaffold: no legacy adapter; fake binding surfaces test the host before a real renderer.

### 26.2 EntryStore ↔ renderer

- Cycle: current entry creation builds renderer first and stores it; target renderer needs committed EntryStore state.
- Nature: legacy incidental, not target architectural cycle.
- Cut: implement semantic EntryStore headlessly, then change ordering to semantic commit followed by rendering.
- Scaffold: no legacy entry adapter; production cut waits for minimal coordinator.

### 26.3 Selection ↔ renderer/popup

- Cycle: current selection is created by layer clicks and owns popup; renderer replacement clears selection.
- Nature: legacy knot.
- Cut: semantic SelectionStore/domain refs first; render bindings only request selection; presenter observes selection and renderer status.
- Scaffold: selection may temporarily have no popup; no bidirectional bridge.

### 26.4 UI ↔ mutable entries

- Cycle: UI is needed to operate entries; EntryStore removal would break UI that reads legacy fields.
- Nature: consumer sequencing problem, not target dependency.
- Cut: migrate semantic core first and temporarily disable legacy layers/settings/elevation; restore through typed hosts/adapters.
- Scaffold: generic fallback layers host MAY be implemented against target snapshots, but never a legacy-shape facade.

### 26.5 Runtime ↔ existing plugins

- Cycle: new runtime expects PluginContext; every current plugin expects broad app.
- Nature: migration fan-out.
- Cut: new runtime validated with synthetic/simple migrated plugins; non-migrated plugins are excluded until converted.
- Scaffold: do not create an app-shaped compatibility context.

### 26.6 Provider uninstall ↔ entry destruction

- Cycle: plugins normally tear down before core, but entries require providers to dispose.
- Nature: real lifecycle ordering constraint already resolved architecturally.
- Cut: implement provider leases and two-stage app destruction; providers and dependency closure remain until entries are removed.

## 27. Temporary Bridge Analysis

| Bridge | Needed? | Why | Authority | Introduced | Removed | Risk |
|---|---|---|---|---|---|---|
| broad `PluginContext -> old app` facade | no | intermediate features may be disabled | none | never | n/a | would preserve mutable core indefinitely |
| target EntryStore mirrored to legacy `state.entries` | no | production cut can be coordinated | none | never | n/a | two authorities/object identity drift |
| SelectionStore synchronized with Selection Hub | no | popup may temporarily disappear | none | never | n/a | loops and ambiguous clear semantics |
| target generations published through Interaction Hub | no | editor/milestone can wait for GPX APIs | none | never | n/a | exposes foreign layers permanently |
| headless domain mode | yes, but not a compatibility bridge | target architecture permits renderer absence | EntryStore/provider only | semantic foundation | remains valid target capability | low |
| generic fallback layers row | optional target behavior, not bridge | entries manageable before domain UI adapters | EntryStore is authority | UI host phase | may remain as specified fallback | low |
| temporary configured plugin allowlist | yes, migration composition only | exclude unmigrated plugins after runtime/context cut | new runtime | runtime cut | removed when all desired plugins migrate | risk of missing feature coverage; tests enumerate composition |

The only temporary scaffold recommended is composition-level exclusion of unmigrated plugins. It contains no data translation and must have an explicit expected-plugin list test so disabled plugins cannot be forgotten. Headless rendering is permanent target behavior, not a bridge.

## 28. Point-of-No-Return Cutovers

### 28.1 PluginContext/runtime cutover

- Prerequisites: Scope, staged registrations, dependency planner, basic services/styles/resources.
- Affects: all built-ins/external plugins and startup composition.
- Tests first: runtime graph, rollback, concurrency, stale context, uninstall, simple real plugin.
- Makes impossible: setup receiving broad mutable app; auto-published setup results; descriptor styles.
- Rollback: source revert, not a runtime facade.

### 28.2 Semantic authority cutover

- Prerequisites: DomainRegistry/leases, EntryStore, GPX/Photo provider minimum contracts, typed changes, provider-aware ordering, minimal renderer coordinator available for subsequent restoration.
- Affects: boot, state, inputs, UI, selection, renderer, samples/plugins.
- Tests first: headless creation/mutation/removal, leases, revisions, IDs, visibility, cleanup.
- Makes impossible: mutable `app.state`, `core.state.entries`, parallel arrays, `entry.source`.
- Deletion: `core/state.js` old representation and most boot APIs immediately.

### 28.3 Selection authority cutover

- Prerequisites: EntryStore, domain selection adapters, serialized mutation/subscription.
- Affects: boot bindings, elevation, layers, popup behavior.
- Tests first: semantic refs, reconciliation, hide persistence, removal ordering, reentrancy.
- Makes impossible: entry-object selection payloads and popup-owned selection.
- Deletion: old Selection Hub immediately; temporary lack of popup is accepted.

### 28.4 Renderer generation cutover

- Prerequisites: MapFacade, renderer registry/coordinator/controller/generation, interaction host, at least one renderer.
- Affects: boot layer lifecycle, map/layers, Interaction Hub consumers.
- Tests first: generation transaction/currentness/failure/removal/cleanup.
- Makes impossible: `entry.layer`, `entry.interactions`, `state.layers`, raw target generation publication.
- Deletion: old overlay bookkeeping/binders and, after GPX consumer migration, Interaction Hub.

### 28.5 Refresh/UI cutover

- Prerequisites: typed entry/domain/selection/render subscriptions and hosts.
- Affects: layers/settings/elevation/base control/external plugins.
- Tests first: contribution ordering/dynamic mount, typed notifications, UI behavior.
- Makes impossible: `refreshView()` as correctness coordination.
- Deletion: refresh handler set and callbacks immediately after final consumer.

### 28.6 App destruction cutover

- Prerequisites: all persistent resource categories scope-owned and provider-aware ordering implemented.
- Affects: application factories/samples/tests.
- Tests first: caller-owned versus factory map, aggregate errors, pending setup/task abort.
- Makes impossible: relying on page teardown/manual caller cleanup.

## 29. Dead-Code Deletion Opportunities

| Legacy code | Delete when |
|---|---|
| `normalizePluginStylesheets`, setup-result auto-service logic | runtime/context cutover |
| eager built-in implementation imports/alias registry | lazy loader registry lands |
| mutable `services/plugins` public containers | ServiceRegistry/runtime lands |
| `core/state.js` parallel arrays and replace helpers | semantic authority cutover |
| permanent core GPX/JPEG handler registration | target input plugins enabled |
| GPX/Photo branches and public API in `boot.js` | providers/EntryStore cutover |
| old Selection Hub | SelectionStore authority cutover |
| popup builders' residence in `map/layers.js` | popup UI adapters land |
| old layer binders and `_tilia*Bound` flags | renderer generation bindings land |
| `entry.layer`, `entry.interactions`, `state.layers` | renderer/semantic cutover |
| Interaction Hub | last old GPX editor/milestone/raw consumer migrates; before target renderer is exposed to it |
| `refreshView`/handlers | final typed-subscription consumer migrates |
| internal control imports as public plugin boundary | MapFacade/UI host conversion of each plugin |
| feature rules in global stylesheet | owning plugin style leases land |

Early deletion is deliberate: compile/test failures reveal overlooked consumers and prevent accidental new use.

## 30. Parallel Architecture Assessment

Tilia does **not** need a long-lived parallel old/new architecture with plugin-by-plugin data synchronization.

Reasons:

- only about 50 implementation modules and a small set of known built-ins/external plugins exist;
- the central coupling is concentrated in `app.js`, `boot.js`, mutable entries, and two hubs;
- dual entry or selection authority would be harder to reason about than temporary feature absence;
- intermediate states are not release targets;
- most reusable value is in domain algorithms, not old integration abstractions.

Foundations may coexist unused with legacy code while unit-tested. This is not parallel authority. At cutover, one subsystem becomes authoritative and the old authority is deleted or disconnected in the same cohesive phase.

The migration therefore uses coordinated direct cuts, with temporarily reduced application composition rather than mirrored state.

## 31. Migration Risk by Subsystem

| Subsystem | Risk | Evidence |
|---|---|---|
| Scope/ownership | high | foundational ordering, async cleanup, quarantine; entirely new but isolated/testable |
| PluginRuntime | high | resolution/concurrency/transactions affect all plugins; current tests extensive |
| ServiceRegistry/styles | medium | small semantics but cached services and shared stylesheet lifecycle |
| InputRegistry | medium | modest code, but async invocation/cancellation and behavior changes |
| Contribution infrastructure | medium | new lifecycle/order; base-map and UI consumers provide evidence |
| MapFacade | medium | many direct Leaflet uses; supported escape hatch limits abstraction pressure |
| DomainRegistry/leases | high | new provider lifetime and destroy ordering |
| EntryStore | very high | central authority, ID/lifecycle/removal, every feature depends on it |
| Photo provider | medium-high | inference/time modes/object URLs/optional EXIF; relatively small geometry |
| GPX provider | very high | rich data/visibility/selection/edit/export and many consumers |
| SelectionStore | high | semantic identity/reentrancy/removal ordering; old popup semantics differ |
| interaction host | high | arbitration plus stale callbacks; must integrate with render generations |
| rendering foundation | very high | Leaflet lifecycle, async/currentness, failure transaction, visibility |
| Photo renderer | medium | one marker but replacement and popup anchor matter |
| GPX renderer | very high | tracks/routes/points, visibility, styles, hit testing, performance |
| UI hosts | high | DOM ownership, dynamic mounts, accessibility/focus, current domain coupling |
| popup/presentation | high | selection independence and generation resolution replace tested behavior |
| base maps | low-medium | already isolated; needs owned unregister/destroy |
| status/dropzone/file UI | low-medium | narrow behavior and good tests |
| route search | high | async + complex UI/map resources, but semantic integration narrow |
| track editor | very high | largest external integration/session behavior; good tests reduce regression risk |
| milestone | medium | small but essentially rewritten |
| app.destroy | high | crosses every lifetime and error path; validation comes late |

No calendar estimates are implied.

## 32. Early Architecture Validation Targets

1. **Synthetic lifecycle plugins:** prove dependency order, cycles, staged visibility, rollback, concurrent use, quarantine, and stale context without product coupling.
2. **`tilia-status`:** prove explicit ServiceRegistry publication, guarded calls, MapFacade control ownership, stylesheet/resource cleanup, and built-in lazy loading.
3. **Base-map provider plus selector:** prove owned multi-provider catalog/contribution, deterministic ordering, dynamic removal, and application-infrastructure boundary.
4. **Dropzone or file input after semantic core:** prove owned InputRegistry handler, metadata, operation scope, and status integration.
5. **Photo end to end:** first meaningful proof of EntryStore, provider lease, input optionality, generation replacement, semantic selection, presenter, UI contribution, and cleanup.

`x-milestone` is not an early target: rewriting it chiefly tests a semantic overlay after the difficult GPX infrastructure already exists.

The smallest useful target-architecture product milestone is a lazy-loaded status plugin plus one headless domain entry committed through the new runtime/ownership/context. The smallest useful visual milestone is the Photo vertical slice.

## 33. GPX vs Photo Migration Order

### GPX first

Benefits: restores the majority of features and dependents quickly; exercises the hardest contracts immediately.

Costs: simultaneous tracks/routes/waypoints, styles, visibility, selection/hit testing, elevation, export, editor, route search, and milestone make infrastructure bugs difficult to distinguish from GPX migration bugs.

### Photo first — recommended

Benefits:

- one primary marker makes renderer ownership observable without large geometry complexity;
- time-mode mutation tests semantic revision and generation replacement;
- object URL tests entry resource cleanup;
- marker selection/popup tests semantic refs and presentation separation;
- lazy JPEG/EXIF input proves optional module loading;
- domain/UI/input roles can be separated cleanly;
- provider uninstall with a live Photo entry tests leases.

Costs: current Photo inference reads GPX sources. Initially test GPS-tagged Photo independently; add GPX inference integration after the GPX provider exists. The absence of inference during the intermediate Photo milestone is acceptable and explicitly temporary.

Recommendation: migrate Photo first, with GPS-tagged import as the first visual slice. Complete GPX second, then restore Photo-from-GPX inference as explicit cross-domain integration.

## 34. Existing Behavior That Must Survive

### GPX

- normalized multiple tracks/segments and point metadata;
- routes, route polylines, numbered route-point markers, and waypoints;
- distance/elevation/time interpretation and nearest-point selection;
- deterministic style preset behavior where product-visible;
- whole-entry, global category, and per-track visibility composition;
- replacement failure retaining prior valid semantic/render state as specified;
- import summaries and serialization/export correctness.

### Selection/presentation

- one global semantic selection for committed data;
- map clicks select correct track/route/waypoint/Photo targets;
- entry removal invalidates selection;
- hidden targets retain semantic selection under the target contract;
- popup content/reveal user experience, with intentional change that popup close no longer inherently clears selection;
- renderer replacement preserves valid selection.

### Photo

- GPS-tagged import;
- timestamp/time-mode behavior and GPX inference outcomes once GPX integration returns;
- preview/thumbnail/popup information;
- marker placement and rebuild behavior;
- object URL cleanup.

### Inputs/UI

- sequential multi-item processing and per-item resilience;
- file/drop/URL/query workflows and validation limits;
- layers/settings/elevation/status/base-map user behavior that remains product scope;
- dynamic controls/panels and responsive sample behavior.

### Complex plugins

- editor draft geometry, point operations, undo/redo, local multi-selection, rectangle selection, visibility restoration, cancel/restart, Save Copy, and original-entry removal response;
- route-search profile/point validation, request, temporary markers, and persistent committed results;
- GPX export file content/naming;
- milestones at the same semantic distances, though implemented from data rather than layers.

Tests may change API-level assertions while retaining these outcomes.

## 35. Candidate Phase Boundaries

Information is sufficient to define future phase boundaries by authority and dependency, not file count. Each final plan phase should state:

- the authority that becomes active;
- prerequisites and target contracts;
- which product features may be temporarily absent;
- contract and preserved-behavior tests required;
- exact legacy authority deleted;
- any configured-plugin exclusion introduced or removed;
- invariants at highest risk.

Candidate cohesive boundaries are:

1. lifecycle/ownership kernel;
2. guarded plugin surface and typed foundational registries;
3. semantic core and headless domain contracts;
4. selection and rendering foundation;
5. Photo vertical slice;
6. GPX vertical slice;
7. UI/presentation completion;
8. external/complex plugin migrations;
9. full destruction, sample restoration, and legacy purge.

These are analysis candidates, not the final phase plan.

## 36. Recommended Migration Strategy

Use a hybrid of foundation-first and vertical slices:

```text
Foundation
  Scope -> Runtime -> PluginContext -> typed registries/MapFacade

Semantic foundation
  DomainRegistry/provider leases -> EntryStore -> SelectionStore

Presentation foundation
  renderer registry/coordinator/generations + interaction host + UI hosts

Vertical validation
  Photo end-to-end

Rich domain completion
  GPX end-to-end

Consumers
  layers/elevation/settings/export/route/editor/milestone

Closure
  app.destroy, all samples/smoke tests, delete remaining legacy code
```

Why this fits the repository:

- foundations are reusable and can be tested without legacy adapters;
- authority cutovers remain narrow and explicit;
- Photo separates infrastructure risk from GPX complexity;
- GPX contracts stabilize before complex plugins migrate;
- non-releasable intermediate composition permits direct deletion instead of dual state;
- existing strong domain/editor/smoke tests protect behavior during later cuts.

Avoid both extremes: a big-bang rewrite would combine too many failure sources, while plugin-by-plugin parallel architecture would make legacy mutable entries the permanent interoperability layer.

## 37. Candidate Implementation Phases

### Candidate A — Lifecycle foundation

- Purpose: establish Scope, task/liveness, staged registration protocol, errors, and runtime graph/state machine.
- Prerequisites: none.
- Replaces: current `use/unuse` internals, eager resolution path, manual transaction assumptions.
- Temporary feature state: product plugin composition may be reduced.
- Tests: synthetic plugin graph, rollback, cleanup order/failure, concurrent calls, lazy loader, destroy-start behavior.
- Deletes: eager built-in registry mechanics, descriptor stylesheet handling, setup-result service inference.
- Risk: high.

### Candidate B — Guarded extension foundation

- Purpose: PluginContext, ServiceRegistry, InputRegistry skeleton, Contribution infrastructure, style leases, MapFacade/resource helpers.
- Prerequisites: A.
- Replaces: broad app services/registry/UI mutation for migrated plugins.
- Temporary feature state: only simple migrated plugins enabled.
- Tests: status service, base-map contribution, owned control/listener/style, stale handles, input conflict metadata.
- Deletes: mutable service map/public registry exposure for target composition.
- Risk: high.

### Candidate C — Semantic core

- Purpose: DomainRegistry/leases, EntryStore, app-owned scopes, typed changes, provider-aware removal, minimal GPX/Photo semantic providers, SelectionStore.
- Prerequisites: A–B.
- Replaces: `state.js`, semantic portions of boot, old Selection Hub authority.
- Temporary feature state: entries may be headless; popup/layers/elevation may be absent.
- Tests: IDs, creation/removal/clear, visibility, revision, lease, selection refs/reconciliation, provider-aware destroy ordering.
- Deletes: parallel arrays, mutable entries, old Selection Hub, domain semantic methods from boot.
- Risk: very high.

### Candidate D — Rendering and interaction foundation

- Purpose: renderer registry/coordinator/controllers/generations, pane bands, interaction host, status/presentation resolver contracts.
- Prerequisites: A–C plus MapFacade.
- Replaces: render/interaction portions of boot for target domains.
- Temporary feature state: fake renderer tests; not all domains visible.
- Tests: transaction/currentness/stale binding/async supersession/removal/reinstall/failure/cleanup.
- Deletes: old renderer bookkeeping once real domain cutover begins.
- Risk: very high.

### Candidate E — Photo vertical slice

- Purpose: validate all layers with optional Photo domain/input/renderer/selection/popup/settings/tree integration.
- Prerequisites: A–D and minimal UI/presentation host support.
- Replaces: core JPEG/Photo imports, Photo branches in boot/layers/settings/popup.
- Temporary feature state: GPX rendering/UI may remain disabled/headless; GPX-based Photo inference deferred.
- Tests: GPS Photo import, lazy EXIF absence, URL cleanup, time-mode replacement/failure, selection/popup, provider/renderer removal, destroy.
- Deletes: Photo core branches and shared Photo UI/CSS ownership.
- Risk: high.

### Candidate F — GPX vertical slice

- Purpose: migrate rich GPX provider/renderer/input/selection/tree/popup and restore main viewer behavior.
- Prerequisites: A–E.
- Replaces: remaining GPX boot/map layer authority and permanent input handler.
- Temporary feature state: GPX-dependent advanced plugins may remain disabled.
- Tests: parser/domain suite, multi-track/routes/waypoints, visibility/style, hit testing, replacement/failure, selection, import/render smoke.
- Deletes: `entry.layer/interactions`, Interaction Hub if no remaining old consumer, old map/layers GPX integration.
- Risk: very high.

### Candidate G — Presentation and standard built-ins

- Purpose: complete layers/settings/elevation/panel/toolbar/input/status/base-map product surfaces.
- Prerequisites: Photo/GPX stable plus UI hosts/presentation contracts.
- Replaces: refresh polling, direct domain branches, Selection Hub popup remnants.
- Temporary feature state: complex external plugins may remain disabled.
- Tests: host/contribution lifecycle, popup independence, elevation/tree/settings, standard smoke groups.
- Deletes: `refreshView`, legacy domain UI paths, global feature CSS.
- Risk: high.

### Candidate H — External and complex plugins

- Purpose: migrate export, route search, track editor, milestone, and samples to stable public contracts.
- Prerequisites: GPX/UI/MapFacade/Scope children.
- Replaces: all external internal-module/mutable-core/raw-layer integration.
- Temporary feature state: plugins restored one cohesive unit at a time.
- Tests: existing plugin unit/smoke behavior plus cleanup/stale async tests.
- Deletes: last broad app access and internal imports; Interaction Hub if still present.
- Risk: very high, driven by editor.

### Candidate I — Lifecycle closure and legacy purge

- Purpose: terminal provider-aware app destruction, all plugin composition, sample/API restoration, import-graph optionality, final dead-code deletion.
- Prerequisites: all resource owners migrated.
- Replaces: caller/page implicit cleanup.
- Temporary feature state: none; full product behavior expected.
- Tests: all unit and smoke tests, destroy failure aggregation, pending setup/tasks, caller/factory map ownership, GPX-only no-EXIF import.
- Deletes: any remaining boot/hub/state/compatibility artifacts and migration allowlist.
- Risk: high.

## 38. Architecture Invariant Risk Review

| Boundary | Highest-risk invariants | Review focus |
|---|---|---|
| lifecycle foundation | no half-published plugin; deterministic dependencies; cleanup truth | batch staging, concurrency, quarantine |
| PluginContext/registries | no ambient mutable authority; distinct extension types | no generic registry/app facade escape |
| semantic core | one app owner per entry; provider lease; domain-neutral core | no domain fields in envelope; removal ordering |
| SelectionStore | semantic refs only; selection/render independence | no popup/layer/snapshot in store; reconciliation |
| renderer foundation | one owner per generation; stale callbacks dead; semantic commit independent | token+revision+liveness, transaction boundaries |
| Photo slice | true optionality; URL ownership; renderer failure isolation | import graph, lease/removal, time mode revision |
| GPX slice | no GPX branches in generic core; target binding validity | visibility, refs, hit test, in-place update criteria |
| UI hosts | host/contributor ownership; deterministic order; UI not authority | mount scope, adapter boundaries, focus/errors |
| complex plugins | no foreign layer mutation; session children; committed entry ownership | editor save, route async, overlay independence |
| destroy/final purge | terminal cleanup; providers survive entries; caller hosts survive | staged order, aggregate errors, resource inventory |

Each implementation review should link changed code/tests to the affected invariants rather than merely checking API signatures.

## 39. Module Organization Direction

A conceptual organization that reflects dependency direction is useful:

```text
src/runtime/        plugin resolution, graph, lifecycle, errors
src/ownership/      scopes, records, tasks, shared leases, helpers
src/extensions/     service/input/contribution/domain registries
src/entries/        EntryStore and guarded facade
src/selection/      SelectionStore and interaction host
src/rendering/      registry, coordinator, controller, generation, panes
src/presentation/   map presenter and generic presentation infrastructure
src/map/            MapFacade and base-map infrastructure
src/domains/gpx/    provider, input, renderer, selection/UI adapters
src/domains/photo/  provider, input, renderer, selection/UI adapters
src/plugins/        feature/UI plugins using public contracts
```

Exact directory names are not architectural. The important constraints are one-way imports, no generic subsystem import of domain implementation, and separation of semantic provider from renderer/UI/input roles. Moving stable GPX algorithms need not precede their contract migration; unnecessary file churn should not obscure behavior changes.

## 40. Decisions Deferred to Implementation

The following do not affect sequencing and should be decided in the phase that introduces the relevant contract:

- exact class/function/module names;
- JavaScript object versus class implementation;
- opaque ID/revision/token representation;
- exact error code spelling and diagnostic object layout;
- exact Scope helper names;
- precise service facade wrapper generation;
- DOM rendering technique for hosts;
- renderer internal geometry caches;
- exact built-in package split when one plugin initially registers multiple roles;
- whether a foundation change is one or several commits;
- visual styling, icon design, and localization details.

Decisions that must be fixed before a subsystem cutover are already architectural: one authority, ownership, staging, lease behavior, semantic revision, generation currency, and removal order.

## 41. Human Decisions

No architecture-level human decision remains before writing the final migration plan.

Recommended planning assumptions are:

1. approve the hybrid foundation-plus-vertical-slice strategy;
2. permit reduced/nonfunctional intermediate product composition;
3. use Photo as the first fully migrated domain;
4. reject broad compatibility facades and state mirroring;
5. allow a temporary explicit plugin allowlist that enables only migrated plugins;
6. treat Phase 3A candidate phases as inputs, not final implementation commitments.

Changing any of the first four would materially change plan structure, but the approved architecture and migration policy strongly support the recommendations. Exact implementation-detail choices do not block Phase 3 Final planning.

## 42. Files and Symbols Consulted

Architecture/design inputs:

- `plugin-architecture/ARCHITECTURE.md`;
- `plugin-architecture/DESIGN.md`;
- `plugin-architecture/PHASE-1-INVENTORY.md`;
- all Phase 2A–2G design reports.

Runtime/composition/current core:

- `src/app.js`: plugin resolution/loader, `createTiliaApp`, services, refresh, `use`, `unuse`, startup;
- `src/builtins.js`: all eager built-in descriptors and integration wiring;
- `src/core/boot.js`: creation, domains, rendering, visibility, selection, interaction, removal;
- `src/core/state.js`: entry/source/layer arrays, ID and replacement helpers;
- `src/core/input-registry.js`, `input-processing.js`, `input-utils.js`, `remote-url-import.js`;
- `src/core/selection-hub.js`, `interaction-hub.js`, `photo-time-utils.js`.

Domain/map/UI:

- `src/gpx/parse.js`, `source.js`, `interpretation.js`, `serialize.js`;
- `src/photo/exif.js`, `infer-location.js`;
- `src/map/layers.js`, `base.js`, `controls.js`, `track-style-presets.js`;
- `src/ui/styles.js`, `surfaces.js`, `protocol.js`, `styles.css`;
- all `src/plugins/input/*.js` and `src/plugins/ui/*.js`.

External plugins and samples:

- `plugins/x-track-editor/*`, excluding changes to vendor internals;
- `plugins/x-route-search/*`;
- `plugins/x-milestone/loader.js`;
- `plugins/x-gpx-export/*`;
- external base-map providers;
- viewer, embed, and editor samples, including direct `app.state/app.core` usage.

Tests:

- all unit tests under `tests/*.test.js`;
- all Playwright tests under `tests/smoke/*.spec.js`;
- especially lifecycle, boot/state, selection/interaction, input, layers/rendering, UI/control, Photo, route, milestone, and editor suites.

---

No source code was modified. This investigation created only `plugin-architecture/phase-3/MIGRATION-ANALYSIS.md`.

- Unit tests: `npm test` — 37 files passed, 336 tests passed.
- Smoke tests: `npm run test:smoke` — 28 tests passed.
- Formatting: Markdown/diff whitespace checks passed.
