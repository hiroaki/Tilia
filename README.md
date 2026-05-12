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

```bash
cd Tilia
ruby -run -e httpd . -p 8010
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
  import { createDefaultTiliaApp } from "./Tilia/src/index.js";

  const app = createDefaultTiliaApp("mymap");

  const res  = await fetch("./my-track.gpx");
  const blob = await res.blob();
  app.load(new File([blob], "my-track.gpx", { type: blob.type }));
</script>
```

Multiple independent map instances can coexist on a single page. Driving them from `data-*` attributes makes the same template reusable in a CMS. See [`samples/embed/index.html`](samples/embed/index.html) for a example.

### Add viewer controls

Pass a `plugins` list to enable UI controls, the layer panel, elevation chart, and more.

```html
<div id="map" style="height: 100vh;"></div>

<script type="module">
  import { createDefaultTiliaApp } from "./Tilia/src/index.js";

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
</script>
```

See [docs/API.md](docs/API.md) for the full runtime API and plugin authoring guide.


## Built-in plugins

All built-in plugin IDs are prefixed with `tilia-`. Third-party plugins use a vendor or `x-` prefix and are placed at `Tilia/plugins/<plugin-id>/loader.js`.

| ID | Requires | Description |
|----|----------|-------------|
| `tilia-panel` | — | Side panel container; required by layers, elevation, and settings |
| `tilia-status` | — | Status bar inside the panel |
| `tilia-layers` | `tilia-panel`, `tilia-status` | Layer list with visibility toggle, delete, fit-to-view, and per-photo time mode |
| `tilia-elevation` | `tilia-panel`, `tilia-status` | Interactive elevation profile chart for GPX tracks |
| `tilia-file-import` | — | File picker map control; accepts `.gpx` and `.jpg`/`.jpeg` |
| `tilia-url-import` | — | URL input map control; HTTP/HTTPS only (CORS required on the server) |
| `tilia-settings` | `tilia-panel`, `tilia-status` | Default photo timestamp interpretation mode (Local / JST / UTC) |
| `tilia-dropzone` | — | Drag-and-drop target covering the entire map area |

Third-party and custom plugins can be added via `app.use()`. No build tools are required to use or create plugins. See [docs/API.md](docs/API.md).


## Deployment

Copy the `Tilia/` directory to any static hosting service as-is. No bundler or build step is needed.

Required contents: `src` is mandatory. If needed, place `plugins` in the same directory.

External dependencies are loaded from CDN via an importmap — an internet connection is required:
- [Leaflet 2.0.0-alpha.1](https://unpkg.com/leaflet@2.0.0-alpha.1/) (unpkg)
- [exifr 7.1.3](https://cdn.jsdelivr.net/npm/exifr@7.1.3/) (jsDelivr)


## License

This project is licensed under the 0BSD license. See [LICENSE](LICENSE).
