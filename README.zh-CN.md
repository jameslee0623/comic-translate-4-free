# comic-translate-4-free

**Language:** [English](README.md) · [हिन्दी](README.hi.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [বাংলা](README.bn.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Deutsch](README.de.md)

直接在浏览器里，用你的语言看漫画。

comic-translate-4-free 会在你浏览时自动翻译漫画和条漫页面。它支持日语、英语、简体和繁体中文（自动识别原文语言），可翻译成 114 种语言。打开页面后，译文版本会原位替换原图——对话气泡里直接填上你的语言。

### 📸 之前 / 之后

| 之前（日语） | 之后（简体中文） |
| --- | --- |
| ![原始日语漫画页面](docs/images/wikipe-tan-original.jpg) | ![已翻译为简体中文](docs/images/wikipe-tan-zh-CN.jpg) |

<details>
<summary>查看另外 14 种语言的翻译</summary>

| 印地语 | 韩语 | 简体中文 |
| --- | --- | --- |
| ![印地语](docs/images/wikipe-tan-hi.jpg) | ![韩语](docs/images/wikipe-tan-ko.jpg) | ![简体中文](docs/images/wikipe-tan-zh-CN.jpg) |

| 繁體中文 | 西班牙语 | 阿拉伯语 |
| --- | --- | --- |
| ![繁體中文](docs/images/wikipe-tan-zh-TW.jpg) | ![西班牙语](docs/images/wikipe-tan-es.jpg) | ![阿拉伯语](docs/images/wikipe-tan-ar.jpg) |

| 法语 | 孟加拉语 | 葡萄牙语 |
| --- | --- | --- |
| ![法语](docs/images/wikipe-tan-fr.jpg) | ![孟加拉语](docs/images/wikipe-tan-bn.jpg) | ![葡萄牙语](docs/images/wikipe-tan-pt.jpg) |

| 俄语 | 越南语 | 印尼语 |
| --- | --- | --- |
| ![俄语](docs/images/wikipe-tan-ru.jpg) | ![越南语](docs/images/wikipe-tan-vi.jpg) | ![印尼语](docs/images/wikipe-tan-id.jpg) |

| 乌尔都语 | 德语 |
| --- | --- |
| ![乌尔都语](docs/images/wikipe-tan-ur.jpg) | ![德语](docs/images/wikipe-tan-de.jpg) |

</details>

*原始图片：[维基百科](https://en.wikipedia.org/wiki/Manga)，来自 Wikimedia Commons。*

---

## ✨ 功能

- **自动翻译** — 在已授权的网站上打开漫画页面，译文版本会自动原位显示，无需点击按钮。
- **右键翻译任意图片** — 选择 "Send to comic-translate-4-free"，翻译指定的某张图片，哪怕它小于最小尺寸也不受影响。
- **114 种目标语言**，通过 Google 翻译、Azure 翻译或你自己的本地 LM Studio 服务器。
- **原文语言自动识别** — 从 OCR 识别的文字中自动判断日语、英语、简体/繁体中文。
- **长条漫 / webtoon 支持** — 高而长的页面分段重叠处理，文字始终清晰。
- **16 种界面语言** — 扩展界面跟随你的浏览器语言设置。

### 🔒 隐私

- **AI 在你的机器上运行。** 气泡检测、OCR 和图像修复都在你的浏览器里通过 WebAssembly 本地执行。页面内容从不离开你的设备。
- **只有译文文本会被发出去** — 只有提取出的字符串会发送到你选择的翻译服务（Google / Azure / 本地 LM Studio）。
- **无账号、无追踪、无遥测。** 所有设置和缓存的模型都保存在浏览器本地存储中。

---

## 🚀 安装

**Chrome / Edge / Brave：**

[**从 Chrome 应用商店安装**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj) — 一键安装，自动更新。

**Firefox：** 从 [Releases](https://github.com/jameslee0623/comic-translate-4-free/releases) 下载 Firefox 压缩包，然后前往 `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → 选择 `manifest.json`。（临时加载的扩展在重启后会卸载；正在推进 AMO 签名上架。）

安装后打开设置页，点击一次 **Download all models**（约 350 MB：检测器、OCR、修复器）。模型会缓存到浏览器中并按字节大小校验。

![从设置页下载模型](docs/images/options-models.png)

---

## 💡 使用方法

1. **先给网站授权** — 点击扩展图标，按 **Allow this site**（或启用 **ALLOW ALL SITES**）。翻译只在你授权过的网站上运行。

   ![在弹出窗口中给网站授权](docs/images/popup.png)

2. **刷新漫画页面** — 页面加载时会自动开始翻译。右上角的小 pill 会实时显示进度（Capturing → Detecting → OCR → …）。
3. **完成** — 页面的图片会被原位替换为译文版本。

**小技巧：**
- 右键点击任意图片 → **Send to comic-translate-4-free**，只翻译那张图片。

  ![右键发送图片](docs/images/right-click.png)

- 如果某个网站禁止下载（HTTP 403），扩展会自动改用后台标签页重试。
- 在设置中选择翻译引擎：Google（免费，无需密钥）、Azure 翻译（见下方申请方式——每月 200 万字符免费）、或 LM Studio（本地服务器）。
- 在设置中启用 **Debug mode**，可查看流水线每一阶段的输出。

---

## 🔑 申请 Microsoft Azure 账号

要把 Azure 翻译作为翻译引擎：

1. 创建/登录 Microsoft / Hotmail / Azure 账号
2. 创建一个 Azure 订阅
3. 创建一个 Azure 翻译资源
4. 选择 F0（免费）定价层 — 每月 200 万字符，永久免费
5. 资源管理 → 密钥和终结点 → 复制 **KEY 1** 和 **Location/Region**
6. 把它们粘贴到扩展的设置页中

---

## ❤️ 支持这个项目

如果这个扩展对你有帮助，欢迎支持它的开发：

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

---

## ⚠️ 已知问题

- **暂不支持韩语 OCR** — 源语言为日语、英语和简体/繁体中文。（韩语仍可作为翻译目标语言。）
- **自动翻译每页只处理一张图片**（页面的主图）。用右键 → Send 翻译其他图片。
- **长时间会话** — 一次会话翻译几十张图片可能导致浏览器崩溃。如遇此情况，请在设置中清除页面缓存。
- **Firefox** — 模型运行在后台页面（没有 offscreen 页面），与其它组件共享内存。如果看到 "no available backend found"，请重启浏览器。
- Google 翻译使用非官方免费接口，可能会被限流。

---

## 📄 第三方声明

本项目的灵感来自 [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate) — 气泡/文字检测器和漫画微调的 LaMa 修复器是它的 ONNX 导出模型，推理逻辑也移植自它。（OCR 使用 genshiai-daichi 的 [Baberu](https://huggingface.co/genshiai-daichi/baberu-ocr)。）

捆绑的库、移植的代码以及运行时下载的模型都列在 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) 中，并附有各自的许可证。

MIT 许可证 — 详见 [LICENSE](LICENSE)。
