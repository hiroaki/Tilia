# Phase 4J — Complex Plugin Migration Implementation Plan

**Target document:** `plugin-architecture/phase-4/PHASE-4J-IMPLEMENTATION-PLAN.md`

**Planning status:** The user has written the reviewed plan into this file. This revision strengthens the plan against HEAD `6e12a85a0172c663787747e77ba5fa619ff17330`; only this planning document is changed. No production code, tests, vendor files or normative documents are changed. Verified implementation facts, confirmed user decisions and unapproved proposals are distinguished below.

## 1. Executive summary

Migrate, in the roadmap’s exact order:

1. **4J-A:** GPX Export.
2. **4J-B:** Route Search.
3. **4J-C:** Track Editor.
4. **4J-D:** Milestone.

Reuse the accepted GPX model, serializer, typed creation commands, standard UI, guarded capabilities, and Scope lifecycle. No new structural GPX editing commands are needed for these consumers.

The confirmed editor workflow creates an independent draft and saves a new entry. Source modification or deletion does not terminate editing or prevent Save Copy. Route Search retains automatic creation of GPX entries; a separate preview-and-confirm workflow is excluded.

Three issues require architecture review before affected implementation:

- **A:** Temporary semantic-target presentation suppression, independent of persistent visibility preferences.
- **B:** A pane exception limited to internal editing markers and drag helper lines created by the unmodified `PartiallyEditablePolyline` library.
- **C:** Entry-associated presentation cleanup before remaining entry-resource cleanup.

The editor’s source-deletion behavior is a confirmed user decision requiring a documentation correction to the roadmap. Amendments A/B/C are **not approved APIs**; the roadmap correction does not reopen the confirmed decision.

## 2. Normative roadmap scope

The user's explicit task instructions and confirmed decisions govern this investigation. Within that scope, use `ARCHITECTURE.md`, `MIGRATION-PLAN.md`, reviewed contracts and accepted HEAD to establish existing requirements and supported interfaces. In particular, the user has decided that source deletion must not terminate initialized detached draft editing or prevent Save Copy; the obsolete roadmap clause cannot override or condition that decision. Preserve applicable document review/recording procedures when reconciling the roadmap. New architecture/API/pane proposals A/B/C still require their own approval before implementation.

| Required feature | Normative requirement | Current status | Existing dependencies | Target dependencies | Semantic capabilities | UI capabilities | Legacy dependencies removed | Required tests | Explicit deferrals |
|---|---|---|---|---|---|---|---|---|---|
| GPX Export | Migration §16: selected-entry snapshot export; owned download resources | Disabled; old loader remains | Panel, mutable core entries, serializer, map control, refresh | GPX domain, Panel, Toolbar; optional Status | Immutable document read; no mutation | Toolbar action, Panel mount | Mutable sources, old service access, control and refresh integration | Serialization, selection list, downloads, URL/listener cleanup, round trip | Combined/multiple-entry export |
| Route Search | §16: client/form reuse, request children, automatic persistent GPX output; no InputRegistry integration | Disabled; pure client/helpers tested | Phloem endpoint, Leaflet markers, broad app/core, floating surfaces | GPX domain, Toolbar; optional Status | GPX creation with cancellation signal | Toolbar launcher, existing floating mount | `addGpxSource`, refresh, unmanaged requests/listeners | Client, form/markers, overlapping requests, partial creation, uninstall | Pre-save preview and confirmation |
| Track Editor | §16: reuse draft/history/vendor; temporary resources; Save Copy | Disabled; draft/history/form tests remain | Panel, mutable source access, legacy interactions, vendor | GPX domain, Panel, Toolbar; proposed suppression capability | Snapshot initialization and new-entry creation | Toolbar action, Panel mount, session inspector | Mutable source reads, foreign track bindings, visibility writes, refresh, manual session ownership | Existing 14 browser scenarios, draft independence, save races, lifecycle | In-place save, complete-document editor, stable application point IDs |
| Milestone | §16: semantic geometry, Track-mode distance, independent derived overlays | Disabled; one legacy integration test | Foreign track layers, mutable app state, refresh | GPX domain; proposed suppression read/notification and presentation-lifetime capabilities | Immutable document and distance data | No new controls required | Interaction Hub, foreign layer listeners/readback, arbitrary pane offsets | Positions, multiple tracks, gaps, zoom, visibility/suppression, deletion ordering | Segment-mode switch and new configuration UI |

Already completed in 4H/4I:

- Canonical GPX semantics, serialization, queries, creation, point updates, structural replacement, visibility and style commands.
- GPX rendering, semantic selection, popup/presentation and Photo inference.
- Toolbar, Panel, Layers, Settings, Elevation and standard input transports.
- Scoped styles, guarded UI mounts, input cancellation, Drop binding and own-commit activation.

Do not duplicate these implementations.

**Discrepancies requiring explicit treatment:**

- The prompt’s separate route preview/commit assumptions conflict with verified HEAD. The user confirmed automatic saving.
- Migration §16 explicitly requires `original removal cancellation`. Record a focused documentation correction replacing that obsolete requirement with the user's confirmed source-independent editing decision. Document review checks the accurate reconciliation, not whether the decision remains valid.
- Historical 4G/4I documents contain “review/acceptance pending” wording. Their explicit amendment approvals and implemented HEAD establish available contracts; those phrases do not make discarded proposals available.
- The roadmap mentions Scope URL/timer helpers conceptually. HEAD supplies `defer` and `track`, not dedicated public URL/timer methods.

