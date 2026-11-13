# Chrome Web Store listing — 简体中文 (zh-CN)

## Short description (132 chars max)

在浏览器中翻译漫画。识别日语、英语、简体和繁体中文，翻译成 114 种语言。

(Count: 38)

## Detailed description

📖 **用你的语言读漫画——就在浏览器里。**

comic-translate-4-free 会在你浏览时自动翻译漫画和连环画页面。打开页面，翻译后的版本会在原地替换原始图片——气泡里填满你的语言，无需点击。

**工作原理**

1. 扩展会查找页面上的每张图片并捕获它们。
2. 设备上的 AI 检测器定位每个气泡和文本块。
3. 经漫画训练的 OCR 读取文本（日语、英语、简体/繁体中文——支持自动语言检测）。
4. 原文通过 AI 修复填充（inpainting）干净地移除。
5. 你选择的翻译引擎会把结果重新渲染回气泡中，并调整大小以适应。

**隐私优先：AI 在你的电脑上运行**

气泡检测和 OCR 通过 WebAssembly 在浏览器中本地运行，修复填充在 GPU 上运行（可回退到 WebAssembly）——你的页面永远不会离开你的设备。只有提取出的文本会发送到你选择的翻译服务。

**功能**

- 页面加载时自动翻译——无需点击按钮
- 翻译页面上的每张图片（每次最多 50 张），而不仅仅是主图
- 右键点击任意图片 → “发送到 comic-translate-4-free”即可直接翻译
- 通过 Google Translate、Azure Translator 或你自己的本地 LM Studio 服务器，支持 114 种目标语言
- 源语言自动检测
- 长条 / 网络漫画支持
- 适用于阻止自动下载的网站（通过后台标签页回退）
- 深色主题弹窗和设置，按网站进行访问控制
- 调试模式会显示流水线的每个阶段，方便排查问题

**非商业用途免费**

采用 PolyForm Noncommercial License 1.0.0 授权。无账号、无订阅、无追踪。
https://github.com/jameslee0623/comic-translate-4-free
