import { describe, expect, it } from 'vitest';
import {
  findConflicts,
  getBusyIntervals,
  layoutDayEvents,
  learnTimePreferences,
  suggestTimeSlots,
} from './smartScheduling';

const at = (day, hours, minutes = 0) => new Date(2026, 5, day, hours, minutes).toISOString();

describe('layoutDayEvents', () => {
  it('puts overlapping events side by side and lets free events use full width', () => {
    const layout = layoutDayEvents([
      { id: 'a', date: at(10, 9), durationMinutes: 120 },
      { id: 'b', date: at(10, 10), durationMinutes: 60 },
      { id: 'c', date: at(10, 14), durationMinutes: 60 },
    ]);
    const byId = Object.fromEntries(layout.map(item => [item.event.id, item]));

    expect(byId.a.columns).toBe(2);
    expect(byId.b.column).toBe(1);
    expect(byId.c).toMatchObject({ column: 0, columns: 1, span: 1 });
  });

  it('expands an event over columns that stay free', () => {
    const layout = layoutDayEvents([
      { id: 'a', date: at(10, 9), durationMinutes: 180 },
      { id: 'b', date: at(10, 9, 30), durationMinutes: 30 },
      { id: 'c', date: at(10, 9, 45), durationMinutes: 30 },
      { id: 'd', date: at(10, 11), durationMinutes: 30 },
    ]);
    const byId = Object.fromEntries(layout.map(item => [item.event.id, item]));

    expect(byId.a.columns).toBe(3);
    expect(byId.d.column).toBe(1);
    expect(byId.d.span).toBe(2);
  });
});

describe('conflicts and busy time', () => {
  const events = [
    { id: 'math', title: 'Cours maths', date: at(10, 9), durationMinutes: 90 },
    { id: 'td', title: 'TD', date: at(10, 10), durationMinutes: 60 },
    { id: 'holiday', title: 'Férié', date: at(10, 0), allDay: true },
  ];

  it('merges overlapping busy intervals and skips all-day events', () => {
    const busy = getBusyIntervals(events, new Date(2026, 5, 10));
    expect(busy).toHaveLength(1);
    expect(busy[0]).toMatchObject({ start: 540, end: 660 });
  });

  it('detects conflicts while excluding the edited event', () => {
    const start = new Date(2026, 5, 10, 10, 15);
    expect(findConflicts(events, start, 30).map(e => e.id)).toEqual(['math', 'td']);
    expect(findConflicts(events, start, 30, { excludeId: 'math' }).map(e => e.id)).toEqual(['td']);
    expect(findConflicts(events, new Date(2026, 5, 10, 11), 30)).toEqual([]);
  });
});

describe('suggestTimeSlots', () => {
  const now = new Date(2026, 5, 1, 8);

  it('never proposes a slot overlapping existing events', () => {
    const events = [
      { id: 'a', title: 'Réunion', date: at(10, 9), durationMinutes: 120 },
      { id: 'b', title: 'Déjeuner', date: at(10, 12), durationMinutes: 60 },
      { id: 'c', title: 'Atelier', date: at(10, 14), durationMinutes: 180 },
    ];
    const slots = suggestTimeSlots(events, { date: new Date(2026, 5, 10), durationMinutes: 60, now, limit: 5 });

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      for (const [start, end] of [[540, 660], [720, 780], [840, 1020]]) {
        expect(slot.startMinutes < end && start < slot.endMinutes).toBe(false);
      }
    }
  });

  it('learns habits from similar past events', () => {
    const history = [3, 4, 5, 6, 7, 8].map(day => ({
      id: `sport-${day}`,
      title: 'Sport salle',
      category: 'sport',
      date: new Date(2026, 4, day, 18, 30).toISOString(),
    }));
    const habits = learnTimePreferences(history, { category: 'sport', date: new Date(2026, 5, 10) });
    expect(habits.confidence).toBeGreaterThan(0.3);

    const [best] = suggestTimeSlots(history, {
      date: new Date(2026, 5, 10),
      category: 'sport',
      title: 'Sport',
      now,
    });
    expect(best.time).toBe('18:30');
    expect(best.reasons).toContain('Correspond à vos habitudes');
  });

  it('does not suggest past times for today', () => {
    const today = new Date(2026, 5, 10, 15, 5);
    const slots = suggestTimeSlots([], { date: today, now: today, limit: 10 });
    expect(slots.every(slot => slot.startMinutes >= 15 * 60 + 20)).toBe(true);
  });

  it('returns nothing for days in the past', () => {
    expect(suggestTimeSlots([], { date: new Date(2026, 4, 1), now })).toEqual([]);
  });

  it('spreads suggestions apart', () => {
    const slots = suggestTimeSlots([], { date: new Date(2026, 5, 10), now, limit: 3 });
    expect(slots).toHaveLength(3);
    const starts = slots.map(slot => slot.startMinutes).sort((a, b) => a - b);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(60);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(60);
  });
});
