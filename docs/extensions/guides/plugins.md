# Guide plugins

Un plugin Caltemp v1 est un module ESM autonome.

## Cycle de vie

```js
export function activate(ctx) {
  const off = ctx.events.on('calendar:event-created', ({ event }) => {
    ctx.logger.info('Créé', event.id);
  });

  return off;
}

export function deactivate(ctx) {
  ctx.logger.info('Plugin désactivé');
}
```

## Accès contrôlé

Chaque appel sensible vérifie le manifest. Par exemple, `ctx.calendar.createEvent()` exige `calendar:write`.

## UI hôte

Les plugins ne montent pas directement des composants React. Ils passent par des surfaces contrôlées:

- `ctx.ui.registerAction()` ajoute une action à la palette de commandes.
- `ctx.ui.openGallery()` ouvre une modal Caltemp pour afficher une galerie d’images HTTPS.

Consultez `examples/extensions/french-football-gallery` pour un exemple complet.

## Limites v1

- Pas d’accès direct aux APIs Tauri.
- Pas de plugin Rust natif.
- Pas d’injection arbitraire dans les composants React internes.
