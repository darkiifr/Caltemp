# Mises à jour

La marketplace compare `latestVersion` du registry avec la version installée.

Flux:

1. Lecture du registry GitHub.
2. Détection des versions plus récentes.
3. Affichage du changelog.
4. Téléchargement du manifest et du bundle.
5. Validation compatibilité, manifest et checksum.
6. Remplacement local et rechargement immédiat.
