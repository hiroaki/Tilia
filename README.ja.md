[English](README.md)

<a id="tilia"></a>

# Tilia

Tilia は、Web 上でインタラクティブな地図や地理空間アプリケーションを構築するための、拡張可能なフレームワークです。[Leaflet 2](https://leafletjs.com/)をベースにしており、基本的に静的ファイルのみで動作します。

> 初期アルファ版です。APIや動作は予告なく変更されることがあります。

<a id="overview"></a>

## 概要

Tilia は単独のビューアとして使うほか、ブログや CMS への地図の埋め込み、独自の地図アプリケーションの構築にも利用できます。小さなランタイムと任意のプラグインを組み合わせて、必要なデータ形式、表示、操作部品を選べます。また、同じページに複数の独立した地図を配置できます。

- **対応形式：** GPX と JPEG（EXIF）に対応しています。GPX のトラック（`<trk>`）、ルート（`<rte>`）、ウェイポイント（`<wpt>`）はポリラインやマーカーで、JPEG 写真は EXIF の GPS 座標にマーカーで表示します。GPS 座標を持たない写真は、時刻が対応する GPX データから位置を推定できます。
- **レイヤーパネル：** プラグインを有効にするだけで、読み込んだデータをレイヤーとして表示・非表示できるパネルを利用できます。独自の UI を実装する必要はありませんが、公開 API を利用してカスタムした UI を作ることも可能です。
- **柔軟な入力：** アプリケーションからファイルを読み込むほか、ファイル選択、URL 入力、クエリパラメーター、ドラッグ＆ドロップを追加できます。
- **拡張性：** プラグインで機能を追加できます。例として、距離ラベルの表示やトラックの編集機能などがあります。
- **ビルド不要：** ブラウザの ES Modules から、組み込みプラグインや独自プラグインを直接利用できます。

[公開サンプル](https://hiroaki.github.io/Tilia/samples/)をお試しください。

<a id="quick-start"></a>

## クイックスタート

リポジトリをクローンまたはダウンロードし、そのルートを任意の静的 HTTP サーバーで配信します。

Node.js が利用できる場合は、同梱のスクリプトを `npm install` なしで使えます。リポジトリを `http://127.0.0.1:8010` で配信します。別のポートで起動する場合は `npm run serve -- 3000` のように指定できます：

```bash
npm run serve
```

ほかの方法として、たとえば Python なら、次のコマンドでも起動できます：

```bash
python3 -m http.server 8010
```

起動したサーバーの `/samples/`（例：<http://127.0.0.1:8010/samples/>）を開き、ビューアまたは埋め込み例を選びます。ページは HTTP/HTTPS で配信してください。Tilia は ES Modules で構成されており、`file://`で開く方法ではブラウザがモジュールを読み込めません。

<a id="basic-usage"></a>

## 基本的な使い方

<a id="show-a-map"></a>

### 地図を表示する

次の HTML コードをリポジトリのルートに `example.html` として保存し、ブラウザで HTTP サーバー経由で開きます。

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tilia map</title>
  <link rel="stylesheet" href="./src/map/vendor/leaflet/2.0.0-beta.1/leaflet.css" />
  <script type="importmap">
  {
    "imports": {
      "leaflet": "./src/map/vendor/leaflet/2.0.0-beta.1/leaflet.js"
    }
  }
  </script>
</head>
<body>
  <div id="map" style="height: 400px;"></div>
  <script type="module">
    import { createDefaultTiliaApp } from "./src/index.js";

    const app = createDefaultTiliaApp("map");
    await app.ready;
  </script>
</body>
</html>
```

`createDefaultTiliaApp` には既存の要素またはその ID を指定します。コンテナーには高さを設定してください。これで、ページに地図が表示されます。ただし、何もプラグインを追加しないと、地図は表示されるだけで、 GPX や写真などのデータは読み込めません。

<a id="add-plugins"></a>

### プラグインを追加する

プラグインは `plugins` オプションで選びます。以下に三つ、代表的な組み合わせの例を示します。

<a id="embed-a-gpx-map"></a>

#### GPX 地図を埋め込む

`example.html` を編集し、モジュールスクリプトを次の内容に置き換えると、GPX の読み込みと描画が有効になります。

```js
import { createDefaultTiliaApp } from "./src/index.js";

const app = createDefaultTiliaApp("map", {
  plugins: ["tilia-gpx-input", "tilia-gpx-renderer"],
});
await app.ready;

// このあとに GPX ファイルを app.load(file) で読み込みます。埋め込みサンプルを参照してください。
```

[埋め込みサンプル](samples/embed/index.html)に、URL からファイルを読み込む完全な例があります。この利用法は CMS などの再利用可能なテンプレートに適しています。

<a id="build-a-viewer"></a>

#### ユーザーがファイルを読み込むビューアを作る

表示するデータをユーザーに選ばせるには、入力関係のプラグインを追加します。

```js
import { createDefaultTiliaApp } from "./src/index.js";

const app = createDefaultTiliaApp("map", {
  plugins: [
    "tilia-gpx-input", "tilia-gpx-renderer",
    "tilia-file-import", "tilia-url-import", "tilia-dropzone",
  ],
});
await app.ready;
```

これにより、ファイル選択ダイアログを呼び出すコントロール、リモートファイルの入力フォームを呼び出すコントロールが地図上に追加され、さらに地図全体でドラッグ&ドロップも可能になります（リモート URL を入力する場合、その配信元サーバーがクロスオリジンのリクエストを許可している必要があります）。

完全な例は[ビューアのサンプル](samples/viewer/index.html)を参照してください。

<a id="add-photos-or-viewer-controls"></a>

#### 写真やビューアの操作部品を追加する

JPEG を表示するには Photo 系のプラグインを追加します。

またポップアップ、レイヤーパネル、標高、設定には、それぞれに対応する UI プラグインを追加します。

次の例は、前の例に Photo とポップアップのプラグインを加えたものです。

```js
import { createDefaultTiliaApp } from "./src/index.js";

const app = createDefaultTiliaApp("map", {
  plugins: [
    // GPX 関連
    "tilia-gpx-input", "tilia-gpx-renderer", "tilia-gpx-ui",
    // JPEG 写真
    "tilia-jpeg-input", "tilia-photo-renderer", "tilia-photo-ui",
    // 選択の強調表示（ポップアップ表示）
    "tilia-map-selection-presenter",
    // ユーザー入力
    "tilia-file-import", "tilia-url-import", "tilia-dropzone",
    // その他レイヤーパネル、標高、設定などを追加できます。プラグインガイドを参照してください。
  ],
});
await app.ready;
```

すべてのプラグイン、組み合わせ、設定は[Tilia プラグインガイド](docs/PLUGINS.ja.md#photos)を参照してください。

<a id="plugins"></a>

## プラグイン

アプリケーションに必要な機能を選びます。

| 機能グループ | 提供する機能 |
| --- | --- |
| GPX と写真 | データ読み込み、地図描画、形式ごとの UI |
| ビューア操作 | 選択ポップアップと強調表示、レイヤー、標高、設定、ステータス |
| 入力 | ファイル選択、リモート URL、クエリパラメーター、地図全体へのドロップ |
| 背景地図 | 地図選択と、任意の地理院地図・OpenTopoMap プロバイダー |
| 追加ツール | トラックエディタ、GPX 出力、経路検索、選択したトラックの距離標 |

[Tilia プラグインガイド](docs/PLUGINS.ja.md)に、全プラグイン、依存関係、設定、使い方をまとめています。独自プラグインやインストール・後処理の契約は [Tilia プラグイン開発](docs/PLUGIN-OPERATIONS.ja.md)を参照してください。[Tilia アーキテクチャ](docs/ARCHITECTURE.ja.md)では設計原則と各構成要素の寿命を説明しています。公開 API、エラー、アプリケーションのライフサイクルは [Tilia API リファレンス](docs/API.ja.md)を参照してください。

<a id="deployment"></a>

## 配置

地図アプリとなる HTML ページと、それが利用する Tilia コンポーネントの `src/`、`plugins/` を静的ホスティングで配信します。 `src/` と `plugins/` は同じ親ディレクトリに並べて置き、ページの import map、CSS、`src/index.js` のパスをそれに合わせる必要があります。バンドラー、ビルド処理、npm インストールは不要です。

<a id="trust-model"></a>

## 信頼モデル

Tilia はブラウザ内で動作します。プラグインは通常のページ JavaScript として実行されるため、信頼できるコードだけを読み込んでください。リモート読み込みはサーバーの CORS ポリシーに依存し、適切な許可がなければ失敗します。

<a id="contributing"></a>

## コントリビュート

不具合報告、文書の修正、機能の貢献を歓迎します。

- 大きな動作変更や新機能は、先に [Discussions](https://github.com/hiroaki/Tilia/discussions) で相談してください。
- プルリクエストは一つの関心事に絞り、`develop` ブランチを対象にしてください。
- 提出前にテストが通ることを確認してください。
- 貢献にはプロジェクトのライセンスが適用されます。

テストコマンドとローカルでの確認方法は [Tilia の開発](docs/DEVELOPMENT.ja.md)を参照してください。

<a id="license"></a>

## ライセンス

Tilia は [0BSDライセンス](LICENSE)で提供されています。
