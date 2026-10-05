# Phase 1 — Current Plugin Architecture Inventory

## 1. Executive Summary

At commit `ee9c477b161d909a6011fa756a8c369e1d9f6209`, Tilia has one small plugin runtime in `src/app.js`, ten built-in plugins in `src/builtins.js`, and six repository-local external/example plugins under `plugins/`. The runtime has useful foundations—plain plugin descriptors, stable IDs, one `use()` path, setup/teardown return conventions, services, stylesheet declarations, and concurrent-install deduplication—but lifecycle ownership is mostly conventional rather than enforced.

The most important factual findings are:

- `requires` is installation-time validation only. It does not resolve, order, retain, or protect dependencies. A required plugin can be uninstalled while dependents remain installed.
- Installation is not transactional. Stylesheets and any mutations performed before a throwing `setup()` remain. The runtime has no setup-scope rollback.
- `unuse()` invokes only the cleanup function returned by `setup()` or the returned API's `destroy()`, then removes the plugin-ID service and plugin record. All other cleanup is manual.
- There is no application-level `destroy()` and no automatic reverse-order plugin teardown, core teardown, surface teardown, selection-hub listener removal, entry cleanup, or base-map cleanup.
- `src/builtins.js` statically imports every built-in implementation. Importing `src/app.js` therefore brings all built-ins into the module graph even when none is enabled.
- Core is strongly domain-aware. `createTiliaCore()` statically imports GPX parsing/presentation and photo EXIF/inference code, registers GPX/JPEG handlers itself, and exposes GPX- and photo-specific entry, visibility, selection, and interaction methods.
- `app.services` is a mutable null-prototype object. Plugin return APIs are automatically published under plugin IDs, while `tilia-base-maps` and `tilia-ui-surfaces` are runtime services not backed by plugin records.
- The input registry, refresh handlers, selection subscribers, interaction subscribers, base-map catalog, UI surface manager, and panel system are distinct extension-like mechanisms with inconsistent ownership, duplicate, removal, and failure semantics.
- `x-track-editor` is a strong validation case: it can implement substantial functionality, but only by using `app.core`, reading entry/source shapes, manipulating GPX track visibility, importing Tilia internal helpers, consuming panel service internals, subscribing to Leaflet layers, and relying on CSS/DOM conventions.
- Cleanup quality varies. Most controls and complex plugins clean up their own controls/listeners/layers. Known gaps include permanent plugin stylesheets; base-map contributions without unregister; input handlers without unregister; `x-milestone` Leaflet layer callbacks left attached; panel child UI not explicitly notified when its provider is uninstalled; and resources surviving failed setup.

The current architecture is therefore partially aligned with `DESIGN.md`: it has a simple common plugin shape and useful registries, but optional module loading, generic core boundaries, dependency lifecycle, transactional setup, and runtime-owned disposal are not aligned.

## 2. Baseline and Scope

### Repository baseline

- HEAD: `ee9c477b161d909a6011fa756a8c369e1d9f6209`
- Initial worktree: clean (`git status --short` produced no entries).
- Runtime dependencies: Leaflet `2.0.0-alpha.1`; tests use Vitest `3.2.4` and Playwright `1.54.1` (`package.json`).
- Unit tests: **37 files, 336 tests, all passed** via `npm test`.
- Smoke tests: **28 tests, all passed** via `npm run test:smoke`.

### Relevant structure

```text
src/app.js                    plugin runtime and public app facade
src/builtins.js               eager built-in registry and adapters
src/core/boot.js              state, built-in input handlers, entry operations
src/core/*-hub.js             selection and interaction mechanisms
src/core/input-*.js           input registry/processing/URL policy
src/map/{base,layers}.js      base-map registry and domain overlays
src/plugins/input/            built-in input transport plugins
src/plugins/ui/               built-in UI plugins
src/ui/                       shared UI surfaces, protocol, global CSS
plugins/*/loader.js           repository-local external/example plugins
docs/API*.md                  current public behavior
docs/PLUGIN-OPERATIONS*.md    current plugin operational contract
plugin-architecture/DESIGN.md Phase 0 target principles
```

`docs/API.md` and `docs/PLUGIN-OPERATIONS.md` generally match the implementation. Notable documentation gaps/discrepancies are called out below: the docs do not fully expose non-transactional failure, lack of app destruction, lack of dependency protection on uninstall, or permanent stylesheet/base-map contributions.

This report describes the current implementation. `plugin-architecture/DESIGN.md` is treated only as the target direction and is compared in section 20.

## 3. Current Plugin Catalog

### Summary matrix

| ID | Location | Kind | `requires` | Returned service/API | Stylesheet | Main integration and cleanup assessment |
|---|---|---|---|---|---|---|
| `tilia-panel` | `src/builtins.js` → `src/plugins/ui/panel.js` | built-in | — | panel API | global core CSS | Mounts managed panel surface; destroy unmounts DOM and panel state. Child plugins are not lifecycle-owned by it. |
| `tilia-status` | `src/plugins/ui/status-control.js` | built-in | — | `setStatus`, `destroy` | global core CSS | Leaflet control; complete control removal. Used optionally through `app.setStatus()`. |
| `tilia-base-maps-control` | `src/plugins/ui/base-map-control.js` | built-in | — | render/control API | global core CSS | Consumes `app.baseMaps`; wrapper removes refresh handler and control. |
| `tilia-layers` | `src/plugins/ui/layers-control.js` | built-in | `tilia-panel` | render/control API | global core CSS | Direct `app.core`/entry access; GPX and photo UI; removes refresh handler/control, closes its panel. |
| `tilia-elevation` | `src/plugins/ui/elevation-panel.js` | built-in | `tilia-panel` | refresh/control API | global core CSS | GPX/selection/popup integration; removes selection subscription, map listeners, timers, marker, control. |
| `tilia-file-import` | `src/plugins/input/file-import.js` | built-in | — | control API | global core CSS | File transport into registry; hard-coded GPX/JPEG accept list. Control removal removes contained DOM/listener. |
| `tilia-url-import` | `src/plugins/input/url-import.js` | built-in | — | control API | global core CSS | HTTP(S) GPX-only acquisition policy; removes surface and control. In-flight fetch is not aborted by uninstall. |
| `tilia-query-import` | `src/plugins/input/query-import.js` | built-in | — | usually `undefined` | global core CSS | One-shot startup import from query string; no persistent API/cleanup. Setup itself awaits network/import. |
| `tilia-settings` | `src/plugins/ui/settings-panel.js` | built-in | `tilia-panel` | control API | global core CSS | Entirely photo-specific despite generic name; removes control and closes its panel. |
| `tilia-dropzone` | `src/plugins/input/dropzone.js` | built-in | — | `{destroy,target}` | global core CSS | File transport; removes three DOM listeners and active class. |
| `x-gpx-export` | `plugins/x-gpx-export/loader.js` | external/example | `tilia-panel` | destroy-only API | own CSS | Imports internal controls and GPX serializer, reads core entries; removes refresh handler/control. Download URL is revoked asynchronously. |
| `x-gsi-base-maps` | `plugins/x-gsi-base-maps/loader.js` | external/example | — | definition IDs | none | Registers two base maps through public facade. No unregister exists, so uninstall leaves contributions. |
| `x-milestone` | `plugins/x-milestone/loader.js` | external/example | — | refresh/count/destroy | inline marker CSS | Interaction subscription + direct Leaflet events; destroys markers/subscriptions/map listener, but per-track `add`/`remove` anonymous handlers remain attached to layer objects. |
| `x-opentopomap-base-maps` | `plugins/x-opentopomap-base-maps/loader.js` | external/example | — | definition ID | none | Registers one base map. No unregister; uninstall leaves it. |
| `x-route-search` | `plugins/x-route-search/loader.js` | external/example | — | destroy-only API | own CSS | Managed surfaces, Leaflet map/layers, fetch, `core.addGpxSource`; destroy removes UI/layers/map listeners, but does not abort an in-flight request or remove imported entries. |
| `x-track-editor` | `plugins/x-track-editor/loader.js` | external/example | `tilia-panel` | editing commands + destroy | own and vendor CSS | Deep GPX/core/Leaflet integration; thorough session/control/listener cleanup, but saved entries intentionally outlive plugin and stylesheet remains. |

