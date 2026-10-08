# Tilia Plugin Architecture

## 1. Status and Purpose

This document is the authoritative specification of Tilia's target plugin architecture for the next major version. It defines architectural contracts, ownership, dependency direction, lifecycle ordering, and failure boundaries. Exact source-level signatures may differ from the conceptual APIs shown here, but implementations MUST preserve the stated semantics and invariants.

The Phase 2A–2G reports remain design records for evidence, rejected alternatives, and detailed rationale. Where this specification reconciles provisional wording from those reports, this specification is authoritative.

This is not an implementation or migration plan.

## 2. Design Goals

The architecture MUST:

- keep generic core domain-neutral;
- make optional plugins genuinely optional in the module graph;
- give every Tilia-visible effect exactly one lifetime owner;
- make setup, rollback, uninstall, and application destruction explicit;
- keep committed semantic data independent of renderer and UI availability;
- provide typed extension contracts without a universal registry or event bus;
- support built-in and external plugins through the same guarded contracts;
- preserve practical Leaflet access while preventing foreign renderer objects from becoming supported APIs;
- support current GPX, Photo, input, UI, editor, route-search, elevation, and overlay cases without creating a general-purpose framework.

The architecture does not provide package discovery, version solving, sandboxing, a general task scheduler, a universal command bus, a scene graph, or automatic orphan-plugin collection.

## 3. Architectural Principles

1. **Core owns mechanisms; plugins own domain policy.** Generic infrastructure MUST NOT interpret GPX, Photo, EXIF, track, route, waypoint, or other optional-domain structures.
2. **Semantic state is authoritative.** UI and rendering are disposable projections and MUST NOT become semantic authorities.
3. **Ownership is explicit.** Every registration, subscription, DOM subtree, Leaflet resource, task, and other Tilia-visible effect MUST have one owner scope or one shared manager with owner leases.
4. **Publication is transactional.** Public registrations created during plugin setup MUST remain staged until setup succeeds.
5. **Authority follows liveness.** Closing a scope revokes mutation and callback authority before cleanup begins.
6. **Extension contracts remain distinct.** Dependencies, services, domains, inputs, contributions, subscriptions, and resources MUST NOT collapse into one public abstraction.
7. **Semantic identity is not object identity.** Entries and selections MUST NOT use mutable object, DOM node, or Leaflet layer identity.
8. **Optional means unloadable.** An unused optional built-in MUST NOT import or require its private implementation dependencies.
9. **Ordering is semantic and deterministic.** Dependency, cleanup, contribution, interaction, and z-order behavior MUST NOT depend on incidental plugin installation timing.
10. **Cleanup is best-effort but truthful.** Cleanup failures MUST NOT suppress later cleanup, and the runtime MUST NOT report partially cleaned state as active.

## 4. Terminology

- **Plugin definition:** static plugin identity, hard dependencies, and setup behavior.
- **Plugin scope:** root owner for one installed plugin instance.
- **Child scope:** a shorter lifetime nested beneath another scope.
- **Registration:** an owned record published into a typed registry.
- **Entry:** an application-owned instance of one domain's committed semantic data.
- **Domain provider:** the unique semantic implementation for a domain ID.
- **Provider lease:** an EntryStore-owned uninstall guard held during creation and by each live entry.
- **Domain renderer:** the optional primary map renderer for a domain, separate from its provider.
- **Render generation:** one disposable map projection built from a particular semantic revision.
- **Semantic revision:** a private, monotonic per-entry version of domain-owned semantic and domain-presentation state.
- **Generation token:** an opaque, monotonic controller-local identity for one render generation.
- **Selection:** zero or one immutable reference to a semantic target in a committed entry.
- **Interaction binding:** an owned mapping from a physical event surface to a semantic intent.
- **Contribution:** an owned item aggregated by one typed host contract.
- **Presentation adapter:** an architectural pattern that observes semantic state and owns concrete presentation resources.

## 5. Overall Architecture

```text
Application / composition
        |
        v
Plugin Runtime ---------------- Ownership coordinator
        |                              |
        v                              v
Guarded PluginContext ---------- Plugin/child scopes
   | services | domains | inputs | contributions
   | entries  | selection | interactions | map | resources
        |
        v
Application semantic state
   EntryStore --- DomainProviders --- SelectionStore
        |
        v
Presentation infrastructure
   UI hosts --- presentation adapters --- RenderingCoordinator
                                              |
                                              v
                               DomainRenderers / plugin overlays
                                              |
                                              v
                                         Leaflet / DOM
```

Dependencies normally point downward toward stable mechanisms. Core/runtime may call private provider or renderer hooks through typed registries, but MUST NOT import plugin implementations. Plugins may consume guarded core contracts and other plugins' explicit services; they MUST NOT mutate runtime internals.

## 6. Plugin Model

A plugin definition is deliberately small.

> Conceptual API; exact implementation signature may differ.

```ts
interface PluginDefinition {
  readonly id: PluginId;
  readonly requires?: readonly PluginId[];
  setup(context: PluginContext, options: unknown):
    | void
    | (() => void | Promise<void>)
    | { dispose(): void | Promise<void> }
    | Promise<void | (() => void | Promise<void>) | { dispose(): void | Promise<void> }>;
}
```

- IDs MUST be stable normalized lower-kebab strings.
- The `tilia-*` namespace is reserved for registered built-ins.
- `requires` contains hard plugin IDs only and MUST NOT contain duplicates.
- `setup` MAY be asynchronous.
- A setup return value is lifecycle cleanup only. It MUST NOT automatically publish a service.
- `{destroy()}` is not a target lifecycle shape; `{dispose()}` is the structured form.
- Stylesheets are scoped resource registrations performed during setup, not descriptor metadata.
- Services, domains, inputs, contributions, and UI declarations do not belong in the descriptor.

Built-ins are resolved through an immutable ID-to-loader table using literal dynamic imports. That table MUST contain no eager imports of implementations. A built-in loader returns the documented plugin export shape, and the loaded descriptor ID MUST equal the requested ID.

External plugins are normally supplied as plugin objects. Hosts MAY provide an explicit descriptor catalog for transitive external dependencies. The runtime MUST NOT discover arbitrary packages, paths, URLs, or network modules from an ID.

## 7. Plugin Dependencies

`requires` means that the dependent cannot operate correctly unless every named plugin is installed and remains installed. It does not mean service lookup, package dependency, ownership, or optional integration.

For `A -> B -> C`, `use(A)` MUST resolve and validate the complete reachable graph, detect cycles, then install in stable postorder `C, B, A`. Already-installed nodes are reused. Shared dependencies are installed once.

The runtime MUST reject before any setup starts when the reachable plan contains:

- an unknown or unresolvable dependency;
- an invalid descriptor;
- a duplicate plugin ID with a conflicting definition;
- a cycle, reported with its actionable path such as `A -> B -> C -> A`.

Automatic installation applies only to descriptors already known to the built-in registry or explicit catalog. Dependencies successfully installed for a later failing request remain installed. Removing a dependent does not automatically remove dependencies.

`unuse(B)` MUST reject while an installed plugin requires B. Initial architecture has no cascade or public force removal and no dependency reference counting.

Optional integration MUST use optional service/domain access, typed availability, or contributions rather than optional dependency syntax.

## 8. Plugin Setup Transaction

```text
create plugin scope and guarded context
        |
stage registrations; own immediate effects
        |
await setup and validate cleanup result
        |
preflight complete registration batch
        |
synchronously publish batch without callbacks
        |
mark scope active and plugin installed
        |
deliver post-commit typed notifications
```

During setup, other plugins MUST NOT observe staged registrations or a half-installed plugin. Immediate browser or Leaflet effects cannot always be visually hidden, but they MUST register rollback immediately.

On setup, validation, preflight, or commit failure:

