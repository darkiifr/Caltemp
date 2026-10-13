# Guide plugins

Un plugin est un module ESM autonome (sans `import`) qui exporte `activate(ctx)`.

## Forme

```js
/**
 * @caltemp
 * id: com.example.mon-plugin
 * name: Mon plugin
 * version: 1.0.0
 * permissions: calendar:read
 */

export function activate(ctx) {
  // …
}

// Optionnel : rarement utile, Caltemp nettoie tout seul.
export function deactivate(ctx) {}
```

`export default { activate, deactivate }` fonctionne aussi. `activate` peut être `async` ; elle doit se terminer en moins de 10 secondes.

## Ce que fait Caltemp pour vous

Quand le plugin est désactivé, mis à jour, rechargé ou supprimé, Caltemp :

- retire ses commandes de la palette ;
- ferme ses panneaux ;
- coupe ses abonnements aux événements ;
- arrête son worker (et donc ses `setTimeout`/`setInterval`).

Il n’y a donc rien à retourner ni à nettoyer dans `activate`.

## Commandes

```js
ctx.commands.register({
  id: 'exporter',
  label: 'Exporter mes heures',
  run: async () => { /* … */ },
});
```

## Panneaux

`ctx.ui.showPanel()` ouvre une fenêtre interne construite à partir de blocs. Les boutons rappellent le code du plugin.

```js
const panel = await ctx.ui.showPanel({
  title: 'Pomodoro',
  blocks: [
    { type: 'stats', items: [{ label: 'Sessions', value: 3 }] },
    { type: 'progress', label: 'Objectif du jour', value: 0.6 },
    { type: 'actions', items: [{ label: 'Démarrer', variant: 'primary', onClick: start }] },
  ],
});
await panel.update({ /* nouveau contenu */ });
```

Blocs disponibles : voir la [référence SDK](../reference/sdk-api.md#ctxui).

## Réglages

Déclarez-les dans l’en-tête (valeur JSON) ou le manifest ; Caltemp affiche le formulaire dans Paramètres › Extensions.

```js
/**
 * @caltemp
 * id: com.example.meteo
 * name: Météo
 * version: 1.0.0
 * permissions: network
 * hosts: api.open-meteo.com
 * settings: [{"key":"city","label":"Ville","default":"Paris"}]
 */

export function activate(ctx) {
  ctx.logger.info('Ville :', ctx.config.get('city'));
  ctx.config.onChange((config) => ctx.logger.info('Nouvelle ville :', config.city));
}
```

## Données

`ctx.storage` est un stockage clé/valeur privé, persistant (1 Mo), sans permission.

```js
const count = (await ctx.storage.get('count')) ?? 0;
await ctx.storage.set('count', count + 1);
```

## Réseau

Le worker n’a pas `fetch`. Déclarez la permission `network` et les domaines dans `hosts`, puis :

```js
const response = await ctx.http.fetch('https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current=temperature_2m');
const data = await response.json();
```

## Entre plugins

Un plugin peut émettre des événements personnalisés, nommés `prefixe:nom`, que les autres plugins écoutent :

```js
ctx.emit('meteo:updated', { temperature: 21 });
// ailleurs
ctx.on('meteo:updated', ({ temperature }) => { /* … */ });
```

Les événements de Caltemp (`calendar:*`, `app:*`, …) ne peuvent pas être émis par un plugin.

## Isolation

Le code du plugin s’exécute dans un Web Worker dédié : pas de `window`, `document`, `fetch`, `XMLHttpRequest`, `WebSocket`, `indexedDB` ni APIs Tauri. Tout passe par `ctx`, et chaque appel est vérifié par Caltemp. Limite connue : un `import()` dynamique d’une URL distante reste techniquement possible dans le worker ; c’est interdit pour les plugins publiés dans le registry officiel.

Consultez `examples/extensions/week-summary/index.js` pour un plugin complet.
