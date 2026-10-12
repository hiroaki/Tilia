[English](PLUGINS.md)

<a id="tilia-plugin-guide"></a>

# Tiliaプラグインガイド

このガイドでは、リポジトリの組み込み20件と第三者6件のプラグインと、それらを組み合わせるアプリケーション側のオプションを説明します。組み込みのIDと依存は[公式カタログ](../src/builtins.js)、第三者のIDと依存は各`plugins/<id>/loader.js`が基準です。ランタイムは必須依存先を利用側より先にインストールします。あるプラグインを指定しても、その機能グループのすべてが自動でインストールされるわけではありません。

<a id="choosing-plugins"></a>

## プラグインを選ぶ

データ形式ごとに、必要な部分を選びます。

| 部分 | GPX | 写真 | 用途 |
| --- | --- | --- | --- |
| ドメイン | `tilia-gpx-domain` | `tilia-photo-domain` | データエントリーを所有し、コマンドとクエリを公開 |
| レンダラー | `tilia-gpx-renderer` | `tilia-photo-renderer` | エントリーを地図に表示 |
| 入力 | `tilia-gpx-input` | `tilia-jpeg-input` | ファイルを読み、エントリーを作成 |
| UI提供 | `tilia-gpx-ui` | `tilia-photo-ui` | 形式ごとのレイヤー行、ポップアップ内容、設定を追加 |

入力、レンダラー、UIはそれぞれのドメインを必須とし、自動インストールします。ドメインだけではファイルの解析も描画も行いません。UI提供にはホストが必要です。レイヤー行は`tilia-layers`、設定は`tilia-settings`、選択ポップアップと強調表示は`tilia-map-selection-presenter`が受け持ちます。これらのホストは形式ごとの提供プラグインをインストールしません。

ファイル選択、URL、クエリ、ドロップのプラグインは入力の経路です。自分でGPXやJPEGを解析せず、インストール済みのハンドラーに振り分けます。ドメインとレンダラーが導入済みでも、対応する入力プラグインが必要です。

<a id="installation-and-configuration"></a>

## インストールと設定

