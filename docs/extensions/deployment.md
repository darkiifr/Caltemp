# Déploiement

Les extensions sont déployées via GitHub :

- tag semver ou release GitHub ;
- le fichier du plugin (ou `manifest.json` pour un thème) en asset de release, accessible en HTTPS ;
- changelog attaché à la release ;
- entrée ajoutée au registry officiel Caltemp (voir [publication](./publishing.md)).

Après publication, l’application détecte la version disponible au prochain rafraîchissement de la marketplace.
