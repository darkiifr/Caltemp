export function shouldUseLocalDexterCommand({ source = 'typed' } = {}) {
  if (source === 'quick-prompt') return true;
  return false;
}

const CALENDAR_INTENT_PATTERN = /\b(crée|cree|créer|creer|ajoute|ajouter|planifie|rappel|rappelle|alerte|événement|evenement|anniversaire|cours|devoir|examen|réunion|reunion|modifie|change|déplace|deplace|quand|liste|montre|résume|resume|catégories|categories|paramètres|parametres|export|import|ics)\b/i;

export function isLikelyUnclearDexterMessage(text = '') {
  const normalized = text.trim();
  if (!normalized) return false;
  if (CALENDAR_INTENT_PATTERN.test(normalized)) return false;

  const words = normalized
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  return words.length > 0 && words.length <= 5;
}

export function normalizeUnclearDexterReply({ userText = '', assistantText = '' } = {}) {
  if (!isLikelyUnclearDexterMessage(userText)) return assistantText;
  if (!/\bTitre\s*:.*\bDate\s*:.*\bStatut\s*:/is.test(assistantText)) return assistantText;

  return "Je n’ai pas compris ta demande. Reformule en précisant si tu veux créer un événement, modifier un rappel ou poser une question.";
}
