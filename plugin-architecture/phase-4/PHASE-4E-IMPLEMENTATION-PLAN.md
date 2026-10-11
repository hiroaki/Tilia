# Phase 4E — Selection Foundation Implementation Plan, Revised

## 1. Summary and review resolutions

Phase 4E introduces one app-owned semantic SelectionStore, minimum GPX/Photo selection adapters, and guarded application/plugin capabilities. Selection remains independent of rendering, interactions, and presentation.

This revision resolves both review blockers:

- **Deferred invalidation:** every invalidation captures a private selection generation, entry identity, and exact provider registration. Execution checks those identities and revalidates current semantic state before clearing. Provider-abort invalidation uses the same protection.
- **Termination:** SelectionStore termination emits **no final selection event**. It immediately revokes authority, clears private state, suppresses further delivery, removes subscriptions, and rejects uncommitted commands. The unused `"app-destroyed"` reason is removed.
- **Revision clarification:** GPX visibility/style mutations retain the accepted semantic revision behavior. Ref remapping uses the resulting revision without incrementing it again. Selection operations never increment semantic revision.

No unresolved design decisions or conflicts with accepted repository contracts were identified. This plan is returned for review; implementation requires the user's subsequent explicit authorization.

## 2. Deliverable and verified baseline

Intended document:

```text
plugin-architecture/phase-4/PHASE-4E-IMPLEMENTATION-PLAN.md
```

Verified HEAD:

```text
5f0ce4a016351396cffec7a2209306fe9ac9a4e9
```

Rechecked the actual semantic foundation, domain registry, EntryStore mutation/removal paths, guarded domain facades, subscription primitive, Scope closing behavior, GPX provider, and relevant architecture/migration clauses.

Current evidence:

- Semantic foundation disposal rejects while entries or cleanup residuals remain.
- Scope closing revokes authority and aborts signals before asynchronous cleanup.
- Subscription delivery suppresses dead consumers.
- Entry removal notifications occur after resource cleanup.
- Existing entries retain their exact provider registration.
- Selection Hub has no production importer; its direct importer is its legacy test suite.
- Public `app.destroy()` is absent.
- The requested plan file is not present.

This revision performed read-only inspection and `git diff --check`; the working tree remains clean. Previously reported baseline verification was four files / 71 passing tests; tests were not rerun for this revision.

Plan Mode prohibits file creation and commits. No plan file, production implementation, or test was changed; no commit was created.

## 3. Normative invariants and phase boundary

Use `ARCHITECTURE.md` §§10, 19, 30–31, 41–42, 44, 49 and `MIGRATION-PLAN.md` Phase 4E, together with accepted Phase 4A–4D implementation.

- Selection is null or one immutable `{entryId, domain, ref}`.
- Only the matching domain interprets, validates, compares, resolves, and reconciles refs.
- Callers submit domain-issued candidates.
- Semantic mutation and selection reconciliation commit before notifications.
- Entry removal invalidates selection before resource disposal.
- Visibility and renderer availability do not determine semantic existence.
- Selection contains no domain snapshot, renderer resource, popup, DOM, chart, hover, or draft state.
- No legacy/target synchronization or compatibility facade is introduced.

SelectionStore termination and liveness belong to 4E. Public `app.destroy()`, application-wide teardown, and provider teardown ordering remain 4K.

## 4. Current-state classification

