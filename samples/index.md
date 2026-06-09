# Tilia - Samples

Tilia is an extensible framework for building interactive maps and geospatial applications on the web. It works with only static files (except for the route searching feature).

Repository: <a href="https://github.com/hiroaki/Tilia">https://github.com/hiroaki/Tilia</a>

You can try working samples from the following links:
- [Embed Sample](./embed/)
  This shows how to embed a map in a page. By embedding a Tilia map in a template and replacing only the data, the same template can be reused for different content.
- [Viewer Sample](./viewer/)
  This shows how to use Tilia as the foundation for a map application. This sample allows you to drag and drop GPX and JPG files.
- [Editor Sample](./editor/chiyoda-ku.html)
  This sample allows you to try route searching and track editing features. You can also download the result as a GPX file.

Since each feature of Tilia is provided as a plugin, all features can be combined into a single application. However, the samples are configured to focus on a specific set of features for each use case.


## About the backend for route searching

Tilia basically works only on the client side, but since it is difficult to complete the route search function on the client side, you need to run a routing engine on the backend.

In the current version, we use a BFF (API Gateway) called [Phloem](https://github.com/hiroaki/Phloem) as a gateway between Tilia and the routing engine. Phloem acts as a routing facade for Tilia and forwards requests to the routing engine through an internal adapter.

Currently, the only supported adapter is for GraphHopper, but in the future we plan to support other routing engines such as OSRM and Valhalla.

Also, the routing engine working on the backend of this sample uses a self-hosted GraphHopper instance. However, since GraphHopper consumes a lot of memory, and the demo is hosted on limited server resources, the routing data is limited to the Chiyoda-ku area of Tokyo, and route searches are restricted to walking routes only. Therefore, **when using the editor sample, please ensure that both the start and destination are within Chiyoda-ku**. (The sample shows that range with a polygon)


## About the data used

For the boundary data of Chiyoda-ku, we used the following dataset.
- "Historical Administrative Area Dataset β version" (created by CODH) doi:10.20676/00000447
- Data source: https://geoshape.ex.nii.ac.jp/city/resource/13101A1968.html
- Data used: "Historical changes in administrative boundaries" → "2023-01-01" [GeoJSON file](https://geoshape.ex.nii.ac.jp/city/geojson/20230101/13/13101A1968.geojson)
- License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

---

# Tilia - サンプル

Tilia は、Web 上でインタラクティブな地図や地理空間アプリケーションを構築するための、拡張可能なフレームワークです。静的ファイルのみで動作します（ルート検索機能を除く）。

リポジトリ： <a href="https://github.com/hiroaki/Tilia">https://github.com/hiroaki/Tilia</a>

次のリンクから、動作するサンプルを試すことができます：
- [埋め込みのサンプル](./embed/)
  地図をページに埋め込む利用法です。テンプレートに Tilia の地図を埋め込み、データだけ差し替えることで、複数のコンテンツに対応できます。
- [ビューワーのサンプル](./viewer/)
  地図アプリの基盤とする利用法です。このサンプルでは GPX と JPG ファイルをドラッグ＆ドロップで入力できます。
- [エディタのサンプル](./editor/chiyoda-ku.html)
  ルート検索と、トラックの編集機能について試すことができます。また結果を GPX ファイルとしてダウンロードすることもできます。

Tilia の各機能はプラグインで提供されるため、すべての機能を単一のアプリケーションに組み合わせることもできます。ただしここでは特徴に応じた機能に絞った構成にしています。


## ルート検索のバックエンドについて

Tilia は基本的にクライアントサイドのみで動作しますが、ルート検索の機能はクライアントサイドで完結させることが難しいため、バックエンドでルーティングエンジンを動かす必要があります。

現在のバージョンでは、バックエンドに繋ぐための BFF (API Gateway) として [Phloem](https://github.com/hiroaki/Phloem) プロジェクトを作成し、それを使用しています。 Phloem は、Tilia のルーティング機能を提供するためのファサードとなり、内部のアダプタを通じてルーティングエンジンにリクエストを転送します。

現在サポートされているアダプタは GraphHopper 用のものだけですが、将来的には OSRM や Valhalla などの他のルーティングエンジンもサポートする予定です。

またこのサンプルのバックエンドで働くルーティングエンジンにはセルフホストされた GraphHopper インスタンスを利用しています。ただし GraphHopper はメモリを大量に消費してしまうため、限られたサーバーリソース上でデモを公開するにあたり少ないメモリで動作するように、ルート検索のためのデータを東京都千代田区の範囲に限り、また徒歩でのルート検索に限定しています。従って、 **エディタのサンプルを使用の際には、ルート検索の出発地と目的地が両方とも千代田区内にあることを確認してください**。（サンプルではポリゴンでその範囲を示しています）


## 使用データについて

千代田区の境界データについては、次のデータセットを使用しています。

- 『歴史的行政区域データセットβ版』（CODH作成） doi:10.20676/00000447
- データ元： https://geoshape.ex.nii.ac.jp/city/resource/13101A1968.html
- 使用データ： 「行政区域境界の歴史的変遷」→「2023-01-01」の [GeoJSONファイル](https://geoshape.ex.nii.ac.jp/city/geojson/20230101/13/13101A1968.geojson)
- ライセンス: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
