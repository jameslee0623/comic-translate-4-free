# Chrome Web Store listing — Português (pt)

## Short description (132 chars max)

Traduza mangás e quadrinhos no seu navegador. Lê japonês, inglês, chinês simplificado e tradicional; traduz para 114 idiomas.

(Count: 125)

## Detailed description

📖 Leia mangá no seu idioma!

comic-translate-4-free traduz mangá e quadrinhos automaticamente enquanto você navega. Ele lê japonês, inglês, chinês simplificado/tradicional (detecção automática) e traduz para 114 idiomas, substituindo a imagem no lugar.

✨ Recursos
- Tradução automática — abra uma página de mangá em um site permitido e a versão traduzida aparece no lugar, sem precisar clicar em nenhum botão.
- Cada imagem na página — a tradução automática cuida de todas as imagens da página (até 50 por execução), não apenas a imagem principal.
- Clique com o botão direito em qualquer imagem — escolha "Enviar para comic-translate-4-free" para traduzir uma imagem específica, mesmo que seja menor que o tamanho mínimo.
- 114 idiomas de destino via Google Translate, Azure Translator ou o seu próprio servidor local LM Studio.
- Detecção automática do idioma de origem — japonês, inglês, chinês simplificado/tradicional identificados automaticamente a partir do texto lido por OCR.
- Suporte a tiras longas / webtoon — páginas altas são processadas em segmentos sobrepostos para que o texto fique nítido.
- 17 idiomas de interface — a interface da extensão segue a configuração de idioma do seu navegador.

🔒 Privacidade
- A IA roda na sua máquina. A detecção de balões, o OCR e o inpainting rodam todos localmente no seu navegador. A detecção e o OCR rodam via WebAssembly. O inpainting roda na GPU no Chrome (com fallback para WebAssembly) e via WebAssembly no Firefox. Suas páginas nunca saem do seu dispositivo.
- Apenas o texto traduzido é enviado — apenas as strings extraídas vão para o serviço de tradução que você escolher (Google / Azure / seu LM Studio local).
- Sem conta, sem rastreamento, sem telemetria. Todas as configurações e modelos em cache ficam no armazenamento local do seu navegador.

💡 Como usar
- Permita o site primeiro — clique no ícone da extensão e pressione Permitir este site (ou ative Permitir todos os sites). A tradução só roda onde você concedeu permissão.

- Recarregue a página do mangá — ela começa a traduzir automaticamente ao carregar. Uma pílula no canto superior direito mostra o progresso ao vivo (Capturing → Detecting → OCR → …).
- Pronto — as imagens da página são substituídas no lugar pelas versões traduzidas.

Dicas:
- Clique com o botão direito em qualquer imagem → Enviar para comic-translate-4-free para traduzir só aquela imagem.

- Se um site bloquear downloads (HTTP 403), a extensão tenta novamente automaticamente por meio de uma aba em segundo plano.
- Escolha seu mecanismo de tradução em Configurações: Google (grátis, sem chave), Azure Translator (solicite as chaves abaixo — 2 milhões de caracteres/mês grátis) ou LM Studio (servidor local).
- Ative o Modo de depuração (inspetor de etapas) em Configurações para inspecionar cada etapa do pipeline.

⚠️ Problemas conhecidos
- Ainda não há OCR de coreano — os idiomas de origem são japonês, inglês e chinês simplificado/tradicional. (O coreano continua disponível como idioma de tradução.)
- Sessões grandes — traduzir dezenas de imagens em uma sessão pode reiniciar a extensão em segundo plano. Se isso acontecer, a execução retoma automaticamente de onde parou.
- Firefox — os modelos rodam na página de fundo (sem documentos offscreen), compartilhando memória com todo o resto. Reinicie o navegador se vir "no available backend found".
- O Firefox é mais lento que o Chrome — as extensões do Firefox não podem usar memória compartilhada para multithreading (SharedArrayBuffer), então o modelo roda em um único thread de CPU. Isso é um limite da plataforma Firefox, não um bug da extensão. (Bug da Mozilla 1673477).
- O Google Translate usa o endpoint gratuito não oficial e pode ter limite de taxa.

📄 Avisos de terceiros
Este projeto é inspirado em ogkalu2/comic-translate — o detector de balões/texto e o inpainter LaMa treinado com mangá são suas exportações ONNX, e a lógica de inferência foi portada dele. (O OCR usa Baberu de genshiai-daichi.)

As bibliotecas incluídas, o código portado e os modelos baixados em tempo de execução estão listados com suas licenças em THIRD-PARTY-NOTICES.md.

PolyForm Noncommercial License 1.0.0 — ver LICENSE.
https://github.com/jameslee0623/comic-translate-4-free
