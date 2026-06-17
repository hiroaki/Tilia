**[Japanese 日本語版 README](README.ja.md)**

# Tilia

A JavaScript library for putting geospatial data on a [Leaflet 2](https://leafletjs.com/) map.
Spiritual successor to [maps.gpx](https://github.com/hiroaki/maps.gpx).

> Early alpha — APIs and behavior may change without notice.


## Overview

Tilia provides a lightweight runtime and a plugin system that makes it straightforward to add an interactive map to any web page, whether as a self-contained viewer, an embedded map inside a blog or CMS, or as the foundation of a custom map application.

Functionality is provided by plugins. The core runtime is intentionally small; plugins handle data loading, UI controls, and visualization. You can use the built-in plugins, load third-party ones, or write your own.

A live demo is available here: [https://hiroaki.github.io/Tilia/samples/](https://hiroaki.github.io/Tilia/samples/)


## Quick start

A local HTTP server is required. Direct `file://` access is blocked by browser security restrictions.

You can use any simple static server from the repository root. For example:

```bash
python3 -m http.server 8010
```

```bash
ruby -run -e httpd . -p 8010
```

```bash
npm run serve -- 8010
```

Open the ready-made viewer:

```
http://localhost:8010/samples/viewer/index.html
```


## Usage

### Leaflet setup

To use Tilia, you must load Leaflet's JavaScript and CSS on your page. If you want to use EXIF metadata from image files, also load exifr.

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@2.0.0-alpha.1/dist/leaflet.css" />
<script type="importmap">
{ "imports": {
  "leaflet": "https://unpkg.com/leaflet@2.0.0-alpha.1/dist/leaflet.js",
  "exifr":   "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.js"
} }
</script>
```

All following code samples assume this setup is already present and only show the Tilia-specific part.

### Embed a map in a page

Add a `<div>` for the map and a short module script. No viewer controls are needed for a simple embedded map — just load the data directly.

```html
<div id="mymap" style="height: 300px;"></div>

<script type="module">
  import { createDefaultTiliaApp } from "./src/index.js";

  const app = createDefaultTiliaApp("mymap");

  const res  = await fetch("./my-track.gpx");
  const blob = await res.blob();
  app.load(new File([blob], "my-track.gpx", { type: blob.type }));
</script>
```

Multiple independent map instances can coexist on a single page. Driving them from `data-*` attributes makes the same template reusable in a CMS. See [`samples/embed/index.html`](samples/embed/index.html) for an example.

When a published embed infers photo locations from GPX timestamps, prefer an explicit photo time mode instead of relying on the default `auto` behavior. `auto` uses the viewer's environment (`local` or `utc`), so a card that looks correct in one timezone may fail to place a marker for viewers in another timezone. For stable public output, use `utc` or a fixed offset such as `+09:00`.

### Add viewer controls

Pass a `plugins` list to enable UI controls, the layer panel, elevation chart, and more.

```html
<div id="map" style="height: 100vh;"></div>

<script type="module">
  import { createDefaultTiliaApp } from "./src/index.js";

  createDefaultTiliaApp("map", {
    plugins: [
      "tilia-panel",
      "tilia-status",
      "tilia-base-maps-control",
      "tilia-layers",
      "tilia-elevation",
      "tilia-file-import",
      "tilia-url-import",
      "tilia-settings",
      "tilia-dropzone",
      "x-gsi-base-maps",
      "x-opentopomap-base-maps",
    ],
  });
</script>
```

See [docs/API.md](docs/API.md) for the full runtime API and plugin authoring guide.


## Plugins

All built-in plugin IDs are prefixed with `tilia-`. Third-party plugins use a vendor or `x-` prefix and are placed at `plugins/<plugin-id>/loader.js`.

The current plugin loading, dependency-order, and dynamic-loading contract is summarized in [docs/PLUGIN-OPERATIONS.md](docs/PLUGIN-OPERATIONS.md).

| ID | Requires | Description |
|----|----------|-------------|
| `tilia-panel` | — | Side panel container; required by layers, elevation, and settings |
| `tilia-status` | — | Status bar inside the panel |
| `tilia-base-maps-control` | — | Base map selector control; lists visible entries from `app.baseMaps` |
| `tilia-layers` | `tilia-panel`, `tilia-status` | Layer list with visibility toggle, delete, fit-to-view, and per-photo time mode |
| `tilia-elevation` | `tilia-panel`, `tilia-status` | Interactive elevation profile chart for GPX tracks |
| `tilia-file-import` | — | File picker map control; accepts `.gpx` and `.jpg`/`.jpeg` |
| `tilia-url-import` | — | URL input map control; HTTP/HTTPS only (CORS required on the server), with configurable timeout and size guardrails |
| `tilia-settings` | `tilia-panel`, `tilia-status` | Default photo timestamp interpretation mode (Auto / Local / UTC / Custom offset) |
| `tilia-dropzone` | — | Drag-and-drop target covering the entire map area |

The repository also includes optional third-party style plugins under `plugins/`:

| ID | Requires | Description |
|----|----------|-------------|
| `x-track-editor` | `tilia-panel`, `tilia-status` | Creates a working copy of a GPX layer, edits track points, and saves the edited result as a new layer |
| `x-gpx-export` | `tilia-panel`, `tilia-status` | Exports a selected GPX layer to a local `.gpx` file |
| `x-route-search` | `tilia-status` | Opens a left-side route search form, queries Phloem `POST /route`, and imports returned routes as new GPX-like layers |

Third-party and custom plugins can be added via `app.use()`. No build tools are required to use or create plugins. See [docs/API.md](docs/API.md).


## Deployment

Copy this repository's root contents to any static hosting service as-is. No bundler or build step is needed.

Required contents: `src` is mandatory. If needed, place `plugins` in the same directory.

External dependencies are loaded from CDN via an importmap — an internet connection is required:
- [Leaflet 2.0.0-alpha.1](https://unpkg.com/leaflet@2.0.0-alpha.1/) (unpkg)
- [exifr 7.1.3](https://cdn.jsdelivr.net/npm/exifr@7.1.3/) (jsDelivr)


## Trust model

Tilia runs entirely in the browser and does not sandbox remote code or content.

- Third-party plugins loaded via `app.use("plugin-id")` or a custom `pluginLoader` execute as normal page JavaScript. Only load plugins you trust.
- `tilia-url-import` plugin fetches remote GPX data over HTTP/HTTPS and still depends on the target server's CORS policy. Treat remote URLs as untrusted input and expect failures.
- CDN-hosted dependencies are part of the runtime trust boundary. Pin versions deliberately and review changes before updating them.


## Contributing

Bug reports, documentation fixes, and feature contributions are welcome. If you want to contribute, please follow these guidelines.

- For larger behavior changes or new features, start the conversation in [Discussions](https://github.com/hiroaki/Tilia/discussions) first.
- Keep pull requests focused on a single concern.
- Target the `develop` branch when opening a pull request.
- Make sure the tests pass before submitting changes.
- By contributing, you agree that your contribution will be provided under the same license as this project.

For repository-specific development workflows, test commands, and local verification steps, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).


## License

This project is licensed under the 0BSD license. See [LICENSE](LICENSE).
