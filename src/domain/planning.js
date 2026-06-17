import { getOccurrencesOnDate, getWeekRange, normalizeEvent } from './events';

const REVISION_OFFSETS = [
  { days: 30, offsetLabel: 'J-30', label: 'Lancer les fiches de révision' },
  { days: 7, offsetLabel: 'J-7', label: 'Revoir les points fragiles' },
  { days: 1, offsetLabel: 'J-1', label: 'Dernier rappel léger' },
];

export function buildExamRevisionPlan(events = []) {
  return events
    .map(event => normalizeEvent(event))
    .filter(event => event.category === 'examen')
    .flatMap(event => REVISION_OFFSETS.map(offset => {
      const date = new Date(event.date);
      date.setDate(date.getDate() - offset.days);
      return {
        id: `${event.id}-${offset.offsetLabel}`,
        examId: event.id,
        title: `${offset.label} - ${event.title}`,
        date: date.toISOString(),
        offsetLabel: offset.offsetLabel,
        category: 'devoir',
        color: '#f59e0b',
        source: 'revision-plan',
      };
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function buildWeeklySummary(events = [], now = new Date()) {
  const { start, end } = getWeekRange(now);
  const byCategory = {};
  const occurrences = [];

  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    occurrences.push(...getOccurrencesOnDate(events, new Date(cursor)));
  }

  for (const event of occurrences) {
    const category = event.category || 'perso';
    byCategory[category] = (byCategory[category] || 0) + 1;
  }

  const parts = Object.entries(byCategory).map(([category, count]) => `${count} ${category}`);
  return {
    start,
    end,
    total: occurrences.length,
    byCategory,
    events: occurrences,
    text: `Cette semaine contient ${occurrences.length} événements${parts.length ? ` : ${parts.join(', ')}` : ''}.`,
  };
}

export function suggestFromHabits(events = []) {
  const grouped = new Map();
  for (const rawEvent of events) {
    const event = normalizeEvent(rawEvent);
    const date = new Date(event.date);
    const key = `${event.title.toLocaleLowerCase('fr-FR')}|${date.getDay()}|${date.getHours()}|${event.category}`;
    const items = grouped.get(key) || [];
    items.push(event);
    grouped.set(key, items);
  }

  return Array.from(grouped.values())
    .filter(items => items.length >= 3)
    .map(items => ({
      title: `Créer une routine "${items[0].title}"`,
      category: items[0].category,
      reason: `Détecté comme habitude locale (${items.length} occurrences similaires).`,
      prototype: items[0],
    }));
}

export function buildStats(events = [], referenceDate = new Date()) {
  const { start, end } = getWeekRange(referenceDate);
  const days = [];
  const byCategory = {};

  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const dayEvents = getOccurrencesOnDate(events, new Date(cursor));
    days.push({
      date: new Date(cursor).toISOString(),
      count: dayEvents.length,
      load: dayEvents.reduce((sum, event) => sum + (event.durationMinutes || 60), 0),
    });

    for (const event of dayEvents) {
      byCategory[event.category] = (byCategory[event.category] || 0) + 1;
    }
  }

  return { days, byCategory };
}
