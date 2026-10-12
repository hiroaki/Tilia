[日本語](ARCHITECTURE.ja.md)

# Tilia architecture

Tilia is an embeddable mapping library with an application runtime and optional plugins. This document explains its current design: which component owns data, how optional features integrate, and what happens when a view, plugin, or application ends. It is intended for developers integrating Tilia or extending it with plugins.

For working examples, start with the [README](README.md) and [Tilia plugin guide](PLUGINS.md). For plugin implementation patterns and exact application calls, use the [Developing Tilia plugins](PLUGIN-OPERATIONS.md) and [Tilia API reference](API.md). Internal component names below describe responsibilities; they are not additional public APIs.

## Design rationale

Tilia supports small embedded maps as well as viewers and editing tools. Those applications need different combinations of formats, controls, and visualizations. The architecture lets them share consistent data and resource lifetimes while choosing the features they use.

Its central design principle is:

> Core owns mechanisms. Plugins own domain-specific policy and behavior.

Generic mechanisms manage entry identity, selection, dependency ordering, resource ownership, and publication. A domain plugin supplies the meaning of a GPX document or Photo; its input handler knows how to read a file, and its renderer knows how to display it. Generic entry and UI infrastructure does not need to interpret camera metadata or track geometry.

Several choices follow from that principle:

- **Optional features remain optional.** A GPX-only application does not need the JPEG handler's EXIF parser. The catalog exposes lazy loaders; selecting a feature determines which implementations are loaded.
- **Data is authoritative.** Map layers and UI are replaceable views of committed data. Rendering failure or removal does not erase that data.
- **Ownership is explicit.** Every registration, listener, layer, timer, request, and temporary view has an owner. Initialization includes a plan for cleanup, including partial failure.
- **Extension contracts stay specific.** Services, domains, inputs, and UI contributions solve different problems. Plugins integrate through those contracts rather than a universal registry or global event bus.
- **Abstractions serve concrete mapping needs.** Shared mechanisms are justified by uses such as GPX, Photos, editing sessions, and input controls. A format-specific operation does not become generic merely by giving it a generic name.
- **Built-in and external plugins share the model.** Built-ins use guarded contexts, staged registrations, and owned resources too. Application composition and lifecycle coordination remain infrastructure responsibilities.

The result is a plugin system for Tilia's mapping use cases. It does not provide package discovery, dependency version solving, a general scheduler, or a JavaScript security sandbox. Public APIs and configuration are still subject to the project's early-alpha compatibility policy.

## Application and plugin boundaries

Host code creates an app through `createDefaultTiliaApp(container, options)`. The app owns a distinct Leaflet Map, semantic state, registries, and application infrastructure. The host supplies the container and chooses plugin configuration.

The plugin runtime resolves configured definitions, plans hard dependencies, and calls each plugin's `setup(context, options)`. PluginContext provides guarded access to individual mechanisms and gives each plugin a Scope for its resources.

The diagram shows composition and access relationships, not a static import graph:

```mermaid
flowchart TD
    Host[Host application] --> App[Tilia app and owned Map]
    App --> Runtime[Plugin runtime]
    Runtime -. Resolve and install .-> Plugins[Built-in and external plugins]
    Runtime --> Context[Guarded PluginContext]
    Plugins --> Context
    Context --> Semantics[Entries, domains, and selection]
    Context --> Extensions[Services, inputs, and UI contributions]
    Context --> Resources[Owned map, DOM, and resource operations]
```

The composition layer supplies loaders; generic semantic and ownership mechanisms do not import optional plugin implementations to interpret their data. Plugins depend on supported contracts and shared contract keys, rather than another plugin's private implementation.

`app.map` and the plugin's advanced Leaflet access are borrowed access to the app-owned Map. They do not transfer its ownership or grant access to another renderer's private layers. External Map injection is not supported. The exported standalone `createBaseMap` utility is independent of app construction.

## Separate roles within a feature

A feature can consist of several plugins with different responsibilities:

| Role | Responsibility | Example |
| --- | --- | --- |
| Domain | Validate and own semantic data; expose commands, queries, and selection references | `tilia-gpx-domain`, `tilia-photo-domain` |
| Input handler | Recognize and parse files, then create domain entries | `tilia-gpx-input`, `tilia-jpeg-input` |
| Renderer | Project domain snapshots onto the map | `tilia-gpx-renderer`, `tilia-photo-renderer` |
| UI contributor | Supply format-specific layer rows, popup content, and settings | `tilia-gpx-ui`, `tilia-photo-ui` |
| Host or presenter | Arrange contributions or display current selection | `tilia-layers`, `tilia-settings`, `tilia-map-selection-presenter` |
| Tool or overlay | Use domain data while owning independent operation/presentation resources | Track Editor, route search, Milestone |

