# Packaging

## Plugin

Un plugin publié contient:

- `manifest.json`
- le fichier ESM indiqué par `entry`

Le bundle doit être autonome et ne pas importer les APIs Tauri.

## Thème

Un thème publié peut se limiter à `manifest.json`.

## Validation

```bash
npm run extensions:validate
```

La validation vérifie les exemples livrés avec Caltemp et les contrats du manifest.
