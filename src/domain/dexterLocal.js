import { buildExamRevisionPlan, buildWeeklySummary } from './planning';
import { inferCategory, normalizeEvent } from './events';

function nextDateForWord(word, now) {
  const date = new Date(now);
  if (word === 'demain') date.setDate(date.getDate() + 1);
  if (word === "aujourd'hui" || word === 'aujourdhui') return date;
  return date;
}

function parseTime(input) {
  const match = input.match(/\b(?:à|a)\s*(\d{1,2})(?:h|:)?(\d{2})?\b/i);
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
