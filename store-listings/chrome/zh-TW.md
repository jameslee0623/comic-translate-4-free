# Chrome Web Store listing — 繁體中文 (zh-TW)

## Short description (132 chars max)

在瀏覽器中翻譯漫畫。辨識日語、英語、簡體及繁體中文，翻譯成 114 種語言。

(Count: 38)

## Detailed description

📖 用你的語言讀漫畫！

comic-translate-4-free 會在你瀏覽時自動翻譯漫畫和連環畫。它能辨識日語、英語、簡體/繁體中文（自動偵測），並翻譯成 114 種語言，在原地取代原始圖片。

✨ 功能
- 自動翻譯 — 在已允許的網站上開啟漫畫頁面，翻譯後的版本就會在原地出現，無需點擊按鈕。
- 頁面上的每張圖片 — 自動翻譯會處理頁面上的所有圖片（每次最多 50 張），而不只是主圖。
- 在任意圖片上按右鍵 — 選擇「傳送到 comic-translate-4-free」來翻譯特定圖片，即使它小於最小尺寸也可以。
- 透過 Google Translate、Azure Translator 或你自己的本機 LM Studio 伺服器，支援 114 種目標語言。
- 來源語言自動偵測 — 根據 OCR 辨識的文字自動辨識日語、英語、簡體/繁體中文。
- 長條 / 網路漫畫支援 — 高頁面按重疊分段處理，文字保持清晰。
- 17 種介面語言 — 擴充功能介面遵循瀏覽器的語言設定。

🔒 隱私
- AI 在你的電腦上執行。氣泡偵測、OCR 和修補填充（inpainting）都在瀏覽器中本機執行。偵測和 OCR 透過 WebAssembly 執行。修補填充在 Chrome 上透過 GPU 執行（可退回 WebAssembly），在 Firefox 上透過 WebAssembly 執行。你的頁面永遠不會離開你的裝置。
- 只有翻譯後的文字會被傳送出去 — 只有擷取出的字串會傳送到你選擇的翻譯服務（Google / Azure / 你本機的 LM Studio）。
- 無帳號、無追蹤、無遙測。所有設定和快取的模型都保留在瀏覽器的本機儲存空間中。

💡 使用方式
- 先允許該網站 — 點擊擴充功能圖示，按允許此網站（或啟用允許所有網站）。翻譯只在你授予權限的地方執行。

- 重新載入漫畫頁面 — 頁面載入時會自動開始翻譯。右上角的氣泡會顯示即時進度（Capturing → Detecting → OCR → …）。
- 完成 — 頁面圖片會在原地取代為翻譯後的版本。

小提示：
- 在任意圖片上按右鍵 → 傳送到 comic-translate-4-free，只翻譯那張圖片。

- 如果網站封鎖下載（HTTP 403），擴充功能會自動透過背景分頁重試。
- 在設定中選擇你的翻譯引擎：Google（免費，不需金鑰）、Azure Translator（在下方申請金鑰 — 每月 200 萬字元免費）或 LM Studio（本機伺服器）。
- 在設定中開啟除錯模式（階段檢視器），可以檢查管線的每個階段。

⚠️ 已知問題
- 暫無韓語 OCR — 來源語言為日語、英語和簡體/繁體中文。（韓語仍可作為翻譯目標語言使用。）
- 大型工作階段 — 在一次工作階段翻譯數十張圖片，可能會在背景重新啟動擴充功能。若發生這種情況，執行會自動從中止處繼續。
- Firefox — 模型在背景頁面中執行（沒有離屏文件），與其他所有內容共用記憶體。如果看到「no available backend found」，請重新啟動瀏覽器。
- Firefox 比 Chrome 慢 — Firefox 擴充功能無法使用共享記憶體進行多執行緒處理（SharedArrayBuffer），因此模型只在一個 CPU 執行緒上執行。這是 Firefox 平台的限制，不是擴充功能的錯誤。(Mozilla 錯誤 1673477)
- Google Translate 使用非官方免費端點，可能會受到速率限制。

📄 第三方聲明
本專案受 ogkalu2/comic-translate 啟發 — 氣泡/文字偵測器和漫畫微調的 LaMa 修補器是它的 ONNX 匯出，推論邏輯也是從它移植而來。（OCR 使用 genshiai-daichi 的 Baberu。）

捆綁的程式庫、移植的程式碼和執行時下載的模型及其授權列在 THIRD-PARTY-NOTICES.md 中。

PolyForm Noncommercial License 1.0.0 — 見 LICENSE。
https://github.com/jameslee0623/comic-translate-4-free
