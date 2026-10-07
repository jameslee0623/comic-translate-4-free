# comic-translate-4-free

**Language:** [English](README.md) · [हिन्दी](README.hi.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

Übersetzen Sie Manga-/Comic-Seiten direkt im Browser. Die komplette Pipeline läuft lokal:
Sprechblasen-/Texterkennung (RT-DETR-v2), OCR (Baberu für Japanisch/Englisch/Chinesisch),
Textentfernung
per LaMa-Inpainting, Übersetzung (Google / Azure / lokales LLM) und umbrochenes
Neu-Rendering in die originalen Sprechblasen.

Die Erweiterungs-UI folgt der Spracheinstellung Ihres Browsers (Englisch, Japanisch,
Koreanisch, Chinesisch vereinfacht/traditionell, Hindi, Spanisch, Arabisch, Französisch, Deutsch).

Dieses Projekt ist inspiriert von [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate).

## Download (kein Build nötig)

**Chrome / Edge / Brave — aus dem Chrome Web Store installieren:**

[**comic-translate-4-free aus dem Chrome Web Store installieren**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj)

Oder holen Sie sich das neueste Release von der
[**Releases**](https://github.com/jameslee0623/comic-translate-4-free/releases)-Seite
— jedes Release wird automatisch per CI gebaut. Laden Sie das Zip für Ihren
Browser herunter:

- `comic-translate-4-free-v<version>-<build>-chrome.zip` → Chrome / Edge / Brave
- `comic-translate-4-free-v<version>-<build>-firefox.zip` → Firefox

(Es gibt auch ein kombiniertes `comic-translate-4-free-v<version>-<build>.zip`
mit `chrome/` und `firefox/` nebeneinander, falls Sie beide auf einmal möchten.)
Sie müssen das Repo weder klonen noch `build.sh` selbst ausführen.

## Installation

**Chrome (empfohlen):** Aus dem
[**Chrome Web Store**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj)
installieren — ein Klick, automatische Updates.

**Manuelle Installation (Chrome):** Laden Sie das Zip aus den Releases oben herunter und entpacken Sie es,
dann `chrome://extensions` → **Entwicklermodus** aktivieren →
**Entpackte Erweiterung laden** → den entpackten Ordner auswählen.

**Firefox:** `about:debugging#/runtime/this-firefox` → **Temporäres
Add-on laden** → den entpackten Ordner öffnen und `manifest.json` auswählen. (Temporäre
Add-ons bleiben bis zum Firefox-Neustart erhalten. Für eine dauerhafte Installation muss
der Build auf addons.mozilla.org signiert sein. An einer signierten Version für die Firefox-Standardausgabe wird gearbeitet.)

Laden Sie anschließend einmalig die Modelle über die Einstellungsseite herunter — ein
**Alle Modelle herunterladen**-Button holt alles (Detector, OCR-Modelle,
Inpainter, insgesamt ~350 MB). Sie werden im Browser zwischengespeichert (IndexedDB) und nie
erneut heruntergeladen. Die Byte-Größe jeder Datei wird nach dem Download verifiziert; eine
abgeschnittene oder falsche Datei wird mit einem ⚠ markiert und kann erneut heruntergeladen werden.

![Modelle über die Einstellungsseite herunterladen](docs/images/options-models.png)

## Verwendung

1. **Lassen Sie zuerst die Website zu** — die Übersetzung läuft nur auf Websites, die Sie ausdrücklich
   zulassen. Klicken Sie auf das Erweiterungssymbol und drücken Sie **Diese Website zulassen**
   (oder fügen Sie Hostnamen in den Einstellungen hinzu, oder aktivieren Sie **ALLE WEBSITES ZULASSEN**, um diesen
   Schritt überall zu überspringen). Das ist eine harte Sperre: Die Pipeline verweigert
   die Ausführung überall sonst.

   ![Das Erweiterungs-Popup](docs/images/popup.png)

2. Öffnen Sie eine Manga-Seite auf einer zugelassenen Website — die Übersetzung startet
   automatisch, sobald die Seite fertig geladen ist, ganz ohne Klick
   (abschaltbar in den Einstellungen unter „Beim Seitenladen automatisch übersetzen").
   Bei der ersten Verwendung pro Website fragt Chrome einmalig um Erlaubnis, damit die
   Erweiterung das Seitenbild in voller Auflösung herunterladen kann.
3. Eine Status-Pille oben rechts auf der Seite zeigt den Live-Fortschritt
   (Erfassen → Erkennen → OCR → …). Wenn fertig, wird das eigene Bild der Seite
   an Ort und Stelle durch die übersetzte Version ersetzt — der Originaltext wird heraus-inpainted,
   die Übersetzung zurück in die Sprechblasen gerendert.

Um ein bestimmtes Bild statt des Hauptbildes der Seite zu übersetzen,
klicken Sie es mit rechts an und wählen Sie **An comic-translate-4-free senden**. Dadurch wird
genau dieses Bild durch die Pipeline geschickt — selbst wenn es kleiner als die
Mindestbildgröße ist — und trotzdem an Ort und Stelle ersetzt. Der Menüeintrag erscheint nur
auf Websites, die Sie zugelassen haben.

Wenn der Bildserver den Download verweigert (HTTP 403, z. B. Cloudflare-Bot-Schutz),
öffnet die Erweiterung das Bild automatisch in einem Hintergrund-Tab — dort ist es same-origin, sodass das Bild direkt ohne
Download gelesen wird — übersetzt es, schließt den Tab und ersetzt das Bild auf Ihrer
Seite an Ort und Stelle.

   ![Das Rechtsklick-Menü](docs/images/right-click.png)

Der Pipeline-Input ist das größte Bild der Seite, begrenzt durch die Mindestbildgröße
(Standard 500px): Kleinere Bilder werden mit einem klaren
Fehler übersprungen. Die Erweiterung liest das eigene Bild der Seite direkt — sie erstellt niemals
Screenshots der Webseite.

**Seiten-Cache:** Seiten, die Sie in derselben Browser-Sitzung erneut besuchen, werden sofort
aus einem temporären On-Disk-Cache geladen (die Übersetzung von 10–40 Bildern in einer Sitzung kann
den Browser zum Absturz bringen, wodurch alle Bilder im Cache verloren gehen. Bitte denken Sie daran, den
Cache manuell zu leeren). Der Cache wird automatisch geleert, wenn der Browser geschlossen wird,
und wird in Inkognito-Fenstern nie verwendet.

**Einstellungen** (auf das Symbol klicken → Einstellungen): Website-Zugriff, automatisches Übersetzen beim
Seitenladen, Ausgangssprache (inkl. **Automatisch erkennen**, das Japanisch / Englisch / Chinesisch vereinfacht / traditionell anhand des OCR-Textes erkennt)
und Zielsprache, Übersetzungs-Engine (Google kostenlos / Azure
Translator / LM Studio), Verbindungstest-Buttons für Azure und LM Studio,
Erkennungsschwelle, Mindestbildgröße (Standard 500px — kleinere Erfassungen werden
übersprungen), Schriftgrößen, Debug-Modus und die Cache-Steuerung für übersetzte Seiten.

![Einstellungsseite](docs/images/options.png)

## Dieses Projekt unterstützen

Wenn Ihnen diese Erweiterung nützlich ist, erwägen Sie, ihre Entwicklung zu unterstützen:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

### Ein Microsoft-Azure-Konto beantragen

1. Ein Microsoft-/Hotmail-/Azure-Konto erstellen bzw. sich anmelden
2. Ein Azure-Abonnement erstellen
3. Eine Azure-Translator-Ressource erstellen
4. Preisstufe F0 (kostenlos) wählen
5. Ressourcenverwaltung → Schlüssel und Endpunkt → **KEY 1** und **Standort/Region** kopieren

Microsoft gibt aktuell an, dass die kostenlose Translator-Stufe F0 2 Millionen Zeichen/Monat umfasst und nicht abläuft.

### LM Studio

Starten Sie LM Studio mit aktiviertem lokalem Server (Standard
`http://127.0.0.1:1234`). Wählen Sie **LM Studio (lokaler Server)** als Übersetzungs-Engine
in den Einstellungen, legen Sie die Server-URL und die API-Variante fest — **LM Studio REST API v1**
(postet an `/api/v1/chat`) oder **OpenAI-kompatibel** (postet an
`/v1/chat/completions`) — und drücken Sie dann **LM-Studio-Verbindung prüfen** zur
Verifizierung. Das geladene Modell wird automatisch erkannt und gemerkt, daher gibt es
kein Modellnamen-Feld zum Ausfüllen.

## Aus dem Quellcode bauen

Kein Bundler, kein npm install — der Quellcode *ist* die Erweiterung. Voraussetzungen:
`bash`, `python3`, `rsync`, `zip` und `node` (nur für einen Syntax-Check verwendet).

```bash
git clone https://github.com/jameslee0623/comic-translate-4-free.git
cd comic-translate-4-free
./build.sh
```

Das schreibt drei Zips nach `dist/` (plus eine Kopie des kombinierten Zips der
Einfachheit halber):

- `comic-translate-4-free-v<version>-<build>.zip` — kombiniert, `chrome/` und
  `firefox/` nebeneinander, bereit zum entpackten Laden (Chrome) bzw. als temporäres
  Add-on (Firefox) gemäß „Installation" oben
- `comic-translate-4-free-v<version>-<build>-chrome.zip` — nur Chrome-Build,
  im Store-Submission-Layout
- `comic-translate-4-free-v<version>-<build>-firefox.zip` — nur Firefox-Build,
  im Store-Submission-Layout

Der `<build>`-Stempel stammt aus der `BUILD`-Konstante in `src/shared/version.js`
(wird in den Fußzeilen von Popup und Einstellungsseite angezeigt, in den Seiten-Cache-Schlüssel eingebacken).
Erhöhen Sie ihn vor dem Bauen, wenn Sie einen eindeutigen Stempel im Dateinamen und in der UI-
Fußzeile möchten — sonst ist Ihr Build nicht von dem veröffentlichten mit
demselben Stempel zu unterscheiden.

Pro Seite sendet die Erweiterung eine einzige gebündelte Anfrage:

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

Vom Modell wird erwartet, dass es mit einem JSON-Array übersetzter Strings antwortet —
einer pro Eingabetext, in derselben Reihenfolge. Ein nacktes `[...]` innerhalb einer längeren Antwort
wird akzeptiert; eine Übersetzung pro Zeile ist der Fallback letzter Instanz.

## Debug-Modus

Aktivieren Sie den **Debug-Modus** in den Einstellungen, und die Ausgabe jeder Pipeline-Stufe erscheint in
einem Seitenleisten-Inspektor: erfasstes Bild, Erkennungsboxen, Textblöcke, OCR-
Crops + Lesungen, die Inpaint-Maske, die inpaintete Seite und Übersetzungen.

## Architektur

```
Popup / Einstellungen (src/ui)
      │ chrome.runtime-Nachrichten
      ▼
Background — Orchestrierung, Erfassung, Blöcke, Maske, Übersetzungs-APIs,
             Debug-Ausgabe
  ├─ Chrome: Service Worker + Offscreen-Dokument (src/offscreen) hostet
  │  ALLE onnxruntime-web-Sitzungen (Downloads laufen dort, damit ein 197-MB-Fetch
  │  das SW-Herunterfahren überlebt)
  └─ Firefox: Hintergrundseite (src/background/background.html) hostet dieselben
     Sitzungen im Prozess (Firefox hat keine Offscreen-Dokumente)
└── Content-Script (src/content) — Overlay-Canvas + Text-Renderer + Debug-Panel
```

Modelle (Hugging Face, werden bei Bedarf heruntergeladen):
- `ogkalu/comic-text-and-bubble-detector` → `detector-v4-s_int8.onnx`
- `genshiai-daichi/baberu-ocr` → `vision_int4.onnx`, `decoder_prefill_int8.onnx`,
  `decoder_step_int8.onnx` (Japanisch, Englisch, Chinesisch vereinfacht/traditionell)
- `ogkalu/lama-manga-onnx-dynamic` → `lama-manga-dynamic.onnx`

Pipeline-Stufen: Erfassen → Erkennen → Blöcke → OCR → Maske → Inpainting →
Übersetzen → Rendern. Die Erkennung läuft bei 640×640; die Erfassung wird flächenbasiert skaliert
(6,5-MP-Budget), sodass lange Strips volle Auflösung behalten, und Seiten mit extremerem
Verhältnis als 4:1 werden in überlappenden 2:1-Segmenten verarbeitet.

**Chrome- vs. Firefox-Pipeline:** Beide Builds lassen die Übersetzung nach der OCR parallel zu
Maske/Inpainting laufen. Chrome macht das per Promise.all — die ML-Sitzungen
leben im Offscreen-Dokument auf eigenem Thread, sodass sich die Stufen wirklich
überlappen. Firefox lässt die Übersetzung auf einem Web Worker (eigener Thread) laufen, während
Maske → Inpainting auf dem Hauptthread läuft — die Netzwerk-I/O des Workers wird nicht
blockiert, wenn das WASM-Inpainting den Hauptthread auslastet.

## Bekannte Einschränkungen

- Noch kein gutes OCR für Koreanisch gefunden — die Ausgangssprachen sind auf Japanisch,
  Englisch und Chinesisch vereinfacht/traditionell beschränkt.
- Die Auto-Übersetzung verarbeitet ein einzelnes Bild pro Seite (das Hauptbild der Seite).
  Um ein anderes Bild auf der Seite zu übersetzen, klicken Sie es mit rechts an und wählen Sie
  **An comic-translate-4-free senden**.
- Manche Bildhoster blockieren automatisierte Downloads (HTTP 403, z. B. Cloudflare-Bot-
  Schutz), obwohl die Seite selbst das Bild problemlos lädt. Das
  Rechtsklick-**An-comic-translate-4-free-senden** umgeht dies über einen
  Hintergrund-Tab; die Auto-Übersetzung kann auf solchen Websites mit einem 403-Fehler scheitern.
  Diese Blockierung kann intermittierend auftreten.
- Firefox: Die KI-Modelle laufen innerhalb der Hintergrundseite des Browsers (Firefox hat
  keine Offscreen-Dokumente) und teilen sich den Speicher mit allem anderen. Auf sehr großen
  Seiten oder bei langen Sitzungen kann der Engine der Speicher ausgehen und „no available backend found"
  melden. Ein Browser-Neustart gibt Speicher frei; Chrome ist nicht betroffen,
  da es die Modelle in einem separaten Prozess ausführt.
- Chrome: Die Übersetzung Dutzender Bilder in einer Sitzung kann den Browser zum Absturz bringen
  (beobachtet bei ca. 35 zwischengespeicherten Bildern).
- Der Seiten-Cache ist sitzungsbezogen: Er wird beim Browserstart gelöscht, sodass
  nach einem Neustart (auch nach einem Absturz) erneut gesendete Bilder die volle
  Pipeline durchlaufen, statt den Cache zu treffen.
- Die Google-Übersetzungs-Engine nutzt den inoffiziellen `translate.googleapis.com`-
  Endpunkt und kann ratenbegrenzt werden.
- Vertikaler Text wird für hohe CJK-Blöcke gerendert; SFX / Text außerhalb von Sprechblasen
  nutzt eine eigene Textbox.

## Hinweise zu Drittanbietern

Gebündelte Bibliotheken, portierter Code und zur Laufzeit heruntergeladene Modelle sind mit
ihren Lizenzen in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) aufgeführt.
