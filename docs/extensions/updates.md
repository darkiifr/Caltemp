# Mises à jour

La marketplace compare `latestVersion` du registry avec la version installée.

1. Lecture du registry GitHub.
2. Détection des versions plus récentes.
3. Téléchargement du paquet, vérification du checksum et du manifest.
4. Aperçu : nom, version et permissions demandées.
5. Remplacement local et redémarrage immédiat du plugin.

Une mise à jour conserve l’état activé/désactivé, les réglages et le stockage de l’extension.

## Activation

Les plugins et thèmes ne sont exécutés ou appliqués que si leur état `enabled` vaut `true` dans `extensions/extensions.json`. Activer, désactiver, recharger ou supprimer une extension s’applique sans redémarrer Caltemp.

Activer un thème désactive les autres thèmes.
