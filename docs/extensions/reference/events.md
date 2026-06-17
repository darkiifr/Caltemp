# Système d’événements

Événements v1:

- `app:ready`
- `calendar:event-created`
- `calendar:event-updated`
- `calendar:event-deleted`
- `settings:changed`
- `theme:changed`
- `extension:installed`
- `extension:updated`
- `extension:removed`
- `extension:enabled`
- `extension:disabled`

Les payloads exposent uniquement les données nécessaires à l’action. Les plugins doivent éviter de stocker des données personnelles sans raison explicite.
