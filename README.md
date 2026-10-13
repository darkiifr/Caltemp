# Caltemp

Caltemp est une application de calendrier desktop moderne construite avec React, Vite et Tauri. La v6.0.0 consolide l'expérience locale : calendrier, rappels, imports ICS, notes, assistant Dexter et réglages de personnalisation dans une application qui garde les données sur la machine de l'utilisateur.

## Caltemp v6 en bref

- Calendrier local avec vues année, mois, semaine et jour.
- Création et édition d'événements avec récurrence, rappel et description.
- Import/export ICS pour récupérer ou partager rapidement des calendriers.
- Abonnements ICS synchronisés en continu (jusqu'à chaque minute) : requêtes conditionnelles HTTP, fuseaux TZID, récurrences complexes (COUNT/UNTIL/EXDATE, occurrences déplacées), liens `webcal://`, et modifications locales préservées.
- Carte des rappels : vue « Carte » qui place les événements ayant un lieu (adresse, coordonnées, lien de carte ou épingle posée dans l'éditeur), moteur de carte maison sans dépendance, fond OpenStreetMap gratuit (sans clé API).
- Notifications locales avec toast applicatif et notification native.
- Assistant Dexter hors ligne (petit modèle local exécuté par llama.cpp, installé à la demande) : il crée, modifie et retrouve les événements, propose des créneaux, change de vue et pilote les réglages.
- Notes intégrées avec éditeur riche, pièces jointes et export Markdown.
- Personnalisation du thème sombre, du fond Unsplash et des sons.
- Écosystème d'extensions : SDK thèmes/plugins, marketplace GitHub et documentation développeur versionnée.
- Base sécurité v6 : lockfile pnpm, audits automatisés, Dependabot npm/Cargo/GitHub Actions.

## Développement

Caltemp utilise [pnpm](https://pnpm.io). `corepack enable` (fourni avec Node.js) installe la version fixée dans `package.json`.

```bash
corepack enable
pnpm install
pnpm dev
pnpm build
pnpm lint
```

Pour tester le shell desktop :

```bash
pnpm tauri dev
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
pnpm extensions:validate
```

## Sécurité

La branche v6 ajoute :

- `pnpm-lock.yaml` pour des installations reproductibles (version de pnpm fixée par `packageManager` dans `package.json`).
- `.github/dependabot.yml` pour surveiller les dépendances JavaScript (écosystème npm de Dependabot, compatible pnpm), Cargo et GitHub Actions.
- `.github/workflows/security-audit.yml` pour lancer les audits pnpm/Rust, le lint et le build.

## Confidentialité

Caltemp ne collecte, ne transmet et ne stocke aucune donnée personnelle sur des serveurs externes. Les données de calendrier et de notes restent locales, sauf action explicite de l'utilisateur ou configuration volontaire d'un service externe. Pour plus de détails, consultez [PRIVACY.md](./PRIVACY.md).
