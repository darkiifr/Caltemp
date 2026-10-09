import { describe, expect, it } from 'vitest';
import {
  analyzeImportEvents,
  detectDateOrder,
  detectIcsProvider,
  detectImportFormat,
  getIcsCalendarName,
  isItemSelectedByDefault,
  mergeImportedEvents,
  parseCalendarCsv,
  parseCsvRows,
  parseTimePart,
  summarizeImportItems,
} from './calendarImport';

const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

describe('format and provider detection', () => {
  it('recognises iCalendar content regardless of the file name', () => {
    expect(detectImportFormat('export.txt', '\uFEFFBEGIN:VCALENDAR\r\nVERSION:2.0')).toBe('ics');
    expect(detectImportFormat('agenda.ics', '')).toBe('ics');
    expect(detectImportFormat('Texte collé', 'Subject,Start Date\nA,01/02/2026\n')).toBe('csv');
    expect(detectImportFormat('takeout.zip')).toBe('zip');
    expect(detectImportFormat('photo.png', 'binary')).toBe('unknown');
  });

  it('identifies the exporting app from PRODID and reads the calendar name', () => {
    const google = 'BEGIN:VCALENDAR\r\nPRODID:-//Google Inc//Google Calendar 70.9054//EN\r\nX-WR-CALNAME:Travail\r\n';
    expect(detectIcsProvider(google)).toBe('google');
    expect(getIcsCalendarName(google)).toBe('Travail');
    expect(detectIcsProvider('PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN')).toBe('outlook');
    expect(detectIcsProvider('PRODID:-//Apple Inc.//macOS 14.0//EN')).toBe('apple');
    expect(detectIcsProvider('PRODID:-//Proton AG//WebCalendar 5.0//EN')).toBe('proton');
    expect(detectIcsProvider('PRODID:-//Something//EN')).toBe('other');
  });
});

describe('CSV parsing', () => {
  it('handles quotes, escaped quotes, multi-line cells and semicolons', () => {
    const rows = parseCsvRows('Objet;Description\r\n"Réunion; équipe";"Ligne 1\nLigne ""2"""\r\n');
    expect(rows).toEqual([
      ['Objet', 'Description'],
      ['Réunion; équipe', 'Ligne 1\nLigne "2"'],
    ]);
  });

  it('parses times in 24h, French and AM/PM notations', () => {
    expect(parseTimePart('14:30')).toEqual({ hour: 14, minute: 30 });
    expect(parseTimePart('9h05')).toEqual({ hour: 9, minute: 5 });
    expect(parseTimePart('2:15 PM')).toEqual({ hour: 14, minute: 15 });
    expect(parseTimePart('12:00 AM')).toEqual({ hour: 0, minute: 0 });
    expect(parseTimePart('')).toBeNull();
  });

  it('infers day/month order from the values', () => {
    expect(detectDateOrder(['03/04/2026', '25/04/2026'])).toBe('dmy');
    expect(detectDateOrder(['03/04/2026', '04/25/2026'])).toBe('mdy');
    expect(detectDateOrder(['03/04/2026'], 'mdy')).toBe('mdy');
  });

  it('reads a Google Agenda CSV (US dates, AM/PM, all-day inclusive end)', () => {
    const csv = [
      'Subject,Start Date,Start Time,End Date,End Time,All Day Event,Description,Location,Private',
      'Dentiste,03/04/2026,9:00 AM,03/04/2026,9:30 AM,False,Contrôle,Paris,False',
      'Vacances,07/01/2026,,07/03/2026,,True,,,False',
    ].join('\n');
    const { events, provider, dateOrder, warnings } = parseCalendarCsv(csv);

    expect(provider).toBe('google');
    expect(dateOrder).toBe('mdy');
    expect(warnings).toEqual([]);
    expect(events[0]).toMatchObject({
      title: 'Dentiste',
      date: local(2026, 3, 4, 9, 0),
      endDate: local(2026, 3, 4, 9, 30),
      durationMinutes: 30,
      allDay: false,
      location: 'Paris',
      description: 'Contrôle',
    });
    expect(events[1]).toMatchObject({
      title: 'Vacances',
      allDay: true,
      date: local(2026, 7, 1),
      endDate: local(2026, 7, 4),
    });
  });

  it('reads a French Outlook CSV with day-first dates and reminders', () => {
    const csv = [
      '"Objet";"Début";"Heure de début";"Fin";"Heure de fin";"Journée entière";"Rappel actif/inactif";"Catégories";"Emplacement"',
      '"Cours de piano";"16/06/2026";"18:00:00";"16/06/2026";"19:00:00";"Faux";"Vrai";"Loisirs;Musique";"Conservatoire"',
      '"";"17/06/2026";"";"";"";"Faux";"Faux";"";""',
    ].join('\r\n');
    const { events, provider, warnings } = parseCalendarCsv(csv);

    expect(provider).toBe('outlook');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: 'Cours de piano',
      date: local(2026, 6, 16, 18, 0),
      durationMinutes: 60,
      sourceReminder: true,
      sourceCategories: ['Loisirs', 'Musique'],
      location: 'Conservatoire',
    });
    expect(warnings[0]).toContain('Ligne 3');
  });

  it('reports missing columns instead of guessing', () => {
    const { events, warnings } = parseCalendarCsv('Nom,Prénom\nDupont,Jean\n');
    expect(events).toEqual([]);
    expect(warnings[0]).toContain('introuvables');
  });
});

