# Guide thèmes

Les thèmes Caltemp v1 sont déclaratifs. Ils modifient l’apparence via `theme.variables`, sans JavaScript.

## Structure

- `manifest.json` avec `type: "theme"`.
- `theme.variables` contient des variables CSS dont le nom commence par `--`.
- Le thème est appliqué immédiatement quand il est activé depuis la marketplace.

## Bonnes pratiques

- Gardez un contraste lisible sur les fonds sombres.
- Préférez quelques variables cohérentes à une palette trop large.
- Ne dépendez pas de classes internes Tailwind: elles peuvent changer.

## Exemple

`examples/extensions/youtube-theme` montre un thème déclaratif rouge, noir et blanc inspiré de YouTube.
