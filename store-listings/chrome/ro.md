# Chrome Web Store listing — Română (ro)

## Short description (132 chars max)

Tradu manga și benzi desenate în browser. Citește japoneză, engleză, chineză simplificată și tradițională; traduce în 114 limbi.

(Count: 128)

## Detailed description

**Citește manga în limba ta — direct în browser.**

comic-translate-4-free traduce automat pagini de benzi desenate și manga pe măsură ce navighezi. Deschide o pagină, iar versiunea tradusă înlocuiește imaginea originală chiar acolo — baloane de dialog pline cu limba ta, fără să fie nevoie să dai clic pe nimic.

**Cum funcționează**

1. Extensia găsește fiecare imagine de pe pagină și le capturează.
2. Un detector AI de pe dispozitiv localizează fiecare bulă de dialog și bloc de text.
3. OCR-ul antrenat pe manga citește textul (japoneză, engleză, chineză simplificată și tradițională — cu detectare automată a limbii).
4. Textul original este eliminat curat cu inpainting AI.
5. Motorul de traducere ales de tine redă rezultatul înapoi în bule, dimensionat pentru a se potrivi.

**Confidențialitatea pe primul loc: AI-ul rulează pe calculatorul tău**

Detectarea bulelor și OCR-ul rulează local în browserul tău prin WebAssembly, iar inpainting-ul rulează pe GPU-ul tău (cu fallback WebAssembly) — paginile tale nu părăsesc niciodată dispozitivul tău. Doar textul extras este trimis serviciului de traducere pe care îl alegi.

**Funcții**

- Traducere automată când paginile se încarcă — fără apăsare de buton
- Traduce fiecare imagine de pe pagină (până la 50 pe rulare), nu doar imaginea principală
- Clic dreapta pe orice imagine → „Trimite la comic-translate-4-free” pentru a o traduce direct
- 114 limbi țintă prin Google Translate, Azure Translator sau propriul tău server local LM Studio
- Detectare automată a limbii sursă
- Suport pentru benzi lungi / webtoon
- Funcționează pe site-uri care blochează descărcările automate (prin fallback cu filă de fundal)
- Popup și setări cu temă întunecată, controale de acces per site
- Modul de depanare arată fiecare etapă a pipeline-ului pentru depanare

**Gratuit pentru uz necomercial**

Licențiat sub PolyForm Noncommercial License 1.0.0. Fără cont, fără abonament, fără urmărire.
https://github.com/jameslee0623/comic-translate-4-free
