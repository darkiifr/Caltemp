export const DEFAULT_CATEGORY_LEGEND = {
  cours: { label: 'Cours', color: '#38bdf8' },
  devoir: { label: 'Devoir', color: '#f59e0b' },
  examen: { label: 'Examen', color: '#ef4444' },
  perso: { label: 'Perso', color: '#22c55e' },
  dev: { label: 'Dev', color: '#a78bfa' },
};

import { normalizeIcsSources } from './icsSources';
import { normalizeAiUsageStats } from './aiUsage';

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  notifications: true,
  aiEnabled: true,
  fontSize: 16,
  dateFormat: 'weekday-short',
  notificationMode: 'normal',
  categoryLegend: DEFAULT_CATEGORY_LEGEND,
  calendarViews: ['year', 'month', 'week', 'day', 'agenda', 'focus', 'stats'],
  shortcuts: {
    commandPalette: 'Ctrl+K',
    snoozeReminder: 'S',
    dismissToast: 'Escape',
  },
  routines: [],
  icsSources: normalizeIcsSources([]),
  themes: [],
  activeThemeId: 'default',
  portableDataDir: '',
  soundConfig: {
    enabled: true,
    volume: 0.7,
    profile: 'calm',
    bubble: null,
    notification: null,
    ringtone: null,
  },
  aiUsageStats: normalizeAiUsageStats(),
};

const CATEGORY_KEYWORDS = [
  ['examen', ['examen', 'exam', 'contrôle', 'controle', 'partiel']],
  ['devoir', ['devoir', 'dm', 'rendu', 'à rendre', 'a rendre']],
  ['cours', ['cours', 'classe', 'td', 'tp']],
  ['dev', ['dev', 'code', 'debug', 'release', 'sprint']],
  ['perso', ['perso', 'sport', 'rdv', 'rendez-vous']],
];

export function inferCategory(title = '', fallback = 'perso') {
  const normalized = title.toLocaleLowerCase('fr-FR');
  const match = CATEGORY_KEYWORDS.find(([, words]) => words.some(word => normalized.includes(word)));
  return match?.[0] || fallback;
}

export function normalizeSettings(settings = {}) {
  const safeSettings = { ...settings };
  delete safeSettings.aiApiKey;
  delete safeSettings.aiModel;
  delete safeSettings.customModels;
  const mergedLegend = {
    ...DEFAULT_CATEGORY_LEGEND,
    ...(safeSettings.categoryLegend || {}),
  };

  return {
    ...DEFAULT_SETTINGS,
    ...safeSettings,
    categoryLegend: mergedLegend,
    shortcuts: {
      ...DEFAULT_SETTINGS.shortcuts,
      ...(safeSettings.shortcuts || {}),
    },
    calendarViews: safeSettings.calendarViews || DEFAULT_SETTINGS.calendarViews,
    routines: safeSettings.routines || [],
    icsSources: normalizeIcsSources(safeSettings.icsSources || []),
    themes: safeSettings.themes || [],
    aiUsageStats: normalizeAiUsageStats(safeSettings.aiUsageStats),
    soundConfig: {
      ...DEFAULT_SETTINGS.soundConfig,
      ...(safeSettings.soundConfig || {}),
    },
  };
}

export function normalizeEvent(event = {}, settings = {}) {
  const legend = settings.categoryLegend || DEFAULT_CATEGORY_LEGEND;
  const category = event.category || inferCategory(event.title);
  const legendEntry = legend[category] || DEFAULT_CATEGORY_LEGEND.perso;
  const tags = Array.isArray(event.tags) ? event.tags : [category].filter(Boolean);

  return {
    id: event.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    title: event.title || 'Sans titre',
    date: event.date || new Date().toISOString(),
    description: event.description || '',
    reminder: Boolean(event.reminder),
    recurrence: event.recurrence || 'none',
    notifiedOccurrences: event.notifiedOccurrences || {},
    reminderSnoozes: event.reminderSnoozes || {},
    category,
    color: event.color || legendEntry.color,
    tags,
    durationMinutes: Number(event.durationMinutes || event.duration || 60),
    todos: Array.isArray(event.todos) ? event.todos : [],
    source: event.source || 'local',
    examMeta: event.examMeta || null,
    routineId: event.routineId || null,
    originalDate: event.originalDate,
    externalId: event.externalId || event.uid || null,
  };
}

