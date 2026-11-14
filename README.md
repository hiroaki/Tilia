[日本語](README.ja.md)

# Tilia

Tilia is an extensible framework for building interactive maps and geospatial applications on the web. It is built on [Leaflet 2](https://leafletjs.com/) and basically works with static files alone.

> Early alpha — APIs and behavior may change without notice.

## Overview

Use Tilia as a standalone viewer, embed maps in a blog or CMS, or build a custom map application. Its small runtime and optional plugins let you choose the data formats, visualizations, and controls your application needs. Multiple independent maps can also coexist on one page.

- **Supported formats:** GPX and JPEG (EXIF). GPX tracks (`<trk>`), routes (`<rte>`), and waypoints (`<wpt>`) are drawn as polylines and markers, and JPEG photos appear as markers at their EXIF GPS coordinates. For a photo without GPS coordinates, Tilia can infer a location from matching GPX timestamps.
- **Layer panel:** enable a plugin to get a ready-made panel that shows or hides each loaded data set as a layer. No UI code of your own is needed, though you can also build a custom UI with the public API.
- **Flexible input:** load files from your application, or add file picker, URL, query parameter, and drag-and-drop input.
- **Extensible:** add features with plugins; examples include distance labels and track editing.
- **No build step:** use browser ES modules and built-in or custom plugins directly.

Try the [live samples](https://hiroaki.github.io/Tilia/samples/).

## Quick start

Clone or download this repository and serve its root with any static HTTP server.

If Node.js is available, you can use the bundled script without `npm install`. It serves the repository at `http://127.0.0.1:8010`; to use another port, pass it as in `npm run serve -- 3000`:

```bash
npm run serve
```

Alternatively, with Python for example:

```bash
python3 -m http.server 8010
```

Open `/samples/` on the running server (for example <http://127.0.0.1:8010/samples/>) and choose a viewer or embed example. Serve pages over HTTP/HTTPS: Tilia is made of ES modules, which browsers do not load through `file://`.

## Basic usage

### Show a map

Save the following HTML as `example.html` in the repository root and open it in a browser through your HTTP server.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tilia map</title>
  <link rel="stylesheet" href="./src/map/vendor/leaflet/2.0.0-beta.1/leaflet.css" />
  <script type="importmap">
  {
    "imports": {
      "leaflet": "./src/map/vendor/leaflet/2.0.0-beta.1/leaflet.js"
    }
  }
  </script>
</head>
<body>
  <div id="map" style="height: 400px;"></div>
  <script type="module">
    import { createDefaultTiliaApp } from "./src/index.js";

    const app = createDefaultTiliaApp("map");
    await app.ready;
  </script>
</body>
</html>
```

`createDefaultTiliaApp` accepts an existing element or its ID. Give the container a height. This displays a map on the page. Without any plugins, though, it only displays the map and cannot load data such as GPX or photos.

### Add plugins

Choose plugins with the `plugins` option. The following are three typical combinations.

#### Embed a GPX map

Edit `example.html` and replace the module script with the following to enable GPX loading and drawing:

```js
import { createDefaultTiliaApp } from "./src/index.js";

const app = createDefaultTiliaApp("map", {
  plugins: ["tilia-gpx-input", "tilia-gpx-renderer"],
});
await app.ready;

// Then load a GPX file with app.load(file). See the embed sample.
```

The [embed sample](samples/embed/index.html) includes complete examples that load files from URLs. This approach suits reusable templates such as those for a CMS.

#### Build a viewer that loads user files

To let users choose the data to display, add the input plugins:

```js
import { createDefaultTiliaApp } from "./src/index.js";

const app = createDefaultTiliaApp("map", {
  plugins: [
    "tilia-gpx-input", "tilia-gpx-renderer",
    "tilia-file-import", "tilia-url-import", "tilia-dropzone",
  ],
});
await app.ready;
```

This adds a control that opens a file picker and a control that opens a remote file URL form to the map, and also enables drag and drop onto the whole map. When you enter a remote URL, the server hosting the file must allow cross-origin requests.

See the [viewer sample](samples/viewer/index.html) for a complete example.

#### Add photos or viewer controls

Add the photo plugins to display JPEG files.

Add the corresponding UI plugins for popups, the layer panel, elevation, and settings.

The following example adds the photo and popup plugins to the previous example:

```js
import { createDefaultTiliaApp } from "./src/index.js";

const app = createDefaultTiliaApp("map", {
  plugins: [
    // GPX
    "tilia-gpx-input", "tilia-gpx-renderer", "tilia-gpx-ui",
    // JPEG photos
    "tilia-jpeg-input", "tilia-photo-renderer", "tilia-photo-ui",
    // Selection highlight (popup display)
    "tilia-map-selection-presenter",
    // User input
    "tilia-file-import", "tilia-url-import", "tilia-dropzone",
    // More plugins, such as the layer panel, elevation, and settings, can be added. See the plugin guide.
  ],
});
await app.ready;
```

See the [Tilia plugin guide](docs/PLUGINS.md#photos) for all plugins, combinations, and settings.

## Plugins

Choose plugins by the features your application needs:

| Feature group | Capabilities |
| --- | --- |
| GPX and photos | Data loading, map rendering, and format-specific UI |
| Viewer controls | Selection popups and highlights, layers, elevation, settings, and status |
| Input | File picker, remote URL, query parameter, and map-wide drag and drop |
| Base maps | Map selector and optional GSI and OpenTopoMap providers |
| Additional tools | Track editor, GPX export, route search, and distance markers for the selected track |

The [Tilia plugin guide](docs/PLUGINS.md) lists all plugins, their dependencies, settings, and usage. For custom plugins and installation/cleanup contracts, see [Developing Tilia plugins](docs/PLUGIN-OPERATIONS.md). The [Tilia architecture](docs/ARCHITECTURE.md) explains the design principles and component lifetimes. For the public API, errors, and the app lifecycle, see the [Tilia API reference](docs/API.md).

## Deployment

Serve the HTML page that hosts your map, together with the Tilia components it uses (`src/` and `plugins/`), from static hosting. Keep `src/` and `plugins/` side by side in the same parent directory, and adjust your page's import map, CSS, and `src/index.js` paths to match. No bundler, build step, or npm installation is required.

## Trust model

Tilia runs in the browser. Plugins execute as normal page JavaScript; only load code you trust. Remote loading depends on the server's CORS policy and fails without the appropriate permission.

## Contributing

Bug reports, documentation fixes, and feature contributions are welcome.

- Discuss larger behavior changes or new features in [Discussions](https://github.com/hiroaki/Tilia/discussions) first.
- Keep each pull request focused on one concern and target the `develop` branch.
- Make sure the tests pass before submitting changes.
- Contributions are provided under the project's license.

See [Tilia development](docs/DEVELOPMENT.md) for test commands and local verification.

## License

Tilia is licensed under the [0BSD license](LICENSE).
