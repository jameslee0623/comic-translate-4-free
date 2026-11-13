# Chrome Web Store listing — 繁體中文 (zh-TW)

## Short description (132 chars max)

在瀏覽器中翻譯漫畫。辨識日語、英語、簡體及繁體中文，翻譯成 114 種語言。

(Count: 38)

## Detailed description

**用你的語言讀漫畫——就在瀏覽器裡。**

comic-translate-4-free 會在你瀏覽時自動翻譯漫畫和連環畫頁面。開啟頁面，翻譯後的版本會在原地取代原始圖片——氣泡裡填滿你的語言，無需點擊。

**運作原理**

1. 擴充功能會找到頁面上的每一張圖片並擷取它們。
2. 裝置上的 AI 偵測器能定位每個氣泡和文字區塊。
3. 經漫畫訓練的 OCR 會讀取文字（日語、英語、簡體/繁體中文——支援自動語言偵測）。
4. 原文透過 AI 修補填充（inpainting）乾淨地移除。
5. 你選擇的翻譯引擎會將結果重新渲染回氣泡中，並調整大小以符合。

**隱私優先：AI 在你的電腦上執行**

氣泡偵測和 OCR 透過 WebAssembly 在瀏覽器中本機執行，修補填充在 GPU 上執行（可退回 WebAssembly）——你的頁面永遠不會離開你的裝置。只有擷取出來的文字會傳送到你選擇的翻譯服務。

**功能**

- 頁面載入時自動翻譯——無需點擊按鈕
- 翻譯頁面上的每張圖片（每次最多 50 張），而不只是主圖
- 在任意圖片上按右鍵 → 「傳送到 comic-translate-4-free」即可直接翻譯
- 透過 Google Translate、Azure Translator 或你自己的本機 LM Studio 伺服器，支援 114 種目標語言
- 來源語言自動偵測
- 長條 / 網路漫畫支援
- 適用於封鎖自動下載的網站（透過背景分頁備援）
- 深色主題彈出視窗與設定，按網站進行存取控制
- 除錯模式會顯示管線的每個階段，方便排查問題

**非商業用途免費**

採用 PolyForm Noncommercial License 1.0.0 授權。無帳號、無訂閱、無追蹤。
https://github.com/jameslee0623/comic-translate-4-free
