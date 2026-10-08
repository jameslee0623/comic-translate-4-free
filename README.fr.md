# comic-translate-4-free

**Language:** [English](README.md) · [हिन्दी](README.hi.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [বাংলা](README.bn.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Deutsch](README.de.md)

Lisez des mangas dans votre langue — directement dans le navigateur.

comic-translate-4-free traduit automatiquement les pages de mangas et de BD pendant que vous naviguez. Il lit le japonais, l'anglais, le chinois simplifié et traditionnel (avec détection automatique), et traduit vers 114 langues. Ouvrez une page, et la version traduite remplace l'image d'origine sur place — les bulles remplies dans votre langue.

### 📸 Avant / Après

| Avant (japonais) | Après (français) |
| --- | --- |
| ![Page de manga japonaise d'origine](docs/images/wikipe-tan-original.jpg) | ![Traduit en français](docs/images/wikipe-tan-fr.jpg) |

<details>
<summary>Voir les traductions dans 14 autres langues</summary>

| hindi | coréen | chinois simplifié |
| --- | --- | --- |
| ![hindi](docs/images/wikipe-tan-hi.jpg) | ![coréen](docs/images/wikipe-tan-ko.jpg) | ![chinois simplifié](docs/images/wikipe-tan-zh-CN.jpg) |

| chinois traditionnel | espagnol | arabe |
| --- | --- | --- |
| ![chinois traditionnel](docs/images/wikipe-tan-zh-TW.jpg) | ![espagnol](docs/images/wikipe-tan-es.jpg) | ![arabe](docs/images/wikipe-tan-ar.jpg) |

| français | bengali | portugais |
| --- | --- | --- |
| ![français](docs/images/wikipe-tan-fr.jpg) | ![bengali](docs/images/wikipe-tan-bn.jpg) | ![portugais](docs/images/wikipe-tan-pt.jpg) |

| russe | vietnamien | indonésien |
| --- | --- | --- |
| ![russe](docs/images/wikipe-tan-ru.jpg) | ![vietnamien](docs/images/wikipe-tan-vi.jpg) | ![indonésien](docs/images/wikipe-tan-id.jpg) |

| ourdou | allemand |
| --- | --- |
| ![ourdou](docs/images/wikipe-tan-ur.jpg) | ![allemand](docs/images/wikipe-tan-de.jpg) |

</details>

*Image d'origine : [Wikipedia](https://en.wikipedia.org/wiki/Manga) via Wikimedia Commons.*

---

## ✨ Fonctionnalités

- **Traduction automatique** — ouvrez une page de manga sur un site autorisé et la version traduite apparaît sur place, sans aucun clic.
- **Clic droit sur n'importe quelle image** — choisissez « Send to comic-translate-4-free » pour traduire une image précise, même plus petite que la taille minimale.
- **114 langues cibles** via Google Translate, Azure Translator ou votre propre serveur LM Studio local.
- **Détection automatique de la langue source** — le japonais, l'anglais et le chinois simplifié/traditionnel sont identifiés automatiquement à partir du texte reconnu par l'OCR.
- **Prise en charge des longues bandes / webtoons** — les pages très hautes sont traitées en segments qui se chevauchent pour que le texte reste net.
- **16 langues d'interface** — l'interface de l'extension suit la langue de votre navigateur.

### 🔒 Confidentialité

- **L'IA tourne sur votre machine.** La détection des bulles, l'OCR et l'inpainting s'exécutent tous localement dans votre navigateur via WebAssembly. Vos pages ne quittent jamais votre appareil.
- **Seul le texte traduit est envoyé** — seules les chaînes extraites sont transmises au service de traduction que vous choisissez (Google / Azure / votre LM Studio local).
- **Aucun compte, aucun suivi, aucune télémétrie.** Tous les réglages et les modèles mis en cache restent dans le stockage local de votre navigateur.

---

## 🚀 Installation

**Chrome / Edge / Brave :**

[**Installer depuis le Chrome Web Store**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj) — en un clic, mises à jour automatiques.

**Firefox :** téléchargez le zip Firefox depuis [Releases](https://github.com/jameslee0623/comic-translate-4-free/releases), puis allez sur `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → choisissez `manifest.json`. (Les modules temporaires sont déchargés au redémarrage ; une version signée sur AMO est en cours de préparation.)

Après l'installation, ouvrez la page des réglages et cliquez une fois sur **Download all models** (~350 Mo : détecteur, OCR, inpainting). Ils sont mis en cache dans le navigateur et vérifiés par leur taille en octets.

![Téléchargement des modèles depuis la page des réglages](docs/images/options-models.png)

---

## 💡 Utilisation

1. **Autorisez d'abord le site** — cliquez sur l'icône de l'extension et appuyez sur **Allow this site** (ou activez **ALLOW ALL SITES**). La traduction ne s'exécute que là où vous avez accordé l'autorisation.

   ![Autoriser le site depuis la fenêtre contextuelle](docs/images/popup.png)

2. **Rechargez la page du manga** — la traduction démarre automatiquement au chargement de la page. Une pastille en haut à droite affiche la progression en direct (Capturing → Detecting → OCR → …).
3. **Terminé** — l'image de la page est remplacée sur place par la version traduite.

**Astuces :**
- Faites un clic droit sur n'importe quelle image → **Send to comic-translate-4-free** pour traduire uniquement cette image.

  ![Clic droit pour envoyer une image](docs/images/right-click.png)

- Si un site bloque les téléchargements (HTTP 403), l'extension réessaie automatiquement via un onglet en arrière-plan.
- Choisissez votre moteur de traduction dans les réglages : Google (gratuit, sans clé), Azure Translator (demandez vos clés ci-dessous — 2 millions de caractères/mois gratuits) ou LM Studio (serveur local).
- Activez le **Debug mode** dans les réglages pour inspecter chaque étape du pipeline.

---

## 🔑 Demander un compte Microsoft Azure

Pour utiliser Azure Translator comme moteur de traduction :

1. Créez un compte Microsoft/hotmail/Azure ou connectez-vous
2. Créez un abonnement Azure
3. Créez une ressource Azure Translator
4. Sélectionnez le niveau tarifaire F0 (gratuit) — 2 millions de caractères/mois, sans expiration
5. Resource Management → Keys and Endpoint → copiez **KEY 1** et **Location/Region**
6. Collez-les dans la page des réglages de l'extension

---

## ❤️ Soutenez ce projet

Si cette extension vous est utile, pensez à soutenir son développement :

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

---

## ⚠️ Problèmes connus

- **Pas encore d'OCR coréen** — les langues sources sont le japonais, l'anglais et le chinois simplifié/traditionnel. (Le coréen reste disponible comme langue cible de traduction.)
- **Une seule image par page** pour la traduction automatique (l'image principale de la page). Utilisez le clic droit → Send pour traduire les autres.
- **Sessions volumineuses** — traduire des dizaines d'images en une seule session peut faire planter le navigateur. Videz le cache des pages dans les réglages si cela arrive.
- **Firefox** — les modèles tournent dans la page d'arrière-plan (pas de documents offscreen) et partagent la mémoire avec tout le reste. Redémarrez le navigateur si vous voyez « no available backend found ».
- Google Translate utilise le point d'accès gratuit non officiel et peut être limité en débit.

---

## 📄 Mentions de tiers

Ce projet s'inspire de [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate) — le détecteur de bulles/texte et le modèle LaMa d'inpainting affiné pour les mangas sont ses exports ONNX, et la logique d'inférence en est portée. (L'OCR utilise [Baberu](https://huggingface.co/genshiai-daichi/baberu-ocr) de genshiai-daichi.)

Les bibliothèques incluses, le code porté et les modèles téléchargés à l'exécution sont listés avec leurs licences dans [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Licence MIT — voir [LICENSE](LICENSE).
