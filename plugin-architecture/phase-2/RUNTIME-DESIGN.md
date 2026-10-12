> Historical migration document: its external-object/catalog-only resolution policy is superseded by the current [architecture contract](../ARCHITECTURE.md). Valid unknown third-party IDs now use fixed sibling `plugins/<id>/loader.js` discovery, including dependencies, before setup. The official catalog contains only `tilia-*`; explicit application catalogs and direct definitions remain supported. No configurable plugin directory or arbitrary package/URL discovery is introduced.

# Phase 2A — Plugin Runtime & Lifecycle Design

## 1. Executive Summary

Tilia should retain its plain plugin-object model and one asynchronous `app.use()` path, but replace the current validation-only runtime with a small graph-aware lifecycle runtime.

The recommended model is:

- A plugin descriptor remains approximately `{ id, requires?, setup }`.
- Built-in registration is a static ID-to-loader table whose loader uses a literal dynamic `import()`. The registry must not import implementation modules eagerly.
- External plugins are installed primarily as plugin objects. Tilia should not retain convention-based arbitrary external module discovery as a default runtime responsibility.
- `requires` contains hard plugin IDs only. The runtime recursively resolves and installs resolvable dependencies before the dependent's setup.
- Runtime mutations are coordinated deterministically. Concurrent requests for the same plugin share one operation/result; dependency setup is never duplicated.
- A plugin becomes installed only after its setup has completed successfully and its setup-owned registrations/resources have committed.
- Every setup runs inside a Phase 2B ownership scope. If setup fails, that scope is aborted and all acquired resources are disposed in reverse order before `use()` rejects.
- Dependencies installed successfully while satisfying a failed request remain installed. Likewise, uninstalling a dependent does not automatically remove now-unused dependencies. Tilia should avoid reference counting and orphan collection unless later evidence requires them.
- `unuse(B)` rejects while any installed plugin requires B. It does not cascade by default and has no public force option in the initial design.
- Teardown makes the plugin unavailable first, aborts its liveness signal, then runs plugin cleanup and owned disposers best-effort in reverse order. One cleanup failure must not prevent later cleanup steps.
- A teardown that cannot fully dispose enters a quarantined `cleanup-failed` state. The plugin is not installed or discoverable, but it cannot be reinstalled until cleanup is successfully retried or the app is destroyed.
- `app.destroy()` is explicit, asynchronous, idempotent, terminal, and tears down dependents before dependencies. It rejects new lifecycle work, aborts pending/plugin work, continues through errors, and reports an aggregate failure after all cleanup is attempted.
- Plugin setup cleanup and public service exposure are separated. Returning a cleanup function remains a convenient lifecycle convention; it must not automatically publish a service. Services/capabilities/contributions belong to Phase 2B and later designs.

This is intentionally not a general plugin framework. There are no version ranges, package discovery, sandboxing, optional-dependency syntax, general event bus, dependency reference counts, or automatic orphan removal.

The two most consequential trade-offs are explicit:

1. Automatic dependency installation applies only to dependencies the runtime can resolve from the built-in loader registry or an explicitly supplied descriptor catalog. A dependency ID is not permission to discover arbitrary code.
2. Successful dependencies remain installed after a parent setup failure or dependent uninstall. This creates some residual installed plugins, but gives callers predictable state and avoids a second ownership system for dependency roots.

## 2. Inputs and Design Constraints

This design is based on:

- Phase 0 principles in `plugin-architecture/DESIGN.md`.
- The factual inventory in `plugin-architecture/PHASE-1-INVENTORY.md`.
- Current runtime functions in `src/app.js`, especially `resolvePlugin()`, `createPluginLoader()`, `app.use()`, and `app.unuse()`.
- Eager built-in composition in `src/builtins.js`.
- Lifecycle tests in `tests/plugin-lifecycle.test.js`, `tests/builtins.test.js`, and `tests/builtin-control-cleanup.test.js`.
- Representative built-ins under `src/plugins/`.
- `plugins/x-track-editor/loader.js` as the complex external-plugin case.
- The future Photo plugin as the optional-dependency and owned-resource case.

Current facts that directly constrain the design include:

- `app.use()` is already asynchronous and deduplicates installed and pending instances by ID.
- Setup may return a cleanup function or an object with `destroy()`.
- Five repository plugins hard-depend on `tilia-panel` and cache its API.
- Current setup can create styles, services, controls, listeners, subscriptions, layers, entries, and asynchronous work before throwing; no rollback exists.
- Current `unuse()` can remove a dependency while dependents remain.
- Current plugin return values are automatically exposed as services, conflating lifecycle and public API.
- URL import, route search, photo parsing, and editor activity demonstrate asynchronous work that may outlive a plugin.
- An unused Photo plugin must not place EXIF code in a GPX-only application's module graph.

Phase 2A defines lifecycle obligations. It deliberately does not define the concrete service, contribution, input, UI, entry, selection, or interaction registration APIs. References to an “owned registration,” “setup scope,” or “service” below are requirements passed to Phase 2B, not finalized APIs.

## 3. Runtime Requirements

### Must

1. **True optionality.** An unused optional built-in must not import its implementation or private dependencies. This follows from Phase 0 and the current static EXIF/built-in graph.
2. **One lifecycle model.** Built-ins and external plugin objects must pass through the same dependency, setup, rollback, uninstall, and destroy semantics.
3. **Stable identity.** IDs remain lower-kebab-case; `tilia-*` remains reserved for registered built-ins; one app may have at most one live instance per ID.
4. **Hard-dependency resolution.** `use(A)` must recursively install resolvable hard dependencies before A.
5. **Deterministic ordering.** Dependencies precede dependents; shared dependencies set up once; independent work must not acquire race-dependent ordering.
6. **Cycle rejection before setup.** The runtime must discover and reject a reachable dependency cycle before setup begins for that installation plan.
7. **Transactional plugin setup.** A failing plugin must leave none of its owned registrations/resources active. Rollback must be reverse order and best-effort.
8. **Precise installed state.** “Installed” must mean setup and commit completed. Resolving, loading, or setting up is not installed.
9. **Uninstall safety.** An installed hard dependency cannot be removed while installed dependents require it.
10. **Complete lifecycle boundary.** Plugin unuse and app destruction must trigger removal of every plugin-owned registration/resource that Phase 2B can track.
11. **Teardown resilience.** One failing cleanup must not block remaining cleanup or unrelated plugin teardown.
12. **Terminal app destruction.** Destruction must reject new use/unuse work, settle/cancel pending work, and leave the app permanently unusable.
13. **Concurrency deduplication.** Concurrent use of one ID must share one installation and outcome.
14. **Async liveness.** Once teardown starts, stale plugin work must be signaled and prevented from mutating the app through plugin-scoped APIs.
15. **External plugin support.** A plain external descriptor passed to `app.use()` must receive the same lifecycle guarantees as a built-in.
16. **Actionable errors.** Callers must be able to distinguish invalid descriptors, unknown/missing dependencies, cycles, setup failure, uninstall blocking, cleanup failure, and destroyed app state.

