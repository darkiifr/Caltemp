# Événements

S’abonner : `ctx.on(nom, handler)`.

| Événement | Payload |
| --- | --- |
| `app:ready` | `{ version }` |
| `calendar:event-created` | `{ event }` |
| `calendar:event-updated` | `{ event }` |
| `calendar:event-deleted` | `{ eventId }` |
| `reminder:triggered` | `{ event, occurrence, phase }` (`phase` : `early` ou `final`) |
| `settings:changed` | `{ settings }` filtrés comme `ctx.settings.read()` ; `{}` sans `settings:read` |
| `theme:changed` | `{ id, variables }` |
| `extension:installed`, `extension:updated` | `{ id, version }` |
| `extension:removed`, `extension:enabled`, `extension:disabled` | `{ id }` |

Les plugins sans `calendar:read` reçoivent les événements `calendar:*` et `reminder:triggered` réduits à `{ eventId }` : ils savent que quelque chose a changé, pas quoi.

## Événements personnalisés

Tout nom de la forme `prefixe:nom` qui ne commence pas par `app:`, `calendar:`, `settings:`, `theme:`, `extension:` ou `reminder:` peut être émis avec `ctx.emit()` et écouté par les autres plugins. Utilisez un préfixe propre à votre plugin.