describe('duplicate analysis', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  const existing = [
    { id: 'a', externalId: 'uid-1', title: 'Réunion', date: '2026-06-10T08:00:00.000Z' },
    { id: 'b', title: 'Sport', date: '2026-06-11T17:00:00.000Z' },
    { id: 'c', externalId: 'uid-sub', importSourceId: 'src', title: 'Match', date: '2026-06-12T18:00:00.000Z' },
  ];

  it('classifies new, updated, duplicate and past events', () => {
    const items = analyzeImportEvents([
      { externalId: 'uid-1', title: 'Réunion déplacée', date: '2026-06-10T09:00:00.000Z' },
      { title: '  sport ', date: '2026-06-11T17:00:30.000Z' },
      { title: 'Nouveau', date: '2026-06-20T10:00:00.000Z' },
      { title: 'Nouveau', date: '2026-06-20T10:00:00.000Z' },
      { title: 'Ancien', date: '2026-01-01T10:00:00.000Z' },
      { externalId: 'uid-sub', title: 'Match (modifié)', date: '2026-06-12T18:00:00.000Z' },
    ], existing, { now });

    expect(items.map(item => item.status)).toEqual(['update', 'duplicate', 'new', 'duplicate', 'new', 'duplicate']);
    expect(items[0].matchId).toBe('a');
    expect(items[4].isPast).toBe(true);
    expect(summarizeImportItems(items)).toEqual({ total: 6, new: 2, update: 1, duplicate: 3, past: 1 });
  });

  it('drives the default selection from the options', () => {
    const duplicate = { status: 'duplicate', isPast: false };
    const past = { status: 'new', isPast: true };
    const update = { status: 'update', isPast: false };
    expect(isItemSelectedByDefault(duplicate)).toBe(false);
    expect(isItemSelectedByDefault(duplicate, { skipDuplicates: false })).toBe(true);
    expect(isItemSelectedByDefault(past)).toBe(true);
    expect(isItemSelectedByDefault(past, { skipPast: true })).toBe(false);
    expect(isItemSelectedByDefault(update, { applyUpdates: false })).toBe(false);
  });
});

describe('mergeImportedEvents', () => {
  const existing = [
    { id: 'a', externalId: 'uid-1', title: 'Réunion', date: '2026-06-10T08:00:00.000Z', category: 'travail', reminder: true, todos: [{ id: 't' }] },
    { id: 'b', title: 'Sport', date: '2026-06-11T17:00:00.000Z' },
  ];

  it('updates in place while keeping user choices, appends new ones and skips duplicates', () => {
    const { events, stats } = mergeImportedEvents(existing, [
      { id: 'x', externalId: 'uid-1', title: 'Réunion', date: '2026-06-10T09:00:00.000Z', category: 'perso', reminder: false, todos: [] },
      { id: 'y', title: 'Sport', date: '2026-06-11T17:00:00.000Z' },
      { id: 'z', title: 'Concert', date: '2026-06-15T19:00:00.000Z' },
    ]);

    expect(stats).toEqual({ added: 1, updated: 1, skipped: 1 });
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ id: 'a', date: '2026-06-10T09:00:00.000Z', category: 'travail', reminder: true, todos: [{ id: 't' }] });
    expect(events[2].id).toBe('z');
  });

  it('keeps duplicates the user explicitly picked', () => {
    const { stats } = mergeImportedEvents(existing, [{ id: 'y', title: 'Sport', date: '2026-06-11T17:00:00.000Z' }], { allowDuplicates: true });
    expect(stats.added).toBe(1);
  });

  it('never rewrites events owned by a subscription', () => {
    const subscribed = [{ id: 's', externalId: 'uid-s', importSourceId: 'src', title: 'Match', date: '2026-06-12T18:00:00.000Z' }];
    const { events, stats } = mergeImportedEvents(subscribed, [{ id: 'n', externalId: 'uid-s', title: 'Autre', date: '2026-06-12T18:00:00.000Z' }]);
    expect(stats.skipped).toBe(1);
    expect(events[0].title).toBe('Match');
  });
});