[README](../README.ja.md#basic-usage)の依存関係設定に従い、`src/index.js`からimportします。以下の例は、その設定とサイズを持つ`map`コンテナーを前提にしています。ページの場所に合わせてimportパスを調整してください。

```js
import { createDefaultTiliaApp } from "./src/index.js";

const app = createDefaultTiliaApp("map", {
  plugins: ["tilia-gpx-input", "tilia-gpx-renderer", "tilia-url-import"],
  pluginOptions: {
    "tilia-url-import": { timeoutMs: 15000, maxBytes: 10 * 1024 * 1024 },
  },
});
await app.ready;
```

`plugins`を省略するとプラグインは有効になりません。カタログは実装を遅延読み込み可能にするもので、全項目を有効にするものではありません。`plugins`には`[idOrDefinition, options]`と`{ plugin: idOrDefinition, options }`も指定できます。文字列は`pluginOptions[id]`を使い、配列・オブジェクト形式は自分のオプションを使います。`pluginOptions`とのマージは行いません。

動的にインストールする場合は次のようにします。

```js
await app.use("x-milestone", {
  formatLabel: (meters) => `${(meters / 1000).toFixed(1)} km`,
});
await app.unuse("x-milestone");
```

`app.use`は不透明な`{id}`ハンドルを返し、プラグインAPIは返しません。`app.hasPlugin(id)`または`app.listPlugins()`で有効なものを確認します。前提プラグインより先に利用側を削除してください。有効な利用側やプロバイダーのリースが削除を阻止する場合があります。レンダラーの削除はドメインのエントリーを削除しません。アプリケーション全体を破棄するときは`await app.destroy()`を呼びます。

<a id="catalog"></a>

## カタログ

「必須依存先」は正確なハード依存関係です。ダッシュは必須プラグインがないことを示し、外部ライブラリ、入力ハンドラー、UI提供が不要という意味ではありません。

<a id="data-and-presentation"></a>

### データと表示

| ID | 必須依存先 | 動作 |
| --- | --- | --- |
| `tilia-gpx-domain` | — | GPXトラック・ルート・ウェイポイント、コマンド、クエリ、選択候補 |
| `tilia-gpx-renderer` | `tilia-gpx-domain` | トラック、ルート、ウェイポイントを地図に描画 |
| `tilia-gpx-input` | `tilia-gpx-domain` | GPX解析、エントリー作成、読み込んだ範囲に地図を合わせる |
| `tilia-gpx-ui` | `tilia-gpx-domain` | GPXのレイヤー行、ポップアップ、エントリーごとの設定 |
| `tilia-photo-domain` | — | 写真のメタデータ、保存した推定位置、プレビューリソース、コマンド |
| `tilia-photo-renderer` | `tilia-photo-domain` | EXIFのGPS座標または保存した推定位置のマーカー |
| `tilia-jpeg-input` | `tilia-photo-domain` | exifrを遅延読み込みしてEXIFを解析するJPEGハンドラー |
| `tilia-photo-ui` | `tilia-photo-domain` | 写真のレイヤー行、ポップアップ、時刻解釈の設定 |
| `tilia-map-selection-presenter` | — | 現在の意味上の選択をポップアップと強調表示で示す |

<a id="viewer-controls-and-input"></a>

### ビューア操作と入力

| ID | 必須依存先 | 動作 |
| --- | --- | --- |
| `tilia-panel` | — | 操作部品・ツール向けの側面／下部パネルホスト |
| `tilia-toolbar` | — | 提供される地図ボタンと操作部品のホスト |
| `tilia-status` | — | 閉じるボタン付きの独立したステータス表示 |
| `tilia-base-maps-control` | — | 登録済み背景地図のセレクター |
| `tilia-layers` | `tilia-panel`, `tilia-toolbar` | エントリーの表示・削除、Delete all、提供されている形式ごとの行 |
| `tilia-elevation` | `tilia-panel`, `tilia-toolbar`, `tilia-gpx-domain` | 対話的なGPXトラック標高グラフ |
| `tilia-file-import` | `tilia-toolbar` | インストール済みハンドラーを使う複数ファイル選択 |
| `tilia-url-import` | `tilia-toolbar` | タイムアウトとサイズ制限のあるURL入力 |
| `tilia-query-import` | — | 操作部品なしでページのクエリパラメーターのURLを読み込む |
| `tilia-settings` | `tilia-panel`, `tilia-toolbar` | 形式別UIが提供するエントリー設定のホスト |
| `tilia-dropzone` | — | 地図全体のファイルドロップ先 |

<a id="optional-tools-and-base-maps"></a>

### 任意のツールと背景地図

これらは`x-`名前空間を使い、`plugins/`に配置されています。固定ディレクトリ規約で探索されるため、IDで有効にできます。

| ID | 必須依存先 | 動作 |
| --- | --- | --- |
| `x-track-editor` | `tilia-gpx-domain`, `tilia-panel`, `tilia-toolbar` | 独立したGPXトラックの下書きを編集し、新しいエントリーとして保存 |
| `x-gpx-export` | `tilia-gpx-domain`, `tilia-panel`, `tilia-toolbar` | 選んだGPXエントリーを`.gpx`ファイルでダウンロード |
| `x-route-search` | `tilia-gpx-domain`, `tilia-toolbar` | Phloemで検索し、Start／Via／Goalウェイポイント付きのトラックとして取り込む |
| `x-milestone` | `tilia-gpx-domain` | 表示されるGPXトラック沿いの距離ラベル |
| `x-gsi-base-maps` | — | 地理院地図の標準（`gsi-std`）と淡色（`gsi-pale`）を登録 |
| `x-opentopomap-base-maps` | — | OpenTopoMap（`opentopomap`）を登録 |

<a id="gpx-viewer"></a>

## GPXビューア

次の構成はファイル、URL、クエリ、ドロップ入力と、レイヤー、選択表示、標高、設定に対応します。パネル、ツールバー、GPXドメインは依存先として導入されます。

```js
const app = createDefaultTiliaApp("map", {
  plugins: [
    "tilia-gpx-input", "tilia-gpx-renderer", "tilia-gpx-ui",
    "tilia-map-selection-presenter", "tilia-layers", "tilia-settings",
    "tilia-elevation", "tilia-status", "tilia-base-maps-control",
    "tilia-file-import", "tilia-url-import", "tilia-query-import",
    "tilia-dropzone", "x-gsi-base-maps", "x-opentopomap-base-maps",
  ],
});
await app.ready;
```

**Open files**、**Load URL**、または地図へのドロップで読み込みます。**Layers**でエントリーを表示・削除し、**Settings**でGPXを設定します。描画した対象をクリックすると選択され、提供されたポップアップを表示します。閉じても意味上の選択は消えません。

標高データのあるトラックには**Elevation**を使います。ホバーでグラフのサンプル位置を地図に示し、クリックで点を選択できます。矢印キーで移動し、EnterまたはSpaceで選択します。地図と連動する表示にはGPXレンダラーも必要です。ルートや独立したウェイポイントはトラックの標高グラフではありません。

[ビューアサンプル](../samples/viewer/index.html)はGPXと写真を組み合わせます。[埋め込みギャラリー](../samples/embed/index.html)は独立した複数の地図を示します。

<a id="photos"></a>

## 写真

JPEG入力プラグインはJPEGファイルの処理時に、exifr 7.1.3を`https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.js`から直接インポートします。ネットワークとCSPでCDNへの接続を許可する必要があります。

LeafletのCSSを含め、モジュールスクリプトより前に次のimport mapを置きます。

```html
<script type="importmap">
{
  "imports": {
    "leaflet": "https://unpkg.com/leaflet@2.0.0-alpha.1/dist/leaflet.js"
  }
}
</script>
```

ファイル選択、レイヤー、設定、ポップアップを持つ写真ビューアの例です。

```js
const app = createDefaultTiliaApp("map", {
  plugins: [
    "tilia-jpeg-input", "tilia-photo-renderer", "tilia-photo-ui",
    "tilia-file-import", "tilia-layers", "tilia-settings",
    "tilia-map-selection-presenter",
  ],
});
await app.ready;
// Pass a JPEG File from your picker to app.load(file).
```

EXIFのGPS座標を優先します。GPSのない写真は、インストール済みGPXドメインが提供する対応する時系列から位置を推定できます。`tilia-gpx-input`を追加し、時刻付きGPXを写真より先に読み込んでください。推定のためにGPXレンダラーは必須ではありません。位置が見つからない場合、写真マーカーは表示されません。

推定結果はPhotoエントリーに保存します。後のGPX変更・削除では自動移動しません。Photo設定の時刻解釈は`auto`、`local`、`utc`、および **Custom offset**（符号と時・分）です。固定オフセットはEnter、またはオフセット操作欄の外へフォーカスを移した時に確定します。関連データや時刻モードの変更、または明示的な再計算で新たな推定を試せます。変更に失敗した場合は確定済み設定と位置を保持します。設定変更による自動的な地図移動は行いません。

JPEGの初期設定は、登録とauto-panより前にJPEGプラグインへ指定します。

```js
pluginOptions: {
  "tilia-jpeg-input": { defaultPhotoTimeMode: "+09:00" },
}
```

標準は`auto`です。不正な既定値はプラグインの初期化時に拒否します。固定オフセットには`+0900`や`Z`も使え、Photoドメインが正規化します。このオプションは今後の読み込みに使い、既存エントリーは変更しません。アプリ全体の既定値setterは追加しません。時刻の意味は[Photoドメイン](API.ja.md#photo-data-commands-and-previews)を参照してください。Embedの2番目の写真では、元の`biwakososui.gpx`と`+09:00`を使います。

新たなGPXを読み込んだ後で再計算を要求するには、次を使います。

```js
const result = await app.load(jpegFile); // A JPEG File supplied by your app.
const view = app.domains.photo.get(result.entry.id);
await app.domains.photo.recomputeDerived(result.entry.id, undefined, {
  expectedRevision: view.revision,
});
```

対応する時系列がない場合は失敗することがあります。単純な埋め込みマーカーには`tilia-jpeg-input`と`tilia-photo-renderer`だけで足ります。写真のポップアップにはUI提供と選択表示を加えてください。

<a id="input-settings"></a>

## 入力設定

`tilia-gpx-input`は`.gpx`の名前または`application/gpx+xml`、`tilia-jpeg-input`は`.jpg`／`.jpeg`の名前または`image/jpeg`を認識します。`app.load`はファイルを導入済みハンドラーに振り分けます。取得したリソースのMIME型が汎用的な場合は、拡張子が役立ちます。これらはURL文字列をファイルとして受け取りません。READMEのようにfetchしてFileに包むか、リモート入力プラグインを使います。

| プラグイン | オプション | 標準値 | 用途 |
| --- | --- | --- | --- |
| `tilia-url-import`, `tilia-query-import` | `timeoutMs` | `15000` | ミリ秒。正の安全な整数で、上限は`2147483647` |
| `tilia-url-import`, `tilia-query-import` | `maxBytes` | `10485760`（10 MiB） | 正の安全な整数。リモート応答本文の最大サイズ |
| `tilia-query-import` | `parameterName` | `"gpx"` | ページのクエリパラメーター名。空でない文字列 |

クエリ読み込みでは、たとえば`?gpx=https%3A%2F%2Fexample.com%2Ftrack.gpx`を付けてビューアを開きます。例示URLは実在するリソースに置き換えてください。最初に一致するパラメーターを読み、入力ハンドラーが使えるようになってから開始します。`app.ready`はこのバックグラウンド読み込みを待ちません。

リモート入力はHTTP/HTTPSだけに対応します。別オリジンのリソースにはCORS許可が必要です。URLとクエリは共通の時間・応答サイズ検証を使いますが、自分の`fetch`やローカル入力には適用されません。バッチのキャンセルやタイムアウトは、確定済みのエントリーを削除しません。

ファイル選択の対応形式は導入済みハンドラーに従います。ファイルとドロップのバッチは順に処理するため、位置推定には対応GPXをJPEGより先に読み込むことが重要です。

<a id="control-placement"></a>

## 操作部品の配置

レイヤー、設定、標高、ファイル、URLの起動ボタンと、ツールバーを使う三つの`x-*`ツールは、`position`、`priority`、`edgePolicy`、`rank`に対応します。ステータスと背景地図セレクターは直接の配置設定に対応しますが、ツールバーの`rank`は使いません。

| オプション | 値／意味 |
| --- | --- |
| `position` | Leafletの配置角：`topleft`, `topright`, `bottomleft`, `bottomright` |
| `priority` | `low`, `normal`, `high` |
| `edgePolicy` | `yield`または`keep`。未指定なら優先度から決定（highはkeep、他はyield） |
| `rank` | ツールバーの並び順の値。標準は`0` |

組み込み起動ボタンの標準は`topleft`、背景地図セレクターは`topright`、ステータスは`bottomleft`です。ファイル入力の優先度は標準でhigh、その他の組み込み起動ボタンはnormalです。ステータス実装の優先度の標準はnormalです。ツールバーホストではなく、提供する各プラグインを設定します。

```js
pluginOptions: {
  "tilia-file-import": { position: "topright", rank: 0 },
  "tilia-layers": { position: "topright", rank: 10 },
  "tilia-status": { position: "bottomleft", priority: "low" },
}
```

これはファクトリーのオプションオブジェクト内の断片です。データ、レンダラー、UI提供、パネル、ツールバー、ドロップのプラグインは、これらの起動ボタン設定を使いません。

<a id="base-maps"></a>

## 背景地図

ファクトリーは標準でOpenStreetMapを提供します。選択UIには`tilia-base-maps-control`、追加の提供元には地理院地図・OpenTopoMapプラグインを使います。登録だけでは現在の地図から切り替わりません。タイルには配信元への接続が必要です。

初期地図は`baseMapOptions`で設定します。独自地図にはURLと適切な帰属表記を持つ完全な定義を渡します。

```js
const app = createDefaultTiliaApp("map", {
  baseMapOptions: {
    center: [35.681236, 139.767125],
    zoom: 10,
    // Default OpenStreetMap definition is retained here.
  },
  plugins: ["tilia-base-maps-control", "x-gsi-base-maps"],
  baseLayerOverrides: {
    "gsi-pale": { visibleInSelector: false },
  },
});
await app.ready;
```

`baseMapOptions`は`mapOptions`、`tileUrl`、`tileOptions`、`baseLayers`、`selectedBaseLayerId`にも対応します。初期選択は地図生成時点で存在する定義を参照する必要があり、プロバイダープラグインの登録は後です。`baseLayerOverrides`は定義IDごとにマージし、`visibleInSelector`などのメタデータや設定を上書きできます。プラグインは保護された`context.baseMaps`で登録・選択します。アプリケーションに`app.baseMaps`はありません。

<a id="track-editor-and-gpx-export"></a>

## Track EditorとGPX出力

GPXビューアに`x-track-editor`または`x-gpx-export`、あるいは両方を追加します。どちらもパネル、ツールバー、GPXドメインを依存先として導入します。入力と描画は別に選びます。

**Track Editor：** GPXエントリーを選び、**Start Edit**の後、下書きトラックのセグメントをクリックして近くの点を編集します。移動、挿入、削除、インスペクター、Undo／Redo、矩形選択は独立した下書きに作用します。**Save Copy**は名前に` (edited)`を付けた新規エントリーを作ります。**Cancel**は下書きを捨て、一時的な元データの表示抑制を解放します。どちらも元を復元・再作成しません。元の変更・削除やGPXレンダラー削除でも編集やSave Copyは続けられます。アプリケーション／エディタの破棄はセッションを終了します。

編集対象はトラックの点だけで、ルートやウェイポイントは保存コピーに含めません。`editablePointRadius`は標準`100`で、クリックした点の前後にある点数を指定します。メートル単位の距離ではありません。非負の整数に対応し、同梱ヘルパーは`Infinity`も受け付けます。操作と制約は[Track Editorガイド（英語）](../plugins/x-track-editor/README.md)を参照してください。

**GPX出力：** **GPX export**を開き、エントリーを選んで**Export GPX**でダウンロードします。`creator`の標準は`"Tilia"`で、出力GPXのcreatorを設定します。編集した下書きは先にコピーとして保存し、出力ツールでその新しいエントリーを選びます。

<a id="route-search"></a>

## 経路検索

`x-route-search`には、別途動作するPhloem互換の`POST /route`サービスが必要です。浮動の検索フォームを提供し、`tilia-panel`は不要です。読み込み結果をGPXトラックとして表示するには`tilia-gpx-renderer`、ポップアップには`tilia-gpx-ui`と選択表示を含めます。

| オプション | 標準値 | 意味 |
| --- | --- | --- |
| `endpoint` | `"http://127.0.0.1:3000/route"` | 経路リクエストの完全なURL |
| `apiKey` | `""` | リクエストに送る任意のAPIキー |
| `timeoutMs` | `5000` | 正のリクエストタイムアウト（ミリ秒） |
| `importLimit` | `3` | 正の値を切り捨てて1〜3に制限。それ以外は3 |
| `defaultProfile` | `"car"` | 初期プロファイル：`car`, `bike`, `foot` |
| `profileOptions` | 3種類すべて | 提供するプロファイルID。不明なIDは除外 |

公開ページではlocalhostの標準値に頼らず、実際のサービスに`endpoint`を設定します。別オリジンにはサーバーのCORS対応が必要です。HTTPSページでは、ブラウザからアクセス可能で、ページのセキュリティポリシーに適合する接続先が必要です。

**Route search**を開き、プロファイル、Start／Goal、任意のVia点を設定して検索します。各結果はStart／Via／Goalウェイポイント付きの新しいGPXトラックエントリーです。実際のサービス契約は[クライアント](../plugins/x-route-search/client.js)と[リクエスト・応答ヘルパー](../plugins/x-route-search/helpers.js)を参照してください。

<a id="distance-milestones"></a>

## 距離目盛り

`x-milestone`はGPXトラックに距離ラベルを表示します。ズームとトラック表示に応じて変わり、エディタの一時抑制に従い、エントリーやプラグインとともに消えます。レンダラー依存は宣言していないため、トラック線も必要なら`tilia-gpx-renderer`を加えます。

| オプション | 標準値／意味 |
| --- | --- |
| `formatLabel` | メートル単位の距離を受け取る関数。標準はメートルまたはキロメートル表示 |
| `intervalDefinition` | `mapping`, `minZoom`, `maxZoom`, `maxNumberOfSigns`, `minIntervalMeters`を持つ完全なオブジェクト。標準オブジェクトを置き換える |

標準の定義は`minZoom: 5`、`maxZoom: 20`、`maxNumberOfSigns: 100`、`minIntervalMeters: 100`です。ズームからメートルへの対応は、5→400000、6→300000、7→200000、8〜9→100000、10〜11→50000、12〜13→20000、14〜15→10000、16〜17→2000、18〜19→1000です。ズーム20以上は最小間隔を使います。標識数設定は可能な場合に粗い間隔を選ぶもので、厳密なマーカー数上限ではありません。

独自定義には、`maxZoom > minZoom`を満たす整数のズーム範囲、正の整数の標識数、正の有限数の最小間隔、正の有限値を持つmappingオブジェクトを渡します。[実装](../plugins/x-milestone/loader.js)を参照してください。

<a id="custom-plugins-and-lifecycle"></a>

## 独自プラグインとライフサイクル

`tilia-`は組み込みID用に予約されています。独自IDには小文字のkebab-caseと、`acme-overlay`や`x-overlay`などのベンダー・実験用接頭辞を使います。

標準配置では`await app.use("x-my-plugin")`でIDから導入します。定義をimportして直接インストールする方法も引き続き使えます。

```js
const { default: plugin } = await import("./plugins/x-my-plugin/loader.js");
await app.use(plugin);
```

このパスは自分で用意するファイルの例です。通常配置の`plugins/<id>/loader.js`はIDだけで導入できます。`await app.use("x-my-plugin")`や起動時のID指定を使い、公式`src/builtins.js`へ登録しないでください。`src/`と`plugins/`の配置は固定で、探索先は設定できません。非標準配置には上記の直接定義か明示アプリカタログを使います。アプリの`builtins`は全体置換で第三者IDも収録できます。

setupはappではなく、保護されたPluginContextを受け取ります。サービス、ドメイン、レンダラー、UI提供、背景地図は型付きの操作機能で登録します。リスナー、レイヤー、コントロール、プレビュー、スタイル、非同期の作用はcontextのScopeとリソースハンドルで所有してください。setupが返すのは`undefined`、後処理関数、`{dispose}`だけで、サービスAPIではありません。setupや後処理からアプリケーションのインストール・削除・破棄を呼ばないでください。

不可分なインストール、失敗時の巻き戻し、削除制約、後処理は[プラグイン開発](PLUGIN-OPERATIONS.ja.md)を参照してください。アプリケーション破棄は終端操作です。繰り返し呼び出しは失敗を含む同じ完了を保ち、成功後は残ったコンテナーに新しいアプリケーションを作れます。プラグインは通常のページコードとして実行され、サンドボックスではありません。
