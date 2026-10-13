# Référence SDK 2.0

Tout ce que reçoit `activate(ctx)`. Sauf mention contraire, les méthodes renvoient une `Promise`. Les arguments et résultats sont des données JSON (objets, tableaux, dates) ; les fonctions ne sont acceptées que là où elles sont documentées (`run`, `onClick`, handlers).

## `ctx.manifest`, `ctx.sdkVersion`

Le manifest validé du plugin et la version du SDK (`2.0.0`).

## Événements

- `ctx.on(eventName, handler)` → fonction de désinscription (synchrone).
- `ctx.emit(eventName, payload)` émet un événement personnalisé `prefixe:nom` vers les autres plugins.
- `ctx.events.on` / `ctx.events.emit` : alias.

Liste : [événements](./events.md).

## `ctx.calendar`

| Méthode | Permission | Description |
| --- | --- | --- |
| `list({ from?, to? })` | `calendar:read` | Événements enregistrés, filtrés sur leur date de début. |
| `occurrences({ from?, to? })` | `calendar:read` | Occurrences réelles (récurrences dépliées) entre `from` et `to` (7 jours par défaut, 366 jours max), triées. |
| `get(id)` | `calendar:read` | Un événement ou `null`. |
| `create(event)` | `calendar:write` | Crée et renvoie l’événement normalisé. |
| `update(event)` | `calendar:write` | Fusionne `event` (avec `id`) dans l’existant. |
| `delete(id)` | `calendar:write` | Supprime l’événement. |

Alias SDK 1.x : `listEvents`, `createEvent`, `updateEvent`, `deleteEvent`.

## `ctx.commands`

- `register({ id, label, run })` ajoute une entrée à la palette de commandes ; renvoie (synchrone) une fonction qui la retire. Réenregistrer le même `id` remplace la commande.

Alias SDK 1.x : `ctx.ui.registerAction`.

## `ctx.ui`

- `toast(message, type?)` : notification interne discrète (`info`, `success`, `warning`, `error`). Sans permission.
- `showPanel(panel)` → `{ id, update(panel), close() }`. Ouvre un panneau Caltemp. `update` échoue une fois le panneau fermé par l’utilisateur.
- `openGallery({ title, description, items })` : galerie d’images HTTPS (`name`, `description`, `imageUrl`, `alt`, `sourceUrl`, `sourceLabel`).

Un panneau est `{ title, description?, blocks }`. Blocs :

| `type` | Champs |
| --- | --- |
| `heading` | `text` |
| `text` | `text` (retours à la ligne conservés) |
| `stats` | `items: [{ label, value }]` |
| `progress` | `label?`, `value` entre 0 et 1 |
| `list` | `items: [{ title, subtitle?, meta?, color?, onClick? }]` |
| `actions` | `items: [{ label, onClick, variant?: 'primary' \| 'danger' }]` |
| `image` | `url` (HTTPS), `alt` |
| `divider` | — |

Le texte est affiché tel quel (pas de HTML). Les blocs inconnus sont ignorés.

## `ctx.notify(title, body?, type?)`

Notification Caltemp (toast, son, notification système). Exige `notifications:send`. Alias : `ctx.notifications.send`.

## `ctx.config`

Valeurs des [réglages déclarés](./manifest.md#settings).

- `get(key?)` (synchrone) : une valeur, ou toutes si `key` est omis.
- `set(values)` : enregistre des valeurs (validées selon leur type).
- `onChange(listener)` → désinscription. Appelé quand l’utilisateur enregistre les réglages.

## `ctx.storage`

Stockage clé/valeur privé et persistant (1 Mo, valeurs JSON). Sans permission.

`get(key)`, `set(key, value)`, `remove(key)`, `keys()`, `clear()`.

## `ctx.http.fetch(url, init?)`

Exige `network` ; `url` doit être en HTTPS et son domaine déclaré dans `hosts`. `init` : `method`, `headers`, `body` (texte).

Renvoie `{ ok, status, headers, body, text(), json() }`.

## `ctx.settings.read()`

Exige `settings:read`. Renvoie les préférences d’affichage seulement : `theme`, `fontSize`, `dateFormat`, `notifications`, `notificationMode`, `categoryLegend`, `calendarViews`, `activeThemeId`.

## `ctx.logger`

`debug`, `info`, `warn`, `error` : journalisent dans la console de Caltemp avec l’id du plugin.
