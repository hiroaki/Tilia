# Tilia Development Notes

This document is for core contributors working on Tilia itself, rather than for application users embedding the library.


## Test Setup

Install the Node dependencies before running the repository checks.

```bash
npm install
```


## Unit Tests

Run the Vitest suite:

```bash
npm test
```

The unit tests cover the core runtime, parser behavior, plugin lifecycle, built-in plugin wiring, and selected input/UI helpers.


## Smoke Tests

Run the Playwright smoke suite:

```bash
npm run test:smoke
```

The smoke tests start the bundled Node-based static server automatically and exercise the bundled samples in a browser.

Current smoke coverage includes:

- Viewer boot
- Viewer file import
- Viewer photo import
- Viewer photo inference
- Viewer URL import
- Viewer settings panel
- Viewer elevation panel
- Viewer dropzone
- Embed sample boot

- Public factory destroy/recreate on the same container (SVG and Canvas)
- Native editor point drag/rectangle capture and pending Save Copy at destroy
- Route/remote GPX cancellation, pinned EXIF late settlement, Photo preview/styles and export URL/timer cleanup

The Phase 4B–4H pages retain internal composition injection for isolated foundation contracts; they do not demonstrate supported external-Map construction. Application-lifecycle scenarios and the Phase 4J page exercise the public factory. Listener counters distinguish Tilia/editor handlers from Leaflet’s shared document pointer detection and unrelated page owners.


## Local Server

The sample pages require HTTP, not `file://`.

For manual checks, start a local server from the repository root:

```bash
npm run serve -- 8010
```

Then open:

```text
http://localhost:8010/samples/viewer/index.html
```


## Practical Scope

At the current alpha stage, the goal is broad regression coverage over the main user flows rather than deep specification locking. When adding tests, prefer checks that confirm a whole flow still works over brittle assertions tied to incidental UI details.
The internal `src/photo/infer-location.js` offline `inferPhotoLocationFromGpx` helper accepts canonical GPX documents and is retained with `phase-4h-inference` regressions. It is a pure semantic utility, not a mutable-entry compatibility bridge or a public root-barrel export. `createBaseMap` remains a separate standalone utility; tests use its base-layer manager directly.