| Component | Classification and evidence | 4E disposition |
|---|---|---|
| Semantic foundation, EntryStore, DomainRegistry | Active target architecture | Extend through private semantic lifecycle integration |
| Production GPX/Photo providers and facades | Active target architecture | Add minimum selection contracts |
| Selection Hub | Inactive legacy; production does not import it | Delete |
| Selection Hub tests | Legacy test-only authority and popup expectations | Replace semantic coverage, delete old suite |
| Interaction Hub | Inactive legacy raw-layer publication | Retain disconnected until 4H |
| Legacy overlay/popup helpers | Disconnected from semantic composition | Retain for 4G/4H/presentation migration |
| Elevation and layers/settings UI | Disabled legacy consumers | Retain for 4I |
| Track editor integration | Disabled; draft/history/local selection remain reusable | Retain for 4J |
| GPX structural and nearest-point helpers | Reusable pure domain logic | Preserve |
| Base-map selected layer | Active map infrastructure, separate from semantic selection | Preserve |
| Product popup/elevation/editor smoke tests | Later restoration milestones | Preserve without restoring features |

The six-plugin accepted 4D production allowlist remains unchanged.

## 5. Phase objective and authority transition

Establish programmatic semantic selection before renderers or presenters exist:

```text
inactive legacy Selection Hub abstraction
    → application-owned SelectionStore
```

The cutover publishes the target capability and deletes the Hub source and obsolete tests in the same change set.

SelectionStore is the sole application selection authority. Plugins may request and observe selection; ending the requesting plugin does not remove a committed selection.

## 6. Public identity and API

Preserve accepted domain-key identity:

```ts
type Selection = Readonly<{
  entryId: number;
  domain: DomainKey;
  ref: DeepReadonlyPlainData;
}>;

interface SelectionFacade {
  getCurrent(): Selection | null;
  request(candidate: SelectionCandidate): Promise<Selection | null>;
  clear(): Promise<void>;
  subscribe(
    listener: (change: SelectionChange) => void
  ): Readonly<{ unsubscribe(): void }>;
}

type SelectionChange = Readonly<{
  previous: Selection | null;
  current: Selection | null;
  reason:
    | "requested"
    | "cleared"
    | "refreshed"
    | "remapped"
    | "entry-removed"
    | "domain-invalidated";
}>;
```

There is no public generation, provider registration, or termination reason.

`getCurrent()` is synchronous. Request/clear return Promises to support queued reentrant operations. Equal canonical requests and repeated clears are no-ops with no event.

Generic equality compares entry ID and exact domain key, then delegates ref equality to the captured domain adapter.

## 7. Candidate issuance and snapshot integrity

Candidates are frozen opaque handles registered in an application-private WeakMap:

```ts
// Private metadata, never a public selection.
{
  entryId,
  domainKey,
  providerRegistration,
  canonicalRef,
  issuingScope,
}
```

Issuance validates caller/application authority, committed entry, exact provider registration, domain association, and target.

Request execution rechecks these conditions. Foreign-app, copied, fabricated, stale-provider, dead-issuer, and stale-reference candidates reject.

Refs are copied and recursively frozen using accepted plain-data utilities. Selection snapshots contain only the three public fields. Provider instances, scopes, candidate metadata, and resources do not escape.

Candidates are bound to their issuing consumer scope; they do not transfer mutation authority between scopes.

## 8. Domain selection adapter

Add an optional, complete private provider interface:

```ts
interface DomainSelectionAdapter {
  canonicalize({ instance, revision, target }): ImmutableRef;

  equals(left: ImmutableRef, right: ImmutableRef): boolean;

  resolve({ instance, revision, ref }):
    DeepReadonlyPlainData | null;

  reconcile({
    previousInstance,
    nextInstance,
    previousRevision,
    nextRevision,
    command,
    change,
    ref,
  }):
    | { type: "unchanged" }
    | { type: "refreshed" }
    | { type: "remapped"; ref: ImmutableRef }
    | { type: "invalid" };
}
```

Hooks are synchronous, side-effect-free, and presentation-independent. Validate the complete interface when present. Providers without selection support remain valid entry providers; selection requests reject as unsupported.

Access existing entries through their captured exact registration. Do not dynamically adopt a replacement provider or add an adapter/capability registry.

## 9. GPX reference model

Domain target requests:

