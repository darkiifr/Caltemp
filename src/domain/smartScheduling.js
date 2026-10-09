import { getOccurrencesOnDate, normalizeEventCached } from './events';

const MINUTES_PER_DAY = 24 * 60;
const BIN_MINUTES = 15;
const BIN_COUNT = MINUTES_PER_DAY / BIN_MINUTES;
const HABIT_SIGMA_MINUTES = 45;
const HABIT_HALF_LIFE_DAYS = 120;
const MIN_USEFUL_GAP_MINUTES = 30;

function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function eventDuration(event) {
  const value = Number(event.durationMinutes);
  return Number.isFinite(value) && value > 0 ? value : 60;
}

function blocksTime(event) {
  return !event.allDay && String(event.transparency || '').toUpperCase() !== 'TRANSPARENT';
}

function tokenize(title = '') {
  return String(title)
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 2);
}

/**
 * Busy intervals (in minutes since midnight) for a given day, merged and sorted.
 */
export function getBusyIntervals(events, date, { excludeId } = {}) {
  const intervals = getOccurrencesOnDate(events, date)
    .filter(event => event.id !== excludeId && blocksTime(event))
    .map(event => {
      const start = minutesOfDay(new Date(event.date));
      return { start, end: Math.min(MINUTES_PER_DAY, start + eventDuration(event)), event };
    })
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval.start < last.end) {
      last.end = Math.max(last.end, interval.end);
      last.events.push(interval.event);
    } else {
      merged.push({ start: interval.start, end: interval.end, events: [interval.event] });
    }
  }
  return merged;
}

/**
 * Lays out a day's occurrences into side-by-side columns so overlapping events
 * stay readable (same approach as desktop calendar apps):
 *  1. sweep events by start time and split them into clusters of transitively
 *     overlapping events;
 *  2. inside a cluster, greedily put each event in the first column that is free;
 *  3. let each event expand to the right over columns that stay free for its
 *     whole duration.
 * Returns `{ event, startMin, endMin, column, columns, span }` per occurrence.
 */
