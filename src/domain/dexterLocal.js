import { buildExamRevisionPlan, buildWeeklySummary } from './planning';
import { DEFAULT_CATEGORY_LEGEND, getNextOccurrence, inferCategory, normalizeEvent } from './events';

function nextDateForWord(word, now) {
  const date = new Date(now);
  if (word === 'demain') date.setDate(date.getDate() + 1);
  if (word === "aujourd'hui" || word === 'aujourdhui') return date;
  return date;
}

function parseTime(input) {
  const match = input.match(/(?:^|\s)(?:à|a)\s*(\d{1,2})(?:h|:)?(\d{2})?\b/i);
  if (!match) return { hours: 9, minutes: 0 };
  return {
    hours: Number(match[1]),
    minutes: Number(match[2] || 0),
  };
}

function titleFromCommand(input) {
  return input
    .replace(/^(ajoute|crée|cree|planifie|rappelle-moi|rappelle moi)\s+/i, '')
    .replace(/\b(demain|aujourd'hui|aujourdhui)\b/ig, '')
    .replace(/(?:à|a)\s*\d{1,2}(?:h|:)?\d{0,2}/ig, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getEventDate(event) {
  const value = event?.date || event?.start || event?.startDate || event?.startTime;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatEventDateForDexter(date) {
  return date.toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const searchStopWords = new Set([
  'c', 'est', 'quand', 'quel', 'quelle', 'prochain', 'prochaine', 'le', 'la', 'les', 'un', 'une',
  'de', 'du', 'des', 'd', 'a', 'à', 'au', 'aux', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes',
  'rappel', 'rappels', 'evenement', 'événement', 'evenements', 'événements',
  'match', 'matches', 'rencontre', 'rencontres', 'equipe', 'équipe', 'foot', 'football',
  'calendrier', 'date',
]);

function getSearchTerms(input) {
  return input
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, ' ')
    .split(/\s+/)
    .map(term => term.trim())
    .filter(term => term.length >= 3 && !searchStopWords.has(term));
}

function getEventSearchText(event) {
  return [
    event?.title,
    event?.description,
    event?.category,
    ...(Array.isArray(event?.tags) ? event.tags : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function findNextMatchingEvent(input, events, now) {
  const terms = getSearchTerms(input);
  const asksSportMatch = /\b(match|matches|foot|football|équipe|equipe)\b/i.test(input);
  const upcoming = events
    .map(event => ({ event, date: getNextOccurrence(event, now) || getEventDate(event), searchText: getEventSearchText(event) }))
    .filter(item => item.date && item.date >= now)
    .map((item) => {
      const termScore = terms.reduce((score, term) => score + (item.searchText.includes(term) ? 1 : 0), 0);
      const sportScore = asksSportMatch && (
        item.searchText.includes('sport')
        || item.searchText.includes('match')
        || item.searchText.includes('football')
        || item.searchText.includes('france')
        || item.searchText.includes('coupe')
        || item.searchText.includes('qualification')
      ) ? 1 : 0;
      return { ...item, score: termScore + sportScore };
    })
    .filter(item => item.score > 0 || (!terms.length && asksSportMatch))
    .sort((a, b) => a.date - b.date);
  return upcoming[0] || null;
}

function findReferencedEvent(referencedEventId, events, now) {
  if (!referencedEventId) return null;
  const event = events.find(item => item.id === referencedEventId);
  if (!event) return null;
  const date = getNextOccurrence(event, now) || getEventDate(event);
  return date ? { event, date, searchText: getEventSearchText(event), score: 1 } : null;
}

function getUpcomingEvents(events, now, limit = 10) {
  return events
    .map(event => ({ event, date: getNextOccurrence(event, now) || getEventDate(event) }))
    .filter(item => item.date && item.date >= now)
    .sort((a, b) => a.date - b.date)
    .slice(0, limit);
}

function formatReminderLine(item, categoryLegend) {
  const categoryLabel = categoryLegend[item.event.category]?.label || item.event.category || 'Sans catégorie';
  return `- **${item.event.title || 'Sans titre'}** : ${formatEventDateForDexter(item.date)} · ${categoryLabel} · ${item.event.reminder ? 'alerte activée' : 'sans alerte'}`;
}

function parseCategoryEdit(input, categoryLegend) {
  const normalized = input.toLocaleLowerCase('fr-FR');
  const match = normalized.match(/\b(?:categorie|catégorie)\s+([\p{Letter}\p{Number}-]+)/u)
    || normalized.match(/\b(?:en|dans|vers)\s+([\p{Letter}\p{Number}-]+)\s*$/u);
  const requested = match?.[1]?.trim();
  if (!requested) return null;
  const normalizedRequested = requested.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const entry = Object.entries(categoryLegend).find(([key, meta]) => {
    const keyNorm = key.toLocaleLowerCase('fr-FR').normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const labelNorm = String(meta?.label || '').toLocaleLowerCase('fr-FR').normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return keyNorm === normalizedRequested || labelNorm === normalizedRequested;
  });
  return entry?.[0] || requested;
}

function parseReminderEdit(normalized) {
  if (/(desactive|désactive|coupe|retire|enleve|enlève).*(alerte|rappel|notification)/.test(normalized)) return false;
  if (/(active|ajoute|met|mets).*(alerte|rappel|notification)/.test(normalized)) return true;
  return null;
}

function parseDateEdit(input, currentDate, now) {
  const normalized = input.toLocaleLowerCase('fr-FR');
  const date = new Date(currentDate);
  if (normalized.includes('demain')) {
    date.setFullYear(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  } else if (normalized.includes("aujourd'hui") || normalized.includes('aujourdhui')) {
    date.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
  }

  const time = input.match(/(?:^|\s)(?:à|a)\s*(\d{1,2})(?:h|:)?(\d{2})?\b/i);
  if (time) {
    date.setHours(Number(time[1]), Number(time[2] || 0), 0, 0);
  }

  return (normalized.includes('demain') || normalized.includes("aujourd'hui") || normalized.includes('aujourdhui') || time)
    ? date
    : null;
}

function buildUpdatedEventFromCommand(input, match, categoryLegend, now) {
  const normalized = input.toLocaleLowerCase('fr-FR');
  const updates = {};
  const reminder = parseReminderEdit(normalized);
  if (reminder !== null) updates.reminder = reminder;

  const category = parseCategoryEdit(input, categoryLegend);
  if (category) updates.category = category;

  const editedDate = parseDateEdit(input, match.date, now);
  if (editedDate) updates.date = editedDate.toISOString();

  if (Object.keys(updates).length === 0) return null;
  return normalizeEvent({
    ...match.event,
    ...updates,
    id: match.event.id,
    originalDate: updates.date ? undefined : match.event.originalDate,
  }, { categoryLegend });
}

export function parseFrenchEventCommand(input, now = new Date()) {
  if (!/^(ajoute|crée|cree|planifie|rappelle-moi|rappelle moi)\b/i.test(input.trim())) return null;
  const dayWord = input.toLocaleLowerCase('fr-FR').includes('demain') ? 'demain' : 'aujourd’hui';
  const { hours, minutes } = parseTime(input);
  const date = nextDateForWord(dayWord.replace('’', "'"), now);
  date.setHours(hours, minutes, 0, 0);
  const rawTitle = titleFromCommand(input) || 'Nouvel événement';
  const title = rawTitle.charAt(0).toLocaleUpperCase('fr-FR') + rawTitle.slice(1);

  return normalizeEvent({
    title,
    date: date.toISOString(),
    category: inferCategory(title),
    reminder: true,
  });
}

export function handleLocalDexterCommand(input, context = {}) {
  const normalized = input.trim().toLocaleLowerCase('fr-FR');
  const events = context.events || [];
  const now = context.now || new Date();
  const settings = context.settings || {};
  const categoryLegend = settings.categoryLegend || DEFAULT_CATEGORY_LEGEND;
  const referencedEventId = context.referencedEventId || null;

  const asksNextEvent = /(quand|date|prochain|prochaine|c'est quand|c est quand)/.test(normalized);
  if (asksNextEvent && events.length > 0) {
    const match = findNextMatchingEvent(input, events, now);
    if (match) {
      const categoryLabel = categoryLegend[match.event.category]?.label || match.event.category || 'Sans catégorie';
      const alertText = match.event.reminder ? 'alerte activée' : 'sans alerte';
      return {
        handled: true,
        type: 'next-event',
        message: `Le prochain rappel correspondant est **${match.event.title || 'Événement'}**, prévu le **${formatEventDateForDexter(match.date)}**.\n\nCatégorie : ${categoryLabel}. Statut : ${alertText}.`,
        data: match.event,
      };
    }
  }

  const asksReminderList = /(liste|affiche|montre|lis|voir|donne).*(rappel|rappels|événement|evenement|match|matches)/.test(normalized);
  if (asksReminderList) {
    const upcoming = getUpcomingEvents(events, now, 12);
    return {
      handled: true,
      type: 'reminder-list',
      message: upcoming.length
        ? `Voici les prochains rappels que je lis dans Caltemp :\n${upcoming.map(item => formatReminderLine(item, categoryLegend)).join('\n')}`
        : 'Je ne trouve aucun rappel futur dans Caltemp.',
      data: upcoming.map(item => item.event),
    };
  }

  const asksEditEvent = /(modifie|change|édite|edite|déplace|deplace|reporte|active|désactive|desactive|mets|met|passe)/.test(normalized)
    && (/(rappel|alerte|notification|catégorie|categorie|match|événement|evenement|cours|devoir|examen)/.test(normalized) || getSearchTerms(input).length > 0);
  if (asksEditEvent && events.length > 0) {
    const match = findNextMatchingEvent(input, events, now) || findReferencedEvent(referencedEventId, events, now);
    if (!match) {
      return {
        handled: true,
        type: 'edit-event-missing-target',
        message: 'Je n’ai pas trouvé de rappel correspondant à modifier. Donne-moi un mot du titre, par exemple “France”, “dentiste” ou “cours maths”.',
      };
    }

    const updatedEvent = buildUpdatedEventFromCommand(input, match, categoryLegend, now);
    if (!updatedEvent) {
      return {
        handled: true,
        type: 'edit-event-needs-detail',
        message: `J’ai trouvé **${match.event.title}**, mais je ne vois pas quoi changer. Tu peux demander par exemple : “active l’alerte”, “désactive l’alerte”, “mets en catégorie sport” ou “déplace à 21h”.`,
        data: match.event,
      };
    }

    return {
      handled: true,
      type: 'update-event',
      event: updatedEvent,
      message: `C’est modifié : **${updatedEvent.title}** est maintenant prévu le ${formatEventDateForDexter(new Date(updatedEvent.date))}, catégorie **${categoryLegend[updatedEvent.category]?.label || updatedEvent.category}**, ${updatedEvent.reminder ? 'alerte activée' : 'sans alerte'}.`,
    };
  }

  if (
    (normalized.includes('param') || normalized.includes('config'))
    && (normalized.includes('ia') || normalized.includes('intelligence artificielle') || normalized.includes('openrouter') || normalized.includes('dexter'))
  ) {
    return {
      handled: true,
      type: 'open-settings',
      tab: 'ai',
      message: 'J’ouvre les réglages Intelligence artificielle pour vérifier Dexter et Free Models Router.',
    };
  }

  const asksReminderStatus = normalized.includes('alerte')
    || normalized.includes('alertes')
    || (normalized.includes('rappel') && /(explique|etat|état|statut|mes|liste)/.test(normalized));
  if (asksReminderStatus) {
    const total = events.length;
    const enabled = events.filter(event => Boolean(event.reminder)).length;
    const disabled = Math.max(0, total - enabled);
    return {
      handled: true,
      type: 'reminder-status',
      message: total
        ? `${enabled} événement${enabled > 1 ? 's' : ''} avec alertes actives, ${disabled} sans alerte. Les nouveaux événements créés par Dexter peuvent inclure "reminder": true si tu demandes un rappel.`
        : 'Aucun événement enregistré pour analyser les alertes. Demande un rappel lors de la création pour activer une alerte.',
      data: { total, enabled, disabled },
    };
  }

  if (normalized.includes('catégories') || normalized.includes('categories') || normalized.includes('légende') || normalized.includes('legende')) {
    const lines = Object.entries(categoryLegend).map(([key, meta]) => `- ${meta.label || key} (${key}) : ${meta.color || '#60a5fa'}`);
    return {
      handled: true,
      type: 'categories',
      message: `Catégories disponibles :\n${lines.join('\n')}`,
      data: categoryLegend,
    };
  }

  if (normalized.includes('propose') && normalized.includes('catégorie')) {
    const title = input.replace(/propose.*catégorie\s*(pour)?/i, '').trim() || input;
    const category = inferCategory(title);
    const meta = categoryLegend[category] || categoryLegend.perso || DEFAULT_CATEGORY_LEGEND.perso;
    return {
      handled: true,
      type: 'category-suggestion',
      message: `Je classerais **${title}** dans **${meta.label || category}**.`,
      data: { category, meta },
    };
  }

  if (normalized.includes('stat') || normalized.includes('répartition') || normalized.includes('repartition')) {
    const counts = events.reduce((acc, event) => {
      const category = event.category || inferCategory(event.title);
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
    const lines = Object.entries(counts).map(([key, count]) => `- ${categoryLegend[key]?.label || key} : ${count}`);
    return {
      handled: true,
      type: 'category-stats',
      message: lines.length ? `Répartition actuelle :\n${lines.join('\n')}` : 'Aucun événement à analyser pour le moment.',
      data: counts,
    };
  }

  if (normalized.includes('import') && normalized.includes('ics')) {
    return {
      handled: true,
      type: 'open-settings',
      tab: 'general',
      message: 'J’ouvre les paramètres : lance l’import ICS, puis choisis la catégorie et les alertes avant validation.',
    };
  }

  if (normalized.includes('export') && normalized.includes('png')) {
    return {
      handled: true,
      type: 'export-png',
      message: 'Je prépare l’export PNG de la vue calendrier. Tu pourras choisir l’emplacement du fichier.',
    };
  }

  if (normalized.includes('export') && normalized.includes('pdf')) {
    return {
      handled: true,
      type: 'export-pdf',
      message: 'Je prépare l’export PDF de la vue calendrier. Tu pourras choisir l’emplacement du fichier.',
    };
  }

  if (normalized.includes('résume ma semaine') || normalized.includes('resume ma semaine')) {
    const summary = buildWeeklySummary(events, now);
    return {
      handled: true,
      type: 'summary',
      message: `Résumé de la semaine : ${summary.text}`,
      data: summary,
    };
  }

  if (normalized.includes('planning de révision') || normalized.includes('planning de revision')) {
    const plan = buildExamRevisionPlan(events);
    const lines = plan.slice(0, 8).map(item => `- ${item.offsetLabel} : ${item.title}`);
    return {
      handled: true,
      type: 'revision-plan',
      message: lines.length ? `Planning de révision proposé :\n${lines.join('\n')}` : "Aucun examen n'est enregistré pour générer un planning.",
      data: plan,
    };
  }

  const event = parseFrenchEventCommand(input, now);
  if (event) {
    return {
      handled: true,
      type: 'create-event',
      event,
      message: `C'est noté : **${event.title}** le ${new Date(event.date).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`,
    };
  }

  return { handled: false };
}