## 3. Accepted 4A–4I baseline

The following are **current implementation facts**, not inferred historical interfaces.

| Capability | Actual surface and boundary |
|---|---|
| Scope | `signal`, `alive`, `child({label})`, `defer(disposer,{label,retry})`, `track(promise,{label,cancel,await})`, `assertAlive()`, `guard(callback)`; child scopes additionally expose `dispose()` |
| Plugin lifecycle | `setup(context, options)`; cleanup is a function or `{dispose()}`. Setup return values do not publish services. `context.lifecycle.afterCommit(callback)` is setup-only and launches separately owned work |
| Services | `provide(key, implementation)`, `require(key)`, `optional(key)`, `subscribe(key, listener, options)`; cached facades capture exact provider and consumer lifetimes |
| Domains | `context.domains.require(gpxDomainKey)` returns the guarded GPX facade. Provider registrations and instances remain private |
| Entries | `list()`, `get(id)`, `clear()`, `setVisible(id,boolean)`, `remove(id)`, `subscribe(listener,{emitCurrent})` |
| Entry envelope | Immutable `{id,domain,visible}`. IDs are opaque; consumers must not coerce select values through `Number()` |
| GPX view | `get(id)` returns `{entry,revision,snapshot}`; snapshot contains `{data,preferences,derived}` |
| GPX queries | `getDocument(id) → {entryId,revision,document}`; `getExtent`, `getDistance`, `getElevationProfile`, `getNearestPoint` accept the existing typed target options |
| GPX commands | `create(value,{visible,signal})`; `replaceData`, `updatePoint`, category/track visibility, style and derived commands require current `expectedRevision` for mutation |
| Selection | `getCurrent()`, `request(candidate)`, `clear()`, change-only `subscribe(listener)`; GPX supplies `selection.createCandidate(entryId,target)` and `resolve(entryId,ref)` |
| Contributions | Fixed Toolbar action/mount variants; primary Layers and Popup adapters; multi-provider Settings contributions |
| Panel service | `open({id,title,layout,mount})`, `toggle(spec)`, `close(id?)`, `isOpen(id)`; open returns a captured disposal handle |
| UI mounts | `mountSurface({id,surface,rank,ariaLabel,mount})`, where surface is `panel` or `floating`; callback receives `{container,scope}` |
| Status | Optional typed `statusServiceKey` exposes `set(text)`; errors also go to diagnostics and plugin-local UI |
| InputRegistry | `dispatch(input,{signal}?)`; handlers receive `{input,signal,scope}`. Route/editor output bypasses input dispatch |
| MapFacade | `listen`, `attachLayer`, `mountControl`, `createPane`, `fitBounds`, `panTo`, `setView`, `getViewport`, `project`, `unproject`, `advancedLeafletMap` |
| Rendering | `getStatus`, `list`, `subscribe`, `retry`; these describe renderer-controller status, not suppression state. No supported suppression read/notification interface exists in HEAD; see unapproved A. Complex consumers must not use retry as a replacement for refresh |
| Presentation | Current handles include permanent invalidation `signal`; Leaflet resources and generations remain private |

Ownership closure revokes authority synchronously, then cancels tasks, awaits explicitly awaitable work, disposes children, and runs cleanup records. Resource-free network continuations need observation and guards, not a blanket uninstall settlement barrier.

Accepted amendments available in HEAD:

- **4G:** PresentationHandle invalidation signal; native caller-signal cancellation at domain-create publication.
- **4H:** Canonical model and queries. No generic amendment was approved; the proposed early-removal event was explicitly discarded.
- **4I:** Input operation cancellation/outcome contract, host Drop binding, and `lifecycle.afterCommit`.

## 4. Current complex-plugin inventory

| Plugin | Observable behavior and state | Resources, async work and cleanup | Classification |
|---|---|---|---|
| Export | One selected GPX entry; first-entry fallback; hidden entries eligible; creator option; filename suffix helper; local download | Panel/control DOM; object URL and unowned zero-delay revoke timer; refresh-driven list; no map geometry | Reuse serializer and filename helper; replace loader integration and download ownership |
| Route Search | Car/Bike/Foot profiles; coordinate text forms; unlimited via rows; map context menu; draggable S/Via/G markers; timeout/API key/import limit; automatically imports up to three alternatives | Floating form/menu, marker group; asynchronous POST; only timeout cancellation; no uninstall cancellation or stale-result barrier | Reuse profiles, coordinate parsing, naming, request body and response logic; adapt client cancellation; replace loader integration |
| Track Editor | Visible source tracks become draft segment layers; all source tracks are copied; local editing window, point/rectangle selection, inspector, history, Save Copy and Cancel | Vendor layers, rings, rectangle shield, capture listeners and timers; manual cleanup; hides persistent original-track preferences; cancels if original disappears | Reuse draft/history/selection algorithms; adapt form and interaction controllers to scopes; replace loader authority and visibility integration |
| Milestone | Automatically displays labels on logical tracks; zoom-dependent intervals; independent distance series per track; labels at the first recorded point reaching each threshold | Independent markers, foreign-layer add/remove listeners, mutable-entry cache, zoom listener and refresh callback | Extract/reuse calculation and labels; replace discovery, cache lifetime and presentation integration |

Existing coverage:

