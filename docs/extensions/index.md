# Extensions Caltemp

Caltemp accepte deux sortes d’extensions :

- les **thèmes** : un `manifest.json` qui change quelques couleurs ;
- les **plugins** : un seul fichier `.js` qui ajoute des commandes, des panneaux, réagit aux événements du calendrier, garde ses données, appelle une API web…

SDK courant : `2.0.0`.

## Lire dans l’ordre

1. [Quickstart](./quickstart.md) : un plugin en un fichier, en 2 minutes
2. [Créer un plugin](./guides/plugins.md)
3. [Créer un thème](./guides/themes.md)
4. [Référence SDK](./reference/sdk-api.md)
5. [Référence du manifest](./reference/manifest.md)
6. [Événements](./reference/events.md) et [permissions](./permissions.md)

## Principes

- **Un fichier suffit.** Les métadonnées d’un plugin tiennent dans un en-tête `/** @caltemp … */` ; `manifest.json` reste possible.
- **Isolé.** Chaque plugin tourne dans son propre Web Worker : pas d’accès au DOM, à l’état de l’app, aux APIs Tauri, au système de fichiers ni au réseau direct. Une boucle infinie ne bloque pas Caltemp.
- **Permissions vérifiées par Caltemp.** Le plugin demande, Caltemp contrôle chaque appel côté application selon les permissions déclarées et affichées avant l’installation.
- **Rien à nettoyer.** Commandes, abonnements, panneaux et timers disparaissent quand le plugin est désactivé.
- **Sans redémarrage.** Installer, activer, désactiver, mettre à jour, recharger ou régler une extension s’applique immédiatement.
- La Rich Presence Discord est une intégration native de Caltemp, pas une API plugin.
