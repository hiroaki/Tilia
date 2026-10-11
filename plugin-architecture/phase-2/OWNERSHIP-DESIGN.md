# Phase 2B — Ownership & Registration Model Design

## 1. Executive Summary

Tilia should implement ownership as a small hierarchical scope mechanism beneath typed registries, not as a resource-management or dependency-injection framework.

The recommended model is:

- Every plugin installation receives exactly one plugin scope before `setup()` begins.
- A scope owns disposal records, child scopes, liveness state, and an `AbortSignal`.
- Typed registries—services, contributions, inputs, UI surfaces, styles, and later entry/selection mechanisms—bind registrations to the caller's scope and use the same staging/disposal protocol.
- Public registrations created during setup are staged privately and published as one synchronous, callback-free commit batch after setup succeeds.
- Effects that cannot be staged, such as DOM listeners or Leaflet layers, may become active immediately but must register cleanup immediately and are guaranteed best-effort rollback.
- Disposal first closes and aborts the scope tree, then cancels/tracks async work, disposes child scopes in reverse creation order, runs setup-return cleanup, and disposes the scope's own records in reverse acquisition order.
- A child scope may be explicitly disposed early but can never outlive or detach from its parent. General ownership transfer is not supported.
- Shared physical resources are managed by specialized managers. Each plugin scope owns only a lease; the manager may internally reference-count the physical resource. This is distinct from rejected plugin-dependency reference counting.
- Stylesheets should move from descriptor metadata into an explicit typed setup registration. This keeps the descriptor limited to resolution/lifecycle metadata and gives CSS the same lease, staging, rollback, and conditional-registration semantics as other resources.
- Generic `defer()` cleanup is attempted at most once by default. Only records explicitly known to be idempotent/retry-safe may be retried after failure. Repeated `unuse()` retries eligible failed records; non-retryable failures remain quarantined. This refines Phase 2A's tentative retry decision without replacing its quarantine model.
- Async work is tracked only when teardown must cancel and/or await it. The ownership layer is not a scheduler. Aborting a signal prevents cooperative work; scope-guarded APIs independently prevent stale work from mutating Tilia.
- App/core infrastructure uses the same primitives but plugin scopes and core/runtime scopes are ordered siblings under the app lifetime, not arbitrary nested children. App destruction explicitly disposes plugins first, then core/runtime attachments, then Tilia-owned external infrastructure such as a factory-created map.

The central invariant is:

> Every Tilia-visible effect has one lifetime owner, and no scope may create or publish new effects after closing begins.

## 2. Inputs and Phase 2A Constraints

This design treats the working architecture in `RUNTIME-DESIGN.md` as binding unless explicitly refined:

- per-plugin transactional setup;
- staged commit followed by installed state;
- reverse-order best-effort cleanup;
- dependency-ordered uninstall/destruction;
- cleanup-failed quarantine;
- terminal `app.destroy()`;
- serialized lifecycle operations;
- separate lifecycle cleanup and public service exposure;
- both cancellation and liveness protection.

Phase 1 supplies the concrete failure evidence:

- `app.use()` currently inserts styles before setup and cannot undo them (`src/app.js`, `src/ui/styles.js`).
- `app.provide()` exposes mutable global service state immediately and ownership is not recorded.
- input and base-map registries have no unregister operation (`src/core/input-registry.js`, `src/map/base.js`).
- controls, map/DOM listeners, refresh handlers, subscriptions, timers, layers, object URLs, and UI surfaces are manually cleaned with inconsistent completeness.
- `x-track-editor` already has a natural plugin lifetime plus shorter editing-session and rectangle-selection lifetimes.
- URL/route operations can complete after plugin removal because cancellation is local rather than tied to plugin lifetime.

Phase 2B does not define the domain schemas of future registries. It defines the common lifecycle behavior those registries must implement.

One Phase 2A decision requires refinement: cleanup retry cannot safely apply to every arbitrary disposer. The ownership layer cannot prove that a closure is idempotent or determine what portion completed before throwing. Retry must therefore be record-specific and opt-in/known-safe. Quarantine remains unchanged.

## 3. Current Resource Inventory

| Resource/example | Acquisition and current owner | Current cleanup | Required rollback/unuse/destroy behavior | Sharing / async / retry evidence |
|---|---|---|---|---|
| DOM listener (`dropzone`, editor key listener) | plugin calls `addEventListener` | matching `removeEventListener` in returned destroy | remove on failed setup, unuse, destroy | exclusive attachment; sync; removal is naturally idempotent |
| Leaflet listener (`map.on`, `layer.on`) | plugin/core attaches to map/layer | manual `off`; `x-milestone` misses anonymous layer handlers | retain callback/context identity and detach at every boundary | attachment exclusive; sync; `off` generally retry-safe |
| Leaflet control | plugin calls `control.addTo(map)` via helper | `control.remove()` | remove even if later setup step fails | exclusive attachment; sync; removal normally idempotent |
| Entry or temporary map layer | core/plugin calls `.addTo(map)` | `.remove()` in entry/editor cleanup | temporary layers always scoped; entry policy deferred to 2C | layer may be owned; caller map is only used; sync cleanup |
| Editor session | `x-track-editor.startEditing()` creates draft controllers, overlay, selection | `finishSession()` manually sequences cleanup | model as child scope, explicitly closable and parent-owned | exclusive; nested lifetime; some cleanup restores state |
| Rectangle interaction | editor creates shield/listeners/timer | `destroy()` removes/cancels | nested child or session-owned records | exclusive; timer async trigger; removal mostly idempotent |
| Subscription/refresh handler | `subscribe*`, `addRefreshHandler` returns function | plugin stores and invokes unsubscribe | returned handle must be automatically owned | exclusive registration; sync; unsubscribe should be idempotent |
| Input handler | core `registry.register()` pushes handler | none | staged publish; unregister on rollback/unuse/destroy | registry record exclusive; handler may launch async work |
| Service | `app.provide()` assigns mutable property | only plugin-ID key removed by runtime | staged atomic publication; removal and stale-reference liveness | logical registration exclusive by key; consumers may cache reference |
| UI surface | surface manager `mount()` | handle `unmount()` | own lease/handle; rollback mount if setup fails | keyed registry record; physical DOM exclusive; sync |
| Stylesheet | `<link>` inserted by ID | none | shared lease, rollback/unuse; remove when last lease ends | shared physical resource; load is async browser behavior; release retry-safe |
| Base-map definition | provider calls `register` | none | staged reversible contribution | keyed logical contribution; sync |
| Timer | `setTimeout` in elevation/editor/download | manual `clearTimeout`, sometimes self-removing set | cancel on scope close; callback must check liveness | exclusive handle; cancel retry-safe; may already have fired |
| Object URL | photo/export creates via `URL.createObjectURL` | explicit delayed/core revoke | register revoke immediately; entry ownership deferred | exclusive token; sync release; repeated revoke is harmless in browsers |
| Fetch/AbortController | URL/route helper creates controller and timeout | timeout only; not plugin-bound | abort on child/plugin close; optionally await settlement; guard result mutation | async, cancelable and awaitable; abort idempotent |
| FileReader | GPX parser creates reader and returns Promise | no abort wiring | register only when operation must be cancelled/awaited; use signal if wrapper supports it | async; browser reader is abortable; settlement may race |
| Cached provider reference | panel consumers store `app.services["tilia-panel"]` | none; graph currently allows provider removal | hard dependency blocks provider unuse; service proxy/contract must reject after liveness ends | resource is used, not owned by consumer |
| Factory-created Leaflet map | `createDefaultTiliaApp()` | none at app level | Tilia removes/destroys it after plugins/core | Tilia-owned infrastructure |
| Caller-supplied Leaflet map | `createTiliaApp({map})` | none | remove Tilia attachments/listeners/layers; preserve map | caller-owned infrastructure |