- Export has no dedicated plugin suite; descriptor assertions are embedded in the editor-loader suite.
- Route client: seven tests; helpers: fourteen; profile suite: six. The “loader” suite tests profiles rather than an installed plugin.
- Editor: draft/history, selection, form, rectangle and ring suites; fourteen browser scenarios.
- Milestone: one legacy app/layer integration test.

Samples:

- Editor composition appears in `samples/editor/editor.js`, `localhost.html` and `chiyoda-ku.html`; these currently request disabled IDs.
- Other editor demonstration files remain useful interaction references.
- GPX fixtures cover tracks, routes and multi-track elevation.
- No dedicated production export/route/milestone smoke currently proves target integration.

Important existing limitations to preserve explicitly:

- Save Copy is **track-only**. Routes and waypoints are excluded by the README and draft test; metadata and additional descriptive point fields are not currently copied.
- No in-place save mode exists.
- Track/segment deletion occurs through deleting their final points; there are no separate deletion tools.
- Milestone positions snap to threshold-crossing recorded points. Do not replace this with interpolated positions.
- Route output is a **track plus Start/Via/Goal waypoints**, not a GPX route.

## 5. Dependency graph

Proposed hard dependencies:

```text
x-gpx-export   → tilia-gpx-domain, tilia-panel, tilia-toolbar
x-route-search→ tilia-gpx-domain, tilia-toolbar
x-track-editor→ tilia-gpx-domain, tilia-panel, tilia-toolbar
x-milestone   → tilia-gpx-domain
```

Status remains optional for every plugin. None requires GPX Renderer, GPX UI, Layers, Elevation, Photo or EXIF.

The accepted rendering/presentation foundations would supply proposed capabilities A/C only after approval. A's state/read/notification service must exist independently of renderer registrations; Milestone requires A as well as C. Neither creates a dependency on another complex plugin or on GPX Renderer.

Keep catalog metadata and loaded descriptors identical. Runtime retains deterministic dependency installation, provider-lease uninstall restrictions, and rejection of removing required hosts/providers while dependents remain.

## 6. Shared GPX semantic command analysis

**Decision:** Add no new committed structural commands for Phase 4J.

| Operation | Required use and existing contract |
|---|---|
| Create GPX entry | Route Search and Save Copy use existing `gpx.create`; provider normalizes semantic values; atomic new entry, initial revision, application ownership |
| Copy semantic data | Editor captures one immutable source view and constructs its local draft; creation publishes values only |
| Move/update elevation/time | Entirely draft-local in editor; existing `updatePoint` already covers committed integration tests |
| Insert/delete points | Draft history operations only |
| Delete segment/track | Existing draft deletion removes empty parents; Undo restores snapshots and local IDs |
| Empty structures | Canonical model preserves existing empty structures; draft operations retain their documented empty-parent deletion behavior |
| Create/replace GPX routes | Not required by Route Search’s verified output or track-only editor |
| Waypoints | Route creation includes named waypoints; export preserves canonical waypoints |
| Structural replacement | Existing `replaceData` is sufficient for external-change integration tests; editor Save Copy does not replace its source |
| Expected revision | Mandatory for updates; unnecessary for independent new-entry creation |
| Reference remapping | Existing attribute updates reconcile revision/index refs; `replaceData` invalidates structural refs; draft IDs never enter application selection |

For existing committed commands:

- Invalid input or stale revision fails before publication.
- Changed mutations increment revision once; no-op commands retain revision.
- Semantic state and SelectionStore reconciliation commit together.
- Document selection survives replacement; structural selections are invalidated.
- Rendering failure cannot roll back committed semantics.
- Creation cancellation before publication prohibits a new entry; cancellation after publication preserves it.
- Cleanup failures retain original evidence, residual obligations and provider leases.

No stable global point IDs, guessed identity mappings, or generic reference-remapping API are proposed.

## 7. GPX Export migration design

- Register a standard Toolbar action opening the existing Panel service.
- Maintain selected entry ID locally; update choices through EntryStore subscriptions. Export all GPX kinds, including route-only, waypoint-only, empty and hidden entries.
- Use an ID-to-option mapping; do not assume numeric IDs.
- At activation, capture one `getDocument` result. Serialize that immutable document with the existing `serializeGpxSource(document,{creator})`.
- Filename remains `makeFileName(document.name || fallback)`. Preserve case and existing `.gpx` suffix handling.
- Export the captured revision even if the entry subsequently changes or disappears. If deletion precedes capture, report unavailable entry.
- Create a download child scope owning its anchor, object URL and scheduled revocation. Reserve cleanup before each acquisition.
- Place the hidden anchor inside the assigned plugin mount subtree. Dispose the child after the click and next-task revocation; uninstall also closes it.
- Serialization failure creates no download. Never synthesize elevation/time zeroes or report completion after the owning UI has closed.

Reuse the canonical supported subset: document metadata name/description/time; track and route name/description; point coordinates, optional elevation/time and supported descriptive fields. Unsupported GPX extensions remain unsupported; their omission is not corruption of supported fields.

## 8. Route Search migration design

Preserve automatic saving and current options, labels, forms, context menu and draggable temporary markers.

