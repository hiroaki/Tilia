# Phase 2C — Entry & Domain Boundary Design

## 1. Executive Summary

Tilia should replace its public mutable entry objects with a small application-owned entry store backed by domain providers.

The recommended model is:

- A committed entry is persistent application data, not a plugin-lifetime effect. The application owns its identity, registry record, lifecycle scope, generic visibility, and deterministic position in the entry list.
- The plugin or operation that requests creation is only the **creator**. File import, route search, and the track editor do not own successfully committed entries.
- Every entry has one domain ID, such as `gpx` or `photo`. A domain ID identifies an entry-semantics contract, not a file format, renderer, or plugin ID.
- A registered domain provider owns validation/normalization, opaque domain data, domain presentation, rendering behavior, domain operations, and later selection/interaction adapters.
- Generic public entry snapshots contain only `id`, `domain`, and `visible`. Display labels, tracks, EXIF state, layer objects, and mutable source objects are not generic fields.
- Entry IDs are opaque, monotonically allocated, app-local tokens. They are never reused during an app lifetime. Same-entry domain updates preserve the ID; remove-and-add produces a new ID.
- Entry creation is transactional. The entry store creates an uncommitted entry scope directly under the application lifetime, acquires a domain-provider lease, and asks the provider to prepare data and resources inside that destination scope. No plugin-child scope is transferred.
- Live entries hold lifecycle leases on their domain provider. Explicit provider-plugin uninstall is rejected while dependent entries or in-progress creations exist. Entries are neither silently deleted nor left inert.
- Input/import and UI plugins should be separable from domain support. A Photo input plugin may be removed while Photo entries remain, but the Photo domain provider cannot be removed until those entries are removed.
- Entry removal first makes the entry unavailable and revokes mutation authority, invalidates generic selection/interaction references, then disposes the entry scope best-effort. Cleanup residuals are tracked privately by the application; no half-alive public entry remains.
- Whole-entry visibility is generic because every current and evaluated future map entry has an application-level shown/hidden state. Domains compose it with their own visibility rules; core never interprets tracks, routes, waypoints, markers, or EXIF.
- Domain data is not directly mutable. Generic APIs expose read-only snapshots/handles; domain APIs expose domain snapshots and commands. Domain commands own validation, rendering updates, selection invalidation requirements, and change descriptions.
- App destruction must refine Phase 2A's broad plugin-before-core ordering: tear down ordinary feature plugins first, dispose entries while their providers remain alive, then tear down provider plugins and their retained dependency closure, then core and app-owned map infrastructure.

This adds a provider lease and an entry lifecycle scope, but removes the more expensive coupling now concentrated in `core/boot.js`, `state.entries`, parallel arrays, and type-specific core methods.

## 2. Inputs and Phase 2A/2B Constraints

This design preserves the following approved constraints:

- plugin installation and setup are transactional;
- plugin dependencies order plugin lifetimes but are not resource ownership;
- every visible effect has one owner;
- scopes prevent mutations after closing and provide abort/liveness;
- child scopes cannot detach or outlive parents;
- persistent resources should be created under their destination owner;
- app destruction is terminal and best-effort;
- generic core owns mechanisms while domains own meaning.

Phase 1 establishes the concrete pressure: `createTiliaCore()` statically imports GPX and Photo implementations, registers both input handlers, builds both overlay types, and exposes mutable entries. Phase 2B expressly deferred entry ownership and required Phase 2C to avoid generic scope transfer.

No Phase 2A/2B principle is rejected. App-destruction ordering is refined because live entry leases require domain providers to remain alive until entries are disposed. This is an ordering refinement, not an ownership transfer or exception to terminal destruction.

## 3. Current Entry Architecture

### Factual model

```text
createTiliaCore(map)
  ├─ createAppState()
  │    ├─ entries[]
  │    ├─ sources[]
  │    ├─ layers[]
  │    ├─ nextEntryId
  │    └─ GPX presentation globals
  ├─ statically register GPX file handler
  ├─ statically register JPEG file handler
  ├─ create Selection Hub
  └─ create GPX/Photo-shaped Interaction Hub

input or external plugin
  -> parse/construct domain source
  -> build Leaflet FeatureGroup and interaction handles
  -> addEntry(state, mutable object)
  -> append identical source/layer references to parallel arrays
  -> bind selection handlers
  -> attach layer to map
  -> sync Interaction Hub
```

`src/core/state.js:addEntry()` assigns numeric IDs from `nextEntryId`, then appends the entry, source, and layer to three position-coupled arrays. Lookup is repeated linear search of public `state.entries`. IDs remain monotonic after removal and clear.

Current entry shapes are:

```text
common:
  id, kind, source, layer, interactions, visible

GPX:
  presentation.trackStylePresetIndex
  presentation.trackVisibility[trackIndex] = false overrides

Photo:
  photoOriginal
  requestedPhotoTimeMode
  photoTimeMode
```

Effective GPX display combines `entry.visible`, `state.gpxVisibility`, per-track overrides, and actual FeatureGroup child membership. Photo uses whole-entry visibility plus a rebuilt marker overlay. `updateGpxSource()` and `updatePhotoTimeMode()` construct replacement resources first, invalidate selection for the entry, remove the old layer, mutate the same entry object, and sync new interaction handles.

`removeEntry()` clears selection for the ID, revokes a Photo preview URL, removes the layer, and splices all three arrays. `clearAll()` globally clears selection, revokes Photo URLs, removes all layers, and replaces all arrays. There is no generic disposer, removal notification, or app destruction boundary.

Plugins directly read or mutate this model:

