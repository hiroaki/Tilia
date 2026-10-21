[日本語](PLUGINS.ja.md)

# Tilia plugin guide

This guide covers the repository's 21 built-in and six third-party plugins and the application-level options used to combine them. Built-in IDs and dependencies are in [the official catalog](../src/builtins.js); third-party definitions are in their own `plugins/<id>/loader.js`. The runtime installs required dependencies before their dependents; listing a plugin does not automatically install every plugin in its feature group.

## Choosing plugins

For each data format, choose the parts your application needs:

| Part | GPX | Photos | Purpose |
| --- | --- | --- | --- |
| Domain | `tilia-gpx-domain` | `tilia-photo-domain` | Owns data entries and exposes commands and queries |
| Renderer | `tilia-gpx-renderer` | `tilia-photo-renderer` | Displays entries on the map |
| Input | `tilia-gpx-input` | `tilia-jpeg-input` | Reads files and creates entries |
| UI contribution | `tilia-gpx-ui` | `tilia-photo-ui` | Adds format-specific layer rows, popup content, and settings |

Input, renderer, and UI plugins require their respective domain, which installs automatically. A domain alone does not parse files or draw anything. UI contributions need hosts: `tilia-layers` for layer rows, `tilia-settings` for settings, and `tilia-map-selection-presenter` for selection popups and highlights. These hosts do not install the format-specific contributions.

File picker, URL, query, and drop plugins are input transports. They dispatch to installed handlers rather than providing a GPX or JPEG parser themselves. Include the appropriate input plugin even when its domain and renderer are already installed.

## Installation and configuration