- Use a Toolbar launcher and existing floating UI mounts, retaining the separate floating form/menu workflow.
- Bind contextmenu/click/movestart through MapFacade. The typed contextmenu coordinates suffice; suppress the native menu with a scoped listener on the assigned UI surface where necessary.
- Attach owned markers/groups through MapFacade. Marker events may read the plugin’s own marker coordinates.
- Keep markers visible when the form is closed, matching HEAD. Clear Form removes them; uninstall removes all temporary resources.
- Each admitted request captures immutable profile/points/options and owns a request child.
- Add caller `signal` support to the client. Compose it with timeout cancellation, detach forwarding listeners, and clear the timeout on every outcome.
- Distinguish explicit cancellation from timeout. Retain upstream status, code, details and original error evidence.
- Observe late fetch/body failures. Validate importable geometry and coordinate bounds before creation; missing optional GPX elevation/time remain null.

**Overlapping requests:** latest admitted valid request wins. Superseding aborts the old operation immediately. The visible Search button remains disabled while busy, preserving normal UI behavior; internal/reentrant admission still obeys this rule.

Create alternatives sequentially using:

```js
gpx.create(document, { visible: true, signal: requestScope.signal })
```

Recheck operation identity/liveness before each creation and after settlement. EntryStore’s signal guard is the publication barrier.

- Already committed alternatives remain after cancellation, supersession or uninstall.
- Stop at the first creation failure; retain confirmed partial results and report partial success accurately.
- Do not attempt batch rollback or recreate committed entries automatically.
- Fit the first successful entry only while the request is still current and the entry remains available.
- Renderer absence/failure affects presentation only.
- Keep provider/distance/duration/warnings as result UI data; do not expand the canonical GPX schema to preserve the unsupported `routeSummary` field.

## 9. Track Editor migration design

### Independent draft authority

Start Editing captures the source name, document, revision and initial visibility once. It constructs a detached track-only DraftDocument.

After initialization:

- All editing/history/selection belong to the draft.
- Source updates do not rebase the draft.
- Source deletion does not end editing, discard work or disable Save Copy.
- Renderer replacement/removal does not affect editing.
- Save Copy requires neither source existence nor source revision.
- Cancel never recreates or modifies the source.

Cancel discards the draft/history and editor-owned resources and releases only its temporary suppression leases. Release reveals current authoritative persistent visibility subject to other active leases; it never restores captured initial preferences. Source deletion invalidates source suppression only, not draft authority. Milestone deletion handling remains independently owned by Milestone and the proposed C binding, never an editor callback.

Replace the legacy deletion behavior in `loader.js`: its refresh callback calls `finishSession({save:false})` when the source disappears, and `finishSession({save:true})` discards the draft if the source is missing. No dedicated unit test establishes these as required behavior.

### Reuse and adaptation

Retain stable editor-local IDs, history snapshots, local selection reconciliation, local-window editing, restoration hints and bulk deletion algorithms.

Replace `cloneGpxSource` initialization with direct copying from canonical immutable track data. Preserve empty-track/segment indexing so `originalTrackIndex` is not changed by legacy normalization.

Continue track-only output. New complete-document draft support is deferred.

Adapt controllers to accept their owning scopes and captured session identity. Every layer rebuild gets a new child; callbacks from old children are inert.

Preserve:

- Point/midpoint click distinctions.
- Drag selection behavior.
- Inspector precision, focus, scroll, Enter/blur commit and Escape cancellation.
- Null elevation/time and inserted-point metadata.
- Undo/Redo shortcuts and redo invalidation.
- Rectangle inclusive hit-testing, retry, Escape and map-dragging restoration.
- Final-point empty-parent removal and Undo restoration.
- Track/segment switching and map-background local-edit termination.

### Save Copy

Admission commits a valid inspector edit, finishes/cancels any active transient gesture, freezes a detached output value and enters `saving`.

Create the new entry using a save-operation signal. Disable draft mutations while saving.

- Repeated Save returns/observes the same active attempt.
- Precommit failure leaves the draft/history open and editable.
- Successful creation ends the session and creates fresh normal renderer resources.
- Cancel/uninstall aborts an uncommitted save.
- If publication wins the race, the new entry survives later Cancel/uninstall.
- Draft layers never transfer to EntryStore or RenderGeneration.
- Capture the initial draft name for the edited suffix; do not reread a changed/deleted source name.

## 10. Milestone migration design

- Read GPX documents through the typed domain facade.
- Compute one independent series per logical track using existing Track-mode distance interpretation.
- Include inferred gaps between nonempty segments within a track; never connect different tracks.
- Reuse interval selection and threshold-crossing placement. Cache by entry revision, track index and interval.
- Preserve label formatting and HTML escaping; markers remain noninteractive and keyboard-disabled.
- Use `getViewport().zoom`, MapFacade `zoomend`, and plugin-owned overlay attachments. No advanced map access is needed.
- Effective visibility combines whole entry, tracks category, track preference, and temporary suppression where approved.
- React to creation/domain changes/visibility changes/clear and suppression changes. Recompute from current immutable snapshots; never read renderer geometry.
- Renderer availability does not determine milestone availability.
- Close per-entry presentation scopes on logical deletion through proposed amendment C. Final `removed` remains a list-reconciliation notification.

After approval of A, subscribe once at plugin lifetime through `rendering.subscribeSuppression(listener,{scope,emitCurrent:true})`; initialize from its current delivery (normally synchronous; nested delivery is specified in A) and reread `rendering.getSuppressionSnapshot()` on invalidation. These are proposed interfaces, not HEAD APIs. For track index `i`, suppression membership means a record with the same entry ID, GPX domain key and `ref.kind === "track"`, `ref.trackIndex === i`, `ref.revision === view.revision`. Combine that result with current entry/category/track preferences. No private adapter access, reading opaque selection candidates or SelectionStore mutation is needed. Subscribe before initial overlay construction; do not use renderer status subscriptions, layer events or renderer existence as substitutes.

