# Phase 2F — UI, Presentation & Contribution Architecture Design

## 1. Executive Summary

Tilia should use typed UI hosts for standard aggregation, scope-owned mount callbacks for complex content, and independent presentation adapters for semantic state. It should not force all UI into one descriptor or expose foreign DOM/Leaflet objects.

The recommended model is:

- Generic application shell owns only root mounting infrastructure, map/container integration, known contribution-point contracts, accessibility/fatal-error roots, and terminal cleanup.
- A UI host is an app- or plugin-owned component that owns placement, ordering, layout, focus policy, and mount child scopes for one typed contribution contract.
- Public APIs are host-specific typed facades such as layers, settings, and toolbar contributions. Stable internal point IDs support diagnostics/registry plumbing but callers do not submit arbitrary objects to arbitrary strings.
- Contributions are immutable, scope-owned registrations. Each host defines its own descriptor schema. Standard actions/fields are declarative; complex content may provide a guarded mount callback receiving a host-owned container and a fresh child scope.
- Host owns its container and placement. A contributor owns only its mounted subtree/resources through the mount child scope. It cannot mutate siblings, retain authority after unmount, or use host DOM as a shared API.
- Contribution ordering remains host-defined group, ascending numeric rank, then lexical item ID. Hosts define valid groups; plugins cannot invent ordering topology.
- UI-local state stays local: open panel, tab, hover, focus, popup visibility, form drafts. Entry existence/visibility, domain data/presentation, configuration values, and semantic selection remain in their owning application/domain mechanisms.
- “Presentation adapter” is a design pattern built from guarded domain/entry APIs, typed subscriptions, and an ownership scope—not another global registry type.
- A built-in map-selection presenter plugin observes SelectionStore. It owns popup/highlight resources but not selection. Domain-specific UI adapters supply structured/mounted content. Popup close dismisses presentation only.
- Generic layers/tree UI lists generic entry snapshots, then delegates labels, icons, summaries, children, and domain actions to a single typed domain UI adapter per domain. Extra actions are separate multi-provider contributions.
- Settings host renders typed simple fields/actions and permits a scoped custom mount escape hatch. Configuration remains owned by the responsible service/domain/plugin, never by the settings host.
- Toolbar/control hosts aggregate simple actions. Complex controls, editor panels, and route-search forms remain plugin-owned surfaces mounted through safe helpers.
- Tilia should provide a guarded map facade with owned helpers for events, layers, overlays, viewport operations, surfaces, and controls. An explicitly advanced Leaflet escape hatch may expose the caller-owned map, but never foreign layers, and all effects still require scope registration.
- Direct `map.addControl()` is not the supported lifecycle path. A control mounting helper adds/removes the plugin-owned control and owns its DOM/listeners; simple controls should prefer toolbar contributions.
- No first-class rendering-augmentation registry is justified yet. Milestones, directional arrows, warnings, and annotations can consume semantic domain snapshots/entry changes and own separate overlay layers. Raw foreign layer access is prohibited by default.
- A separate renderer architecture design is required before implementation because entry render-controller/generation APIs, selected-state hooks, visibility, and semantic interaction mapping remain intentionally deferred.

The architecture preserves substantial plugin-owned UI while removing mutable core access, domain branches in generic hosts, permanent resources, and raw cross-plugin renderer coupling.

## 2. Inputs and Phase 2A–2E Constraints

This design preserves:

- transactional plugin setup and staged contribution registration;
- one owner scope for every registration, DOM subtree, control, listener, popup, and overlay;
- app-owned entries with domain-private data and guarded APIs;
- typed contributions distinct from services and resources;
- deterministic group/rank/item-ID ordering;
- typed post-commit subscriptions with isolated failures;
- semantic selection independent of render objects, popup, and viewport;
- render/session-owned interaction bindings and session-local editor selection;
- built-in/external parity and no mutable `app.core`/`app.state`.

No approved decision conflicts with the UI model. Phase 2F identifies a remaining renderer-contract gap rather than weakening Phase 2C/2E by exposing layers.

## 3. Current UI Architecture

```text
createTiliaApp
  ├─ Leaflet map/container (caller- or factory-owned)
  ├─ core global stylesheet
  ├─ createUiSurfaceManager
  │    ├─ panel root
  │    └─ floating root
  ├─ built-in plugins create Leaflet Controls directly
  └─ tilia-panel plugin owns one active panel

plugins
  ├─ app.ui.mountSurface(...) for standalone DOM
  ├─ panel service open/toggle/rerender callbacks
  ├─ app.addRefreshHandler() for coarse rerender
  ├─ app.core/app.state direct read/mutation
  ├─ raw map/layer listeners and resources
  └─ descriptor stylesheets (permanent today)
```

`src/ui/surfaces.js` owns application-level roots, collision/layout CSS variables, optional `ResizeObserver`, and item mounting. Same-ID mount silently replaces an existing element. `src/plugins/ui/panel.js` owns the actual panel and exposes an imperative service whose render callback supplies DOM.

