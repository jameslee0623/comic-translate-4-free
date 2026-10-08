# comic-translate-4-free

**Language:** [English](README.md) · [हिन्दी](README.hi.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [বাংলা](README.bn.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Deutsch](README.de.md)

اقرأ المانغا بلغتك — داخل المتصفح مباشرة.

تقوم comic-translate-4-free بترجمة صفحات المانغا والقصص المصوّرة تلقائيًا أثناء التصفح. فهي تقرأ اليابانية والإنجليزية والصينية المبسطة والتقليدية (مع الاكتشاف التلقائي)، وتترجم إلى 114 لغة. افتح الصفحة، فتستبدل النسخة المترجمة الصورة الأصلية في مكانها — وتصبح فقاعات الكلام بلغتك.

### 📸 قبل وبعد

| قبل (اليابانية) | بعد (العربية) |
| --- | --- |
| ![Original Japanese manga page](docs/images/wikipe-tan-original.jpg) | ![مترجمة إلى العربية](docs/images/wikipe-tan-ar.jpg) |

<details>
<summary>شاهد الترجمات بـ 14 لغة أخرى</summary>

| الهندية | الكورية | الصينية المبسطة |
| --- | --- | --- |
| ![Hindi](docs/images/wikipe-tan-hi.jpg) | ![Korean](docs/images/wikipe-tan-ko.jpg) | ![Simplified Chinese](docs/images/wikipe-tan-zh-CN.jpg) |

| الصينية التقليدية | الإسبانية | العربية |
| --- | --- | --- |
| ![Traditional Chinese](docs/images/wikipe-tan-zh-TW.jpg) | ![Spanish](docs/images/wikipe-tan-es.jpg) | ![Arabic](docs/images/wikipe-tan-ar.jpg) |

| الفرنسية | البنغالية | البرتغالية |
| --- | --- | --- |
| ![French](docs/images/wikipe-tan-fr.jpg) | ![Bengali](docs/images/wikipe-tan-bn.jpg) | ![Portuguese](docs/images/wikipe-tan-pt.jpg) |

| الروسية | الفيتنامية | الإندونيسية |
| --- | --- | --- |
| ![Russian](docs/images/wikipe-tan-ru.jpg) | ![Vietnamese](docs/images/wikipe-tan-vi.jpg) | ![Indonesian](docs/images/wikipe-tan-id.jpg) |

| الأردية | الألمانية |
| --- | --- |
| ![Urdu](docs/images/wikipe-tan-ur.jpg) | ![German](docs/images/wikipe-tan-de.jpg) |

</details>

*الصورة الأصلية: [Wikipedia](https://en.wikipedia.org/wiki/Manga) عبر Wikimedia Commons.*

---

## ✨ المزايا

- **الترجمة التلقائية** — افتح صفحة مانغا على موقع مسموح به وستظهر النسخة المترجمة في مكانها، دون الحاجة إلى النقر على أي زر.
- **انقر بزر الفأرة الأيمن على أي صورة** — اختر "Send to comic-translate-4-free" لترجمة صورة محددة، حتى لو كانت أصغر من الحد الأدنى للحجم.
- **114 لغة مستهدفة** عبر Google Translate أو Azure Translator أو خادم LM Studio المحلي الخاص بك.
- **الاكتشاف التلقائي للغة المصدر** — تُحدَّد اليابانية والإنجليزية والصينية المبسطة/التقليدية تلقائيًا من النص المُستخرَج.
- **دعم الشرائط الطويلة / الويبتون** — تُعالَج الصفحات الطويلة في مقاطع متداخلة ليبقى النص واضحًا.
- **16 لغة للواجهة** — تتبع واجهة الإضافة لغة المتصفح الخاصة بك.

### 🔒 الخصوصية

- **الذكاء الاصطناعي يعمل على جهازك.** اكتشاف الفقاعات والتعرف على النص (OCR) وملء الفراغات (inpainting) كلها تُنفَّذ محليًا في متصفحك عبر WebAssembly. صفحاتك لا تغادر جهازك أبدًا.
- **يُرسَل النص المترجَم فقط** — لا يغادر جهازك سوى النصوص المستخرجة، وتذهب إلى خدمة الترجمة التي تختارها (Google / Azure / خادم LM Studio المحلي).
- **لا حساب، لا تتبّع، لا قياسات استخدام.** جميع الإعدادات والنماذج المخزَّنة تبقى في التخزين المحلي لمتصفحك.

---

## 🚀 التثبيت

**Chrome / Edge / Brave:**

[**ثبّت من Chrome Web Store**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj) — بنقرة واحدة، مع التحديثات التلقائية.

**Firefox:** نزّل ملف Firefox المضغوط من [Releases](https://github.com/jameslee0623/comic-translate-4-free/releases)، ثم انتقل إلى `about:debugging#/runtime/this-firefox` ← **Load Temporary Add-on** ← اختر `manifest.json`. (الإضافات المؤقتة تُزال عند إعادة التشغيل؛ قائمة AMO الموقَّعة قيد الإعداد.)

بعد التثبيت، افتح صفحة الإعدادات وانقر على **Download all models** مرة واحدة (~350 MB: الكاشف، والتعرف على النص، وملء الفراغات). تُخزَّن في المتصفح ويُتحقَّق منها حسب حجم الملف.

![Downloading the models from the Settings page](docs/images/options-models.png)

---

## 💡 كيفية الاستخدام

1. **اسمح للموقع أولًا** — انقر على أيقونة الإضافة واضغط **Allow this site** (أو فعّل **ALLOW ALL SITES**). الترجمة لا تعمل إلا حيث منحتَ الإذن.

   ![Allow the site from the popup](docs/images/popup.png)

2. **أعد تحميل صفحة المانغا** — تبدأ الترجمة تلقائيًا عند تحميل الصفحة. يعرض شريط في أعلى اليمين التقدّم المباشر (Capturing ← Detecting ← OCR ← …).
3. **انتهى** — تُستبدَل صورة الصفحة في مكانها بالنسخة المترجمة.

**تلميحات:**
- انقر بزر الفأرة الأيمن على أي صورة ← **Send to comic-translate-4-free** لترجمة تلك الصورة فقط.

  ![Right-click to send an image](docs/images/right-click.png)

- إذا حظر موقع ما التنزيلات (HTTP 403)، تُعيد الإضافة المحاولة تلقائيًا عبر علامة تبويب في الخلفية.
- اختر محرك الترجمة من الإعدادات: Google (مجاني، بلا مفتاح)، أو Azure Translator (قدّم طلبًا للحصول على المفاتيح أدناه — 2M حرف/شهر مجانًا)، أو LM Studio (خادم محلي).
- فعّل **Debug mode** في الإعدادات لفحص كل مرحلة من مراحل المعالجة.

---

## 🔑 التقديم للحصول على حساب Microsoft Azure

لاستخدام Azure Translator كمحرك للترجمة:

1. أنشئ حساب Microsoft/Hotmail/Azure أو سجّل الدخول إليه
2. أنشئ اشتراك Azure
3. أنشئ مورد Azure Translator
4. اختر خطة الأسعار F0 (مجانية) — 2 مليون حرف/شهر، ولا تنتهي صلاحيتها
5. إدارة المورد ← Keys and Endpoint ← انسخ **KEY 1** و **Location/Region**
6. الصقهما في صفحة إعدادات الإضافة

---

## ❤️ ادعم هذا المشروع

إذا كانت هذه الإضافة مفيدة لك، فكّر في دعم تطويرها:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

---

## ⚠️ مشكلات معروفة

- **لا يوجد تعرّف على النص الكوري بعد** — لغات المصدر هي اليابانية والإنجليزية والصينية المبسطة/التقليدية. (تبقى الكورية متاحة كلغة مستهدفة للترجمة.)
- **صورة واحدة لكل صفحة** في الترجمة التلقائية (الصورة الرئيسية للصفحة). استخدم النقر بزر الفأرة الأيمن ← Send لترجمة الصور الأخرى.
- **الجلسات الكبيرة** — ترجمة عشرات الصور في جلسة واحدة قد تُعطّل المتصفح. امسح ذاكرة التخزين المؤقت للصفحات من الإعدادات إذا حدث ذلك.
- **Firefox** — تعمل النماذج في صفحة الخلفية (لا مستندات offscreen)، وتتقاسم الذاكرة مع كل شيء آخر. أعد تشغيل المتصفح إذا رأيت رسالة "no available backend found".
- يستخدم Google Translate نقطة النهاية المجانية غير الرسمية وقد يخضع لتقييد المعدل.

---

## 📄 إشعارات الأطراف الثالثة

هذا المشروع مستوحى من [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate) — كاشف الفقاعات/النص وملء الفراغات LaMa المضبوط على المانغا هما تصديران بصيغة ONNX من ذلك المشروع، ومنطق الاستدلال منقول منه. (يستخدم التعرف على النص [Baberu](https://huggingface.co/genshiai-daichi/baberu-ocr) من genshiai-daichi.)

المكتبات المضمّنة والكود المنقول والنماذج المُنزَّلة أثناء التشغيل مذكورة مع تراخيصها في [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

رخصة MIT — راجع [LICENSE](LICENSE).
