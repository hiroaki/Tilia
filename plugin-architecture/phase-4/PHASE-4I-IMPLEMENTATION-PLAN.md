# Phase 4I — Standard UI and Presentation Implementation Plan

## 1. Executive summary

**Current implementation status:** implemented and verified after approval commit `7b7bb11`; 73 unit files / 731 tests and 33 noneditor browser scenarios pass. See [implementation, pinned EXIF and audit report](PHASE-4I-IMPLEMENTATION-REPORT.md). Implementation review/acceptance remains pending. The investigation baseline, planned execution targets and approval-time rationale below are retained as the design record; this status/report supersedes their future/pending bookkeeping. No additional contract change was needed.

Restore standard viewer UI and transports through accepted Phase 4A–4H foundations. Keep typed domain contributions, SelectionStore, the existing map-selection presenter and Scope ownership. A/B/C are approved on 2026-10-08; implementation is authorized after the approval documentation commit, with implementation verification complete and review/acceptance pending.

The previous plan received verdict C and was then reconsidered. The user now approves A/B/C and authorizes their documentation commit followed by Phase 4I implementation. See [approved amendments](PHASE-4I-CONTRACT-AMENDMENTS.md). Approval does not claim completed implementation/tests. Preserve the resolved standard UI specifications.

Three separate amendments are **APPROVED 2026-10-08 — IMPLEMENTED AND VERIFIED; REVIEW/ACCEPTANCE PENDING** (§21):

1. **A:** operation cancellation, `inputs.dispatch(input, {signal})`, including honest dispatch-level failure evidence while preserving accepted uninstall behavior.
2. **B:** a narrow host-owned Drop binding, joining host/contributor lifetimes without raw DOM access.
3. **C:** a narrow own-commit callback for Query startup. Internal `enqueuePostCommit` is not a plugin capability, and `scope.alive` does not prove activation.

Priorities: required behavior/correctness/ownership/cleanup, accepted architecture consistency, clear responsibilities/control flow, then avoiding mechanisms without a demonstrated requirement. Minimization is not the objective. Existing responsive uninstall behavior is the baseline; no blanket wait for every read/parse/dispatch is required. Ordinary product specifications remain resolved below. A/B/C approval gates are satisfied by explicit user approval. Investigation/verification obligations remain; a newly required contract change must stop its dependent work for review, not silently change approved semantics.

## 2. Normative scope and roadmap table

Current explicit user instructions govern this revision. Otherwise follow `ARCHITECTURE.md`, `MIGRATION-PLAN.md` and accepted 4A–4H contracts. HEAD supplies implementation evidence; it does not silently amend normative contracts. Record discrepancies and gate any new generic contract.

Verified baseline HEAD: `b4dbb30d3c914ffb6e970a481840c7a914936aea`, `feat: complete Phase 4H GPX vertical slice`. This is the accepted implementation baseline; the plan is included in the approval documentation commit.

The Phase 4I requirements are taken from Migration Plan §15, with smoke restoration from §23.

| Normative requirement | Current status / authority | Target authority | Required 4I work | Minimum from 4G/4H | Legacy deletion | Required coverage | Deferral |
|---|---|---|---|---|---|---|---|
| Panel/toolbar/layers/settings hosts | Panel, Layers, Settings exist; launchers mount individual controls | Typed hosts and their mount scopes | Complete panel layout/focus; aggregate standard launchers through a fixed typed toolbar point; reconcile rows locally | 4G introduced minimum hosts | Old surface manager and unsupported constructor wiring | Ordering, mounts, accessibility, focus, isolation | Complex forms: 4J |
| Deterministic contribution lifecycle | Existing staged contribution stores and guarded mounts | Same stores; host-owned mounts | Reuse engine; complete host reconciliation and teardown | 4G contracts and lifecycle fixes | Independent legacy mounting paths | Dormant points, add/remove, cleanup failure, remount | None |
| Generic layers tree and fallback | Generic envelope controls with domain mounts; complete-list redraw | EntryStore for envelopes; domain adapters for content | Stable entry rows, targeted updates, selection indication, Delete all | Photo rows in 4G; GPX hierarchy in 4H | Historical mutable-entry tree already replaced | Fallback, hierarchy, revisions, deletion | Structural editing: 4J |
| Selection popup/highlight presenter | Active target presenter | Existing presenter and presentation handles | Consolidate behavior, ownership, accessibility, regression coverage | 4G presenter; 4H geometry descriptors | Legacy elevation-owned popup/reveal state | Dismissal, replacement, unavailable renderer, teardown | None |
| Product Photo/GPX adapters | Photo tree/popup/settings; GPX tree/popup/style selector | Domain UI plugins consuming semantic APIs | Reactive domain content; GPX settings contribution; semantic fit/reveal | Both slices | Dead feature CSS and obsolete expectations | Domain integration and settings races | New semantic preferences excluded |
| Elevation presentation | Disabled legacy installer using `core` | GPX presentation plugin using semantic queries, SelectionStore, MapFacade | Replace installer; restore profile and bidirectional interactions | GPX profile query exists in 4H | Legacy selection caches, popup coupling, refresh | All elevation smoke behavior with migrated expectations | Segment mode excluded |
| Status product UI | Typed `statusServiceKey.set`; some unowned DOM listeners | Status provider and owned control | Scope listeners; accessible transient output; deterministic replacement | 4C | Unsupported raw installer | Optional status, dismissal, stale completion | None |
| Base-map product UI | Active catalog-driven selector; legacy installer also remains | Existing base-map catalog and selector | Scope listeners and integrate layout/style ownership | 4C | Legacy selector installer | Catalog removal/reinstall, selection failure | None |
| File/drop/URL/query transports | File picker active; other transports disabled | UI transport scopes → InputRegistry → domain handlers | Shared typed batch processing; scoped URL/query work; host-owned Drop | File minimum in 4G; GPX handler in 4H | Old callback/context/registry paths | Dispatch, discovery, cancellation, limits, smoke | Review gates apply |
| Typed subscriptions | EntryStore, SelectionStore, rendering and availability subscriptions exist | Same authoritative channels | Surface-specific snapshot projections and explicit teardown | 4C–4H | Manual refresh fan-out | Initial render, mutation, unsubscribe, stale callbacks | None |
| Accessibility/focus/error isolation | Partial panel focus behavior; mounts isolated unevenly | Generic hosts and assigned contribution subtrees | Keyboard launch/close, labels, focus recovery, per-item failure isolation | Basic 4G behavior | Unowned listeners and document effects | Keyboard and failure-injection tests | None |
| Feature stylesheet ownership | Leased styles exist; global UI CSS retains feature rules | Shared shell lease plus feature-owned leases | Move feature rules to owning plugins; remove dead rules | Photo/GPX/presenter leases | Permanent stylesheet helper | Lease cleanup, optional imports, visual smoke | Terminal app destruction: 4K |
| Removal of coarse refresh correctness | Application refresh APIs already absent; calls remain in disabled complex plugins | Typed subscriptions only | Audit enabled graph; retain exact 4J exceptions | Earlier authority cuts | Remaining standard UI legacy refresh | Forbidden-symbol/import tests | Disabled complex-plugin calls: 4J |

### Scope decisions confirmed during this investigation

- **Photo:** implement only per-entry `auto`, `local`, and `utc`. Older “global defaults/custom offsets deferred to 4I” notes in the migration records and 4G/4H plans are stale bookkeeping, explicitly superseded by this scope decision. Future defaults/offsets require a separate semantic feature design.
- **Forbidden symbols:** require zero uses in production-reachable enabled paths. Allow exact, recorded matches only in disabled Phase 4J plugin files. Do not partially migrate those plugins.
- **Delete all:** restore it. Existing smoke requires it, and Architecture §42 already defines its semantic behavior.
- **Application destruction:** public terminal asynchronous `app.destroy()` remains 4K.

## 3. Current-state investigation findings

Rechecked against actual HEAD during this documentation revision:

- Production uses PluginRuntime, typed services/inputs/contributions, UI mounts, MapFacade, semantic foundations and RenderingCoordinator. Public app has no legacy `core`, mutable `state` or refresh authority.
- Classification is **17 enabled / 8 disabled**. The four disabled standard plugins are Elevation, URL, Query and Drop; the other four are complex 4J plugins. Sources: `src/plugins/migration-allowlist.js`, builtin catalog and `tests/plugin-migration-allowlist.test.js`.
- Layers/Settings rebuild contents; GPX currently puts style in Layers and has no Settings contribution. Photo/domain mounts need reactive consolidation.
- `src/domains/facades.js:83–90` omits public clear. `src/entries/store.js:558–588` already implements it; new mutation admission rejects `ENTRY_REMOVING` while clearing, including from the final subscriber. Pending creates are not clear targets (§14).
- Final-only removal notification is accepted. External logical deletion can leave an **unselected generic row visibly stale and apparently enabled** until a notification or action-time read observes absence (§7); immediate inertness is not guaranteed.
- `src/extensions/inputs.js:65–96` lacks a caller signal and exact registration revalidation. Noncooperative handler settlement is not an accepted uninstall barrier; this revision preserves that behavior rather than treating awaited joining as a missing feature.
- `src/plugins/input/gpx.js` postcommit auto-fit checks plugin scope and entry existence, but lacks an operation-signal check. Amendment A must address it.
- `src/plugins/runtime/context.js` passes `enqueuePostCommit` internally to capability factories; plugins cannot invoke it. `runtime.js:161–177` activates the plugin before flushing callbacks. An uncommitted Scope is alive. No accepted public Query activation callback was found.
- `src/ownership/abort.js` validates native signals with native accessor brand checks (cross-realm accepted), and cleans forwarding listeners. `Scope.track(...,{await:true})` waits for task settlement; task rejection is observed, not itself a cleanup failure (`ownership/records.js`, `ownership/scope.js:239–244`).
- Existing guarded contributions keep mount resources host-owned and register contributor close/retry obligations (`src/ui/domain-contributions.js`). No dual-parent Scope is needed.
- Embed samples contain unsupported legacy state/core and Photo-default configuration. Four complex loaders have exactly the refresh exceptions in §25.

The following totals are **historical reports from the prior investigation, not rerun or independently reproduced in this revision**:

| Previously reported check | Historical result |
|---|---|
| Unit suite | 63 files / 683 tests passed |
| Focused 4C/4G/4H smoke | 10 passed |
| Complete smoke | 19 passed / 24 failed (43 total) |

The historical 24 failures were reported as 14 Editor and 10 standard scenarios. Current smoke inventory is mapped in §24. New verification results must be recorded when implementation is later authorized; no tests are changed or run as implementation verification here.

## 4. Accepted Phase 4A–4H contracts

| Foundation | Accepted API / invariant consumed by 4I |
|---|---|
| Scope — 4A | `alive`, `signal`, `child`, `defer`, `track`, `assertAlive`, `guard`; child `dispose`. Closure revokes authority synchronously before asynchronous cleanup. Retry only safe residuals. |
| Runtime/context — 4B | Staged setup publication; guarded explicit capabilities; dependency planning and lazy imports; uninstall/quarantine. Cleanup does not publish services automatically. |
| Services — 4C | Typed service keys; `provide`, `require`, `optional`, targeted availability subscriptions; provider/consumer liveness. |
| Contributions — 4C/4G | Fixed typed points; staged owned descriptors; ordering by group/rank/ID; guarded mounts and cross-lifetime close obligations. |
| UI mounts — 4C | `mountSurface({id,surface,rank,ariaLabel,mount})`; assigned container and fresh scope; wrapper removal after mount cleanup settles. |
| InputRegistry — 4C | Discovery snapshots; synchronous recognizers; unique highest-priority claimant; explicit ties; invocation cancellation on caller/handler lifetime loss. |
| Styles — 4C | `styles.use`; manager-owned physical links and balanced owner leases. |
| Map — 4C | Actual HEAD names include `mountControl`, `attachLayer`, `listen`, `fitBounds`, `panTo`, viewport/projection methods. Do not substitute conceptual method names from architecture examples. |
| Entries/domains — 4D | Entry envelope `{id,domain,visible}`; app-owned committed entries; provider leases; immutable `{entry,revision,snapshot}` domain views; expected-revision commands. |
| Selection — 4E | `getCurrent`, candidate-based `request`, `clear`, change-only `subscribe`; semantic `{entryId,domain,ref}`; selection independent of presentation. |
| Rendering — 4F | Optional domain renderer; controller/generation ownership; token/revision currentness; typed status; definitive failed replacement withdraws obsolete authority. |
| Presentation — 4F/4G | `presentation.resolve(entryId,ref)` returns a guarded handle or null. Handle includes permanent invalidation `signal`, `isCurrent`, anchor/bounds/descriptor and controlled highlight. |
| Create cancellation — 4G | Domain `create(value,{signal})` checks cancellation at publication. Postcommit cancellation cannot remove the committed entry. |
| Photo — 4G/4H | Per-entry modes; guarded preview resources; GPS remains authoritative; saved GPX inference does not automatically change when GPX changes/disappears. |
| GPX — 4H | Canonical document, query methods, category/per-track/style preferences, revision-scoped structural refs, Track-mode geometry, domain-owned hit testing. |
| Clear/removal — 4D/4H | Reverse-insertion sequential clear; global mutation gate; batched final `cleared`; best-effort cleanup and retained provider leases; no resurrection. |

