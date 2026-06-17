# Référence SDK

## `ctx.sdkVersion`

Version du SDK exposé par Caltemp. Valeur actuelle: `1.0.0`.

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

## `ctx.logger`

Journalise avec le préfixe de l’extension.