### Options

- Built-in controls generally accept `position`, `priority`, and, where forwarded by `resolveBuiltinUiOptions()`, `edgePolicy` (`src/ui/protocol.js`).
- `tilia-dropzone`: `target`.
- `tilia-url-import`: `position`, `priority`, `timeoutMs`, `maxBytes`.
- `tilia-query-import`: `parameterName` (default `gpx`), `timeoutMs`, `maxBytes`.
- `x-gpx-export`: `position`, `priority`, `creator`.
- `x-milestone`: shallow override of `intervalDefinition`, `formatLabel`, `pane`, `zIndexOffset`.
- `x-route-search`: `position`, `priority`, `endpoint`, `apiKey`, `timeoutMs`, `importLimit`, `defaultProfile`, `profileOptions`.
- `x-track-editor`: `position`, `priority`, `editablePointRadius`.
- Other plugins have no effective custom options.

There is no descriptor-level option schema, validation framework, immutability, or lifecycle. Options are ordinary mutable objects passed once to `setup()`; plugins validate/default ad hoc and may capture provider functions such as `x-milestone.formatLabel`.

## 4. Current Plugin Lifecycle

### Installation: exact sequence

For `await app.use(pluginOrId, options)` (`createTiliaApp().use`, `src/app.js`):

1. Resolve the argument before checking pending/installed state.
   - A string ID is validated.
   - If `builtinsRegistry[id]?.id === id`, that object is returned synchronously from the already-imported registry.
   - Otherwise the configured loader is awaited, and `resolvePluginModule()` chooses: the module itself, `default`, matching named export, then first plugin-shaped named export.
   - A plugin object must have `setup`; an object without `id` is rejected; its ID is validated.
2. Check `plugins.get(plugin.id)`. If present, return the existing `api`; new options and even a different object with the same ID are ignored.
3. Check `pendingPlugins.get(plugin.id)`. If present, return the same pending promise.
4. Create the install promise.
5. For every `plugin.requires || []`, require `plugins.has(requiredId)`. IDs in `requires` are not themselves validated, loaded, or checked against pending installs.
6. Normalize `plugin.stylesheets`. String entries get ID `${plugin.id}:stylesheet:${index}`; object entries retain metadata and get that default ID if absent.
7. Register all stylesheets before setup.
8. Await `plugin.setup(app, pluginOptions)`.
9. If the result is a function, expose `{destroy: result}` as the API and keep the original function as cleanup. Otherwise use the result as API and bind `result.destroy` if present.
10. Write `{plugin, api, destroy}` to `app.plugins`.
11. If `api !== undefined`, publish it via `app.provide(plugin.id, api)`.
12. Return the API. In `finally`, delete the pending record.

The plugin is considered installed only after step 10. Services created manually during setup may be visible earlier; the automatic plugin-ID service appears after setup resolves.

Configured startup plugins are normalized and installed serially, in array order, by the same `app.use()` path. `app.ready` rejects on the first failure; later configured plugins are not attempted, while earlier ones remain installed.

### Failure and partial state

Installation is **not transactional**.

- Dependency validation fails before stylesheet/setup mutation.
- Stylesheet registration is permanent even if a later stylesheet registration or setup throws.
- Anything setup already changed—services, registry handlers, refresh handlers, UI surfaces, DOM, Leaflet layers/listeners, base-map registrations, entries—remains unless setup catches its own error and rolls it back.
- No plugin record or automatic plugin-ID service is written if setup throws.
- The pending record is removed, so a later `use()` retries setup and can duplicate leaked resources.
- If service publication after `plugins.set()` were to throw (ordinary assignment normally does not), a plugin record could remain; there is no rollback guard.

### Uninstallation: exact sequence

For `await app.unuse(idOrObject)`:

1. Extract a string ID or `.id`; only presence is checked, not ID syntax.
2. If no installed record exists, return `null`.
3. Await the stored cleanup/destroy function.
4. Delete `services[pluginId]`.
5. Delete `plugins[pluginId]`.
6. Return the previously stored API.

If cleanup throws, steps 4–6 do not run: the plugin and service remain registered even though cleanup may have partially dismantled them. A second `unuse()` retries the same destroy. `unuse()` does not coordinate with pending installation; called before install completes, it returns `null`, after which the install can finish normally.

The runtime automatically removes only the service whose name equals the plugin ID and the plugin record. It does **not** remove stylesheets, other services, input handlers, refresh handlers, subscriptions, surfaces, controls, listeners, layers, entries, timers, base-map definitions, or provider-specific contributions.

After successful unuse, the same plugin may be installed again. After cleanup failure it cannot be reinstalled because the old record remains. Duplicate `use()` is idempotent by ID while installed or pending.

### Dependencies

`requires` means only “these IDs must already be committed in `app.plugins` when setup starts.” It does not:

- load or order dependencies;
- wait for a concurrently pending dependency;
- validate cycles;
- acquire/release dependency references;
- verify a service or version;
- prevent later removal.

