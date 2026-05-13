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
- Viewer URL import
- Viewer settings panel
- Viewer elevation panel
- Viewer dropzone
- Embed sample boot


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