```js
{ kind: "document" }
{ kind: "track", trackIndex }
{ kind: "segment", trackIndex, segmentIndex }
{ kind: "route", routeIndex }
{ kind: "track-point", trackIndex, segmentIndex, pointIndex }
{ kind: "route-point", routeIndex, pointIndex }
{ kind: "waypoint", waypointIndex }
```

Canonical document ref:

```js
{ kind: "document" }
```

Canonical structural refs contain the current semantic revision and relevant indices:

```js
{
  kind: "track-point",
  revision,
  trackIndex,
  segmentIndex,
  pointIndex,
}
```

Indices are revision-scoped structural locators, not persistent object IDs. Validate integer bounds and complete structure. Coincident coordinates do not imply equal identity.

Rules:

- No-op mutations preserve refs.
- GPX category visibility, per-track visibility, and style mutations preserve targets and remap structural refs to the committed revision.
- Whole-document replacement invalidates structural refs by default; matching positions do not prove identity.
- Document selection survives replacement with `refreshed`.
- Future identity-preserving point commands explicitly refresh/remap; deletion invalidates.
- Old revision-scoped candidates reject.
- Serialization/recreation and Save Copy allocate new entry identity.

Rich GPX queries, fine-grained editing commands, and renderer hit testing remain later-phase responsibilities.

## 10. Photo reference model

Photo has one semantic target per entry:

```js
{ kind: "photo" }
```

A Photo without GPS is selectable.

Semantic data/time-mode changes preserve identity and return `refreshed` when resolved public semantics change. Resource-only changes and no-op commands return `unchanged`.

Resolution returns immutable public semantic data. Blob, preview URL, disposal callbacks, and other resources are excluded.

## 11. Revision and visibility rules

Preserve the current accepted revision contract:

| Operation | Semantic revision | Selection |
|---|---|---|
| GPX category/per-track visibility changes | Increment once for a committed change | Preserve target; remap revision-scoped ref |
| GPX authoritative style change | Increment once for a committed change | Preserve target; remap revision-scoped ref |
| Equal/no-op domain command | Unchanged | Unchanged |
| Whole-entry visibility | Unchanged | Preserve |
| Request/replace/clear selection | Unchanged | Apply selection transition |
| Selection refresh/remap/invalidation | No additional increment | Apply domain reconciliation |
| Private selection generation change | Unchanged | Internal bookkeeping only |

EntryStore allocates the resulting semantic revision. Selection reconciliation uses that value; it does not allocate another revision.

The private selection generation is neither semantic revision nor RenderGeneration.

## 12. Selection validity

| Condition | Behavior |
|---|---|
| Selected entry logically removed | Clear before cleanup |
| Unrelated entry removed | Preserve |
| Selected target deleted | Clear through reconciliation |
| Identity-preserving semantic change | Refresh/remap |
| Whole-entry/domain target hidden | Preserve |
| Renderer missing/replaced/disposed | Preserve |
| Popup closes/presenter uninstalls | Preserve |
| Requesting plugin ends | Preserve committed selection; revoke its capabilities |
| Provider uninstall while entries exist | Existing lease guard rejects uninstall |
| Exact provider authority fails | Guarded invalidation and diagnostic |
| SelectionStore terminates | Clear private state without final event |

A semantic revision change alone never triggers generic invalidation.

## 13. Private selection generation

Maintain an application-local, monotonically increasing, never-reused generation internally. Use an unbounded integer counter such as `BigInt`; it never enters public snapshots.

Advance it on:

- A committed non-no-op request/replacement.
- Clearing a non-null selection.
- `refreshed`, including an unchanged public descriptor.
- `remapped`.
- Entry/domain invalidation that clears selection.
- First termination, even when current selection is null.

Do not advance it for equal requests, repeated clears, failed commands, or `unchanged` reconciliation.

Thus clearing and reselecting an identical descriptor creates a different generation. Refreshing the same descriptor also invalidates old deferred work.

