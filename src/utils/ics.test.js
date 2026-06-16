import { describe, expect, it } from 'vitest';
import { parseICS } from './ics';

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
});
