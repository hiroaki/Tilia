> Historical migration document: its external-object/catalog-only resolution policy is superseded by the current [architecture contract](../ARCHITECTURE.md). Valid unknown third-party IDs now use fixed sibling `plugins/<id>/loader.js` discovery, including dependencies, before setup. The official catalog contains only `tilia-*`; explicit application catalogs and direct definitions remain supported. No configurable plugin directory or arbitrary package/URL discovery is introduced.

# Phase 2D — Extension Mechanisms Design

## 1. Executive Summary

Tilia should provide a small set of semantically distinct, typed extension mechanisms over one internal owned-registration protocol.

The recommended architecture is:

- Keep plugin dependencies, services, domains, inputs, contributions, subscriptions, and resource registrations as different concepts. They differ in cardinality, lookup, conflict rules, and lifetime effects.
- Share an internal `OwnedRegistrationStore` protocol for scope ownership, staging, preflight, synchronous callback-free commit, early disposal, and diagnostics. It is implementation infrastructure, not a universal public registry.
- Services are single-provider named programmatic contracts. Lookup returns an explicit guarded facade, not a raw implementation and not a JavaScript `Proxy`.
- Long-lived mandatory service use is protected by a plugin `requires` edge to the known provider plugin plus service lookup during setup. Optional service use has no implicit lease; guarded handles become unavailable when either scope dies.
- Do not create a first-class Capability Registry. “Capability” means an optional semantic operation/interface exposed by a service, domain API, entry facade, or host—not another global namespace.
- Domains use a dedicated single-provider `DomainRegistry`. Public guarded domain APIs are separate from provider-private entry-controller hooks.
- Only application entries and in-progress entry creation acquire domain-provider leases. Ordinary service/domain consumers do not. Leases are scope-owned uninstall guards, not plugin dependencies or general reference counting.
- Inputs are owned, identified, ordered multi-provider registrations. Recognition is synchronous and side-effect-free. Dispatch evaluates all recognizers, selects a unique highest-priority claimant, and reports an explicit conflict when top claims tie.
- Explicit application/plugin composition controls lazy availability. Registries do not silently import plugins when lookup or dispatch fails. Lazy built-in plugin loaders provide the necessary module isolation.
- Contributions are multi-provider items collected at a typed contribution point. Identity is local to the point; deterministic ordering is host group, numeric rank, then item ID. Hosts subscribe to point snapshots.
- Typed subsystem subscriptions share internal delivery machinery. There is no global string event bus. Subscription ownership is automatic, delivery is synchronous after commit, callback failures are isolated, and reentrant mutations are serialized after the current operation.
- Built-ins and external plugins use the same public mechanisms. Runtime scope creation, registration commit, destination entry scopes, provider-lease internals, and destroy-only guard bypasses remain privileged.
- The future setup context exposes narrow, scope-bound facades for services, domains, inputs, contributions, entries, styles/resources, and typed subscriptions. It does not expose `app.core`, mutable `app.state`, or registry maps.

This design introduces several small registries, but each has simple rules. It avoids a universal framework while eliminating today's unchecked mutable services, append-only inputs, coarse refresh callbacks, irreversible base-map contributions, and direct core mutation.

## 2. Inputs and Phase 2A–2C Constraints

The following approved decisions constrain Phase 2D:

- Plugin setup is transactional; registrations become visible only after full setup commit.
- Every registration/effect has one owner scope and loses mutation authority when that scope closes.
- Registration publication is synchronous and callback-free after complete preflight; notifications occur afterward.
- General ownership transfer and plugin reference counting are unavailable.
- Committed entries are app-owned and hold explicit leases against their domain provider.
- Domain/provider identity is distinct from plugin identity; generic core must not import GPX or Photo semantics.
- Persistent resources are created under their destination owner rather than detached from plugin children.
- `app.destroy()` is terminal and uses provider-aware ordering.

No approved decision is incompatible with the recommended extension architecture. Phase 2D makes Phase 2B's typed-registry requirement concrete and gives Phase 2C's provider lease a deliberately narrow home.

## 3. Current Extension Architecture

```text
plugin descriptor {id, requires, stylesheets, setup}
            |
            v
setup(app, options) receives one broad mutable facade
  ├─ app.services[name] / app.provide()       last-write named values
  ├─ app.registry.register(matcher, handler)  append-only first-match inputs
  ├─ app.baseMaps.register()                  append-only keyed aggregation
  ├─ app.addRefreshHandler()                  manually owned coarse subscription
  ├─ app.subscribeSelection/Interactions()    domain-shaped subscriptions
  ├─ app.ui.mountSurface/registerStylesheet   resource-like registration
  ├─ app.core / app.state                     mutable domain/core access
  ├─ Leaflet/DOM direct effects               manual resources
  └─ panel service                            service plus ad-hoc UI host
```

`src/app.js` publishes a mutable null-prototype `services` object. `provide()` overwrites without validation; setup return values are automatically published under plugin IDs even when they are merely cleanup/control objects. Cached references have no liveness guard.

`src/core/input-registry.js` stores `{matcher,handler}` in insertion order, dispatches the first match, has no IDs, priorities, unregister, ownership, or listing, and lets matcher errors abort dispatch. `createTiliaCore()` permanently registers GPX and JPEG handlers.

`src/map/base.js` is closer to a contribution registry: keyed definitions, duplicate rejection, ordered listing, and a consumer. It lacks unregister and atomic `registerMany()`. `src/ui/surfaces.js` is instead an owned resource manager whose same-ID behavior replaces the old element.