Removing a required plugin leaves dependents installed with cached references. For panel consumers, this can leave controls calling an API whose DOM root was removed. No notification is sent.

### Application lifetime

There is no `app.destroy()`. `core.clearAll()` clears entries/layers and photo object URLs but does not uninstall plugins, close all runtime resources, remove base tiles, remove UI surface roots, remove the Selection Hub's `popupclose` listener, or clear interaction/refresh subscriber sets. App and plugin lifetime are therefore not symmetrically connected.

## 5. Built-in Plugin Resolution

`src/app.js` statically imports `defaultBuiltins` from `src/builtins.js`. `src/builtins.js` statically imports all ten built-in implementation installers. Its registry contains both friendly export-name aliases (`panel`, `status`, etc.) and canonical ID keys, pointing to the same frozen descriptors.

```text
src/index.js
  -> src/app.js
       -> src/builtins.js
            -> every src/plugins/input/*.js implementation
            -> every src/plugins/ui/*.js implementation
            -> src/ui/protocol.js
       -> core/boot.js (GPX + photo implementation graph)
       -> map/base.js, map/controls.js, ui/*

app.use("tilia-layers")
  -> already-materialized builtins["tilia-layers"]
  -> setup adapter
  -> installLayersControl(...)

app.use("x-track-editor")
  -> pluginLoader(id)
  -> dynamic import ../plugins/x-track-editor/loader.js
  -> resolve exported descriptor
  -> setup
```

Thus built-in registration and implementation loading are the same concern today; all built-ins enter the graph eagerly. Structurally, lazy resolution would require changing the registry values/resolver contract because `assertPluginId()` and `isBuiltinPluginId()` currently identify a built-in by inspecting `registry[id]?.id`, and `resolvePlugin()` expects the value itself to be the descriptor. Resolution is already async at the public boundary, so callers do not require a synchronous setup result, but tests mock and inspect descriptor objects and currently assert the eager registry shape (`tests/builtins.test.js`, `tests/plugin-lifecycle.test.js`). No test establishes a requirement that implementation lookup itself remain synchronous.

The separate convention loader already proves asynchronous external resolution, but it validates unknown IDs against `defaultBuiltins`, not the per-app custom `builtins` registry (`createPluginLoader()`), an inconsistency relevant to custom registries.

## 6. Dependency and Coupling Graph

```text
tilia-panel service
  <- hard dependency + service use: tilia-layers, tilia-elevation, tilia-settings
  <- hard dependency + service use: x-gpx-export, x-track-editor

app.core / core.state entry internals
  <- direct/de-facto coupling: layers, elevation
  <- direct/de-facto coupling: x-gpx-export, x-route-search, x-track-editor
  <- shared-state coupling: x-milestone (app.state.entries)

Interaction Hub
  <- service-like use: x-milestone, x-track-editor
  <- domain publishers: core GPX track/waypoint and photo creation/replacement

Selection Hub
  <- direct core API: elevation
  <- direct Leaflet selection bindings owned by core for GPX/photo

Base-map registry/facade
  <- contribution: x-gsi-base-maps, x-opentopomap-base-maps
  -> consumer: tilia-base-maps-control

Refresh handler Set
  <- producer signal: input plugins, route search, track editor, base-map facade
  -> consumers: base-map control, layers, elevation, x-gpx-export, x-milestone, x-track-editor

core/boot.js
  -> direct implementation coupling: GPX parser/normalizer/interpretation/overlays
  -> direct implementation coupling: EXIF parser/photo inference/photo overlays
```

Classifications:

- **Hard dependency:** the five `requires: ["tilia-panel"]` relationships.
- **Service use:** those same plugins access `app.services["tilia-panel"]`; status is optional service use through `app.setStatus()`.
- **Optional integration:** base-map providers work without the selector; status calls work without status plugin; refresh consumers observe changes only while installed.
- **Implicit ordering:** base-map providers installed before the selector are visible at its first render, but later registration also refreshes it. Status only affects later messages. Panel ordering is explicit through `requires`.
- **Shared-core coupling:** plugins read/mutate `app.core`, `app.state`, entry/source/layer shapes, and the shared refresh channel.
- **Direct implementation coupling:** external plugins import `src/map/controls.js`, `src/gpx/*`, and `src/ui/protocol.js`; `x-track-editor` also vendors a Leaflet editing implementation and assumes Tilia/Leaflet layer behavior.

No plugin directly imports another plugin implementation. Cross-plugin DOM mutation is mostly avoided by the panel service and managed surfaces, but panel consumers assume provider behavior and panel IDs; CSS class contracts remain shared.

## 7. Services

`createTiliaApp()` creates `services = Object.create(null)` and exposes the mutable object as `app.services`. `app.provide(name, service)` is an unchecked assignment and returns the value. Names may be overwritten by any caller; there is no ownership, duplicate check, subscription, versioning, or unregister handle.

Current services:

| Name | Provider | Value/contract | Consumers | Classification/lifetime |
|---|---|---|---|---|
| `tilia-base-maps` | runtime | same mutable facade as `app.baseMaps` | base-map plugin uses direct facade; public callers may use service | Runtime public API; never removed. |
| `tilia-ui-surfaces` | runtime | same object as `app.ui.surfaceManager` | public/plugin callers normally use `app.ui` | Internal mechanism exposed as service; never removed. |
| `tilia-panel` | plugin auto-publication | `{openPanel, closePanel, togglePanel, rerenderPanel, isOpen, destroy}` | layers, elevation, settings, x-gpx-export, x-track-editor | Actual cross-plugin API; removed after successful unuse. Consumers cache it. |
| `tilia-status` | plugin auto-publication | status control API including `setStatus` | `app.setStatus()` dynamically looks it up | Public plugin API and presence detection; removed after unuse. |
| every other plugin ID whose setup returns non-`undefined` | runtime auto-publication | entire returned implementation/API object | no repository consumer found by service lookup | Often an internal control object exposed merely because it was returned for teardown. |

Services become visible whenever `provide()` is called. Automatic plugin API publication occurs only after setup resolves and after the plugin record is written. A setup can manually publish earlier. On setup failure, manual services remain. On uninstall, only `services[pluginId]` is deleted, even if the plugin published additional names; conversely a plugin can overwrite a runtime or another plugin's service. Cached service references remain callable after provider uninstall.

The documentation's statement that services are “plugin-ID keyed” is only a convention, not an enforced identity rule.

## 8. Registries and Extension Mechanisms

