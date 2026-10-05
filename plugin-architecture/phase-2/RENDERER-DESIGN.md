# Phase 2G — Renderer Architecture Design

## 1. Executive Summary

Tilia should treat map rendering as an optional, disposable projection of committed semantic entries. Application-owned render controllers coordinate one separately registered primary domain renderer and replace generation-scoped Leaflet resources transactionally.

The recommended model is:

- Domain semantics and map rendering are separate contracts. `DomainRendererRegistry` permits at most one active primary renderer per domain ID; a semantic domain may exist without a renderer.
- `RenderingCoordinator` is app/core infrastructure. It creates one long-lived `EntryRenderController` for each committed entry and keeps that controller while the entry exists, even when no renderer is installed.
- A controller is generic coordination state; the domain renderer interprets domain snapshots/changes and builds resources. Generic infrastructure never understands GPX tracks or Photo markers.
- Each active projection is one `RenderGeneration`: a destination-owned child scope containing Leaflet layers/groups, interaction bindings, render-derived presentation resolvers, subscriptions, caches, and async work.
- Each controller uses a monotonically increasing opaque generation token and records the private entry semantic revision from which the generation was built. Neither is semantic identity.
- Replacement builds generation N+1 while N remains valid, preflights/mounts N+1, synchronously switches the active token/bindings, publishes availability, then withdraws/disposes N. Failure before switch rolls back N+1 and retains N when N still represents current semantics.
- After a semantic revision commits, an old generation may remain visually mounted while replacement builds, but it is explicitly stale: interactions and renderer-derived anchors/highlights are disabled. A renderer may hide it if stale display would be misleading. It is never reported as current.
- Safe in-generation updates are allowed only when the renderer guarantees semantic-target bindings remain valid and the update is rollback-safe or cannot partially fail. Whole visibility and simple style/child membership changes may qualify; geometry/target topology normally creates a new generation.
- Entry semantic commit does not wait for rendering. Renderer failure cannot roll back or delete the entry. Rendering availability is independently observable as `unavailable`, `building`, `active`, or `failed`.
- Renderer-originated listeners are generation-owned and translate physical events into domain-issued semantic intents before leaving the generation. Stale tokens/liveness prevent old callbacks from mutating state.
- Map presenters resolve immutable anchor and bounds descriptors through the active controller. Highlight is created through a controlled renderer method into the presenter's supplied scope; no foreign layer is exposed.
- Domain semantic geometry is preferred for fit/reveal and plugin overlays. Renderer-derived bounds are a fallback for presentation-specific extents.
- A narrow typed rendering-status/generation subscription is required for presenters because rendering may change without semantic selection changing. It replaces neither domain changes nor a global refresh event.
- Renderer plugins may uninstall while entries remain. Registration withdrawal first makes the renderer unavailable and closes all generations built by it; controllers persist and rebuild if another renderer is later installed.
- App-owned pane classes and z-order bands cover base, domain geometry, domain markers, derived overlays, selection, and modal/session overlays. Plugins use owned named panes only when bands are insufficient.
- Plugin-owned overlays consume semantic/domain snapshots and own independent resources through the map facade. No first-class augmentation registry or raw foreign layer access is introduced.
- Base maps remain application map infrastructure, outside EntryStore/domain rendering.

This completes the missing renderer boundary without creating a scene graph or graphics framework.

## 2. Inputs and Phase 2A–2F Constraints

The design preserves:

- transactional plugin/registration setup and explicit teardown;
- one owner scope per resource, no ownership transfer, stale async rejection;
- app-owned semantic entries and private domain data/controllers;
- typed registries/subscriptions and guarded facades;
- semantic selection `{entryId,domain,ref}` independent of render identity;
- generation/session-owned interaction bindings;
- presenter-owned popup/highlight and guarded map access;
- no raw cross-plugin layers or mutable core state;
- semantic entries surviving presentation failure/removal.

Phase 2G introduces a private monotonic semantic revision on each entry. This does not change Phase 2C's minimal public envelope; it formalizes the revision concept already required by Phase 2E's revision-scoped references.

## 3. Current Rendering Architecture

```text
createTiliaCore
  -> parse/normalize GPX or Photo
  -> buildGpxOverlay/buildPhotoOverlay
  -> store FeatureGroup in entry.layer
  -> store raw child handles in entry.interactions
  -> mutate FeatureGroup membership for visibility
  -> bind selection listeners directly to child layers
  -> add/remove FeatureGroup on Leaflet map
  -> publish raw layers through Interaction Hub
```

`src/map/layers.js` creates GPX FeatureGroups containing track/route polylines and route-point/waypoint markers, and Photo FeatureGroups containing one marker. `src/core/boot.js` owns GPX/Photo branches, visibility, selection listeners, map attachment, fit, replacement, and cleanup.

`updateGpxSource()` and `updatePhotoTimeMode()` build a replacement overlay, clear selection, add/remove groups, mutate `entry.layer/interactions/source`, and republish new raw layers. Current tests preserve the old entry if overlay creation/attachment fails, but old raw-layer subscribers receive no withdrawal event.

Entry groups are stored in parallel `state.layers`; removal/clear calls `.remove()`. Map popup creation lives in Selection Hub. Elevation/editor/route/milestone create independent markers/groups directly. Base maps use a separate manager and TileLayer lifecycle.

## 4. Current Rendering Inventory