- `tilia-layers`, elevation, `x-gpx-export`, `x-track-editor`, and `x-milestone` enumerate `core.state.entries` or `app.state.entries`.
- They branch on `entry.kind`, inspect `entry.source`, and sometimes retain entry/layer references.
- `x-track-editor` calls GPX-specific core visibility and creation methods.
- `x-route-search` calls `core.addGpxSource()` and intentionally leaves the result after plugin removal.

## 4. Current Entry Field Classification

| Current field/state | Classification | Future treatment |
|---|---|---|
| `id` | generic identity/lifecycle | retain as opaque app-local identity |
| `kind` | mixed domain identity and historical discriminator | replace with registered domain ID |
| array position | generic ordering | keep internally as deterministic insertion order, not public mutable state |
| `visible` | generic presentation | retain as controlled generic state |
| `source` | domain source/data | private to provider; expose only via domain API snapshots |
| `layer` | rendering attachment | entry-scope-owned private controller/resource |
| `interactions` | rendering plus domain interaction state | provider/private; later publish typed interaction registrations |
| `presentation.trackStylePresetIndex` | GPX domain presentation | move to GPX domain |
| `presentation.trackVisibility` | GPX domain presentation | move to GPX domain |
| `photoOriginal` | Photo source/data and ownership state | move to Photo domain; original file-derived state need not be generic |
| `requestedPhotoTimeMode` | Photo domain presentation/policy | move to Photo domain |
| `photoTimeMode` | Photo derived/domain state | move to Photo domain |
| `state.gpxVisibility` | GPX-wide presentation | move to GPX domain/provider or a GPX presentation service |
| `state.sources` | historical coupling/cache index | remove; it duplicates entry data and exists partly for Photo inference |
| `state.layers` | historical coupling/resource index | remove; scopes own rendering resources |
| `nextEntryId` | generic identity mechanism | retain privately in entry store |
| selection objects holding `entry` | interaction/selection state | use entry ID plus domain sub-identity; no mutable entry reference |
| layer boolean binding flags | rendering/interaction cache | replace with owned registrations in entry generation scope |

The ambiguous field is `source`: it contains user document data, import provenance, a Photo object URL, derived location, and presentation-relevant values. It is not a useful generic abstraction. A domain may internally separate source/provenance from normalized data, but generic core should treat both as opaque provider state.

## 5. Definition of an Entry

An entry is an application-owned, stably identified instance of one registered domain's data and presentation, with a lifecycle container for all resources needed to keep that instance usable.

It is not itself:

- a raw file or universal data record;
- a Leaflet layer;
- a plugin;
- a renderer;
- a selection payload.

An entry acts like an application document instance. Its generic record answers only “which entry, which domain, is it globally visible, and is it alive?” The domain provider interprets its opaque data and domain presentation. Its lifecycle scope owns render attachments, object URLs, entry-specific listeners, derivation tasks, and generation subscopes.

This separation lets a future GeoJSON entry participate in list/visibility/removal without teaching core about features, geometries, styles, or file syntax.

## 6. Generic Entry Envelope

Recommended public snapshot:

```js
{
  id,       // opaque app-local EntryId
  domain,   // registered DomainId
  visible,  // whole-entry application presentation
}
```

Private store state additionally contains lifecycle state, insertion position, provider lease, opaque provider instance/controller, and entry scope. Those are not fields on a public mutable object.

Field justification:

- `id`: core needs a stable key for lookup, removal, notifications, and later selection invalidation. A domain cannot allocate across all domains without collision coordination.
- `domain`: core needs to route commands and enforce provider lifetime. It is static for an entry and externally readable, never mutable.
- `visible`: core needs one consistent application-level show/hide operation for layers UI and lifecycle behavior. It changes only through the entry API; providers receive the effective value.

Core does not need generic `source`, `name`, `presentation`, `layer`, metadata, bounds, or type. A layers UI can obtain a domain-provided summary/contribution later. Adding those fields would either expose internals or standardize semantics not shared by all domains.

## 7. Entry Identity

- The entry store allocates IDs before provider preparation, but publishes them only at commit.
- IDs are opaque app-local tokens. The initial implementation may use monotonic integers; callers must not parse, order, or persist them as globally meaningful values.
- An ID is unique and never reused during one application lifetime, including after failed creation or removal. Gaps are valid.
- Domain and ID are separate. An ID alone uniquely identifies an entry within its app.
- A domain may accept a source/document identifier as domain data, but cannot choose the entry ID.
- Same-entry domain updates preserve identity only when the semantic document instance remains the same and the domain operation explicitly promises that behavior.
- Remove-and-add, cross-domain conversion, editor “Save Copy,” and route-result creation allocate new IDs.
- Public references are immutable snapshots or guarded handles. A removed handle rejects mutations and never begins referring to a later entry.

This preserves the useful current monotonic behavior while preventing selection/UI from depending on object identity.

## 8. Domain Identity and Terminology

A **domain ID** identifies the contract that owns the semantics of an entry instance. Examples are `gpx`, `photo`, and potentially `geojson`. It is not:

- an input format: `.gpx` and a routing response may both produce GPX-domain data;
- a renderer: a GPX provider may change rendering without changing domain identity;
- a plugin ID: a plugin registers the provider, but entries refer to the stable domain contract;
- a capability name: capabilities may expose domain operations but have their own registry identity.

Terms:

- **input handler** recognizes/acquires external input and requests domain creation;
- **domain provider** validates, owns, and operates domain semantics;
- **entry controller/instance** is provider-private state for one entry;
- **renderer** is provider-owned behavior or a delegated helper that realizes presentation;
- **creator** is the caller that requested creation;
- **lifetime owner** is the application entry store.

Domain IDs require the same stable naming discipline as other extension IDs, but Phase 2D decides exact namespace syntax and duplicate rules.

## 9. Creator, Owner, Provider, and Renderer

