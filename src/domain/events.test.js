import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORY_LEGEND,
  formatEventDate,
  getOccurrencesOnDate,
  normalizeEvent,
} from './events';

describe('events domain', () => {
  it('normalizes old events with category, color, duration and todos defaults', () => {
    const normalized = normalizeEvent({
      id: 'old-1',
      title: 'Cours maths',
      date: '2026-06-16T08:00:00.000Z',
      recurrence: 'weekly',
    });

    expect(normalized).toMatchObject({
      id: 'old-1',
      title: 'Cours maths',
      category: 'cours',
      color: DEFAULT_CATEGORY_LEGEND.cours.color,
      durationMinutes: 60,
      recurrence: 'weekly',
      todos: [],
      tags: ['cours'],
    });
  });

  it('keeps monthly recurring events on the last valid day of shorter months', () => {
    const event = normalizeEvent({
      id: 'billing',
      title: 'Bilan',
      date: '2026-01-31T09:00:00.000Z',
      recurrence: 'monthly',
    });

    const occurrences = getOccurrencesOnDate([event], new Date(2026, 1, 28));

    expect(occurrences).toHaveLength(1);
    expect(new Date(occurrences[0].date).getDate()).toBe(28);
  });

  it('formats dates using saved French display preferences', () => {
    const value = formatEventDate('2026-06-16T07:30:00.000Z', {
      dateFormat: 'weekday-short',
    });

    expect(value).toContain('16');
    expect(value).toMatch(/juin|Jun/i);
  });

  it('keeps custom categories from settings while normalizing events', () => {
    const normalized = normalizeEvent({
      title: 'Studio musique',
      date: '2026-06-16T08:00:00.000Z',
      category: 'musique',
    }, {
      categoryLegend: {
        ...DEFAULT_CATEGORY_LEGEND,
        musique: { label: 'Musique', color: '#ec4899', custom: true },
      },
    });

    expect(normalized.category).toBe('musique');
    expect(normalized.color).toBe('#ec4899');
  });
});
