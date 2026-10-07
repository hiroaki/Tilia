# Phase 4H — GPX Vertical Slice Implementation Plan

Status: implementation planning only; no production/test implementation, commit or implementation authorization. Baseline: accepted Phase 4G, HEAD `82584e853bb4a867798be2e7145a2a1aeba3c577`. All interfaces below are proposed 4H domain interfaces unless explicitly identified as existing contracts.

## 1. Objective and design constraints

Establish the production GPX vertical slice through typed input, canonical semantics/queries, renderer-owned interaction, SelectionStore and minimum tree/popup presentation. Restore best-effort Photo location estimation from a captured global GPX timeline. The saved estimate belongs to the Photo: GPX change/deletion or service withdrawal does not invalidate it, prevent its publication or initiate Photo work.

Use one canonical GPX representation and accepted ownership, store, selection, rendering and typed extension foundations. No external-dependency preflight, logical-removal event, contributor vector, automatic GPX-triggered Photo recomputation, worker, retry timer or new generic contract amendment is introduced. Later-phase product functionality remains deferred as scoped below.

## 2. Authority and exact scope

The latest explicit user instructions take precedence. Within that scope, use Architecture → Migration Plan → accepted 4A–4G contracts/amendments → accepted HEAD as the implementation baseline. Sections, rather than historical status labels, identify the contracts used below.

| Requirement | In 4H | Exact normative basis / boundary |
|---|---:|---|
| Lazy GPX provider/input; immutable document/query | Yes | Migration §14, “Target architecture responsibilities” and “Implementation scope” (`MIGRATION-PLAN.md:904–920`) |
| Tracks, segments, track points, routes, route points, waypoints and selected metadata | Yes | Same §14: normalized multi-track/segment/route/waypoint semantics; creation/snapshot tests |
| Distance, elevation/time semantics, nearest point, extent/bounds | Yes | §14 responsibilities and preserved behavior tests (`:909–913`, `:953–967`); elevation **UI** excluded |
| Category/per-track visibility, style preferences and revisions | Yes | §14 responsibilities and contract tests (`:910`, `:953–965`) |
| Renderer generations, hit testing, semantic selection/reconciliation | Yes | §14 responsibilities; Architecture §§29–35; accepted 4E/4F |
| Minimal tree/popup adapters and existing whole-entry visibility/delete controls | Yes | §14 minimum domain proof (`:915`, `:932`); accepted 4G plan §9 |
| Typed GPX timeline and Photo inference | Yes | §14 responsibilities/implementation/test requirements (`:916`, `:920`, `:964`, `:971`) |
| Serialization/export-compatible snapshot | Yes | §14 preserved parse/source/interpretation/serialize suites (`:967`); no export UI |
| Legacy GPX overlay and Interaction Hub authority deletion | Yes | §14 “Legacy code removed” (`:936–947`), completion criteria (`:976–981`) |
| General layers/settings/elevation UX; global defaults/custom time offsets; Delete all; drop/URL/query transport completion | No: 4I | §14 allowed temporary feature loss/non-goals; §15 responsibilities/implementation. Existing Photo minimum presenter is reused, not replaced by full UI. |
| Export UI, route search, editor, milestone; structural editing/remap policy | No: 4J | §16 migration order and plugin scopes, especially `x-track-editor`; §14 explicit non-goals |
| Public `app.destroy()` and final migration closure | No: 4K | §14 explicit non-goals; §17 final destruction closure |

Architecture §§41–42 (`ARCHITECTURE.md:745–779`) govern semantic/selection commit and deletion. §42 already requires logical lookup/operation withdrawal before physical cleanup and permits residual cleanup failure without semantic resurrection. It defines clear as deterministic reverse-insertion removal with batched notifications, not an atomic rollbackable transaction.

Required foundation reuse: 4A Scope children/defer/guard/track and retryable residual cleanup; 4B guarded plugin runtime/catalog/lazy loading; 4C typed input/service/contribution/style/map boundaries; 4D EntryStore/domain snapshots and revisions; 4E sole SelectionStore authority and staged reconciliation; 4F sealed generation resources/bindings/presentation and replacement failure policy; 4G approved presentation-handle signal and create-commit cancellation. Do not recreate these foundations.

Migration §14 requires typed GPX timeline/query integration; it does not require continuous Photo invalidation. Existing typed change/service-availability mechanisms remain available to other consumers, while Photo acquires evidence only for eligible explicit operations. The accepted 4G future-boundary note and this interpretation are recorded in Appendix A; accepted historical documents remain unchanged.

## 3. Verified current state and reachability

- `src/plugins/domains/gpx-provider.js` is an active headless immutable provider with canonical track/segment arrays, routes, waypoints, preferences and replace/category/per-track/style commands. Its derived snapshot is empty. Route/waypoint normalization retains less optional information than the selected target subset. Track points retain nullable elevation/time.
- `src/plugins/domains/gpx-selection.js` already supports document, track, segment, track-point, route, route-point and waypoint index references. Structural refs contain semantic revision; document refs do not. `replace-data` invalidates structural refs; other current revisioned commands refresh their revision. Preserve this boundary.
- `src/gpx/parse.js`, `source.js`, `interpretation.js`, `serialize.js` are reusable pure modules, but the current source normalizer can discard empty structures/optional fields. Adapt the target canonical path; do not equate existing file presence with completed rich semantics.
- `src/map/layers.js` and `src/core/interaction-hub.js` are legacy GPX rendering/interaction implementations. Their active target authority is absent. Delete them after replacing their meaningful GPX behavior/tests; no bridge or foreign-layer publication.
- Production has Photo renderer/input/UI and a generic presenter, but no production GPX renderer/input/UI plugin. The allowlist leaves incompatible legacy consumers disabled. Existing headless selection is not proof of production GPX map selection.
- Photo inference helper is disconnected pure behavior; accepted Photo provider currently has null inference fields and an unchanged `recompute-derived` command. It does not consume GPX rendering.
- Legacy elevation/transports and external plugins stay disabled. Repair imports invalidated by deleting a module only as needed to keep catalog/module loading coherent; do not migrate their functionality early. `PartiallyEditablePolyline` remains unchanged.

## 4. Canonical document, parsing and serialization proposal

Store deeply immutable plain data, with no DOM, Date, Leaflet resources, renderer IDs or generic extension/property bag:

```text
data
  name                         input filename / display name
  metadata: {name, description, timestamp}
  tracks[]: {name, description, segments[]: {points[]}}
  routes[]: {name, description, points[]}
  waypoints[]
point-like: {lat, lon, name, description, symbol, elevation, timestamp}
```

Use typed optional text fields consistently, nullable elevation and finite epoch-millisecond timestamp (including zero). Distinguish document metadata name from input filename. Lat/lon must be finite and in range. Missing/invalid optional numeric/XML metadata becomes unknown, never zero; direct semantic commands reject invalid supplied values. Omitted patch means unchanged; explicit null clears an optional value; coordinate null is invalid.

Retain all canonical tracks, segments, routes, points, waypoints, order, empty structures and singleton geometry. Do not flatten the primary document. Query projections may flatten with canonical locators. Selected standard-field subset: document name/description/time; track/route name/description; point-like name/description/symbol/elevation/time. Unsupported author/copyright/link/bounds declarations, track number/type, fix/sat/DOP/DGPS fields and vendor extensions are safely ignored, not round-tripped or stored in a bag. Future support requires explicit typed fields and tests.

