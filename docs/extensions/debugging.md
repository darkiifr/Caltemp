# Debugging

## Logs

Utilisez `ctx.logger`:

```js
ctx.logger.info('Action terminée');
ctx.logger.warn('Configuration manquante');
```

Les erreurs d’activation sont collectées par le gestionnaire d’extensions et affichables côté application.

## Problèmes fréquents

- Permission manquante: ajoutez la permission exacte au manifest.
- Manifest invalide: lancez `npm run extensions:validate`.
- Bundle inaccessible: vérifiez l’URL GitHub HTTPS et la release.
- Extension absente de l’écran Extensions: vérifiez que le dossier contient `manifest.json` dans `extensions/<extension-id>/`.
- Extension détectée mais inactive: activez-la explicitement; Caltemp n’exécute pas automatiquement un dossier local non indexé.
- Thème remplacé: un seul thème peut être actif à la fois en v1.
- Discord RPC absent: vérifiez que le client Discord desktop est ouvert.