This inventory constrains the design to support immediate effects, staged logical registrations, nested lifetimes, shared physical resources, and selected async settlement. A single bare cleanup array is necessary but not sufficient.

## 4. Ownership Definitions

### Plugin owns a resource/effect

A plugin owns an effect when that effect was created or acquired for the plugin's operation and must end no later than the plugin's scope. Ownership means responsibility for registering its release with the scope; it does not necessarily mean JavaScript object exclusivity.

Examples:

- A plugin-created marker is owned by the plugin/session.
- If added to a caller-owned map, the plugin owns the marker and its attachment, not the map.
- A DOM event attachment is the owned effect; the target DOM node may be caller-owned.
- A stylesheet manager owns the physical `<link>`; the plugin owns one lease requiring that stylesheet.

### Plugin uses a resource

A plugin uses but does not own a caller-, core-, or provider-owned object. It must not dispose the object itself. It may own attachments or subscriptions it adds to that object.

`tilia-layers` uses the panel service. It owns its panel contribution/control and any service-use handle, but not `tilia-panel`, its DOM root, or its service registration.

### Plugin depends on another plugin

A hard dependency is a runtime availability/order relationship. It is not resource ownership. A dependent cannot uninstall its provider; Phase 2A leaves the dependency installed after the dependent is removed.

### Plugin publishes a registration

The plugin owns the registration record and its publication lifetime. The typed registry owns the index/storage and defines key conflicts/order. A service value or contribution callback may be a plugin-owned object, but consumers only use it.

### Core owns infrastructure

Core/runtime owns registries, selection/interaction mechanisms, shared-resource managers, app UI roots, and its listeners. Their scopes outlive plugin scopes and are disposed after plugins.

### Caller owns supplied infrastructure

A caller-supplied map/container remains caller-owned. Tilia owns every listener, layer, control, CSS marker, or DOM child it attaches. Destruction removes those attachments without destroying the supplied host object.

## 5. Ownership Scope Model

### Hierarchy

```text
App lifetime coordinator
├── Runtime/Core scope
│   ├── registries and hubs
│   ├── shared-resource managers
│   └── Tilia attachments to host infrastructure
├── Plugin A scope
│   ├── committed setup records
│   ├── operational child: editor session
│   │   └── child: rectangle interaction
│   └── operational child: async request
├── Plugin B scope
└── App-owned infrastructure scope
    └── factory-created map (if any)
```

Plugin scopes and core scopes are ordered siblings under the app coordinator rather than plugin children of core. A structural parent normally disposes all children before its own records; app-level dependency/core ordering is an explicit coordinator policy above the generic scope tree.

### Creation and lifetime rules

- The runtime alone creates a plugin setup scope.
- Plugin code may create child scopes through its context while the parent is active.
- Children may be created during setup or after commit. A child created during setup is part of rollback.
- Children may be nested to arbitrary depth conceptually, but real code should use shallow lifetimes; no special semantics depend on depth.
- A plugin may explicitly dispose a child early—for example, cancel an editor session—without affecting the parent.
- Parent closing immediately closes/aborts all descendants and disposes children before parent records.
- Child failure does not make the parent scope dead during ordinary explicit child disposal, but it leaves unresolved owned effects. The parent records that residual failure; plugin uninstall must quarantine if it cannot clear it.
- A child never outlives, detaches from, or transfers away from its parent.
- General scope transfer/detachment is forbidden because it breaks rollback and app-destroy guarantees.

Child scopes remain active after plugin setup commits; that is their purpose for operational sessions. The setup scope becomes the committed plugin scope rather than being discarded or replaced.

## 6. Setup Scope and Transaction Semantics

### Success

```text
runtime creates open, uncommitted plugin scope
  -> setup acquires immediate effects and stages registrations
  -> setup resolves with optional cleanup
  -> cleanup record appended
  -> runtime requests commit
  -> all staged records preflight
  -> registry publication batch applies synchronously without callbacks
  -> scope becomes committed/active
  -> runtime publishes installed plugin record
```

### Failure

```text
setup throws / returns invalid cleanup / commit preflight fails
  -> scope transitions closing (new effects forbidden)
  -> signal aborts through descendants
  -> staged records discarded/released
  -> immediate effects disposed best-effort in defined order
  -> absent if complete; cleanup-failed if incomplete
```

### Two distinct transaction guarantees

1. **Visibility transaction.** Registry entries capable of staging are invisible to other scopes until the commit batch. The plugin receives its own registration handle/value directly if needed, but public lookup does not reveal it. Dependencies and unrelated plugins cannot observe it.
2. **Resource rollback transaction.** Immediate effects may be visible in the DOM/map during setup. Atomic invisibility is impossible, but their disposers are recorded and rollback removes them if setup/commit fails.

Tilia must not promise visual atomicity for arbitrary browser/Leaflet effects. Plugin setup should stage logical registrations and defer user-visible attachment until late when practical, but correctness rests on rollback, not impossible isolation.