No redesign of these foundations is included.

## 5. UI and presentation inventory/classification

Classification: **T** active target; **P** reusable pure/domain logic; **M** minimum slice UI to consolidate; **L** inactive legacy; **D** delete in 4I; **J/K** deferred.

| Component | Classification | 4I disposition |
|---|---|---|
| Application factories/composition/catalog | T | Preserve composition; add standard host metadata and enable completed transports |
| `ui/mounts.js`, contribution engine, scoped DOM helper | T | Complete host lifecycle and targeted reconciliation |
| `plugins/ui/panel.js` and panel service | T/M | Keep service; complete layout, keyboard and focus |
| Layers/Settings plugins | T/M | Replace whole-panel redraw with stable host records |
| GPX/Photo UI plugins and domain UI helpers | T/M/P | Keep identities; make content reactive; add GPX Settings |
| Map-selection presenter | T/M | Keep sole popup/highlight authority |
| Status and target base-map selector | T | Complete listener/style ownership |
| Legacy status/base-map installers | L/D | Remove unsupported raw install paths |
| File import plugin | T/M | Integrate toolbar and common typed batching |
| Drop/URL/Query installers | L/D | Replace through target plugins; remove legacy exports |
| `core/input-processing.js` | L/D | Delete legacy dispatch/context/state traversal |
| `core/remote-url-import.js` | L/D | Replace with scoped transport helper |
| `core/input-utils.js` | P plus obsolete policy | Retain generic URL/length/name utilities; remove forced GPX naming/policy |
| Elevation installer | L/D plus P | Extract chart/layout logic; replace authority/lifecycle code |
| `ui/surfaces.js` | L/D plus P | Reuse measurement algorithms privately in the target host; delete public legacy manager |
| `ui/styles.js` | L/D | Delete permanent stylesheet registration helpers |
| Global UI stylesheet | T plus L/D rules | Keep shell primitives; move feature rules; delete obsolete selectors |
| Pure GPX parsing/document/query/popup logic | P/T | Reuse |
| Photo EXIF/inference/time utilities | P/T | Reuse accepted behavior; do not expose unsupported modes |
| Viewer and Embed samples | M/L | Restore real target composition and remove legacy calls |
| Phase 4B–4H samples | T | Retain valid contract fixtures; adapt affected UI expectations |
| Editor samples and four complex plugins | J | Leave disabled; preserve migration evidence |
| Final app lifetime closure | K | Excluded |

## 6. Target standard UI architecture

Keep `layers`, `popup` and `settings` contracts. Add a fixed typed `contributions.toolbar` point through the existing contribution engine, within 4I host scope (Architecture §16). It is not a universal adapter or a new registry family.

### Toolbar public contract

Registration uses the existing envelope `register({id, group, rank, descriptor})`. `id` is a nonempty trimmed string, `group` defaults to `topleft`, and `rank` defaults to `0` and must be finite. Reject unknown envelope/descriptor fields, arrays/nonobjects and invalid values before staging. Duplicate IDs follow existing staged contribution conflict rules. Copy/freeze normalized descriptors; do not retain a caller-mutable definition.

| Descriptor variant | Exact fields |
|---|---|
| Declarative action | `{kind:"action", label, iconText?, className?, priority?, edgePolicy?, activate}` |
| Complex mount | `{kind:"mount", label, className?, priority?, edgePolicy?, mount}` |

`label` is nonempty trimmed accessible text. `iconText` defaults to `label` and must be text; never HTML. `className` defaults to `""`, and permits space-separated CSS tokens matching `[A-Za-z_][A-Za-z0-9_-]*`. `priority` defaults to `normal` and accepts `low/normal/high`; `edgePolicy` defaults to null (derived below), or `keep/yield`. `activate` must be a function `() => void | Promise<void>`; `mount` must be a synchronous function `({container,scope}) => void`. Reject conflicting variant fields, unknown kinds/corners/priorities/policies, nonfinite ranks and nonfunctions with `CONTRIBUTION_INVALID`. Mount return values provide no cleanup contract; thenables are invalid and any rejection must be observed diagnostically. Resources must be registered in the supplied Scope before use.

Order groups explicitly as `topleft`, `topright`, `bottomleft`, `bottomright`; within each, ascending rank and existing contribution engine ID comparison. Do not depend on registration timing. Host maintains explicit DOM order even in Leaflet bottom corners. Each contribution gets its own owned placement wrapper/control so priority/edge policy is retained per item rather than collapsed into one corner-wide policy.

Actions use native buttons with accessible labels and keyboard behavior. At event admission check host mount Scope, contributor Scope and exact descriptor identity; isolate exceptions. A pending action disables its own button, observes the returned promise, and reenables only the captured live mount. Observe action tasks under the item mount Scope with `await:false`: toolbar withdrawal does not promise to finish arbitrary action work; contributors own any semantic/transport work and cancellation. Never act on a replacement descriptor from an old button.

Complex mounts receive a fresh host-child Scope. Reuse guarded-mount contributor abort and explicit close/retry obligations from `ui/domain-contributions.js`; host owns resources, contributor joins closure. Withdraw listeners/action authority synchronously on either lifetime loss; cleanup remains joined and safe residuals retained. Do not give scopes two parents. Mount failures affect only that item. Uncommitted contributions cannot mount; rollback publishes nothing. Without Toolbar, committed contributions remain dormant and mount when the host appears; optional contributor tests cover host-first/contributor-first teardown and remount. Hard dependencies below mean standard launchers cannot normally outlive their required Toolbar.

| Integration | Decision |
|---|---|
| New `tilia-toolbar` | Lazy builtin catalog entry; enabled classification; private MapFacade controls; feature stylesheet lease |
| Layers / Settings | Require Panel and Toolbar; register declarative launchers |
| **File import** | **Require Toolbar**; register complex picker/progress/Cancel mount |
| URL import | Require Toolbar; declarative launcher opens its owned floating URL form, not Panel |
| Elevation | Require Panel, Toolbar and GPX domain; no renderer dependency |
| Query / Drop | No Toolbar dependency; Query additionally gated by C, Drop by B |
| Status / base-map | Keep specialized MapFacade controls and their existing service/catalog authority |

Map existing `position` directly to group. Preserve default options from `src/ui/protocol.js`: File `topleft/high`, Layers/Settings/URL/Elevation `topleft/normal`, Status `bottomleft/low`, base-map `topright/normal`. Resolve omitted/null edge policy to `keep` for high priority and `yield` otherwise; explicit `keep/yield` wins. Normalize existing builtin option behavior before producing a valid strict contribution. Do not introduce arbitrary position fallbacks in the new public descriptor API.

Viewer and both Embed compositions include Toolbar once; slice fixtures using File/Layers/Settings need the same dependency. Domain providers/renderers stay independently usable. Expected final classification with this new builtin: **22 enabled / 4 disabled**, versus baseline 17/8; validate IDs as well as totals.

### Panel and layout

Keep `open/toggle/close/isOpen`. Extend the presentation spec with `layout:"side"|"bottom"`, default `side`. Both `open` and `toggle` validate the entire spec before closing a current record, including toggle-off of the same ID; invalid layout throws `TypeError` and leaves it intact. Switching side→bottom or bottom→side is a new admitted record with captured old-scope closure, new classes/layout measurements and the existing last-request-wins reentrancy checks. Preserve existing immediate old-container withdrawal and asynchronous cleanup joining; do not require old cleanup settlement before displaying the new record. Disposing an old lease must never close a newer record with the same ID.

URL stays a floating `ui.mountSurface` form (`floating` presentation layer), can coexist with Panel, and closing it cancels only its request after A. Panel close/Escape operates on the captured record. Use a labeled nonmodal dialog, native buttons and keyboard access; no focus trap. Focus restoration chooses a still-connected launcher, then another live host launcher, then the host's private focusable map target. Recheck request version after focus callbacks so reentrant open/close wins.

The private UI host owns ResizeObserver/MutationObserver listeners and layout annotations, not semantic state. Observe only its assigned controls/presentation subtrees and privately measured control geometry; no plugin map-container access. Capture original annotation values and CSS priorities once per host lease. Record each owned write and restore only if the host lease is still current and the live value equals its last write, preserving subsequent foreign writes. Old observer callbacks/disposers cannot overwrite a new host lease. Tests cover existing annotations, external overwrite, absent observers, side/bottom/floating collisions and delayed cleanup.

## 7. Reactive state and subscriptions

All callbacks read current authoritative snapshots. Event payloads identify work; retained mutable domain objects are prohibited.

| Surface | Snapshot / authority | Subscription | Update granularity |
|---|---|---|---|
| Toolbar | Ordered contribution descriptors | Toolbar contribution point | Changed item/group |
| Panel shell | Host-local active record/layout | Host lifecycle and owned layout observers | Active panel |
| Generic Layers | Entries `{id,domain,visible}`; current selection | Entries, layers-adapter availability, SelectionStore | Entry envelope/adapter |
| GPX tree | GPX view and canonical selected ref | Filtered EntryStore domain changes; SelectionStore | Entry’s domain subtree |
| Photo row | Photo view; preview handle | Filtered domain changes; selection; preview invalidation | Metadata, selection, image separately |
| Settings host | Entries and ordered supported descriptors | Entries lifecycle; Settings contributions | `(entryId,contributionId,descriptor identity)` |
| Domain settings | Current GPX/Photo view | Filtered EntryStore domain changes | Values of affected entry |
| Popup/highlight | Selection and current presentation handle | Selection, rendering status, popup availability, handle signal | Current presentation record |
| Elevation | GPX profile queries and selection | Entries, selection; presentation availability for map effects | Profile/guide/hover separately |
| File input | Input discovery | InputRegistry | Accepted file metadata |
| Drop/URL/Query | Transport operation state | Invocation lifetime; registry dispatch | Operation |
| Base-map selector | Catalog selected/providers | Base-map catalog | Selector projection |
| Status | Status provider’s current text; dismissal is local | Existing typed `set` operation and availability for consumers | Status message |

For every mounted surface:

- Subscribe with mount-guarded callbacks and explicitly unsubscribe at mount closure.
- Establish subscriptions before the initial snapshot projection; do not assume SelectionStore emits current state.
- Close obsolete children synchronously before replacing their presentation authority.
- Guard every asynchronous continuation by its captured record, live scope and applicable revision/handle.
- Keep semantic values in Entries/domain providers; expansion, drafts, pending indicators and focus remain local.
- Renderer uninstall affects presentation only; semantic rows/settings remain usable.

Preserve accepted final-only removal notifications. During stalled external cleanup, an unselected generic row may remain visible and apparently enabled: the host has not been notified. Before every visibility/remove/select/fit/settings action, reread `entries.get(id)` and the applicable domain view under the captured scope/revision. Observed absence withdraws that local row/section and closes its mount; stale actions perform no semantic or viewport work. Adapter domain errors must distinguish absence/stale revision from genuine failures. This local observation is not an EntryStore event. Do not add polling, early-removal events or claim unobserved controls are inert.

Concrete regression: externally remove an **unselected** GPX entry; hold provider cleanup. Assert `entries.get(id) === null`, no final `removed` yet, and the generic row may remain. Click its visibility or fit control: assert a fresh absence read, no command/selection/pan, local row withdrawal. Release cleanup: final notification arrives, with no row resurrection. A selected-entry test alone cannot establish this behavior.

## 8. Layers/tree design

Generic host responsibilities:

- Display entries in EntryStore list order.
- Maintain stable rows keyed by entry ID.
- Own whole-entry visibility, single removal, Delete all and entry-level selection indication.
- Show fallback `${entry.domain.id} ${entry.id}` when no adapter exists or its mount fails.
- Isolate one adapter failure without disabling sibling rows.
- Replace only the affected adapter on registration replacement/removal.

Domain responsibilities:

- GPX contributes document, category, track, segment, route/route-point and waypoint rows from its immutable view.
- Category/per-track controls invoke accepted commands with expected revisions.
- Domain-owned style controls move to Settings; the tree may retain a read-only swatch.
- Photo contributes name/time/location/thumbnail and semantic selection.
- Domain adapters subscribe to their own semantic changes; generic hosts do not inspect GPX change types.

GPX identity:

- Canonical document ref is `{kind:"document"}`.
- Other canonical refs include revision and the accepted indices.
- UI supplies unversioned targets to `gpx.selection.createCandidate`; it never fabricates canonical refs.
- Nonstructural changes retain logical row keys and update canonical selection indication.
- `replace-data` closes and rebuilds structural rows, resets structural expansion/focus caches, and never treats reused indices as preserved identity.
- Stale indexed callbacks verify captured revision/liveness before requesting mutation or selection.
- No structural editing commands are introduced.

