# Chrome Web Store listing — Português (pt)

## Short description (132 chars max)

Traduza mangás e quadrinhos no seu navegador. Lê japonês, inglês, chinês simplificado e tradicional; traduz para 114 idiomas.

(Count: 125)

## Detailed description

**Leia mangás no seu idioma — diretamente no navegador.**

comic-translate-4-free traduz páginas de quadrinhos e mangás automaticamente enquanto você navega. Abra uma página, e a versão traduzida substitui a imagem original no lugar — balões de fala cheios do seu idioma, sem clicar em nada.

**Como funciona**

1. A extensão encontra todas as imagens da página e as captura.
2. Um detector de IA no dispositivo localiza cada balão de fala e cada bloco de texto.
3. O OCR treinado em mangá lê o texto (japonês, inglês, chinês simplificado e tradicional — com detecção automática do idioma).
4. O texto original é removido limpamente com inpainting de IA.
5. O mecanismo de tradução da sua escolha devolve o resultado aos balões, com o tamanho ajustado.

**Privacidade em primeiro lugar: a IA roda na sua máquina**

A detecção de balões e o OCR rodam localmente no seu navegador via WebAssembly, e o inpainting roda na sua GPU (com fallback para WebAssembly) — suas páginas nunca saem do seu dispositivo. Apenas o texto extraído é enviado para o serviço de tradução que você escolher.

**Recursos**

- Tradução automática ao carregar as páginas — sem apertar nenhum botão
- Traduz todas as imagens da página (até 50 por execução), não apenas a imagem principal
- Clique com o botão direito em qualquer imagem → "Enviar para comic-translate-4-free" para traduzi-la diretamente
- 114 idiomas de destino via Google Translate, Azure Translator ou o seu próprio servidor local LM Studio
- Detecção automática do idioma de origem
- Suporte a tiras longas / webtoon
- Funciona em sites que bloqueiam downloads automáticos (nova tentativa por meio de uma aba em segundo plano)
- Popup e configurações com tema escuro, controles de acesso por site
- O Modo de depuração mostra cada etapa do pipeline para solução de problemas

**Grátis para uso não comercial**

Licenciado sob a PolyForm Noncommercial License 1.0.0. Sem conta, sem assinatura, sem rastreamento.
https://github.com/jameslee0623/comic-translate-4-free
