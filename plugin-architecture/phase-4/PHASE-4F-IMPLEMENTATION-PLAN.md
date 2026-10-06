# Phase 4F — Rendering and Interaction Foundation
## Revised Implementation Plan — Review Only

### 1. Deliverable and task boundary

This is a complete replacement for the previous Phase 4F plan.

Intended document:

```text
plugin-architecture/phase-4/PHASE-4F-IMPLEMENTATION-PLAN.md
```

This revision was returned for review and subsequently saved to the path above at the user's request. The only repository change is this plan document. No production implementation or test was changed, no commit was made, and Phase 4G was not started.

The revised policy supersedes the previous immediate-hide choice: **obsolete rendering normally remains display-only while its replacement prepares, then is retired on definitive replacement failure.**

### 2. Normative baseline and verification evidence

Accepted HEAD remains:

```text
67273822a6935ca6759db1544bdc752afd860364
feat: establish Phase 4E semantic selection foundation
```

Authority order:

1. `ARCHITECTURE.md`.
2. `MIGRATION-PLAN.md`.
3. Accepted Phase 4A–4E contracts and implementation.
4. Historical design records.

This revision rechecked the rendering, interaction, ownership, publication, selection, pane, uninstall and failure clauses against current code.

Verified facts:

- Domain keys use validated object identity; their strings are diagnostic identifiers.
- EntryStore excludes entries from lookup before final removal notification.
- Phase 4E selection invalidation runs before entry-scope cleanup.
- Selection candidates are bound to their issuing scope, checked when queued requests execute.
- Scope closure synchronously revokes the scope tree before asynchronous cleanup.
- Children created beneath active scopes are immediately active.
- Scope commit accepts only uncommitted scopes.
- Cleanup waits only for explicitly awaitable tracked work.
- PluginRuntime quarantine follows failed scope cleanup.
- Current MapFacade attaches layers immediately.
- Current pane support does not implement the complete normative band/lease policy.
- No target primary renderer exists.
- The legacy Interaction Hub remains disconnected.
- Public `app.destroy()` is absent.

The previous investigation actually ran:

| Check | Previously measured result |
|---|---|
| Unit suite | 52 files, 468 tests passed |
| Full smoke suite | 6 passed, 27 failed |
| Phase 4B–4E smoke gates | Passed |
| Base-map product smoke | Passed |

**Tests were not rerun for this revision.** HEAD is unchanged. The review revision ran read-only inspection, `git diff --check`, and working-tree checks; the working tree was clean before this document was saved.

### 3. Current-state investigation and classification

| Component | Verified classification | Phase 4F treatment |
|---|---|---|
| EntryStore, DomainRegistry, semantic root | Active target architecture | Extend through private lifecycle collaboration |
| SelectionStore and coordinator | Active semantic selection authority | Preserve contracts |
| GPX/Photo domain providers | Enabled semantic implementations | Keep active; no rendering migration |
| PluginRuntime, PluginContext, Scope | Active target foundations | Reuse |
| Typed services, inputs, contributions, subscriptions | Active target foundations | Reuse applicable patterns |
| MapFacade and base maps | Active map infrastructure | Add required generic rendering capabilities |
| Target renderer registry/controllers/generations | Not implemented | Establish in 4F |
| Legacy overlay and popup helpers | Retained, disconnected from semantic composition | Preserve for later slices |
| Legacy Interaction Hub | Retained; direct tests import it | Keep disconnected until 4H |
| Selection Hub | Deleted in 4E | Do not restore |
| Layers/settings/elevation and transport UI | Disabled legacy code | Defer |
| Export/route-search/editor/milestone integration | Disabled legacy code | Defer to 4J |
| Independent domain calculations and editor draft logic | Reusable domain/session logic | Leave unchanged |
| Product smoke and legacy samples | Restoration milestones | Preserve without compatibility bridges |

The existing six-plugin enabled set remains unchanged.

### 4. Objective and invariants

Phase 4F establishes the only supported target path for primary rendering and generation-owned interaction.

Required invariants:

- Semantic existence, revision, visibility and selection remain independent of rendering.
- One optional primary renderer exists per typed domain identity.
- Providers and renderers are separate registrations.
- One app-owned controller exists per committed entry, including headless entries.
- Each generation has one destination-owned scope.
- Stale rendering cannot dispatch semantic interaction or resolve current presentation.
- A display-only fallback is never current rendering authority.
- Replacement never publishes a partially constructed generation.
- No raw foreign-layer publication, legacy bridge, global refresh or ownership transfer.
- Rendering failures never roll back committed semantic operations.

### 5. Rendering authority model

Maintain four explicitly separate categories:

| Category | Meaning | Authority |
|---|---|---|
| Current generation | Successful, healthy projection of current semantics | May interact/present when effectively visible |
| Pending candidate | Attempt preparing current requested input | Cannot interact/present |
| Display-only fallback | Previous successful projection of an obsolete revision | Display permission only |
| Cleanup residual | Effect that could not be completely removed | No display, interaction or presentation permission |

A resource physically remaining after failed removal is a residual, not a fallback.

The controller may retain immutable build inputs temporarily. It must reread EntryStore for reconciliation and publication; it must not maintain a semantic shadow model.

### 6. DomainRendererRegistry

```ts
interface RendererRegistrationFacade {
  register(
    domain: DomainKey,
    definition: DomainRendererDefinition
  ): Readonly<{
    domain: DomainKey;
    registrationId: string;
    dispose(): Promise<void>;
  }>;
}
```

Internal operations:

```ts
resolve(domain): LiveRendererRegistration | null;
subscribe(scope, listener, options): SubscriptionHandle;
inspect(): readonly RendererRegistrationDiagnostic[];
```

Rules:

- Reuse `assertDomainKey()` and exact key identity.
- Assign never-reused app-local registration IDs.
- Capture supported hooks into a frozen internal definition.
- Stage through accepted runtime plumbing.
- Preflight duplicate active and staged registrations.
- Commit synchronously without callbacks.
- Notify only after plugin activation.
- Withdrawal immediately changes lookup authority, independently of physical index cleanup.
- Abort and disposal share one withdrawal transition.
- Reinstall allocates a new exact registration identity.
- Provider presence is not a registration prerequisite.
- Renderer registration acquires no provider lease.
- Raw definitions remain internal.

Diagnostics sort by domain diagnostic ID; entry reconciliation uses EntryStore insertion order.

### 7. Provider and renderer separation

A semantic entry retains its exact provider registration and accepted provider lease.

Renderer lookup is optional and dynamic. Controllers may attach a newly available renderer without semantic recreation.

Renderer-only uninstall remains permitted with live entries. A combined provider/renderer plugin remains subject to its provider leases and hard dependency guards.

No renderer teardown cascades into semantic deletion.

### 8. Renderer definition and build input