```text
revoke liveness and abort scope
        -> discard/reverse staged publication
        -> cancel/settle tracked work
        -> close children and owned effects best-effort
        -> plugin absent, or cleanup-failed if residuals remain
```

Complete rollback permits retry. Incomplete rollback places the ID in non-discoverable `cleanup-failed` quarantine and blocks reinstall until eligible residual cleanup succeeds or terminal destruction reports it.

Concurrent `use()` calls for the same ID MUST share one installation and outcome. Lifecycle mutation MUST be deterministically serialized. Reentrant lifecycle mutation from setup/cleanup MUST be rejected; dependencies belong in `requires`.

## 9. Ownership and Scopes

> Conceptual API; exact implementation signature may differ.

```ts
interface Scope {
  readonly signal: AbortSignal;
  readonly alive: boolean;
  child(options?: { label?: string }): Scope;
  defer(dispose: () => void | Promise<void>, options?: {
    label?: string;
    retry?: "never" | "safe";
  }): DisposableHandle;
  track(work: Promise<unknown>, options?: {
    label?: string;
    cancel?: () => void;
    await?: boolean;
  }): void;
  assertAlive(): void;
  dispose(): Promise<void>;
}
```

The runtime alone creates plugin scopes. Plugins MAY create child scopes for editor sessions, requests, temporary interactions, or other shorter lifetimes. A child MUST NOT detach from or outlive its parent. General ownership transfer is prohibited.

Scope close ordering is normative:

1. atomically mark the scope tree closing and abort its signals;
2. invoke tracked-task cancellation in reverse acquisition order;
3. await only work explicitly marked awaitable;
4. dispose child scopes in reverse creation order;
5. run setup-return cleanup;
6. dispose parent-local records in reverse acquisition order;
7. record complete disposal or residual cleanup failure.

Cleanup MUST continue after errors. Successful records MUST never run twice. Failed records MAY be retried only when explicitly known to be retry-safe. A cleanup-failed scope is not alive.

Shared physical resources, such as a stylesheet link, MUST be managed by a specialized manager. Each scope owns a lease; the manager may internally count leases. This is resource sharing, not plugin dependency reference counting.

AbortSignal requests cooperation. Scope checks enforce authority: a stale asynchronous continuation MUST NOT mutate Tilia through a closed scope even when it ignores cancellation.

## 10. Plugin Context and Capabilities

> Conceptual API; exact implementation signature may differ.

```ts
interface PluginContext {
  readonly plugin: { readonly id: PluginId };
  readonly scope: Scope;
  readonly lifecycle: { afterCommit(callback: () => void): { cancel(): void } };
  readonly services: ServiceFacade;
  readonly domains: DomainFacade;
  readonly inputs: InputFacade;
  readonly contributions: ContributionFacades;
  readonly entries: EntryFacade;
  readonly selection: SelectionFacade;
  readonly interactions: InteractionFacade;
  readonly map: MapFacade;
  readonly styles: StyleFacade;
  // narrow typed subsystem subscriptions and resource helpers
}
```

Every mutating facade captures the plugin scope, checks liveness before beginning, and checks again immediately before committing an asynchronous result. Registrations and resources are automatically owned by that scope unless an explicit child scope is supplied.

Read access returns immutable snapshots or guarded facades. Mutation authority is explicit and scope-bound. The context MUST NOT expose mutable registry maps, `app.core`, or `app.state`.

Runtime scope creation, atomic registration commit, EntryStore destination-scope creation, provider lease mutation, destruction coordination, and renderer internals are privileged internal operations, not plugin capabilities.

Phase 4I's approved `lifecycle.afterCommit(callback)` is setup/installing-only, one-shot after own active publication, synchronously guarded and idempotently cancellable. Rollback/closure suppresses it; callback work is separately Scope-owned. Callback errors/thenables are observed diagnostically without undoing installation. Neither Scope.alive nor unrelated availability is activation evidence. No public raw post-commit queue/phase/controller is exposed. See [4I C](phase-4/PHASE-4I-CONTRACT-AMENDMENTS.md).

## 11. Services

A service is one named programmatic contract with at most one active provider per service ID.

- Registration MUST be staged, scope-owned, conflict-checked, and withdrawn on owner close.
- Lookup MUST return an explicit guarded facade, not the raw implementation and not a JavaScript `Proxy`.
- Provider and consumer liveness MUST be checked for operational calls.
- Service lookup creates neither ownership transfer nor an implicit provider lease.
- A plugin requiring a known service throughout its lifetime MUST declare the provider plugin in `requires` and perform required service lookup during setup.
- Optional consumers MUST tolerate disappearance and MAY subscribe to targeted availability.
- In-flight service calls MUST be cancellable/settled as declared during provider teardown.
- Removing a provider invalidates service facades before availability notification and before provider resources disappear.

Service identity, plugin identity, and setup cleanup are distinct. Version solving is out of scope; incompatible major service contracts use distinct IDs.

## 12. EntryStore

EntryStore is internal application semantic infrastructure with a guarded public plugin facade. Every committed entry is application-owned.

> Conceptual API; exact implementation signature may differ.

```ts
interface EntrySnapshot {
  readonly id: EntryId;
  readonly domain: DomainId;
  readonly visible: boolean;
}
```

The generic envelope MUST contain only stable identity, domain association, and whole-entry visibility. Domain data, labels, metadata, sources, presentation bags, layers, and interactions MUST NOT be generic fields.

Entry IDs are opaque, app-local, monotonic, and never reused during one app lifetime, including after failed creation. An entry's domain never changes. Same-document domain mutation preserves entry identity; remove-and-add, cross-domain conversion, editor Save Copy, and committed route results allocate new IDs.

The creator supplies data and authority for creation but does not own a committed entry. File input, route search, and editor sessions can end while successfully committed entries remain.

EntryStore provides immutable listing/lookup, whole visibility, removal, and typed change subscriptions. It MUST NOT expose mutable entry objects or parallel source/layer arrays.

## 13. Domain Providers

DomainRegistry permits exactly one active provider per domain ID. Domain IDs identify semantic contracts, not formats, renderers, capabilities, or plugin IDs.

A provider registration contains:

- private EntryStore hooks for validation, normalized semantic preparation, private instance creation, domain mutation, and disposal;
- a public guarded domain API for domain-specific snapshots, queries, commands, selection reference handling, and typed domain changes.

Generic core MUST treat provider state as opaque. Public domain data is exposed through immutable snapshots and explicit commands, never direct mutation.

Every in-progress creation and committed entry holds an EntryStore-owned provider lease. Explicit provider removal MUST reject while leases exist, with domain and dependent entry diagnostics. It MUST NOT cascade-delete entries or leave inert semantic records. Application destruction may dispose entries first and then remove providers.

Only EntryStore acquires provider leases. Ordinary domain or service consumers do not. A provider lease is neither a plugin dependency nor a general reference count.

DomainProvider owns semantics; DomainRenderer owns map projection. A provider MAY ship with a renderer in one plugin, but the contracts and lifetimes remain separate.

## 14. Input Architecture

InputRegistry contains identified, owned, ordered multi-provider handlers. A registration includes synchronous, side-effect-free recognition metadata and an asynchronous handler.

- Handler IDs MUST be unique.
- Dispatch evaluates recognizers and selects the unique highest-priority claimant.
- A tie among highest-priority claims MUST fail explicitly; registration order MUST NOT break the tie.
- Recognition failure is isolated and diagnosed according to the typed registry contract.
- Input discovery metadata MAY include MIME types/extensions for input UI.
- Registries MUST NOT auto-install a plugin when no handler is available; composition controls availability.

An input operation owns temporary reads, fetches, decoding, and cancellation in its invocation scope. It normalizes data and calls a domain creation API. It MUST NOT attach renderer resources or place raw Leaflet objects in a committed entry.

Input failure before semantic commit leaves no entry. Once domain creation commits, the application owns the entry and the input operation may end independently.