`layers-control.js` is both generic entry host and GPX/Photo UI: it reads mutable entries, formats GPX summaries, creates Photo thumbnails/time-mode controls, changes GPX globals, removes/fits entries, and manually rerenders. `settings-panel.js` has a generic name but only Photo time configuration. `elevation-panel.js` combines GPX queries, chart UI, selection presentation, popup timing, and temporary map markers.

External editor and route-search plugins own complex panels/forms, controls, map layers, menus, and listeners. This is legitimate complexity but currently relies on raw map/core/surface helpers. Styles in `src/ui/styles.css` also mix shell, GPX, Photo, elevation, and route presentation.

## 4. Current UI Surface Inventory

| Surface | Current owner/update/data access | Future role |
|---|---|---|
| surface roots/layout offsets | app surface manager | application shell infrastructure |
| `tilia-panel` | built-in plugin; imperative service; render callback | built-in host plugin/service |
| layers panel/control | built-in; refresh polling; raw GPX/Photo entries | generic typed layers/tree host + domain UI adapters |
| settings panel | built-in; direct Photo core methods | settings host plus Photo contribution |
| elevation panel | built-in; GPX/selection/map popup coupling | domain presentation plugin and interaction surface |
| file/URL controls | built-in plugins; InputRegistry | simple toolbar action or plugin-owned small control |
| query/dropzone | plugin; DOM target listeners/no persistent visible UI | plugin-owned resource/UI behavior |
| status control | built-in service/control | optional status service + presenter plugin |
| base-map selector | built-in control and catalog | typed toolbar/control host consumer |
| selection popup | Selection Hub/core | map-selection presenter plugin |
| Photo/GPX popup content | shared map module | domain UI presentation adapters |
| track editor | external complex control/panel/session overlays | plugin-owned mounted UI plus launcher contribution |
| route search | external complex panel/context menu/control/markers | plugin-owned surface plus launcher contribution |
| milestone markers | external raw-layer consumer | plugin-owned derived overlay, pending renderer boundary |

## 5. UI Host Definition

A UI host is an application- or plugin-owned presentation component that aggregates one typed contribution contract and owns placement, ordering, mounting/unmounting, focus restoration, and host layout policy.

The host does not own contribution semantic state. Examples justified now are layers/tree, settings, and a toolbar/action area. The panel shell may host complex mounted content but need not expose every panel as one universal contribution list.

Hosts expose typed snapshots/facades rather than DOM roots. Their lifecycle may be shorter than contribution registrations; mounting a host later consumes the current committed snapshot.

## 6. Contribution Definition

A UI contribution is an immutable, typed descriptor plus guarded behavior registered to a known host contract under one owner scope.

Common infrastructure metadata is only item ID, host-defined group, rank, and owner diagnostics. Label, icon token, action, enabled/visible state, domain applicability, entry applicability, or mount behavior exist only when that host schema defines them.

Contributions are not services, state stores, DOM nodes, or commands. They describe how a host may expose existing semantic operations.

## 7. Contribution Point Identity

Internally, contribution points have stable lower-kebab contract IDs for registry indexing and diagnostics. Public plugin context exposes typed host facades rather than `contribute(string, arbitraryObject)`.

```js
context.ui.layers.registerEntryAdapter(...)
context.ui.settings.registerItem(...)
context.ui.toolbar.registerAction(...)
```

An advanced generic registry may be used internally, but every public point has a validator/type contract. Known point IDs are distinct from host-plugin IDs. Unknown points reject; typos never become dormant invisible registrations.

## 8. Typed Host Contracts

Use host-specific facades backed by Phase 2D's shared ContributionRegistry. This preserves ergonomic typed methods and permits external hosts to publish their own separately typed facade/service.

The initial architecture should define only points evidenced by current needs:

- layers/tree domain adapter and extra entry actions;
- settings items/sections;
- toolbar/simple map actions;
- possibly panel launchers or application actions if toolbar placement requires them.

Popup domain adapters and map presenters are typed presentation contracts, not forced into the same UI-item schema.

## 9. Contribution Ordering

Ordering is:

1. host-defined group order;
2. ascending finite numeric rank, default `0`;
3. lexical item ID.

Plugins select only declared groups. Unknown group rejects during registration. Rank controls local preference without becoming a dependency graph. Item ID guarantees stable ties independent of install order. Hosts may reserve groups for shell-critical items.

## 10. Contribution Ownership and Lifetime

Three ownership layers are explicit:

```text
contributor scope -> contribution registration and callback authority
host scope        -> host container/layout/subscription
mount child scope -> DOM subtree, listeners, controls/resources for one mounted item
```

When a contribution disappears, the registry snapshot changes synchronously; the host closes its mount child before removing/reordering DOM. Contributor teardown then continues. Host removal closes all mount children but registrations may remain dormant for a later host.

The mount child observes both host and contributor liveness. It never detaches to either parent; internally the host owns the child and the guarded descriptor becomes unusable when the contributor closes.

## 11. Contribution Mounting

Use a host-specific hybrid:

- Declarative descriptors for simple labels, toggles, buttons, select fields, and actions the host can render accessibly/consistently.
- Scoped mount callbacks for complex domain trees, charts, forms, or custom panels where a universal schema would leak implementation details.
- No framework/component abstraction is required.

A mount callback receives a host-owned empty container, immutable context/snapshot, and constrained mount scope. It returns no authoritative state; cleanup belongs to the scope. Host updates either call a typed `update(snapshot)` handle or close/remount the item, as defined per host. Mount errors isolate that item.

## 12. DOM Ownership

Host owns outer container, ordering wrappers, focus policy, and layout attributes. Contributor owns only nodes/listeners created within its assigned subtree through the mount scope.

Plugins may create DOM for their subtree and standalone surfaces. They may not query/mutate sibling contributions, replace host containers, depend on another plugin's CSS-private classes, or retain mutation authority after unmount. Document/global listeners require ownership helpers.

Retaining a detached DOM node as inert data is harmless; invoking guarded callbacks or remounting it outside a new scope is not supported.

## 13. UI State vs Application State

| State | Owner |
|---|---|
| entries, whole visibility | EntryStore |
| GPX track visibility/style, Photo time mode | domain state/presentation commands |
| semantic selection | SelectionStore |
| configuration values/defaults | owning plugin/service/domain configuration model |
| panel open, tab, expanded tree rows | host/plugin UI-local state |
| hover, focus, popup open, chart cursor | presentation adapter/UI-local state |
| editor form draft/history/local selection | editor session |
| route form/request draft | route-search plugin/request scope |

Potentially persistent preferences remain domain/plugin state exposed by guarded APIs. A UI may edit them but never becomes their source of truth.

## 14. Presentation Adapter Model

A presentation adapter observes semantic application/domain state and owns concrete resources that represent it without becoming semantic authority.

It is a design pattern implemented with a scope, typed subscriptions, domain resolution, and UI/map helpers. No global PresentationAdapterRegistry is needed. Where discovery is required—such as one popup content adapter per domain—a narrow typed registry/contribution point defines that contract.

## 15. Selection Presentation

SelectionStore supplies immutable semantic references and typed changes. Each presenter:

1. checks its scope and selected entry/domain;
2. resolves current domain presentation data;
3. checks entry/target render visibility where relevant;
4. updates only its owned popup/highlight/DOM;
5. closes resources on clear, hide, uninstall, or failure;
6. leaves semantic selection unchanged on presentation failure/removal.

Renderer replacement triggers a render-generation signal or a presenter re-resolution path, not selection reset. Tree/elevation can present a hidden selection while map presentation is suppressed.

## 16. Map Selection Presenter

Tilia should ship an ordinary built-in map-selection presenter plugin. It depends on map host/SelectionStore services, observes current selection, resolves one domain popup adapter, and owns popup/highlight resources in its plugin/presentation child scope.

Popup and highlight may be separate internal children because popup dismissal and render-highlight availability differ, but one plugin may coordinate them initially. Removing the presenter closes map presentation only. Selection and entries remain.

## 17. Popup Architecture

The map-selection presenter creates and owns the Leaflet Popup. It does not store popup in SelectionStore. It acquires structured content from the selected domain's UI adapter and uses a scoped mount container rather than arbitrary HTML strings.

- selection change/clear closes the previous popup generation;
- popup close only changes presenter-local state;
- hidden target suppresses/closes map popup while selection survives;
- renderer replacement re-resolves anchor/content and may reopen/update presentation;
- popup creation/mount failure reports presentation error and leaves selection intact;
- stale `popupclose` is ignored with a generation token.

No general third-party popup-section ecosystem is justified initially. One primary adapter per domain avoids ordering and security/layout complexity; later typed sections can be added with evidence.

## 18. Popup Content Boundary

Compare alternatives:

- Generic presenter formatting raw domain snapshots would import domain knowledge.
- Domain returning HTML/DOM makes semantic provider own UI and complicates optional presentation.
- Domain-specific UI plugin mounting content preserves optionality and UI ownership.

Recommendation: a domain UI adapter consumes guarded domain semantic snapshots and mounts popup content into a presenter-owned container under a child scope. The domain provider may ship the adapter in the same package, but its semantic API and UI registration remain distinct.

GPX and Photo therefore provide different typed resolvers/mounters without core branches or generic `selection.data`.

## 19. Layers / Tree Architecture

The generic host owns the top-level entry list, generic whole-entry visibility/removal, selection highlighting, ordering, and expansion UI. For each entry it resolves the single committed layers/tree adapter registered for that domain.

The adapter supplies immutable presentation descriptions and/or a scoped child mount for domain structure. GPX may show tracks/routes/waypoints; Photo may show Photo details; future domains choose their own hierarchy. The host never enumerates GPX nodes.

Multi-provider extra actions/decorations are separate contributions filtered by domain/entry. A domain's primary tree adapter is single-provider to avoid two competing structural models.

## 20. Generic Entry Presentation