## 7. Staged Registration and Commit

Typed registries should share a small internal transaction adapter rather than inventing setup transactions independently.

A staged registration must support conceptually:

```text
prepare(scope, value) -> staged record + plugin-local handle
preflight(record)      -> validate key/conflicts without publication
commit(record)         -> synchronous publication, no arbitrary callbacks
dispose(record)        -> remove if published; discard if staged
```

Rules:

- Staged entries live in the plugin scope's private staging list, not the public registry index.
- The owning plugin may use the returned value/handle directly. It must not rely on public lookup finding it before commit.
- Dependencies are already installed and do not need to see a dependent's staged state.
- Commit preflights all staged records before publishing any.
- Publication occurs synchronously in deterministic acquisition order while lifecycle mutation is serialized.
- Publication must not invoke subscribers, plugin callbacks, rendering callbacks, or getters with arbitrary user code. Notifications, if a later registry needs them, occur only after the plugin is installed and must tolerate failure without invalidating commit.
- Registry commit operations should be designed as non-throwing after successful preflight. If an unexpected commit failure occurs, the runtime reverses already published records and aborts the scope; incomplete reversal causes quarantine.
- External observers must see either none or all of the plugin's committed registrations. In single-threaded JavaScript, a synchronous callback-free batch provides this observable atomicity.

Handles returned during staging must themselves be scope-bound. Calling their mutating methods after scope closing begins throws a liveness error.

## 8. Disposal Record Model

The internal foundation should distinguish only four record categories:

1. **Immediate disposable:** an active effect with a dispose callback.
2. **Staged registration:** prepare/preflight/commit/dispose state managed with a typed registry.
3. **Child scope:** structurally disposed before parent-local records.
4. **Tracked async work:** optional cancel action and/or settlement promise.

Every disposable/staged record needs only:

```text
state: staged | active | disposing | disposed | failed
dispose callback
diagnostic label/type
retry policy: never | retry-safe
last failure (only when failed)
```

Staged records additionally need preflight/commit behavior. Task records need cancel/settlement behavior. Labels are for aggregate diagnostics, not universal resource identity.

The scope must permanently mark successful records disposed so they are never run twice. Failed records remain only as residual cleanup obligations. It should release references to successfully disposed resources promptly to avoid retention in quarantine.

## 9. Immediate Disposer Registration

### Minimal primitive

A low-level plugin context should expose a conceptual primitive such as:

```js
const handle = scope.defer(dispose, {
  label: "map click listener",
  retry: "safe", // optional; default is "never"
});
```

The returned handle permits early disposal and read-only state, not ownership transfer.

Typed APIs should internally use this primitive or the staged-record equivalent. Plugin authors should normally prefer typed helpers for common resources because they close the acquisition-registration gap.

### Acquisition gap

This pattern can still leak:

```js
const resource = acquire();
throw before scope.defer(...);
```

No runtime can recover a resource it was never told about. Tilia should therefore provide small acquire-and-own helpers for the most common gap-prone pairs, while retaining `defer()` for uncommon external resources. Examples are event listener attachment, timer creation, Leaflet event attachment, layer/control attachment, and object URL creation. This belongs in a thin ownership utility layer or a typed subsystem, not one giant context.

If disposer registration itself fails because the scope has closed or the disposer is invalid, an acquisition helper must immediately release the just-acquired effect before rethrowing. Raw `defer()` cannot release an unknown prior acquisition; documentation must require `try/finally` around unusual manual acquisitions when closure can race.

## 10. Disposal Ordering

Within one scope, ordering is deterministic:

1. Atomically transition scope and descendants to closing; abort signals.
2. Invoke task cancellation actions in reverse task acquisition order.
3. Await only task settlements explicitly registered as awaitable.
4. Dispose child scopes in reverse child creation order.
5. Run setup-return cleanup, if present.
6. Dispose parent-local records in reverse acquisition order.
7. Mark scope disposed or cleanup-failed and release successful references.

Children precede all parent-local resources, even if the parent acquired another resource after creating a child. This preserves the structural rule that session work ends before plugin-level controls/providers disappear.

LIFO is appropriate for parent-local records because later effects commonly depend on earlier ones:

```text
acquire container (A)
attach container (B)
attach listener to container (C)

dispose C, B, A
```

Staged registrations join the parent-local acquisition stack once created. If uncommitted, disposal discards them; if committed, it unregisters them. Cleanup continues after errors and records each failure.

## 11. Setup-Return Cleanup

Recommended rule:

- `setup()` may return `undefined`, a cleanup function, or `{ dispose() }`.
- `{ destroy() }` is dropped in the new major version; `dispose` matches the ownership vocabulary and avoids treating arbitrary public API objects as lifecycle results.
- The cleanup may be synchronous or asynchronous.
- Any other non-`undefined` return is `OWNERSHIP_CLEANUP_INVALID`; setup fails and its scope rolls back.
- After setup resolves, the runtime appends the setup-return cleanup as a distinguished final setup record.
- Because it is appended last, it runs before ordinary parent-local records during teardown/rollback, but after child scopes and task cancellation/settlement.
- If commit later fails, the returned cleanup participates in rollback under the same rule.
- Setup-return cleanup is non-retryable by default because one function may partially clean several opaque effects before throwing.

Plugins should use the setup return only for truly plugin-local finalization that cannot be represented as individual owned records. Fine-grained registration produces better diagnostics and safe retry behavior.

## 12. Cleanup Failure and Retry

Suppose the disposal order is `D, C, B, A`:

```text
D succeeds -> mark disposed, release references
C fails    -> retain failed record
B succeeds -> mark disposed, release references
A fails    -> retain failed record
```

The scope becomes cleanup-failed. Successful records never run again. Residual records retain their original relative order; a retry attempts eligible records in the same disposal order (`C`, then `A`).

### Alternatives

1. **Repeated `unuse()` retries everything.** Unsafe: arbitrary cleanup can be non-idempotent or partially complete.
2. **No public retry; only app destruction retries.** Moving an unsafe retry to destroy does not make it safe and prevents recovery of known-idempotent registry releases.
3. **Retry only explicitly retry-safe records — recommended.** Typed registries mark idempotent unregister/release operations safe; plugin authors may opt in for a generic disposer they guarantee is idempotent.
4. **Require all disposers idempotent.** Desirable guidance but unenforceable for external code and setup-return aggregate cleanup.

Repeated `unuse(id)` should:

