# comic-translate-4-free

**語言：** [English](README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)

在瀏覽器內翻譯漫畫頁面。完整處理流程在本機執行：
對話框/文字偵測（RT-DETR-v2）、OCR（日文/英文/中文用 Baberu）、透過 LaMa 影像修補清除原文、翻譯
（Google / Azure / 本機 LLM），以及將譯文換行重繪回原對話框。

擴充功能 UI 會跟隨瀏覽器的語言設定（英文、日文、韓文、中文簡體/繁體）。

由 [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate)
移植到 Manifest V3 + ONNX Runtime Web（WASM）。

## 下載（無需建置）

從 [**Releases**](https://github.com/jameslee0623/comic-translate-4-free/releases)
頁面取得最新 release — 每個 release 都由 CI 自動建置。
請下載對應您瀏覽器的 zip：

- `comic-translate-4-free-v<version>-<build>-chrome.zip` → Chrome / Edge / Brave
- `comic-translate-4-free-v<version>-<build>-firefox.zip` → Firefox

（另有合併版 `comic-translate-4-free-v<version>-<build>.zip`，
同時包含 `chrome/` 和 `firefox/`，如需兩者可一併下載。）
您無需複製儲存庫或自行執行 `build.sh`。

## 安裝

下載上方對應您瀏覽器的 zip 並解壓縮。

**Chrome：** 開啟 `chrome://extensions` → 啟用**開發人員模式** →
**載入未封裝項目** → 選擇解壓縮後的資料夾。

**Firefox：** 開啟 `about:debugging#/runtime/this-firefox` →
**載入暫用附加元件** → 開啟解壓縮後的資料夾並選擇 `manifest.json`。
（暫用附加元件在 Firefox 重新啟動前有效。如需永久安裝，
須使用 addons.mozilla.org 簽署的建置 —— 標準版 Firefox 的簽署建置正在準備中。）

然後在設定頁面中下載一次模型 — 點擊 **Download all models**
按鈕即可取得全部（偵測器、OCR 模型、修補器，共約 350MB）。
它們快取在瀏覽器（IndexedDB）中，不會重複下載。
每個檔案的位元組大小在下載後都會驗證；損壞的檔案會標示 ⚠
並可重新下載。

![在設定頁面下載模型](docs/images/options-models.png)

## 使用方式

1. **先允許該網站** — 翻譯只在您明確允許的網站上執行。
   點擊擴充功能圖示並按 **Allow this site**
   （或在設定中新增主機名稱，或開啟 **Allow all sites** 以跳過此步驟）。這是硬性門檻：
   處理流程不會在其他任何網站上執行。

   ![擴充功能彈出視窗](docs/images/popup.png)
2. 在已允許的網站上開啟漫畫頁面 — 頁面載入完成後即自動開始翻譯，
   無需點擊按鈕（可在設定中透過 "Auto-translate on page load" 開關）。
   每個網站首次使用時，Chrome 會請求一次性權限，
   以便擴充功能以完整解析度下載頁面圖片。
3. 頁面右上角的狀態 pill 會顯示即時進度
   （Capturing → Detecting → OCR → …）。
   完成後，頁面自身的圖片會被就地取代為翻譯版本 —
   原文被修補清除，譯文重繪回對話框中。

若想翻譯的不是頁面主圖而是某一特定圖片，在該圖片上按右鍵並選擇
**Send to comic-translate-4-free**。該圖片會被直接送入處理流程 —
   即使小於最小圖片尺寸也會處理 — 並就地取代。
   該選單項目僅在您已允許的網站上出現。

![右鍵選單](docs/images/right-click.png)

處理流程的輸入為頁面中最大的圖片，受最小圖片尺寸設定限制
（預設 500px）：更小的圖片會顯示明確錯誤並略過。
擴充功能直接讀取頁面自身的圖片 — 絕不會對網頁截圖。

**頁面快取：** 在同一個瀏覽器工作階段中再次造訪的頁面，會從暫時磁碟快取即時
載入（快取的是修復後的圖像＋翻譯文字，因此變更字級無需重新翻譯即可重新算繪）。
關閉瀏覽器時快取會自動清除，無痕視窗中不會使用快取。

**設定**（點擊圖示 → 設定）：網站存取、頁面載入時自動翻譯、
來源/目標語言、翻譯引擎（Google 免費 / Azure Translator / LM Studio）、
Azure 與 LM Studio 的連線測試按鈕、偵測閾值、
最小圖片尺寸（預設 500px — 更小的擷取會被略過）、
字型大小、除錯模式，以及已翻譯頁面快取的管理。

## 支持本專案

如果這個擴充功能對你有幫助，歡迎支持它的開發：

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

### 申請 Microsoft Azure 帳戶

1. 建立/登入 Microsoft/hotmail/Azure 帳戶
2. 建立 Azure 訂用帳戶
3. 建立 Azure Translator 資源
4. 選擇 F0（Free）定價層
5. 資源管理 → 金鑰和端點 → 複製 **KEY 1** 和 **位置/區域**

Microsoft 目前表示，Translator 的 F0 免費 tier 為每月 200 萬字元，且不會過期。

### LM Studio

執行啟用了本機伺服器的 LM Studio（預設
`http://127.0.0.1:1234`）。在設定中將翻譯引擎選為
**LM Studio (local server)**，設定伺服器 URL 與 API 類型 —
**LM Studio REST API v1**（向 `/api/v1/chat` 發送請求）或
**OpenAI-compatible**（向 `/v1/chat/completions` 發送請求） —
然後按 **Check LM Studio connection** 驗證連線。
已載入的模型會自動偵測並記住，無需填寫模型名稱。

## 從原始碼建置

無需打包器、無需 npm install — 原始碼本身就是擴充功能。
需求：`bash`、`python3`、`rsync`、`zip` 和 `node`
（僅用於語法檢查）。

```bash
git clone https://github.com/jameslee0623/comic-translate-4-free.git
cd comic-translate-4-free
./build.sh
```

這會在 `dist/` 產生三個 zip（合併版另有一份方便取用的複本）：

- `comic-translate-4-free-v<version>-<build>.zip` — 合併版，
  同時包含 `chrome/` 和 `firefox/`，
  按上文「安裝」載入即可（Chrome 以未封裝方式，
  Firefox 以暫用附加元件方式）
- `comic-translate-4-free-v<version>-<build>-chrome.zip` — 僅 Chrome 建置，
  商店送審版面
- `comic-translate-4-free-v<version>-<build>-firefox.zip` — 僅 Firefox 建置，
  商店送審版面

`<build>` 戳記來自 `src/shared/version.js` 中的 `BUILD` 常數
（顯示在彈出視窗和設定頁面頁尾，並用作頁面快取的鍵）。
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

在設定中啟用**除錯模式**後，每個處理階段的輸出都會顯示在
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

- 還沒有找到好的韓文 OCR — 來源語言限於日文、英文、簡體/繁體中文。
- 自動翻譯每頁只處理一張圖片（頁面的主圖）。
  要翻譯頁面上的其他圖片，請在該圖片上按右鍵並選擇
  **Send to comic-translate-4-free**。
- Firefox：AI 模型在瀏覽器的背景頁面內執行（Firefox 沒有離屏文件），
  與其他所有內容共用記憶體。在非常大的頁面或長時間使用後，引擎可能記憶體不足
  並報告 "no available backend found"。重新啟動瀏覽器可釋放記憶體；Chrome 不受影響，
  因為它在獨立處理程序中執行模型。
- Chrome：在一個工作階段中翻譯數十張圖片可能導致瀏覽器當機
  （在快取約 35 張圖片時觀察到）。
- 頁面快取是工作階段級的：瀏覽器啟動時會被清除，因此重新啟動後（包括當機後），
  重新傳送的圖片會走完整流程，不會命中快取。
- Google 翻譯引擎使用非官方 `translate.googleapis.com` 端點，
  可能被限速。
- 直書文字針對高 CJK 文字區塊渲染；對話框外的狀聲詞等
  使用獨立文字框。

## 第三方聲明

綑綁的函式庫、移植的程式碼、執行時下載的模型及其授權，
見 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