The generic envelope remains `{id,domain,visible}`. A layers/tree domain adapter provides label, icon token, summary, child presentation, and domain actions. If no adapter exists, the host displays a deterministic fallback such as `<domain> entry <id>` and still supports generic visibility/removal.

This avoids moving `name` or UI metadata into EntryStore. The fallback makes semantic entries manageable even when optional UI plugins are absent.

## 21. Domain Presentation Contract

Semantic domain APIs should expose immutable data necessary for authorized UI but should not contain English labels, HTML, icon names, or host layouts by default. A domain-specific UI adapter translates those snapshots into host-specific presentation.

The initial optional contracts are:

- one layers/tree adapter per domain;
- one map-selection popup adapter per domain;
- domain-specific settings items/actions as ordinary contributions.

Adapters use `context.domains` guarded APIs. Bundling them with a domain plugin is allowed; separate installation remains possible.

## 22. Layers / Tree Actions

- Whole-entry visibility/removal: generic EntryStore commands rendered by the host.
- Select target: domain selection adapter/SelectionStore request.
- Fit/reveal: optional map/domain presentation capability, separate from selection.
- GPX track visibility, Photo time mode, edit/export: domain commands or guarded plugin callbacks contributed to the relevant host.
- Start editor/export: plugin-contributed actions whose owner liveness is checked.

The host renders actions; it does not implement their semantics or create a global command bus.

## 23. Settings Architecture

Use a settings host with typed host-defined groups and a hybrid descriptor:

- simple boolean/choice/number/action fields are declarative and accessible by the host;
- complex settings may mount scoped custom content;
- descriptors read immutable current values and call guarded semantic setters;
- configuration storage/persistence belongs to the responsible service/domain/plugin.

The current Photo-only `tilia-settings` becomes a generic host plus a Photo settings contribution. Host uninstall hides settings UI without resetting configuration. Contributor uninstall removes its fields before its state/provider cleanup.

## 24. Toolbar / Control Architecture

A toolbar/control host is justified for current small launchers and actions: layers, settings, elevation, file import, base maps, status affordances, and plugin launch buttons all need placement/order/responsive policy.

Simple contributions contain label/accessibility name, icon token, group/rank, guarded action, and optional enabled/visible snapshot functions defined by the host contract. Complex controls may use a scoped custom mount or a standalone plugin-owned Leaflet control through the map facade.

The host manages ordering and mobile layout. It is not a full command registry.

## 25. Actions and Commands

No reusable global command abstraction is needed initially. An action contribution is a thin guarded callback that invokes an existing semantic API: EntryStore, SelectionStore, domain service, input flow, or plugin session.

Operations that must be reusable programmatically belong on those semantic APIs, not inside UI descriptors. Common host fields for label/enabled/action do not make actions globally addressable commands.

## 26. Elevation Architecture

Elevation remains an ordinary GPX-specific presentation plugin with several roles:

- contributes a launcher/panel to standard hosts;
- mounts its chart in a plugin/host mount scope;
- queries GPX profile snapshots through the domain API;
- subscribes to SelectionStore and EntryStore;
- initiates GPX point selection from chart interaction;
- owns hover/cursor/highlight map resources;
- optionally asks a map presenter to reveal, separate from selection.

Renderer replacement is irrelevant to its semantic data; it re-resolves snapshots. Entry removal clears relevant UI through typed changes. Uninstall removes contributions/subscriptions/highlights without touching selection or GPX entries.

## 27. `x-track-editor` UI Validation

The editor registers a simple launcher/toolbar item and may use a panel host mount point, but its form, history buttons, inspectors, session-local selection, and lifecycle remain plugin-owned custom UI. Forcing those into generic settings/actions descriptors would expose editor internals and create a framework.

Its mount/session child scopes own DOM listeners, draft layers, modal interactions, selection overlay, and temporary controls. It uses GPX/Entry APIs for committed data and Save Copy. Panel/host removal ends or relocates UI according to plugin policy; plugin uninstall cancels session and removes all resources.

## 28. `x-route-search` UI Validation

Route search contributes a launcher but owns its complex form, floating panel, context menu, request state, and origin/via/destination markers. Surface mounting helpers provide placement and ownership; request children cancel async work.

Results commit through a domain API and survive route-search UI/plugin removal. The plugin does not need layers-host DOM access. Responsive layout is handled by surface/host policy rather than route-search querying sibling controls.

## 29. `x-milestone` Design Probe

Current milestone consumes raw GPX layers, attaches anonymous layer listeners, reads mutable entries, and creates map markers. That implementation is not preserved.

The legitimate semantic need—derive distance markers from GPX tracks and keep plugin-owned overlays synchronized with entry/domain/viewport changes—also applies to arrows, warnings, annotations, and route decoration. However, all can initially use immutable domain snapshots, EntryStore/domain changes, viewport subscription, and plugin-owned overlay layers. They do not require mutation or observation of the provider's layers.

Therefore milestone supports a safe overlay pattern but does not yet justify a renderer-augmentation registry.