`refreshHandlers`, Selection Hub, and Interaction Hub are three notification mechanisms with different payloads and failure semantics. Layers/settings/elevation are not registrations into generic hosts; built-in modules directly construct controls/panels and read `app.core`. External plugins repeat the same patterns.

Built-ins are statically imported through `src/builtins.js`; external `x-*` plugins use a convention loader. Phase 2A already replaces this resolution boundary with literal lazy loaders.

## 4. Current Mechanism Classification

| Current mechanism | Present semantic role | Problem |
|---|---|---|
| descriptor `requires` | plugin dependency | validation-only today; Phase 2A repairs graph semantics |
| `app.services` / `provide` | service plus accidental API publication | mutable, overwrite, no ownership/liveness |
| plugin setup return API | cleanup plus accidental service | lifecycle and public API conflated |
| input registry | input handler | first-match, append-only, anonymous |
| base-map registry | contribution/catalog | no owned removal; app facade mixes mutation/use |
| panel API | service and UI host | provider service is valid; panel items are ad-hoc callbacks |
| layers/settings hard-coded rows | contributions embedded in host | host imports domain policy |
| refresh handlers | untyped subscription | coarse, manual, first error stops delivery |
| Selection Hub | typed-ish subscription plus domain policy | GPX/Photo payload and popup coupling |
| Interaction Hub | typed domain interaction registration/subscription | incomplete kinds and no withdrawal |
| surface manager | resource registration | replacement conflict semantics and ownership are ad hoc |
| stylesheet registration | shared resource lease candidate | permanent today; not a discoverable extension |
| `app.core`, `app.state` | direct mutable-core access | bypasses ownership, domains, and transaction rules |
| Leaflet/DOM callbacks | resource registration | manual cleanup and stale callbacks |
| `app.setStatus()` | optional service use hidden by convenience | dynamic lookup but no explicit contract |

Some current APIs mix roles; classification describes the behavior to separate, not a migration promise.

## 5. Extension Vocabulary

- **Plugin dependency:** static install/order/lifetime edge between plugin IDs. It protects a known provider plugin, not a semantic API by itself.
- **Service:** one named programmatic contract with at most one active provider in an app. Consumers call a guarded facade.
- **Capability:** a documented optional operation/interface on another contract. It is not a registry category.
- **Domain provider:** the unique active implementation of one domain contract, with private EntryStore hooks, a public guarded domain API, and entry leases.
- **Input handler:** an owned claimant that recognizes and asynchronously processes external input, often invoking a domain API.
- **Contribution:** one of zero or more immutable descriptors/callbacks aggregated by a typed host/point.
- **Subscription:** an owned consumer relationship to a typed subsystem's post-commit changes.
- **Resource registration:** an owned effect such as a listener, stylesheet lease, surface, or control; it is not discovered as an extension contract.
- **Registration:** the lifecycle record publishing a service/provider/handler/contribution. Registration is distinct from the value/facade consumers use.

## 6. Registry Architecture Alternatives

### A. Universal `register(type,id,value)`

It minimizes implementation types, but pushes cardinality, priority, leases, lookup, validation, and diagnostics into string/type conventions. A service duplicate, input overlap, and contribution duplicate are not the same conflict. Reject.

### B. Fully independent registries

It preserves semantics but risks repeating staging, ownership, handles, diagnostics, and notifications. Current Tilia already demonstrates this drift.

### C. Typed semantic registries over shared registration infrastructure

It keeps service/domain/input/contribution rules explicit while centralizing lifecycle correctness. The cost is a small internal protocol and adapter tests.

Recommendation: C. Shared code is not evidence of a shared public abstraction.

## 7. Recommended Registry Architecture

An internal registration record provides:

```text
owner scope
registry/type label
semantic key
staged | active | disposing | disposed | failed
preflight / commit / dispose
retry policy and diagnostics
```

Typed registries add their own validation, indexes, snapshots, conflicts, handles, and notification channel:

```text
OwnedRegistrationStore (internal only)
  ├─ ServiceRegistry       one provider per service ID
  ├─ DomainRegistry        one provider per domain ID + entry leases
  ├─ InputRegistry         many identified ordered handlers
  └─ ContributionRegistry many items grouped by typed point

TypedSubscription primitive (internal only)
  └─ subsystem-specific public subscribe APIs
```

Styles, surfaces, listeners, and controls use ownership helpers/shared-resource managers, not these discoverable registries unless their subsystem explicitly exposes discovery.

## 8. Registration Ownership

Every extension registration has exactly one active owner scope. Plugin setup defaults to the plugin scope; a child may own a temporary handler/contribution/service only when that shorter dynamic availability is intentional.

Registration APIs return category-specific registration handles. Early `dispose()` is allowed, idempotent, and leaves the scope record marked disposed so parent teardown never repeats it. Owner close unregisters synchronously before provider cleanup completes where possible.

Consumers never retain the registry record or raw provider value. Guarded consumer facades check both provider and consumer liveness. Immutable snapshots may remain readable after removal but grant no authority.

No registration outlives its owner by default. Application-owned registrations, such as core entry mechanisms, must be explicitly created under an app/core scope rather than promoted from a plugin.

## 9. Staging and Transactional Publication

During one plugin setup:

```text
register service/domain/input/contributions privately
  -> return owner-local registration handles/facades
  -> complete setup
  -> preflight the entire plugin batch against committed state and itself
  -> publish synchronously in acquisition order without callbacks
  -> mark plugin installed
  -> deliver typed registry snapshots/availability notifications
```