### Approved Phase 4I input operation amendment

`inputs.dispatch(input, {signal}?)` accepts omitted signal or genuine native cross-realm AbortSignal; invalid options/signals reject before recognition. Valid pre-abort invokes no recognizer/handler. Cancellation checkpoints preserve typed pre-handler errors, isolated recognizers and unique highest-priority selection; exact handler registration/lifetime is revalidated immediately before execution.

Handlers receive `{input,signal,scope}`, where scope is the existing caller-owned invocation for temporary resource ownership. Compose operation/caller/invocation/handler registration lifetimes. Cooperative creation MUST retain the accepted final publication signal guard. Committed entries remain application-owned; stale status/DOM/viewport continuations are suppressed. FileReader abort settles/cleans listeners; synchronous parsing cannot be physically interrupted mid-call.

Dispatch observes actual handler settlement and then invocation resource cleanup. Uninstall does **not** acquire a blanket handler/transport settlement barrier. Only actual resource acquisitions/disposers explicitly marked awaitable are joined, preserving provider leases and safe residuals. Cancellation forwards authority loss immediately even if resource-free work settles later.

After handler entry all dispatch failures use bounded `InputDispatchError`, without a `committed` property; semanticOutcome is unknown even if a handler-local operation has a known commit flag. Preserve original result/error, cancellation/lifetime reason and cleanup error. Cleanup failure takes precedence, then cancellation, then handler failure. Uninterrupted success returns original result. Pre-handler cancellation is not-started; ordinary pre-handler validation/unsupported/conflict errors retain their types. Common ExtensionError is unchanged. Exact validation/precedence/fields and assertions: [4I A](phase-4/PHASE-4I-CONTRACT-AMENDMENTS.md).

## 15. Extension Mechanisms

The public taxonomy is:

| Mechanism | Purpose | Cardinality/lifetime |
|---|---|---|
| Dependency | required plugin availability/order | static plugin graph |
| Service | named callable contract | one provider per ID |
| Domain | semantic entry contract | one provider per domain ID |
| Input | recognize/process external input | many ordered claimants |
| Contribution | aggregate optional host items | many items per typed point |
| Subscription | observe one typed subsystem | many scope-owned listeners |
| Resource | own a concrete effect | not discoverable by default |

“Capability” means an optional typed operation exposed by one of these contracts. There is no global Capability Registry.

Typed registries MAY share an internal owned-registration engine for staging, preflight, commit, disposal, and diagnostics. Public API MUST NOT expose a universal `register(type, id, object)` or a global string event bus.

Typed notifications occur after state/registration commit, use subscriber snapshots, isolate callback failures, and queue reentrant mutations behind the current serialized operation. Notification failure MUST NOT roll back committed state.

## 16. Contributions and UI Hosts

Phase 4I implements the fixed `contributions.toolbar` point through the existing contribution engine: corners `topleft/topright/bottomleft/bottomright`, immutable validated action/mount variants, mount-owned controls and item-local action observation with `await:false`. Standard File requires Toolbar; Layers/Settings require Panel and Toolbar; URL requires Toolbar; Elevation also requires GPX domain. Panel supports validated side/bottom presentation. Exact resolved product specifications remain in [4I plan §6](phase-4/PHASE-4I-IMPLEMENTATION-PLAN.md). The approved A/B/C contracts are implemented and verified; [the implementation report](phase-4/PHASE-4I-IMPLEMENTATION-REPORT.md) records pinned EXIF/resource findings, audits and remaining 4J/4K scope. Implementation review/acceptance remains pending.

A UI host owns one typed contribution contract, placement, layout, group ordering, keyboard/focus policy, and mount child scopes. A contribution is an immutable owned descriptor plus guarded behavior.

Ordering is:

1. host-defined group order;
2. ascending finite rank, default `0`;
3. lexical item ID.

Installation order MUST NOT affect contribution order. Unknown groups or points MUST reject. Known points MAY exist while their visual host is absent; contributions remain dormant and appear when the host mounts.

Simple controls SHOULD use declarative descriptors. Complex content MAY use a guarded mount callback receiving an empty host-owned container and a fresh mount scope. Mount errors affect only that item. Dynamic contribution removal MUST close its mount child before removing its DOM.

Complex plugin UI, including editor and route-search forms, need not be forced into generic descriptors. It may remain plugin-owned and use contributions only for launching or placement integration.

## 17. UI and DOM Ownership

```text
host owns: placement, outer container, ordering wrappers, focus policy
contributor owns: assigned subtree behavior and resources through mount scope
```

Plugins MUST NOT mutate sibling contributions, host-private DOM, or another plugin's subtree. DOM/document listeners, ResizeObservers, timers, Leaflet controls, surfaces, and custom panels MUST be scope-owned.

Standard host items use host keyboard/accessibility behavior and require accessible names. Custom mounts own accessibility within their assigned labeled subtree.

UI-local state—panel open state, tab, expansion, hover, focus, form draft, popup visibility—remains presentation/session state. It MUST NOT become authoritative entry, domain, configuration, or selection state.

### Approved Phase 4I host Drop binding

`ui.bindDropTarget({id,onDrop})` selects one exclusive host application target, reserves during setup and activates only after commit. No target/headless rejects; staged rollback publishes no listeners. Callback receives frozen `{files,scope}` with a frozen native File-array snapshot and host invocation Scope, never raw map/container/DOM event. Host owns binding listeners/highlight/children; contributor joins resource closure through existing cross-lifetime cleanup obligations, with one resource parent.

Binding teardown revokes delivery and cancels children synchronously, then joins owned resource cleanup. Callback promises are observed with await:false; resource-free callback completion is not a disposal/uninstall barrier. Required resource-specific acquisitions remain explicitly awaitable with reserved disposal and retained safe retry. Lease disposal is idempotent/concurrent-shared, with later explicit safe residual retry. Nested/mixed/empty/nonfile/control/panel drags and stale generations follow [4I B](phase-4/PHASE-4I-CONTRACT-AMENDMENTS.md). No general DOM/target escape hatch is added.

## 18. Domain UI Adapters

Tilia MUST NOT define a universal `DomainUiAdapter` containing tree, popup, render, settings, and action methods. Each surface defines a narrow typed adapter only when discovery is needed.

The initial architectural contracts include:

- one primary layers/tree adapter per domain for label, icon, summary, child presentation, and domain actions;
- one primary map-selection popup adapter per domain for scoped popup content;
- ordinary multi-provider contributions for extra entry actions or settings.

If no layers adapter exists, the generic host MUST still show a deterministic fallback based on domain and entry ID and retain generic visibility/removal controls.

Semantic providers SHOULD expose presentation-neutral immutable data. UI adapters translate it into labels, icons, DOM, and host-specific structures.

## 19. Selection

SelectionStore is app-owned and contains either `null` or one immutable semantic reference.

> Conceptual API; exact implementation signature may differ.

```ts
interface Selection {
  readonly entryId: EntryId;
  readonly domain: DomainId;
  readonly ref: unknown; // immutable, opaque to generic core
}
```

Only the matching domain selection adapter can validate, canonicalize, compare, resolve, and reconcile `ref`. Callers request selection through domain-issued candidates; they MUST NOT inject arbitrary locators directly.

SelectionStore MUST NOT contain Leaflet layers, popups, DOM nodes, render-generation objects, chart state, hover state, cached domain snapshots, or editor draft selection.

Selection changes commit before notification. `getCurrent()` returns current state; change-only subscription observes later `{previous,current,reason}` records. Equal canonical requests are idempotent.

Hidden targets may remain selected and may be selected programmatically. Entry removal, target deletion, provider invariant failure, or app destruction invalidates selection. Renderer replacement, popup closure, coordinate/label refresh, and visibility alone do not.