| Resource | Current source/owner/storage | Future classification |
|---|---|---|
| GPX track/route polylines | `buildGpxOverlay`; core entry FeatureGroup | GPX domain entry renderer generation |
| waypoint/route-point markers | same; raw interaction handles | GPX generation bindings/resources |
| Photo marker/group | `buildPhotoOverlay`; core entry | Photo generation |
| selection popup | Selection Hub | map-selection presenter resource |
| elevation point marker | elevation plugin | presentation plugin overlay |
| editor draft polylines/markers/rings | editor session | session-owned overlay, not entry generation |
| rectangle shield/selection | editor child operation | session interaction/presentation resource |
| route origin/via/destination markers | route-search plugin | plugin/session-owned overlay |
| committed route result | new GPX source/overlay | ordinary GPX generation |
| milestone markers | milestone plugin from raw layers | plugin-owned derived overlay from GPX semantics |
| base TileLayer | base-layer manager | application map infrastructure |
| controls/panels | plugins/shell | UI resources, not renderer generations |

Current code encodes semantics in array positions and closures, not layer IDs, but external consumers retain raw layer and entry references. Rebuild therefore creates stale references even though semantic entry ID remains.

## 5. Renderer Terminology

- **Renderer:** generic ability to project semantic state onto a map; used only as an umbrella term.
- **Domain Renderer:** one registered implementation for a domain's map projection contract.
- **Entry Render Controller:** app-owned coordinator for one entry's rendering availability/current generation.
- **Render Generation:** one scoped projection built from one semantic revision by one renderer registration.
- **Render Resource:** owned Leaflet object, listener, cache, task, pane lease, or binding in a generation.
- **Render Binding:** generation-local mapping from physical surface input/presentation lookup to semantic reference/intent.
- **Semantic Target:** domain-defined object identified by an opaque selection reference.
- **Presentation Descriptor:** immutable anchor/bounds/status data resolved from the current generation without exposing layers.
- **Plugin-Owned Overlay:** independent plugin rendering derived from semantic data and owned outside the primary generation.
- **Map Infrastructure Resource:** base map, shared pane host, or shell integration not tied to an entry.

## 6. Domain Renderer Registration

Use a dedicated typed `DomainRendererRegistry`, separate from DomainRegistry. A semantic domain provider and renderer may ship in one plugin/package but register two contracts.

Exactly one primary renderer may be active per domain ID. Multiple primary renderers would require selection among them, duplicate interactions, and conflicting presentation availability without a current requirement. Duplicate registration rejects transactionally.

The renderer registration exposes private build/update/presentation hooks only to RenderingCoordinator. Plugins access rendering status/presentation through guarded facades, not the raw implementation. Registration is staged and owner-scoped. Its disappearance is allowed even with live entries.

## 7. Entry Render Controller

RenderingCoordinator creates one controller after entry commit. The controller is owned by an entry-associated presentation child scope under app rendering infrastructure, ordered to close before final entry-resource disposal.

It stores only generic coordination state:

```text
entry ID/domain
current semantic revision
renderer registration identity/liveness
availability/error
current generation record/token
pending build token/task
typed status subscribers
```

The domain renderer creates domain-specific generation content. The controller handles cancellation, token validation, swap, visibility forwarding, unregister/install transitions, and cleanup. It survives renderer removal but not entry removal.

## 8. Render Generation

A RenderGeneration is one immutable-lifetime projection of a specific entry semantic revision and renderer registration into concrete map resources.

Its destination-owned scope contains:

- primary Leaflet group/layers/markers/polylines;
- map attachment/pane leases;
- physical listeners and Phase 2E interaction bindings;
- semantic-target resolver closures valid for that revision;
- renderer-facing anchor/bounds/highlight hooks;
- generation-local derived caches/subscriptions/tasks;
- its `builtFromRevision` and opaque token.

The generation object itself is private. “Immutable lifetime” means resources cannot migrate to another generation; internal safe updates are permitted under section 10.

## 9. Generation Replacement Transaction

Recommended sequence:

```text
reserve token N+1; create destination generation scope
  -> build detached resources from snapshot revision R
  -> register bindings/resources immediately in scope
  -> preflight current entry/renderer/revision/token
  -> mount/attach N+1 in a callback-suppressed critical section
  -> atomically switch controller current token/descriptor/bindings
  -> publish post-commit generation status
  -> mark N inactive and withdraw its bindings
  -> dispose N best-effort
```

If build/preflight/mount fails before switch, N+1 rolls back. N remains active only if it still represents the current semantic revision. An unexpected post-switch old-generation cleanup failure leaves N+1 current and tracks N's residual privately.

Leaflet cannot guarantee pixel-atomic swaps; a synchronous critical section may briefly overlap layers. Observers see only one active token and no arbitrary callbacks during the switch.

## 10. In-Generation Update vs Replacement

A renderer may update in place only when:

- semantic-target mapping and interaction bindings remain valid;
- resource ownership does not change;
- the operation is non-throwing after preflight or has reliable rollback;
- stale async work is still token-guarded;
- it can advance `builtFromRevision` truthfully.

Likely in-place cases: whole-entry show/hide, GPX child membership visibility, simple `setStyle`, selected-state-independent icon style, viewport-derived cache refresh. Likely replacement cases: geometry/source topology change, Photo marker location generation rebuild, changed target locators, renderer implementation change.

Selection highlight is presenter-owned and does not force primary generation replacement. Performance never justifies retaining invalid target bindings.