Other plugins cannot observe staged registrations. The registering plugin may use an owner-local facade, but a staged domain cannot create committed entries: persistent creation requires the registration and plugin to be committed. Setup may validate/build its provider without using public lookup.

Cross-registration preflight detects duplicate service/domain/item IDs and invalid descriptors before any publication. Dynamic input predicate overlap cannot be fully preflighted; duplicate handler IDs are rejected at registration and dispatch handles runtime claim conflicts.

Notification failures never roll back committed setup. They are isolated, aggregated/reported as post-commit delivery failures, and do not stop later subscribers.

## 10. Registration Identity and Namespaces

All IDs are case-sensitive normalized lower-kebab strings. Identity namespaces are separate by registry; `gpx` may be a domain ID while a service or contribution item has an unrelated same spelling.

- Services: globally unique within ServiceRegistry. Tilia-owned contracts use `tilia-*`; external contracts use vendor/project prefixes.
- Domains: globally unique within DomainRegistry. Contract IDs such as `gpx` and `photo` identify semantics, not providers. Tilia reserves its standard domain contract IDs; external domains use prefixed IDs unless standardized later.
- Inputs: handler IDs unique within InputRegistry and normally plugin-prefixed, e.g. `tilia-gpx-file` or `vendor-kml-file`.
- Contribution points: stable host contract IDs; Tilia points use `tilia-*`.
- Contribution items: unique only within a point and normally provider-prefixed.

No UUIDs or global cross-registry uniqueness are needed. Plugin, service, domain, input, point, and item IDs are never inferred from one another.

## 11. Duplicate and Conflict Semantics

| Category | Rule |
|---|---|
| service ID | reject second committed/staged provider |
| domain ID | reject second provider; no shadow/override |
| input handler ID | reject duplicate ID |
| input claims | unique highest priority wins; tied top claims reject dispatch |
| contribution item `(point,itemId)` | reject duplicate |
| different contribution items | aggregate and order deterministically |
| same plugin repeats identical register call | reject author error; do not silently dedupe |
| shared stylesheet | lease by stylesheet manager key, not duplicate registration rules |

Replacement/shadowing is excluded initially because hot provider swaps conflict with cached handles, provider leases, and transactional plugin ownership.

## 12. Service Model

A service is appropriate when a consumer needs one named implementation with a stable interface, such as the panel host or optional status reporter. Cleanup-only plugin APIs are not services.

- One active provider per service ID.
- Registration occurs under an active scope, usually plugin setup.
- Lookup is synchronous because registration availability is already committed; service method results may be async.
- Lookup returns a consumer-scoped guarded facade with explicitly wrapped methods.
- Provider implementation remains private and may contain state/resources.
- Service registration is not automatically named after the plugin.
- No service versions/ranges in the initial design; incompatible contracts use a new service ID/major contract.

Explicit facades require modest wrapper code but give predictable liveness without `Proxy` traps or repeated raw lookup.

## 13. Service Consumption and Lifetime

Ordinary service lookup creates no provider lease.

Recommended model:

- A plugin needing a service throughout its lifetime declares `requires` on the known provider plugin and resolves the service during setup. Dependency teardown guarantees provider lifetime.
- Optional or short-lived use resolves a guarded facade. If the provider disappears, subsequent calls reject `EXTENSION_UNAVAILABLE`; consumers subscribe to availability only if their behavior must update dynamically.
- Both provider and consumer scope are checked on every mutating/callback-bearing call. A dead consumer cannot use a still-live service.
- An asynchronous call receives cancellation/liveness derived from both scopes. Its operation is primarily owned by the caller, while the provider registration tracks the in-flight promise/cancel hook so provider teardown can stop and, where declared awaitable, settle it. This temporary in-flight record is not a service lease and does not permit new calls after unregister begins.
- Unregister invalidates all facades immediately before provider cleanup.

Domain-entry leases are not reused: service consumers do not represent persistent application data and should not silently block plugin uninstall.

## 14. Required and Optional Services

Tilia does not need semantic dependency solving.

- **Hard required, known provider:** descriptor `requires: [providerPluginId]` plus required service lookup in setup. A missing/wrong registration causes setup rollback with a precise error.
- **Optional:** `services.optional(id)` returns a guarded nullable handle/snapshot; consumer tolerates disappearance.
- **Dynamic optional:** additionally subscribe to that registry ID's availability.
- **Provider-independent hard semantic requirement:** not supported initially. Application composition chooses a concrete provider plugin; adding a solver would introduce alternatives, priorities, and ambiguity without a current use case.

Plugin dependency protects lifetime; service lookup verifies the actual interface contract. Neither substitutes for the other.

## 15. Capability Model

No separate CapabilityRegistry is recommended.

“Capability” should mean an optional interface or operation discoverable on the relevant typed contract:

- `gpx` domain API offers document creation/query;
- an entry facade may optionally support fit-to-view;
- an export service may expose supported domain IDs;
- a contribution host advertises a point.

A standalone capability registry would duplicate service/domain lookup and require unclear provider cardinality. If a future feature truly needs interchangeable multi-provider semantic negotiation, Phase 2D's owned registration primitive can support a new typed registry then.

## 16. Domain Registry

DomainRegistry permits exactly one active provider per domain ID. A registration contains two separate contracts:

1. **Private provider hooks** available only to EntryStore: validate/prepare an entry under a destination scope, create the private controller, apply whole visibility, and dispose through scope records.
2. **Public domain API factory** producing consumer-scoped guarded facades for safe queries and commands.