This separation allows data to exist without a map renderer, a file handler to work without viewer controls, or an editor to keep its own session while the original view changes. Installing one role does not automatically install all the others; the [plugin guide](PLUGINS.md#choosing-plugins) gives concrete combinations.

Base maps have a separate boundary. Their registered definitions, selected tile layer, and selector are map infrastructure, not domain entries or semantic selection targets. They still follow owned registration and resource lifetimes.

## Dependencies and typed extensions

`requires` declares plugin IDs that must be installed before a plugin can operate and remain available during its lifetime. The runtime validates the reachable dependency graph and rejects missing definitions or cycles. Known dependencies install first; an active dependency is reused. There is no automatic package/path discovery from an ID.

A dependency declaration is distinct from a callable service, a semantic domain, or a UI contribution:

| Mechanism | Meaning |
| --- | --- |
| Dependency | Required plugin availability and installation order |
| Service | A callable contract with one active provider per typed service key |
| Domain | A semantic contract with one active provider per domain key |
| Input | One of multiple file-recognition/handling registrations |
| Contribution | Owned content or behavior for a specific UI host |
| Subscription | A Scope-owned observer of one typed subsystem |
| Resource | A concrete effect owned directly or through a shared-manager lease |

Typed keys identify contracts, independently of plugin IDs. Providers and consumers share the same exported key object. Essential integration uses a hard dependency and required lookup; optional integration uses guarded optional access and targeted availability subscriptions, or a contribution that can wait for its host.

Removing a dependency is blocked while an active dependent requires it. Removing a dependent does not automatically uninstall prerequisites, and a successfully installed prerequisite remains if a later dependent fails. Automatically installed dependencies use default options; configure a prerequisite explicitly first when needed. These installation details are covered in [Developing plugins](PLUGIN-OPERATIONS.md#2-install-the-plugin).

## Installation and publication

Each plugin installation has its own publication boundary:

1. Resolve the implementation after planning dependencies.
2. Create its Scope and PluginContext.
3. Run setup, stage registrations, and own any immediate physical effects.
4. Validate the cleanup return value and preflight the registration batch.
5. Commit registrations and mark the plugin active.
6. Deliver post-commit notifications and callbacks.

Other plugins do not observe half-published registry contributions. Listeners, styles, or DOM can be acquired during setup, so their cleanup must already be owned even before commit. Setup or commit failure rolls back that plugin's effects; it does not create a transaction over the whole dependency graph or arbitrary external effects. An application entry already committed through a domain has its own publication boundary and is not automatically removed by a later setup failure.

Post-commit notification failures are isolated and do not reverse committed registrations. `lifecycle.afterCommit` starts work only after the plugin becomes active; its callback returns void and any asynchronous work it starts needs separate ownership and observation.

Concurrent requests for one plugin share installation, and lifecycle changes are serialized. Host code directs installation and removal. Plugins must not call app/runtime installation, removal, or destruction from their setup or cleanup.

## Semantic state and entries

The internal entry store manages application-owned entries through guarded facades. A generic entry snapshot contains `id`, its `domain` key, and whole-entry `visible` state. Labels, geometry, metadata, preferences, and derived values are domain data rather than generic entry fields.

An entry ID is opaque, local to one app, and never reused once reserved. The domain association does not change. Updating data in the same domain preserves entry identity; creating an edited copy or importing a route creates a new entry.

Domain APIs expose immutable snapshots and explicit commands. Revision checks prevent applying a command to data that has changed since it was read. Domain-owned changes, including GPX child visibility/style and Photo time interpretation, can advance the semantic revision. Generic whole-entry visibility is separate and does not advance that revision.

Every in-progress creation and committed entry holds a lease on its exact domain provider. The entry store, not an ordinary service consumer, manages that lease. Explicit provider removal is blocked while leases remain. This prevents persistent entries from losing the implementation needed to interpret or dispose of them.

The creator is not the lifetime owner of a committed entry. An input operation or editing session may end while its successful result remains in the application.

### Creation and input

```mermaid
flowchart LR
    Transport[File, URL, or drop input] --> Handler[Input handler]
    Handler --> Domain[Domain validation and preparation]
    Domain --> Entry[Committed application entry]
    Entry --> Rendering[Renderer builds a map projection]
    Entry --> UI[UI reads domain snapshots]
```

File picker, URL, query, and drop plugins are transports. Installed input handlers claim files; dispatch selects the unique highest-priority claim and rejects a tie. Discovery metadata lets input controls offer the supported extensions and MIME types without knowing their parsers.

An input invocation owns temporary reads and cancellation. Domain creation checks caller, destination, provider, and cancellation authority immediately before publishing the entry. Cancellation before commit prevents publication; cancellation after commit does not roll back the application-owned entry. Dispatch preserves the handler's outcome and cleanup errors rather than promising that any rejected import created no data.

Rendering starts after semantic commit and is not a condition of it. A rendering failure can therefore leave a valid, unrendered entry available to queries, export, or later renderer installation.

### Mutation and removal

A domain command prepares and validates a new snapshot, commits its semantic state/revision, and reconciles selection before rendering catches up. A failure before semantic commit leaves the prior state intact; a rendering or cleanup failure after commit does not reverse the committed change.

Removal first makes an entry logically unavailable and invalidates its selection and presentation authority. It then attempts to close rendering, entry-bound overlays, and domain resources, and publishes the final removal notification after those attempts. The provider lease is released only when required cleanup succeeds. Cleanup uses captured handles because public lookup can no longer find the entry.

Cleanup failure does not restore the entry. Remaining obligations and their provider lease are tracked for permitted cleanup attempts. `entries.clear()` removes entries in reverse insertion order, continues after failures, and batches notifications; it is not an all-or-nothing rollback transaction.

## Rendering and currentness

An optional primary renderer interprets a domain snapshot and creates a disposable map projection. There is at most one active primary renderer per domain contract. Removing it withdraws its projections and interactions while the semantic entries remain; reinstalling it builds from current snapshots.

Internally, an application-owned rendering coordinator maintains an entry controller and generations built by the active renderer. A generation owns its layers, bindings, pane leases, and other resources in a dedicated destination-owned lifetime. Its currency depends on the source semantic revision, renderer registration, generation token, and entry/Scope authority.

For replacement, the renderer prepares a candidate, validates it against current state, and activates it while deactivating the previous generation. Consumers never receive a half-built generation as current. Failure before activation discards the candidate; failure cleaning up the old generation after activation does not roll back the new one.

If data has already advanced, an old generation may only remain as a non-interactive visual fallback or be hidden. It cannot provide current semantic interaction or presentation handles. Rendering status distinguishes `unavailable`, `building`, `active`, and `failed`; availability is separate from the entry's visibility.

Presenters resolve anchors, bounds, and highlights through controlled presentation handles. A handle's `isCurrent()` and `signal` describe its authority. Once invalidated, that handle never revives; renewed presentation requires a fresh resolution. This lets a popup or elevation marker stop using an old projection without accessing the renderer's raw layers.

## Selection, interaction, and visibility

Global selection contains either no selection or one immutable semantic reference: entry ID, domain key, and a domain-validated reference. It contains no Leaflet layer, popup, DOM node, chart hover state, or editor multi-selection. Callers obtain selection candidates from the relevant domain's selection API.

Physical interactions translate map/UI events into semantic intent. Bindings have explicit lifetimes and precedence: modal, then object, then background. A stale event cannot gain authority through an old generation or Scope.

Application composition owns the standard background-click binding in a dedicated application child scope. Through Interaction Host, an unconsumed background click clears Selection Store; with no selection it is a no-op. This binding survives presenter removal and is revoked at application teardown before selection termination. Selection Store owns state and notifications; Map Selection Presenter owns only indicators, popups, and their presentation lifetimes.

Selection and map presentation have different lifetimes:

- Hiding an entry or removing its renderer suppresses its presentation without inherently clearing semantic selection.
- Closing a popup does not clear selection by default.
- Removing an entry or invalidating its selected domain target clears or reconciles the selection.
- Replacing a renderer generation re-resolves presentation; Leaflet object identity is not semantic identity.

Visibility also has separate layers: whole-entry visibility, domain child/category preferences, current renderer availability, and temporary presentation suppression. Editor suppression composes with existing visibility rather than overwriting the user's settings. Releasing it follows the current preferences.

## UI, overlays, and session state

UI hosts own placement, layout, ordering, outer containers, and mount lifetimes. Contributors own behavior and resources within their assigned subtrees. Narrow contributions provide toolbar items, domain layer rows, popup content, and settings. Host-defined groups, rank, and stable IDs determine ordering rather than installation timing.

A contribution can remain registered while its visual host is absent. Hosts close mounted resources when their lifetime ends; optional contributors can become visible again when an appropriate host is available. Hard plugin dependencies still govern whether a host plugin can be removed. Generic layer controls retain visibility/removal and a domain/ID fallback when no format-specific row contribution exists.

Panel state, popup visibility, form input, hover, and editor point selection are local UI/session state. They do not replace authoritative entry data or global semantic selection. A mount or popup failure leaves that semantic state intact.

Plugin overlays read domain snapshots and own independent layers. Milestone labels and elevation highlights do not mutate the GPX renderer's polylines. Entry-bound overlays can bind their child lifetime to entry removal; session overlays can instead follow an editor or request lifetime.

Map resources use ordered bands for base maps, geometry, markers, overlays, selection, and modal/editor presentation, below popup and shell UI. Owned private panes support local placement without arbitrary cross-plugin z-index competition. The current editor's vendor-created point/midpoint markers and drag helpers retain default placement where its public options do not provide the needed band; this does not establish a general exception for plugin resources.

The vendored `PartiallyEditablePolyline` JavaScript and CSS files in `plugins/x-track-editor/vendor/` must not be modified directly within Tilia. Implement Tilia-specific behavior in the editor integration through the library's public API.

### Examples of independent lifetimes

| Feature | Persistent state | Temporary state |
| --- | --- | --- |
| JPEG input | Photo entry with metadata and saved location | EXIF parsing/input invocation |
| Photo rendering | Domain data and saved inference survive GPX changes | Marker and popup/highlight resources |
| Track Editor | Source entry; Save Copy creates a new entry | Independent draft, editing markers, selection, suppression |
| Route search | Successfully created GPX entries | Form, request, Start/Via/Goal markers |
| Milestone | GPX data remains with its domain | Distance labels tied to the entry and overlay plugin |

Photo inference occurs in the semantic domain, using an available GPX timeline when applicable. Later GPX changes do not silently recompute a saved Photo location; Photo commands can request recomputation.

Track Editor's draft remains independent after initialization. Source changes/deletion or renderer removal do not stop editing or prevent Save Copy. Cancel discards the draft and releases suppression; it does not restore or recreate the source. Saving commits values into a new entry, whose renderer creates new resources. Temporary editor layers are not transferred into persistent entry rendering.

## Ownership, cancellation, and failure

A Scope owns an effect's lifetime. Plugin roots belong to the runtime; child scopes support shorter requests, panels, sessions, and presentations. An entry or renderer generation has its own destination-owned lifetime. Resources do not detach from an owner or transfer between generations. Shared resources such as stylesheets use a manager with separately owned leases.

Closing first revokes operational authority and aborts signals, then performs cancellation, waits for explicitly awaitable work, closes children, and disposes cleanup records. Children and local records close in reverse acquisition order; setup-return cleanup runs after children and before local records. Independent cleanup continues after errors, successful records do not repeat, and only declared retry-safe failed records can be attempted again.

Cancellation is cooperative. An AbortSignal requests cancellation; guarded operations and post-await checks prevent stale publication even if the underlying work ignores it. Observing a Promise does not make it cancellable. Resource-specific preparation and disposer handoffs may need to finish before release; arbitrary parsing or detached work does not create a universal shutdown wait barrier.

These boundaries explain different failure outcomes:

| Failure | Result |
| --- | --- |
| Plugin setup/commit | Owned effects roll back; incomplete cleanup can quarantine the ID |
| Input/domain preparation before entry commit | No committed entry; owned preparation cleanup still runs |
| Domain mutation after commit, with cleanup failure | New semantic state remains committed; cleanup obligations are reported |
| Rendering, popup, or UI mount | Committed semantic data and selection remain; affected presentation fails |
| Entry removal cleanup | Entry stays logically absent; unresolved cleanup retains required ownership |
| App destruction cleanup | App stays terminal; independent cleanup is attempted and failures are reported |

A quarantined plugin cannot be replaced through another `use` request. Existing live-app removal paths can attempt permitted safe residual cleanup. These mechanisms do not create a general reset, force-removal, or recovery API. Error and cleanup details are described in [the developer guide](PLUGIN-OPERATIONS.md#7-removal-failure-and-application-destruction).

## Application lifetime and public boundary

`app.ready` completes configured plugin startup. Startup failure initiates cleanup. The host calls `await app.destroy()` when disposing of the component.

Destruction makes the app unusable immediately. Pending publication is fenced, and exact domain providers plus required dependencies are retained while entry or creation cleanup still needs them. Entries and presentations are removed, independent plugin/infrastructure cleanup proceeds, and the app-owned Map's public removal is attempted last. The caller's container and unrelated page resources survive.

Ordinary repeated destruction shares the same outcome, including failure. The old app cannot be reinitialized; after successful cleanup, a fresh app creates a distinct Map on the surviving container. Cleanup failure does not promise immediate reuse. Destroy does not wait for ready, and ready does not wait for cleanup; an externally initiated destroy rejects pending ready, while an initiating startup failure preserves its original cause.

Application shutdown can revoke operations before every retained provider Scope physically closes. Cleanup must use captured resource handles; cached capabilities or an `alive` check alone cannot authorize new work.

Supported entry points are the exports from `src/index.js`, the documented application facades, and PluginContext capabilities. Internal composition factories, stores, registry engines, provider lease mutation, and render-generation machinery are implementation details. Access to a source file does not make it a supported extension point.

Plugins run as normal page JavaScript. Guarded facades enforce Tilia's lifecycle and data boundaries but cannot sandbox a plugin's raw DOM/network access. Host applications remain responsible for trusted code, external dependencies, and effects they create outside Tilia's owned mechanisms.