## 11. Generation Identity

Each controller allocates a monotonically increasing opaque token, conceptually `{entryId, sequence}`. It is private except as an opaque value in rendering-status/presentation descriptors for stale checks and diagnostics.

Callbacks capture the token and must confirm it is current and both scopes are alive before semantic action. Sequence values are never reused during controller lifetime. Token equality has no semantic meaning and is not persisted.

## 12. Renderer State Model

Separate states:

- semantic/domain state: provider-owned data and presentation preferences;
- generic visibility: EntryStore `visible`;
- renderer-local derived state: cached geometry/style/bounds choices;
- generation resources: Leaflet objects/bindings/tasks;
- presenter state: popup/highlight visibility;

Public rendering availability needs only `unavailable`, `building`, `active`, and `failed`, plus current revision/token when active. `replacing` is an internal building condition while an old current generation may exist.

Renderer caches never become authoritative. Rebuild from semantic snapshots must be possible.

## 13. Visibility Architecture

- EntryStore owns whole-entry visibility.
- Domain owns GPX category/per-track or other sub-item presentation state.
- Renderer consumes both and computes effective resource visibility.
- Rendering availability is independent; visible entry may be unrendered/failed.
- Presenter suppression (popup hidden) is UI-local.

Whole visibility normally updates generation attachment in place. Domain visibility may add/remove child resources in place when bindings remain valid. Hidden resources may stay allocated but detached; renderer policy balances cost. Hidden semantic selection remains, while hidden bindings cannot dispatch physical interaction.

Generic coordinator forwards visibility/change snapshots but never interprets GPX fields.

## 14. Semantic Target Binding

Bindings are generation-private closures/typed records that capture `entryId`, domain renderer, canonical/revision-scoped `ref`, token, and owner scope. Dynamic surfaces such as a GPX polyline may compute a ref from hit coordinates rather than enumerate points.

The Leaflet object is only the physical event source. Before dispatch, the binding validates generation token, entry/domain revision as required, and canonicalizes through the domain selection adapter. Generic infrastructure transports but never interprets `ref`.

## 15. Interaction Binding

The domain renderer attaches Leaflet listeners using generation-owned map helpers and registers the binding with the Phase 2E interaction host at `object` tier. A physical event is translated into a typed semantic intent (normally a selection request) before leaving the generation.

Modal editor bindings live in the session and take precedence; background map binding remains app-owned. Closing/switching a generation marks bindings inactive before detaching listeners. Late events fail token/liveness checks and cannot select or mutate.

There is no raw-layer publication or generic callback broadcast.

## 16. Selection Independence

Photo sequence:

```text
selection = {entryId, photo, ref}
semantic Photo time mode commits revision R+1
old marker generation R becomes stale; interactions disabled
new marker generation builds and commits
old marker disposes
SelectionStore remains unchanged/refreshed by domain reconciliation
map presenter receives generation change and resolves new anchor/highlight
```

GPX point sequence is identical: domain reconciliation determines whether the ref remains/refreshed/remapped/invalid. Old polyline removal never clears selection by itself.

## 17. Renderer-Facing Presentation Contract

The active controller exposes a guarded resolver conceptually returning:

```js
{
  entryId,
  generationToken,
  builtFromRevision,
  rendered: true,
  anchor: immutable geographic anchor | null,
  bounds: immutable geographic bounds | null,
  canHighlight: boolean,
}
```

It also permits `mountHighlight(ref, destinationScope, options)` through a controlled renderer hook when supported. The descriptor contains values, not layers. Resolution validates current token/ref/visibility. Presentation callers cannot mutate primary resources.

## 18. Popup Anchor

Anchor is an immutable geographic descriptor, normally a lat/lon and optional preferred offset/anchor policy. It may come from domain semantics (Photo coordinate, selected GPX point) or current render calculation when symbol placement differs.

If target/entry is hidden, renderer unavailable, ref unresolved, or target has no map coordinate, the resolver returns no active anchor and the map presenter suppresses popup. Generation change invalidates the old descriptor token; presenter re-resolves.

No marker/layer is returned merely to anchor a popup.

## 19. Highlight Architecture

Use a hybrid controlled approach:

- Prefer immutable semantic/highlight geometry descriptors when a presenter can safely draw an independent overlay.
- Permit the active domain renderer to create a highlight into a presenter-supplied destination scope when representation depends on renderer-specific style/simplification.
- Never permit presenters to call `setStyle` on primary layers.

GPX point/line highlights can often be independent overlays. Photo selection may use a separate ring marker. The renderer hook owns construction logic, while the presentation scope owns resulting resources directly; generation/token liveness invalidates/rebuilds them.

## 20. Bounds / Reveal Architecture

Fit/reveal first asks the domain for immutable semantic extent/coordinate. This works without rendering and supports overlays such as milestone/elevation. Renderer-derived bounds are used only when presentation-specific extents matter or semantic computation is unavailable.

Renderer descriptors return cloned geographic bounds values, not `LatLngBounds` tied to layer state where practical. Viewport mutation goes through map facade. Fit/reveal remains separate from selection.

## 21. Domain Geometry vs Renderer Geometry

Canonical GPX points/routes, Photo coordinates, and route geometry belong to domain snapshots. Elevation, milestones, annotations, fit, and most highlights consume these semantic values.

Renderer geometry includes simplification, symbol offsets, cluster positions, screen-derived paths, and current layer bounds. It is private unless exposed as an immutable controlled presentation descriptor. This prevents renderer optimization from changing semantic APIs.

