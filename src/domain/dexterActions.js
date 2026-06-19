const SUPPORTED_ACTIONS = new Set(['create_event', 'update_event', 'search_web']);

function extractJsonCandidates(text = '') {
  const candidates = [];
  const fenced = text.matchAll(/```json\s*([\s\S]*?)\s*```/gi);
  for (const match of fenced) {
    if (match[1]) candidates.push(match[1].trim());
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }

  return [...new Set(candidates)];
}

function validateCreateEvent(data) {
  if (!data || typeof data !== 'object') return 'Données d’événement invalides.';
  if (typeof data.title !== 'string' || !data.title.trim()) return 'Titre d’événement manquant.';
  if (typeof data.date !== 'string' || Number.isNaN(new Date(data.date).getTime())) {
    return 'Date d’événement invalide.';
  }
  return null;
}

function validateUpdateEvent(data) {
  if (!data || typeof data !== 'object') return 'Données de modification invalides.';
  if (typeof data.id !== 'string' || !data.id.trim()) return 'Identifiant d’événement manquant.';
  if (data.date && (typeof data.date !== 'string' || Number.isNaN(new Date(data.date).getTime()))) {
    return 'Date d’événement invalide.';
  }
  return null;
}

function validateSearchWeb(data) {
  if (!data || typeof data !== 'object') return 'Données de recherche invalides.';
  if (typeof data.query !== 'string' || !data.query.trim()) return 'Requête de recherche manquante.';
  return null;
}

export function parseDexterAction(text = '') {
  const candidates = extractJsonCandidates(text);
  if (candidates.length === 0) {
    return { ok: false, error: 'Aucune action JSON trouvée.' };
  }

  let parseError = null;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const action = parsed.action;
      if (!SUPPORTED_ACTIONS.has(action)) {
        return { ok: false, error: `Action non prise en charge : ${action || 'inconnue'}.` };
      }

      const data = parsed.data || parsed;
      let validationError = null;
      if (action === 'create_event') validationError = validateCreateEvent(data);
      else if (action === 'update_event') validationError = validateUpdateEvent(data);
      else if (action === 'search_web') validationError = validateSearchWeb(data);

      if (validationError) return { ok: false, error: validationError };

      return { ok: true, action, data };
    } catch (error) {
      parseError = error;
    }
  }

  return {
    ok: false,
    error: `JSON Dexter invalide : ${parseError?.message || 'syntaxe incorrecte'}.`,
  };
}

export function removeDexterActionJson(text = '') {
  return text
    .replace(/```json\s*[\s\S]*?\s*```/gi, '')
    .replace(/\{[\s\S]*"action"\s*:\s*"(create_event|update_event|search_web)"[\s\S]*\}/gi, '')
    .trim();
}

export function sanitizeDexterReply(text = '', settings = {}) {
  const categoryLegend = settings.categoryLegend || {};
  const categoryKeys = new Set(Object.keys(categoryLegend));
  const categoryLabels = new Set(
    Object.values(categoryLegend)
      .map(meta => String(meta?.label || '').toLocaleLowerCase('fr-FR'))
      .filter(Boolean)
  );

  const withoutActions = removeDexterActionJson(text)
    .replace(/\b(create_event|update_event|search_web|input_audio|d_update)\b/gi, '')
    .replace(/#[0-9a-f]{6}\b/gi, '')
    .replace(/\bJSON\b/gi, '')
    .replace(/"?\b(action|data|reminder|category|color|tags|durationMinutes)\b"?\s*:?\s*(true|false)?/gi, '')
    .replace(/`([^`]+)`/g, '$1');

  const lines = withoutActions
    .split('\n')
    .map(line => line.replace(/\s{2,}/g, ' ').trimEnd())
    .filter((line) => {
      const normalized = line.trim().toLocaleLowerCase('fr-FR');
      if (!normalized) return true;
      if (/^[-*]\s*(couleur|tags?)\s*:/i.test(line)) return false;
      if (/\bfournirai\b.*\b(action|mise à jour|mise a jour)\b/i.test(line)) return false;
      const categoryLine = line.match(/^[-*]\s*Catégorie\s*:\s*(.+)$/i);
      if (!categoryLine) return true;
      const value = categoryLine[1].trim().toLocaleLowerCase('fr-FR');
      return !categoryKeys.has(value) || categoryLabels.has(value);
    });

  return lines
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