| Role | Responsibility | Example |
|---|---|---|
| creator | supplies input and requests creation | file import, editor save, route search |
| lifetime owner | keeps/removes entry and owns its scope | application entry store |
| domain provider | interprets data and defines operations/presentation | GPX provider, Photo provider |
| renderer | creates/updates entry-owned map attachments | GPX overlay controller, Photo marker controller |

File import owns its picker and import operation, not a committed GPX entry. Editor drafts and temporary layers belong to the editor session, while “Save Copy” asks GPX to create a new app-owned entry directly. Route search owns the request; the resulting GPX entry survives request completion and plugin uninstall.

A Photo input/EXIF plugin may normalize JPEG input and request Photo creation. A Photo entry still requires a Photo domain provider after creation unless the provider deliberately normalizes all needed state into its private entry instance. Normalization can eliminate the ongoing EXIF-library need without eliminating the Photo-domain behavior requirement.

## 10. Entry Ownership Alternatives

### A. Creator-plugin ownership

Benefits: directly follows scope nesting and makes creator uninstall cleanup automatic.

Costs/failures: editor saves and route results disappear when their tools are removed; input transport accidentally owns user data; persistence depends on which UI initiated creation. It contradicts current route/editor behavior.

### B. Application ownership

Benefits: matches user expectations and current committed-entry lifetime; creators can end safely.

Costs/failures: application needs a domain-lifetime constraint and destination-owned creation transaction. Pure application ownership alone does not say how provider behavior remains available.

### C. Domain-provider ownership

Benefits: provider and data lifetime naturally coincide.

Costs/failures: provider uninstall could unexpectedly delete user data; a plugin scope cannot outlive its plugin; combining input/UI/provider makes unrelated resources live too long.

### D. Hybrid application entry plus provider lease

Benefits: application owns persistence; provider supplies behavior; creator lifetime is irrelevant after commit; provider cannot silently disappear. It supports optional domains without inert entries.

Costs: requires entry scopes, provider leases, and uninstall guards; app destruction needs a provider-aware ordering barrier.

Recommendation: D. It is the smallest model that simultaneously preserves persistent editor/route results and truthful domain behavior.

## 11. Recommended Entry Ownership

The entry store is an app/core mechanism. It creates one entry scope directly beneath an app-owned entry container. A committed entry and every resource required solely for it end together.

```text
Application lifetime
├─ feature plugin scopes
├─ entry container
│  ├─ Entry 41 scope
│  │  ├─ provider lease: gpx
│  │  ├─ active rendering generation
│  │  └─ entry operation children
│  └─ Entry 42 scope
│     ├─ provider lease: photo
│     ├─ object URL
│     └─ marker/popup interaction registrations
├─ domain-provider plugin scopes
└─ runtime/core infrastructure
```

The creator receives the committed ID/snapshot, not ownership. Creation authority is scope-bound so a stale creator cannot submit work after its plugin/request closes, but once commit succeeds the entry no longer depends on that authority.

## 12. Domain Provider Lifetime

Every uncommitted creation and committed entry acquires a lease against its provider registration. The lease is held by the destination entry scope, not the creator.

Explicit provider-plugin uninstall while leases exist must reject with an actionable error containing the domain ID and dependent entry IDs/count. It must not cascade-delete entries, keep inert entries, or pretend that a service-only registration is sufficient.

Recommended factoring:

```text
Photo domain provider plugin
  owns domain registration and Photo entry behavior

Photo input plugin
  recognizes JPEG, loads EXIF implementation lazily, normalizes import
  depends on/uses Photo domain capability

Photo UI contributions
  optional consumers of Photo domain operations
```

These may initially ship together for packaging convenience, but the contracts and lifetimes must remain separable. If bundled into one plugin, live Photo entries retain the whole plugin until removed; that is valid but less lightweight.

## 13. GPX Domain Boundary

GPX owns:

- parsing, normalization, serialization, and naming;
- tracks, segments, points, routes, route points, and waypoints;
- track/route/waypoint global and per-entry visibility;
- track style presets and domain presentation;
- elevation/time interpretation and nearest-point logic;
- GPX overlay construction and updates;
- GPX-specific selection sub-identities and interaction surfaces;
- GPX summaries, export operations, and editor-readable snapshots.

Generic core owns only the GPX entry ID, domain association, whole-entry visibility, entry lifecycle, and provider lease.

Current `addGpxSource`, `updateGpxSource`, `get/setGpxTrackVisibility`, `getEffectiveGpxTrackVisibility`, GPX global visibility, `buildGpxOverlay`, GPX branches in Selection/Interaction Hubs, and GPX formatting must move behind the GPX domain boundary. GPX may be a default built-in domain provider, but generic core must not statically import it.

## 14. Photo Domain Boundary

Photo-domain responsibilities include normalized Photo data, coordinate/time interpretation state, marker/popup presentation, Photo-specific selection/interaction, object URL lifetime where retained, time-mode commands, and optional inference coordination.

JPEG recognition, file acquisition, and EXIF parsing are input/import responsibilities. Photo settings/layers cards are UI contributions. The EXIF implementation is therefore not intrinsically part of generic core or necessarily needed after creation.

Recommended import boundary:

```text
JPEG input plugin
  -> parse EXIF without creating persistent preview resources
  -> pass normalized metadata plus the File/Blob to Photo creation
  -> Photo provider creates the preview URL inside the destination entry scope
  -> Photo domain provider commits entry
```

Current `parsePhotoFile()` calls `URL.createObjectURL(file)`, so this is concrete migration pressure: either parsing must stop allocating the persistent URL or the provider-controlled creation transaction must supply the destination scope to the parsing step. The former is simpler and avoids adoption. If time-mode changes require original timestamp fields, the Photo provider stores normalized values needed to recompute. It need not retain or reload the EXIF parser. The provider-created URL is entry-owned and revoked on failed creation/removal/app destruction.

