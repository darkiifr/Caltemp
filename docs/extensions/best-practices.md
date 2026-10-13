# Bonnes pratiques

- Demandez la permission minimale et le moins de domaines possible dans `hosts`.
- Ne stockez pas de données personnelles inutiles dans `ctx.storage`.
- Utilisez un préfixe propre à votre plugin pour les ids de commande et les événements personnalisés.
- Gardez `activate` rapide ; chargez les données à l’ouverture d’une commande ou d’un panneau.
- Préférez `ctx.calendar.occurrences()` à `list()` pour tout ce qui concerne « ce qui se passe » une période donnée.
- Déclarez des `settings` plutôt que de coder des valeurs en dur.
- Documentez le changelog GitHub à chaque release.
- Testez dans `npm run tauri dev`, car l’installation et le stockage utilisent les plugins Tauri.