```ts
interface DomainRendererDefinition {
  build(input: RenderInput):
    PreparedRenderDescriptor | Promise<PreparedRenderDescriptor>;

  planChange?(input: RenderChangeInput):
    "replace" | "update" | "none";
}

interface RenderInput {
  readonly entryId: number;
  readonly domain: DomainKey;
  readonly semanticRevision: number;
  readonly semanticSnapshot: ImmutablePlainData;
  readonly visible: boolean; // Initial value, not publication authority.
  readonly scope: Scope;
  readonly signal: AbortSignal;
  readonly currency: RenderCurrency;
  readonly map: GenerationMapFacade;
  readonly resources: GenerationResourceCapability;
  readonly interactions: GenerationInteractionFacade;
  readonly selection: GenerationSelectionCapability;
}
```

The renderer is a registered definition; `build()` creates one generation-specific closure/resource set.

Do not pass mutable stores, provider instances, private provider hooks, app objects, runtime objects, legacy entries, Hubs or refresh capabilities.

Additional domain-specific queries must be acquired explicitly by the renderer plugin and remain guarded. Generic infrastructure must not discover or interpret them.

### 9. Prepared descriptor and generation-local access

```ts
interface PreparedRenderDescriptor {
  readonly presentation?: RendererPresentationHooks;

  // Captures this generation's private resources.
  prepareUpdate?(input: RenderUpdateInput): PreparedRenderUpdate;
}
```

`prepareUpdate()` belongs to the generation descriptor rather than receiving another generation’s layers. Its closure provides access to the resources that this renderer itself created.

That closure permits only the existing-resource property changes defined in §§23–25. It does not authorize acquisition, attachment, binding registration or publication of additional effects during an update. `RendererPresentationHooks` is defined in §33; `GenerationInteractionFacade` is defined in §27.

The descriptor contains no publicly accessible resource handles. All acquired resources must already have cleanup ownership; returning a descriptor is not ownership registration.

### 10. RenderingCoordinator

The coordinator:

- Observes committed entry lifecycle and renderer availability.
- Creates one controller per committed entry.
- Reconciles existing entries at startup and renderer installation.
- Routes revision, visibility, withdrawal and removal transitions.
- Exposes guarded status, retry and presentation queries.
- Owns no domain policy.

Subscribe before initial reconciliation, reconcile in insertion order, and deduplicate by entry ID.

A build for one entry must not block unrelated entries. Build completion enters the coordinator as token-bound work rather than defining operation order through Promise timing.

### 11. EntryRenderController

```ts
interface ControllerState {
  entryId: number;
  domain: DomainKey;
  observedRevision: number;
  visible: boolean;
  rendererRegistration: ExactRendererRegistration | null;

  current: RenderGeneration | null;
  pending: RenderGeneration | null;
  fallback: RenderGeneration | null;

  nextGenerationSequence: bigint;
  status: RenderStatus;
  lastFailure: ErrorSummary | null;
  residuals: readonly CleanupDiagnostic[];
}
```

Internal operations:

```ts
reconcile(change?);
requestBuild(reason);
applyVisibility(visible);
withdrawRenderer(exactRegistration);
invalidateEntry();
close();
```

Controller state is rendering bookkeeping. It is never stored on the semantic entry.

### 12. RenderGeneration identity and lifetime

Each build receives a monotonically allocated controller-local opaque token. Token allocation uses `BigInt`; diagnostic serialization uses strings.

A generation records:

```ts
{
  token,
  builtFromSemanticRevision,
  exactRendererRegistration,
  destinationScope,
  phase,
  attachments,
  bindings,
  descriptor
}
```

Possible roles/phases include preparing, mounting, current, display-only, retiring and closed.

Fallback retains its original token. Becoming fallback does not allocate a new token or modify semantic revision.

### 13. Currentness predicates

Candidate currentness requires:

```text
rendering root, controller and generation are alive
AND entry is active in EntryStore
AND exact renderer registration is current and live
AND entry revision equals candidate revision
AND controller.pending identifies this candidate
```

Current rendering authority additionally requires:

```text
controller.current identifies this generation
AND builtFromSemanticRevision equals current entry revision
AND generation is healthy
```

Interaction and map presentation additionally require committed whole visibility and domain-target effective visibility.

Fallback permission requires:

```text
controller.fallback identifies this generation
AND a current replacement attempt is preparing
AND entry and exact renderer registration remain live
AND visibility permits display
AND no definitive failure has retired this fallback
```

Fallback permission never satisfies current rendering authority.

### 14. Status and diagnostics

```ts
interface RenderStatus {
  entryId: number;
  domain: DomainKey;
  state: "unavailable" | "building" | "active" | "failed";
  visible: boolean;
  semanticRevision: number;

  currentToken: string | null;
  currentRevision: number | null;
  pendingToken: string | null;
  pendingRevision: number | null;
  fallbackToken: string | null;
  fallbackRevision: number | null;
  fallbackDisplayed: boolean;

  lastFailure: ErrorSummary | null;
  cleanupResidualCount: number;
}
```

Interpretation:

- `building` may coexist with a same-revision current generation or an obsolete display-only fallback.
- A fallback is reported only in fallback fields; `currentToken` is null for it.
- `active` includes a healthy hidden generation; hidden does not mean semantically stale.
- `failed` means required rendering failed with no healthy current generation.
- `unavailable` means no live renderer is available.
- Terminal subsystem operations reject; termination does not publish a final status event.

Residual diagnostics never claim resources are valid rendering and never expose raw resources.

### 15. Semantic revision advancement and fallback retention

On a newer committed semantic revision:

```text
commit semantics and Phase 4E reconciliation
→ synchronously revoke old interaction authority
→ invalidate old presentation handles and highlight operations
→ clear current rendering authority
→ retain previous successful resources as display-only fallback
→ supersede any obsolete pending candidate
→ prepare replacement from current semantic truth
```

Keep at most one fallback. Across rapid revisions, the same fallback may remain display-only while successive candidates supersede one another.

If no successful previous generation exists, there is no fallback.

Normative basis: `ARCHITECTURE.md` §29 expressly permits stale visual-only fallback. The requested policy is compatible with it.

### 16. Resource capability

```ts
interface GenerationResourceCapability {
  own<T>(
    value: T,
    dispose: (value: T) => void | Promise<void>,
    options?: { label?: string; retry?: "never" | "safe" }
  ): OwnedResource<T>;

  acquire<T>(
    factory: (signal: AbortSignal) => T | Promise<T>,
    dispose: (value: T) => void | Promise<void>,
    options?: {
      label?: string;
      retry?: "never" | "safe";
      settlement?: "detach" | "await";
      cancel?: () => void;
    }
  ): Promise<OwnedResource<T>>;

  stageEffect(effect: GenerationStagedEffect): DisposableHandle;
}
```

`OwnedResource<T>` is private to the creating renderer and contains its value and idempotent early-disposal handle. It is not presentation output.

Rules:

- Register cleanup synchronously before returning an owned value.
- Recheck currency after ownership registration.
- Register an acquisition ticket before invoking an asynchronous factory.
- Factories must not publish visible effects.
- Factories must clean their own partially acquired values if they throw before returning a value.
- Default settlement is `"detach"` and default retry is `"never"`.
- `"await"` is explicit and appropriate only for work whose settlement is required and cooperatively bounded.
- Cancellation callbacks remain synchronous, as required by Phase 4A.

