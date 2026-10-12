[English](PLUGIN-OPERATIONS.md)

<a id="developing-tilia-plugins"></a>

# Tiliaプラグインの開発

Tiliaプラグインは、データ形式、地図表示、入力ハンドラー、UI、ツールをアプリケーションに追加します。依存関係を宣言し、`setup(context, options)`を実装します。ランタイムは依存プラグインをインストールし、操作権限を保護するPluginContextを渡して、リソースの寿命を管理します。

このガイドでは、現在の仕組みに沿ったプラグインの作成と組み込みを説明します。利用できるプラグインとアプリケーション側の設定は[プラグインガイド](PLUGINS.ja.md)を参照してください。

所有する入力surface、仲裁、consume／decline判定、renderer interaction、Leaflet購読との違いは[公開インタラクション契約](INTERACTIONS.ja.md)を参照してください。

<a id="1-write-a-small-plugin"></a>

## 1. 小さなプラグインを作る

次の例は、地図をクリックした座標を組み込みのステータスサービスに表示します。自分のチェックアウトで`plugins/x-click-status/loader.js`として保存してください。

```js
import { statusServiceKey } from "../../src/index.js";

export default {
  id: "x-click-status",
  requires: ["tilia-status"],
  setup(context, options = {}) {
    const status = context.services.require(statusServiceKey);
    const prefix = options.prefix ?? "Clicked";

    context.map.listen("click", ({ latlng }) => {
      if (!latlng) return;
      status.set(`${prefix}: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`);
    });
  },
};
```

このモジュールは作成するための例で、同梱プラグインではありません。`requires`により、セットアップ前に`tilia-status`がインストールされます。`context.map.listen`はリスナーを所有し、コールバックの操作権限を保護します。プラグイン削除時にはリスナーも自動的に取り除かれるため、この例では追加の後処理を返す必要はありません。

