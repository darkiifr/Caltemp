import { getNextOccurrence, normalizeEvent, startOfDay } from './events';

const FIVE_MINUTES = 5 * 60 * 1000;

export function getEndOfDaySnooze(now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 0, 0);
  return end;
}

export function snoozeEventOccurrence(event, occurrenceKey, minutesOrMode, now = new Date()) {
  const target = minutesOrMode === 'endOfDay'
    ? getEndOfDaySnooze(now)
    : new Date(now.getTime() + Number(minutesOrMode) * 60 * 1000);

  return {
    ...event,
    reminderSnoozes: {
      ...(event.reminderSnoozes || {}),
      [occurrenceKey]: target.toISOString(),
    },
  };
}

export function isSnoozed(event, occurrenceKey, now = new Date()) {
  const value = event.reminderSnoozes?.[occurrenceKey];
  return value ? new Date(value) > now : false;
}

function phaseFor(timeDiff, event, occurrenceKey) {
  const already = event.notifiedOccurrences?.[occurrenceKey];
  if (already === 'final') return null;
  if (timeDiff <= 0 && timeDiff > -FIVE_MINUTES) return 'final';
  if (!already && timeDiff > 0 && timeDiff <= 15 * 60 * 1000) return 'early';
  return null;
}

export function buildReminderNotifications(events = [], now = new Date()) {
  const due = [];

  for (const rawEvent of events) {
    const event = normalizeEvent(rawEvent);
    if (!event.reminder) continue;

    const checkFromDate = new Date(now.getTime() - FIVE_MINUTES);
    const occurrence = getNextOccurrence(event, checkFromDate);
    if (!occurrence) continue;

    const occurrenceKey = `${event.id}:${occurrence.getTime()}`;
    if (isSnoozed(event, occurrenceKey, now)) continue;

    const phase = phaseFor(occurrence - now, event, occurrenceKey);
    if (!phase) continue;

    due.push({ event, occurrence, occurrenceKey, phase });
  }

  const recurrentTodayGroups = new Map();
  const singleNotifications = [];
  const todayStart = startOfDay(now).getTime();

  for (const item of due) {
    const occurrenceDay = startOfDay(item.occurrence).getTime();
    if (item.event.recurrence !== 'none' && occurrenceDay === todayStart) {
      const key = `${item.event.category}:${item.phase}`;
      const current = recurrentTodayGroups.get(key) || [];
      current.push(item);
      recurrentTodayGroups.set(key, current);
    } else {
      singleNotifications.push(item);
    }
  }

  const grouped = Array.from(recurrentTodayGroups.values()).map(group => {
    if (group.length === 1) {
      const item = group[0];
      return {
        title: 'Rappel Caltemp',
        body: item.phase === 'final' ? `Maintenant : ${item.event.title}` : `Bientôt : ${item.event.title}`,
        type: 'reminder',
        items: group,
      };
    }

    const category = group[0].event.category || 'événements';
    return {
      title: 'Rappel Caltemp',
      body: `${group.length} ${category} aujourd'hui`,
      type: 'reminder',
      items: group,
    };
  });

  return [
    ...singleNotifications.map(item => ({
      title: 'Rappel Caltemp',
      body: item.phase === 'final' ? `Maintenant : ${item.event.title}` : `Bientôt : ${item.event.title}`,
      type: 'reminder',
      items: [item],
    })),
    ...grouped,
  ];
}

export function applyNotificationMarks(events = [], notifications = []) {
  const marks = new Map();
  for (const notification of notifications) {
    for (const item of notification.items || []) {
      marks.set(item.event.id, { key: item.occurrenceKey, phase: item.phase });
    }
  }

  let changed = false;
  const nextEvents = events.map(event => {
    const mark = marks.get(event.id);
    if (!mark) return event;
    if (event.notifiedOccurrences?.[mark.key] === mark.phase) return event;
    changed = true;
    return {
      ...event,
      notifiedOccurrences: {
        ...(event.notifiedOccurrences || {}),
        [mark.key]: mark.phase,
      },
    };
  });

  return { events: nextEvents, changed };
}
