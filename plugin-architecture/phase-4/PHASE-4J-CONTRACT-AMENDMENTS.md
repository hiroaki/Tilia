# Phase 4J — Approved Contract Amendments

## Authority, approval and implementation status

Approval recorded: **2026-10-08**. The user approved implementing the Phase 4J plan and explicitly authorized A (temporary presentation suppression, including renderer-independent read/notification), B (the narrow unchanged-vendor editing-marker/drag-helper pane exception), and C (entry-associated presentation lifetime and cleanup ordering). Plan commit: `281b4bc`; accepted implementation baseline: `6e12a85a0172c663787747e77ba5fa619ff17330`.

**APPROVED FOR IMPLEMENTATION — implementation and verification pending.** This approval does not assert tested implementation or usable browser behavior. The specifications below reproduce §19 A/B/C at approval; historical “unapproved”, “review-gated” and “requires review” wording describes their earlier status and is superseded by this explicit approval record. No materially broader exception or contract is authorized.

Implement Export, Route Search, Track Editor, then Milestone, with relevant verification before advancing. Vendor files remain byte-for-byte unchanged. Existing best-effort cleanup, truthful residual reporting, quarantine/reinstall restrictions and retry-safe-only failed cleanup remain in force; guaranteed recovery of every vendor residual is not required. If supported public APIs cannot provide usable vendor behavior, stop that checkpoint and report a concrete reproduction rather than broaden B.

The source-independent track-only draft model and Save Copy are confirmed user decisions. Source modification/deletion or renderer removal cannot terminate initialized editing or prevent Save Copy; Cancel never restores/recreates the source. The roadmap correction reconciles obsolete wording with this decision, not a further approval gate. Deferred features remain excluded.

## Approved specifications

### A. Temporary target presentation suppression

**REQUIRES ARCHITECTURE REVIEW BEFORE IMPLEMENTATION**

**Problem:** Existing per-track visibility writes mutate revisioned persistent preferences. A closed editor scope cannot issue restoration commands, and writing an old preference would overwrite current user intent.

**Verified absence:** Architecture §§30–31 establish generic entry visibility and domain preferences; §§21/37 establish presentation/session lifetimes. HEAD has neither a target-level suppression lease nor a supported suppression read/notification interface. `src/rendering/coordinator.js:78–104,529–555` exposes controller status snapshots and their subscription, with no semantic-target suppression. Entry subscriptions (`src/domains/facades.js:90`) report semantic events, not temporary presentation changes. Neither interface can satisfy renderer-independent Milestone visibility.

**Proposed placement:** Rendering/presentation infrastructure, not GPX semantic snapshots. Generic infrastructure treats targets through the existing domain reference adapter; GPX renderer supplies track grouping.

Proposed consumer interface, including the minimum read/notification addition needed by Milestone:

```js
context.rendering.suppress({
  entryId,
  domain,
  target,
  expectedRevision,
  scope
}) // → immutable { dispose(): Promise<void> }

context.rendering.getSuppressionSnapshot()
// → frozen array of unique suppressed { entryId, domain, ref } records

context.rendering.subscribeSuppression(listener, {
  scope,
  emitCurrent: true
}) // → immutable { unsubscribe() }; listener receives a frozen snapshot
```

All three methods remain **unapproved**. `ref` is the current canonical domain reference (including the GPX revision), obtained using the existing adapter, not a draft ID or guessed index identity. Snapshot records expose only aggregate temporary suppression: no persistent visibility values, lease owners/counts, layers, controllers or generations. A target occurs once while at least one valid live lease suppresses it; an empty snapshot is valid without a renderer. Match references using domain rules, not stringification.