export function layoutDayEvents(occurrences = [], { minDurationMinutes = 30 } = {}) {
  const items = occurrences
    .map(event => {
      const startMin = minutesOfDay(new Date(event.date));
      const endMin = Math.min(MINUTES_PER_DAY, startMin + Math.max(eventDuration(event), minDurationMinutes));
      return { event, startMin, endMin, column: 0, columns: 1, span: 1 };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const finalizeCluster = (cluster, columnEnds) => {
    const columns = columnEnds.length;
    for (const item of cluster) {
      item.columns = columns;
      let span = 1;
      while (item.column + span < columns) {
        const nextColumn = item.column + span;
        const blocked = cluster.some(other => other.column === nextColumn
          && other.startMin < item.endMin
          && item.startMin < other.endMin);
        if (blocked) break;
        span += 1;
      }
      item.span = span;
    }
  };

  let cluster = [];
  let columnEnds = [];
  let clusterEnd = -1;

  for (const item of items) {
    if (cluster.length && item.startMin >= clusterEnd) {
      finalizeCluster(cluster, columnEnds);
      cluster = [];
      columnEnds = [];
    }
    let column = columnEnds.findIndex(end => end <= item.startMin);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(item.endMin);
    } else {
      columnEnds[column] = item.endMin;
    }
    item.column = column;
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  if (cluster.length) finalizeCluster(cluster, columnEnds);

  return items;
}

/**
 * Events overlapping the proposed [start, start + duration) slot.
 */
export function findConflicts(events, start, durationMinutes = 60, { excludeId } = {}) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return [];
  const slotStart = minutesOfDay(start);
  const slotEnd = slotStart + Math.max(1, Number(durationMinutes) || 60);

  return getOccurrencesOnDate(events, start).filter(event => {
    if (event.id === excludeId || !blocksTime(event)) return false;
    const eventStart = minutesOfDay(new Date(event.date));
    const eventEnd = eventStart + eventDuration(event);
    return eventStart < slotEnd && slotStart < eventEnd;
  });
}

/**
 * Learns when the user usually schedules similar events. Every past event that
 * shares the category or title words contributes a Gaussian bump centred on its
 * start time, weighted by similarity, same-weekday bonus and recency decay.
 * Returns a 96-bin (15 min) profile normalised to [0, 1] and a confidence.
 */
export function learnTimePreferences(events = [], { category, title, date = new Date(), excludeId } = {}) {
  const profile = new Float64Array(BIN_COUNT);
  const titleTokens = new Set(tokenize(title));
  const targetDay = date.getDay();
  let totalWeight = 0;

  for (const rawEvent of events) {
    const event = normalizeEventCached(rawEvent);
    if (event.id === excludeId || event.allDay) continue;

    let similarity = 0;
    if (category && event.category === category) similarity += 1;
    if (titleTokens.size) {
      const tokens = tokenize(event.title);
      const shared = tokens.filter(token => titleTokens.has(token)).length;
      if (shared) similarity += 1.5 * (shared / titleTokens.size);
    }
    if (!similarity) continue;

    const eventDate = new Date(event.originalDate || event.date);
    if (Number.isNaN(eventDate.getTime())) continue;
    const ageDays = Math.abs(date - eventDate) / 86400000;
    const recency = Math.pow(0.5, ageDays / HABIT_HALF_LIFE_DAYS);
    const weekday = eventDate.getDay() === targetDay || event.recurrence === 'daily' ? 1.3 : 1;
    // Recurring events encode a strong, explicit habit.
    const recurrenceBoost = event.recurrence && event.recurrence !== 'none' ? 1.5 : 1;
    const weight = similarity * Math.max(recency, 0.15) * weekday * recurrenceBoost;

    const center = minutesOfDay(eventDate);
    for (let bin = 0; bin < BIN_COUNT; bin += 1) {
      const distance = bin * BIN_MINUTES - center;
      profile[bin] += weight * Math.exp(-(distance * distance) / (2 * HABIT_SIGMA_MINUTES * HABIT_SIGMA_MINUTES));
    }
    totalWeight += weight;
  }

  const max = Math.max(...profile);
  if (max > 0) {
    for (let bin = 0; bin < BIN_COUNT; bin += 1) profile[bin] /= max;
  }

  return { profile, confidence: Math.min(1, totalWeight / 4), samples: totalWeight };
}

// Neutral prior used when there is no history: favours late morning and
// mid-afternoon, avoids lunch time and late evening.
function comfortPrior(minute) {
  const hour = minute / 60;
  const morning = Math.exp(-((hour - 10) ** 2) / (2 * 1.5 ** 2));
  const afternoon = Math.exp(-((hour - 15) ** 2) / (2 * 1.8 ** 2));
  const lunchDip = hour >= 12 && hour < 13.5 ? 0.35 : 0;
  const lateDip = hour >= 20 ? 0.3 : 0;
  return Math.max(0, Math.max(morning, afternoon * 0.9) - lunchDip - lateDip);
}

function formatMinutes(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Suggests the best start times for a new event on `date`.
 *
 * Each free candidate (every `stepMinutes`) gets a score combining:
 *  - affinity with the user's learned habits (falls back to a comfort prior);
 *  - breathing room: back-to-back slots and gaps under `bufferMinutes` are penalised;
 *  - fragmentation: leaving an unusable gap (< 30 min) before/after costs points;
 *  - a slight preference for earlier slots.
 * The best-scoring slots are returned, spread at least `minSpacingMinutes` apart,
 * with human-readable French reasons.
 */
export function suggestTimeSlots(events = [], {
  date = new Date(),
  durationMinutes = 60,
  category,
  title,
  now = new Date(),
  excludeId,
  dayStartMinutes = 8 * 60,
  dayEndMinutes = 21 * 60,
  stepMinutes = 15,
  bufferMinutes = 10,
  minSpacingMinutes = 60,
  limit = 3,
} = {}) {
  const duration = Math.max(5, Number(durationMinutes) || 60);
  const busy = getBusyIntervals(events, date, { excludeId });
  const habits = learnTimePreferences(events, { category, title, date, excludeId });

  // Let strong habits widen the search window (e.g. early sport, late study).
  let windowStart = dayStartMinutes;
  let windowEnd = dayEndMinutes;
  if (habits.confidence > 0.3) {
    for (let bin = 0; bin < BIN_COUNT; bin += 1) {
      if (habits.profile[bin] < 0.6) continue;
      const minute = bin * BIN_MINUTES;
      windowStart = Math.max(6 * 60, Math.min(windowStart, minute));
      windowEnd = Math.min(23 * 60, Math.max(windowEnd, minute + duration));
    }
  }

  const isToday = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  const startOfDayTime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (startOfDayTime + MINUTES_PER_DAY * 60000 <= now.getTime()) return [];
  const earliest = isToday
    ? Math.ceil((minutesOfDay(now) + 15) / stepMinutes) * stepMinutes
    : 0;

  const candidates = [];
  const firstStart = Math.ceil(Math.max(windowStart, earliest) / stepMinutes) * stepMinutes;
  for (let start = firstStart; start + duration <= windowEnd; start += stepMinutes) {
    const end = start + duration;
    if (busy.some(interval => interval.start < end && start < interval.end)) continue;

    const previous = [...busy].reverse().find(interval => interval.end <= start);
    const next = busy.find(interval => interval.start >= end);
    const gapBefore = previous ? start - previous.end : null;
    const gapAfter = next ? next.start - end : null;

    const bin = Math.min(BIN_COUNT - 1, Math.round(start / BIN_MINUTES));
    const learned = habits.profile[bin];
    const prior = comfortPrior(start);
    const preference = habits.confidence * learned + (1 - habits.confidence) * prior;

    let breathing = 0;
    let fragmentation = 0;
    for (const gap of [gapBefore, gapAfter]) {
      if (gap === null) continue;
      if (gap < bufferMinutes) breathing += (bufferMinutes - gap) / bufferMinutes;
      if (gap > 0 && gap < MIN_USEFUL_GAP_MINUTES) fragmentation += 1;
    }

    const earliness = 1 - (start - windowStart) / Math.max(1, windowEnd - windowStart);
    const score = 0.6 * preference
      - 0.12 * breathing
      - 0.1 * fragmentation
      + 0.06 * earliness;

    const reasons = [];
    if (habits.confidence > 0.25 && learned > 0.6) reasons.push('Correspond à vos habitudes');
    else if (prior > 0.7) reasons.push('Horaire confortable');
    if (busy.length === 0) reasons.push('Journée libre');
    else if ((gapBefore === null || gapBefore >= bufferMinutes) && (gapAfter === null || gapAfter >= bufferMinutes)) {
      reasons.push('Marge avant et après');
    }
    if (fragmentation === 0 && (gapBefore !== null || gapAfter !== null)) reasons.push('Évite les trous inutiles');

    candidates.push({
      startMinutes: start,
      endMinutes: end,
      time: formatMinutes(start),
      endTime: formatMinutes(end),
      score,
      reasons,
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.startMinutes - b.startMinutes);

  const picked = [];
  for (const candidate of candidates) {
    if (picked.every(slot => Math.abs(slot.startMinutes - candidate.startMinutes) >= minSpacingMinutes)) {
      picked.push(candidate);
      if (picked.length >= limit) break;
    }
  }
  return picked;
}
