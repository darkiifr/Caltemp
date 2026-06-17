# Publication GitHub

La marketplace lit un registry officiel:

```json
{
  "version": 1,
  "extensions": [
    {
      "id": "com.example.extension",
      "latestVersion": "1.0.0",
      "manifestUrl": "https://raw.githubusercontent.com/owner/repo/v1.0.0/manifest.json",
      "assetUrl": "https://github.com/owner/repo/releases/download/v1.0.0/index.js",
      "sha256": "hash optionnel du bundle plugin",
      "repository": "https://github.com/owner/repo",
      "publishedAt": "2026-06-17T00:00:00.000Z",
      "changelogUrl": "https://github.com/owner/repo/releases/tag/v1.0.0"
    }
  ]
}
```

Publiez les versions via tags ou releases GitHub, puis proposez l’ajout au registry officiel.