| Mechanism | Owner/API | Ordering/duplicates/failure | Removal/lifetime |
|---|---|---|---|
| Plugin registry | app; `use`, `unuse`, `app.plugins` | ID insertion order; duplicates return first API; partial setup not rolled back | runtime removes record only after successful destroy |
| Services | app; `provide`, direct object access | last write wins; no metadata | plugin-ID entry auto-removed only |
| Input handlers | core; `registry.register(matcher, handler)`, `dispatch` | first matching registration wins; duplicates allowed; matcher/handler errors reject dispatch | no unregister; core lifetime |
| Refresh handlers | app; `addRefreshHandler`, `refreshView` | Set insertion order, duplicate function deduped; first throw aborts later handlers | explicit returned unsubscribe only |
| Interaction Hub | core; `subscribeInteractions` | subscriber Set order; immediate replay of entries; per-subscriber WeakSet suppresses same layer; callback throw aborts subscribe/sync | explicit unsubscribe; no automatic plugin ownership |
| Selection Hub | core; `subscribeSelection` and domain selection methods | Set order; immediate current-state call; callback throw propagates and can stop notification | explicit unsubscribe; no hub destroy |
| Base-map registry | app/base manager; register/list/select | Map insertion order; duplicate ID throws; `registerMany` is not atomic | no unregister; app lifetime |
| UI surface manager | app; `mount(id,...)`, `unmount` | IDs unique; same ID replaces/removes old element, same element updates | explicit handle/unmount; roots and manager lack destroy |
| Panel slots | `tilia-panel`; open/toggle/rerender by panel ID | one active panel; latest open replaces DOM; IDs are conventions | provider destroy removes entire panel; contributors manage controls |
| Leaflet controls/layers/events | each plugin/core | Leaflet semantics | manual `remove`/`off` |
| Stylesheets | runtime; `registerStylesheet` | document-wide ID dedupe; first ID wins; declaration order | no unregister; document lifetime |

There is no generic action/command registry. Track editor commands are methods on its returned API; UI buttons close over functions. These mechanisms are “mini plugin systems” but differ in metadata, ownership, error isolation, and cleanup.

## 9. Input Architecture

### End-to-end flows

```text
file picker/dropzone
  -> File[] acquisition
  -> processInputItems (sequential, per-item error capture)
  -> input registry first-match dispatch
  -> core GPX or JPEG handler

URL control/query parameter
  -> HTTP(S) fetch + timeout/size/content checks
  -> construct one File
  -> processInputItems
  -> same registry dispatch

app.load(input)
  -> registry.dispatch directly (no status aggregation)
```

Transport/acquisition is reasonably separated for file picker and dropzone: they know only how to obtain files and call the registry. URL/query import is less generic: `remote-url-import.js` and `input-utils.js` enforce GPX-oriented filenames/content types and defaults (`remote.gpx`, `application/gpx+xml`), so remote JPEG support is blocked before registry dispatch.

Recognition/domain handling is in `createTiliaCore()`:

- GPX: filename ends with `.gpx`; MIME is ignored; parse, normalize, build overlay, add entry, fit map.
- JPEG: filename matches `.jpg`/`.jpeg`; MIME is ignored; parse EXIF, possibly infer from GPX state, build photo overlay, add entry.
- Unsupported input: `Unsupported input: <name>`.

Registry behavior is first-match, synchronous matcher evaluation followed by awaited handler. It has no metadata, priority field, listing, capability query, MIME/extensions, unregister, or registration ownership. File UI hard-codes `.gpx`, XML types, JPEG MIME/extensions in `fileInput.accept`; its tooltip also says GPX/JPEG. Dropzone accepts any files and reports unsupported ones at dispatch. Query parameter defaults to the domain name `gpx`.

`processInputItems()` snapshots inputs, processes sequentially, continues after individual failures, updates `state.lastError` through supplied `onError`, calls `onItemLoaded` per success, and reports a combined status based on only the last successful result plus the first failure detail. Empty input is a no-op. A failing `onError`, `onItemLoaded`, or status callback can enter the outer catch; errors are not isolated from UI callbacks.

Core registers both domain handlers at construction with no unregister. Therefore input UI presence and actual capabilities can diverge: file picker advertises JPEG even though future optional removal is impossible today, and a future handler cannot update `accept` without direct UI knowledge.

## 10. Entry / Source / Layer Ownership

### Current model

`createAppState()` owns parallel mutable arrays: `entries`, `sources`, and `layers`, plus monotonic `nextEntryId`, GPX visibility, style index, and last error. `addEntry()` assigns a numeric ID and appends the same source/layer references to parallel indices. Plugins can mutate all of these because `app.state` and `app.core.state` are public references.

An entry is not generic in practice:

```text
common: id, kind, source, layer, interactions, visible
GPX:    kind="gpx", presentation.trackStylePresetIndex/trackVisibility
photo:  kind="photo", photoOriginal, requestedPhotoTimeMode, photoTimeMode
```

Core creates all normal entries. External route search and track editor can create only GPX entries via the domain API `core.addGpxSource()`. There is no supported generic external entry registration or resource disposer. Directly pushing an entry would require maintaining all three arrays and binding interaction/selection behavior manually, so it is unsafe.

### Lifecycle

```text
input/core.addGpxSource
  -> domain parse/normalize
  -> domain overlay + interaction handles
  -> addEntry to three parallel arrays
  -> bind core selection events
  -> attach layer if visible / optional fit
  -> InteractionHub.syncEntry

updateGpxSource / updatePhotoTimeMode
  -> construct replacement first
  -> clear selection for entry
  -> remove old group
  -> replace layer/interactions/source in place
  -> bind selection on new layers
  -> attach/fit/sync interaction subscribers

removeEntry
  -> clear entry selection
  -> revoke photo preview URL if any
  -> remove group
  -> splice all three arrays

clearAll
  -> clear selection
  -> revoke all photo URLs
  -> remove every layer
  -> replace all three arrays with []
```

Replacement preserves entry object identity and ID. Consumers such as interaction subscribers receive new layer callbacks, but there is no “old layer removed/replaced” hub event; consumers must notice through Leaflet removal or refresh. `x-milestone` tracks layer handles and uses removal events; `x-track-editor` stores bindings and cleans them only on plugin destruction.

Visibility is split:

- `entry.visible` controls whole entry attachment.
- `state.gpxVisibility` controls global track/route/waypoint classes.
- `entry.presentation.trackVisibility` stores false overrides per GPX track index.
- actual child-layer membership in the FeatureGroup is the effective presentation.

`setEntryVisibility()` applies GPX child visibility, then adds/removes the whole group. Photo uses only the whole group. GPX replacement preserves normalized presentation and per-track visibility. Photo time-mode replacement always fits the map, even if the entry was not visible.

## 11. Resource Ownership and Cleanup

