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

## Limites v1

- Pas d’accès direct aux APIs Tauri.
- Pas de plugin Rust natif.
- Pas d’injection arbitraire dans les composants React internes.