Domain mutation reconciles current selection as one of `unchanged`, `refreshed`, `remapped(ref)`, or `invalid` within the semantic transaction. Consumers re-resolve current data after refresh/remap.

Editor draft multi-selection, route-search markers, rectangle selection, focus, and hover remain owner/session-local state.

## 20. Interaction

Interaction maps a physical event from a renderer, UI surface, or session to a semantic intent. The interaction source and semantic operation are distinct.

Bindings are scope-owned and use host-defined precedence tiers:

```text
modal > object > background
```

Normal DOM/Leaflet propagation participates in arbitration. Competing primary bindings for the same surface/target/tier MUST reject; numeric plugin priorities and installation order MUST NOT decide conflicts.

A renderer binding canonicalizes a domain reference and submits a semantic intent, usually selection, before the event leaves its generation. One GPX polyline binding MAY perform nearest-point hit testing; one binding per point is unnecessary.

Closing a binding owner MUST mark it inactive before listener/resource disposal. Late events MUST be ignored or rejected by scope, generation token, and semantic revision checks. The architecture has no raw-layer Interaction Hub and does not broadcast foreign layers.

## 21. Presentation

A presentation adapter observes semantic state and owns concrete UI/map resources without becoming semantic authority. It is a pattern, not a universal registration category.

Examples include map selection popup/highlight, elevation highlight, and layers-tree highlight. Each adapter:

- reads current semantic snapshots through guarded APIs;
- subscribes to only the typed semantic/render channels it needs;
- creates presentation children/resources under its own scope;
- closes or suppresses presentation when unavailable;
- leaves semantic state unchanged when mounting or rendering fails.

Built-in presentation behavior SHOULD be implemented as ordinary built-in plugins when practical.

## 22. Popup Model

The map-selection presenter plugin owns the Leaflet popup and any popup mount child. SelectionStore owns no popup.

- Selection change/clear closes the prior popup generation.
- `popup closed != selection cleared`.
- A product interaction MAY explicitly map dismissal to a guarded clear request, but it is not the architectural default.
- Hidden or unrendered targets suppress/close map popup while semantic selection remains.
- Renderer replacement re-resolves the anchor and may recreate presentation.
- Domain popup content is mounted by the narrow domain popup adapter.
- Presenter uninstall closes presentation only.
- Popup creation/content failure leaves selection intact.

Popup generations use tokens so stale close events cannot affect a newer popup or selection.

## 23. Map Facade

> Conceptual API; exact implementation signature may differ.

```ts
interface MapFacade {
  listen(type: string, listener: Function, options?: unknown): DisposableHandle;
  attachLayer(layer: unknown, options?: { band?: MapBand; pane?: PaneLease }): DisposableHandle;
  mountControl(control: unknown, options?: unknown): DisposableHandle;
  createPane(options: { name: string; band: MapBand }): PaneLease;
  fit(bounds: GeographicBounds, options?: unknown): Promise<void> | void;
  panTo(point: GeographicPoint, options?: unknown): Promise<void> | void;
  readonly viewport: ReadonlyViewport;
  advancedLeafletMap(): unknown;
}
```

Normal plugins use owned helpers for caller-owned layers, controls, events, viewport actions, panes, and surfaces. Direct `map.addControl()` is not the supported lifecycle path.

An explicit advanced escape hatch MAY expose the Leaflet Map for operations not covered by the facade. The caller still owns every effect it creates and MUST register cleanup. Raw access MUST NOT expose or legitimize private renderer layers.

This architecture provides lifecycle and integrity boundaries, not a JavaScript security sandbox.

## 24. Plugin-Owned Overlays

The standard augmentation path is:

```text
semantic/domain snapshot + typed changes
        -> plugin computation
        -> independently owned overlay through MapFacade
```

Milestones, directional arrows, warnings, annotations, route-search previews, and elevation markers follow this model. Their resources belong to plugin or operation child scopes.

Plugins MUST NOT mutate primary-renderer resources. No first-class rendering augmentation registry exists initially. One MAY be designed later only if demonstrated use cases cannot be represented as independently owned semantic overlays.

## 25. Domain Renderers

DomainRendererRegistry is a dedicated internal typed registry separate from DomainRegistry. It permits exactly one primary renderer per domain ID.

- Renderer presence is optional.
- Registration is staged and scope-owned.
- A renderer interprets domain snapshots/change descriptors and creates generation-owned resources.
- Generic rendering infrastructure MUST NOT interpret domain data or selection refs.
- Duplicate primary renderer registration rejects transactionally.
- Renderer removal is permitted while entries remain.
- Semantic entry validity MUST NOT depend on renderer availability.

A plugin/package MAY register both provider and renderer, but provider leases protect the provider only. If both registrations share one plugin scope, live provider leases block uninstall of that combined plugin; separating plugins permits renderer-only removal.

## 26. Rendering Coordinator

RenderingCoordinator is internal app infrastructure. It:

- observes committed entry lifecycle and renderer availability;
- creates and closes one EntryRenderController per entry;
- coordinates initial rendering, replacement, renderer removal/reappearance, whole visibility, and render status;
- exposes narrow guarded status/presentation resolution to authorized presenters;
- owns no domain policy and interprets no GPX/Photo data.

Render status subscriptions are typed and narrow. They do not replace domain changes, selection changes, entry changes, or form a global refresh event.

## 27. Entry Render Controllers

One app-owned controller exists for the lifetime of each committed entry, even when no renderer is available. It stores only generic coordination state:

- entry ID/domain;
- current semantic revision;
- renderer registration identity/liveness;
- availability and diagnostic error;
- current generation/token;
- pending build token/task;
- current whole-entry visibility.

The controller orchestrates cancellation, currentness validation, swap, visibility attachment, and cleanup. The domain renderer decides how to build domain geometry, interpret changes, and safely update or replace a generation.

Controller lifetime ends during entry removal before final domain-instance/provider-lease disposal.

## 28. Render Generations

A RenderGeneration is a private disposable projection built by one renderer registration from one entry semantic revision.

It MUST have exactly one destination-owned child scope containing all of its:

- Leaflet groups, layers, markers, polylines, and attachments;
- map/pane leases;
- listeners and interaction bindings;
- semantic-target resolvers;
- anchor, bounds, and controlled highlight resolvers;
- caches, timers, subscriptions, and asynchronous work.

It records `builtFromSemanticRevision` and one opaque generation token. Resources MUST NOT transfer between generations. A generation MUST NOT become application semantic state or expose its raw Leaflet objects publicly.

In-generation mutation is allowed only when target mapping remains valid, ownership is unchanged, stale async work remains guarded, and the change is non-throwing after preflight or reliably rollbackable.

## 29. Render Replacement Transaction

```text
reserve candidate token and scope
        -> build candidate from semantic revision R
        -> register all candidate resources/bindings
        -> preflight entry, renderer, revision, token, and liveness
        -> mount candidate in callback-suppressed critical section
        -> atomically activate candidate and deactivate old generation
        -> publish committed render status
        -> dispose old generation best-effort
```

Observers MUST never see a half-published generation or two active interaction generations. Leaflet may briefly display overlapping resources during the synchronous switch, but only one token has authority.

Failure before activation rolls back the candidate. The old generation remains active only if it still represents current semantics. If semantics already advanced, the old generation MAY remain as a visually stale fallback, but MUST be non-interactive and unavailable for presenter resolution; a renderer MAY hide it when stale display is misleading.

Failure disposing the old generation after activation does not roll back the candidate. Residual cleanup is tracked privately and reported.

## 30. Revision and Render Currency

Tilia uses the smallest coherent currency model:

1. **Semantic revision:** EntryStore maintains one private monotonic revision per entry. It starts at commit and increments for every committed domain semantic mutation and every domain-owned presentation mutation whose value is part of domain snapshots/change contracts.
2. **Generic entry visibility:** `entry.visible` is separate generic presentation state. It does not increment semantic revision and requires no second per-entry revision counter. Its committed boolean and typed visibility notification are applied to the controller/generation.
3. **Generation token:** the controller allocates a monotonic opaque token for each build. It identifies render lifetime, not semantics.