Rebind selected-provider monitoring after each generation change. Removing a listener alone is insufficient protection against a callback already captured for later execution.

## 14. Deferred invalidation contract

Only unsuccessful resolution of the **current** selection can enqueue invalidation. Resolving an unrelated or stale ref must not affect global selection.

Before adapter resolution, capture:

```ts
type InvalidationTicket = Readonly<{
  generation: bigint;
  entryId: number;
  domainKey: DomainKey;
  providerRegistration: ExactPrivateRegistration;
  ref: ImmutableRef;
  cause: "resolution-failed" | "provider-aborted";
}>;
```

Capture and resolution occur within the synchronous semantic gate. After failed resolution, verify that the captured selection is still current before enqueueing.

Execution follows:

```js
if (storeTerminated || !applicationScope.alive) return;

if (
  currentGeneration !== ticket.generation ||
  currentSelection === null ||
  currentSelection.entryId !== ticket.entryId ||
  currentSelection.domain !== ticket.domainKey ||
  selectedProviderRegistration !== ticket.providerRegistration
) return; // obsolete work

const entry = lookupCurrentPrivateEntry(ticket.entryId);

if (!entry || entry.providerRegistration !== ticket.providerRegistration) {
  // Removal must already have invalidated selection.
  // A mismatch never authorizes clearing another registration's selection.
  diagnoseBoundaryViolationIfNeeded();
  return;
}

if (!ticket.providerRegistration.owner.alive) {
  commitGuardedDomainInvalidation(ticket);
  return;
}

const resolved = resolveCurrentSelectionAgainstCurrentInstanceAndRevision(entry);

if (resolved !== null) return; // target is valid now

commitGuardedDomainInvalidation(ticket);
```

Adapter failure during revalidation is diagnosed as a provider invariant failure and invalidates only the still-matching generation. It does not requeue indefinitely.

There is no `await` between identity checks, current-state resolution, and invalidation commit. Recheck ticket identity immediately before commit. Internal stale tickets produce no event and no generation/revision change.

Coalesce duplicate tickets for the same generation and exact registration while pending. Revalidation uses the **current** instance/revision, not the snapshot from failed resolution.

## 15. Provider-abort invalidation

The selected-provider monitor captures the same generation, entry, domain key, exact registration, and immutable ref as a resolution ticket.

A callback:

1. Checks SelectionStore/application liveness.
2. Checks its captured selection generation and registration.
3. Enqueues the guarded ticket.
4. Relies on execution-time checks and current authority/semantic revalidation.

A delayed callback from selection A cannot invalidate B. It also cannot invalidate a reselected identical descriptor, refreshed selection, or selection associated with another provider registration.

If provider authority is currently live and current resolution succeeds, drop the ticket. If the matching exact registration is dead, clear with `domain-invalidated`; do not invoke its private hooks after authority loss.

Provider failure never transfers an entry to a replacement provider. Explicit provider removal remains protected by accepted leases.

## 16. EntryStore integration and semantic commits

Final removal subscriptions are too late. Add a private, fixed semantic lifecycle collaborator supplied by application composition:

```ts
interface EntrySemanticLifecycle {
  prepareDomainCommit(input): PreparedCommitEffect;
  afterLogicalRemoval(input): void;
}

interface PreparedCommitEffect {
  commit(): void; // prevalidated, synchronous, callback-free
  notify(): void;
}
```

EntryStore imports no SelectionStore and interprets no selection fields. The application-owned coordinator supplies the collaborator and internal transaction gate.

Preserve existing per-entry FIFO queues, expected-revision checks, provider leases, private-resource transactions, and residual cleanup.

After asynchronous mutation preparation:

```text
revalidate all authorities
→ enter synchronous semantic gate
→ reconcile current selection against prepared semantics
→ validate prepared selection effect
→ commit instance/snapshot/revision and selection without callbacks
→ deliver domain-changed event
→ deliver selection event, if applicable
→ release notification barrier and drain selection FIFO
→ existing post-commit cleanup
```

