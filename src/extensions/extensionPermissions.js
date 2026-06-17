import { EXTENSION_PERMISSIONS } from './constants.js';

export function isKnownPermission(permission) {
  return EXTENSION_PERMISSIONS.includes(permission);
}

export function assertPermission(grantedPermissions = [], requiredPermission, extensionId = 'unknown') {
  if (!isKnownPermission(requiredPermission)) {
    throw new Error(`Permission inconnue: ${requiredPermission}`);
  }

  if (!grantedPermissions.includes(requiredPermission)) {
    throw new Error(
      `L'extension ${extensionId} nécessite la permission ${requiredPermission}.`,
    );
  }
}

export function normalizePermissions(permissions = []) {
  if (!Array.isArray(permissions)) {
    throw new Error('Le champ permissions doit être une liste.');
  }

  const uniquePermissions = [...new Set(permissions)];
  const unknownPermission = uniquePermissions.find((permission) => !isKnownPermission(permission));

  if (unknownPermission) {
    throw new Error(`Permission non supportée: ${unknownPermission}`);
  }

  return uniquePermissions;
}
