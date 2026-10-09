import { describe, expect, it, vi } from 'vitest';
import { applyIcsFetchResult, fetchIcsSource, hashIcsContent, syncIcsSource, upsertIcsSourceEvents } from './icsSync';

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

  const FEED = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:a',
    'DTSTART:20260707T120000Z',
    'SUMMARY:A',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');
  const source = {
    id: 'feed',
    label: 'Flux',
    type: 'url',
    enabled: true,
    url: 'https://example.com/feed.ics',
  };
  const okResponse = (body, headers = {}) => ({ ok: true, status: 200, headers: new Headers(headers), text: async () => body });
  const now = new Date('2026-07-07T12:00:00.000Z');

  it('sends HTTP validators and skips the merge on 304 Not Modified', async () => {
    const first = await syncIcsSource({
      source,
      events: [],
      fetcher: vi.fn(async () => okResponse(FEED, { etag: '"v1"', 'last-modified': 'Tue, 07 Jul 2026 10:00:00 GMT' })),
      now,
    });
    expect(first.source).toMatchObject({ etag: '"v1"', contentHash: expect.any(String) });
    expect(hashIcsContent(FEED, 'a')).not.toBe(hashIcsContent(FEED, 'b'));

    const fetcher = vi.fn(async () => ({ ok: false, status: 304, headers: new Headers() }));
    const result = await fetchIcsSource({
      source: first.source,
      events: first.events,
      fetcher,
      now: new Date('2026-07-07T12:05:00.000Z'),
    });
    expect(fetcher).toHaveBeenCalledWith(source.url, expect.objectContaining({
      headers: { 'If-None-Match': '"v1"', 'If-Modified-Since': 'Tue, 07 Jul 2026 10:00:00 GMT' },
    }));
    expect(result.status).toBe('unchanged');
    expect(result.source.lastSyncMessage).toContain('aucun changement');
    const applied = applyIcsFetchResult({ events: first.events, result });
    expect(applied.events).toBe(first.events);
    expect(applied.changed).toBe(false);
  });

  it('treats an identical body as unchanged even without HTTP validators', async () => {
    const first = await syncIcsSource({ source, events: [], fetcher: async () => okResponse(FEED), now });
    const result = await fetchIcsSource({
      source: first.source,
      events: first.events,
      fetcher: async () => okResponse(FEED),
      now: new Date('2026-07-07T12:05:00.000Z'),
    });
    expect(result.status).toBe('unchanged');
  });

  it('re-reads everything when the source has no events yet or once a day', async () => {
    const first = await syncIcsSource({ source, events: [], fetcher: async () => okResponse(FEED, { etag: '"v1"' }), now });
    const fetcher = vi.fn(async () => okResponse(FEED, { etag: '"v1"' }));
    const noEvents = await fetchIcsSource({ source: first.source, events: [], fetcher, now });
    expect(fetcher.mock.calls[0][1].headers).toBeUndefined();
    expect(noEvents.status).toBe('changed');

    const nextDay = await fetchIcsSource({
      source: first.source,
      events: first.events,
      fetcher,
      now: new Date('2026-07-08T13:00:00.000Z'),
    });
    expect(nextDay.status).toBe('changed');
  });

  it('keeps unchanged events as the same objects and preserves local overrides', () => {
    const existing = upsertIcsSourceEvents({
      existingEvents: [],
      importedEvents: [
        { title: 'Cours', date: '2026-07-07T08:00:00.000Z', externalId: 'c1', importKey: 'feed:c1', importSourceId: 'feed', source: 'ics-url' },
        { title: 'TD', date: '2026-07-08T08:00:00.000Z', externalId: 'c2', importKey: 'feed:c2', importSourceId: 'feed', source: 'ics-url' },
      ],
      sourceId: 'feed',
    }).events;
    const userEdited = { ...existing[1], reminder: true, title: 'TD (salle 12)', localOverrides: ['reminder', 'title'] };

    const result = upsertIcsSourceEvents({
      existingEvents: [existing[0], userEdited],
      importedEvents: [
        { title: 'Cours', date: '2026-07-07T08:00:00.000Z', externalId: 'c1', importKey: 'feed:c1', importSourceId: 'feed', source: 'ics-url' },
        { title: 'TD', date: '2026-07-08T09:00:00.000Z', externalId: 'c2', importKey: 'feed:c2', importSourceId: 'feed', source: 'ics-url', reminder: false },
      ],
      sourceId: 'feed',
    });

    expect(result.events[0]).toBe(existing[0]);
    expect(result.events[1]).toMatchObject({
      id: existing[1].id,
      title: 'TD (salle 12)',
      reminder: true,
      date: '2026-07-08T09:00:00.000Z',
    });
    expect(result.stats).toEqual({ added: 0, updated: 1, removed: 0 });
  });

  it('does not bring back events the user deleted from a subscription', async () => {
    const result = await syncIcsSource({
      source: { ...source, dismissedKeys: ['feed:a'] },
      events: [],
      fetcher: async () => okResponse(FEED),
      now,
    });
    expect(result.events).toHaveLength(0);
  });

  it('accepts webcal:// subscription links', async () => {
    const fetcher = vi.fn(async () => okResponse(FEED));
    const result = await syncIcsSource({ source: { ...source, url: 'webcal://example.com/feed.ics' }, events: [], fetcher, now });
    expect(fetcher).toHaveBeenCalledWith('https://example.com/feed.ics', expect.anything());
    expect(result.events).toHaveLength(1);
  });

  it('counts consecutive failures for backoff', async () => {
    const failing = async () => { throw new Error('offline'); };
    const once = await fetchIcsSource({ source, events: [], fetcher: failing, now });
    const twice = await fetchIcsSource({ source: once.source, events: [], fetcher: failing, now });
    expect(twice.source).toMatchObject({ lastSyncStatus: 'error', failureCount: 2 });
  });
});