## 22. Renderer Replacement Notification

A narrow typed controller/status subscription is required because renderer install/removal/rebuild may occur without semantic or selection changes. Events/snapshots contain only entry ID, domain, availability, generation token, built revision, and failure diagnostic.

Notifications occur post-commit, are scope-owned and isolated, and may be batched per RenderingCoordinator. Presenters compare token/revision then re-resolve. This is not a global refresh event and carries no raw resources.

## 23. Renderer Availability

Observable states:

- `unavailable`: no committed renderer registration;
- `building`: no current generation and one build pending;
- `active`: current generation for current revision;
- `failed`: latest required build/update failed and no current generation for current revision.

Internally a controller may retain stale visual fallback or build replacement while reporting current/stale details diagnostically. UI shows entry semantics regardless and may indicate presentation unavailable.

## 24. Renderer Failure

- Initial render failure: entry remains; generation rolls back; state `failed`; retry on explicit request, renderer reinstall, or relevant later domain change.
- Renderer-only replacement at same semantic revision fails: prior generation remains active.
- Semantic revision replacement fails: prior generation may remain visually mounted but is stale/noninteractive and not exposed to presenters; state is failed. Renderer may hide it.
- Safe in-place update failure: rollback required; otherwise renderer must choose generation replacement instead.
- Interaction callback failure: semantic action rejects/reports; generation remains unless invariant failure.
- Cleanup failure: new current state remains; residual old scope follows Phase 2B aggregation/quarantine diagnostics.

Renderer errors never roll back semantic commits.

## 25. Async Rendering

Each build runs in the destination generation scope with its AbortSignal and tracked promise. It captures renderer registration, requested revision, and generation token. Completion publishes only if entry, renderer, revision, request token, and app are still current.

Replacement/uninstall/removal aborts stale builds and later completion rolls back silently/diagnostically. RenderingCoordinator serializes commit but need not implement a task scheduler. Latest revision may supersede intermediate queued builds.

## 26. Map Pane Ownership

Prefer a small set of application-owned panes/bands with app lifetime. Per-generation panes are prohibited. Domain renderers/plugins request a supported band through map facade.

Private panes, when necessary, use app-instance plus owner-ID namespacing and one owner lease. All contents/listeners are removed on owner close. Leaflet pane DOM removal is attempted only when safe; otherwise it is emptied/hidden and finally removed with Tilia-owned map/container teardown. Plugins never reference another owner's private pane name.

## 27. Z-Order Policy

Define a small stable ordering:

```text
base infrastructure
domain geometry
domain markers
derived plugin overlays
selection presentation
modal/editor session overlays
Leaflet popup/UI
```

Map facade maps these bands to panes/z-index ranges. Within a band, renderer/plugin owns local order; no arbitrary cross-plugin numeric negotiation. Current milestone negative marker offsets, route marker `1400`, and editor selection `1000` migrate to appropriate bands.

## 28. Map Facade Integration

One guarded facade serves renderers, presenters, and plugins with role-appropriate methods:

- `mountLayer`/`mountGroup` into a supported band or owned pane;
- `listen(target,event,callback)` with scope cleanup;
- private-pane lease creation;
- viewport/bounds/project queries;
- guarded fit/pan/reveal;
- `mountControl` for UI, outside generation rendering.

Methods infer destination scope and reject foreign resource mutation. Renderers receive no broader authority merely because registered as primary.

## 29. Raw Leaflet Map Escape Hatch

Advanced code may receive the caller-owned raw Leaflet Map explicitly, but supported behavior is limited to reading public viewport/projection and attaching resources it creates/owns with immediate scoped cleanup.

JavaScript cannot prevent mutation, yet Tilia does not guarantee behavior for inspecting/removing foreign layers, using private panes, retaining internal generation objects, or bypassing map helpers. No supported API returns primary renderer layers.

## 30. Plugin-Owned Overlays

A plugin-owned overlay reads guarded domain snapshots, subscribes to entry/domain/viewport changes, and creates independent map resources. Typical ownership:

- plugin scope for cross-entry overlay manager;
- per-entry child for milestones/arrows/warnings;
- presentation child for elevation hover/selection marker;
- session child for editor/route-search temporary layers;
- operation child for short previews.

It follows entry/domain visibility as specified by its semantic feature, uses its own z-order band, and never changes primary renderer resources. Entry removal closes/reconciles its child from typed notifications.

## 31. Rendering Augmentation Re-evaluation

No current legitimate case requires insertion into a primary render pass. Milestones, direction arrows, warnings, annotations, selection overlays, and elevation markers can derive from semantic geometry and own separate overlays.

Therefore no first-class augmentation registry is introduced. If future simplification/clipping/style composition demonstrably requires shared renderer computation, add a domain-specific typed descriptor/contribution contract—not raw layer access or a universal hook.

## 32. GPX Renderer Validation

The GPX renderer alone interprets tracks, segments, routes, route points, waypoints, styles, category visibility, and per-track visibility. It builds one generation containing a group and per-object resources/bindings.

Polyline click performs nearest-point hit testing from GPX semantics and emits a GPX ref. Waypoints/route points bind markers. Visibility membership/style may update in place when refs remain valid. Geometry/topology/source replacement normally builds a new generation. Fit/reveal uses GPX semantic extent; current rendered bounds are optional fallback. Generic coordinator never sees `trk`, `trkseg`, `rte`, or `wpt`.

