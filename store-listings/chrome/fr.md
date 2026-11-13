# Chrome Web Store listing — Français (fr)

## Short description (132 chars max)

Traduisez mangas et BD dans votre navigateur. Lit japonais, anglais, chinois simplifié et traditionnel ; traduit en 114 langues.

(Count: 128)

## Detailed description

📖 Lisez des mangas dans votre langue !

comic-translate-4-free traduit mangas et BD automatiquement. Il lit japonais, anglais, chinois simplifié/traditionnel (détection auto), et traduit vers 114 langues, remplaçant l'image sur place.

✨ Fonctionnalités
- Traduction automatique — ouvrez une page de manga sur un site autorisé et la version traduite apparaît sur place, sans avoir besoin de cliquer sur un bouton.
- Chaque image sur la page — la traduction automatique gère toutes les images d'une page (jusqu'à 50 par exécution), pas seulement l'image principale.
- Clic droit sur n'importe quelle image — choisissez « Envoyer vers comic-translate-4-free » pour traduire une image précise, même si elle est plus petite que la taille minimale.
- 114 langues cibles via Google Translate, Azure Translator ou votre propre serveur local LM Studio.
- Détection automatique de la langue source — le japonais, l'anglais, le chinois simplifié/traditionnel sont identifiés automatiquement à partir du texte lu par OCR.
- Prise en charge des longues bandes / webtoons — les pages hautes sont traitées en segments qui se chevauchent pour que le texte reste net.
- 17 langues d'interface — l'interface de l'extension suit le réglage de langue de votre navigateur.

🔒 Confidentialité
- L'IA tourne sur votre machine. La détection des bulles, l'OCR et l'inpainting tournent tous localement dans votre navigateur. La détection et l'OCR tournent via WebAssembly. L'inpainting tourne sur GPU dans Chrome (avec repli WebAssembly), et via WebAssembly dans Firefox. Vos pages ne quittent jamais votre appareil.
- Seul le texte traduit est envoyé — seules les chaînes extraites vont vers le service de traduction que vous choisissez (Google / Azure / votre LM Studio local).
- Aucun compte, aucun suivi, aucune télémétrie. Tous les réglages et modèles en cache restent dans le stockage local de votre navigateur.

💡 Comment l'utiliser
- Autorisez d'abord le site — cliquez sur l'icône de l'extension et appuyez sur Autoriser ce site (ou activez Autoriser tous les sites). La traduction ne s'exécute que là où vous avez accordé l'autorisation.

- Rechargez la page de manga — elle commence à traduire automatiquement quand la page se charge. Une pastille en haut à droite montre la progression en direct (Capturing → Detecting → OCR → …).
- Terminé — les images de la page sont remplacées sur place par les versions traduites.

Conseils :
- Clic droit sur n'importe quelle image → Envoyer vers comic-translate-4-free pour traduire juste cette image.

- Si un site bloque les téléchargements (HTTP 403), l'extension réessaie automatiquement via un onglet en arrière-plan.
- Choisissez votre moteur de traduction dans Paramètres : Google (gratuit, sans clé), Azure Translator (demandez les clés ci-dessous — 2 millions de caractères/mois gratuits) ou LM Studio (serveur local).
- Activez le Mode débogage (inspecteur d'étapes) dans Paramètres pour inspecter chaque étape du pipeline.

⚠️ Problèmes connus
- Pas encore d'OCR coréen — les langues sources sont le japonais, l'anglais et le chinois simplifié/traditionnel. (Le coréen reste disponible comme langue de traduction.)
- Grosses sessions — traduire des dizaines d'images en une session peut redémarrer l'extension en arrière-plan. Si cela arrive, l'exécution reprend automatiquement là où elle s'était arrêtée.
- Firefox — les modèles tournent dans la page d'arrière-plan (sans documents offscreen), en partageant la mémoire avec tout le reste. Redémarrez le navigateur si vous voyez « no available backend found ».
- Firefox est plus lent que Chrome — les extensions Firefox ne peuvent pas utiliser la mémoire partagée pour le multithreading (SharedArrayBuffer), donc le modèle tourne sur un seul thread CPU. C'est une limite de la plateforme Firefox, pas un bug de l'extension. (Bug Mozilla 1673477).
- Google Translate utilise le point de terminaison gratuit non officiel et peut être limité en débit.

📄 Avis de tiers
Ce projet s'inspire de ogkalu2/comic-translate — le détecteur de bulles/texte et l'inpainter LaMa entraîné sur le manga sont ses exports ONNX, et la logique d'inférence en est portée. (L'OCR utilise Baberu de genshiai-daichi.)

Les bibliothèques incluses, le code porté et les modèles téléchargés à l'exécution sont listés avec leurs licences dans THIRD-PARTY-NOTICES.md.

PolyForm Noncommercial License 1.0.0 — voir LICENSE.
https://github.com/jameslee0623/comic-translate-4-free