- retry failed records marked retry-safe;
- never rerun successful or non-retryable failed records;
- clear quarantine only if no residual failures remain;
- otherwise reject again with diagnostics stating which residuals are non-retryable.

`app.destroy()` applies the same rule; it does not magically retry unsafe closures. It completes terminal destruction and reports residual cleanup. This is a deliberate refinement of Phase 2A's “retry if safe” condition.

Complexity introduced is one retry-policy bit and retained failure record per residual effect. That complexity belongs in generic ownership because quarantine is a runtime state. Registry-specific knowledge determines whether its records are safe to retry.

## 13. Child Scopes

Child scopes are justified by current Tilia rather than hypothetical flexibility:

- track-editor plugin → editing session → rectangle interaction;
- route-search plugin → one active request;
- URL-import plugin → import operation;
- future Photo plugin → decode/import operation;
- temporary map interaction → listeners, layers, timer.

Conceptual API:

```js
const session = context.scope.child({ label: "editing session" });
await session.dispose(); // explicit early end
```

Rules:

- Child creation requires an active parent.
- Children derive cancellation from the parent and have their own controller/signal.
- Explicit child disposal aborts only the child, not parent or siblings.
- Parent closing aborts all descendants immediately and disposes them in reverse creation order.
- Nested children are allowed with the same rules; there is no detach.
- A child created during setup is rolled back with setup.
- A child created after commit lives until explicitly disposed or parent teardown.
- A child cleanup failure is recorded in the parent as an unresolved child. During plugin unuse, any unresolved child failure causes plugin cleanup-failed quarantine.
- After an explicit child cleanup failure during normal operation, the plugin may continue only if no Tilia invariant depends on completed child cleanup. The safer default is to make that child unusable and surface the failure; plugin-level quarantine begins when plugin teardown cannot clear the residual.

## 14. AbortSignal and Liveness

Each scope has:

```text
state: open-uncommitted | active | closing | disposed | cleanup-failed
AbortController / signal
```

Semantics:

- Setup begins in open-uncommitted state; guarded acquisition/registration is allowed.
- Commit changes it to active.
- Rollback, explicit child disposal, plugin unuse, or parent/app destruction changes it to closing and aborts its signal exactly once before cleanup callbacks run.
- Parent abort propagates to descendants. Child abort does not affect ancestors.
- A cleanup-failed scope is not alive. Its signal remains aborted; only the ownership engine may invoke eligible residual cleanup.
- `assertAlive()` and all scope-bound typed mutation/registration APIs reject once closing begins.
- Commit checks liveness again; an app-destroyed scope cannot commit even if setup resolves late.

Important invariant:

> Abort requests cooperation; the active-scope check enforces authority.

A stale promise may ignore `signal.aborted`, but it cannot register a service, contribute UI, add an entry through a scope-bound API, or acquire a new owned effect after closing begins. Direct raw access to mutable `app.core` would bypass this invariant and therefore should not remain part of the supported external plugin boundary.

## 15. Async Work Ownership

The ownership layer needs task tracking, not scheduling.

### Categories

| Work | Ownership action |
|---|---|
| Cancelable only | register cancellation as a disposal/task action; no settlement wait |
| Awaitable only | track settlement when teardown must wait for safe completion |
| Cancelable and awaitable | abort/cancel first, then await settlement |
| Neither | do not track as a task; it must not retain authority to mutate after scope death |

Conceptual use:

```js
const operation = requestWithSignal(scope.signal);
scope.track(operation, {
  label: "route request",
  await: true,
});
```

or, when a library has its own cancellation:

```js
scope.track(promise, {
  cancel: () => controller.abort(),
  await: true,
});
```

Rules:

- Setup's returned promise is always runtime-tracked separately; plugins do not register it.
- Operational work is registered when teardown must cancel it, await it, or diagnose its failure.
- Timers normally use an owned timer helper rather than task tracking.
- Detached fire-and-forget work is allowed only if it has no Tilia mutation authority and no owned resource requiring cleanup.
- Awaited task rejection is observed to avoid unhandled rejection. An operational failure is not itself a cleanup failure if the task settled and owned resources were released; a cancellation/settlement cleanup failure is.
- Teardown waits only for records explicitly marked awaitable. A non-cooperative awaited task can delay teardown just as an async disposer can; APIs should pass scope signals and settle on abort. A general timeout policy is not introduced here.

## 16. Guarded Mutation

Future plugin setup receives a context whose mutating APIs are bound to the plugin scope. The plugin should not pass an arbitrary ownership token on every call; context methods capture it internally.

Conceptually:

```text
context.services.register(...)  -> checks scope active/staging, creates owned record
context.inputs.register(...)    -> checks scope, creates owned record
context.entries.create(...)     -> checks scope/policy, creates under chosen owner
context.ui.mount(...)           -> checks scope, creates owned record
```

Requirements:

- Every mutation validates scope state synchronously before making an effect.
- Async methods validate both before starting and immediately before committing a result.
- Handles returned by registration retain the same guard.
- Read-only access may remain after abort only where safe; mutation never does.
- Unsupported direct mutation of `app.core`, mutable registries, or public Maps must be removed from the external boundary. Otherwise stale work can bypass ownership.

This does not decide the full APIs. It establishes that authority flows through a scoped context, not ambient mutable application objects.

## 17. Shared Resources

The generic scope should not understand physical-resource identity or reference counting. A specialized shared-resource manager should:

1. normalize a registry-specific key;
2. create the physical resource on first lease;
3. return one lease handle per owner scope;
4. release the physical resource when the last lease ends;
5. define conflict behavior when equal keys have incompatible definitions.

Each lease is an ordinary retry-safe owned record in the plugin scope.

```text
Plugin A scope --owns lease A--\
                                > Stylesheet manager --owns one <link X>
Plugin B scope --owns lease B--/

unuse(A): release lease A; link X remains
unuse(B): release lease B; link X removed
```

This internal lease count is not plugin dependency reference counting. It manages one physical implementation resource; it does not decide plugin installation/uninstallation.

Duplicating physical styles wastes requests and can alter cascade order. Making shared resources permanent violates uninstall/rollback. Specialized leases best fit Tilia.

## 18. Stylesheet Ownership

### Alternatives

#### Descriptor sugar

- Ergonomic and matches current descriptors.
- Runtime must special-case it before/around setup, synthesize ownership, define order against setup, and validate URLs/keys.
- Static-looking metadata still performs a page mutation and may be conditional on options/document.

