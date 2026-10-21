[English](README.md)

<a id="tilia"></a>

# Tilia

[Leaflet 2](https://leafletjs.com/)の地図上にGPXトラック、ルート、ウェイポイント、JPEG写真を表示するJavaScriptライブラリです。[maps.gpx](https://github.com/hiroaki/maps.gpx)の精神を引き継いでいます。

> 初期アルファ版です。APIや動作は予告なく変更されることがあります。

<a id="overview"></a>

## 概要

Tiliaは単独のビューアとして使うほか、ブログやCMSへの地図の埋め込み、独自の地図アプリケーションの構築にも利用できます。小さなランタイムと任意のプラグインを組み合わせて、必要なデータ形式、表示、操作部品を選べます。同じページに複数の独立した地図を配置できます。

- **GPX表示：** 記録されたトラック（`<trk>`）、計画されたルート（`<rte>`）、独立したウェイポイント（`<wpt>`）を、それぞれ異なる種類として扱います。
- **写真地図：** JPEG写真をEXIFのGPS座標に表示します。適切なGPXデータがある場合は、時刻の対応から位置を推定できます。
- **対話的な表示：** 選択した対象のポップアップと強調表示、レイヤーの表示切り替え、標高グラフ、データごとの設定を追加できます。
- **柔軟な入力：** アプリケーションからファイルを読み込むほか、ファイル選択、URL入力、クエリパラメーター、ドラッグ＆ドロップを追加できます。
- **追加ツール：** トラックを編集して新しいコピーを作成し、GPXを出力し、経路サービスで検索し、距離ラベルを表示できます。
- **ビルド不要：** ブラウザのES Modulesから、組み込みプラグインや独自プラグインを直接利用できます。

[公開サンプル](https://hiroaki.github.io/Tilia/samples/)をお試しください。

<a id="quick-start"></a>

## クイックスタート

リポジトリをクローンまたはダウンロードし、そのルートで静的HTTPサーバーを起動します。

```bash
python3 -m http.server 8010
```

`ruby -run -e httpd . -p 8010`も利用できます。Node.jsがある場合は`npm run serve -- 8010`でも起動できます。

[サンプル一覧](http://localhost:8010/samples/)を開き、ビューアまたは埋め込み例を選びます。ページはHTTP/HTTPSで配信してください。`file://`で開く方法では、モジュールとfetchを使う処理に対応できません。

<a id="basic-usage"></a>

## 基本的な使い方

<a id="embed-a-gpx-map"></a>

### GPX地図を埋め込む

次のページをリポジトリのルートに`example.html`として保存し、HTTPサーバー経由で開きます。既存のサンプルトラックを読み込みます。組み込む際は、URLを自分のGPXファイルに置き換えてください。

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tilia GPX map</title>
  <link rel="stylesheet"
        href="https://unpkg.com/leaflet@2.0.0-alpha.1/dist/leaflet.css" />
  <script type="importmap">
  {
    "imports": {
      "leaflet": "https://unpkg.com/leaflet@2.0.0-alpha.1/dist/leaflet.js"
    }
  }
  </script>
</head>
<body>
  <div id="map" style="height: 400px;"></div>
  <script type="module">
    import { createDefaultTiliaApp } from "./src/index.js";

    const app = createDefaultTiliaApp("map", {
      plugins: ["tilia-gpx-input", "tilia-gpx-renderer"],
    });

    try {
      await app.ready;
      const response = await fetch("./samples/embed/biwakososui.gpx");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      await app.load(new File([blob], "track.gpx", {
        type: "application/gpx+xml",
      }));
    } catch (error) {
      console.error("Could not initialize or load the map:", error);
    }
  </script>
</body>
</html>
```

`createDefaultTiliaApp`には既存の要素またはそのIDを指定します。コンテナーには高さを設定してください。この例では標準のOpenStreetMap背景地図を使い、GPX入力プラグインが読み込んだデータの範囲に地図を合わせます。必要な依存プラグインは自動的にインストールされます。

> 起動時に決まったファイルを読み込む必要がない場合は、`fetch`と`app.load`の部分を省き、入力プラグインを有効にできます。ユーザーがローカルファイルを選択したりURLを入力したりするための操作部品と、ファイルの読み込み処理をプラグインが提供します。

同じHTML設定のまま、上のモジュールスクリプトを次の内容に置き換えると、ユーザーの入力を待つ構成になります。

```js
import { createDefaultTiliaApp } from "./src/index.js";

const app = createDefaultTiliaApp("map", {
  plugins: [
    "tilia-gpx-input", "tilia-gpx-renderer",
    "tilia-file-import", "tilia-url-import",
  ],
});
await app.ready;
```

ローカルGPXファイルは**Open files**、リモートファイルのURLは**Load URL**から指定します。プラグインが操作部品と読み込みを提供し、依存するツールバーも自動的にインストールされます。リモートへのリクエストには、引き続き配信元サーバーのCORS許可が必要です。オプションは[入力設定](docs/PLUGINS.ja.md#input-settings)を参照してください。

最初の例の起動時URL読み込みを残し、入力プラグインを追加して、ユーザーが別のファイルも読み込めるようにすることもできます。

<a id="add-photos-or-viewer-controls"></a>

### 写真やビューアの操作部品を追加する

JPEGを表示するにはPhoto入力とレンダラーを有効にし、[Tiliaプラグインガイド](docs/PLUGINS.ja.md#photos)を参照してください。レイヤー操作、ポップアップ、標高、設定には対応するUIプラグインを追加してください。ガイドには組み合わせと設定の例があります。

動作例は[ビューア](samples/viewer/index.html)と[埋め込みギャラリー](samples/embed/index.html)で確認できます。ギャラリーは`data-*`属性から複数の地図にデータを設定する例で、CMSの再利用可能なテンプレートにも適しています。

<a id="application-lifetime"></a>

### アプリケーションの寿命

各アプリケーションは独自のLeaflet地図を作成し、所有します。利用前に`app.ready`を待ってください。SPAのアンマウントなどで地図コンポーネントを取り除く際は、アプリケーションを破棄します。

```js
await app.destroy();
```

破棄を開始するとアプリケーションは直ちに利用できなくなり、後処理の完了後に地図が取り除かれます。コンテナーは残るため、破棄が成功した後は同じコンテナーに新しいアプリケーションを作れます。繰り返し呼んでも、後処理の失敗を含む同じ結果を共有します。外部の地図の注入には対応していません。`app.map`は動作中の地図を借用するためのアクセスです。無関係なタイマーやリスナーは呼び出し側で管理してください。

公開API、エラー、ライフサイクルの詳細は[Tilia APIリファレンス](docs/API.ja.md)を参照してください。

<a id="plugins"></a>

## プラグイン

アプリケーションに必要な機能を選びます。

| 機能グループ | 提供する機能 |
| --- | --- |
| GPXと写真 | データ読み込み、地図描画、形式ごとのUI |
| ビューア操作 | 選択ポップアップと強調表示、レイヤー、標高、設定、ステータス |
| 入力 | ファイル選択、リモートURL、クエリパラメーター、地図全体へのドロップ |
| 背景地図 | 地図選択と、任意の地理院地図・OpenTopoMapプロバイダー |
| 追加ツール | Track Editor、GPX出力、経路検索、距離目盛り |

[Tiliaプラグインガイド](docs/PLUGINS.ja.md)に、全プラグイン、依存関係、設定、使い方をまとめています。独自プラグインやインストール・後処理の契約は[Tiliaプラグイン開発](docs/PLUGIN-OPERATIONS.ja.md)を参照してください。[Tiliaアーキテクチャ](docs/ARCHITECTURE.ja.md)では設計原則と各構成要素の寿命を説明しています。

<a id="deployment"></a>

## 配置

ページと`src/`を静的ホスティングで配信します。第三者プラグインは`plugins/<id>/loader.js`へ配置し、IDで利用できます。`x-`は実験用で、ベンダー接頭辞も同じ扱いです。`src/`と`plugins/`は同じ親に置く固定配置で、探索先は設定できません。公式`src/builtins.js`への第三者登録は不要です。非標準配置には直接定義か明示アプリカタログを使います。サンプルページも配信する場合は`samples/`とその素材を含めます。バンドラーやビルド処理は不要です。

LeafletのJavaScriptをimport mapで読み込み、CSSも含めます。例ではLeaflet `2.0.0-alpha.1`を使います。[依存関係の設定](docs/PLUGINS.ja.md#photos)を参照してください。ページの場所に合わせて`src/index.js`へのimportパスを調整します。

CDNを使う例とリモートの地図タイルにはネットワーク接続が必要です。Leafletをローカルで配信する場合は、そのimport mapと素材のパスを変更してください。

<a id="trust-model"></a>

## 信頼モデル

Tiliaはブラウザ内で動作します。プラグインは通常のページJavaScriptとして実行されるため、信頼できるコードだけを読み込んでください。リモート読み込みはサーバーのCORSポリシーに依存し、失敗することがあります。CDNの依存ライブラリもアプリケーションの一部です。バージョンを固定し、更新内容を確認してから変更してください。

<a id="contributing"></a>

## コントリビュート

不具合報告、文書の修正、機能の貢献を歓迎します。

- 大きな動作変更や新機能は、先に[Discussions](https://github.com/hiroaki/Tilia/discussions)で相談してください。
- プルリクエストは一つの関心事に絞り、`develop`ブランチを対象にしてください。
- 提出前にテストが通ることを確認してください。
- 貢献にはプロジェクトのライセンスが適用されます。

テストコマンドとローカルでの確認方法は[Tiliaの開発](docs/DEVELOPMENT.ja.md)を参照してください。

<a id="license"></a>

## ライセンス

Tiliaは[0BSDライセンス](LICENSE)で提供されています。
