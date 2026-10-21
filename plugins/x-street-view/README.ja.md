# x-street-view

Tiliaの地図上で選択した地点を、Google Street Viewで開くためのプラグインです。

選択した地点の座標の Street View へのリンクを生成します。その際、地図をドラッグした方向をStreet Viewの視線方向に反映します。

## 導入方法

```js
createDefaultTiliaApp("map", {
  plugins: ["x-street-view"],
});
```

既存のアプリケーションには、次のように追加できます。

```js
await app.use("x-street-view");
```

## 使い方

1. 地図上をクリックして地点を選択します。選択地点の隣に「Street View」ボタンが表示されます。
2. 地図をドラッグして視線方向を指定します。選択地点から伸びる矢印で方向を確認できます。ボタンは矢印の先端の少し先に、水平に表示されます。
3. 「Street View」ボタンをクリックすると、Google Street Viewが新しいタブまたはウィンドウで開きます。

選択した地点は、地図を移動・拡大縮小しても変わらず、ボタンも追従します。地図の端ではボタンが一部または全部見えなくなる場合があります。地図をもう一度クリックすると選択が解除され、次のクリックで別の地点を選択できます。

視線方向には、**地図中心の移動方向**を使用します。例えば、地図を右にドラッグすると視線方向は西になります。

初期の視線方向は北（0°）です。地図をドラッグすると、その方向に切り替わります。

視線方向はドラッグ操作から推定するため、意図した方向と異なる場合があります。また、Street Viewで実際に表示される地点や方向はGoogle側の処理に依存します。

## 関連リンク

- [leaflet-pan-direction](https://github.com/hiroaki/leaflet-pan-direction) — ドラッグ方向の検出に使用する Leaflet 用プラグイン
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started#street-view-action) — Street Viewへのリンク仕様
