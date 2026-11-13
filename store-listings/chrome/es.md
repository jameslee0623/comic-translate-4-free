# Chrome Web Store listing — Español (es)

## Short description (132 chars max)

Traduce manga y cómics en tu navegador. Lee japonés, inglés, chino simplificado y tradicional; traduce a 114 idiomas.

(Count: 117)

## Detailed description

📖 ¡Lee manga en tu idioma!

comic-translate-4-free traduce manga y cómics automáticamente mientras navegas. Lee japonés, inglés, chino simplificado/tradicional (detección automática), y traduce a 114 idiomas, reemplazando la imagen en su lugar.

✨ Funciones
- Traducción automática — abre una página de manga en un sitio permitido y la versión traducida aparece en su lugar, sin necesidad de hacer clic en ningún botón.
- Cada imagen en la página — la traducción automática gestiona todas las imágenes de una página (hasta 50 por ejecución), no solo la imagen principal.
- Clic derecho en cualquier imagen — elige "Enviar a comic-translate-4-free" para traducir una imagen concreta, incluso si es más pequeña que el tamaño mínimo.
- 114 idiomas de destino con Google Translate, Azure Translator o tu propio servidor local de LM Studio.
- Detección automática del idioma de origen — japonés, inglés, chino simplificado/tradicional se identifican automáticamente a partir del texto leído por OCR.
- Soporte para tiras largas / webtoon — las páginas altas se procesan en segmentos superpuestos para que el texto se mantenga nítido.
- 17 idiomas de interfaz — la interfaz de la extensión sigue el ajuste de idioma de tu navegador.

🔒 Privacidad
- La IA se ejecuta en tu equipo. La detección de bocadillos, el OCR y el inpainting se ejecutan localmente en tu navegador. La detección y el OCR se ejecutan con WebAssembly. El inpainting se ejecuta con GPU en Chrome (con WebAssembly como alternativa) y con WebAssembly en Firefox. Tus páginas nunca salen de tu dispositivo.
- Solo se envía el texto traducido — solo las cadenas extraídas van al servicio de traducción que elijas (Google / Azure / tu LM Studio local).
- Sin cuenta, sin rastreo, sin telemetría. Todos los ajustes y modelos en caché permanecen en el almacenamiento local de tu navegador.

💡 Cómo usarlo
- Permite primero el sitio — haz clic en el icono de la extensión y pulsa Permitir este sitio (o activa Permitir todos los sitios). La traducción solo se ejecuta donde hayas concedido permiso.

- Recarga la página de manga — empieza a traducir automáticamente cuando se carga la página. Una píldora en la parte superior derecha muestra el progreso en vivo (Capturing → Detecting → OCR → …).
- Listo — las imágenes de la página se reemplazan en su lugar con las versiones traducidas.

Consejos:
- Clic derecho en cualquier imagen → Enviar a comic-translate-4-free para traducir solo esa imagen.

- Si un sitio bloquea las descargas (HTTP 403), la extensión reintenta automáticamente a través de una pestaña en segundo plano.
- Elige tu motor de traducción en Ajustes: Google (gratis, sin clave), Azure Translator (solicita las claves abajo — 2M de caracteres/mes gratis) o LM Studio (servidor local).
- Activa el Modo de depuración (inspector de etapas) en Ajustes para inspeccionar cada etapa del proceso.

⚠️ Problemas conocidos
- Aún no hay OCR de coreano — los idiomas de origen son japonés, inglés y chino simplificado/tradicional. (El coreano sigue disponible como idioma de traducción.)
- Sesiones grandes — traducir decenas de imágenes en una sola sesión puede reiniciar la extensión en segundo plano. Si eso ocurre, la ejecución se reanuda automáticamente desde donde lo dejó.
- Firefox — los modelos se ejecutan en la página en segundo plano (sin documentos offscreen), compartiendo memoria con todo lo demás. Reinicia el navegador si ves "no available backend found".
- Firefox es más lento que Chrome — las extensiones de Firefox no pueden usar memoria compartida para multihilo (SharedArrayBuffer), por lo que el modelo se ejecuta en un solo hilo de CPU. Esto es un límite de la plataforma Firefox, no un error de la extensión. (Bug de Mozilla 1673477).
- Google Translate usa el endpoint gratuito no oficial y puede tener límite de velocidad.

📄 Avisos de terceros
Este proyecto está inspirado en ogkalu2/comic-translate — el detector de bocadillos/texto y el inpainter LaMa entrenado con manga son sus exportaciones ONNX, y la lógica de inferencia está portada de él. (El OCR usa Baberu de genshiai-daichi.)

Las bibliotecas incluidas, el código portado y los modelos descargados en tiempo de ejecución se enumeran con sus licencias en THIRD-PARTY-NOTICES.md.

PolyForm Noncommercial License 1.0.0 — ver LICENSE.
https://github.com/jameslee0623/comic-translate-4-free