export function normalizeEvents(events = [], settings = {}) {
  return Array.isArray(events) ? events.map(event => normalizeEvent(event, settings)) : [];
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getOccurrencesOnDate(events, targetDate) {
  const targetY = targetDate.getFullYear();
  const targetM = targetDate.getMonth();
  const targetD = targetDate.getDate();
  const targetStartOfDay = new Date(targetY, targetM, targetD).getTime();
  const result = [];

  for (const rawEvent of events || []) {
    const event = normalizeEvent(rawEvent);
    const evDate = new Date(event.originalDate || event.date);
    const evStartOfDay = new Date(evDate.getFullYear(), evDate.getMonth(), evDate.getDate()).getTime();

    if (targetStartOfDay < evStartOfDay) continue;

    let occurs = false;
    if (!event.recurrence || event.recurrence === 'none') {
      occurs = targetStartOfDay === evStartOfDay;
    } else if (event.recurrence === 'daily') {
      occurs = true;
    } else if (event.recurrence === 'weekly') {
      const diffDays = Math.round((targetStartOfDay - evStartOfDay) / 86400000);
      occurs = diffDays % 7 === 0;
    } else if (event.recurrence === 'monthly') {
      const daysInTargetMonth = new Date(targetY, targetM + 1, 0).getDate();
      const targetDay = Math.min(evDate.getDate(), daysInTargetMonth);
      occurs = targetD === targetDay;
    } else if (event.recurrence === 'yearly') {
      const isLeapYear = new Date(targetY, 1, 29).getDate() === 29;
      const targetDay = evDate.getMonth() === 1 && evDate.getDate() === 29 && !isLeapYear ? 28 : evDate.getDate();
      occurs = targetM === evDate.getMonth() && targetD === targetDay;
    }

    if (occurs) {
      const occurrenceDate = new Date(targetDate);
      occurrenceDate.setHours(evDate.getHours(), evDate.getMinutes(), evDate.getSeconds(), 0);
      result.push({
        ...event,
        date: occurrenceDate.toISOString(),
        originalDate: event.originalDate || event.date,
        occurrenceKey: `${event.id}:${occurrenceDate.getTime()}`,
      });
    }
  }

  return result.sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function getNextOccurrence(event, now = new Date()) {
  const normalized = normalizeEvent(event);
  const evDate = new Date(normalized.originalDate || normalized.date);
  if (evDate >= now) return evDate;
  if (!normalized.recurrence || normalized.recurrence === 'none') return null;

  const candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    evDate.getHours(),
    evDate.getMinutes(),
    evDate.getSeconds(),
  );
  if (candidate < now) candidate.setDate(candidate.getDate() + 1);

  for (let guard = 0; guard < 370; guard += 1) {
    let isValid = false;
    if (normalized.recurrence === 'daily') {
      isValid = true;
    } else if (normalized.recurrence === 'weekly') {
      isValid = candidate.getDay() === evDate.getDay();
    } else if (normalized.recurrence === 'monthly') {
      const daysInMonth = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
      isValid = candidate.getDate() === Math.min(evDate.getDate(), daysInMonth);
    } else if (normalized.recurrence === 'yearly') {
      const leap = new Date(candidate.getFullYear(), 1, 29).getDate() === 29;
      const day = evDate.getMonth() === 1 && evDate.getDate() === 29 && !leap ? 28 : evDate.getDate();
      isValid = candidate.getMonth() === evDate.getMonth() && candidate.getDate() === day;
    }

    if (isValid) return candidate;
    candidate.setDate(candidate.getDate() + 1);
  }

  return null;
}

export function formatEventDate(value, settings = {}, options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  const format = settings.dateFormat || 'weekday-short';
  const includeTime = options.includeTime !== false;
  const base = format === 'numeric'
    ? { day: '2-digit', month: '2-digit', year: 'numeric' }
    : format === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : { weekday: 'short', day: 'numeric', month: 'short' };

  return date.toLocaleString('fr-FR', {
    ...base,
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function getWeekRange(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  start.setDate(start.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}