| Resource | Creator/owner | Cleanup triggers and implementation | Risk |
|---|---|---|---|
| Photo object URLs | `parsePhotoFile`; effectively core entry | `removeEntry`, `clearAll` call `URL.revokeObjectURL` | No app destroy; failed photo processing before entry ownership may leak depending on parse failure point. |
| Entry FeatureGroups/layers | core | replacement/remove/clear call `.remove()` | Good for core-owned entries; no generic disposer or plugin ownership. |
| Selection popup | Selection Hub | replacement/clear/removal closes active popup | Hub's map listener itself has no teardown. |
| Built-in controls | plugin | returned `destroy()` removes control | Generally complete. |
| Panel/floating DOM | panel, URL import, route search | surface handle + element removal | Surface roots/manager survive app forever; ID replacement silently removes prior contributor element. |
| Refresh/subscription callbacks | plugins | returned unsubscribe called in most destroy methods | Setup failure can leak; runtime does not own them. |
| Stylesheet links | runtime | none | Permanent across unuse/setup failure; IDs can collide/share with no reference count. |
| Base-map definitions | external provider plugins | none | Permanent after provider unuse; duplicate reinstall throws. |
| Base tile layer | base-map manager | old layer removed on selection | No app teardown; definitions cannot be removed. |
| URL import timeout | URL helper | `finally` clears timer | In-flight fetch not tied to plugin uninstall. |
| Route-search request | route plugin | request helper timeout | Uninstall does not abort active request; completion can mutate entries/UI after destroy. |
| Track-editor temporary layers/selection overlay/rectangle listeners | track editor session | `finishSession`, invoked by destroy | Strong manual cleanup; saved GPX entry intentionally persists. |
| Milestone markers | milestone plugin | layer removal, refresh, destroy | Anonymous layer `add/remove` handlers are never detached; they retain state closures though `destroyed` gates render. |
| Elevation timers/marker/map events | elevation plugin | explicit destroy | Complete in normal uninstall. |

Cleanup works through domain-specific core code for photo URL revocation, GPX/photo selection invalidation, overlay replacement, and per-kind visibility. A generic entry created externally would not receive these guarantees.

## 12. Selection Architecture

`createSelectionHub(map)` stores one `activeSelection`, one `activePopup`, a transition counter, and a subscriber Set. Selection identities are domain-shaped objects:

- `{kind:"track", entry}`
- `{kind:"track-point", entry, point}` where point includes GPX locator/detail
- `{kind:"route-point", entry, routePoint, locator}`
- `{kind:"waypoint", entry, waypoint}`
- `{kind:"photo", entry}`

The hub imports domain popup builders from `map/layers.js`, so it owns both generic transition consistency and GPX/photo presentation policy. It handles synchronous/reentrant `popupclose` with a transition ID, updates state before closing/opening, and rolls back selection if popup opening throws. Popup close clears selection only when the event popup is the active popup.

Subscribers receive the current value immediately and future notifications. Errors propagate and can prevent later subscribers from running. There is no subscriber ownership or hub destroy.

Core binds direct Leaflet click handlers for track polylines, route-point markers, waypoint markers, and photo markers. Boolean properties on layer objects prevent duplicate binding. Entry removal/replacement clears selection by comparing `activeSelection.entry.id`. Replacement invalidates rather than remaps selections.

Elevation is the main consumer: it subscribes to track-point selection, creates its own hover/selected marker state, and separately listens to Leaflet `popupopen`/`popupclose` with zero-delay timers. That illustrates timing contracts a future model must preserve: a single canonical active selection, reentrant popup safety, deletion/replacement invalidation, immediate subscriber replay, entry identity, domain payload/locator access, and the ability to open a popup without changing selection (`core.openPopup`).

`x-track-editor` does not integrate with Selection Hub. It maintains a separate private draft-point selection model and closes map popups when editing starts. This is a meaningful parallel selection system, not merely another selection kind.

## 13. Interaction and Event Architecture

Interaction Hub supports exactly three callbacks:

- `onTrackLayer({entry, layer, trackIndex})`
- `onWaypointLayer({entry, layer, waypoint})`
- `onPhotoMarker({entry, layer})`

It omits route polylines and route-point markers. Subscription immediately enumerates existing entries, then `syncEntry()` publishes new/replaced handles. WeakSets suppress repeat delivery of the same layer per subscriber. There are no removal/replacement events, generic interaction descriptors, metadata, error isolation, or automatic cleanup.

Publishers are `addGpxEntry`, GPX replacement, photo input, and photo replacement in `core/boot.js`. Consumers are `x-milestone` and `x-track-editor`; built-in selection bindings bypass the hub and are attached by core directly.

Other events include:

- refresh Set: coarse “rerender now” notification with no payload;
- Selection Hub subscription;
- Leaflet map events (`popupopen`, `popupclose`, `zoomend`, `click`, `contextmenu`, `movestart`);
- Leaflet layer events (`click`, `add`, `remove`, editing events);
- DOM events on controls, inputs, map container, document, and temporary shields.

Application-level candidates evidenced by current use are entry added/replaced/removed, entry/layer visibility, selection transitions, and availability of interactable domain surfaces. Leaflet pointer/editing events and plugin-local form/history events are implementation-level today.

## 14. UI Composition and Coupling

UI is composed through three mechanisms:

1. Leaflet controls via `installMapControl()` and shared DOM helpers.
2. Managed `panel` and `floating` roots via `createUiSurfaceManager()`.
3. The `tilia-panel` service, which offers one active named panel rendered from a callback.

The surface manager arbitrates panel/control edge offsets using DOM queries, dataset metadata, CSS custom properties, and optional `ResizeObserver`. It replaces an existing item with the same ID rather than rejecting it. It is created regardless of plugin configuration and published both through `app.ui` and services.

Domain coupling in shared-looking UI:

- `tilia-layers` is intentionally product-level but contains GPX global toggles, GPX style summaries, photo thumbnails, and photo time-mode editing. This is **plugin-specific behavior embedded in shared UI**.
- `tilia-settings` is named generically but contains only photo timestamp configuration. This is **photo-specific behavior behind generic UI naming**.
- global `src/ui/styles.css` contains elevation, photo list/thumbnail/popup, route marker, and all built-in feature CSS. This is **domain CSS owned by core UI stylesheet**.
- elevation is explicitly GPX-specific and reasonably a domain UI plugin, but consumes private/de-facto core APIs and shared panel service.
- external panel plugins import core DOM helpers and rely on `tilia-*` CSS classes. This is **DOM/CSS and internal module coupling**.

Optional integration exists for status and base-map providers. There is no contribution registry for layers rows/settings fields/actions; domain behavior is coded directly into the owning UI module.

## 15. Stylesheet Lifecycle

