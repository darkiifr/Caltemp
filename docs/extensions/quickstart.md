# Quickstart minimal

## Plugin

Créez `manifest.json` :

```json
{
  "id": "com.example.hello",
  "name": "Hello Caltemp",
  "type": "plugin",
  "version": "1.0.0",
  "sdkVersion": "1.0.0",
  "compatibility": { "caltemp": ">=6.0.0" },
  "entry": "index.js",
  "permissions": []
}
```

Créez `index.js` :

```js
export function activate(ctx) {
  return ctx.events.on('app:ready', () => {
    ctx.logger.info('Extension chargée');
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
  "sdkVersion": "1.0.0",
  "compatibility": { "caltemp": ">=6.0.0" },
  "permissions": [],
  "theme": {
    "variables": {
      "--caltemp-accent": "#67e8f9"
    }
  }
}
```
