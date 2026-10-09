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

describe('ICS sync state', () => {
  it('keeps form edits but takes the sync status from the live sources', async () => {
    const { mergeIcsSyncState, addDismissedIcsKey } = await import('./icsSources');
    const stale = [{ id: 'a', label: 'Renommé', url: 'https://example.com/a.ics', lastSyncedAt: '2026-01-01T00:00:00.000Z', etag: 'old' }];
    const live = [{ id: 'a', label: 'Ancien', url: 'https://example.com/a.ics', lastSyncedAt: '2026-07-07T12:00:00.000Z', etag: 'new', dismissedKeys: ['a:1'] }];
    const merged = mergeIcsSyncState(stale, live).find(source => source.id === 'a');
    expect(merged).toMatchObject({ label: 'Renommé', lastSyncedAt: '2026-07-07T12:00:00.000Z', etag: 'new', dismissedKeys: ['a:1'] });
    expect(addDismissedIcsKey(['x', 'y'], 'x')).toEqual(['y', 'x']);
  });
});