A generation is semantically current only when:

- its `builtFromSemanticRevision` equals the entry's current semantic revision;
- its renderer registration remains current/alive;
- its token is the controller's active token;
- its generation scope and entry remain alive.

Whole-entry visibility normally changes attachment/interactivity in place. Because it does not change semantic target meaning, it does not invalidate semantic currency. A binding additionally checks effective visibility before dispatch.

Domain-specific presentation state is versioned as follows:

- GPX geometry mutation increments semantic revision and normally replaces the generation.
- GPX track/category visibility increments semantic revision because it is domain-owned presentation state, but the renderer MAY safely advance the current generation in place by updating membership/bindings.
- GPX style mutation increments semantic revision when style is authoritative domain presentation; it MAY update in place when rollback/currentness criteria hold.
- Photo semantic data or location mutation increments semantic revision and normally replaces.
- Photo time mode increments semantic revision because it changes domain-derived presentation/location and normally replaces or performs a renderer-proven safe update.
- Whole-entry visibility changes do not increment semantic revision and normally attach/detach in place.
- Selection changes do not increment semantic revision and do not rebuild primary rendering.

After an in-place domain update succeeds, the generation may advance `builtFromSemanticRevision` only as part of the renderer's validated update commit. Before that commit its bindings/resolvers are stale and MUST have no authority.

Revision-scoped domain selection refs are reconciled by the domain mutation transaction. Stale interaction/presentation is rejected by semantic revision, generation token, renderer/scope liveness, and effective visibility as applicable.

## 31. Visibility

Visibility has distinct layers:

- EntryStore owns whole-entry visibility.
- A domain owns category and child visibility, such as GPX tracks/routes/waypoints.
- Renderer availability says whether any current map projection exists.
- A presenter owns local suppression, such as whether a popup is currently shown.

Generic rendering infrastructure MUST NOT contain GPX-specific branches. It forwards whole visibility and typed domain changes. Renderers compute effective visibility.

Whole-entry hiding normally detaches/suppresses a generation without destroying semantic data or clearing selection. Invisible resources MUST NOT dispatch interaction. Domain visibility changes MAY update child membership in place when target binding validity and rollback guarantees hold; otherwise they replace the generation.

### Phase 4J temporary presentation suppression

