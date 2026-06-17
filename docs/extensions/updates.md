# Mises à jour

La marketplace compare `latestVersion` du registry avec la version installée.

Flux:

1. Lecture du registry GitHub.
2. Détection des versions plus récentes.
3. Affichage du changelog.
4. Téléchargement du manifest et du bundle.
5. Validation compatibilité, manifest et checksum.
6. Remplacement local et rechargement immédiat.

## Activation

Installer une extension l’ajoute à AppData. Les plugins et thèmes ne sont exécutés ou appliqués que si leur état `enabled` vaut `true` dans `extensions/extensions.json`.

Activer un thème désactive les autres thèmes, afin de garder une seule palette active.

## Redémarrage conservé

Depuis Paramètres > Extensions, Caltemp peut redémarrer l’application après avoir sauvegardé `runtime-session.json` dans AppData. Au prochain démarrage, l’application restaure l’onglet Extensions, la vue calendrier courante et laisse `tauri-plugin-window-state` restaurer la position et la taille de fenêtre.