Reconciliation uses selection at commit time. Pre-commit failure preserves both authorities. Post-commit failure does not roll them back.

## 17. Entry deletion ordering

```text
serialize removal
→ mark removing and exclude entry from lookup
→ enter semantic gate
→ invalidate its selection and advance private generation
→ notify selection subscribers
→ drain queued selection commands after delivery
→ close entry scope/resources
→ release provider lease after successful cleanup
→ publish existing final removed notification
```

A clear observer sees the entry already absent. A reentrant request targeting it rejects. An unrelated live entry can be selected after current delivery.

Cleanup failure does not restore the entry or selection. Cleanup retries never republish either. EntryStore clear retains reverse insertion order and existing batched entry notification behavior.

## 18. Subscription and command ordering

Reuse `createSubscriptionChannel` with `emitCurrent:false`; selection exposes no replay option.

- Deliver immutable events synchronously after commit in registration order.
- Use stable subscriber snapshots.
- New subscriptions start with the next event.
- Unsubscribe is idempotent and affects subsequent snapshots.
- An already captured subscriber may receive the current event while its consumer and SelectionStore remain live.
- Dead consumer callbacks are suppressed.
- Listener exceptions and diagnostic-reporter exceptions cannot stop peers.
- Callback Promises are not awaited.

The shared channel queues events, not commands. Selection needs its own FIFO and a semantic notification barrier.

Reentrant requests/clears execute after the current domain/selection notification batch. During ordinary delivery, later listeners' reads observe the event's committed selection.

Settle a command's success result at its commit/no-op decision before invoking notifications. Retain its immutable result; do not reread current selection to construct the result after callbacks.

## 19. Termination and observation contract

**Termination emits no final selection-cleared event.** Remove `"app-destroyed"`; do not add `"selection-terminated"`.

Termination is a private synchronous, idempotent operation. First invocation:

1. Mark SelectionStore terminal and close command/candidate/resolution authority.
2. Advance private selection generation and clear current selection and selected-provider association.
3. Suppress all not-yet-invoked selection listeners and discard pending selection notifications.
4. Remove selected-provider/application abort listeners and unsubscribe all selection subscriptions.
5. Reject all queued, uncommitted public requests/clears with `SELECTION_STORE_DESTROYED`, `committed:false`.
6. Discard internal invalidation tickets and release their references.

This sequence completes without awaiting, draining the normal FIFO, or invoking user callbacks.

The already executing listener may finish; it is not interrupted. If it triggers termination, remaining listeners of that selection event are suppressed by a **selection-specific wrapper** checking store liveness before callback invocation. The shared subscription primitive is unchanged.

There is no termination listener because no termination event exists. Any callback that runs during cleanup or finishes after termination receives no mutation authority.

The private state is null after termination; public `getCurrent()` rejects rather than exposing a usable terminal authority.

## 20. Post-termination operations and pending outcomes

New selection capabilities check store/application selection liveness before consumer liveness. This makes post-termination failure consistent even when the consumer scope has also closed.

| Operation after termination | Outcome |
|---|---|
| `getCurrent()` | Synchronously throws `SELECTION_STORE_DESTROYED` |
| `request()` | Returns rejected Promise, `committed:false` |
| `clear()` | Returns rejected Promise, `committed:false`; not a successful no-op |
| `subscribe()` | Synchronously throws; registers nothing |
| Domain candidate issuance | Synchronously throws; issues nothing |
| Domain selection `resolve()` | Synchronously throws; invokes no provider hook |
| Existing `unsubscribe()` | Remains safe and idempotent |
| Captured invalidation/provider callback | No-op before provider access |

Pending command rules:

