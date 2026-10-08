# Tilia API

[日本語](API.ja.md) · [Plugin operations](PLUGIN-OPERATIONS.md) · [Architecture](../plugin-architecture/ARCHITECTURE.md)

## Construction and ownership

```js
import { createDefaultTiliaApp, builtins } from "../src/index.js";
const app = createDefaultTiliaApp("map", {
  plugins: ["tilia-gpx-input", "tilia-gpx-renderer", "tilia-gpx-ui"],
  pluginOptions: {},
});
await app.ready;
```

The container is an existing element or ID. Give it a size and load Leaflet CSS/import-map dependencies as in README. Every public app creates/owns one Map; `options.map` rejects. There is no external-Map factory or ownership switch. `baseMapOptions` configures map options, center, zoom, tile URL/options, base definitions and selection; app base-layer overrides merge by ID. `plugins` accepts IDs, `[definitionOrId, options]` or `{plugin, options}`; `pluginOptions` supplies options by ID. `builtins` accepts an explicit lazy metadata catalog (default: repository catalog). Optional implementations resolve only when requested. JPEG input additionally requires the pinned exifr import mapping.

## Application methods

| API | Behavior |
|---|---|
| `ready`, `whenReady()` | Same startup Promise, resolving to app after configured plugins. Ready failure automatically initiates cleanup |
| `use(definitionOrId, options)` | Serialized guarded installation; returns opaque `{id}`. Hard dependencies install first |
| `unuse(idOrHandle)` | Dependents/provider leases can block removal; safe residual retry follows existing ownership rules |
| `hasPlugin(id)`, `listPlugins()` | Discovery of active plugins; false/frozen empty array once destruction starts |
| `load(input)` | Waits for ready and uses typed input dispatch. Preserves dispatch errors and actual handler settlement |
| `destroy()` | Asynchronous, terminal, ordinary idempotent shared completion; no public retry/reinitialize |
| `map`, `getMap()` | Borrowed live app-owned Leaflet Map |
| `getBaseLayer()`, `getBaseMap()` | Current base layer / borrowed Map bundle |
| `entries`, `domains`, `selection`, `rendering` | Guarded immutable capability facades |

Destroy fences operations/cached capabilities synchronously, aborts pending work, removes entries while exact providers and required dependencies remain, withdraws UI/resources, and calls public Map.remove last. Caller container/unrelated page resources survive; Map-attached effects end with the Map. Never independently remove the borrowed Map or use an old Map/app after destruction. After successful cleanup a fresh public app creates a distinct Map on the same container. Cleanup failure leaves the app terminal and does not promise immediate container reuse.

Ready never waits for cleanup and destroy never waits for ready. The initiating cause wins: external destroy rejects pending ready with `APP_DESTROYED`; startup failure preserves its original error. Settled ready is unchanged. Leaflet retains shared document pointer detection independently of any one Map; destroy removes app/editor handlers while preserving that page-wide library infrastructure. Required resource handoffs can keep destroy pending; resource-free noncooperative parsing, detached setup and approved detached renderer acquisition do not gain a universal wait/cancel guarantee. Late failures remain internally accounted for.

## Semantic and display APIs

| Facade | Methods |
|---|---|
| `entries` | `list`, `get`, `remove`, `clear`, `setVisible`, `subscribe`; plugin facade additionally binds owned child presentation lifetime |
| `domains.gpx` | `create`, `get`, `replaceData`, `updatePoint`, category/track visibility, style preset, recompute; document/extent/distance/elevation/nearest queries; `selection` |
| `domains.photo` | `create`, `get`, `replaceData`, requested time mode/recompute, guarded `getPreview`; `selection` |
| `selection` | `getCurrent`, `request(candidate)`, `clear`, `subscribe` |
| `rendering` | `getStatus`, `list`, `subscribe`, `retry` while live; approved temporary suppression capability |

Entries expose immutable `{id,domain,visible}`; domain views include revision/snapshot. Mutation commands require their documented `expectedRevision`. GPX data is canonical tracks/segments/points, routes and waypoints. Generic core has no mutable sources/layers. Selection candidates come from the domain's guarded selection facade; raw renderer layers are private. Closing a popup does not clear semantic selection. Deletion preserves presentation/generation/provider/lease/final-notification ordering; clear is best-effort reverse insertion with a final batch notification.

Track Editor maintains an independent draft. Source mutation/deletion and renderer uninstall do not terminate it or block Save Copy. Cancel never restores a source. Temporary suppression does not overwrite persistent preferences. App/editor disposal does terminate its session.

## Errors and extension boundary

`APP_DESTROYED` identifies a dead app boundary; `APP_CLEANUP_FAILED` reports destruction failures with original causes in `errors` and frozen contextual summaries in `details.failures`. Existing PluginError/SemanticError/InputDispatchError/RenderingError codes and commit information remain; in-flight/cached failures are not all converted to app errors. Ordinary repeated destroy retains the same rejected outcome without implicitly retrying. Identifiable synchronous setup/cleanup app lifecycle calls reject `PLUGIN_LIFECYCLE_REENTRANT`, even when destroy is pending. Asynchronous self-await cannot generally be detected and is prohibited.

The public barrel exposes the factory/catalog, typed domain/service keys, established error contracts, service contract keys and pure `cloneAndFreezePlainData`. The standalone `createBaseMap` utility is independent of app construction: it does not enable Map injection. Infrastructure stores/registries/foundations/context factories are internal direct imports for machinery tests, not public app APIs. Deep imports are not physically sandboxed. There is no new public diagnostic/recovery/privileged cleanup API.
