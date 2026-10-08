# comic-translate-4-free

**Language:** [English](README.md) · [हिन्दी](README.hi.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [বাংলা](README.bn.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Deutsch](README.de.md)

Lee manga en tu idioma — directamente en el navegador.

comic-translate-4-free traduce páginas de manga y cómics automáticamente mientras navegas. Lee japonés, inglés y chino simplificado y tradicional (con detección automática), y traduce a 114 idiomas. Abre una página y la versión traducida reemplaza la imagen original en su lugar — bocadillos llenos de tu idioma.

### 📸 Antes y después

| Antes (japonés) | Después (español) |
| --- | --- |
| ![Original Japanese manga page](docs/images/wikipe-tan-original.jpg) | ![Traducida al español](docs/images/wikipe-tan-es.jpg) |

<details>
<summary>Ver traducciones en 14 idiomas más</summary>

| hindi | coreano | chino simplificado |
| --- | --- | --- |
| ![Hindi](docs/images/wikipe-tan-hi.jpg) | ![Korean](docs/images/wikipe-tan-ko.jpg) | ![Simplified Chinese](docs/images/wikipe-tan-zh-CN.jpg) |

| chino tradicional | español | árabe |
| --- | --- | --- |
| ![Traditional Chinese](docs/images/wikipe-tan-zh-TW.jpg) | ![Spanish](docs/images/wikipe-tan-es.jpg) | ![Arabic](docs/images/wikipe-tan-ar.jpg) |

| francés | bengalí | portugués |
| --- | --- | --- |
| ![French](docs/images/wikipe-tan-fr.jpg) | ![Bengali](docs/images/wikipe-tan-bn.jpg) | ![Portuguese](docs/images/wikipe-tan-pt.jpg) |

| ruso | vietnamita | indonesio |
| --- | --- | --- |
| ![Russian](docs/images/wikipe-tan-ru.jpg) | ![Vietnamese](docs/images/wikipe-tan-vi.jpg) | ![Indonesian](docs/images/wikipe-tan-id.jpg) |

| urdu | alemán |
| --- | --- |
| ![Urdu](docs/images/wikipe-tan-ur.jpg) | ![German](docs/images/wikipe-tan-de.jpg) |

</details>

*Imagen original: [Wikipedia](https://en.wikipedia.org/wiki/Manga) vía Wikimedia Commons.*

---

## ✨ Características

- **Traducción automática** — abre una página de manga en un sitio permitido y la versión traducida aparece en su lugar, sin necesidad de hacer clic en ningún botón.
- **Clic derecho en cualquier imagen** — elige "Send to comic-translate-4-free" para traducir una imagen específica, incluso si es más pequeña que el tamaño mínimo.
- **114 idiomas de destino** con Google Translate, Azure Translator o tu propio servidor local de LM Studio.
- **Detección automática del idioma de origen** — japonés, inglés y chino simplificado/tradicional se identifican automáticamente a partir del texto reconocido por OCR.
- **Compatibilidad con tiras largas / webtoon** — las páginas altas se procesan en segmentos superpuestos para que el texto se mantenga nítido.
- **16 idiomas de interfaz** — la interfaz de la extensión sigue el idioma de tu navegador.

### 🔒 Privacidad

- **La IA se ejecuta en tu máquina.** La detección de bocadillos, el OCR y el rellenado (inpainting) se ejecutan localmente en tu navegador mediante WebAssembly. Tus páginas nunca salen de tu dispositivo.
- **Solo el texto traducido sale de tu dispositivo** — únicamente las cadenas extraídas se envían al servicio de traducción que elijas (Google / Azure / tu LM Studio local).
- **Sin cuenta, sin rastreo, sin telemetría.** Todos los ajustes y modelos descargados permanecen en el almacenamiento local de tu navegador.

---

## 🚀 Instalación

**Chrome / Edge / Brave:**

[**Instalar desde la Chrome Web Store**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj) — un clic, actualizaciones automáticas.

**Firefox:** descarga el zip de Firefox desde [Releases](https://github.com/jameslee0623/comic-translate-4-free/releases), luego ve a `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → elige `manifest.json`. (Los complementos temporales se descargan al reiniciar; la publicación firmada en AMO está en curso.)

Después de instalar, abre la página de Ajustes y haz clic en **Download all models** una vez (~350 MB: detector, OCR, inpainter). Quedan almacenados en caché en el navegador y se verifican por tamaño en bytes.

![Downloading the models from the Settings page](docs/images/options-models.png)

---

## 💡 Cómo usarla

1. **Permite primero el sitio** — haz clic en el icono de la extensión y pulsa **Allow this site** (o activa **ALLOW ALL SITES**). La traducción solo se ejecuta donde hayas otorgado permiso.

   ![Allow the site from the popup](docs/images/popup.png)

2. **Recarga la página del manga** — la traducción comienza automáticamente al cargar la página. Una píldora en la esquina superior derecha muestra el progreso en vivo (Capturando → Detectando → OCR → …).
3. **Listo** — la imagen de la página se reemplaza en su lugar con la versión traducida.

**Consejos:**
- Haz clic derecho en cualquier imagen → **Send to comic-translate-4-free** para traducir solo esa imagen.

  ![Right-click to send an image](docs/images/right-click.png)

- Si un sitio bloquea las descargas (HTTP 403), la extensión reintenta automáticamente a través de una pestaña en segundo plano.
- Elige tu motor de traducción en Ajustes: Google (gratis, sin clave), Azure Translator (solicita las claves abajo — 2M de caracteres/mes gratis) o LM Studio (servidor local).
- Activa **Debug mode** en Ajustes para inspeccionar cada etapa del proceso.

---

## 🔑 Solicita una cuenta de Microsoft Azure

Para usar Azure Translator como motor de traducción:

1. Crea una cuenta Microsoft/hotmail/Azure o inicia sesión
2. Crea una suscripción de Azure
3. Crea un recurso de Azure Translator
4. Selecciona el nivel de precios F0 (gratis) — 2 millones de caracteres/mes, no caduca
5. Administración de recursos → Claves y punto de conexión → copia **KEY 1** y **Location/Region**
6. Pégalas en la página de Ajustes de la extensión

---

## ❤️ Apoya este proyecto

Si esta extensión te resulta útil, considera apoyar su desarrollo:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

---

## ⚠️ Problemas conocidos

- **Aún sin OCR de coreano** — los idiomas de origen son japonés, inglés y chino simplificado/tradicional. (El coreano sigue disponible como idioma de destino.)
- **Una imagen por página** en la traducción automática (la imagen principal de la página). Usa clic derecho → enviar para traducir otras.
- **Sesiones largas** — traducir decenas de imágenes en una sesión puede hacer que el navegador se bloquee. Borra la caché de páginas en Ajustes si ocurre.
- **Firefox** — los modelos se ejecutan en la página de fondo (sin documentos offscreen), compartiendo memoria con todo lo demás. Reinicia el navegador si ves "no available backend found".
- Google Translate usa el punto de conexión gratuito no oficial y puede tener límites de velocidad.

---

## 📄 Avisos de terceros

Este proyecto está inspirado en [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate) — el detector de bocadillos/texto y el inpainter LaMa ajustado para manga son sus exportaciones ONNX, y la lógica de inferencia está portada desde él. (El OCR usa [Baberu](https://huggingface.co/genshiai-daichi/baberu-ocr) de genshiai-daichi.)

Las bibliotecas incluidas, el código portado y los modelos descargados en tiempo de ejecución se enumeran con sus licencias en [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Licencia MIT — ver [LICENSE](LICENSE).