- Queued requests/clears that have not committed reject at termination.
- Commands that committed before termination retain their successful Promise outcomes and captured immutable results, even if termination occurs inside their notification callback.
- A completed no-op decision retains its successful outcome.
- A reentrant command queued by a listener is rejected if termination occurs before it executes.
- A command invoked after termination is rejected immediately through its Promise.
- Validation is synchronous and presentation-free; no partially committed asynchronous selection command exists.
- Termination never rewrites an already settled success as failure.

Retained snapshots remain immutable historical values. They provide no authority to restore selection.

## 21. Ownership and semantic-foundation integration

`createSemanticFoundation()` owns the SelectionStore/coordinator under its existing semantic root.

Foundation disposal keeps its accepted precondition:

```text
inspect entries/residuals
→ if any remain, reject without terminating selection
→ otherwise synchronously terminate SelectionStore
→ invoke existing root-controller close
```

No await or externally visible callback intervenes between successful preflight and selection termination.

Also install an application-root abort listener as a synchronous, idempotent fallback. Scope already revokes authority before abort dispatch; this fallback clears private selection bookkeeping without relying on deferred disposal.

Foundation cleanup failure leaves selection terminal. Repeated successful-preflight disposal does not restore it or repeat termination effects.

Consumers own their subscriptions and candidate issuance authority. Selection remains app-owned. Selected-provider monitoring owns no additional provider lease.

Contract tests may terminate the internal SelectionStore with a selected target. Foundation integration tests must respect the existing entries/residuals precondition; do not add public app destruction to exercise termination.

## 22. PluginContext and public application API

Add exactly `context.selection` and `app.selection`, using the existing named capability factories and application readiness convention.

Standard domain facades gain:

```ts
domain.selection.createCandidate(entryId, target): SelectionCandidate;
domain.selection.resolve(entryId, ref): DeepReadonlyPlainData | null;
```

Photo target defaults to `{kind:"photo"}`; GPX requires an explicit target.

Example:

```js
const candidate = app.domains.gpx.selection.createCandidate(gpx.id, {
  kind: "track-point",
  trackIndex: 0,
  segmentIndex: 0,
  pointIndex: 0,
});

await app.selection.request(candidate);
const selected = app.selection.getCurrent();
const target = app.domains.gpx.selection.resolve(
  selected.entryId,
  selected.ref,
);
```

Malformed refs reject. A well-formed unresolved target returns null and schedules invalidation only when it matches the captured current selection. Provider resolution exceptions remain errors; any resulting current-selection invalidation uses the guarded ticket mechanism.

No raw store/controller/provider/resources or general capability lookup is exposed.

## 23. Error, failure, and rollback behavior

Reuse `SemanticError`, accepted entry/domain errors, and `SCOPE_NOT_ACTIVE` for a dead consumer while selection remains active.

Add:

```text
SELECTION_CANDIDATE_INVALID
SELECTION_REFERENCE_INVALID
SELECTION_UNSUPPORTED
SELECTION_PROVIDER_INVARIANT
SELECTION_STORE_DESTROYED
```

Errors carry frozen diagnostic IDs, cause where appropriate, and `committed`. They expose no private provider registration object or resources.

- Invalid request preserves previous selection.
- Failed reconciliation preparation preserves prior semantic state and selection.
- Matching current provider/target failure invalidates through guarded internal work.
- Obsolete invalidation is a silent state no-op.
- Subscriber failure cannot roll back state.
- Termination rejects only uncommitted commands.

Authority-cutover rollback uses source-control revert. Runtime compatibility rollback or synchronization with the old Hub is prohibited.

## 24. Legacy removal and future compatibility

Delete Selection Hub source and its obsolete test suite at target capability cutover:

```text
Selection Hub state → SelectionStore
Selection Hub popup ownership → removed;
                               future presenter owns presentation
Legacy layer identity → domain-issued semantic refs
```

Preserve meaningful single-selection, replacement, removal, equality, and reentrancy coverage in target tests before deleting the old suite.

Popup formatting helpers and disconnected Interaction Hub remain for scheduled later migration.

