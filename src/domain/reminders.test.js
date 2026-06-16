import { describe, expect, it } from 'vitest';
import {
  buildReminderNotifications,
  getEndOfDaySnooze,
  snoozeEventOccurrence,
} from './reminders';

describe('reminders domain', () => {
  it('snoozes an occurrence by the requested number of minutes', () => {
    const event = { id: '1', reminderSnoozes: {} };
    const now = new Date('2026-06-16T10:00:00.000Z');
    const next = snoozeEventOccurrence(event, 'occ-1', 10, now);

    expect(next.reminderSnoozes['occ-1']).toBe('2026-06-16T10:10:00.000Z');
  });

  it('calculates end-of-day snooze at 23:59 local time', () => {
    const target = getEndOfDaySnooze(new Date(2026, 5, 16, 10, 30));

    expect(target.getHours()).toBe(23);
    expect(target.getMinutes()).toBe(59);
  });

  it('groups same-category recurring reminders due today', () => {
    const now = new Date(2026, 5, 16, 8, 0);
    const notifications = buildReminderNotifications([
      {
        id: 'a',
        title: 'Maths',
        date: new Date(2026, 5, 16, 8, 0).toISOString(),
        reminder: true,
        recurrence: 'weekly',
        category: 'cours',
        notifiedOccurrences: {},
      },
      {
        id: 'b',
        title: 'Physique',
        date: new Date(2026, 5, 16, 8, 0).toISOString(),
        reminder: true,
        recurrence: 'weekly',
        category: 'cours',
        notifiedOccurrences: {},
      },
      {
        id: 'c',
        title: 'Français',
        date: new Date(2026, 5, 16, 8, 0).toISOString(),
        reminder: true,
        recurrence: 'weekly',
        category: 'cours',
        notifiedOccurrences: {},
      },
    ], now);

    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe('Rappel Caltemp');
    expect(notifications[0].body).toBe("3 cours aujourd'hui");
  });
});