Built-in UI CSS is registered during every app construction with stable ID `tilia-core-ui`, deduplicated per document. Plugin descriptors may declare strings or `{href,id}`. Declaration order is preserved and links are inserted before setup.

Deduplication is by `data-tilia-stylesheet` ID only, not URL. Default plugin IDs include descriptor ID and array index. If two plugins intentionally share an ID, the first link wins regardless of differing `href`; there is no validation. If they use different IDs for the same URL, duplicate links are possible.

Links are never removed on unuse, failed setup, or app end. There is no reference counting for shared CSS. The core UI stylesheet contains CSS for optional/domain features (elevation, photos, routes), while external track editor, GPX export, and route search declare their own CSS. `x-milestone` embeds visual style in marker HTML; track editor also declares a vendored Leaflet editing stylesheet.

## 16. Plugin Options and Configuration

Startup accepts:

- string ID, whose options come from `pluginOptions[id] || {}`;
- `[plugin, options]`, whose tuple options take precedence;
- `{plugin, options}`.

Entries are installed serially. Falsy options are replaced by `{}`. There is no merge between tuple/object options and `pluginOptions`, no cloning, no schema, and no update/reconfigure mechanism. Duplicate use ignores new options. Built-in adapters generally spread resolved UI options after required runtime fields; option forwarding is permissive.

Global app configuration also leaks domain policy: `defaultPhotoTimeMode` is consumed directly by core. `baseLayerOverrides`, `pluginUrls`, and `pluginLoader` are app-level provider/configuration hooks. Options can contain callbacks/providers (`x-milestone.formatLabel`, custom plugin URL functions/loaders), so they can create hidden coupling and retain external objects for plugin lifetime.

## 17. External Plugin Boundary (`x-track-editor`)

`x-track-editor` demonstrates both viability and boundary gaps.

| Need | Current access | Classification |
|---|---|---|
| map and container | `app.getMap()` | documented public API |
| panel integration | `requires`, `app.services["tilia-panel"]` | documented plugin service, UI-specific |
| control DOM | direct imports from `src/map/controls.js` | de facto/private module API |
| enumerate GPX entries | `core.state.entries`, `entry.kind/source/id` | de facto public/private state shape |
| per-track effective visibility | `core.getEffectiveGpxTrackVisibility` | public object but domain-specific API |
| hide/restore source tracks | `core.get/setGpxTrackVisibility` | public but domain-specific mutation |
| create saved result | `core.addGpxSource` | public but domain-specific entry creation |
| observe track layers | `app.subscribeInteractions` then direct Leaflet events | documented Tilia API + Leaflet-level integration |
| update other UI | `app.refreshView()` | documented coarse mechanism |
| status | `app.setStatus()` | documented optional integration |
| visual/layout contract | shared `tilia-*` class names, panel IDs, own CSS | DOM/CSS assumptions |
| editing implementation | vendored Leaflet extension and direct map layers | Leaflet-level/private plugin implementation |

It creates an isolated working-copy model, temporary editable polylines, a separate selection overlay, rectangle/document listeners, keyboard shortcuts, undo/redo history, and a panel. On save it converts the draft to GPX and adds a new core-owned entry; it does not replace the original. It hides only effectively visible original tracks and restores their prior per-track visibility. If the original entry disappears, refresh cancels the session.

Cleanup is comparatively disciplined: it ends the session, destroys temporary layers/overlay/rectangle selection, restores visibility, detaches track click bindings, unsubscribes, removes refresh/map/DOM listeners, and removes the control. However, it must maintain `trackClickBindings` because Interaction Hub offers no removal ownership; it cannot express plugin-owned entries or actions generically; and it bypasses the canonical Selection Hub for draft selection.

The current architecture is sufficient for loading, a shared panel, coarse refresh, status, and observation of GPX layers. It is insufficient for stable entry enumeration/creation, editing capabilities, generic visibility, interaction removal/replacement, action/UI contributions, and resource ownership without internal APIs.

## 18. Domain-Specific Knowledge in Core

| Area | Evidence | Classification |
|---|---|---|
| plugin lifecycle, ID rules, generic services | `src/app.js` | clearly generic core/runtime |
| parallel entry arrays and numeric IDs | `src/core/state.js` | mixed; mechanism with GPX fields in same state |
| `gpxVisibility`, track style index | `state.js`, `boot.js` | GPX-specific |
| GPX parsing/normalization/overlay/visibility/selection | static imports and methods in `boot.js` | GPX-specific |
| EXIF, inference, photo input, URL revocation, time mode | `boot.js`, `photo/*`, `photo-time-utils.js` | photo-specific |
| photo/GPX popup builders in Selection Hub | `selection-hub.js` → `map/layers.js` | domain + UI-specific |
| track/waypoint/photo callback names | `interaction-hub.js` | domain-specific mechanism |
| photo and route/elevation CSS | `src/ui/styles.css` | domain-specific shared UI |
| remote URL GPX filtering/default names | `input-utils.js`, `remote-url-import.js` | GPX-specific transport policy |
| panel/surface/control primitives | `ui/surfaces.js`, `map/controls.js` | generic UI mechanism |
| base-map registry | `map/base.js` | map-domain mechanism, reasonably shared |
| layers/settings branches | UI plugin modules | mixed product UI and embedded domain policy |

GPX is not merely a plugin today: it is the central entry/source/presentation model. Photo is optional in user configuration only at the UI level; its EXIF dependency and domain logic are statically required by core.

## 19. Current Architecture Diagrams

### Plugin/runtime view

```text
createTiliaApp
  |
  +-- eager defaultBuiltins ----------------> all built-in implementations
  +-- pluginLoader --dynamic import--------> plugins/<id>/loader.js
  +-- plugins Map <---- use/unuse
  +-- pendingPlugins Map
  +-- services object <---- auto API publication / provide
  +-- stylesheet link registry (document DOM)
  +-- refresh handler Set
  |
  +-- createTiliaCore
  +-- base-map manager
  +-- UI surface manager
```

### Extension mechanisms

```text
transports ----> Input Registry ----> GPX handler ----> GPX entry/layer
   |                    |             Photo handler --> photo entry/layer
   |                    +-- first matcher wins
   +-- file/drop/url/query

entries --sync--> Interaction Hub --> external layer consumers
   |
   +-- direct core Leaflet bindings --> Selection Hub --> subscribers/popups
   |
   +-- refreshView ------------------> UI/plugin rerenders
   |
   +-- layers/panel/elevation UI via panel service

providers --> Base-map Registry --> selector UI
plugins ---> UI Surface Manager --> panel/floating DOM roots
```

### Ownership view