Editor draft IDs, Undo/Redo, rectangle selection, inspector focus, and overlays remain session-local. Global GPX refs do not replace them. Save Copy creates another entry. Do not modify `PartiallyEditablePolyline`.

Elevation's committed point action can later issue a domain candidate; chart/hover/marker/popup state remains 4I presentation work.

## 25. Expected files

Add production modules:

```text
src/selection/store.js
src/selection/coordinator.js
src/selection/candidates.js
src/selection/index.js
src/plugins/domains/gpx-selection.js
src/plugins/domains/photo-selection.js
```

Modify semantic composition/capabilities, application facade, EntryStore private lifecycle integration, provider validation, domain facades/providers, semantic errors, and appropriate exports.

Add focused store, entry integration, domain adapter, production composition, architecture, and browser smoke tests; add a Phase 4E sample and smoke script.

Delete:

```text
src/core/selection-hub.js
tests/selection-hub.test.js
```

Retain disconnected later-phase code, independent domain/editor algorithms, and the unchanged six-plugin allowlist. Do not modify the shared Scope or subscription contracts.

For this planning task, no production or test file changes are authorized.

## 26. Core test plan

Cover:

- Initial null, request/read/replace/clear, repeated clear, canonical equality.
- Immutable snapshots/ref copies and retained input isolation.
- Invalid, forged, copied, foreign-app, stale-provider, and dead-issuer candidates.
- Every supported GPX target kind, bounds, hierarchy, coincident points, stale revisions.
- GPX replacement invalidation and setting/style ref remapping.
- Photo without GPS, refreshed semantics, resource-only unchanged reconciliation.
- Selected/unrelated deletion, pre-cleanup clear, cleanup failure, reverse clear.
- All reconciliation outcomes and pre-commit failure preservation.
- Selection changing during asynchronous domain preparation.
- Change-only subscriptions, reasons, stable ordering, unsubscribe, dead consumers, exception isolation, reentrant FIFO.
- No revision increment from any selection operation.

Exact test count is not fixed; implementation must provide named cases for each behavior.

## 27. Invalidation race and termination tests

Use controlled synthetic domain state, captured callbacks, and ordinary notification barriers. Do not add public pause/drain controls or a test-only production architecture.

**Invalidation contract/integration cases:**

- A fails resolution; a previously queued request commits B before A's ticket executes. B survives.
- A fails resolution; clear and reselect the identical descriptor execute before the ticket. The new generation survives.
- Same descriptor receives `refreshed`; an older ticket is ignored.
- A matching-generation ticket executes after current semantics become resolvable. It revalidates and preserves selection.
- A matching ticket remains unresolved. Exactly one clear/event occurs.
- A current semantic mutation remaps or invalidates selection before old work executes. Old work produces no additional transition.
- Resolving an unrelated/stale ref as null does not invalidate current selection.
- Delayed provider-abort callback after selection replacement, same-descriptor reselection, registration change, or termination is harmless.
- Provider-abort ticket for the still-selected dead exact registration clears once without calling dead provider hooks.
- Duplicate pending tickets cannot produce duplicate clears.
- Generation/registration bookkeeping never appears in public snapshots.

**Termination cases:**

- Termination with selected/null state: no final event, internal state cleared, generation advanced once.
- Repeated termination: no repeated effects.
- Every operation in the post-termination table has its specified outcome.
- A listener queues request/clear then terminates: queued commands reject; committed triggering request succeeds.
- Termination inside delivery suppresses remaining selection listeners and pending selection events.
- A listener's post-termination reads throw; request/clear reject.
- A committed clear retains success despite subsequent termination.
- No-op decisions already completed retain success.
- Late resolution tickets, provider callbacks, and consumer continuations cannot republish selection.
- Internal subscriptions/listeners are detached; unsubscribe remains idempotent.
- Foundation disposal with entries/residuals rejects without ending selection authority.
- Valid foundation disposal terminates selection before root cleanup.
- Cleanup failure does not revive selection.
- Root-abort fallback terminates bookkeeping synchronously, without public `app.destroy()`.