The registry publishes only domain identity/availability and public facade acquisition. It never exposes entry controllers, provider scope, lease counters, or mutable data. Domain setup is staged with its plugin transaction. Entry creation is forbidden until commit.

GPX and Photo APIs remain domain-specific; DomainRegistry standardizes lifecycle and routing, not their method schemas.

## 17. Domain Provider Leases

Lease semantics are narrow and explicit:

- EntryStore resolves a committed provider and atomically acquires a lease before it creates/prepares an entry destination scope.
- The lease is a handle owned by that entry scope. In-progress creations count immediately.
- Failed creation disposes the scope and releases the lease after provider-owned rollback.
- A committed entry retains the lease until its scope fully disposes. Cleanup residuals retain it.
- Provider unregister preflight rejects while any lease exists and reports domain ID, count, and committed/in-progress entry IDs where available.
- Lease release is idempotent and not callable by ordinary consumers.
- App destruction marks the app terminal, blocks creation, disposes entries, and only then internally permits provider teardown; it does not ignore live leases while entries remain.
- After the final lease releases, provider cleanup may still fail under normal Phase 2B quarantine rules.

This is not plugin reference counting, a stylesheet lease, a service-use lease, or a dependency edge.

## 18. Domain API Access

Canonical access is domain-specific lookup:

```js
const gpx = context.domains.require("gpx");
const photo = context.domains.optional("photo");
```

The returned value is the public guarded domain API, not the registration or private provider. Domain registration should not automatically duplicate itself as a service. A domain may separately register a genuinely distinct service, but that is an explicit second contract.

`x-track-editor`, route search, export, elevation, and domain-aware UI use DomainRegistry. Generic entry listing/removal/visibility uses `context.entries`. This avoids service-name ambiguity and prevents raw source/controller access.

## 19. Input Registry

An input registration conceptually contains:

```text
id
priority (integer or small normalized rank)
recognize(candidate) -> boolean or bounded claim metadata
handle(operationContext, candidate) -> import result
optional immutable discovery metadata for file UI
```

Recognition is synchronous, side-effect-free, and must not parse entire files. Dispatch snapshots committed handlers, evaluates all, selects the unique highest-priority claim, then creates an operation child under the caller scope for the async handler. The invocation also observes handler-owner cancellation, and the handler registration tracks it as in-flight so handler uninstall can cancel/settle it. Tied highest claims produce `INPUT_CONFLICT` identifying handler IDs; no insertion-order winner is hidden.

The handler may parse/acquire and invoke a domain creation API. It returns an import result; it never returns ownership of a committed entry. Cancellation/liveness derive from the operation and owner scopes. Registration removal prevents new dispatch and closes owned work according to Phase 2B policy; already committed entries remain.

MIME, extension, and predicate details belong to handler descriptors/recognizers. File UI may aggregate immutable discovery metadata, but metadata never replaces runtime recognition.

## 20. Input Handler / Domain Boundary

GPX syntax parsing and normalization are GPX semantics even though invoked by a GPX-file handler. The handler owns file recognition/acquisition and calls the GPX domain API to parse/create, or calls a parser exposed by that domain contract.

JPEG recognition and EXIF extraction are import normalization. The Photo provider receives normalized metadata plus the original File/Blob needed to create entry-owned preview resources. As Phase 2C requires, persistent Object URLs are created inside the destination entry transaction, not left owned by the input operation.

Multiple inputs may produce one domain (GPX file, route response, KML-to-GPX adapter), and one dispatcher can route different candidates to different handlers without core type switches. The handler explicitly invokes the destination domain; the generic coordinator does not infer a domain from filename.

## 21. Lazy Availability and Loading

Lazy loading remains an application-composition concern:

- built-in IDs map to literal dynamic-import loaders;
- the application explicitly installs GPX, Photo, input, and UI plugins it wants;
- installed plugins register extensions during transactional setup;
- an unsupported JPEG does not implicitly download/install code.

Auto-loading on input would require a trusted loader catalog, user-consent/error policy, concurrent plugin installation during dispatch, and security decisions with no demonstrated requirement. Registries therefore report unavailable/unsupported state only.

A GPX-only composition never resolves the Photo domain or JPEG input plugin, so Photo/EXIF implementation modules remain outside its module graph.

## 22. Contribution Model

A contribution is one immutable item offered to a typed host point that aggregates zero or more providers. It is not a callable singleton service.

Generic registration metadata is limited to:

```text
point ID
item ID
optional host-defined group
rank
typed immutable descriptor/value
```

The point owns schema validation; a layers item and toolbar action need different descriptors. Callback fields are wrapped with owner/consumer liveness guards. Predicate callbacks remain host-specific and must not become an ambient evaluation language.

Registration/unregistration is staged and owned. Hosts read ordered immutable snapshots and subscribe to point changes. Phase 2F defines actual UI points and schemas.

## 23. Contribution Ordering

Use the smallest deterministic rule:

1. host-defined group/section order, when the point schema defines groups;
2. normalized numeric rank, default `0`;
3. lexical item ID as a stable tie-breaker.

Do not use registration order, plugin dependency order, or general before/after graphs. Registration order changes with composition/concurrency; dependency order is about lifetime; before/after introduces cycles. A host that needs a few semantic sections defines them in its typed schema.

## 24. Contribution Lifetime

Commit adds the item synchronously; unregister removes it synchronously from the point snapshot before callbacks can run again. Host notification follows commit/removal and is isolated.

