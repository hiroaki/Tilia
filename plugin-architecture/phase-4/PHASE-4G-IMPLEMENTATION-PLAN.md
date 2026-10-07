# Phase 4G — Photo Vertical Slice Implementation Plan

## 1. Decision and Review Status

Documentation revision: 2026-10-07. Review/planning only; no Phase 4G production or test implementation is authorized by this revision.

Current execution status after the user's acceptance/start and continuation instructions: planning documentation was committed as `398fab5`. Phase 4G implementation remains unaccepted. The subsequent review reproduced three contribution/layers/panel lifecycle defects, now resolved, followed by an additional panel close/open reentrancy defect. Its local fix and rerun verification are recorded in the implementation report, with implementation review/acceptance still pending. Both generic amendments, preview, lazy JPEG input, production Photo renderer, typed hosts/Photo contributions, independent presenter and legacy Photo cutover are implemented. See the [implementation report](PHASE-4G-IMPLEMENTATION-REPORT.md) for the actual tests, scenario identities, resource-leak regression and remaining later-phase limitations. Production changes are uncommitted. The review-only statements below preserve the original planning-step boundary; they do not prohibit the subsequently authorized implementation.

The user has approved both bounded generic contract amendments in the [amendment record](PHASE-4G-CONTRACT-AMENDMENTS.md); §4 lists the accepted implementation tasks. This supersedes the earlier plan's statement that both amendments awaited a user decision. It does not approve broader architecture changes. Minimum popup/presentation, settings/tree contributions and JPEG input remain governed by `MIGRATION-PLAN.md` §13. Settings expose only per-Photo `auto`/`local`/`utc`; global defaults/custom offsets remain deferred.

Authority: `ARCHITECTURE.md`, the migration sequence, accepted Phase 4A–4F contracts, then accepted Phase 4F code. The baseline is commit `fd4ea23a62face90916355292e2a39142b9b0c01`. The two amendments are approved contracts implemented in Phase 4G; the historical baseline does not implement them. No RenderingCoordinator or SelectionStore redesign is proposed.

The earlier investigation recorded 560 passing unit tests in 55 files and 35 full-product smoke scenarios (8 passing, 27 failing). These are baseline observations, not results of this documentation revision. Projected counts in §12 are expectations requiring scenario-by-scenario verification during implementation. Completed-phase implementation reports are outside this edit.

## 2. Accepted Baseline and Legacy Disposition

Runtime reachability, rather than file presence, determines authority. Current production has a headless Photo provider/selection adapter; it has no complete production Photo JPEG/render/popup path. The accepted production module graph does not activate the old Photo overlay or EXIF path.

| Component | Classification and 4G disposition |
| --- | --- |
| Ownership scopes, PluginRuntime, typed registries, input invocation, styles/UI mounts and MapFacade | Active target foundations; reuse |
| DomainRegistry, exact provider leases, EntryStore, Photo provider/facade | Active semantic authority; preserve, extend only as specified |
| SelectionStore and Photo canonicalization | Active sole semantic selection authority; preserve |
| Renderer registry/coordinator/controllers/generations, surfaces/bindings/presentation | Active Phase 4F foundation; consume |
| `src/photo/exif.js` parsing logic | Reusable Photo logic; dynamically load for JPEG handling, remove legacy URL ownership from parsing |
| Old Photo popup/thumbnail formatting | Reuse domain formatting after adapting to accepted snapshots; move to Photo UI |
| `buildPhotoOverlay`, mutable Photo marker/selection/interaction bookkeeping | Inactive legacy authority; delete Photo paths after target cutover |
| Legacy Photo layers/settings integration | Replace minimum behavior through typed hosts/adapters; do not reactivate |
| Legacy Photo Interaction Hub branch | Delete Photo branch; keep remaining GPX branch until 4H |
| Photo-from-GPX/time inference helpers | Keep pure logic for 4H; no runtime integration in 4G |
| Shared GPX map/layer/UI code | Keep required GPX portions for 4H; do not delete whole shared files |
| Drop/URL/query input, elevation, broad standard UI | Deferred to 4I; no JPEG backdoor through legacy input processing |
| External plugins/vendors | Deferred to 4J; no unrelated edits |
| Legacy boot/state/selection authority | Already cut over; never restore |

The implementation audit must enumerate remaining legacy identifiers and classify each reachable consumer. A symbol retained for deferred GPX work or a historical fixture is not permission to use it for Photo.

## 3. Production Outcome and Scope