Use nested lists and native buttons/checkboxes; do not advertise an ARIA tree without implementing its complete keyboard model.

Legacy global GPX default-visibility state is not restored. Accepted per-entry category/per-track preferences remain authoritative.

## 9. Settings design

Keep the existing multi-provider entry Settings point and support predicate.

- Host isolates exceptions from both `supports` and `mount`.
- Contribution ordering remains group/rank/ID.
- Unsupported entries receive no speculative settings.
- Preserve mount identity for unaffected entries/contributions.
- Contributions own reactive values, command pending state and error recovery.

Settings inventory:

| Setting | Authority / command |
|---|---|
| Photo requested mode | Photo preference; `setRequestedTimeMode(id,mode,{expectedRevision})` |
| GPX style | GPX preference; `setStylePreset` |
| GPX category visibility | GPX preference; `setCategoryVisibility` |
| GPX track visibility | GPX preference; `setTrackVisibility` |
| Whole-entry visibility | EntryStore; remains generic Layers control |
| Panel layout/open state | Host-local presentation |
| Base-map selection | Existing base-map catalog |

Do not add global Photo defaults, custom offsets, Segment mode, persistence or new interpretation settings.

Capture value and current `expectedRevision` at admission. Gate pending commands locally by `(mount identity, entryId)` and disable that mount's conflicting controls; do not create a global per-entry UI scheduler. Another Settings/tree surface may admit a command independently. Existing EntryStore FIFO orders admitted commands; two commands with the same revision can yield one success and one stale-revision rejection. Reread authoritative view after either settlement and restore live controls; never automatically retry stale revisions. If entry absence is observed, withdraw that local section. Closing a panel prevents new commands and stale DOM/status work; already admitted commands follow accepted semantic rules and are not rolled back.

## 10. Status and base-map design

Status remains the narrow optional `statusServiceKey.set(text)` contract.

- Provider stores the current immutable text value and projects it into its owned control.
- Initial text is `Ready`; the last admitted `set` replaces it.
- Dismissal is presentation-local; the next `set` redisplays the panel.
- No timers, semantic entries, global event bag or broad app authority.
- Empty text produces empty text rather than an implicit semantic operation.
- Use `role="status"` and polite live announcement; label the dismiss button.
- Each operation checks its own lifetime/token before publishing completion.
- Diagnostics preserve original typed errors; status presents readable summaries.

Base-map control keeps the existing catalog:

- Staged publication, deterministic ordering and plugin ownership remain unchanged.
- Subscribe to the catalog snapshot for initial and later rendering.
- Scope the change listener; restore the authoritative value if selection fails.
- Preserve hidden-current placeholder and provider grouping.
- Provider removal/reinstall follows existing fallback and layer cleanup contracts.
- Delete `installBaseMapControl` and raw status installer paths after target tests replace their meaningful behavior.

## 11. Input UI and flows

Use a domain-neutral shared transport helper receiving guarded inputs, optional status/diagnostics and an operation child Scope. Only domain handlers recognize, parse and create entries. In a batch, an A failure envelope with `details.cancelled === true` stops remaining admission and cancels the captured transport operation; other ordinary item failures continue. It never converts retained handler-local commit evidence into a rollback count. No forced GPX filename/MIME guessing or legacy context/state bags. Proposed signal dispatch is unavailable until A is approved.

### Batch admission and cancellation

Each transport admits one batch; **reject busy attempts, do not queue batches**. Sequentially dispatch a frozen admitted file snapshot in array order, continuing after ordinary per-item failure. Cancellation stops admission of remaining files; already admitted work settles under A. No not-yet-admitted items survive cancellation, and committed entries remain. Within the still-installed transport, the next batch starts only after current handler settlement and owned cleanup; this preserves the resolved no-overlap policy. A Cancel action immediately changes the live UI to cancelling and never blocks other application UI. Noncooperative EXIF may delay this transport's next batch; it is not a guarantee of immediate batch settlement or an uninstall barrier. Per-transport gating is not a global scheduler. Repeated Drop creates host invocations under B, but the busy transport rejects each without dispatch; host closes them.

File's Toolbar complex mount includes a labeled **Cancel import** button, shown only while work is pending. Cancel aborts the captured operation, displays a cancelling state while the mount remains live, disables repeat cancellation and keeps the picker busy until settlement. Picker accepts discovery metadata, never installs handlers, and resets its input value only on the captured live mount so selecting the same file again works. Mount closure cancels its batch. A user-triggered cancelling indication is owned by the live mount separately from the revoked operation. Completion counts/names/status are published only while the captured operation/UI is current and noncancelled; cancellation after commit is not described as rollback.

### URL and remote limits

URL has one request per plugin, including across form closure/reopening. Close cancels old work; reopening during noncooperative settlement shows the pending/cancelling state and disables Submit. A new operation is admitted only after old work/cleanup settle. Completion of the old form cannot update the new one. Timeouts apply to **the entire fetch + body consumption + dispatch operation**, cleared at final settlement. Default `timeoutMs=15000`, `maxBytes=10*1024*1024`. Timeout aborts the operation with a `TimeoutError` reason; cancellation can remain pending until noncooperative handling settles. Timer delivery itself can be delayed by synchronous parse, so 15000 ms is not a hard CPU-stop bound or a strict wall-clock publication deadline: parse/microtask continuation may finish before an overdue timer callback executes. Publication guards act on cancellation already observed; they cannot retroactively prevent that earlier commit. This is a timer-based operation timeout, with that explicit limitation, not an unapproved worker/deadline architecture. Announce timeout/cancellation once through a still-live current UI/plugin authority, never a stale completion callback. On plugin uninstall, release observers/physical owned effects through existing Scope cleanup without automatically awaiting the whole request/dispatch promise; late completion is observed and ignored. Busy state of a dead plugin never gates its fresh reinstallation, which has a new generation and signal guards.

Validate remote configuration in setup before acquisition/network: `timeoutMs` is an integer in `1..2147483647`, `maxBytes` is a positive safe integer; reject NaN, Infinity, zero, negative, fractions and wrong types with `TypeError`, rather than silently disabling limits. Query parameter name is a nonempty string. Resolve relative URLs against document URL; allow only HTTP/HTTPS, reject invalid/disallowed schemes before fetch. Fetch uses normal CORS behavior; no proxy or forced filename. Enforce declared Content-Length when valid and actual streamed/consumed bytes before dispatch; cancel body consumption on overflow. Missing/malformed Content-Length does not waive actual-byte checking. HTTP errors and network/CORS failures dispatch nothing and retain original causes in diagnostics. Filename extraction supplies metadata only; recognized extension/MIME remains the domain handler's decision. Local JPEG is outside remote limits.

Tests hold fetch, body and dispatch separately: expiry in each phase aborts the same effective signal; no dispatch after fetch/body expiry; expiry after semantic commit preserves the entry and suppresses fit/status. Assert exact limit, one-byte-over, malformed length, invalid configuration before fetch, unsupported input and claimant conflict without GPX coercion.

### Query startup (dependent on C)

Read the first value of configured query parameter (default `gpx`) once in setup, but perform no fetch/dispatch there. No parameter: no operation. Register the proposed C own-commit callback; on activation, subscribe to input discovery with current snapshot and then check once. Use a local `activated/started` guard, setting `started` before launch to survive synchronous callbacks. **Own activation and handler availability are separate conditions.** A nonempty registry allows one attempt; it does not prove that its handler will recognize the fetched input. Unsupported/conflict outcomes are reported once, never used to auto-install handlers or retry indefinitely.

| Order/race | Required assertion |
|---|---|
| Query first, registry empty | Own commit produces waiting state, no fetch; later handler publication launches once |
| Handler first | Query setup produces no fetch; Query own commit launches once |
| No handler | Wait without polling/timers/network; discovery unsubscribe on uninstall; no auto-install |
| Query setup/commit rollback | C callback never runs; no fetch/dispatch |
| Handler disappears before invocation | A exact-registration/cancellation guards reject; no fallback to a replacement |
| Query uninstall while waiting | Callback/subscription revoked, later handler publication cannot launch |
| Uninstall during fetch/body/dispatch | Revoke/cancel; clean concrete owned effects; observe late settlement without blanket work join. No stale status/fit; committed entries persist |
| Unuse queued during successful setup | Runtime may first commit and start, then cancel on closure; do not claim queued unuse guarantees no launch |

Transport-owned batch/request Scope is a plugin child. Register timer, abort forwarder, body-reader cleanup and subscriptions before using them; track the observed operation with `await:false`. Closing that child synchronously cancels and runs those disposers, but does not wait on generic parser/dispatch settlement. A concrete reader acquisition/disposer requiring settlement remains explicitly awaitable under its real owner (§21 A.4); never make a child disposer return the whole request promise just to await all parsing. EntryStore's app-owned provider preparation remains independently joined. Drop's host invocation can close before callback completion (§21 B); transport and callback captured identity/signal checks reject late new actions, and later promise rejection is always observed. Success-path cleanup detaches forwarding before normal close so Scope disposal does not report false cancellation.

Do not use `scope.alive`, a microtask, timeout, or unrelated service publication as proof of own commit. Query implementation is blocked by **A and C**; Drop by **A and B**.

## 12. Selection and popup presentation

Keep `tilia-map-selection-presenter` as sole standard popup/highlight owner. Follow existing record identity (`src/plugins/ui/map-selection-presenter.js:31–68`): a suppression identity is **the current immutable SelectionStore object plus its still-current presentation exposure record/handle**, not entry ID, adapter ID or a ref string alone. Retain that exposure while selection identity and handle currency are unchanged; do not call resolve just to create a fresh suppression identity.

| Transition | Behavior |
|---|---|
| User popup close | Mark only captured live exposure dismissed; preserve semantic selection and independent highlight |
| Same candidate request / unrelated notification | No new selection/exposure; dismissal remains |
| Semantic refresh with new SelectionStore object or invalidated revision | Close old record; fresh current exposure may reopen |
| Hide → show / renderer uninstall → reinstall / renderer replacement | Old handle permanently invalidates; new exposure may reopen with current content |
| Popup adapter removal/reinstall while same exposure remains | Close adapter content only; retain highlight and dismissal; reinstall mounts only if undismissed |
| Selection changes/clears/target deletes | Close captured record; resolve new valid selection or show none |
| No renderer/anchor | No popup/highlight; semantic selection persists; later valid exposure is fresh |
| Stale remove/close/image callback | Cannot dismiss or mutate a newer record; captured record, scope and handle guards apply |

Internal popup disposal detaches its remove listener before layer withdrawal, so programmatic closure is not user dismissal. Handle invalidation is authoritative even without a final renderer-status notification. Presentation/content errors diagnose and close failed resources without semantic rollback. Popup preparation stays synchronous under accepted mount contracts; Photo preview continuations additionally check preview currency. No new popup selection cache, async adapter protocol or semantic authority.

## 13. Elevation design

Replace the legacy installer with a GPX presentation plugin requiring Panel, Toolbar and GPX domain, not renderer. Elevation opens in bottom layout; Layers and Settings use side layout. Query `gpx.getElevationProfile(id,{target})`; use immutable GPX views for labels/coordinates. Include tracks only, excluding route profiles. Preserve Track-mode distances and inter-segment inferred gaps; separate tracks visually without counting separation as recorded distance. Break strokes at missing elevation, style inferred-gap edges distinctly, and exclude missing/inferred-gap edges from ascent. Summaries use finite elevations only.

| Selection / availability | Local profile behavior |
|---|---|
| GPX document | Active entry becomes selected entry; show all tracks |
| GPX track/segment/track-point | Active entry becomes selected entry; show tracks, guide relevant track/sample |
| GPX waypoint/route/route-point | Active entry becomes selected entry; show its tracks, clear point guide; no forced semantic selection |
| Selected GPX without tracks | Explicit empty state for that entry, rather than selecting another entry |
| Photo or null selection | Retain existing active entry if it exists; otherwise first insertion-order GPX entry with tracks |
| Open with no usable local state | Prefer selected GPX, else first GPX with tracks; no semantic selection rewrite |
| Active entry deleted | Close local hover; fall back to first surviving GPX with tracks, else empty; revalidate at actions during delayed notification |
| Hidden entry/category/track | Keep semantic profiles with visibility indication; semantic click still works, suppress automatic map pan/hover |
| Renderer absent / target unavailable | Chart and semantic click remain; suppress automatic pan/hover until a current presentation target exists |

A profile with no finite elevation shows an explicit no-elevation state. One finite sample draws an isolated dot and remains click eligible with a valid semantic locator/coordinate. Missing runs may produce multiple isolated dots; never invent connecting strokes. Zero-distance tracks receive a fixed nonzero display span; samples at the same distance share x and hit-test ties choose earliest canonical traversal sample. Constant elevation uses a nonzero vertical display range. Click the nearest eligible finite sample, regenerate its revision-scoped candidate from a fresh view, request SelectionStore, then optionally pan to the freshly resolved visible/current anchor through MapFacade. No interpolation creates semantic points. Provide a keyboard-accessible sample selection path.