```text
core owns: state arrays, all normal entries, GPX/photo layers, selection,
           interaction publication, domain input handlers, photo URL cleanup

runtime owns: plugin records, automatic plugin-ID services, pending promises,
              stylesheet insertion, refresh Set, base-map/UI facades

plugins own manually: controls, DOM, Leaflet/plugin listeners, subscriptions,
                      temporary layers, timers, provider-specific state

unowned after contribution: stylesheet links, base-map definitions,
                            input handlers (if plugins could register them)
```

## 20. Gap Analysis Against `DESIGN.md`

| Phase 0 principle | Status | Evidence |
|---|---|---|
| Core owns mechanisms; plugins own domain policy | not aligned | `core/boot.js`, Selection Hub, Interaction Hub and global CSS own GPX/photo policy. |
| Dependencies point plugin → core; core not → plugin implementation | partially aligned | Core does not import descriptor modules, but `app.js` imports eager built-ins and core imports optional-domain implementations. |
| Small, domain-agnostic core | not aligned | GPX/photo parsing, inference, presentation, selection and visibility are core. |
| Generic entry/resource lifecycle | not aligned | Entry APIs are GPX/photo-specific; only photo URLs receive domain cleanup. |
| Extensible input dispatch with metadata/capabilities | partially aligned | First-match registry exists; no unregister/metadata/capability, UI hard-codes formats. |
| Generic structured selection/interaction | partially aligned | Central consistency mechanisms exist, but schemas/methods/popup builders are domain-specific and editor has a second selection system. |
| Full plugin lifecycle including partial failure | partially aligned | resolve/setup/unuse exist; rollback, ownership, app destroy, dependent policy are absent. |
| Explicit, runtime-resolvable dependencies | not aligned with target | `requires` only validates already-installed IDs. |
| Separate dependency/service/capability/contribution concepts | not aligned | dependency and service exist weakly; capabilities/contributions are ad hoc registries/facades. |
| Optional plugins absent from module graph | not aligned | built-ins are eager; photo dependencies are static core imports. |
| Built-ins and external plugins share lifecycle | aligned | both resolve to the same descriptor and use/unuse path. |
| Supported external boundary without private internals | not aligned | repository external plugins import `src/*` and use `app.core`/entry internals. |
| UI contributions avoid domain branches | not aligned | layers/settings/global CSS contain photo/GPX branches. |
| Explicit resource ownership and complete uninstall | not aligned | manual cleanup, permanent styles/registrations, no app destroy or rollback. |
| Preserve useful simplicity | aligned/partially aligned | plain descriptors, async setup, cleanup return, ID convention and focused registries are simple and useful. |

No Phase 0 principle appears contradicted by current use cases, but “core owns entry/selection/resource mechanisms” requires careful design because GPX and track editor depend on fine-grained visibility, stable entry identity, replacement invalidation, and Leaflet interaction access.

## 21. Existing Strengths to Preserve

- Plain `{id, setup}` objects are easy to author and dynamically load.
- Built-ins and external plugins already converge on one lifecycle path.
- `use()` is async, enabling future lazy resolution without changing the fundamental call shape.
- Installed and pending ID deduplication is simple and tested.
- Cleanup functions and API `destroy()` provide understandable setup/teardown symmetry.
- Lower-kebab IDs and reserved `tilia-` namespace provide clear ownership.
- Startup plugin configuration supports strings, tuples, and descriptor objects without a second installer.
- Input acquisition already funnels through one dispatch registry; multi-file processing is sequential and resilient per item.
- Selection Hub handles difficult reentrant popup transitions and entry invalidation centrally.
- Interaction Hub replays existing entries, allowing late-installed plugins such as milestones/editor to attach.
- Managed UI surfaces avoid most arbitrary map-container/z-index mutation.
- The base-map facade is a concrete, successful contribution/use separation, despite lacking unregister ownership.
- Complex plugins demonstrate that Tilia can support substantial behavior without modifying the app runtime for each plugin.

## 22. Accidental Complexity / Historical Coupling

- Three parallel entry/source/layer arrays encode historical storage shape and demand index synchronization.
- `core/boot.js` combines app boot, input domain registration, GPX presentation/visibility, photo inference, selection binding, entry lifecycle, and cleanup.
- Photo-specific settings and layer rows live in generic-looking UI plugins; photo CSS and popups live in shared modules.
- Interaction Hub exposes an uneven historical subset: tracks, waypoints, photos, but not routes/route points.
- Entry replacement has no explicit event, so plugins infer it from new handles, Leaflet removal, and coarse refresh.
- `refreshView()` compensates for missing structured state/contribution notifications.
- Plugin return values simultaneously mean public API, service, and cleanup carrier, exposing many implementation objects unintentionally.
- Base-map and surface facades exist both as direct app fields and named services.
- Built-in registry aliases mix export convenience with canonical resolution data.
- External plugins import internal helper modules because no stable control/GPX/editor-facing contracts exist.
- Global CSS accumulated feature-specific rules and therefore makes disabled features non-optional in assets/module ownership terms.
- `query-import` and remote URL code name and validate GPX even though they feed a nominally generic registry.

These are historical structures to evaluate, not compatibility requirements for the major-version redesign.

## 23. Phase 2 Decision Inputs