### Should

1. Preserve `async app.use(...)` and a cleanup-return shorthand.
2. Keep descriptor metadata minimal and static.
3. Allow failed resolution/setup to be retried after the cause is corrected.
4. Keep successfully installed dependencies after a dependent failure/uninstall for predictable behavior.
5. Make repeated `unuse()` and `destroy()` idempotent.
6. Provide small public introspection: installed check and installed ID listing; keep transitional details diagnostic.
7. Keep options per app/plugin installation and do not silently reconfigure an already installed instance.
8. Aggregate cleanup errors with plugin IDs and phases.
9. Keep loader module shapes strict and testable rather than guessing among arbitrary exports.

### Nice-to-have

1. A debugging snapshot that shows transitional state and dependency edges.
2. Error causes/path annotations that preserve the original setup or import error.
3. Test-only injection of built-in loader registries.
4. A deliberate cleanup retry for quarantined plugins.

### Explicit non-requirements

- Semantic-version ranges or plugin version solving.
- Remote package discovery, package-manager behavior, or arbitrary URL loading.
- Sandboxing or capability security isolation.
- Dependency reference counting or automatic orphan collection.
- Optional-dependency syntax in `requires`.
- Parallel setup of independent plugins.
- Hot replacement, live upgrade, or option reconfiguration of an installed plugin.
- Cross-app singleton plugins.
- A universal event bus or general task scheduler.

## 4. Current Runtime Behaviors Worth Preserving

The following current properties solve real problems with low complexity:

- Plain objects with an ID and setup function are easy to author and inspect.
- `app.use()` accepts built-in IDs and plugin objects through one path.
- Setup may be asynchronous.
- Installed duplicate use returns the existing result rather than running setup again.
- Pending duplicate use shares one setup operation.
- Setup and cleanup are conceptually paired.
- Startup plugin configuration is convenience over the same runtime path.
- Plugin IDs communicate ownership through the reserved built-in namespace.

Preservation does not imply preserving every exact API detail. In particular, automatically publishing the setup result as a service and accepting a wide range of guessed module export shapes should not survive: neither is necessary to preserve the useful simplicity above.

## 5. Plugin State Model

### Conceptual states

The runtime needs these conceptual per-ID states:

```text
absent
  |
  | use
  v
resolving/loading
  |
  | descriptor + dependency graph valid
  v
setting-up
  |                  \
  | success           \ failure -> rollback -> absent
  |                                          \-> cleanup-failed if rollback is incomplete
  v
installed
  |
  | unuse/destroy
  v
tearing-down
  |                  \
  | success           \ incomplete cleanup
  v                     v
absent              cleanup-failed (quarantined)
                        |
                        | cleanup retry / app.destroy retry
                        v
                      absent or terminal app destruction
```

`unresolved` does not need a durable record. “Absent” covers never requested, successfully removed, and a failed install after rollback. Resolution and loading may be distinct internally for diagnostics, but callers do not need separate public states.

### Installed-state boundary

A plugin is installed only after:

1. its descriptor and complete reachable dependency graph have been validated;
2. every hard dependency is installed;
3. its setup promise resolves;
4. its setup scope commits successfully; and
5. its installed record and dependency edges are atomically published.

Another plugin may depend on it only after that boundary. Public services/capabilities contributed during setup must not become generally visible before commit, or their access must be transactionally staged by Phase 2B.

### Pending and failure behavior

- While resolving or setting up, `hasPlugin(id)` is false. Diagnostic introspection may report a transitional state.
- Concurrent `use(id)` joins the same operation.
- Setup failure triggers rollback and rejects all joined callers with the same logical failure. Complete rollback returns the ID to absent and permits retry; incomplete rollback enters `cleanup-failed` and blocks reinstall.
- A retained diagnostic may record the last error, but must not make the plugin appear installed.
- During teardown the plugin is not discoverable to new consumers, its liveness signal is aborted, and new operations targeting it are serialized behind teardown.
- `use(id)` during teardown waits for teardown. It then installs a fresh instance if cleanup succeeded, or rejects with cleanup-failed if the record is quarantined.
- `unuse(id)` during setup waits for the installation outcome. If setup succeeds it tears the plugin down; if setup fails it resolves as “not installed” after rollback. This avoids a race in which an earlier unuse returns while a later setup silently commits.

### Public observability

Only `installed` should be normal application-visible state. Transitional/quarantine states are useful for errors and debugging, not for ordinary feature branching. Consumers should discover public services/capabilities through their later registries rather than reading the runtime state machine.

## 6. Plugin Descriptor

### Recommended sketch

```js
const plugin = {
  id: "x-example",
  requires: ["tilia-panel"], // optional, hard plugin dependencies only
  async setup(context, options) {
    // acquire owned resources through context/scope mechanisms
    // optionally return lifecycle cleanup
  },
};
```

This is a proposal, not normative production code.

### Fields

| Field | Need | Nature | Built-in/external | Why not elsewhere |
|---|---|---|---|---|
| `id` | identity, dedupe, graph keys, errors | static metadata | both | Runtime cannot manage lifecycle without a stable key. |
| `requires` | graph resolution/order/protection | static metadata | both | Setup-time service lookup is too late for cycle detection and ordering. |
| `setup` | activate plugin inside owned scope | runtime behavior | both | This is the plugin's lifecycle entry point. |

`requires` should default to a frozen empty list after normalization. IDs must be unique within the list; duplicates should be rejected as descriptor errors rather than silently normalized, because they usually indicate an author mistake.

### Fields not recommended now

- **`stylesheets`:** Current usage is convenient, but stylesheet ownership, rollback, shared references, and removal are registration concerns. Phase 2B should decide whether a small descriptor convenience can safely compile into an owned setup registration. It is not necessary for dependency resolution.
- **`services`, `capabilities`, `contributions`, `inputs`, UI declarations:** these are operational registrations, not lifecycle metadata. Declaring all of them would make the descriptor a manifest of implementation details and prematurely decide later phases.
- **`version` or dependency ranges:** no current Tilia use case requires solving versions. JavaScript module/package resolution already selects implementation versions.
- **`optionalRequires`:** optional integration should use capabilities/contributions later, not ambiguous dependency edges.
- **`teardown` as a descriptor method:** teardown normally needs per-install captured state. A setup-return cleanup and owned scope fit that need with less mutable descriptor state.

