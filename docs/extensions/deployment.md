# Déploiement

Les extensions sont déployées via GitHub:

- tag semver ou release GitHub;
- `manifest.json` accessible publiquement en HTTPS;
- bundle plugin en asset de release;
- changelog attaché à la release;
- entrée ajoutée au registry officiel Caltemp.

Après publication, l’application détecte la version disponible au prochain rafraîchissement marketplace.
