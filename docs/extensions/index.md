# Extensions Caltemp

Caltemp expose un SDK v1 pour créer des thèmes et plugins sûrs. Les extensions sont distribuées via un registry GitHub officiel et installées depuis la marketplace intégrée.

## Lire dans l’ordre

1. [Quickstart](./quickstart.md)
2. [Créer un thème](./guides/themes.md)
3. [Créer un plugin](./guides/plugins.md)
4. [Référence du manifest](./reference/manifest.md)
5. [Référence SDK](./reference/sdk-api.md)

## Principes v1

- Les plugins sont des modules ESM exportant `activate(ctx)` et, optionnellement, `deactivate(ctx)`.
- Les plugins n’ont pas accès directement aux APIs Tauri, au système de fichiers ou au shell.
- Toutes les capacités sensibles passent par des permissions déclarées.
- La compatibilité SDK courante est `1.0.0`.
- La Rich Presence Discord est une intégration Caltemp native, pas une API plugin v1.
