[日本語](PLUGIN-OPERATIONS.ja.md)

# Developing Tilia plugins

Tilia plugins add data formats, map displays, input handlers, UI, and tools to an application. A plugin declares its dependencies and implements `setup(context, options)`. The runtime installs dependencies, supplies a guarded PluginContext, and manages the plugin's resource lifetime.

This guide explains how to write and integrate a plugin with the current system. For the available plugins and their application settings, see the [Tilia plugin guide](PLUGINS.md).

For owned input surfaces, arbitration, consume/decline decisions, renderer interactions, and the distinction from Leaflet subscriptions, see [Public interaction contracts](INTERACTIONS.md).

## 1. Write a small plugin

The following example displays the coordinates of a map click through the built-in status service. Save it as `plugins/x-click-status/loader.js` in your own checkout:

```js
import { statusServiceKey } from "../../src/index.js";

export default {
  id: "x-click-status",
  requires: ["tilia-status"],
  setup(context, options = {}) {
    const status = context.services.require(statusServiceKey);
    const prefix = options.prefix ?? "Clicked";

    context.map.listen("click", ({ latlng }) => {
      if (!latlng) return;
      status.set(`${prefix}: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`);
    });
  },
};
```

The module above is an example to create, not a shipped plugin. Its `requires` declaration ensures `tilia-status` is installed before setup. `context.map.listen` owns the listener and guards its callback; the listener is removed automatically when this plugin is removed. Setup needs no additional cleanup return value here.

