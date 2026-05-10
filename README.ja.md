**[English README](README.md)**

# Tilia

[Leaflet 2](https://leafletjs.com/) 上で地理空間データを地図に表示するための JavaScript ライブラリおよびプラグインシステムです。[maps.gpx](../maps-gpx.js) の後継プロジェクトです。

> 現在アルファ版です。予告なく変更が入る可能性があります。


## 概要

Tilia は、ウェブページに地図を手軽に組み込めるランタイムとプラグインシステムを提供します。単独で動くビューアとして使うこともできますし、ブログや CMS のページに地図パーツとして埋め込んだり、プラグインを組み合わせてカスタムの地図アプリを構築したりすることもできます。

機能は**プラグイン**によって提供されます。コアランタイムは小さく保ち、データの読み込みや UI コントロール、可視化はプラグインが担当します。必要なものだけ選んで使うことも、サードパーティプラグインを追加することも、自分でプラグインを作ることもできます。


## クイックスタート

`file://` 直開きはブラウザのセキュリティ制限で動作しないため、ローカル HTTP サーバーが必要です。

```bash
cd <repo-root>
python3 -m http.server 8010
```

付属の viewer を開きます:

```
http://localhost:8010/Tilia/samples/viewer/index.html
```


## 使い方

### ページに地図を埋め込む

コンテナとなる `<div>` を用意して、短いモジュールスクリプトを書くだけです。ビューア用の UI は必要ない場合、プラグインを指定せずデータだけ渡すシンプルな使い方もできます。

```html
<div id="mymap" style="height: 300px;"></div>

<script type="importmap">
{ "imports": {
  "leaflet": "https://unpkg.com/leaflet@2.0.0-alpha.1/dist/leaflet.js",
  "exifr":   "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.js"
} }
</script>

<script type="module">
  import { createDefaultTiliaApp } from "./Tilia/src/index.js";

  const app = createDefaultTiliaApp("mymap");

  const res  = await fetch("./my-track.gpx");
  const blob = await res.blob();
  app.load(new File([blob], "my-track.gpx", { type: blob.type }));
</script>
```

1 ページに複数の地図インスタンスを共存させることもできます。`data-*` 属性でデータを指定するパターンにすれば、CMS テンプレートで同じマークアップを繰り返し利用できます。動作例は [`samples/embed/index.html`](samples/embed/index.html) を参照してください。

### UI コントロールを追加する

`plugins` リストを渡すと、レイヤーパネル・高度プロファイル・ファイル入力などの UI コントロールを有効にできます。

```html
<div id="map" style="height: 100vh;"></div>

<script type="importmap">
{ "imports": {
  "leaflet": "https://unpkg.com/leaflet@2.0.0-alpha.1/dist/leaflet.js",
  "exifr":   "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.js"
} }
</script>

<script type="module">
  import { createDefaultTiliaApp } from "./Tilia/src/index.js";

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
</script>
```

詳細なランタイム API とプラグイン作成ガイドは [docs/API.ja.md](docs/API.ja.md) を参照してください。


## Built-in プラグイン

すべての built-in プラグイン ID は `tilia-` prefix を持ちます。サードパーティプラグインはベンダー prefix または `x-` prefix を使い、`Tilia/plugins/<plugin-id>/loader.js` に配置します。

| ID | 依存 | 説明 |
|----|------|------|
| `tilia-panel` | — | レイヤー・高度・設定プラグインが必要とするサイドパネルコンテナ |
| `tilia-status` | — | パネル内のステータスバー |
| `tilia-layers` | `tilia-panel`, `tilia-status` | レイヤー一覧。表示切替・削除・フィット・写真ごとのタイムモード変更が可能 |
| `tilia-elevation` | `tilia-panel`, `tilia-status` | GPX トラックのインタラクティブな高度プロファイルチャート |
| `tilia-file-import` | — | `.gpx` / `.jpg` / `.jpeg` を選択できるファイル選択コントロール |
| `tilia-url-import` | — | HTTP/HTTPS URL から取得する URL 入力コントロール（サーバー側 CORS 許可が必要） |
| `tilia-settings` | `tilia-panel`, `tilia-status` | 写真タイムスタンプ解釈のデフォルトモード（ローカル / JST / UTC） |
| `tilia-dropzone` | — | 地図全体をドロップ対象にするドラッグ＆ドロップ機能 |

`app.use()` でサードパーティ・カスタムプラグインも追加できます。プラグインの作成にビルドツールは不要です。詳細は [docs/API.ja.md](docs/API.ja.md) を参照。


## 配布・ホスティング

`Tilia/` ディレクトリをそのまま静的ホスティングサービスに配置するだけで動作します。ビルド手順は不要です。

必要なコンテンツ: `src/`, `plugins/`, `samples/`, `docs/`

外部依存は importmap で CDN にピン留めしています。インターネット接続が必要です:
- [Leaflet 2.0.0-alpha.1](https://unpkg.com/leaflet@2.0.0-alpha.1/) (unpkg)
- [exifr 7.1.3](https://cdn.jsdelivr.net/npm/exifr@7.1.3/) (jsDelivr)


## ライセンス

[MIT](../LICENSE)