### Setup result

The setup result must not automatically become a service. Recommended lifecycle meanings are:

```text
undefined                  no explicit plugin cleanup
() => void | Promise       explicit cleanup shorthand
{ dispose() }              optional structured cleanup form, if retained
```

The runtime stores this result only for lifecycle. Public APIs are explicitly registered through the later ownership/service model. This solves the current conflation where internal control objects become public services merely because they carry `destroy()`.

The exact name `dispose` versus `destroy` is an open naming decision. Semantically, runtime cleanup must be separate from public service identity.

## 7. Built-in Resolution and Lazy Loading

### Alternatives

#### Eager descriptor registry

```js
import photo from "./photo.js";
registry.set("tilia-photo", photo);
```

- Benefit: simplest lookup; matches current code.
- Cost/failure: implementation and EXIF dependencies enter the graph on import; violates true optionality.
- Fit: unacceptable for Phase 0.

#### Lazy loader registry — recommended

```js
const builtinLoaders = new Map([
  ["tilia-panel", () => import("./plugins/ui/panel-plugin.js")],
  ["tilia-photo", () => import("./plugins/photo/plugin.js")],
]);
```

- Benefit: static, auditable built-in namespace; bundlers can split literal imports; unused implementations are not loaded; easy loader injection in tests.
- Cost: resolution becomes async and loaded-module shape must be specified; bundlers may still emit chunks, though they are not fetched/evaluated until requested.
- Failure mode: loader import or export validation fails with a built-in resolution error.
- Fit: best match because `app.use()` is already async and built-in IDs are known at build time.

#### One giant dynamic path expression

```js
import(`./plugins/${id}.js`)
```

- Benefit: small source registry.
- Cost/failure: bundler behavior is less explicit; may include broad directory contexts, complicate static analysis, and blur reserved-ID registration.
- Fit: weaker than a literal loader table for a small known built-in set.

### Recommended resolution contract

- The runtime owns an immutable built-in loader registry keyed by canonical `tilia-*` IDs.
- Presence in that registry determines whether a `tilia-*` ID is valid; loaded descriptors do not confer built-in status.
- Loader invocation is cached per app runtime while resolving. JavaScript module caching may also apply globally, but lifecycle instances remain per app.
- A loader returns a module with exactly one documented plugin export shape: preferably `default` descriptor. Accepting the descriptor directly is useful for injected tests, but production modules should use the documented shape.
- The loaded descriptor must validate and its `id` must exactly equal the requested registry key.
- Import/validation failures are cached only for the active operation. A later `use()` may retry, allowing transient load failures or corrected test providers.
- Unknown `tilia-*` IDs produce `PLUGIN_UNKNOWN`, not an external lookup.
- Descriptor caching after successful load is safe per app; setup instances are not cached across uninstall/reinstall.

The registry itself may live in a lightweight module imported by the runtime. It must contain only loader functions and identifiers, not imports of plugin implementation symbols.

## 8. External Plugin Resolution

The primary external mechanism should remain:

```js
await app.use(externalPlugin, options);
```

Tilia does not need default convention-based discovery of `plugins/<id>/loader.js`. That current behavior is convenient for repository samples but makes an arbitrary ID imply code-location policy, complicates dependency resolution, and is not a browser package system.

Recommended boundaries:

- **Built-in ID:** resolvable through the built-in loader registry.
- **External object:** descriptor supplied directly to `app.use()` or to an explicit app-level descriptor catalog/configuration.
- **Tilia dependency:** an ID edge in `requires`, independent of JavaScript imports.
- **Private package dependency:** imported inside the plugin module and invisible to the Tilia runtime.

Automatic recursive dependency installation needs a resolver-visible descriptor. Therefore an external plugin may require:

1. a built-in ID;
2. an already installed external plugin; or
3. an external descriptor explicitly supplied to the app's catalog before resolution.

If an external dependency ID is neither installed nor explicitly known, `use(A)` fails with a missing/unresolvable dependency. The runtime must not search the network or guess a module path.

Built-ins may technically depend on an explicitly known external ID, but bundled standard built-ins should not do so: it would make their usability depend on caller catalog configuration. External plugins may freely depend on built-ins.

Whether the explicit external catalog is configured only at app construction or also has a pre-start registration method is an open API-shape decision. It is resolution metadata, not a general package loader.

## 9. Dependency Semantics

Precise definition:

> `requires` is an ordered list of unique plugin IDs whose successfully installed instances are necessary for the declaring plugin to set up and remain operational. Before the declaring plugin's setup begins, the runtime resolves and installs each dependency recursively in declaration order. The runtime preserves the resulting dependency edges for uninstall protection and destruction ordering.

Consequences:

- Entries are plugin IDs only; no service names, package specifiers, versions, predicates, or optional markers.
- Every edge is hard. If B fails or is unavailable, A cannot set up.
- A dependency's public functionality becomes available only after B is installed.
- The order of entries is meaningful only for deterministic traversal/setup among sibling dependencies. Plugins must not rely on unrelated plugin setup order.
- Dependency order does not imply service lookup names, UI composition, or data ownership.
- Optional status reporting, optional Photo UI contributions, or feature detection must use later service/capability/contribution mechanisms—not `requires`.
- Private dependencies such as an EXIF parser or the editor's vendored Leaflet extension remain ordinary JavaScript imports within the plugin's lazy module.

## 10. Dependency Resolution Algorithm

### Recommended planning and execution

For a top-level `use(A)`:

1. Resolve and validate A's descriptor.
2. Perform a depth-first traversal of `requires` in declaration order.
3. For each dependency:
   - accept an already installed compatible ID immediately;
   - join an in-flight resolution/install for that ID when it belongs to a compatible plan;
   - otherwise resolve its descriptor through the known built-in/external catalog;
   - traverse it recursively.
4. Detect cycles during traversal using a visiting stack.
5. Produce a stable postorder plan with each ID once.
6. Only after the reachable graph is valid and acyclic, execute setup in postorder, skipping plugins installed by earlier work.
7. Publish each installed record atomically after that plugin commits.
8. Resolve the caller with A's lifecycle result/handle after A installs.

Example:

```text
A requires [B, D]
B requires [C]
D requires [C]

stable setup order: C, B, D, A
```

If C is already installed, setup order is `B, D, A`. If B is currently installing, A joins B; C is not set up twice.

### Missing and failed dependencies