## 30. Rendering Augmentation

Initial model:

```text
domain semantic snapshot + entry/viewport subscriptions
  -> augmentation plugin computes presentation
  -> map facade creates plugin-owned overlay resources
  -> plugin/entry-operation scope disposes them
```

This supports multiple plausible decorations while preserving ownership. An augmentation may key its private state by entry ID and recompute on domain changes. It cannot inject children into or mutate the domain renderer.

If later evidence requires exact geometry sharing, render-pass composition, or z-order contracts unavailable from semantic data, a future renderer design may introduce a domain-specific typed augmentation point. It must expose semantic/render descriptors or controlled drawing context, not raw foreign layers.

## 31. Raw Layer Access

External plugins must not receive raw Leaflet layers owned by entries, renderers, or other plugins. Current-style raw layer publication creates mutation authority, stale references after rebuild, missing withdrawal, and unremovable callbacks.

Allowed alternatives are semantic snapshots, owned plugin overlays, narrow read-only render descriptors, or a future dedicated renderer contract. Leaflet object identity is never a public semantic handle.

## 32. Map Access Boundary

Default `context.map` is a guarded facade offering:

- owned layer/overlay/control mounting;
- owned map-event subscription;
- read-only viewport/bounds/project operations;
- explicit pan/fit/reveal requests;
- access to plugin-owned panes/resources where supported.

For advanced Leaflet plugins, an explicit escape hatch may expose the caller-owned raw `Leaflet.Map`, because completely hiding Leaflet would make real map plugins impractical. Use is documented as advanced: the plugin may create/attach only its own resources, must register cleanup immediately, and receives no foreign entry layers or internal panes. Scope helpers remain the supported lifecycle path.

This is an integrity contract, not a security sandbox.

## 33. Leaflet Control Ownership

Simple controls prefer toolbar contributions. A complex plugin-owned Leaflet Control is created by the plugin and mounted through `context.map.mountControl(control, options)`, which:

- validates owner liveness/placement metadata;
- adds it to the map;
- registers immediate idempotent removal;
- treats returned DOM/listeners as plugin-owned resources;
- optionally coordinates shell edge policy.

Direct `map.addControl()` is outside the supported public lifecycle API. Host-managed controls use group/rank/item ordering; standalone Leaflet corners retain Leaflet placement with shell collision policy.

## 34. Presentation Resource Ownership

| Resource | Typical owner |
|---|---|
| popup/highlight | selection presenter child scope |
| tooltip | rendering/presenter or UI mount child |
| derived overlay/milestones | augmentation plugin per-entry child |
| contribution DOM subtree | host-created mount child tied to contributor |
| standalone panel/context menu | plugin scope or operational child |
| Leaflet Control | plugin scope/mount child |
| elevation chart/hover marker | elevation mount/presentation child |
| editor layers/form/selection rings | editor session child |
| route markers/form/request UI | route plugin/request child |

No resource changes owner. A resource that must outlive one mount is created in the plugin scope and represented in the mount rather than transferred from the mount child.

## 35. Renderer Replacement

Presentation code stores semantic IDs/references, not foreign render objects. On a generation change:

- old interactions withdraw and old render scope closes;
- new generation exposes its semantic interaction/presentation availability;
- map selection presenter re-resolves anchor/highlight through a renderer-facing contract;
- tree/elevation continue from domain snapshots;
- plugin-owned overlays recompute only if relevant semantic/viewport changes require it.

A typed render-generation notification may be required for map-attached presenters, but broad UI refresh is not. The future renderer phase must define this narrow signal and selected-state hook.

## 36. Dynamic Plugin Installation and Removal

Contribution commit/removal updates host snapshots after registry commit. Hosts batch reconciliation, close removed mount children before DOM removal, preserve unaffected keyed mounts/focus where possible, then mount new items.

Removing elevation or map presenter removes only its UI/resources; semantic selection persists. Removing a domain UI adapter leaves entries manageable through generic fallback and closes its mounted content. Domain provider removal remains blocked by entries. Installing adapters later immediately presents current entries/selection from snapshots.

## 37. Host Absence

Known contribution-point contracts are registered by shell/composition independently of whether a visual host is currently mounted. Contributions to a known point may remain dormant and appear when a host installs. Unknown point IDs reject.

A plugin for which visible host integration is mandatory declares a plugin dependency on the host plugin and requires its typed facade during setup. Optional integration uses optional point availability. This avoids both silent typos and forced installation of every UI host.

## 38. Built-in vs External UI Plugins

Layers/tree, settings, elevation, file import UI, selection map presenter, status, and base-map selector should be ordinary lazy built-in plugins using the same host/contribution/map contracts as external plugins.

Core retains only shell roots, contribution point definitions, map/container adapter, ownership helpers, Selection/Entry mechanisms, and fatal/bootstrap diagnostics. Built-ins receive no mutable shortcut to core/domain state.

## 39. Application Shell

Minimum shell responsibilities are:

- bind the caller/factory map container;
- create/destroy stable surface roots and layout coordination;
- define known core UI host contracts/slots;
- provide focus/accessibility roots and fatal initialization error fallback;
- provide guarded map/surface helpers;
- participate in app destruction and preserve caller-owned infrastructure.

The shell contains no GPX/Photo branches, entries UI, settings values, plugin service lookup, or general mutable UI state.

## 40. UI Errors and Isolation

| Failure | Result |
|---|---|
| malformed contribution | registration preflight rejects; nothing published |
| mount/render throws | item mount child rolls back; host and peers remain; item shows optional host error placeholder |
| guarded action throws | semantic operation reports failure; host remains mounted |
| domain resolve/presenter fails | presentation closes/marks unavailable; semantic state remains |
| popup creation fails | selection remains; presentation diagnostic emitted |
| host reconciliation fails | retain last consistent host snapshot where possible; isolate failing item and report |
| UI cleanup fails | continue other cleanup; Phase 2B aggregate/quarantine rules apply |

Errors use stable codes such as `UI_CONTRIBUTION_INVALID`, `UI_MOUNT_FAILED`, `UI_ACTION_FAILED`, `PRESENTATION_UNAVAILABLE`, and `UI_CLEANUP_FAILED`, with owner/point/item IDs and committed-state information.

## 41. Reentrancy and Update Scheduling

Registry/semantic mutations commit synchronously. Hosts and presenters receive post-commit typed notifications and schedule one microtask reconciliation per host/presenter, batching multiple changes. Before applying, they read the latest snapshot and verify scope/version.

Unmount cleanup completes before replacement mount in the same keyed slot. DOM event semantic mutations enter the app's serialized operation queue; their resulting UI changes are processed in a later reconciliation, not recursively inside the original handler. Callback failures are isolated.

Immediate shell safety actions—marking a binding inactive or closing a removed mount scope—remain synchronous; expensive DOM/chart rebuilding is batched.

## 42. Accessibility Boundary

Typed standard contribution descriptors must require an accessible label/name and semantic role implied by the host item type. They may include description, disabled state, current/pressed state, and icon as supplementary metadata.

Host owns keyboard navigation, focus order, ARIA relationships, and focus restoration when items disappear. Mount callbacks own accessibility within their subtree and receive a labeled container/context. Popup/dialog adapters declare presentation role/focus policy through their typed contract rather than raw HTML.

Exact markup/localization remains later work, but labels cannot be optional decorative afterthoughts.

## 43. Keyboard Interaction Boundary

Standard toolbar actions, tree rows, toggles, and settings items use host-owned keyboard behavior and activation. Contributors supply semantic callbacks, not key listeners.

Complex editor/route forms own keyboard behavior inside their subtree/session. Document/map-global shortcuts require explicit owned helper registration and conflict policy in a later keyboard design if evidence warrants it. No global shortcut manager is introduced here.

## 44. Responsive / Multiple Presentation Hosts

Contribution semantics must avoid current desktop DOM assumptions. A host implementation decides desktop/mobile placement. Declarative items can be rendered by multiple host instances. Custom mount callbacks must support one independent child/mount per consuming host or declare a host contract that permits only one active mount.

Different semantic destinations remain different typed points; toolbar and overflow menu should share one action point only if the shell intentionally renders the same descriptor responsively, not by duplicating registration.

## 45. Testing Model

Contribution/host unit tests:

- staged registration, duplicate/schema/group rejection, deterministic order;
- scope cleanup, dormant known point, unknown point failure;
- host current snapshot, dynamic add/remove, keyed mount preservation;
- declarative and custom mount child ownership, callback liveness;
- focus restoration and required accessibility metadata.

Presentation tests:

- selection popup/highlight, popup close independence, clear cleanup;
- hidden entry suppression with semantic selection retained;
- renderer generation replacement and stale-popup token;
- entry removal, domain resolution failure, presenter uninstall;
- one presenter failure isolated from selection/other presenters.

Ownership tests cover DOM/listener/control/surface/overlay cleanup, mount rollback, host removal, plugin removal, and app destroy. Integration/smoke tests cover GPX/Photo layers UI, Photo popup, elevation, editor, route search, optional Photo absence, dynamic contributions, and responsive host composition.

## 46. Migration Pressure

| Current file/API | Direction |
|---|---|
| `src/core/boot.js`, `state.js` UI-facing APIs | replace with Entry/Domain/Selection guarded APIs |
| `layers-control.js` | split into generic host, domain adapters, action contributions |
| `settings-panel.js` | replace with settings host + Photo contribution |
| `elevation-panel.js` | domain presentation plugin + selection interaction/mount scope |
| file/URL import controls | toolbar actions or owned standalone controls |
| GPX/Photo popup builders | move to domain UI adapters/map presenter |
| Selection Hub popup code | remove; map presenter owns popup |
| Interaction Hub layer consumers | remove raw-layer publication |
| refresh handlers / `refreshView()` | replace with typed subscriptions/host reconciliation |
| plugin descriptor stylesheets | owned style leases in setup |
| control helpers/direct add | move to toolbar or owned map-control facade |
| `x-track-editor` UI | retain complex plugin-owned UI; migrate launcher/panel/map helpers |
| `x-route-search` UI | retain complex plugin-owned surface; migrate ownership/facades |
| `x-milestone` | redesign as semantic-data-driven owned overlay |
| monolithic `src/ui/styles.css` | split shell versus plugin/domain-owned style leases |