10,000+ points remain one/few polyline bindings, not per-point layers or registrations.

## 33. Photo Renderer Validation

Photo renderer consumes normalized Photo coordinate/presentation and creates a marker generation. Time-mode change is a domain semantic/presentation mutation because it can change inferred coordinate; entry revision advances and normally triggers a new generation.

Photo selection ref remains/refreshed according to domain reconciliation. Old marker binding is disabled; new generation commits; map presenter receives token change and re-resolves anchor/ring. The old marker identity is irrelevant. Photo/EXIF code stays outside GPX-only composition.

## 34. `x-track-editor` Validation

Primary GPX generation remains entry rendering. Editor draft polylines, editable markers, selection rings, rectangle shield, and helper lines are session-owned overlays at modal/session z-order.

The editor uses GPX domain presentation command(s) to suppress relevant original tracks; the GPX renderer applies visibility without transferring layers. Domain/entry mutation or renderer replacement is observed semantically; if the original entry/revision becomes incompatible, the editor cancels/reconciles per editor policy.

Save commits new GPX semantics; GPX renderer independently builds new resources. Cancel/teardown restores presentation command state and closes all session overlays/interactions.

## 35. `x-route-search` Validation

Origin/via/destination markers, context target, and any request preview are plugin/session/operation overlays. They remain independent of EntryRenderController.

On success route search commits semantic GPX (or future route-domain) data. It does not transfer markers/polylines; the matching primary renderer builds a fresh entry generation. Plugin uninstall removes temporary resources while committed entry rendering remains.

## 36. Elevation Validation

Elevation queries GPX semantic profile/geometry, uses SelectionStore refs, and creates its own hover/selected marker through map facade. It needs no GPX primary layers.

Chart selection emits semantic selection and optional reveal using domain extent/point coordinate. Renderer failure or replacement does not break the chart; map marker presentation may remain from semantic geometry if desired. Entry/domain changes trigger typed re-resolution.

## 37. `x-milestone` Validation

Milestone can use GPX immutable track snapshots plus entry/domain/viewport subscriptions, compute milestone coordinates/distances, and own a per-entry marker overlay. Visibility follows entry/track semantic presentation snapshots. Zoom changes recompute interval; entry removal closes the child.

No primary GPX layer, layer `add/remove` callback, or augmentation API is needed. This also fixes current anonymous listener retention.

## 38. Base Map Boundary

Base TileLayers are application map infrastructure managed by a typed base-map catalog/manager. They are not entries, domain providers, or render generations.

Selection switches infrastructure layers transactionally and removes the previous owned layer. Provider definitions are owned contributions. App destroy removes Tilia-owned current tiles while preserving caller-owned map/layers according to the host contract.

## 39. Renderer Discovery and Domain Absence

A semantic domain and entries may exist without map rendering, supporting headless/data-only use or optional UI composition. Controllers report `unavailable`; generic entry UI remains functional.

Domain absence cannot coexist with its live entries because Phase 2C leases prevent provider removal. Renderer absence is permitted and independent.

## 40. Renderer Plugin Removal

Explicit renderer unregister is allowed with live entries:

```text
mark registration unavailable; reject new builds
  -> abort pending builds
  -> controllers withdraw interactions/presentation resolution
  -> close active generations/resources
  -> publish unavailable snapshots
  -> continue renderer plugin cleanup
```

Entries and SelectionStore remain. Presenters close/suppress map resources. Cleanup failure follows plugin quarantine but does not pretend rendering remains available. No entry lease blocks renderer removal.

## 41. Domain Provider vs Renderer Removal

Semantic provider removal is blocked by live/in-progress entry leases because entries cannot function without it. Renderer removal is presentation capability loss and is allowed.

A combined plugin registering both will still be blocked by domain leases as a whole. For independently removable rendering, distribution should split semantic provider and renderer plugins or otherwise accept the combined lifetime. The registries remain conceptually separate.

## 42. Dynamic Renderer Installation

After a renderer registration commits, RenderingCoordinator snapshots matching entries and schedules builds in deterministic entry insertion order, with concurrency bounded as an implementation detail if needed. Each controller independently commits/fails.

Existing entries become renderable without restart. Status notifications follow each generation commit and may be batched for UI. Duplicate renderer registration remains rejected.

## 43. Entry Addition

Recommended sequence:

```text
semantic entry transaction commits and publishes entry
  -> RenderingCoordinator observes committed addition
  -> creates controller and resolves renderer
  -> if available, builds generation asynchronously/synchronously
  -> generation commits independently
  -> publishes active rendering status
```

Entry commit never waits for rendering. This differs from current `addGpxEntry()` but is necessary for data-only operation and truthful presentation failure. Callers wanting “add and reveal” await a higher-level result that can report semantic success plus rendering/reveal outcome separately.

## 44. Entry Removal

Reconcile Phase 2C/2E ordering:

```text
mark entry removing; exclude semantic lookup/mutation
  -> invalidate/notify SelectionStore if rooted in entry
  -> controller becomes invalid; presentation resolvers unavailable
  -> withdraw generation interactions
  -> close presenter resources for entry
  -> dispose generation and controller resources
  -> dispose remaining entry scope/provider lease
  -> publish final entry-removed notification
```

Cleanup uses captured resources and never requires later entry lookup. Plugin overlays observe early removing/removal state and close their own children.

