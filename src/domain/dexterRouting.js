const WEB_INTENT_PATTERN = /\b(cherche|recherche|trouve)\b.*\b(internet|web|net|ligne|google)\b|\b(météo|meteo|actualité|actualités|actualite|actualites|news|infos|recette|définition|definition|traduis)\b|^(qui est|c'est quoi|qu'est-ce que|qu'est ce que|comment faire|pourquoi)\b/i;
const SETTINGS_INTENT_PATTERN = /\b(paramètres|parametres|config|réglages|reglages)\b.*\b(ia|dexter|openrouter|intelligence artificielle)\b/i;
const EXPORT_INTENT_PATTERN = /\bexport\b.*\b(png|pdf)\b/i;

export function classifyDexterIntent(text = '') {
  const normalized = String(text || '').trim();
  if (!normalized) return 'chat';
  if (WEB_INTENT_PATTERN.test(normalized)) return 'web_question';
  if (SETTINGS_INTENT_PATTERN.test(normalized)) return 'settings_action';
  if (EXPORT_INTENT_PATTERN.test(normalized)) return 'export_action';
  if (CALENDAR_INTENT_PATTERN.test(normalized)) {
    if (/(quand|date|prochain|prochaine|liste|affiche|montre|résume|resume|stat|répartition|repartition|catégories|categories|alerte|alertes|rappel|rappels)/i.test(normalized)) {
      return 'calendar_question';
    }
    return 'calendar_action';
  }
  return 'chat';
}

export function shouldUseLocalDexterCommand({ source = 'typed', text = '' } = {}) {
  if (source === 'quick-prompt') return true;
  return [
    'calendar_action',
    'calendar_question',
    'settings_action',
    'export_action',
  ].includes(classifyDexterIntent(text));
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