- An unknown dependency aborts planning before any setup in that plan begins.
- If a dependency import or setup fails during execution, its own scope rolls back; its dependents do not start.
- Earlier dependencies that installed successfully remain installed.
- A's error should be `PLUGIN_DEPENDENCY_FAILED` with the dependency path and original cause, while the failing dependency's direct callers receive its more specific resolution/setup error.

### Determinism and serialization

Tilia should initially serialize lifecycle mutations through a runtime coordinator. Requests receive monotonic acceptance order; graph traversal uses descriptor order. This sacrifices parallel setup of unrelated plugins but prevents subtle races over services, UI surfaces, and contribution order—mechanisms that current plugins mutate synchronously and whose Phase 2B ordering is not yet designed.

The coordinator must not hold a naive mutex across a plugin callback that can reenter lifecycle APIs and deadlock. The initial contract should prohibit/throw on `app.use()`, `unuse()`, or `destroy()` invoked synchronously from that plugin's own setup/cleanup. Dependencies belong in `requires`; dynamic optional integration belongs in later mechanisms. Calls from unrelated external code are queued normally. `app.destroy()` is special: its request immediately flips the app to destroying and aborts liveness so a long setup cannot later commit, while orderly rollback/teardown continues through the coordinator.

## 11. Circular Dependency Handling

Cycles are detected during the planning DFS, before setup begins for any plugin newly included in that plan.

```text
A -> B -> A
error path: A -> B -> A

A -> B -> C -> A
error path: A -> B -> C -> A
```

The runtime tracks `unvisited`, `visiting`, and `visited`. Encountering a `visiting` ID reconstructs the cycle from the current stack. The error includes:

- code `PLUGIN_DEPENDENCY_CYCLE`;
- requested root;
- ordered cycle path including the repeated endpoint;
- no implication that setup ran.

No setup-owned state remains because graph planning precedes setup. Descriptor modules may have been imported and therefore their top-level JavaScript side effects cannot be rolled back. This is another reason plugin modules should be side-effect-free and perform activation only in `setup()`.

Already installed plugins are treated as graph leaves for a new install, but their stored dependency graph should remain internally valid. Descriptor replacement under an installed ID is rejected, preventing a caller from silently changing edges.

## 12. Concurrent Installation

### Same plugin

```text
const p1 = app.use(A);
const p2 = app.use(A);
```

Both join the same logical installation. Setup runs once; both resolve to the same lifecycle result. If it fails, both reject from the same underlying error/cause. Options from the first accepted request win. A later request with materially different options should not silently reconfigure; diagnostic APIs may expose that an existing instance was reused.

### Dependency and direct request

```text
app.use(A); // A requires B
app.use(B);
```

If A's request is accepted first, its plan installs B, and the direct B request joins that operation. If B is accepted first, B installs and A then observes it installed. In both cases B sets up once and A only begins afterward.

### Shared dependency

```text
A -> C
B -> C
use(A), use(B)
```

C has one pending record and one setup. With serialized lifecycle execution, request acceptance and each descriptor's dependency order define the full setup order. No correctness must depend on which import promise happens to resolve first.

### Conflicting descriptor objects

If concurrent calls supply different descriptor objects with the same ID:

- the first accepted descriptor establishes identity for that operation;
- a later non-identical descriptor should reject with `PLUGIN_DESCRIPTOR_CONFLICT`, not silently join;
- repeated use of the same descriptor or a built-in ID joins normally.

This prevents surprising code substitution behind ID deduplication.

## 13. Setup Transaction and Rollback

### Contract

Each plugin setup receives an isolated, uncommitted ownership scope from Phase 2B. All runtime-aware registrations/resources acquired through that scope are tracked immediately.

```text
begin setup scope
  acquire X
  acquire Y
  acquire Z
  throw
abort scope
  dispose Z
  dispose Y
  dispose X
reject use
```

Rollback requirements:

- Reverse acquisition order.
- Continue after individual disposal failures.
- Aggregate rollback failures with the original setup failure; the setup failure remains the primary cause.
- Do not publish staged services/capabilities/contributions to ordinary consumers before commit.
- Abort the plugin setup signal before rollback.
- Do not mark the plugin installed.
- Remove its pending installation record after rollback completes.
- If every rollback step succeeds, return the ID to absent and allow retry.
- If any rollback step fails, retain the failed steps/diagnostics in `cleanup-failed`; do not allow reinstall over leaked partial state.

Resources created outside runtime-aware APIs can only be cleaned by the plugin's returned cleanup after setup returns; that is too late for a mid-setup throw. Therefore Phase 2B must let plugin code register a disposer immediately after acquisition. Plugin modules remain responsible for registering external resources they create.

### Dependencies are separate

If `use(A)` installs C, then B, and A fails:

- A's partial scope rolls back.
- B and C remain installed because each crossed its own installation boundary successfully.
- Previously installed dependencies obviously remain.

Rolling back B/C would require tracking installation roots, accounting for concurrent users, and defining orphan ownership. Tilia has no demonstrated need for that complexity. Callers wanting a minimal set may explicitly `unuse()` successful dependencies after resolving dependent constraints.

### Alternatives

- **Manual best effort:** simplest runtime, but repeats current leakage of styles, handlers, layers, and services. Rejected.
- **Whole-root transaction including new dependencies:** clean root failure surface, but needs root ownership/reference tracking and becomes ambiguous under shared concurrent installs. Rejected initially.
- **Per-plugin transaction — recommended:** strong local safety with a simple installed boundary; successful dependencies remain predictable.

## 14. Dependency Installation Ownership

Three models were evaluated.

### Dependencies remain installed — recommended

- `use(A)` installs B if needed; `unuse(A)` removes only A.
- Benefit: visible operations have local effects; no hidden teardown; concurrency is straightforward.
- Cost: unused dependencies may remain.
- Failure mode: callers can accumulate optional infrastructure until app destruction, but can explicitly remove it.
- Fit: Tilia apps normally install a small, stable plugin set; `app.destroy()` provides final cleanup.

### Reference counting

- Benefit: dependencies can disappear when no roots need them.
- Cost: must distinguish explicit roots from transitive requests, handle repeated explicit uses, options, concurrent failures, and manual unuse.
- Failure mode: surprising disappearance when a count changes or mismatch between service consumers and graph edges.
- Fit: excessive for current Tilia evidence.

### Installation-root ownership / automatic orphan removal

- Benefit: can unwind a root tree.
- Cost: shared graphs require root sets, and caller-visible state changes beyond `unuse(A)`.
- Failure mode: B may be removed even though optional consumers use its capability without a hard edge.
- Fit: poor before capability/contribution semantics exist.

