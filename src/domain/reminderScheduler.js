import { getNextOccurrence, normalizeEvent } from './events';

const SHORT_DELAY_MS = 5000;
const VISIBLE_IDLE_DELAY_MS = 30000;
const BACKGROUND_IDLE_DELAY_MS = 60000;
const APPROACHING_WINDOW_MS = 15 * 60 * 1000;

function nextReminderTime(events = [], now = new Date()) {
  let next = null;
  for (const rawEvent of events) {
    const event = normalizeEvent(rawEvent);
    if (!event.reminder) continue;
    const occurrence = getNextOccurrence(event, now);
    if (!occurrence) continue;
    const time = occurrence.getTime();
    if (time < now.getTime()) continue;
    if (next === null || time < next) next = time;
  }
  return next;
}

export function computeReminderCheckDelay({ events = [], now = new Date(), hidden = false } = {}) {
  const nextTime = nextReminderTime(events, now);
  if (nextTime === null) return hidden ? BACKGROUND_IDLE_DELAY_MS : VISIBLE_IDLE_DELAY_MS;

  const untilNext = nextTime - now.getTime();
  if (untilNext <= APPROACHING_WINDOW_MS) return SHORT_DELAY_MS;

  const idleDelay = hidden ? BACKGROUND_IDLE_DELAY_MS : VISIBLE_IDLE_DELAY_MS;
  return Math.min(idleDelay, Math.max(SHORT_DELAY_MS, untilNext - APPROACHING_WINDOW_MS));
}
