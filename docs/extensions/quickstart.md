# Quickstart minimal

## Plugin

Créez `manifest.json` :

```json
{
  "id": "com.example.hello",
  "name": "Hello Caltemp",
  "type": "plugin",
  "version": "1.0.0",
  "sdkVersion": "1.1.0",
  "compatibility": { "caltemp": ">=6.0.0" },
  "entry": "index.js",
  "permissions": []
}
```

Créez `index.js` :

```js
export function activate(ctx) {
  return ctx.ui.registerAction({
    id: 'hello-caltemp',
    label: 'Dire bonjour',
    run: () => {
      ctx.logger.info('Bonjour depuis une action Caltemp');
    },
  });
}
```

Validez :

```bash
npm run extensions:validate
```

## Thème

Un thème déclare uniquement des variables CSS :

```json
{
  "id": "com.example.theme",
  "name": "Theme cyan",
  "type": "theme",
  "version": "1.0.0",
  "sdkVersion": "1.1.0",
  "compatibility": { "caltemp": ">=6.0.0" },
  "permissions": [],
  "theme": {
    "variables": {
      "--caltemp-accent": "#67e8f9"
    }
  }
}
```

## Exemples livrés

- `examples/extensions/minimal-plugin`: écoute le cycle de vie de l’application.
- `examples/extensions/minimal-theme`: applique quelques variables CSS.
- `examples/extensions/youtube-theme`: thème rouge/noir/blanc inspiré de YouTube.
- `examples/extensions/french-football-gallery`: plugin qui ouvre une galerie interne de footballeurs français.
