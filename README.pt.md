# comic-translate-4-free

**Language:** [English](README.md) · [हिन्दी](README.hi.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [Português](README.pt.md)

Traduza páginas de mangá/quadrinhos no navegador. Todo o pipeline roda localmente:
detecção de balões/texto (RT-DETR-v2), OCR (Baberu para japonês/inglês/chinês),
remoção de texto
via inpainting LaMa, tradução (Google / Azure / LLM local) e re-renderização
com quebra de linha dentro dos balões de fala originais.

A interface da extensão segue o idioma do seu navegador (inglês, japonês,
coreano, chinês simplificado/tradicional, hindi, espanhol, árabe, francês,
português).

Este projeto foi inspirado por [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate).

## Download (sem precisar compilar)

**Chrome / Edge / Brave — instale pela Chrome Web Store:**

[**Instalar comic-translate-4-free pela Chrome Web Store**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj)

Ou baixe a versão mais recente na página
[**Releases**](https://github.com/jameslee0623/comic-translate-4-free/releases)
— cada release é compilada automaticamente pelo CI. Baixe o zip do seu
navegador:

- `comic-translate-4-free-v<version>-<build>-chrome.zip` → Chrome / Edge / Brave
- `comic-translate-4-free-v<version>-<build>-firefox.zip` → Firefox

(Também há um `comic-translate-4-free-v<version>-<build>.zip` combinado,
com `chrome/` e `firefox/` lado a lado, caso queira os dois de uma vez.)
Você nunca precisa clonar o repositório nem rodar o `build.sh`.

## Instalação

**Chrome (recomendado):** instale pela
[**Chrome Web Store**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj)
— um clique, com atualizações automáticas.

**Instalação manual (Chrome):** baixe o zip da página Releases acima e descompacte,
depois acesse `chrome://extensions` → ative o **Modo do desenvolvedor** →
**Carregar sem compactação** → selecione a pasta descompactada.

**Firefox:** acesse `about:debugging#/runtime/this-firefox` → **Carregar
complemento temporário** → abra a pasta descompactada e escolha o `manifest.json`.
(Complementos temporários funcionam até o Firefox ser reiniciado. Para uma instalação
permanente, a build precisa ser assinada em addons.mozilla.org. Estamos trabalhando
em uma extensão assinada para o Firefox padrão.)

Depois baixe os modelos uma vez pela página de Configurações — um botão
**Baixar todos os modelos** baixa tudo (detector, modelos de OCR,
inpainter, ~350 MB no total). Eles ficam em cache no navegador (IndexedDB) e nunca
são baixados de novo. O tamanho em bytes de cada arquivo é verificado após o download; um
arquivo truncado ou errado é sinalizado com ⚠ e pode ser baixado novamente.

![Baixando os modelos pela página de Configurações](docs/images/options-models.png)

## Uso

1. **Permita o site primeiro** — a tradução só funciona em sites que você
   permitir explicitamente. Clique no ícone da extensão e pressione **Permitir
   este site** (ou adicione hostnames nas Configurações, ou ative **PERMITIR
   TODOS OS SITES** para pular esta etapa em todos os lugares). Esta é uma
   trava rígida: o pipeline se recusa a rodar em qualquer outro lugar.

   ![O popup da extensão](docs/images/popup.png)

2. Abra uma página de mangá em um site permitido — ela começa a ser traduzida
   automaticamente assim que termina de carregar, sem precisar clicar em nada
   (pode ser desligado nas Configurações em "Traduzir automaticamente ao carregar
   a página"). No primeiro uso em cada site, o Chrome pede uma permissão única
   para que a extensão possa baixar a imagem da página em resolução máxima.
3. Uma pílula de status no canto superior direito da página mostra o progresso
   ao vivo (Capturando → Detectando → OCR → …). Ao terminar, a imagem da página
   é substituída no lugar pela versão traduzida — texto original removido com
   inpainting, tradução renderizada de volta nos balões.

Para traduzir uma imagem específica em vez da imagem principal da página,
clique com o botão direito nela e escolha **Send to comic-translate-4-free**.
Isso envia exatamente aquela imagem pelo pipeline — mesmo quando ela for menor
que o tamanho mínimo de imagem — e ainda a substitui no lugar. O item de menu
só aparece em sites que você permitiu.

Se o servidor da imagem recusar o download (HTTP 403, ex. proteção antibot
Cloudflare), a extensão abre automaticamente a imagem em uma aba em segundo
plano — lá ela é same-origin, então a imagem é lida diretamente sem download —
traduz, fecha a aba e substitui a imagem na sua página no lugar.

   ![O menu de botão direito](docs/images/right-click.png)

A entrada do pipeline é a maior imagem da página, limitada pela configuração de
tamanho mínimo de imagem (padrão 500px): imagens menores são ignoradas com um
erro claro. A extensão lê a imagem da própria página diretamente — ela nunca
tira screenshot da página.

**Cache de páginas:** páginas que você revisita na mesma sessão do navegador
carregam instantaneamente de um cache temporário em disco (traduzir 10~40 imagens
em uma sessão pode travar o navegador e fazer perder todas as imagens do cache.
Lembre-se de limpar o cache manualmente). O cache é apagado automaticamente
quando o navegador fecha e nunca é usado em janelas anônimas.

**Configurações** (clique no ícone → Configurações): acesso a sites, tradução
automática ao carregar a página, idioma de origem (incluindo **Detecção
automática**, que identifica japonês / inglês / chinês simplificado /
tradicional a partir do texto do OCR) e idioma de destino, mecanismo de tradução
(Google grátis / Azure Translator / LM Studio), botões de teste de conexão para
Azure e LM Studio, limite de detecção, tamanho mínimo de imagem (padrão 500px —
capturas menores são ignoradas), tamanhos de fonte, modo de depuração e os
controles do cache de páginas traduzidas.

![Página de configurações](docs/images/options.png)

## Apoie este projeto

Se esta extensão for útil para você, considere apoiar seu desenvolvimento:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

### Solicitar uma conta Microsoft Azure

1. Crie/entre em uma conta Microsoft/hotmail/Azure
2. Crie uma assinatura do Azure
3. Crie um recurso do Azure Translator
4. Selecione o plano de preços F0 (gratuito)
5. Gerenciamento de recursos → Chaves e Ponto de Extremidade → copie a **KEY 1** e o **Local/Região**

A Microsoft informa atualmente que o nível gratuito F0 do Translator é de 2 milhões de caracteres/mês e não expira.

### LM Studio

Rode o LM Studio com o servidor local ativado (padrão
`http://127.0.0.1:1234`). Selecione **LM Studio (servidor local)** como
mecanismo de tradução nas Configurações, defina a URL do servidor e o tipo de
API — **API REST v1 do LM Studio** (posta em `/api/v1/chat`) ou
**Compatível com OpenAI** (posta em `/v1/chat/completions`) — e pressione
**Testar conexão do LM Studio** para verificar. O modelo carregado é detectado
automaticamente e lembrado, então não há campo de nome de modelo para preencher.

## Compilar do código-fonte

Sem bundler, sem npm install — o código-fonte é a extensão. Requisitos:
`bash`, `python3`, `rsync`, `zip` e `node` (usado apenas para verificação de sintaxe).

```bash
git clone https://github.com/jameslee0623/comic-translate-4-free.git
cd comic-translate-4-free
./build.sh
```

Isso gera três zips em `dist/` (mais uma cópia do zip combinado por
conveniência):

- `comic-translate-4-free-v<version>-<build>.zip` — combinado, `chrome/` e
  `firefox/` lado a lado, pronto para carregar sem compactação (Chrome) ou como
  complemento temporário (Firefox) conforme "Instalação" acima
- `comic-translate-4-free-v<version>-<build>-chrome.zip` — só a build do Chrome,
  no layout de submissão para a loja
- `comic-translate-4-free-v<version>-<build>-firefox.zip` — só a build do Firefox,
  no layout de submissão para a loja

O carimbo `<build>` vem da constante `BUILD` em `src/shared/version.js`
(exibida nos rodapés do popup e da página de configurações, embutida na chave
do cache de páginas). Incremente-o antes de compilar se quiser um carimbo único
no nome do arquivo e no rodapé da interface — caso contrário sua build será
indistinguível da release oficial com o mesmo carimbo.

Por página a extensão envia uma única requisição em lote:

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

Espera-se que o modelo responda com um array JSON de strings traduzidas —
uma por texto de entrada, na mesma ordem. Um `[...]` puro dentro de uma resposta
mais longa é aceito; uma tradução por linha é o fallback de último recurso.

## Modo de depuração

Ative o **Modo de depuração** nas Configurações e a saída de cada etapa do
pipeline aparece em um inspetor em painel lateral: imagem capturada, caixas de
detecção, blocos de texto, recortes de OCR + leituras, máscara de inpainting,
página com inpainting e traduções.

## Arquitetura

```
popup / configurações (src/ui)
      │ mensagens chrome.runtime
      ▼
background — orquestração, captura, blocos, máscara, APIs de tradução,
             emissão de debug
  ├─ Chrome: service worker + documento offscreen (src/offscreen) hospedando
  │  TODAS as sessões onnxruntime-web (os downloads rodam lá para que um fetch
  │  de 197 MB sobreviva ao desligamento do SW)
  └─ Firefox: página de background (src/background/background.html) hospedando as
     mesmas sessões in-process (o Firefox não tem documentos offscreen)
└── content script (src/content) — canvas de overlay + renderizador de texto + painel de debug
```

Modelos (Hugging Face, baixados sob demanda):
- `ogkalu/comic-text-and-bubble-detector` → `detector-v4-s_int8.onnx`
- `genshiai-daichi/baberu-ocr` → `vision_int4.onnx`, `decoder_prefill_int8.onnx`,
  `decoder_step_int8.onnx` (japonês, inglês, chinês simplificado/tradicional)
- `ogkalu/lama-manga-onnx-dynamic` → `lama-manga-dynamic.onnx`

Etapas do pipeline: captura → detecção → blocos → OCR → máscara → inpainting →
tradução → renderização. A detecção roda em 640×640; a captura é escalada por área
(orçamento de 6,5 MP) para que tiras longas mantenham resolução máxima, e páginas
com proporção mais extrema que 4:1 são processadas em segmentos 2:1 sobrepostos.

**Pipeline Chrome vs Firefox:** ambas as builds rodam a tradução em paralelo com
máscara/inpainting após o OCR. O Chrome usa Promise.all — as sessões de ML ficam
no documento offscreen em sua própria thread, então as etapas realmente se
sobrepõem. O Firefox roda a tradução em um Web Worker (sua própria thread) enquanto
máscara → inpainting roda na thread principal — o I/O de rede do worker não é
bloqueado quando o inpainting WASM ocupa a thread principal.

## Limitações conhecidas

- Ainda não encontramos um bom OCR para coreano — os idiomas de origem se limitam a
  japonês, inglês e chinês simplificado/tradicional.
- A tradução automática processa uma única imagem por página (a imagem principal
  da página). Para traduzir qualquer outra imagem da página, clique com o botão
  direito nela e escolha **Send to comic-translate-4-free**.
- Alguns hosts de imagem bloqueiam downloads automatizados (HTTP 403, ex. proteção
  antibot Cloudflare) mesmo que a própria página carregue a imagem normalmente. O
  **Send to comic-translate-4-free** do botão direito contorna isso via uma aba em
  segundo plano; a tradução automática nesses sites pode falhar com erro 403.
  Esse bloqueio pode ser intermitente.
- Firefox: os modelos de IA rodam dentro da página de background do navegador (o
  Firefox não tem documentos offscreen), compartilhando memória com todo o resto. Em
  páginas muito grandes ou sessões longas, o mecanismo pode ficar sem memória e
  reportar "no available backend found". Reiniciar o navegador libera memória; o
  Chrome não é afetado, pois roda os modelos em um processo separado.
- Chrome: traduzir dezenas de imagens em uma sessão pode travar o navegador
  (observado por volta de 35 imagens em cache).
- O cache de páginas tem escopo de sessão: ele é apagado quando o navegador inicia,
  então após reiniciar (inclusive após um travamento) imagens reenviadas rodam o
  pipeline completo de novo em vez de acertar o cache.
- O mecanismo de tradução Google usa o endpoint não-oficial `translate.googleapis.com`
  e pode sofrer rate-limit.
- Texto vertical é renderizado para blocos CJK altos; SFX / texto fora dos balões
  usa sua própria caixa de texto.

## Avisos de terceiros

Bibliotecas incluídas, código portado e modelos baixados em runtime estão listados
com suas licenças em [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