This subscribes only to clicks delivered to the Map; consumed object clicks may not arrive. It neither consumes Host interactions nor prevents standard background selection clearing. Subscription is immediately effective during setup; use `lifecycle.afterCommit` when it must start only after successful installation. Callback errors and async work need plugin-side handling; see the [interaction reference](INTERACTIONS.md#host-versus-leaflet).

Plugin IDs use lower kebab case. The `tilia-` namespace is reserved for catalogued built-ins; custom plugins need a vendor or experimental prefix, such as `acme-overlay` or `x-click-status`.

## 2. Install the plugin

### Install by ID using the fixed directory convention

Place a third-party plugin at `plugins/<id>/loader.js`, with a default definition whose `id` matches the directory name. No entry in `src/builtins.js` is required or allowed for third-party plugins:

Install during application startup:

```js
import { createDefaultTiliaApp } from "./src/index.js";

const app = createDefaultTiliaApp("map", {
  plugins: [["x-click-status", { prefix: "Position" }]],
});
await app.ready;
```

Alternatively, install after startup on a separate application:

```js
import { createDefaultTiliaApp } from "./src/index.js";

const app = createDefaultTiliaApp("map", {
  plugins: [],
});
await app.ready;
await app.use("x-click-status", { prefix: "Position" });
```

All non-`tilia-*` IDs are third-party IDs. `x-` means experimental; vendor prefixes such as `company-` work identically. Existing lower-kebab-case and prefix validation still applies.

The distribution layout is fixed: `src/` and `plugins/` are siblings. Discovery uses Tilia's own module URL, not the page, its base URL, or the caller's module. Moving the whole Tilia directory under a URL prefix works without configuration. The plugin directory is not configurable, and there are no fallback directories. For other locations, use a directly imported definition or an explicit application catalog. Plugin imports follow normal ES module URL rules; Tilia does not rewrite them.

Requested external loaders and unknown external dependencies are imported to obtain metadata. Import evaluates JavaScript but does not invoke setup. The complete required metadata closure is validated and cycles are checked before any newly required setup begins. Setup, Scope ownership, commit, rollback and cleanup then follow the normal runtime. Arbitrary module-evaluation side effects cannot be rolled back. Unused plugin directories are not scanned or imported at startup.

Malformed IDs and unknown `tilia-*` IDs are rejected before directory import. Loader failures report `PLUGIN_RESOLUTION_FAILED` with the URL and cause; invalid default exports or mismatched IDs report `PLUGIN_IMPLEMENTATION_INVALID`. Dependency discovery failures include the dependency path. Failed discovery can be requested again, but native module caching does not guarantee a fresh fetch. Shutdown does not wait for a pending import and prevents late metadata registration or setup.

### Import a definition directly

From a page in the repository root, after creating the example module:

```js
import { createDefaultTiliaApp } from "./src/index.js";
import clickStatus from "./plugins/x-click-status/loader.js";

const app = createDefaultTiliaApp("map", {
  plugins: [[clickStatus, { prefix: "Position" }]],
});
await app.ready;
```

Use the Leaflet CSS/import-map setup and a sized container from the [README](../README.md#basic-usage). The built-in status dependency is available in the default catalog.

You can also install a definition after startup with `await app.use(clickStatus, options)`. Configured plugins accept string IDs, `[definitionOrId, options]`, or `{ plugin: definitionOrId, options }`. String entries read `pluginOptions[id]`; tuple/object entries use their own options without merging that map.

### Register a lazy catalog entry

For nonstandard module locations or explicit lazy metadata, supply an application catalog. This is optional integration, not registration in the official catalog:

```js
import { createDefaultTiliaApp, builtins } from "./src/index.js";

const app = createDefaultTiliaApp("map", {
  builtins: [
    ...builtins,
    {
      id: "x-click-status",
      requires: ["tilia-status"],
      load: () => import("./plugins/x-click-status/loader.js"),
    },
  ],
  plugins: [["x-click-status", { prefix: "Position" }]],
});
await app.ready;
```

The `builtins` option supplies the complete catalog, so include `...builtins` to retain the repository entries. `load()` returns an implementation or a module with a default implementation; its `id` must match the metadata and it must have a `setup` function. The official `src/builtins.js` catalog contains only Tilia `tilia-*` plugins. Application catalogs may also contain third-party IDs and take precedence over directory discovery.

Catalog `requires` is authoritative for lazy installation. Direct definitions carry their own dependency metadata. Keep both declarations consistent when publishing a plugin in both forms. Directory-discovered definitions carry their own `requires`, like direct definitions. The fixed convention does not restore the old `pluginUrls`/`pluginLoader` options or migration allowlist.

### Dependencies, options, and removal

Dependencies install before dependents; missing dependencies and cycles reject installation. Automatically installed dependencies receive `{}` options. If a prerequisite needs configuration, list/install it explicitly before the dependent:

```js
await app.use("tilia-status", { position: "bottomright" });
await app.use(clickStatus, { prefix: "Position" });
```

Calling `use` for an already active plugin returns its existing handle; it does not rerun setup or apply new options. Host code owns installation and removal:

```js
const handle = await app.use(clickStatus);
await app.unuse(handle); // A plugin ID also works.
```

The handle is an opaque `{id}`, not a service API. Use `app.hasPlugin(id)` and `app.listPlugins()` to discover active plugins. Installation/removal operations are serialized. Remove dependents before prerequisites; removing a dependent does not automatically remove its dependencies. Domain provider removal can also be blocked by entries or in-progress creation leases.

## 3. Understand setup and PluginContext

Setup may be synchronous or asynchronous. It receives `context`, not the application or runtime. Its result must be one of:

- `undefined`, when context-owned resources cover cleanup;
- a cleanup function;
- an object containing only a `dispose` method.

Cleanup may return a Promise. Do not return a service API from setup; register it through `context.services.provide`. Descriptor-level `destroy`, `dispose`, `stylesheets`, and `optionalRequires` are not supported.

The context exposes these capabilities:

| Capability | Purpose |
| --- | --- |
| `plugin` | Immutable plugin identity (`id`) |
| `scope` | Resource ownership, child lifetimes, cancellation, and guards |
| `lifecycle` | Register setup-only `afterCommit` callbacks |
| `map` | Owned listeners/layers/controls/panes and map operations |
| `services` | Provide, require, optionally obtain, and subscribe to typed services |
| `inputs` | Register input handlers, dispatch input, and observe handler discovery |
| `domains`, `entries`, `selection` | Semantic providers, data operations, and current selection |
| `renderers`, `rendering`, `presentation`, `interactions` | Rendering contributions, display state, presentation handles, and interaction resources |
| `contributions` | Toolbar, layer row, popup, and settings contributions |
| `ui` | Assigned UI surfaces and drop targets |
| `styles` | Shared stylesheet leases |
| `baseMaps` | Register and select base-map definitions |
| `diagnostics` | Report plugin errors through `report(error)` |

These are guarded facades. Do not cache raw internal stores or reach into another renderer's private layers. Semantic queries return snapshots; commands use their required revision checks. See the [semantic API reference](API.md#semantic-and-display-apis).

### Commit and setup failure

Registry contributions are staged during setup. Once setup finishes successfully, the runtime validates and commits them before publishing the plugin as active. If setup or commit fails, its owned effects are rolled back. Physical effects such as listeners or DOM mounts can be acquired during setup, so they still need ownership even before commit.

This is a per-plugin installation boundary. Dependencies that already installed successfully are not automatically removed when a dependent fails. Unowned network requests or page effects cannot be rolled back by the runtime.

For work that must start after successful installation, register `context.lifecycle.afterCommit(callback)` during setup. Its callback must return `void`, and its returned handle has `cancel()` to cancel a pending callback. Callback errors are reported; they do not undo an already committed installation.

## 4. Register features through typed capabilities

### Services

Use a shared key exported from one contract module. A service key is an identity-bearing object, not a string lookup: independently creating keys with the same `id` does not make them interchangeable.

For example, a custom contract module can export:

```js
import { defineServiceKey } from "../../src/index.js";

export const counterServiceKey = defineServiceKey({
  id: "acme-counter",
  validate: (value) => !!value && typeof value.getCount === "function",
  createFacade({ implementation, assertAvailable }) {
    return {
      getCount() {
        assertAvailable();
        return implementation.getCount();
      },
    };
  },
});
```

Both provider and consumer import that same key. The provider registers `context.services.provide(counterServiceKey, implementation)`; a consumer obtains it with `context.services.require(counterServiceKey)`. Declare the provider's plugin ID in the consumer's `requires` when it is essential. Guard each exposed operation with `assertAvailable()` so cached service facades stop working after either lifetime ends.

For a genuinely optional integration, use `context.services.optional(key)`, which returns `null` when absent, and `context.services.subscribe(key, listener)` to react to availability changes. Reacquire the facade after provider changes; a cached facade belongs to the original provider. Subscribe through the owning context so the subscription is cleaned up with it.

### Input and data

Input handlers register with `context.inputs.register({ id, priority, discovery, recognize, handle })`. `discovery` describes extensions/MIME types for input controls; `recognize(input)` decides whether to claim an input. The single highest-priority claimant handles it; an equal-priority tie rejects with `INPUT_HANDLER_CONFLICT`.

`handle({input, signal, scope})` receives an invocation lifetime. Check cancellation and plugin authority after asynchronous steps before creating entries. Handler results and errors are preserved by dispatch; cancellation does not imply that previously created semantic entries were rolled back. See the actual [GPX handler](../src/plugins/input/gpx.js) and [JPEG handler](../src/plugins/input/jpeg.js).

Use typed domain keys and commands to create or update data. Input, domain, renderer, and UI are separate roles: installing a domain does not install its file parser or renderer. Register renderers through `context.renderers`, and UI through `context.contributions`; use [the plugin guide](PLUGINS.md#choosing-plugins) to understand the host/contributor combinations.

### Map, UI, and styles

Prefer these owned map operations:

| Method | Ownership / result |
| --- | --- |
| `map.listen(type, callback)` | Guarded listener; returns a `dispose()` handle |
| `map.attachLayer(layer, options)` | Owned layer attachment; returns a `dispose()` handle |
| `map.mountControl(control)` | Owned control attachment; returns a `dispose()` handle |
| `map.createPane({name, band})` | Owned private pane lease for plugin presentation |
| `map.getViewport()`, `fitBounds`, `panTo`, `setView`, `project`, `unproject` | Guarded map reads/operations |

Map listener events are frozen projections (`type`, `latlng`, `layerPoint`, `containerPoint`), not raw Leaflet events. Coordinates use `{lat, lng}`. An attachment can specify a rendering band, or a pane lease owned by its Scope; foreign pane leases reject.

`context.ui.mountSurface` supplies an assigned container and a child Scope to its mount callback. Own listeners and temporary resources through that supplied Scope; do not modify unrelated DOM. For layer rows, popup content, settings, and toolbar items, use their contribution hosts rather than assuming another plugin's container exists. The [Photo UI contribution](../src/plugins/ui/photo.js) shows how contributor and host lifetimes are paired.

Load your plugin's stylesheet with `context.styles.use({id, href})`, using an absolute URL such as `new URL("./styles.css", import.meta.url).href` when your plugin supplies that asset. The lease exposes `ready` and `release()`. Matching leases share a stylesheet until the last release; conflicting definitions with the same ID reject. Await `ready` only when your work depends on successful CSS loading.

Use `context.baseMaps.register` for base-map contributions; there is no `app.baseMaps` API. Advanced access through `context.map.advancedLeafletMap()` is borrowed access, not ownership of the Map or another renderer's layers. Prefer owned handles for plugin effects.

## 5. Own resources with Scope

Every plugin has a root Scope owned by the runtime. Create a child Scope for a shorter operation, panel session, or entry-bound presentation. Child scopes expose `dispose()`; the plugin root is closed by the runtime rather than by plugin code.

| Scope API | Use |
| --- | --- |
| `signal` | Cancellation notification when the Scope closes |
| `alive` | Local ownership state; not a complete application-authority check |
| `assertAlive()` | Reject work after ownership or application authority ends |
| `guard(callback)` | Turn callbacks into no-ops after their authority ends |
| `child({label})` | Create a nested lifetime |
| `defer(disposer, {label, retry})` | Register cleanup before acquiring a resource |
| `track(promise, {label, await, cancel})` | Observe asynchronous work; optionally wait/cancel during close |

For resources outside context-managed APIs, capture cleanup directly:

```js
const job = context.scope.child({ label: "delayed-status" });
let timer;
job.defer(() => clearTimeout(timer), {
  label: "status-timer", retry: "safe",
});
timer = setTimeout(job.guard(() => status.set("Ready")), 1000);
```

This setup fragment assumes `status` was obtained as in the first example. The child is closed with its parent; dispose it earlier when its operation ends. Reserving cleanup before acquisition covers exceptions and reentrant shutdown during acquisition.

Disposers should use captured `dispose`, `unsubscribe`, `release`, timer IDs, or DOM references. During cleanup, operational reads through the context may already reject. Do not look up a new resource or obtain a replacement to clean up an old one.

The default retry policy is `"never"`. Mark a disposer `retry: "safe"` only if repeating a failed, partially completed attempt is safe. A successful disposal record is never rerun. Cleanup continues through independent records and reports failures rather than stopping at the first exception.

## 6. Handle asynchronous work

Use a child Scope's signal for cancellation, and check authority again after each `await`. An async callback guarded at entry still needs checks when it resumes. `scope.alive` alone is insufficient: application shutdown can fence operations while a provider Scope remains physically retained for cleanup.

For example, this setup fragment starts a host-supplied HTTP/HTTPS request only after commit and reports its response through the previously obtained status service:

```js
context.lifecycle.afterCommit(() => {
  const job = context.scope.child({ label: "status-request" });
  const work = (async () => {
    try {
      const response = await fetch(options.url, { signal: job.signal });
      job.assertAlive();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      job.assertAlive();
      status.set(text);
    } catch (error) {
      if (!job.signal.aborted) context.diagnostics.report(error);
    } finally {
      await job.dispose();
    }
  })();
  context.scope.track(work, { label: "status-request", await: false });
});
```

Supply and validate `options.url` in your plugin's setup. The `afterCommit` callback returns void; the Promise is tracked separately. Tracking observes settlement but does not make arbitrary work cancellable.

`track` defaults to `await: false`. Use `await: true` only for work whose settlement is required before owned resources can be safely released. An optional `cancel` callback must complete synchronously. Never make cleanup wait for a task that itself waits for that same cleanup to finish.

Abort means permission has ended and cancellation was requested; it does not prove physical release. Required resource preparation/disposer handoffs are awaited, while plain parsing and approved detached acquisitions do not introduce a universal wait barrier. Late success must not recreate effects; late failures remain accounted for even when shutdown has already proceeded.

## 7. Removal, failure, and application destruction

### Cleanup order

Closing a Scope first revokes the whole tree and aborts its signals. It then performs task cancellation, waits for explicitly awaitable work, closes children in reverse creation order, invokes setup-return cleanup, and disposes local records in reverse registration order.

The in-flight close completion is reserved before abort notifications. A child close triggered by the same parent shutdown is joined rather than started again. An earlier failed child cleanup can receive the existing safe retry attempt during parent cleanup. Ordinary repeated close preserves its outcome; explicit safe retry is a separate operation. A disposer must never await its own Scope's close completion.

Do not call application/runtime `use`, `unuse`, or `destroy` from setup or cleanup, including after an asynchronous continuation. Identifiable synchronous calls reject with `PLUGIN_LIFECYCLE_REENTRANT`; asynchronous self-await cannot generally be detected and must be avoided by design.

### Failed installation or removal

Inspect errors' `code`, `cause`, and relevant details rather than treating every error as cancellation. Common installation/removal codes include:

| Code | Meaning |
| --- | --- |
| `PLUGIN_UNKNOWN` | The requested ID has no registered metadata |
| `PLUGIN_DEPENDENCY_MISSING`, `PLUGIN_DEPENDENCY_CYCLE` | Dependency planning failed |
| `PLUGIN_RESOLUTION_FAILED`, `PLUGIN_IMPLEMENTATION_INVALID` | Loading failed or the loaded implementation is invalid |
| `PLUGIN_SETUP_FAILED`, `PLUGIN_COMMIT_FAILED` | Setup or staged commit failed |
| `PLUGIN_HAS_DEPENDENTS` | Active dependents block removal |
| `PLUGIN_TEARDOWN_FAILED`, `PLUGIN_QUARANTINED` | Cleanup is incomplete or the ID cannot be installed |

Guarded extensions and semantic operations have their own errors. A domain removal preflight can reject before teardown starts when provider leases remain. Failed cleanup can quarantine a plugin ID: `use` cannot silently replace it. While the app is live, another `unuse(id)` can attempt existing retry-safe residual cleanup; it does not rerun successful records or guarantee recovery. Do not invent an application retry/reset/diagnostics API from internal runtime helpers.

### Whole-application destruction

Host code calls `await app.destroy()`. The app becomes unusable immediately, pending work is aborted, and entries are removed while their exact providers and required dependencies are retained. Independent cleanup continues after failures; providers blocked by outstanding ownership are not forced free. The owned Leaflet Map is removed last.

Destruction is terminal. Ordinary repeated calls share the same completion, including rejection; they do not automatically retry. `APP_CLEANUP_FAILED` retains original failures. After successful cleanup, a fresh app can be constructed on the surviving container. Cleanup failure does not promise immediate container reuse. See [the application API](API.md#construction-and-ownership).

Do not remove the borrowed Map yourself. Map-attached effects end with it, while unrelated page timers/listeners remain their owner's responsibility. Existing Leaflet page-wide infrastructure is distinct from plugin-owned handlers. No new public recovery or privileged cleanup API is provided.

## 8. Choose the right product lifetime

Entry visibility, temporary display suppression, semantic data, and editing sessions have different lifetimes. Match your Scope to the effect rather than treating every effect as part of the renderer.

- **Entry-bound overlays:** Milestone presentation uses `context.entries.bindPresentationLifetime(entryId, {scope})`. It withdraws synchronously when the entry is logically deleted, and joins cleanup before the final removal notification.
- **Independent editor sessions:** Track Editor creates a draft from its source. Source changes/deletion or renderer removal do not end editing or prevent Save Copy. Cancel discards the draft and releases temporary suppression; it never restores a source. App/editor disposal does end the session.
- **Temporary suppression:** editor suppression is separate from persistent entry/track visibility preferences. Release it without rewriting the user's visibility settings.
- **Vendor interaction helpers:** the current editor retains its narrowly approved placement exception. It does not grant other plugins ownership of vendor internals or permission to bypass the ordinary guarded resource model. See the [architecture](ARCHITECTURE.md#ui-overlays-and-session-state).

## 9. Verify your plugin

Exercise installation, removal, and installation again; check that listeners, DOM, styles, timers, and requests do not accumulate. Trigger setup failure after a resource is acquired and confirm its cleanup. Test closing a panel, deleting an entry, or destroying the app while asynchronous work is pending, then allow that work to settle and confirm it does not add new effects.

For essential providers, verify dependency removal is blocked while your plugin is active. For optional providers, verify absence and replacement do not leave stale facades in use. If cleanup can fail, verify independent cleanup continues and that retries are safe only where explicitly declared.

See [development workflows](DEVELOPMENT.md) for test/server commands. The [runtime tests](../tests/plugin-runtime.test.js), [Scope tests](../tests/ownership-scope.test.js), and [context tests](../tests/plugin-context.test.js) contain focused examples of the current contracts. Their internal test factories are not alternative public application constructors.
