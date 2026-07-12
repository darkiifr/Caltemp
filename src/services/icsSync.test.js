import { describe, expect, it, vi } from 'vitest';
import { syncIcsSource, upsertIcsSourceEvents } from './icsSync';

describe('ICS URL sync', () => {
  it('updates existing source events, adds new events and removes missing events from the same source only', async () => {
    const existingEvents = [
      {
        id: 'local-1',
        title: 'Local',
        date: '2026-06-10T09:00:00.000Z',
        source: 'local',
      },
      {
        id: 'old-match',
        title: 'Ancien titre',
        date: '2026-06-11T18:00:00.000Z',
        source: 'ics-url',
        importSourceId: 'world-cup',
        externalId: 'match-1',
        importKey: 'world-cup:match-1',
      },
      {
        id: 'removed-match',
        title: 'Match retiré',
        date: '2026-06-12T18:00:00.000Z',
        source: 'ics-url',
        importSourceId: 'world-cup',
        externalId: 'match-removed',
        importKey: 'world-cup:match-removed',
      },
    ];

    const result = upsertIcsSourceEvents({
      existingEvents,
      importedEvents: [
        {
          title: 'Nouveau titre',
          date: '2026-06-11T19:00:00.000Z',
          externalId: 'match-1',
          importKey: 'world-cup:match-1',
          importSourceId: 'world-cup',
          source: 'ics-url',
        },
        {
          title: 'Nouveau match',
          date: '2026-06-13T19:00:00.000Z',
          externalId: 'match-2',
          importKey: 'world-cup:match-2',
          importSourceId: 'world-cup',
          source: 'ics-url',
        },
      ],
      sourceId: 'world-cup',
    });

    expect(result.stats).toMatchObject({ added: 1, updated: 1, removed: 1 });
    expect(result.events).toHaveLength(3);
    expect(result.events.find(event => event.id === 'local-1')).toBeTruthy();
    expect(result.events.find(event => event.id === 'old-match')).toMatchObject({
      title: 'Nouveau titre',
      id: 'old-match',
    });
    expect(result.events.some(event => event.id === 'removed-match')).toBe(false);
  });

  it('syncs a valid HTTPS source and reports status metadata', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      text: async () => [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:match-1',
        'DTSTART:20260611T190000Z',
        'DTEND:20260611T210000Z',
        'SUMMARY:⚽ Mexique — Afrique du Sud',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\n'),
    }));

    const result = await syncIcsSource({
      source: {
        id: 'world-cup',
        label: 'Coupe du Monde 2026',
        type: 'url',
        enabled: true,
        url: 'https://example.com/calendar.ics',
      },
      events: [],
      fetcher,
      now: new Date('2026-07-07T12:00:00.000Z'),
    });

    expect(fetcher).toHaveBeenCalledWith('https://example.com/calendar.ics', expect.objectContaining({ method: 'GET' }));
    expect(result.events).toHaveLength(1);
    expect(result.source).toMatchObject({
      lastSyncedAt: '2026-07-07T12:00:00.000Z',
      lastSyncStatus: 'ok',
    });
    expect(result.source.lastSyncMessage).toContain('1 ajouté');
  });

  it('supports the Coupe du Monde API URL with query parameters', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      text: async () => [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:match-209@coupedumonde2026.net',
        'DTSTART:20260611T190000Z',
        'DTEND:20260611T210000Z',
        'SUMMARY:Mexique - Afrique du Sud',
        'CATEGORIES:M6 / beIN Sports',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\n'),
    }));
    const url = 'https://coupedumonde2026.net/api/calendrier-ical?filter=all';

    const result = await syncIcsSource({
      source: {
        id: 'world-cup-live',
        label: 'Coupe du Monde 2026',
        type: 'url',
        enabled: true,
        url,
      },
      events: [],
      fetcher,
      now: new Date('2026-07-07T12:00:00.000Z'),
    });

    expect(fetcher).toHaveBeenCalledWith(url, expect.objectContaining({ method: 'GET' }));
    expect(result.events[0]).toMatchObject({
      externalId: 'match-209@coupedumonde2026.net',
      importSourceId: 'world-cup-live',
      category: 'sport',
      sourceCategories: ['M6 / beIN Sports'],
    });
  });

  it('rejects oversized ICS feeds before parsing', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-length': `${6 * 1024 * 1024}` }),
      text: async () => 'BEGIN:VCALENDAR\nEND:VCALENDAR',
    }));

    const result = await syncIcsSource({
      source: {
        id: 'huge',
        label: 'Trop gros',
        type: 'url',
        enabled: true,
        url: 'https://example.com/huge.ics',
      },
      events: [],
      fetcher,
      now: new Date('2026-07-07T12:00:00.000Z'),
    });

    expect(result.error).toBeTruthy();
    expect(result.source).toMatchObject({
      lastSyncStatus: 'error',
      lastSyncMessage: expect.stringContaining('trop volumineux'),
    });
  });

  it('reports invalid calendar content without changing events', async () => {
    const existingEvents = [{ id: 'local', title: 'Local', date: '2026-07-07T12:00:00.000Z' }];
    const fetcher = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-length': '12' }),
      text: async () => 'not a calendar',
    }));

    const result = await syncIcsSource({
      source: {
        id: 'broken',
        label: 'Cassé',
        type: 'url',
        enabled: true,
        url: 'https://example.com/broken.ics',
      },
      events: existingEvents,
      fetcher,
      now: new Date('2026-07-07T12:00:00.000Z'),
    });

    expect(result.events).toBe(existingEvents);
    expect(result.error).toBeTruthy();
    expect(result.source.lastSyncMessage).toContain('calendrier ICS');
  });

  it('passes an abort signal to the fetcher so subscription refreshes can time out', async () => {
    const fetcher = vi.fn(async (_url, options) => ({
      ok: true,
      headers: new Headers({ 'content-length': '84' }),
      text: async () => 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nDTSTART:20260707T120000Z\nSUMMARY:A\nEND:VEVENT\nEND:VCALENDAR',
      signalSeen: options.signal,
    }));

    await syncIcsSource({
      source: {
        id: 'timeout-ready',
        label: 'Timeout',
        type: 'url',
        enabled: true,
        url: 'https://example.com/calendar.ics',
      },
      events: [],
      fetcher,
    });

    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
