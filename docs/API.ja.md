# Tilia API

[English](API.md) · [プラグイン運用](PLUGIN-OPERATIONS.ja.md) · [Architecture](../plugin-architecture/ARCHITECTURE.md)

## 作成・所有権

```js
import { createDefaultTiliaApp } from "../src/index.js";
const app = createDefaultTiliaApp("map", {
  plugins: ["tilia-gpx-input", "tilia-gpx-renderer", "tilia-gpx-ui"],
});
await app.ready;
```

既存 container の ID または element を渡します。Map は Tilia が毎回作成・所有し、`options.map` は拒否します。外部 Map factory・所有権 switch はありません。container のサイズと Leaflet CSS/import map を設定してください。`baseMapOptions` は center/zoom、Map options、tile/base 定義と選択を設定します。base-layer overrides は ID ごとに統合されます。`plugins` は ID、`[definitionOrId, options]`、`{plugin, options}`、`pluginOptions` は ID ごとの設定です。`builtins` は明示的 lazy metadata catalog（既定は repository catalog）です。JPEG input は pinned exifr の import mapping を必要とします。

## app API

| API | 動作 |
|---|---|
| `ready` / `whenReady()` | 同じ起動 Promise。設定 plugin の導入後 app を返す。失敗時は自動 cleanup |
| `use(definitionOrId, options)` | 依存を先に導入し、opaque `{id}` handle を返す |
| `unuse(idOrHandle)` | 依存元・provider lease による拒否、既存 safe residual retry を維持 |
| `hasPlugin` / `listPlugins` | 終了開始後 false／凍結された空配列 |
| `load(input)` | ready 後 typed dispatch。handler の実際の settlement/error を維持 |
| `destroy()` | 非同期・終端・通常は同じ Promise／結果。retry/reinitialize API はない |
| `map` / `getMap()` | 所有権を移さない、live Map の借用参照 |
| `getBaseLayer` / `getBaseMap` | 現在の base layer／Map bundle |
| `entries` / `domains` / `selection` / `rendering` | immutable guarded facades |

destroy は cached capability・最終 publication を同期で停止し、必要な provider/dependency を保持して entry を逆順削除し、UI/resource を撤去後、最後に公開 Map.remove を呼びます。container と無関係なページ資源は保持されます。借用 Map の layer 等は Map とともに終了します。Map の独立破棄・旧 app/Map の再利用は非対応です。cleanup 成功後の新しい factory 呼び出しは別 app/Map を作成します。cleanup failure 後の即時再作成は保証しません。

ready は cleanup を待たず、destroy は ready を待ちません。外部 destroy が先なら pending ready は `APP_DESTROYED`、起動 failure が先なら元のエラーで拒否します。settled ready は変更しません。Leaflet の document 共通 pointer detection は個別 Map と独立したライブラリ資源です。app/editor 固有 handler は撤去し、この共通資源は維持します。必須 resource handoff は待機し続け得ますが、plain parsing／detached setup／承認済み detached render acquisition に一律の待機・物理 cancellation は追加しません。

## semantic API

- entries: `list/get/remove/clear/setVisible/subscribe`。plugin facade は child presentation lifetime の binding も提供。
- GPX: immutable domain view、canonical tracks/segments/points・routes・waypoints の create/get/mutation/query/selection。mutation には該当する `expectedRevision` が必要。
- Photo: create/get/replaceData、requested time mode/recompute、guarded preview/selection。
- selection: `getCurrent/request/clear/subscribe`。candidate は domain facade から取得。popup close は selection を消さない。
- rendering: `getStatus/list/subscribe/retry` と承認済み temporary suppression。renderer layer は private。

entry は `{id,domain,visible}`、domain view は revision/snapshot を公開します。削除時の presentation/generation/provider/lease/final notification 順序、clear の逆順 best-effort と batch notification は維持します。Track Editor draft は source から独立し、source 変更・削除や renderer uninstall 後も Save Copy が可能です。Cancel は source を復元せず、temporary suppression は persistent preference を変更しません。

## error／extension 境界

`APP_DESTROYED` は app boundary の終了、`APP_CLEANUP_FAILED` は cleanup failure を示します。`errors` は元 cause、`details.failures` は凍結された文脈情報です。既存 subsystem error/commit semantics は維持されます。通常の destroy repeat は同じ failure を返し、暗黙 retry しません。識別可能な同期 setup/cleanup からの lifecycle mutation は pending destroy 中も `PLUGIN_LIFECYCLE_REENTRANT`。任意の await 後の self-await は一般に検出できず、禁止契約です。

公開 barrel は factory/catalog、typed keys、既存 error contracts/service keys、pure `cloneAndFreezePlainData` を提供します。独立 utility `createBaseMap` は app への Map 注入を可能にしません。store/registry/foundation/context factory は internal machinery 用です。deep import の物理的禁止や sandbox は保証しません。新しい公開 diagnostic/recovery/cleanup privilege はありません。
