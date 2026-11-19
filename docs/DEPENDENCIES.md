[日本語](DEPENDENCIES.ja.md)

# Vendored browser dependencies

Tilia serves component-owned Leaflet JS/CSS and exifr using browser-native
ES modules. No build, bundler, package server or npm installation is required
for browser deployment. npm's pinned Leaflet dependency is used by Node tests;
browser samples and fixtures load this checked-in distribution instead.

| Library | Version | Upstream distribution | Included files | License |
| --- | --- | --- | --- | --- |
| Leaflet | 2.0.0-beta.4 | [Official release ZIP](https://github.com/Leaflet/Leaflet/releases/download/v2.0.0-beta.4/leaflet.zip) | `leaflet.js` (ESM), `leaflet.js.map`, `leaflet.css`, `LICENSE` | BSD-2-Clause |
| leaflet-partially-editable-polyline | 0.3.0 | [Official tagged source archive](https://api.github.com/repos/hiroaki/leaflet-partially-editable-polyline/tarball/v0.3.0) | JS, CSS, `LICENSE` in `plugins/x-track-editor/vendor/` | 0BSD |
| exifr | 7.1.3 | [Official npm tarball](https://registry.npmjs.org/exifr/-/exifr-7.1.3.tgz) | `dist/lite.esm.js` stored as `lite.esm.js`, `LICENSE` | MIT |

All included files are byte-for-byte upstream copies. The Leaflet ZIP SHA-256
matches the digest published by GitHub. exifr's bundle also matches the previous
pinned real-parser test fixture. Archive and file SHA-256 values are recorded in
the [Leaflet manifest](../src/map/vendor/leaflet/2.0.0-beta.4/manifest.json) and [exifr manifest](../src/photo/vendor/exifr/7.1.3/manifest.json). `npm test` verifies file integrity, the Node
Leaflet version and distribution parity, and local sample/fixture paths.

The global Leaflet build is unnecessary for Tilia and is omitted. beta.4 ships
minified ESM and global builds, rather than `-src` builds. Its default marker uses
inline SVG, so there is no `images/` directory to deploy. The included source map
stays beside the unchanged ESM file.

The editor plugin retains its plugin-owned, unversioned vendor paths. Its
[manifest](../plugins/x-track-editor/vendor/manifest.json) records the v0.3.0 source archive,
SHA-256 values and tag object; `version` records the release. JS, CSS and license
are unchanged upstream files. `tests/editor-vendor-integrity.test.js` audits that inventory.

## Ownership

Core map infrastructure owns `src/map/vendor/leaflet/2.0.0-beta.4/`.
The JPEG input plugin (`tilia-jpeg-input`) logically owns
`src/photo/vendor/exifr/7.1.3/`, beside the existing EXIF adapter.
Photo domain, renderer and UI do not depend on exifr. JPEG input installation
does not load the parser: the first JPEG operation imports the adapter and bundle.
Plugin removal releases owned effects, not the browser ES module cache.

All Tilia and plugin imports retain the bare `leaflet` specifier. The host must
resolve it to the same module URL across import-map scopes; no plugin carries a
second Leaflet copy. The host continues to load Leaflet CSS explicitly.

## Static deployment

- Deploy `src/` (including component-owned dependencies) and `plugins/` together, preserving their relative
  layout. Include the chosen sample directory and its assets when using samples.
- Map the bare `leaflet` specifier to `src/map/vendor/leaflet/2.0.0-beta.4/leaflet.js`
  and load `src/map/vendor/leaflet/2.0.0-beta.4/leaflet.css`, relative to the HTML page.
  Use the same module URL for Tilia and plugins to preserve class identity.
- exifr loads lazily relative to `src/photo/exif.js`; no `exifr` import-map entry
  is needed. Installation and GPX-only use do not fetch its bundle.
- Serve over HTTP(S), with JavaScript and CSS MIME types and same-origin script
  access in the host page's CSP. Host pages still need their existing inline
  script/import-map policy; local vendoring does not create a complete CSP.
- Existing map tile, routing, remote GPX and navigation services retain their
  network requirements. This change only removes library CDN requests.
- Versioned paths allow long-lived caching. When updating a dependency, deploy
  the new vendor directory before switching HTML references and keep old files
  available while old HTML may be cached.

## Leaflet beta compatibility

See the [official release notes](https://github.com/Leaflet/Leaflet/releases/tag/v2.0.0-beta.4)
and the [tagged migration guide](https://github.com/Leaflet/Leaflet/blob/v2.0.0-beta.4/MIGRATION.md).
beta.4 is a prerelease targeting Baseline 2022 browsers (Safari 15.4+).

- Use named or namespace imports; the default export and nested class names
  were removed. Tilia and its included plugins already use named imports and ES
  subclasses with constructors.
- `preferCanvas` was removed. Pass a real renderer in the browser. Create a new
  Renderer instance for each Map; do not share one instance between Maps:

  ```js
  import { Canvas } from "leaflet";
  const app = createDefaultTiliaApp("map", {
    baseMapOptions: { mapOptions: { renderer: new Canvas() } },
  });
  ```

- Default markers use SVG with a 25×46 footprint. Fractional vector coordinates,
  pan/zoom defaults and tile referrer policy also changed upstream.
- Event stopping now uses private WeakSet storage. Tilia calls the public
  `DomEvent.stopPropagation()` API rather than writing `_stopped`.
- Dragging uses pointer capture and element listeners instead of document drag
  listeners. Regression tests audit native listeners across EventTargets.
- Map CSS creates an isolated stacking context and disables text selection
  outside controls/popups. Custom host panes may need `user-select: text`.

## Changes from beta.1 to beta.4 and editor v0.3.0

Canvas input now uses
Map hit testing; do not attach input listeners to the canvas element. Coordinates
are validated more strictly, and animated view calls compose with pending views.
Tilia uses layer/Map events, finite coordinates and public listener APIs. No runtime
compatibility changes were needed. The editor peer range is `^2.0.0-beta.3`;
upstream tests beta.3, while Tilia verifies this combined beta.4 deployment.

## Updates

Download the exact tagged upstream distribution, verify its published integrity
metadata where available, and copy the required files without editing them.
Update the owning component’s versioned directory and manifest, npm pin/lockfile
(for Leaflet), import maps, CSS links
and documentation together. Run `npm test` and `npm run test:smoke`, including
SVG/Canvas editor, plugin, EXIF lifecycle and nested static-deployment tests.
Architecture audits traverse Tilia-owned modules, treating only exact manifest-listed
upstream files as dependency boundaries. Separate integrity checks verify every
upstream file, inventory, package parity and browser asset resolution. Unlisted
files are never exempted by a directory-wide vendor exclusion.

Independent libraries under plugin `vendor/` directories must be updated from
their own upstream projects rather than patched inside Tilia.
