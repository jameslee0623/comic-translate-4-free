# Chrome Web Store listing — 简体中文 (zh-CN)

## Short description (132 chars max)

在浏览器中翻译漫画。识别日语、英语、简体和繁体中文，翻译成 114 种语言。

(Count: 38)

## Detailed description

📖 用你的语言读漫画！

comic-translate-4-free 会在你浏览时自动翻译漫画和连环画。它能识别日语、英语、简体/繁体中文（自动检测），并翻译成 114 种语言，在原地替换原始图片。

✨ 功能
- 自动翻译 — 在已允许的网站上打开漫画页面，翻译后的版本就会在原地出现，无需点击按钮。
- 页面上的每张图片 — 自动翻译会处理页面上的所有图片（每次最多 50 张），而不仅仅是主图。
- 右键点击任意图片 — 选择“发送到 comic-translate-4-free”来翻译特定图片，即使它小于最小尺寸也可以。
- 通过 Google Translate、Azure Translator 或你自己的本地 LM Studio 服务器，支持 114 种目标语言。
- 源语言自动检测 — 根据 OCR 识别的文本自动识别日语、英语、简体/繁体中文。
- 长条 / 网络漫画支持 — 高页面按重叠分段处理，文字保持清晰。
- 17 种界面语言 — 扩展界面遵循浏览器的语言设置。

🔒 隐私
- AI 在你的电脑上运行。气泡检测、OCR 和修复填充（inpainting）都在浏览器中本地运行。检测和 OCR 通过 WebAssembly 运行。修复填充在 Chrome 上通过 GPU 运行（可回退到 WebAssembly），在 Firefox 上通过 WebAssembly 运行。你的页面永远不会离开你的设备。
- 只有翻译后的文本会被发送出去 — 只有提取出的字符串会发送到你选择的翻译服务（Google / Azure / 你本地的 LM Studio）。
- 无账号、无追踪、无遥测。所有设置和缓存的模型都保留在浏览器的本地存储中。

💡 使用方法
- 先允许该网站 — 点击扩展图标，按允许此网站（或启用允许所有网站）。翻译只在你授予权限的地方运行。

- 重新加载漫画页面 — 页面加载时会自动开始翻译。右上角的气泡会显示实时进度（Capturing → Detecting → OCR → …）。
- 完成 — 页面图片会在原地替换为翻译后的版本。

小贴士：
- 右键点击任意图片 → 发送到 comic-translate-4-free，只翻译那张图片。

- 如果某个网站阻止下载（HTTP 403），扩展会通过后台标签页自动重试。
- 在设置中选择你的翻译引擎：Google（免费，无需密钥）、Azure Translator（在下方申请密钥 — 每月 200 万字符免费）或 LM Studio（本地服务器）。
- 在设置中启用调试模式（阶段检查器），可以检查流水线的每个阶段。

⚠️ 已知问题
- 暂无韩语 OCR — 源语言为日语、英语和简体/繁体中文。（韩语仍可作为翻译目标语言使用。）
- 大型会话 — 在一次会话中翻译数十张图片可以在后台重启扩展。如果发生这种情况，运行会自动从中断处恢复。
- Firefox — 模型在后台页面中运行（没有离屏文档），与其他所有内容共享内存。如果看到“no available backend found”，请重新启动浏览器。
- Firefox 比 Chrome 慢 — Firefox 扩展无法使用共享内存进行多线程处理（SharedArrayBuffer），因此模型只在一个 CPU 线程上运行。这是 Firefox 平台的限制，不是扩展的错误。(Mozilla 错误 1673477)
- Google Translate 使用非官方免费端点，可能会受到速率限制。

📄 第三方声明
本项目受 ogkalu2/comic-translate 启发 — 气泡/文本检测器和漫画微调的 LaMa 修复器是它的 ONNX 导出，推理逻辑也是从它移植而来。（OCR 使用 genshiai-daichi 的 Baberu。）

捆绑的库、移植的代码和运行时下载的模型及其许可证列在 THIRD-PARTY-NOTICES.md 中。

PolyForm Noncommercial License 1.0.0 — 见 LICENSE。
https://github.com/jameslee0623/comic-translate-4-free