GPX-based location inference is a cross-domain operation. It should be an explicit optional integration using read-only GPX capability/data snapshots, not `state.sources` scanning in core. Exact capability wiring belongs to Phase 2D.

## 15. Source/Data Boundary

Generic core should store one opaque provider instance, not a universal `source` wrapper. A generic `{kind,data,metadata}` wrapper merely relocates type switches and invites mutable metadata conventions.

Domains expose read-only domain snapshots or focused queries through their APIs. For example, GPX can provide a document snapshot suitable for editing/export; Photo can provide normalized display metadata. Snapshots must not grant mutation authority and may be immutable copies or documented immutable values.

Serialization and editing are domain operations. Replacement accepts domain values through the provider, not by assigning `entry.source`. Provenance—file name, route endpoint, import time—may be domain data or a later cross-domain contribution only if a demonstrated generic requirement emerges.

## 16. Entry Mutability Model

Raw entries and domain data are not publicly mutable.

Use explicit commands:

```text
generic: setVisible(id, boolean), remove(id)
GPX:     replaceDocument(id, nextDocument), setTrackVisible(...)
Photo:   setTimeMode(id, mode)
```

A command:

1. validates the caller scope and entry/provider liveness;
2. validates domain and input;
3. prepares replacement data/resources without changing the active generation;
4. invalidates affected selection/interaction state at commit;
5. atomically switches provider-private active state;
6. emits a minimal change descriptor after commit;
7. disposes superseded resources best-effort.

Generic core need not understand the domain change. Stale snapshots remain snapshots; stale handles reject mutation after entry removal. Copy-on-write is an implementation option, not a generic contract. The important contract is explicit authority and transactional visible state, not universal immutability internally.

## 17. Entry Creation and Commit

Recommended flow:

```text
creator calls registered domain creation authority
  -> verify creator/app/provider alive
  -> reserve never-reused EntryId
  -> create uncommitted app-owned entry scope
  -> acquire provider lease in that scope
  -> provider validates/normalizes opaque data
  -> provider prepares controller, rendering and owned resources
  -> apply requested generic visibility and prepare attachment
  -> preflight entry-store commit
  -> synchronously publish envelope
  -> notify after commit
  -> return immutable snapshot/ID
```

Preparation may attach a Leaflet layer immediately if attachment is necessary to validate success. As in Phase 2B, transient visual atomicity is not promised, but the layer must already be owned and rollbackable before attachment. The entry is not publicly discoverable until all required preparation succeeds.

If any pre-commit step fails, the uncommitted destination scope closes, releases the provider lease and all resources, and the ID remains unused forever. This is direct creation under the final app owner, not adoption or generic scope transfer. No narrow adoption mechanism is required for current cases; a provider should copy/normalize creator data or acquire resources inside the supplied destination scope.

## 18. Persistent Entry Lifetime

The entry scope begins before preparation and becomes the persistent committed scope. It is a child of the app's entry container, not a plugin scope.

It owns:

- the domain-provider lease;
- opaque entry controller/data disposal;
- active and superseded rendering-generation scopes;
- object URLs and entry listeners;
- entry-local async derivation and operational children;
- typed interaction registrations associated with the entry.

Only entry-store removal, clear, or app destruction ends it. Creator uninstall has no effect. Provider loss cannot occur normally because the lease blocks it.

## 19. Entry Removal

Recommended ordering:

```text
serialize removal for ID
  -> mark removing and revoke mutation/operation authority
  -> remove from public lookup/list atomically
  -> invalidate entry and domain-subidentity selection
  -> withdraw interaction publications
  -> close/abort entry scope and children
  -> remove rendering and release URLs/resources best-effort
  -> release provider lease last
  -> publish removed notification
  -> return removed snapshot or aggregate failure
```

The logical entry ceases to be discoverable before callbacks or asynchronous cleanup can observe it half-removed. Lifecycle consumers receive a generic entry-removal identity; entry core does not interpret selection payloads.

If cleanup fails, the public entry stays removed. Successful records are not rerun; retry-safe residuals remain in private app cleanup tracking, and the provider lease remains until the residual entry scope fully disposes. This avoids a public entry that appears usable after its rendering was partly dismantled. Its ID remains reserved. Removal errors state that logical removal committed and cleanup is incomplete.

## 20. Clear-All Semantics

`clear()` is a coordinated batch of ordinary removals, not an atomic rollbackable transaction.

- Stop new entry mutations for the duration of the batch.
- Clear/invalidate selection once for the batch when Phase 2E supports it.
- Remove entries in reverse insertion order, matching resource-stack intuition and making the order deterministic.
- Continue after failures and aggregate cleanup errors.
- Batch the public change notification so UI need not rerender for every item; domain cleanup itself is still per entry.
- Return/report partial failure truthfully: every targeted entry is logically absent, while residual cleanup may remain privately tracked.

Atomic clear would require restoring disposed external resources and is neither realistic nor required by current behavior.

## 21. Entry Replacement

Two concepts must remain distinct:

1. **Domain update preserving identity.** The same logical document instance receives new provider-managed data/presentation. Examples: Photo time mode, an explicit GPX replace-document command.
2. **Remove plus create.** A new logical result receives a new ID. Examples: editor Save Copy, route-search result, cross-domain conversion.

For identity-preserving updates, the provider prepares a new generation child under the existing entry scope. Before switching, failure leaves the old generation and selection intact, matching current Photo/GPX tests. At switch, affected selection is invalidated by default; the active provider instance/generation changes; whole-entry visibility and list position remain. Domain presentation is preserved only according to the domain command's explicit rules.