These are build-time resource capabilities, not update capabilities. In-place update hooks receive none of them. Retained build capabilities must reject acquisition/registration/staging while update hooks execute; after initial publication, publication-dependent additions are rejected and require replacement. This is supported-API enforcement, not a sandbox for directly captured JavaScript objects.

### 17. Staged effect and attachment contracts

```ts
interface GenerationStagedEffect {
  readonly label: string;
  preflight(): void;
  mount(): void;
  withdraw(): void;
  dispose(): void | Promise<void>;
  readonly retry?: "never" | "safe";
}

interface OwnedAttachment {
  readonly id: string;
  dispose(): Promise<void>;
}
```

`withdraw()` synchronously attempts to suppress/remove visible effects or listener dispatch. `dispose()` releases remaining resources.

The generation-local publication ledger:

- Registers one scope-owned cleanup obligation per effect immediately.
- Assigns deterministic acquisition order.
- Seals before publication.
- Runs all preflights before mounting.
- Marks an effect as mount-attempted before calling `mount()`.
- Rolls back all mount-attempted effects in reverse order.
- Does not mark cleanup successful before callbacks succeed.
- Continues after failures.
- Retains retry policy and failure details.

The initial publication ledger remains sealed for the generation's remaining lifetime. In-place updates cannot reopen it, append effects, or alter its registration structure. If a change needs new resources, attachments, bindings, pane leases, subscriptions, tasks or staged effects, it must use generation replacement. No update-specific effect batch or transaction engine is introduced.

Reuse the accepted staged-record protocol and Scope cleanup semantics. Do not recommit an active child scope or introduce a public universal transaction engine.

### 18. Publication and synchronous reentrancy

Replacement transaction:

```text
reserve token and scope
→ build and own resources
→ seal candidate effects
→ preflight descriptor, effects and currency
→ enter rendering publication barrier
→ mount using committed visibility
→ recheck currency after every external hook
→ reconcile attachment visibility if it changed during mounting
→ perform final currency and applied-visibility checks
→ activate candidate and deactivate previous generation atomically
→ publish status
→ retire previous resources best-effort
```

Checks are required after renderer hooks, resource registration hooks and each mount because synchronous callbacks can withdraw registration or terminate lifetime.

If final visibility differs from the visibility actually applied to attachments, do not activate. Roll back the candidate as a publication failure; preserve committed visibility.

Target interaction callbacks generated during mounting are suppressed, not replayed later as user intents.

External raw Leaflet callbacks cannot be universally suppressed. They are contained through post-hook revalidation. No JavaScript sandbox guarantee is made.

This transaction publishes a newly built generation only. Safe property updates use the restricted synchronous hooks in §§24–25 without modifying this sealed ledger; registration-structure changes always create a replacement generation with its own initial ledger.

### 19. Definitive candidate failure versus superseded failure

A failure may affect controller state only while the failing candidate still owns the pending attempt identity.

Current candidate build, acquisition, descriptor validation, preflight or publication failure:

```text
verify failing candidate still owns pending attempt
→ revoke candidate authority
→ roll back partial candidate effects
→ revoke and withdraw obsolete fallback display
→ retire candidate and stale fallback
→ report failed status if no healthy current generation remains
```

A superseded completion or rejection:

```text
identity no longer matches
→ clean only that attempt's resources
→ record cleanup diagnostics if needed
→ do not alter current, pending, fallback or public failure status
```

Do not await old cleanup before starting an unrelated newer candidate. Residuals remain private and powerless.

### 20. Retry and same-revision rebuild

`retry(entryId)` reads current semantic truth and starts a new token. It never restores an obsolete fallback retired after failure.

For a same-revision rebuild, the previous generation may remain current while the candidate prepares.

On candidate failure, retain that previous generation only if:

- Its revision still matches EntryStore.
- Its exact renderer registration remains current.
- Entry, controller and generation lifetimes remain valid.
- The generation is healthy.
- Its attachments match committed visibility.
- Interaction/presentation guards reflect current visibility.

A healthy hidden generation may remain current but has no map interaction/presentation authority.

Do not add automatic retry loops. Cleanup retry and render retry are distinct.

### 21. Visibility during preparation and fallback

Whole-entry visibility changes neither revision nor generation token.

During preparation:

- Update the controller’s latest committed boolean.
- Apply it to an existing healthy current generation or display-only fallback.
- Do not start another candidate.
- Activate the candidate only with latest successfully applied visibility.

For fallback:

- Hiding withdraws fallback display.
- Showing may reattach it only while replacement is still preparing and fallback permission remains valid.
- Reattachment grants display permission only.
- After definitive failure, toggling visible must not resurrect the retired fallback.

Candidate resources remain unpublished until the publication boundary.

### 22. Visibility attachment and detachment failures

Before any hide operation, close current interaction and presentation exposure authority synchronously. Physical removal follows.

For an attach or detach failure:

```text
committed semantic visibility remains unchanged
→ revoke affected rendering exposure authority
→ attempt removal of all attachments, including partial attachments
→ continue cleanup after individual errors
→ invalidate affected generation/candidate/fallback roles
→ retain physical leftovers only as residuals
→ report failed rendering when renderer remains available
```

A failed display-only fallback visibility operation also invalidates the current replacement attempt and retires fallback permission. This avoids continuing with contradictory display bookkeeping.

Subsequent visibility toggles update semantic/controller visibility but **do not recover a failed generation**. Recovery requires explicit retry or another normal rendering trigger, such as a new semantic revision or renderer reinstallation.

Restore interaction/presentation only after a healthy generation has current revision/registration/lifetimes and all required attachments successfully match committed visibility.

### 23. In-place updates: normative scope decision

Safe in-place update support remains in Phase 4F.

Reason: the migration plan’s Phase 4F section explicitly includes:

- A safe in-generation update contract.
- Validated in-place revision advancement tests.

Although `ARCHITECTURE.md` permits renderers to choose replacement, deferring the generic update contract would omit an explicit Phase 4F migration responsibility.

Production renderers may always return `"replace"`. No production domain update optimization is implemented in 4F.

The selected Phase 4F boundary is **safe changes to properties of existing generation-owned resources only**. A synchronous style or coordinate setter qualifies only if the same resource objects, attachment registrations, binding registrations and target mapping remain valid, and the mutation is nonthrowing after preflight or reliably rollbackable. A setter that creates additional renderer-owned objects, listeners or other effects does not qualify.

Adding/removing/replacing owned resources, changing group membership or attachment registrations, changing physical event targets/listeners/resolvers, acquiring/releasing pane leases, registering subscriptions/tasks, or adding staged effects requires replacement. A domain-visibility change that needs membership changes therefore uses replacement; it is not admitted merely because it can be performed synchronously. Whole-entry visibility remains the separate host-managed attach/detach contract in §§21–22.

