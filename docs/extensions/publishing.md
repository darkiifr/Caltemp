# Publication GitHub

La marketplace lit un registry officiel (`extensions/registry.json`) :

```json
{
  "version": 1,
  "extensions": [
    {
      "id": "com.example.meteo",
      "name": "Météo",
      "description": "La météo du jour dans la palette.",
      "latestVersion": "1.0.0",
      "assetUrl": "https://github.com/owner/repo/releases/download/v1.0.0/meteo.js",
      "sha256": "empreinte SHA-256 du fichier",
      "repository": "https://github.com/owner/repo",
      "publishedAt": "2026-06-17T00:00:00.000Z",
      "changelogUrl": "https://github.com/owner/repo/releases/tag/v1.0.0"
    }
  ]
}
```

- Plugin en un fichier : `assetUrl` seul.
- Plugin au format dossier : `manifestUrl` + `assetUrl`.
- Thème : `manifestUrl` seul.
- `sha256` est vérifié s’il est fourni ; `changelogUrl`, `name` et `description` sont optionnels.
- L’`id` du registry doit correspondre à celui du paquet.

Publiez les versions via tags ou releases GitHub, puis proposez l’ajout au registry officiel. Le code exécuté par `import()` dynamique vers une URL distante est interdit dans les plugins publiés.
