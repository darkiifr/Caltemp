import { describe, expect, it } from 'vitest';
import {
  applyIcsImportOptions,
  buildImportEventKey,
  getIcsUrlFingerprint,
  isValidIcsUrl,
  validateIcsUrl,
} from './icsImport';

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

  it('infers sport for football matches instead of using ICS broadcaster categories', () => {
    const events = applyIcsImportOptions([
      {
        externalId: 'match-209@coupedumonde2026.net',
        title: '⚽ Mexique — Afrique du Sud',
        date: '2026-06-11T19:00:00.000Z',
        sourceCategories: ['M6 / beIN Sports'],
      },
    ], {
      sourceId: 'world-cup',
      sourceLabel: 'Coupe du Monde 2026',
    });

    expect(events[0]).toMatchObject({
      category: 'sport',
      importSourceId: 'world-cup',
      importSourceLabel: 'Coupe du Monde 2026',
      importKey: 'world-cup:match-209@coupedumonde2026.net',
      sourceCategories: ['M6 / beIN Sports'],
    });
    expect(events[0].category).not.toBe('M6 / beIN Sports');
  });

  it('keeps an explicit source category before inference', () => {
    const events = applyIcsImportOptions([
      { externalId: 'match-1', title: '⚽ Finale', date: '2026-07-19T19:00:00.000Z' },
    ], {
      sourceId: 'world-cup',
      defaultCategory: 'perso',
    });

    expect(events[0].category).toBe('perso');
  });

  it('accepts only HTTPS ICS URLs', () => {
    expect(isValidIcsUrl('https://example.com/calendar.ics')).toBe(true);
    expect(isValidIcsUrl('https://coupedumonde2026.net/api/calendrier-ical?filter=all')).toBe(true);
    expect(isValidIcsUrl('http://example.com/calendar.ics')).toBe(false);
    expect(isValidIcsUrl('file:///tmp/calendar.ics')).toBe(false);
  });

  it('validates subscription URLs without dropping query parameters', () => {
    const result = validateIcsUrl(' https://coupedumonde2026.net/api/calendrier-ical?filter=all ');

    expect(result).toMatchObject({
      ok: true,
      normalizedUrl: 'https://coupedumonde2026.net/api/calendrier-ical?filter=all',
      hostname: 'coupedumonde2026.net',
    });
  });

  it('rejects credentials and local network destinations', () => {
    expect(validateIcsUrl('https://user:secret@example.com/private.ics')).toMatchObject({
      ok: false,
    });
    expect(validateIcsUrl('https://localhost/calendar.ics')).toMatchObject({
      ok: false,
    });
    expect(validateIcsUrl('https://127.0.0.1/calendar.ics')).toMatchObject({
      ok: false,
    });
    expect(validateIcsUrl('https://192.168.1.20/calendar.ics')).toMatchObject({
      ok: false,
    });
    expect(validateIcsUrl('https://10.0.0.4/calendar.ics')).toMatchObject({
      ok: false,
    });
  });

  it('normalizes URL fingerprints for duplicate subscription detection', () => {
    expect(getIcsUrlFingerprint('HTTPS://Example.com:443/calendar.ics?b=2&a=1')).toBe(
      getIcsUrlFingerprint('https://example.com/calendar.ics?b=2&a=1'),
    );
    expect(getIcsUrlFingerprint('https://example.com/calendar.ics?b=2&a=1')).not.toBe(
      getIcsUrlFingerprint('https://example.com/calendar.ics?a=1&b=2'),
    );
  });
});
