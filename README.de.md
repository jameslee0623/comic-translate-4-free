# comic-translate-4-free

**Language:** [English](README.md) · [हिन्दी](README.hi.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [বাংলা](README.bn.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Deutsch](README.de.md)

Lies Manga in deiner Sprache — direkt im Browser.

comic-translate-4-free übersetzt Manga- und Comicseiten automatisch beim Surfen. Es liest Japanisch, Englisch sowie vereinfachtes und traditionelles Chinesisch (mit automatischer Erkennung) und übersetzt in 114 Sprachen. Öffne eine Seite, und die übersetzte Version ersetzt das Originalbild an Ort und Stelle — Sprechblasen gefüllt mit deiner Sprache.

### 📸 Vorher & Nachher

| Vorher (Japanisch) | Nachher (Deutsch) |
| --- | --- |
| ![Originale japanische Mangaseite](docs/images/wikipe-tan-original.jpg) | ![Ins Deutsche übersetzt](docs/images/wikipe-tan-de.jpg) |

<details>
<summary>Übersetzungen in 14 weiteren Sprachen ansehen</summary>

| Hindi | Koreanisch | Vereinfachtes Chinesisch |
| --- | --- | --- |
| ![Hindi](docs/images/wikipe-tan-hi.jpg) | ![Koreanisch](docs/images/wikipe-tan-ko.jpg) | ![Vereinfachtes Chinesisch](docs/images/wikipe-tan-zh-CN.jpg) |

| Traditionelles Chinesisch | Spanisch | Arabisch |
| --- | --- | --- |
| ![Traditionelles Chinesisch](docs/images/wikipe-tan-zh-TW.jpg) | ![Spanisch](docs/images/wikipe-tan-es.jpg) | ![Arabisch](docs/images/wikipe-tan-ar.jpg) |

| Französisch | Bengalisch | Portugiesisch |
| --- | --- | --- |
| ![Französisch](docs/images/wikipe-tan-fr.jpg) | ![Bengalisch](docs/images/wikipe-tan-bn.jpg) | ![Portugiesisch](docs/images/wikipe-tan-pt.jpg) |

| Russisch | Vietnamesisch | Indonesisch |
| --- | --- | --- |
| ![Russisch](docs/images/wikipe-tan-ru.jpg) | ![Vietnamesisch](docs/images/wikipe-tan-vi.jpg) | ![Indonesisch](docs/images/wikipe-tan-id.jpg) |

| Urdu | Deutsch |
| --- | --- |
| ![Urdu](docs/images/wikipe-tan-ur.jpg) | ![Deutsch](docs/images/wikipe-tan-de.jpg) |

</details>

*Originalbild: [Wikipedia](https://en.wikipedia.org/wiki/Manga) via Wikimedia Commons.*

---

## ✨ Funktionen

- **Automatische Übersetzung** — öffne eine Mangaseite auf einer zugelassenen Website, und die übersetzte Version erscheint an Ort und Stelle, ganz ohne Klick.
- **Jedes Bild per Rechtsklick** — wähle „Send to comic-translate-4-free", um ein bestimmtes Bild zu übersetzen, selbst wenn es kleiner als die Mindestgröße ist.
- **114 Zielsprachen** via Google Translate, Azure Translator oder deinem eigenen lokalen LM Studio-Server.
- **Automatische Erkennung der Ausgangssprache** — Japanisch, Englisch sowie vereinfachtes/traditionelles Chinesisch werden automatisch aus dem OCR-Text erkannt.
- **Longstrip-/Webtoon-Unterstützung** — lange Seiten werden in überlappenden Segmenten verarbeitet, damit der Text scharf bleibt.
- **16 UI-Sprachen** — die Oberfläche der Erweiterung folgt der Spracheinstellung deines Browsers.

### 🔒 Datenschutz

- **Die KI läuft auf deinem Rechner.** Sprechblasenerkennung, OCR und Inpainting laufen lokal in deinem Browser via WebAssembly. Deine Seiten verlassen dein Gerät nie.
- **Nur übersetzter Text wird versendet** — nur die extrahierten Textstrings gehen an den von dir gewählten Übersetzungsdienst (Google / Azure / dein lokales LM Studio).
- **Kein Konto, kein Tracking, keine Telemetrie.** Alle Einstellungen und zwischengespeicherten Modelle bleiben im lokalen Speicher deines Browsers.

---

## 🚀 Installation

**Chrome / Edge / Brave:**

[**Aus dem Chrome Web Store installieren**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj) — ein Klick, automatische Updates.

**Firefox:** Lade das Firefox-Zip von [Releases](https://github.com/jameslee0623/comic-translate-4-free/releases) herunter, öffne dann `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → wähle `manifest.json`. (Temporäre Add-ons werden beim Neustart entladen; ein signierter AMO-Eintrag ist in Arbeit.)

Nach der Installation die Einstellungsseite öffnen und einmal **Download all models** klicken (~350 MB: Detector, OCR, Inpainter). Sie werden im Browser zwischengespeichert und per Bytegröße verifiziert.

![Modelle über die Einstellungsseite herunterladen](docs/images/options-models.png)

---

## 💡 Anwendung

1. **Zuerst die Website zulassen** — klicke auf das Erweiterungssymbol und drücke **Allow this site** (oder aktiviere **ALLOW ALL SITES**). Die Übersetzung läuft nur dort, wo du die Berechtigung erteilt hast.

   ![Die Website über das Popup zulassen](docs/images/popup.png)

2. **Die Mangaseite neu laden** — die Übersetzung startet automatisch beim Laden der Seite. Eine Pille oben rechts zeigt den Live-Fortschritt (Capturing → Detecting → OCR → …).
3. **Fertig** — das Bild der Seite wird an Ort und Stelle durch die übersetzte Version ersetzt.

**Tipps:**
- Klicke ein beliebiges Bild mit rechts an → **Send to comic-translate-4-free**, um genau dieses Bild zu übersetzen.

  ![Bild per Rechtsklick senden](docs/images/right-click.png)

- Wenn eine Website Downloads blockiert (HTTP 403), versucht die Erweiterung es automatisch über einen Hintergrund-Tab erneut.
- Wähle deine Übersetzungs-Engine in den Einstellungen: Google (kostenlos, kein Schlüssel), Azure Translator (Schlüssel unten beantragen — 2 Mio. Zeichen/Monat kostenlos) oder LM Studio (lokaler Server).
- Aktiviere **Debug mode** in den Einstellungen, um jede Pipeline-Stufe zu inspizieren.

---

## 🔑 Microsoft-Azure-Konto beantragen

Um Azure Translator als Übersetzungs-Engine zu nutzen:

1. Microsoft-/Hotmail-/Azure-Konto erstellen bzw. anmelden
2. Azure-Abonnement erstellen
3. Azure-Translator-Ressource erstellen
4. Preisstufe F0 (kostenlos) wählen — 2 Millionen Zeichen/Monat, läuft nicht ab
5. Ressourcenverwaltung → Schlüssel und Endpunkt → **KEY 1** und **Location/Region** kopieren
6. In die Einstellungsseite der Erweiterung einfügen

---

## ❤️ Dieses Projekt unterstützen

Wenn dir diese Erweiterung nützlich ist, erwäge, ihre Entwicklung zu unterstützen:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

---

## ⚠️ Bekannte Probleme

- **Noch kein koreanisches OCR** — Ausgangssprachen sind Japanisch, Englisch sowie vereinfachtes/traditionelles Chinesisch. (Koreanisch bleibt als Übersetzungsziel verfügbar.)
- **Ein Bild pro Seite** bei der Auto-Übersetzung (das Hauptbild der Seite). Zum Übersetzen weiterer Bilder: Rechtsklick → Send.
- **Lange Sitzungen** — das Übersetzen Dutzender Bilder in einer Sitzung kann den Browser zum Absturz bringen. Leere in diesem Fall den Seitencache in den Einstellungen.
- **Firefox** — die Modelle laufen in der Hintergrundseite (keine Offscreen-Dokumente) und teilen sich den Speicher mit allem anderen. Starte den Browser neu, wenn du „no available backend found" siehst.
- Google Translate nutzt den inoffiziellen kostenlosen Endpunkt und kann ratenbegrenzt werden.

---

## 📄 Hinweise zu Drittanbietern

Dieses Projekt ist inspiriert von [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate) — der Sprechblasen-/Texterkenner und der manga-feinjustierte LaMa-Inpainter sind dessen ONNX-Exporte, und die Inferenzlogik ist davon portiert. (OCR nutzt [Baberu](https://huggingface.co/genshiai-daichi/baberu-ocr) von genshiai-daichi.)

Gebündelte Bibliotheken, portierter Code und zur Laufzeit heruntergeladene Modelle sind mit ihren Lizenzen in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) aufgeführt.

MIT-Lizenz — siehe [LICENSE](LICENSE).