Existing binding resolvers must obtain current revision/snapshot through host-supplied dispatch input (§27), rather than requiring replacement of a revision-capturing resolver closure. Changes that invalidate the existing target mapping require replacement. Host-managed renewal of scope-bound interaction/presentation authority is permitted under §25 and is not renderer registration of new bindings.

### 24. Complete update contract

```ts
interface RenderChangeInput {
  readonly entryId: number;
  readonly previousRevision: number;
  readonly revision: number;
  readonly snapshot: ImmutablePlainData;
  readonly change: ImmutablePlainData;
}

interface RenderUpdateInput extends RenderChangeInput {
  readonly token: string;
  readonly visible: boolean;
}

interface PreparedRenderUpdate {
  readonly mode: "nonthrowing" | "rollbackable";
  readonly nextPresentation: RendererPresentationHooks | undefined;
  preflight(): void;
  commit(): void;
  rollback(options: { restoreDisplay: boolean }): void;
}
```

Rules:

- Definition `planChange()` is synchronous and side-effect-free.
- The host supplies frozen `RenderChangeInput` and `RenderUpdateInput` records containing immutable snapshots/change descriptors.
- Default strategy is replacement.
- `"update"` and `"none"` require the generation’s `prepareUpdate()` hook.
- Preparation and preflight do not mutate visible resources.
- Preparation may compute plain rollback data and proposed property values only. It cannot acquire/register resources, attachments, bindings, pane leases, subscriptions, tasks or staged effects, and cannot change their registration structure.
- `"none"` permits no resource mutation; it still requires preflight validating target mapping and presentation for the new revision.
- `nextPresentation` explicitly replaces the generation’s presentation hooks on success.
- Hooks returning Promises violate the update contract.
- No ownership transfer occurs; the existing resource objects and their ownership/cleanup registrations remain unchanged.
- Commit must be nonthrowing after preflight or reliably rollbackable.

The generation descriptor closure accesses its own resources. Generic infrastructure never supplies foreign resources.

`RenderUpdateInput` exposes immutable semantic input, token and visibility only: no Scope, resource, map, interaction or selection mutation capability. During every update hook, retained build-time acquisition/registration/staging APIs reject with `RENDER_UPDATE_OPERATION_FORBIDDEN`; they must not partially register an effect before rejecting. Detecting that violation invalidates the prepared update and selects replacement even if renderer code catches the error. This requires only an update-hook execution guard in the existing capabilities, not an effect batch or transaction engine.

Directly captured Leaflet objects cannot be sandboxed. Renderer definitions contractually obey the same restriction when using their own closures. A change whose safe implementation needs additional effects must return `"replace"`; it must not emulate those operations outside the supplied capabilities.

Replacing `nextPresentation` changes private pure resolver metadata only. It cannot register effects or execute a highlight. Actual controlled highlighting occurs later in a presenter-owned scope under §33, outside the update hooks.

### 25. Update execution, invalidation and rollback

At semantic revision advancement, invalidate old interaction-authority and presentation-exposure children even if the generation token will be retained.

```text
capture token, exact registration and target revision
→ plan change
→ prepare update
→ preflight
→ revalidate after each hook
→ enter publication barrier
→ commit resource update
→ revalidate lifetimes, registration, revision and visibility
→ atomically advance builtFromSemanticRevision
   and replace presentation hooks
→ host renews interaction/exposure authority for existing registrations
→ publish active status
```

Hook exceptions:

- Planning/preparation/preflight failure: diagnose and choose replacement without semantic rollback.
- Commit failure: invoke rollback.
- Rollback success: use the restored old resources only as display-only fallback while replacement prepares.
- Rollback failure: withdraw all affected display, retain residuals, and start replacement without fallback.

The same currentness checks run after rollback. Restored properties grant display-only fallback permission only if the controller still owns that fallback and current replacement attempt. A superseded hook cannot modify newer status or authorize newer/retired resources. If rollback itself throws, remove affected display best-effort and retain residuals; do not roll back semantics.

If deletion, withdrawal, termination or superseding revision occurs during a hook, do not advance currency. Roll back with `restoreDisplay:false`; cleanup must not reattach resources belonging to an invalidated lifetime.

A successful same-token update does not revalidate old presentation handles. Handles capture token, revision and exposure lifetime; old handles remain permanently invalid.

Authority renewal is an internal host operation: existing generation-owned surfaces, physical listeners and binding records remain installed with the same IDs and registration structure. Their host wrappers consult a replaceable authority cell. After successful commit and final revalidation, the host creates fresh issuer/exposure child scopes and updates that cell. Old scopes remain dead, so queued old candidates and handles stay invalid. Renewal adds no renderer effect, listener, surface or binding to the sealed ledger. The host does not call renderer registration hooks to renew authority.

No update-specific effect batch or transaction engine is added. The renderer's prevalidated property setters and rollback function are the entire update mutation protocol. Fresh authority is published only after validated revision advancement; hidden or invalidated lifetimes do not gain interaction/presentation authority. Any rendering failure preserves committed semantic revision, visibility and valid selection.

### 26. Selection integration

```ts
interface GenerationSelectionCapability {
  getCurrent(): Selection | null;
  subscribe(listener): SubscriptionHandle;
  select(target: unknown): Promise<Selection | null>;
}
```

`select()` issues a domain candidate for the generation’s entry through the accepted Phase 4E domain facade and requests it through the same issuer scope.

Physical intents use a short-lived interaction-authority child. Close this child on:

- Revision advancement.
- Generation deactivation.
- Hide.
- Visibility failure.
- Entry removal.
- Renderer withdrawal.
- Root termination.

Queued candidates then reject through existing issuer-liveness validation. Do not change SelectionStore or its candidate contract.

Selection committed before authority loss remains valid. Rendering failure/removal never clears it. Selection changes do not increment semantic revision or rebuild primary rendering.

### 27. Interaction surfaces and ordinary plugin access

```ts
interface InteractionFacade {
  mapSurface(): InteractionSurface;

  createSurface(options: {
    id: string;
    target: OwnedDomTarget | OwnedLeafletEventTarget;
    parent?: InteractionSurface; // Defaults to this map host.
    scope?: ChildScope;          // Defaults to consumer scope.
  }): InteractionSurface;

  bind(options: InteractionBinding): DisposableHandle;
}
```

Surfaces are opaque, app-local handles. Ordinary plugins create surfaces only for resources they own. The API does not discover existing renderer objects.

Ownership checks validate scope ancestry and app identity. They are integrity checks, not proof of arbitrary JavaScript provenance.

Parent relationships are fixed at surface creation, acyclic and within the same host. Closing a parent revokes descendant dispatch authority even if a descendant owner remains alive.

The shared map-root surface is host-owned. Bindings on it remain consumer-owned.

The build-time renderer facade is narrower and fixes ownership and tier:

```ts
interface GenerationInteractionFacade {
  createSurface(options: {
    id: string;
    target: OwnedDomTarget | OwnedLeafletEventTarget;
  }): InteractionSurface;

  bind(options: {
    id: string;
    surface: InteractionSurface;
    event: SupportedPhysicalEvent; // Same adapter contract as §28.
    consume?: boolean;            // Defaults to true.
    resolve(
      event: InteractionInput,
      current: Readonly<{
        entryId: number;
        domain: DomainKey;
        semanticRevision: number;
        semanticSnapshot: ImmutablePlainData;
      }>
    ): unknown | null; // Synchronous domain target, not a raw layer/ref.
  }): DisposableHandle;
}
```

The host owns the opaque surface/binding indexes. Renderer-created surfaces are children of the map-root surface, owned by the generation scope; their bindings use the object tier and cannot supply another owner scope. The target must be a resource owned by this generation. No foreign resource discovery or publication is provided.

Both registration methods are available only during build preparation before the ledger is sealed, never during an in-place update. The same binding records/listeners remain in use after a safe update. Dispatch consults the host authority cell and supplies the latest committed revision and snapshot only after currentness/effective-visibility checks. The host rechecks those predicates after `resolve()`, creates the Phase 4E candidate through the current issuer scope, and submits semantic selection intent. A null target performs no selection action and does not consume the occurrence. A resolved target uses the binding's synchronous consume policy before submitting the request. Resolution exceptions and rejected requests follow §29; raw physical targets stay private.

### 28. Modal applicability and dispatch structure

```ts
interface InteractionBinding {
  id: string;
  surface: InteractionSurface;
  event: SupportedPhysicalEvent;
  tier: "modal" | "object" | "background";
  scope?: ChildScope;

  handle(input: InteractionInput): InteractionDecision;
}

type InteractionDecision =
  | { consume: false }
  | { consume: true; run?: () => void | Promise<void> };
```

Modal binding on a surface applies to occurrences originating at that surface or descendants. A modal binding on the map root covers all target-managed map surfaces. A session activates/deactivates modal applicability through its binding scope.

Every object listener calls the host dispatcher **before executing its object action**. The dispatcher collects applicable ancestor modal bindings itself; it does not wait for a later map bubble event.

Dispatch order:

1. Applicable modal bindings, deepest surface first.
2. Object binding for the originating physical surface.
3. Background binding on the map root.

Within one surface/event/tier, permit only one primary binding. Across ancestors, depth defines order. There is no installation-order tie-breaker.

No arbitrary global broadcast or raw-layer discovery is involved.

### 29. Consume decisions and asynchronous handlers

`handle()` must return an `InteractionDecision` synchronously.

- A consumed decision suppresses lower target-managed tiers immediately.
- Invoke optional `run()` only after consume state is recorded and authority is rechecked.
- `run()` may return a Promise; attach a rejection handler immediately.
- Promise fulfillment or rejection does not retroactively change consume.
- A Promise returned directly by `handle()` is a contract error. Observe rejection, consume the occurrence defensively, and diagnose.
- A thrown decision-handler error is diagnosed and consumes the occurrence defensively to avoid unintended background action.

Generation target resolution occurs under currentness/visibility guards. Recheck before candidate issuance and submission.

Async continuations must use the binding’s guarded scope/currency; they cannot submit through a retained general plugin capability on behalf of a dead generation.

### 30. DOM/Leaflet occurrence identity and replacement bindings

DOM adapters use the native event object. Leaflet adapters use `originalEvent` when present, otherwise the synthetic Leaflet event object.

Occurrence bookkeeping is private and keyed by event object, physical event type and host. `preclick` and `click` are distinct occurrences.

Verified local Leaflet source delivers object-target events before later map propagation and supports `originalEvent` propagation state. Therefore modal interception must occur inside the object dispatcher, as specified above.

- Record processed/consumed tiers to prevent duplicate target-managed actions during bubbling.
- Stop native/Leaflet propagation on consume through the appropriate adapter.
- Do not use Leaflet private target indexes for discovery.
- Synthetic events without a shared carrier have separate occurrence identities.

Candidate bindings reserve conflicts and attach guarded listeners, but remain inactive until generation activation. Preflight permits explicit replacement of retiring bindings owned by the same controller; it does not exempt unrelated conflicts.

Activation atomically switches binding authority. Mount-generated events are ignored, not replayed.

### 31. MapFacade boundary

```ts
interface GenerationMapFacade {
  getViewport(): ReadonlyViewport;
  project(point, zoom?): Pixel;
  unproject(pixel, zoom?): GeographicPoint;
  getPaneName(band: MapBand): string;
  attachLayer(layer, options?: { band?: MapBand; pane?: PaneLease }):
    OwnedAttachment;
  listen(type, listener): DisposableHandle;
}
```

Generation attachments/listeners are staged. Core adapters supply reversible attachment operations; renderers create their own geometry.

Do not automatically expose raw map access, control mounting or viewport mutation commands to build input.

Preserve the existing advanced plugin escape hatch for caller-owned effects. It does not authorize foreign renderer access.

No Photo/GPX-specific MapFacade methods are added.

### 32. Pane bands and private leases

The architecture §36 defines band ordering. The migration plan explicitly includes bands/private leases in 4F.

Implement the minimum:

| Band | z-index |
|---|---:|
| Base infrastructure | 200 |
| Domain geometry | 400 |
| Domain markers | 600 |
| Derived overlays | 620 |
| Selection presentation | 640 |
| Modal/session overlays | 660 |

Keep Leaflet popup and shell UI above these bands.

- Namespace app panes by instance.
- Create band panes lazily so headless map stubs remain valid.
- Renderer resource order within a band must be explicit and deterministic.
- Do not introduce cross-plugin numeric priority.
- Do not create per-generation band panes.
- Private panes use a namespaced `(owner, name, band)` identity and balanced leases.
- Conflicting definitions reject.
- Final lease removes only the manager-created pane.
- A lease supplied to a generation must be generation-owned.
- Never delete caller-owned panes.

Defer arbitrary z-order negotiation and editor-specific pane machinery.

### 33. Presentation contract and controlled highlights

```ts
interface RendererPresentationHooks {
  anchor?(ref: unknown): GeographicPoint | null;
  bounds?(ref?: unknown): GeographicBounds | null;
  highlightDescriptor?(ref: unknown): ImmutablePlainData | null;
  highlight?(
    ref: unknown,
    context: RendererHighlightContext
  ): void | Promise<void>;
}

interface RendererHighlightContext {
  readonly scope: ChildScope; // Presenter-owned highlight child.
  readonly signal: AbortSignal;
  readonly isCurrent: () => boolean;
  readonly map: PresenterHighlightMap;
}

interface PresenterHighlightMap {
  getPaneName(band: "selection"): string;
  attachLayer(layer): OwnedAttachment;
}

interface PresentationHandle {
  readonly token: string;
  readonly revision: number;
  readonly anchor: GeographicPoint | null;
  readonly bounds: GeographicBounds | null;
  readonly highlightDescriptor: ImmutablePlainData | null;

  isCurrent(): boolean;
  highlight(options: { scope: ChildScope }): Promise<DisposableHandle>;
}
```