Hosts need not be mounted when items register. On mount they read the current snapshot; while mounted they own a subscription. Descriptors are immutable. Guarded callbacks check contributor and host/consumer liveness.

Child scopes may own genuinely temporary contributions. Closing the child removes them automatically. A host must never cache a callback outside the guarded descriptor or continue rendering a removed item without revalidating its snapshot.

## 25. Typed Subscription Model

Use separate subsystem APIs backed by one internal typed-subscription primitive:

- EntryStore lifecycle/change subscription;
- contribution-point snapshot subscription;
- selected registry availability subscriptions where justified;
- later selection and interaction subscriptions.

Reject one global string event bus. Typed channels define payload, ordering, batching, replay, and mutation rules locally while sharing owner cleanup and error isolation internally.

## 26. Subscription Ownership and Delivery

- Subscription registration is owned by the subscriber scope and automatically removed on close.
- An explicit idempotent unsubscribe handle is returned for early stop.
- Delivery is synchronous after the source transaction commits, using a subscriber snapshot.
- Each callback checks subscriber liveness immediately before invocation.
- One exception is captured/reported and does not stop later callbacks or roll back state.
- Reentrant lifecycle/registry mutation is queued behind the current serialized operation rather than interleaved.
- Async callback promises are not awaited by the publisher; subscribers that need async work create/track their own child task and handle rejection.
- Initial replay is defined per typed channel, preferably as an explicit current snapshot rather than a synthetic event.

## 27. Entry/Domain Change Notifications

EntryStore exposes its own typed subscription with Phase 2C changes: added, removed, visibility changed, domain changed, and batch/clear. It is not a contribution and not a service-global event.

Events contain immutable generic snapshots/IDs plus a domain-owned change descriptor where applicable. Core does not inspect the descriptor. Notifications occur after commit, are batchable, and cannot undo entry state. Consumers needing current truth re-query the store/domain rather than mutating event objects.

## 28. Built-in and External Extension Parity

GPX/Photo providers, their inputs, base-map items, layers/settings contributions, and external plugins should use identical public typed registration paths. This proves lifecycle rules and prevents privileged built-ins from reintroducing core domain imports.

Fundamental runtime/core components are not fake plugins: scope engine, registry implementations, EntryStore, map host adapter, app destruction coordinator, and diagnostic sink are constructed by the app. They expose narrow facades to both built-in and external plugins.

## 29. Privileged Core Boundaries

Only runtime/core may:

- create plugin and destination entry scopes;
- perform batch preflight/commit across registries;
- access raw registry records/provider implementations;
- acquire/release domain entry leases;
- commit/remove EntryStore records;
- bypass normal user-facing uninstall guard as part of ordered terminal destruction;
- create registration facades bound to arbitrary scopes;
- inspect residual cleanup records.

Plugins cannot mutate indexes, spoof owner scopes, release leases, publish staged records, or access another provider's private hooks. This is an integrity boundary, not a hostile-code sandbox.

## 30. External Plugin Context

Conceptual setup context:

```js
setup(context, options) {
  context.scope              // constrained child/defer/signal/liveness
  context.services           // register/require/optional/watch
  context.domains            // register/require/optional; public APIs only
  context.inputs             // register/dispatch facade as authorized
  context.contributions      // register/read/subscribe typed points
  context.entries            // generic immutable listing/commands/subscription
  context.styles             // owned stylesheet leases
  context.ui / context.map   // narrow owned helpers, finalized in Phase 2F
}
```

Registration methods infer the active owner scope; plugins do not pass arbitrary owners. The context omits `app.core`, mutable `app.state`, raw registry maps, provider lease methods, and unrestricted commit operations.

## 31. Registration Handles

Each registry returns its own small handle with common lifecycle behavior:

```text
read-only ID/type metadata
state snapshot
dispose() -> idempotent early unregister
```

The scope retains the disposal record even after early unregister, marked complete. A handle retained after owner death may report disposed state; mutation other than idempotent `dispose()` rejects as stale. Only DomainRegistry's private registration record supports entry-lease acquisition, and that method is not on plugin handles.

One universal public handle would falsely suggest services, inputs, and domains support the same operations.

## 32. Consumer Handles and Guarded Facades

Use explicit facade objects whose methods close over provider registration and consumer scope. Each call checks both, validates arguments through the typed contract, and then invokes the private implementation. Callback arguments supplied by a consumer are also scoped.

Do not expose raw implementations or require JavaScript `Proxy`. Proxies obscure method identity/error points and cannot reliably guard objects returned from methods. Repeated lookup on every call is safe but awkward and does not protect callbacks. Explicit facades are modest, testable, and optimizable.

Read-only cloned/frozen descriptors may outlive providers as historical values, but they expose no operational authority.

## 33. Dynamic Availability

- Contributions require point snapshot notifications because aggregation is inherently dynamic.
- EntryStore changes require typed notifications.
- Input discovery metadata may expose a snapshot subscription so file-picker `accept` state can update.
- Services/domains support targeted availability subscription only for consumers explicitly requesting dynamic optional integration; ordinary required consumers resolve once during setup.
- Resource registrations have no discovery notifications.

Provider removal invalidates facades before availability notification. Domain removal normally cannot occur with live entries. Consumers do not poll mutable maps.

## 34. Dependency Decision Matrix