The recommended future constraint is that automatic orphan cleanup cannot be added later without revisiting observable unuse semantics; this should be treated as a deliberate major contract, not an internal optimization.

## 15. Uninstall Semantics

Recommended `await app.unuse(id)` contract:

1. Validate the ID and reject if the app is destroying/destroyed.
2. Serialize behind any active operation for that ID.
3. If absent, resolve an idempotent “not installed” result.
4. If cleanup-failed, retry only the retained failed cleanup actions.
5. Compute installed dependents from stored graph edges.
6. If any exist, reject with `PLUGIN_HAS_DEPENDENTS` and a stable sorted/listed set; make no state changes.
7. Transition the target to tearing-down and remove it from ordinary discovery.
8. Abort its liveness signal.
9. Run explicit setup-return cleanup and scope disposers in the Phase 2B-defined order, normally LIFO as one unified disposal stack.
10. Continue through all errors.
11. On complete success, delete dependency edges/record and permit fresh installation.
12. On incomplete cleanup, retain only cleanup diagnostics/retryable failed disposal actions in `cleanup-failed`, reject with `PLUGIN_TEARDOWN_FAILED`, and prohibit reinstall.

There should be no cascading default because `unuse(B)` would unexpectedly remove A and possibly other features. There should initially be no public `force` option: forcibly leaving A installed without B violates the hard-dependency invariant, while cascade belongs as an explicit higher-level operation if a real use case emerges.

Repeated concurrent `unuse(B)` calls share teardown. After successful removal they are idempotent. A `use(B)` queued during teardown starts a fresh install only after successful cleanup.

The plugin ceases to be discoverable at teardown start, not teardown completion. Existing callers may still hold JavaScript references, which is why services/capabilities need liveness-aware removal and plugin-scoped mutations must reject after abort.

## 16. Teardown Ordering

Hard dependencies imply one invariant:

> Dependents tear down before their dependencies.

For `A -> B -> C`, destruction order is `A, B, C`.

For a shared graph:

```text
A -> C
B -> C
```

C is torn down only after both A and B. Among independent nodes, use reverse successful installation order. This mirrors resource stack behavior and is deterministic.

Explicit `unuse(A)` removes only A; it does not proceed to B/C. Explicit `unuse(C)` rejects while A or B remains. `app.destroy()` computes a reverse topological order across all installed and partially failed records, using reverse installation order as the tie-breaker.

No exception is needed for UI providers such as `tilia-panel`: its dependent controls/plugins must tear down first. This directly fixes the current possibility of removing the panel while layers/editor remain.

## 17. Teardown Failure

Current `unuse()` stops at the first thrown destroy and leaves an ambiguous partially dismantled installed record. The future contract must instead be best-effort and stateful.

Recommended behavior:

- Every registered cleanup step is attempted even if earlier steps fail.
- Errors are collected with plugin ID, cleanup phase, and original cause.
- During explicit unuse, failure rejects with one `PLUGIN_TEARDOWN_FAILED` error whose `errors`/cause data describes all failures.
- The plugin remains unavailable and enters `cleanup-failed`, not `installed`.
- Dependency edges from dependents cannot exist because uninstall protection ran first. Its dependency edges are retained for destroy ordering until cleanup completes.
- Reinstall is rejected while quarantined, preventing duplicate listeners/resources.
- Repeated `unuse(id)` may retry retained failed cleanup steps only if Phase 2B defines disposers as idempotent/retry-safe. Successful steps are never rerun.
- `app.destroy()` retries quarantined cleanup and continues with the rest of the graph regardless of outcome.

Alternative “remove the record and merely report an error” is simpler but permits unsafe reinstall over leaked state. Alternative “treat it as still installed” exposes an API whose resources may already be gone. Quarantine adds one state and retry bookkeeping, but most accurately represents reality.

## 18. Application Destruction

`app.destroy()` should be an explicit asynchronous terminal operation.

### Guarantees

- First call transitions app state from `active` to `destroying` and returns a shared promise.
- Later `destroy()` calls return the same promise/outcome.
- New `use()` and ordinary `unuse()` calls reject with `APP_DESTROYING` or `APP_DESTROYED`.
- The app-level abort signal and all plugin liveness signals are aborted promptly.
- Pending resolver/import/setup operations are awaited to a safe boundary. Cooperative setup receives abort; if it still resolves, its scope must not commit and is rolled back.
- Installed plugins are disposed in reverse dependency order, with reverse installation order as tie-breaker.
- Quarantined records are retried/best-effort disposed.
- Runtime/core-owned resources are disposed after plugin-owned consumers, through hooks supplied by later phases.
- All cleanup continues despite errors.
- The app transitions to `destroyed` in a `finally`-equivalent path and can never be reused.
- If any cleanup failed, the destroy promise rejects with an aggregate `APP_DESTROY_FAILED` only after all cleanup attempts finish. The app is still destroyed.

Terminal destruction fits Tilia better than reusable app instances: Leaflet maps, DOM surfaces, registries, and plugin closures are tied to concrete containers and state. Reinitialization should create a new app.

The runtime must specify whether it removes the externally supplied Leaflet map itself. Phase 2A only requires a core-owned disposer boundary; ownership of caller-supplied versus factory-created maps belongs to later app/core lifecycle design.

## 19. Async Cancellation and Liveness

Two classes require different handling.

### Async setup work

Setup receives a plugin-scoped `AbortSignal` (exact context shape deferred).

For ordinary `unuse(id)` requested while setup is pending, the deterministic policy from section 5 applies: wait for setup; if it installs, tear it down; if setup fails, observe the completed rollback. Ordinary unuse does not preempt setup.

For `app.destroy()` while setup is pending:

- the app/plugin signal is aborted immediately and the setup is forbidden to commit;
- setup code should pass it to fetch/read operations;
- runtime awaits settlement and rolls back the scope;
- even non-cooperative setup cannot commit after app/plugin liveness is revoked.

JavaScript cannot forcibly stop arbitrary promises. Therefore cancellation is cooperative, but commit prevention is mandatory.

### Operational async work

Work launched after installation—URL fetches, route searches, file reads, timers—must be associated with the plugin scope or a child scope. Phase 2B must enable:

- aborting owned tasks on teardown;
- liveness checks before app mutation;
- mutation APIs that reject use of a disposed scope;
- teardown waiting for registered tasks when needed, without a general scheduler.

An `AbortSignal` alone is insufficient: code may ignore it or finish between abort and mutation. A scope liveness guard at mutation/registration boundaries is also required. Conversely, a liveness boolean alone cannot cancel network/CPU work. Tilia needs both signal and guarded scope semantics, but not task priorities, queues, or worker orchestration.