Hover owns its own noninteractive marker attached through `map.attachLayer(...,{band:"overlays"})` in a panel/session child Scope. It does not use a foreign renderer layer, selection band, popup or semantic selection. Require current visible target/handle; subscribe to its permanent invalidation signal and rendering availability, and invalidate on revision, hide, renderer loss, pointer leave or mount closure; detach before replacement. Structural replacement discards locators and guide/hover caches. Tests assert point selection without renderer, no hidden-target auto-pan, singleton click, zero-distance tie order and deletion fallback without selection rewriting.

Delete legacy pinned-popup state/timers. Opening Elevation preserves waypoint selection and its existing popup unless that exposure independently invalidates; changing chart-local track choice is not a SelectionStore request.

## 14. Visibility and deletion

Whole visibility uses `entries.setVisible`, without a semantic revision increment. GPX category/track commands change preferences/revision and use expected revision. Equal values preserve accepted no-op behavior. Capture booleans at admission and reread authority after settlement.

Single removal uses `entries.remove(id)` after action-time existence checks. Disable the initiating row, not an invented application mutation scheduler. Cleanup failure with `committed:true` means permanent logical deletion: withdraw locally observed absent rows, diagnose retained residuals, never restore entry/selection.

### Delete all: expose existing behavior exactly

Add guarded public forwarding in `src/domains/facades.js`: `clear() { scope.assertAlive(); return entries.clear(scope); }`, available through app/plugin typed Entries facades. No UI removal loop, cancellation, atomic rollback or automatic cleanup retry. Source of truth is `src/entries/store.js:558–588`; reverse-insertion **active snapshot** targets are processed sequentially with best-effort cleanup and one final batched `cleared` notification.

| Concurrency case | Actual HEAD semantics to preserve / assertion |
|---|---|
| Create preparation pending before clear | Preparing entries are not targets. If a create gate check executes while clear is active it rejects and cleans up; if publication occurs only after clear releases it can commit and survive. Clear neither cancels nor joins every pending create. Test both orders, including empty clear ending before a microtask create publishes |
| Update/visibility admitted before clear | Already enqueued work is not globally paused. It follows per-entry FIFO and its existing liveness/revision checks; it can finish before the captured remove, or fail after removal. Do not add a new clearing check inside admitted commands |
| Removal admitted before clear | Existing queue/record checks avoid double deletion; clear's final removed array remains the admission snapshot, even if a queued remove already handled a target and emitted its own notification |
| New create/update/visibility/remove during clear | Admission rejects `ENTRY_REMOVING`, not queues until completion |
| Concurrent second clear | Rejects `ENTRY_REMOVING`; only the first executes |
| Empty clear | Emits `cleared` with frozen empty array and returns it; no synthetic per-entry events |
| Clear requester closes after admission | Clear continues; no later requester check cancels the operation. Already admitted other commands retain their own requester checks |
| Cleanup failure | Continue other targets; final `cleared` still emits; reject aggregate `SEMANTIC_CLEANUP_FAILED` with `committed:true` and frozen failure summaries; leases/residuals retained; no resurrection |
| Mutation in final `cleared` subscriber | Gate is **still true during synchronous delivery**; create rejects asynchronously and update/visibility/remove/second-clear reject via their existing calling conventions with `ENTRY_REMOVING`. Gate releases in finally after delivery, not before |

Disable the initiating Layers host's mutation controls while pending; other surfaces may attempt commands and receive the accepted gate rejection. Do not promise globally disabled controls or early external-deletion observation. On success consume returned snapshot, reconcile with current Entries (including any later-created survivor), and restore controls only in the live captured host. On committed cleanup failure display a cleanup diagnostic and reconcile actual survivors; on pre-admission failure restore actual state. Final notification can arrive before the initiating promise settles; reconcile idempotently. UI closure suppresses stale DOM/status, not semantic completion.

## 15. DOM and resource ownership

| Resource | Owner |
|---|---|
| Shell roots/layout annotations/observers | UI host manager under application foundations |
| Toolbar controls/wrappers | Toolbar host |
| Panel content container | Panel host record |
| Contribution subtree | Assigned mount scope; existing contributor closure obligation |
| Domain view listeners | Domain mount scope, with explicit unsubscribe |
| Popup/highlight | Presenter record children |
| Elevation chart/hover overlay | Elevation panel/session children |
| Fetch/timeout/batch work | Transport operation child |
| Drop listeners/highlight | Proposed host-owned binding |
| Stylesheet link | Stylesheet manager; plugin/application leases |

Revoke listeners and callback authority before removal. Generic surface/contribution wrappers are removed after cleanup settles, including failure. Panel retains its accepted immediate captured-container withdrawal (§6), without losing its joined cleanup obligation. Hide/revoke obsolete visible presentation immediately while retained safe cleanup obligations settle.

Prune empty owned surface roots without deleting a root acquired by a newer mount. Never destroy caller-owned maps/containers.

Use existing Scope cleanup/residual semantics; do not implement parallel manual resource registries.

## 16. Consolidation of 4G/4H minimum UI

| Minimum implementation | Decision |
|---|---|
| Primary layers/popup points and Settings engine | Keep contracts |
| Panel service and captured disposal handles | Keep; complete layout/accessibility |
| Whole-list Layers/Settings redraw | Replace with keyed host reconciliation |
| Photo row/popup/settings | Keep contributions; add reactive projection |
| GPX hierarchy/popup | Keep; add reactive projection |
| GPX inline style selector | Move to GPX Settings; remove old selector |
| Generic map presenter | Keep as final standard authority |
| Minimum file picker | Integrate into toolbar and shared typed batching |
| Slice samples/tests | Retain valid foundation behavior; adapt changed placement/controls |

Each responsibility has one active implementation at cutover. Do not maintain temporary and standard UI in synchronization.

## 17. Phase 4J/4K boundaries

Phase 4J retains:

- GPX export.
- `x-route-search`.
- `x-track-editor`.
- `x-milestone`.
- Editor sample/smoke migration.
- Structural GPX editing behavior.
- Removal of those plugins’ legacy dependencies.

4I provides their target foundations: toolbar/surface mounts, Panel service, typed status, immutable GPX queries/commands, semantic selection and owned MapFacade overlays.

Do not modify `PartiallyEditablePolyline`.

Phase 4K retains public terminal app destruction, final allowlist removal and migration-wide closure. Existing plugin/subsystem cleanup must nevertheless work in 4I.

## 18. Error semantics

| Failure | UI response |
|---|---|
| Semantic validation/revision rejection | Show error; reread current values; no automatic retry |
| Confirmed domain precommit failure/cancellation | No entry for that failed creation; a generic dispatch rejection after handling began alone proves no such outcome (§21 A) |
| Cancellation after commit | Suppress stale continuation; retain committed entry |
| Single/bulk cleanup failure | Treat committed deletion as permanent; report existing error details |
| Renderer/presentation unavailable | Keep semantic UI/selection; suppress map presentation |
| Contribution support/mount failure | Isolate item; use Layers fallback where applicable |
| Contribution/plugin removal | Revoke action authority and close mounts |
| Stale DOM/async callback | Ignore under captured liveness/token guards |
| UI cleanup failure | Continue peer cleanup; diagnose and retain safe residuals |
| Optional status unavailable | Operation remains valid; diagnostics continue |

Reuse SemanticError, ExtensionError, RenderingError and ownership errors. Dispatch-specific errors in A describe registry outcomes, not semantic rollback. Do not create a parallel UI semantic error taxonomy or infer rollback from a rejected promise alone.

## 19. Concurrency and race analysis

| Race | Required protection |
|---|---|
| Mutation while tree/settings open | Filtered typed subscription; latest immutable view; captured revision |
| Rapid semantic settings changes | One pending command per mount/entry; independent surfaces use FIFO/expected revision; stale values restored |
| Rapid whole visibility changes | Capture booleans; accepted per-entry FIFO; latest envelope projection |
| Structural GPX replacement vs old controls | Close structural child scopes; reject old revision/index callbacks |
| Selected entry deletion | Selection invalidates before presentation/resource teardown |
| Deletion during popup mount | Handle signal and record identity checked before/after attachment |
| Renderer replacement/uninstall/reinstall | Fresh handle required; old handle never revives |
| Contribution install/uninstall | Staged publication; descriptor identity; close old child before replacement |
| Input completion after UI/plugin teardown | Effective signal, precommit guards, stale continuation suppression |
| Elevation interaction during mutation | Sample revision/liveness check; recreate candidate from current data |
| Bulk clear vs concurrent removal | Existing mutation gate and record identity checks |
| Popup close vs selection change | Captured popup/record token cannot affect replacement |
| Focus/abort callback reentrancy | Preserve existing last-admitted panel request checks |
| Cleanup delay/failure | Withdraw authority immediately; retain cleanup obligations without public resurrection |

Race tests must inject deferred promises and synchronous reentrancy, not depend on timing sleeps.

## 20. Legacy deletion/disconnection matrix

| File/symbol | Reachability now | Replacement / cutover | Disposition |
|---|---|---|---|
| `core/input-processing.js:processInputItems` | Disabled transport/test paths | Typed transport batching | Delete in input cutover |
| `core/remote-url-import.js:importRemoteUrl` | Disabled URL/Query/test paths | Scoped remote transport | Replace/delete in input cutover |
| Drop/URL/Query legacy installer exports | Disabled | PluginContext target plugins | Delete with each cutover |
| `plugins/ui/elevation-panel.js:installElevationPanelControl` | Disabled | Semantic elevation plugin | Delete in elevation cutover |
| Elevation legacy popup/selection caches/timers | Disabled | SelectionStore and owned hover | Delete with elevation |
| `ui/surfaces.js:createUiSurfaceManager` | No active target caller | Private target layout machinery | Delete after behavior tests migrate |
| `ui/styles.js:registerStylesheet/ensureBuiltinUiStyles` | No active target caller | Stylesheet leases | Delete in style cutover |
| `installStatusControl` | Legacy tests | Target status plugin | Delete in status cutover |
| `installBaseMapControl` | Legacy tests | Catalog-based target plugin | Delete in base-map cutover |
| `map/controls.js:installMapControl` | Disabled 4J plugins and obsolete tests | MapFacade mounts/toolbar | Retain only for exact 4J imports; delete in 4J |
| Whole-panel Layers/Settings redraw | Active minimum UI | Stable host records and domain subscriptions | Replace in host cutover |
| GPX inline style selector | Active minimum UI | GPX Settings contribution | Remove in settings cutover |
| Global feature/dead CSS | Active stylesheet payload | Owned feature CSS | Move/delete with owning cutover |
| Embed `app.state/app.core/defaultPhotoTimeMode` | Sample code | Explicit plugins, result entry IDs, accepted Photo settings | Remove in sample cutover |
| Selection/Interaction Hub and legacy GPX/Photo overlays | Already absent | Accepted target foundations | Assert continued absence |
| Complex-plugin legacy state/layer/refresh calls | Disabled files only | 4J migration | Retain exact exceptions through 4J |
| Obsolete implementation-shape tests | Test-only | Target behavior/component tests | Rewrite/delete at matching cutover |

Do not retain inactive standard UI modules for hypothetical 4J compatibility.

## 21. Proposed generic architecture amendments

Each record is independently approved. [Approval record](PHASE-4I-CONTRACT-AMENDMENTS.md) supplies current status; the design/rationale below remains the approved specification. Historical proposed/review-gated wording is superseded by explicit approval, not by implementation evidence.

### Amendment A — operation-scoped cancellation for InputRegistry

**APPROVED 2026-10-08 — IMPLEMENTED AND VERIFIED; REVIEW/ACCEPTANCE PENDING**

#### A.1. Requirement, accepted baseline and selected approach

Cancel one import without uninstalling its transport; prevent cooperative precommit publication and stale UI/fit, retain committed entries, and clean owned effects. Extend `dispatch(input, options?)` with optional native `signal`, preserving successful return values and recognizer policy. Use existing forwarding, caller-owned invocation and Scope cleanup. Add one dispatch-specific failure envelope to describe the whole invocation honestly; do not modify the common ExtensionError constructor.

Accepted 4C input removal revokes authority and aborts in-flight work; it does **not** promise to await arbitrary handlers. Scope §9 waits only explicitly awaitable work. Current 4H smoke (`tests/smoke/phase-4h.spec.js:92–123`) awaits handler uninstall **before** releasing a delayed read and requires zero entries afterward. This behavior remains a regression requirement, not a test to rewrite for a new implementation.

Remove the previous proposal's awaited handler-owner tasks and cross-owner settlement/close barriers. They served a stronger “all parsing finishes before uninstall” guarantee that the product does not require. Signal/lifetime checks already prevent late builtin publication; no concrete counterexample requires that blanket barrier. Resource-specific waits remain mandatory where a late resource needs cleanup (§A.4). No ownership transfer, worker or universal task abstraction is proposed. The bounded handler-payload addition below supplies its existing invocation resource owner; it does not add a settlement barrier.

