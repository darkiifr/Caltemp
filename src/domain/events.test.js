import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORY_LEGEND,
  formatEventDate,
  getOccurrencesOnDate,
  normalizeEvent,
  normalizeSettings,
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

  it('preserves a saved numeric date format while normalizing settings', () => {
    const settings = normalizeSettings({ dateFormat: 'numeric' });

    expect(settings.dateFormat).toBe('numeric');
    expect(formatEventDate('2026-06-16T07:30:00.000Z', settings)).toMatch(/16\/06\/2026/);
  });

  it('drops legacy user-managed OpenRouter settings', () => {
    const settings = normalizeSettings({
      aiApiKey: 'sk-or-user-key',
      aiModel: 'openai/gpt-4o-mini',
      customModels: ['custom/model'],
    });

    expect(settings).not.toHaveProperty('aiApiKey');
    expect(settings).not.toHaveProperty('aiModel');
    expect(settings).not.toHaveProperty('customModels');
  });

  it('normalizes AI usage statistics in settings', () => {
    const settings = normalizeSettings({
      aiUsageStats: {
        totalRequests: 1,
        totalTokens: 25,
        models: {
          'openrouter/free': { requests: 1, totalTokens: 25 },
        },
      },
    });

    expect(settings.aiUsageStats.totalRequests).toBe(1);
    expect(settings.aiUsageStats.models['openrouter/free']).toMatchObject({
      requests: 1,
      totalTokens: 25,
    });
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

  it('includes sport as a default category and infers football matches', () => {
    expect(DEFAULT_CATEGORY_LEGEND.sport).toMatchObject({
      label: 'Sport',
    });

    const normalized = normalizeEvent({
      title: '⚽ Mexique — Afrique du Sud',
      date: '2026-06-11T19:00:00.000Z',
      sourceCategories: ['M6 / beIN Sports'],
    });

    expect(normalized.category).toBe('sport');
    expect(normalized.sourceCategories).toEqual(['M6 / beIN Sports']);
    expect(normalized.tags).toContain('sport');
    expect(normalized.tags).toContain('M6 / beIN Sports');
  });

  it('preserves import metadata while normalizing events', () => {
    const normalized = normalizeEvent({
      title: 'Match',
      date: '2026-06-11T19:00:00.000Z',
      source: 'ics-url',
      importSourceId: 'world-cup',
      importSourceLabel: 'Coupe du Monde 2026',
      importKey: 'world-cup:match-1',
      externalId: 'match-1',
      sequence: 3,
      lastModified: '2026-07-07T20:48:50.000Z',
      location: 'Estadio Azteca',
      url: 'https://example.com/match',
      status: 'CONFIRMED',
      allDay: false,
    });

    expect(normalized).toMatchObject({
      source: 'ics-url',
      importSourceId: 'world-cup',
      importSourceLabel: 'Coupe du Monde 2026',
      importKey: 'world-cup:match-1',
      externalId: 'match-1',
      sequence: 3,
      lastModified: '2026-07-07T20:48:50.000Z',
      location: 'Estadio Azteca',
      url: 'https://example.com/match',
      status: 'CONFIRMED',
      allDay: false,
    });
  });
});