The target flow is JPEG input → Photo provider → EntryStore → immutable Photo snapshot → RenderingCoordinator → Photo renderer → one-marker RenderGeneration → owned interaction → domain-issued semantic candidate → SelectionStore. Presentation consumers obtain guarded geographic data and own their popup/highlight independently.

Restore GPS Photo import, filename/location status, tree row, marker click selection, whole-entry visibility/deletion, selected highlight, minimum popup, per-Photo time preferences, semantic replacement, renderer removal/reinstallation and deterministic cleanup. A timestamp-only Photo remains a valid semantic entry selectable in the tree, with no geographic marker or map popup. No-GPS inference is absent until 4H.

Rendering failure never undoes semantic commit or selection. UI/input/renderer removal never deletes app-owned entries. Canonical preview resources belong to the Photo provider, not the renderer or input invocation. Do not add a legacy bridge, raw foreign layers, generic Photo branches or a second selection store.

## 4. Approved Amendments and Implementation Tasks

Both additions are **approved, implemented and verified in Phase 4G; implementation review/acceptance pending**. The [separate contract-amendment record](PHASE-4G-CONTRACT-AMENDMENTS.md) is the consolidated definition of the original contracts, demonstrated gaps, approved additions/limits, reasons, affected invariants and required verification. It supplements the historical plans; the accepted Phase 4F code does not already implement either addition. The living architecture records the current approved requirements. This plan defines future implementation work rather than a competing contract copy.

### 4.1. Presentation invalidation work