- Owner scope must be the consumer or its descendant.
- Admission validates entry/domain/target/current revision through the domain adapter.
- For Phase 4J, supported acquisitions are GPX track targets `{kind:"track",trackIndex}`; other target granularities are outside this proposal. The manager uses the domain adapter privately, while consumers can compare the published typed GPX track-reference fields described in §10.
- Each lease has an exact private identity. Multiple leases compose by logical OR.
- Effective track presentation is persistent entry/category/track visibility **AND no live suppression lease**.
- Suppression never changes semantic data, preferences, revision or SelectionStore.
- Underlying visibility changes remain authoritative while suppressed.
- Owner closure or explicit disposal logically releases that exact lease synchronously. Infrastructure performs release; the expired editor issues no command.
- Attribute/presentation mutations reconcile references through accepted domain rules.
- Structural replacement invalidates leases without guessing track identity. Editor draft continues.
- Logical entry deletion drops associated suppression state and never recreates the entry.
- Renderer replacement/uninstall does not discard live leases; reinstalled rendering reads current suppression.

Read/notification consistency and ownership:

- The state manager belongs to rendering/presentation infrastructure independently of renderer registrations/controllers. Reads and subscriptions work with no renderer, after renderer uninstall, and before reinstall; renderer churn alone produces no suppression change.
- `getSuppressionSnapshot()` is a synchronous immutable view of currently valid, logically live leases. Owner-scope liveness is authoritative even if an earlier abort listener reads before the manager's cleanup listener runs. Invalid/deleted targets are excluded immediately.
- Subscription validates consumer/descendant scope ownership and installs its listener before capturing `emitCurrent`. Outside an active dispatch, initial delivery is synchronous. Inside a dispatch, a nested subscription queues its targeted initial snapshot ahead of subsequent transitions and receives it before the outer dispatch returns; the getter remains immediately usable. Initial delivery and later notifications share a serialized queue. Transition deliveries capture eligible subscribers at commit, so newly registered subscribers do not receive pre-registration snapshots after their initial delivery. Reentrant transitions are queued in order with no registration gap. Normal notifications run synchronously after the logical state commit; reentrant deliveries drain before the outer dispatch returns. Listener failures are isolated; unsubscribe/scope closure prevents subsequent callbacks, including captured queued deliveries.
- Notify with captured immutable aggregate snapshots when that snapshot changes: first acquisition, final release, reference remapping, structural invalidation or deletion. A second overlapping lease and release of a nonfinal lease do not change the aggregate snapshot and need not notify. Explicit disposal and owner closure logically release synchronously before awaiting physical cleanup; cleanup failure cannot reinstate suppression.
- Persistent visibility changes do not become suppression values. Attribute/preference mutations reconcile current references through the accepted domain adapter; a changed reference revision changes the snapshot and notifies even when aggregate suppression remains true. Structural replacement drops old structural leases, including identical-shape replacements; stale disposal cannot affect replacement targets. Existing GPX remapping/invalidation behavior is in `src/plugins/domains/gpx-selection.js:57–67`.
- Reconcile at the private semantic-commit and logical-removal hooks before public callbacks can observe inconsistent semantic/suppression state. Current `afterDomainCommit` returns early without a controller (`src/rendering/coordinator.js:505–511`); the proposed manager must reconcile before that branch. `src/entries/store.js:369–392,460–484` establishes commit/removal ordering; deletion removes lookup and drops suppression, while C withdraws bound presentation before externally delivered invalidations can trigger recomputation. Notification is not a deletion-cleanup barrier.
- Preserve the command and old/new domain instances needed by `adapter.reconcile` at the private prepare/commit boundary (`src/selection/store.js:275–303`); the existing public `domain-changed` event and rendering hook's `change` alone do not supply that full input. Extend private plumbing within A rather than infer replacement identity from public events or add a consumer command/reference registry. Commit reconciled lease references alongside semantic state before any callback-bearing presentation update or public notification.
- Editor uninstall releases only its leases; other owners continue suppressing. Milestone uninstall removes its subscription and presentation children, without disposing another plugin's leases. No editor command is issued after its scope expires.

The current subscription helper (`src/extensions/subscriptions.js:8–61`) queues ordinary reentrant notifications but invokes the initial snapshot directly. Do not assume it already satisfies the proposed initial-delivery ordering; explicitly implement/test that contract after approval. Consumers reread authoritative semantics and suppression when recomputing rather than attaching from a queued, possibly superseded snapshot.