## 20. Runtime Error Model

A small `TiliaPluginError` with a stable string `code`, message, structured details, and `cause` is preferable to many subclasses. It is easier to test across realms and enough for current callers.

Recommended codes:

| Code | Meaning / useful details |
|---|---|
| `PLUGIN_ID_INVALID` | invalid syntax or reserved namespace misuse |
| `PLUGIN_DESCRIPTOR_INVALID` | missing/malformed fields, duplicate requires |
| `PLUGIN_DESCRIPTOR_CONFLICT` | different descriptor supplied for active same ID |
| `PLUGIN_UNKNOWN` | requested built-in/external ID not known |
| `PLUGIN_LOAD_FAILED` | known loader import/export failure; includes ID/cause |
| `PLUGIN_DEPENDENCY_MISSING` | dependency ID not resolvable; includes path |
| `PLUGIN_DEPENDENCY_CYCLE` | includes ordered cycle path |
| `PLUGIN_DEPENDENCY_FAILED` | dependency resolution/setup failure; includes root/path/cause |
| `PLUGIN_SETUP_FAILED` | setup threw/rejected; includes rollback errors |
| `PLUGIN_HAS_DEPENDENTS` | uninstall blocked; includes dependent IDs |
| `PLUGIN_TEARDOWN_FAILED` | best-effort cleanup incomplete; includes error list |
| `PLUGIN_CLEANUP_FAILED_STATE` | operation blocked by quarantine |
| `PLUGIN_LIFECYCLE_REENTRANT` | lifecycle mutation attempted from own setup/cleanup |
| `APP_DESTROYING` / `APP_DESTROYED` | lifecycle operation unavailable |
| `APP_DESTROY_FAILED` | terminal destroy completed with aggregate cleanup failures |

The runtime should wrap errors at responsibility boundaries without erasing original causes. Errors should identify plugin ID, requested root, dependency path, and lifecycle phase where applicable. A complex class hierarchy adds little value; plain `Error` messages alone are too brittle for programmatic tests and user-facing diagnostics.

## 21. Runtime Introspection

Recommended ordinary public needs are small:

```text
app.hasPlugin(id)        -> true only when installed
app.listPlugins()        -> installed IDs/descriptors in installation order
app.getPlugin(id)        -> optional opaque lifecycle result, if a real caller needs it
```

`getPlugin()` should not be the service mechanism. It may be omitted unless migration evidence shows callers need a plugin instance. Current consumers use `app.services` for cross-plugin functionality, not `app.plugins.get()` directly.

Debug-only inspection may expose snapshots such as `{id,state,requires,error}`. It must be read-only and must not expose mutable internal maps or promises. Applications should not branch on `resolving` versus `setting-up`; they should await `use()`.

The current public mutable `app.plugins` Map should not survive. It lets callers violate invariants and exposes record internals.

## 22. Alternative Designs and Trade-offs

| Decision | Alternatives | Recommendation and concrete rationale |
|---|---|---|
| Built-in loading | eager descriptors; dynamic path; literal lazy loader registry | Literal loader registry. It alone combines true optionality, known reserved IDs, predictable bundling, and test injection. Cost: async validation and a small registry module. |
| Dependency installation | current validation-only; recursive automatic | Recursive automatic for resolvable IDs. Phase 0 requires it and current panel ordering is caller burden. Cost: graph planner/cycle detection. |
| Dependency removal | reject; cascade; reference/orphan model | Reject while dependents exist. It preserves hard-dependency invariants without surprising cascade or root accounting. Cost: callers explicitly remove in order. |
| Setup failure | plugin manual cleanup; runtime-owned per-plugin transaction; whole-root transaction | Per-plugin transaction. It prevents current leaks without dependency-root complexity. Successful dependencies remain. |
| Setup result | auto-service + cleanup; cleanup-only; descriptor teardown | Cleanup-only plus explicit service registration later. It separates public API identity from lifecycle and still supports captured state. |
| Teardown failure | stop and remain installed; delete and report; quarantine/retry | Best-effort quarantine. It neither lies that a partial plugin is installed nor permits unsafe reinstall. Cost: one extra state and failed-step bookkeeping. |
| Lifecycle concurrency | fully parallel; per-ID only; serialized coordinator | Serialized mutation with shared per-ID operations. Tilia's registries/UI are order-sensitive; parallelism has little demonstrated payoff. Cost: unrelated slow setup delays later lifecycle operations. |
| External loading | convention URL/path loader; arbitrary resolver chain; objects + explicit catalog | Objects primary, explicit catalog only for dependency resolution. Avoids turning Tilia into a package loader. Cost: hosts must import/configure external plugins. |
| Dependency cleanup | leave installed; ref counts; root ownership | Leave installed until explicit unuse/app destroy. Predictable and smallest. Cost: temporary residual plugins. |
| App end | caller-managed ad hoc cleanup; explicit reusable reset; terminal destroy | Terminal async `destroy()`. Current resources require one boundary; reuse would preserve too much ambiguous state. |

### Constraints introduced by recommendations

- Plugin modules must avoid top-level activation side effects because module loading itself is not rollbackable.
- External transitive dependencies must be explicitly known to the runtime; `requires` is not code discovery.
- Plugins cannot assume automatic removal of dependencies they caused to install.
- Cleanup operations must be idempotent or represented as individually retryable actions to support quarantine.
- Later service/capability APIs must support staged visibility and liveness-aware removal.
- Serialized setup means plugin setup should not perform unnecessary long-lived work; operational tasks should start after install where possible.

## 23. Validation Against Existing Built-ins

| Plugin | Fit with recommended lifecycle | Migration pressure |
|---|---|---|
| `tilia-panel` | Lazy load, setup surface/control state, expose panel service explicitly, owned teardown. Dependents enforce provider lifetime. | Returned panel API must be explicitly registered as a service; surface and observer registrations must be owned. |
| `tilia-layers` | `requires:["tilia-panel"]` auto-installs panel; teardown before panel; setup-owned control/refresh/service use. | Domain behavior remains out of scope; replace cached unowned service/state access later. |
| `tilia-file-import` | No hard dependency; setup creates a control/listener; unuse removes both transactionally. | Hard-coded accept/capability is later work. Listener/control registration must enter scope. |
| `tilia-dropzone` | No hard dependency; target listeners and CSS class are cleanly owned. | Existing returned cleanup maps naturally to cleanup-only setup result. |
| `tilia-url-import` | Control/surface owned by scope; operational fetch gets plugin signal/child task. | Current in-flight fetch must abort or be barred from mutation after unuse. |
| `tilia-query-import` | Async setup can await one import; setup rollback and app destroy cancellation are well-defined. | Decide whether one-shot import belongs in setup or post-install operational task; if setup, app readiness intentionally waits. |
| `tilia-settings` | Hard panel dependency auto-resolves and teardown orders correctly. | Future Photo settings should likely be optional contribution, not a hard dependency; outside 2A. Current control/service resources become owned. |

