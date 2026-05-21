# Plugin 運用仕様

この文書は、現在の実装に基づく plugin 運用契約を短く固定するためのものです。manifest 自動解決のような新しい仕組みを提案するものではなく、次に plugin を増やすときにインストール順序・依存関係・dynamic loading の前提で迷わないようにすることを目的としています。

## 対象範囲

この文書が扱うのは、現在の以下の挙動です。

- `app.use()` / `app.unuse()`
- `createDefaultTiliaApp(..., { plugins })` による起動時導入
- `requires` の意味
- built-in と third-party plugin ID の扱い
- `pluginUrls` と `pluginLoader` による dynamic loading
- built-in UI stylesheet と plugin 宣言 stylesheet の登録
- panel / floating UI surface の使い方

manifest の自動解決、selective enablement、plugin sandboxing は現在のスコープ外です。

## 現在のモデル

Tilia の plugin lifecycle は 1 系統です。

- 起動時の `plugins: [...]` はあくまで記法上の sugar
- 各エントリは正規化されたうえで、配列順に `app.use(...)` される
- インストール、重複回避、依存確認、teardown 管理の source of truth は常に `app.use(...)`

つまり、起動時の plugin 順序は明示的かつ手動です。

## Plugin ID と所有境界

plugin ID には次の規則があります。

- ID は `lower-kebab-case`
- `tilia-` namespace は built-in plugin 専用の予約語
- third-party plugin は prefix を持ち、少なくとも 1 つハイフンを含む。例: `x-milestone`, `acme-heatmap`

built-in plugin はまず built-in registry から解決されます。文字列 ID が built-in でなければ、Tilia はそれを dynamic loading 対象の third-party plugin として扱います。現在の例として `x-gsi-base-maps` と `x-opentopomap-base-maps` があります。

## `requires` の意味

`requires` は自動解決リストではなく、検証用リストです。

- plugin は `requires: ["tilia-panel", "tilia-status"]` のように依存を宣言できる
- インストール時に、それらの plugin がすでに導入済みかを確認する
- 足りないものがあれば、その場でインストールを失敗させる
- 不足依存を自動導入しない
- 起動時 plugin 配列を依存関係に合わせて並べ替えない

したがって、呼び出し側が順序を正しく与える必要があります。

推奨される起動時パターン:

```js
createDefaultTiliaApp("map", {
  plugins: [
    "tilia-panel",
    "tilia-status",
    "tilia-layers",
  ],
});
```

推奨される手動導入パターン:

```js
await app.use("tilia-panel");
await app.use("tilia-status");
await app.use("tilia-layers");
```

## Dynamic loading の契約

`app.use("plugin-id")` に built-in ではない文字列 ID を渡すと、Tilia は plugin loader を使って解決します。

デフォルト動作:

- `plugins/<plugin-id>/loader.js` をアプリ相対で読み込む
- 通常の ES module として import する

差し替えポイント:

- `pluginUrls`: 特定 plugin のパスだけ上書きする
- `pluginLoader`: 読み込み戦略そのものを差し替える

受け付ける module 形状:

- module 自体が plugin object
- `default` export が plugin object
- `.id` が要求 ID に一致する named export
- それ以外では、module 内で最初に見つかった plugin object

有効な plugin object が見つからなければ、インストールは失敗します。

## Stylesheet の契約

Tilia では JavaScript plugin の読み込みと stylesheet の所有を分けて扱います。

- built-in UI stylesheet は runtime が document ごとに 1 回だけ注入する
- third-party plugin は plugin object に `stylesheets` を宣言できる
- 各 stylesheet は `setup()` 実行前に登録される
- stylesheet entry は文字列、または `{ href, id }` オブジェクトを受け付ける

third-party plugin での推奨形:

```js
const plugin = {
  id: "x-my-plugin",
  stylesheets: [
    new URL("./my-plugin.css", import.meta.url).href,
  ],
  setup(app) {
    // ...
  },
};
```

runtime が受け取るのは plugin object のみなので、相対 stylesheet パスは plugin module 側で解決してください。

## UI surface の契約

Tilia は map container の上に共有 UI surface をいくつか持ちます。

- `panel`: `tilia-panel` のような持続的な side / bottom panel 用
- `floating`: URL import form のような一時的 overlay UI 用

この種の UI は `map.getContainer()` に直接 `appendChild()` せず、`app.ui.mountSurface(...)` または `app.ui.surfaceManager` を通して mount してください。

これにより、重なり順と将来の layout 仲裁を plugin ごとの `z-index` ではなく core runtime 側で管理できます。

## Plugin author 向けの実運用前提

plugin author は次を前提にしてください。

- plugin code は通常のページ JavaScript と同じ権限で動く
- sandbox や capability isolation はない
- 依存順序はインストール前に満たされている必要がある
- plugin 間の共有は `app.provide(...)` と `app.services[...]` を使う
- built-in UI plugin の共通 stylesheet は viewer HTML ではなく core runtime が所有する
- UI plugin の control 配置は `position` と `priority` で調整し、page-level CSS に依存しない
- panel / floating overlay は managed surface を使い、map container DOM を直接いじらない
- teardown は必須ではないが、`destroy()` または cleanup function の返却を推奨する

ある plugin が別 plugin の UI や service surface に依存する場合は、次の 2 つを両方書くのがよいです。

- `requires` による実行時検証
- plugin 文書上での人間向け順序説明

## 現在の非目標

現在の runtime は次を提供しません。

- manifest ベースの依存解決
- 起動時 plugin 順序の自動トポロジカルソート
- capability negotiation に基づく selective enablement
- リモート plugin の sandboxing
- 任意の legacy plugin loader 互換の保証

これらは現行 API の暗黙仕様ではなく、将来の設計課題として扱うべき項目です。