Import from `src/index.js`, following the dependency setup in the [README](../README.md#basic-usage). Examples below assume a sized `map` container and that setup. Adjust import paths for your page's location.

```js
import { createDefaultTiliaApp } from "./src/index.js";

const app = createDefaultTiliaApp("map", {
  plugins: ["tilia-gpx-input", "tilia-gpx-renderer", "tilia-url-import"],
  pluginOptions: {
    "tilia-url-import": { timeoutMs: 15000, maxBytes: 10 * 1024 * 1024 },
  },
});
await app.ready;
```

No plugins are enabled when `plugins` is omitted. The catalog makes implementations available for lazy loading; it does not activate all of them. `plugins` also accepts `[idOrDefinition, options]` and `{ plugin: idOrDefinition, options }` entries. String entries use `pluginOptions[id]`; tuple and object entries use their own options instead, without merging `pluginOptions`.

For dynamic installation:

```js
await app.use("x-milestone", {
  formatLabel: (meters) => `${(meters / 1000).toFixed(1)} km`,
});
await app.unuse("x-milestone");
```

`app.use` returns an opaque `{id}` handle, not a plugin API. Inspect active plugins with `app.hasPlugin(id)` or `app.listPlugins()`. Remove dependents before their prerequisites; active dependents and provider leases can block removal. Uninstalling a renderer does not delete its domain's entries. Call `await app.destroy()` when disposing of the whole application.

## Catalog

“Requires” lists exact hard dependencies. An em dash means no hard plugin dependency, not that external libraries, input handlers, or UI contributions are unnecessary.

### Data and presentation

| ID | Requires | Behavior |
| --- | --- | --- |
| `tilia-gpx-domain` | — | GPX tracks, routes, and waypoints; commands, queries, and selection candidates |
| `tilia-gpx-renderer` | `tilia-gpx-domain` | Map rendering of tracks, routes, and waypoints |
| `tilia-gpx-input` | `tilia-gpx-domain` | Parses GPX files, creates entries, and fits the map to imported bounds |
| `tilia-gpx-ui` | `tilia-gpx-domain` | GPX layer rows, popup content, and per-entry settings |
| `tilia-photo-domain` | — | Photo metadata, saved inferred locations, preview resources, and commands |
| `tilia-photo-renderer` | `tilia-photo-domain` | Markers at EXIF GPS coordinates or saved inferred locations |
| `tilia-jpeg-input` | `tilia-photo-domain` | JPEG file handler with lazy EXIF parsing through exifr |
| `tilia-photo-ui` | `tilia-photo-domain` | Photo layer rows, popup content, and time interpretation settings |
| `tilia-map-selection-presenter` | — | Presents current semantic selection with popups and highlights |

### Viewer controls and input

| ID | Requires | Behavior |
| --- | --- | --- |
| `tilia-panel` | — | Side/bottom panel host for controls and tools |
| `tilia-toolbar` | — | Hosts contributed map buttons and controls |
| `tilia-status` | — | Independent status display with a dismiss button |
| `tilia-base-maps-control` | — | Selector for registered base-map definitions |
| `tilia-layers` | `tilia-panel`, `tilia-toolbar` | Entry visibility, removal, Delete all, and format-specific rows when contributed |
| `tilia-elevation` | `tilia-panel`, `tilia-toolbar`, `tilia-gpx-domain` | Interactive GPX track elevation chart |
| `tilia-file-import` | `tilia-toolbar` | Multi-file picker using installed handlers |
| `tilia-url-import` | `tilia-toolbar` | URL input control with timeout and size limits |
| `tilia-query-import` | — | Imports a URL from a page query parameter without a control |
| `tilia-initial-view` | — | Experimental initial view and one-shot geolocation from `tilia.c` |
| `tilia-settings` | `tilia-panel`, `tilia-toolbar` | Hosts per-entry settings contributed by format UI plugins |
| `tilia-dropzone` | — | File drop target across the map area |

### Optional tools and base maps

These repository plugins use the `x-` namespace and reside under `plugins/`. They are discovered through the fixed directory convention and can be enabled by ID without official registration.

| ID | Requires | Behavior |
| --- | --- | --- |
| `x-track-editor` | `tilia-gpx-domain`, `tilia-panel`, `tilia-toolbar` | Edits an independent GPX track draft and saves a new entry |
| `x-gpx-export` | `tilia-gpx-domain`, `tilia-panel`, `tilia-toolbar` | Downloads a selected GPX entry as a `.gpx` file |
| `x-route-search` | `tilia-gpx-domain`, `tilia-toolbar` | Searches through Phloem and imports results as tracks with Start/Via/Goal waypoints |
| `x-milestone` | `tilia-gpx-domain` | Distance labels along visible GPX tracks |
| `x-gsi-base-maps` | — | Registers GSI Standard (`gsi-std`) and Pale (`gsi-pale`) maps |
| `x-opentopomap-base-maps` | — | Registers OpenTopoMap (`opentopomap`) |

## GPX viewer

This combination supports GPX file, URL, query, and drop input, with layers, selection presentation, elevation, and settings. The panel, toolbar, and GPX domain install as dependencies.

```js
const app = createDefaultTiliaApp("map", {
  plugins: [
    "tilia-gpx-input", "tilia-gpx-renderer", "tilia-gpx-ui",
    "tilia-map-selection-presenter", "tilia-layers", "tilia-settings",
    "tilia-elevation", "tilia-status", "tilia-base-maps-control",
    "tilia-file-import", "tilia-url-import", "tilia-query-import",
    "tilia-dropzone", "x-gsi-base-maps", "x-opentopomap-base-maps",
  ],
});
await app.ready;
```

Use **Open files**, **Load URL**, or drop files onto the map. Open **Layers** to toggle or remove entries and **Settings** for GPX preferences. Click a rendered feature to select it and display its contributed popup. Closing the popup does not clear the semantic selection.

Open **Elevation** for a track containing elevation data. Hover to locate chart samples on the map, or click to select a track point. Arrow keys move through samples; Enter or Space selects one. Map-linked presentation also needs the GPX renderer. Routes and standalone waypoints are not track elevation profiles.

The [viewer sample](../samples/viewer/index.html) combines GPX and Photos. The [embed gallery](../samples/embed/index.html) demonstrates separate map instances.

## Photos

The JPEG input plugin imports exifr 7.1.3 directly from `https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.js` when processing a JPEG file. CDN access must be allowed by the network and CSP.

Include Leaflet CSS and place its import map before the module script:

```html
<script type="importmap">
{
  "imports": {
    "leaflet": "https://unpkg.com/leaflet@2.0.0-alpha.1/dist/leaflet.js"
  }
}
</script>
```

For a Photo viewer with a file picker, layers, settings, and popups:

```js
const app = createDefaultTiliaApp("map", {
  plugins: [
    "tilia-jpeg-input", "tilia-photo-renderer", "tilia-photo-ui",
    "tilia-file-import", "tilia-layers", "tilia-settings",
    "tilia-map-selection-presenter",
  ],
});
await app.ready;
// Pass a JPEG File from your picker to app.load(file).
```

EXIF GPS coordinates take precedence. A photo without GPS can receive an inferred location from a matching GPX timeline supplied by an installed GPX domain. For this, add `tilia-gpx-input` and load the timestamped GPX before the photo; a GPX renderer is optional for inference. Inference may fail to find a location, in which case no photo marker is shown.

The inferred result is saved on the Photo entry. Later GPX changes or deletion do not automatically relocate it. Photo settings support `auto`, `local`, `utc`, and **Custom offset** (sign plus hours/minutes). Commit custom fields with Enter or by moving focus outside the offset controls. Changing the Photo's relevant data or time mode, or explicitly recomputing, can attempt new inference. Failed changes preserve the committed setting and position; settings changes do not move the map automatically.

Set the initial JPEG interpretation through the JPEG plugin, before publication and auto-pan:

```js
pluginOptions: {
  "tilia-jpeg-input": { defaultPhotoTimeMode: "+09:00" },
}
```

The default is `auto`; invalid defaults fail plugin setup. Fixed offsets also accept compact strings such as `+0900` and `Z`, normalized by the Photo domain. This option affects future imports, not existing entries. There is no application-global default setter. See [Photo domain](API.md#photo-data-commands-and-previews) for time semantics. Embed's second photo uses the original `biwakososui.gpx` timeline and `+09:00`.

To request recomputation after loading new GPX data:

```js
const result = await app.load(jpegFile); // A JPEG File supplied by your app.
const view = app.domains.photo.get(result.entry.id);
await app.domains.photo.recomputeDerived(result.entry.id, undefined, {
  expectedRevision: view.revision,
});
```

Recomputation can reject if there is no matching timeline. For a simple embedded marker, only `tilia-jpeg-input` and `tilia-photo-renderer` are needed; add the UI contribution and selection presenter for photo popups.

## Input settings

`tilia-gpx-input` recognizes `.gpx` names or `application/gpx+xml`; `tilia-jpeg-input` recognizes `.jpg`/`.jpeg` names or `image/jpeg`. `app.load` dispatches a file to installed handlers. A filename extension is useful when a fetched resource has a generic MIME type. These plugins do not accept a URL string as a file: fetch and wrap it as shown in the README, or use a remote input transport.

| Plugin | Option | Default | Use |
| --- | --- | --- | --- |
| `tilia-url-import`, `tilia-query-import` | `timeoutMs` | `15000` | Positive safe integer, at most `2147483647`, in milliseconds |
| `tilia-url-import`, `tilia-query-import` | `maxBytes` | `10485760` (10 MiB) | Positive safe integer; maximum remote response body size |
| `tilia-query-import` | `parameterName` | `"gpx"` | Nonempty string naming the page query parameter |

For query import, open a viewer page with a URL such as `?gpx=https%3A%2F%2Fexample.com%2Ftrack.gpx`, replacing the illustrative remote URL with a real resource. The plugin reads the first matching parameter and starts once input handlers are available; `app.ready` does not wait for this background import to finish.

Remote transports accept only HTTP/HTTPS. Cross-origin resources require CORS permission. URL and query imports share timeout and response-size checks; these limits do not apply to your own `fetch` calls or local file input. Cancelling a batch or timing out does not remove already committed entries.

The file picker's accepted formats follow installed input handlers. File and drop batches process files sequentially, so importing a matching GPX before a JPEG matters for inference.

## Control placement

The layer, settings, elevation, file input, and URL input launchers, and the three toolbar-based `x-*` tools, support `position`, `priority`, `edgePolicy`, and `rank`. Status and base-map selector controls support placement options directly, but do not use toolbar `rank`.

| Option | Values / meaning |
| --- | --- |
| `position` | Leaflet control corner: `topleft`, `topright`, `bottomleft`, or `bottomright` |
| `priority` | `low`, `normal`, or `high` |
| `edgePolicy` | `yield` or `keep`; unset derives from priority (high keeps, others yield) |
| `rank` | Toolbar contribution ordering value; default `0` |

Built-in launchers default to `topleft`; the base-map selector defaults to `topright` and status to `bottomleft`. File import defaults to high priority; the other built-in launchers default to normal. The status implementation's priority defaults to normal. Configure each contributing plugin rather than the toolbar host:

```js
pluginOptions: {
  "tilia-file-import": { position: "topright", rank: 0 },
  "tilia-layers": { position: "topright", rank: 10 },
  "tilia-status": { position: "bottomleft", priority: "low" },
}
```

This fragment belongs inside the factory's options object. Data, renderer, UI contribution, panel, toolbar, and drop plugins do not use these launcher settings.

## Base maps

The factory provides OpenStreetMap by default. Add `tilia-base-maps-control` for a selector and the GSI/OpenTopoMap plugins to offer more providers. Registration alone does not switch away from the current map. Tile requests need access to the provider.

Set the initial map through the factory's `baseMapOptions`. For a custom map, provide a complete definition with a URL and appropriate attribution:

```js
const app = createDefaultTiliaApp("map", {
  baseMapOptions: {
    center: [35.681236, 139.767125],
    zoom: 10,
    // Default OpenStreetMap definition is retained here.
  },
  plugins: ["tilia-base-maps-control", "x-gsi-base-maps"],
  baseLayerOverrides: {
    "gsi-pale": { visibleInSelector: false },
  },
});
await app.ready;
```

`baseMapOptions` also supports `mapOptions`, `tileUrl`, `tileOptions`, `baseLayers`, and `selectedBaseLayerId`. Initial selection must reference a definition available during map construction; provider plugins register later. `baseLayerOverrides` merges by definition ID and can override metadata/options, including `visibleInSelector`. Plugins register and select definitions through guarded `context.baseMaps`; the application does not expose an `app.baseMaps` API.

## Track Editor and GPX export

Add `x-track-editor` and/or `x-gpx-export` to a GPX viewer. Both install their panel, toolbar, and GPX domain dependencies; input and rendering remain separate choices.

**Track Editor:** choose a GPX entry, select **Start Edit**, then click a draft track segment to edit nearby points. Moving, inserting, deleting, inspector edits, Undo/Redo, and rectangle selection operate on an independent draft. **Save Copy** creates a new GPX entry named with ` (edited)`; **Cancel** discards the draft and releases temporary source display suppression. Neither action restores or recreates the source. Source changes/deletion or GPX renderer removal do not terminate editing or block Save Copy. App/editor disposal ends the session.

Only track points are editable; routes and waypoints are excluded from the saved copy. The `editablePointRadius` option defaults to `100` and controls the number of points on either side of the clicked point, not a distance in meters. A nonnegative integer is supported; the vendor helper also accepts `Infinity`. See the [Track Editor guide](../plugins/x-track-editor/README.md) for the full workflow and limitations.

**GPX export:** open **GPX export**, choose an entry, and select **Export GPX** to download it. The `creator` option defaults to `"Tilia"` and sets the serialized GPX creator. To export an edited draft, save it as a copy first, then choose the resulting entry in the export tool.

## Route search

`x-route-search` requires a separately running Phloem-compatible `POST /route` service. It provides a floating search form; it does not require `tilia-panel`. Include `tilia-gpx-renderer` to display imported routes as GPX tracks, and `tilia-gpx-ui` plus selection presentation for their feature popups.

| Option | Default | Meaning |
| --- | --- | --- |
| `endpoint` | `"http://127.0.0.1:3000/route"` | Full routing request URL |
| `apiKey` | `""` | Optional API key sent in the request |
| `timeoutMs` | `5000` | Positive request timeout in milliseconds |
| `importLimit` | `3` | Positive values are floored and clamped to 1–3; otherwise defaults to 3 |
| `defaultProfile` | `"car"` | Initial profile: `car`, `bike`, or `foot` |
| `profileOptions` | All three profiles | Offered profile IDs; unknown IDs are filtered out |

Configure `endpoint` for your service rather than relying on the localhost default in a deployed page. Cross-origin access needs server CORS support; an HTTPS page also needs a browser-accessible endpoint compatible with its security policy.

Open **Route search**, choose a profile, set Start/Goal and optional Via points, then run the search. Each imported result is a new GPX Track entry with Start/Via/Goal Waypoints. See the [client](../plugins/x-route-search/client.js) and [request/response helpers](../plugins/x-route-search/helpers.js) for the actual service contract.

## Distance milestones

`x-milestone` shows distance labels on GPX tracks. Labels respond to zoom and track visibility, respect temporary editor suppression, and disappear with their entry or plugin. No renderer dependency is declared; include `tilia-gpx-renderer` if you also want track lines.

| Option | Default / meaning |
| --- | --- |
| `formatLabel` | Function receiving distance in meters; default displays meters or kilometers |
| `intervalDefinition` | Complete object with `mapping`, `minZoom`, `maxZoom`, `maxNumberOfSigns`, and `minIntervalMeters`; replaces the default object |

The default definition has `minZoom: 5`, `maxZoom: 20`, `maxNumberOfSigns: 100`, and `minIntervalMeters: 100`. Its zoom-to-meter mapping is: 5→400000, 6→300000, 7→200000, 8–9→100000, 10–11→50000, 12–13→20000, 14–15→10000, 16–17→2000, 18–19→1000. Zoom 20 and above use the minimum interval. The sign-count setting selects coarser spacing where possible; it is not a strict marker-count cap.

For a custom definition, supply integer zoom bounds with `maxZoom > minZoom`, a positive integer sign count, a positive finite minimum interval, and an object of positive finite mapping values. See the [implementation](../plugins/x-milestone/loader.js).

## Initial view

`tilia-initial-view` is experimental independently of Tilia’s overall alpha status.

Enable `"tilia-initial-view"` in `plugins` to read `tilia.c=lat,lng,zoom`, `tilia.c=lat,lng`, `tilia.c=locate`, or `tilia.c=locate,zoom` from the page URL's query string. Omitted zoom preserves the zoom at application time. The first duplicate parameter is used; invalid values are ignored. Validation covers geographical coordinates, the CRS projection latitude limit, `maxBounds`, and current map min/max zoom. Fractional zoom follows Leaflet's `zoomSnap`.

Only `locate` requests browser geolocation, once, with a 15-second timeout. A secure context (normally HTTPS or localhost) and permission are required. Failure preserves the view. Map input or any map movement while pending discards the result; callbacks after destruction are ignored. There is no tracking, marker, button, or URL synchronization.

Enable `"tilia-status"` separately for the existing status display. Its public API only supports `set(text)`, so starting, completing, or canceling location may overwrite another operation's message; this is an accepted experimental limitation. Uninstalling initial-view while pending can leave its message visible because its service access is revoked during disposal.

GPX automatic `fitBounds` is unchanged. A fit that starts while location is pending discards the location result. GPX loaded after explicit coordinates or a successful location can still replace that view. This plugin does not guarantee a final view over later imports. When `tilia.c` (explicit coordinates or `locate`) is used together with `gpx` or other parameters that automatically adjust the map view, the final view may vary depending on the order of asynchronous operations and is not guaranteed. This combination is allowed and does not cause GPX loading to be rejected.

## Custom plugins and lifecycle

Built-in IDs reserve the `tilia-` namespace. Custom IDs use lower kebab case with a vendor or experimental prefix, such as `acme-overlay` or `x-overlay`.

For the standard layout, install by ID with `await app.use("x-my-plugin")`. Direct-definition installation remains available:

```js
const { default: plugin } = await import("./plugins/x-my-plugin/loader.js");
await app.use(plugin);
```

The path above illustrates your own plugin file. In the standard layout, `plugins/<id>/loader.js` is discoverable by ID: use `await app.use("x-my-plugin")` or a startup ID entry. Do not add third-party plugins to `src/builtins.js`. The sibling `src/` and `plugins/` layout is fixed and the directory is not configurable. Use direct definitions or explicit application catalogs for nonstandard locations. The application `builtins` option replaces the complete catalog and may include third-party IDs.

Setup receives a guarded PluginContext rather than the app. Register services, domains, renderers, UI contributions, and base maps through its typed capabilities. Own listeners, layers, controls, previews, styles, and asynchronous effects through the context's Scope and resource handles. Setup returns only `undefined`, a cleanup function, or `{dispose}`; it does not return a service API. Do not call application installation/removal/destruction from setup or cleanup.

For atomic installation, failure rollback, removal constraints, and cleanup behavior, read [Plugin operations](PLUGIN-OPERATIONS.md). Application destruction is terminal: repeated calls retain the same completion, including failure, and successful cleanup permits a new app on the surviving container. Plugins execute as normal page code and are not sandboxed.
