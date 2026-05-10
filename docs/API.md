**[Japanese 日本語版 API リファレンス](API.ja.md)**

# Tilia API Reference

The primary entry point for most use cases is [`createDefaultTiliaApp()`](#createdefaulttiliaappcontainer-options).


## Factory Functions

### `createDefaultTiliaApp(container, options?)`

Creates a Leaflet base map and attaches a Tilia app runtime in one step. This is the recommended entry point for the majority of use cases.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `container` | `string \| HTMLElement` | Map container element or its `id` |
| `options` | `object?` | See below |

**Options**

| Name | Type | Description |
|------|------|-------------|
| `plugins` | `Array?` | Plugin list to install at startup (string IDs, plugin objects, or `[plugin, options]` tuples) |
| `pluginOptions` | `object?` | Per-plugin option map keyed by plugin ID |
| `pluginUrls` | `object?` | Override loader paths for specific IDs: `{ "x-my-plugin": "./path/loader.js" }` |
| `pluginLoader` | `function?` | Fully custom async loader: `async (pluginId) => pluginModule` |
| `baseMapOptions` | `object?` | Passed to `createBaseMap()` (see below) |
| `defaultPhotoTimeMode` | `"local" \| "jst" \| "utc"` | Default EXIF timestamp interpretation mode for newly loaded photos (default: `"local"`) |

**Returns** a [Tilia app instance](#app-instance-api).

**Example**

```js
import { createDefaultTiliaApp } from "./Tilia/src/index.js";

const app = createDefaultTiliaApp("map", {
  plugins: [
    "tilia-panel",
    "tilia-status",
    "tilia-layers",
  ],
});

// Wait for startup plugins to finish (only needed for advanced chaining)
await app.whenReady();
app.load(myGpxFile);
```

### `createBaseMap(container, options?)`

Initializes a Leaflet map with an OpenStreetMap tile layer. Called internally by `createDefaultTiliaApp()`, but available for advanced setups.

**Options**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `center` | `[lat, lng]` | `[35.681236, 139.767125]` | Initial map center (Tokyo Station) |
| `zoom` | `number` | `10` | Initial zoom level |
| `tileUrl` | `string` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Custom tile URL template |
| `tileOptions` | `object` | — | Leaflet `TileLayer` options (e.g., `attribution`, `maxZoom`) |
| `mapOptions` | `object` | — | Leaflet `Map` constructor options |

**Returns** `{ map: L.Map, tileLayer: L.TileLayer }`

### `createTiliaApp({ map, ...options })`

Low-level factory for callers that already own a Leaflet map instance. Accepts the same options as `createDefaultTiliaApp()` (except `baseMapOptions`), plus:

| Name | Type | Description |
|------|------|-------------|
| `map` | `L.Map` | **Required.** Existing Leaflet map to attach to |
| `tileLayer` | `L.TileLayer?` | Base tile layer to associate with this app |


## App Instance API

All properties and methods below are available on the object returned by `createDefaultTiliaApp()` or `createTiliaApp()`.

### Plugin lifecycle

#### `app.use(pluginOrId, options?) → Promise<pluginApi>`

Installs a plugin. The first argument may be:

- A **string ID** — resolves a built-in, or dynamically imports from `Tilia/plugins/<id>/loader.js`
- A **plugin object** with `{ id, setup }` (see [Authoring Plugins](#authoring-plugins))

Calling `use()` on an already-installed plugin returns the existing API without reinstalling.

#### `app.unuse(pluginOrId) → Promise<pluginApi>`

Removes a plugin and calls its `destroy()` method if defined. Returns the plugin's API object.

#### `app.ready → Promise<app>`

Resolves once all plugins listed in `options.plugins` have finished installing.

#### `app.whenReady() → Promise<app>`

Returns `app.ready`. Convenient for chaining after startup:

```js
const app = createDefaultTiliaApp("map", { plugins: [...] });
app.whenReady().then(() => app.load(myFile));
```

### Map access

| Member | Returns | Description |
|--------|---------|-------------|
| `app.map` | `L.Map` | The underlying Leaflet map instance |
| `getMap()` | `L.Map` | Same as `app.map` |
| `getBaseLayer()` | `L.TileLayer` | The base tile layer |
| `getBaseMap()` | `{ map, tileLayer }` | Both |

### Data loading

#### `app.load(input) → Promise`

Processes one GPX file or JPEG image. `input` may be a `File`, a URL string, or an equivalent object accepted by the registered input handlers.

**GPX files** (`.gpx`):
- Draws the track as a polyline on the map
- Places a marker for each waypoint (`<wpt>` element)
- Parses elevation (`<ele>`) and timestamp (`<time>`) per track point
- Automatically fits the map view to the loaded layer

**JPEG files** (`.jpg`, `.jpeg`):
- Location is determined in this order:
  1. **EXIF GPS** — used directly when present
  2. **GPX timestamp interpolation** — when EXIF GPS is absent, the EXIF capture timestamp is interpolated against the timeline of all loaded GPX tracks
  3. **Error** — thrown when neither GPS nor a usable timestamp is available in EXIF
- The timestamp is interpreted according to the current photo time mode (`"local"`, `"jst"`, or `"utc"`)

> **Note:** GPX routes (`<rte>`) are not currently parsed. Only tracks (`<trk>`) and waypoints (`<wpt>`) are supported.

### Plugin utilities

#### `app.subscribeInteractions(handlers) → unsubscribeFn`

Subscribe to events triggered when GPX layers and photo markers are added to the map. Called once for each existing entry when first subscribing, then for each new entry as it is loaded. Returns an unsubscribe function.

```js
const unsub = app.subscribeInteractions({
  // Called for each GPX track layer
  onTrackLayer({ entry, layer }) { /* layer is a Leaflet Polyline */ },

  // Called for each GPX waypoint marker
  onWaypointLayer({ entry, layer, waypoint }) { /* layer is a Leaflet Marker */ },

  // Called for each photo marker
  onPhotoMarker({ entry, layer }) { /* layer is a Leaflet Marker */ },
});

// Unsubscribe when done:
unsub();
```

#### `app.provide(name, service)`

Registers a named shared service so other plugins can access it via `app.services[name]`.

#### `app.addRefreshHandler(fn) → unsubscribeFn`

Registers a callback that fires whenever `app.refreshView()` is called (e.g., after a layer is added or removed). Returns an unsubscribe function.

#### `app.refreshView()`

Triggers all registered refresh handlers.

#### `app.setStatus(text)`

Updates the status bar text when `tilia-status` is installed. No-ops otherwise.

#### `app.setError(error)`

Records an error into the app state (`app.state.lastError`).

### State and services

| Property | Type | Description |
|----------|------|-------------|
| `app.state` | `object` | Runtime state: `entries` (loaded layers), `sources`, `layers`, `lastError` |
| `app.services` | `object` | Shared services published by plugins, keyed by plugin ID |
| `app.plugins` | `Map` | Registry of installed plugins, keyed by plugin ID |


## Built-In Plugins

Install by passing a string ID to `app.use()`, or by listing in `options.plugins`.

| ID | Requires | Description |
|----|----------|-------------|
| `tilia-panel` | — | Side panel container rendered inside the map area; used by layers, elevation, and settings plugins |
| `tilia-status` | — | Status bar in the bottom-left corner of the map; shows load results and errors |
| `tilia-layers` | `tilia-panel`, `tilia-status` | Layer list in the side panel; per-entry controls for visibility, delete, fit-to-view, and (for inferred-location photos) timestamp mode override |
| `tilia-elevation` | `tilia-panel`, `tilia-status` | Interactive elevation profile chart in the side panel; hover highlights the corresponding track point on the map |
| `tilia-file-import` | — | Map control (top-left) with a file picker; accepts `.gpx`, `.jpg`, `.jpeg`; supports multiple files at once |
| `tilia-url-import` | — | Map control that opens a URL input; fetches via HTTP/HTTPS with CORS; filename inferred from `Content-Disposition` or the URL path |
| `tilia-settings` | `tilia-panel`, `tilia-status` | Settings panel with a single control: the default photo timestamp interpretation mode applied to newly loaded photos |
| `tilia-dropzone` | — | Makes the entire map container a drag-and-drop target; visual highlight shown during drag |

### Photo timestamp interpretation modes

| Mode | Behaviour |
|------|-----------|
| `local` | Treats the EXIF timestamp as the device's local wall-clock time (no timezone conversion). This is the default. |
| `jst` | Treats the EXIF timestamp as Japan Standard Time (UTC+9) regardless of the device locale. |
| `utc` | Treats the EXIF timestamp as UTC. |

> **Dependency order matters.** Install `tilia-panel` and `tilia-status` before any plugin that lists them in `requires`. When using `options.plugins`, list them first — the array order is preserved.

**Example**

```js
// Explicit, sequential install
await app.use("tilia-panel");
await app.use("tilia-status");
await app.use("tilia-layers");   // OK: dependencies already installed

// Declarative (recommended for startup)
createDefaultTiliaApp("map", {
  plugins: [
    "tilia-panel",
    "tilia-status",
    "tilia-layers",
    "tilia-elevation",
    "tilia-file-import",
    "tilia-url-import",
    "tilia-settings",
    "tilia-dropzone",
  ],
});
```


## Authoring Plugins

A plugin is a plain object with `id` and `setup`:

```js
const myPlugin = {
  id: "x-my-plugin",           // lower-kebab-case, vendor-prefixed
  requires: ["tilia-status"],   // optional: IDs of plugins that must be installed first

  setup(app, options) {
    const control = app.ui.installMapControl({
      map: app.map,
      position: "topright",
      className: "my-plugin-control",
      createContent() {
        const panel = app.ui.createPanel();
        const button = app.ui.createButton("M");
        button.addEventListener("click", () => {
          app.setStatus("My plugin was clicked");
        });
        panel.appendChild(button);
        return panel;
      },
    });

    // Return an API object. Implement destroy() for cleanup when app.unuse() is called.
    return {
      doSomething() { /* ... */ },
      destroy() {
        control.remove?.();
      },
    };

    // Alternatively, return a plain cleanup function:
    // return () => { control.remove?.(); };
  },
};

await app.use(myPlugin);
```

### Plugin ID rules

- Must be `lower-kebab-case` (only lowercase letters, digits, and hyphens)
- `tilia-` prefix is **reserved** for built-in plugins
- Third-party IDs must include at least one hyphen (use a vendor prefix or `x-` for experiments)
- Examples: `x-milestone`, `acme-heatmap`, `myco-tracker`

### Dynamic loading

String IDs are resolved by default from `Tilia/plugins/<plugin-id>/loader.js`:

```
Tilia/
  plugins/
    x-milestone/
      loader.js   ← must export a default plugin object,
                     or a named export whose id matches the plugin ID
```

**Override a specific URL:**

```js
createDefaultTiliaApp("map", {
  pluginUrls: {
    "x-milestone": "./custom-plugins/x-milestone/loader.js",
  },
});
```

**Fully custom loader:**

```js
createTiliaApp({
  map,
  pluginLoader: async (pluginId) => {
    return import(`/plugins/${pluginId}/index.js`);
  },
});
```

### Available API inside `setup(app, options)`

```js
// Install a native Leaflet map control that wraps your content
app.ui.installMapControl({ map, position, className, createContent })

// Create common UI elements
app.ui.createPanel()               // returns a styled <div>
app.ui.createButton(label)         // returns a <button>
app.ui.createSelect(optionValues, onChange)  // returns a <select>

// Subscribe to track / waypoint / photo events (returns unsubscribe fn)
app.subscribeInteractions({ onTrackLayer, onWaypointLayer, onPhotoMarker })

// Register a view refresh callback (returns unsubscribe fn)
app.addRefreshHandler(fn)

// Trigger all refresh callbacks (call after mutating data)
app.refreshView()

// Publish a named service for other plugins
app.provide(name, service)

// Read services published by other plugins
app.services["tilia-panel"]   // { openPanel, closePanel, togglePanel, rerenderPanel, isOpen }
app.services["tilia-status"]  // { setStatus }
```


## Samples

| Sample | Path |
|--------|------|
| Full viewer | [`samples/viewer/index.html`](../samples/viewer/index.html) |
| Embed gallery | [`samples/embed/index.html`](../samples/embed/index.html) |
| Third-party plugin example | [`plugins/x-milestone/loader.js`](../plugins/x-milestone/loader.js) |
