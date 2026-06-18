import { describe, expect, it } from 'vitest';
import { applyIcsImportOptions, buildImportEventKey, isValidIcsUrl } from './icsImport';

describe('ICS import options', () => {
  it('applies global category and reminder choices to imported events', () => {
    const events = applyIcsImportOptions([
      { externalId: 'a', title: 'Cours', date: '2026-06-16T08:00:00.000Z' },
    ], {
      defaultCategory: 'cours',
      defaultReminder: true,
    });

    expect(events[0]).toMatchObject({
      category: 'cours',
      reminder: true,
    });
  });

  it('lets event-level overrides replace global import choices', () => {
    const sourceEvent = { externalId: 'a', title: 'Match', date: '2026-06-16T08:00:00.000Z' };
    const key = buildImportEventKey(sourceEvent, 0);
    const events = applyIcsImportOptions([sourceEvent], {
      defaultCategory: 'perso',
      defaultReminder: false,
      overridesById: {
        [key]: { category: 'dev', reminder: true },
      },
    });

    expect(events[0]).toMatchObject({
      category: 'dev',
      reminder: true,
    });
  });

  it('accepts only HTTPS ICS URLs', () => {
    expect(isValidIcsUrl('https://example.com/calendar.ics')).toBe(true);
    expect(isValidIcsUrl('http://example.com/calendar.ics')).toBe(false);
    expect(isValidIcsUrl('file:///tmp/calendar.ics')).toBe(false);
  });
});