The old generation then disposes. A post-switch cleanup failure cannot roll the new generation back reliably; the command reports a committed update with residual cleanup, which the entry scope retains for later disposal. Later Phase 2E may permit explicit selection remapping, but stale selection is never preserved implicitly.

## 22. Presentation State

Generic presentation contains only whole-entry visibility. Even a display name is domain-derived today (`source.name`) and may not exist for every future domain.

GPX owns style preset, global track/route/waypoint toggles, and per-track visibility. Photo owns time mode/offset and marker/popup policy. Renderer-internal cache state is not persistent presentation and is never exposed.

Domain presentation changes use domain commands and publish domain change descriptors. Generic consumers learn that an entry changed; domain-aware consumers may inspect the descriptor or query a new snapshot. Core does not merge arbitrary presentation bags.

## 23. Whole-Entry Visibility

Whole-entry visibility is retained as generic because every current entry and evaluated future map domain needs a single application-level shown/hidden control, and the layers UI/remove lifecycle needs consistent semantics.

The store owns the boolean; the provider controller implements its effect. Effective GPX visibility is conceptually:

```text
entry.visible
AND GPX category visibility
AND GPX per-subitem visibility
```

Core supplies only the first operand. Hidden state normally detaches or suppresses rendering without disposing domain data/resources, allowing inexpensive re-show. Hiding must disable entry interactions and invalidate any selection whose target is no longer interactable; exact selection policy is finalized in Phase 2E. A domain for which visibility is meaningless may render no visible resource, but still accepts the generic state without special core code.

## 24. Rendering Boundary

Generic core must not call `buildGpxOverlay()` or `buildPhotoOverlay()`, inspect Leaflet child layers, or bind domain clicks.

The domain provider prepares an entry controller that can conceptually:

```text
setWholeVisible(boolean)
fitToView()            // optional capability, not guaranteed generic field
dispose via entry scope
perform domain commands
```

Whether rendering is implemented directly by the provider or delegated to a renderer registration is a Phase 2D/later choice. The provider remains responsible for producing entry-owned disposable handles and for not exposing raw map resources as mutable entry fields.

Generic core may host a narrow map-attachment mechanism, but it must treat attachment handles opaquely. Final rendering API design is deferred.

## 25. Entry-Local Resources

Entry-owned resources include rendered groups/markers, their event bindings, popup-related handles, Photo object URLs, derived caches with disposal needs, entry-specific subscriptions, and async derivation that must stop when the entry is removed.

An active rendering generation is a child of the entry scope so replacement can prepare a sibling generation, switch, and close the old one. Temporary operations such as a domain recomputation may use shorter children.

Not entry-owned:

- input controls and fetch requests before commit: creator/operation scope;
- provider registry and shared domain caches: provider scope or shared manager;
- editor draft layers: editor-session child scope;
- caller map: caller-owned, while entry attachments to it are entry-owned.

## 26. Selection and Interaction Requirements

Phase 2E receives these requirements:

- selections reference stable entry IDs, never mutable entry objects;
- domain sub-identities are opaque to entry core but interpreted by the provider/adapter;
- removal invalidates every selection rooted at the entry before entry resources dispose;
- identity-preserving domain updates invalidate affected sub-identities by default;
- renderer generation replacement withdraws old interaction registrations before old resources dispose;
- interaction registrations are owned by the entry generation/scope;
- provider removal cannot occur while live identities depend on it;
- generic lifecycle coordination invokes a typed invalidation contract, not a global unstructured event bus.

Entry core should call the generic invalidation mechanism or commit a typed lifecycle change that Selection consumes synchronously. It must not contain GPX/photo selection branches.

## 27. Refresh/Reactivity Requirements

The minimal conceptual changes are:

- `added(entrySnapshot)`;
- `removed(entryId, priorSnapshot)`;
- `visibilityChanged(entrySnapshot)`;
- `domainChanged(entryId, domainChangeDescriptor)`;
- optionally one batch envelope for clear.

The entry store emits generic lifecycle changes after commit. Domain commands supply an opaque or typed domain descriptor without core interpretation. Notifications are callback-isolated and cannot roll back committed state. Domain render controllers update as part of the command transaction rather than waiting for a global refresh.

This replaces coarse `refreshView()` for entry correctness. Phase 2D decides subscription/contribution mechanics; no general reactive graph is required.

## 28. External Plugin Entry Access

External plugins may conceptually:

- list immutable generic entry snapshots;
- resolve a snapshot/guarded handle by ID;
- subscribe to typed entry lifecycle changes;
- change whole-entry visibility and remove entries through guarded generic commands;
- obtain a registered domain API and create/query/mutate that domain's entries;
- request optional operations such as fit-to-view through an advertised capability.

They may not access `state.entries`, parallel arrays, `entry.source`, `entry.layer`, `entry.interactions`, or mutable presentation objects. Generic lookup does not expose domain data merely because the caller knows the domain string. Domain APIs define safe read snapshots and mutation commands.

## 29. Validation Against `x-track-editor`

Future lifecycle:

```text
editor plugin scope
  -> query GPX snapshots through GPX API
  -> create editor-session child
  -> copy selected GPX document into draft
  -> own draft layers, history, rectangle and local selection in session
  -> temporarily issue GPX presentation commands for original entry
  -> Save Copy calls GPX create under app entry owner
  -> committed saved entry receives new ID
  -> editor session ends
```

The original entry remains app-owned. The session watches entry lifecycle; if the original ID is removed or ceases to be GPX, it cancels, matching current refresh behavior. Uninstall closes drafts and restores only still-live presentation state. The saved entry contains normalized GPX data and depends on the GPX provider, not the editor. It survives editor uninstall.