## 47. Relationship to Future Renderer Work

A separate renderer architecture phase is required before implementation. Phase 2F requires it to define:

- domain entry render-controller and generation transaction;
- render-generation scopes and replacement notification;
- whole/domain visibility application;
- semantic target-to-render binding and selected-state hooks;
- safe anchor/bounds/highlight descriptors for presenters;
- map pane/z-order ownership;
- no raw cross-plugin layer mutation;
- lifecycle of domain renderer interactions;
- whether evidence warrants typed domain-specific augmentation points.

It should not redesign EntryStore, SelectionStore, UI hosts, or introduce a general graphics framework. Until that phase, Phase 2F sketches map presenter/augmentation dependencies but does not finalize renderer APIs.

## 48. Recommended Architecture

```text
                         Application Shell
                   roots / map facade / point contracts
                               |
           +-------------------+-------------------+
           |                   |                   |
      Layers Host         Settings Host       Toolbar Host
           |                   |                   |
      typed descriptors + host-owned mount child scopes
           |
      domain/plugin UI adapters

EntryStore / Domain APIs / SelectionStore
           |          typed subscriptions
           +-------------------+-------------------+
                               |
                    presentation adapters
           +-------------------+-------------------+
           |                   |                   |
    map selection presenter  elevation UI      tree highlight
           |
     popup/highlight resources owned by presenter scope

Map facade
  -> owned plugin layers, controls, events, viewport requests
  -> no foreign renderer layers

Future renderer contract
  -> generation ownership, semantic bindings, presenter anchors/highlights
```

Complex editor/route-search UI mounts beside these standard hosts as plugin-owned surfaces. Contributions provide launch/placement integration without absorbing their implementation.

## 49. Core Invariants

1. UI hosts aggregate typed contributions but never own contributor semantic state.
2. Every contribution registration has exactly one owner scope.
3. Every mounted subtree/presentation/map resource has exactly one owner scope.
4. Contribution identity is distinct from plugin and host identity.
5. Public contribution APIs are typed and validated; unknown points reject.
6. Ordering is host group, rank, item ID and never installation order.
7. Host owns placement/container/focus policy; contributor owns only its assigned subtree behavior/resources.
8. Generic UI core never interprets GPX/Photo data or child kinds.
9. Generic entry labels/summaries come from domain UI adapters, not EntryStore fields.
10. UI state never becomes authoritative application/domain/configuration state.
11. SelectionStore owns no popup, DOM, Leaflet layer, chart, or viewport behavior.
12. Popup close does not clear semantic selection by default.
13. Presentation failure/removal cannot roll back semantic state.
14. Complex plugins may own custom UI without a universal descriptor framework.
15. Contribution callbacks and mounts are owner-liveness guarded.
16. Removing a contribution closes its mounted UI before contributor resource teardown.
17. External plugins do not mutate foreign DOM or Leaflet resources.
18. Raw foreign layers are not exposed as extension handles.
19. Renderer replacement preserves semantic UI state and invalidates only generation resources.
20. Settings hosts store no authoritative settings values.
21. Built-in and external UI plugins use the same typed contracts where practical.
22. Caller-owned maps/containers survive app destruction; all Tilia attachments do not.

## 50. Open Questions Requiring Human Decision

