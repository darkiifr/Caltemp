# Debugging

## Logs

```js
ctx.logger.info('Action terminée', { count });
ctx.logger.warn('Configuration manquante');
```

Les messages apparaissent dans la console de Caltemp (`npm run tauri dev`, puis outils de développement), préfixés par l’id du plugin.

## Statut

Paramètres › Extensions affiche pour chaque extension **Actif**, **Désactivé** ou **Erreur**, avec le message d’erreur (activation échouée, permission manquante, plugin arrêté…). Un plugin en erreur n’affecte pas les autres.

## Boucle de développement

1. Installez votre fichier une fois.
2. Modifiez `AppData/extensions/<id>/index.js` (ou réinstallez le fichier).
3. Cliquez sur **Recharger** : le plugin redémarre, ses réglages et son stockage sont conservés.

## Problèmes fréquents

- « nécessite la permission … » : ajoutez la permission à l’en-tête ou au manifest, puis réinstallez.
- « Domaine non déclaré dans hosts » : ajoutez le domaine à `hosts`.
- « n’a pas terminé activate() à temps » : `activate` doit se terminer en moins de 10 s ; lancez les tâches longues sans les attendre.
- `fetch is not defined`, `window is not defined` : normal dans le bac à sable, utilisez `ctx.http.fetch` et `ctx.ui`.
- « Ce fichier ne contient pas d’en-tête » : l’en-tête `/** @caltemp … */` doit être tout en haut du fichier.
- Thème remplacé : un seul thème peut être actif à la fois.
- Discord RPC absent : vérifiez que le client Discord desktop est ouvert.
