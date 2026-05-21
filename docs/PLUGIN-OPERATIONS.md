# Plugin Operations

This note documents the current plugin contract as implemented today. It is intentionally narrow: the goal is to make plugin installation, dependency order, and dynamic loading predictable for future plugin work without introducing a new manifest system.

## Scope

This document describes the current behaviour of:

- `app.use()` / `app.unuse()`
- startup installation through `createDefaultTiliaApp(..., { plugins })`
- `requires` handling
- built-in vs third-party plugin IDs
- dynamic loading through `pluginUrls` and `pluginLoader`
- stylesheet registration through built-in UI styles and plugin-declared stylesheets

It does **not** describe future manifest auto-resolution, selective enablement, or plugin sandboxing. Those remain out of scope for the current runtime.

## Current model

Tilia has a single plugin lifecycle path:

- startup `plugins: [...]` is convenience sugar only
- each startup entry is normalized, then installed by calling `app.use(...)` in array order
- `app.use(...)` is the source of truth for installation, duplicate detection, dependency checks, and teardown bookkeeping

This means plugin startup order is explicit and manual.

## Plugin IDs and ownership

Plugin IDs must follow these rules:

- IDs must be `lower-kebab-case`
- the `tilia-` namespace is reserved for built-in plugins
- third-party plugins must include a prefix and at least one hyphen, for example `x-milestone` or `acme-heatmap`

Built-in plugins are resolved from the built-in registry first. If a string ID is not built-in, Tilia treats it as a dynamically loaded third-party plugin. Current examples include `x-gsi-base-maps` and `x-opentopomap-base-maps`.

## `requires` semantics

`requires` is a validation list, not a resolver.

- a plugin may declare `requires: ["tilia-panel", "tilia-status"]`
- when that plugin is installed, Tilia checks whether those plugin IDs are already installed
- if any required plugin is missing, installation fails immediately
- Tilia does not auto-install missing dependencies
- Tilia does not reorder startup plugins to satisfy dependencies

Implication: callers must install plugins in the correct order themselves.

Recommended startup pattern:

```js
createDefaultTiliaApp("map", {
  plugins: [
    "tilia-panel",
    "tilia-status",
    "tilia-layers",
  ],
});
```

Recommended manual pattern:

```js
await app.use("tilia-panel");
await app.use("tilia-status");
await app.use("tilia-layers");
```

## Dynamic loading contract

When `app.use("plugin-id")` receives a string ID that is not built-in, Tilia resolves it through the plugin loader.

Default behaviour:

- load `plugins/<plugin-id>/loader.js` relative to the application
- import it as a normal ES module

Customisation points:

- `pluginUrls`: override specific plugin paths
- `pluginLoader`: replace the whole loading strategy

Accepted module shapes:

- a plugin object exported as the module itself
- a `default` export containing the plugin object
- any named export whose `.id` matches the requested plugin ID
- otherwise, the first exported plugin-shaped object found in the module

If no valid plugin object is found, installation fails.

## Stylesheet contract

Tilia now distinguishes JavaScript plugin loading from stylesheet ownership.

- built-in UI styles are injected automatically by the runtime once per document
- a third-party plugin may declare `stylesheets` on its plugin object
- each stylesheet is registered before `setup()` runs
- stylesheet entries may be either strings or `{ href, id }` objects

Recommended pattern for third-party plugins:

```js
const plugin = {
  id: "x-my-plugin",
  stylesheets: [
    new URL("./my-plugin.css", import.meta.url).href,
  ],
  setup(app) {
    // ...
  },
};
```

Because the runtime receives only the plugin object, relative stylesheet paths should be resolved by the plugin module itself.

## UI surface contract

Tilia also owns a small set of shared UI surfaces above the map container.

- `panel`: for persistent side or bottom panels such as `tilia-panel`
- `floating`: for transient overlay UI such as the URL import form

Plugin authors should mount this kind of UI through `app.ui.mountSurface(...)` or `app.ui.surfaceManager`, not by appending directly to `map.getContainer()`.

This keeps stacking and future layout arbitration in the core runtime instead of scattering `z-index` ownership across plugins.

## Runtime expectations for plugin authors

Plugin authors should assume:

- plugin code runs with normal page JavaScript privileges
- no sandbox or capability isolation exists
- dependency order must be satisfied before installation starts
- shared cross-plugin coordination happens through `app.provide(...)` and `app.services[...]`
- built-in UI plugins own their shared stylesheet through the core runtime rather than viewer HTML
- UI plugins may use `position` and `priority` options to negotiate control placement without hard-coding page-level CSS
- panel-like and floating overlay UI should use managed surfaces rather than directly mutating the map container DOM
- teardown is optional but recommended via `destroy()` or a returned cleanup function

If a plugin depends on another plugin's UI or service surface, prefer documenting that dependency in both places:

- `requires` for runtime validation
- plugin docs for the human-facing installation order

## Current non-goals

The current runtime does **not** provide:

- manifest-based dependency solving
- automatic topological sort of plugin startup order
- selective enablement based on capability negotiation
- sandboxing for remote plugins
- compatibility promises for arbitrary legacy plugin loaders

Those items should be treated as future design work, not as implied behaviour of the current API.