Other current patterns also fit: base-map providers need owned reversible registrations; elevation needs owned subscriptions/timers/map listeners; status explicitly publishes a service. No representative built-in requires descriptor versions, optional dependencies, parallel setup, or dependency reference counts.

## 24. Validation Against `x-track-editor`

### Installation

The external descriptor is passed to `app.use(trackEditorPlugin)`. Its built-in dependency `tilia-panel` resolves and installs automatically. The editor setup runs only after the panel is installed. Its public editing commands, if intended for other code, are explicitly registered rather than automatically inferred from the cleanup object.

### Owned resources

The control, panel integration, Interaction Hub subscription, refresh subscription, map click listener, container key listener, and track-layer click bindings must be registered with the plugin scope. A setup exception at any point rolls them back in reverse order.

Temporary session resources—draft layers, rectangle-selection DOM/document listeners, selection overlay, visibility restoration, history/session state—need a child ownership scope or immediately registered disposers. Phase 2A does not specify that API, only the requirement.

### Uninstall while editing

`unuse("x-track-editor")` aborts liveness, closes the editing session, destroys temporary layers/selection UI, restores original visibility, detaches listeners/subscriptions, and removes the control before resolving. It must not save a draft implicitly. The current `destroy()` already behaves close to this.

### App destruction

The same editor teardown runs before `tilia-panel` and before any GPX/domain dependency it eventually declares. Failures do not prevent panel/core cleanup. The app becomes terminal.

### Failure and reinstallation

- Setup failure leaves no editor control/listeners because the scope rolls back.
- Successful unuse permits a fresh instance with new options.
- Cleanup failure quarantines the editor, preventing duplicate map/container listeners on reinstall.
- Saved entries intentionally surviving editor uninstall is an ownership decision for Phase 2B/entry design, not a runtime exception.

This model supports the editor without special runtime concepts. Its remaining reliance on GPX/private APIs is a later boundary problem, not evidence for a more elaborate plugin descriptor.

## 25. Validation Against Photo / Issue #74

The Photo plugin should be a registered lazy built-in:

```text
lightweight built-in registry
  "tilia-photo" -> () => import(photo plugin module)

GPX-only app without use("tilia-photo")
  -> loader never invoked
  -> photo module never evaluated
  -> EXIF implementation never resolved/fetched
```

Its EXIF library is a private JavaScript dependency of the lazy Photo module, not a Tilia `requires` entry.

During setup, the Photo plugin will later register JPEG handling, photo presentation/selection behavior, services, and optional UI contributions through an owned scope. If the fifth registration fails, the first four roll back. Unuse aborts photo operations, removes registrations/contributions/services/styles, and disposes plugin-owned resources according to the later entry ownership policy.

Active photo entries raise a Phase 2B/entry decision: uninstall might remove plugin-owned entries, reject while live entries exist, or transfer responsibility. Phase 2A requires only that the policy be explicit and completed before plugin teardown resolves. It must not leave objects whose behavior depends on unloaded Photo code.

App destruction tears down Photo dependents/contributions first, then Photo, and revokes photo-owned object URLs even if another cleanup fails.

This validates the primary property: no Photo descriptor implementation import, EXIF import, JPEG handler, photo service, UI branch, or photo resource exists in an app that never enables the plugin. The lazy registry itself may contain the string ID and loader function; that does not violate optionality.

## 26. Recommended Runtime Contract

### Coherent model

```text
Runtime registry
  built-in ID -> lazy loader
  explicit external ID -> descriptor/provider

app.use(id | descriptor, options)
  -> enqueue deterministic lifecycle request
  -> resolve descriptor(s)
  -> validate complete reachable graph / detect cycles
  -> install dependencies in stable postorder
       begin owned scope + signal
       await setup
       commit scope
       publish installed record/edges
  -> install requested plugin the same way
  -> return lifecycle result (not an automatic service)

setup failure
  -> abort signal
  -> reverse best-effort rollback of failing scope
  -> requested plugin absent/retryable
  -> successfully installed dependencies remain

app.unuse(id)
  -> reject if installed dependents exist
  -> make unavailable + abort
  -> reverse best-effort disposal
  -> absent on success
  -> cleanup-failed quarantine on incomplete cleanup

app.destroy()
  -> terminal destroying state; reject new work
  -> abort app/plugins; prevent pending commits
  -> dependents-before-dependencies teardown
  -> core/runtime disposal
  -> destroyed even if aggregate error is reported
```

### Representative proposal sketch

```js
const photoPlugin = {
  id: "tilia-photo",
  requires: [],
  async setup(context, options) {
    // Phase 2B defines owned registration/disposal operations.
    // Return cleanup only when a resource cannot be represented there.
    return async () => { /* final plugin-local cleanup */ };
  },
};

await app.use("tilia-photo", options); // known built-in ID
await app.use(trackEditorPlugin);      // external object

app.hasPlugin("tilia-photo");
app.listPlugins();

await app.unuse("x-track-editor");
await app.destroy();
```

### Core invariants

1. At most one live lifecycle record per app/plugin ID.
2. Every installed plugin has all hard dependencies installed.
3. No installed plugin depends on a tearing-down/absent plugin.
4. Setup-owned effects are either fully committed or rolled back best-effort and quarantined if cleanup is incomplete.
5. A plugin in setup/teardown is not reported installed.
6. Dependency edges and successful installation order are retained until complete teardown.
7. No plugin-scoped mutation may succeed after its liveness scope is disposed.
8. Destroyed apps never return to active state.

### Pseudocode-level installation flow

```text
use(request):
  assert app active
  normalize request and options
  join exact in-flight ID/descriptor if present
  enqueue operation
    plan = resolveAndValidateGraph(request)
    for id in plan.postorder:
      if installed: continue
      scope = beginPluginScope(id)
      try:
        cleanup = await descriptor.setup(scope.context, optionsFor(id))
        scope.addOptionalCleanup(cleanup)
        scope.commit()
        publishInstalled(id, descriptor, scope, edges)
      catch error:
        abort scope
        rollback all owned effects
        throw contextual setup/dependency error
  return requested lifecycle result
```

