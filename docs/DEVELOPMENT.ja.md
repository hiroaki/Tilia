# Tilia 開発メモ

この文書は、Tilia を利用するアプリ側ではなく、Tilia 本体を開発するコア開発者向けのメモです。


## テスト環境の準備

リポジトリの確認を実行する前に、Node 依存をインストールします。

```bash
npm install
```


## Unit Test

Vitest の suite を実行します。

```bash
npm test
```

unit test では、コアランタイム、parser、plugin lifecycle、built-in plugin の wiring、主要な input/UI helper を確認します。


## Smoke Test

Playwright の smoke suite を実行します。

```bash
npm run test:smoke
```

smoke test では同梱の Node ベース静的サーバーを自動起動し、付属 sample をブラウザで実行して主要フローを確認します。

現在の smoke coverage は次のとおりです。

- viewer の起動
- viewer の file import
- viewer の photo import
- viewer の photo inference
- viewer の URL import
- viewer の settings panel
- viewer の elevation panel
- viewer の dropzone
- embed sample の起動


## ローカルサーバー

sample ページは `file://` ではなく HTTP が必要です。

手動確認時は、リポジトリ root で次を実行します。

```bash
npm run serve -- 8010
```

そのうえで次を開きます。

```text
http://localhost:8010/samples/viewer/index.html
```


## 現段階での考え方

現状はアルファ段階なので、細かい仕様を固定することよりも、主要なユーザーフローの回帰を広く検知できることを優先します。テスト追加時は、些細な UI 詳細に強く依存するものより、ひとまとまりのフローが壊れていないことを確認するものを優先してください。

- 公開 factory の destroy／同一 container 再作成（SVG／Canvas）
- editor の native point drag／矩形 capture／Save Copy 待機中の終了
- Route／remote GPX cancellation、pinned EXIF 遅延 settlement、Photo preview／styles、export URL／timer cleanup

Phase 4B–4H のページは基盤契約の隔離検証のため internal composition injection を保持します。外部 Map の公開 construction API ではありません。application-lifecycle と Phase 4J は公開 factory を使用します。listener 計測では app/editor handler と Leaflet の document 共通 pointer detection／無関係な page owner を区別します。

internal `src/photo/infer-location.js` の offline `inferPhotoLocationFromGpx` は canonical GPX document を受け取り、`phase-4h-inference` regression とともに保持しています。mutable entry の互換 bridge や公開 root-barrel export ではなく pure semantic utility です。`createBaseMap` は独立 utility として保持し、base-layer manager は直接テストします。