Required renderer integration:

- Add generation-local visibility groups identified by opaque domain targets.
- GPX renderer assigns each track attachment and its interaction to its track group.
- Coordinator enforces group attachment and interaction gates on current, preparing and retained generations.
- Presentation resolution excludes suppressed geometry; renew exposure so old handles permanently invalidate.
- A stale fallback whose group identity cannot be validated is withdrawn rather than guessed.
- No foreign layer, group implementation, controller or generation is exposed publicly.
- Presentation application failure fails closed, retires unsafe rendering and retains cleanup diagnostics; semantics remain committed.

This is a bounded visibility mechanism, not a renderer-augmentation registry.

Focused contract/race tests must cover:

- Subscribe before and after acquisition, `emitCurrent:false`, immutable snapshots, initial-callback acquire/release, nested subscriptions/changes, listener failure, unsubscribe and dead scopes; no pre-registration replay, missing initial transition or callbacks after closure.
- First/final transition notifications and both overlap release orders; read during an earlier owner-abort callback; explicit disposal idempotence and stale disposal after replacement.
- Changes to entry/category/track preferences while suppressed; final release reveals current authoritative visibility subject to remaining leases, never the initial preference. No semantic revision or selection mutation by suppression itself.
- Attribute/preference revision remapping, identical-shape structural replacement, entry deletion/clear, held/failed presentation cleanup, and mutation during callback-bearing Milestone acquisition; no stale reference or overlay resurrection.
- Acquire/read/subscribe/reconcile with no renderer, renderer removal/reinstall, independent editor/Milestone uninstall and failed renderer application/physical cleanup. Logical state remains authoritative and failures retain diagnostics/residuals.

**Blocked:** suppression implementation, dependent editor integration and Milestone suppression integration until A is reviewed and approved.

### B. Vendor editing-marker and drag-helper pane exception

**REQUIRES ARCHITECTURE REVIEW BEFORE IMPLEMENTATION**

Architecture §§36–37 (`plugin-architecture/ARCHITECTURE.md:695–720`) distinguish temporary editor ownership but provide no default-pane exemption. Tilia's bands are geometry 400, markers 600, overlays 620, selection 640 and modal 660 (`src/map/panes.js:4–10`). MapFacade sets the pane only on the attached layer (`src/map/facade.js:63–78`), not objects internally created by a library.

Verified resource types in `plugins/x-track-editor/vendor/leaflet-partially-editable-polyline.js` and the locally installed, pinned Leaflet `2.0.0-alpha.1` (`package.json:24`):

| Internally created resource | Vendor evidence | Leaflet default and behavior |
|---|---|---|
| Existing-point editing `Marker` | `:277–299`: draggable, `bubblingPointerEvents:false`, supplied/default icon; no pane option | `markerPane`, z-index 600; icon local z-index depends on screen y and offset. Default vendor icons are `DivIcon`s with no shadow |
| Midpoint/insertion editing `Marker` | `:306–330`: same placement options; distinct midpoint click/drag handling | Same `markerPane` and icon stacking; interactive drag/click target |
| Drag helper `Polyline` lines | `:570–590`: dashed, weight 1, `interactive:false`; no pane/renderer option | Normally rendered in `overlayPane`, z-index 400. Leaflet can use a map-supplied shared renderer instead, whose pane must be checked; the exception does not authorize changing it |

Leaflet evidence: `node_modules/leaflet/src/layer/marker/Marker.js:69–75,280–285,312–329`; `src/layer/marker/DivIcon.js:48–69`; `src/layer/Layer.js:32–37`; `src/layer/vector/Renderer.getRenderer.js:10–36` (the last three paths are relative to `node_modules/leaflet`). `node_modules/leaflet/dist/leaflet.css:92–115,206–215` supplies default pane stacking and pointer-event rules. Noninteractive helpers do not enter SVG/Canvas hit testing (`src/layer/vector/SVG.js:93–95`, `src/layer/vector/Canvas.js:343–355`, relative to the same package).

Supported-mechanism investigation:

- Vendor constructor options affect the outer polyline; public `startEditing` options supply an editing radius, not internal pane/renderer factories (`vendor/leaflet-partially-editable-polyline.js:38–55,138–167`, relative to the editor directory). Outer pane/renderer configuration therefore cannot place the three internal resource types in Tilia's editor bands.
- Public `pointIcon`/`newPointIcon` options customize icon content/appearance, not the parent Marker pane. Leaflet's per-marker pane options require creating/accessing that marker; vendor's public API supplies no internal marker/helper handles or creation factory. `setZIndexOffset` changes local icon ordering and cannot cross its parent pane's stacking context.
- Changing global Marker defaults, default pane CSS or a shared map renderer affects unrelated resources. A generic `layeradd` interceptor has no supported vendor-owned identity for every helper; relocation would require internal inspection/heuristics. These are not supported scoped solutions. No private arrays/method overrides, subclasses reaching private internals, monkey-patching, map proxies or generic compatibility framework are permitted.

No supported public mechanism was found that meets the band policy for these internal resources under the constraints. **Propose only** allowing the above point/midpoint editing markers and drag helper lines, created internally by the unchanged `PartiallyEditablePolyline`, to retain their library default placement. This applies to no other third-party UI or editor resource. Directly created draft polylines, rings, rectangle UI, groups and all other editor resources retain the accepted pane/band policy. Vendor internals remain temporary interaction resources, never committed domain rendering.

The exception does not prove usability: markerPane 600 and helper overlayPane 400 sit below editor modal geometry 660, selection 640 and overlays 620; interactive geometry can obscure or intercept handles. Popup/tooltip and shell controls add separate stacking constraints. Require real-browser overlap/interaction tests for point and midpoint handles, helper lines, draft lines/rings/rectangle, ordinary selection, popup, unrelated overlays and shell controls. If these fail using supported public options, block the checkpoint and bring the concrete reproduction to review; do not silently broaden the exception or raise global panes. This revision provides static evidence, not an executed visual smoke result.

Ownership and teardown obligations:

- A layer child owns the composite polyline before attachment; every session uses fresh children. Close callback authority first, detach editor-owned callbacks, terminate editing through public `disableEditing`/`endEditing`, remove the owned outer layer, and independently attempt remaining owned-resource cleanup. Cancel, repeated sessions, track switching, layer removal and uninstall follow the same captured cleanup path. Never restore or recreate a semantic source.
- Normal vendor `endEditing` removes helpers and markers; `onRemove` also terminates editing and clears markers (`vendor/leaflet-partially-editable-polyline.js:104–107,198–212,335–358,601–608`). Marker callbacks are detached before marker removal. Leaflet marker removal disables dragging, finishes an active drag and removes document pointer listeners (`node_modules/leaflet/src/layer/marker/Marker.js:129–141`, `src/layer/marker/Marker.Drag.js:47–55`, `src/dom/Draggable.js:55–69,172–199`, latter paths relative to Leaflet). Session/layer guards must reject teardown-triggered or delayed dragend/history callbacks.
- Failure limitation: vendor sets `_editing=false` before removing helpers. If helper removal throws, a subsequent public `endEditing()` returns early; no safe complete helper retry is established by its public API. Do not mark composite cleanup `retry:"safe"` without evidence. Continue independent removal obligations, retain/report original failure and residuals, and never claim successful cleanup or active authority restoration. Do not use private cleanup to hide this limitation.
- Existing lifecycle guarantees apply if vendor composite cleanup leaves unresolved residual resources: cleanup continues for independent obligations, and original errors and residuals remain reported. On plugin teardown or setup rollback, the plugin remains non-discoverable in `cleanup-failed` quarantine; reinstallation is blocked until cleanup is complete. Only explicitly verified retry-safe failed cleanup records may be retried, and successful records never rerun. Do not mark vendor helper or composite cleanup as retry-safe without evidence. Guaranteed recovery of every residual is not a new requirement; best-effort cleanup and truthful residual reporting remain the accepted policy. This clarifies existing lifecycle guarantees, not the scope of the pane exception or a new architecture amendment. Normative references: `plugin-architecture/ARCHITECTURE.md:38,158–168,196–207,804–821` (cleanup truthfulness, failed setup quarantine, Scope close/retry and plugin uninstall/reinstall). HEAD corroboration: `src/plugins/runtime/runtime.js:101–105,271–300` rejects quarantined installs and retains quarantine when cleanup fails; `src/ownership/scope.js:239–290,315–330` retains child/local residuals and failed-scope state.
- Add focused tests for public teardown during point/midpoint drag, cancellation, outer-layer removal, repeated sessions and uninstall/reinstall; assert no surviving markers/helpers/listeners on successful cleanup and no late draft mutation. Inject helper/marker removal failures to verify truthful residual reporting and continued independent cleanup. Browser tests must also check actual document-pointer release and stacking.
- Add a focused runtime integration test: inject unresolved vendor composite cleanup residuals during teardown, verify independent cleanup obligations still run and original errors/residuals remain reported, then assert the plugin is non-discoverable and `use()` cannot successfully reinstall it while quarantine remains. Repeated `unuse()` must attempt only explicitly verified retry-safe failed records, must not rerun successful cleanup or unverified vendor helper cleanup, and must retain quarantine/reinstall rejection while any residual remains. Reinstall is permitted only after complete cleanup under the existing lifecycle contract; the test must not invent a guaranteed recovery path for non-retry-safe residuals.