These are private renderer hooks called only through guarded presentation resolution, never public access to a renderer implementation. `GeographicPoint` is `{lat:number, lng:number}`; `GeographicBounds` is `{southWest:GeographicPoint, northEast:GeographicPoint}`. The host validates finite latitude/longitude values within geographic ranges and returns copied/frozen records. Anchor, bounds and descriptor hooks are synchronous and side-effect-free, returning immutable data or null. They must not return Leaflet objects.

The highlight hook may create independent presenter-owned resources only when invoked through a current `PresentationHandle`, not during an update. The host creates the highlight child beneath the supplied presenter scope and binds its currency to the captured registration/token/revision/exposure lifetime. `PresenterHighlightMap` attaches immediately in the selection band, registers cleanup before attachment, rechecks currency around attachment, and cleans partial effects. Its attachment ownership belongs to the highlight child, not the primary generation's ledger. Other highlight resources require cleanup registration in that same child scope. Invalidation closes the child; async hooks must use guarded operations or explicitly clean late acquired values as in §36. Hook failure closes the child and leaves primary rendering and semantic selection intact.

`resolve(entryId, ref)` returns null for fallback, hidden, failed, unavailable or stale rendering.

Each handle captures:

- Exact registration.
- Generation token.
- Semantic revision.
- Consumer lifetime.
- Generation exposure lifetime.

Invalidation permanently closes exposure authority; unhide or same-token update creates fresh authority and does not revive old handles.

Controlled highlight support remains because the migration plan explicitly requires it. Implement only guarded presenter-owned child resources and fake-hook tests. No standard highlight UI is added.

Highlights lose authority and are withdrawn on revision advancement, hide, replacement, deletion, withdrawal or termination.

### 34. Bounds, anchor and fit separation

- Semantic extent stays a domain query.
- Renderer bounds describe current rendered presentation.
- Anchor/bounds output is immutable geographic data.
- Fit/pan commands belong to caller/presenter MapFacade.
- Do not scan overlays or restore `fitMapToGroup()` as correctness coordination.
- Prefer independent highlight geometry.
- Controlled hooks cannot expose or arbitrarily mutate foreign primary layers.
- Popup, automatic fit, elevation and standard presentation consumption remain deferred.

### 35. Ownership hierarchy and dual-lifetime obligations

```text
application foundations
└── rendering root
    └── entry controller
        └── generation
            ├── interaction-authority child
            ├── presentation-exposure authority
            ├── attachments/bindings/resources
            └── acquisition tickets/tasks

semantic entry scope
└── controller-close obligation

renderer plugin scope
├── staged registration
└── registration-lifetime child
    └── affected-generation-close obligation

presenter scope
└── highlight child
```

Rendering root owns controllers/generations. Entry and registration obligations await idempotent closure; they do not own the resources again.

Register the entry obligation after provider-instance cleanup so LIFO closes rendering first.

Registration-lifetime child cleanup runs before plugin setup-return cleanup, preventing premature destruction of renderer dependencies.

No detach/adopt/transfer API is added.

### 36. Non-cooperative work, closure and late cleanup

Closure waits for:

- Existing resource/listener/pane disposal.
- Explicitly awaitable acquisition/work.
- Cleanup already in progress for fulfilled resources.
- Controller/generation closure obligations.

Closure does not wait for arbitrary detached build/acquisition Promises.

For a detached acquisition:

- Register its acquisition ticket under the generation scope before starting work.
- The ticket retains disposal responsibility for that exact eventual value.
- Closing marks the ticket retired and prevents publication.
- Late success invokes disposal directly; it does not register a new resource in a dead scope.
- The ticket remains attributed to its original owning scope; diagnostics retention does not transfer ownership.
- Late failure/rejection is observed.
- Late disposal failures enter a rendering-subsystem residual ledger with entry/token/registration/scope IDs and retry policy.
- Internal cleanup retry retries only explicitly safe failed disposals.

A detached disposer must remain usable after plugin teardown and must not require a now-dead service/provider capability. Otherwise that acquisition must use bounded awaitable settlement.

Failures discovered during plugin teardown propagate through registration cleanup and produce accepted runtime quarantine.

Failures first discovered after completed teardown are rendering residual diagnostics; **do not retroactively rewrite PluginRuntime state or quarantine a newly installed instance**. Report them through the internal cleanup ledger and explicit cleanup retry. This limitation is documented rather than hidden by a new runtime protocol.

### 37. EntryStore hooks, startup and reentrancy

Fixed private collaborator:

```ts
interface EntryRenderingLifecycle {
  afterCreated(record): void;
  afterDomainCommit(record, change): void;
  afterVisibilityCommit(record): void;
  afterLogicalRemoval(record): void;
}
```

Composition supplies it before entries can be created. EntryStore imports no renderer implementation.

- Creation hook establishes controller and cleanup obligation before public notification.
- Domain hook revokes old authority before public domain notification.
- Visibility hook updates guards before notification.
- Logical removal preserves Phase 4E invalidation and revokes rendering before resource disposal.

Hooks isolate rendering errors and cannot undo a completed semantic transaction. Build work starts outside semantic notification delivery.

Use an operation FIFO and publication barrier. Authority loss is synchronous even when subsequent work is queued. Notification/reporting failures cannot roll back commits or stop peer cleanup.

### 38. Entry deletion and renderer withdrawal races

Entry deletion:

```text
remove public semantic lookup
→ Phase 4E selection invalidation
→ revoke controller/current/pending/fallback permission
→ synchronously attempt visible withdrawal
→ await registered rendering cleanup
→ provider-instance cleanup and lease release
→ final removed notification
```

Old callbacks already fail entry lookup during selection notification.

Renderer withdrawal:

```text
registration unavailable
→ revoke all affected generation and fallback authority
→ synchronously attempt candidate/fallback/current withdrawal
→ cancel/close generations
→ registration cleanup completes or reports failure
```

If withdrawal occurs during publication, post-hook checks prohibit activation. Cleanup targets only captured resources, never a newer generation.

### 39. Reinstall while old work or cleanup exists

- Runtime `use()` waits for in-progress same-plugin teardown.
- Known cleanup failure keeps the old plugin quarantined; same-ID reinstall remains blocked until accepted retry-safe cleanup succeeds.
- Successful teardown may be followed by immediate reinstall even if detached old work remains pending.
- New registration and generation identities prevent old completion from changing new state.
- Old cleanup uses exact captured resources and lease handles.
- Shared pane lease counts prevent old disposal from deleting panes still leased by new work.
- Late old cleanup failure is attributed to the old identity, not the new plugin.
- Entries and semantically valid selection remain intact.

Do not weaken accepted quarantine semantics to accelerate reinstall.

### 40. Rendering-root termination

```ts
renderingFoundation.close(): Promise<CleanupReport>;
renderingFoundation.retryCleanup(): Promise<CleanupReport>;
```

At closure start:

```text
mark terminal
→ revoke callbacks, queries, retry and publication
→ revoke current/pending/fallback and highlight authority
→ synchronously attempt visible withdrawal
→ abort descendants
→ close controllers in reverse order
→ aggregate cleanup results
```