Treat notification payloads as invalidation hints. Check current entry liveness, revision, child identity and suppression immediately before publishing attachments and again after callback-bearing acquisition; withdraw a candidate if reentrancy changed those conditions. Missing entries never acquire new presentation scopes. A's logical-removal notification does not replace C's synchronous withdrawal and awaited presentation-cleanup barrier. Uninstall closes the suppression subscription and entry children; old callbacks cannot rebuild overlays.

There is no new settings panel or enable switch. Installation enables milestones; uninstall disables them.

## 11. Standard UI contribution integration

Use existing mechanisms only:

- Toolbar action descriptors for Export, Route Search and Editor.
- Panel service for Export and Editor.
- Floating `mountSurface` for Route Search.
- Optional Status service, local error text and diagnostics.
- Existing Layers/Settings/Popup/Elevation remain unchanged.

HEAD has no general contextual-action registry or dedicated export/output registry. These workflows do not require one.

Mount listeners and row-rebuild resources belong to fresh mount/row scopes. Retain captured Panel disposal handles for teardown; do not call a dead service facade to close an old panel.

Closing an editor panel removes its form listeners but does not discard the plugin-owned draft session. Reopening mounts the same current draft state.

No generic host imports a complex plugin.

## 12. MapFacade and advanced-access policy

| Consumer | Map access |
|---|---|
| Export | None |
| Route Search | Typed events, viewport actions and owned marker attachments |
| Editor | Advanced map access justified for vendor editing, container projection, rectangle gestures and session keyboard handling |
| Milestone | Typed zoom/viewport and owned markers |

MapFacade attachments currently capture plugin ownership. Shorter-lived consumers reserve child cleanup and dispose captured attachment leases when their child ends, following the accepted Elevation pattern.

Editor-only direct resources must be registered before attachment and follow the accepted pane/band policy, including draft polylines, rings and rectangle UI. Only vendor-created internal point/midpoint editing markers and drag helper lines are candidates for the narrowly scoped, unapproved exception B. Treat the vendor polyline as a session-owned composite resource; supported termination normally cleans its internals, with the failure limitation in B. Do not enumerate foreign layers, patch Leaflet globally, or reach into vendor arrays.

Rectangle DOM is mounted inside an assigned floating UI subtree. Raw document/container listeners are permitted only as explicitly scoped interaction resources; they must not create unrelated DOM ownership.

## 13. Selection and rendering integration

| Plugin | Application selection | Local selection/presentation |
|---|---|---|
| Export | No selection mutation; local export-entry dropdown | Panel state only |
| Route Search | No application selection mutation | Point form, marker/menu state and result list |
| Editor | Reads SelectionStore before a session to follow normal GPX track selection | Draft point/multiple selection, rings, inspector and rectangle |
| Milestone | Neither reads nor changes application selection | Noninteractive derived markers |

Replace editor foreign-layer click bindings with SelectionStore observation. A normal renderer track-point selection updates the editor’s source dropdown while no session is active. Draft interactions do not issue semantic candidates.

Do not call `map.closePopup()` to seize presenter ownership. After Amendment A approval, temporary suppression must invalidate affected presentation handles while preserving semantic selection.

Normal GPX output uses RenderingCoordinator. No manual refresh/retry call is added by the migrated plugins.

Retain definitive replacement-failure policy: stale fallback is retired when newer-revision rendering definitively fails; committed semantics remain.

## 14. Plugin composition and lazy loading

At each checkpoint:

- Add a literal dynamic loader and matching dependency metadata for that plugin.
- Move only that plugin from disabled to enabled classification.
- Update catalog/classification assertions and remove its loader from the 4I forbidden-symbol exceptions.
- Leave later plugins disabled.
- Preserve eager-graph exclusion of optional implementations and editor vendor code.

The editor samples must explicitly install the normal GPX input/renderer/UI roles needed for their production behavior. Adding a complex plugin must not implicitly install the renderer.

Adapt samples incrementally without using unavailable future checkpoints. By 4J exit, all four requested IDs resolve through the normal production catalog and no feature exclusion remains.

Keep the allowlist mechanism itself until 4K.

## 15. Ownership and lifecycle design

```text
Export plugin
  ├── Toolbar contribution/styles
  ├── Panel mount children
  └── Download children: anchor, URL, timer

Route Search plugin
  ├── Floating form/menu mounts
  ├── Marker-set children and marker listeners
  └── Request children: cancellation, timeout, observed work

Editor plugin
  ├── Toolbar/styles/Panel handles
  └── Editor-session child
       ├── Detached draft, history and local selection
       ├── Temporary source-suppression leases
       ├── Track/segment layer children
       ├── Local interaction and ring children
       ├── Rectangle gesture child
       ├── Session keyboard/map listeners
       └── Save-operation child

Milestone plugin
  ├── Semantic/zoom and proposed suppression subscription resources
  └── Entry presentation children (proposed C binding)
       └── Track/marker-set children and caches
```

Setup publishes only registrations after transaction commit. Installation failure cleans partial effects.