Dependency options need an explicit rule: the top-level request receives supplied options; automatically resolved dependencies receive their app-configured options or `{}`. A dependent must not pass private options to its dependency through `requires`.

## 27. Requirements Passed to Phase 2B

Phase 2B must provide an ownership/registration model capable of satisfying all of these contracts:

1. A per-plugin setup scope created before setup starts.
2. Immediate registration of disposers as resources are acquired.
3. Reverse-order, best-effort disposal with per-step error capture.
4. Transactional commit/abort so setup effects are not partially visible.
5. Owned services, capabilities, contributions, input handlers, stylesheets, subscriptions, UI surfaces, listeners, and other registrations.
6. Removal of every owned registration on rollback, unuse, or app destruction.
7. Support for shared resources such as stylesheets without removing resources still owned by another scope.
8. A plugin-scoped `AbortSignal` and liveness state.
9. Guarded mutation/registration operations that reject after scope disposal.
10. Optional child scopes for operational sessions/tasks such as track editing or route search.
11. A way to track async work sufficiently for abort and teardown settlement without a general scheduler.
12. Idempotent or individually retryable cleanup records so failed teardown can be quarantined and retried safely.
13. Staged public visibility: dependencies/consumers cannot observe half-installed services or contributions.
14. Deterministic disposal ordering within one plugin and clear ordering between explicit setup-return cleanup and owned registrations.
15. A policy hook for plugin-owned entries/resources that must be resolved before plugin teardown completes.
16. Runtime/core scopes beneath plugin scopes so `app.destroy()` can dispose shared mechanisms after plugins.

Phase 2B must not require the runtime to understand domain semantics of a resource. It should record ownership and disposal behavior, not encode JPEG, GPX, Leaflet layer, or panel-specific rules.

## 28. Open Questions Requiring Human Decision

The following choices should be approved before converting this design into normative `RUNTIME.md`:

1. **External dependency catalog:** Should external descriptors be accepted only in app construction configuration, or may callers register descriptors before first use? Recommendation: construction-time catalog first; add mutable registration only with a demonstrated host need.
2. **Setup result shape/name:** Retain cleanup function only, also allow `{dispose}`, or retain `{destroy}` naming? Recommendation: cleanup function plus one documented structured form; never auto-publish it.
3. **Quarantine retry:** Should public `unuse(id)` retry failed actions, or should cleanup-failed be recoverable only during `app.destroy()`? Recommendation: allow explicit retry if Phase 2B can guarantee idempotent per-step semantics.
4. **Return value of `use()`:** Return the lifecycle cleanup result, a small plugin handle, or `void`? Recommendation: a small stable plugin handle or `void`; cross-plugin APIs must come from explicit services. Current API return compatibility is not a major-version constraint.
5. **Return value of idempotent `unuse()`:** Boolean/structured result versus `void`. Recommendation: `void` unless callers demonstrate a need; installed state is available separately.
6. **Lifecycle serialization breadth:** One app-wide coordinator versus more complex per-component locks. Recommendation: app-wide deterministic mutation queue initially.
7. **Reentrant lifecycle calls:** Reject only same-plugin calls or all lifecycle calls from setup/cleanup? Recommendation: reject all; static dependencies belong in `requires`, and allowing reentrancy undermines planning determinism.
8. **Descriptor stylesheet convenience:** Remove from descriptor entirely or retain as sugar compiled into an owned registration. Recommendation: decide in Phase 2B after shared/ref-counted stylesheet ownership is specified.
9. **Map ownership on `app.destroy()`:** Destroy a map created by `createDefaultTiliaApp`, but not necessarily a caller-supplied map. This belongs to app/core lifecycle but must be settled before implementation.
10. **Photo entries on Photo uninstall:** remove, block uninstall, or otherwise dispose/transfer. This is not a runtime graph decision, but Phase 2B/entry design must select one to satisfy no-stale-plugin-state.

No Phase 0 principle needs reversal based on this investigation. One refinement is important: “runtime-resolvable dependencies” cannot mean arbitrary external code discovery. It means automatic installation of dependencies already known to an explicit, trusted resolver/catalog.

## 29. Files and Symbols Consulted

- `plugin-architecture/DESIGN.md` — Phase 0 principles and validation cases.
- `plugin-architecture/PHASE-1-INVENTORY.md` — current factual baseline and Phase 2 inputs.
- `src/app.js` — `assertPluginId`, `resolvePluginModule`, `resolvePlugin`, `createPluginLoader`, `normalizeConfiguredPlugin`, `normalizePluginStylesheets`, `createTiliaApp`, `app.use`, `app.unuse`.
- `src/builtins.js` — all current descriptors, `definePlugin`, eager `builtins` registry.
- `src/core/boot.js` — current core construction, input handlers, entry lifecycle, async/domain cleanup pressures.
- `src/core/input-registry.js`, `input-processing.js`, `remote-url-import.js` — owned registration and async cancellation evidence.
- `src/core/selection-hub.js`, `interaction-hub.js` — subscription/lifecycle evidence.
- `src/ui/styles.js`, `surfaces.js` — stylesheet and UI ownership/rollback evidence.
- `src/map/base.js`, `controls.js`, `layers.js` — contribution, control, layer, and map teardown evidence.
- `src/plugins/input/file-import.js`, `dropzone.js`, `url-import.js`, `query-import.js` — representative transport/plugin lifetimes.
- `src/plugins/ui/panel.js`, `layers-control.js`, `settings-panel.js`, `elevation-panel.js`, `status-control.js`, `base-map-control.js` — dependency, service, subscription, timer, and control lifetimes.
- `plugins/x-track-editor/loader.js` and helper modules — complex external lifecycle/session resources.
- `plugins/x-route-search/loader.js`, `x-milestone/loader.js`, `x-gpx-export/loader.js`, base-map provider loaders — async work and reversible-contribution pressures.
- `tests/plugin-lifecycle.test.js` — current duplicate/pending/use/unuse/service/stylesheet expectations.
- `tests/builtins.test.js`, `tests/builtin-control-cleanup.test.js`, `tests/status-optional-plugins.test.js` — built-in dependency and cleanup expectations.
- `tests/x-track-editor-*.test.js`, `tests/smoke/editor.spec.js` — editor lifecycle behavior.
- `docs/API.md`, `docs/PLUGIN-OPERATIONS.md` — current documented operational contract.

---

No source code was modified. This design investigation created only `plugin-architecture/phase-2/RUNTIME-DESIGN.md`. Final verification passed: **37 unit-test files / 336 tests passed**, and **28/28 Playwright smoke tests passed**.
