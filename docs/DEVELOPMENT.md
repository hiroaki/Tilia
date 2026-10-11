[日本語](DEVELOPMENT.ja.md)

# Developing Tilia

This guide is for contributors changing Tilia itself, its bundled plugins, samples, or documentation. For application integration, start with the [README](../README.md) and [Tilia plugin guide](PLUGINS.md). For plugin contracts and implementation examples, use the [Developing Tilia plugins](PLUGIN-OPERATION.md) guide.

Tilia uses browser ES modules directly. There is no build step for running the samples. Node.js supplies the development server and test tools.

## Set up the repository

Run the commands below from the repository root. Use **Node.js 22 with npm** to match the current [CI workflow](../.github/workflows/test.yml). The repository does not declare its own Node engine range; the CI version is the development baseline.

Install the locked dependencies and the browser needed by the smoke tests:

```bash
npm ci
npx playwright install chromium
```

On Linux machines that need browser system libraries, use the CI installation command instead:

```bash
npx playwright install --with-deps chromium
```

`npm ci` installs from `package-lock.json` without updating it. Use `npm install` when deliberately changing dependency declarations, and review both `package.json` and `package-lock.json`. The current CI workflow uses `npm install`; do not assume it enforces an unchanged lockfile.

The Node dependencies supply test tools and a local Leaflet installation. Sample HTML has its own browser import maps: the viewer/embed pages load Leaflet `2.0.0-alpha.1` and exifr `7.1.3` from CDNs. Installing npm dependencies does not replace those mappings. CDN modules, map tiles, and remote services may still require network access; some test fixtures use local or intercepted resources.

## Find the right component

| Location | Responsibility |
| --- | --- |
| `src/index.js`, `src/app.js` | Public exports and application construction |
| `src/application-composition.js` | Startup, application capabilities, and shutdown coordination |
| `src/ownership/`, `src/extensions/`, `src/plugins/runtime/` | Owned resource lifetimes, extension contracts, and plugin installation |
| `src/entries/`, `src/domains/`, `src/selection/` | Entry identity, immutable domain views, commands, and semantic selection |
| `src/rendering/`, `src/map/`, `src/interactions/`, `src/ui/` | Rendering generations, Map infrastructure, interaction, and UI hosts |
| `src/gpx/`, `src/photo/`, `src/plugins/` | Format-specific behavior and bundled domain/input/renderer/UI plugins |
| `src/builtins.js` | Lazy plugin catalog, IDs, and hard dependencies |
| `plugins/` | Optional tools and base-map providers |
| `samples/` | Working viewer, embed, and editor examples |
| `tests/`, `tests/smoke/`, `tests/fixtures/` | Unit/contract tests, browser flows, and test data/pages |
| `docs/` | Public developer and integration documentation |

Read [Architecture](ARCHITECTURE.md) before changing ownership, selection, or rendering behavior. Generic mechanisms belong in infrastructure; format-specific policy belongs in domain plugins and their consumers. Domain snapshots are authoritative; Leaflet layers are replaceable presentations.

When adding or changing a bundled plugin, check its definition and catalog metadata together. Hard dependencies must agree, and optional implementations must remain lazy. Update the [plugin guide](PLUGINS.md) when user-facing options or feature combinations change.

## Local server

Start the bundled static server:

```bash
npm run serve -- 8010
```

Open one of these pages:

- [Sample index](http://127.0.0.1:8010/samples/)
- [Viewer](http://127.0.0.1:8010/samples/viewer/index.html)
- [Embed gallery](http://127.0.0.1:8010/samples/embed/index.html)
- [Editor](http://127.0.0.1:8010/samples/editor/localhost.html)

The server uses the current working directory as its root, binds to `127.0.0.1` by default, and serves files without a build or automatic page reload. Refresh the browser after editing. Stop it with Ctrl+C. The argument selects the port; without it, the default is `8010`. `HOST` and `PORT` environment variables are also supported, with the command-line port taking precedence over `PORT`.

Use HTTP rather than `file://` for modules and file loading. The bundled server is a static file server; it is not a routing backend. If a tool needs a remote service, configure that service through its documented plugin options.

## Unit tests

Run the Vitest suite:

```bash
npm test
```

The [Vitest configuration](../vitest.config.js) excludes browser smoke tests, dependencies, and `dist/`. Unit and contract tests cover parsing/serialization, domain commands and queries, selection, plugin planning/setup/removal, resource ownership, rendering, and input/UI helpers. Many use controlled providers or browser substitutes; they do not replace real browser verification.

While working, select the relevant files or a test name:

```bash
npm test -- tests/plugin-runtime.test.js tests/plugin-context.test.js
npm test -- tests/application-destroy.test.js -t "destroy"
```

`npm test` runs once. For an explicit watch session:

```bash
npx vitest tests/plugin-runtime.test.js
```

The [runtime tests](../tests/plugin-runtime.test.js), [Scope tests](../tests/ownership-scope.test.js), and [domain foundation tests](../tests/phase-4d-a-semantic-foundation.test.js) demonstrate focused contract fixtures. Internal constructors used there are test machinery, not alternative public application APIs.

## Smoke tests

Run the browser suite:

```bash
npm run test:smoke
```

The [Playwright configuration](../playwright.config.js) discovers tests in `tests/smoke/` and starts the bundled server on `http://127.0.0.1:4173`. It runs in Chromium by default, headless, with tests eligible to run in parallel. No separate manual server is needed. Locally, it can reuse an existing server on that address; in CI it starts its own server. If results appear to use old files, check which checkout the existing server serves.

Coverage includes:

- Viewer/embed startup, file/URL/drop input, Photo GPS/inference, base-map selection, settings, and elevation.
- Semantic selection, rendering replacement, interaction, and owned UI resources.
- Editor dragging, rectangle selection, independent drafts, Save Copy, export, and temporary track suppression.
- Public application destruction and same-container recreation with SVG/Canvas, pending route/input work, preview URLs, styles, and listener cleanup.

Some file/page names retain `phase-4*` labels from implementation work. They are regression suites for current contracts, not a public API version scheme. Several older fixtures inject an internal composition or Map to isolate infrastructure. Supported host construction remains `createDefaultTiliaApp`; the [application lifecycle tests](../tests/smoke/application-lifecycle.spec.js) exercise that public boundary. Leaflet's shared document listeners and unrelated page-owned resources must be distinguished from app-owned listeners when testing cleanup.

Select a flow or list the discovered tests:

```bash
npm run test:smoke -- tests/smoke/viewer-file-import.spec.js
npm run test:smoke -- tests/smoke/application-lifecycle.spec.js
npm run test:smoke -- --list
```

For a visible browser or less concurrency:

```bash
npm run test:smoke -- tests/smoke/viewer-file-import.spec.js --headed
npm run test:smoke -- tests/smoke/application-lifecycle.spec.js --workers=1
```

### Inspect failures

Check the first failed assertion, page errors, and failed module/network requests before changing timeouts. Missing browser executables usually mean the Playwright browser installation step was skipped or needs repeating after a tool update.

Artifacts are written to `test-results/`. The configured trace mode is `on-first-retry`, but the repository does not configure retries, so a default run does not guarantee a trace. Capture one deliberately when investigating a failure:

```bash
npm run test:smoke -- tests/smoke/application-lifecycle.spec.js --trace=retain-on-failure --reporter=html
npx playwright show-report
```

The HTML report is written to `playwright-report/`; both report and result directories are ignored by Git. The default local reporter is a console list. CI uses both HTML and list reporters and attempts to upload the HTML report even when tests fail.

| Symptom | Check |
| --- | --- |
| Server cannot start | Port availability and the working directory; confirm any reused server serves this checkout |
| Blank sample or module error | Browser console, import-map paths, CDN access, and Leaflet CSS |
| Remote file import fails | HTTP status, server CORS policy, and an installed matching input handler |
| JPEG import fails | The page's pinned exifr mapping and the Photo/input plugins |
| Works in a fixture but fails in a sample | Public factory setup, actual plugin combination, real DOM/Leaflet behavior, and resource disposal |

## Practical scope

Start with the checks relevant to the change, then run the unit and browser suites before submitting code that affects runtime behavior. For documentation-only changes, verify documented commands, API examples, relative links/anchors, and referenced files; run affected behavior checks if examples or API claims change.

Use tests that establish observable behavior and resource ownership:

- Assert committed data, revision checks, semantic selection, and complete user flows rather than incidental UI markup.
- For asynchronous changes, cover cancellation or disposal before completion and ensure late results cannot publish into a closed owner.
- For lifecycle changes, check partial setup failure, consumer/provider dependency ordering, and cleanup failure as well as normal disposal.
- For editor changes, distinguish the independent draft from its source entry; source removal must not accidentally become draft rollback.
- Add browser coverage when the change depends on native pointer events, Leaflet behavior, DOM focus, FileReader, or object URL lifetimes.

Use deterministic fixtures or intercepted requests when testing remote outcomes. Do not confuse a missing renderer with missing semantic data. Keep pure internal helpers covered where they serve real behavior: for example, the offline Photo inference helper consumes canonical GPX documents, but it is not a root-barrel API or a mutable-entry compatibility bridge. The standalone `createBaseMap` utility also has independent tests; it does not enable external Map injection into an app.

## Prepare a contribution

Keep changes focused and target the `develop` branch, following the [README contribution guidance](../README.md#contributing). Discuss larger feature or behavior changes first.

Before submitting:

1. Check public API exports and plugin metadata if contracts changed.
2. Update the appropriate public document: README for entry-level usage, the plugin guide for feature configuration, API for signatures/returns, the plugin developer guide for extension contracts, and architecture for component responsibilities.
3. Verify relative links and sample paths. Public documents should not depend on temporary implementation notes.
4. Run the appropriate checks and describe what was verified, including any environment limits or tests not run.
5. Review the diff for unrelated changes, generated files, and dependency changes.

There are no repository scripts named `build`, `lint`, or `typecheck`; do not list those as checks that were run. The current [CI workflow](../.github/workflows/test.yml) uses Ubuntu and Node.js 22, runs `npm test`, installs Chromium with its system dependencies, and runs the smoke suite. It is triggered for pull requests, pushes to `main`, and manual dispatch. Passing focused local checks does not replace that complete CI run.
