import { describe, expect, it } from 'vitest';
import { buildOccurrenceIndex, getOccurrencesOnDate, normalizeEventCached, toDayKey } from './events';

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function randomEvents(count, random) {
  const recurrences = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(2024, Math.floor(random() * 30), 1 + Math.floor(random() * 31), Math.floor(random() * 24), Math.floor(random() * 4) * 15);
    return {
      id: `ev-${index}`,
      title: `Événement ${index}`,
      date: date.toISOString(),
      recurrence: recurrences[Math.floor(random() * recurrences.length)],
    };
  });
}

describe('buildOccurrenceIndex', () => {
  it('matches a day-by-day evaluation over a long range', () => {
    const random = seededRandom(42);
    const events = [
      ...randomEvents(120, random),
      { id: 'leap', title: 'Anniversaire', date: new Date(2024, 1, 29, 10).toISOString(), recurrence: 'yearly' },
      { id: 'eom', title: 'Loyer', date: new Date(2024, 0, 31, 9).toISOString(), recurrence: 'monthly' },
    ];
    const start = new Date(2024, 10, 15);
    const end = new Date(2026, 3, 10);
    const index = buildOccurrenceIndex(events, start, end);

    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const expected = getOccurrencesOnDate(events, cursor);
      const actual = index.get(toDayKey(cursor)) || [];
      expect(actual.map(item => item.occurrenceKey)).toEqual(expected.map(item => item.occurrenceKey));
    }
  });

  it('clamps monthly and leap-day yearly recurrences', () => {
    const events = [
      { id: 'eom', title: 'Loyer', date: new Date(2025, 0, 31, 9).toISOString(), recurrence: 'monthly' },
      { id: 'leap', title: 'Anniv', date: new Date(2024, 1, 29, 9).toISOString(), recurrence: 'yearly' },
    ];
    const index = buildOccurrenceIndex(events, new Date(2025, 1, 1), new Date(2025, 1, 28));

    expect(index.get(20250228).map(item => item.id).sort()).toEqual(['eom', 'leap']);
  });

  it('ignores events starting after the range', () => {
    const index = buildOccurrenceIndex(
      [{ id: 'later', title: 'Plus tard', date: new Date(2030, 0, 1).toISOString(), recurrence: 'daily' }],
      new Date(2026, 0, 1),
      new Date(2026, 11, 31),
    );
    expect(index.size).toBe(0);
  });

  it('reuses normalized events for the same object', () => {
    const raw = { title: 'Sans id', date: new Date(2026, 0, 1).toISOString() };
    expect(normalizeEventCached(raw)).toBe(normalizeEventCached(raw));
    expect(normalizeEventCached(raw).id).toBe(normalizeEventCached(raw).id);
  });
});
