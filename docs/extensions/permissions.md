# Permissions

Les permissions sont déclarées dans `manifest.json`.

- `calendar:read`: lire les événements.
- `calendar:write`: créer, modifier ou supprimer des événements.
- `settings:read`: lire les réglages.
- `notifications:send`: envoyer une notification Caltemp.
- `network:github`: réservé aux futures intégrations GitHub.
- `storage:extension`: utiliser le stockage privé de l’extension.

Un appel sans permission échoue avec une erreur explicite.
