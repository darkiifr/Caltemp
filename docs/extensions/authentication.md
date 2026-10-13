# Authentification

Le SDK d’extensions ne fournit pas d’authentification utilisateur.

Les extensions ne doivent pas demander ni stocker de secrets globaux Caltemp. Une extension qui appelle un service externe déclare `network` et ses `hosts`, et demande ses éventuelles clés via ses `settings` : elles restent dans son espace et ne sont pas partagées avec les autres extensions.

La Rich Presence Discord native utilise le client ID `1516083174931824720` et le transport IPC local du client Discord desktop. Elle ne donne pas accès au compte Discord aux plugins.
