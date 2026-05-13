**[English README](README.md)**

# Tilia

[Leaflet 2](https://leafletjs.com/) 上で地理空間データを地図に表示するための JavaScript ライブラリおよびプラグインシステムです。[maps.gpx](https://github.com/hiroaki/maps.gpx) の後継プロジェクトです。

> 現在アルファ版です。予告なく変更が入る可能性があります。


## 概要

Tilia は、ウェブページに地図を手軽に組み込めるランタイムとプラグインシステムを提供します。単独で動くビューアとして使うこともできますし、ブログや CMS のページに地図パーツとして埋め込んだり、プラグインを組み合わせてカスタムの地図アプリを構築したりすることもできます。

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

付属の viewer を開きます:

```
http://localhost:8010/samples/viewer/index.html
```


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

コンテナとなる `<div>` を用意して、短いモジュールスクリプトを書くだけです。ビューア用の UI は必要ない場合、プラグインを指定せずデータだけ渡すシンプルな使い方もできます。

```html
<div id="mymap" style="height: 300px;"></div>

<script type="module">
  import { createDefaultTiliaApp } from "./src/index.js";

  const app = createDefaultTiliaApp("mymap");

  const res  = await fetch("./my-track.gpx");
  const blob = await res.blob();
  app.load(new File([blob], "my-track.gpx", { type: blob.type }));
</script>
```

1 ページに複数の地図インスタンスを共存させることもできます。`data-*` 属性でデータを指定するパターンにすれば、CMS テンプレートで同じマークアップを繰り返し利用できます。例は [`samples/embed/index.html`](samples/embed/index.html) を参照してください。

公開ページで GPX タイムラインを使って写真位置を推定する場合は、デフォルトの `auto` に任せるより photo time mode を明示指定する方が安全です。`auto` は閲覧者の実行環境にある `local` または `utc` を使うため、あるタイムゾーンでは正しく見えても、別のタイムゾーンではマーカーを置けないことがあります。公開時は `utc` または `+09:00` のような固定オフセットの指定を推奨します。

### UI コントロールを追加する

`plugins` リストを渡すと、レイヤーパネル・高度プロファイル・ファイル入力などの UI コントロールを有効にできます。

```html
<div id="map" style="height: 100vh;"></div>

<script type="module">
  import { createDefaultTiliaApp } from "./src/index.js";

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

すべての built-in プラグイン ID は `tilia-` prefix を持ちます。サードパーティプラグインはベンダー prefix または `x-` prefix を使い、`plugins/<plugin-id>/loader.js` に配置します。

| ID | 依存 | 説明 |
|----|------|------|
| `tilia-panel` | — | レイヤー・高度・設定プラグインが必要とするサイドパネルコンテナ |
| `tilia-status` | — | パネル内のステータスバー |
| `tilia-layers` | `tilia-panel`, `tilia-status` | レイヤー一覧。表示切替・削除・フィット・写真ごとのタイムモード変更が可能 |
| `tilia-elevation` | `tilia-panel`, `tilia-status` | GPX トラックのインタラクティブな高度プロファイルチャート |
| `tilia-file-import` | — | `.gpx` / `.jpg` / `.jpeg` を選択できるファイル選択コントロール |
| `tilia-url-import` | — | HTTP/HTTPS URL から取得する URL 入力コントロール（サーバー側 CORS 許可が必要）。timeout とサイズ上限を設定可能 |
| `tilia-settings` | `tilia-panel`, `tilia-status` | 写真タイムスタンプ解釈のデフォルトモード（Auto / ローカル / UTC） |
| `tilia-dropzone` | — | 地図全体をドロップ対象にするドラッグ＆ドロップ機能 |

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
