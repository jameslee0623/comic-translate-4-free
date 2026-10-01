# comic-translate-4-free

**言語:** [English](README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)

マンガ・コミックのページをブラウザ内で翻訳します。全パイプラインがローカルで動作します：
吹き出し・テキスト検出（RT-DETR-v2）、OCR（日本語・英語・中国語はBaberu）、
LaMaインペインティングによる文字消去、翻訳（Google / Azure / ローカルLLM）、
そして元の吹き出しへの折り返し再描画。

拡張機能のUIはブラウザの言語設定に従います（英語、日本語、韓国語、中国語 簡体字/繁体字）。

[ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate) を
Manifest V3 + ONNX Runtime Web（WASM）に移植したものです。

## ダウンロード（ビルド不要）

[**Releases**](https://github.com/jameslee0623/comic-translate-4-free/releases)
ページから最新のリリースを取得してください — すべてのリリースはCIで自動ビルドされます。
お使いのブラウザ用のzipをダウンロードしてください：

- `comic-translate-4-free-v<version>-<build>-chrome.zip` → Chrome / Edge / Brave
- `comic-translate-4-free-v<version>-<build>-firefox.zip` → Firefox

（`chrome/` と `firefox/` が同梱された結合版
`comic-translate-4-free-v<version>-<build>.zip` もあります。両方まとめて使いたい場合にどうぞ。）
リポジトリのクローンや `build.sh` の実行は不要です。

## インストール

上でダウンロードした、お使いのブラウザ用のzipを解凍してください。

**Chrome:** `chrome://extensions` → **デベロッパーモード**を有効化 →
**パッケージ化されていない拡張機能を読み込む** → 解凍したフォルダを選択。

**Firefox:** `about:debugging#/runtime/this-firefox` → **一時的なアドオンを読み込む** →
解凍したフォルダを開いて `manifest.json` を選択。（一時アドオンはFirefox再起動まで有効です。
恒久インストールには addons.mozilla.org での署名が必要です —
通常版Firefox向けの署名済みビルドを準備中です。）

次に、設定ページからモデルを一度だけダウンロードします —
**Download all models** ボタンひとつで全部取得できます（検出器、OCRモデル、
インペインター、合計約350MB）。ブラウザ（IndexedDB）にキャッシュされ、
再ダウンロードは不要です。各ファイルのバイトサイズはダウンロード後に検証され、
壊れたファイルには ⚠ が付いて再ダウンロードできます。

![設定ページでのモデルダウンロード](docs/images/options-models.png)

## 使い方

1. **まずサイトを許可** — 翻訳は明示的に許可したサイトでのみ動作します。
   拡張機能アイコンをクリックして **Allow this site** を押すか、
   設定でホスト名を追加してください（**Allow all sites** をオンにすれば
   この手順は不要です）。これは厳格なゲートです：
   他のサイトではパイプラインは動作しません。

   ![拡張機能のポップアップ](docs/images/popup.png)
2. 許可済みサイトでマンガページを開くと、ページの読み込み完了後すぐに
   自動翻訳が始まります — ボタンクリックは不要です（設定の
   「Auto-translate on page load」で切替可能）。
   サイトごとの初回利用時、ページ画像をフル解像度で取得するため
   Chromeがワンタイム権限を求めます。
3. ページ右上のステータスピルにライブ進捗が表示されます
   （Capturing → Detecting → OCR → …）。完了すると、ページの画像そのものが
   翻訳版に置き換わります — 原文はインペイントで消去され、訳文が吹き出し内に
   再描画されます。

ページのメイン画像ではなく特定の画像だけ翻訳したい場合は、その画像を
右クリックして **Send to comic-translate-4-free** を選んでください。
その画像がそのままパイプラインに送られ — 最小画像サイズより小さくても
処理され — その場で置き換えられます。このメニュー項目は許可したサイト
でのみ表示されます。

![右クリックメニュー](docs/images/right-click.png)

パイプラインの入力はページ最大の画像で、最小画像サイズ設定（デフォルト500px）で
フィルタされます：小さい画像は明確なエラーでスキップされます。
拡張機能はページの画像を直接読み取ります — ウェブページのスクリーンショットは撮りません。

**ページキャッシュ:** 同じブラウザセッション中に再訪したページは、一時的な
ディスクキャッシュから即座に読み込まれます（1つのセッションで10〜40枚の画像を
翻訳するとブラウザがクラッシュし、キャッシュ内の全画像が失われることがあります。
手動でキャッシュをクリアすることを忘れないでください）。
キャッシュはブラウザを閉じると自動的に削除され、シークレットウィンドウでは
使用されません。

**設定**（アイコンをクリック → 設定）：サイトアクセス、
ページ読み込み時の自動翻訳、翻訳元/翻訳先言語、翻訳エンジン（Google無料 /
Azure Translator / LM Studio）、Azure・LM Studioの接続テストボタン、
検出しきい値、最小画像サイズ（デフォルト500px — より小さいキャプチャは
スキップ）、フォントサイズ、デバッグモード、翻訳済みページキャッシュの管理。

![Settings page](docs/images/options.png)

## このプロジェクトを支援

この拡張機能が役に立ったなら、開発の支援をいただけると助かります：

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

### Microsoft Azureアカウントの取得

1. Microsoft/hotmail/Azureアカウントを作成・サインイン
2. Azureサブスクリプションを作成
3. Azure Translatorリソースを作成
4. 価格レベルでF0（Free）を選択
5. リソース管理 → キーとエンドポイント → **KEY 1** と **場所/リージョン** をコピー

Microsoftによると、TranslatorのF0無料枠は月200万文字で、期限切れはありません。

### LM Studio

ローカルサーバーを有効にしたLM Studioを起動します（デフォルト
`http://127.0.0.1:1234`）。設定で翻訳エンジンに
**LM Studio (local server)** を選択し、サーバーURLとAPIフレーバーを設定 —
**LM Studio REST API v1**（`/api/v1/chat` にPOST）または
**OpenAI-compatible**（`/v1/chat/completions` にPOST） — してから
**Check LM Studio connection** で接続を確認してください。
読み込まれたモデルは自動検出され記憶されるため、モデル名の入力欄は
ありません。

## ソースからビルド

バンドラも npm install も不要 — ソースがそのまま拡張機能です。必要なもの：
`bash`、`python3`、`rsync`、`zip`、`node`（構文チェックのみに使用）。

```bash
git clone https://github.com/jameslee0623/comic-translate-4-free.git
cd comic-translate-4-free
./build.sh
```

`dist/` に3つのzipが生成されます（結合版は別途コピーもされます）：

- `comic-translate-4-free-v<version>-<build>.zip` — 結合版。`chrome/` と
  `firefox/` が同梱されています。上記「インストール」の手順で読み込めます
  （Chromeはパッケージ化されていない拡張機能として、Firefoxは一時アドオンとして）
- `comic-translate-4-free-v<version>-<build>-chrome.zip` — Chromeビルドのみ、
  ストア提出用レイアウト
- `comic-translate-4-free-v<version>-<build>-firefox.zip` — Firefoxビルドのみ、
  ストア提出用レイアウト

`<build>` スタンプは `src/shared/version.js` の `BUILD` 定数から来ます
（ポップアップと設定ページのフッターに表示され、ページキャッシュのキーにも
使われます）。ビルド前に上げておくと、
ファイル名とUIフッターに一意のスタンプが付きます —
上げないと、同じスタンプのリリース版と見分けがつきません。

ページごとに拡張機能は1回のバッチリクエストを送信します：

```
POST {server}/chat/completions
{
  "messages": [
    { "role": "user",
      "content": "Translate the following 9 text(s) from Japanese to Chinese (Traditional):\n[\"…\",\"…\"]" }
  ],
  "temperature": 0,
  "texts": ["…", "…"],
  "target": "zh-TW",
  "source": "ja"
}
```

モデルは翻訳文のJSON配列で返すことが期待されます —
入力テキストと同数・同順。長い応答の中の素の `[...]` も受け付けます；
最終手段として1行1訳のフォールバックもあります。

## デバッグモード

設定で **デバッグモード** を有効にすると、各パイプラインステージの出力が
サイドパネルのインスペクタに表示されます：キャプチャ画像、検出ボックス、
テキストブロック、OCRクロップ＋読み取り結果、インペイントマスク、
インペイント後のページ、翻訳文。

## アーキテクチャ

```
popup / options (src/ui)
      │ chrome.runtime messages
      ▼
background — オーケストレーション、キャプチャ、ブロック、マスク、翻訳API、
             デバッグ出力
  ├─ Chrome: service worker + offscreen document (src/offscreen) が
  │  すべての onnxruntime-web セッションをホスト
  │  （197MBのダウンロードがSW停止中も継続するよう、ダウンロードはここで実行）
  └─ Firefox: background page (src/background/background.html) が
     同じセッションをインプロセスでホスト（Firefoxにoffscreen documentはない）
└── content script (src/content) — オーバーレイキャンバス＋テキスト描画＋デバッグパネル
```

モデル（Hugging Face、オンデマンドでダウンロード）：
- `ogkalu/comic-text-and-bubble-detector` → `detector-v4-s_int8.onnx`
- `genshiai-daichi/baberu-ocr` → `vision_int4.onnx`、`decoder_prefill_int8.onnx`、
  `decoder_step_int8.onnx`（日本語、英語、中国語簡体字・繁体字）
- `ogkalu/lama-manga-onnx-dynamic` → `lama-manga-dynamic.onnx`

パイプラインステージ：capture → detect → blocks → OCR → mask → inpaint →
translate → render。検出は640×640で実行；縦横比が3.5:1を超える縦長ページは
重なり合う垂直スライスで処理します。

**Chrome版とFirefox版のパイプライン：** 両ビルドともOCR後に翻訳とmask/inpaintを
並列実行します。Chrome版はPromise.allで並列化 — MLセッションがoffscreen
ドキュメント内の独自スレッドで動作するため、各ステージは実際に重なって
実行されます。Firefox版は翻訳をWeb Worker（独自スレッド）で実行し、
mask → inpaintはメインスレッドで実行します — WASM inpaintがメインスレッドを
占有しても、WorkerのネットワークI/Oはブロックされません。（Firefox版は以前、
リニアなmask → inpaint → translate順序で実行していました。シングルスレッドの
バックグラウンドページでは、並列ブランチがフリーズなしに実行できなかったためです。）

## 既知の制限

- 韓国語のOCRは良いものがまだ見つかっていません — 翻訳元言語は日本語・
  英語・中国語（簡体字/繁体字）に限られます。
- 自動翻訳は1ページにつき1枚の画像（ページのメイン画像）を処理します。
  ページ内の他の画像を翻訳するには、右クリックして
  **Send to comic-translate-4-free** を選んでください。
- Firefox: AIモデルはブラウザのバックグラウンドページ内で動作します
  （Firefoxにはオフスクリーンドキュメントがありません）。そのため非常に
  大きなページや長時間の使用ではメモリ不足になり、「no available backend
  found」と表示されることがあります。ブラウザを再起動するとメモリが解放
  されます。Chromeはモデルを別プロセスで実行するため影響を受けません。
- Chrome: 1つのセッションで数十枚の画像を翻訳するとブラウザがクラッシュ
  することがあります（35枚キャッシュ時点で確認）。
- ページキャッシュはセッション限定です：ブラウザ起動時に消去されるため、
  再起動後（クラッシュ後を含む）に再送した画像はキャッシュを使わず、
  最初から全パイプラインを実行します。
- Google翻訳エンジンは非公式の `translate.googleapis.com` エンドポイントを
  使用し、レート制限される場合があります。
- 縦書きテキストは背の高いCJKブロック向けに描画されます；吹き出し外の
  描き文字等は独自のテキストボックスを使います。

## サードパーティ表示

バンドルされたライブラリ、移植コード、実行時にダウンロードされるモデルは
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) にライセンスと共に記載しています。

