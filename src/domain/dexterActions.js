const SUPPORTED_ACTIONS = new Set(['create_event', 'update_event']);

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
      const validationError = action === 'create_event'
        ? validateCreateEvent(data)
        : validateUpdateEvent(data);
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
    .replace(/\{[\s\S]*"action"\s*:\s*"(create_event|update_event)"[\s\S]*\}/gi, '')
    .trim();
}