| Relationship | Mechanism |
|---|---|
| B requires A plugin installed/alive | `requires: [A]` |
| B needs A's named service for its lifetime | plugin `requires` plus required service lookup |
| B optionally uses service S | optional guarded service facade; targeted availability watch if needed |
| B needs GPX domain during its lifetime | known provider plugin `requires` plus `domains.require("gpx")` initially |
| one operation optionally uses a domain | guarded domain lookup; handle failure/disappearance |
| live entry needs domain provider | EntryStore-owned provider lease |
| input handler creates domain entry | domain API lookup/call; input owns only operation |
| UI host collects items | contribution point aggregation |
| consumer observes entry changes | typed EntryStore subscription |
| DOM/listener/style/control lifetime | ownership/resource helper |

`requires` is not used for entries, contributions, notifications, or optional discovery.

## 35. GPX Validation

- A lazy built-in GPX-domain plugin registers domain `gpx`; generic core imports no GPX modules.
- GPX-file input registers an identified handler and depends on the GPX provider plugin in the standard distribution, then calls the guarded GPX API.
- Export requires/looks up GPX and registers its UI contribution; it queries immutable GPX snapshots.
- Elevation requires GPX and uses GPX queries plus Phase 2E selection contracts.
- Layers UI is a contribution host; GPX supplies domain-specific rows/actions rather than host type switches.
- Track editor requires the standard GPX provider, uses the domain API and EntryStore subscription, and contributes UI.
- Route search uses a request child and GPX creation; committed output is app-owned.

GPX provider cleanup is blocked only by entries, while dependent plugins are protected by normal plugin edges.

## 36. Photo / Issue #74 Validation

GPX-only composition installs neither Photo provider nor JPEG/EXIF input. Their literal dynamic-import loaders are never invoked, so generic core and the GPX graph do not resolve EXIF code.

Photo-enabled composition may install:

```text
tilia-photo-domain   -> registers domain "photo"
tilia-jpeg-input     -> requires provider plugin; registers input handler; imports EXIF
photo UI plugin(s)   -> optional domain lookup + typed contributions
```

JPEG input parses normalized metadata then calls Photo creation; it owns no committed entry. UI contribution removal affects only UI. JPEG-input removal stops future JPEG imports but leaves entries. Photo-provider uninstall rejects with dependent entry diagnostics until Photo entries are removed. The roles may ship in one package, but registrations remain distinct.

## 37. `x-track-editor` Validation

The editor should name the concrete standard GPX provider plugin in `requires` initially because Tilia deliberately has no semantic provider solver. It then obtains functionality by the semantic `gpx` domain contract, not by plugin-ID service lookup.

It registers control/panel contributions and styles under its plugin scope, creates editor-session child scopes, subscribes to EntryStore/Phase 2E channels, and reads GPX snapshots through the guarded domain API. Save Copy calls GPX creation, producing a destination-owned entry. Uninstall removes contributions/subscriptions and sessions; saved entries and their GPX leases remain.

If alternate GPX-provider composition later becomes real, a future semantic dependency facility can be evaluated with evidence rather than embedded now.

## 38. `x-route-search` Validation

Route search's network client is plugin-private unless another plugin demonstrably consumes it; it need not be a service. A request child owns fetch/cancellation. The plugin requires the standard GPX provider when configured to output GPX and uses `domains.require("gpx")`.

After GPX creation commits, the entry is app-owned and survives request completion/plugin uninstall. Route UI is an owned contribution/resource. A future native route domain changes only the chosen domain contract and provider dependency.

## 39. Future Extension Validation

- GeoJSON provider registers `geojson`; a GeoJSON-file handler registers independently and invokes it. Domain-specific UI contributes to existing typed points.
- KML input may produce `geojson` or another domain by explicit configuration; InputRegistry does not care.
- A native `route-result` provider and route-search plugin use the same domain/entry mechanisms without modifying core.
- A marker-collection provider supplies its own domain API and Phase 2E adapters.

These additions require new plugins and typed point items, not edits to generic registries or ad-hoc channels.

## 40. Error Semantics

Use stable codes plus contextual fields rather than a deep class hierarchy:

| Code | Meaning/commit state |
|---|---|
| `DUPLICATE_REGISTRATION` | preflight rejected; registry/key/provider identified |
| `UNKNOWN_SERVICE` / `UNKNOWN_DOMAIN` | lookup rejected before operation |
| `EXTENSION_UNAVAILABLE` | guarded provider disappeared or is closing |
| `DOMAIN_PROVIDER_IN_USE` | unregister rejected; lease/entry diagnostics included |
| `STALE_REGISTRATION_HANDLE` | non-idempotent handle use after disposal |
| `STALE_CONSUMER_HANDLE` | provider or consumer scope dead |
| `DEAD_CALLER_SCOPE` | new registration/lookup/mutation forbidden |
| `INPUT_CONFLICT` | tied top claims; handler IDs/priorities included |
| `CONTRIBUTION_CONFLICT` | duplicate point/item or invalid point schema |
| `SETUP_REGISTRATION_CONFLICT` | plugin batch preflight failed; nothing published |
| `NOTIFICATION_DELIVERY_FAILED` | operation committed; subscriber errors aggregated |
| `REGISTRATION_DISPOSAL_FAILED` | logical unregister occurred; cleanup incomplete |
| `EXTENSION_INVARIANT_VIOLATION` | impossible raw-provider/index/lifetime inconsistency |

Every error states whether the requested mutation committed. Cleanup aggregates follow Phase 2B retry/quarantine rules.

## 41. Diagnostics and Introspection

Public application APIs should expose only useful semantic snapshots: available service/domain IDs where discovery is intended, supported input metadata, contribution snapshots for authorized hosts, and entry state.

