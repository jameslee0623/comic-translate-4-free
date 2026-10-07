# comic-translate-4-free

**Idioma:** [English](README.md) · [हिन्दी](README.hi.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md)

Traduce páginas de manga y cómics en el navegador. Todo el proceso se ejecuta localmente:
detección de bocadillos y texto (RT-DETR-v2), OCR (Baberu para japonés, inglés y chino),
eliminación de texto
mediante inpainting con LaMa, traducción (Google / Azure / LLM local) y
re-renderizado ajustado dentro de los bocadillos originales.

La interfaz de la extensión sigue el idioma de tu navegador (inglés, japonés,
coreano, chino simplificado/tradicional, hindi, español, árabe, francés).

Este proyecto está inspirado en [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate).

## Descarga (sin necesidad de compilar)

**Chrome / Edge / Brave — instalar desde Chrome Web Store:**

[**Instalar comic-translate-4-free desde Chrome Web Store**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj)

O descarga la última versión desde la página de
[**Releases**](https://github.com/jameslee0623/comic-translate-4-free/releases)
— cada versión se compila automáticamente con CI. Descarga el zip de tu
navegador:

- `comic-translate-4-free-v<version>-<build>-chrome.zip` → Chrome / Edge / Brave
- `comic-translate-4-free-v<version>-<build>-firefox.zip` → Firefox

(También hay un `comic-translate-4-free-v<version>-<build>.zip` combinado
que contiene `chrome/` y `firefox/` lado a lado, por si quieres ambos a la vez.)
Nunca necesitas clonar el repositorio ni ejecutar `build.sh` por tu cuenta.

## Instalación

**Chrome (recomendado):** instalar desde
[**Chrome Web Store**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj)
— un clic, actualizaciones automáticas.

**Instalación manual (Chrome):** descarga el zip de Releases y descomprímelo,
luego ve a `chrome://extensions` → activa el **modo de desarrollador** →
**Cargar descomprimida** → selecciona la carpeta descomprimida.

**Firefox:** `about:debugging#/runtime/this-firefox` → **Cargar complemento
temporal** → abre la carpeta descomprimida y elige `manifest.json`. (Los
complementos temporales permanecen hasta que se reinicia Firefox. Para una
instalación permanente, la compilación debe estar firmada en addons.mozilla.org.
Estamos trabajando en una extensión firmada para la edición estándar de Firefox.)

Luego descarga los modelos una vez desde la página de Ajustes — un solo botón
**Descargar todos los modelos** obtiene todo (detector, modelos de OCR,
inpainting, ~350 MB en total). Se guardan en la caché del navegador (IndexedDB) y nunca
se vuelven a descargar. El tamaño en bytes de cada archivo se verifica después de la descarga; un
archivo truncado o incorrecto se marca con un ⚠ y se puede volver a descargar.

![Descargando los modelos desde la página de Ajustes](docs/images/options-models.png)

## Uso

1. **Permite el sitio primero** — la traducción solo se ejecuta en los sitios que
   permitas explícitamente. Haz clic en el icono de la extensión y pulsa **Permitir este sitio**
   (o añade nombres de host en Ajustes, o activa **PERMITIR TODOS LOS SITIOS** para omitir este
   paso en todas partes). Es una puerta estricta: el proceso se niega
   a ejecutarse en cualquier otro lugar.

   ![La ventana emergente de la extensión](docs/images/popup.png)

2. Abre una página de manga en un sitio permitido — comenzará a traducirse
   automáticamente en cuanto la página termine de cargarse, sin necesidad de hacer clic en
   ningún botón (se puede desactivar en Ajustes, en "Traducir automáticamente al cargar la página").
   En el primer uso en cada sitio, Chrome pide un permiso único para que la
   extensión pueda descargar la imagen de la página a máxima resolución.
3. Una píldora de estado en la esquina superior derecha de la página muestra el progreso en
   vivo (Capturando → Detectando → OCR → …). Al terminar, la propia imagen de la página se
   reemplaza en su lugar con la versión traducida — el texto original eliminado con
   inpainting y la traducción renderizada de nuevo dentro de los bocadillos.

Para traducir una imagen concreta en lugar de la imagen principal de la página,
haz clic derecho sobre ella y elige **Send to comic-translate-4-free**. Esto envía
esa imagen exacta por el proceso — incluso si es más pequeña que el
tamaño mínimo de imagen — y la reemplaza igualmente en su lugar. El elemento del menú solo
aparece en los sitios que hayas permitido.

Si el servidor de imágenes rechaza la descarga (HTTP 403, p. ej., protección antibots de
Cloudflare), la extensión abre automáticamente la imagen en una pestaña en segundo
plano — allí es del mismo origen, así que la imagen se lee directamente sin
descarga — la traduce, cierra la pestaña y reemplaza la imagen en tu
página en su lugar.

   ![El menú de clic derecho](docs/images/right-click.png)

La entrada del proceso es la imagen más grande de la página, limitada por el ajuste de tamaño
mínimo de imagen (500 px por defecto): las imágenes más pequeñas se omiten con un error
claro. La extensión lee directamente la propia imagen de la página — nunca
hace capturas de pantalla de la página web.

**Caché de páginas:** las páginas que vuelvas a visitar en la misma sesión del navegador se cargan al instante
desde una caché temporal en disco (traducir entre 10 y 40 imágenes en una sesión puede
bloquear el navegador y se pierden todas las imágenes de la caché. Recuerda borrar la
caché manualmente). La caché se borra automáticamente al cerrar el navegador
y nunca se usa en ventanas de incógnito.

**Ajustes** (clic en el icono → Ajustes): acceso a sitios, traducción automática al
cargar la página, idioma de origen (incluida la **detección automática**, que identifica
japonés / inglés / chino simplificado / tradicional a partir del texto del OCR)
e idioma de destino, motor de traducción (Google gratis / Azure
Translator / LM Studio), botones de prueba de conexión para Azure y LM Studio,
umbral de detección, tamaño mínimo de imagen (500 px por defecto — las capturas más pequeñas se
omiten), tamaños de fuente, modo de depuración y los controles de la caché de páginas traducidas.

![Página de Ajustes](docs/images/options.png)

## Apoya este proyecto

Si esta extensión te resulta útil, considera apoyar su desarrollo:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

### Solicitar una cuenta de Microsoft Azure

1. Crea una cuenta de Microsoft/hotmail/Azure o inicia sesión
2. Crea una suscripción de Azure
3. Crea un recurso de Azure Translator
4. Selecciona el plan de precios F0 (gratuito)
5. Administración de recursos → Claves y punto de conexión → copia la **CLAVE 1** y la **ubicación/región**

Microsoft indica actualmente que el nivel gratuito F0 de Translator es de 2 millones de caracteres al mes y no caduca.

### LM Studio

Ejecuta LM Studio con su servidor local habilitado (por defecto
`http://127.0.0.1:1234`). Selecciona **LM Studio (servidor local)** como motor de traducción
en Ajustes, configura la URL del servidor y el tipo de API — **API REST v1 de LM Studio**
(publica en `/api/v1/chat`) o **compatible con OpenAI** (publica en
`/v1/chat/completions`) — y pulsa **Comprobar la conexión de LM Studio** para
verificarlo. El modelo cargado se detecta automáticamente y se recuerda, así que no
hay ningún campo de nombre de modelo que rellenar.

## Compilar desde el código fuente

Sin empaquetador, sin npm install — el código fuente es la extensión. Requisitos:
`bash`, `python3`, `rsync`, `zip` y `node` (usado solo para una comprobación de sintaxis).

```bash
git clone https://github.com/jameslee0623/comic-translate-4-free.git
cd comic-translate-4-free
./build.sh
```

Esto escribe tres zips en `dist/` (más una copia del zip combinado por
comodidad):

- `comic-translate-4-free-v<version>-<build>.zip` — combinado, `chrome/` y
  `firefox/` lado a lado, listo para cargar descomprimido (Chrome) o como complemento
  temporal (Firefox) según "Instalación" más arriba
- `comic-translate-4-free-v<version>-<build>-chrome.zip` — solo compilación de Chrome,
  en formato de envío a la tienda
- `comic-translate-4-free-v<version>-<build>-firefox.zip` — solo compilación de Firefox,
  en formato de envío a la tienda

La marca `<build>` proviene de la constante `BUILD` en `src/shared/version.js`
(se muestra en los pies de la ventana emergente y de la página de ajustes, y forma parte de la clave de la caché de páginas).
Auméntala antes de compilar si quieres una marca única en el nombre del archivo y en el pie
de la interfaz — de lo contrario, tu compilación será indistinguible de la publicada
con la misma marca.

Por página, la extensión envía una única solicitud por lotes:

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

Se espera que el modelo responda con un array JSON de cadenas traducidas —
una por texto de entrada, en el mismo orden. Se acepta un `[...]` simple dentro de una respuesta más larga;
una traducción por línea es el último recurso.

## Modo de depuración

Activa el **modo de depuración** en Ajustes y la salida de cada etapa del proceso aparece en
un inspector en un panel lateral: imagen capturada, cuadros de detección, bloques de texto, recortes
de OCR + lecturas, la máscara de inpainting, la página con inpainting aplicado y las traducciones.

## Arquitectura

```
ventana emergente / ajustes (src/ui)
      │ mensajes de chrome.runtime
      ▼
background — orquestación, captura, bloques, máscara, APIs de traducción,
             emisión de depuración
  ├─ Chrome: service worker + documento offscreen (src/offscreen) que aloja
  │  TODAS las sesiones de onnxruntime-web (las descargas se ejecutan allí para que una descarga de 197 MB
  │  sobreviva al apagado del SW)
  └─ Firefox: página en segundo plano (src/background/background.html) que aloja las
     mismas sesiones en el proceso (Firefox no tiene documentos offscreen)
└── script de contenido (src/content) — lienzo superpuesto + renderizador de texto + panel de depuración
```

Modelos (Hugging Face, descargados bajo demanda):
- `ogkalu/comic-text-and-bubble-detector` → `detector-v4-s_int8.onnx`
- `genshiai-daichi/baberu-ocr` → `vision_int4.onnx`, `decoder_prefill_int8.onnx`,
  `decoder_step_int8.onnx` (japonés, inglés, chino simplificado/tradicional)
- `ogkalu/lama-manga-onnx-dynamic` → `lama-manga-dynamic.onnx`

Etapas del proceso: captura → detección → bloques → OCR → máscara → inpainting →
traducción → renderizado. La detección se ejecuta a 640×640; la captura se escala por área
(presupuesto de 6,5 MP) para que las tiras largas mantengan la resolución completa, y las páginas con
una relación de aspecto más extrema que 4:1 se procesan en segmentos superpuestos de 2:1.

**Proceso en Chrome frente a Firefox:** ambas compilaciones ejecutan la traducción en paralelo con
máscara/inpainting después del OCR. Chrome lo hace con Promise.all — las sesiones de ML
viven en el documento offscreen en su propio hilo, así que las etapas realmente
se solapan. Firefox ejecuta la traducción en un Web Worker (su propio hilo) mientras
máscara → inpainting se ejecuta en el hilo principal — la E/S de red del worker no se
bloquea cuando el inpainting WASM acapara el hilo principal.

## Limitaciones conocidas

- Aún no se ha encontrado un buen OCR para coreano — los idiomas de origen están limitados a japonés,
  inglés y chino simplificado/tradicional.
- La traducción automática procesa una sola imagen por página (la imagen principal de la página).
  Para traducir cualquier otra imagen de la página, haz clic derecho sobre ella y elige
  **Send to comic-translate-4-free**.
- Algunos servidores de imágenes bloquean las descargas automatizadas (HTTP 403, p. ej., protección antibots de
  Cloudflare) aunque la propia página cargue la imagen sin problemas. El
  **Send to comic-translate-4-free** del clic derecho lo evita mediante una
  pestaña en segundo plano; la traducción automática en esos sitios puede fallar con un error 403.
  Este bloqueo puede ser intermitente.
- Firefox: los modelos de IA se ejecutan dentro de la página en segundo plano del navegador (Firefox no tiene
  documentos offscreen) y comparten memoria con todo lo demás. En páginas muy grandes
  o sesiones largas, el motor puede quedarse sin memoria e informar
  "no available backend found". Reiniciar el navegador libera memoria; Chrome no se ve
  afectado, ya que ejecuta los modelos en un proceso separado.
- Chrome: traducir docenas de imágenes en una sesión puede bloquear el navegador
  (observado con unas 35 imágenes en caché).
- La caché de páginas tiene alcance de sesión: se borra al iniciar el navegador, así que
  después de un reinicio (incluso tras un bloqueo), las imágenes reenviadas ejecutan el proceso completo
  de nuevo en lugar de usar la caché.
- El motor de traducción de Google usa el punto de conexión no oficial `translate.googleapis.com`
  y puede estar sujeto a límites de frecuencia.
- El texto vertical se renderiza para bloques CJK altos; los efectos de sonido / el texto fuera de los bocadillos
  usan su propio cuadro de texto.

## Avisos de terceros

Las bibliotecas incluidas, el código portado y los modelos descargados en tiempo de ejecución se enumeran con
sus licencias en [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
