# ゲームランキング バックエンド セットアップ手順

`game.html`(ウェディングラン)の「ゲストランキング」は、Firebase Realtime Database に保存し、全ゲスト共通のランキングとして表示する。無料のSparkプラン(クレジットカード登録不要)の範囲内で運用できる。

自己ベスト(自分の過去最高スコア)はランキングとは別で、各ゲストのブラウザ内(localStorage)に保存され、Firebaseの設定とは無関係にそのまま動作する。

## 1. Firebaseプロジェクトを作成

1. https://console.firebase.google.com/ を開き、Googleアカウントでログイン
2. 「プロジェクトを追加」→ プロジェクト名(例: `akihiro-madoka-wedding`)を入力して作成
3. Google アナリティクスは不要なのでオフのままで進めてよい

## 2. Realtime Database を作成

1. 左メニュー「構築 → Realtime Database」を開き、「データベースを作成」
2. リージョンは初期値のままでよい
3. セキュリティルールは一旦「テストモード」で作成(手順4で本番用ルールに置き換える)

## 3. ウェブアプリを追加してconfigを取得

1. プロジェクト概要画面 → 「</> (ウェブ)」アイコンをクリックしてアプリを追加
2. アプリ名を入力(例: `game`)、Firebase Hosting は不要なのでチェックしない
3. 表示された `firebaseConfig` オブジェクト(`apiKey` / `authDomain` / `databaseURL` / `projectId` など)をコピー

## 4. `game.html` にconfigを設定

`game.html` 内の以下の部分を、手順3でコピーした実際の値に書き換える。

```js
const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://PASTE_YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "PASTE_YOUR_PROJECT_ID"
};
```

## 5. セキュリティルールを設定

Realtime Database の「ルール」タブで、テストモードのルール(期限付きで誰でも読み書き可能)を以下に置き換えて公開する。ランキング(`leaderboard`)への読み取りは誰でも可能、書き込みは名前・スコアの形式が正しいデータのみ新規追加(上書き・削除は不可)を許可する。

```json
{
  "rules": {
    "leaderboard": {
      ".read": true,
      ".write": true,
      "$entry": {
        ".validate": "newData.hasChildren(['name','score','ts'])",
        "name": { ".validate": "newData.isString() && newData.val().length <= 12" },
        "score": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000" },
        "ts": { ".validate": "newData.isNumber()" },
        "$other": { ".validate": false }
      }
    },
    ".read": false,
    ".write": false
  }
}
```

`name`/`score`/`ts`をワイルカード(`$other`)より先に個別指定しているのがポイント。Realtime Databaseのルールはワイルドカードより完全一致する子キー名のルールが優先されるため、こう書かないと`$other`が`name`などの正規フィールドにも一致して書き込みが拒否されてしまう。

### 実装メモ:ランキングが常に1件しか表示されなかった不具合

動作検証中、データ自体はFirebaseに正しく複数件保存されているのに、`game.html`の画面には常に(スコアが一番高い、一番古い)1件しか表示されない不具合が発生した。

`orderByChild('score').limitToLast(10)`のクエリや`.indexOn`未設定を疑って色々試したが無関係で、実際の原因はもっと単純なJavaScriptのバグだった。

```js
snap.forEach(child => arr.push(child.val()));
```

`Array.prototype.push()`は配列の**新しい長さ**(数値)を返す。そのため上のアロー関数は暗黙的にその数値(1件目なら`1`)を返してしまう。ところがFirebaseの`DataSnapshot.forEach()`は「コールバックがtruthyな値を返したら列挙を打ち切る」という独自仕様を持つため、1件pushした時点で`forEach`が終了してしまい、常に最初の子要素しか処理されていなかった。

修正は`push()`の戻り値を返さないようにするだけでよい。

```js
snap.forEach(function(child){ arr.push(child.val()); });
```

あわせて、一回きりの`.once('value')`ではなく常時購読の`.on('value')`に変更した(`subscribeLeaderboard()`)。これによりランキングは他のゲストの登録も含めて画面を開いたままリアルタイムに更新される。

## 6. 動作確認

公開後のサイト(`game.html`)をスマホ・PCなど複数の端末/ブラウザで開き、それぞれでスコアを登録し、どの端末からも同じ「ゲストランキング」に反映されることを確認する。

## 注意点

- 認証なしで書き込みを許可しているため、悪意のあるユーザーが直接APIを叩けば不正なスコアを送信できる可能性はある。結婚式ゲスト向けの遊びとして許容できるリスクとして運用する
- Firebaseのconfig値(`apiKey`など)はクライアント側に公開される前提の値であり、GitHubにpushしても問題ない(APIキー漏洩の心配をする類のものではない)
