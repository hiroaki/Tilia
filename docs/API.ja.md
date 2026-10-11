[English](API.md)

<a id="tilia-api-reference"></a>

# Tilia APIリファレンス

このリファレンスは`src/index.js`から公開するアプリケーションAPIを説明します。ブラウザの依存関係と完全な埋め込み例は[README](../README.ja.md)、機能の選択は[Tiliaプラグインガイド](PLUGINS.ja.md)、独自プラグインの実装は[Tiliaプラグインの開発](PLUGIN-OPERATION.ja.md)を参照してください。

Tiliaは初期アルファ版であり、APIは変更される可能性があります。エントリーとドメインデータは不変のスナップショットです。地図レイヤーはそのデータを表示するもので、データ操作の成功は非同期の描画完了を意味しません。

<a id="construction-and-ownership"></a>

## 生成と所有権

<a id="create-an-application"></a>

### アプリケーションを生成する

`createDefaultTiliaApp(container, options = {})`は直ちにアプリケーションを返します。`container`は既存のDOM要素またはそのIDです。[README](../README.ja.md#basic-usage)に従い、サイズ、LeafletのCSS、import mapを設定してください。

```js
import { createDefaultTiliaApp } from "../src/index.js";

const app = createDefaultTiliaApp("map", {
  plugins: ["tilia-gpx-input", "tilia-gpx-renderer"],
  baseMapOptions: { center: [35.68, 139.76], zoom: 12 },
});
await app.ready;
```

importパスはホストページがリポジトリのルートより一階層下にある場合の例です。配置場所に合わせて調整してください。各アプリケーションは異なるLeaflet Mapを生成し、所有します。`options.map`を渡すと、値が`undefined`でも`TypeError`になります。外部Mapの注入には対応していません。

| オプション | 意味 |
| --- | --- |
| `plugins` | 起動時にインストールするプラグイン。標準は空リスト |
| `pluginOptions` | `plugins`の文字列指定に適用する、IDごとのオプション |
| `builtins` | 遅延読み込み用メタデータのカタログ。標準は公開されるリポジトリのカタログ |
| `baseMapOptions` | 初期Mapと背景レイヤーの設定。下記参照 |
| `baseLayerOverrides` | IDごとの上書き。`baseMapOptions.baseLayerOverrides`とマージし、最上位の値を優先 |

`plugins`の各項目にはID、`[definitionOrId, options]`、`{ plugin: definitionOrId, options }`を使えます。配列・オブジェクト形式は明示的なオプションを使います。未インストールの必須依存先は空のオプションで自動インストールされます。設定が必要な依存先は利用側より先に指定してください。[プラグインの選択](PLUGINS.ja.md#choosing-plugins)を参照してください。

任意の実装は要求されたときに読み込みます。JPEG入力には、プラグインガイドで説明する固定バージョンの`exifr`のimport map設定も必要です。

<a id="base-map-options"></a>

### 背景地図のオプション

| `baseMapOptions`の項目 | 標準値／意味 |
| --- | --- |
| `mapOptions` | `{}`。Leaflet Mapコンストラクターのオプション |
| `center` | `[35.681236, 139.767125]`。初期の緯度・経度 |
| `zoom` | `10` |
| `baseLayers` | 背景レイヤーの定義。標準はIDが`osm`のOpenStreetMap |
| `selectedBaseLayerId` | 生成時の定義から選ぶ初期レイヤー |
| `tileUrl`, `tileOptions` | 標準の定義を使う場合のタイルレイヤーの変更 |
| `baseLayerOverrides` | IDごとの定義の上書き。入れ子のタイル`options`もマージ |

定義には`id`と`url`が必要です。任意項目は`label`、`provider`、`category`、`options`（帰属表記を含むLeafletのタイル設定）、`attributionLabel`、`isDefault`、`visibleInSelector`です。後からプロバイダープラグインが追加する定義は、初期選択にはなりません。提供元やセレクターの設定は[プラグインガイド](PLUGINS.ja.md)を参照してください。

別途公開される`createBaseMap(container, options = {})`は、これらの背景地図オプションを受け取り、`{ map, tileLayer, baseLayer, baseLayers, baseLayerManager }`を返します。独立したMapを生成し、後処理は呼び出し側の責任です。その結果をTiliaアプリケーションに注入することはできません。

<a id="application-methods"></a>

## アプリケーションのメソッド

| API | 戻り値／動作 |
| --- | --- |
| `ready`, `whenReady()` | 同じPromise。指定プラグインのインストール後に`app`で解決 |
| `use(definitionOrId, options = {})` | 不透明で不変のハンドル`{ id }`で解決するPromise |
| `unuse(idOrHandle)` | 削除完了のPromise。IDまたは`use`のハンドルを指定 |
| `hasPlugin(id)` | プラグインが有効かを示す真偽値 |
| `listPlugins()` | 有効化順に並ぶIDの不変配列 |
| `load(input)` | 選んだ入力ハンドラーの結果で解決するPromise |
| `destroy()` | 終端となるアプリケーションの後処理完了を共有するPromise |
| `map`, `getMap()` | アプリケーション所有のLeaflet Mapを借用 |
| `getBaseLayer()` | 現在のLeafletタイルレイヤー |
| `getBaseMap()` | Mapと現在のタイルレイヤーを含む新しい`{ map, tileLayer }` |
| `entries`, `domains`, `selection`, `rendering` | 下記の操作権限を保護する機能群 |

通常の処理前に準備完了を待ってください。起動失敗時は自動で後処理を開始します。準備完了は指定プラグインのセットアップまでを対象とし、プラグインが始めたバックグラウンド読み込みや描画完了は待ちません。

<a id="install-and-remove-plugins"></a>

### プラグインをインストール・削除する

```js
await app.use("tilia-file-import");
console.log(app.listPlugins());
await app.unuse("tilia-file-import");
```

必須依存先から順にインストールします。有効なプラグインに`use`を呼んでも、再設定せずハンドルを返します。依存するプラグインやエントリーのプロバイダーリースが必要とする間は、削除を拒否することがあります。先に利用側とそのエントリーを削除してください。存在しない有効な形式のIDの削除は何もしません。削除失敗で後処理の義務が残る場合、所有者が安全と指定した義務だけを再試行できます。ライフサイクルの規則は[プラグイン開発](PLUGIN-OPERATIONS.ja.md)を参照してください。

<a id="load-a-file"></a>

### ファイルを読み込む

`load`は準備完了を待ち、該当する登録済みハンドラーに振り分けます。URL文字列をfetchする機能や、キャンセル用の公開第2引数はありません。

```js
const response = await fetch("../samples/embed/biwakososui.gpx");
if (!response.ok) throw new Error(`GPX request failed: ${response.status}`);
const file = new File([await response.text()], "biwakososui.gpx", {
  type: "application/gpx+xml",
});
const { entry } = await app.load(file);
console.log(entry.id);
```

GPXハンドラーは`{ entry, name }`、JPEGハンドラーは`{ entry, name, locationSource }`を返します。`entry`はスナップショットで、Leafletレイヤーではありません。ハンドラーがない場合や競合する場合は失敗します。ファイル・URL入力の操作部品はユーザーの入力を受け付けます。起動時の既定ファイルが不要なら、READMEの例のようにfetchを省き、それらを使えます。

<a id="destroy-an-application"></a>

### アプリケーションを破棄する

`destroy()`はアプリケーションを直ちに終端状態にし、所有作業をabortして、エントリー、プラグイン、リソースの後処理を行い、最後にMapを取り除きます。コンテナーを再利用する前に完了を待ちます。

```js
await app.destroy();
```

コンテナーは残ります。借用したMapを独自に取り除いたり、破棄後に古いMapや保持済みの操作機能を使ったりしないでください。Mapに付随するリソースはMapとともに終了し、無関係なホストのタイマーやページのリスナーはホストの責任です。Leafletの共有document基盤は個別のMapから独立しています。

通常の繰り返し呼び出しは同じ結果を共有し、失敗した後処理を再試行しません。成功すれば同じコンテナーに異なるMapを持つ新しいアプリケーションを作れますが、失敗時は即座の再利用を保証しません。必要なリソース引き継ぎを待つ場合があり、完了はキャンセルに協力しない全タスクの終了を保証するものではありません。

終了開始後も`ready`／`whenReady()`、`destroy()`、`hasPlugin()`、`listPlugins()`は利用できます。検出結果は`false`／空配列になります。その他の操作と保持済みの操作機能は利用が禁止されます。起動中の外部破棄が先に確定すると、未完了の準備Promiseは`APP_DESTROYED`で失敗します。起動失敗が先に確定すると元のエラーを保持します。確定済みの準備結果は変わりません。準備と後処理は別のPromiseです。

<a id="semantic-and-display-apis"></a>

## 意味上のデータと表示のAPI

<a id="entries-and-domain-views"></a>

### エントリーとドメインビュー

エントリーのスナップショットは`{ id, domain, visible }`です。IDはアプリケーション内での識別子です。`domain`は`"gpx"`という文字列ではなく、`gpxDomainKey`などの型付きキーです。ドメインの`get(id)`は`{ entry, revision, snapshot }`を返し、不在や別ドメインの場合は例外になります。後の更新で既存スナップショットは変わらないため、必要に応じて最新ビューを取得してください。

`app.domains`は`gpx`と`photo`を公開します。作成には対応する`tilia-gpx-domain`または`tilia-photo-domain`を直接、または依存先としてインストールする必要があります。入力ハンドラーはファイルを解析し、レンダラーはデータを表示します。正規化されたデータをプログラムから作成するだけなら、どちらも不要です。

| `app.entries`メソッド | 戻り値／動作 |
| --- | --- |
| `list()` | 挿入順の不変エントリー配列 |
| `get(id)` | エントリーのスナップショットまたは`null` |
| `setVisible(id, visible)` | エントリーのスナップショットで解決するPromise。表示指定は真偽値 |
| `remove(id)` | 削除したスナップショット、不在時は`null`で解決するPromise |
| `clear()` | 削除対象エントリーの不変配列で解決するPromise |
| `subscribe(listener, { emitCurrent = true } = {})` | ハンドル`{ unsubscribe() }` |

エントリー全体の表示切り替えは、ドメインのリビジョンや選択を変更しません。`clear`は挿入の逆順に削除し、後処理失敗後も残りを試み、最後に一つのまとめたイベントを通知します。後処理が失敗しても削除自体は確定することがあります。[エラー](#errors-and-extension-boundary)を参照してください。

`emitCurrent`がtrueなら、購読時に最初に`entries.list()`を受け取ります。以降の通知はイベントです。

| `type` | その他の項目 |
| --- | --- |
| `created` | `current`（エントリーのスナップショット） |
| `domain-changed` | `entry`, `previousRevision`, `revision`, `change` |
| `visibility-changed` | `previous`, `current`（エントリーのスナップショット） |
| `removed` | `previous`（エントリーのスナップショット） |
| `cleared` | `removed`（エントリー配列） |

変更だけを受け取る場合は、初期一覧を別途取得します。

```js
const initialEntries = app.entries.list();
const subscription = app.entries.subscribe((event) => {
  console.log(event.type);
}, { emitCurrent: false });
// When the host no longer needs updates:
subscription.unsubscribe();
```

<a id="revision-checked-commands"></a>

### リビジョンを検証するコマンド

両ドメインは`create(value, { visible = true, signal } = {})`を公開し、新しい**エントリーのスナップショット**で解決するPromiseを返します。`signal`を渡す場合はAbortSignalです。公開前のキャンセルは作成を阻止しますが、コミット後のキャンセルは取り消しません。

更新のシグネチャは`(id, value, { expectedRevision })`で、**ドメインビュー**で解決するPromiseを返します。`expectedRevision`は必須で、現在の整数リビジョンと一致する必要があります。意味上のデータ・設定の変更ではリビジョンが進み、変更なしの場合は進みません。Photoのプレビューリソースだけの変更でも、意味上のリビジョンが変わらない場合があります。

コマンド前に最新リビジョンを取得し、他の利用側も編集する場合は古いリビジョンのエラーに対応します。スナップショットを直接変更しないでください。値が不要なコマンドも第3引数にオプションを指定します。

```js
const view = app.domains.gpx.get(entry.id);
await app.domains.gpx.recomputeDerived(entry.id, undefined, {
  expectedRevision: view.revision,
});
```

<a id="gpx-data-and-commands"></a>

### GPXデータとコマンド

`app.domains.gpx.create(document)`は正規化されたデータ、または`{ data: document, preferences }`を受け取ります。対応するGPXの部分集合であり、任意のXML拡張を無損失で保持するものではありません。

- 文書：`{ name, metadata, tracks, routes, waypoints }`。
- トラック：`{ name, description, segments: [{ points }] }`。
- ルート：`{ name, description, points }`。ウェイポイントは個別の点。
- 点：`{ lat, lon, elevation, timestamp, name, description, symbol }`。

座標は`lon`を使います（Leafletでは多くの場合`lng`です）。緯度・経度は地理的な範囲内の有限数です。標高は有限数または`null`、時刻はUnixミリ秒の有限数または`null`です。標高・時刻の省略値は`null`になります。メタデータは`name`、`description`、`timestamp`に対応します。トラック・ルート・ウェイポイントは標準で空配列です。指定するトラックには`segments`配列、セグメント・ルートには`points`配列が必要です。

設定の標準値は`tracksVisible`、`routesVisible`、`waypointsVisible`がすべてtrue、`trackVisibility: {}`、`stylePresetId: "default"`です。トラック別の表示指定は0始まりのインデックスをオブジェクトのキーにします。スナップショットは`{ data, preferences, derived }`で、GPXの`derived`は現在空です。

```js
const entry = await app.domains.gpx.create({
  name: "Example track",
  tracks: [{
    segments: [{ points: [
      { lat: 35.68, lon: 139.76, elevation: 10 },
      { lat: 35.69, lon: 139.77, elevation: 20 },
    ] }],
  }],
});
const view = app.domains.gpx.get(entry.id);
const updated = await app.domains.gpx.updatePoint(entry.id, {
  target: { kind: "track-point", trackIndex: 0, segmentIndex: 0, pointIndex: 1 },
  patch: { elevation: 25 },
}, { expectedRevision: view.revision });
console.log(updated.revision);
```

| GPX更新メソッド | 値の引数 |
| --- | --- |
| `replaceData` | 新しい文書。設定を保ち、範囲外のトラック表示指定を除く |
| `updatePoint` | `{ target, patch }`。patchは`lat`, `lon`, `elevation`, `timestamp`に対応 |
| `setCategoryVisibility` | `{ category: "tracks" \| "routes" \| "waypoints", visible }` |
| `setTrackVisibility` | `{ trackIndex, visible }` |
| `setStylePreset` | 空でないプリセットID。表示上の解釈はレンダラーの責務 |
| `recomputeDerived` | `undefined`。GPXでは現在何も変更しない |

点のpatchで標高・時刻を消すには`null`を使います。指定する値を`undefined`にはできません。エントリー全体の表示と、種類・トラックごとの設定は別の操作です。

<a id="gpx-targets-and-queries"></a>

### GPXの対象指定とクエリ

対象のインデックスは0始まりです。

| `kind` | 必須のインデックス項目 |
| --- | --- |
| `document` | なし |
| `track` | `trackIndex` |
| `segment` | `trackIndex`, `segmentIndex` |
| `route` | `routeIndex` |
| `track-point` | `trackIndex`, `segmentIndex`, `pointIndex` |
| `route-point` | `routeIndex`, `pointIndex` |
| `waypoint` | `waypointIndex` |

クエリは同期処理で、`entryId`と`revision`および下記の項目を持つ不変の結果を返します。対象に`revision`を含めると、古いインデックスの使用を拒否できます。不在の対象は失敗しますが、存在する空の経路は空の結果を返せます。

| メソッド | 結果の項目／対応する対象 |
| --- | --- |
| `getDocument(id)` | `document` |
| `getExtent(id, { target } = {})` | `bounds: { southWest: { lat, lon }, northEast: { lat, lon } }`または`null`。全種類 |
| `getDistance(id, { target } = {})` | `recordedMeters`, `inferredGapMeters`, `totalMeters`。文書、トラック、セグメント、ルート |
| `getElevationProfile(id, { target } = {})` | `profiles: [{ target, samples }]`。文書、トラック、セグメント、ルート |
| `getNearestPoint(id, { target, coordinate })` | `match: { target, point, distanceSquared }`または`null`。トラック、セグメント、ルートの明示指定が必須 |

範囲・距離・標高は、指定がなければ文書全体を対象にします。標高のサンプルは`{ locator, distanceMeters, elevation, edgeKind }`を含み、`edgeKind`は`start`、`recorded`、`inferred-gap`です。標高の欠落は`null`のままです。文書全体の標高結果に独立したウェイポイントは含めません。トラックのセグメント間の隙間は、記録距離とは別の推定距離に加算します。

最近点クエリは既存の点を緯度・経度差の二乗で比較します。`distanceSquared`の単位は度の二乗で、メートルではありません。セグメント上を補間した点を返すものでもありません。有限数の`{ lat, lon }`と経路対象を明示してください。

```js
const distance = app.domains.gpx.getDistance(entry.id);
const nearest = app.domains.gpx.getNearestPoint(entry.id, {
  target: { kind: "track", trackIndex: 0 },
  coordinate: { lat: 35.685, lon: 139.765 },
});
console.log(distance.totalMeters, nearest.match?.target);
```

<a id="photo-data-commands-and-previews"></a>

### Photoデータ、コマンド、プレビュー

`app.domains.photo.create(value)`はデータそのもの、または`{ data, preferences, blob }`を受け取ります。任意の`blob`は所有されるプレビューリソースを提供します。

| データ項目 | 意味／標準値 |
| --- | --- |
| `name` | `"photo"` |
| `coordinate` | 地理的な範囲内の`{ lat, lon }`または`null` |
| `capturedAt` | 有限のUnixミリ秒または`null` |
| `make`, `model` | カメラの文字列。標準は`""` |
| `source` | `{ mediaType, size }`。標準は`"application/octet-stream"`と`0`バイト |

正規化後のデータには`hasGps`が加わります。設定は`requestedTimeMode: "auto" | "local" | "utc"`で、標準は`auto`です。スナップショットは`{ data, preferences, derived }`で、派生項目は`resolvedTimeMode`、`inferredTimestamp`、`inferredLocation`、`locationSource`です。

| Photo更新メソッド | 値の引数 |
| --- | --- |
| `replaceData` | 新しいデータ。置換データで`blob`を明示しない限り、設定とBlobを保持 |
| `setRequestedTimeMode` | `"auto"`、`"local"`、`"utc"` |
| `recomputeDerived` | `undefined`。位置・時刻の推定を明示的に再計算 |

第3引数には`{ expectedRevision }`が必要です。記録済みGPS座標を優先し、GPSがない場合は利用可能な時刻付きGPXを使って推定します。後のGPX変更は確定済みPhotoの自動再計算を行いません。適切な対応がない場合、明示的な再計算も失敗することがあります。

`getPreview(id)`はリソースがなければ`null`、あればハンドルを返します。

| 項目 | 意味 |
| --- | --- |
| `signal` | プレビュー・利用側が無効になった場合、またはハンドル解放時にabort |
| `isCurrent()` | 引き続き使えるか |
| `readUrl()` | 現在のオブジェクトURL。無効な場合は例外 |
| `release()` | この利用側の使用を終了。プロバイダー所有のURLは失効させない |

公開の`handle.url`はありません。signalのabort時には表示画像の参照元を消し、ビューを閉じる際はハンドルを解放してください。URLを自分で失効させないでください。プラグインは`{ scope }`で所有する子孫Scopeに使用を結び付けられます。ホストからの呼び出しは標準でアプリケーションの利用側の寿命に従います。

<a id="semantic-selection"></a>

### 意味上の選択

| `app.selection`メソッド | 戻り値／動作 |
| --- | --- |
| `getCurrent()` | 不変の`{ entryId, domain, ref }`または`null` |
| `request(candidate)` | 選択されたスナップショットで解決するPromise |
| `clear()` | `undefined`で解決するPromise |
| `subscribe(listener)` | 変更だけを通知する`{ unsubscribe() }` |

対応するドメインのファサードから候補を作ります。

```js
const candidate = app.domains.gpx.selection.createCandidate(entry.id, {
  kind: "track", trackIndex: 0,
});
await app.selection.request(candidate);
const current = app.selection.getCurrent();
const selectedTrack = app.domains.gpx.selection.resolve(current.entryId, current.ref);
```

GPX候補には上記の種類とインデックスを使い、呼び出し側のリビジョンは指定しません。Photoは標準対象を使う`app.domains.photo.selection.createCandidate(id)`です。候補は一つのアプリケーションの一つの利用側に発行される不透明な値です。自作、シリアライズ、アプリケーション／プラグインcontext間の受け渡しをしないでください。ドメインの`selection.resolve(id, ref)`は不変のドメインデータ、解決不能な参照なら`null`を返します。不正な参照、不在・別ドメインのエントリーは例外になる場合があります。

選択イベントは`{ previous, current, reason }`です。初期状態は別途`getCurrent()`で取得してください。ドメイン更新では参照を調整または無効化し、エントリー削除でその選択を消します。非表示化、レンダラー削除、ポップアップを閉じる操作では意味上の選択を消しません。Track Editorの下書き選択は独立しています。

<a id="rendering-status"></a>

### 描画状態

| `app.rendering`メソッド | 戻り値／動作 |
| --- | --- |
| `getStatus(id)` | 不変の状態。描画コントローラーがなければ`null` |
| `list()` | 不変の状態配列 |
| `subscribe(listener, { emitCurrent = true } = {})` | ハンドル。最初は状態配列、以降は個別の状態を通知 |
| `retry(id)` | 新しい試行を開始して同期的に状態を返す。表示完了は待たない |

状態には`entryId`、`domain`、`state`、`visible`、`semanticRevision`があります。`state`は`unavailable`、`building`、`active`、`failed`です。世代の項目は`currentToken`／`currentRevision`、`pendingToken`／`pendingRevision`、`fallbackToken`／`fallbackRevision`、`fallbackDisplayed`です。トークンは不透明な値として扱ってください。`lastFailure`はエラー要約または`null`、`cleanupResidualCount`は未完了の後処理記録数です。

描画が利用不可なのは、レンダラー未導入の場合もあります。失敗しても確定済みデータは巻き戻しません。置き換え中は代替表示が残ることがあり、そのリビジョンと意味上のリビジョンを状態で区別できます。世代モデルは[アーキテクチャ（英語）](ARCHITECTURE.md)を参照してください。

<a id="capabilities-for-owned-plugin-views"></a>

### プラグインが所有するビュー向けの操作

PluginContextも利用側ごとの寿命を持つエントリー・ドメイン・選択・描画ファサードを公開します。一部の操作には、ホストコードが通常作らないScopeが必要です。

- `entries.bindPresentationLifetime(id, { scope })`は利用側より下にある所有された子Scopeを必須とします。エントリー削除で子を終了し、返される`{ dispose() }`で先に終了させることもできます。
- `rendering.suppress({ entryId, domain: gpxDomainKey, target: { kind: "track", trackIndex }, expectedRevision, scope })`は、一時的なGPXトラック抑制の`{ dispose() }`を返します。Scopeは利用側に属する必要があります。永続的な表示設定、リビジョン、選択は変更しません。複数リースが重なる場合は全所有者が解放するまで抑制します。
- `rendering.getSuppressionSnapshot()`は不変の`{ entryId, domain, ref }`配列を返します。`subscribeSuppression(listener, { scope, emitCurrent = true } = {})`は`{ unsubscribe() }`を返し、スナップショット配列を通知します。Scopeの標準は利用側で、指定する場合も利用側に属する必要があります。

結び付け・抑制の`dispose()`はPromiseを返します。これらはレンダラーのレイヤーや任意ドメインの抑制を公開するものではありません。所有Scope、サービス、登録、非同期処理は[開発ガイド](PLUGIN-OPERATIONS.ja.md)を参照してください。

<a id="errors-and-extension-boundary"></a>

## エラーと拡張の境界

非同期の失敗を捕捉し、定義された条件には`code`を使います。検証エラーやブラウザのネイティブエラーもあり、すべてが公開のエラークラスとは限りません。

| 契約 | 項目／解釈 |
| --- | --- |
| アプリケーションエラー | `applicationErrorCodes.destroyed`: `APP_DESTROYED`、`cleanupFailed`: `APP_CLEANUP_FAILED` |
| `SemanticError` | `code`, `committed`, `details`, 任意の`cause`。確定済み変更は後の後処理失敗でも残る |
| `ExtensionError` | `code`, `committed`, `details`, 任意の`cause`。コミット後のコールバック失敗は公開を取り消さない |
| `RenderingError` | `code`, 任意の`cause`。一般的な`committed`項目はない |
| 入力振り分けの失敗 | `InputDispatchError`の`code`／`details`に完了・キャンセル・後処理を記録。load失敗でもエントリーが存在する場合がある |
| プラグインの失敗 | `PluginError`の`code`, `details`, 任意の`cause`。依存・ライフサイクル条件は開発ガイド参照 |

アプリケーションの後処理失敗は集約エラーで、`errors`に元の原因、`details.failures`に不変の文脈付き要約を保持します。アプリケーションは終端状態のままです。保持済みの操作や進行中の失敗を、すべてアプリケーションエラーに置き換えるわけではありません。未対応入力やハンドラー競合は`ExtensionError`のコードを保つことがあります。

`PluginError`と`InputDispatchError`はルートからエクスポートしません。存在しないexportをimportせず、項目を確認してください。公開モジュールは`SemanticError`、`ExtensionError`、`RenderingError`、それぞれの`semanticErrorCodes`、`extensionErrorCodes`、`renderingErrorCodes`、および`applicationErrorCodes`をエクスポートします。

プラグインのsetup・後処理からの同期的なアプリケーションライフサイクル呼び出しは`PLUGIN_LIFECYCLE_REENTRANT`で拒否します。それらのコールバックでアプリケーション自身のライフサイクルをawaitしないでください。非同期の自己待機は一般に検出できません。

<a id="other-public-exports"></a>

### その他の公開エクスポート

| エクスポート | 用途 |
| --- | --- |
| `builtins` | リポジトリの遅延カタログ。独自カタログの規則は開発ガイド参照 |
| `gpxDomainKey`, `photoDomainKey` | 共有の型付き識別子。オブジェクトの同一性で比較 |
| `defineDomainKey({ id })` | 識別子を定義。アプリケーションのドメインファサードを作るものではない |
| `defineServiceKey({ id, validate = null, createFacade })` | サービス契約を定義。`createFacade`は必須 |
| `statusServiceKey`, `panelServiceKey`, `gpxQueryServiceKey` | プラグイン向け共有サービス契約 |
| `cloneAndFreezePlainData(value, path = "snapshot")` | 有限の基本値・配列・プレーンオブジェクトを複製し不変化。Date、Blob、Mapなどは拒否 |

型付きIDは小文字の英数字をハイフンで区切ります。同じIDで別々に作ったキーは別の識別子です。提供側と利用側で契約キーを共有してください。プレーンデータのスナップショットには循環参照を含められません。

プラグイン専用のサービス、入力、背景地図、UI提供、表示の登録は[プラグイン開発](PLUGIN-OPERATIONS.ja.md)、オプションは[プラグインガイド](PLUGINS.ja.md)に記載しています。`app.services`や`app.inputs`のようなホストメソッドではありません。内部ストア、レジストリー、Scopeコントローラー、基盤生成関数は公開アプリケーションAPIのエクスポートではありません。深いパスからのimportをJavaScriptのセキュリティ境界にはできません。