Closure first makes callbacks inert. Dispose captured resources, not newly resolved public data. Best-effort cleanup continues after failure, retains safe residuals and never restores authority.

Observe resource-free promises without making uninstall await their arbitrary completion. Reserve and await actual resource-acquisition obligations when late resources require disposal. Never track a promise that awaits disposal of its own scope.

Reinstallation creates fresh identities and starts with no draft/request state; committed entries survive.

## 16. Error semantics

| Failure | Required outcome |
|---|---|
| Invalid GPX/target | No partial semantic publication |
| Export entry unavailable before capture | Report unavailable; no download |
| Serialization/XML/date failure | Preserve original error; clean download resources; no invented values |
| Routing network/timeout/invalid response | Local error/status; no unconfirmed creation |
| Cancelled/stale route request | No subsequent publication; retain prior committed alternatives |
| Semantic creation failure | Preserve confirmed partial route entries or editor draft |
| Stale expected revision | Existing typed mutation failure; no retry using guessed revisions |
| Source deleted during editing | Continue independent draft and Save Copy |
| Renderer unavailable/failed | Semantic entry remains; report presentation state independently |
| Required UI unavailable | Installation/mount failure under existing host contract |
| Plugin uninstall during work | Revoke authority and cancel temporary work |
| Cleanup failure | Retain residuals and original causes; do not claim rollback or reactivate UI |

Do not use generic promise rejection as evidence that nothing committed.

## 17. Race matrix

| Race | Authority and expected behavior | Invalidation mechanism | Required test |
|---|---|---|---|
| Export vs mutation | Captured immutable revision is exported | Snapshot boundary | Mutate after capture; output remains consistent |
| Export vs deletion | Before capture fails; after capture remains valid | Capture and download scope | Delete at both boundaries |
| Route vs newer request | Latest valid admission wins; prior commits survive | Request identity and signal | Held fetch and held create |
| Route vs uninstall | No late uncommitted output/UI/fit | Scope + publication signal | Noncooperative response settles after uninstall |
| Route creation failure | Stop; retain confirmed alternatives | Per-entry commit evidence | Fail second of three creates |
| Editor vs source mutation | Draft/history unchanged; no rebase | Detached draft | Attribute and structural replacement |
| Editor vs source deletion | Editing and Save Copy continue | No source dependency | Delete source, edit, Undo and Save Copy |
| Save vs Cancel | Precommit cancellation prevents creation; postcommit entry survives | Save signal and session state | Pause before publication; cancel in created callback |
| Save vs uninstall | Same commit boundary; no stale UI | Scope + signal | Both orderings |
| Save vs repeated Save | One active attempt | Captured operation identity | Double activation and reentrancy |
| Track switch vs drag | Cancel old gesture; ignore late callbacks | Old layer-child closure | Inject delayed dragend |
| Rectangle delete vs Undo | Atomic draft operation; no partial selection/history | Session-local synchronous commands | Restore final segment/track |
| Renderer replacement/uninstall vs editor | Draft resources remain functional; suppression persists appropriately | Separate ownership trees | Remove/reinstall renderer mid-session |
| Milestone recomputation vs mutation | Publish only computation from current revision | Revision/child identity checks | Mutation during callback-bearing acquisition |
| Milestone cleanup vs deletion | No active deleted-entry presentation before entry cleanup | Amendment C | Held and failed cleanup |
| Uninstall vs active UI | No stale listener/focus/menu/marker resurrection | Scope guards and captured handles | Invoke old callbacks after reinstall |
| Overlapping suppression leases | Releasing one does not reveal while another remains | Exact lease identities | Release/abort in both orders |
| Suppression subscription vs acquisition/release | Initial snapshot and queued changes have no missed transition; reentrant callbacks reread authoritative state | Proposed A serialized snapshot channel | Subscribe before/after acquire; release/acquire inside initial callback; throwing listener |
| Owner abort vs suppression read | Dead owner contributes no effective suppression, even before its cleanup listener runs | Scope liveness plus logical lease state | Read from an earlier abort listener; verify other live lease remains |
| Suppression vs replacement/deletion | Old structural targets never hide replacement tracks or recreate deleted-entry overlays | Domain reconciliation and A/C private hook ordering | Identical-shape replacement, held deletion cleanup and reentrant attachment |
| Vendor teardown vs active drag | No late draft/history mutation; all independent cleanup obligations attempted | Session/layer guards and public vendor/Leaflet removal | Cancel/switch/remove/uninstall mid-drag; helper-removal failure |

Use controllable promises, callbacks and fake timers; no arbitrary-delay synchronization.

## 18. Legacy deletion matrix

All four old loaders are disabled production code. Tests directly import some of them; editor samples currently request their disabled IDs. Helpers have their own integration/resource issues despite lacking the audit’s forbidden tokens.

