# Quickstart

## Un plugin en un fichier

Créez `bonjour.js` :

```js
/**
 * @caltemp
 * id: com.example.bonjour
 * name: Bonjour
 * version: 1.0.0
 */

export function activate(ctx) {
  ctx.commands.register({
    id: 'bonjour',
    label: 'Dire bonjour',
    run: () => ctx.ui.toast('Bonjour depuis mon plugin !', 'success'),
  });
}
```

Puis, dans Caltemp : **Paramètres › Extensions › Installer un fichier** (ou glissez le fichier sur la page). Caltemp affiche le nom et les permissions demandées ; confirmez. La commande « Dire bonjour » apparaît aussitôt dans la palette (`Ctrl+K`).

Pour itérer, modifiez `AppData/extensions/com.example.bonjour/index.js` puis cliquez sur **Recharger**, ou réinstallez le fichier : les réglages et les données du plugin sont conservés.

Vérifiez l’en-tête sans lancer Caltemp :

```bash
npm run extensions:validate -- bonjour.js
```

## Un plugin qui lit l’agenda

```js
/**
 * @caltemp
 * id: com.example.aujourdhui
 * name: Aujourd’hui
 * version: 1.0.0
 * permissions: calendar:read
 */

export function activate(ctx) {
  ctx.commands.register({
    id: 'today',
    label: 'Mes événements du jour',
    run: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      const events = await ctx.calendar.occurrences({ from: start, to: end });

      await ctx.ui.showPanel({
        title: 'Aujourd’hui',
        blocks: events.length
          ? [{ type: 'list', items: events.map((e) => ({ title: e.title, meta: new Date(e.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), color: e.color })) }]
          : [{ type: 'text', text: 'Journée libre.' }],
      });
    },
  });
}
```

## Un thème

```json
{
  "id": "com.example.cyan",
  "name": "Cyan",
  "version": "1.0.0",
  "theme": {
    "colors": { "accent": "#67e8f9" }
  }
}
```

## Exemples livrés

Installables depuis **Paramètres › Extensions › Exemples inclus** :

- `examples/extensions/hello` : le plus petit plugin possible.
- `examples/extensions/week-summary` : commande, panneau, réglages, stockage et événements.
- `examples/extensions/french-football-gallery` : plugin au format dossier (`manifest.json` + `index.js`) qui ouvre une galerie.
- `examples/extensions/minimal-theme` et `examples/extensions/youtube-theme` : thèmes.
