# Chrome Web Store listing — Română (ro)

## Short description (132 chars max)

Tradu manga și benzi desenate în browser. Citește japoneză, engleză, chineză simplificată și tradițională; traduce în 114 limbi.

(Count: 128)

## Detailed description

📖 Citește manga în limba ta!

comic-translate-4-free traduce automat manga și benzi desenate în timp ce navighezi. Citește japoneză, engleză, chineză simplificată/tradițională (detectare automată) și traduce în 114 limbi, înlocuind imaginea chiar acolo.

✨ Funcții
- Traducere automată — deschide o pagină de manga pe un site permis, iar versiunea tradusă apare chiar acolo, fără să fie nevoie să apeși vreun buton.
- Fiecare imagine de pe pagină — traducerea automată gestionează toate imaginile de pe o pagină (până la 50 pe rulare), nu doar imaginea principală.
- Clic dreapta pe orice imagine — alege „Trimite la comic-translate-4-free” pentru a traduce o anumită imagine, chiar și una mai mică decât dimensiunea minimă.
- 114 limbi țintă prin Google Translate, Azure Translator sau propriul tău server local LM Studio.
- Detectare automată a limbii sursă — japoneza, engleza, chineza simplificată/tradițională sunt identificate automat din textul recunoscut prin OCR.
- Suport pentru benzi lungi / webtoon — paginile înalte sunt procesate în segmente care se suprapun, astfel încât textul rămâne clar.
- 17 limbi pentru interfață — interfața extensiei urmează setarea de limbă a browserului tău.

🔒 Confidențialitate
- AI-ul rulează pe calculatorul tău. Detectarea bulelor, OCR-ul și inpainting-ul rulează toate local, în browserul tău. Detectarea și OCR-ul rulează prin WebAssembly. Inpainting-ul rulează pe GPU în Chrome (cu revenire la WebAssembly), iar în Firefox prin WebAssembly. Paginile tale nu părăsesc niciodată dispozitivul tău.
- Doar textul tradus este trimis mai departe — doar șirurile de text extrase ajung la serviciul de traducere pe care îl alegi (Google / Azure / LM Studio local).
- Fără cont, fără urmărire, fără telemetrie. Toate setările și modelele stocate în cache rămân în stocarea locală a browserului tău.

💡 Cum se folosește
- Permite mai întâi site-ul — apasă pe pictograma extensiei și apasă Permite acest site (sau activează Permite toate site-urile). Traducerea rulează doar unde ai acordat permisiunea.

- Reîncarcă pagina de manga — începe să traducă automat când se încarcă pagina. O bulină în colțul din dreapta sus arată progresul live (Capturing → Detecting → OCR → …).
- Gata — imaginile paginii sunt înlocuite chiar acolo cu versiunile traduse.

Sfaturi:
- Clic dreapta pe orice imagine → Trimite la comic-translate-4-free pentru a traduce doar acea imagine.

- Dacă un site blochează descărcările (HTTP 403), extensia încearcă din nou automat printr-o filă de fundal.
- Alege motorul de traducere în Setări: Google (gratuit, fără cheie), Azure Translator (cere chei mai jos — 2 milioane de caractere/lună gratuit), sau LM Studio (server local).
- Activează Mod depanare (inspector de etape) în Setări pentru a inspecta fiecare etapă a procesului.

⚠️ Probleme cunoscute
- Încă nu există OCR pentru coreeană — limbile sursă sunt japoneza, engleza și chineza simplificată/tradițională. (Coreeana rămâne disponibilă ca limbă de traducere.)
- Sesiuni mari — traducerea a zeci de imagini într-o singură sesiune poate reporni extensia în fundal. Dacă se întâmplă asta, rularea reia automat de unde a rămas.
- Firefox — modelele rulează în pagina de fundal (fără documente offscreen), împărțind memoria cu toate celelalte. Repornește browserul dacă vezi mesajul „no available backend found”.
- Firefox este mai lent decât Chrome — extensiile Firefox nu pot folosi memoria partajată pentru multi-threading (SharedArrayBuffer), așa că modelul rulează pe un singur fir CPU. Aceasta este o limită a platformei Firefox, nu o eroare a extensiei. (Bug Mozilla 1673477).
- Google Translate folosește endpointul gratuit neoficial și poate fi limitat ca rată.

📄 Note privind terții
Acest proiect este inspirat de ogkalu2/comic-translate — detectorul de bule/text și inpainterul LaMa antrenat pe manga sunt exporturile sale ONNX, iar logica de inferență este portată de acolo. (OCR-ul folosește Baberu de genshiai-daichi.)

Bibliotecile incluse, codul portat și modelele descărcate la rulare sunt listate cu licențele lor în THIRD-PARTY-NOTICES.md.

PolyForm Noncommercial License 1.0.0 — vezi LICENSE.
https://github.com/jameslee0623/comic-translate-4-free