## 28. Headless production smoke and architecture gates

Use real production composition and lazy GPX/Photo providers.

Headless integration follows accepted `createTiliaApp({map:{}, ...})`. Browser smoke uses the normal factory/base map but no semantic overlays or popup.

Sequence:

1. Await readiness and confirm production providers.
2. Create GPX and Photo entries.
3. Subscribe; verify no initial event.
4. Select/read/resolve GPX.
5. Repeat equal selection; verify no event/revision change.
6. Hide GPX; preserve selection.
7. Replace selection with Photo.
8. Change Photo visibility; preserve selection.
9. Delete unrelated GPX; preserve Photo selection.
10. Delete Photo; verify selection cleared.
11. Clear again; verify no event.
12. Unsubscribe and uninstall providers after entry cleanup.

Private termination and ordering races belong to contract/integration tests, not a new app teardown API.

Verify no SelectionStore dependency on Leaflet, DOM, popup, renderers, Interaction Hub, or domain implementation modules; no GPX/Photo branching in generic selection code.

## 29. Forbidden-symbol audit

Search source, plugins, tests, samples, and documentation for:

```text
selection-hub
createSelectionHub
selectTrackPoint
selectWaypoint
selectPhoto
popupclose
selectedLayer
selectedMarker
selection.layer
selection.popup
app.core
app.state
core.state
state.entries
state.sources
state.layers
entry.source
entry.layer
entry.interactions
interaction-hub
subscribeInteractions
refreshView
addRefreshHandler
buildGpxOverlay
buildPhotoOverlay
```

Classify every remaining relevant match as target infrastructure, disconnected scheduled legacy, fixture, documentation, or violation.

Base-map layer selection and editor-local markers are legitimate separate concerns. Disabled elevation popup listeners remain later-phase legacy.

Require zero unexpected active-path violations and no Selection Hub source/import. Also verify that public selection/events contain neither private generation nor exact registration bookkeeping.

## 30. Implementation sequence and definition of done

After explicit authorization:

1. Write contract expectations, including invalidation races and termination outcomes.
2. Implement candidates, store FIFO, private generation, and guarded invalidation.
3. Integrate semantic commit/removal coordinator without changing accepted foundational contracts.
4. Add minimum production domain adapters and facade operations.
5. Wire selection ownership, termination, PluginContext, and application API.
6. Delete Selection Hub and obsolete tests at authority cutover.
7. Add production smoke and architecture audit.
8. Run full unit tests, applicable 4B–4E smoke gates, diff checks, and classified searches.

Completion requires singular authority, atomic reconciliation, pre-cleanup invalidation, race-safe deferred work, explicit terminal behavior, production headless selection, unchanged revision rules, and passing gates.

Documentation delivery remains separate: save the revised plan only when permitted, verify only that Markdown file changed, and do not begin implementation as part of saving it.

## 31. Deferred responsibilities, risks, and unresolved decisions

Deferred unchanged: all 4F rendering/interaction infrastructure; domain rendering and input restoration; popup/highlight/presentation; elevation/layers/settings; inference; editor/export/route-search/milestone; complete 4K application destruction.

Principal risks are stale deferred invalidation, same-descriptor reselection, notification-only queueing, semantic state changing during preparation, provider authority loss, and termination inside notification delivery. Sections 13–21 and 27 specify protections and acceptance tests.

The no-final-event termination choice preserves existing dead-scope callback suppression and avoids inventing teardown notification authority. Existing consumer scopes and shared subscription behavior remain unchanged.

**Remaining unresolved decisions or accepted-contract conflicts: none identified.**

This is a complete replacement plan for review. No production code or tests were modified, no implementation was begun, and Phase 4F was not started.