No final status event is emitted. Retained handles report non-current. Semantic entries and SelectionStore remain independently authoritative.

Late acquisition cleanup follows §36. Termination never reopens after failure.

Phase 4F completes subsystem termination. Public `app.destroy()` and app-wide ordering remain Phase 4K.

### 41. PluginContext and application integration

Proposed capabilities:

```ts
context.renderers.register(domain, definition);
context.interactions.mapSurface();
context.interactions.createSurface(...);
context.interactions.bind(...);
context.presentation.resolve(entryId, ref);
context.rendering.getStatus(entryId);
context.rendering.subscribe(listener, options);
context.rendering.retry(entryId);

app.rendering.getStatus(entryId);
app.rendering.subscribe(listener, options);
app.rendering.retry(entryId);
```

Do not expose internal roots/controllers/generations or application renderer-registration authority.

Use existing named capability factories. Internal composition returns host-owned foundation handles for legitimate lifecycle integration; public factories delegate to that same composition.

The foundation smoke may use the internal composition handle to terminate rendering without public destruction or a test-only getter.

### 42. Failure and race matrix

All rendering rows retain committed semantics and Phase 4E selection unless an independent semantic deletion/reconciliation invalidates them.

| Situation | Current authority | Pending | Fallback/display | Required result |
|---|---|---|---|---|
| Initial success | Establish candidate | Complete | None | Active |
| Initial failure | None | Roll back | None | Failed; semantics retained |
| Newer revision preparing | Old authority revoked | New candidate | Old display-only if visible | Building |
| Current candidate build/acquisition/preflight/publication fails | None | Close/rollback partial effects | Withdraw and retire stale fallback | Failed |
| Superseded candidate rejects/completes | Newer state unchanged | Newer attempt unchanged | Newer fallback policy unchanged | Cleanup old attempt only |
| Same-revision candidate fails | Retain only healthy matching old generation | Close | No stale fallback role | Active plus diagnostic |
| Replacement succeeds | Activate candidate with latest visibility | Complete | Revoke display and retire old | Active |
| Old cleanup fails after activation | New current retained | Complete | Leftovers are residuals | No activation rollback |
| Revision advances during update | Old authority invalid | Superseding work | Restore display only if still permitted | No stale advancement |
| Safe update succeeds | Same token, new revision and fresh authority | None | Cleared | Old handles remain invalid |
| Change needs new resources/attachments/bindings/staged effects or registration changes | Old authority revoked on semantic advancement | Build replacement with its own ledger | Existing fallback follows preparation policy | Old ledger remains sealed and unchanged |
| Update hook attempts acquisition/registration/staging | No revision advancement for that generation | Select replacement | Keep only permitted display-only fallback | Reject forbidden capability operation; no partial registration |
| Property update commit fails and rollback succeeds | Old authority remains invalid | Replace | Restored properties are display-only while preparation continues | Preserve semantics; no old handle/intent revival |
| Update rollback fails | None | Replace | Withdraw affected display | Residuals diagnosed |
| Visibility changes while preparing | Guards updated | Same candidate | Follow latest visibility | No token/revision increment |
| Attach/detach fails | Revoke affected authority | Invalidate affected attempt | Withdraw; leftovers are residuals | Failed; explicit retry required |
| Toggle after definitive failure | None | None unless another trigger | Do not resurrect | Visibility changes only |
| Retry after failure | None initially | Fresh current-truth build | No stale resurrection | New generation |
| Entry deletion | Revoke | Invalidate | Immediately revoke/withdraw | No late publication; 4E deletion rules |
| Renderer withdrawal | Revoke | Invalidate | Immediately revoke/withdraw | Headless entry; selection retained |
| Renderer reinstall | New identity | Fresh build | No old-state adoption | Current-truth rendering |
| Root termination | Revoke | Invalidate | Immediately revoke/withdraw | Terminal; late cleanup only |

### 43. Contract and integration tests

Use deterministic deferred Promises, injected failures and recorded ordering. Add individual cases for:

1. Headless entries and late renderer installation.
2. Staged registration, duplicate conflict, withdrawal and reinstall.
3. Old display remaining during newer-revision preparation.
4. Old interaction, queued selection and presentation rejection during fallback.
5. Current build failure removing fallback.
6. Current acquisition failure removing fallback.
7. Current preflight failure removing fallback.
8. Current partial publication failure removing candidate and fallback.
9. Semantic revision, visibility and valid selection surviving every render failure.
10. Superseded rejection/completion leaving newer state unchanged.
11. Failure followed by retry never resurrecting fallback.
12. Visibility changes during candidate preparation and fallback.
13. Visibility toggles after failure not recovering rendering.
14. Attach and detach failures, including partial effects and residuals.
15. Same-revision failure retaining only a healthy matching generation.
16. Safe update, `"none"` advancement and hook contract failures.
17. Same-token revision advancement invalidating old handles/highlights.
18. Update reentrancy, rollback and rollback failure.
19. Deletion and withdrawal during mounting.
20. Reinstall with detached old work pending.
21. Known cleanup failure blocking same-ID reinstall.
22. Late cleanup failure attribution and safe retry.
23. Modal interception before object execution.
24. Same-tier conflicts, synchronous consume, async rejection and event deduplication.
25. Replacement binding preflight and atomic activation.
26. Root termination, stale completion and late resource disposal.
27. Pane balancing, highlight ownership and absence of foreign resources.
28. Notification failure and reentrant command ordering.
29. A prevalidated property-only update succeeding with the same generation token, unchanged resource/listener identities and an unchanged sealed ledger.
30. Old queued intents remaining rejected after host authority renewal on same-token revision advancement; fresh intents use the existing binding with latest revision input.
31. Separate changes requiring new resources, attachments, bindings and staged effects each selecting replacement instead of an update.
32. Update input exposing no Scope, resources, map, interactions or mutation/staging capabilities; retained build capability attempts rejecting before registration, including caught violations.
33. Property-update commit failure, rollback success and rollback failure each preserving semantic revision, visibility and valid selection and obeying fallback retirement on definitive replacement failure.
34. Revision supersession, renderer withdrawal and entry deletion during planning, preparation, preflight, commit and rollback; no invalidated display or authority is restored.
35. Replacement for binding/owned-resource registration-structure changes using a new generation ledger while the old sealed ledger remains unchanged.

No new tests are implemented during this planning task.

### 44. Production smoke and existing gates

Use real production composition, active GPX/Photo semantic providers, and a minimal real Leaflet resource installed through the target registration path.

Required failure scenario:

```text
create semantic entry headlessly
→ install minimal renderer
→ establish revision R rendering
→ select a semantically valid target
→ commit revision R+1 that preserves selection
→ defer replacement
→ assert old resource remains physically displayed
→ assert old interaction and presentation are rejected
→ reject current replacement
→ assert old resource and partial candidate effects are physically absent
→ assert entry, revision R+1, visibility and selection remain
→ retry
→ assert only rendering from current truth becomes active
```

Also cover visibility, install/remove/reinstall, stale completion, deletion and internal rendering-root termination.

