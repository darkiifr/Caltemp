# Guide thèmes

Un thème est un `manifest.json` sans JavaScript.

```json
{
  "id": "com.example.nord",
  "name": "Nord",
  "version": "1.0.0",
  "theme": {
    "colors": {
      "accent": "#5e81ac",
      "text": "#eceff4",
      "background": "#2e3440",
      "panel": "#3b4252",
      "panel-strong": "#434c5e"
    }
  }
}
```

`type` est déduit de la présence de `theme`. Un seul thème est actif à la fois ; il s’applique et se retire immédiatement.

## Couleurs

`theme.colors.<nom>` définit la variable CSS `--caltemp-<nom>`. Caltemp utilise ces jetons :

| Jeton | Rôle |
| --- | --- |
| `accent` | Couleur principale : boutons, jour courant, sélection, liens, focus. Les nuances (survol, fonds teintés, boutons pleins) en sont dérivées. |
| `text` | Couleur du texte (et des voiles blancs translucides). |
| `background` | Fond de la fenêtre et des grands écrans (Dexter, canevas). |
| `panel` | Fonds des panneaux, modales, menus, barre de titre. |
| `panel-strong` | Surfaces surélevées : cartes, champs, éléments actifs. |

Un jeton absent garde la couleur par défaut de Caltemp : un thème peut ne définir que `accent`. Sans thème, l’accent suit l’image de fond si elle est activée ; l’accent d’un thème la remplace.

`theme.variables` accepte en plus n’importe quelle variable CSS commençant par `--` ; les deux blocs peuvent être combinés.

## Lisibilité

- Le texte des boutons et badges reste blanc : choisissez un accent de ton moyen (contraste d’au moins 3:1 avec le blanc, comme le bleu par défaut). Les boutons pleins utilisent une version assombrie de l’accent.
- Gardez `panel` et `panel-strong` proches de `background`, un peu plus clairs.
- Les thèmes sont sombres : un `background` clair rendrait le texte illisible.
- Ne dépendez pas des classes internes Tailwind : elles peuvent changer.

## Exemples

`examples/extensions/` contient `nord-theme`, `sunset-theme`, `forest-theme`, `lavender-theme`, `high-contrast-theme`, `youtube-theme` et `minimal-theme` (accent seul).
