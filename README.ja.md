# comic-translate-4-free

**言語:** [English](README.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)

マンガ・コミックのページをブラウザ内で翻訳します。全パイプラインがローカルで動作します：
吹き出し・テキスト検出（RT-DETR-v2）、OCR（日本語・英語・中国語簡体字はBaberu、韓国語はPP-OCRv5、中国語繁体字はPP-OCRv6）、
LaMaインペインティングによる文字消去、翻訳（Google / Azure / ローカルLLM）、
そして元の吹き出しへの折り返し再描画。

拡張機能のUIはブラウザの言語設定に従います（英語、日本語、韓国語、中国語 簡体字/繁体字）。

[ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate) を
Manifest V3 + ONNX Runtime Web（WASM）に移植したものです。

## ダウンロード（ビルド不要）

[**Releases**](https://github.com/jameslee0623/comic-translate-4-free/releases)
ページからインストール用zipを取得してください — すべてのリリースはCIで自動ビルドされ、
`chrome/` と `firefox/` が同梱されています。解凍後、下の「インストール」に進んでください。
リポジトリのクローンや `build.sh` の実行は不要です。

## インストール

zipには2つのビルドが含まれています：`chrome/` と `firefox/`。

**Chrome:** `chrome://extensions` → **デベロッパーモード**を有効化 →
**パッケージ化されていない拡張機能を読み込む** → `chrome/` フォルダを選択。

**Firefox:** `about:debugging#/runtime/this-firefox` → **一時的なアドオンを読み込む** →
`firefox/` フォルダを開いて `manifest.json` を選択。（一時アドオンはFirefox再起動まで有効です。
恒久インストールには addons.mozilla.org での署名が必要です。）

次に、オプションページからモデルを一度だけダウンロードします —
**Download all models** ボタンひとつで全部取得できます（検出器、OCRモデル、
インペインター、合計約350MB）。ブラウザ（IndexedDB）にキャッシュされ、
再ダウンロードは不要です。各ファイルのバイトサイズはダウンロード後に検証され、
壊れたファイルには ⚠ が付いて再ダウンロードできます。

## 使い方

1. **まずサイトをホワイトリストに登録** — 翻訳は明示的に許可したサイトでのみ動作します。
   拡張機能アイコンをクリックして **Add this site to whitelist** を押すか、
   オプションでホスト名を追加してください。これは厳格なゲートです：
   他のサイトではパイプラインは動作しません。
2. ホワイトリスト登録済みサイトでマンガページを開きます。
3. 拡張機能アイコンをクリック → **Translate this page**。
   サイトごとの初回利用時、ページ画像をフル解像度で取得するため
   Chromeがワンタイム権限を求めます。
4. ページ隅のステータスピルにライブ進捗が表示されます
   （Capturing → Detecting → OCR → …）。完了すると、ページの画像そのものが
   翻訳版に置き換わります — 原文はインペイントで消去され、訳文が吹き出し内に
   再描画されます。明確なメイン画像がないページでは、代わりにオーバーレイ表示になります。

パイプラインの入力はページ最大の画像で、最小画像サイズ設定（デフォルト500px）で
フィルタされます：小さい画像は明確なエラーでスキップされます。
拡張機能はページの画像を直接読み取ります — ウェブページのスクリーンショットは撮りません。

**オプション**（アイコンを右クリック → オプション）：サイトホワイトリスト、
翻訳元/翻訳先言語、翻訳バックエンド（Google無料 / Azure Translator / LM Studio /
実験的ローカルLLM）、Azure・LM Studioの接続テストボタン、検出しきい値、
最小画像サイズ（デフォルト500px — より小さいキャプチャはスキップ）、
フォントサイズ、デバッグモード。

### LM Studio

OpenAI互換サーバーを有効にしたLM Studioを起動します（デフォルト
`http://localhost:1234`、サーバーパス `/v1`）。オプションでバックエンドに
**LM Studio (local)** を選択し、サーバーURLを設定して
**Check LM Studio connection** で接続を確認してください。

## ソースからビルド

バンドラも npm install も不要 — ソースがそのまま拡張機能です。必要なもの：
`bash`、`python3`、`rsync`、`zip`、`node`（構文チェックのみに使用）。

```bash
git clone https://github.com/jameslee0623/comic-translate-4-free.git
cd comic-translate-4-free
./build.sh
```

`dist/comic-translate-4-free-v<version>-<build>.zip` が生成され、
`chrome/` と `firefox/` が同梱されます。上記「インストール」の手順で
読み込めます（Chromeはパッケージ化されていない拡張機能として、
Firefoxは一時アドオンとして）。

`<build>` スタンプは `src/ui/options.js` と `src/ui/popup.js` 先頭の
`BUILD` 定数から来ます（2つを同期させてください）。ビルド前に上げておくと、
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

オプションで **デバッグモード** を有効にすると、各パイプラインステージの出力が
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
  `decoder_step_int8.onnx`（日本語、英語、中国語簡体字）
- `PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx` → `inference.onnx`（韓国語）
- `PaddlePaddle/PP-OCRv6_small_rec_onnx` → `inference.onnx`（中国語繁体字）
- `ogkalu/lama-manga-onnx-dynamic` → `lama-manga-dynamic.onnx`

パイプラインステージ：capture → detect → blocks → OCR → mask → inpaint →
translate → render。検出は640×640で実行；縦横比が3.5:1を超える縦長ページは
重なり合う垂直スライスで処理します。

**Chrome版とFirefox版のパイプラインの違い：** 両ビルド間で初めての動作の
違いです。Chrome版はOCR後に翻訳とmask/inpaintを並列実行します — MLセッションが
offscreenドキュメント内の独自スレッドで動作するため、各ステージは実際に
重なって実行されます。Firefox版は従来のリニアな順序（mask → inpaint →
translate）で実行します。MLセッションがバックグラウンドページの単一スレッド内で
動作するため、WASM inpaintがイベントループをブロックし、並列の翻訳ブランチや
UIがフリーズしてしまうためです。

## 既知の制限

- ローカルLLMバックエンドは実験的です（WebGPU＋数GBのダウンロードが必要）。
- Googleバックエンドは非公式の `translate.googleapis.com` エンドポイントを
  使用し、レート制限される場合があります；Azureは自分のキーが必要です。
- OCRエンジン：Baberu（日本語・英語・中国語簡体字）、PP-OCRv5（韓国語）、
  PP-OCRv6（中国語繁体字）。
- 縦書きテキストは背の高いCJKブロック向けに描画されます；吹き出し外の
  描き文字等は独自のテキストボックスを使います。

## サードパーティ表示

バンドルされたライブラリ、移植コード、実行時にダウンロードされるモデルは
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) にライセンスと共に記載しています。
