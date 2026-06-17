# Référence SDK

## `ctx.sdkVersion`

Version du SDK exposé par Caltemp. Valeur actuelle: `1.1.0`.

## `ctx.events`

- `on(eventName, handler)` retourne une fonction de désinscription.
- `emit(eventName, payload)` publie un événement interne.

## `ctx.calendar`

- `listEvents()` exige `calendar:read`.
- `createEvent(event)` exige `calendar:write`.
- `updateEvent(event)` exige `calendar:write`.
- `deleteEvent(eventId)` exige `calendar:write`.

## `ctx.settings`

- `read()` exige `settings:read`.

## `ctx.notifications`

- `send(title, body, type)` exige `notifications:send`.

## `ctx.storage`

- `get(key)`, `set(key, value)`, `remove(key)` exigent `storage:extension`.

## `ctx.ui`

- `registerAction(action)` ajoute une action à la palette de commandes Caltemp. `action` doit définir `id`, `label` et `run()`. La fonction retourne une fonction de désinscription.
- `openGallery(gallery)` ouvre une modal interne avec une galerie d’images. `gallery` accepte `title`, `description` et `items`; chaque item peut définir `name`, `description`, `imageUrl`, `alt`, `sourceUrl` et `sourceLabel`.
- Les images et liens source doivent utiliser des URLs HTTPS. Les liens externes ne s’ouvrent que sur action explicite de l’utilisateur.

## `ctx.logger`

Journalise avec le préfixe de l’extension.