| File/symbol or occurrence group | Replacement | Checkpoint/deletion | Regression proof |
|---|---|---|---|
| Export loader `getTrackEntries`, selection fallback, `renderPanel`: `core.state`, `entry.source`, numeric IDs | Entries list and immutable GPX views | A | Add/remove/hidden selection list |
| Export `downloadTextFile` | Scoped anchor/URL/timer child | A | Click/start failure and uninstall |
| Export `installMapControl`, old Panel methods, refresh, `stylesheets`, `destroy` | Contributions, typed service, scoped styles/cleanup | A | Installed host lifecycle |
| Route `setup`: `app.core`, old `mountSurface`, raw control | Guarded context and assigned mounts | B | Production install/open/close |
| Route `runSearch`: `addGpxSource`, `entry.source`, `refreshView`, app status/error | Typed create, local result values, optional Status/diagnostics | B | Automatic output and partial failure |
| Route marker group/events, propagation listeners, map `.on` | Owned attachments/listeners and MapFacade events | B | Marker drag/menu/uninstall |
| Route client timeout-only controller | Scoped caller cancellation and timeout composition | B | Cancellation/stale response tests |
| Editor entry lookup/start/save: mutable source/core | Immutable initialization and typed new-entry creation | C | Source-independent draft/save |
| Editor visibility getter/setter loop and `hiddenTracks` restoration | Proposed temporary suppression | C, review-gated | Current preferences revealed on release |
| Editor `subscribeInteractions`, `trackClickBindings`, foreign layer click | SelectionStore subscription | C | Normal-track source selection |
| Editor refresh callback and source-existence Save check | Remove source-dependent cancellation | C, confirmed decision; record roadmap correction | Save after source deletion |
| Editor form/rectangle/layer/ring listeners, timers and `.addTo` | Session/mount/gesture ownership | C | Existing behavior plus stale callbacks |
| Editor descriptor styles/setup-result control methods | Scoped styles and cleanup; no automatic service facade | C | Install/uninstall/reinstall |
| Milestone `entry.source`, `app.state`, foreign-layer discovery/listeners | Typed document/change snapshots | D | Renderer-free milestones |
| Milestone markers/cache/zoom/refresh/destroy state | Entry presentation scopes, typed zoom, proposed A read/notification and C binding | D, review-gated A/C | Revision/visibility/suppression/deletion cleanup |

After editor adaptation, `src/gpx/source.js` has no identified production consumer. Remove it if the import audit confirms this; replace obsolete test-shape coverage with canonical/draft behavior coverage. Do not retain a second normalization authority solely for tests.

Vendor files remain byte-for-byte unchanged.

## 19. Proposed architecture amendments

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

### Roadmap correction

Replace §16’s `original removal cancellation` (`plugin-architecture/MIGRATION-PLAN.md:1164`) with:

> Source deletion does not invalidate an initialized detached editor draft or Save Copy. Only optional source presentation suppression is invalidated.

Update editor smoke expectations accordingly and record the correction through the applicable document review procedure. This reconciles an outdated clause with an already confirmed user decision; it is not an unapproved architecture amendment or a request to approve source-independent editing again. Recording/reviewing the corrected wording must not make draft continuation or Save Copy conditional on the obsolete clause. This task changes only the plan, so the normative roadmap correction remains to be recorded separately.

## 20. Implementation checkpoints and sequence

| Checkpoint | Scope/prerequisites | Modules affected | Verification and completion | Temporary limitation |
|---|---|---|---|---|
| A | Accepted snapshot/serializer/UI only | Export loader/helper/styles, catalog/classification, focused tests/sample | Typed selected export; owned downloads; import/export/reimport smoke; remove export exception | B/C/D disabled |
| B | A plus existing creation/MapFacade/Scope | Route loader/client/helpers/styles, catalog/classification and samples | Automatic track/waypoint creation; cancellation/partial-result/lifecycle tests; production routing smoke | C/D disabled |
| C | B; approved amendments A/B; record roadmap correction reflecting confirmed decision | Editor integration/controllers/form/draft; rendering suppression state/read/notification/grouping; samples/tests | All editor scenarios plus source-independent Save Copy, scoped vendor stacking/gesture teardown and lifecycle tests; vendor unchanged; remove editor exception | D disabled |
| D | C; approved A read/notification contract and C lifetime binding | Milestone calculation/integration; suppression subscription; generic presentation lifetime binding; tests/composition | Renderer-free overlays including suppression; deletion ordering; full production audit; no disabled features | Public app destruction still 4K |

Implement shared prerequisites only at their actual consuming checkpoint. A/B can proceed independently of unresolved C/D architecture reviews.

## 21. Testing strategy

**Historical baseline:** The preceding planning investigation recorded `npm test` passing **75 files / 750 tests** at the inspected HEAD, plus a clean working tree and successful `git diff --check` at that time. These are historical results, not tests run for this document revision. The user subsequently wrote this plan into the target file. This revision checks repository contracts/source and document consistency; no new automated contract/plugin tests or browser smoke have been run. Proposed test cases below remain future implementation requirements.

Required implementation coverage:

- **Contract:** proposed suppression acquisition/read/serialized notification/grouping, narrowly scoped vendor pane exception and presentation-lifetime binding; §19-A subscription/overlap/reconciliation tests and §19-B gesture/failure tests; exact owner closure, staging where applicable, invalid arguments, currentness and cleanup.
- **Semantic:** creation atomicity/cancellation, expected-revision failure, point-update identity, replacement invalidation and app-owned result persistence.
- **Export:** multiple tracks/segments, routes/route points/waypoints, metadata, empty structures, null versus zero, XML escaping/special characters, invalid XML/date values, decimal formatting, GPX 1.1 namespace/order.
- **Round trip:** compare normalized supported semantic fields; filename is supplied separately on import. Unsupported extensions and source XML formatting are excluded from equality.
- **Plugin:** actual runtime installation, host mounts, semantic facades, subscriptions and optional Status.
- **Editor regression:** preserve all existing local editing/history/selection behavior; add deletion-independent Save Copy and failed-save draft retention.
- **Lifecycle:** setup rollback, active uninstall, resource failure, safe residual retry, reinstall, old callbacks and creator-independent committed entries.
- **Integration:** real GPX provider, EntryStore, SelectionStore, RenderingCoordinator and standard UI.
- **Race:** every §17 row with deterministic scheduling.

