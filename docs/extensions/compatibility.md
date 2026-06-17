# Compatibilité

Caltemp v6 expose le SDK `1.0.0`.

Règles:

- Une extension doit déclarer `sdkVersion`.
- Une extension doit déclarer `compatibility.caltemp`.
- Les APIs du SDK v1 restent stables pour les versions Caltemp compatibles.
- Les classes CSS internes de l’app ne sont pas une API publique.