購読するのはMapまで届いたclickだけで、消費済みのobject clickは届かない場合があります。Hostのinteractionを消費せず、標準の背景選択解除も止めません。setup中も即座に有効になるため、正常インストール後にだけ開始する場合は`lifecycle.afterCommit`を使います。callbackエラーと非同期作業はプラグイン側で処理してください。[HostとLeafletの違い](INTERACTIONS.ja.md#host-versus-leaflet)を参照してください。

プラグインIDは小文字のkebab-caseを使います。`tilia-`名前空間はカタログの組み込みプラグイン用です。独自プラグインには`acme-overlay`や`x-click-status`のようなベンダーまたは実験用の接頭辞を付けてください。

<a id="2-install-the-plugin"></a>

## 2. プラグインをインストールする

<a id="import-a-definition-directly"></a>

### 定義を直接importする

例のモジュールを作成した後、リポジトリのルートにあるページから次のように利用します。

```js
import { createDefaultTiliaApp } from "./src/index.js";
import clickStatus from "./plugins/x-click-status/loader.js";

const app = createDefaultTiliaApp("map", {
  plugins: [[clickStatus, { prefix: "Position" }]],
});
await app.ready;
```

LeafletのCSS、import map、高さを持つコンテナーは[README](../README.ja.md#basic-usage)の設定を使います。依存する組み込みのステータスは標準カタログに含まれます。

起動後に`await app.use(clickStatus, options)`で定義をインストールすることもできます。起動時のプラグイン指定にはID文字列、`[definitionOrId, options]`、`{ plugin: definitionOrId, options }`を使えます。文字列は`pluginOptions[id]`を参照し、配列・オブジェクト形式は自分のオプションを使います。このマップとのマージは行いません。

<a id="register-a-lazy-catalog-entry"></a>

### 遅延読み込み用のカタログに登録する

IDで使えるようにするには、エクスポートされたカタログを拡張します。

```js
import { createDefaultTiliaApp, builtins } from "./src/index.js";

const app = createDefaultTiliaApp("map", {
  builtins: [
    ...builtins,
    {
      id: "x-click-status",
      requires: ["tilia-status"],
      load: () => import("./plugins/x-click-status/loader.js"),
    },
  ],
  plugins: [["x-click-status", { prefix: "Position" }]],
});
await app.ready;
```

`builtins`オプションはカタログ全体を指定するため、リポジトリの項目を残すには`...builtins`を含めます。`load()`は実装またはdefault実装を持つモジュールを返します。実装の`id`はメタデータと一致し、`setup`関数を持つ必要があります。モジュールは要求されたときにだけ読み込まれます。`plugins/<id>/loader.js`というファイルを置くだけでは、未登録のIDは発見されません。

遅延インストールではカタログの`requires`が依存関係の基準です。直接渡した定義は自分の依存メタデータを持ちます。両方の形式で公開する場合は宣言を一致させてください。命名規則によるURL解決、`pluginUrls`／`pluginLoader`オプション、移行用の許可リストはありません。

<a id="dependencies-options-and-removal"></a>

### 依存関係、オプション、削除

依存プラグインは利用側より先にインストールされます。依存先の欠落や循環があると失敗します。自動インストールされる依存先のオプションは`{}`です。前提プラグインに設定が必要なら、利用側より先に明示的に指定・インストールします。

```js
await app.use("tilia-status", { position: "bottomright" });
await app.use(clickStatus, { prefix: "Position" });
```

有効なプラグインに`use`を呼んでも、既存のハンドルを返すだけで、セットアップの再実行やオプションの変更は行いません。インストールと削除はホスト側が管理します。

```js
const handle = await app.use(clickStatus);
await app.unuse(handle); // A plugin ID also works.
```

ハンドルは不透明な`{id}`で、サービスAPIではありません。`app.hasPlugin(id)`と`app.listPlugins()`で有効なプラグインを調べます。インストール・削除は直列化されます。前提プラグインより先に利用側を削除してください。利用側を削除しても依存先は自動削除されません。ドメインプロバイダーの削除は、エントリーや作成中のリースによっても阻止される場合があります。

<a id="3-understand-setup-and-plugincontext"></a>

## 3. setupとPluginContextを理解する

セットアップは同期・非同期のどちらでも構いません。受け取るのはアプリケーションやランタイムではなく`context`です。戻り値は次のいずれかにします。

- context所有のリソースだけで後処理を賄える場合は`undefined`。
- 後処理関数。
- `dispose`メソッドだけを持つオブジェクト。

後処理はPromiseを返せます。セットアップからサービスAPIを返さず、`context.services.provide`で登録してください。定義直下の`destroy`、`dispose`、`stylesheets`、`optionalRequires`には対応していません。

contextには次の操作機能があります。

| 機能 | 用途 |
| --- | --- |
| `plugin` | 不変のプラグイン識別情報（`id`） |
| `scope` | リソース所有、子の寿命、キャンセル、操作権限の保護 |
| `lifecycle` | セットアップ中に限る`afterCommit`コールバック登録 |
| `map` | 所有されるリスナー・レイヤー・コントロール・paneと地図操作 |
| `services` | 型付きサービスの提供、必須・任意取得、購読 |
| `inputs` | 入力ハンドラー登録、入力の振り分け、ハンドラーの検出状態の監視 |
| `domains`, `entries`, `selection` | 意味上のデータのプロバイダー、データ操作、現在の選択 |
| `renderers`, `rendering`, `presentation`, `interactions` | 描画の登録、表示状態、表示ハンドル、操作リソース |
| `contributions` | ツールバー、レイヤー行、ポップアップ、設定の提供 |
| `ui` | 割り当てられたUI領域とドロップ先 |
| `styles` | 共有スタイルシートのリース |
| `baseMaps` | 背景地図の定義の登録と選択 |
| `diagnostics` | `report(error)`によるプラグインエラーの報告 |

これらは操作権限を保護するファサードです。内部ストアを直接保持したり、別のレンダラーの非公開レイヤーにアクセスしたりしないでください。意味上のデータを読むクエリはスナップショットを返し、コマンドには所定のリビジョン検証が必要です。[意味上のデータと表示のAPI](API.ja.md#semantic-and-display-apis)を参照してください。

<a id="commit-and-setup-failure"></a>

### コミットとセットアップ失敗

レジストリーへの登録はセットアップ中に準備状態に置かれます。正常終了後、ランタイムは検証・コミットを行い、プラグインを有効な状態として公開します。セットアップやコミットが失敗すると、所有する作用は巻き戻されます。リスナーやDOMのマウントなどの物理的な作用はセットアップ中にも取得されるため、コミット前から所有者が必要です。

この境界はプラグイン単位です。利用側が失敗しても、既に成功した依存先は自動削除されません。所有者のない通信やページへの作用はランタイムでは巻き戻せません。

正常なインストール後に始める処理は、セットアップ中に`context.lifecycle.afterCommit(callback)`で登録します。コールバックは`void`を返す必要があります。戻されるハンドルの`cancel()`で未実行のコールバックを取り消せます。コールバックのエラーは報告されますが、確定済みのインストールは巻き戻しません。

<a id="4-register-features-through-typed-capabilities"></a>

## 4. 型付きの操作機能で機能を登録する

<a id="services"></a>

### サービス

一つの契約モジュールからエクスポートしたキーを共有します。サービスキーは識別性を持つオブジェクトで、文字列検索ではありません。同じ`id`で別々に作ったキーは相互に置き換えられません。

たとえば独自の契約モジュールから次をエクスポートできます。

```js
import { defineServiceKey } from "../../src/index.js";

export const counterServiceKey = defineServiceKey({
  id: "acme-counter",
  validate: (value) => !!value && typeof value.getCount === "function",
  createFacade({ implementation, assertAvailable }) {
    return {
      getCount() {
        assertAvailable();
        return implementation.getCount();
      },
    };
  },
});
```

提供側と利用側は同じキーをimportします。提供側は`context.services.provide(counterServiceKey, implementation)`で登録し、利用側は`context.services.require(counterServiceKey)`で取得します。必須のサービスなら、提供側のプラグインIDを利用側の`requires`に宣言してください。公開操作ごとに`assertAvailable()`を呼び、いずれかの寿命が終了したら保持済みファサードも使えなくなるようにします。

任意の連携には`context.services.optional(key)`を使います。不在時は`null`を返します。利用可能状態の変化は`context.services.subscribe(key, listener)`で監視できます。保持したファサードは元のプロバイダーに属するため、提供側が変わったら再取得してください。購読も所有するcontextを通じて行い、同時に後処理されるようにします。

<a id="input-and-data"></a>

### 入力とデータ

入力ハンドラーは`context.inputs.register({ id, priority, discovery, recognize, handle })`で登録します。`discovery`は入力UI向けの拡張子・MIME型を記述し、`recognize(input)`が入力を引き受けるか決めます。引き受けた中で単独の最高優先度ハンドラーが処理します。同じ最高優先度の候補が複数あれば`INPUT_HANDLER_CONFLICT`で失敗します。

`handle({input, signal, scope})`には呼び出し単位の寿命が渡されます。非同期処理後、エントリーを作る前にキャンセルとプラグインの操作権限を確認してください。振り分けはハンドラーの結果とエラーを保持します。キャンセルされても、既に作成済みの意味上のエントリーが巻き戻されたとは限りません。実際の[GPXハンドラー](../src/plugins/input/gpx.js)と[JPEGハンドラー](../src/plugins/input/jpeg.js)を参照してください。

型付きドメインキーとコマンドでデータを作成・更新します。入力、ドメイン、レンダラー、UIは別の役割です。ドメインをインストールしてもファイル解析や描画は追加されません。レンダラーは`context.renderers`、UIは`context.contributions`で登録します。[プラグインの選択](PLUGINS.ja.md#choosing-plugins)でホストと提供側の組み合わせを確認してください。

<a id="map-ui-and-styles"></a>

### 地図、UI、スタイル

所有権を管理する次の地図操作を優先します。

| メソッド | 所有権／戻り値 |
| --- | --- |
| `map.listen(type, callback)` | 操作権限を保護するリスナー。`dispose()`ハンドルを返す |
| `map.attachLayer(layer, options)` | 所有されるレイヤーの取り付け。`dispose()`ハンドルを返す |
| `map.mountControl(control)` | 所有されるコントロールの取り付け。`dispose()`ハンドルを返す |
| `map.createPane({name, band})` | プラグイン表示用の非公開paneのリース |
| `map.getViewport()`, `fitBounds`, `panTo`, `setView`, `project`, `unproject` | 操作権限を保護する地図の読み取り・操作 |

地図リスナーのイベントは、Leafletの生イベントではなく、不変の投影データ（`type`、`latlng`、`layerPoint`、`containerPoint`）です。座標は`{lat, lng}`を使います。取り付け時に描画帯域やそのScopeが所有するpaneリースを指定でき、他の所有者のpaneリースは拒否されます。

`context.ui.mountSurface`は、マウント用コールバックに割り当てたコンテナーと子Scopeを渡します。リスナーや一時リソースはそのScopeで所有し、無関係なDOMを変更しないでください。レイヤー行、ポップアップ、設定、ツールバー項目には専用の提供先ホストを使い、別プラグインのコンテナーの存在を仮定しないでください。[PhotoのUI提供](../src/plugins/ui/photo.js)は、提供側とホストの寿命の組み合わせを示します。

スタイルシートは`context.styles.use({id, href})`で読み込みます。同梱素材には`new URL("./styles.css", import.meta.url).href`のような絶対URLを使います。リースは`ready`と`release()`を公開します。同じ定義は最後の解放までスタイルシートを共有し、同じIDで競合する定義は拒否されます。CSSの読み込み成功が処理に必要な場合だけ`ready`を待ってください。

背景地図の提供は`context.baseMaps.register`を使います。`app.baseMaps`はありません。`context.map.advancedLeafletMap()`は地図を借用するアクセスであり、Mapや他のレンダラーのレイヤーの所有権は得られません。プラグインの作用には所有されるハンドルを優先してください。

<a id="5-own-resources-with-scope"></a>

## 5. Scopeでリソースを所有する

各プラグインにはランタイム所有のルートScopeがあります。短い処理、パネルのセッション、エントリーに結び付く表示には子Scopeを作ります。子Scopeは`dispose()`を持ちます。プラグインのルートはプラグインコードではなくランタイムが終了させます。

| Scope API | 用途 |
| --- | --- |
| `signal` | Scope終了時のキャンセル通知 |
| `alive` | ローカルの所有状態。アプリケーションの操作権限全体を示すものではない |
| `assertAlive()` | 所有権またはアプリケーションの操作権限終了後の処理を拒否する |
| `guard(callback)` | 操作権限終了後のコールバックを何もしない処理にする |
| `child({label})` | 入れ子の寿命を作る |
| `defer(disposer, {label, retry})` | 取得前にリソースの後処理を登録する |
| `track(promise, {label, await, cancel})` | 非同期処理を監視し、必要に応じて終了時に待機・キャンセルする |

contextが管理しないリソースは、取得時の参照を使う後処理を直接登録します。

```js
const job = context.scope.child({ label: "delayed-status" });
let timer;
job.defer(() => clearTimeout(timer), {
  label: "status-timer", retry: "safe",
});
timer = setTimeout(job.guard(() => status.set("Ready")), 1000);
```

このセットアップ断片では、最初の例と同じ方法で`status`を取得済みとします。子は親とともに終了しますが、処理が終われば先に破棄できます。取得前に後処理を予約しておくことで、取得中の例外や再入的な終了に対応できます。

破棄処理は取得済みの`dispose`、`unsubscribe`、`release`、タイマーID、DOM参照を使います。後処理中はcontextの通常操作が既に拒否される場合があります。古いリソースの後処理のために、新しいリソースを検索・取得しないでください。

再試行方針の標準は`"never"`です。途中まで実行された失敗処理を繰り返しても安全な場合だけ、`retry: "safe"`を指定してください。成功済みの破棄記録は再実行されません。後処理は最初の例外で停止せず、独立した記録を続行して失敗を報告します。

<a id="6-handle-asynchronous-work"></a>

## 6. 非同期処理を扱う

子Scopeのsignalをキャンセルに使い、各`await`の後に操作権限を再確認します。入口をguardで保護した非同期コールバックも、再開後の確認が必要です。`scope.alive`だけでは不十分です。後処理のためプロバイダーのScopeが物理的に残っていても、アプリケーションの終了が操作を禁止することがあります。

次のセットアップ断片は、ホスト指定のHTTP/HTTPSリクエストをコミット後にだけ開始し、取得済みのステータスサービスで応答を表示します。

```js
context.lifecycle.afterCommit(() => {
  const job = context.scope.child({ label: "status-request" });
  const work = (async () => {
    try {
      const response = await fetch(options.url, { signal: job.signal });
      job.assertAlive();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      job.assertAlive();
      status.set(text);
    } catch (error) {
      if (!job.signal.aborted) context.diagnostics.report(error);
    } finally {
      await job.dispose();
    }
  })();
  context.scope.track(work, { label: "status-request", await: false });
});
```

プラグインのセットアップで`options.url`を渡して検証してください。`afterCommit`コールバックはvoidを返し、Promiseは別途追跡します。追跡は完了を監視するもので、任意の処理をキャンセル可能にするものではありません。

`track`の標準は`await: false`です。所有リソースを安全に解放する前に完了が必須の処理だけに`await: true`を使います。任意の`cancel`コールバックは同期的に完了する必要があります。同じ後処理の完了を待つタスクを、その後処理自身が待つ構成にしないでください。

abortは操作許可の終了とキャンセル要求を示し、物理的な解放の完了は保証しません。必要なリソース準備や破棄処理の引き継ぎは待機しますが、単純な解析や分離を認められた取得処理に一律の待機障壁は設けません。遅れた成功で作用を再作成してはいけません。終了処理が先に進んでいても、遅れた失敗は引き続き追跡されます。

<a id="7-removal-failure-and-application-destruction"></a>

## 7. 削除、失敗、アプリケーションの破棄

<a id="cleanup-order"></a>

### 後処理の順序

Scope終了時はまずツリー全体の権限を取り消し、signalをabortします。その後、タスクのキャンセル、明示的に待機する処理の完了待ち、作成順の逆順での子の終了、setupが返した後処理、登録順の逆順でのローカル記録の破棄を行います。

終了処理の完了Promiseはabort通知前に予約されます。同じ親の終了から始まった子の終了は、重複して開始せず、既存処理の完了を待ちます。以前失敗した子の後処理には、親の後処理中に既存の安全な再試行を行う場合があります。通常の終了の繰り返しは同じ結果を保ち、明示的な安全な再試行は別操作です。破棄処理が自分のScopeの終了完了を待ってはいけません。

セットアップや後処理から、非同期の再開後も含め、アプリケーション／ランタイムの`use`、`unuse`、`destroy`を呼ばないでください。識別可能な同期呼び出しは`PLUGIN_LIFECYCLE_REENTRANT`で拒否します。非同期の自己待機は一般に検出できないため、設計段階で避ける必要があります。

<a id="failed-installation-or-removal"></a>

### インストールや削除の失敗

すべてのエラーをキャンセル扱いせず、`code`、`cause`、関連する詳細を確認します。主なコードは次のとおりです。

| コード | 意味 |
| --- | --- |
| `PLUGIN_UNKNOWN` | 要求したIDの登録メタデータがない |
| `PLUGIN_DEPENDENCY_MISSING`, `PLUGIN_DEPENDENCY_CYCLE` | 依存関係の計画に失敗 |
| `PLUGIN_RESOLUTION_FAILED`, `PLUGIN_IMPLEMENTATION_INVALID` | 読み込みに失敗、または実装が不正 |
| `PLUGIN_SETUP_FAILED`, `PLUGIN_COMMIT_FAILED` | セットアップまたは準備した登録のコミットに失敗 |
| `PLUGIN_HAS_DEPENDENTS` | 有効な利用側が削除を阻止している |
| `PLUGIN_TEARDOWN_FAILED`, `PLUGIN_QUARANTINED` | 後処理が未完了、またはIDをインストールできない |

保護された拡張と意味上のデータ操作には、それぞれ専用のエラーがあります。プロバイダーのリースが残る場合、ドメイン削除の事前検証は終了処理前に拒否できます。後処理失敗でIDが隔離されると、`use`で黙って置き換えることはできません。アプリケーションが動作中なら、再度の`unuse(id)`で既存の再試行可能な残余処理を試せます。ただし成功済み記録は再実行せず、回復も保証しません。内部ヘルパーから公開の再試行・reset・診断APIを想定しないでください。

<a id="whole-application-destruction"></a>

### アプリケーション全体の破棄

ホストは`await app.destroy()`を呼びます。アプリケーションは直ちに利用不可となり、処理中の作業がabortされます。各エントリーの正確なプロバイダーと必須依存先を保持しながらエントリーを削除します。失敗しても独立した後処理は続行し、未解決の所有関係で阻止されたプロバイダーを強制解放しません。所有するLeaflet Mapは最後に取り除きます。

破棄は終端操作です。通常の繰り返し呼び出しは失敗を含む同じ完了を共有し、自動再試行しません。`APP_CLEANUP_FAILED`は元の失敗を保持します。成功後は残ったコンテナーに新しいアプリケーションを作れますが、後処理失敗時は即座の再利用を保証しません。[アプリケーションAPI](API.ja.md#construction-and-ownership)を参照してください。

借用したMapを自分で取り除かないでください。Mapに付随する作用は地図とともに終了し、無関係なページのタイマーやリスナーはその所有者の責任です。Leafletのページ全体の共有基盤はプラグイン所有のハンドラーと区別します。新たな公開の回復APIや特権的な後処理APIは提供しません。

<a id="8-choose-the-right-product-lifetime"></a>

## 8. 機能に適した寿命を選ぶ

エントリーの表示状態、一時的な表示抑制、意味上のデータ、編集セッションには異なる寿命があります。すべてをレンダラーの一部と扱わず、作用に合うScopeを選びます。

- **エントリーに結び付く表示：** Milestoneは`context.entries.bindPresentationLifetime(entryId, {scope})`を使います。論理的な削除で同期的に表示を撤去し、最後の削除通知より前に後処理の完了を待ちます。
- **独立した編集セッション：** Track Editorは元データから下書きを作ります。元の変更・削除やレンダラー削除では、編集やSave Copyは終了しません。Cancelは下書きを捨てて一時的な抑制を解放し、元データを復元しません。アプリケーション／エディタの破棄はセッションを終了します。
- **一時的な抑制：** エディタの抑制は永続的なエントリー／トラックの表示設定とは別です。ユーザー設定を書き換えずに解放してください。
- **外部由来の操作ヘルパー：** 現エディタには限定的に認めた配置の例外があります。他のプラグインにヘルパー内部の所有権や通常の保護されたリソースモデルを迂回する権限を与えるものではありません。[アーキテクチャ（英語）](ARCHITECTURE.md#ui-overlays-and-session-state)を参照してください。

<a id="9-verify-your-plugin"></a>

## 9. プラグインを検証する

インストール、削除、再インストールを試し、リスナー、DOM、スタイル、タイマー、リクエストが蓄積しないことを確認します。リソース取得後にセットアップを失敗させ、後処理を確認してください。非同期処理中にパネルを閉じる、エントリーを削除する、アプリケーションを破棄する操作を試し、その後で処理を完了させ、新しい作用が追加されないことを確認します。

必須プロバイダーは、自分のプラグインが有効な間は依存先削除が阻止されることを確認します。任意プロバイダーは、不在や置き換え後に古いファサードを使い続けないことを確認してください。後処理が失敗し得る場合は、独立した処理が続行され、再試行が明示的に安全と宣言した箇所に限られることを検証します。

テストとサーバーのコマンドは[開発手順](DEVELOPMENT.ja.md)を参照してください。[ランタイムテスト](../tests/plugin-runtime.test.js)、[Scopeテスト](../tests/ownership-scope.test.js)、[contextテスト](../tests/plugin-context.test.js)には現契約の検証例があります。その内部テスト用ファクトリーは、公開アプリケーション生成方法の代替ではありません。
