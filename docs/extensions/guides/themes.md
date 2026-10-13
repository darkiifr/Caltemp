# Guide thèmes

Un thème est un `manifest.json` sans JavaScript.

```json
{
  "id": "com.example.cyan",
  "name": "Cyan",
  "version": "1.0.0",
  "theme": {
    "colors": {
      "accent": "#67e8f9",
      "panel": "rgba(8, 47, 73, 0.55)"
    }
  }
}
```

- `theme.colors` est un raccourci : `accent` devient la variable CSS `--caltemp-accent`.
- `theme.variables` accepte n’importe quelle variable CSS commençant par `--` ; les deux peuvent être combinés.
- `type` est déduit de la présence de `theme`.
- Un seul thème est actif à la fois ; il s’applique et se retire immédiatement.

## Bonnes pratiques

- Gardez un contraste lisible sur les fonds sombres.
- Préférez quelques variables cohérentes à une palette trop large.
- Ne dépendez pas de classes internes Tailwind : elles peuvent changer.

## Exemples

`examples/extensions/minimal-theme` et `examples/extensions/youtube-theme`.
