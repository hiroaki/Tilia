[English](DEPENDENCIES.md)

# 同梱するブラウザ依存ライブラリ

Tiliaは、コンポーネントが所有するLeaflet JS/CSSとexifrを、ブラウザネイティブの
ESモジュールとして配信します。ブラウザ向けの配信に、ビルド、バンドラー、
パッケージ配信サーバー、npmインストールは不要です。npmでバージョンを固定した
LeafletはNodeテスト用であり、ブラウザのサンプルとfixtureはリポジトリに同梱した
配布物を読み込みます。

| ライブラリ | バージョン | 上流の配布元 | 同梱ファイル | ライセンス |
| --- | --- | --- | --- | --- |
| Leaflet | 2.0.0-beta.1 | [公式リリースZIP](https://github.com/Leaflet/Leaflet/releases/download/v2.0.0-beta.1/leaflet.zip) | `leaflet.js`（ESM）、`leaflet.js.map`、`leaflet.css`、`LICENSE` | BSD-2-Clause |
| exifr | 7.1.3 | [公式npm tarball](https://registry.npmjs.org/exifr/-/exifr-7.1.3.tgz) | `dist/lite.esm.js`を`lite.esm.js`として配置、`LICENSE` | MIT |

同梱ファイルはすべて、上流配布物とバイト単位で一致する未改変のコピーです。
Leaflet ZIPのSHA-256はGitHubが公開するダイジェストと一致します。exifrのバンドルも、
従来のバージョン固定の実パーサー用テストfixtureと一致します。アーカイブと各ファイルの
SHA-256は、[Leafletのmanifest](../src/map/vendor/leaflet/2.0.0-beta.1/manifest.json)と
[exifrのmanifest](../src/photo/vendor/exifr/7.1.3/manifest.json)に記録しています。
`npm test`でファイルの完全性、Node用Leafletのバージョンと配布物の一致、
サンプル・fixtureのローカル参照パスを検証します。

LeafletのグローバルビルドはTiliaでは不要なため、同梱していません。beta.1の配布物は
`-src`ビルドではなく、圧縮済みのESMビルドとグローバルビルドです。標準マーカーは
inline SVGを使うため、配信する`images/`ディレクトリはありません。同梱のソースマップは、
未改変のESMファイルと同じディレクトリに配置します。

## 所有権

Coreの地図基盤が`src/map/vendor/leaflet/2.0.0-beta.1/`を所有します。
JPEG入力プラグイン（`tilia-jpeg-input`）は、既存のEXIFアダプターと同じPhoto配下にある
`src/photo/vendor/exifr/7.1.3/`を論理的に所有します。
Photo Domain・Renderer・UIはexifrに依存しません。JPEG入力プラグインをインストールしても
パーサーは読み込まず、最初のJPEG処理時にアダプターとバンドルをimportします。
プラグインを取り外すと、そのプラグインが所有する副作用は解放されますが、ブラウザの
ESモジュールキャッシュは解放されません。

Tiliaとプラグインはすべて、bare specifierの`leaflet`を使ってimportします。
ホストはimport mapの各スコープで同一のモジュールURLへ解決させる必要があり、
プラグインごとに別のLeafletを同梱してはいけません。Leaflet CSSは引き続きホストが
明示的に読み込みます。

## 静的配信

- コンポーネントの依存物を含む`src/`と`plugins/`を、相対配置を保って配信します。
  サンプルを使う場合は、対象のサンプルディレクトリとその素材も含めます。
- HTMLページを基準に、bare specifierの`leaflet`を
  `src/map/vendor/leaflet/2.0.0-beta.1/leaflet.js`へマッピングし、
  `src/map/vendor/leaflet/2.0.0-beta.1/leaflet.css`を読み込みます。
  クラスの同一性を保つため、Tiliaとプラグインで同一のモジュールURLを使います。
- exifrは`src/photo/exif.js`からの相対パスで遅延読み込みします。exifr用のimport map設定は
  不要です。プラグインのインストール時やGPXのみの利用ではバンドルを取得しません。
- HTTP(S)で配信し、JavaScriptとCSSに適切なMIME typeを設定します。ホストページのCSPでは
  同一オリジンのスクリプトを許可する必要があります。ホスト側のインラインスクリプトと
  import mapに必要なポリシーも引き続き必要であり、ローカル同梱だけでCSPが完成するわけではありません。
- 地図タイル、ルーティング、リモートGPX、ナビゲーションの各サービスのネットワーク要件は
  従来どおりです。この変更でなくなるのは、ライブラリのCDNへのリクエストだけです。
- バージョン付きパスは長期キャッシュに対応します。依存物の更新時は、HTMLの参照を切り替える前に
  新しいvendorディレクトリを配信し、古いHTMLがキャッシュされている間は旧ファイルも残します。

## Leaflet betaとの互換性

[公式リリースノート](https://github.com/Leaflet/Leaflet/releases/tag/v2.0.0-beta.1)と
[タグ固定の移行ガイド](https://github.com/Leaflet/Leaflet/blob/v2.0.0-beta.1/MIGRATION.md)を参照してください。
beta.1はBaseline 2022のブラウザ（Safari 15.4以降）を対象とするプレリリースです。

- default exportと入れ子のクラス名は廃止されました。名前付きimportまたはnamespace importを
  使います。Tiliaと同梱プラグインは、すでに名前付きimportとコンストラクターを持つESのサブクラスを使っています。
- `preferCanvas`は廃止されました。ブラウザでは実際のRendererを渡します。
  RendererインスタンスはMapごとに新しく生成し、複数のMapで共有しないでください。

  ```js
  import { Canvas } from "leaflet";
  const app = createDefaultTiliaApp("map", {
    baseMapOptions: { mapOptions: { renderer: new Canvas() } },
  });
  ```

- 標準マーカーは25×46のinline SVGになりました。ベクター座標の小数精度、パン・ズームの
  既定値、タイルのreferrer policyも上流で変更されています。
- イベントの停止状態は非公開のWeakSetで管理されます。Tiliaは`_stopped`へ書き込まず、
  公開APIの`DomEvent.stopPropagation()`を呼び出します。
- ドラッグはdocumentのリスナーではなく、Pointer Captureと要素のリスナーを使います。
  回帰テストでは、EventTargetを横断してネイティブリスナーを監査します。
- 地図のCSSは独立したstacking contextを作り、コントロールとポップアップ以外では
  テキスト選択を無効にします。ホスト独自のpaneでは`user-select: text`が必要になる場合があります。

## 更新

タグで固定した上流の配布物を取得し、公開された完全性情報がある場合はそれを検証してから、
必要なファイルを未改変でコピーします。所有コンポーネントのバージョン付きディレクトリと
manifest、npmの固定バージョンとlockfile（Leafletの場合）、import map、CSSリンク、文書を
まとめて更新します。`npm test`と`npm run test:smoke`を実行し、SVG/Canvasのエディター、
プラグイン、EXIFのライフサイクル、ネストした静的配信を検証してください。
アーキテクチャ監査はTilia自身のモジュールを走査し、manifestに列挙した正確な上流ファイルだけを
依存境界として扱います。別の完全性検証で、上流の全ファイルとその一覧、npm配布物との一致、
ブラウザでのアセットのパス解決を確認します。未登録ファイルがvendorディレクトリ全体の除外によって
監査を免れることはありません。

プラグインの`vendor/`ディレクトリにある独立ライブラリも、Tilia内で直接パッチを当てず、
各ライブラリの上流プロジェクトから更新してください。
