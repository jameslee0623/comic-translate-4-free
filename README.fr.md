# comic-translate-4-free

**Langue :** [English](README.md) · [हिन्दी](README.hi.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md)

Traduisez des pages de manga/BD dans votre navigateur. Tout le pipeline s'exécute localement :
détection des bulles/texte (RT-DETR-v2), OCR (Baberu pour le japonais/l'anglais/le chinois),
suppression du texte
via inpainting LaMa, traduction (Google / Azure / LLM local), et re-rendu
avec retour à la ligne dans les bulles d'origine.

L'interface de l'extension suit le paramètre de langue de votre navigateur (anglais, japonais,
coréen, chinois simplifié/traditionnel, hindi, espagnol, arabe, français).

Ce projet s'inspire de [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate).

## Téléchargement (aucune compilation requise)

**Chrome / Edge / Brave — installation depuis le Chrome Web Store :**

[**Installer comic-translate-4-free depuis le Chrome Web Store**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj)

Ou récupérez la dernière version sur la page
[**Releases**](https://github.com/jameslee0623/comic-translate-4-free/releases)
— chaque version est compilée automatiquement par CI. Téléchargez le zip pour votre
navigateur :

- `comic-translate-4-free-v<version>-<build>-chrome.zip` → Chrome / Edge / Brave
- `comic-translate-4-free-v<version>-<build>-firefox.zip` → Firefox

(Il existe aussi un zip combiné `comic-translate-4-free-v<version>-<build>.zip`
contenant `chrome/` et `firefox/` côte à côte, si vous voulez les deux à la fois.)
Vous n'avez jamais besoin de cloner le dépôt ni d'exécuter `build.sh` vous-même.

## Installation

**Chrome (recommandé) :** installez depuis le
[**Chrome Web Store**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj)
— en un clic, mises à jour automatiques.

**Installation manuelle (Chrome) :** téléchargez le zip depuis les Releases ci-dessus et décompressez-le,
puis `chrome://extensions` → activez le **mode développeur** →
**Charger l'extension non empaquetée** → sélectionnez le dossier décompressé.

**Firefox :** `about:debugging#/runtime/this-firefox` → **Charger un module temporaire** → ouvrez le dossier décompressé et choisissez `manifest.json`. (Les modules temporaires restent jusqu'au redémarrage de Firefox. Pour une installation permanente, la version doit être signée sur addons.mozilla.org. Nous travaillons sur une extension signée pour l'édition standard de Firefox.)

Ensuite, téléchargez les modèles une fois depuis la page Paramètres — un seul bouton
**Télécharger tous les modèles** récupère tout (détecteur, modèles OCR,
inpainter, ~350 Mo au total). Ils sont mis en cache dans le navigateur (IndexedDB) et ne sont jamais
re-téléchargés. La taille en octets de chaque fichier est vérifiée après le téléchargement ; un fichier
tronqué ou incorrect est signalé par un ⚠ et peut être re-téléchargé.

![Téléchargement des modèles depuis la page Paramètres](docs/images/options-models.png)

## Utilisation

1. **Autorisez d'abord le site** — la traduction ne s'exécute que sur les sites que vous
   autorisez explicitement. Cliquez sur l'icône de l'extension et appuyez sur **Autoriser ce site**
   (ou ajoutez des noms d'hôte dans les Paramètres, ou activez **AUTORISER TOUS LES SITES** pour ignorer cette
   étape partout). C'est une barrière stricte : le pipeline refuse
   de s'exécuter ailleurs.

   ![La fenêtre contextuelle de l'extension](docs/images/popup.png)

2. Ouvrez une page de manga sur un site autorisé — la traduction démarre
   automatiquement dès la fin du chargement de la page, sans clic
   nécessaire (désactivable dans les Paramètres sous « Traduction automatique au chargement de la page »).
   Lors de la première utilisation sur un site, Chrome demande une autorisation ponctuelle pour que
   l'extension puisse télécharger l'image de la page en pleine résolution.
3. Une pastille de statut dans le coin supérieur droit de la page affiche la progression en direct
   (Capture → Détection → OCR → …). Une fois terminé, l'image de la page est
   remplacée sur place par la version traduite — texte original effacé par inpainting,
   traduction re-rendue dans les bulles.

Pour traduire une image spécifique plutôt que l'image principale de la page,
faites un clic droit dessus et choisissez **Send to comic-translate-4-free**. Cela envoie
cette image exacte dans le pipeline — même si elle est plus petite que la
taille d'image minimale — et la remplace quand même sur place. L'élément de menu n'apparaît
que sur les sites que vous avez autorisés.

Si le serveur d'images refuse le téléchargement (HTTP 403, p. ex. protection anti-robots Cloudflare),
l'extension ouvre automatiquement l'image dans un onglet d'arrière-plan
— là-bas elle est same-origin, donc l'image est lue directement sans
téléchargement — la traduit, ferme l'onglet et remplace l'image sur votre
page, sur place.

   ![Le menu du clic droit](docs/images/right-click.png)

L'entrée du pipeline est la plus grande image de la page, filtrée par le paramètre de taille d'image
minimale (500 px par défaut) : les images plus petites sont ignorées avec une erreur
claire. L'extension lit directement l'image de la page — elle ne fait jamais
de capture d'écran de la page web.

**Cache des pages :** les pages que vous revisitez pendant la même session du navigateur se chargent instantanément
depuis un cache temporaire sur disque (traduire 10 à 40 images en une session peut
faire planter le navigateur, ce qui fait perdre toutes les images en cache. Pensez à vider le
cache manuellement). Le cache est vidé automatiquement à la fermeture du navigateur,
et n'est jamais utilisé dans les fenêtres de navigation privée.

**Paramètres** (cliquez sur l'icône → Paramètres) : accès aux sites, traduction automatique au
chargement de la page, langue source (y compris la **détection automatique**, qui identifie
le japonais / l'anglais / le chinois simplifié / traditionnel à partir du texte OCRisé)
et langue cible, moteur de traduction (Google gratuit / Azure
Translator / LM Studio), boutons de test de connexion pour Azure et LM Studio,
seuil de détection, taille d'image minimale (500 px par défaut — les captures plus petites sont
ignorées), tailles de police, mode débogage et contrôles du cache des pages traduites.

![Page Paramètres](docs/images/options.png)

## Soutenir ce projet

Si cette extension vous est utile, envisagez de soutenir son développement :

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

### Demander un compte Microsoft Azure

1. Créez un compte Microsoft/hotmail/Azure ou connectez-vous
2. Créez un abonnement Azure
3. Créez une ressource Azure Translator
4. Sélectionnez le niveau de tarification F0 (gratuit)
5. Gestion des ressources → Clés et point de terminaison → copiez la **CLÉ 1** et **l'emplacement/la région**

Microsoft indique actuellement que le niveau gratuit F0 de Translator est de 2 millions de caractères/mois et n'expire pas.

### LM Studio

Exécutez LM Studio avec son serveur local activé (par défaut
`http://127.0.0.1:1234`). Sélectionnez **LM Studio (serveur local)** comme moteur de traduction
dans les Paramètres, définissez l'URL du serveur et la variante d'API — **API REST v1 de LM Studio**
(envoie vers `/api/v1/chat`) ou **compatible OpenAI** (envoie vers
`/v1/chat/completions`) — puis appuyez sur **Vérifier la connexion LM Studio** pour
vérifier. Le modèle chargé est détecté automatiquement et mémorisé, il n'y a donc
aucun champ de nom de modèle à remplir.

## Compilation depuis les sources

Aucun bundler, aucun npm install — la source est l'extension. Prérequis :
`bash`, `python3`, `rsync`, `zip` et `node` (utilisé uniquement pour une vérification de syntaxe).

```bash
git clone https://github.com/jameslee0623/comic-translate-4-free.git
cd comic-translate-4-free
./build.sh
```

Cela écrit trois zips dans `dist/` (plus une copie du zip combiné pour
plus de commodité) :

- `comic-translate-4-free-v<version>-<build>.zip` — combiné, `chrome/` et
  `firefox/` côte à côte, prêt à charger non empaqueté (Chrome) ou comme
  module temporaire (Firefox) selon « Installation » ci-dessus
- `comic-translate-4-free-v<version>-<build>-chrome.zip` — version Chrome uniquement,
  en disposition de soumission au store
- `comic-translate-4-free-v<version>-<build>-firefox.zip` — version Firefox uniquement,
  en disposition de soumission au store

Le tampon `<build>` provient de la constante `BUILD` dans `src/shared/version.js`
(affiché dans les pieds de page de la fenêtre contextuelle et de la page des paramètres, intégré dans la clé du cache des pages).
Incrémentez-le avant de compiler si vous voulez un tampon unique dans le nom de fichier et le pied de page
de l'interface — sinon votre compilation est indiscernable de celle publiée
avec le même tampon.

Par page, l'extension envoie une seule requête groupée :

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

Le modèle est censé répondre avec un tableau JSON de chaînes traduites —
une par texte d'entrée, dans le même ordre. Un simple `[...]` à l'intérieur d'une réponse plus longue
est accepté ; une traduction par ligne est le dernier recours.

## Mode débogage

Activez le **mode débogage** dans les Paramètres et la sortie de chaque étape du pipeline apparaît dans
un inspecteur en panneau latéral : image capturée, boîtes de détection, blocs de texte, rognures OCR
+ lectures, masque d'inpainting, page inpaintée et traductions.

## Architecture

```
popup / paramètres (src/ui)
      │ messages chrome.runtime
      ▼
background — orchestration, capture, blocs, masque, API de traduction,
             émission de débogage
  ├─ Chrome : service worker + document offscreen (src/offscreen) hébergeant
  │  TOUTES les sessions onnxruntime-web (les téléchargements s'y exécutent pour qu'un fetch de 197 Mo
  │  survive à l'arrêt du SW)
  └─ Firefox : page d'arrière-plan (src/background/background.html) hébergeant les
     mêmes sessions en cours de processus (Firefox n'a pas de documents offscreen)
└── content script (src/content) — canevas de superposition + moteur de rendu de texte + panneau de débogage
```

Modèles (Hugging Face, téléchargés à la demande) :
- `ogkalu/comic-text-and-bubble-detector` → `detector-v4-s_int8.onnx`
- `genshiai-daichi/baberu-ocr` → `vision_int4.onnx`, `decoder_prefill_int8.onnx`,
  `decoder_step_int8.onnx` (japonais, anglais, chinois simplifié/traditionnel)
- `ogkalu/lama-manga-onnx-dynamic` → `lama-manga-dynamic.onnx`

Étapes du pipeline : capture → detect → blocks → OCR → mask → inpaint →
translate → render. La détection s'exécute à 640×640 ; la capture est mise à l'échelle par surface
(budget de 6,5 MP) pour que les longues bandes gardent leur pleine résolution, et les pages plus extrêmes
qu'un rapport 4:1 sont traitées en segments 2:1 qui se chevauchent.

**Pipeline Chrome vs Firefox :** les deux versions exécutent la traduction en parallèle avec
mask/inpaint après l'OCR. Chrome le fait via Promise.all — les sessions ML
résident dans le document offscreen sur son propre thread, donc les étapes se
chevauchent vraiment. Firefox exécute la traduction sur un Web Worker (son propre thread) pendant que
mask → inpaint s'exécute sur le thread principal — les E/S réseau du worker ne sont pas
bloquées quand l'inpainting WASM monopolise le thread principal.

## Limitations connues

- Aucun bon OCR pour le coréen trouvé pour l'instant — les langues sources sont limitées au japonais,
  à l'anglais et au chinois simplifié/traditionnel.
- La traduction automatique traite une seule image par page (l'image principale de la page).
  Pour traduire toute autre image de la page, faites un clic droit dessus et choisissez
  **Send to comic-translate-4-free**.
- Certains hébergeurs d'images bloquent les téléchargements automatisés (HTTP 403, p. ex. protection anti-robots Cloudflare)
  même si la page elle-même charge l'image correctement. Le
  **Send to comic-translate-4-free** du clic droit contourne cela via un
  onglet d'arrière-plan ; la traduction automatique sur de tels sites peut échouer avec une erreur 403.
  Ce blocage peut être intermittent.
- Firefox : les modèles d'IA s'exécutent dans la page d'arrière-plan du navigateur (Firefox n'a
  pas de documents offscreen), partageant la mémoire avec tout le reste. Sur de très grandes
  pages ou de longues sessions, le moteur peut manquer de mémoire et signaler
  « no available backend found ». Redémarrer le navigateur libère la mémoire ; Chrome n'est
  pas affecté car il exécute les modèles dans un processus séparé.
- Chrome : traduire des dizaines d'images en une session peut faire planter le navigateur
  (observé autour de 35 images en cache).
- Le cache des pages est limité à la session : il est effacé au démarrage du navigateur, donc
  après un redémarrage (y compris après un plantage), les images renvoyées réexécutent tout le
  pipeline au lieu d'utiliser le cache.
- Le moteur de traduction Google utilise le point de terminaison non officiel `translate.googleapis.com`
  et peut être limité en débit.
- Le texte vertical est rendu pour les blocs CJK hauts ; les SFX / le texte hors bulles
  utilisent leur propre zone de texte.

## Avis de tiers

Les bibliothèques groupées, le code porté et les modèles téléchargés à l'exécution sont listés avec
leurs licences dans [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
