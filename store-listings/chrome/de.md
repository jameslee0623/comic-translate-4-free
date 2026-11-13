# Chrome Web Store listing — Deutsch (de)

## Short description (132 chars max)

Übersetze Manga & Comics im Browser. Liest Japanisch, Englisch, Chinesisch (vereinfacht/traditionell); übersetzt in 114 Sprachen.

(Count: 129)

## Detailed description

📖 Lies Manga in deiner Sprache!

comic-translate-4-free übersetzt Manga und Comics automatisch. Es liest Japanisch, Englisch, Vereinfachtes/Traditionelles Chinesisch (Auto-Erkennung) und übersetzt in 114 Sprachen, ersetzt das Bild an Ort und Stelle.

✨ Funktionen
- Automatische Übersetzung — öffne eine Mangaseite auf einer erlaubten Website, und die übersetzte Version erscheint an Ort und Stelle, ganz ohne Klick.
- Jedes Bild auf der Seite — die automatische Übersetzung verarbeitet alle Bilder einer Seite (bis zu 50 pro Durchlauf), nicht nur das Hauptbild.
- Rechtsklick auf ein beliebiges Bild — wähle „An comic-translate-4-free senden“, um ein bestimmtes Bild zu übersetzen, auch wenn es kleiner als die Mindestgröße ist.
- 114 Zielsprachen über Google Translate, Azure Translator oder deinen eigenen lokalen LM-Studio-Server.
- Automatische Quellspracherkennung — Japanisch, Englisch, Vereinfachtes/Traditionelles Chinesisch werden automatisch aus dem per OCR gelesenen Text erkannt.
- Unterstützung für lange Strips / Webtoons — hohe Seiten werden in überlappenden Abschnitten verarbeitet, damit der Text scharf bleibt.
- 17 UI-Sprachen — die Oberfläche der Erweiterung folgt der Spracheinstellung deines Browsers.

🔒 Datenschutz
- Die KI läuft auf deinem Rechner. Blasenerkennung, OCR und Inpainting laufen alle lokal in deinem Browser. Erkennung und OCR laufen über WebAssembly. Inpainting läuft in Chrome auf der GPU (mit WebAssembly-Fallback) und in Firefox über WebAssembly. Deine Seiten verlassen dein Gerät nie.
- Nur übersetzter Text wird nach außen gesendet — nur die extrahierten Zeichenketten gehen an den Übersetzungsdienst deiner Wahl (Google / Azure / dein lokales LM Studio).
- Kein Konto, kein Tracking, keine Telemetrie. Alle Einstellungen und zwischengespeicherten Modelle bleiben im lokalen Speicher deines Browsers.

💡 So benutzt du es
- Erlaube zuerst die Website — klicke auf das Erweiterungssymbol und drücke Diese Website zulassen (oder aktiviere Alle Websites zulassen). Die Übersetzung läuft nur dort, wo du die Erlaubnis erteilt hast.

- Lade die Mangaseite neu — sie beginnt automatisch zu übersetzen, sobald die Seite lädt. Eine Pille oben rechts zeigt den Live-Fortschritt (Capturing → Detecting → OCR → …).
- Fertig — die Bilder der Seite werden an Ort und Stelle durch die übersetzten Versionen ersetzt.

Tipps:
- Rechtsklick auf ein beliebiges Bild → An comic-translate-4-free senden, um nur dieses Bild zu übersetzen.

- Wenn eine Website Downloads blockiert (HTTP 403), versucht es die Erweiterung automatisch über einen Hintergrund-Tab erneut.
- Wähle deine Übersetzungs-Engine in den Einstellungen: Google (kostenlos, kein Schlüssel), Azure Translator (Schlüssel unten beantragen — 2 Mio. Zeichen/Monat kostenlos) oder LM Studio (lokaler Server).
- Aktiviere den Debug-Modus (Stufen-Inspektor) in den Einstellungen, um jede Pipeline-Stufe zu prüfen.

⚠️ Bekannte Probleme
- Noch kein koreanisches OCR — Quellsprachen sind Japanisch, Englisch und Vereinfachtes/Traditionelles Chinesisch. (Koreanisch bleibt als Übersetzungssprache verfügbar.)
- Große Sitzungen — das Übersetzen von Dutzenden Bildern in einer Sitzung kann die Erweiterung im Hintergrund neu starten. Wenn das passiert, wird der Lauf automatisch von dort fortgesetzt, wo er aufgehört hat.
- Firefox — die Modelle laufen auf der Hintergrundseite (ohne Offscreen-Dokumente) und teilen sich den Speicher mit allem anderen. Starte den Browser neu, wenn du „no available backend found“ siehst.
- Firefox ist langsamer als Chrome — Firefox-Erweiterungen können keinen gemeinsamen Speicher für Multithreading (SharedArrayBuffer) verwenden, daher läuft das Modell auf einem einzigen CPU-Thread. Das ist eine Grenze der Firefox-Plattform, kein Fehler der Erweiterung. (Mozilla-Bug 1673477).
- Google Translate nutzt den inoffiziellen kostenlosen Endpunkt und kann ratenbegrenzt sein.

📄 Hinweise zu Drittanbietern
Dieses Projekt ist inspiriert von ogkalu2/comic-translate — der Blasen-/Textdetektor und der manga-trainierte LaMa-Inpainter sind dessen ONNX-Exporte, und die Inferenzlogik ist daraus portiert. (OCR verwendet Baberu von genshiai-daichi.)

Gebündelte Bibliotheken, portierter Code und zur Laufzeit heruntergeladene Modelle sind mit ihren Lizenzen in THIRD-PARTY-NOTICES.md aufgeführt.

PolyForm Noncommercial License 1.0.0 — siehe LICENSE.
https://github.com/jameslee0623/comic-translate-4-free