Implement [amendment §2](PHASE-4G-CONTRACT-AMENDMENTS.md#2-presentationhandle-permanent-invalidation) in generic presentation resolution. Add the readonly handle signal, combine captured exposure/consumer lifetimes, remove forwarding listeners and cover registration races. Connect presenter-owned popup/highlight teardown to invalidation while retaining currentness guards and the accepted no-final-status termination policy. Verify the ordering and permanent invalidation cases in §12; preserve accepted generation renewal, replacement and semantic selection behavior.

### 4.2. Domain creation cancellation work

Implement [amendment §3](PHASE-4G-CONTRACT-AMENDMENTS.md#3-domain-create-commit-boundary-cancellation) in typed creation/EntryStore, then forward the input invocation signal from JPEG handling. Add option validation, preparation cancellation forwarding, the final commit guard and abort-error integration. Reserve the late-disposer cleanup obligation before preparation and use accepted explicitly awaitable destination-scope work for the preparation/disposer handoff. Keep physical cleanup and provider-lease release behind settlement and successful cleanup; retain existing residual attribution/retry on failure. This is entry creation work, not a change to Phase 4F detached rendering acquisition policy.

Verify pre-reservation and commit-boundary cancellation, post-commit independence, non-cooperative settlement, late resources, listener cleanup, ID gaps, URL-revocation failure, uninstall rejection while residuals remain and release after successful cleanup retry (§12). Completion requires the amendment's publication and error invariants without a second transaction or ownership system.

## 5. Photo Semantic Contract

Preserve the current provider partition:

| Partition | Accepted values and behavior |
| --- | --- |
| `data` | Name, coordinate (`{lat, lon}` or null), captured timestamp (finite epoch value or null), GPS/camera/source metadata; no browser URL |
| `preferences` | `requestedTimeMode`: only `auto`, `local`, `utc` |
| `derived` | Auto is unresolved without inference; local/utc resolve to that mode. Inferred timestamp/location remain null. Own coordinates produce `locationSource: "exif-gps"` |
| Private instance/resources | Blob, canonical object URL and cleanup; never semantic identity/events/diagnostics |

Latitude/longitude must be finite and in range; captured time is finite or null. Preserve the accepted immutable snapshot shape and source metadata validation. Do not add orientation/dimensions or new time-offset representations to this slice.

`photo.get()` returns the accepted entry/revision/snapshot view. Preserve `replaceData`, `setRequestedTimeMode`, `recomputeDerived` and expected-revision guards. Changed semantic data/time preference increments revision once. Idempotent commands, whole visibility, selection, preview-only replacement and derived-only no-op do not. Resource-only replacement keeps the exact semantic snapshot/revision and does not rebuild primary rendering or refresh selection. A GPS Photo keeps its own coordinate in every accepted mode; modes do not silently activate GPX inference.

The canonical semantic selection ref is exactly `{kind: "photo"}` with no extra keys. No-GPS Photos remain valid/selectable. Equal requests are idempotent; semantic revisions reconcile selection through the accepted provider adapter.

## 6. Lazy JPEG Input

Add optional `tilia-jpeg-input` requiring the Photo domain. Register handler `tilia-jpeg`, priority 0, discovery extensions `.jpg`/`.jpeg` and MIME `image/jpeg`. Recognition is synchronous and accepts JPEG MIME or case-insensitive filename extension for supported Blob/File input. Registry matching/tie/error semantics remain unchanged.

Only `handle()` dynamically imports Photo EXIF parsing. Normalize `parsePhotoFile` output to accepted provider data, default per-Photo mode `auto`, and the original Blob. The parser creates no persistent object URL; creation and URL ownership belong to the provider. Forward the invocation signal to the newly approved domain-create option and guard parsing continuations.

Preserve current parser outcomes: missing EXIF, or neither GPS nor capture time, rejects before semantic commit; time-only EXIF is valid; GPS without time is valid. Normalize usable DateTimeOriginal/CreateDate to a finite epoch value, including zero. Provider validation rejects malformed coordinates/timestamps. Unsupported input remains an InputRegistry result. Do not apply the unrelated remote GPX size policy to JPEG.

Reuse the existing browser import mapping for EXIF (`exifr`); no unrelated dependency migration is needed. Generic composition never imports the parser. Installing Photo provider/renderer/UI or merely registering JPEG does not load EXIF; first JPEG handling does. No optional plugin is auto-installed by a consumer.

Rewrite only minimum file-picker transport through InputRegistry discovery/dispatch. Preserve batching, status/error reporting, filename/location details and input reset. Do not restore GPX input or drop/URL/query transports in 4G.

## 7. Private Preview Access and Resource Races

Introduce a narrow typed Photo-only `getPreview(entryId, {scope} = {})` returning null or a guarded consumer handle. Scope defaults to the facade consumer and, when supplied, must be a live child within that consumer. Proposed handle operations are `readUrl()`, `isCurrent()`, readonly `signal: AbortSignal`, and idempotent `release()`.

Every read verifies consumer/provider authority, a logically live entry, and the exact current preview resource. Consumer closure/release permanently invalidates the handle and removes forwarding listeners; it does not revoke the canonical provider-owned URL. Logical deletion **immediately** makes `isCurrent()` false and `readUrl()` reject, before physical cleanup finishes. Preview invalidation notifications must not permit continued reads during that interval. Physical URL revocation follows accepted selection/render invalidation and awaited rendering teardown, not an eager generic-entry callback.

Use the existing privileged semantic target internally; expose no provider instance, Blob, entry scope/controller or URL in generic views, snapshots, events, selection or diagnostics. Do not introduce general refcounts or provider leases for preview consumers.

Keep a private preview-resource identity shared by metadata/time-mode replacements that retain the Blob. Resource-only replacement retires that identity, invalidates consumers, synchronously clears obsolete image sources/listeners, then revokes the old URL through accepted cleanup. UI may reacquire the current preview under its still-live mount guards; no semantic event/revision is manufactured. Old handles never revive after retry.

Image load/error continuations check mount, preview and presentation currency. URL revocation failure remains an existing cleanup residual and retains the provider lease when required. Rendering teardown precedes canonical resource revocation on deletion. The marker uses no preview, so renderer-only uninstall does not revoke it.

## 8. Photo Renderer and Selected Presentation

Add optional `tilia-photo-renderer`, requiring the Photo domain and registering one primary Photo renderer through the accepted renderer registry. Use the current generation build API, MapFacade, resource ledger, surfaces and bindings.

GPS build creates one Leaflet Marker at `{lat, lng: lon}` with meaningful filename title/alt and keyboard support. Register removal in the generation resource ledger before attachment, then attach in the `markers` band. Register an owned marker surface and a click binding resolving exactly `{kind: "photo"}`. Host currency/visibility checks and domain candidate issuance remain the only committed interaction path. No raw marker, mutable layer or generation token escapes into selection.

Publish immutable geographic anchor, one-point bounds and `{kind: "point", point}` highlight descriptor for the valid Photo ref. Null coordinate produces a successful empty descriptor: valid semantic entry and renderer availability, no marker/geographic anchor/map popup. Do not classify it as a provider or build failure.

Choose `planChange: () => "replace"` for changed semantic snapshots; do not add Photo-specific safe-update machinery. Whole visibility uses the accepted controller path without semantic revision. Hide/show can preserve generation token but must renew presentation authority. Selected state is an independent presenter-owned CircleMarker in the selection band (radius 18, teal stroke, no fill, non-interactive), not mutation of primary marker resources. Selection alone never rebuilds the marker or increments semantic revision.

Use default Leaflet pin assets/core styling. There is no renderer-specific thumbnail marker/CSS requirement. No auto-fit policy is introduced. Retain accepted failure/quarantine/retry and stale binding suppression. While replacement prepares, stale rendering is display-only; definitive failure for a newer semantic revision retires the stale old generation. Renderer removal retains semantic selection/entry/preview; reinstall rebuilds current semantics, keeping hidden entries detached.

## 9. Minimum Typed UI Hosts and Photo UI

Implement the minimum panel/layers/settings/file-import hosts needed by migration §13, with generic fallbacks and fixed typed points rather than domain branches or a universal adapter registry.

- Layers: one domain-keyed primary adapter with `mount({container, scope, entry})`; generic host owns visibility/deletion controls and fallback domain/ID rows.
- Popup: one domain-keyed primary adapter with `mount({container, scope, selection, presentation})`; exact domain-key identity, staged registration, deterministic duplicate rejection and availability subscriptions.
- Settings: the accepted multi-contribution point, group/rank/ID ordering and support predicate; mount receives container/scope/entry.
- Panel: typed service key with scoped open/toggle/close/isOpen and a captured-generation disposable handle; close obligations cannot remove a newer panel. Preserve focus restoration and basic accessibility.

Hosts own mount scopes/containers. Contribution owners retain guarded registration/callback authority and arrange cross-lifetime closure; resources have one owner, with idempotent close obligations for other participants. Use existing staging/subscription/style/UI-mount engines. No raw foreign UI or untyped service lookup is added.

Add `tilia-photo-ui` requiring the domain, plus independent generic `tilia-map-selection-presenter`. Photo tree rows show filename/time/location source and guarded thumbnail, and submit semantic selection. Keep generic visibility/delete controls. The GPS row has no inline time selector, preserving existing import smoke expectations. Settings offer per-entry auto/local/utc for GPS and timestamp-only Photos; no global default/custom-offset controls. Read revision at command time; stale-revision failures reread/report rather than silently retrying a changed choice.

Popup content includes filename, captured time (including epoch zero), own coordinates/location source, camera metadata and guarded preview where available, using Photo formatting adapted to accepted snapshots. Presenter observes semantic selection, render status, popup adapter availability and handle invalidation. It resolves a current handle, creates owned popup/highlight children, and rechecks authority around mounting. Use ordinary owned MapFacade attachment/cleanup; do not reach into primary rendering.

Popup dismissal and highlight are independent: closing the popup preserves selection and the current highlight, and must not immediately reopen for the same selection/exposure. A new selection or fresh exposure may reopen it. Test this separately from popup-adapter removal. Adapter removal closes that adapter's popup mount only; valid semantic selection, primary rendering and independently owned current highlight remain. Adapter reinstall may remount an undismissed current popup, without resetting dismissal for the same selection/exposure. Presenter uninstall or presentation invalidation closes both popup and highlight. A stale popup-close callback must not affect a newer mount.

Popup/image/contribution failure remains presentation failure, without semantic rollback. Photo UI and presenter styles use scoped stylesheet leases; remove obsolete Photo gallery/marker styles after target cutover, retaining shared GPX styles for 4H.

## 10. Ownership and Lifecycle Verification

Ownership is application semantic root → entry scope/private resource/provider lease; rendering root → controller → generation/resource ledger/interaction issuer/exposure; presenter → popup/highlight children and close obligations; UI host → mounted container/child, with contributor liveness guards; input caller → temporary invocation. No committed entry is owned by its input plugin.

| Trigger | Required outcome |
| --- | --- |
| Hide/show | Selection retained; bindings/old handles invalidated; show uses fresh exposure, no old-handle revival |
| Semantic mutation | One revision; old rendering non-authoritative; replacement from committed truth |
| Definitive new-revision replacement failure | Stale old rendering retired; semantic entry/selection remain |
| Renderer removal/reinstall | Generation resources/bindings gone; provider URL remains; fresh current rebuild, hidden entry detached |
| Selected logical deletion | Public lookup/preview access fail immediately; selection clears; rendering invalidates and closes before URL cleanup |
| Resource-only replacement | Old preview invalidates; semantic revision/selection/primary generation unchanged |
| Input/UI removal | In-flight work/mounts close; committed entry survives |
| Rendering termination | Handles invalid before abort callbacks; presenter popup/highlight removed; no final status event |
| Cancelled late preparation | No entry; creation lease until late resource recovery and successful cleanup |
| Cleanup failure/retry | Residual retained, provider uninstall rejected, lease released last on successful retry |

Also verify unrelated deletion leaves current selection/presentation untouched; rapid replace/hide/remove/reinstall suppresses late effects; initial render failure, detach/attachment failure and explicit retry preserve accepted 4F outcomes. Visibility toggles must not become an implicit recovery mechanism. Rendering-root tests use accepted internal composition ownership, not a new public application destroy method.

## 11. Implementation File and Composition Plan

Planned additions (future work only):

- `src/plugins/renderers/photo.js`, `src/photo/renderer.js`;
- `src/plugins/input/jpeg.js`;
- `src/plugins/ui/photo.js`, `src/photo/ui.js`, `src/photo/styles.css`;
- `src/plugins/ui/map-selection-presenter.js`, presenter stylesheet;
- typed panel service contract and fixed typed domain contribution infrastructure;
- `tests/phase-4g-photo-renderer.test.js`, input/preview/presentation/UI/production/architecture suites;
- `tests/smoke/phase-4g.spec.js` and `samples/phase-4g/` production-composition fixture.

Planned modifications: generic domain creation facade/EntryStore/error definitions and presentation signal only as §4; Photo private preview capability/provider resource identity; typed context/composition/catalog/allowlist/public contracts; panel/layers/settings/file-import plugins; parser normalization without URL ownership; viewer composition; related contracts/tests and English/Japanese documentation. Production/test changes are expressly deferred beyond this review.

Enable the four new Photo/selection roles and the four minimum migrated UI/transport roles alongside the existing six accepted production plugins (expected viewer set: 14). Photo renderer/JPEG/UI require Photo domain; generic presenter does not. Layers/settings consume typed panel service as needed; input transport depends on registry metadata, not the JPEG implementation. Optional factories stay lazy and composition opts in explicitly.

Delete obsolete Photo portions of shared map/popup/thumbnail/UI files, parser URL creation, old Photo marker/interaction paths and the Hub Photo branch only after equivalent target behavior is verified. Do not delete shared GPX files or all of Interaction Hub in 4G. Preserve deferred pure inference/time code, legacy non-Photo input code awaiting 4I, external plugins and vendors awaiting 4J. No production file deletion occurs in this review.

## 12. Required Tests and Smoke Expectations

Preserve accepted Phase 4A–4F suites. Add meaningful contract tests for both §4 amendments and actual production Photo plugins; generic presentation/creation tests must not depend on Photo-specific branches. Use controlled preparation/cleanup gates, not timing guesses. Unit rendering adapters may use local constructor/publication fakes, but production smokes must run the real Photo renderer/provider/input/UI composition.

Required coverage:

- Native signal validation (including compatible cross-realm signals, null and duck-typed substitutes)/pre-abort before ID reservation; cancellation at final commit boundary and in post-commit callbacks; forwarded lifetimes; non-cooperative late success/rejection/resources; listener registration races and settlement removal; ID gaps.
- Cancelled creation with object URL revocation throwing: no publication, `SEMANTIC_CLEANUP_FAILED` retains cancellation as original cause, creation residual/lease persists, provider uninstall rejects; failed retry still retains lease; successful cleanup retry releases it last and permits uninstall without ever publishing the entry.
- Handle abort ordering (`isCurrent()` already false), consumer closure, registration races and listener removal, same-token revision/hide/show permanent invalidation, deletion/withdrawal/root termination. Assert presenter-owned popup **and** highlight removal during rendering termination without a final status event.
- Preview consumer closure/release, logical deletion immediate access rejection, physical cleanup ordering, Blob-only resource replacement, image continuations, revocation failure/retry and provider lease continuity.
- Actual marker generation/resource ownership, exact semantic selection ref, immutable geography, visibility, revision replacement, definitive-failure stale retirement, removal/reinstall, empty no-GPS generation, primary/presenter independence.
- Typed adapter/host duplicates and removal, per-Photo modes/expected revisions, stale panel/popup closure, popup-dismissal/highlight independence as one case and popup-adapter removal as another, popup/image failures, style/mount cleanup.
- EXIF parser normalization/error behavior and true lazy loading; provider/renderer/UI/JPEG registration alone must not import parser. Keep pure inference tests classified for 4H and remaining GPX tests intact; replace obsolete Photo-authority assertions with target behavior assertions rather than deleting coverage.

Three planned new browser scenarios:

1. GPS lifecycle: real `IMG_2889.JPG` through file transport/application input, marker selection/popup/highlight, hide/show, real per-entry mode command, renderer remove/reinstall, deletion and URL cleanup, then rendering-root termination with selected presentation. No test-only Photo renderer or new public destruction API.
2. Timestamp-only `IMG_2892.JPG`: no inferred marker/map popup, tree selection, all three settings modes, UI/host/presenter removal and reinstallation, retained app-owned entry.
3. Optionality: non-Photo composition has no EXIF request; installing provider/renderer/UI/JPEG registration still does not load parser; first actual JPEG handling does.

The existing `tests/smoke/viewer-photo-import.spec.js` must retain filename **`IMG_2889.JPG`** and **`exif-gps`** assertions in `.tilia-status-text`, plus filename/location metadata in the layers row and no inline GPS time selector. Cover status expectations explicitly, not just marker presence. Do not restore inference/global-default/custom-offset settings merely to satisfy later-phase scenarios.

Projected full-product smoke counts are **expectations, not achieved results**:

| Scenario set | Expected result, conditional on verified identities |
| --- | --- |
| Existing 35 | 9 pass / 26 fail: only the existing GPS Photo import scenario is expected to move from fail to pass |
| Three new 4G scenarios | 3 pass |
| Combined 38 | 12 pass / 26 fail |

During implementation record each scenario identity and actual outcome; explain any difference. Historical settings/inference/GPX/broader UI failures stay assigned to their phases. Never use skipped scenarios, weaker assertions, fake compatibility state or changed totals to claim restoration.

## 13. Future Implementation Sequence and Completion Gate

This sequence is a plan, not authorization to begin implementation in this review:

1. Implement/test exactly the approved generic amendments and their cleanup/ordering edges.
2. Add typed guarded preview access with deletion/resource/lifetime verification.
3. Add lazy JPEG input and provider normalization.
4. Add Photo generation renderer and owned marker interactions/presentation descriptors.
5. Add minimum typed UI/panel hosts, Photo adapters and independent selection presenter.
6. Integrate file transport/viewer composition; atomically remove obsolete Photo authority.
7. Run focused suites, complete required unit/smoke/diff/import/legacy audits and compare scenario identities.

Completion requires singular semantic and selection authority; current-generation-only interaction; permanent presentation/preview invalidation; ordered cleanup/residual retry; committed-entry independence from input/render/UI; parser optionality; minimum accepted UI/JPEG behavior; accurate full-suite reporting. Keep generic stores/coordinator free of domain parsing/UI branches. Search the production graph for legacy mutable entries/layers, Hub Photo use, parser imports and preview URLs crossing semantic boundaries.

## 14. Deferrals, Reconciliation and Remaining Blockers

4H must provide guarded GPX semantic timeline/query capabilities and change/availability signals before Photo-from-GPX inference returns; results commit through Photo domain commands and ordinary semantic revisions/render replacement. No generic EntryStore scan, renderer geometry or legacy source array is an inference API. Time-offset/inference policy integration remains there.

4I retains broader layers/settings/input/elevation product UI, global Photo defaults and custom offsets. 4J retains external plugin migration/vendor work. 4K retains public application destruction and final allowlist/scaffolding removal. The minimum 4G Photo-specific settings/tree/popup/JPEG work is not deferred by those boundaries.

Rechecked against ARCHITECTURE §§9/10/12–14/18–19/22/28–35/40–44, MIGRATION-PLAN §13 and later-phase boundaries, accepted Phase 4A–4F plans, and current EntryStore/presentation/generation/coordinator/provider code. No remaining normative conflict was found. Architecture permits a range of replacement fallback behavior; accepted 4F narrows it to retirement on definitive newer-revision failure, which this plan preserves. AbortSignals remain cooperative notifications; explicit currentness/commit guards preserve authority, and the approved cancellation contract adds a publication predicate without replacing lifetime guards.

Both former amendment decisions are resolved by user approval. No further architecture/product decision blocker was identified. The original plan required registration-race, late-resource, failed-cleanup/retry and scenario-identified smoke verification. Actual results, including the difference from projected smoke counts, are now recorded in the implementation report. The original documentation step changed no production code/tests. Subsequent authorized Phase 4G work and verification are recorded in the implementation report; Phase 4H has not started.
