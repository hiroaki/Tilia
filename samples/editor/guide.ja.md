[English](./guide.html)

# Tilia - Phloem 構築ガイド

このガイドでは、Phloem を利用して Tilia のルート検索機能を実行できる環境を構築します。Docker を利用する方法と、ソースコードから起動する方法の両方を説明します。

ガイドの内容に従って進めることで、ブラウザから Tilia のサンプルを開き、GraphHopper を利用したルート検索を実行できるようになります。

Phloem は、Tilia と GraphHopper などのルーティングエンジンの間に配置する API ゲートウェイで、 Tilia と並行して開発しているものです：

- https://github.com/hiroaki/Phloem

Tilia は基本的にクライアントサイドのみで動作しますが、ルート検索の機能はバックエンドでルーティングエンジンを動かす必要があります。 Phloem とルーティングエンジンをセットアップすることで、 Tilia からルート検索のリクエストを送ることができるようになります。


## 0. 構成

基本的な構成は以下のようになります：

```
        +---------------------+ 
        | Tilia (クライアント)  |
        +---------------------+
                  |
                  | ルート検索リクエスト
                  v
        +---------------------+
        | Phloem (ゲートウェイ) |
        +---------------------+
                  |
                  | ルート検索リクエスト（転送）
                  v 
        +---------------------+
        | GraphHopper         |
        | (ルーティングエンジン) |
        +---------------------+
```

Phloem は Tilia からのルート検索リクエストを受け取り、それを GraphHopper に転送してルート検索を行います。GraphHopper からのレスポンスを受け取った後、レスポンスの内容を調整し、Tilia に返します。


## 1. GraphHopper の用意

GraphHopper は道路ネットワーク上の経路探索を行うルーティングエンジンです。 GraphHopper をバックエンドに利用するためには、GraphHopper 公式 API を利用するか、または自前で GraphHopper のサーバーを構築して利用することができます。

ただし自前で用意する場合、 GraphHopper はディスク容量やメモリを大量に消費するため、十分なリソースを持つマシンが必要になります。

### GraphHopper 公式 API を利用する

GraphHopper 公式 API を利用するならば、セットアップは特にありません。 GraphHopper のアカウントを作成し、 API キーを取得してください。 Phloem の起動時に、環境変数にそれを設定することになります。

### 自前の GraphHopper サーバーを利用する

または GraphHopper のサーバーを自前で立てて、それを利用することもできます。 GraphHopper のセットアップについては、公式のドキュメントを参照してください：

- https://github.com/graphhopper/graphhopper#installation


Phloem のリポジトリ内にも GraphHopper を Docker で起動するための設定ファイルが含まれています：

- https://github.com/hiroaki/Phloem/tree/main/tools/routing/graphhopper


## 2. Phloem のセットアップ

Phloem は Ruby on Rails で実装された、クライアントとルーティングエンジンの橋渡しをする API ゲートウェイです。実行環境に Ruby がインストールされていない場合や、Rails に不慣れな場合でも、 Docker イメージを利用して、ワンライナーでセットアップすることができます。

### Docker を利用する場合

このガイドでは、コンテナはカレントディレクトリにある `public` をボリュームマウントして利用します。`public` ディレクトリが既にある場合は、既存のファイルと混在することを避けるため、空の状態にしてから開始してください。 Phloem は `public` 配下のすべてのファイルを HTTP サーバー経由で配信します。

コンテナの実行については、GraphHopper 公式 API を利用する場合と、自前の GraphHopper サーバーを利用する場合で、環境変数の設定が異なります。

- **GraphHopper 公式 API を利用する場合**

  必須の環境変数 `GRAPH_HOPPER_API_KEY` をセットした上で、以下のコマンドを実行してください。これで Phloem が起動し、ルート検索のリクエストを受け付けるようになります。

  前述の通り、Free プランの API キーを利用する場合は、追加で `GRAPH_HOPPER_RESTRICTED_PLAN` を `true` に設定してください。

  ```sh
  export GRAPH_HOPPER_API_KEY=<Your GraphHopper API key>

  docker run --rm \
    -p 3000:3000 \
    -e ROUTING_PROVIDER=graphhopper \
    -e GRAPH_HOPPER_BASE_URL=https://graphhopper.com/api/1 \
    -e GRAPH_HOPPER_API_KEY \
    -e GRAPH_HOPPER_RESTRICTED_PLAN=true \
    -e SECRET_KEY_BASE_DUMMY=1 \
    -v "$(pwd)/public:/rails/public" \
    ghcr.io/hiroaki/phloem:latest
  ```