#### Explicit setup registration — recommended

```js
setup(context) {
  context.styles.use(new URL("./styles.css", import.meta.url).href);
}
```

- Uses the same setup transaction and liveness rules as other effects.
- Can acquire a shared lease, stage logical ownership, roll back, and release on unuse.
- Allows option-dependent styles without descriptor expansion.
- Keeps descriptors limited to identity, dependencies, and setup.
- Costs one setup statement per stylesheet.

#### Permanent global built-in stylesheet

- Simple for mechanism CSS.
- Does not satisfy optional-domain ownership and retains current feature CSS coupling.

Recommendation: move plugin CSS entirely into an explicit typed style registration. Keep only genuinely app/core mechanism CSS in the app/core scope. The style manager keys by normalized URL plus any integrity/media-relevant attributes; a conflicting definition under the same explicit key is an error. It owns `<link>` lifecycle and leases. Setup should acquire styles before mounting UI to minimize flash, but atomic visual isolation is not promised.

## 19. Services as a Lifecycle Validation Case

A future service registry must satisfy:

- provider scope owns the registration;
- registration is staged during setup and visible only after plugin commit;
- key conflict is detected during preflight;
- rollback discards it; unuse/destroy removes it before provider resources disappear according to disposal order;
- provider hard dependents prevent provider unuse through the plugin graph;
- optional consumers that do not declare a hard dependency must tolerate disappearance;
- lookup/returned facade should be liveness-aware where feasible, so calls after provider teardown fail clearly rather than mutate stale state;
- caching a raw implementation object across provider lifetime should be discouraged or prevented by returning a guarded facade/lease;
- consumer use of a service does not transfer ownership to the consumer.

For `tilia-panel`, layers/editor may cache a scoped service facade because their hard dependency ensures provider teardown occurs later. The facade still rejects once app destruction starts. Exact naming, multiple providers, and versioning belong to Phase 2D.

## 20. Contributions as a Lifecycle Validation Case

Base-map definitions show the current problem: providers register values permanently. Future contribution registries must provide:

- staged batch publication at plugin commit;
- deterministic ordering defined by the typed registry, not raw disposal-stack order;
- owned unregister on rollback/unuse/destroy;
- no callback execution during commit;
- post-commit change notification isolated from commit correctness;
- removal notifications that cannot invoke stale provider callbacks;
- handles whose mutation is scope-guarded;
- specialized shared/provider semantics when multiple contributions intentionally target one extension point.

Layers/settings/status UI contributions later use the same lifecycle contract but define their own schemas and conflict/order rules in Phase 2D/2F.

## 21. Input Registrations as a Lifecycle Validation Case

The current input registry is append-only and first-match. An owned future registration must:

- stage its matcher/handler/metadata until plugin commit;
- receive deterministic ordering from the typed input registry;
- unregister on setup rollback, plugin unuse, and app destruction;
- snapshot or otherwise define dispatch behavior if a handler is removed during dispatch;
- bind handler invocation to provider liveness;
- associate asynchronous handler work with an invocation child scope or validate liveness before committing results;
- prevent a late handler result from mutating Tilia after provider removal.

Matcher metadata, priorities, MIME types, and capability schemas remain Phase 2D. Ownership machinery only supplies staging, owner, disposal, liveness, and optional invocation child scope.

## 22. DOM and Leaflet Resource Ownership

Three approaches were compared:

1. **Manual `scope.defer()` only:** minimal implementation, but current anonymous handlers and acquisition gaps remain easy to reproduce.
2. **Large convenience context:** leak-resistant but risks becoming a wrapper for every browser/Leaflet API.
3. **Small helpers over `defer()` — recommended:** cover repetitive attach/detach pairs with demonstrated use.

Useful minimal helpers are conceptually:

```text
listen(target, type, listener, options)       // DOM add/removeEventListener
listenLeaflet(target, type, listener, context)// on/off
setTimer(callback, delay)                     // set/clear timeout + liveness guard
attachLayer(mapOrGroup, layer)                // add/remove attachment
attachControl(map, control)                   // add/remove attachment
objectUrl(blob)                               // create/revoke URL
```

These helpers must acquire and register atomically, preserve callback/context/options identity, guard callbacks after scope death, and return an early-disposal handle where useful. They do not replace typed UI, entry, or interaction APIs. DOM nodes contained entirely inside an owned control often need no individual listener records because removing the subtree ends browser reachability; global/document/map listeners still require explicit ownership. Relying solely on DOM garbage collection is insufficient when external targets retain callbacks.

## 23. Core/App-Owned Resources

The same scope engine should support non-plugin owners without exposing plugin APIs:

```text
App coordinator
  1. plugin scopes (dependency-aware order)
  2. core/runtime scope (registries, hubs, UI roots, host attachments)
  3. app-owned infrastructure scope (factory-created map)
```

Destruction order is explicit, not merely root-child LIFO:

1. stop/abort new app and plugin work;
2. dispose plugins dependents-first;
3. dispose core/runtime registrations, hubs, roots, and attachments;
4. destroy infrastructure Tilia created;
5. leave caller-owned infrastructure intact.

For a caller-supplied map, Tilia owns its own map listeners, controls, layers, popups, DOM roots, and style/data attributes. It removes those but does not call the map's terminal remove/destroy method unless the caller explicitly transferred ownership. A factory-created map is placed in the app-owned infrastructure scope and may be removed last.

## 24. Ownership Transfer

General `scope.transfer(resource, target)` is not recommended.

Current apparent transfer cases are better modeled at creation:

- Track editor's saved GPX entry should be created directly under the entry manager/app/domain owner selected by Phase 2C, while draft layers remain session-owned.
- A temporary decode buffer used to create a Photo entry stays operation-owned; the final entry/object URL should be created or adopted by the entry owner through its typed API.
- A plugin contribution intended to outlive the plugin contradicts plugin ownership and should be app/core-owned explicitly, not detached silently.

Transfer complicates rollback, changes disposal order, and can create orphan scopes. If Phase 2C proves that atomic entry creation requires adoption of a prepared resource, provide a narrow typed “create/adopt into entry” operation that transfers one validated resource during commit. Do not expose generic scope transfer or detachable child scopes.

## 25. Resource Identity

Generic ownership records need no stable public ID. Scope-local sequence, diagnostic label, and opaque handle are sufficient for ordering and disposal.