**Blocked:** affected placement integration until narrowly scoped B is approved and usability/cleanup checks pass. No general third-party pane exception is proposed or approved. Cleanup checks enforce the existing best-effort, truthful-residual and quarantine/reinstallation policy above; they do not require guaranteed recovery of every vendor residual. A/B/C remain unapproved, and vendor files remain unchanged.

### C. Entry-associated presentation lifetime

**REQUIRES ARCHITECTURE REVIEW BEFORE IMPLEMENTATION**

**Normative requirement:** Architecture §42 removes semantic lookup and selection authority first, invalidates primary presentation, then disposes generations/overlays before remaining entry resources and final `removed`.

**Current fact:** `removeRecord` removes public lookup, invokes private selection/rendering hooks, awaits entry-scope cleanup, then publishes `removed`, including after cleanup failure. The 4H early-removal proposal was discarded. No accepted equivalent public mechanism exists.

**Counterexample:** A milestone overlay remains while an entry disposer is held indefinitely. The entry is already absent and its primary rendering is withdrawn, but Milestone receives no final notification. Failed cleanup likewise delays withdrawal until after the failed attempt.

Preserve the existing `removed` timing. Propose a narrow generic lifetime binding:

```js
context.entries.bindPresentationLifetime(entryId, { scope })
// → immutable { dispose(): Promise<void> }
```

- Bind an existing consumer-owned child scope containing presentation resources to the entry.
- EntryStore owns only the association and resource-close obligation; the plugin remains the single scope/resource owner.
- Validate scope ancestry and entry liveness before registration.
- Logical deletion synchronously closes all captured bound scopes before remaining entry-resource cleanup.
- Milestone installs synchronous abort withdrawal for its attachments; **invalidation alone is insufficient**.
- Entry removal awaits bound resource cleanup attempts before closing remaining entry resources. This joins actual resource disposal, not arbitrary plugin work.
- Failure does not resurrect presentation or block attempts to clean remaining resources.
- Retain failed close obligations and original errors through existing residual/safe-retry machinery; provider lease releases last after required cleanup succeeds.
- Plugin uninstall and entry removal share captured idempotent close attempts.
- Explicit lease disposal closes the bound scope; it cannot detach still-active presentation from deletion protection.
- `clear()` uses the same private ordering while retaining final batched notifications.

No new event bus, Milestone-specific branch, public entry signal, or editor source dependency is introduced.

Required tests cover held cleanup, failure/retry, delete/clear ordering, already-closing consumer, uninstall races, reinstallation, callback reentrancy and zero presentation resurrection.

**Blocked:** affected 4J-D deletion-lifecycle integration until reviewed.

