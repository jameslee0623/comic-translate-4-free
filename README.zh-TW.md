# comic-translate-4-free

**語言：** [English](README.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)

在瀏覽器內翻譯漫畫頁面。完整處理流程在本機執行：
對話框/文字偵測（RT-DETR-v2）、OCR（日文/英文/簡體中文用 Baberu、韓文用 PP-OCRv5、
中文用 Baberu）、透過 LaMa 影像修補清除原文、翻譯
（Google / Azure / 本機 LLM），以及將譯文換行重繪回原對話框。

擴充功能 UI 會跟隨瀏覽器的語言設定（英文、日文、韓文、中文簡體/繁體）。

由 [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate)
移植到 Manifest V3 + ONNX Runtime Web（WASM）。

## 下載（無需建置）

從 [**Releases**](https://github.com/jameslee0623/comic-translate-4-free/releases)
頁面取得可直接安裝的 zip — 每個 release 都由 CI 自動建置，
同時包含 `chrome/` 和 `firefox/`。解壓縮後按下方「安裝」操作即可。
您無需複製儲存庫或自行執行 `build.sh`。

## 安裝

zip 中包含兩個建置：`chrome/` 和 `firefox/`。

**Chrome：** 開啟 `chrome://extensions` → 啟用**開發人員模式** →
**載入未封裝項目** → 選擇 `chrome/` 資料夾。

**Firefox：** 開啟 `about:debugging#/runtime/this-firefox` →
**載入暫用附加元件** → 開啟 `firefox/` 資料夾並選擇 `manifest.json`。
（暫用附加元件在 Firefox 重新啟動前有效。如需永久安裝，
須使用 addons.mozilla.org 簽署的建置。）

然後在選項頁面中下載一次模型 — 點擊 **Download all models**
按鈕即可取得全部（偵測器、OCR 模型、修補器，共約 350MB）。
它們快取在瀏覽器（IndexedDB）中，不會重複下載。
每個檔案的位元組大小在下載後都會驗證；損壞的檔案會標示 ⚠
並可重新下載。

## 使用方式

1. **先將網站加入白名單** — 翻譯只在您明確允許的網站上執行。
   點擊擴充功能圖示並按 **Add this site to whitelist**
   （或在選項中新增主機名稱）。這是硬性門檻：
   處理流程不會在其他任何網站上執行。
2. 在白名單網站上開啟漫畫頁面。
3. 點擊擴充功能圖示 → **Translate this page**。
   每個網站首次使用時，Chrome 會請求一次性權限，
   以便擴充功能以完整解析度下載頁面圖片。
4. 頁面角落的狀態 pill 會顯示即時進度
   （Capturing → Detecting → OCR → …）。
   完成後，頁面自身的圖片會被就地取代為翻譯版本 —
   原文被修補清除，譯文重繪回對話框中。
   若頁面沒有明確的主圖，則改以浮層形式顯示譯文。

處理流程的輸入為頁面中最大的圖片，受最小圖片尺寸設定限制
（預設 500px）：更小的圖片會顯示明確錯誤並略過。
擴充功能直接讀取頁面自身的圖片 — 絕不會對網頁截圖。

**選項**（在圖示上按右鍵 → 選項）：網站白名單、來源/目標語言、
翻譯後端（Google 免費 / Azure Translator / LM Studio /
實驗性本機 LLM）、Azure 與 LM Studio 的連線測試按鈕、
偵測閾值、最小圖片尺寸（預設 500px — 更小的擷取會被略過）、
字型大小、除錯模式。

### LM Studio

執行啟用了 OpenAI 相容伺服器的 LM Studio（預設
`http://localhost:1234`，伺服器路徑 `/v1`）。
在選項中將後端選為 **LM Studio (local)**，設定伺服器 URL，
然後按 **Check LM Studio connection** 驗證連線。

## 從原始碼建置

無需打包器、無需 npm install — 原始碼本身就是擴充功能。
需求：`bash`、`python3`、`rsync`、`zip` 和 `node`
（僅用於語法檢查）。

```bash
git clone https://github.com/jameslee0623/comic-translate-4-free.git
cd comic-translate-4-free
./build.sh
```

這會產生 `dist/comic-translate-4-free-v<version>-<build>.zip`，
同時包含 `chrome/` 和 `firefox/`，
按上文「安裝」載入即可（Chrome 以未封裝方式，
Firefox 以暫用附加元件方式）。

`<build>` 戳記來自 `src/ui/options.js` 與 `src/ui/popup.js`
頂部的 `BUILD` 常數（保持兩者同步）。
建置前先調高它，可在檔名和 UI 頁尾中獲得唯一戳記 —
否則您的建置與同戳記的 release 建置無法區分。

擴充功能每個頁面只傳送一次批次請求：

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

模型應回覆譯文字串的 JSON 陣列 —
與輸入文字數量相同、順序一致。
較長回覆中裸露的 `[...]` 也會被接受；
最後的備援是每行一條譯文。

## 除錯模式

在選項中啟用**除錯模式**後，每個處理階段的輸出都會顯示在
側邊檢視面板中：擷取的影像、偵測框、文字區塊、
OCR 裁剪 + 辨識結果、修補遮罩、修補後的頁面、譯文。

## 架構

```
popup / options (src/ui)
      │ chrome.runtime messages
      ▼
background — 編排、擷取、文字區塊、遮罩、翻譯 API、
             除錯輸出
  ├─ Chrome: service worker + offscreen document (src/offscreen)
  │  承載全部 onnxruntime-web 工作階段
  │  （下載在其中執行，使 197MB 的抓取在 SW 休眠期間也能繼續）
  └─ Firefox: background page (src/background/background.html)
     在處理程序內承載相同的工作階段（Firefox 沒有 offscreen document）
└── content script (src/content) — 浮層畫布 + 文字渲染器 + 除錯面板
```

模型（Hugging Face，依需求下載）：
- `ogkalu/comic-text-and-bubble-detector` → `detector-v4-s_int8.onnx`
- `genshiai-daichi/baberu-ocr` → `vision_int4.onnx`、`decoder_prefill_int8.onnx`、
  `decoder_step_int8.onnx`（日文、英文、簡體中文）
- `PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx` → `inference.onnx`（韓文）
- `ogkalu/lama-manga-onnx-dynamic` → `lama-manga-dynamic.onnx`

處理階段：capture → detect → blocks → OCR → mask → inpaint →
translate → render。偵測在 640×640 下執行；
長寬比超過 3.5:1 的高圖以重疊的垂直切片處理。

**Chrome 與 Firefox 流水線：** 兩個建置版本都在 OCR 之後並行執行翻譯與
mask/inpaint。Chrome 透過 Promise.all 並行 —— ML 會話運行在 offscreen
文件的獨立執行緒中，因此各階段真正重疊執行。Firefox 在 Web Worker（獨立執行緒）
中執行翻譯，mask → inpaint 在主執行緒執行 —— 即使 WASM inpaint 佔用主執行緒，
Worker 的網路 I/O 也不會被阻塞。（Firefox 之前採用線性的 mask → inpaint →
translate 順序；單一執行緒的背景頁面無法在不卡死的情況下執行並行分支。）

## 已知限制

- 本機 LLM 後端為實驗性（需要 WebGPU + 數 GB 下載）。
- Google 後端使用非官方 `translate.googleapis.com` 端點，
  可能被限速；Azure 需要您自己的金鑰。
- OCR 引擎：Baberu（日文/英文/簡體中文）、PP-OCRv5（韓文）、
  PP-OCRv5（韓語）。
- 直書文字針對高 CJK 文字區塊渲染；對話框外的狀聲詞等
  使用獨立文字框。

## 第三方聲明

綑綁的函式庫、移植的程式碼、執行時下載的模型及其授權，
見 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
