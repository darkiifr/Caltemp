# Caltemp

Caltemp est une application de calendrier desktop moderne construite avec React, Vite et Tauri. La v6.0.0 consolide l'expérience locale : calendrier, rappels, imports ICS, notes, assistant Dexter et réglages de personnalisation dans une application qui garde les données sur la machine de l'utilisateur.

## Caltemp v6 en bref

- Calendrier local avec vues année, mois, semaine et jour.
- Création et édition d'événements avec récurrence, rappel et description.
- Import/export ICS pour récupérer ou partager rapidement des calendriers.
- Notifications locales avec toast applicatif et notification native.
- Assistant Dexter pour créer des événements et organiser les informations.
- Notes intégrées avec éditeur riche, pièces jointes et export Markdown.
- Personnalisation du thème sombre, du fond Unsplash et des sons.
- Écosystème d'extensions : SDK thèmes/plugins, marketplace GitHub et documentation développeur versionnée.
- Base sécurité v6 : lockfile npm, audits automatisés, Dependabot npm/Cargo/GitHub Actions.

## Développement

```bash
npm install
npm run dev
npm run build
npm run lint
```

Pour tester le shell desktop :

```bash
npm run tauri dev
```

Pour vérifier la partie Rust :

```bash
cd src-tauri
cargo check
```

## Extensions et marketplace

Caltemp inclut un SDK v1 pour créer des thèmes déclaratifs et des plugins JavaScript sûrs. La marketplace s'appuie sur un registry GitHub officiel pour découvrir, installer, mettre à jour et supprimer les extensions.

- Documentation développeur : [docs/extensions/index.md](./docs/extensions/index.md)
- Quickstart : [docs/extensions/quickstart.md](./docs/extensions/quickstart.md)
- Exemples : [examples/extensions](./examples/extensions)
- Registry officiel : [extensions/registry.json](./extensions/registry.json)

Valider les manifests d'exemple :

```bash
npm run extensions:validate
```

## Sécurité

La branche v6 ajoute :

- `package-lock.json` pour des installations reproductibles.
- `.github/dependabot.yml` pour surveiller les dépendances npm, Cargo et GitHub Actions.
- `.github/workflows/security-audit.yml` pour lancer les audits npm/Rust, le lint et le build.

## Confidentialité

Caltemp ne collecte, ne transmet et ne stocke aucune donnée personnelle sur des serveurs externes. Les données de calendrier et de notes restent locales, sauf action explicite de l'utilisateur ou configuration volontaire d'un service externe. Pour plus de détails, consultez [PRIVACY.md](./PRIVACY.md).
