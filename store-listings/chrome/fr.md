# Chrome Web Store listing — Français (fr)

## Short description (132 chars max)

Traduisez mangas et BD dans votre navigateur. Lit japonais, anglais, chinois simplifié et traditionnel ; traduit en 114 langues.

(Count: 128)

## Detailed description

**Lisez des mangas dans votre langue — directement dans le navigateur.**

comic-translate-4-free traduit automatiquement les pages de BD et de mangas pendant que vous naviguez. Ouvrez une page, et la version traduite remplace l'image originale sur place — des bulles remplies de votre langue, rien à cliquer.

**Comment ça marche**

1. L'extension trouve toutes les images de la page et les capture.
2. Un détecteur d'IA sur l'appareil localise chaque bulle et chaque bloc de texte.
3. L'OCR entraîné sur le manga lit le texte (japonais, anglais, chinois simplifié et traditionnel — avec détection automatique de la langue).
4. Le texte original est proprement supprimé par inpainting IA.
5. Le moteur de traduction de votre choix renvoie le résultat dans les bulles, à la bonne taille.

**Confidentialité d'abord : l'IA tourne sur votre machine**

La détection des bulles et l'OCR tournent localement dans votre navigateur via WebAssembly, et l'inpainting tourne sur votre GPU (avec repli WebAssembly) — vos pages ne quittent jamais votre appareil. Seul le texte extrait est envoyé au service de traduction que vous choisissez.

**Fonctionnalités**

- Traduction automatique au chargement des pages — aucun bouton à presser
- Traduit toutes les images de la page (jusqu'à 50 par exécution), pas seulement l'image principale
- Clic droit sur n'importe quelle image → « Envoyer vers comic-translate-4-free » pour la traduire directement
- 114 langues cibles via Google Translate, Azure Translator ou votre propre serveur local LM Studio
- Détection automatique de la langue source
- Prise en charge des longues bandes / webtoons
- Fonctionne sur les sites qui bloquent les téléchargements automatisés (nouvel essai via un onglet en arrière-plan)
- Popup et réglages au thème sombre, contrôles d'accès par site
- Le Mode débogage montre chaque étape du pipeline pour le dépannage

**Gratuit pour un usage non commercial**

Sous licence PolyForm Noncommercial License 1.0.0. Aucun compte, aucun abonnement, aucun suivi.
https://github.com/jameslee0623/comic-translate-4-free