Replace obsolete descriptor/setup-result/legacy app fixtures without weakening observable assertions. Check all meaningful removed-source utility tests for canonical/draft equivalents.

Run focused suites during each checkpoint, then `npm test`, appropriate browser smoke, whitespace and import audits. Do not claim new implementation tests passed merely because the baseline is green.

## 22. Production smoke milestones

- **4J-A:** Import rich GPX through production input; export selected entry; download/reimport; compare supported semantics and null values; uninstall with a pending revoke timer.
- **4J-B:** Configure start/via/goal by form and map; drag a marker; execute a routing request against a controlled HTTP response; verify automatic GPX track plus named waypoints, normal rendering, result persistence and temporary-marker cleanup.
- **4J-C:** Restore all fourteen editor scenarios with semantic-band selectors where appropriate. Import multiple tracks/segments; move/insert/delete, inspect fields, Undo/Redo, rectangle retry/delete, switch segments/tracks, Save Copy and Cancel. Compare the original snapshot; verify new rendering and cleanup. Separately delete the source during editing and prove continued editing/save. Remove/reinstall the renderer without losing the draft. Verify the narrowly scoped vendor placement with overlapping geometry/UI and terminate point/midpoint drags through Cancel, layer removal and uninstall; repeat sessions and check pointer listeners and no stale history callbacks.
- **4J-D:** Install milestones; verify threshold-crossing positions and per-track distance reset; mutate geometry; change whole/category/track visibility and zoom; acquire overlapping suppression leases and release them in both orders while changing persistent preferences. Subscribe before/after acquisition, replace/delete the source, and remove/reinstall the renderer; verify current authoritative visibility and no stale overlays. Delete/clear with delayed cleanup; verify C's early withdrawal and uninstall cleanup. Repeat visibility/suppression behavior without GPX Renderer.

Use normal composition. Controlled network responses and existing public semantic APIs are acceptable; production compatibility shims and special test-only runtime paths are not.

## 23. Forbidden-symbol and import audits

After each checkpoint search migrated production paths for:

```text
app.core
app.state
core.state
state.entries / state.sources / state.layers
entry.source / entry.layer / entry.interactions
refreshView / addRefreshHandler
subscribeInteractions
selection-hub / interaction-hub
buildGpxOverlay / buildPhotoOverlay
```

Also inspect:

- Raw `.on`, DOM listeners, timers, `.addTo` and resource acquisitions for actual Scope ownership.
- `advancedLeafletMap`, layer enumeration and geometry readback: only justified editor access and reads of owned objects remain.
- Descriptor `stylesheets`, `{destroy()}` cleanup, old service indexing and setup-result publication.
- Generic host imports of complex/domain implementations.
- Eager public import paths to optional plugins/vendor.
- Literal dynamic imports, catalog/descriptor dependency agreement and cycles.

Keep exact remaining exceptions only for not-yet-migrated loaders. Remove them checkpoint by checkpoint; do not add helper or file exceptions.

The final audit traverses parsed production and sample imports, not just text matches. Only internal editing markers and drag helper lines from the unchanged vendor qualify for B's proposed exception, after approval. Audit all directly created editor resources against normal pane/band rules, and verify public composite teardown, failure reporting and unchanged vendor files.

## 24. Completion criteria

Phase 4J is complete only when:

- All four plugins are enabled in roadmap order.
- Amendments A/B/C are approved and recorded before their dependent implementation; the roadmap correction is reviewed/recorded as documentation reconciliation of the confirmed source-independent workflow, without reopening that decision.
- All enabled consumers use guarded target APIs.
- Editor draft/history survive source modification, deletion and renderer removal.
- Route/editor committed outputs survive creator uninstall.
- Temporary suppression never changes persistent preferences or semantic revision.
- Milestone reads and observes authoritative suppression independently of renderer presence; subscription races, overlapping leases, reconciliation and A/C deletion ordering meet the approved contracts.
- No foreign renderer resource access or legacy refresh authority remains.
- All plugin effects have deterministic Scope ownership and truthful cleanup failure handling.
- Milestone deletion cleanup obeys §42.
- Vendor files are unchanged.
- Any approved pane exception is confined to vendor-internal point/midpoint editing markers and drag helper lines; directly created editor resources meet normal pane/band policy, and gesture/cleanup failures are reported truthfully.
- Relevant contract, regression, race and production smoke tests pass.
- Final forbidden-symbol/import audits pass.
- Allowlist contains no feature exclusions.
- Remaining risks and measured test results are recorded without unsupported pass-count forecasts.

## 25. Explicit deferrals

- **4K:** Public terminal asynchronous `app.destroy()`, application-wide final teardown verification, allowlist scaffold removal and residual documentation purge.
- **Later:** Route preview-and-confirm workflow; batch atomic route creation; in-place editor save; complete detached GPX editor; route/waypoint editing; stable application point IDs; speculative structural commands; Segment-mode milestones; new milestone settings UI; unrelated visual/product changes.

Correct plugin uninstall, cancellation and cleanup are required now. No legacy mechanism is retained for 4K.