- **自前の GraphHopper サーバーを利用する場合**

  自前の GraphHopper サーバーを利用する場合は、 `GRAPH_HOPPER_API_KEY` と `GRAPH_HOPPER_RESTRICTED_PLAN` による設定は不要になります。 API のベース URL を、 Phloem の起動時の環境変数 `GRAPH_HOPPER_BASE_URL` に設定してください。

  ```sh
  docker run --rm \
    -p 3000:3000 \
    -e ROUTING_PROVIDER=graphhopper \
    -e GRAPH_HOPPER_BASE_URL=http://localhost:8989 \
    -e SECRET_KEY_BASE_DUMMY=1 \
    -v "$(pwd)/public:/rails/public" \
    ghcr.io/hiroaki/phloem:latest
  ```

この例ではフォアグラウンドで起動するので、ターミナルはこのままにしておいてください。サーバーを停止させるには `Ctrl + C` を入力します。

### Docker を利用しない場合

Docker を利用しない場合は、Phloem の開発環境を整備することになります。 Ruby と Bundler がインストールされている必要があります。また SQLite3 も必要です。 Phloem はステートを持たない設計ですが、 この DB は Rails のキャッシュのために利用されます。

Phloem の開発では次のバージョンで動作確認を行なっています：

- Ruby 3.4.9
- Bundler 4.0.8

他のバージョンで動作させる場合は、リポジトリのトップディレクトリにある `.ruby-version` を調整または削除し、また必要に応じて Gemfile を調整してください。

#### 初回セットアップ

初回のみ、次の手順で Phloem の開発環境をセットアップしてください。 Phloem のリポジトリをクローンし、必要な Ruby ライブラリ（gem）をインストールし、そして DB を準備します。

```sh
git clone git@github.com:hiroaki/Phloem.git
cd Phloem
bundle install
bin/rails db:prepare
```

#### サーバーの起動

サーバーの設定はすべて環境変数にセットします。 

- **GraphHopper 公式 API を利用する場合**
  ```
  export GRAPH_HOPPER_BASE_URL=https://graphhopper.com/api/1
  export GRAPH_HOPPER_API_KEY=<Your GraphHopper API key>
  export GRAPH_HOPPER_RESTRICTED_PLAN=true # 制限のある API キーを利用する場合に追加
  ```

- **自前の GraphHopper サーバーを利用する場合**
  ```
  export GRAPH_HOPPER_BASE_URL=http://localhost:8989
  ```

環境変数の設定ができたら、次のコマンドで Phloem サーバーを起動してください。

```
bin/rails server -p 3000
``` 

この例ではフォアグラウンドで起動するので、ターミナルはこのままにしておいてください。サーバーを停止させるには `Ctrl + C` を入力します。

## 3. 起動確認

### ヘルスチェック

Phloem が正しく起動しているかを確認するために、次のエンドポイントにリクエストを送ってみてください：

```
curl -i http://localhost:3000/up
```

"200 OK" のレスポンスと共に、次のような HTML コンテンツが返ってくれば、Phloem サーバーは正常に起動しています。

```
<!DOCTYPE html><html><body style="background-color: green"></body></html>
```

### GraphHopper へのリクエストの転送確認

Phloem が Tilia からのルート検索リクエストを受け取り、GraphHopper に転送しているかを確認するために、次のエンドポイントにリクエストを送ってみてください（自前で GraphHopper サーバーを立てている場合は、 `profile` や `points` の内容を適宜調整してください）：

```
curl -X POST http://localhost:3000/route \
  -H "Content-Type: application/json" \
  -d '{
    "profile": "car",
    "points": [
      { "lat": 35.68, "lon": 139.76 },
      { "lat": 35.69, "lon": 139.77 }
    ],
    "options": {}
  }'
```

次のような JSON レスポンスが返ってくれば、Phloem が GraphHopper にリクエストを転送し、レスポンスを受け取っていることが確認できます。