Identity belongs where semantics exist:

- services/contributions/inputs: typed registry keys/handles;
- shared styles: normalized shared-resource key;
- UI surfaces: registry-specific surface ID;
- entries: Phase 2C entry identity;
- async tasks: optional diagnostic label, not a global ID.

A universal resource-ID namespace would add collision/versioning rules without helping disposal and is rejected.

## 26. Error Model

Use the Phase 2A `TiliaPluginError` shape with a small set of ownership codes rather than a new hierarchy:

| Code | Category | Meaning |
|---|---|---|
| `SCOPE_NOT_ACTIVE` | programmer/lifecycle | registration, mutation, or child creation after closing; include owner/label/state |
| `SCOPE_COMMIT_INVALID` | programmer/lifecycle | commit requested in wrong state or with invalid staged record |
| `OWNERSHIP_DISPOSER_INVALID` | programmer | non-function/invalid cleanup shape |
| `OWNERSHIP_CLEANUP_INVALID` | plugin setup | invalid setup-return cleanup |
| `REGISTRATION_PREFLIGHT_FAILED` | setup/commit | typed registry conflict/validation; original typed cause retained |
| `REGISTRATION_COMMIT_FAILED` | exceptional lifecycle | unexpected commit failure; triggers rollback |
| `SCOPE_ROLLBACK_FAILED` | aggregate diagnostic | rollback incomplete; wrapped by `PLUGIN_SETUP_FAILED` |
| `SCOPE_DISPOSAL_FAILED` | aggregate diagnostic | one scope/child incomplete; wrapped by teardown/destroy error |
| `TASK_SETTLEMENT_FAILED` | cleanup diagnostic | registered task could not cancel/settle as contracted |
| `SHARED_RESOURCE_RELEASE_FAILED` | cleanup diagnostic | shared manager lease release failed |

Child failures appear with a scope path such as `x-track-editor/editing-session/rectangle`. Aggregate entries include owner plugin, scope path, record label/type, retry policy, and cause. Registry-specific conflicts retain their Phase 2D code rather than being flattened.

## 27. Alternative Ownership API Designs

### A. Generic disposer stack

```js
scope.defer(() => release(resource));
```

- Simplicity: excellent; tiny foundation.
- Leak resistance: moderate; acquisition gap and anonymous callbacks remain.
- Transactions: rollback works for immediate effects but not staged public visibility without registry support.
- Testability: straightforward record-order tests.
- Risk: pushes repetitive error-prone code to every plugin.

### B. Resource handle model

```js
scope.own(resource, (value) => value.remove());
```

- Simplicity: still small; can return an early-release handle.
- Leak resistance: slightly better association between value and disposer, but acquisition already happened.
- Transactions: same limitation as A for public registrations.
- Risk: encourages universal resource wrapping/identity that Tilia does not need.

### C. Rich lifecycle context

```js
context.listen(...);
context.task(...);
context.styles.use(...);
context.services.register(...);
```

- Leak resistance/ergonomics: high.
- Transaction support: high if every method is scope-aware.
- Coupling/risk: one context can become a general framework and force the ownership layer to know all subsystems.

### Recommended combination

Use A as the private/public escape-hatch foundation, add structural `child()` and minimal `track()` primitives, and let typed registries/helpers provide C-style methods in their own modules. A scope-bound setup context composes those APIs but the generic scope engine knows only lifecycle protocols.

```text
generic: defer, child, signal, assertAlive, track, dispose
small helpers: DOM/Leaflet listener, timer, attachment, object URL
typed registries: services, styles, inputs, contributions, UI, later entries
```

This introduces enough machinery for transactions without centralizing domain knowledge.

## 28. Recommended Ownership Contract

### Representative setup

```js
async setup(context, options) {
  context.styles.use(new URL("./plugin.css", import.meta.url).href);

  context.listen(context.map, "click", onMapClick); // conceptual helper

  const service = context.services.register("x-example", createService());
  // service is usable directly here, but not publicly discoverable until commit

  const session = context.scope.child({ label: "session" });
  // child may live after setup and be explicitly disposed later

  return async () => {
    // optional finalization only; service/listener/style are already scope-owned
  };
}
```

### Immediate resource

```text
helper asserts scope open
attach effect
register disposer immediately
if registration fails: detach effect immediately, then throw
return guarded early-release handle
```

### Staged registration

```text
typed registry validates local shape
create private staged record in scope
return owner-local guarded handle/value
on commit: preflight all -> synchronous callback-free batch publish
on rollback: discard staged record
on teardown: unregister committed record
```

### Setup success/failure

```text
success:
  append optional setup cleanup
  preflight/commit staged registrations
  mark scope active
  runtime marks plugin installed

failure:
  close + abort tree
  cancel/await registered work
  children reverse order
  setup cleanup if it exists
  local records reverse order
  absent if complete; quarantine if residual failures
```

### Child operation

```js
const operation = pluginScope.child({ label: "URL import" });
try {
  const promise = fetch(url, { signal: operation.signal });
  operation.track(promise, { await: true });
  const response = await promise;
  operation.assertAlive();
  await scopedInputApi.dispatch(response); // API rechecks scope before commit
} finally {
  await operation.dispose();
}
```

### Plugin unuse

```text
runtime makes plugin unavailable and closes scope
abort plugin/children
cancel then await registered tasks
dispose children reverse creation
run setup-return cleanup
dispose local records LIFO
remove plugin on success
retain failed records and quarantine on failure
```

### Cleanup retry

```text
repeated unuse:
  attempt only failed retry-safe records in retained order
  never repeat successful/non-retryable actions
  leave quarantine while any residual remains
```

### App destruction

```text
abort app immediately; forbid commits/new effects
dispose plugins in Phase 2A dependency order
dispose core/runtime scope
dispose factory-owned infrastructure
preserve caller-owned host objects
aggregate all residual failures after every attempt
```

These sketches are behavioral proposals, not final method signatures.

## 29. Core Invariants

