# Plugin operations

[日本語](PLUGIN-OPERATIONS.ja.md) · [API](API.md)

## Installation

Plugin metadata is `{id, requires, load}` in an explicit lazy catalog. `load` returns an implementation/default module whose `id` matches metadata. Catalog metadata is authoritative for hard dependencies. Built-in IDs use `tilia-`; external IDs use a valid vendor/`x-` prefix. A catalog can extend `builtins` when constructing the public factory. There is no convention URL resolver, pluginUrls/pluginLoader option or migration allowlist.

```js
const plugin = (await import("../plugins/x-milestone/loader.js")).default;
await app.use(plugin, { enabled: true });
await app.unuse(plugin.id);
```

Setup receives guarded PluginContext, not the app. Hard dependencies belong in `requires`; services are explicit typed registrations. Setup returns only undefined, a cleanup function or `{dispose}`. Registrations are staged/atomic, and failure rolls back owned effects. Never return service APIs or descriptor stylesheets; lease styles with `context.styles.use`. `afterCommit` callbacks return void, run only after commit and must own any request/resources they start.

## Owned resources

```js
export default {
  id: "x-example",
  requires: [],
  setup(context) {
    const timer = setTimeout(context.scope.guard(() => {
      // guarded operational work
    }), 1000);
    context.scope.defer(() => clearTimeout(timer), {
      label: "example-timer", retry: "safe",
    });
    context.map.listen("click", () => {});
  },
};
```

Use MapFacade layer/control/listener/pane handles, assigned UI mounts, styles leases and Scope children. Reserve cleanup before physical acquisition. Capture dispose/unsubscribe/release handles so cleanup does not look up operational services or acquire replacements. Mark retry safe only when partial disposal is actually safe. Cleanup is best-effort and successful records never repeat.

Closing revokes the tree/aborts before cancellation, explicitly awaitable work, reverse children, setup-return cleanup and LIFO local cleanup. One in-flight completion is reserved before notifications. A child close initiated during the same parent shutdown is joined; an earlier child residual remains eligible for accepted safe parent cleanup, and explicit safe retry is separate. A disposer must not await its own Scope completion.

`scope.track` defaults to non-awaitable. Resource-specific required preparation/disposer handoffs are awaited; plain parsing and approved detached acquisitions remain observed/guarded without a blanket barrier. Abort is authority/cancellation notification, not proof of physical cleanup. Never recreate effects after application operational fencing even if a retained provider Scope is physically alive. Guard callbacks and final commits; captured cleanup remains callable.

Do not call app/Runtime use/unuse/destroy from setup or cleanup. Identifiable synchronous calls reject; async provenance/self-await cannot generally be detected. Borrowed advanced Map access transfers no ownership and does not expose another renderer's private layers. Map-attached effects end with app destruction; unrelated page work needs its own cleanup.

## Product lifetimes

Entry-bound Milestone presentation withdraws synchronously at logical deletion and joins cleanup before final removed notification. Editor owns an independent draft/session: source deletion/modification or renderer uninstall does not destroy it or block Save Copy; Cancel never recreates a source. Temporary suppression is distinct from persistent visibility. Vendor interaction helpers retain the approved narrow placement exception; vendor internals are unchanged.

Cleanup faults quarantine plugin IDs where required, prevent successful reinstall, and remain residual evidence. Application destruction is terminal; blocked prerequisites stay unavailable, leases are not forced free, independent cleanup continues and Map.remove is attempted last. No automatic recovery or new public diagnostics/retry capability is provided.
