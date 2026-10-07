**[English README](README.md)**

# Tilia

[Leaflet 2](https://leafletjs.com/) 上で地理空間データを地図に表示するための JavaScript ライブラリおよびプラグインシステムです。[maps.gpx](https://github.com/hiroaki/maps.gpx) の後継プロジェクトです。

> 現在アルファ版です。予告なく変更が入る可能性があります。


## 概要

Tilia は、ウェブページに地図を手軽に組み込めるランタイムとプラグインシステムを提供します。単独で動くビューアとして使うこともできますし、ブログや CMS のページに地図パーツとして埋め込んだり、プラグインを組み合わせてカスタムの地図アプリを構築したりすることもできます。

GPXでは、単独のウェイポイント（`<wpt>`）、計画されたGPX route（`<rte>`）、記録されたtrack（`<trk>`）をそれぞれ異なるfeature typeとして扱います。

機能は**プラグイン**によって提供されます。コアランタイムは小さく保ち、データの読み込みや UI コントロール、可視化はプラグインが担当します。必要なものだけ選んで使うことも、サードパーティプラグインを追加することも、自分でプラグインを作ることもできます。

動かせるデモがこちらにあります： [https://hiroaki.github.io/Tilia/samples/](https://hiroaki.github.io/Tilia/samples/)


## クイックスタート

`file://` 直開きはブラウザのセキュリティ制限で動作しないため、ローカル HTTP サーバーが必要です。

リポジトリ root で、次のような静的サーバーを使って起動できます。

```bash
python3 -m http.server 8010
```

```bash
ruby -run -e httpd . -p 8010
```

```bash
npm run serve -- 8010
```

サンプルのインデックス・ページを開いてください：

```
http://localhost:8010/samples/
```


Phase 4G の現行 viewer は JPEG Photo の入力・GPS marker・選択 popup/highlight・プレビュー・写真ごとの `auto` / `local` / `utc` 設定に対応しています。撮影時刻のみの写真はレイヤー一覧から選択でき、位置は推定しません。GPX の表示と Photo 位置推定は 4H、URL/drop/elevation・global default/custom offset は 4I、外部編集プラグインは 4J で復旧予定です。下記の未移行機能は現在の composition では無効です。実装と検証結果は [Phase 4G report](plugin-architecture/phase-4/PHASE-4G-IMPLEMENTATION-REPORT.md) を参照してください。

## 使い方

### Leaflet のセットアップ

Tilia を利用するには、Leaflet の JavaScript と CSS をページに読み込む必要があります。画像ファイルの EXIF 情報を利用する場合は exifr も読み込んでください。

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@2.0.0-alpha.1/dist/leaflet.css" />
<script type="importmap">
{ "imports": {
  "leaflet": "https://unpkg.com/leaflet@2.0.0-alpha.1/dist/leaflet.js",
  "exifr":   "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.js"
} }
</script>
```

### ページに地図を埋め込む

コンテナとなる `<div>` を用意して、短いモジュールスクリプトを書くだけです。ビューア用の UI は必要ない場合、Photo の provider・renderer・JPEG handler を指定してファイルを読み込みます。

```html
<div id="mymap" style="height: 300px;"></div>

<script type="module">
  import { createDefaultTiliaApp } from "./src/index.js";

  const app = createDefaultTiliaApp("mymap", {
    plugins: ["tilia-photo-domain", "tilia-photo-renderer", "tilia-jpeg-input"],
  });

  const res  = await fetch("./my-photo.jpg");
  const blob = await res.blob();
  await app.load(new File([blob], "my-photo.jpg", { type: "image/jpeg" }));
</script>
```

1 ページに複数の地図インスタンスを共存させることもできます。`data-*` 属性でデータを指定するパターンにすれば、CMS テンプレートで同じマークアップを繰り返し利用できます。例は [`samples/embed/index.html`](samples/embed/index.html) を参照してください。

### UI コントロールを追加する

`plugins` リストを渡すと、Photo viewer とレイヤー・設定・ファイル入力の最小 UI を有効にできます。

```html
<div id="map" style="height: 100vh;"></div>

<script type="module">
  import { createDefaultTiliaApp } from "./src/index.js";

  createDefaultTiliaApp("map", {
    plugins: [
      "tilia-panel",
      "tilia-photo-domain",
      "tilia-photo-renderer",
      "tilia-jpeg-input",
      "tilia-photo-ui",
      "tilia-map-selection-presenter",
      "tilia-status",
      "tilia-base-maps-control",
      "tilia-layers",
      "tilia-file-import",
      "tilia-settings",
      "x-gsi-base-maps",
      "x-opentopomap-base-maps",
    ],
  });
</script>
```

詳細なランタイム API とプラグイン作成ガイドは [docs/API.ja.md](docs/API.ja.md) を参照してください。


## プラグイン

すべての built-in プラグイン ID は `tilia-` prefix を持ちます。サードパーティプラグインはベンダー prefix または `x-` prefix を使い、`plugins/<plugin-id>/loader.js` に配置します。

現在の plugin 読み込み、依存順序、dynamic loading の契約は [docs/PLUGIN-OPERATIONS.ja.md](docs/PLUGIN-OPERATIONS.ja.md) にまとめています。

| ID | 依存 | 説明 |
|----|------|------|
| `tilia-photo-domain` | — | Photo の semantic provider・private preview・typed commands |
| `tilia-photo-renderer` | `tilia-photo-domain` | 所有された GPS marker generation（位置推定なし） |
| `tilia-jpeg-input` | `tilia-photo-domain` | EXIF を遅延ロードする JPEG handler |
| `tilia-photo-ui` | `tilia-photo-domain` | layers/popup/settings への typed contribution |
| `tilia-map-selection-presenter` | — | 現在の選択に対する独立した popup/highlight |
| `tilia-panel` | — | レイヤー・高度・設定プラグインが必要とするサイドパネルコンテナ |
| `tilia-status` | — | 独立したステータスコントロール |
| `tilia-base-maps-control` | — | ベースマップ選択コントロール。`app.baseMaps` の可視エントリを一覧表示する |
| `tilia-layers` | `tilia-panel` | エントリ単位の表示切替・削除と typed Photo adapter によるファイル名・時刻・プレビュー |
| `tilia-elevation` | `tilia-panel` | GPX トラックのインタラクティブな高度プロファイルチャート |
| `tilia-file-import` | — | InputRegistry の discovery を使うファイル選択。JPEG handler の導入で `.jpg` / `.jpeg` に対応 |
| `tilia-url-import` | — | HTTP/HTTPS URL から取得する URL 入力コントロール（サーバー側 CORS 許可が必要）。timeout とサイズ上限を設定可能 |
| `tilia-query-import` | — | `tilia-url-import` と同じですが、コントロールを持たず、代わりにクエリーパラメータ `gpx` にセットされている URL を入力とします |
| `tilia-settings` | `tilia-panel` | エントリごとの設定 host。Photo は Auto / ローカル / UTC のみ |
| `tilia-dropzone` | — | 地図全体をドロップ対象にするドラッグ＆ドロップ機能 |

このリポジトリには、`plugins/` 配下に optional なサードパーティ形式プラグインも含まれます:

| ID | 依存 | 説明 |
|----|------|------|
| `x-track-editor` | `tilia-panel` | GPX レイヤーの複製（working copy）を作り、トラックポイントを編集して新規レイヤーとして保存する |
| `x-gpx-export` | `tilia-panel` | 選択した GPX レイヤーをローカル `.gpx` ファイルとして書き出す |
| `x-route-search` | — | 左側フォームから Phloem `POST /route` を呼び出し、各検索結果を Start/Via/Goal のウェイポイントを伴う GPX トラックとして取り込む |

`app.use()` でサードパーティ・カスタムプラグインも追加できます。プラグインの作成にビルドツールは不要です。詳細は [docs/API.ja.md](docs/API.ja.md) を参照。


## 配布・ホスティング

このリポジトリのルート内容をそのまま静的ホスティングサービスに配置するだけで動作します。ビルド手順は不要です。

必要なコンテンツ: `src` が必須です。必要に応じて `plugins` を同じディレクトリに配備してください。

外部依存は importmap で CDN にピン留めしています。インターネット接続が必要です:
- [Leaflet 2.0.0-alpha.1](https://unpkg.com/leaflet@2.0.0-alpha.1/) (unpkg)
- [exifr 7.1.3](https://cdn.jsdelivr.net/npm/exifr@7.1.3/) (jsDelivr)


## 信頼モデル

Tilia は完全にブラウザ上で動作します。また、リモートのコードやコンテンツをサンドボックス化しません。

- `app.use("plugin-id")` またはカスタムの `pluginLoader` を通じて読み込まれるサードパーティ製プラグインは、通常のページ JavaScript として実行されます。信頼できるプラグインのみを読み込んでください。
- `tilia-url-import` プラグインは HTTP/HTTPS 経由でリモートの GPX データを取得しますが、対象サーバーの CORS ポリシーにも依存します。リモート URL は信頼されていない入力として扱い、失敗する可能性があることを前提にしてください。
- CDN でホストされている依存関係は、ランタイムの信頼境界の一部です。バージョンは意図的に固定し、更新前に変更内容を確認してください。


## コントリビュート

バグ報告、ドキュメント修正、機能追加など、プロジェクトへの貢献を歓迎します。  
コントリビュートの際は、以下のルールに従ってください。

- 振る舞いが大きく変わる提案や新機能の提案は、まず [Discussions](https://github.com/hiroaki/Tilia/discussions) で相談してください。
- Pull Request は 1 つの関心事に絞ってください。
- Pull Request は `develop` ブランチ向けに作成してください。
- テストがすべて通ることを確認してください。
- コントリビュートされた内容は、このプロジェクトと同じライセンスで提供されるものとします。

リポジトリ固有の開発フロー、テストコマンド、ローカルでの検証手順については、[docs/DEVELOPMENT.ja.md](docs/DEVELOPMENT.ja.md) を参照してください。


## ライセンス

このプロジェクトは Zero-Clause BSD ライセンス（0BSD）の下で提供されています。詳細は [LICENSE](LICENSE) ファイルを参照してください。
