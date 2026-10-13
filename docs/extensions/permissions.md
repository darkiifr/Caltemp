# Permissions

Déclarées dans l’en-tête `@caltemp` ou `manifest.json`, affichées avant l’installation et vérifiées par Caltemp à chaque appel.

| Permission | Donne accès à |
| --- | --- |
| `calendar:read` | `ctx.calendar.list/occurrences/get`, détails des événements `calendar:*` et `reminder:triggered` |
| `calendar:write` | `ctx.calendar.create/update/delete` |
| `settings:read` | `ctx.settings.read()` (préférences d’affichage seulement) |
| `notifications:send` | `ctx.notify()` |
| `network` | `ctx.http.fetch()` vers les domaines listés dans `hosts` |

Sans permission : commandes, panneaux, `ctx.ui.toast`, galerie, stockage privé, réglages du plugin, événements personnalisés.

Un appel sans la permission requise échoue avec une erreur explicite.

`storage:extension` et `network:github` (SDK 1.x) sont acceptées mais n’accordent rien : le stockage privé est désormais toujours disponible.