Fake renderer logic remains in tests and the foundation sample. No production Photo/GPX rendering or popup is introduced.

Future implementation must run full unit tests, existing 4B–4E gates, new 4F smoke, base-map smoke, full-product remeasurement and audits. The existing 27 product failures are not intentionally restored by 4F.

### 45. Files and legacy disposition

Expected additions:

```text
src/rendering/{registry,coordinator,controller,generation,presentation,errors,index}.js
src/rendering-foundation.js
src/rendering-capabilities.js
src/interactions/{host,surfaces,bindings,index}.js
src/map/{panes,generation-facade}.js
src/application-composition.js
tests/rendering-*.test.js
tests/phase-4f-production-rendering.test.js
tests/fixtures/rendering-fakes.js
tests/smoke/phase-4f.spec.js
samples/phase-4f/index.html
```

Expected modifications: application composition, semantic-foundation composition, private EntryStore lifecycle hooks, MapFacade pane integration, restricted public exports, smoke script and relevant foundation tests.

Intentionally untouched: SelectionStore/candidate contracts, semantic provider behavior, disabled product plugins, independent algorithms, product restoration tests and `PartiallyEditablePolyline`.

Legacy deletions in 4F: none currently identified.

Interaction Hub remains disconnected until 4H. Legacy Photo/GPX builders remain source material for later slices, never adapters for target entries.

### 46. Audit, implementation sequence and definition of done

Search and classify all remaining legacy/forbidden symbols, including mutable entries/layers, Hubs, refresh APIs and suspicious bridge names. Require zero unexpected violations in the reachable target graph.

Dependency gates:

- No renderer dependency from providers, EntryStore or SelectionStore.
- No GPX/Photo/EXIF/editor/elevation implementation dependency from generic rendering.
- No raw resources in semantic, selection, status or presentation output.
- No target publication through legacy Hub.

Implementation order:

1. Contract fixtures and currentness/failure expectations.
2. Registry and registration-lifetime obligations.
3. Resource tickets, staged effects and attachment rollback.
4. Controller current/pending/fallback/residual roles.
5. Visibility and replacement transactions.
6. Restricted property-only safe-update hooks and host authority renewal; registration changes use replacement, with no update effect batch.
7. Interaction surfaces/arbitration.
8. Presentation currency and controlled highlighting.
9. Pane leases and composition integration.
10. Production smoke and complete audits.

Completion requires all specified transitions and individual failure cases to pass, including physical stale-display removal after definitive replacement failure. Documentation must distinguish successful semantic operations from failed rendering and report residuals honestly.

The final review blocker is resolved only when update hooks expose no acquisition/staging capabilities, safe updates preserve the sealed registration structure, host authority renewal invalidates old handles/intents without new renderer bindings, and every resource/registration change follows the replacement path. No update-specific transaction engine is part of the implementation sequence.

### 47. Review concern mapping

| Review concern | Resolution | Sections |
|---|---|---|
| Reconfirm normative baseline | Separate inspected facts, prior test evidence and proposed extensions | 2–4 |
| Old-generation retention | Normal display-only preparation fallback; definitive failure retires it | 5, 13–15, 18–20 |
| Visibility failures | Complete attach/detach rules; toggles cannot recover failed rendering | 21–22 |
| In-place update scope | Retain migration-required property-only updates; every resource or registration-structure change uses replacement | 9, 17–18, 23–25 |
| Sealed-ledger blocker | Never reopen/append; remove update acquisition/staging capabilities and reject retained capability misuse | 16–18, 23–25 |
| Host authority versus binding registration | Renew host issuer/exposure scopes and authority cell for existing listeners/records; no ledger modification | 25–27 |
| Missing concrete hook/facade definitions | Define private presentation hooks, presenter-owned highlighting and build-only generation interaction facade | 9, 27, 33 |
| Same-token presentation validity | Capture revision and revocable exposure lifetime | 25, 33 |
| Interaction arbitration | Object dispatcher evaluates modal ancestors before object action | 27–30 |
| Resources/publication | Concrete ownership, staged effects, partial mount rollback and rechecks | 16–18 |
| Non-cooperative work | Explicit wait/detach rules and late-cleanup ledger; no retroactive runtime mutation | 36 |
| Foundation boundaries | Preserve providers, selection, scopes, typed identity and lifecycle separation | 6–13, 26, 35, 37–41 |
| Substantial extensions | Implement minimum migration-required updates, panes and highlights | 23, 32–34 |
| Required verification | Individual deterministic cases, restricted-update/unchanged-ledger cases and real Leaflet failure smoke | 42–44, 46 |
| Decisions/conflicts/assumptions | Evidence-based assessment below | 48 |

### 48. Deferred responsibilities and evidence-based assessment

Deferred unchanged:

- **4G:** Production Photo rendering, bindings, domain input/resource/UI integration.
- **4H:** Production GPX rendering/hit testing, Photo inference restoration, legacy Interaction Hub deletion.
- **4I:** Standard input transports and layers/settings/elevation/shared presentation UI.
- **4J:** Export, route search, track editor and milestone.
- **4K:** Public `app.destroy()`, application-wide teardown ordering, allowlist removal and final purge.

**Verified normative conflicts:** none found for the selected property-only update boundary, revised fallback policy or retained foundation contracts. `ARCHITECTURE.md` §28 permits in-generation mutation under target-validity/ownership/rollback conditions, and the migration plan requires safe-update support; neither requires update-time resource registration. Replacing changes outside this restricted boundary satisfies both. Immediate fallback withdrawal means immediate authority revocation and synchronous removal attempts; successful physical removal cannot be guaranteed when cleanup itself throws. Such leftovers must remain reported residuals.

**Resolved implementation choices:** fallback behavior, failure ownership, visibility recovery, property-only safe updates, permanently sealed publication ledgers, capability restrictions, host authority renewal for existing bindings, concrete presentation/interaction contracts, arbitration, presentation invalidation and reinstall ordering are specified above. New resources or registration-structure changes always select replacement; no update-specific effect batch or transaction engine is introduced.

**Unverified until implementation:** actual new transaction correctness, adapter behavior across supported physical events, cleanup fault containment and production smoke outcomes. These are explicit acceptance tests, not claimed existing guarantees.

Update capability restrictions govern the supported API and renderer contract; directly captured JavaScript/Leaflet objects are not sandboxed. The planned misuse, same-token currency and unchanged-ledger tests verify supported-path enforcement without claiming JavaScript provenance guarantees. No production or new tests were implemented or run during this final plan revision.

**Important accepted-runtime limitation:** errors discovered only after completed detached teardown cannot be injected retroactively into a closed Scope or an absent PluginRuntime record. This plan retains disposal responsibility and records those errors in rendering diagnostics without changing accepted runtime state. Implementers must not silently add retroactive quarantine or register cleanup in a dead scope.

No known product-intent decision remains open. The plan is ready for implementation review, subject to acceptance of the concrete proposed contracts and the documented late-cleanup limitation. Only this plan document has been saved; no production implementation, test change, commit or Phase 4G work has occurred.
