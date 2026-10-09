import { describe, expect, it } from 'vitest';
import { parseICS, zonedWallTimeToUtc } from './ics';

describe('ICS utilities', () => {
  it('parses folded summaries, UID, all-day dates and duration', () => {
    const result = parseICS([
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:abc-123',
      'DTSTART;VALUE=DATE:20260616',
      'DTEND;VALUE=DATE:20260617',
      'SUMMARY:Cours très long',
      ' de mathématiques',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'));

    expect(result).toHaveLength(1);
    expect(result[0].externalId).toBe('abc-123');
    expect(result[0].title).toBe('Cours très long de mathématiques');
    expect(result[0].durationMinutes).toBe(1440);
  });

  it('deduplicates imported events by UID', () => {
    const result = parseICS([
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:abc-123',
      'DTSTART:20260616T090000Z',
      'SUMMARY:Cours',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:abc-123',
      'DTSTART:20260616T090000Z',
      'SUMMARY:Cours',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n'));

    expect(result).toHaveLength(1);
  });

  it('parses rich World Cup URL feed fields without using broadcaster categories as Caltemp categories', () => {
    const result = parseICS([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//coupedumonde2026.net//Calendrier CDM 2026//FR',
      'X-WR-CALNAME:Coupe du Monde 2026',
      'X-WR-TIMEZONE:Europe/Paris',
      'BEGIN:VEVENT',
      'UID:match-209@coupedumonde2026.net',
      'SEQUENCE:3',
      'DTSTART:20260611T190000Z',
      'DTEND:20260611T210000Z',
      'SUMMARY:⚽ Mexique — Afrique du Sud',
      'DESCRIPTION:🏆 COUPE DU MONDE 2026\\n\\n📋 Groupe A — Match N°1',
      'LOCATION:Estadio Azteca\\, Mexico (Mexique)',
      'URL:https://coupedumonde2026.net/match/mexique-vs-afrique-du-sud-11-juin-2026/',
      'CATEGORIES:M6 / beIN Sports',
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'DTSTAMP:20260707T204850Z',
      'BEGIN:VALARM',
      'TRIGGER:-PT30M',
      'ACTION:DISPLAY',
      'DESCRIPTION:⚽ Mexique — Afrique du Sud dans 30 minutes !',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      externalId: 'match-209@coupedumonde2026.net',
      title: '⚽ Mexique — Afrique du Sud',
      durationMinutes: 120,
      location: 'Estadio Azteca, Mexico (Mexique)',
      url: 'https://coupedumonde2026.net/match/mexique-vs-afrique-du-sud-11-juin-2026/',
      sourceCategories: ['M6 / beIN Sports'],
      status: 'CONFIRMED',
      transparency: 'OPAQUE',
      sequence: 3,
    });
    expect(result[0].date).toBe('2026-06-11T19:00:00.000Z');
    expect(result[0].category).toBeUndefined();
    expect(result[0].alarms?.[0]).toMatchObject({
      trigger: '-PT30M',
      action: 'DISPLAY',
    });
  });

  it('parses TZID date-times and preserves all-day dates', () => {
    const result = parseICS([
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:tz-1',
      'DTSTART;TZID=Europe/Paris:20260611T210000',
      'DTEND;TZID=Europe/Paris:20260611T230000',
      'SUMMARY:Match local',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:all-day-1',
      'DTSTART;VALUE=DATE:20260612',
      'DTEND;VALUE=DATE:20260613',
      'SUMMARY:Journée entière',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n'));

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      externalId: 'tz-1',
      date: '2026-06-11T19:00:00.000Z',
      durationMinutes: 120,
      allDay: false,
    });
    expect(result[1]).toMatchObject({
      externalId: 'all-day-1',
      allDay: true,
      durationMinutes: 1440,
    });
  });

  const calendar = (...lines) => ['BEGIN:VCALENDAR', ...lines, 'END:VCALENDAR'].join('\r\n');

  it('converts TZID wall times without VTIMEZONE whatever the machine time zone', () => {
    expect(new Date(zonedWallTimeToUtc({ year: 2026, month: 1, day: 15, hour: 9 }, 'Europe/Paris')).toISOString())
      .toBe('2026-01-15T08:00:00.000Z');
    expect(new Date(zonedWallTimeToUtc({ year: 2026, month: 7, day: 15, hour: 9 }, 'America/New_York')).toISOString())
      .toBe('2026-07-15T13:00:00.000Z');
    expect(zonedWallTimeToUtc({ year: 2026, month: 1, day: 1 }, 'Not/AZone')).toBeNull();
  });

  it('expands bounded series, honours EXDATE and moved instances, and skips cancelled ones', () => {
    const result = parseICS(calendar(
      'BEGIN:VEVENT',
      'UID:serie-1',
      'DTSTART;TZID=Europe/Paris:20260601T100000',
      'DTEND;TZID=Europe/Paris:20260601T110000',
      'RRULE:FREQ=WEEKLY;COUNT=4',
      'EXDATE;TZID=Europe/Paris:20260608T100000',
      'SUMMARY:Cours',
      'END:VEVENT',
      // Override listed before nothing in particular: order must not matter.
      'BEGIN:VEVENT',
      'UID:serie-1',
      'RECURRENCE-ID;TZID=Europe/Paris:20260615T100000',
      'DTSTART;TZID=Europe/Paris:20260615T140000',
      'DTEND;TZID=Europe/Paris:20260615T160000',
      'SUMMARY:Cours déplacé',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:serie-1',
      'RECURRENCE-ID;TZID=Europe/Paris:20260622T100000',
      'DTSTART;TZID=Europe/Paris:20260622T100000',
      'STATUS:CANCELLED',
      'SUMMARY:Cours',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:gone',
      'DTSTART:20260601T100000Z',
      'STATUS:CANCELLED',
      'SUMMARY:Annulé',
      'END:VEVENT',
    ), { now: '2026-06-01T00:00:00Z' });

    expect(result.map(event => [event.title, event.date, event.durationMinutes])).toEqual([
      ['Cours', '2026-06-01T08:00:00.000Z', 60],
      ['Cours déplacé', '2026-06-15T12:00:00.000Z', 120],
    ]);
    expect(result.every(event => event.recurrence === undefined)).toBe(true);
    expect(result[1]).toMatchObject({ uid: 'serie-1', externalId: 'serie-1#2026-06-15T08:00:00.000Z' });
  });

  it('keeps simple open-ended rules native instead of expanding them', () => {
    const result = parseICS(calendar(
      'BEGIN:VEVENT',
      'UID:weekly',
      'DTSTART:20260602T080000Z',
      'RRULE:FREQ=WEEKLY;BYDAY=TU',
      'SUMMARY:Hebdo',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:biweekly',
      'DTSTART:20260602T080000Z',
      'RRULE:FREQ=WEEKLY;INTERVAL=2',
      'SUMMARY:Une semaine sur deux',
      'END:VEVENT',
    ), { now: '2026-06-01T00:00:00Z', horizonDays: 30 });

    expect(result.filter(event => event.uid === 'weekly')).toEqual([
      expect.objectContaining({ recurrence: 'weekly', externalId: 'weekly' }),
    ]);
    // Not representable natively: expanded inside the horizon.
    expect(result.filter(event => event.uid === 'biweekly').map(event => event.date)).toEqual([
      '2026-06-02T08:00:00.000Z',
      '2026-06-16T08:00:00.000Z',
      '2026-06-30T08:00:00.000Z',
    ]);
  });

  it('reads the GEO property', () => {
    const [event] = parseICS(calendar(
      'BEGIN:VEVENT',
      'UID:geo-1',
      'DTSTART:20260602T080000Z',
      'SUMMARY:Rendez-vous',
      'LOCATION:Place Bellecour',
      'GEO:45.7578;4.8320',
      'END:VEVENT',
    ));
    expect(event.geo).toEqual({ lat: 45.7578, lng: 4.832, source: 'ics' });
  });
});
