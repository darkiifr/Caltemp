import { describe, expect, it } from 'vitest';
import { computeReminderCheckDelay } from './reminderScheduler';

describe('reminder scheduler', () => {
  it('uses a long background delay when no reminder is close', () => {
    const delay = computeReminderCheckDelay({
      events: [
        { title: 'Dentiste', date: '2026-06-20T18:00:00.000Z', reminder: true },
      ],
      now: new Date('2026-06-20T12:00:00.000Z'),
      hidden: true,
    });

    expect(delay).toBe(60000);
  });

  it('wakes shortly before an imminent reminder even in background', () => {
    const delay = computeReminderCheckDelay({
      events: [
        { title: 'Dentiste', date: '2026-06-20T12:02:00.000Z', reminder: true },
      ],
      now: new Date('2026-06-20T12:00:00.000Z'),
      hidden: true,
    });

    expect(delay).toBe(5000);
  });

  it('uses a short visible delay only when a reminder is approaching', () => {
    const farDelay = computeReminderCheckDelay({
      events: [
        { title: 'Sport', date: '2026-06-20T20:00:00.000Z', reminder: true },
      ],
      now: new Date('2026-06-20T12:00:00.000Z'),
      hidden: false,
    });
    const nearDelay = computeReminderCheckDelay({
      events: [
        { title: 'Sport', date: '2026-06-20T12:03:00.000Z', reminder: true },
      ],
      now: new Date('2026-06-20T12:00:00.000Z'),
      hidden: false,
    });

    expect(farDelay).toBe(30000);
    expect(nearDelay).toBe(5000);
  });
});
