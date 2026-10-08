# comic-translate-4-free

**Language:** [English](README.md) · [हिन्दी](README.hi.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [বাংলা](README.bn.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Deutsch](README.de.md)

マンガをあなたの言語で — ブラウザ上でそのまま読めます。

comic-translate-4-free は、閲覧中のマンガやコミックのページを自動で翻訳します。日本語、英語、簡体字・繁体字の中国語に対応し（自動検出あり）、114 言語へ翻訳できます。ページを開くだけで、元の画像がその場で翻訳版に置き換わります — 吹き出しがあなたの言語で埋め尽くされます。

### 📸 ビフォア & アフター

| ビフォア（日本語） | アフター（英語） |
| --- | --- |
| ![元の日本語マンガページ](docs/images/wikipe-tan-original.jpg) | ![英語に翻訳されたもの](docs/images/wikipe-tan-en.jpg) |

<details>
<summary>14 言語の翻訳をもっと見る</summary>

| ヒンディー語 | 韓国語 | 簡体字中国語 |
| --- | --- | --- |
| ![ヒンディー語](docs/images/wikipe-tan-hi.jpg) | ![韓国語](docs/images/wikipe-tan-ko.jpg) | ![簡体字中国語](docs/images/wikipe-tan-zh-CN.jpg) |

| 繁体字中国語 | スペイン語 | アラビア語 |
| --- | --- | --- |
| ![繁体字中国語](docs/images/wikipe-tan-zh-TW.jpg) | ![スペイン語](docs/images/wikipe-tan-es.jpg) | ![アラビア語](docs/images/wikipe-tan-ar.jpg) |

| フランス語 | ベンガル語 | ポルトガル語 |
| --- | --- | --- |
| ![フランス語](docs/images/wikipe-tan-fr.jpg) | ![ベンガル語](docs/images/wikipe-tan-bn.jpg) | ![ポルトガル語](docs/images/wikipe-tan-pt.jpg) |

| ロシア語 | ベトナム語 | インドネシア語 |
| --- | --- | --- |
| ![ロシア語](docs/images/wikipe-tan-ru.jpg) | ![ベトナム語](docs/images/wikipe-tan-vi.jpg) | ![インドネシア語](docs/images/wikipe-tan-id.jpg) |

| ウルドゥー語 | ドイツ語 |
| --- | --- |
| ![ウルドゥー語](docs/images/wikipe-tan-ur.jpg) | ![ドイツ語](docs/images/wikipe-tan-de.jpg) |

</details>

*元の画像：[Wikipedia](https://en.wikipedia.org/wiki/Manga)（Wikimedia Commons より）。*

---

## ✨ 機能

- **自動翻訳** — 許可したサイトでマンガのページを開くだけで、翻訳版がその場に表示されます。ボタンのクリックは不要です。
- **画像を右クリック** — 「Send to comic-translate-4-free」を選べば、特定の画像だけを翻訳できます。最小サイズより小さい画像も対象です。
- **114 言語に翻訳** — Google 翻訳、Azure Translator、またはお手元の LM Studio サーバーから選べます。
- **原文言語の自動検出** — 日本語、英語、簡体字・繁体字の中国語を、OCR で読み取ったテキストから自動で判別します。
- **縦長ストリップ / Webtoon 対応** — 背の高いページは重なり合う区間に分けて処理するので、テキストが鮮明なままです。
- **16 の UI 言語** — 拡張機能のインターフェースは、ブラウザの言語設定に追従します。

### 🔒 プライバシー

- **AI はあなたのマシン上で動作します。** 吹き出し検出、OCR、インペイントはすべて、WebAssembly によってブラウザ内でローカルに実行されます。ページがあなたのデバイスから外に出ることはありません。
- **外部に送られるのは翻訳テキストだけです** — 抽出した文字列のみが、あなたが選んだ翻訳サービス（Google / Azure / お手元の LM Studio）に送信されます。
- **アカウント不要、トラッキングなし、テレメトリなし。** すべての設定とキャッシュされたモデルは、ブラウザのローカルストレージに保存されます。

---

## 🚀 インストール

**Chrome / Edge / Brave：**

[**Chrome Web Store からインストール**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj) — ワンクリックで、自動更新も行われます。

**Firefox：** [Releases](https://github.com/jameslee0623/comic-translate-4-free/releases) から Firefox 用の zip をダウンロードし、`about:debugging#/runtime/this-firefox` を開いて **Load Temporary Add-on** → `manifest.json` を選択してください。（一時アドオンは再起動時に無効化されます。署名済み AMO 掲載を準備中です。）

インストール後、設定ページを開いて **Download all models** を 1 回クリックしてください（約 350 MB：検出器、OCR、インペインター）。ブラウザ内にキャッシュされ、バイトサイズで検証されます。

![設定ページからモデルをダウンロード](docs/images/options-models.png)

---

## 💡 使い方

1. **まずサイトを許可** — 拡張機能のアイコンをクリックし、**Allow this site** を押してください（または **ALLOW ALL SITES** を有効にしてください）。翻訳が実行されるのは、許可を与えたサイトだけです。

   ![ポップアップからサイトを許可](docs/images/popup.png)

2. **マンガのページを再読み込み** — ページの読み込みと同時に、自動で翻訳が始まります。右上のピルに、翻訳の進捗がリアルタイムで表示されます（Capturing → Detecting → OCR → …）。
3. **完了** — ページの画像が、その場で翻訳版に置き換わります。

**ヒント：**
- 画像を右クリック → **Send to comic-translate-4-free** で、その画像だけを翻訳できます。

  ![画像を右クリックして送信](docs/images/right-click.png)

- サイトがダウンロードをブロックする場合（HTTP 403）は、拡張機能がバックグラウンドタブ経由で自動的に再試行します。
- 翻訳エンジンは設定で選べます：Google（無料、キー不要）、Azure Translator（下記からキーを申請 — 月 200 万文字まで無料）、LM Studio（ローカルサーバー）。
- 設定で **Debug mode** を有効にすると、パイプラインの各ステージを詳しく確認できます。

---

## 🔑 Microsoft Azure アカウントの申請

Azure Translator を翻訳エンジンとして使うには：

1. Microsoft / Hotmail / Azure アカウントを作成またはサインイン
2. Azure サブスクリプションを作成
3. Azure Translator リソースを作成
4. 料金プランで F0（Free）を選択 — 月 200 万文字まで無料、期限なし
5. リソース管理 → キーとエンドポイント → **KEY 1** と **Location/Region** をコピー
6. 拡張機能の設定ページに貼り付け

---

## ❤️ このプロジェクトを応援する

この拡張機能が役に立ったら、開発のご支援をぜひご検討ください：

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

---

## ⚠️ 既知の問題

- **韓国語の OCR はまだ未対応** — 原文言語は日本語、英語、簡体字・繁体字の中国語です。（韓国語は翻訳先の言語としては利用できます。）
- 自動翻訳では**ページごとに 1 枚の画像**が対象です（ページのメイン画像）。ほかの画像は右クリック → Send to で翻訳してください。
- **大きなセッション** — 1 つのセッションで何十枚も画像を翻訳すると、ブラウザがクラッシュすることがあります。その場合は設定でページキャッシュをクリアしてください。
- **Firefox** — モデルはバックグラウンドページで実行されます（Offscreen Document なし）、ほかの処理とメモリを共有します。「no available backend found」と表示されたら、ブラウザを再起動してください。
- Google 翻訳は非公式の無料エンドポイントを使用しているため、レート制限がかかる場合があります。

---

## 📄 サードパーティーに関する通知

このプロジェクトは [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate) にインスパイアされています — 吹き出し / テキスト検出器と、マンガでファインチューンされた LaMa インペインターは、その ONNX エクスポートです。推論ロジックもそこから移植しています。（OCR は genshiai-daichi の [Baberu](https://huggingface.co/genshiai-daichi/baberu-ocr) を使用しています。）

バンドルされたライブラリ、移植されたコード、実行時にダウンロードされるモデルの一覧とライセンスは、[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) に記載しています。

MIT ライセンス — [LICENSE](LICENSE) をご覧ください。