1. Every Tilia-visible owned effect has exactly one lifetime owner scope or one shared manager with owner leases.
2. Dependency/use relationships do not imply ownership.
3. A child scope cannot detach or outlive its parent.
4. Closing a parent immediately closes and aborts every descendant.
5. No new record, child, task, registration, or mutation may be created after closing begins.
6. A scope can commit only once, while open-uncommitted and alive.
7. Staged public registrations are invisible outside their owner until commit.
8. Commit preflights the whole batch and publishes synchronously without arbitrary callbacks.
9. Immediate effects may be visible during setup but must have registered rollback.
10. Children dispose before parent-local records; parent-local records dispose LIFO.
11. Setup-return cleanup runs after child/task shutdown and before ordinary parent-local records.
12. Cleanup is best-effort; one failure never suppresses later cleanup attempts.
13. Successfully disposed records are never invoked again.
14. Failed cleanup is retried only when its record is explicitly retry-safe.
15. A cleanup-failed scope is not alive or publicly discoverable.
16. A plugin cannot commit after app/plugin liveness is revoked.
17. Shared physical resources remain while any active owned lease exists.
18. Scope-bound handles and APIs reject mutation after owner death.
19. Caller-owned infrastructure survives app destruction; Tilia-owned attachments do not.
20. Generic ownership machinery contains no GPX, Photo, selection, panel, or input-domain semantics.

## 30. Failure-Scenario Validation

### Scenario A — setup failure

```text
stage service S
attach DOM listener L
acquire stylesheet lease X
setup throws
```

The scope closes and aborts. S was never public and is discarded. X's lease releases; the physical link is removed if it has no other lease. L is detached. Failures are aggregated; complete cleanup returns the plugin to absent, incomplete cleanup quarantines it.

### Scenario B — shared stylesheet

A and B each own a lease for X. Unusing A releases one lease; X remains because B's lease exists. Unusing B releases the final lease and the style manager removes X. No plugin dependency count is involved.

### Scenario C — editor session

Plugin scope owns control, subscriptions, global/map listeners, style leases, and an editing-session child. Session owns draft layers, visibility restoration, overlay, and rectangle child. Unuse closes/aborts all, disposes rectangle, then session resources/restoration, then plugin cleanup/resources. Saved entries follow the Phase 2C owner, not the session.

### Scenario D — stale fetch

URL-import request child owns/uses an abortable tracked fetch. Unuse aborts the child and optionally awaits settlement. If fetch still resolves, `operation.assertAlive()` and scope-bound dispatch/mutation reject. It cannot add an entry or registration.

### Scenario E — cleanup failure

D and B succeed and are released; C and A fail and remain as residual records. Retry attempts only C/A marked retry-safe, in that order. A non-retryable residual keeps the plugin quarantined; app destroy reports it after completing all other cleanup.

### Scenario F — app destroy during setup

App state becomes destroying immediately, app/plugin signals abort, and setup loses commit authority. Cooperative work settles; when setup returns or throws, its uncommitted scope rolls back. The plugin never becomes installed. Destroy then continues with other plugins/core.

### Scenario G — child cleanup failure

The child becomes cleanup-failed and unusable. Parent/plugin operation receives an aggregate failure. Plugin unuse retries eligible child residuals; any remaining child residual causes plugin quarantine because the parent cannot be fully disposed.

### Scenario H — caller-owned map

Runtime closes all plugin/core scopes, removes Tilia controls, layers, listeners, surface roots, and attributes from the supplied map/container. The Leaflet map object and caller layers remain. For a factory-created map, the final app-owned infrastructure disposer also removes the map.

## 31. Validation Against Existing Plugins

| Plugin | Scope records / child scopes | Async/shared behavior | Migration pressure |
|---|---|---|---|
| `tilia-panel` | surface lease, DOM/map propagation listeners, close listener, ResizeObserver/panel-state registration, explicit panel service | core/shared UI root is used, not owned | service becomes staged; anonymous listeners need helpers or subtree reasoning |
| `tilia-layers` | control, refresh subscription, panel contribution/use handle | async photo-mode UI actions need liveness guard | future domain contributions deferred; no raw core mutation |
| `tilia-file-import` | control and change listener | each import may use operation child; FileReader tracking as needed | accept/capability schema later; listener ownership straightforward |
| `tilia-dropzone` | three DOM listeners and active-class restoration | dropped file processing child operations | current cleanup maps directly to owned helper records |
| `tilia-url-import` | surface, control, DOM/Leaflet propagation listeners | import request child: abort + await + guarded result | current fetch controller must derive from scope |
| `tilia-query-import` | few persistent resources | setup-tracked request or post-install operation child | if kept in setup, destroy revokes commit and aborts request |
| `tilia-settings` | control, panel use/contribution | none material | future Photo field contribution owned separately |
| elevation | control, selection subscription, two map listeners, marker, timers | timers owned; marker may be operational child | current explicit timer Set can be replaced by owned timer helper |
| status | control and DOM click listener; staged status service | no material async work | service no longer inferred from return value |
| base-map control | control and refresh subscription | consumes core registry | straightforward owned records |
| base-map providers | staged definitions | possibly shared tile-provider data, not lifecycle work | typed registry must finally support unregister |
| `x-track-editor` | plugin records plus editor-session and rectangle child scopes | operational editor callbacks guarded | strongest justification for child scopes; saved entry owner deferred |
| `x-route-search` | surfaces, marker group, map listeners, control; request child | cancel/await fetch; guard late results | imported entries' owner deferred; current request must become scoped |
| `x-milestone` | subscription, zoom listener, per-track listener/marker child records | no long request | anonymous layer callbacks must become removable owned listeners |
| `x-gpx-export` | control, refresh subscription, style lease | per-download child owns anchor/object URL/revoke timer | short child makes delayed cleanup explicit |
| future Photo | staged JPEG handler/services/contributions/style; operation/entry resources | EXIF/file operation children; object URL ownership | lazy module unaffected; entry lifetime deferred to 2C |

The model fits all current plugins without plugin-specific behavior in the generic scope engine.

## 32. Requirements Passed to Phase 2C

Phase 2C must decide:

- the owner of each entry and its source/presentation resources;
- whether plugin-created entries may outlive their plugin;
- Photo-plugin uninstall policy for live Photo entries;
- whether saved editor entries are created directly under app/domain ownership;
- how entry child resources (layers, object URLs, interactions) dispose on replace/remove/clear;
- whether a narrow typed adoption operation is required for prepared resources;
- how entry mutations are scope/liveness guarded;
- how app destruction orders entry disposal relative to domain plugins and core.

It must not rely on general detachable scopes or untracked direct state mutation.

## 33. Requirements Passed to Phase 2D

Services, capabilities, contributions, and inputs must implement the common staged-registration protocol:

- scope-bound owner;
- preflight plus callback-free atomic batch commit;
- deterministic registry-specific conflicts/order;
- rollback discard and committed unregister;
- retry-safe idempotent removal where possible;
- liveness-aware handles/callback invocation;
- no raw mutable registry exposure;
- notifications only after commit and isolated from commit correctness;
- defined behavior for in-flight dispatch during removal;
- no inference of service identity from setup return.

Phase 2D decides schemas, keys, provider multiplicity, priorities, metadata, lookup, and notification APIs.

## 34. Requirements Passed to Phase 2E

Selection and interaction mechanisms must:

- bind subscriptions and published interaction registrations to owner scopes;
- unregister/invalidate them on child/plugin/entry disposal;
- prevent callbacks after subscriber/provider scope death;
- preserve central selection invalidation while avoiding domain knowledge in ownership;
- associate popup/map resources with an appropriate scope;
- define behavior when selected entry/provider disappears;
- use typed registry/entry identities rather than universal ownership IDs;
- avoid an unstructured event bus.

Phase 2E decides selection identity, payloads, interaction schemas, popup policy, and event ordering.

## 35. Requirements Passed to Phase 2F

UI/external-plugin design must provide:

- external-safe scope-bound helpers for controls, surfaces, listeners, timers, and styles;
- owned UI registrations and contribution handles;
- DOM removal and provider lifetime semantics;
- no dependence on mutable private `app.core` to create effects;
- clear caller-owned container/map boundaries;
- guarded service/UI facades for cached external-plugin references;
- minimal helper surface rather than wrappers for all DOM/Leaflet APIs;
- CSS lease keys/order and core-versus-feature stylesheet separation.

Phase 2F decides concrete panel/layers/settings/control contribution APIs and supported external imports.

## 36. Open Questions Requiring Human Decision

1. **Cleanup result form:** accept both function and `{dispose()}`, or function only? Recommendation: accept both; drop `{destroy()}` in the major version.
2. **Retry contract:** approve retry only for explicitly retry-safe records, leaving non-retryable residuals quarantined. This is safer than Phase 2A's broad tentative retry wording.
3. **Stylesheets:** approve moving plugin styles entirely from descriptors into explicit scoped setup registration. Recommendation: yes; keep only core mechanism CSS app-owned.
4. **Child cleanup failure during operation:** should it immediately quarantine the whole plugin or only make the child unusable until plugin teardown? Recommendation: child unusable immediately; plugin quarantine only if residual cleanup still exists when plugin teardown completes.
5. **Async settlement:** should a later global maximum teardown wait be specified? Recommendation: not in the initial ownership contract; require registered awaitable operations to settle on abort and revisit only with evidence.
6. **Commit notifications:** confirm that registry notifications happen after installation rather than within atomic commit. Recommendation: yes, to keep commit callback-free.
7. **Factory map ownership:** confirm Phase 2A's tentative rule that default-factory maps are removed on app destroy while caller-supplied maps survive.
8. **Low-level `defer()` exposure:** public to external plugins as an escape hatch, or internal only? Recommendation: public through a constrained scope handle; external libraries require it, while common effects use helpers.
9. **Explicit retry-safe declaration:** allow external plugins to mark arbitrary disposers retry-safe? Recommendation: yes, documented as an idempotence promise; typed Tilia registries set it internally.
10. **Task API surface:** one `track(promise,{cancel,await})` primitive or child-scope-only conventions? Recommendation: minimal `track` plus child scopes; neither replaces the other.

No Phase 0 principle needs reconsideration. Phase 2A's quarantine model remains sound after narrowing retry to records whose safety is known.

## 37. Files and Symbols Consulted

- `plugin-architecture/DESIGN.md` — architectural principles.
- `plugin-architecture/PHASE-1-INVENTORY.md` — current resource/lifecycle baseline.
- `plugin-architecture/phase-2/RUNTIME-DESIGN.md` — Phase 2A runtime decisions and Phase 2B requirements.
- `src/app.js` — `app.use`, `app.unuse`, `provide`, refresh handlers, stylesheet setup.
- `src/ui/styles.js` — permanent document stylesheet insertion.
- `src/ui/surfaces.js` — keyed surface mount/unmount and `ResizeObserver` lifetime.
- `src/core/input-registry.js` — append-only input handlers.
- `src/core/input-processing.js`, `remote-url-import.js` — sequential dispatch, fetch timeout/AbortController.
- `src/core/selection-hub.js`, `interaction-hub.js` — subscriptions, map listener, domain handle replay.
- `src/core/boot.js`, `state.js` — entry/layer/object-URL ownership and cleanup.
- `src/gpx/parse.js`, `src/photo/exif.js` — FileReader and object URL acquisition.
- `src/map/base.js`, `controls.js`, `layers.js` — base-map registration, controls, Leaflet attachments.
- `src/plugins/input/file-import.js`, `dropzone.js`, `url-import.js`, `query-import.js` — DOM listeners, controls, surfaces, async work.
- `src/plugins/ui/panel.js`, `layers-control.js`, `elevation-panel.js`, `settings-panel.js`, `status-control.js`, `base-map-control.js` — service use, listeners, subscriptions, timers, controls.
- `plugins/x-track-editor/loader.js`, `editing-layers.js`, `rectangle-selection.js`, `selection-overlay.js` — nested editor/session resources.
- `plugins/x-route-search/loader.js`, `client.js` — request and temporary UI/layer resources.
- `plugins/x-milestone/loader.js` — retained anonymous layer-listener evidence.
- `plugins/x-gpx-export/loader.js` — object URL and delayed timer lifecycle.
- `plugins/x-gsi-base-maps/loader.js`, `x-opentopomap-base-maps/loader.js` — irreversible contribution evidence.
- `tests/plugin-lifecycle.test.js`, `builtin-control-cleanup.test.js`, `ui-surfaces.test.js`, `input-registry.test.js`, `interaction-hub.test.js`, `selection-hub.test.js` — current lifecycle expectations.
- `tests/x-track-editor-*.test.js`, `tests/x-route-search-*.test.js`, `tests/x-milestone.test.js`, `tests/smoke/editor.spec.js` — complex plugin/resource behavior.

---

No source code was modified. This design investigation created only `plugin-architecture/phase-2/OWNERSHIP-DESIGN.md`.

- Unit tests: `npm test` — 37 files, 336 tests passed.
- Smoke tests: `npm run test:smoke` — 28 tests passed.