Preserve the existing tolerance/security policy in `parse.js`: direct children and accepted namespace/root/version behavior, existing missing namespace/version/creator tolerance, pre-parser DOCTYPE rejection, parser-error detection, strict meaningful coordinates, optional metadata tolerance, existing timezone/calendar validation. Preserve escaping and generate safe GPX 1.1 serialization for the supported typed subset, including empty structures and optional fields without fabricating values. GPX 1.1 output need not reproduce ignored input formatting/unsupported fields. Retain the existing file-import route limits (20 routes and 100 points per route); do not impose them on unrelated programmatic commands. Avoid gratuitous public field renames; use one typed mapping between XML fields and the selected canonical subset.

Provide `getDocument(entryId)` as immutable canonical/export-facing snapshot. Keep offline pure source/serializer helpers usable by dormant later-phase consumers, but target input/provider/query must not depend on lossy legacy normalization. Typed adapters, not mutable source scanning, connect those contracts.

### Pure serializer contract

The serializer accepts the canonical document (§7), not an EntryStore envelope, and returns an XML string without mutating input or consulting entries/renderers. Emit only the supported standard fields. Define semantic round-trip equality over the **canonical normalized supported subset**: metadata/geometry values, hierarchy, empty tracks/segments/routes, singletons and collection order are retained after `parse(serialize(document))` and the same domain normalization. Exclude filename, unsupported fields and input formatting. File-import route limits apply to import, so the unrestricted pure document round-trip must not silently run the capped file-import path.

Normalization boundary: XML extraction preserves existing supported-text interpretation, including `getDirectChildText(...).trim()` (`parse.js:46–48`). The provider's canonical normalization consumes those values and applies the established typed text/absence mapping; pure serializer round-trip comparisons use that same normalization, including supported-text trim semantics. Share the domain normalization/mapping for parsed or programmatic supported-subset comparisons rather than introduce another state model. The serializer escapes normalized supported values; it neither reinterprets text nor promises to recover raw whitespace, CR spelling, entity spelling or XML formatting. Do not remove parser trim or add raw-text storage/character-reference preservation machinery to make equality byte-for-byte.