This removes raw source mutation without forcing the editor into generic core. GPX must expose an editor-suitable immutable snapshot and creation capability; exact schemas remain outside Phase 2C.

## 30. Validation Against `x-route-search`

The request child belongs to the route-search plugin and is aborted/guarded on uninstall. When a result arrives, route search converts or hands it to the GPX domain creation API. Creation builds a new app-owned entry scope directly; after commit, request and plugin lifetimes are irrelevant.

The resulting entry remains after route-search uninstall, preserving current behavior. The GPX provider lease remains. If route search later returns a native route domain instead, that provider—not generic core—changes; the ownership model does not.

## 31. Validation Against Photo / Issue #74

A GPX-only app does not register/load the Photo provider or JPEG input plugin. Literal lazy plugin loaders therefore keep Photo and EXIF modules out of its module graph.

With Photo enabled:

```text
JPEG input operation
  -> lazy EXIF parse
  -> normalized Photo creation request
  -> app-owned Photo entry + provider lease
  -> entry owns preview URL and marker resources
```

Removing only Photo input/UI registrations leaves entries functional. Removing the Photo provider is rejected while Photo entries exist. If packaging combines all roles in one plugin, uninstall is likewise rejected; splitting roles is recommended so import/UI can remain truly optional.

EXIF parsing need not stay operational after import if normalized original timestamp/GPS fields suffice for all Photo commands. The module may remain cached by JavaScript, but unused GPX-only configurations never import it. This satisfies the architectural requirement without making generic core understand JPEG or EXIF.

## 32. Future Domain Validation

### GeoJSON

A `geojson` provider owns feature collections, style rules, feature sub-identities, and Leaflet rendering. Core stores only ID/domain/visibility and lifecycle. It can be added without changing entry core.

### Generic marker collection

A `markers` provider owns marker records, clustering/presentation, and marker selection identities. Whole-entry visibility hides the collection; entry removal disposes markers. No GPX-shaped wrapper is needed.

KML or a native route-result domain follows the same pattern. Each can define its own snapshots, domain commands, selection sub-identities, and renderer while using unchanged generic listing/removal/visibility/provider-lease mechanisms.

## 33. Domain Registration Requirements

Phase 2D's domain-provider registration must provide:

- one unique stable domain ID;
- owner scope and liveness;
- entry preparation/validation under an app-created destination scope;
- creation of a private entry instance/controller;
- whole-entry visibility integration;
- entry disposal through owned records;
- safe domain query/command capability;
- later selection/interaction adapter hooks;
- a lease/uninstall-guard mechanism for creations and live entries;
- deterministic duplicate/conflict handling and staged plugin-setup commit;
- lazy provider availability without generic-core imports.

It must not require one universal data schema, expose provider internals, or equate domain ID with plugin ID.

## 34. Domain Provider Removal Constraints

Provider removal is blocked by an **entry lifetime lease**, not a plugin `requires` edge. The dependent is application data, not an installed plugin, and its lifetime changes dynamically.

Alternatives:

- Cascade-delete entries: surprising/destructive and makes plugin management a data-deletion API.
- Keep inert entries: violates truthful availability and complicates every generic consumer.
- Serialize/migrate to generic data: impossible without a universal schema and may lose semantics.
- Convert leases into plugin dependency edges: misrepresents the graph and cannot identify entry dependents.
- Runtime uninstall guard backed by provider leases: explicit, diagnosable, and directly models the constraint.

Recommendation: `unuse(providerPlugin)` rejects with a provider-in-use error listing domain/count/entry IDs. UI/input plugins without provider registration remain freely removable. App destruction bypasses the user-facing rejection only by disposing entries before final provider teardown.

## 35. App Destruction Ordering

```text
app state -> destroying; revoke all new mutation/creation authority
  |
  +-> identify provider plugins retained by live entry leases
  |     plus their transitive hard dependencies
  |
  +-> teardown all other plugins in reverse dependency order
  |
  +-> invalidate global selection/interactions
  |
  +-> dispose entries in reverse insertion order, best-effort
  |     (providers and retained dependencies are still alive)
  |
  +-> teardown retained provider/dependency plugin graph
  |
  +-> dispose entry store, selection/interaction, core/runtime
  |
  +-> remove Tilia-owned map; preserve caller-owned map
```

Simply tearing down all plugins first would strand entry disposal; disposing entries before every feature plugin would let plugins receive callbacks from dying entries. The two-stage graph respects both constraints. A provider plugin's hard dependencies remain with it until entry disposal; Phase 2A dependency order still applies within each eligible set.

All stages continue after failures and aggregate them. App destruction remains terminal.

## 36. Entry Failure Semantics

| Failure | Required result |
|---|---|
| validation/preparation/attachment before create commit | entry never public; destination scope rolls back; ID not reused |
| notification after create commit | entry remains committed; callback error reported separately |
| domain update before switch | old data/rendering/selection remain |
| domain update after switch, old cleanup fails | new generation remains; residual tracked; error says update committed |
| remove cleanup fails | entry remains logically absent; residual scope privately retained; provider lease remains |
| provider unexpectedly unavailable | runtime invariant violation; block entry operations, report fatal diagnostic, attempt cleanup at destroy |
| selection invalidation fails | continue resource disposal; aggregate error; selection mechanism must independently mark target invalid |
| object URL release fails | aggregate as resource cleanup failure; do not restore public entry |

A public entry-level quarantine state is unnecessary. Cleanup-failed entries are not usable data records; exposing them would recreate half-alive state. Private residual cleanup tracking under the app is sufficient and preserves truthful public state.

## 37. Alternative Entry Architectures

### A. Generic mutable objects

Easy migration and convenient editor access, but cannot enforce ownership, atomic replacement, provider lifetime, or stale-reference safety. It preserves current GPX/Photo switches and parallel-state risks. Reject.