Development diagnostics may additionally list owner plugin/scope, registration state, staged conflicts, subscriber counts, provider lease counts and entry IDs, handler priorities, and cleanup residuals. Installed plugins remain runtime diagnostics/public inspection per Phase 2A.

All introspection is copied/frozen and read-only. Raw values, callbacks, scopes, maps, lease release methods, and private provider hooks are never exposed.

## 42. Testing Model

Unit tests must cover:

- registration staging invisibility, batch preflight, commit, rollback;
- conflicts within one setup batch and against committed state;
- owner close, early idempotent unregister, child-scope registration;
- stale registration and consumer facade rejection;
- required/optional service behavior and dependency-protected teardown;
- domain private/public separation, in-progress/committed leases, uninstall guard diagnostics;
- input ID duplicate, unique priority winner, tied-claim conflict, matcher failure, cancellation;
- contribution validation, ordering, removal, immutable snapshots;
- typed subscription auto-cleanup, replay/snapshot, batching, reentrancy serialization, exception isolation;
- committed-operation notification failure semantics;
- provider-aware destroy ordering and residual cleanup;
- generic modules containing no GPX/Photo imports.

Integration/smoke tests must cover plugin setup rollback across multiple registry types, built-in/external parity, editor and route result persistence, dynamic UI contribution install/uninstall, Photo-provider guard, and a GPX-only build/runtime path that never requests Photo/EXIF modules.

## 43. Migration Pressure

| Current surface | Direction |
|---|---|
| `setup(app, options)` | replace broad `app` with scoped plugin context; retain setup concept |
| descriptor `requires` | retain and implement Phase 2A semantics |
| descriptor `stylesheets` | move to ownership helper `context.styles` |
| `app.services`, `provide`, auto-published setup result | replace with typed ServiceRegistry; separate cleanup |
| input registry | replace with owned identified priority/claim InputRegistry |
| refresh handlers / `refreshView()` | move to typed subsystem subscriptions |
| `app.core`, `app.state`, `core.state.entries` | remove from external boundary |
| GPX/Photo core methods | move to respective domains |
| Photo input path | split JPEG/EXIF handler from Photo domain creation |
| base-map registrations | move to a typed contribution/catalog with owned removal |
| layers/settings embedded branches | move to Phase 2F typed contribution points |
| elevation integration | domain API + Phase 2E typed selection/interaction |
| Selection/Interaction Hub registration | defer schemas to Phase 2E; use owned typed primitives |
| surfaces, controls, listeners | move to ownership/UI helpers, not services |
| `x-track-editor`, route search, GPX export, milestone | migrate from raw core/layers to domains, entries, contributions, typed subscriptions |

## 44. Requirements Passed to Phase 2E

Selection and Interaction may assume:

- an internal owned staged registration protocol;
- typed subsystem-specific registries/channels rather than a global event bus;
- automatic owner-scope cleanup and guarded callbacks;
- stable EntryStore IDs and guarded domain API lookup;
- entry/domain lifecycle subscriptions with isolated post-commit delivery;
- deterministic withdrawal before entry rendering disposal;
- immutable public descriptors and no mutable core access.

Phase 2E must define its own payload identities, cardinality, replay, selection invalidation, and interaction conflict semantics.

## 45. Requirements Passed to Phase 2F

UI/plugin-facing design may assume:

- typed contribution points with host-defined schemas/groups;
- item identity local to a point and deterministic group/rank/ID ordering;
- staged owned registrations and automatic removal;
- immutable descriptors with guarded callbacks;
- host snapshot subscription and dynamic install/uninstall;
- safe service/domain/entry facades;
- owned surfaces/styles/controls separate from discoverable contributions;
- no `app.core`, mutable state, or raw registry exposure.

Phase 2F must define actual layers/settings/toolbar/panel schemas and accessibility/rendering behavior.

## 46. Recommended Architecture

```text
                         Plugin Runtime
                    (graph, setup transaction)
                               |
                         Ownership Scope
                               |
                  internal OwnedRegistrationStore
             +-----------------+------------------+
             |                 |                  |
       ServiceRegistry    DomainRegistry      InputRegistry
       single provider    single provider     ordered claimants
             |                 |                  |
 guarded service API     private hooks +           |
                         guarded domain API         |
                               |                    |
                          provider leases           |
                               |                    |
                           EntryStore <--------------+
                    app-owned persistent entries

                  ContributionRegistry
               typed points, aggregated items

            internal typed subscription primitive
       entry changes / point snapshots / targeted availability

       resource helpers: styles, surfaces, listeners, controls
       (owned effects, not universal extension registrations)
```

Public concepts are Plugin Runtime, scoped context, Services, Domains, Inputs, Contributions, Entries, and typed subsystem subscriptions. `OwnedRegistrationStore`, raw provider hooks, lease mutation, and subscription engine are internal.

## 47. Core Invariants

1. Every extension registration has exactly one owner scope.
2. No registration is externally visible before its complete plugin setup transaction commits.
3. Batch publication is synchronously callback-free after full preflight.
4. Notifications cannot roll back committed state and one callback cannot stop others.
5. A dead owner cannot register, publish, invoke callbacks, or mutate through an extension.
6. Plugin, service, domain, input, point, and contribution-item identities are distinct.
7. Services and domains have at most one active provider per semantic ID.
8. Contributions and inputs are multi-provider mechanisms with type-specific conflict rules.
9. Service lookup creates no implicit lease or plugin dependency.
10. Long-lived required service use combines explicit plugin dependency and service lookup.
11. Capability is an optional typed interface, not a registry.
12. Domain public APIs never expose private entry controllers.
13. Only EntryStore acquires domain-provider entry leases.
14. In-progress creations count as provider use.
15. Input handlers own operations, never committed entries.
16. Input dispatch never silently resolves tied highest-priority claims by registration order.
17. Contribution ordering never depends on plugin installation timing.
18. Subscriptions are scope-owned and callbacks are liveness-guarded.
19. Generic core contains no GPX/Photo extension identity branches or implementations.
20. Built-in and external plugins use the same extension registration paths.
21. External code cannot access mutable registry/core internals.
22. Resource ownership and extension discovery remain separate concepts.

