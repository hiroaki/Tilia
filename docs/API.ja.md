**[English API reference](API.md)**

# Tilia API リファレンス

通常の利用入口は [`createDefaultTiliaApp()`](#createdefaulttiliaappcontainer-options) です。


## 検証

リポジトリ全体の開発時確認には次を使います。

- `npm test`: Vitest による unit test
- `npm run test:smoke`: 付属 viewer / embed sample を対象にした Playwright smoke test

smoke test ではローカルの静的サーバーも自動起動します。


## ファクトリ関数

### `createDefaultTiliaApp(container, options?)`

Leaflet ベースマップの作成と Tilia app の初期化をまとめて行う高レベルの factory です。ほとんどの用途でこれを使います。

**パラメータ**

| 名前 | 型 | 説明 |
|------|----|------|
| `container` | `string \| HTMLElement` | マップコンテナ要素またはその `id` |
| `options` | `object?` | 下記参照 |

**options の内容**

| 名前 | 型 | 説明 |
|------|----|------|
| `plugins` | `Array?` | 起動時に導入するプラグイン一覧（文字列 ID、プラグインオブジェクト、`[plugin, options]` タプルが混在可） |
| `pluginOptions` | `object?` | プラグイン ID をキーにした、各プラグインへのオプションマップ |
| `pluginUrls` | `object?` | 特定 ID のローダーパスを上書き: `{ "x-my-plugin": "./path/loader.js" }` |
| `pluginLoader` | `function?` | 完全カスタムのローダー関数: `async (pluginId) => pluginModule` |
| `baseMapOptions` | `object?` | `createBaseMap()` に渡すオプション（下記参照） |
| `defaultPhotoTimeMode` | `"local" \| "jst" \| "utc"` | 新規追加写真に適用するデフォルトのタイムスタンプ解釈モード（デフォルト: `"local"`） |

**戻り値**: [Tilia app インスタンス](#app-インスタンス-api)

**例**

```js
import { createDefaultTiliaApp } from "./src/index.js";

const app = createDefaultTiliaApp("map", {
  plugins: [
    "tilia-panel",
    "tilia-status",
    "tilia-layers",
  ],
});

// 起動完了を待つ場合（高度な用途のみ）
await app.whenReady();
app.load(myGpxFile);
```

### `createBaseMap(container, options?)`

Leaflet マップと OpenStreetMap タイルレイヤーを初期化します。`createDefaultTiliaApp()` が内部で呼び出しますが、高度なセットアップでは直接使えます。

**options の内容**

| 名前 | 型 | デフォルト | 説明 |
|------|----|-----------|------|
| `center` | `[lat, lng]` | `[35.681236, 139.767125]` | 初期中心座標（東京駅付近） |
| `zoom` | `number` | `10` | 初期ズームレベル |
| `tileUrl` | `string` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | カスタムタイル URL テンプレート |
| `tileOptions` | `object` | — | Leaflet `TileLayer` オプション（`attribution`、`maxZoom` など） |
| `mapOptions` | `object` | — | Leaflet `Map` コンストラクタオプション |

**戻り値**: `{ map: L.Map, tileLayer: L.TileLayer }`

### `createTiliaApp({ map, ...options })`

既存の Leaflet マップに Tilia を接続する低レベル factory です。`createDefaultTiliaApp()` と同じオプション（`baseMapOptions` を除く）に加え:

| 名前 | 型 | 説明 |
|------|----|------|
| `map` | `L.Map` | **必須。** 接続先の Leaflet マップ |
| `tileLayer` | `L.TileLayer?` | このアプリに関連付けるベースタイルレイヤー |


## App インスタンス API

以下のプロパティ・メソッドはすべて `createDefaultTiliaApp()` または `createTiliaApp()` の戻り値で使えます。

### プラグインのライフサイクル

#### `app.use(pluginOrId, options?) → Promise<pluginApi>`

プラグインを導入します。第一引数には以下を渡せます:

- **文字列 ID** — built-in を解決するか、`plugins/<id>/loader.js` から動的 import
- **プラグインオブジェクト** `{ id, setup }` （[プラグインの作り方](#プラグインの作り方) を参照）

すでに導入済みのプラグインを指定すると、再インストールせずに既存の API を返します。

#### `app.unuse(pluginOrId) → Promise<pluginApi>`

プラグインを取り外し、`destroy()` が定義されていれば呼びます。プラグインの API オブジェクトを返します。

#### `app.ready → Promise<app>`

`options.plugins` に指定したすべてのプラグインのインストールが完了したときに解決する Promise。

#### `app.whenReady() → Promise<app>`

`app.ready` を返すヘルパーです。起動後に処理を続けたい場合に便利です:

```js
const app = createDefaultTiliaApp("map", { plugins: [...] });
app.whenReady().then(() => app.load(myFile));
```

### マップへのアクセス

| メンバ | 戻り値 | 説明 |
|--------|--------|------|
| `app.map` | `L.Map` | Leaflet マップインスタンス |
| `getMap()` | `L.Map` | `app.map` と同じ |
| `getBaseLayer()` | `L.TileLayer` | ベースタイルレイヤー |
| `getBaseMap()` | `{ map, tileLayer }` | 両方 |

### データ読み込み

#### `app.load(input) → Promise`

GPX ファイルまたは JPEG 画像を 1 件処理します。`input` には `File`・URL 文字列・登録済み入力ハンドラが受け付けるオブジェクトを渡せます。

**GPX ファイル**（`.gpx`）:
- トラックをポリラインとして地図に描画する
- ウェイポイント（`<wpt>` 要素）をマーカーとして配置する
- トラックポイントごとの標高（`<ele>`）とタイムスタンプ（`<time>`）を解析する
- 読み込み後、地図をレイヤーの範囲に自動フィットする

**JPEG ファイル**（`.jpg`、`.jpeg`）:
- 位置は次の順序で決定される:
  1. **EXIF GPS** — あればその座標を直接使用
  2. **GPX タイムスタンプ補間** — EXIF GPS がない場合、EXIF のキャプチャ時刻と読み込み済み GPX トラックのタイムラインを照合して線形補間
  3. **エラー** — EXIF に GPS も使えるタイムスタンプもない場合はエラーを投げる
- タイムスタンプは現在の photo time mode（`"local"`、`"jst"`、`"utc"`）に従って解釈される

> **注意:** GPX ルート（`<rte>`）は現在サポートしていません。トラック（`<trk>`）とウェイポイント（`<wpt>`）のみが処理されます。

### プラグインユーティリティ

#### `app.subscribeInteractions(handlers) → unsubscribeFn`

GPX レイヤーや写真マーカーが地図に追加されたときのイベントを購読します。購読開始時に既存のエントリすべてに対して即座に呼ばれ、以後は新しいエントリが追加されるたびに呼ばれます。購読解除関数を返します。

```js
const unsub = app.subscribeInteractions({
  // GPX のトラックレイヤーごとに呼ばれる
  onTrackLayer({ entry, layer }) { /* layer は Leaflet Polyline */ },

  // GPX のウェイポイントマーカーごとに呼ばれる
  onWaypointLayer({ entry, layer, waypoint }) { /* layer は Leaflet Marker */ },

  // 写真マーカーごとに呼ばれる
  onPhotoMarker({ entry, layer }) { /* layer は Leaflet Marker */ },
});

// 解除する場合:
unsub();
```

#### `app.provide(name, service)`

名前付き共有サービスを登録します。他のプラグインから `app.services[name]` で参照できます。

#### `app.addRefreshHandler(fn) → unsubscribeFn`

`app.refreshView()` が呼ばれるたびに実行されるコールバックを登録します。購読解除関数を返します。

#### `app.refreshView()`

登録済みのリフレッシュハンドラをすべて呼び出します。レイヤーの追加・削除後などに呼ぶことが想定されています。

#### `app.setStatus(text)`

`tilia-status` が導入されていればステータスバーのテキストを更新します。未導入の場合は何もしません。

#### `app.setError(error)`

エラーをアプリの状態（`app.state.lastError`）に記録します。

### 状態とサービス

| プロパティ | 型 | 説明 |
|------------|----|----|
| `app.state` | `object` | 実行時状態: `entries`（読み込み済みレイヤー）、`sources`、`layers`、`lastError` |
| `app.services` | `object` | プラグインが公開した共有サービス（プラグイン ID をキーに持つ） |
| `app.plugins` | `Map` | 導入済みプラグインのレジストリ（プラグイン ID をキーに持つ） |


## Built-In プラグイン

`app.use()` に文字列 ID を渡すか、`options.plugins` に列挙することで導入できます。

| ID | 依存 | 説明 |
|----|------|------|
| `tilia-panel` | — | レイヤー・高度・設定パネルのコンテナとなるサイドパネル（マップ内に描画される） |
| `tilia-status` | — | 地図左下に表示されるステータスバー。読み込み結果やエラーを表示する |
| `tilia-layers` | `tilia-panel`, `tilia-status` | サイドパネル内のレイヤー一覧。エントリごとに表示切替・削除・フィット・写真のタイムスタンプモード変更が可能 |
| `tilia-elevation` | `tilia-panel`, `tilia-status` | サイドパネル内のインタラクティブな高度プロファイルチャート。チャートでホバーすると対応するトラックポイントが地図上に表示される |
| `tilia-file-import` | — | 地図上のコントロール（左上）にファイル選択ボタンを追加。`.gpx`・`.jpg`・`.jpeg` に対応、複数ファイルを同時に選択可能 |
| `tilia-url-import` | — | URL 入力フォームを開くコントロール。HTTP/HTTPS のみ対応（CORS が必要）。ファイル名は `Content-Disposition` または URL パスから推定。`timeoutMs` と `maxBytes` を指定可能 |
| `tilia-settings` | `tilia-panel`, `tilia-status` | 設定パネル。新規追加写真に適用するデフォルトのタイムスタンプ解釈モードを設定できる |
| `tilia-dropzone` | — | マップコンテナ全体をドロップ対象にする。ドラッグ中はビジュアルハイライトを表示する |

### 写真タイムスタンプ解釈モード

| モード | 動作 |
|--------|------|
| `local` | EXIF のタイムスタンプをデバイスのローカル壁時計として扱う（タイムゾーン変換なし）。デフォルト。 |
| `jst` | EXIF のタイムスタンプをデバイスロケールに関わらず日本標準時（UTC+9）として扱う。 |
| `utc` | EXIF のタイムスタンプを UTC として扱う。 |

> **依存の順序に注意。** `requires` に列挙されたプラグインは先に導入してください。`options.plugins` で宣言する場合は配列の並び順がそのまま導入順になります。

`tilia-url-import` には次のガード用オプションがあります:

- `timeoutMs`: リモート fetch が長すぎる場合に中断する時間（デフォルト: `15000`）
- `maxBytes`: このバイト数を超えるリモートファイルを拒否する上限（デフォルト: `10485760`）

**例**

```js
// 個別に await する場合
await app.use("tilia-panel");
await app.use("tilia-status");
await app.use("tilia-layers");   // OK: 依存が先に導入済み

// 宣言的に指定する場合（起動時の推奨パターン）
createDefaultTiliaApp("map", {
  plugins: [
    "tilia-panel",
    "tilia-status",
    "tilia-layers",
    "tilia-elevation",
    "tilia-file-import",
    "tilia-url-import",
    "tilia-settings",
    "tilia-dropzone",
  ],
});
```


## プラグインの作り方

プラグインは `id` と `setup` を持つプレーンオブジェクトです:

```js
const myPlugin = {
  id: "x-my-plugin",           // lower-kebab-case、ベンダー prefix 付き
  requires: ["tilia-status"],   // 先に導入が必要なプラグイン ID（省略可）

  setup(app, options) {
    const control = app.ui.installMapControl({
      map: app.map,
      position: "topright",
      className: "my-plugin-control",
      createContent() {
        const panel = app.ui.createPanel();
        const button = app.ui.createButton("M");
        button.addEventListener("click", () => {
          app.setStatus("クリックされました");
        });
        panel.appendChild(button);
        return panel;
      },
    });

    // API オブジェクトを返す。destroy() を実装すると app.unuse() 時に呼ばれる
    return {
      doSomething() { /* ... */ },
      destroy() {
        control.remove?.();
      },
    };

    // クリーンアップ関数を直接返すことも可能:
    // return () => { control.remove?.(); };
  },
};

await app.use(myPlugin);
```

### プラグイン ID の規則

- `lower-kebab-case` のみ使用可（小文字英数字とハイフンのみ）
- `tilia-` prefix は built-in 専用の**予約語**
- サードパーティ ID はハイフンを必ず含む（ベンダー prefix または実験用の `x-` prefix を使う）
- 例: `x-milestone`、`acme-heatmap`、`myco-tracker`

### 動的ローディングの規約

文字列 ID を指定すると、デフォルトで `plugins/<plugin-id>/loader.js` から読み込まれます:

```
plugins/
  x-milestone/
    loader.js   ← デフォルトエクスポート、またはプラグイン ID と一致する名前付きエクスポートが必要
```

**特定 ID のパスだけ上書きする場合:**

```js
createDefaultTiliaApp("map", {
  pluginUrls: {
    "x-milestone": "./custom-plugins/x-milestone/loader.js",
  },
});
```

**完全カスタムローダーを使う場合:**

```js
createTiliaApp({
  map,
  pluginLoader: async (pluginId) => {
    return import(`/plugins/${pluginId}/index.js`);
  },
});
```

> **セキュリティに関する注意:** 動的に読み込まれたプラグインは、ページ上の通常の JavaScript と同じ権限で実行されます。Tilia はプラグインコードをサンドボックス化しません。

### 信頼モデルとネットワークに関する前提

- 文字列 ID、`pluginUrls`、`pluginLoader` を通じて読み込まれるリモートプラグインモジュールは、ブラウザから見れば完全に信頼されたコードとして扱われます。
- `tilia-url-import` プラグインは HTTP/HTTPS のみを受け付けますが、リモートサーバーの CORS 設定や可用性にも依存します。
- importmap で参照される CDN 依存関係は、アプリケーション実行時の信頼境界の一部です。

### `setup(app, options)` 内で使える API

```js
// Leaflet のネイティブマップコントロールとしてコンテンツを追加
app.ui.installMapControl({ map, position, className, createContent })

// UI 要素の生成
app.ui.createPanel()                         // スタイル済みの <div>
app.ui.createButton(label)                   // <button>
app.ui.createSelect(optionValues, onChange)  // <select>

// トラック・ウェイポイント・写真のイベントを購読（購読解除関数を返す）
app.subscribeInteractions({ onTrackLayer, onWaypointLayer, onPhotoMarker })

// データ変更後に呼ぶリフレッシュコールバックを登録（購読解除関数を返す）
app.addRefreshHandler(fn)

// すべてのリフレッシュコールバックを呼び出す
app.refreshView()

// 他プラグインへ共有サービスを公開する
app.provide(name, service)

// 他プラグインが公開した共有サービスを参照する
app.services["tilia-panel"]   // { openPanel, closePanel, togglePanel, rerenderPanel, isOpen }
app.services["tilia-status"]  // { setStatus }
```


## サンプル

| サンプル | パス |
|----------|------|
| フル viewer | [`samples/viewer/index.html`](../samples/viewer/index.html) |
| 埋め込みギャラリー | [`samples/embed/index.html`](../samples/embed/index.html) |
| サードパーティプラグイン例 | [`plugins/x-milestone/loader.js`](../plugins/x-milestone/loader.js) |
