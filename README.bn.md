# comic-translate-4-free

**Language:** [English](README.md) · [हिन्दी](README.hi.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [বাংলা](README.bn.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Deutsch](README.de.md)

ব্রাউজারেই নিজের ভাষায় মাঙ্গা পড়ুন।

comic-translate-4-free ব্রাউজ করার সময় মাঙ্গা ও কমিক পৃষ্ঠা স্বয়ংক্রিয়ভাবে অনুবাদ করে। এটি জাপানি, ইংরেজি, সরলীকৃত ও ঐতিহ্যবাহী চীনা পড়তে পারে (স্বয়ংক্রিয় সনাক্তকরণসহ), আর অনুবাদ করে ১১৪টি ভাষায়। পৃষ্ঠা খুলুন — মূল ছবির জায়গাতেই অনুদিত সংস্করণ বসে যাবে — বক্তব্য-বুদ্বুদ ভরে উঠবে আপনার ভাষায়।

### 📸 আগে ও পরে

| আগে (জাপানি) | পরে (বাংলা) |
| --- | --- |
| ![মূল জাপানি মাঙ্গা পৃষ্ঠা](docs/images/wikipe-tan-original.jpg) | ![বাংলায় অনুদিত](docs/images/wikipe-tan-bn.jpg) |

<details>
<summary>আরও ১৪টি ভাষায় অনুবাদ দেখুন</summary>

| হিন্দি | কোরীয় | সরলীকৃত চীনা |
| --- | --- | --- |
| ![হিন্দি](docs/images/wikipe-tan-hi.jpg) | ![কোরীয়](docs/images/wikipe-tan-ko.jpg) | ![সরলীকৃত চীনা](docs/images/wikipe-tan-zh-CN.jpg) |

| ঐতিহ্যবাহী চীনা | স্প্যানিশ | আরবি |
| --- | --- | --- |
| ![ঐতিহ্যবাহী চীনা](docs/images/wikipe-tan-zh-TW.jpg) | ![স্প্যানিশ](docs/images/wikipe-tan-es.jpg) | ![আরবি](docs/images/wikipe-tan-ar.jpg) |

| ফরাসি | বাংলা | পর্তুগিজ |
| --- | --- | --- |
| ![ফরাসি](docs/images/wikipe-tan-fr.jpg) | ![বাংলা](docs/images/wikipe-tan-bn.jpg) | ![পর্তুগিজ](docs/images/wikipe-tan-pt.jpg) |

| রুশ | ভিয়েতনামি | ইন্দোনেশীয় |
| --- | --- | --- |
| ![রুশ](docs/images/wikipe-tan-ru.jpg) | ![ভিয়েতনামি](docs/images/wikipe-tan-vi.jpg) | ![ইন্দোনেশীয়](docs/images/wikipe-tan-id.jpg) |

| উর্দু | জার্মান |
| --- | --- |
| ![উর্দু](docs/images/wikipe-tan-ur.jpg) | ![জার্মান](docs/images/wikipe-tan-de.jpg) |

</details>

*মূল ছবি: [Wikipedia](https://en.wikipedia.org/wiki/Manga) — Wikimedia Commons সৌজন্যে।*

---

## ✨ ফিচারসমূহ

- **স্বয়ংক্রিয় অনুবাদ** — অনুমোদিত সাইটে মাঙ্গা পৃষ্ঠা খুলুন, মূল ছবির জায়গাতেই অনুদিত সংস্করণ দেখা যাবে — কোনো বোতাম চাপার দরকার নেই।
- **যেকোনো ছবিতে রাইট-ক্লিক করুন** — নির্দিষ্ট ছবি অনুবাদ করতে "Send to comic-translate-4-free" বেছে নিন, এমনকি ন্যূনতম সাইজের চেয়ে ছোট হলেও।
- **১১৪টি লক্ষ্য ভাষা** — Google Translate, Azure Translator বা আপনার নিজের স্থানীয় LM Studio সার্ভারের মাধ্যমে।
- **উৎস ভাষা স্বয়ংক্রিয় সনাক্তকরণ** — OCR-করা লেখা থেকে জাপানি, ইংরেজি, সরলীকৃত/ঐতিহ্যবাহী চীনা স্বয়ংক্রিয়ভাবে শনাক্ত হয়।
- **লম্বা স্ট্রিপ / ওয়েবটুন সাপোর্ট** — লম্বা পৃষ্ঠা ওভারল্যাপিং অংশে ভাগ করে প্রসেস করা হয়, যাতে লেখা ঝকঝকে থাকে।
- **১৬টি UI ভাষা** — এক্সটেনশনের ইন্টারফেস আপনার ব্রাউজারের ভাষা সেটিং অনুসরণ করে।

### 🔒 প্রাইভেসি

- **AI চলে আপনার মেশিনে।** বাবল সনাক্তকরণ, OCR ও ইনপেইন্টিং সবই আপনার ব্রাউজারে WebAssembly-এর মাধ্যমে স্থানীয়ভাবে চলে। আপনার পৃষ্ঠা কখনোই আপনার ডিভাইস ছাড়ে না।
- **শুধু অনুদিত লেখাটুকু পাঠানো হয়** — শুধু তোলা লেখাগুলোই যায় আপনার বেছে নেওয়া অনুবাদ সেবায় (Google / Azure / আপনার স্থানীয় LM Studio)।
- **কোনো অ্যাকাউন্ট, ট্র্যাকিং বা টেলিমেট্রি নেই।** সব সেটিং ও ক্যাশ করা মডেল আপনার ব্রাউজারের লোকাল স্টোরেজে থাকে।

---

## 🚀 ইনস্টলেশন

**Chrome / Edge / Brave:**

[**Chrome Web Store থেকে ইনস্টল করুন**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj) — এক ক্লিকে, স্বয়ংক্রিয় আপডেট।

**Firefox:** [Releases](https://github.com/jameslee0623/comic-translate-4-free/releases) থেকে Firefox zip ডাউনলোড করুন, তারপর `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → `manifest.json` বেছে নিন। (অস্থায়ী অ্যাড-অন রিস্টার্টে আনলোড হয়ে যায়; সই করা AMO লিস্টিং প্রক্রিয়াধীন।)

ইনস্টলের পর Settings পেজ খুলে **Download all models**-এ একবার ক্লিক করুন (~৩৫০ MB: ডিটেক্টর, OCR, ইনপেইন্টার)। এগুলো ব্রাউজারে ক্যাশ হয় এবং বাইট সাইজ দিয়ে যাচাই করা হয়।

![Settings পেজ থেকে মডেল ডাউনলোড হচ্ছে](docs/images/options-models.png)

---

## 💡 ব্যবহারবিধি

1. **আগে সাইটটিকে অনুমতি দিন** — এক্সটেনশন আইকনে ক্লিক করে **Allow this site** চাপুন (বা **ALLOW ALL SITES** চালু করুন)। আপনি যেখানে অনুমতি দিয়েছেন, শুধু সেখানেই অনুবাদ চলবে।

   ![পপআপ থেকে সাইটে অনুমতি দিন](docs/images/popup.png)

2. **মাঙ্গা পৃষ্ঠা রিলোড করুন** — পৃষ্ঠা লোড হলেই স্বয়ংক্রিয়ভাবে অনুবাদ শুরু হয়। উপরে ডানদিকে একটি পিলে লাইভ অগ্রগতি দেখা যায় (Capturing → Detecting → OCR → …)।
3. **শেষ** — পৃষ্ঠার ছবি একই জায়গায় অনুদিত সংস্করণে বদলে যায়।

**টিপস:**
- যেকোনো ছবিতে রাইট-ক্লিক → **Send to comic-translate-4-free** — শুধু সেই ছবিটা অনুবাদ করতে।

  ![ছবি পাঠাতে রাইট-ক্লিক করুন](docs/images/right-click.png)

- কোনো সাইট ডাউনলোড ব্লক করলে (HTTP 403), এক্সটেনশন ব্যাকগ্রাউন্ড ট্যাবের মাধ্যমে স্বয়ংক্রিয়ভাবে আবার চেষ্টা করে।
- Settings-এ আপনার অনুবাদ ইঞ্জিন বেছে নিন: Google (ফ্রি, কী লাগে না), Azure Translator (নিচে কী-এর জন্য আবেদন করুন — মাসে ২ মিলিয়ন অক্ষর ফ্রি), বা LM Studio (স্থানীয় সার্ভার)।
- প্রতিটি পাইপলাইন স্টেজ পরীক্ষা করতে Settings-এ **Debug mode** চালু করুন।

---

## 🔑 Microsoft Azure অ্যাকাউন্টের জন্য আবেদন করুন

Azure Translator-কে অনুবাদ ইঞ্জিন হিসেবে ব্যবহার করতে:

1. Microsoft/hotmail/Azure অ্যাকাউন্ট তৈরি/সাইন-ইন করুন
2. একটি Azure subscription তৈরি করুন
3. একটি Azure Translator resource তৈরি করুন
4. F0 (ফ্রি) প্রাইসিং টিয়ার বেছে নিন — মাসে ২ মিলিয়ন অক্ষর, মেয়াদোত্তীর্ণ হয় না
5. Resource Management → Keys and Endpoint → **KEY 1** ও **Location/Region** কপি করুন
6. এক্সটেনশনের Settings পেজে পেস্ট করুন

---

## ❤️ এই প্রকল্পকে সাপোর্ট করুন

এই এক্সটেনশনটি আপনার কাজে লাগলে, এর উন্নয়নে সহায়তার কথা ভাবুন:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

---

## ⚠️ জ্ঞাত সমস্যা

- **কোরীয় OCR এখনো নেই** — উৎস ভাষা: জাপানি, ইংরেজি ও সরলীকৃত/ঐতিহ্যবাহী চীনা। (অনুবাদের লক্ষ্য ভাষা হিসেবে কোরীয় এখনো পাওয়া যায়।)
- স্বয়ংক্রিয় অনুবাদে **প্রতি পৃষ্ঠায় একটি ছবি** (পৃষ্ঠার প্রধান ছবি)। অন্যগুলো অনুবাদ করতে রাইট-ক্লিক → Send ব্যবহার করুন।
- **বড় সেশন** — এক সেশনে ডজনখানেক ছবি অনুবাদ করলে ব্রাউজার ক্র্যাশ করতে পারে। এমন হলে Settings থেকে পেজ ক্যাশ সাফ করুন।
- **Firefox** — মডেলগুলো ব্যাকগ্রাউন্ড পেজে চলে (offscreen documents নেই), বাকি সবকিছুর সাথে মেমরি ভাগ করে। "no available backend found" দেখলে ব্রাউজার রিস্টার্ট করুন।
- Google Translate অনানুষ্ঠানিক ফ্রি এন্ডপয়েন্ট ব্যবহার করে, রেট-লিমিট হতে পারে।

---

## 📄 তৃতীয় পক্ষের নোটিশ

এই প্রকল্পটি [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate) থেকে অনুপ্রাণিত — বাবল/টেক্সট ডিটেক্টর ও মাঙ্গা-ফাইনটিউনড LaMa ইনপেইন্টার এর ONNX এক্সপোর্ট, এবং ইনফারেন্স লজিক সেখান থেকে পোর্ট করা। (OCR-এ ব্যবহৃত [Baberu](https://huggingface.co/genshiai-daichi/baberu-ocr) — genshiai-daichi-এর তৈরি।)

বান্ডেল করা লাইব্রেরি, পোর্ট করা কোড ও রানটাইমে ডাউনলোড করা মডেলগুলো লাইসেন্সসহ [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)-তে তালিকাভুক্ত।

MIT License — [LICENSE](LICENSE) দেখুন।