## 45. Domain Mutation

Every committed entry/domain mutation increments the entry's private semantic revision and publishes a typed domain change containing entry ID, domain, revision, and an opaque domain change descriptor.

The controller forwards the descriptor/snapshots to the domain renderer. The renderer decides safe in-place update versus replacement. Selection reconciliation occurs in the same semantic transaction as Phase 2E; rendering follows afterward and cannot change that result.

## 46. Render Invalidations

Generic core uses no universal `geometry/style/metadata` enum. Such categories become domain assumptions. The domain renderer interprets its own typed change descriptor and returns one plan:

```text
no render change
safe in-generation update
replace generation
temporarily unavailable/error
```

Whole-entry visibility is the one generic signal handled directly. Renderer implementation/version change always replaces.

## 47. Rendering vs Semantic Transactions

Semantic and render transactions are distinct:

- semantic commit is authoritative and observable first;
- selection reconciliation commits with semantic change;
- rendering is marked building/stale and updates afterward;
- generation commit publishes render availability;
- presentation re-resolves after render commit.

A render-only rebuild may occur without semantic change. Neither transaction can roll back the other. API results/errors explicitly distinguish semantic success from presentation failure.

## 48. Presentation Consistency

There may briefly be new semantic state with an old visual generation. Tilia makes this explicit:

- old generation token records old revision;
- interactions and presentation-target resolution are disabled immediately when incompatible;
- renderer may retain visual fallback or hide it according to domain policy;
- UI can show building/failed state;
- new generation publishes only if built from current revision.

Cheap synchronous renderers may replace within the same task, but the architecture never promises semantic/render atomicity.

## 49. Semantic Revision

EntryStore maintains a private monotonically increasing revision starting at commit and advancing on every semantic/domain presentation mutation relevant to consumers. Snapshots/domain change events expose an opaque/comparable revision where needed, but it is not in the minimal generic entry envelope and is not persisted identity.

Render generations record `builtFromRevision`; Phase 2E domain refs may be revision-scoped. Visibility-only generic changes may either advance a presentation revision or use a separate generic version; implementation must provide one comparable current version to the renderer without conflating it with entry ID.

## 50. Resource Cleanup

Generation scope directly owns layer groups, markers, polylines, map attachment handles, layer/map listeners, interaction bindings, pane leases, timers, async tasks, and generation caches. Presenter handles are owned by presenter children and reference generation only through guarded tokens.

Disposal marks generation inactive/aborts first, cancels/awaits declared tasks, withdraws bindings, removes listeners/layers/groups, releases pane leases/caches, and continues after errors per Phase 2B. It relies on captured handles, not semantic lookup.

## 51. Styles and Icons

Renderer plugin owns stylesheet leases for its domain presentation. Shared immutable icon/style definitions may live at plugin/renderer-registration lifetime. Concrete Marker/Icon/layer instances belong to generations. Highlight icons belong to presenter resources.

Generation replacement may reuse immutable definitions but never transfers mutable Leaflet instances. No theme system is defined here.

## 52. Performance Boundary

The architecture permits:

- one polyline/hit-test binding for thousands of GPX points;
- renderer-managed immutable derived geometry caches;
- in-place visibility/style updates when safe;
- superseding intermediate async builds;
- independent presenter updates without entry rerender;
- plugin overlays recomputing only affected entries/viewport bands.

It does not require full rerender for selection, hover, metadata-only domain changes, or every visibility toggle. Correct generation ownership and target validity determine strategy before micro-optimization.

## 53. Testing Model

Renderer registry tests cover staging, duplicate domains, dynamic install/uninstall, semantic domain without renderer, built-in/external parity, and cleanup failure.

Controller/generation tests cover entry addition, initial build, tokens/revisions, transactional swap, mount/build failure, old-current retention, stale semantic fallback, async supersession, stale callback rejection, removal, app destroy, and every resource category.

Interaction/presentation tests cover canonical refs, polyline hit test, modal precedence, withdrawal, selection survival, popup anchor/highlight re-resolution, hidden state, unavailable renderer, and status notification isolation.

Domain/integration tests cover GPX multi-track/routes/waypoints/visibility/style/replacement, Photo time-mode rebuild, editor session overlays, route-search temporary-to-committed transition, elevation without raw layers, milestone semantic overlay, base-map separation, renderer plugin removal/reinstall, and smoke-level map behavior.

## 54. Migration Pressure

| Current area | Direction |
|---|---|
| `core/boot.js` GPX/Photo overlay/binding/visibility | split to RenderingCoordinator and domain renderers |
| `state.layers`, `entry.layer`, `entry.interactions` | remove from semantic/public state |
| `interaction-hub.js` | remove raw-layer publication |
| `selection-hub.js` popup/layer coupling | move to SelectionStore + map presenter |
| `map/layers.js` GPX/Photo builders | split into domain renderer implementations and UI adapters |
| `fitMapToGroup` | prefer domain extent/map facade; renderer fallback only |
| GPX visibility helpers | domain presentation state + renderer plan |
| Photo replacement path | semantic mutation then independent generation replacement |
| elevation marker/popup | presentation-owned overlay/map presenter |
| editor layers | retain session overlay; migrate to map facade/bands |
| route-search markers | retain plugin overlay; committed data gets fresh domain generation |
| milestone raw tracks/layers | semantic snapshots + owned overlay |
| base-map manager | retain separate infrastructure, add owned lifecycle/contributions |
| global refresh/syncEntry | replace with typed domain/render-status subscriptions |