- Element order follows [GPX 1.1 schema documentation](https://www.topografix.com/gpx/1/1/): root metadata → waypoints → routes → tracks; metadata name → desc → time; track/route name → desc → segments/route points; point-like ele → time → name → desc → sym. Retain order within every collection; do not sort or flatten structures.
- Omit absent/null optional values. Emit actual numeric zero, including elevation 0 and timestamp 0. Optional text follows existing canonical normalized text/absence behavior, including its empty-string handling. Preserve XML escaping; do not add exact whitespace/CR preservation or alter existing supported-text interpretation.
- Reject invalid [XML 1.0 characters](https://www.w3.org/TR/xml/#charsets), including disallowed controls and unpaired surrogates, before returning XML; escaping cannot make these legal. Report a serializer-local error identifying the field/locator, not a partial document. Apply this to text and the creator argument. No general validation framework is added.
- Timestamps serialize to exact UTC ISO strings at the existing millisecond precision. Reject finite values that cannot be represented by `Date.toISOString()`; also reject fractional milliseconds or a UTC year outside the target parser's supported 0001–9999 range rather than silently truncate or emit a time the parser drops. These are serialization errors, not a new restriction on storing finite semantic timestamps. Accepted input's existing submillisecond normalization remains unchanged.
- Coordinates/elevation use [XML Schema decimal notation](https://www.w3.org/TR/xmlschema-2/#decimal) without exponent syntax or fixed-decimal rounding. Expand the number's shortest round-trippable decimal representation as needed; parsing that decimal must recover the stored finite number. Do not introduce `toFixed` precision loss. No recovery of precision already lost when input became a JS number is promised.
- Exclude `data.name` (filename), application preferences, entry IDs/revisions, selection/query locators, inferred Photo data and private resources from GPX content. Keep the existing explicit creator/default `Tilia` and namespace/version attributes; metadata name remains distinct from filename.

Current `serialize.js` uses lossy source normalization and direct `toISOString()`; it does not yet establish this complete contract. Implement the bounded changes within the pure serializer/parser, retaining existing tolerance and escaping behavior. Tilia already accepts longitude +180 (`parse.js:158–160`); preserve it without normalization. That interoperability tolerance differs from the schema's exclusive upper longitude bound, so this plan does not claim every tolerated document passes strict XSD validation.

## 5. Interpretation, derived queries and preferences proposal

Track mode only: each track is one logical rendered track; semantic segments remain distinct. Connect consecutive nonempty segments **within that track**, recording a straight-line inferred gap. Never connect separate tracks. No mode preference/switch in 4H.

Distance: reuse accepted pure geographic calculation. Document track distance sums **tracks only**, separately summing their recorded intra-segment edges and inferred inter-segment gaps within each track. Never add inter-track edges or route distances. Route-target queries calculate route distance separately; no additional aggregate-distance API. This matches `getSourceDistanceSummary` (`interpretation.js:101–109`), which reduces only tracks. Singletons/empty collections contribute zero. Elevation query retains samples with nullable elevation, canonical locators, distance offsets and edge classification. Track offsets may place separate tracks in a document summary but must not fabricate an inter-track edge or elevation interpolation. Full profile/hover/editor UI waits for 4I/4J.

Preferences retain `tracksVisible`, `routesVisible`, `waypointsVisible`, sparse `trackVisibility`, and `stylePresetId`. Whole-entry visibility is generic and nonrevisioned; category/per-track/style updates use ordinary semantic revision. Effective render visibility requires entry AND category AND per-track permission. These preferences do not remove points from timeline inference.

Retain accepted style IDs, default appearance and semantic command behavior. Resolve `default` to the established cyan default; unknown nonempty IDs remain stored and render with a documented default fallback, preserving provider acceptance rather than introducing new rejection. Renderer owns widths/opacity/route dash/waypoint icon/highlight appearance. When whole-document replacement reduces track count, prune obsolete per-track visibility indices and retain valid index preferences, matching legacy `resolveTrackPresentation` / `normalizeTrackVisibility` in `5f0ce4a^:src/core/boot.js`. This is an explicit correction to the current headless rejection behavior, not a track-identity inference feature. Test replacement with a shorter document.

Semantic extent includes canonical geometry regardless of visibility and supports explicit fit/reveal. Renderer bounds may describe actual visible geometry. Successful input fits once if still live/current and bounds exist; cancelled precommit input cannot fit; successful postcommit cancellation cannot remove output. Semantic revision/reinference must not unexpectedly refit the map.

## 6. Selection and structural-editing boundary

Use existing kinds and canonical indices plus semantic revision for structural refs. No stable-ID introduction. Renderer bindings submit semantic targets; provider canonicalization creates refs. SelectionStore remains the sole authority. Renderer removal/hide/failure does not invalidate an otherwise valid semantic target.

Add only an existing-point update command/facade method, conceptually `updatePoint(entryId, {target, patch}, {expectedRevision})`, for track points, route points and waypoints. It changes coordinate/elevation/time without inserting, deleting, moving or reordering array members. Resolve/validate the target against the expected revision, preserve structural identity, and reconcile existing structural refs to the new revision. Invalid target/patch has no commit; equal data is a validated no-op. No editing UI is introduced.

**No dedicated insert/delete/reorder/split/merge command or structural editing UI is introduced in 4H.** Existing whole-document `replaceData` may change structure, but invalidates all structural refs rather than inferring identity, even if an index happens to remain occupied. The document ref can refresh. Dedicated structural commands and fine-grained identity/remap policy remain in 4J. “Point deletion/replacement” validation in the roadmap can be proved using replacement invalidation; it does not authorize a new delete-point command.

Visibility/style and identity-preserving point updates refresh valid refs. Tree can select document/track/segment/route and point-like targets; line clicks select nearest point in that clicked logical geometry. Use squared coordinate-distance behavior of the existing nearest-point helper with canonical-first equal-distance ties; do not search hidden/foreign tracks or renderer resources outside the clicked geometry.

## 7. Minimal renderer-independent GPX query

### Responsibilities and minimum shapes

`GpxDocument` is exactly the canonical `snapshot.data` in §4, including the externally assigned filename; it is not a second model. The existing GPX facade `get(id)` remains the accepted committed entry/revision/snapshot read. Additional named domain queries delegate to domain/pure helpers; no algorithms are added to generic EntryStore/bootstrap. Guard facade/service access by the accepted requester/provider lifetime rules.

The facade owns **per-entry** document/geometry queries. The optional typed `gpxQueryServiceKey` (`tilia-gpx-query`) published by the GPX domain owns only **cross-entry** timeline acquisition: `captureTimeline(): TimelineSnapshot`. Reuse the accepted service registry. Do not duplicate capture/lookup/geometry methods on both surfaces or add an umbrella query API/registry. Private composition can call the same domain helpers on committed snapshots; no new generic provider-hook contract is required.

```ts
type TimelineLocator = {
  entryId: number;
  trackIndex: number;
  segmentIndex: number;
  pointIndex: number;
};
type TimelinePoint = {
  timestamp: number; // finite epoch milliseconds; zero retained
  lat: number;
  lon: number;
  locator: TimelineLocator;
};
type TimelineSnapshot = { points: readonly TimelinePoint[] };
type TimestampLookup = {
  exact: readonly TimelinePoint[];
  before: TimelinePoint | null;
  after: TimelinePoint | null;
};
```

These are deeply immutable **plain data**, with no methods, Date objects, leases or service handles. `captureTimeline()` synchronously projects committed GPX track points in insertion/canonical order and sorts using §8. Only finite timed track points participate; route/waypoint timestamps stay in the document. Empty capture is `{points:[]}`. Preserve duplicate, exact, final and singleton points.

Export one pure `lookupTimestamp(timeline, timestamp): TimestampLookup` from the GPX query/interpretation helper module, **outside** the snapshot and service. It returns exact matches in timeline order, last point with time ≤ t and first point with time > t. Empty lookup is `{exact:[], before:null, after:null}`; outside-range queries retain any available endpoint. Reject nonfinite t as invalid input. The same helper supplies the Photo adapter; reuse existing arithmetic/order functions rather than maintain two implementations.

Once acquired, the snapshot is historical evidence: GPX changes/deletion/service withdrawal do not invalidate it or its resulting Photo estimate. No contributor vector, inference `isCurrent()`, revision guard or retained provider reference. Optional service absence means no evidence for that operation, not auto-installation or a future wake subscription. Own-Photo guards still apply.

### Per-entry query entry points

Use existing semantic target shapes (§6): `{kind:"document"}`, track/segment/route targets with canonical indices, and point/waypoint targets for extent. A query target is resolved against the committed document of that call; it is not a stable identity. Live selection consumers use accepted revision-aware refs separately.

| Facade entry point | Result / empty behavior |
|---|---|
| `getDocument(id)` | `{entryId, revision, document}` where document is the same immutable canonical data used by `get(id)`, not separately persisted. Existing empty document retains its empty collections. |
| `getExtent(id, {target = document})` | `{entryId, revision, bounds}`; bounds is `{southWest:{lat,lon}, northEast:{lat,lon}}` or null for valid empty geometry. Includes hidden geometry; point extent is degenerate. |
| `getDistance(id, {target = document})` | Document/track/segment/route only: `{entryId, revision, recordedMeters, inferredGapMeters, totalMeters}`. Document sums **track distances only**: recorded edges and inferred gaps within each track, with no inter-track edges or route contribution. A route target calculates that route's ordered-point distance separately. Segment/route targets have zero inferredGapMeters; empty/singleton distance is zero. “Recorded” denotes edges within the stored ordered geometry. No new aggregate-distance API. |
| `getElevationProfile(id, {target = document})` | Same path targets: `{entryId, revision, profiles:[{target, samples}]}`. Document produces separate track/route profiles in canonical order; a specific target produces its own profile. Sample is `{locator, distanceMeters, elevation:number\|null, edgeKind:"start"\|"recorded"\|"inferred-gap"}`; locator is the corresponding point target. Distance starts at zero in each profile. Preserve every sample even with unknown elevation; empty paths have empty samples, empty document has no profiles. No inter-track link/interpolated elevation. |
| `getNearestPoint(id, {target, coordinate:{lat,lon}})` | Track/segment/route target required; `{entryId, revision, match}`. Match is `{target, point, distanceSquared}` with a canonical point target, immutable point-like data and squared degree distance; null for a valid empty path. Canonical-first tie break. Renderer calls this only for its clicked geometry, not a global hidden/foreign search. |

For every entry point, absent/removed/wrong-domain entry retains existing facade error semantics (`facades.js` → `getDomainView`); an invalid target/coordinate is an input error, not an empty result. Nullable/empty results above are for valid existing empty geometry only. Query results' local revision/locators support ordinary target resolution; no universal currency system, persistent cache, new index or second canonical state is introduced. Visibility/style does not filter semantic queries.

## 8. Timeline ordering: specification versus compatibility evidence

**Verified legacy rules:** `interpretation.js:183–211` traverses input source-array order, then track/segment/point order, filters finite coordinates/timestamps, and sorts by timestamp then global traversal index. Historical `git show 5f0ce4a^:src/core/state.js` shows `addEntry` appending both entry and source to arrays (`:31–39`); removal splices them, replacement retains the slot. Current EntryStore assigns `insertionSequence` at successful publication (`store.js:262`), lists ascending by that sequence (`:76–80`), and keeps it on updates. Entry ID allocation/request-start order is **not** committed insertion order.

**Proposed deterministic target rule:** timestamp → committed entry insertion order → canonical track/segment/point traversal. Empty/invalid-time members remain canonical but do not become timeline candidates. Replacing an entry retains its insertion position; delete/recreate gets a new position. Delayed creates order by actual commit, not filename, ID or request start. No assumption that older input request necessarily wins.

For the same ordered canonical points and committed source sequence, this matches the legacy helper. Async input invocation order versus completion order was not comprehensively proved by the historical append snippet or existing tests; add a delayed-create integration test rather than claim full historical asynchronous compatibility. Retaining formerly discarded empty structures intentionally changes structural locator indices, not the order of retained valid timeline points. Do not preserve incorrect indices by dropping structures.

`photo/infer-location.js:64–79` chooses the **last** ≤ point, hence last exact duplicate, and first strictly greater point, hence first duplicate at the next time. Require both endpoints and at least two timeline points. A final exact point or singleton remains no-match for Photo even though query represents it. Duplicate-only timestamps also fail without a greater endpoint. Interpolate linearly across segment/track/entry boundaries; geometry rendering boundaries must not constrain this timeline.

`local` = captured Date epoch; `utc` = Date.UTC of local calendar components (`:8–36`). `auto` tries local then utc and chooses smallest nearest-endpoint time distance, then smallest enclosing span, then local (`:110–132`). Preserve the host-timezone dependence of these rules; do not reinterpret captured timestamp as timezone-free or change old Date.UTC calendar behavior as a hidden migration fix. Public preferences remain auto/local/utc. Fixed-offset pure helper support is not exposed in 4H.

Evidence: existing `photo-infer-location.test.js` has four tests: cross-track interpolation, chronological cross-source search, outside-range rejection, and basic explicit/auto. The previous planning session reported rerunning those plus 16 interpretation tests: **20 tests in two files passed**. The previous session reported in-memory probes against unchanged actual helpers verifying duplicate order, exact-last/next-first, final/singleton rejection and auto-local outcome in `Asia/Tokyo`. These are narrow compatibility checks, not implementation proof for the new service, async insertion, all timezones or auto span ties.

Required differential fixtures: identical canonical timeline in old helper/new typed query and Photo adapter; duplicate ties within/between segments/tracks/entries; reversed IDs versus commit order; replacement/delete/recreate; timezone-controlled local/utc winners, nearest-distance ties, span ties, final local preference; null/zero timestamps. Any observed outcome change beyond documented retained-empty locator correction is a review issue, not silently approved.

Compatibility scope: compare inference outcomes at explicit Photo-operation time, not continuous behavior after GPX changes. A later GPX commit affects a later capture only. Do not add notification/race ordering guarantees to historical import behavior.

## 9. Photo inference as a captured estimate

### When inference runs

- Photo creation/import without own GPS: make one best-effort attempt from GPX available at preparation time.
- Explicit Photo time-mode change: use one capture/attempt when appropriate; retain accepted preference-only changes for an unlocated Photo when no usable inference evidence exists. A failed attempt on an already inferred Photo preserves its saved state, matching legacy failure behavior.
- Explicit existing `recomputeDerived` command: support a caller-requested retry using current GPX; no new retry UI is introduced in 4H.
- Material replacement of the Photo's own coordinate/captured-time data: apply ordinary Photo replacement semantics. Resource-only preview replacement, hide/style and renderer replacement do not request inference or erase the saved estimate.

GPX creation/update/style/visibility/deletion, renderer removal and query-service availability changes do **not** trigger Photo operations, reject an in-progress estimate, or clear a stored estimate. Importing GPX after a previously unlocated Photo does not silently relocate that Photo; the caller may explicitly retry.

### Minimal integration

The Photo domain plugin injects a narrow internal optional timeline-acquisition callback into its provider using existing context/service lookup. Resolve that service only when an eligible Photo operation runs. Keep Photo-only operation possible without GPX parser/renderer loading or a hard GPX dependency. The provider captures plain data once, calls the existing pure inference logic through an adapter, and prepares the resulting ordinary Photo snapshot. No background worker or second follow-up mutation is needed after creation.

Create prepares the estimate as part of the existing provider preparation and publishes through accepted `photo.create(..., {signal})`; explicit changes use existing per-Photo FIFO/expected-revision mutation. If GPX changes after capture, the calculated result may still commit. If the Photo itself is deleted, superseded or loses its own authority before commit, existing EntryStore guards prohibit improper publication. Do not add external dependency preflight, generic retry, dirty epochs or timer ownership.

### Stored result and failure

Own EXIF coordinates always take precedence. Keep original coordinate/captured time separate from `derived.inferredLocation`, resolved mode and minimal existing inference-source/reason fields. Do not mark an inferred coordinate as EXIF GPS or retain a live GPX entry/provider reference. Canonical locators in temporary query results are not a Photo dependency; do not copy a live link into the Photo snapshot.

The inferred result belongs to the Photo snapshot. It survives GPX mutation/deletion and service/renderer withdrawal. A changed Photo snapshot uses the accepted single semantic revision and ordinary render replacement; equal results are no-op. Preserve Blob/preview identity on location/time-only updates. Renderer, popup and JPEG result reporting read the committed Photo snapshot and display own coordinate first, then inferred coordinate.

### Operation-specific success and failure

Legacy `updatePhotoTimeMode` (`5f0ce4a^:src/core/boot.js:422–448`) calls `resolvePhotoSource` before replacing source or assigning requested/resolved modes. An inference failure therefore leaves previous modes/location together. The target `mountPhotoSettings` already catches mutation errors, reports them, and rereads the committed requested mode into its select (`src/photo/ui.js:64–71`); use that mechanism, not a new status channel or retry UI. Current headless provider resets derived values through `makeSnapshot`; it does not yet implement saved-estimate retention.

| Photo operation | Requested mode / resolved mode / inferred location / revision |
|---|---|
| Creation without own GPS and usable evidence | Commit the requested auto/local/utc preference and inferred result, including resolved winning mode and adjusted timestamp; ordinary initial revision. |
| Creation with no usable time/timeline/endpoints | Accept the 4G unlocated Photo: requested preference retained; inferred location/timestamp/source null; resolved mode follows accepted unlocated defaults (auto → null, explicit → that mode). No follow-up work or delayed rejection. |
| Unlocated Photo changes requested mode without a successful estimate | Accept auto/local/utc preference change regardless of service installation: missing service, empty timeline, missing/unsupported temporal evidence or no matching endpoints are expected no-match, not a reason to block the preference. With usable evidence, the operation may make one attempt; expected no-match still permits preference-only success. Set requestedTimeMode to the selected mode and use accepted 4G defaults: resolvedTimeMode is null for auto, or the selected explicit local/utc mode; inferred location/timestamp/source remain null. One ordinary revision if the public snapshot changes, otherwise no-op; preserve preview. |
| Photo with an existing inferred location: time-mode inference fails | Reject preparation through existing operation error/reporting, including expected no-match from missing service/empty timeline/endpoints. Preserve **the entire previous public snapshot**: requested/resolved modes, inferred timestamp/location/source and semantic revision together. No partial preference commit, domain-change notification, renderer replacement or preview replacement. Settings resets to the saved requested mode. |
| Explicit `recomputeDerived` retry without usable evidence | Report/reject no-match; preserve requested/resolved modes, saved location and revision together, including an unlocated result. Do not erase an estimate or silently return success. No automatic retry. |
| Successful time-mode inference / explicit retry | Commit the fresh captured result and, for a time-mode operation, the requested mode atomically through existing mutation. Resolved mode records the successful explicit/auto winner. One ordinary revision if public snapshot differs, otherwise validated no-op. Preserve current preview/Blob identity. |
| Own EXIF GPS | Own coordinate wins; never relabel it as GPX or query GPX unnecessarily. Preserve accepted independent mode-preference behavior for GPS Photos; no inferred estimate needed. |
| Material replacement changes normalized own coordinate or captured time (including null/clear) | Treat replacement as new evidence: retain existing requested preference, discard the **old** inferred fields, and use new own GPS or make one fresh best-effort inference attempt. If no match, commit valid replacement as unlocated with the same defaults as creation; never retain an estimate tied to superseded Photo data. Invalid data/cancellation/provider error rejects the whole replacement. Public data/result change uses one ordinary revision. |
| Metadata-only replacement with equal normalized coordinate/time | Preserve saved inferred fields and modes; do not capture GPX. Revision changes only for changed public metadata. |
| Resource-only preview/Blob replacement with equal public data | Preserve the exact current public snapshot, saved estimate/modes and semantic revision (`revisioned:false`); replace/dispose private preview resources through accepted ownership. Resource failure before commit leaves the previous resource/result intact. |
| GPX mutation/deletion/style/visibility or service/renderer availability alone | No Photo operation: requested/resolved modes, location and revision unchanged. An already captured estimate may still commit. |

Preserve accepted 4G preference-only behavior for unlocated Photos (`tests/smoke/phase-4g.spec.js:72–103`, especially `:87–90`; `photo-provider.js:43–54` defines the unlocated defaults). The distinction is whether the Photo already has a saved inferred location, **not** merely whether a GPX service is installed. Expected no-match permits an unlocated preference change but never silently erases or changes a saved estimate. Explicit recompute remains a requested inference operation: its no-match is reported/rejected, even for an unlocated Photo, with previous state intact.

Only expected absent/empty GPX evidence, missing/unsupported temporal evidence and unavailable matching endpoints are no-match. Cancellation, invalid commands, unexpected algorithm errors and provider/lifetime failures retain their existing error semantics and reject the operation with previous state intact; **do not** convert them into successful preference-only operations. No automatic retry is required. The user can retry an estimate they consider unsuitable.

Keep global timeline interpolation and the established auto/local/utc and two-point endpoint rules in §8. Custom offsets/global defaults remain in 4I. No confidence model, persistent provenance graph or new inferred-state lifecycle is introduced.

## 10. Renderer, presentation, input and minimum UI proposal

Add `tilia-gpx-renderer`, `tilia-gpx-input`, `tilia-gpx-ui`, each requiring the GPX domain. The domain/query can be installed without renderer/input/UI. Use the accepted lazy catalog; parser/Leaflet/UI implementations load only with the relevant role/operation. File input accepts `.gpx` and GPX media types without claiming all XML. Reuse 4G approved optional create signal and guarded input-result semantics. One app-owned entry persists after semantic commit even if its operation/input plugin is cancelled later.

Generation resources: track polylines (one per nonempty logical track; singleton CircleMarker), route dashed polylines plus numbered route-point markers, waypoint pins, generation-local interactions/presentation. Acquire ownership with the accepted resource ledger before attachment; no semantic entry layer field. Empty geometry is a successful empty generation. Ordinary semantic changes replace generations; no custom in-place semantic update is required merely because the roadmap permits safe optimization. Whole-entry visibility uses accepted visibility handling. Category/per-track hidden geometry has no binding authority.

Interactions choose a canonical nearest point from the clicked track/route and submit a semantic target. Route-point/waypoint markers submit their own target. No per-track-point marker/binding explosion, no Interaction Hub. Recheck generation/visibility/revision before dispatch. Failed newer-revision replacement withdraws stale fallback and presentation; semantics and valid selection persist. Test renderer uninstall/reinstall from current semantic truth and cleanup failure residuals.

**Geometry descriptor classification: additive use of an accepted open extension point, not a new public generic foundation contract.** 4F plan §33 (`:876`, `:900`) types descriptors as immutable plain data. `rendering/presentation.js:76–81` checks deep immutable plain data without a kind whitelist. The 4G presenter recognizes `kind:"point"` (`map-selection-presenter.js:70–75`); that is an implementation branch, not a normative closed enum. Architecture §33 expressly permits immutable highlight geometry; §34 prefers presenter-owned overlays. 4G plan §8 (`:101–111`) uses independent highlight geometry and §9 (`:126–128`) preserves popup/highlight independence; approved 4G amendments §2.4 (`:45–47`) preserve hooks and ownership.

Add a built-in immutable descriptor shape, conceptually `{kind:"geometry", lines: GeoPoint[][], points: GeoPoint[]}` with typed finite lat/lon and distinct lines for distinct tracks. Preserve existing point descriptor behavior and ignore unsupported kinds as before. Validate the whole recognized shape before mounting any resource. The generic presenter interprets this vocabulary without GPX branches or primary-layer access. Each highlight belongs to a presenter child scope; overlays are noninteractive. Recheck handle currency/signal around mounting. Abort/currentness loss closes popup/highlight; dismissal closes popup independently and preserves selection/highlight. Empty geometry has no overlay/anchor popup where not meaningful. Do not amend hook signatures, validators into a closed enum, expose raw layers or add controlled highlight hooks. Such changes would require a separately reviewed amendment and are outside this proposal.

Minimal tree provides hierarchical semantic rows, generic whole-entry visibility/delete, category/per-track visibility proof and semantic selection/reveal where required. It is not full layers/settings product UX. Popup adapter formats supported metadata, coordinates, unknown elevation/time, and summary for each selected kind using safe DOM text. Renderer supplies current anchor/bounds/descriptor, UI supplies content, generic presenter owns mounted presentation. Feature CSS uses owned stylesheet leases; no generic core GPX CSS authority. Single-entry deletion is required; no Delete all button in 4H.

## 11. Mutation and failure responsibilities

Use accepted per-entry FIFO, expected-revision and own requester/provider/entry lifetime guards, candidate-resource cleanup and atomic semantic/selection reconciliation. GPX point-value commands preserve structural identity; whole-document replacement invalidates structural refs. Photo operations apply the operation-specific success/failure rules in §9. A captured GPX timeline is historical evidence, not an external publication guard.

A precommit failure leaves the current semantic snapshot/revision/selection intact; postcommit rendering/cleanup failure does not roll back semantics. Retain accepted residual cleanup/provider-lease handling. An independently reproducible foundation defect is investigated separately rather than bundled into the GPX feature.

## 12. Deletion and sequential clear

Use existing private EntryStore collaborators for immediate lookup/selection/render/interaction/presentation authority withdrawal, followed by Scope-owned best-effort cleanup. Physical residue never restores authority. Single removal emits existing `removed` after cleanup settles with success or failure; stalled cleanup emits no final removed. Preserve residual/provider leases and cleanup retry without semantic resurrection.

Preserve sequential reverse-insertion `clear()`, its global mutation gate, per-entry final-notification suppression and final batched `cleared`. Single-entry deletion is proved in 4H; Delete all UI waits for 4I. Photo deletion/cancellation retains own-lifetime protection. GPX deletion leaves saved Photo estimates unchanged and initiates no Photo work; there is no new pre-cleanup Photo recalculation or tree-notification guarantee.

## 13. Composition, ownership and lifecycle

GPX provider owns immutable semantics under accepted entry/provider leases. GPX domain owns the optional query service. Renderer generations own geometry/bindings; presenter owns independent popup/highlight children; contributors/hosts use accepted 4G mount obligations. No new Photo task lifetime or physical resource transfer is introduced.

Provider leases prevent unregistering live-entry/residual providers. Renderer install/remove/reinstall remains independent of semantics and valid selection. Timeline acquisition and pure Photo calculation work without GPX renderer. Once acquired, a plain timeline remains usable if the GPX service is withdrawn; subsequent operations see current availability. Existing saved Photo estimates remain unchanged.

Input cancellation before commit leaves no entry/fit; after commit leaves the app-owned entry. Own-Photo mutation/deletion/lifetime guards prohibit late publication. Keep generation/exposure currency for interaction/presentation; those guards are still necessary and are distinct from the removed cross-domain estimate currency. Internal rendering-root tests do not introduce public `app.destroy()`.

## 14. Minimal future file inventory and implementation order

This task changes only the plan document. All implementation below is future work requiring separate authorization.

| Action | Files / purpose |
|---|---|
| Add GPX slice | Canonical document/pure query helpers where current modules need them; renderer/UI helpers and scoped CSS; GPX input/renderer/UI plugins; lightweight typed timeline service contract |
| Modify GPX domain | Provider, selection adapter, domain plugin/facade; parse/serialize/interpretation only as required for selected data preservation, queries and point updates |
| Modify Photo domain | Provider/domain composition for optional one-shot timeline acquisition and existing pure inference adapter; renderer/UI/JPEG reporting to read saved estimates |
| Generic presenter | Add minimal independent geometry-descriptor interpretation through accepted open hooks; no new registry or generic GPX branch |
| Composition | Builtins/allowlist/viewer roles and test scripts; no GPX algorithms in bootstrap |
| Delete obsolete authority | Interaction Hub and obsolete tests; legacy GPX overlay/builders after equivalent target behavior exists; import housekeeping only for dormant consumers |
| Retain | Accepted EntryStore/SelectionStore/Scope/service foundation APIs, offline pure helpers, disabled 4I/4J consumers, vendor PartiallyEditablePolyline, broad smoke behavior assertions |
| Tests | Domain fields/queries/point refs, renderer/input/UI/presenter ownership, one-shot Photo inference compatibility and persistence, dedicated real-production 4H smoke |

Order: canonical data/parser/serializer → pure queries/optional timeline boundary → point updates and reconciliation → GPX renderer and minimum presenter/UI → one-shot Photo provider integration → input/composition → remove obsolete GPX/Hub authority → meaningful tests/full-smoke and import/ownership audits. No A/B approval or implementation step, no generic store/selection redesign and no new cross-domain scheduler. Any genuinely independent foundation defect is reported with evidence rather than bundled into this feature.

## 15. Targeted validation without dependency-maintenance machinery

Future tests are not claimed implemented or passed in this task.

| Scenario | Required observation |
|---|---|
| Photo create with usable GPX, no GPX renderer | Saved inferred location through typed timeline and accepted create; ordinary marker/popup when Photo renderer exists |
| Capture GPX, change/delete it before Photo commit | Captured estimate may commit; no stale-GPX rejection or automatic retry |
| Delete/update GPX after estimate saved | Photo coordinate/derived result/revision unchanged; no Photo mutation or worker |
| Photo imported before GPX / service absent | Unlocated Photo accepted; later GPX/service availability does not automatically change it; explicit retry can infer |
| Explicit retry or time-mode change with GPX | Fresh one-time capture; normal changed/no-op Photo revision/rendering behavior |
| Unlocated mode change with missing service / empty timeline / no usable endpoints | Preference succeeds in every expected no-match case; requested mode selected, resolved auto→null or explicit→mode, inferred fields null; one revision for changed snapshot, same-mode/equal-result no-op; preview unchanged; no service-dependent gate |
| Unlocated mode change with usable evidence | At most one inference attempt; success commits preference/estimate together; expected no-match allows preference-only success using 4G defaults |
| Failed time-mode inference with existing estimate | Promise rejects/reports; requested/resolved modes, inferred timestamp/location/source, revision and preview remain previous; settings select restored; no domain/render event |
| Unlocated mode change encounters cancellation/invalid command/unexpected error/provider or lifetime failure | Reject/report through existing mechanisms, no preference-only success; previous snapshot/revision preserved |
| Explicit retry without usable evidence | Promise rejects/reports no-match; requested/resolved modes and saved estimate/revision retained; no silent clear or perpetual task/timer |
| Own EXIF GPS | Own coordinate wins; no unnecessary GPX query or inferred GPS relabeling |
| Own Photo cancelled/deleted or stale expected revision | Existing own-lifetime/revision guards apply; no recreation/late publication |
| Preview/resource-only replacement | Saved estimate and preview ownership remain coherent; no unnecessary inference |
| Material own coordinate/time replacement, including clearing fields | Old estimate discarded; new GPS wins or one new attempt; no-match accepts new unlocated data; one revision; invalid replacement rolls back |
| Metadata-only / resource-only replacement | Metadata-only preserves inferred fields; resource-only preserves exact public snapshot and revision while replacing owned preview |
| Serializer round-trip and errors | Canonical normalized supported values/order/hierarchy/empty structures preserved; existing supported-text trim/absence semantics retained, no raw-whitespace/CR equality requirement; zeros emitted/nulls omitted; invalid XML characters, unrepresentable/out-of-parser-range/fractional timestamps rejected; decimal exponent expanded without rounding; filename/unsupported fields/input formatting excluded |
| Document track distance versus route-target distance | Document equals sum of tracks' recorded edges and intra-track inferred gaps only; adding/changing a route does not change document track distance; no inter-track edge; route target computes separately; segment/route inferredGapMeters zero; empty/singleton distances zero |
| Query minimum surfaces and empty/error cases | Only service captures global timeline; lookup is a pure helper outside snapshots; per-entry facade returns defined revision/result shapes; exact/final/single/duplicate points represented; empty geometry distinguished from invalid/removed targets |
| Duplicate/timezone/commit-order fixtures | Existing ordering and mode outcomes; typed exact/final/singleton data preserved, legacy Photo two-point/no-match policy preserved |
| Point update versus replaceData | Existing-point value update reconciles structural refs; whole replacement invalidates structural refs |
| Multiple empty/singleton segments/tracks | Canonical structure retained; Track-mode gaps only within a track; distinct highlight lines across tracks |
| Hide/category/style/replacement/failure/uninstall | Accepted generation interaction/presentation guards; definitive newer-revision failure retires stale fallback; valid semantic selection remains independent |
| Single-entry removal, stalled/failed cleanup/retry | Immediate own authority withdrawal, settlement-based removed, no resurrection; saved Photos inferred from that GPX stay unchanged |
| Existing clear | Sequential reverse-insertion removal, mutation gate, batched settlement and own Photo cancellation; no new logical-event assertions |
| Popup/highlight/descriptor validation | Presenter-owned noninteractive geometry; unknown/malformed descriptor handled safely; popup dismissal independent; accepted signal invalidation and cleanup |
| GPX input cancellation around commit | Accepted 4G cancellation/entry ownership and one-time explicit fit |

Retain meaningful supported-field round-trip/XML security/tolerance/import limits/null-zero, geometry/visibility/style/bounds/selection/provider-lease/resource-cleanup coverage and existing foundation tests. Validate the proposed public behavior rather than mirror private implementation fields; no dependency-maintenance scenarios are required.

## 16. Validation evidence, production smoke and forecasts

**Reported by the previous planning session on accepted HEAD; not rerun in this task:** `npm test`: 59 files, 630 tests passed. Full configured Playwright smoke: 38 scenarios, 13 passed/25 failed, no skipped/flaky. Sandbox server bind initially failed with EPERM; an approved rerun completed. These are baseline measurements, not 4H completion. Temporary machine output was `/private/tmp/tilia-phase-4h-baseline.json`; the 4G report contains inherited failure identities/explanations. Historical report statements beyond the reproduced totals/observed scenarios remain report evidence, not new comprehensive proof.

**Reported by the previous plan revision; not rerun in this task:** targeted unchanged pure interpretation/inference suites: two files, 20 passed. Narrow unchanged-helper probes described in §8 passed. No new implementation/contracts exist, so no revised-design integration test is claimed passed. Do not rerun broad tests merely to relabel the same baseline as a new implementation result.

Future dedicated 4H smoke must use the real production catalog/roles/file input, not a test-only GPX renderer: import multi-track/route/waypoint fixtures; inspect minimum tree; click nearest track point/route marker/waypoint; popup+independent highlight; change whole/category/per-track visibility; semantic point revision; remove/reinstall renderer; induce definitive replacement failure; import timestamp-only Photo and prove inferred location without GPX renderer; delete/update one GPX and verify the saved Photo estimate and revision remain unchanged; explicitly retry a Photo using newly captured evidence; delete one selected entry and prove authority withdrawal. No Delete all, export/editor/elevation/custom/global-default/transport completion to make smoke green.

Keep all 38 broad legacy smoke scenarios and their meaningful assertions intact. **Withdraw the earlier 15 passed / 23 failed forecast; do not replace it mechanically with 14/24.** No aggregate future pass/fail total is asserted in this revised plan. Baseline measurements above remain historical actual results; the following is an assertion-level scope audit and unmeasured expectation, not a browser result. The broad Photo inference scenario is not expected to become fully passing in 4H merely because inference works.

| Previously failing broad scenario | Assertions/setup checked against authorized scope | Unverified 4H expectation |
|---|---|---|
| `viewer-file-import.spec.js:33`, route-point popup | Viewer file input; `.tilia-route-point-marker` visible/clickable; popup visible with filename `sample-route.gpx`, kind `Route point`, route name `Scenic route`, point name `Route start`; no page errors. All belong to 4H input/renderer/minimum popup; retain marker selector and text compatibility in the target implementation. No later-phase controls used. | Expected fully passing if these target behaviors are implemented; must be measured. |
| `viewer-elevation.spec.js:79`, map clicks on each logical track | Import multi-track fixture; exactly two interactive paths; first-track click produces visible `Track point` popup; reload/reimport, again exactly two paths, second click produces visible popup; no page errors. The test never opens Elevation or requires a chart. Noninteractive highlights do not add interactive paths. Semantic behavior belongs to 4H, but its `.leaflet-overlay-pane path.leaflet-interactive` selector is not automatically compatible with namespaced target geometry panes (`map/panes.js:33`, `:63–82`; installed Leaflet `createPane` attaches a named pane under mapPane, not overlayPane). | Within-scope behavior, **not yet a justified unchanged-test full-pass expectation**. DOM/selector compatibility requires verification; do not move target resources into legacy panes or weaken meaningful assertions to inflate a forecast. Dedicated 4H smoke must use the target pane path. |
| `viewer-photo-inference.spec.js:8` | Import/status/tree/inferred source overlap 4H, but `:35–46` require inline mode selector, selecting `custom`, sign/offset controls, ArrowUp/edit/blur behavior, `+00:00` status and retained value. These are deferred 4I product/custom-offset UI, not the accepted three-mode minimum settings. | Remains a later-phase-dependent full scenario. Dedicated 4H smoke proves inference without these controls. |
| `viewer-file-import.spec.js:8`, full GPX import/layers | Import/status/minimum tree overlap 4H; Delete all button, empty-state and “Cleared all layers and sources” assertions at `:25–28` require 4I. | Not counted as fully passing in 4H. |
| `viewer-elevation.spec.js:8`, `:40`, `:54` | Respectively chart/bottom-panel/status/layout; selecting Elevation after waypoint popup; two chart paths, relative spans, hover guides and chart-click selection. All explicitly require Elevation UI. | 4I-dependent despite restored GPX geometry/selection. |
| `viewer-dropzone.spec.js:3`, `viewer-url-import.spec.js:3` | Drag/drop active state and drop status; Load URL form/action and URL status/tree. Target file input alone does not satisfy these transports. | 4I-dependent. |
| `viewer-settings.spec.js:3` | Global default mode, custom sign/offset, Enter submission, settings/status/layout behavior. | 4I-dependent. |
| `embed.spec.js:3` | Three map/status assertions and GPX data attribute. Sample setup still calls `app.load`, reads `app.state.entries`, uses `app.core.setEntryVisibility`, and requests global `defaultPhotoTimeMode:"+09:00"` (`samples/embed/index.html:226–278`). These are not automatically restored by adding GPX input; embed adaptation/custom default policy is outside the current 4H composition inventory. | No full-pass expectation; sample/API migration remains deferred/reviewed with 4I, without restoring legacy app APIs. Do not describe its setup as merely missing a GPX renderer. |
| All 14 `editor.spec.js` scenarios (`:22`, `:27`, `:51`, `:71`, `:98`, `:136`, `:192`, `:229`, `:258`, `:297`, `:383`, `:421`, `:436`, `:453`) | Editor sample/control/session/inspector/selection/history/structural actions, including normal-track selection through editor source controls. All depend on the disabled editor, even when a particular assertion starts with a GPX path. | 4J-dependent; no editor restoration or vendor changes to improve these outcomes. |

This accounts for all 25 baseline failing scenario identities: one expected full-pass candidate (route-point popup), one additional within-scope behavior with unresolved unchanged-test pane/selector compatibility (map clicks), and 23 with deferred/setup dependencies. It makes no new total forecast and does not assume the 13 baseline passes cannot regress. A later prediction must explicitly account for unchanged passing scenarios, actual composition/setup compatibility, selector/text behavior and new regressions; only an implementation rerun establishes totals. Newly added dedicated 4H scenarios also change suite size and must be reported separately from the unchanged 38-scenario comparison.

Record scenario identity, exact failing assertion and phase responsibility, not only counts; explain new regressions separately. In particular, corrected Photo and embed classifications supersede inherited report labels for this plan, without editing the historical report. Do not weaken/delete assertions or add 4I controls to reach a count. Dedicated 4H smoke independently proves typed one-shot inference, saved-estimate persistence and explicit retry without custom-offset UI.

Run accepted foundation suites plus meaningful new contracts, pure behavior suites, new 4H production smoke and full smoke after implementation. No unexplained regressions against the baseline. A broad expected later-phase failure is not proof that its restored 4H sub-behavior works; the dedicated slice must prove it independently.

## 17. Audits and definition of done

Audit reachable imports, catalog enablement, semantic snapshots, refs, ownership and authority withdrawal. Search for `entry.layer`, `entry.interactions`, `state.layers`, `subscribeInteractions`, `interaction-hub`, `buildGpxOverlay`, mutable legacy GPX source scanning, broad `app.core`/`app.state`/`refreshView`, foreign committed layers and obsolete fit/visibility helpers. Delete target-path remnants; classify dormant 4I/4J occurrences explicitly without rewriting those consumers early. Normative §14 allows disabled complex plugins; literal search matches there are not proof of active authority or justification for a bridge. Ensure deleting shared legacy modules does not break a disabled module's import resolution unexpectedly.

4H completion requires canonical supported semantics/serialization, all geometry/input/render/selection/minimum presentation proof, correct preferences/bounds, renderer-independent typed queries, best-effort one-shot Photo inference and persistent results without GPX coupling, single-entry deletion through accepted lifecycles and cleanup residual correctness, old overlay/Hub authority deletion, production roles, meaningful tests and explained broad-smoke delta. No stable-ID structural editor, Delete all, full elevation/layers/settings/transports, complex plugins, vendor editor changes or public destruction API.

## 18. Remaining validation and decisions

No generic contract amendment is proposed by this Phase 4H plan. Implementation and validation below still require separate authorization; no discarded-proposal review gate is an implementation prerequisite.

- Preserve the selected product semantics: explicit Photo operations use GPX as evidence; capture change/removal does not reject or invalidate an estimate. GPX changes/availability alone never schedule Photo work.
- Implementation must match legacy duplicate/mode/order outcomes for equivalent captured points, while preserving the selected empty/canonical structures. Async capture timing/timezone and target pane/selector compatibility remain concrete integration checks, not new synchronization APIs.
- Establish one-shot provider integration, accepted unlocated preference-only mode behavior with 4G defaults, atomic failure retention for saved estimates, explicit material-versus-resource replacement behavior and preview/own-lifetime safety through accepted interfaces. Distinguish expected no-match from cancellation/unexpected/provider failures; the Photo-only mode policy is resolved, not a pending clarification. Do not introduce inference workers, generic stale-dependency guards or silent automatic fallback behavior.
- Preserve existing accepted mutation/selection/rendering/removal invariants. Independent defects discovered in normal supported execution are reported separately with a reproduction and minimal scope; this plan neither authorizes foundation redesign nor asserts those concerns disappeared.
- Full UI/transports/custom offsets/Delete all remain 4I; structural editing/export/complex consumers 4J; public destruction 4K; vendor PartiallyEditablePolyline unchanged. Performance optimization beyond measured need remains deferred.

Current revision: design/documentation only. Production/test sources and accepted historical plans/reports are unchanged; no commit or implementation authorization is inferred. Photo inference uses captured GPX evidence and stores its result independently, within the accepted typed boundaries and ownership contracts.

## Appendix A. Design audit and superseded proposals (historical record)

This appendix preserves review evidence from the saved working plan; it does not add requirements to the implementation steps above. A/B were never approved or implemented and are not proposed by this plan. The user clarified that GPX is supporting evidence rather than a continuously maintained Photo dependency.

| Design | Evidence / actual requirement | Decision |
|---|---|---|
| Continuous GPX-to-Photo relationship | Not present in pre-cutover `5f0ce4a^:src/core/boot.js`: `resolvePhotoSource` is called on Photo import and explicit Photo time-mode change; GPX create/update/remove do not reevaluate existing Photos. User explicitly confirms no continuous relationship. | Remove automatic reinference, inferred-location clearing and GPX dependency tracking. |
| A: external-dependency mutation preflight | Introduced to reject estimates when GPX changes after capture. The user permits those estimates to commit. | Remove from 4H; no new PreparedMutation hook/error/publication protocol. |
| B: removal-committed event | Introduced to wake dependent Photos before GPX cleanup settles. Photos retain their estimate after GPX removal. | Remove from 4H; preserve accepted removed/clear semantics and private authority-withdrawal hooks. |
| Dirty epochs, worker, timer/backoff, retry/convergence proofs | Only required by automatic dependency maintenance. | Remove; infer once per eligible Photo operation, with no automatic GPX-race retry. |
| Full contributor vector and service-instance currency | Required to keep an inference capture synchronized with live GPX, not to calculate from a captured timeline. | Remove from Photo inference; retain only ordinary guarded access when acquiring the snapshot. |
| Typed immutable GPX model/query and lightweight optional service | Migration §14 requires a renderer-independent semantic timeline boundary; global ordering and exact/final/single-point representation are established decisions. | Keep a plain immutable capture and pure lookup/calculation; no persistent dependency relationship. |
| Canonical hierarchy, selected fields, point update/ref reconciliation | Migration §14 and user-selected semantics. | Keep; do not simplify by dropping segments, empty structures or data. |
| GPX renderer/input/minimum tree/popup and independent geometry highlight | Migration §14; accepted 4F open descriptor/4G presenter contracts. | Keep minimum implementations within accepted hooks; no highlight registry or new foundation amendment. |
| Full-generation semantic replacement | Accepted rendering supports replacement; safer and simpler than extra incremental update machinery. | Keep replacement; no style-only optimization/index/scheduler in 4H. |
| Structural editing, full settings/elevation, Delete all, destruction | Explicit later-phase boundaries. | Keep deferred; no stable IDs/remap engine/new editing UI. |

This audit covers proposed 4H additions. It is not a claim that every previously accepted foundation is minimal or that all existing implementation defects are resolved. Independent foundation findings require separate evidence and scope; they are not prerequisites for Photo inference solely because earlier A/B reviews discussed them.


### Historical proposal A

Do not add `PreparedMutation.preflight`, `ENTRY_DEPENDENCY_STALE`, new generic transaction/publication staging or Photo-driven changes to EntryStore/SelectionStore. GPX currency is not a Photo publication predicate under the user's requirement. A was unapproved and has no demonstrated independent 4H consumer requiring it.

Continue using accepted expected-revision, own-authority, candidate-resource cleanup and atomic semantic/selection contracts. Earlier investigation noted potential reentry/diagnostic weaknesses in existing foundation code. Those are separate findings, not proof that this best-effort Photo feature needs A or arbitrary-object/monkeypatched-signal defensive machinery. Record a reproducible independent defect separately if normal supported operations violate an accepted invariant; do not silently redesign the foundation or declare it solved by deleting A.

### Historical proposal B

Do not add `removal-committed` or a public logical-removal notification to wake Photos. A deleted GPX does not withdraw an already captured estimate. B was unapproved and no independent 4H requirement has been demonstrated for the extra event. Existing tree/render/selection behavior must be proved using accepted lifecycle/contribution mechanisms.

Reuse existing private EntryStore collaborators for immediate lookup/selection/render/interaction/presentation authority withdrawal, followed by Scope-owned best-effort cleanup. Physical residue never restores semantic or interaction authority. `removed` retains its existing meaning: emit after the cleanup attempt settles with success or failure; while pending, it remains pending. Keep residual/provider leases and cleanup retry without resurrection.

Preserve sequential reverse-insertion `clear()`, its global mutation gate, per-entry final-notification suppression and final batched `cleared`. Do not introduce atomic batch retirement, new clear recovery policy or Delete all UI. Photo deletion/cancellation keeps existing own-lifetime protection; deleting a different GPX does not start Photo work. If physical cleanup stalls, there is no new guarantee of pre-cleanup tree notification or Photo recalculation.

The elaborate B exceptional logical-event recovery policy and its tests are removed along with B. Any independently demonstrated failure of existing accepted authority withdrawal/cleanup remains a separate foundation issue, not an excuse to restore the extra event or redesign all observers in 4H.

### Interpretation of the accepted 4G future-boundary note

The accepted 4G plan §14 mentions GPX change/availability signals as a future boundary, but does not establish continuous Photo reinference. Existing typed change/service-availability mechanisms may be used by other live consumers; Photo inference does not subscribe to them. The user's clarification supersedes any earlier 4H interpretation requiring such subscriptions. Do not rewrite accepted historical documents to manufacture a legacy dependency requirement.

### Validation removed with discarded proposals

Retain meaningful supported-field round-trip/XML security/tolerance/import limits/null-zero, geometry/visibility/style/bounds/selection/provider-lease/resource-cleanup coverage. Remove planned new scenarios that exist solely to prove dependency preflight, contributor-vector currentness, reinference convergence/timers, logical-event ordering or pre-cleanup Photo progress. Do not delete meaningful existing foundation tests. Do not add tests that merely mirror private implementation fields.
