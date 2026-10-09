// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildZip } from '../test/zipFixture';
import { readZipEntries } from '../utils/zip';
import { decodeImportText, parseImportSources } from './calendarImportFiles';

const ICS = (name, uid, summary) => [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  `X-WR-CALNAME:${name}`,
  'BEGIN:VEVENT',
  `UID:${uid}`,
  'DTSTART:20260616T080000Z',
  'DTEND:20260616T090000Z',
  `SUMMARY:${summary}`,
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('readZipEntries', () => {
  it('reads stored and deflated entries and skips folders and filtered files', async () => {
    const zip = buildZip([
      { name: 'a.ics', content: 'hello', store: true },
      { name: 'dir/', content: '', store: true },
      { name: 'b.ics', content: 'deflated content '.repeat(20) },
      { name: 'readme.txt', content: 'skip me' },
    ]);
    const entries = await readZipEntries(zip, { filter: name => name.endsWith('.ics') });
    expect(entries.map(entry => entry.name)).toEqual(['a.ics', 'b.ics']);
    expect(new TextDecoder().decode(entries[1].bytes)).toBe('deflated content '.repeat(20));
  });

  it('rejects invalid archives and oversized entries', async () => {
    await expect(readZipEntries(new Uint8Array([1, 2, 3]))).rejects.toThrow('ZIP invalide');
    const zip = buildZip([{ name: 'big.ics', content: 'x'.repeat(100) }]);
    await expect(readZipEntries(zip, { limits: { maxEntries: 10, maxEntryBytes: 10, maxTotalBytes: 100 } })).rejects.toThrow('trop volumineux');
  });
});

describe('decodeImportText', () => {
  it('falls back to Windows-1252 for legacy Outlook CSV files', () => {
    const latin = new Uint8Array([0x52, 0xe9, 0x75, 0x6e, 0x69, 0x6f, 0x6e]); // "Réunion"
    expect(decodeImportText(latin)).toBe('Réunion');
    expect(decodeImportText(new TextEncoder().encode('\uFEFFÉté'))).toBe('Été');
  });
});

describe('parseImportSources', () => {
  it('expands a Google export ZIP into one calendar per .ics file', async () => {
    const zip = buildZip([
      { name: 'perso@gmail.com.ics', content: ICS('Perso', 'u1@google.com', 'Anniversaire') },
      { name: 'travail.ics', content: ICS('Travail', 'u2@google.com', 'Réunion') },
    ]);
    const calendars = await parseImportSources([{ name: '/home/me/Downloads/takeout.zip', bytes: zip }]);

    expect(calendars).toHaveLength(2);
    expect(calendars[0]).toMatchObject({ name: 'Perso', provider: 'google', format: 'ics', fileName: 'takeout.zip › perso@gmail.com.ics' });
    expect(calendars[1].events[0]).toMatchObject({ title: 'Réunion', externalId: 'u2@google.com' });
  });

  it('parses pasted CSV text and reports unreadable files without throwing', async () => {
    const calendars = await parseImportSources([
      { name: 'Texte collé', text: 'Subject,Start Date,Start Time\nYoga,06/16/2026,7:00 AM\n' },
      { name: 'C:\\exports\\vide.ics', bytes: new TextEncoder().encode('BEGIN:VCALENDAR\r\nEND:VCALENDAR') },
      { name: 'notes.bin', bytes: new Uint8Array([0, 1, 2]) },
    ]);

    expect(calendars[0]).toMatchObject({ format: 'csv', provider: 'other' });
    expect(calendars[0].events[0].title).toBe('Yoga');
    expect(calendars[1]).toMatchObject({ fileName: 'vide.ics', error: 'Aucun événement trouvé dans ce fichier.' });
    expect(calendars[2].error).toContain('Format non reconnu');
  });
});