### B. Generic records plus domain services

Core owns minimal records while GPX/Photo services own semantics. This gives strong domain isolation and testability. Without guarded handles and entry scopes, however, service data and rendering lifetime can drift.

### C. Domain-owned implementations behind generic handles

Encapsulates domain state and gives good editor/domain APIs. If the provider owns the whole lifetime, plugin uninstall and persistent data conflict.

### Recommended combination

Use B for the store/registration boundary and C for each private entry instance, with application ownership and a provider lease. Public values are immutable generic snapshots/handles; provider instances remain private inside entry scopes.

Migration cost is substantial—`core/boot.js` must split and consumers must stop reading state—but this is a major-version design and directly removes the static Photo/EXIF and mutable-core coupling.

## 38. Recommended Entry Contract

### Relationship model

```text
Application
├─ DomainRegistry
│  ├─ gpx -> provider registration (leased by entries 1, 3)
│  └─ photo -> provider registration (leased by entry 2)
└─ EntryStore
   ├─ {id:1, domain:gpx, visible:true} -> private GPX instance + scope
   ├─ {id:2, domain:photo, visible:true} -> private Photo instance + scope
   └─ {id:3, domain:gpx, visible:false} -> private GPX instance + scope
```

### Architectural sketches

```js
// GPX import/editor/route result
const entry = await gpx.create(gpxDocument, { visible: true, fitToView: true });

// Photo import; EXIF parser remains outside generic core
const normalized = await photoImport.read(file, { signal: operation.signal });
const entry = await photo.create(normalized, { visible: true });

// Generic read and visibility
const entries = entryStore.list(); // immutable {id, domain, visible}
await entryStore.setVisible(entry.id, false);

// Domain presentation
await gpx.setTrackVisible(entry.id, trackId, false);

// Removal
await entryStore.remove(entry.id);

// Editor save-copy and route search both create destination-owned entries
const saved = await gpx.create(editorDraft.toDocument(), { visible: true });
const routeEntry = await gpx.create(routeResult.toGpx(), { visible: true });

// Provider uninstall
await app.unuse("tilia-photo-domain");
// rejects DomainProviderInUse while Photo entry IDs remain

// Destruction
await app.destroy();
// feature plugins -> entries -> retained providers/dependencies -> core -> owned map
```

Names are illustrative. Phase 2D defines registration/capability shapes, and later phases define selection/UI/rendering contracts.

## 39. Core Invariants

1. Every committed entry has one stable, never-reused app-local ID.
2. Every entry has exactly one registered domain ID for its entire lifetime.
3. Creator identity never determines committed entry lifetime.
4. The application owns every committed entry scope.
5. Every live/uncommitted entry holds a provider lease.
6. A provider cannot uninstall while an entry or creation holds its lease.
7. Generic core never interprets GPX, Photo, EXIF, tracks, routes, waypoints, or domain presentation.
8. Generic public snapshots expose no mutable domain or rendering internals.
9. Creation publishes an entry only after provider/resource preparation succeeds.
10. Failed creation disposes its destination-owned scope and never reuses its reserved ID.
11. Whole-entry visibility is generic and composes with, but does not replace, domain visibility.
12. Domain commands are the only supported domain mutation path.
13. Identity-preserving updates preserve generic identity/list position and invalidate stale sub-identities by default.
14. Remove-and-add always creates a new identity.
15. Entry removal makes the record unavailable before asynchronous cleanup.
16. Entry removal ends every entry-owned rendering, URL, listener, task, and interaction registration.
17. Cleanup failure never restores a half-disposed public entry.
18. Saved editor and route-search results do not inherit creator-plugin lifetime.
19. Selection and interaction reference entry IDs, not mutable entry objects.
20. Caller-owned maps survive app destruction; entry-owned attachments do not.

## 40. Migration Pressure

| Current API/data | Classification | Direction |
|---|---|---|
| `app.core.state.entries` / `app.state.entries` | replace | private EntryStore plus snapshots/subscription |
| `state.sources`, `state.layers` | remove | domain instances and entry scopes eliminate parallel arrays |
| `addGpxSource` | move to GPX domain | guarded GPX creation capability |
| Photo creation inside input handler | move to Photo domain | JPEG handler requests Photo creation |
| `removeEntry`, `clearAll` | retain concept, move behind generic entry API | async scoped cleanup and aggregation |
| `setEntryVisibility` | retain concept, move behind generic entry API | provider controller applies effect |
| `fitEntryToView` | defer/typed capability | not every domain/rendering mode has bounds |
| GPX global and track visibility methods | move to GPX domain | no core GPX fields |
| `updateGpxSource` | move to GPX domain | explicit transactional replace-document command |
| `updatePhotoTimeMode` | move to Photo domain | explicit Photo command |
| `buildGpxOverlay` | move to GPX rendering implementation | provider-owned resources |
| `buildPhotoOverlay` | move to Photo rendering implementation | provider-owned resources |
| `entry.presentation` | replace | generic visibility plus private domain presentation |
| `entry.layer`, `entry.interactions` | remove from public model | entry generation scope/private registrations |
| `entry.source` | remove from generic model | domain snapshot/query API |
| selection methods carrying entries | defer to Phase 2E | use ID plus domain sub-identity |
| GPX/Photo branches in Interaction Hub | replace/defer | typed provider registrations |
| `refreshView()` for entry changes | replace for correctness | committed lifecycle/domain change notifications |

## 41. Requirements Passed to Phase 2D

Extension mechanisms must provide:

- staged, owned domain-provider registration with stable domain IDs;
- provider lookup/capabilities without mutable registry access;
- scope-bound entry creation authority;
- provider leases and uninstall guards whose diagnostics identify live entries;
- domain query/command services that reject after owner death;
- typed lifecycle/change subscriptions with callback isolation and batching;
- input handlers that can discover/use domain creation without coupling transport to core;
- no automatic equation of service, plugin, and domain identity;
- lazy registration/loading consistent with unused Photo/EXIF isolation.

## 42. Requirements Passed to Phase 2E

Selection and interaction must support:

- stable entry IDs and opaque domain sub-identities;
- synchronous invalidation at removal and renderer-generation replacement;
- default invalidation on domain data replacement, with explicit remapping only if specified;
- entry-generation-owned interaction publications;
- withdrawal events/handles before resource disposal;
- provider adapters for domain popup/presentation behavior;
- no GPX/Photo imports in the generic hub;
- safe behavior when hidden entries or unavailable providers are referenced.

## 43. Requirements Passed to Phase 2F

UI and external-plugin design must provide:

- immutable entry listing and lookup;
- generic whole-entry visibility/removal actions;
- domain-supplied labels, summaries, thumbnails, and domain actions through contributions;
- GPX and Photo operations through guarded domain APIs;
- lifecycle/change subscriptions instead of `refreshView()` and state polling;
- no public Leaflet layers, mutable `source`, or presentation bags;
- layers/settings UI composition that does not branch on domains in shared implementation;
- clear diagnostics for provider-in-use uninstall attempts.

## 44. Open Questions Requiring Human Decision

1. **Minimal public envelope:** approve only `id`, `domain`, and `visible`; recommendation: yes, keep label/order metadata domain/UI-contributed until evidence proves generic need.
2. **Provider removal:** approve rejection while live entries or creations hold leases; recommendation: yes, with no public cascade/force option.
3. **Photo factoring:** require separate conceptual Photo domain and JPEG/EXIF input roles, while allowing one initial package/plugin; recommendation: yes.
4. **GPX packaging:** make GPX a default built-in domain provider rather than generic core; recommendation: yes, so the boundary is real even if normally enabled.
5. **Whole-entry visibility:** retain as mandatory generic state; recommendation: yes for Tilia's map-entry scope.
6. **Display name:** omit from the generic envelope and obtain it via domain/UI presentation; recommendation: yes.
7. **Removal cleanup failure:** keep entry logically removed and track residuals privately; recommendation: yes, rather than expose entry quarantine.
8. **Post-switch replacement cleanup failure:** report “committed with residual cleanup” rather than roll back the new generation; recommendation: yes because reverse restoration is not generally reliable.
9. **Clear order:** reverse insertion order with batched notifications; recommendation: yes.
10. **App destruction refinement:** retain providers and their transitive dependencies through entry disposal; recommendation: yes.
11. **Narrow adoption:** no adoption API in the initial design; require direct destination-owned preparation/copy. Revisit only if a demonstrated non-copyable resource crosses creation boundaries.
12. **Fit-to-view:** treat as an optional rendering/domain capability rather than a universal entry operation; recommendation: yes.

## 45. Files and Symbols Consulted

- `plugin-architecture/DESIGN.md` — mechanism/domain and optionality principles.
- `plugin-architecture/PHASE-1-INVENTORY.md` — current architecture baseline.
- `plugin-architecture/phase-2/RUNTIME-DESIGN.md` — plugin/provider lifecycle and destroy constraints.
- `plugin-architecture/phase-2/OWNERSHIP-DESIGN.md` — scopes, destination ownership, liveness, disposal.
- `src/core/state.js` — `createAppState`, `addEntry`, parallel arrays, replacement/removal.
- `src/core/boot.js` — GPX/Photo creation, update, visibility, removal, clear, input registration.
- `src/map/layers.js` — `buildGpxOverlay`, `buildPhotoOverlay`, popup presentation, map fitting.
- `src/core/selection-hub.js` — entry-object/domain-shaped selection and invalidation.
- `src/core/interaction-hub.js` — GPX/Photo-shaped layer publication.
- `src/core/input-registry.js`, `input-processing.js` — current creator/dispatch boundary.
- `src/gpx/source.js`, `parse.js`, `interpretation.js`, `serialize.js` — GPX data/domain behavior.
- `src/photo/exif.js`, `infer-location.js`, `src/core/photo-time-utils.js` — Photo import/domain behavior.
- `src/plugins/ui/layers-control.js`, `elevation-panel.js`, `settings-panel.js` — direct entry/domain coupling.
- `plugins/x-track-editor/loader.js`, `draft.js`, `editing-layers.js` — draft/save-copy lifecycle.
- `plugins/x-route-search/loader.js`, `client.js` — request-to-persistent-GPX lifecycle.
- `plugins/x-gpx-export/loader.js`, `plugins/x-milestone/loader.js` — direct source/layer access.
- `tests/state.test.js`, `tests/boot.test.js` — ID, replacement, visibility, failure, removal, clear behavior.
- `tests/selection-hub.test.js`, `tests/interaction-hub.test.js` — identity and layer coupling.
- `tests/x-track-editor-*.test.js`, `tests/x-route-search-*.test.js`, `tests/layers-control.test.js` — external/UI assumptions.
- `tests/smoke/editor.spec.js`, `viewer-photo-*.spec.js`, `viewer-file-import.spec.js` — integrated behavior.

---

No source code was modified. This design investigation created only `plugin-architecture/phase-2/ENTRY-DOMAIN-DESIGN.md`.

- Unit tests: `npm test` — 37 files, 336 tests passed.
- Smoke tests: `npm run test:smoke` — 28 tests passed.
- Formatting check: `git diff --no-index --check /dev/null plugin-architecture/phase-2/ENTRY-DOMAIN-DESIGN.md` — passed (the expected content-difference exit status was ignored; no whitespace errors were reported).