## 55. Relationship to Phase 2F

| Phase 2F requirement | Phase 2G resolution |
|---|---|
| domain entry render-controller | app-owned generic controller + domain renderer hooks |
| generation transaction/scope | sections 8–11, destination-owned child scope |
| whole/domain visibility | section 13; generic forwarded, domain interpreted |
| semantic target mapping | sections 14–15, generation-owned binding |
| selected-state/presentation hooks | controlled highlight plus presenter ownership, sections 17–19 |
| anchor/bounds/highlight | immutable descriptors + scoped highlight hook |
| pane/z-order ownership | sections 26–27 |
| no raw layer mutation | sections 21, 29, 31 |
| interaction lifecycle | token/liveness/withdrawal in sections 15 and 44 |
| augmentation decision | no registry; semantic plugin overlays, sections 30–31 |

No renderer requirement from Phase 2F remains silently deferred. Exact production method names, GPX/Photo styles, and map-host implementation details remain implementation specification work, not an additional architecture phase.

## 56. Recommended Architecture

```text
EntryStore (semantic entry + private revision)
                 |
       typed entry/domain changes
                 v
        RenderingCoordinator
                 |
      EntryRenderController (app-owned)
                 |
        DomainRendererRegistry
                 |
          Domain Renderer
                 |
     current RenderGeneration scope
       +---------+----------+----------+
       |         |          |          |
    layers   interactions  target     caches/tasks
                           resolver
       +---------+----------+----------+
                 |
            guarded Map Facade
                 |
              Leaflet Map

SelectionStore -> Map Selection Presenter
                         |
                current controller resolver
                 anchor / bounds / scoped highlight

External presentation/augmentation plugin
  -> semantic domain snapshots + typed changes
  -> independently owned overlay through Map Facade
```

## 57. Core Invariants

1. Semantic identity never depends on Leaflet/render/generation identity.
2. Semantic entries remain valid without a renderer.
3. Generic rendering infrastructure never interprets GPX/Photo state or refs.
4. One primary renderer is active per domain ID.
5. Every entry controller is app-owned and every generation has one destination-owned scope.
6. Generation resources never transfer between scopes/generations.
7. Every generation records an opaque token and source semantic revision.
8. Stale generation callbacks cannot perform semantic mutation.
9. Replacement publishes no half-built generation.
10. Pre-switch failure preserves the last valid current generation.
11. A generation for an obsolete semantic revision is never treated as current/interactable.
12. Semantic commit never depends on render success.
13. Render failure/removal never deletes semantic entries.
14. Renderer rebuild alone never clears semantic selection.
15. Domain renderer decides domain update versus replacement; core handles only generic visibility/lifecycle.
16. Renderer-originated input becomes a semantic intent before leaving its generation.
17. Presentation resolvers expose immutable values/controlled operations, not foreign layers.
18. Popup/highlight resources are presenter-owned; renderer owns no selection.
19. Plugin overlays consume semantic data and own independent resources.
20. Raw primary-renderer layers are not supported extension handles.
21. Renderer removal is distinct from domain-provider removal and may occur with live entries.
22. Panes and z-order use explicit app-owned policy/owner leases.
23. Base maps remain application infrastructure outside EntryStore.
24. Temporary editor/route resources never become committed entry generations.
25. App destruction removes all Tilia-owned rendering while preserving caller-owned hosts.

## 58. Open Questions Requiring Human Decision

