# Authentification

Le SDK d’extensions v1 ne fournit pas d’authentification utilisateur.

Les extensions ne doivent pas demander ni stocker de secrets globaux Caltemp. Si une future extension nécessite un service externe, elle devra déclarer ses permissions et utiliser un flux explicite côté utilisateur.

La Rich Presence Discord native utilise le client ID `1516083174931824720` et le transport IPC local du client Discord desktop. Elle ne donne pas accès au compte Discord aux plugins.
