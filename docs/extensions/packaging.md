# Packaging

## Plugin

Un plugin publié contient:

- `manifest.json`
- le fichier ESM indiqué par `entry`

Le bundle doit être autonome et ne pas importer les APIs Tauri.

## Thème

Un thème publié peut se limiter à `manifest.json`.

## Dossier local

Une extension installée localement doit respecter cette structure dans AppData:

```text
extensions/<extension-id>/
  manifest.json
  index.js
```

`index.js` est requis seulement pour les plugins. Au démarrage et au rafraîchissement de la section Extensions, Caltemp scanne `extensions/*/manifest.json`. Un dossier détecté sans entrée dans `extensions/extensions.json` apparaît désactivé par défaut.

## Exemples inclus

Les exemples du repo utilisent le même format de dossier dans `examples/extensions/<extension-id>/`. La section Extensions peut les installer en les copiant dans AppData.

## Validation

```bash
npm run extensions:validate
```

La validation vérifie les exemples livrés avec Caltemp et les contrats du manifest.
