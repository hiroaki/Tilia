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