1. **Contribution API:** generic point strings versus typed host facades. Recommendation: typed public facades over internal point IDs. Blocks public context design.
2. **Mounting:** declarative, callback, or component framework. Recommendation: host-specific hybrid; no framework. Blocks host descriptor contracts.
3. **DOM ownership:** shared host DOM versus assigned subtree. Recommendation: host placement/container, contributor subtree/resources. Blocks mount helpers.
4. **Entry display metadata:** generic envelope versus domain UI adapter. Recommendation: adapter with deterministic fallback. Blocks layers host.
5. **Domain presentation:** semantic domain API formatting versus UI plugin. Recommendation: semantic snapshots plus domain UI adapters; bundling allowed. Blocks popup/tree adapters.
6. **Popup presenter:** core SelectionStore versus renderer/domain versus plugin adapter. Recommendation: built-in map-selection presenter plugin. Blocks popup migration.
7. **Popup content:** generic formatter, HTML from domain, or scoped domain UI mount. Recommendation: scoped domain UI adapter; one primary per domain initially. Blocks popup contract.
8. **Tree children:** core schema branches versus one domain adapter. Recommendation: one typed domain adapter plus separate extra actions. Blocks tree host.
9. **Settings:** all custom panels versus typed fields plus escape hatch. Recommendation: hybrid settings host; state remains semantic owner. Blocks settings migration.
10. **Toolbar:** raw Leaflet controls versus action host plus standalone escape hatch. Recommendation: simple typed actions; complex owned controls/surfaces. Blocks control migration.
11. **Action abstraction:** global command registry versus guarded host callbacks. Recommendation: callbacks invoking semantic APIs; no command bus. Does not block registries.
12. **Map access:** raw map only, facade only, or facade plus advanced escape hatch. Recommendation: guarded facade plus explicit advanced raw-map access. Blocks plugin context/map helpers.
13. **Leaflet controls:** direct add versus owned helper. Recommendation: `mountControl` lifecycle helper; direct add unsupported. Blocks control ownership API.
14. **Rendering augmentation:** first-class registry now versus semantic overlays. Recommendation: no registry initially; plugin-owned overlays from semantic data. Not blocking UI hosts.
15. **Foreign layers:** unrestricted/read-only/dedicated contract/none. Recommendation: no raw foreign layers; future controlled renderer descriptors if proven. Blocks Interaction Hub removal.
16. **Built-in/core boundary:** keep current UI in core versus ordinary built-in plugins. Recommendation: shell only in core; all feature UI plugins. Blocks bootstrap composition.
17. **Host absence:** reject all, dormant known points, or silent arbitrary points. Recommendation: known points may be dormant; unknown reject; hard visibility uses plugin dependency. Blocks point registry.
18. **Scheduling:** synchronous rerender versus batched microtask. Recommendation: synchronous invalidation/close, batched snapshot reconciliation. Blocks host engine.
19. **Accessibility metadata:** optional versus required label/role data. Recommendation: accessible name required for standard items; host implies role/keyboard behavior. Blocks descriptor validation.
20. **Renderer phase:** implement from sketches versus separate design. Recommendation: separate focused renderer architecture phase before implementation. Blocks renderer-dependent implementation, not contribution hosts.

## 51. Files and Symbols Consulted

- `plugin-architecture/DESIGN.md` — core/plugin/UI principles.
- `plugin-architecture/PHASE-1-INVENTORY.md` — current UI/resource/coupling baseline.
- `plugin-architecture/phase-2/RUNTIME-DESIGN.md` — plugin lifecycle and destruction.
- `plugin-architecture/phase-2/OWNERSHIP-DESIGN.md` — scopes, mounts, resource disposal, styles.
- `plugin-architecture/phase-2/ENTRY-DOMAIN-DESIGN.md` — entry/domain state and presentation boundary.
- `plugin-architecture/phase-2/EXTENSION-MECHANISMS-DESIGN.md` — typed contributions/subscriptions/guarded facades.
- `plugin-architecture/phase-2/SELECTION-INTERACTION-DESIGN.md` — semantic selection and presentation separation.
- `src/app.js`, `src/builtins.js` — current UI facade, plugin wiring, refresh, services.
- `src/ui/surfaces.js`, `styles.js`, `protocol.js` — roots, layout, stylesheet, priority metadata.
- `src/map/controls.js`, `layers.js`, `base.js` — controls, popup/overlay construction, map catalog.
- `src/plugins/ui/panel.js`, `layers-control.js`, `settings-panel.js`, `elevation-panel.js`, `status-control.js`, `base-map-control.js` — current built-in UI.
- `src/plugins/input/file-import.js`, `url-import.js`, `query-import.js`, `dropzone.js` — input UI/surfaces.
- `src/core/selection-hub.js`, `interaction-hub.js`, `boot.js`, `state.js` — current selection/popup/layer/UI data coupling.
- `src/gpx/*`, `src/photo/*` — domain data consumed by current UI.
- `plugins/x-track-editor/loader.js`, `form.js`, `selection-overlay.js`, `rectangle-selection.js` — complex plugin UI/session resources.
- `plugins/x-route-search/loader.js` — standalone form, context menu, markers, surfaces.
- `plugins/x-milestone/loader.js` — raw-layer-derived presentation evidence.
- `tests/ui-surfaces.test.js`, `layers-control.test.js`, `builtin-control-cleanup.test.js`, `status-control.test.js`, `base-map-control.test.js` — host/control behavior.
- `tests/selection-hub.test.js`, `interaction-hub.test.js`, `boot.test.js` — popup/render replacement/current coupling.
- `tests/x-track-editor-*.test.js`, `x-route-search-*.test.js`, `x-milestone.test.js` — complex plugin UI behavior.
- `tests/smoke/editor.spec.js`, `viewer-*.spec.js` — integrated controls, panels, popup, elevation, Photo UI.

---

No source code was modified. This design investigation created only `plugin-architecture/phase-2/UI-PRESENTATION-DESIGN.md`.

- Unit tests: `npm test` — 37 files, 336 tests passed.
- Smoke tests: `npm run test:smoke` — 28 tests passed.
- Formatting check: `git diff --no-index --check /dev/null plugin-architecture/phase-2/UI-PRESENTATION-DESIGN.md` — no whitespace errors reported (exit status `1` is expected because the new file differs from `/dev/null`).
