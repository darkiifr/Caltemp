# Référence manifest

Le même contenu peut s’écrire en JSON (`manifest.json`) ou dans l’en-tête d’un plugin en un fichier.

## Plugin en un fichier

```js
/**
 * @caltemp
 * id: com.example.meteo
 * name: Météo
 * version: 1.0.0
 * description: La météo du jour dans la palette.
 * permissions: network, notifications:send
 * hosts: api.open-meteo.com
 * settings: [{"key":"city","label":"Ville","default":"Paris"}]
 */
```

Une ligne par champ `clé: valeur`. `permissions`, `hosts` et `dependencies` sont des listes séparées par des virgules ; une valeur commençant par `[` ou `{` est lue en JSON. L’en-tête doit être le premier élément du fichier. Il est lu comme du texte : le code n’est jamais exécuté avant que vous ayez vu ses permissions.

## `manifest.json`

```json
{
  "id": "com.example.extension",
  "name": "Nom lisible",
  "version": "1.0.0",
  "description": "Description courte",
  "author": "Auteur",
  "license": "MIT",
  "repository": "https://github.com/owner/repo",
  "permissions": ["calendar:read"]
}
```

## Champs

| Champ | Requis | Par défaut | Description |
| --- | --- | --- | --- |
| `id` | oui | | Identifiant DNS inversé stable (`com.example.nom`). |
| `name` | oui | | Nom affiché. |
| `version` | oui | | Semver. |
| `type` | non | déduit | `theme` si `theme` est présent, sinon `plugin`. |
| `entry` | non | `index.js` | Fichier du plugin (format dossier). |
| `permissions` | non | `[]` | Voir [permissions](../permissions.md). |
| `hosts` | non | `[]` | Domaines pour `ctx.http.fetch` ; `*.example.com` couvre les sous-domaines. Exige `network`. |
| `settings` | non | `[]` | Réglages utilisateur, voir ci-dessous. |
| `theme` | thèmes | | `colors` et/ou `variables`, voir le [guide thèmes](../guides/themes.md). |
| `sdkVersion` | non | `2.0.0` | Version du SDK ciblée. |
| `compatibility.caltemp` | non | `>=6.0.0` | Versions de Caltemp compatibles. |
| `description`, `author`, `license`, `homepage`, `repository`, `changelog` | non | | Affichés dans Paramètres › Extensions. |

## `settings`

```json
[
  { "key": "city", "label": "Ville", "default": "Paris" },
  { "key": "units", "type": "select", "label": "Unités", "options": [{ "value": "c", "label": "°C" }, { "value": "f", "label": "°F" }] },
  { "key": "days", "type": "number", "default": 3, "min": 1, "max": 7 },
  { "key": "alerts", "type": "boolean", "label": "Alertes", "default": true, "description": "Notifier en cas de pluie." }
]
```

`type` : `string` (défaut), `number`, `boolean`, `select`. Les valeurs enregistrées sont converties dans le type déclaré et bornées (`min`/`max`, `options`). Le plugin les lit avec `ctx.config.get(key)`.
