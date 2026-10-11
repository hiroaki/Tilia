[日本語](README.ja.md)

# Tilia

A JavaScript library for displaying GPX tracks, routes, waypoints, and JPEG photos on a [Leaflet 2](https://leafletjs.com/) map. Spiritual successor to [maps.gpx](https://github.com/hiroaki/maps.gpx).

> Early alpha — APIs and behavior may change without notice.

## Overview

Use Tilia as a standalone viewer, embed maps in a blog or CMS, or build a custom map application. Its small runtime and optional plugins let you choose the data formats, visualizations, and controls your application needs. Multiple independent maps can coexist on one page.

- **GPX display:** recorded tracks (`<trk>`), planned routes (`<rte>`), and standalone waypoints (`<wpt>`) remain distinct feature types.
- **Photo maps:** show JPEG photos at their EXIF GPS coordinates, or infer locations from matching GPX timestamps when suitable data is available.
- **Interactive viewing:** add selection popups, highlights, layer visibility controls, elevation profiles, and per-entry settings.
- **Flexible input:** load files from your application, or add file picker, URL, query parameter, and drag-and-drop input.
- **Optional tools:** edit tracks into new copies, export GPX, search routes through a routing service, and show distance labels.
- **No build step:** use browser ES modules and built-in or custom plugins directly.

Try the [live samples](https://hiroaki.github.io/Tilia/samples/).

## Quick start

Clone or download this repository, then start a static HTTP server from its root:

```bash
python3 -m http.server 8010
```

Alternatively, use `ruby -run -e httpd . -p 8010`, or run `npm run serve -- 8010` with Node.js installed.

Open [the sample index](http://localhost:8010/samples/) and choose a viewer or embed example. Serve pages over HTTP/HTTPS; opening them through `file://` does not support the module and fetch workflow.

## Basic usage

### Embed a GPX map

Save this page as `example.html` in the repository root and open it through your HTTP server. It loads an existing sample track; replace its URL with your own GPX file when integrating Tilia.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tilia GPX map</title>
  <link rel="stylesheet"
        href="https://unpkg.com/leaflet@2.0.0-alpha.1/dist/leaflet.css" />
  <script type="importmap">
  {
    "imports": {
      "leaflet": "https://unpkg.com/leaflet@2.0.0-alpha.1/dist/leaflet.js"
    }
  }
  </script>
</head>
<body>
  <div id="map" style="height: 400px;"></div>
  <script type="module">
    import { createDefaultTiliaApp } from "./src/index.js";

    const app = createDefaultTiliaApp("map", {
      plugins: ["tilia-gpx-input", "tilia-gpx-renderer"],
    });

    try {
      await app.ready;
      const response = await fetch("./samples/embed/biwakososui.gpx");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      await app.load(new File([blob], "track.gpx", {
        type: "application/gpx+xml",
      }));
    } catch (error) {
      console.error("Could not initialize or load the map:", error);
    }
  </script>
</body>
</html>
```

`createDefaultTiliaApp` accepts an existing element or its ID. Give the container a height. The example uses the default OpenStreetMap base map; GPX input fits the map to the imported data. Required plugin dependencies are installed automatically.

> If you do not need to load a predefined file at startup, omit the `fetch` and `app.load` steps and enable input plugins instead. They let users choose a local file or enter a URL, and handle the input controls and file loading for you.

Using the same HTML setup, replace the module script above with this version to wait for user input:

```js
import { createDefaultTiliaApp } from "./src/index.js";

const app = createDefaultTiliaApp("map", {
  plugins: [
    "tilia-gpx-input", "tilia-gpx-renderer",
    "tilia-file-import", "tilia-url-import",
  ],
});
await app.ready;
```

Select **Open files** to load a local GPX file, or **Load URL** to enter a remote file URL. The plugins provide the controls and handle loading; their toolbar dependency installs automatically. Remote requests still require permission from the server's CORS policy. See [input settings](docs/PLUGINS.md#input-settings) for options.

You can also keep the initial URL loading from the first example and add these input plugins to let users load additional files.

### Add photos or viewer controls

Enable the Photo input and renderer to display JPEG files, and add the `exifr` import mapping shown in the [Tilia plugin guide](docs/PLUGINS.md#photos). Add UI plugins for layer controls, popups, elevation, and settings. The guide includes complete plugin combinations and configuration examples.

See the working [viewer](samples/viewer/index.html) and [embed gallery](samples/embed/index.html). The gallery demonstrates multiple maps populated from `data-*` attributes, which is useful for reusable CMS templates.

### Application lifetime

Each app creates and owns its own Leaflet map. Await `app.ready` before using it. When removing a map component, for example during SPA unmount, dispose of the app:

```js
await app.destroy();
```

Destruction makes the app unusable immediately and removes its map after cleanup. The container remains available; after successful destruction, create a new app on the same container. Repeated calls share the same outcome, including cleanup failure. External map injection is not supported. `app.map` is borrowed access to the live map; unrelated timers and listeners remain your responsibility.

See the [Tilia API reference](docs/API.md) for the public API, errors, and lifecycle details.

## Plugins

Choose plugins by the features your application needs:

| Feature group | Capabilities |
| --- | --- |
| GPX and photos | Data loading, map rendering, and format-specific UI |
| Viewer controls | Selection popups and highlights, layers, elevation, settings, and status |
| Input | File picker, remote URL, query parameter, and map-wide drag and drop |
| Base maps | Map selector and optional GSI and OpenTopoMap providers |
| Additional tools | Track Editor, GPX export, route search, and distance milestones |

The [Tilia plugin guide](docs/PLUGINS.md) lists all plugins, their dependencies, settings, and usage. For custom plugins and installation/cleanup contracts, see [Developing Tilia plugins](docs/PLUGIN-OPERATIONS.md). The [Tilia architecture](docs/ARCHITECTURE.md) explains the design principles and component lifetimes.

## Deployment

Serve your page and `src/` from static hosting. Also include `plugins/` if you enable the optional `x-*` plugins in this repository. Preserve their relative directory structure. To host the sample pages, include `samples/` and its assets as well. No bundler or build step is needed.

Load Leaflet's JavaScript through an import map and include its CSS. The examples use Leaflet `2.0.0-alpha.1`; JPEG input additionally uses exifr `7.1.3`. See the [dependency setup](docs/PLUGINS.md#photos). Adjust the import path to `src/index.js` for your page's location.

The CDN-based examples and remote map tiles need network access. Dependencies may be hosted locally if their import mappings and asset paths are updated.

## Trust model

Tilia runs in the browser. Plugins execute as normal page JavaScript; only load code you trust. Remote imports depend on the server's CORS policy and may fail. CDN dependencies are part of your application: pin their versions and review updates deliberately.

## Contributing

Bug reports, documentation fixes, and feature contributions are welcome.

- Discuss larger behavior changes or new features in [Discussions](https://github.com/hiroaki/Tilia/discussions) first.
- Keep each pull request focused on one concern and target the `develop` branch.
- Make sure the tests pass before submitting changes.
- Contributions are provided under the project's license.

See [Tilia development](docs/DEVELOPMENT.md) for test commands and local verification.

## License

Tilia is licensed under the [0BSD license](LICENSE).
