[日本語](API.ja.md)

# Tilia API reference

This reference describes the public application API exported from `src/index.js`. Start with the [README](../README.md) for browser dependencies and a complete embedding example. Use the [Tilia plugin guide](PLUGINS.md) to choose features and the [Developing Tilia plugins](PLUGIN-OPERATIONS.md) to implement plugins.

Tilia is early-alpha software; these APIs may change. Entries and domain data are immutable snapshots. Map layers present that data, and successful data operations do not imply that asynchronous rendering has finished.

## Construction and ownership

### Create an application

`createDefaultTiliaApp(container, options = {})` returns an application immediately. `container` is an existing DOM element or its ID. Give it a size and configure Leaflet CSS and the import map as shown in the [README](../README.md#basic-usage).

```js
import { createDefaultTiliaApp } from "../src/index.js";

const app = createDefaultTiliaApp("map", {
  plugins: ["tilia-gpx-input", "tilia-gpx-renderer"],
  baseMapOptions: { center: [35.68, 139.76], zoom: 12 },
});
await app.ready;
```

The import path assumes a host page one directory below the repository root; adjust it to your deployment. Each app creates and owns a distinct Leaflet Map. Supplying `options.map`, even as `undefined`, throws a `TypeError`; external Map injection is unsupported.

| Option | Meaning |
| --- | --- |
| `plugins` | Plugins to install at startup; defaults to an empty list |
| `pluginOptions` | Options by plugin ID for string entries in `plugins` |
| `builtins` | Application lazy catalog; defaults to official `tilia-*` entries. Replaces the entire catalog and may contain third-party IDs |
| `baseMapOptions` | Initial Map and base-layer configuration, described below |
| `baseLayerOverrides` | Per-ID overrides, merged with `baseMapOptions.baseLayerOverrides`; top-level values take precedence |

Each `plugins` item may be an ID, `[definitionOrId, options]`, or `{ plugin: definitionOrId, options }`. Tuple/object options are explicit. Hard dependencies install automatically with empty options unless already installed. Configure a dependency before its consumer when it needs options; see [Choosing plugins](PLUGINS.md#choosing-plugins).

Optional implementations load when requested.

### Base-map options

| `baseMapOptions` field | Default / meaning |
| --- | --- |
| `mapOptions` | `{}`; Leaflet Map constructor options |
| `center` | `[35.681236, 139.767125]`; initial latitude/longitude |
| `zoom` | `10` |
| `baseLayers` | Base-layer definitions; default is OpenStreetMap with ID `osm` |
| `selectedBaseLayerId` | Initial selection among constructor definitions |
| `tileUrl`, `tileOptions` | Customize the default layer when using default definitions |
| `baseLayerOverrides` | Per-ID definition overrides; nested tile `options` merge |

A definition requires `id` and `url`. Optional fields are `label`, `provider`, `category`, `options` (Leaflet tile options, including attribution), `attributionLabel`, `isDefault`, and `visibleInSelector`. Definitions added later by provider plugins do not automatically become the initial selection. See the [plugin guide](PLUGINS.md) for provider and selector configuration.

The separately exported `createBaseMap(container, options = {})` accepts these base-map options and returns `{ map, tileLayer, baseLayer, baseLayers, baseLayerManager }`. It creates an independent Map whose cleanup belongs to its caller. Its result cannot be injected into a Tilia app.

## Application methods

| API | Return / behavior |
| --- | --- |
| `ready`, `whenReady()` | Same Promise, resolving to `app` after configured plugin installation |
| `use(definitionOrId, options = {})` | Promise resolving to an opaque frozen handle `{ id }` |
| `unuse(idOrHandle)` | Promise completing removal; accepts an ID or a handle from `use` |
| `hasPlugin(id)` | Boolean indicating an active plugin |
| `listPlugins()` | Frozen array of active IDs in activation order |
| `load(input)` | Promise resolving to the chosen input handler's result |
| `destroy()` | Shared Promise completing terminal application cleanup |
| `map`, `getMap()` | Borrowed app-owned Leaflet Map |
| `getBaseLayer()` | Current borrowed Leaflet tile layer, or `null` when none is selected |
| `getBaseMap()` | A fresh wrapper `{ map, tileLayer }` referencing the existing app-owned Map and current tile layer (or `null`); creates no Map or layer |
| `entries`, `domains`, `selection`, `rendering` | Guarded capabilities described below |

Await readiness before ordinary work. Startup failure initiates cleanup automatically. Readiness covers configured plugin setup; it does not wait for background imports started by a plugin or for rendering to complete.

### Install and remove plugins

```js
await app.use("tilia-file-import");
console.log(app.listPlugins());
await app.unuse("tilia-file-import");
```

Installation resolves hard dependencies first. Calling `use` for an active plugin returns its handle without reconfiguring it. Removal can be rejected while a dependent plugin or an entry's provider lease needs the plugin. Remove consumers and their entries first. An absent valid ID is a removal no-op. Failed removal may retain cleanup obligations; only obligations marked safe by their owner can be retried. See [Developing plugins](PLUGIN-OPERATIONS.md) for lifecycle rules.

### Load a file

`load` waits for readiness and dispatches to a matching registered handler. It does not fetch a URL string or accept a public second argument for cancellation.

```js
const response = await fetch("../samples/embed/biwakososui.gpx");
if (!response.ok) throw new Error(`GPX request failed: ${response.status}`);
const file = new File([await response.text()], "biwakososui.gpx", {
  type: "application/gpx+xml",
});
const { entry } = await app.load(file);
console.log(entry.id);
```

The GPX handler returns `{ entry, name }`; the JPEG handler returns `{ entry, name, locationSource }`. `entry` is a snapshot, not a Leaflet layer. Missing or conflicting handlers reject dispatch. File/URL import controls accept user input; if no predefined startup file is needed, omit the fetch and use those controls as shown in the README.

### Destroy an application

`destroy()` makes the app terminal immediately, then aborts owned work, removes entries, closes plugins/resources, and removes the Map last. Await it before reusing the container:

```js
await app.destroy();
```

The container survives. Do not independently remove the borrowed Map or use an old Map or cached capability after destruction. Map-attached resources end with the Map; unrelated host timers/page listeners remain the host's responsibility. Leaflet's shared document infrastructure is independent of a single Map.

Repeated `destroy()` calls from the host share the same completion Promise, including rejection; they do not automatically retry failed cleanup. Successful cleanup permits a new app with a distinct Map on the same container; cleanup failure does not guarantee immediate container reuse. Cleanup may wait for required resource handoffs, so completion is not a guarantee that every noncooperative task has settled.

`ready`/`whenReady()`, `destroy()`, `hasPlugin()`, and `listPlugins()` remain accessible after shutdown starts; discovery returns `false`/an empty array. Other operations and cached capabilities are fenced. If a host `destroy()` call runs while readiness is pending, it rejects readiness immediately with `APP_DESTROYED`, even if startup later fails. If the bootstrap failure handler has already rejected readiness with the startup error, its automatic cleanup and later host destruction preserve that error. The ordering is the settlement of the readiness Promise, not when an underlying task first throws. Already settled readiness stays settled. Readiness and cleanup are separate Promises; neither waits for the other.

## Semantic and display APIs

### Entries and domain views

An entry snapshot is `{ id, domain, visible }`. IDs are application-local; `domain` is a typed key such as `gpxDomainKey`, not the string `"gpx"`. Domain `get(id)` returns `{ entry, revision, snapshot }`; missing or wrong-domain entries throw. Snapshots do not change after later mutations; obtain a fresh view when needed.

`app.domains` exposes `gpx` and `photo`. Creation requires the corresponding provider plugin, `tilia-gpx-domain` or `tilia-photo-domain`, installed directly or through a dependency. Input handlers parse files; renderers display data. Neither is required to create canonical data programmatically.

| `app.entries` method | Return / behavior |
| --- | --- |
| `list()` | Frozen entry array in insertion order |
| `get(id)` | Entry snapshot or `null` |
| `setVisible(id, visible)` | Promise resolving to the entry snapshot; boolean visibility |
| `remove(id)` | Promise resolving to the removed snapshot, or `null` if absent |
| `clear()` | Promise resolving to a frozen array of entries targeted for removal |
| `subscribe(listener, { emitCurrent = true } = {})` | Handle `{ unsubscribe() }` |

Whole-entry visibility does not change the domain revision or clear selection. `clear` removes entries in reverse insertion order, attempts remaining entries after cleanup failures, and delivers one final batch event. Removal can commit even if cleanup later rejects; see [Errors](#errors-and-extension-boundary).

Entry subscriptions initially receive `entries.list()` when `emitCurrent` is true. Subsequent notifications are events:

| `type` | Other fields |
| --- | --- |
| `created` | `current` (entry snapshot) |
| `domain-changed` | `entry`, `previousRevision`, `revision`, `change` |
| `visibility-changed` | `previous`, `current` (entry snapshots) |
| `removed` | `previous` (entry snapshot) |
| `cleared` | `removed` (entry array) |

For change-only callbacks, read the initial list separately:

```js
const initialEntries = app.entries.list();
const subscription = app.entries.subscribe((event) => {
  console.log(event.type);
}, { emitCurrent: false });
// When the host no longer needs updates:
subscription.unsubscribe();
```

### Revision-checked commands

Both domains expose `create(value, { visible = true, signal } = {})`, returning a Promise resolving to the new **entry snapshot**. `signal`, if supplied, is an AbortSignal. Cancellation before publication prevents creation; cancellation after commit does not undo an entry.

Mutation signatures are `(id, value, { expectedRevision })`; they return Promises resolving to **domain views**. `expectedRevision` is required and must equal the current integer revision. Changed semantic data/preferences advance the revision; no-ops do not. A Photo preview-only resource change can leave the semantic revision unchanged.

Read a current revision before each command and handle stale-revision errors when other consumers can edit. Do not mutate snapshots. Even commands with no value take options as their third argument:

```js
const view = app.domains.gpx.get(entry.id);
await app.domains.gpx.recomputeDerived(entry.id, undefined, {
  expectedRevision: view.revision,
});
```

### GPX data and commands

`app.domains.gpx.create(document)` accepts canonical data or `{ data: document, preferences }`. This normalized GPX subset is not a lossless container for arbitrary XML extensions.

- Document: `{ name, metadata, tracks, routes, waypoints }`.
- Track: `{ name, description, segments: [{ points }] }`.
- Route: `{ name, description, points }`; waypoints are individual points.
- Point: `{ lat, lon, elevation, timestamp, name, description, symbol }`.

Coordinates use `lon` (Leaflet often uses `lng`). Latitude/longitude are finite numbers in geographic ranges. Elevation is finite or `null`; timestamps are finite Unix milliseconds or `null`. Omitted elevation/timestamp become `null`. Metadata supports `name`, `description`, and `timestamp`. Tracks/routes/waypoints default to empty arrays; supplied tracks require `segments` arrays and supplied segments/routes require `points` arrays.

Preferences default to `tracksVisible`, `routesVisible`, and `waypointsVisible` all true, `trackVisibility: {}`, `routeVisibility: {}`, and `stylePresetId: "default"`. Per-track and per-route visibility use zero-based indexes as object keys; a missing index is visible. Snapshots are `{ data, preferences, derived }`; GPX `derived` is currently empty.

```js
const entry = await app.domains.gpx.create({
  name: "Example track",
  tracks: [{
    segments: [{ points: [
      { lat: 35.68, lon: 139.76, elevation: 10 },
      { lat: 35.69, lon: 139.77, elevation: 20 },
    ] }],
  }],
});
const view = app.domains.gpx.get(entry.id);
const updated = await app.domains.gpx.updatePoint(entry.id, {
  target: { kind: "track-point", trackIndex: 0, segmentIndex: 0, pointIndex: 1 },
  patch: { elevation: 25 },
}, { expectedRevision: view.revision });
console.log(updated.revision);
```

| GPX mutation | Value argument |
| --- | --- |
| `replaceData` | New document; keeps preferences and drops out-of-range track/route visibility indexes |
| `updatePoint` | `{ target, patch }`; patch supports `lat`, `lon`, `elevation`, `timestamp` |
| `setCategoryVisibility` | `{ category: "tracks" \| "routes" \| "waypoints", visible }` |
| `setTrackVisibility` | `{ trackIndex, visible }` |
| `setRouteVisibility` | `{ routeIndex, visible }` |
| `setStylePreset` | Nonempty preset ID; visual interpretation belongs to the renderer |
| `recomputeDerived` | `undefined`; currently a GPX no-op |

Point patches use `null` to clear elevation/timestamp; supplied patch values cannot be `undefined`. Track/route visibility indexes must be in-range integers and `visible` must be boolean. Storing `true` at an absent per-track/per-route index changes the stored preferences and advances the revision, even though that target was already effectively visible. Whole-entry visibility and category/track/route preferences are separate controls.

Route visibility is `entry.visible && preferences.routesVisible && preferences.routeVisibility[routeIndex] !== false` and applies to its line and every numbered point marker. Read individual preferences through `app.domains.gpx.get(id).snapshot.preferences.routeVisibility`; category/entry toggles leave them intact. `replaceData` retains preferences by index, discards removed indexes, and defaults new indexes to visible. `setRouteVisibility` follows the common revision-checked mutation contract above, as does `setTrackVisibility`. Public visibility mutations retain semantic selection; Layers checkbox hides conditionally clear only selections made invisible by that operation.

### GPX targets and queries

Targets use zero-based indexes:

| `kind` | Required index fields |
| --- | --- |
| `document` | None |
| `track` | `trackIndex` |
| `segment` | `trackIndex`, `segmentIndex` |
| `route` | `routeIndex` |
| `track-point` | `trackIndex`, `segmentIndex`, `pointIndex` |
| `route-point` | `routeIndex`, `pointIndex` |
| `waypoint` | `waypointIndex` |

Queries are synchronous and return immutable envelopes containing `entryId` and `revision`, plus the fields below. Query targets may include `revision` to reject stale indexes. Nonexistent targets reject; existing empty paths can return empty results.

| Method | Result fields / accepted targets |
| --- | --- |
| `getDocument(id)` | `document` |
| `getExtent(id, { target } = {})` | `bounds: { southWest: { lat, lon }, northEast: { lat, lon } }` or `null`; all kinds |
| `getDistance(id, { target } = {})` | `recordedMeters`, `inferredGapMeters`, `totalMeters`; document, track, segment, route |
| `getElevationProfile(id, { target } = {})` | `profiles: [{ target, samples }]`; document, track, segment, route |
| `getNearestPoint(id, { target, coordinate })` | `match: { target, point, distanceSquared }` or `null`; explicit track, segment, or route required |

Extent/distance/elevation default to the document. Elevation samples contain `{ locator, distanceMeters, elevation, edgeKind }`; `edgeKind` is `start`, `recorded`, or `inferred-gap`. Missing elevation stays `null`. Document elevation profiles exclude standalone waypoints. Track segment gaps contribute inferred distance separately from recorded distance.

Nearest queries compare existing points by squared latitude/longitude differences. `distanceSquared` is in degrees squared, not meters; results are not interpolated points on segments. Pass a finite `{ lat, lon }` and an explicit path target:

```js
const distance = app.domains.gpx.getDistance(entry.id);
const nearest = app.domains.gpx.getNearestPoint(entry.id, {
  target: { kind: "track", trackIndex: 0 },
  coordinate: { lat: 35.685, lon: 139.765 },
});
console.log(distance.totalMeters, nearest.match?.target);
```

### Photo data, commands, and previews

`app.domains.photo.create(value)` accepts data directly or `{ data, preferences, blob }`. Optional `blob` supplies the owned preview resource.

| Data field | Meaning / default |
| --- | --- |
| `name` | `"photo"` |
| `coordinate` | `{ lat, lon }` or `null`; geographic ranges |
| `capturedAt` | Finite Unix milliseconds or `null` |
| `make`, `model` | Camera strings, default `""` |
| `source` | `{ mediaType, size }`; defaults to `"application/octet-stream"` and `0` bytes |

Normalized data adds `hasGps`. Preferences contain `requestedTimeMode`, defaulting to `auto`: `auto`, `local`, `utc`, or a fixed offset such as `+09:00`, `-05:00`, or `+05:30`. Compact offsets (`+0900`) and `Z` normalize to `+09:00` and `+00:00`; hours must be 00–23 and minutes 00–59. Snapshots are `{ data, preferences, derived }`; derived fields are `resolvedTimeMode`, `inferredTimestamp`, `inferredLocation`, and `locationSource`.

Fixed offsets interpret the EXIF wall-clock calendar fields in the specified offset; they do not rewrite `capturedAt`. JPEG input stores the parsed EXIF Date as Unix milliseconds, and inference reads its local calendar fields in that same browser environment. Programmatically supplied `capturedAt` must represent the intended wall-clock fields when read as a local Date; `local` retains its existing instant-based interpretation.

| Photo mutation | Value argument |
| --- | --- |
| `replaceData` | Data object directly, optionally with its own `blob` property; keeps preferences (details below) |
| `setRequestedTimeMode` | A preset or fixed offset, as above |
| `recomputeDerived` | `undefined`; explicitly recomputes location/time inference |

`replaceData(id, data, { expectedRevision })` normalizes the data object itself; the creation wrapper `{ data, preferences, blob }` is not a replacement format. It replaces the full data rather than applying a patch: omitted data fields take their defaults. To preserve other fields, pass `{ ...view.snapshot.data, name: "renamed.jpg" }`. Preferences remain unchanged. Omit the own `blob` property to retain the current preview resource; supply a `Blob` to replace it, or `null`/explicit `undefined` to clear it. Passing the same Blob retains the resource. A preview-only replacement/clear leaves the semantic revision unchanged and emits no `domain-changed` event; replacing/clearing a resource invalidates its old preview handles and disposes its URL. Blob resources are not part of public snapshots.

Commands require `{ expectedRevision }` as their third argument. Recorded GPS coordinates take precedence. Without GPS, inference uses available timestamped GPX data. Later GPX changes do not automatically recompute committed Photos. Explicit recomputation can reject when no suitable match exists.

`getPreview(id)` returns `null` without a preview resource, otherwise a handle:

| Member | Meaning |
| --- | --- |
| `signal` | Aborts when preview/consumer becomes invalid or the handle is released |
| `isCurrent()` | Whether the handle can still be used |
| `readUrl()` | Current object URL; throws when stale |
| `release()` | Ends this consumer's use; does not revoke the provider-owned URL |

There is no public `handle.url`. Clear displayed image sources when the signal aborts and release handles when their view closes. Do not revoke the URL yourself. Plugins can pass `{ scope }` to bind preview use to an owned descendant Scope; host calls default to the application consumer lifetime.

### Semantic selection

| `app.selection` method | Return / behavior |
| --- | --- |
| `getCurrent()` | Frozen `{ entryId, domain, ref }` or `null` |
| `request(candidate)` | Promise resolving to the selected snapshot |
| `clear({ ifCurrent } = {})` | Promise resolving to `undefined`; with a selection snapshot, clears only a matching entry/domain/reference |
| `subscribe(listener)` | Change-only handle `{ unsubscribe() }` |
| `subscribeRequests(listener)` | Handle `{ unsubscribe() }`; receives the selected snapshot for successful requests, including repeated requests for the same selection |

Create candidates through the matching domain facade:

```js
const candidate = app.domains.gpx.selection.createCandidate(entry.id, {
  kind: "track", trackIndex: 0,
});
await app.selection.request(candidate);
const current = app.selection.getCurrent();
const selectedTrack = app.domains.gpx.selection.resolve(current.entryId, current.ref);
```

GPX candidate targets use the kinds/indexes above without a caller-supplied revision. Photo uses `app.domains.photo.selection.createCandidate(id)` with its default target. Candidates are opaque, issued to one consumer in one application; do not fabricate, serialize, or pass them between app/plugin contexts. Domain `selection.resolve(id, ref)` returns immutable domain data or `null` for an unresolving reference; malformed references or missing/wrong-domain entries can throw.

Selection events contain `{ previous, current, reason }`. Reasons are `requested`, `cleared`, `refreshed`, `remapped`, `domain-invalidated`, `entry-removed`, or `resolution-failed`. `subscribeRequests` has no initial notification and does not report clearing or domain reconciliation; request notifications follow any state-change notification, and shutdown/consumer invalidation can prevent their delivery. Read `getCurrent()` separately for initial state. Domain updates reconcile or invalidate references; removal clears the entry's selection. Hiding an entry, removing its renderer, or closing a popup does not clear semantic selection. The bundled third-party x-track-editor plugin maintains its draft selection independently of semantic selection.

### Rendering status

| `app.rendering` method | Return / behavior |
| --- | --- |
| `getStatus(id)` | Immutable status, or `null` without a rendering controller |
| `list()` | Frozen status array |
| `subscribe(listener, { emitCurrent = true } = {})` | Handle; initial status array, then individual status notifications |
| `retry(id)` | Requests a fresh build of current semantics and synchronously returns status; does not await display |

Status contains `entryId`, `domain`, `state`, `visible`, and `semanticRevision`. States are `unavailable`, `building`, `active`, or `failed`. Generation fields are `currentToken`/`currentRevision`, `pendingToken`/`pendingRevision`, `fallbackToken`/`fallbackRevision`, and `fallbackDisplayed`. Treat tokens as opaque. `lastFailure` is an error summary or `null`; `cleanupResidualCount` counts outstanding cleanup records.

`retry(id)` accepts controllers in all four states, including `active` and `building`; it supersedes a pending attempt. With a renderer installed, it schedules a fresh asynchronous build at the current semantic revision. Without a renderer it remains `unavailable` and starts no build. It throws a plain `Error("Entry not found")` when no controller exists; accessing `app.rendering` after destruction throws `APP_DESTROYED`, while a cached rendering facade can throw `RENDERING_TERMINATED`. Later build failures are reported through status, not a returned Promise. Retry does not change semantic data/revision or guarantee display success, and is not an explicit retry of residual cleanup.

Unavailable rendering can mean no renderer is installed. Failure does not roll back committed data. During replacement, a fallback may remain visible; status distinguishes its revision from the semantic revision. See [Architecture](ARCHITECTURE.md) for the generation model.

### Capabilities for owned plugin views

Plugin-owned physical input APIs (`context.interactions` and map subscriptions), including their lifecycle and arbitration guarantees, are documented in [Public interaction contracts](INTERACTIONS.md). They are separate from semantic selection and are not an `app.interactions` API.

PluginContext exposes the same entry/domain/selection/rendering facades with consumer-specific lifetimes. Some methods require a Scope that host code does not normally create:

- `entries.bindPresentationLifetime(id, { scope })` requires an owned child Scope strictly below the consumer. Removal closes that child; its returned `{ dispose() }` binding can close it earlier.
- `rendering.suppress({ entryId, domain: gpxDomainKey, target: { kind: "track", trackIndex }, expectedRevision, scope })` returns `{ dispose() }` for temporary GPX track suppression. Scope must belong to the consumer. Suppression leaves persistent visibility, revision, and selection unchanged; overlapping leases keep a target suppressed until all owners release it.
- `rendering.getSuppressionSnapshot()` returns a frozen array of `{ entryId, domain, ref }`. `subscribeSuppression(listener, { scope, emitCurrent = true } = {})` returns `{ unsubscribe() }` and delivers snapshot arrays. Scope defaults to the consumer; supplied scopes must belong to it.

Binding/suppression `dispose()` returns a Promise. These APIs do not expose renderer layers or arbitrary domain suppression. The [developer guide](PLUGIN-OPERATIONS.md) explains owned Scopes, services, registration, and asynchronous work.

Suppression follows the domain target, not a renderer generation. Removing and reinstalling a renderer preserves valid suppression leases. GPX nonstructural changes remap their revision-scoped references; `replaceData` invalidates old track suppression even if the replacement has identical structure. Entry deletion also invalidates it. Releasing an obsolete lease cannot suppress or reveal a replacement target; releasing the final valid lease follows the current visibility preferences, not the preferences captured at acquisition.

## Errors and extension boundary

Catch both synchronous exceptions and Promise rejections, and check `code` for defined conditions. Even methods normally returning Promises can throw synchronously during capability checks or argument destructuring. Validation/native browser errors can also occur; not every failure is an exported error class.

| Contract | Fields / interpretation |
| --- | --- |
| Application errors | `applicationErrorCodes.destroyed`: `APP_DESTROYED`; `cleanupFailed`: `APP_CLEANUP_FAILED` |
| `SemanticError` | `code`, `committed`, `details`, optional `cause`; committed changes survive later cleanup failures |
| `ExtensionError` | `code`, `committed`, `details`, optional `cause`; callback failure after commit does not undo publication |
| `RenderingError` | `code`, optional `cause`; no general `committed` field |
| Input dispatch failures | `InputDispatchError` has `code`/`details` describing settlement, cancellation, and cleanup; a failed load does not necessarily mean no entry exists |
| Plugin failures | `PluginError` has `code`, `details`, optional `cause`; see developer guide for dependency/lifecycle conditions |

Application cleanup failure is an aggregate with original causes in `errors` and frozen contextual summaries in `details.failures`. The app remains terminal. Cached/in-flight failures are not all rewritten as application errors. Unsupported input and handler conflicts can retain `ExtensionError` codes.

`PluginError` and `InputDispatchError` are not root exports; inspect their fields instead of importing nonexistent exports. The public barrel exports `SemanticError`, `ExtensionError`, `RenderingError`, their `semanticErrorCodes`, `extensionErrorCodes`, `renderingErrorCodes`, and `applicationErrorCodes`.

Synchronous app lifecycle calls from plugin setup/cleanup reject with `PLUGIN_LIFECYCLE_REENTRANT`. Do not await the app's own lifecycle from those callbacks; asynchronous self-await cannot generally be detected.

### Other public exports

| Export | Purpose |
| --- | --- |
| `builtins` | Official `tilia-*` lazy catalog; application catalog rules are in the developer guide |
| `gpxDomainKey`, `photoDomainKey` | Shared typed identities; compare by identity |
| `defineDomainKey({ id })` | Define an identity; does not create an application domain facade |
| `defineServiceKey({ id, validate = null, createFacade })` | Define a service contract; `createFacade` is required |
| `statusServiceKey`, `panelServiceKey`, `gpxQueryServiceKey` | Shared service contracts for plugins |
| `cloneAndFreezePlainData(value, path = "snapshot")` | Clone/freeze `null`, `undefined`, strings, booleans, finite numbers, arrays, and plain objects; rejects objects such as Date, Blob, and Map |

Typed IDs use lowercase alphanumeric words separated by hyphens. Independently created keys with the same ID are distinct; share contract keys between providers and consumers. Plain-data snapshots cannot contain cyclic references.

Plugin-only service, input, base-map, contribution, and presentation registrations are documented in [Developing plugins](PLUGIN-OPERATIONS.md), with options in [Plugin guide](PLUGINS.md). They are not host methods such as `app.services` or `app.inputs`. Internal stores, registries, Scope controllers, and foundations are not exports of the public application API. Deep imports are not a JavaScript security boundary.

Third-party IDs use fixed `plugins/<id>/loader.js` discovery. `src/` and `plugins/` must be siblings; the plugin directory is not configurable and does not depend on the page or base URL. Use direct definitions or explicit catalogs for nonstandard locations. See [Developing plugins](PLUGIN-OPERATIONS.md).
