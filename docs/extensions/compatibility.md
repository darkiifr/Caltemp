# Compatibilité

Caltemp v6 expose le SDK `2.0.0`.

- `sdkVersion` et `compatibility.caltemp` sont facultatifs (par défaut `2.0.0` et `>=6.0.0`).
- Les APIs du SDK restent stables pour les versions Caltemp compatibles.
- Les classes CSS internes de l’app ne sont pas une API publique.

## Depuis le SDK 1.x

Les manifests 1.x restent valides. Changements pour le code :

- Les plugins tournent dans un Web Worker : `window`, `document` et `fetch` ne sont plus disponibles.
- `ctx.calendar.listEvents()` et `ctx.settings.read()` renvoient désormais une `Promise` : ajoutez `await`.
- `ctx.settings.read()` ne renvoie plus que les préférences d’affichage.
- Les payloads `calendar:*` sont réduits à `{ eventId }` sans `calendar:read`, et `settings:changed` est filtré.
- `ctx.events.emit()` n’accepte plus que des événements personnalisés.
- `ctx.storage` ne demande plus `storage:extension` et persiste sur disque.
- Les noms 1.x (`listEvents`, `createEvent`, `ui.registerAction`, `notifications.send`…) restent disponibles.
