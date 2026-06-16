import { describe, expect, it } from 'vitest';
import { normalizeIcsSources } from './icsSources';

describe('ICS sources', () => {
  it('includes popular editable presets', () => {
    const sources = normalizeIcsSources([]);

    expect(sources.map(source => source.id)).toEqual(expect.arrayContaining([
      'fr-holidays',
      'google-calendar-private',
      'outlook-calendar-published',
      'icloud-calendar-public',
      'moodle-ent-calendar',
    ]));
    expect(sources.find(source => source.id === 'google-calendar-private').needsUrl).toBe(true);
    expect(sources.find(source => source.id === 'google-calendar-private').helpUrl).toContain('support.google.com');
    expect(sources.find(source => source.id === 'calendarlabs-fr').helpUrl).toContain('calendarlabs.com');
  });

  it('preserves custom user sources', () => {
    const sources = normalizeIcsSources([{ label: 'Mon école', url: 'https://example.com/calendar.ics' }]);

    expect(sources.find(source => source.label === 'Mon école')).toMatchObject({
      type: 'url',
      enabled: true,
      url: 'https://example.com/calendar.ics',
    });
  });
});