[Approved Phase 4J Amendment A](phase-4/PHASE-4J-CONTRACT-AMENDMENTS.md#a-temporary-target-presentation-suppression) adds consumer-owned `rendering.suppress({entryId,domain,target,expectedRevision,scope})`, `getSuppressionSnapshot()` and `subscribeSuppression(listener,{scope,emitCurrent})`. Phase 4J admits GPX track targets. Aggregate live leases suppress presentation independently of persistent visibility preferences, semantic revisions, SelectionStore and renderer registrations. Owner closure releases synchronously; overlapping leases compose by OR; release respects current preferences. The frozen snapshot/read and serialized notification, private reference reconciliation, replacement/deletion invalidation and renderer-independent lifecycle follow the exact approved record. No renderer resources or lease-owner identities are exposed.

## 32. Semantic Target Binding

Generation-local bindings map physical resources to a domain-issued target equivalent to:

```ts
interface SemanticTarget {
  readonly entryId: EntryId;
  readonly domain: DomainId;
  readonly ref: unknown;
}
```

The renderer may capture a canonical ref or derive one by hit testing. Before dispatch it verifies generation currency and asks the domain selection adapter to validate/canonicalize the target.

Leaflet identity MUST NOT escape as semantic identity. Rebuilding a marker, polyline, or group changes render identity only and does not inherently change selection.

## 33. Renderer-Facing Presentation

Authorized presenters obtain immutable or controlled resolution results from the active controller, never raw foreign layers.

The contract may provide:

- geographic anchor plus generation token;
- geographic or presentation-specific bounds;
- visibility/availability status;
- immutable highlight geometry/descriptor;
- a narrowly controlled method that creates a highlight in a presenter-supplied scope when independent geometry is insufficient.

Domain semantic geometry SHOULD provide fit/reveal/bounds when it exists independently of rendering. Renderer-derived bounds are a fallback for actual rendered extents or presentation-specific anchors.

All results are generation-bound. Presenters MUST revalidate currentness before applying asynchronous work and close prior resources on generation/status change.

Approved contract amendment (2026-10-07; implemented and verified in Phase 4G; implementation review/acceptance pending): `PresentationHandle` MUST expose a readonly `signal: AbortSignal` reporting permanent loss of that handle's authority. It captures both the exact presentation exposure and consumer lifetime. Authority MUST be revoked before abort delivery, so `isCurrent()` is already false inside every abort listener. Hide/show, same-token revision advancement, replacement, withdrawal, logical entry deletion, consumer closure, and rendering termination MUST NOT revive an old handle; renewed exposure requires a fresh handle. Signal-forwarding listeners MUST be removed when either captured lifetime ends. Resolution MUST check lifetime/currentness around listener registration so invalidation during registration cannot yield an apparently live handle or leave listeners attached.

This signal supplements existing currency checks. It changes neither generation/replacement nor semantic selection policy. Rendering termination MUST invalidate presentation authority and withdraw presenter-owned popup/highlight resources without a final rendering-status event. The accepted Phase 4F termination and definitive replacement-failure policies remain binding. See the [approved amendment record §2](phase-4/PHASE-4G-CONTRACT-AMENDMENTS.md#2-presentationhandle-permanent-invalidation) for the original-contract boundary and full amendment, and the [Phase 4G plan §12](phase-4/PHASE-4G-IMPLEMENTATION-PLAN.md#12-required-tests-and-smoke-expectations) for implementation verification. The accepted Phase 4F baseline provides no handle signal; the subsequent Phase 4G working tree implements it.

## 34. Highlighting

Presentation MUST NOT arbitrarily mutate primary-renderer layers. Preferred flow is:

```text
semantic/highlight descriptor
        -> presenter-owned overlay
```

A controlled renderer highlight hook is permitted only where independent overlay cannot faithfully represent the target. It MUST:

- accept a presenter-supplied child scope;
- create resources owned by that presenter scope;
- expose no primary layer;
- be valid only for the active generation token/revision;
- lose authority immediately on generation replacement, presenter close, or entry removal.

Highlight state is presentation state and MUST NOT enter SelectionStore or semantic domain state.

## 35. Renderer Availability and Failure

Public rendering availability is limited to:

```text
unavailable | building | active | failed
```

- `unavailable`: no active renderer registration/current projection.
- `building`: a current build is in progress; a compatible prior current generation may still exist.
- `active`: the current generation represents current semantics.
- `failed`: the latest required build/update failed and no current active projection exists; diagnostics retain cause.

An initial render failure leaves the entry committed and unrendered. A replacement failure retains the previous generation only when it remains semantically current; otherwise it may remain visual-only stale fallback or be hidden. Rendering failure MUST NOT delete or roll back committed semantic data.

Renderer removal makes affected controllers unavailable, synchronously revokes bindings/resolvers, and disposes generations. Controllers and entries remain. Renderer reinstallation triggers fresh builds from current domain snapshots.

## 36. Pane and Z-Order Policy

Application-owned semantic bands, bottom to top, are:

1. base infrastructure;
2. domain geometry;
3. domain markers;
4. derived plugin overlays;
5. selection presentation;
6. modal/editor session overlays;
7. Leaflet popup and shell UI.

Plugins use the appropriate band through MapFacade. Local order within a band is deterministic and contract-defined, not arbitrary cross-plugin z-index competition.

When bands are insufficient, a plugin MAY acquire an owner-namespaced private pane lease. The pane MUST be scoped and removed when its last lease ends. Private panes MUST NOT be used to bypass modal, selection, popup, or shell policy.

Phase 4J Amendment B allows only editing point/midpoint markers and drag helper lines created internally by the unchanged `PartiallyEditablePolyline` library to retain library default placement where public options cannot supply the appropriate band. All editor-direct resources still follow this policy. This is not a general third-party pane exception. Usable real-browser stacking/interaction and public composite teardown must be verified; unsupported behavior requires focused review, not private internals, monkey-patching or a compatibility framework. Existing cleanup-failure/quarantine contracts remain unchanged. See [approved B](phase-4/PHASE-4J-CONTRACT-AMENDMENTS.md#b-vendor-editing-marker-and-drag-helper-pane-exception).

## 37. Temporary and Session Rendering

Committed entry rendering and temporary/session rendering are separate ownership trees.

- Track-editor drafts, point markers, selection rings, and rectangle interaction belong to the editor-session children.
- Route-search origin/via/destination markers and preview geometry belong to route/request scopes.
- Elevation hover markers belong to elevation presentation scopes.
- Committing a result transfers semantic values only: GPX creation produces a new app-owned entry, and its renderer creates new resources.

Temporary Leaflet resources MUST NOT be adopted or transferred into a committed RenderGeneration.

## 38. Base Map Boundary

Base-map catalogs, selected base TileLayer, and selector UI are application map infrastructure and typed contribution/service concerns. They are outside EntryStore, DomainProvider, DomainRenderer, semantic selection, and render generations.

Base-map registrations MUST still be owned and reversible. This specification does not otherwise redesign the base-map catalog.

## 39. Dynamic Installation and Removal

| Component | Installation/removal semantics |
|---|---|
| Plugin | transactional install; removal blocked by installed dependents or subsystem leases; scope teardown |
| Service provider | staged publication; facade invalidation and withdrawal before provider cleanup |
| Domain provider | staged publication; explicit removal blocked by creation/live-entry leases |
| Renderer | staged publication; removable with live entries; projection resources close, semantics remain |
| Input handler | staged owned registration; removal stops future dispatch and cancels/guards owned operations |
| UI host | may appear/disappear; closes mount children; contribution registrations may remain dormant |
| Contribution | dynamic owned add/remove; host reconciles typed snapshot deterministically |
| Presenter | removal closes only its presentation resources; semantic selection/data remain |

Removal of presentation is not removal of semantic capability. Removal of a semantic provider is blocked when persistent semantic state depends on it.

## 40. Entry Addition Lifecycle

```text
creator/domain operation validates caller and provider
        -> reserve never-reused EntryId
        -> create uncommitted app-owned entry scope
        -> acquire provider lease
        -> provider prepares normalized semantic instance/resources
        -> atomically publish EntrySnapshot and semantic revision
        -> reconcile post-commit subscribers
        -> RenderingCoordinator creates controller
        -> discover renderer and build RenderGeneration asynchronously
        -> publish render status
```

Provider creation prepares semantic state and semantic resources only. Renderer preparation is not part of entry commit. This reconciles earlier Phase 2C wording with the final renderer separation.

Failure before entry commit closes the destination scope and releases the lease only after rollback cleanup succeeds; cleanup failure retains the creation residual, exact provider lease, and existing cleanup retry behavior. The reserved ID is never reused. Rendering success is not normally a prerequisite for semantic commit.

Approved contract amendment (2026-10-07; implemented and verified in Phase 4G; implementation review/acceptance pending): domain creation accepts optional `options.signal: AbortSignal`. This is a new publication contract, not completion of a previously accepted signal option. Validate the supplied signal and reject pre-existing cancellation before reserving an EntryId. Forward cancellation to provider preparation while retaining entry/requester/application/provider lifetime and exact-registration checks. After preparation settles and those guards pass, recheck cancellation immediately before the callback-free publication block. No external callback or await is permitted between that check and completed publication (record/snapshot/revision, lease promotion, and store insertion); renderer hooks and notifications follow commit.

Cancellation before commit MUST prohibit publication. Cancellation after commit MUST NOT delete or roll back the committed entry. Non-cooperative preparation may settle late: keep its creation lease while unsettled, recover late resources into the existing rollback cleanup path, and prohibit publication after cancellation. Release the provider lease only after successful rollback cleanup. Successful cancellation rollback rejects with `ENTRY_CREATION_ABORTED` and `committed: false`; pre-reservation cancellation has the same error code/commit flag and no reserved ID. Cleanup failure keeps the existing cleanup-failure error (`SEMANTIC_CLEANUP_FAILED`, `committed: false`), with cancellation retained as the original cause in the existing creation residual/original-error reporting. Remove forwarding listeners during settlement, including failure settlement, without discarding residual cleanup or retry obligations. Reserved ID gaps remain intact. See the [approved amendment record §3](phase-4/PHASE-4G-CONTRACT-AMENDMENTS.md#3-domain-create-commit-boundary-cancellation) and the [Phase 4G implementation plan](phase-4/PHASE-4G-IMPLEMENTATION-PLAN.md). The accepted Phase 4F baseline provides no caller-signal publication cancellation; the subsequent Phase 4G working tree implements it.

## 41. Domain Mutation Lifecycle

```text
guard and validate domain command
        -> prepare next semantic/domain-presentation state
        -> atomically commit state and increment semantic revision
        -> reconcile SelectionStore in the same semantic transaction
        -> publish typed domain change
        -> controller marks incompatible generation stale/non-authoritative
        -> renderer plans no-op, safe update, or replacement
        -> publish render status/generation commit
        -> presenters re-resolve
```

Selection reconciliation and semantic revision commit are authoritative and precede rendering. Domain renderer planning may use an opaque typed domain change descriptor; generic core MUST NOT use a universal `geometry/style/metadata` enum.

Mutation failure before semantic commit leaves prior semantic state, selection, and current rendering unchanged. Post-commit rendering or notification failure does not reverse semantic state.

## 42. Entry Removal Lifecycle

Entry removal ordering is normative:

1. serialize removal, mark the entry removing, revoke entry operation authority, and remove it from public lookup;
2. commit SelectionStore invalidation if rooted in the entry;
3. synchronously invalidate the EntryRenderController and renderer-facing resolvers;
4. withdraw generation interaction bindings;
5. close presenter resources targeting the entry;
6. dispose generations/controller and notify plugin overlays of removal;
7. dispose remaining entry resources and private domain instance best-effort;
8. release the provider lease last;
9. publish final entry-removed notification.

Cleanup uses captured handles and MUST NOT require public lookup of the removed entry. If cleanup fails, the entry remains logically absent and its ID remains reserved. Retry-safe residuals and the provider lease remain privately tracked until disposal completes. A half-disposed public entry MUST NOT be restored.

`clear()` is deterministic reverse-insertion-order removal with batched public notifications, not an atomic rollbackable transaction.

[Approved Phase 4J Amendment C](phase-4/PHASE-4J-CONTRACT-AMENDMENTS.md#c-entry-associated-presentation-lifetime) adds `entries.bindPresentationLifetime(entryId,{scope})` returning a captured disposal lease. It binds an existing consumer-owned child presentation scope, validates ancestry/liveness and synchronously closes/withdraws bound effects on logical deletion before remaining entry cleanup. Entry removal awaits required bound presentation cleanup attempts, continues after errors and retains existing residual/provider-lease obligations. Final `removed` timing remains unchanged. Explicit lease disposal closes its bound scope; no detached active overlay is permitted. This is generic entry infrastructure, not Milestone-specific code, an arbitrary-work barrier or an editor source-lifetime dependency.

## 43. Plugin Uninstall Lifecycle

Explicit uninstall first verifies that no installed plugin dependency or subsystem lease blocks removal. For an allowed uninstall:

```text
mark plugin unavailable; revoke callback/mutation authority; abort signal
        -> invalidate/withdraw committed registrations synchronously
        -> hosts unmount contributions and presenters close resources
        -> renderer registrations close affected generations
        -> cancel/settle plugin and child async work
        -> close child scopes reverse creation order
        -> run setup-return cleanup
        -> dispose remaining records LIFO (services, inputs, listeners,
           overlays, controls, styles, and other resources)
        -> absent, or cleanup-failed quarantine with aggregate diagnostics
```

Actual record ordering follows dependency and acquisition relationships; authority withdrawal always precedes provider-resource destruction. One error MUST NOT stop remaining cleanup.

Repeated `unuse()` of an absent plugin is idempotent. Repeated `unuse()` of a quarantined ID attempts only retry-safe residuals. `use()` during teardown waits; it may reinstall only after complete cleanup. `unuse()` during setup waits for setup/rollback outcome, then removes if installation committed.

## 44. Application Destroy Lifecycle

`app.destroy()` is asynchronous, idempotent, terminal, and makes the app unusable immediately. New lifecycle and semantic mutations MUST reject once destruction begins.

```text
mark app destroying; abort app authority; prevent pending commits
        -> retain domain providers and their hard-dependency closure
           while live entries require them
        -> teardown all other plugins dependents-first
        -> clear global selection and close presentations/interactions
        -> remove entries reverse insertion order while providers live
        -> teardown retained providers/dependencies dependents-first
        -> dispose EntryStore, RenderingCoordinator, registries, UI roots,
           core/runtime subscriptions and Tilia host attachments
        -> destroy factory-created map/container infrastructure
        -> preserve caller-owned map/container infrastructure
        -> report aggregate errors after all cleanup attempts
```

Pending setup loses commit authority and rolls back when it settles. All Tilia-owned controls, layers, panes, popups, overlays, DOM roots, listeners, subscriptions, tasks, and render generations MUST be removed or reported as residual cleanup failures.

The destroyed application can never be reused.

## 45. Failure Semantics

| Failure | Semantic commit affected? | Registration published? | Previous rendering retained? | Owner closed? |
|---|---|---|---|---|
| plugin setup/validation failure | no semantic transaction implied | no; any partial commit reversed | unrelated rendering unchanged | yes; absent or quarantined |
| service/domain/input/contribution preflight failure | no | no plugin batch publication | unchanged | plugin setup scope rolled back |
| unexpected registration commit failure | no new semantic commit | reversed best-effort; never advertised installed | unchanged | yes; quarantine if reversal incomplete |
| input parse/normalize failure | no entry commit | handler registration unchanged | not applicable | invocation child closes |
| domain creation failure | no entry commit | existing registrations unchanged | no generation created | uncommitted entry scope closes |
| domain mutation failure before commit | no | unchanged | yes, prior current rendering remains | operation child closes |
| post-semantic notification failure | yes; remains committed | unchanged | renderer continues/reconciles independently | subscriber error isolated |
| contribution mount failure | no semantic effect | contribution remains registered unless policy removes it | unchanged | failing mount child rolls back |
| initial render failure | entry remains committed | renderer registration unchanged | none | candidate generation closes |
| replacement render failure | semantic mutation remains committed | renderer registration unchanged | only if prior generation still semantically current; otherwise stale visual-only or hidden | candidate closes |
| presentation/popup failure | semantic selection/data remain | adapter registration unchanged | primary rendering unchanged | failing presentation child closes |
| entry removal cleanup failure | entry stays logically absent | not applicable | resources attempted best-effort, residual private | public entry authority closed |
| plugin cleanup failure | semantic entries survive unless independently removed | plugin registrations unavailable | unrelated rendering continues | plugin quarantined/dead |
| app cleanup failure | app remains terminally destroyed | registrations unavailable | all remaining cleanup attempted | app dead; residuals reported |

Errors use a small stable code set with contextual fields and original causes rather than a deep hierarchy. Callers MUST be able to distinguish descriptor/resolution errors, missing dependency, cycle, setup failure, registration conflict, dead scope, unavailable extension, provider-in-use, invalid selection, interaction conflict, renderer failure, uninstall blocked, cleanup failure, and app destroyed. Every mutation error SHOULD state whether its state transition committed.

## 46. Built-in Plugin Parity

Built-in domain, input, UI, presenter, renderer, and feature plugins SHOULD use the same guarded PluginContext, typed registries, ownership, setup transaction, and teardown as external plugins.

Legitimate internal infrastructure exceptions are limited to:

- application shell/bootstrap;
- plugin runtime and ownership engine;
- EntryStore and SelectionStore internals;
- registry commit and provider-lease internals;
- RenderingCoordinator and controller/generation internals;
- destruction coordination and app-owned host infrastructure.

Shipping with Tilia is not sufficient reason for mutable core access or privileged foreign resource access.

## 47. Public and Internal API Boundaries

| Concept | Classification |
|---|---|
| `PluginDefinition`, guarded `PluginContext` | public plugin API |
| scope `signal`, child/defer/track escape hatches | public plugin API, constrained |
| typed service/domain/input/contribution/entry/selection/map facades | public plugin API |
| standard domain contracts such as GPX/Photo | domain-facing built-in/public contracts |
| host-specific contribution facades and domain UI adapters | presentation-facing public/built-in contracts |
| advanced raw Leaflet Map escape hatch | public advanced API for caller-owned effects |
| EntryStore/SelectionStore guarded views | public facades over internal infrastructure |
| raw scope records and ownership engine | internal runtime infrastructure |
| mutable registry indexes and atomic commit engine | internal runtime infrastructure |
| provider private entry hooks and lease mutation | internal runtime infrastructure |
| DomainRendererRegistry implementation/hooks | internal presentation infrastructure |
| RenderingCoordinator, EntryRenderController | internal runtime infrastructure |
| RenderGeneration object, generation sequence allocation | implementation detail/internal |
| semantic revision storage | internal state; opaque value may appear in typed snapshots/status |
| raw renderer Leaflet layers | private implementation detail |

Public diagnostics MAY expose copied/frozen IDs, states, revisions/tokens, dependency edges, and errors. They MUST NOT expose mutable maps, scopes, promises, private provider hooks, raw implementation values, or release methods.

## 48. Compatibility and Removed Patterns

This architecture is a major-version boundary. It intentionally removes these supported patterns:

- mutable `app.core` and mutable `app.state`;
- public mutable `state.entries`, `entry.source`, `entry.layer`, `entry.interactions`, and presentation bags;
- parallel source/layer arrays;
- automatic service publication from setup return values;
- descriptor-owned permanent stylesheets;
- validation-only dependency ordering;
- raw-layer Interaction Hub publication;
- Selection Hub ownership of popup state;
- global `refreshView()`-style correctness coordination;
- unowned append-only registries;
- manual cleanup as the primary lifecycle convention;
- installation-order UI/contribution/interaction semantics;
- GPX/Photo branches in generic core or generic UI hosts;
- cross-plugin mutation of foreign DOM or Leaflet resources;
- direct control/layer attachment as the supported public lifecycle path.

No compatibility shim is required merely to preserve these obsolete responsibility boundaries.

## 49. Architectural Invariants

### Runtime

1. At most one live lifecycle record exists per app/plugin ID.
2. An installed plugin has every hard dependency installed.
3. A plugin is installed only after setup and staged-registration commit succeed.
4. Reachable dependency cycles are rejected before setup.
5. Concurrent installation of one ID shares one operation and result.
6. Dependencies remain until explicit removal or app destruction.
7. A destroyed app never returns to active state.

### Ownership

8. Every Tilia-visible effect has exactly one owner scope or shared-manager lease.
9. A child cannot detach from or outlive its parent.
10. Scope closing revokes authority and aborts descendants before cleanup.
11. Children dispose reverse-creation-order; local records dispose LIFO.
12. Cleanup is best-effort; successful records never rerun.
13. Only explicitly retry-safe failed records may be retried.
14. Closed scopes cannot create, publish, or mutate effects.
15. General ownership transfer does not exist.

### Semantic State

16. Every committed entry is application-owned with one never-reused ID and one immutable domain association.
17. Generic entries expose only `id`, `domain`, and `visible`.
18. Generic core never interprets domain-specific structures or presentation.
19. Live/uncommitted entries hold provider leases; provider removal is blocked while leased.
20. Domain mutation occurs only through guarded domain commands.
21. Renderer/UI failure cannot roll back independently committed semantic state.

### Extension Mechanisms

22. Registrations are staged and invisible until complete setup commit.
23. Registration publication is synchronous, preflighted, and callback-free.
24. Notification failure cannot roll back committed state or stop peer delivery.
25. Services, domains, inputs, contributions, subscriptions, and resources remain distinct.
26. No public universal registry, capability registry, command bus, or global event bus exists.
27. Contribution and input ordering is explicit and independent of install timing.
28. Built-in and external plugins use the same guarded contracts where practical.

### Selection

29. Global selection is null or one immutable `{entryId, domain, ref}`.
30. Selection contains no mutable domain, render, DOM, popup, chart, hover, or draft state.
31. Only the domain validates/resolves/reconciles its refs.
32. Visibility and renderer replacement do not inherently clear selection.
33. Entry removal invalidates its selection before render/resource disposal.

### Interaction

34. Interaction converts physical input to semantic intent; it does not store semantic state.
35. Every binding has one scope and loses authority before its resource is disposed.
36. Precedence is modal/object/background, never installation order.
37. Raw Leaflet layers are not semantic handles.

### UI and Presentation

38. Hosts own placement/container/focus; contributors own only assigned subtree resources.
39. UI state is not authoritative semantic/configuration state.
40. Popup/highlight resources are presenter-owned, not SelectionStore-owned.
41. Popup close does not clear selection by default.
42. Presentation failure or uninstall leaves semantic state intact.
43. Generic UI uses narrow domain adapters and contains no domain branches.

### Rendering

44. Semantic entries remain valid without a renderer.
45. One primary renderer may be active per domain ID.
46. Every entry controller is app-owned; every generation has one destination-owned scope.
47. Every generation records source semantic revision and opaque token.
48. A stale generation cannot interact with or present as current semantic state.
49. Replacement never publishes a half-built generation.
50. Semantic identity never depends on Leaflet or generation identity.
51. Renderers expose immutable descriptors or controlled scoped hooks, not foreign layers.
52. Plugin overlays consume semantics and own independent resources.
53. Base maps are outside domain entry rendering.

### Failure

54. One cleanup, notification, mount, presentation, or renderer failure does not prevent unrelated cleanup/work.
55. Errors distinguish pre-commit failure from committed-with-follow-up-failure.
56. Failed setup publishes no plugin state; incomplete cleanup is quarantined.
57. Logical entry removal is not reversed by cleanup failure.
58. Application destruction remains terminal even when cleanup reports residual errors.

## 50. Conceptual API Reference

All shapes in this section are conceptual; exact implementation signatures may differ.

```ts
interface DomainProviderRegistration<PublicApi> {
  readonly domain: DomainId;
  // private EntryStore hooks are not exposed to plugins
  createPublicApi(consumer: Scope): PublicApi;
}

interface DomainRendererRegistration {
  readonly domain: DomainId;
  build(input: {
    entryId: EntryId;
    semanticRevision: unknown;
    semanticSnapshot: unknown;
    visible: boolean;
    scope: Scope;
    map: MapFacade;
  }): Promise<RenderGenerationDescriptor> | RenderGenerationDescriptor;
  planChange?(change: unknown): "none" | "update" | "replace";
}

interface RenderGenerationDescriptor {
  readonly anchor?: (ref: unknown) => GeographicPoint | null;
  readonly bounds?: (ref?: unknown) => GeographicBounds | null;
  readonly highlight?: (ref: unknown, presenterScope: Scope) => void;
  // raw layers and mutable generation resources are private
}

interface SelectionFacade {
  getCurrent(): Selection | null;
  clear(reason?: string): Promise<void> | void;
  subscribe(listener: (change: Readonly<SelectionChange>) => void): DisposableHandle;
}

interface ContributionRegistration<T> {
  readonly point: ContributionPointId;
  readonly itemId: string;
  readonly descriptor: Readonly<T>;
  dispose(): void | Promise<void>;
}
```

The following lifecycle diagrams summarize the normative flows.

### Overall dependency architecture

```text
plugin implementations -> guarded public contracts -> semantic mechanisms
                                              |
                                              v
                                presentation infrastructure
                                              |
                                              v
                                  private DOM/Leaflet resources
```

### Entry, domain, and renderer lifecycle

```text
DomainProvider prepares semantics -> EntryStore commits app-owned entry
                                           |
                                           v
                              RenderingCoordinator/controller
                                           |
                         optional DomainRenderer builds generation
```

### Selection, interaction, and presentation flow

```text
physical event -> owned binding -> domain canonical ref -> SelectionStore
                                                           |
                                       +-------------------+----------------+
                                       v                   v                v
                                  map presenter       elevation UI      tree UI
```

### Plugin install transaction

```text
resolve graph -> scope/context -> setup + stage -> preflight -> commit -> active
                                  \ failure -> abort/rollback -> absent/quarantine
```

### Render-generation replacement

```text
build candidate -> preflight -> mount -> atomic activate/deactivate
      -> publish status -> dispose old
```

### Teardown and removal ordering

```text
revoke authority -> withdraw public bindings/registrations
  -> close presentations/children/tasks -> local LIFO cleanup
  -> release dependent lease last -> report aggregate errors
```

## 51. Design Record Mapping

This section is non-normative.

| Architecture area | Design record |
|---|---|
| Runtime and dependencies | `phase-2/RUNTIME-DESIGN.md` |
| Ownership and setup transactions | `phase-2/OWNERSHIP-DESIGN.md` |
| Entries and domains | `phase-2/ENTRY-DOMAIN-DESIGN.md` |
| Services, inputs, contributions, subscriptions | `phase-2/EXTENSION-MECHANISMS-DESIGN.md` |
| Selection and interaction | `phase-2/SELECTION-INTERACTION-DESIGN.md` |
| UI and presentation | `phase-2/UI-PRESENTATION-DESIGN.md` |
| Rendering | `phase-2/RENDERER-DESIGN.md` |

The final reconciliation makes these specification-level clarifications:

1. Phase 2C's early wording that a DomainProvider owns rendering behavior is superseded by the separate DomainProvider and DomainRenderer contracts established in Phase 2G. The provider owns semantics; the renderer owns optional map projection.
2. Phase 2C's creation sketch that prepared rendering before entry publication is narrowed: entry commit requires semantic preparation, not rendering success. Rendering begins after semantic commit.
3. Whole-entry visibility is generic presentation state and does not increment semantic revision. No separate generic per-entry version counter is required. Domain-owned presentation changes do increment semantic revision; render generations separately use opaque generation tokens.
4. Generation activation atomically deactivates the old generation before post-commit status notification. Old-resource disposal follows afterward; this makes stale interaction authority unambiguous.
5. Hiding an entry does not clear semantic selection, following the finalized Selection design. It suppresses physical interaction and map presentation only.

No unresolved architecture-blocking decision remains. Exact method names, type encodings, error-code spelling, built-in plugin packaging granularity, visual styling, and implementation data structures remain implementation-detail decisions and MUST preserve this specification's contracts.

---

No source code was modified. This architecture work created only `plugin-architecture/ARCHITECTURE.md`.

- Unit tests: `npm test` — 37 files passed, 336 tests passed.
- Smoke tests: `npm run test:smoke` — 28 tests passed.
- Formatting: Markdown/diff whitespace checks passed.