1. **Renderer contract location:** DomainProvider methods versus separate registry. Recommendation: separate `DomainRendererRegistry`; permits data-only/headless domains and renderer removal. Blocks renderer discovery.
2. **Cardinality:** one or multiple primary renderers. Recommendation: exactly one per domain. Blocks conflict rules.
3. **Controller owner:** provider versus app entry. Recommendation: app-owned generic controller; domain renderer supplies hooks. Blocks lifetime structure.
4. **Generation definition:** mutable long-lived layer set versus revision projection scope. Recommendation: scoped projection with safe updates only. Blocks ownership API.
5. **Replacement:** old-first, new-first, or mutate. Recommendation: build/preflight new, switch, dispose old. Blocks controller algorithm.
6. **In-place criteria:** performance choice versus binding/rollback correctness. Recommendation: valid target mapping + reliable update/rollback required. Blocks renderer plan contract.
7. **Generation identity:** object identity versus opaque sequence. Recommendation: monotonic opaque controller token. Blocks stale guards.
8. **Semantic revision:** none versus private monotonic revision. Recommendation: private entry revision recorded by generations. Blocks async/currentness checks.
9. **Visibility:** generic renderer fields versus forwarded generic + domain-owned state. Recommendation: EntryStore whole visibility; domain renderer interprets the rest. Blocks snapshot inputs.
10. **Target binding:** layer identity versus generation closure/typed record. Recommendation: generation-local semantic binding. Blocks interaction integration.
11. **Interaction path:** raw event subscribers versus semantic Interaction host. Recommendation: renderer resolves and submits typed intent. Blocks current Hub removal.
12. **Popup anchor:** raw layer versus immutable geographic descriptor. Recommendation: descriptor with generation token. Blocks map presenter.
13. **Highlight:** mutate primary, independent geometry, or controlled renderer hook. Recommendation: immutable geometry when possible plus scoped controlled hook. Blocks presenter contract.
14. **Bounds/reveal:** renderer bounds versus semantic extent. Recommendation: semantic first, renderer fallback. Blocks domain API/renderer facade division.
15. **Replacement notification:** none/global refresh/typed status. Recommendation: narrow controller status/generation subscription. Blocks presenters.
16. **Availability states:** detailed state machine versus four public states. Recommendation: unavailable/building/active/failed; extra internal diagnostics. Blocks UI status API.
17. **Panes:** ad-hoc names versus app bands/private leases. Recommendation: app bands plus namespaced private pane leases. Blocks map facade.
18. **Z-order:** numeric negotiation versus fixed semantic bands. Recommendation: small fixed bands with local order. Blocks pane constants.
19. **Map helpers:** renderer-specific broad API versus shared guarded facade. Recommendation: one facade with owned helpers/role validation. Blocks implementation helpers.
20. **Raw map:** forbid versus advanced escape hatch. Recommendation: explicit raw map allowed only for plugin-owned resources; no internal layers/panes. Does not block core renderer.
21. **Overlay contract:** primary augmentation versus independent overlays. Recommendation: semantic-data-driven independently owned overlays. Blocks milestone migration only.
22. **Augmentation registry:** create now or defer. Recommendation: no registry until shared-render-pass evidence exists. Not implementation-blocking.
23. **Dynamic renderer lifecycle:** restart/block versus install/remove freely. Recommendation: dynamic install builds existing entries; removal closes rendering, entries remain. Blocks registry notifications.
24. **Removal with entries:** reject versus allow. Recommendation: allow renderer removal; combined domain+renderer plugin may still be blocked by domain lease. Blocks uninstall behavior.
25. **Entry commit:** await render versus independent. Recommendation: semantic commit first; render outcome separate. Blocks entry API result semantics.
26. **Domain changes:** universal invalidation enum versus domain renderer plan. Recommendation: typed opaque domain change -> renderer plan. Blocks change integration.
27. **Old generation after semantic change:** keep active, hide, or stale fallback. Recommendation: never active; optionally visually retained with interactions/presentation disabled under renderer policy. Blocks failure UI.
28. **Async build:** unrestricted completion versus token/revision commit guard. Recommendation: scoped build with abort and currentness preflight. Blocks async implementation.
29. **Base maps:** renderer entries versus infrastructure. Recommendation: separate application infrastructure. Not blocking entry renderer.
30. **Further design phase:** required versus implementation specification. Recommendation: no additional architecture phase; write normative specs/APIs and migration plan next. Renderer-dependent method names still require specification review.

## 59. Files and Symbols Consulted

- `plugin-architecture/DESIGN.md` — core/domain/rendering direction.
- `plugin-architecture/PHASE-1-INVENTORY.md` — current layers/resources/coupling baseline.
- `plugin-architecture/phase-2/RUNTIME-DESIGN.md` — plugin transactions/uninstall/destroy.
- `plugin-architecture/phase-2/OWNERSHIP-DESIGN.md` — scopes, async liveness, cleanup.
- `plugin-architecture/phase-2/ENTRY-DOMAIN-DESIGN.md` — entry/domain ownership and mutation.
- `plugin-architecture/phase-2/EXTENSION-MECHANISMS-DESIGN.md` — typed renderer registry foundation/subscriptions.
- `plugin-architecture/phase-2/SELECTION-INTERACTION-DESIGN.md` — semantic refs, interaction bindings, presenter contract needs.
- `plugin-architecture/phase-2/UI-PRESENTATION-DESIGN.md` — map facade, overlays, renderer handoff.
- `src/core/boot.js`, `state.js` — current entry layers, visibility, replacement, removal.
- `src/core/interaction-hub.js`, `selection-hub.js` — raw layer publication and popup/layer coupling.
- `src/map/layers.js` — GPX/Photo FeatureGroups, polylines, markers, bounds.
- `src/map/base.js`, `controls.js` — TileLayer infrastructure and controls.
- `src/gpx/source.js`, `interpretation.js` — canonical semantic geometry/hit testing.
- `src/photo/exif.js`, `infer-location.js` — Photo coordinate/time-mode source behavior.
- `src/plugins/ui/elevation-panel.js` — independent marker/popup/profile presentation.
- `plugins/x-track-editor/loader.js`, `editing-layers.js`, `selection-overlay.js`, `rectangle-selection.js`, vendor editor layer — session overlays/interactions.
- `plugins/x-route-search/loader.js` — temporary marker group and committed result transition.
- `plugins/x-milestone/loader.js` — raw-layer-derived marker overlay/z-order evidence.
- `tests/layers.test.js`, `boot.test.js`, `state.test.js` — overlay, visibility, replacement/failure/removal behavior.
- `tests/interaction-hub.test.js`, `selection-hub.test.js` — current stale/replay/popup coupling.
- `tests/x-track-editor-*.test.js`, `x-route-search-*.test.js`, `x-milestone.test.js` — overlay/plugin behavior.
- `tests/smoke/editor.spec.js`, `viewer-elevation.spec.js`, `viewer-photo-*.spec.js`, `viewer-file-import.spec.js` — integrated rendering behavior.

---

No source code was modified. This design investigation created only `plugin-architecture/phase-2/RENDERER-DESIGN.md`.

- Unit tests: `npm test` — 37 files passed, 336 tests passed.
- Smoke tests: `npm run test:smoke` — 28 tests passed.
- Formatting: Markdown/diff whitespace checks passed.