#### A.2. Exact admission, recognition and lifetime checks

`dispatch(input, options?) -> Promise<handlerResult>`. Omitted/undefined options means no external signal. Otherwise require a nonnull nonarray object with only own `signal` key; reject unknown string/symbol keys (`Reflect.ownKeys`), inherited signal, wrong types and null with `TypeError`. Omitted/undefined signal is allowed; null/lookalikes/proxies without native brand are invalid. Read an options getter once at admission; validate with native accessors in `ownership/abort.js`, accepting genuine cross-realm AbortSignal. Publication checks do not execute caller getters.

Admission precedence: caller Scope guard → options/native validation → pre-abort. A valid pre-aborted operation rejects before any recognition/handling. Retain lexical committed live snapshot, synchronous recognizers, isolated diagnostic exceptions, unique highest-priority claimant, explicit tie conflict and unsupported when none claim (including all recognizers throwing). At checkpoints before/after recognizers and before returning unsupported/conflict, caller lifetime precedes operation cancellation; observed cancellation precedes unsupported/conflict. Immediately before actually invoking a winner check caller alive → exact `handlers.get(id) === selectedRecord` → handler owner alive → effective cancellation. Removal/replacement never calls a stale or replacement winner or reruns recognition. Preserve pre-handler unsupported/conflict/availability errors; no handler could have performed semantic work at that boundary.

Compose invocation/caller lifetime, handler-owner lifetime, registration abort controller and optional operation signal with existing forwarding. Registration identity is still revalidated, not inferred from signal alone. Propose additive handler payload `handle({input,signal,scope})`, where `scope` is the existing caller-owned invocation Scope. Existing handlers that destructure input/signal continue to work; no new Scope is created by this field. This explicit A contract change lets builtins reserve the read disposer in the actual invocation resource owner and retain a failed cancellation cleanup there. HEAD gives handlers only signal, so a helper cannot currently register a failed read cleanup into that owner. Supplying that owner fulfills Architecture §14's invocation-resource requirement without creating a second registry/owner or a handler-owner join. It is independently part of A approval, not an already accepted API. Scope owns resources; AbortSignal requests cooperation and is not a second owner. Losing operation/handler authority closes the caller-owned invocation (if alive) and aborts its effective signal. The handler still uses its guarded plugin context: builtin continuations check signal plus plugin lifetime before domain calls. Signal-ignoring arbitrary code is not physically stopped; no registry can promise rollback of effects it already performed.

#### A.3. Read/parse capabilities and required builtin changes

| Stage and actual source | Required behavior and supported limit |
|---|---|
| GPX FileReader (`src/gpx/parse.js:23–30,301–304`) | Extend `parseGpxFile(file,{signal,scope}?)` and its private read helper, preserving one-argument callers. Builtin handler supplies an invocation-child read Scope; signal validates natively, optional scope must be a live accepted Scope. Ownership is caller responsibility; builtin creates this child from the supplied invocation, not from the handler plugin or a foreign Scope. Check pre-abort before read. Install load/error/abort + signal handlers before `readAsText`; one settlement guard. Operation abort calls native `reader.abort()` while loading and explicitly rejects the read promise, without depending on an abort event being emitted. Clear event properties/listeners and signal listener on success/error/abort/start throw. Reserve an idempotent reader-cancel/listener-cleanup disposer before constructing/starting the reader; supplied read Scope retains any abort/cleanup failure for safe retry. Capture primary reason before abort; retain abort-method failure as cleanup evidence rather than dropping it. Late synthetic load after abort is ignored |
| GPX synchronous XML/normalization (`parseGpxText`, DOMParser.parseFromString) | Check signal after read and immediately before entering synchronous parse; check again after return and before `gpx.create`. No mid-call abort API; browser input/timers cannot run while synchronous parse blocks the thread. The timeout is therefore not a hard CPU-time deadline. Do not promise immediate interruption, add a worker or change parsing semantics without a measured responsiveness requirement |
| Dynamic module import | No cancellation API is exposed here; observe resolution/rejection and check signal/lifetime before using it. Cancel does not unload an imported module |
| JPEG (`src/plugins/input/jpeg.js`, `src/photo/exif.js`) | Current `exifr.parse(file,{tiff,exif,gps})` integration supplies no signal or cancellation handle and returns parsed data. Check before/after import and before/after EXIF promise, then before create. Late plain data is ignored; no thumbnail URL/resource is requested by this API. Do not claim immediate interruption or invent `exifr.abort()` |
| Remote fetch/body | Pass operation signal to browser fetch, consume body under it, explicitly cancel an owned streaming reader on overflow/cancel and release its lock in finally. Response/body acquisition and cancel failures are observed. Check after body and before dispatch; retain byte limits and domain-neutral recognition. Network/body abort support does not interrupt downstream XML/EXIF automatically |
| GPX/Photo semantic create | Pass effective signal to accepted `create`; preserve callback-free final publication guard and EntryStore-owned preparation/disposer/lease machinery. Signal/lifetime recheck after parse is not a substitute for this final guard |
| Postcommit continuation | GPX rechecks signal, plugin lifetime, entry existence/current bounds directly before fit; if cancelled, skip fit and still retain the result's entry. JPEG should return available created-entry evidence without a stale postcommit `photo.get` masking cancellation; guard optional derived read and skip stale metadata/UI. No cleanup path removes an already committed entry |

