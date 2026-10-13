# Bonnes pratiques

- Demandez la permission minimale.
- Ne stockez pas de données personnelles inutiles.
- Gardez les plugins courts et explicites.
- Nettoyez vos listeners dans `deactivate` ou via la fonction retournée par `activate`.
- Documentez le changelog GitHub à chaque release.
- Testez dans `pnpm tauri dev`, car la marketplace et le stockage utilisent les plugins Tauri.