```
{"route":{"geometry":{"type":"LineString","coordinates":[[139.75998,35.680005],[139.759657,35.679062],[...(途中省略)...],[139.770004,35.689999]]},"distance_meters":2703.289,"duration_seconds":244.55,"provider":"graphhopper","warnings":[]}}
```

## 4. Tilia のセットアップ

Phloem のトップ・ディレクトリには `public` ディレクトリがあります。この `public` ディレクトリに、Tilia プロジェクトの次のフォルダをすべて複製して置いてください。ここに置いたファイルが Phloem の HTTP サーバー経由で配信されます。

- `plugins`
- `samples`
- `src`

ルート検索の機能を実装している HTML のサンプルが、 `samples/editor/localhost.html` にあります。このサンプルは、Phloem をローカルで起動することを前提にした設定になっています。これをテキストエディタで開き、 `pluginOptions` を設定している箇所を確認してください：

```
pluginOptions: {
  "x-route-search": {
    endpoint: "http://localhost:3000/route",
    defaultProfile: "car",
    profileOptions: ["car", "bike", "foot"]
  }
}
```

`endpoint` が Phloem の `/route` エンドポイントを指していることを確認してください。もし Phloem を別の URL で起動している場合はこの URL を変更します。

また必要に応じて `defaultProfile` および `profileOptions` を、GraphHopper のルート検索で利用するプロファイルに合わせて調整します。例えば、GraphHopper 公式 API の Free プランを利用している場合は、 `car`, `bike` および `foot` のみが利用できますので、それらを Tilia 上で選択できるようにします。自前で GraphHopper サーバーを構築している場合は、利用可能なプロファイルに合わせてこれらの値を調整してください。

## 5. Tilia のルート検索機能の利用

ブラウザで、先ほど `public` ディレクトリに配置したサンプルへ HTTP 経由でアクセスします：

- http://localhost:3000/samples/editor/localhost.html

地図ページが表示されたら、画面の左側にあるルート検索の "R" ボタンをクリックし、ルート検索パネルを開きます。

ルート検索の出発地と目的地を入力し、 "Search Routes" ボタンをクリックして検索を実行します。地図上で右クリックして各地点を指定でき、また一度入力した地点も、マーカーをドラッグして移動することができます。

ルート検索結果は Tilia の内部的にひとつの GPX データとして保存され、レイヤーパネル "L" の中のリストの一つとして表示されますので、レイヤーパネルを開いてみてください。

> [!TIP]
> 検索を実行するたびに新しいデータが追加されます。これは複数の検索結果の比較のための、意図的な設計です。

## 6. トラブルシュート

- **検索を実行したとき、パネル上に "Failed to fetch" が表示される**

  サーバーの動作ログを確認してみてください。もし次のようなエラーが表示されている場合は、 Phloem が CORS のプリフライトリクエストを正しく処理できていない可能性があります。

  ```
  Started OPTIONS "/route" for 192.168.65.1 at 2026-06-14 03:13:29 +0000
  ActionController::RoutingError (No route matches [OPTIONS] "/route"):
  ```

  たとえば URL の `http://127.0.0.1` と `http://localhost` は同じマシンを指すものの、ブラウザはこれらを別のオリジンとみなし、CORS の制約が働いてしまうため、リクエストが失敗してしまいます。 Phloem を起動する際の URL と、 Tilia の `endpoint` に設定する URL は、同じオリジンになるようにしてください。

- **検索を実行したとき、パネル上に "Free packages cannot use flexible mode" が表示される**

  GraphHopper 公式 API の Free プランを利用する場合は機能に制限があるため、それを示す環境変数 `GRAPH_HOPPER_RESTRICTED_PLAN` を `true` に設定して Phloem を再起動してください。

- **検索を実行したとき、パネル上に "Request validation failed" が表示される**

  このメッセージは汎用メッセージですので、原因はさまざま考えられますが、リクエストの内容に不備があることを示しています。典型的にはプロファイルの値が誤っている可能性がありますので、ルート検索プラグインの設定オプション `pluginOptions` の `profileOptions` と `defaultProfile` の値を確認してみてください。

- **検索を実行したとき、パネル上に "Too many points for Routing API: 7, allowed: 5" が表示される**

  セットアップの問題ではありません。GraphHopper 公式 API の Free プランを利用している場合は、ルート検索のリクエストに含めることができる地点の数に制限がありますが、それを超えていることを示しています。