1. **What is the plugin descriptor and resolution record?** Needed to separate metadata from implementation loading. Current ID validation inspects eager descriptor objects; real cases need IDs, dependencies, CSS, and lazy loaders. Alternatives: descriptor-with-loader, registry records/factories, or import maps. Tentative preference: registry metadata must not import implementation modules.
2. **How are dependencies resolved and removed?** Current five panel dependencies require caller ordering and can be broken by unuse. Alternatives: auto-resolve/topological install; validation-only retained; reject provider removal; cascade dependents; reference-counted scopes. Phase 0 favors runtime resolution, but uninstall policy remains open.
3. **What are setup transaction semantics?** Current setup can leak every resource class. Alternatives: runtime setup scope with registered disposers and automatic rollback; staged contributions committed after setup; plugin-authored catch/rollback. Real cases include controls, listeners, surfaces, base maps, handlers, and styles.
4. **What does plugin/API/service identity mean?** Today all non-undefined return values become services and arbitrary names are overwriteable. Alternatives: explicit service declarations/handles; return value only as plugin instance; namespaced/versioned services. Panel/status are true APIs; most control objects are not.
5. **What is the application destruction contract?** Needed for repeated maps/embed samples and complete lifetime symmetry. It must decide plugin teardown order, entries/resources, base tiles, surfaces, hub listeners, and error aggregation.
6. **How are contributions owned and revoked?** Base maps, stylesheets, handlers, UI surfaces, and refresh callbacks have different rules. Alternatives: typed registries returning disposers; plugin setup scope records all handles; contribution bundles committed transactionally.
7. **What input capability metadata is required?** File picker needs accept metadata; URL transport needs to stop assuming GPX. Alternatives: handlers expose extensions/MIME/transport support; a separate capability catalog; input descriptors combining matcher/handler/metadata. Real cases are GPX, JPEG, file/drop/URL/query.
8. **What is the generic entry lifecycle and representation?** Current external creation is GPX-only and cleanup is photo-specific. It must support GPX, photo, route-search results, saved editor copies, visibility, replace/remove/clear, presentation and owned disposers without disguising GPX shape as generic.
9. **Who owns source, presentation, and map attachment?** Current entry stores all three and core mutates child FeatureGroups. Alternatives: core-owned entry envelope with plugin-owned source/presenter; plugin-created presentation registered with generic attachment; domain service mediating operations.
10. **What visibility levels are generic?** Whole-entry visibility serves GPX/photo, but per-track/global GPX visibility is domain-specific and required by editor/layers. Alternatives: generic named sub-presentations; GPX service; plugin-defined visibility contributions.
11. **What selection identity/payload is stable?** Must preserve one canonical selection, entry invalidation, locator identity, popup transition safety, and editor's distinct draft selection. Alternatives: `{owner,type,key,data}` descriptors with owner validation; opaque plugin tokens plus generic entry ID; typed adapters.
12. **Where does popup presentation live?** Selection Hub currently imports GPX/photo DOM builders. Alternatives: selection carries a presenter/contribution; domain plugin owns popup; generic popup service consumes content. Reentrancy semantics must remain centralized.
13. **What interaction contract replaces domain callbacks?** Track editor/milestone need discoverable GPX track layers, while selection bindings also need routes/photos. Alternatives: typed interaction contributions; entry presentation handles; domain service subscriptions. Avoid an unstructured global bus.
14. **Which UI extension points are justified?** Evidence supports panel pages, layers rows/actions, settings fields, map controls, and floating surfaces. Alternatives: small typed contribution registries versus service methods. Do not create a general UI framework.
15. **How should shared CSS be scoped and unloaded?** Current links are permanent and global CSS owns domains. Alternatives: plugin-owned links with reference counts; constructable stylesheets/shadow scopes; keep a minimal permanent mechanism stylesheet plus feature CSS.
16. **What is the stable external API boundary?** `x-track-editor`, export, route search and milestone import internal modules. Decide whether control primitives, GPX domain services, entry observation, and Leaflet handles are supported contracts or plugin-private adapters.
17. **How are async operations cancelled on uninstall?** URL/query import and route search can outlive plugins. Alternatives: setup abort signal; disposer-managed tasks; runtime waits/cancels before final removal.
18. **How are teardown failures handled?** Current failure leaves an ambiguous registered/partially destroyed plugin. Alternatives: mark failed, remove registry but report aggregate error, retryable teardown state, or best-effort disposer stack.
19. **How are registry ordering and errors specified?** Input first-match and subscriber insertion order are implicit. Decide priorities, duplicate policy, matcher/callback error isolation, and whether dispatch snapshots registrations during iteration.
20. **What GPX responsibilities remain core?** Phase 0 leaves this open. Current app, UI and all complex external plugins assume GPX APIs. Alternatives range from GPX domain plugin to a first-class bundled domain subsystem above a domain-agnostic core.

## 24. Files and Symbols Relevant to the Redesign

- `src/app.js`: `assertPluginId`, `resolvePluginModule`, `resolvePlugin`, `createPluginLoader`, `normalizeConfiguredPlugin`, `normalizePluginStylesheets`, `createTiliaApp`, `app.provide`, `app.use`, `app.unuse`.
- `src/builtins.js`: every built-in descriptor and eager `builtins` registry.
- `src/core/boot.js`: `createTiliaCore`, `addGpxEntry`, `resolvePhotoSource`, visibility/binding helpers, entry operations, domain input registration.
- `src/core/state.js`: `createAppState`, parallel array mutation, replacement helpers.
- `src/core/input-registry.js`: `createInputRegistry`.
- `src/core/input-processing.js`: `processInputItems`.
- `src/core/remote-url-import.js`, `src/core/input-utils.js`: transport/domain coupling and async timeout.
- `src/core/selection-hub.js`: `createSelectionHub`, popup transition algorithm, domain selectors.
- `src/core/interaction-hub.js`: `createInteractionHub` and its domain callback contract.
- `src/map/layers.js`: GPX/photo overlay and popup builders.
- `src/map/base.js`: `createBaseLayerManager`, registration/select semantics.
- `src/map/controls.js`: external plugins' de facto UI helper API.
- `src/ui/styles.js`: document stylesheet registry.
- `src/ui/surfaces.js`: `createUiSurfaceManager`, item ID/replacement/panel layout behavior.
- `src/ui/protocol.js`, `src/ui/styles.css`: UI metadata and global feature CSS.
- `src/plugins/input/*.js`: transport plugins and hard-coded format knowledge.
- `src/plugins/ui/layers-control.js`: GPX/photo shared UI coupling.
- `src/plugins/ui/elevation-panel.js`: selection/popup timing and GPX UI.
- `src/plugins/ui/settings-panel.js`: photo-specific generic settings coupling.
- `src/plugins/ui/panel.js`: current cross-plugin UI service.
- `plugins/x-track-editor/loader.js` plus its helper modules: primary complex external boundary case.
- `plugins/x-gpx-export/loader.js`: state/serializer/internal-control coupling.
- `plugins/x-milestone/loader.js`: interaction replay, Leaflet events, cleanup edge case.
- `plugins/x-route-search/loader.js`: managed surfaces, async work, GPX entry creation.
- `plugins/x-{gsi,opentopomap}-base-maps/loader.js`: contribution-without-unregister cases.
- `tests/plugin-lifecycle.test.js`, `tests/builtins.test.js`, `tests/builtin-control-cleanup.test.js`: present lifecycle contract.
- `tests/input-registry.test.js`, `tests/selection-hub.test.js`, `tests/interaction-hub.test.js`, `tests/state.test.js`: mechanism contracts.
- `tests/x-track-editor-*.test.js` and `tests/smoke/editor.spec.js`: external editor behavior and cleanup expectations.
- `docs/API.md`, `docs/PLUGIN-OPERATIONS.md`: current documented contract.
- `plugin-architecture/DESIGN.md`: Phase 0 principles, not current behavior.

---

This Phase 1 investigation modified no source code. The only repository change is this inventory report. At the recorded baseline, unit status is **336/336 passed** and smoke status is **28/28 passed**.