Samples pin EXIF to `exifr@7.1.3/dist/lite.esm.js`. The repository wrapper is the verified integration boundary. [Upstream documentation](https://github.com/MikeKovarik/exifr#api) describes a promise-based parse API, but is not proof of the exact pinned bundle's internal cancellation/reader cleanup. Its private-reader behavior is a focused investigation item (§28); do not depend on an unverified abort hook or blanket-wait its parse on uninstall. If an actual leaked resource is found, specify the exact resource and bounded fix before declaring that coverage complete.

#### A.4. Four distinct events and resource obligations

| Event | Required timing/join |
|---|---|
| Authority revocation / cancellation notification | Synchronous on operation/caller/handler loss; prevents new admission and signals read/create guards. Invocations/scopes never revive |
| Physical work completion | Cooperative FileReader/fetch settles promptly; synchronous parse runs until return; noncooperative EXIF/import/custom plain work may finish later |
| Resource cleanup | Close invocation-owned effects and retain failures in existing Scope cleanup. Await a resource-specific acquisition/disposer only when needed to safely clean its eventual resource; never discard that obligation |
| Plugin uninstall completion | Preserve accepted Scope ordering and waits already registered by actual resources. No automatic join of every handler, transport promise or Drop callback; may complete while guarded resource-free work remains pending |

Dispatch itself keeps observing/awaiting the real handler promise, then invocation cleanup. Cancellation does **not** race to an early dispatch rejection and abandon that observer. Public dispatch may remain pending for noncooperative work; this does not imply caller/handler uninstall must wait. Record the observed handler settlement in invocation with `await:false`, never as an awaited handler-owner task. Handler signal notification and Scope closure happen even while that promise is pending. Observe all rejection branches immediately, including fire-and-forget closure; a settled task rejection is not automatically a cleanup failure.

Builtin GPX handler creates a short-lived read child under the supplied caller-owned invocation Scope before starting FileReader and passes it to the helper. That child owns only the captured reader/listener disposer (reserved before read acquisition), not an awaited XML/EXIF/dispatch promise. On read settlement dispose its captured lease/child idempotently; on invocation closure its disposer aborts the reader and detaches callbacks, with failures retained by ordinary Scope safe retry. This concrete owner exists to release the actual browser read and retain failed cleanup, not to force all work completion. Builtin FileReader uses settle-once cleanup; cancellation releases those registrations promptly even if a synthetic reader later emits load. The supplied read child signal also cancels its read; forwarding sources are detached at settlement. Detach read forwarding before normal read-child disposal; it only clears completed-reader effects and must not cancel the still-live parent dispatch. Subsequent parse/create checkpoints use the parent operation signal, not the already-closed read child signal. Helper cleanup failure is retained in this invocation subtree and included in handler/dispatch evidence; failed invocation children are retried only through the existing safe cleanup path, not by rerunning the read. EXIF/dynamic-import late values are ordinary data/modules, not newly transferred owned resources, and their captured continuations only diagnose/discard under guards. Fetch helper owns timer/reader/forwarder cleanup registered before work; cancellable physical effects can close without waiting for unrelated parse. Its busy promise is observed with `await:false`; cleanup may still await concrete reader cancellation if required by that reader.

For resource-producing asynchronous work, reserve the disposer slot under the **existing resource owner** before acquisition starts, explicitly `track(acquisition,{await:true})` if disposal cannot be correct until acquisition settles, fill the reserved slot on late return, then let that owner's cleanup dispose it. This is the accepted EntryStore pattern, not an always-on registry barrier. `src/entries/store.js:211–236,273–294` already awaits provider preparation in the application-owned entry Scope, retains failed cleanup and provider lease, and releases lease only after successful precommit cleanup. Do not relocate it into handler/transport ownership, prematurely release a lease, register into a dead Scope or detach a child from its parent. Already committed entries stay application-owned. A custom handler acquiring resources must follow its actual owner's rules; the registry does not make arbitrary nonconforming handlers safe by waiting everywhere.

During operation cancellation, invocation closure is observed and the outer dispatch joins that closure after handler settlement; caller closure can have already closed it. Handler uninstall only aborts/withdraws its registration under accepted behavior; it does not await the separately observed invocation-close promise. That promise must still be observed and its caller-owned residual retained. Retained invocation residuals stay under the caller tree; explicit existing safe cleanup retry handles failed records, never reruns handler work. Provider residuals remain in EntryStore, including after handler/transport removal. No general cross-owner close obligation is introduced by A.

Remove forwarding source listeners and registration-operation membership on effective abort, or in settlement finally if no abort occurred. A tiny captured terminal state retains the first abort cause and exact registration identity; cancellation must remain visible after detachment. Remove operation-specific listeners on every acquisition/settlement path. Before **normal** invocation disposal capture handler outcome/abort state and detach the invocation forwarding, so its normal Scope abort is not a cancelled operation. After cleanup recheck external signal, caller and exact handler lifetime, including cancellation during delayed cleanup. No normal-cleanup signal is sampled as operation cancellation. Resource cleanup failure has precedence per §A.5.

**Straightforward registry control flow:**

1. Validate admission; recognize/select with pre-handler checkpoints. No handler execution means existing unsupported/conflict/validation errors remain meaningful.
2. Create one caller-child invocation, registration abort controller and effective forwarder. Reserve forwarding cleanup before any callback-bearing acquisition; recheck liveness after listener setup, disposing partial forwarding if authority was lost.
3. Register a deferred handler-settlement observer in invocation with `await:false` **before** calling handler, so a synchronous handler-triggered close cannot cause a late `track` into a dead Scope. If final invocation guard fails, settle that observer without calling the handler; it must not remain an unresolved task. Attach immediate fulfillment/rejection observation to the actual returned value/promise.
4. At effective abort, capture the first reason, detach forwarding/membership, and start/observe invocation closure if still alive. This branch revokes/cleans effects; it does not await physical handler completion inside the abort callback or handler-owner disposer.
5. After actual handler settlement, retain result/error. Sample operation/caller/exact registration state, detach forwarding before normal closure, and await the invocation's actual resource cleanup; if closure already ran, join it rather than starting duplicate cleanup.
6. Recheck cancellation/lifetimes after cleanup (not the normal-disposal invocation signal), then apply the single outcome table. Always observe close failures and preserve the caller-owned residual; explicit safe retry is separate from dispatch and never reruns the handler.

#### A.5. One dispatch outcome contract

Selected approach: unchanged fulfilled handler result on uninterrupted success; **one `InputDispatchError extends Error` family**, proposed in `src/extensions/errors.js`, for all dispatch failures **after handler entry**, plus pre-handler cancellation. This is a bounded registry outcome envelope, not a UI semantic taxonomy. Common ExtensionError/OwnershipError/SemanticError contracts remain unchanged. Do not pass an original post-handler rejection through unchanged; preserve it as evidence in the envelope. This resolves the previous wrapper/passthrough contradiction. It is a deliberate proposed change to post-handler rejection shape for both one-argument and signal-aware dispatch calls; only after A approval should existing assertions depending on raw post-handler errors change to examine preserved cause/details. Pre-handler recognition/validation types and accepted uninstall-completion ordering are not amended.

Envelope has `name="InputDispatchError"`, `code` below and shallow-frozen `details`:

- `phase:"before-handler"|"handling"|"cleanup"|"completion"`, `handlerId` when selected.
- `semanticOutcome:"not-started"|"unknown"` (unknown for **every** entered handler, even if one error/result reports a local commit).
- `handlerOutcome:"not-started"|"fulfilled"|"rejected"`; retain `handlerResult` or original `handlerError` when available.
- `cancelled:boolean`; `cancellationReason` and `lifetimeError` when observed; `cleanupError` when invocation cleanup failed. Preserve original objects/reasons, not just strings.

The envelope deliberately has **no `committed` property**. A handler can create one entry and then fail a second operation with `committed:false`; that flag describes only the failed local operation. Conversely `committed:true` in a nested error/result can prove a particular semantic commit but cannot summarize every effect of a multi-operation dispatch. UI must inspect actual EntryStore and explicit supported result evidence, never treat `!error.committed`, generic rejection or cancellation as “nothing imported.” Successful batch counts count confirmed successful dispatches, not guaranteed surviving-entry totals. During failure/cancel use “Import cancelled/failed; committed entries remain” and current entries/known result details, without rollback claims.

| Outcome (evaluated after handler settlement and owned invocation cleanup) | Public result / code and evidence |
|---|---|
| Cancellation before handler invocation | Reject `INPUT_DISPATCH_CANCELLED`, not-started; no recognizer on pre-abort, no handler; original abort/lifetime reason retained |
| Cancellation during handling, handler later rejects | Reject `INPUT_DISPATCH_CANCELLED`, unknown; rejected handler error and cancellation reason both retained |
| Handler success after cancellation | Reject `INPUT_DISPATCH_CANCELLED`, unknown; fulfilled original result retained for diagnostic/entry evidence |
| Handler rejection, no cancellation | Reject `INPUT_DISPATCH_FAILED`, unknown; original handler error retained as cause and details, including local commit flag |
| Cancellation after semantic commit / before completion | Reject cancelled envelope after settlement/cleanup; keep entry; no stale DOM/status/fit, no inference of global rollback |
| No cancellation/failure, normal invocation disposal | Resolve original handler result; normal Scope cleanup abort does not change result |
| Invocation cleanup failure, with any preceding outcome | Reject `INPUT_DISPATCH_CLEANUP_FAILED`; retain cleanupError plus handler result/error and any cancellation. Cleanup takes precedence but erases no prior evidence. Scope residual remains retryable if marked safe |
| Caller/handler lifetime loss after entry | Treat as cancellation, unknown, retain lifetime/abort reason and handler outcome; handler uninstall may have finished before this dispatch settles |
| Cancellation after public dispatch resolution | Already resolved result remains; later abort cannot retroactively reject or undo entries |

Code precedence: invocation cleanup failure → observed cancellation/lifetime loss → handler rejection → success. `cause` is cleanupError for cleanup code, else original handlerError when rejected, else lifetimeError if available, else cancellationReason. The independent fields preserve all simultaneous causes, including when the reason is not an Error. Handler-local semantic cleanup failure is a `handlerError` whose own cause/residuals survive; it is not incorrectly recast as an invocation cleanup failure. Pre-handler noncancellation validation/unsupported/conflict/unavailable errors keep their existing types and no-handler evidence.

#### A.6. Required assertions and review boundary

Future A tests: plugin stays installed while one signal cancels; another operation remains independent; pre-abort gives zero recognizers/handlers; cross-realm accepted, fake signal rejected; recognition reentrancy/abort/conflict follows §A.2; exact replacement never runs stale winner. Native FileReader abort settles even without an abort event, ignores late load and detaches handlers; cancel before parse prevents parse, injected cancellation during synchronous parser callback is seen after return before create. Browser timeout cannot physically interrupt a synchronous call. Final create barrier prevents created event; created-event cancellation retains exactly that entry, result evidence and zero stale fit/status/DOM. Normal cleanup resolves, abort while cleanup is held yields cancelled envelope. Multi-create handler first commits then rejects with local `committed:false`: envelope remains unknown, original error retained, first entry survives. Cleanup failure retains all reasons/residuals until explicit safe retry.

Retain 4H's uninstall-before-delayed-read-release order and zero late entry; add actual native reader test separately. A compliant native implementation may settle sooner, but the noncooperative fixture still demonstrates no blanket uninstall wait. Handler/caller removal with pending resource-free work completes without waiting; late settlement is observed and cannot use closed authority. Provider acquisition with a late resource waits **only its existing entry resource owner**, disposes it/retains failed residual and lease correctly. Verify listener counts/operation set return to baseline on abort/success/error. No awaited observer may include its own closure promise; resource-specific tests assert no circular wait.

A remains review-gated for external-signal API, additive invocation Scope in handler payload, precise cancellation/outcome envelope and builtin cooperative integration. It proposes **no global uninstall-settlement change**. File/URL/Query cancellation and Drop dispatch depend on A approval.

### Amendment B — host-owned Drop binding

**APPROVED 2026-10-08 — IMPLEMENTED AND VERIFIED; REVIEW/ACCEPTANCE PENDING**

Keep narrow `ui.bindDropTarget({id,onDrop})`: nonempty trimmed ID and function, no other fields/types. Return frozen `{dispose:()=>Promise<void>}` lease. Callback `onDrop(Object.freeze({files,scope})) -> void | Promise<void>` receives a frozen File-array snapshot in DataTransfer order and an invocation child Scope; no map/container/event/DataTransfer/target selector. Host owns placement/listeners/highlight/invocation; callbacks own assigned effects through that Scope or children, never transfer ownership.

**Acquisition.** One exclusive host target per application, independent of binding ID. Live/staged conflict rejects `RESOURCE_CONFLICT`; absent/headless target rejects `UI_SURFACE_UNAVAILABLE`, no partial effects/dormancy. Setup reserves/stages without listeners/highlight, activates after own commit with owner/target/generation checks. Rollback or disposed setup lease cannot activate. Active-plugin acquisition is immediate under equivalent checks; no arbitrary continuation while uncommitted/closing. Reinstall gets a fresh generation after old logical revocation; retained cleanup residuals cannot restore old delivery or remove new listeners.

**Binding teardown, callback settlement and import work are distinct.** Binding has one host-child owner; invocations are its children. Reuse existing contribution-style contributor abort/close obligation to join **binding resources**, not automatically callback/dispatch settlement. On host/contributor/lease loss revoke delivery/highlight immediately, abort/close invocations and remove listeners. Observe actual callback promise with `await:false`; on normal callback settlement host closes its captured invocation and diagnoses original callback/cleanup errors. On teardown that invocation may already be closed. All late resolutions/rejections remain observed, with no DOM/status/highlight resurrection, but disposal may finish while a resource-free callback/import is pending. No awaited callback promise that recursively waits its own invocation close; callbacks must not await host invocation disposal from within themselves.

Callback promise observation is not sufficient for late resource acquisition. If a callback has a real acquisition that needs settlement for correct disposal, reserve its disposer and track **that acquisition** awaitable under its invocation resource owner before starting (§A.4). Then binding/contributor teardown correctly waits that resource-specific obligation and retains safe residuals. Builtin Drop transport's dispatch observer is nonawaited; parsing data alone introduces no binding cleanup barrier. EntryStore owns/joins provider preparation independently. Thus B does not accidentally reinstate the rejected all-handler uninstall wait through a Drop scope.

`dispose()` revokes reservation/delivery synchronously and returns binding-resource cleanup promise, not all callback work. Concurrent calls share attempt, successful repeated calls are no-ops. Failure rejects and retains Scope residual without renewing authority. Later explicit `dispose()` retries only safe failed records through existing private Scope retry; concurrent retries share an attempt. Host/contributor cleanup obligations join/retry those same residuals through accepted cleanup patterns. Listener removal and owned child effects justify that cross-lifetime close join; it is not a new work-completion barrier or public root retry API. Callback failure is diagnosed independently if teardown already completed; a simultaneous cleanup failure retains both originals, with cleanup failure primary for the lease, not a claim of semantic rollback.

**Events.** Capture file drags over host application area including controls/Panel/floating URL. `Files` type accepts dragover/prevents file navigation/sets copy; nonfiles untouched. Drop clears highlight/counter, prevents accepted file navigation, snapshots only File objects; empty files invokes no callback, mixed text/URL ignored. Balanced nested enter/leave plus containment; whole-area leave/drop/dragend/abort/closure clears highlight. Stale generation never delivers or changes current highlight. Repeated live drops each receive separate invocation; transport busy rejection (§11) is not a host queue.

**Separate B assertions:** frozen payload, no raw references, staged rollback/exclusive/headless and reinstall; nested/nonfile/empty/mixed/control/panel drops; teardown with held resource-free callback finishes and later callback cannot dispatch/publish under dead scope, late rejection observed; normal callback success/error closes exactly captured invocation. Held **resource acquisition**, unlike plain callback, delays cleanup and safely disposes late resource; listener/disposer failure retains retryable residual, explicit retry never reactivates old generation. Prove contributor join and resource wait have no circular self-close dependency. A tests independently cover real dispatch cancellation. B approval gates all Drop attachment; A separately gates actual import processing.

### Amendment C — own-commit notification for Query startup

**APPROVED 2026-10-08 — IMPLEMENTED AND VERIFIED; REVIEW/ACCEPTANCE PENDING**

**Evidence/need.** Scope alive includes uncommitted setup (`ownership/scope.js`). Context factories alone receive internal `enqueuePostCommit`; runtime activates before its callback flush. Neither scheduling a microtask nor registering a fake service/contribution to obtain an availability notification is an accepted own-activation mechanism. Query must support both initial composition and dynamic `use` without fetching under rollbackable setup.

**Composition-owned alternative considered.** Accepted `app.use()` completion can prove activation to an external composer, but HEAD exposes no Query startup command/service for that composer to call. Both initial composition and later dynamic `use("tilia-query-import")` must behave consistently. External special-casing would require a new entry point plus orchestration in every composer, or domain-specific runtime logic; existing handler discovery alone proves neither Query commit nor rollback safety. No accepted alternative currently satisfies those requirements as a self-contained plugin. Retain C: one own-commit callback using existing runtime ordering, no new promise barrier or lifecycle event bus. Reconsider only if review supplies a concrete accepted equivalent covering both composition paths.

**Proposed narrow capability:** `context.lifecycle.afterCommit(callback) -> Object.freeze({cancel():void})`. Register only during this plugin's setup/installing phase, callback must be a synchronous zero-argument function; reject a nonfunction callback with `TypeError`; caller Scope guard runs first, and live registrations outside setup/installing reject `EXTENSION_UNAVAILABLE`. Do not use function arity as a validity check. No raw queue/controller, arbitrary lifecycle events or public phase access. Internal admission checks come from runtime record state. Existing `enqueuePostCommit` schedules one guarded invocation after this plugin has committed and become active. Returned cancellation is idempotent; register its cleanup before exposure. Rollback or scope closure cancels delivery; recheck active record identity/scope immediately before callback. Callback fires at most once, in registration order, and cancellation after it fires does not revoke work it already launched.

Callback returns void; it must start separately Scope-owned/tracked work rather than block setup or runtime activation on network. Throws/thenable-return violations are observed diagnostically after commit and do not undo installation; callback is not awaited as a setup transaction. Query uses it only to establish its activated flag and discovery wait/start logic (§11). Discovery does not substitute for activation. Runtime normal queued uninstall may run after successful commit and callback launch, then cancel work; rolled-back setup must never launch.

**Concrete C tests:** synchronous setup with handler present has no network until own active publication; held setup plus handler discovery has no network; setup failure/cancelled callback gives zero calls; initial Query-first and dynamic handler-first each launch once; missing handler waits and unsubscribe prevents later launch after uninstall; callback reentrancy/cancellation/throws/thenables never undo committed registration or produce unhandled rejection. C is independently review-gated; its specified shape/error policy requires approval before any Query implementation. A governs the separately launched work's cancellation.

No proposal creates an early-removal event, universal adapter, renderer-layer API, event bag or semantic setting.

## 22. Detailed implementation sequence

The user authorizes this implementation sequence after the approval documentation commit. Every cutover deletes its inactive standard path; source-control revert is the rollback, no compatibility bridge.

| Step | Deliverable / authority cut | Entry gate and completion evidence |
|---|---|---|
| 1 | Separate architecture records for A/B/C; record accepted API/error/settlement choices | A/B/C approved; commit this record and normative/historical contract updates before production implementation |
| 2 | Toolbar typed point/catalog/dependencies; Panel/layout/owned styles; retain engine | §6 validation/order/dormancy/rollback, observer/focus/reentrancy tests; no domain imports |
| 3 | Stable Layers rows/domain projections and action-time stale observation | §7 delayed unselected deletion test; §8 canonical refs/replace-data |
| 4 | Reactive Settings; move GPX style from Layers; local command gating | Two-surface FIFO/stale-revision assertions; no duplicate controls or global scheduler |
| 5 | Guarded Entries clear and Layers operation UI | §14 matrix, returned snapshot/committed failures/final-subscriber gate |
| 6 | Status/base-map owned listeners/style leases | Existing service/catalog behavior; delete unsupported installers |
| 7 | Existing presenter completion; domain fit/reveal | §12 suppression matrix and §29 typed actions; no second popup/highlight authority |
| 8 | Semantic Elevation plugin/chart cutover | §13 singleton/zero-distance/selection/fallback/renderer tests; delete legacy installer |
| 9 | A external-signal dispatch, additive invocation Scope payload, bounded failure envelope and native-read/postcommit guards | **A approval** and separate contract tests preserving accepted uninstall completion and verifying resource ownership/outcome envelopes; foundation regressions |
| 10 | Domain-neutral batching/File/URL cutover | **A approval**; §11 busy/cancel/limits/timeout tests; delete old helpers coherently |
| 11 | Own-commit capability and Query | **C + A approval**; §11 order/rollback/uninstall assertions |
| 12 | Host binding and Drop cutover | **B + A approval**; independent B lifecycle tests before real file imports |
| 13 | Viewer and both Embed samples, affected slice composition | Toolbar deps; typed IDs/visibility; accepted inference fixture, no global Photo offsets |
| 14 | Final classification/source/import/style/smoke gates | §23–25; 22 enabled/4 disabled; zero standard failures; recorded exact 4J exceptions |

Host/presentation and approved A/B/C implementation may now proceed. Restore each disabled standard plugin only after its approved contract and real lifecycle tests pass. Do not enable placeholders. Embed inference uses accepted auto-compatible GPX fixture and returned entry ID with `entries.setVisible`, not custom-offset semantics.

## 23. Verification targets (future implementation; not run in this revision)

Use deferred promises and explicit synchronous reentrancy, not sleep-based race tests. Preserve existing tests unless an explicitly approved contract change requires an expectation change; do not alter 4H uninstall completion to fit implementation. Native-reader fakes may need additional native event/abort modeling for new coverage, but preserve a separately controllable noncooperative late-source test with the same uninstall-before-release assertion. Tests and verification are now authorized as part of implementation; approval changes error/API assertions deliberately, not accepted uninstall timing. Every assertion specified in §§6–14/21/29 is a completion requirement. Proposed new test filenames below are **execution targets to create later**, not present evidence.

| Gate | Command / target | Pass criterion |
|---|---|---|
| All units | `npm test` | All existing and authorized replacement tests pass; no standard-product skips |
| New hosts/product behavior | `npx vitest run tests/phase-4i-hosts.test.js tests/phase-4i-product.test.js` (planned) | Exact descriptor/default/order, dormant mounts, action guards, Panel/focus/annotations, fit/Elevation/popup matrices |
| A independent contract | `npx vitest run tests/phase-4i-input-cancellation.test.js` (planned, only after A approval) | Exact precedence/native signals, publication/after-commit outcomes, native read abort, no blanket uninstall wait, cause/residual/listener assertions |
| B independent contract | `npx vitest run tests/phase-4i-drop-binding.test.js` (planned, only after B approval) | Binding resources owned/joined; callback observation nonawaited unless actual resource acquisition requires wait; frozen payload/event/exclusive/headless/rollback/retry, separate fake-callback tests |
| C independent contract | `npx vitest run tests/phase-4i-activation.test.js` (planned, only after C approval) | Own commit distinguished from discovery, rollback no launch, dynamic/initial install and uninstall races |
| Lifecycle/races | `npx vitest run tests/phase-4i-lifecycle.test.js tests/phase-4i-clear.test.js tests/phase-4i-transports.test.js` (planned) | All §14/19/21 races; delayed unselected deletion; cross-surface commands; timeout in each phase; live control restoration |
| Foundation units | `npx vitest run tests/ownership-*.test.js tests/plugin-{runtime,context,lifecycle,planner}.test.js tests/phase-4{c,d,e,f,g,h}*.test.js tests/selection-*.test.js` | Accepted authority/ownership/semantic/rendering behavior retained; only explicitly approved A/C API changes reflected; accepted uninstall completion preserved |
| Foundation browser | `npx playwright test tests/smoke/phase-4{b,c,d,e,f,g,h}.spec.js` | Real Leaflet/provider/renderer/EXIF/cancellation regressions pass; do not skip old noncooperative A race |

Executable preferred noneditor gate (current exact file inventory; append new Query/4I specs when added):

```sh
npx playwright test tests/smoke/phase-4b.spec.js tests/smoke/phase-4c.spec.js tests/smoke/phase-4d.spec.js tests/smoke/phase-4e.spec.js tests/smoke/phase-4f.spec.js tests/smoke/phase-4g.spec.js tests/smoke/phase-4h.spec.js tests/smoke/viewer.spec.js tests/smoke/viewer-base-map-selector.spec.js tests/smoke/viewer-file-import.spec.js tests/smoke/viewer-photo-import.spec.js tests/smoke/viewer-photo-inference.spec.js tests/smoke/viewer-dropzone.spec.js tests/smoke/viewer-url-import.spec.js tests/smoke/viewer-settings.spec.js tests/smoke/viewer-elevation.spec.js tests/smoke/embed.spec.js
```

Playwright's existing config starts `npm run serve -- 4173`. `npm run test:smoke` still inventories the full suite; its 14 Editor scenarios stay explicitly deferred in §24, not counted as 4I passes. No blanket noneditor skips. Preserve pure GPX/Photo and accepted foundation tests. Rewrite obsolete global Photo/default-offset, pane-shape, popup-selection coupling, legacy raw installer/dispatch-context and forced filename assertions at the matching authorized cutover, keeping their meaningful product coverage.

## 24. Production smoke coverage matrix

HEAD inventory has 43 existing scenarios: **29 noneditor** and **14 Editor**. This table accounts for all existing files/scenarios; historical failure counts in §3 are not fresh outcomes. “Revise” means migrate obsolete selectors/authority/expectations while retaining stated coverage, never hide failure with a skip.

| Existing smoke file / scenarios | Disposition and required target assertion |
|---|---|
| `phase-4b.spec.js` (1) | Retain empty-allowlist shell/isolated sample contract; do not force Viewer plugins into it |
| `phase-4c.spec.js` (2) | Retain status/base-map boot and provider/control uninstall/reinstall without leaks |
| `phase-4d.spec.js` (1) | Retain headless GPX/Photo semantics |
| `phase-4e.spec.js` (1) | Retain semantic selection without rendering/presentation |
| `phase-4f.spec.js` (2) | Retain real Leaflet failure/retry/currentness and reentrant highlight/private-pane reacquisition |
| `phase-4g.spec.js` (3) | Retain GPS Photo lifecycle/popup independence; timestamp-only three modes/UI lifetimes; optional EXIF first-JPEG/cross-realm signal behavior |
| `phase-4h.spec.js` (5) | Retain real file/tree/route click/style/removal; one-shot inference; renderer failure/recovery; input pre/postcommit + one-time fit; actual clicks in both tracks. Preserve uninstall-before-delayed-read-release order and zero late entry; entry persistence and one-time fit remain. Native FileReader abort coverage is added separately, not used to remove the late-work regression |
| `viewer.spec.js` (1) | Revise Toolbar placement selectors if needed; retain boot/controls/no pageerror |
| `viewer-base-map-selector.spec.js` (1) | Retain active base-layer switch through catalog |
| `viewer-file-import.spec.js` import + Delete all (1) | Retain real GPX entry/tree and **Delete all**; assert typed clear/selection cleanup rather than UI-owned loop |
| Same file route-point popup (1) | Retain canonical route-point selection/content; revise obsolete renderer-pane selectors |
| `viewer-photo-import.spec.js` (1) | Retain GPS JPEG metadata/location/preview/layer via real handler |
| `viewer-photo-inference.spec.js` (1) | Revise legacy offset/settings to accepted per-entry auto/local/utc and compatible fixture; retain inferred coordinate behavior |
| `viewer-settings.spec.js` (1) | Replace obsolete global default-mode expectation with per-entry three-mode authoritative setting; retain status redisplay and settings interaction |
| `viewer-dropzone.spec.js` (1) | Restore real GPX Drop via approved B/A, row appears; no raw target installer |
| `viewer-url-import.spec.js` (1) | Restore real URL GPX recognized by filename/MIME, row appears; no forced guessing |
| `viewer-elevation.spec.js` renders profile (1) | Restore track profile via queries/current UI |
| Same file closes previous waypoint popup (1) | Revise coupling: opening/local chart-track choice preserves waypoint selection and popup exposure; semantic point click may replace selection |
| Same file separates tracks/hover/click (1) | Retain logical-track gaps, owned hover, canonical point click/pan when visible/current |
| Same file map clicks each track (1) | Retain canonical points in both tracks; migrate pane selectors |
| `embed.spec.js` (1) | Restore three independent maps via target composition/typed IDs/accepted inference; cover both language sample variants |
| `editor.spec.js` (14) | Explicit 4J: boot; immediate drafts; restart after cancel; point/midpoint/background selection; drag; inspector validation/history; insert/undo/redo; delete selected/unselected; area replace; empty/multiple/Escape; bulk delete/Undo; final-structure deletion; normal track→local editing; multiple draft tracks/segments. No partial edits in 4I |

Add later real production coverage for Query-first/handler-first and dynamic installation, JPEG Drop, File Cancel, URL close/reopen and full timeout, both Panel layouts/focus, stable settings races, hidden/headless/singleton Elevation, stale unselected removal, contribution host-first/contributor-first teardown and GPX-only module loading. Real Viewer must boot all restored standard plugins; samples must not quietly omit broken standard features. Module-load checks assert GPX-only requests contain no Photo/EXIF implementation. Repeat install/uninstall leaves no assigned DOM/listeners/controls/feature stylesheet leases. Full migration-wide suite closure remains 4K; Editor remains 4J.

## 25. Executable forbidden-symbol and import audits

### Exact disabled-file baseline, not count-only exceptions

Audit roots are **`src/`, repository-root `plugins/`, and all `samples/`** (JS and HTML included). Rechecked HEAD refresh calls:

| Disabled 4J file (repository-root) | refreshView | addRefreshHandler | Exact reviewed lines | HEAD blob ID |
|---|---:|---:|---|---|
| `plugins/x-gpx-export/loader.js` | 0 | 1 | addRefreshHandler 124 | `2a62b55d422260d06a8c78b0b50b03b5cc07f899` |
| `plugins/x-route-search/loader.js` | 1 | 0 | refreshView 450 | `b0dc52e08e21828479233e5fa37806f4d6fe1974` |
| `plugins/x-track-editor/loader.js` | 1 | 1 | refreshView 358; addRefreshHandler 607 | `d390603d1e1f21545436a9ce5e23d60bc2190fa4` |
| `plugins/x-milestone/loader.js` | 0 | 1 | addRefreshHandler 208 | `454b8e8a299be09c0571efdef36270e430022f38` |

These four loaders remain **byte-identical to reviewed HEAD through 4I**. This is stronger than counts: removing an old call and adding a new one still fails. They must stay disabled and unreachable from enabled/sample composition. No additional file/symbol exceptions. Existing other 4J loader dependencies are recorded narrowly: export `core.state.entries` (6,86), `app.core` (43), `entry.source` (72,92,93); route `app.core` (188), `entry.source` (441); editor `core.state.entries` (30,80), `app.core` (65), `entry.source` (285,473), `app.subscribeInteractions` (595); milestone `app.subscribeInteractions` (125,197), `entry.source` (144), `app.state.entries` (188). Hash equality preserves only this existing text; it does not authorize new uses or enabled imports. No exceptions for Selection/Interaction Hubs, legacy overlay builders or new foreign-layer reads.

Migration §15's literal “no production refreshView/addRefreshHandler” completion wording conflicts with these retained disabled files. **Current explicit user authorization narrowly qualifies that 4I check**: zero in enabled production-reachable paths, with these exact disabled remnants removed coherently in 4J. Report raw matches and qualified reachable-zero separately; do not claim literal repository-wide zero. Do not edit Migration Plan in this task. All standard UI/transport refresh paths still must be removed in 4I; this is not blanket deferral of legacy symbols.

All samples are scanned, including Editor. Current Editor sample code has no refresh calls and only requests disabled plugin IDs; its 4J behavior may remain unavailable but receives **no forbidden-symbol search exemption**. If a future sample mismatch is found, investigate and gate completion rather than silently expanding exceptions. Embed's current legacy calls must be removed in 4I.

Text-search diagnostic (exit 1 with no matches is normal for `rg`; recorded exceptions mean raw search is not itself the qualified gate):

```sh
rg -n 'refreshView|addRefreshHandler|app\.core|app\.state|core\.state|state\.(entries|sources|layers)|entry\.(source|layer|interactions)|selection-hub|interaction-hub|subscribeInteractions|buildGpxOverlay|buildPhotoOverlay' src plugins samples
```

Executable qualified **text** gate; run from repository root after implementation. It deliberately fails current Embed/legacy standard modules, whose removal is planned. Baseline comparison uses pinned commit, not moving HEAD:

```sh
python3 - <<'AUDIT'
from pathlib import Path
import re, subprocess
baseline = 'b4dbb30d3c914ffb6e970a481840c7a914936aea'
exceptions = {
 'plugins/x-gpx-export/loader.js', 'plugins/x-route-search/loader.js',
 'plugins/x-track-editor/loader.js', 'plugins/x-milestone/loader.js',
}
pattern = re.compile(r'\b(?:refreshView|addRefreshHandler|subscribeInteractions|buildGpxOverlay|buildPhotoOverlay)\b|app\.(?:core|state)\b|core\.state\b|state\.(?:entries|sources|layers)\b|entry\.(?:source|layer|interactions)\b|selection-hub|interaction-hub')
failures = []
for name in sorted(exceptions):
 expected = subprocess.check_output(['git', 'show', f'{baseline}:{name}'])
 if Path(name).read_bytes() != expected:
  failures.append(f'Changed disabled baseline: {name}')
for root in ('src', 'plugins', 'samples'):
 for path in sorted(Path(root).rglob('*')):
  if path.is_file() and path.suffix in ('.js', '.mjs', '.html', '.css', '.json'):
   for line, text in enumerate(path.read_text().splitlines(), 1):
    if pattern.search(text) and path.as_posix() not in exceptions:
     failures.append(f'{path}:{line}: {text.strip()}')
if failures:
 raise SystemExit('\n'.join(failures))
print('Qualified text gate passed; four disabled baselines unchanged')
AUDIT
```

### Import reachability, semantic access and runtime loads

Text zero is necessary, insufficient: aliases/computed access can evade it. Add later explicit audit tests in planned `tests/phase-4i-audits.test.js`, run `npx vitest run tests/phase-4i-audits.test.js tests/plugin-migration-allowlist.test.js tests/plugin-catalog.test.js`, with these roots/rules. Parse static imports, reexports and literal dynamic imports including sample inline modules; fail unclassified nonliteral loaders rather than assume unreachable. Traverse eager imports separately from optional lazy catalog edges. `src/builtins.js` metadata mentioning an ID is not proof its module was evaluated. Resolve actual enabled load roots through catalog/composition; verify disabled complex IDs are rejected before their imports, including Editor composition attempts.

| Audit | Exact modules/roots and pass/fail method |
|---|---|
| Domain-neutral generic hosts | `src/ui/{mounts,domain-contributions,scoped-dom}.js`, `src/plugins/ui/{panel,layers-control,settings-panel,status-control,base-map-control,map-selection-presenter}.js`, planned Toolbar/private layout modules. Direct host imports must use generic infrastructure or explicitly permitted typed contracts/keys/facades; no direct imports of domain implementation/providers/renderers. Track transitive edges with provenance: `src/domains/facades.js` legitimately imports `src/gpx/queries.js` to implement the accepted typed API. That facade-internal semantic dependency is permitted and is not a generic host interpreting GPX. Do not reject an entire typed facade because its implementation is domain-specific, and do not exempt arbitrary imports merely because a facade is somewhere in the graph. An edge from host code to an implementation, raw snapshot interpretation in generic code, or provider/renderer implementation crossing into host behavior fails. Generic hosts must not import domain UI/renderers under an alleged facade exception. Presenter may construct its own Leaflet popup/highlight, never import a domain renderer |
| Legacy transport reachability | `src/application-composition.js`, `src/builtins.js`, enabled `src/plugins/input/` and sample module roots. No reachable `src/core/input-processing.js`, `src/core/remote-url-import.js`, old installer entry points; delete disconnected standard helpers per §20, not just hide catalog imports |
| Disabled complex modules | All four loaders above and their legacy dependency graph. No enabled production/sample traversal executes them; classification/call rejection tests and browser request assertions. Metadata-only disabled IDs in Editor are not execution exceptions |
| Foreign renderer resources | Search `getLayers/eachLayer/getLatLng/getLatLngs/entry.layer/entry.interactions/advancedLeafletMap` in generic UI/domain UI/Elevation/transports, then inspect every match and aliases. Own newly constructed presenter/hover layers are permitted; renderer-group traversal/readback or raw map attachment fails. Static provenance review complements text/import tests |
| Eager Photo/EXIF | Eager graph from public app entry/composition and GPX-only sample must not include Photo provider/UI/renderer, `src/photo/exif.js` or EXIF dependency; lazy catalog imports are allowed. Preserve 4G browser request capture: GPX-only requests none; first handled JPEG loads EXIF, merely importing catalog does not |
| Feature CSS ownership | `src/ui/styles.css`, `src/gpx/styles.css`, `src/photo/styles.css`, presenter CSS and new host/transport CSS. Inventory feature selectors with an owning plugin and `styles.use` lease. Generic shared sheet keeps shell primitives only, no domain/obsolete feature selectors or permanent `registerStylesheet` helper. Browser teardown/reinstall checks physical links and balanced leases |
| SelectionStore separation | `src/selection/{store,coordinator,candidates,index}.js`; graph/search for DOM, window/document, Leaflet, popup/rendering imports/state. Typed semantic/provider cooperation remains valid; presentation authority inside SelectionStore fails. Preserve existing selection-architecture tests |

This contract-aware import rule does not waive eager-load limits: importing a permitted facade that unexpectedly loads Photo/EXIF eagerly still fails the separate load gate. Text search, parsed graph proofs, browser module-request verification and manual provenance/CSS inventory are **distinct evidence**, all required. Documentation references/test negative assertions are outside production-root scans. No existing test is edited in this revision; planned audit implementation and any ambiguous match investigation remain §28 gates.

## 26. Completion gates

Planning, A/B/C approval, implementation and verification are complete. Implementation review/acceptance remains pending; approval commit `7b7bb11` preceded production changes. See the current report above for executed gates.

Future 4I completion requires:

- Explicit approved records for **A/B/C** before dependent work; dispatch outcome envelope and preserved uninstall/resource-specific waits reviewed in A, binding ownership/retry in B, own activation in C.
- Every Migration §15 standard requirement covered under explicit user scope; retain semantic authorities and typed hosts, consolidate 4G/4H without duplicate paths.
- Exact Toolbar/catalog/dependency/layout contracts, including File→Toolbar, stable reactive UI and action-time stale observation.
- Existing clear semantics and committed entry persistence preserved, including pending-create and final-subscriber cases.
- All §23 units/contract/race/foundation and all §24 noneditor product behavior pass; no standard failures hidden by skip or omission.
- Final classification **22 enabled / 4 disabled**; only complex plugins remain disabled, none enabled before target readiness.
- Qualified text + graph + runtime/CSS/provenance audits pass (§25); report raw exception matches separately, byte-identical four-loader baselines.
- Planned tests and investigation items in §28 resolved with evidence; public asynchronous app destruction still explicitly incomplete until 4K. No blanket awaited handler/transport/Drop-callback barrier; existing waits for real owned resources remain.
- Authorized implementation diff reviewed for intended scope; this documentation-only revision has no production/test edits or commits.

## 27. Explicit deferrals

- **4J:** GPX export, route search, track editor, milestone, Editor restoration/structural editing and coherent removal of their recorded legacy dependencies. No partial loader edits in 4I.
- **4K:** terminal asynchronous public `app.destroy()`, final exception removal verification and migration-wide lifecycle closure.
- **Future separately designed features:** Photo global defaults/custom offsets, GPX Segment mode, global GPX preferences and new structural semantics.
- **Excluded:** `PartiallyEditablePolyline` changes, compatibility/raw DOM bridges, early logical-removal events/polling, automatic GPX-triggered Photo recomputation, universal adapters/event bags and foreign renderer access.

A/B/C are approved as specified; any newly necessary generic contract change requires a concrete counterexample and fresh review. EXIF investigation does not pre-authorize such a change.

## 28. Unresolved items and review status

Status vocabulary: **ready** = specification has sufficient accepted evidence for later authorized implementation; **revision required** = proposal needs review/accepted contract update before dependent implementation; **investigation required** = specified evidence/implementation experiment still needed. Implementation is explicitly authorized; statuses distinguish approved contracts from remaining investigation/verification.

| Item | Status | Remaining question/evidence and blocked dependency |
|---|---|---|
| Scope/baseline/classification | ready | Actual HEAD and 17/8 checked; Photo per-entry only, 4J/4K/vendor boundaries preserved |
| Toolbar/Panel/product choices | ready | §6/9/12/13/29 specifies ordinary choices; validate with later host integration tests |
| Entries clear exposure | ready | Exact HEAD forwarding/concurrency in §14; no semantic amendment |
| Stalled external deletion | ready | Limitation and action-time local withdrawal specified; delayed unselected regression required |
| A operation cancellation/outcome envelope | ready | Approve native options/checkpoints, invocation Scope payload for owned reader cleanup, and one bounded InputDispatchError contract; ExtensionError unchanged; no blanket uninstall join. Blocks operation cancellation/timeouts through File/URL/Query/Drop |
| B Drop binding | ready | Approve exclusive/staged narrow target, host resource ownership/retry and contributor resource-close join; callback work observed nonawaited except concrete resource obligation. Blocks attachment; A separately gates import |
| C own-commit callback | ready | Approve minimal lifecycle facade/setup-only admission and callback diagnostics, or supply an accepted equivalent proving own activation. Blocks Query startup even if A approved |
| Resource-specific close/join verification | ready | Design uses accepted Scope ordering, EntryStore preparation waits and B contributor resource-close join only. Future tests prove no circular waits/residual loss; this verification is not an unresolved blanket handler barrier |
| Pinned EXIF internal read cleanup | investigation required | Wrapper exposes only promise/data, samples pin 7.1.3; exact internal-reader cleanup/cancellation was not established from the pinned source. Confirm its reader cleanup on success/rejection; if a real leak appears, specify that resource-specific fix rather than waiting all parsing. Blocks declaring JPEG late-work cleanup coverage complete, not justified expansion of uninstall contract |
| Toolbar physical layout integration | investigation required | Real Leaflet bottom-order/collision/focus/annotation tests and private host lease shutdown; if existing host cannot implement safely, return to review before adding a general capability |
| Complete import/provenance/CSS evidence | investigation required | Implement parsed graph rules and selector-owner inventory in §25, inspect aliases/computed access, browser requests; text search alone cannot prove all authority separation |
| Verification execution | ready | Test design is specified in §§21/23/24; execute later only when implementation authorized, record fresh evidence. No tests run here; pending execution is not an unresolved API choice |

Source evidence: `ARCHITECTURE.md` §§9/14/16/17/23/42 as cited in accepted phase documents; `MIGRATION-PLAN.md` §§15/23; accepted 4A–4H records; exact source modules referenced above. Accessible review report: `/Users/hiroaki/.codex/.chatgpt-projects/g-p-6aba2fb4e44c8191b8cb06d5317ac132/outputs/PHASE-4I-PLAN-REVIEW.md`. This document does not replace the review's acceptance record.

## 29. Typed fit/reveal product decisions

Domain adapters own explicit Fit/Reveal controls (including a guarded double-click shortcut on their own row), while generic fallback exposes no guessed domain geometry. Selection click alone does not automatically pan. No all-data fitting is restored in 4I; no existing aggregate typed extent is invented.

| Action | Exact typed source and map effect |
|---|---|
| GPX Fit entry/track/segment/route | Fresh `gpx.get(id)` and `gpx.getExtent(id,{target})`; document target for whole entry, current canonical revision-scoped target otherwise. Convert `{southWest:{lat,lon},northEast:{lat,lon}}` to `[[southWest.lat,southWest.lon],[northEast.lat,northEast.lon]]`; `map.fitBounds(bounds,{padding:[20,20],maxZoom:18})` |
| GPX point Reveal | Fresh point/coordinate from immutable view; validate captured revision, build an **unversioned** target (`kind` and accepted indices only), then `selection.request(gpx.selection.createCandidate(id,target))`, revalidate current entry/revision, then `map.panTo({lat:point.lat,lng:point.lon})`. No renderer layer readback |
| Photo Fit/Reveal | Fresh `photo.get(id).snapshot`; coordinate is `data.coordinate ?? derived.inferredLocation`, preserving GPS precedence and saved inference. Fit uses duplicate coordinate bounds with padding `[20,20]`, maxZoom 18; Reveal requests `photo.selection.createCandidate(id)` then fresh coordinate revalidation and `map.panTo({lat,lng:lon})` |

Manual Fit/Reveal uses semantic geometry even for hidden entries/categories/tracks or absent renderer; it does not force visibility or install a renderer. Semantic selection can exist headlessly. This explicit navigation policy differs from **automatic** Elevation pan/hover, which requires effectively visible current presentation (§13). No raw Leaflet map/layer access.

Null/empty extent, missing/nonfinite coordinate or unavailable provider disables the corresponding Fit/Reveal at render and makes action-time revalidation a safe no-op with local explanation. Revision change rerenders controls; stale structural target rejects rather than following reused indices. Recheck entries/domain/scope immediately before map effect, and withdraw local stale UI on observed absence. No await between final fresh read and camera call; when selection request crosses async work, read again after it. Photo without coordinate can still select semantically even when Fit/Reveal is disabled. GPX input's existing one-time postimport fit retains its accepted padding behavior (not the new manual maxZoom choice), now with A's signal guard; no later semantic change auto-fits.

Tests assert exact lon→lng/bounds conversion, empty no camera calls, saved inferred Photo location/GPS precedence, manual hidden/headless navigation without visibility mutation, stale revision/deletion no camera calls, and no all-data or foreign-layer traversal.
