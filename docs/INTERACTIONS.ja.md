[English](INTERACTIONS.md)

# 公開インタラクション契約

プラグインとレンダラーの開発者向けに、現在のAPIを説明します。[プラグイン開発](PLUGIN-OPERATIONS.ja.md)、[Scopeの所有権](PLUGIN-OPERATIONS.ja.md#5-own-resources-with-scope)、[意味上の選択](API.ja.md#semantic-selection)と併せて参照してください。以下の例は`setup(context)`内の断片です。名前付きのアプリケーション関数やオプションはプラグイン側で用意します。

## APIの境界

| API | 利用者と操作 | 所有権、エラー、契約の境界 |
| --- | --- | --- |
| `context.interactions` | 通常プラグイン：`mapSurface()`、`createSurface(options)`、`bind(options)` | 所有するsurfaceとprimary binding、同期判定、Hostの仲裁と診断。詳細は以下 |
| レンダラーの`input.interactions` | レンダラーbuild：世代所有のsurfaceとdomain targetのresolver | staging、現在世代と表示状態の検証。通常プラグインとは異なるfacade |
| `context.map.listen(type, callback)` | プラグイン：Leaflet Mapまで届いたイベントを購読 | プラグイン所有・guard付きの非消費購読。Hostの仲裁やcallbackエラーの個別隔離はない |
| `context.map.advancedLeafletMap()` | 高度な操作：実際のLeaflet Mapを借用 | 取得時に権限検証。保持した生オブジェクトはguardされない。プラグインは作用を所有し、Mapは所有しない |
| `context.selection` | プラグイン：意味上の選択の取得、要求、解除、購読 | consumerに結び付くfacade。domain発行のcandidateと意味上のエラー。物理入力ではない |
| `context.scope`、`context.lifecycle.afterCommit` | プラグイン：作用の所有、インストール後の開始 | 既存のOwnership Kernelとsetupの寿命。開発ガイド参照 |

内部factoryをimportせず、contextのfacadeを使用してください。`createInteractionHost`、`interactionInput`、`createFacade`、`withPublication`、Scope controllerとoperational検査helper、Selection Store／Coordinator、アプリケーションの背景binding設定は内部APIです。存在していても追加のプラグインAPIではありません。公開`app.interactions`はありません。以下の型記述は既存メソッドの説明であり、exportされたTypeScript宣言ではありません。

文書化した操作、所有権の境界、仲裁、判定が契約です。内部の保存形式、非公開の世代token、listener数、正確なエラーメッセージ、未対応の戻り値の組み合わせは安定性の保証に含めません。Leafletのescape hatchを使うコードは、使用するLeafletのバージョンにも依存します。

## surfaceとbinding登録

```ts
context.interactions.mapSurface(): InteractionSurface;
context.interactions.createSurface({
  id: string,
  target: DOMEventTarget | LeafletEvented,
  parent?: InteractionSurface, // 標準：map root
  scope?: Scope               // 標準：consumer scope
}): InteractionSurface;
context.interactions.bind({
  id: string,
  surface: InteractionSurface,
  event: SupportedPhysicalEvent,
  tier: "modal" | "object" | "background",
  scope?: Scope,              // 標準：consumer scope
  handle(input: InteractionInput): InteractionDecision
}): DisposableHandle;         // dispose(): Promise<void>
```

- **handle**はこのHostに属する不透明な識別子です。`id`はラベルであり、検索キーや物理targetの識別子ではありません。
- **target**にはlistenerを登録します。`on/off`または`addEventListener/removeEventListener`が必要です。targetのリソースは別途所有してください。surface作成はlayerの取り付けやDOMのmountを行わず、listenerの取り付けはbinding時にだけ行います。
- **所有Scope**はconsumer自身またはその子孫です。bindingとsurfaceの所有者は、同じconsumer配下の異なる子孫でも構いません。
- **論理的な親**は明示指定し、省略時はmap rootです。DOMの入れ子、Leaflet layer group、イベント伝播から自動推定しません。指定する親は同じHost内の有効なhandleである必要があり、その寿命も子孫の有効性を制限します。親子関係を設定しても親targetの所有権は得られません。

`mapSurface()`は共有のアプリケーション所有rootを返します。プラグインはrootまたは自分のconsumer配下で所有する子surfaceにbindingを登録できます。他consumerの子surfaceへのbindingは拒否します。GPX／Photoの非公開surfaceを検索する公開APIはありません。同じ物理targetには一つのmanaged surface識別子を使ってください。別handleを作ることは、排他規則の迂回やhandler協調のために対応する手段ではありません。

surface自身に`dispose()`はありません。所有Scopeの終了で閉じ、独立した所有者がまだaliveでも子孫surfaceを無効化します。bindingのdisposeはそのbindingだけを除去し、surfaceやtargetは破棄しません。他の有効なevent／tierのbindingは維持できます。surface自体に短い寿命が必要なら専用の子Scopeを使います。

`background`にはmap rootが必須です。同じsurface handle・event・tierではprimary bindingは一つだけです。binding IDの違いやhandlerが辞退するかどうかは関係ありません。登録時に枠を予約し、staging中のrenderer bindingも含みます。競合は登録拒否となり、priority、置換、待機の方針はありません。cleanupが失敗した失効済みbindingは、所有者がaliveの間は枠を保持する場合があります。失効はcleanup成功や即座の枠再利用を保証しません。

surfaceとbindingのIDは空でない文字列が必要です。グローバルな一意性や既存登録の上書きには使いません。

不正なオプション、他Hostや閉じたsurface、未対応event名、不正な所有関係は同期的に拒否します（通常は`TypeError`）。重複登録は現在`Error`を投げます。Scope、世代、adapterの失敗も伝播する場合があります。公開されたinteraction専用エラーコードはありません。正確なメッセージに依存せず、すべてを`RenderingError`と仮定しないでください。

## 入力とeventの範囲

`handle`は不変の投影データを受け取ります。

```ts
interface InteractionInput {
  type: SupportedPhysicalEvent;
  latlng: Readonly<{ lat: number; lng: number }> | null;
  key: string | null;
  button: number | null;
  shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean;
}
```

`type`はbindingのevent名です。座標は配送されたeventの`latlng`をコピーし、DOM座標から地図座標への変換は行いません。key、button、修飾キーは`originalEvent`があればそこから、なければ配送されたeventから取得します。key、button、座標の欠落は`null`、修飾キーの欠落は`false`になります。生event、意味上のhit target、pointer ID、pointer capture、touch一覧、`preventDefault`メソッドは含みません。

登録可能な名前は`click`、`preclick`、`dblclick`、`mousedown`、`mouseup`、`mousemove`、`mouseover`、`mouseout`、`contextmenu`、`keydown`、`keyup`、`pointerdown`、`pointerup`、`pointermove`、`touchstart`、`touchend`です。登録可能とはHostがその名前を扱えるという意味で、すべてのtargetが発行する保証ではありません。同梱のLeaflet 2.0.0-alpha.1 Mapはpointer入力を使い、通常のDOM登録では上記すべてのmouse／touch名を発行しません。逆に`pointerover`、`pointerout`、`pointercancel`、`keypress`、`moveend`などの地図の状態eventはHostの`bind`では受け付けません。

click、preclick、double clickは別eventです。Hostには単／複クリック識別、drag sequence、長押し識別、multi-touch仲裁はありません。touch由来のclickはclick経路を使えますが、端末ごとの長押し／contextmenu挙動はブラウザ・実機検証が必要です。markerのLeaflet `latlng`は、正確なpointer位置ではなくmarker位置を表す場合があります。

## dispatchと仲裁

managed surfaceを通じて届いたoccurrenceについて、そのeventの有効なbindingをスナップショットとして収集し、次の順序で評価します。

1. 入力元と論理的な祖先の`modal`。深いsurfaceを先に評価。
2. 入力元surfaceだけの`object`。祖先のobject bindingは含めない。
3. map rootの`background`。

root modalはobjectのdispatcher内でobject actionより先に評価し、後のMapへの伝播を待ちません。同じsurface内の競合は、登録済みhandlerの並べ替えではなく登録拒否で解決します。競合する登録に対して、導入順に依存しないツール選択方針があるわけではありません。先に予約した枠が後の競合登録を拒否します。

**backgroundはdispatchの段階であり、空白部分のhit testではありません。** objectが消費すれば到達しません。辞退した場合や有効なobject bindingがない場合は、入力元が有効な間は到達できます。現在application compositionはrootの`click/background`を予約し、消費して意味上の選択を解除します。未選択なら状態変更はありません。Map Selection Presenterを削除しても維持します。プラグインはこの枠へ二つ目のbindingを登録できません。root modalによる遮断は通常のobject選択にも先行するため、背景だけの操作権限にはなりません。

各handlerとactionの直前で、bindingのactivity／disposal、所有者の操作権限、surfaceの祖先、有効な世代を再確認します。失効した候補をスキップし、他の有効な候補には既存順序で進みます。入力元のScope／surfaceが無効になれば処理を終了します。入力元世代が古い場合や内部の描画publication中に受信したoccurrenceは、通常背景入力として処理せず、防御的に抑止します。

dispatch中に追加したbindingはそのスナップショットに参加しません。disposeとScope失効は即座に反映します。同じoccurrenceへの再入dispatchは重複実行しません。別occurrenceは独自の現在候補を使って同期的にdispatchできます。callbackに再入がないとは仮定しないでください。

adapter開発者向け：occurrenceは、DOMのnative event、またはLeafletの`originalEvent`（なければ配送オブジェクト）と、event type、Hostの組で識別します。同じoccurrenceの後の伝播では、辞退した場合も仲裁を再実行しません。`preclick`と`click`は別typeです。別の合成occurrenceには新しいevent carrierを渡します。同じcarrierを複数の独立した同type eventに再利用する方法は未対応です。WeakMapの管理方式などの詳細は内部実装です。

## 判定、action、エラー

```ts
type InteractionDecision =
  | { consume: false }
  | { consume: true; run?: () => void | Promise<void> };
```

`handle`は同期的に判定を返します。担当するかどうかを決め、選んだ作用は`run`へ置きます。辞退なら仲裁を続行します。消費は直ちに記録し、native／Leaflet伝播を停止し、権限を再確認してから任意の`run()`を同期的に開始します。actionなしの消費も有効です。

| 状況 | 現在の保証 |
| --- | --- |
| `handle`がthrow、Promise、不正な判定を返す | 診断して防御的に消費。下位Host handlerは実行しない。返されたPromiseのrejectionも監視 |
| 消費判定後にbinding／surface／権限が失効 | actionを開始せず、消費は維持 |
| `run`がthrowまたはreject | 診断。仲裁を再試行せず、下位handlerを実行しない |
| `run`が成功 | 消費は変わらない |

Hostはhandler／actionの失敗を捕捉してアプリケーションの診断へ渡します。診断側の失敗も封じ込めます。登録／cleanupのエラーは、それぞれの同期例外／Promiseのエラー経路に従います。callbackがthrow前に行った状態変更は巻き戻しません。

`{ consume: false, run: someAction }`は対応する判定契約の外です。現在の実装はこの組み合わせの関数値`run`を無視しますが、その許容動作に依存してはいけません。追加プロパティ、特殊なthenable、正確な検証メッセージは公開保証ではありません。この文書化で実行時検証は変更しません。

## ライフサイクルとsetup

Scopeの存在、`alive`、操作権限、cleanup完了は異なります。`alive`はローカルのopen／active状態を表し、trueのままでもshutdownで操作が禁止される場合があります。操作権限の確認には`assertAlive()`、callbackの入口には`guard()`を使います。Scope終了は非同期cleanup完了前に子孫の権限を失効し、signalをabortします。Hostはアプリケーション所有の入力元／rootも検査するため、プラグイン側だけaliveでもアプリ権限終了後はdispatchできません。

bindingの明示的な`dispose()`は、listener除去より先にdispatch対象としての権限を即座に失効させます。除去失敗やcleanup待機で権限は復活しません。返されたPromiseでcleanupエラーを確認してください。子Scopeの終了はそのbinding全体を失効させます。`handle`や伝播停止中にdisposeされても、消費済み判定は維持します。

Hostが防ぐのはhandler／actionの**新しい**呼出しだけです。開始済みの実行を巻き戻したり、`run`のPromiseを自動キャンセルしたり、`await`後の継続を禁止したりしません。rejectionは監視しますが、自動で`scope.track`へ登録したり、shutdownで待機したり、AbortSignalを渡したりはしません。所有者は既存Scopeのsignal、`await`後の権限確認、必要なtask trackingを使います。bindingだけをdisposeしても所有Scopeはaliveのままです。interaction終了で進行中の作業も失効させるなら、操作用の子Scopeを使ってください。

通常の`context.interactions.bind`と`context.map.listen`はsetup中も即座にlistenerを取り付けます。surface作成は所有権だけを登録します。インストール失敗で所有リソースをcleanupしても、実行済みactionや通信は取り消せません。正常インストール後に開始する作用は、setup中にvoidを返す`context.lifecycle.afterCommit` callbackを登録します。そこでの失敗は診断されますが、commit済みプラグインは巻き戻しません。登録競合は明示的に処理してください。

## 既存APIの使用例

以下は、`marker`がプラグイン作成のLeaflet marker、`handleModifiedClicks`がプラグインのオプション、`showLocalCoordinate`がプラグインの関数という前提です。取り付けとsurfaceは異なる所有操作です。終了helperはローカル操作全体を終了し、呼出し側はPromiseをawaitまたはcatchします。

```js
const operation = context.scope.child({ label: "marker-interaction" });
let binding;
context.lifecycle.afterCommit(() => {
  operation.assertAlive();
  const attachment = context.map.attachLayer(marker, { band: "overlays" });
  operation.defer(() => attachment.dispose(), { retry: "safe" });
  const surface = context.interactions.createSurface({
    id: "local-marker", target: marker, scope: operation,
  });
  binding = context.interactions.bind({
    id: "local-marker-click", surface, event: "click", tier: "object",
    scope: operation,
    handle(input) {
      if (!input.latlng || (input.shiftKey && !handleModifiedClicks)) {
        return { consume: false };
      }
      return { consume: true, run: () => showLocalCoordinate(input.latlng) };
    },
  });
});
async function stopLocalOperation() {
  await operation.dispose(); // bindingと取り付けも除去
}
// 登録後にbindingだけを除去する場合：await binding.dispose()。
```

非同期actionでは所有operationのsignalを使用し、中断後に権限を再確認します。以下の`run`断片は、`requestCoordinateInfo`がAbortSignalを受け付ける前提です。`lastResult`に意味上のentryは不要です。

```js
return {
  consume: true,
  run: async () => {
    const result = await requestCoordinateInfo(input.latlng, {
      signal: operation.signal,
    });
    operation.assertAlive();
    lastResult = result;
  },
};
```

非消費のMap購読では、次のようにローカル状態だけを保存できます。複数購読は共存できますが、すべてのmanaged clickがMapへ届く保証はありません。`listener.dispose()`で購読を終了します。これは同期cleanupで、Promiseを返すHost binding handleとは異なります。

```js
let lastCoordinate = null;
context.lifecycle.afterCommit(() => {
  const listener = context.map.listen("click", ({ latlng }) => {
    if (latlng) lastCoordinate = latlng;
  });
  // プラグイン削除前に購読を終了する場合はlistener.dispose()を呼ぶ。
});
```

<a id="host-versus-leaflet"></a>

## HostとLeafletの違い

Hostのconsumeは下位managed handlerを抑止し、native／Leaflet伝播の停止を試みます。`preventDefault`や`stopImmediatePropagation`は呼ばず、Map handlerも無効にしません。同じLeaflet target上の独立したlistenerは実行され得ます。生DOMのcaptureやlayer伝播規則によって、Hostまで入力が届かない場合もあります。

`map.listen`はHost仲裁外でMapを購読し、不変の`{ type, latlng, layerPoint, containerPoint }`を渡します。Hostの許可リストではなく、空でないevent名を受け付けます。consume操作、生event、修飾キー、消費結果はありません。プラグインScopeでguardし、自動除去しますが、callbackのthrowやPromise rejectionを個別捕捉しません。同期エラーをcatchし、非同期作業は明示的にtrack／catchしてください。入口のguardだけでは`await`後を保護しません。Hostや他のnative listenerとの順序はプラグイン契約ではありません。native除去がthrowした場合、`map.listen`の明示的disposeにもHost bindingと同じ失敗時の失効保証はありません。

`advancedLeafletMap()`は借用した生アクセスであり、その後の操作を保護するfacadeではありません。native作用の取得前にcleanupを登録し、callbackにScope guardを使い、中断後の権限を確認し、自分が所有する状態だけを復元してください。Mapを削除したり、他rendererのlayerを操作したり、生handlerがHost仲裁に参加すると期待したりしないでください。未信頼JavaScript向けのsecurity sandboxではありません。

同梱Leafletのソースで確認した違いは次のとおりです。

- `click`より先に`preclick`が発生します。click bindingが消費する前にpopupが閉じる場合があります。Hostはpopup維持を保証しません。
- double-click zoomはMapの独立したlistenerです。`dblclick`消費は無効化の保証ではありません。
- dragging、pointer capture、touch gestureには別のnative handlerと寿命管理が必要です。click消費はこれらをキャンセルしません。
- Mapの`contextmenu`配送自体が、有効なtargetがある場合に`preventDefault`を呼びます。Host判定とは独立です。非消費購読もブラウザのcontext menu挙動を不変にする保証ではありません。

以上はTiliaが使用するLeaflet版のソースを確認した結果であり、端末横断のgesture検証を行ったという意味ではありません。同じLeaflet版のMap（`src/map/Map.js`）、Evented（`src/core/Events.js`）、Popup（`src/layer/Popup.js`）、DoubleClickZoom（`src/map/handler/Map.DoubleClickZoom.js`）の対応実装を参照してください。これらのパスは、この文書ではなくLeafletパッケージを基準にしています。リポジトリ開発では、`npm ci`が[package.json](../package.json)で指定し[package-lock.json](../package-lock.json)で固定した版を導入します。[セットアップ手順](DEVELOPMENT.ja.md#set-up-the-repository)を参照してください。

## renderer interactionと意味上の選択

renderer buildには`input.interactions.createSurface({ id, target, group? })`と`bind({ id, surface, event, consume = true, resolve })`があります。この狭い契約ではsurface／bindingの所有者を世代、論理的な親をmap root、tierをobjectに固定します。`mapSurface`や通常APIのowner／tier変更は公開しません。targetは世代所有、groupは同じ世代のものである必要があります。guardされたbuildの`input.scope`やその子を、通常interactionのownerとして渡さないでください。現在の実装が追加のsurfaceオプションを転送することは公開renderer契約ではありません。登録はbuild準備中にstagingし、ledgerのseal後やin-place update中は禁止します。現在世代と実効表示状態でdispatchを制限します。置換、非表示、登録撤去は、意味上のデータを削除せずに操作権限を失効させ得ます。

`resolve(input, { entryId, domain, semanticRevision, semanticSnapshot })`は同期的にdomain targetを返し、`null`／`undefined`なら辞退します。Hostは現在のissuerの寿命で選択を発行・要求します。通常の`InteractionDecision`と異なり、rendererの`consume:false`でtargetが解決した場合は、背景処理を許しながら選択も要求します。受動観察ではありません。通常のGPX／Photoクリックは消費します。resolver失敗はHost handlerの診断に従い、選択要求のrejectも診断して消費を取り消しません。更新された世代は、古いbuild snapshotではなく現在commit済みのrevision／snapshotを渡します。

物理入力、仲裁、意味上の選択、ローカル状態、表示は別の責務です。選択は`{ entryId, domain, ref }`を保持し、そのconsumerへ発行したcandidateを必要とし、domain adapterが検証します。`context.selection`には`getCurrent`、`request`、`clear`、`subscribe`、`subscribeRequests`があります。初期状態は別途読みます。request通知は同じ選択への再要求も表せますが、物理clickや修飾キーの通知ではありません。Scope／provider／アプリの失効と意味上のエラーは[選択API](API.ja.md#semantic-selection)に従います。

クリック座標は変数やstatus panelへ保存でき、架空のentry、domain provider、selection candidateは不要です。Map Selection Presenterは意味上の選択を観察し、highlight／popupを所有します。標準背景解除は所有しません。既存のTrack EditorとRoute Searchもローカルセッション状態と独立したnative listenerを使いますが、汎用のHost gesture保証を確立するものではありません。

## 制限と未規定の動作

現在のAPIには、消費済み入力の確実な観察、一時的map mode取得、権限譲渡、プラグインによるアプリfallback登録はありません。プラグインの有効化自体はbindingを予約しませんが、setupが`bind`を呼べば予約します。インストールと操作所有は異なる責務であり、現時点で別々のmode APIが存在するという意味ではありません。

同じtargetのsurface別名、内部管理方式、未対応の判定項目、診断の正確な時期／メッセージ、Hostとnative callbackの順序に依存しないでください。内部変更の余地を保つため未規定とします。将来の観察・一時権限の契約には別の判断が必要です。この参照文書は提案APIを利用可能なものとして扱いません。

実装と回帰検証：[Host](../src/interactions/host.js)、[Map facade](../src/map/facade.js)、[generation adapter](../src/rendering/generation.js)、[application composition](../src/application-composition.js)、[Hostテスト](../tests/phase-4f-interactions.test.js)、[application lifecycleテスト](../tests/application-destroy.test.js)。
