# Référence manifest

Le manifest décrit l’extension et son contrat de compatibilité.

```json
{
  "id": "com.example.extension",
  "name": "Nom lisible",
  "type": "plugin",
  "version": "1.0.0",
  "sdkVersion": "1.1.0",
  "compatibility": { "caltemp": ">=6.0.0" },
  "description": "Description courte",
  "author": "Auteur",
  "license": "MIT",
  "repository": "https://github.com/owner/repo",
  "changelog": "https://github.com/owner/repo/releases/tag/v1.0.0",
  "entry": "index.js",
  "permissions": ["calendar:read"]
}
```

## Champs clés

- `id`: identifiant DNS inversé stable.
- `type`: `plugin` ou `theme`.
- `version`: semver.
- `sdkVersion`: version SDK ciblée.
- `compatibility.caltemp`: plage de compatibilité Caltemp.
- `entry`: requis pour les plugins.
- `theme.variables`: requis pour les thèmes.