## 48. Open Questions Requiring Human Decision

1. **Registry architecture:** universal, independent, or typed-over-shared? Recommendation: typed semantic registries over an internal owned-registration protocol. Blocks implementation architecture.
2. **Service lifetime:** implicit lease versus dependency plus guard? Recommendation: no lease; hard long-lived use declares provider plugin dependency. Blocks service semantics.
3. **Capability Registry:** create one or use optional interfaces? Recommendation: no separate registry. Does not block other registries once accepted.
4. **Domain access:** canonical `domains` lookup versus duplicated service registration? Recommendation: dedicated domain lookup only. Blocks plugin context shape.
5. **Input conflict:** first registration, priority winner, or tied conflict? Recommendation: unique highest priority; tied top claims reject. Blocks dispatch contract.
6. **Lazy input loading:** explicit composition versus auto-install on unknown input? Recommendation: explicit composition only. Blocks whether registries need loader authority.
7. **Contribution order:** group/rank/item ID versus before/after graph? Recommendation: group/rank/lexical ID. Blocks common contribution metadata.
8. **Guard mechanism:** explicit facade, Proxy, or lookup-per-call? Recommendation: explicit guarded facade. Blocks service/domain API wrappers.
9. **Semantic hard dependencies:** add provider solver now? Recommendation: no; name the concrete provider plugin in `requires` and consume the semantic registry contract. Not blocked unless alternate providers are an immediate requirement.
10. **Domain IDs:** reserve standard unprefixed `gpx`/`photo` contract IDs while external domains are prefixed? Recommendation: yes. Blocks ID validation rules.
11. **Subscription reentrancy:** interleave or queue mutations? Recommendation: queue behind the current serialized operation. Blocks delivery engine behavior.
12. **Input discovery metadata:** include optional immutable accept metadata in initial handler contract? Recommendation: yes, because current file input hard-codes GPX/JPEG; exact schema deferred to Phase 2F.

## 49. Files and Symbols Consulted

- `plugin-architecture/DESIGN.md` — core/plugin and extension principles.
- `plugin-architecture/PHASE-1-INVENTORY.md` — current extension inventory and coupling.
- `plugin-architecture/phase-2/RUNTIME-DESIGN.md` — plugin graph, transaction, destruction.
- `plugin-architecture/phase-2/OWNERSHIP-DESIGN.md` — scopes, staging, guarded mutation, disposal.
- `plugin-architecture/phase-2/ENTRY-DOMAIN-DESIGN.md` — app-owned entries, domains, leases.
- `src/app.js` — services, plugin setup, refresh handlers, facades, plugin loading.
- `src/builtins.js` — built-in descriptors and direct service/core wiring.
- `src/core/input-registry.js`, `input-processing.js`, `boot.js` — dispatch and domain handlers.
- `src/core/selection-hub.js`, `interaction-hub.js` — current subscription/registration semantics.
- `src/core/state.js` — mutable public state and entry access.
- `src/map/base.js` — keyed base-map catalog and duplicate behavior.
- `src/ui/surfaces.js`, `styles.js`, `protocol.js` — resource-like registration and UI metadata.
- `src/plugins/ui/panel.js`, `layers-control.js`, `settings-panel.js`, `elevation-panel.js`, `status-control.js` — services, hosts, direct domain access.
- `src/plugins/input/file-import.js`, `dropzone.js`, `url-import.js`, `query-import.js` — input transports.
- `plugins/x-track-editor/loader.js` — hard service dependency, subscriptions, GPX access.
- `plugins/x-route-search/loader.js`, `client.js` — request scope pressure and GPX creation.
- `plugins/x-gpx-export/loader.js`, `x-milestone/loader.js` — raw entry/layer consumption.
- `plugins/x-gsi-base-maps/loader.js`, `x-opentopomap-base-maps/loader.js` — contribution-like registrations.
- `tests/plugin-lifecycle.test.js`, `builtins.test.js`, `input-registry.test.js`, `base-map.test.js` — current registry/lifecycle expectations.
- `tests/selection-hub.test.js`, `interaction-hub.test.js`, `ui-surfaces.test.js` — notification/resource behavior.
- `tests/x-track-editor-*.test.js`, `x-route-search-*.test.js`, `layers-control.test.js` — external/UI coupling.
- `tests/smoke/editor.spec.js`, `viewer-*.spec.js` — integrated extension behavior.

---

No source code was modified. This design investigation created only `plugin-architecture/phase-2/EXTENSION-MECHANISMS-DESIGN.md`.

- Unit tests: `npm test` — 37 files, 336 tests passed.
- Smoke tests: `npm run test:smoke` — 28 tests passed.
- Formatting check: `git diff --no-index --check /dev/null plugin-architecture/phase-2/EXTENSION-MECHANISMS-DESIGN.md` — no whitespace errors reported (exit status `1` is expected because the new file differs from `/dev/null`).
