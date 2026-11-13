# Chrome Web Store listing — Deutsch (de)

## Short description (132 chars max)

Übersetze Manga & Comics im Browser. Liest Japanisch, Englisch, Chinesisch (vereinfacht/traditionell); übersetzt in 114 Sprachen.

(Count: 129)

## Detailed description

**Lies Manga in deiner Sprache — direkt im Browser.**

comic-translate-4-free übersetzt Comic- und Mangaseiten automatisch, während du surfst. Öffne eine Seite, und die übersetzte Version ersetzt das Originalbild an Ort und Stelle — Sprechblasen gefüllt mit deiner Sprache, nichts anzuklicken.

**So funktioniert es**

1. Die Erweiterung findet jedes Bild auf der Seite und erfasst es.
2. Ein KI-Detektor auf dem Gerät findet jede Sprechblase und jeden Textblock.
3. Manga-trainiertes OCR liest den Text (Japanisch, Englisch, vereinfachtes und traditionelles Chinesisch — mit automatischer Spracherkennung).
4. Der Originaltext wird mit KI-Inpainting sauber entfernt.
5. Die Übersetzungs-Engine deiner Wahl rendert das Ergebnis passend in die Sprechblasen zurück.

**Datenschutz zuerst: Die KI läuft auf deinem Rechner**

Blasenerkennung und OCR laufen lokal in deinem Browser über WebAssembly, und Inpainting läuft auf deiner GPU (mit WebAssembly-Fallback) — deine Seiten verlassen dein Gerät nie. Nur der extrahierte Text wird an den Übersetzungsdienst deiner Wahl gesendet.

**Funktionen**

- Automatische Übersetzung beim Laden der Seiten — kein Drücken von Knöpfen
- Übersetzt jedes Bild auf der Seite (bis zu 50 pro Durchlauf), nicht nur das Hauptbild
- Rechtsklick auf ein beliebiges Bild → „An comic-translate-4-free senden", um es direkt zu übersetzen
- 114 Zielsprachen über Google Translate, Azure Translator oder deinen eigenen lokalen LM Studio-Server
- Automatische Quellspracherkennung
- Unterstützung für lange Strips / Webtoons
- Funktioniert auf Websites, die automatisierte Downloads blockieren (über Hintergrund-Tab-Fallback)
- Popup und Einstellungen im dunklen Design, Zugriffskontrollen pro Website
- Der Debug-Modus zeigt jede Pipeline-Stufe zur Fehlerbehebung

**Kostenlos für nichtkommerzielle Nutzung**

Lizenziert unter der PolyForm Noncommercial License 1.0.0. Kein Konto, kein Abo, kein Tracking.
https://github.com/jameslee0623/comic-translate-4-free
