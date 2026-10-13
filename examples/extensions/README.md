# Exemples d’extensions

Chaque dossier est installable depuis **Paramètres › Extensions › Exemples inclus** (ils sont tous intégrés automatiquement) et validé par `npm run extensions:validate`.

## Plugins

| Dossier | Montre | Permissions |
| --- | --- | --- |
| [`hello`](./hello/index.js) | Le plus petit plugin : un fichier, une commande, un toast. | — |
| [`week-summary`](./week-summary/index.js) | Panneau (stats, progression, liste, boutons), réglages, stockage, événements `calendar:*`. | `calendar:read`, `notifications:send` |
| [`pomodoro`](./pomodoro/index.js) | Minuteur : timers dans le worker, panneau rafraîchi chaque seconde quand il est ouvert, objectif du jour. | `notifications:send` |
| [`quick-add`](./quick-add/index.js) | `ctx.ui.prompt` et analyse d’une phrase en français (« Dentiste demain 14h30 pendant 45 min ») pour créer un événement. | `calendar:write` |
| [`weather`](./weather/index.js) | `ctx.http.fetch` vers des domaines déclarés (Open-Meteo, sans clé), cache, alerte au démarrage. | `network`, `notifications:send` |
| [`countdown`](./countdown/index.js) | Échéances suivies par mots-clés avec `calendar.occurrences`, alerte quotidienne. | `calendar:read`, `notifications:send` |
| [`reminder-log`](./reminder-log/index.js) | Historique de l’événement `reminder:triggered`. | `calendar:read` |
| [`french-football-gallery`](./french-football-gallery) | Format dossier (`manifest.json` + `index.js`) et galerie d’images. | — |

## Thèmes

| Dossier | Style |
| --- | --- |
| [`minimal-theme`](./minimal-theme/manifest.json) | Accent cyan seul : le plus petit thème possible. |
| [`nord-theme`](./nord-theme/manifest.json) | Bleu-gris arctique. |
| [`sunset-theme`](./sunset-theme/manifest.json) | Orange sur fonds prune. |
| [`forest-theme`](./forest-theme/manifest.json) | Verts profonds. |
| [`lavender-theme`](./lavender-theme/manifest.json) | Violets doux. |
| [`high-contrast-theme`](./high-contrast-theme/manifest.json) | Noir pur, texte blanc, accent bleu vif. |
| [`youtube-theme`](./youtube-theme/manifest.json) | Rouge, noir et blanc. |

Les jetons de couleur sont décrits dans le [guide thèmes](../../docs/extensions/guides/themes.md).
