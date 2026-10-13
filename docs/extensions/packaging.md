# Packaging

## Plugin

Au choix :

- **un fichier** `.js` avec un en-tête `@caltemp` (recommandé) ;
- **un dossier** : `manifest.json` + le fichier indiqué par `entry` (`index.js` par défaut).

Le module doit être autonome : pas d’`import`, pas d’APIs Tauri. Si vous utilisez des dépendances, regroupez-les en un seul fichier ESM (esbuild, Rollup…) en gardant l’en-tête en tête du fichier (`--legal-comments=inline` pour esbuild).

## Thème

Un `manifest.json` suffit.

## Installation locale

Paramètres › Extensions › **Installer un fichier**, ou glisser-déposer sur la page : un `.js`, un `manifest.json` de thème, ou un `manifest.json` avec son fichier `.js`.

Caltemp range l’extension dans AppData :

```text
extensions/<extension-id>/
  manifest.json
  index.js        (plugins)
  storage.json    (données ctx.storage, créé au besoin)
```

Un dossier copié à la main dans `extensions/` est détecté au prochain rechargement et apparaît désactivé : Caltemp n’exécute jamais un plugin que vous n’avez pas activé.

## Validation

```bash
npm run extensions:validate                     # les exemples du repo
npm run extensions:validate -- mon-plugin.js    # votre plugin
npm run extensions:validate -- ./mon-theme      # un dossier
```
