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
- Discord RPC absent: vérifiez que le client Discord desktop est ouvert.
