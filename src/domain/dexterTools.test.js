import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CATEGORY_LEGEND } from './events';
import {
  DEXTER_TOOLS,
  eventFieldsFromArgs,
  executeDexterTool,
  filterSettingsPatch,
  listEventOccurrences,
  parseToolDate,
} from './dexterTools';

const settings = { categoryLegend: DEFAULT_CATEGORY_LEGEND };
const NOW = new Date(2026, 9, 10, 10, 0);

function makeHost(events = []) {
  const state = { events: [...events] };
  return {
    state,
    getEvents: () => state.events,
    getSettings: () => settings,
    now: () => NOW,
    createId: () => 'new-id',
    saveEvent: vi.fn(async (event) => {
      state.events = state.events.some(item => item.id === event.id)
        ? state.events.map(item => (item.id === event.id ? event : item))
        : [...state.events, event];
      return state.events;
    }),
    navigate: vi.fn(),
    openPanel: vi.fn(),
    patchSettings: vi.fn(async () => {}),
    exportView: vi.fn(async () => {}),
    syncSubscriptions: vi.fn(async () => [{ status: 'changed' }, { status: 'error' }]),
    searchWeb: vi.fn(async () => [{ title: 'A', snippet: 'B' }]),
  };
}

describe('Dexter tool schemas', () => {
  it('declares valid OpenAI function tools with unique names', () => {
    const names = DEXTER_TOOLS.map(tool => tool.function.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of DEXTER_TOOLS) {
      expect(tool.type).toBe('function');
      expect(tool.function.parameters.type).toBe('object');
      for (const key of tool.function.parameters.required) {
        expect(tool.function.parameters.properties).toHaveProperty(key);
      }
    }
  });
});

describe('parseToolDate', () => {
  it('reads date-only values as local days', () => {
    const date = parseToolDate('2026-10-12');
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 9, 12, 9]);
  });

  it('reads local date-times and rejects garbage', () => {
    const date = parseToolDate('2026-10-12 14:30');
    expect([date.getDate(), date.getHours(), date.getMinutes()]).toEqual([12, 14, 30]);
    expect(parseToolDate('demain')).toBeNull();
  });
});

describe('listEventOccurrences', () => {
  const events = [
    { id: 'gym', title: 'Salle de sport', date: new Date(2026, 9, 12, 18).toISOString(), recurrence: 'weekly', category: 'sport' },
    { id: 'exam', title: 'Examen de maths', date: new Date(2026, 9, 15, 8).toISOString(), category: 'examen' },
    { id: 'old', title: 'Passé', date: new Date(2026, 8, 1, 8).toISOString(), category: 'perso' },
  ];

  it('expands recurring events over the next two weeks by default', () => {
    const result = listEventOccurrences(events, { now: NOW, settings });
    expect(result.events.map(event => event.id)).toEqual(['gym', 'exam', 'gym']);
    expect(result.events[0]).toMatchObject({ date: '2026-10-12T18:00', recurrence: 'weekly', category: 'sport (Sport)' });
  });

  it('filters by text and category', () => {
    expect(listEventOccurrences(events, { now: NOW, query: 'MATHS' }).events.map(event => event.id)).toEqual(['exam']);
    expect(listEventOccurrences(events, { now: NOW, category: 'sport', to: '2026-10-13' }).total).toBe(1);
  });
});

describe('eventFieldsFromArgs', () => {
  it('keeps valid fields and maps category labels to keys', () => {
    const { fields, errors } = eventFieldsFromArgs({
      title: '  Révision ',
      date: '2026-10-12T14:00',
      durationMinutes: '90',
      category: 'Examen',
      recurrence: 'often',
      reminder: 'yes',
    }, settings);
    expect(fields).toMatchObject({ title: 'Révision', durationMinutes: 90, category: 'examen' });
    expect(fields).not.toHaveProperty('recurrence');
    expect(fields).not.toHaveProperty('reminder');
    expect(errors).toEqual([]);
  });
});

describe('filterSettingsPatch', () => {
  it('only lets whitelisted, valid settings through', () => {
    expect(filterSettingsPatch({
      notificationMode: 'silent',
      fontSize: 40,
      showHolidays: false,
      localAi: { modelId: 'x' },
      categoryLegend: {},
    })).toEqual({ notificationMode: 'silent', showHolidays: false });
  });
});

describe('executeDexterTool', () => {
  it('creates an event through the host', async () => {
    const host = makeHost();
    const outcome = await executeDexterTool('create_event', { title: 'Dentiste', date: '2026-10-14T09:30', category: 'perso' }, host);
    expect(outcome.ok).toBe(true);
    expect(host.saveEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-id', title: 'Dentiste', reminder: true }));
    expect(outcome.result.created.date).toBe('2026-10-14T09:30');
    expect(outcome.display).toContain('Dentiste');
  });

  it('refuses to create an event without a date', async () => {
    const host = makeHost();
    const outcome = await executeDexterTool('create_event', { title: 'Sans date' }, host);
    expect(outcome.ok).toBe(false);
    expect(host.saveEvent).not.toHaveBeenCalled();
  });

  it('updates only the provided fields, also from an occurrence key', async () => {
    const host = makeHost([{ id: 'a', title: 'Réunion', date: new Date(2026, 9, 12, 9).toISOString(), category: 'dev', location: 'Salle 1' }]);
    const outcome = await executeDexterTool('update_event', { id: 'a:1791795600000', date: '2026-10-13T11:00' }, host);
    expect(outcome.ok).toBe(true);
    const saved = host.saveEvent.mock.calls[0][0];
    expect(saved).toMatchObject({ id: 'a', title: 'Réunion', location: 'Salle 1' });
    expect(new Date(saved.date).getDate()).toBe(13);
  });

  it('never deletes directly: it asks the user to confirm', async () => {
    const host = makeHost([{ id: 'a', title: 'Réunion', date: NOW.toISOString() }]);
    const outcome = await executeDexterTool('delete_event', { id: 'a' }, host);
    expect(outcome.confirmation).toMatchObject({ kind: 'delete_event', eventId: 'a' });
    expect(host.state.events).toHaveLength(1);
    expect((await executeDexterTool('delete_event', { id: 'nope' }, host)).ok).toBe(false);
  });

  it('finds free slots around existing events', async () => {
    const host = makeHost([{ id: 'a', title: 'Cours', date: new Date(2026, 9, 12, 8).toISOString(), durationMinutes: 240 }]);
    const outcome = await executeDexterTool('find_free_slots', { date: '2026-10-12', durationMinutes: 60 }, host);
    expect(outcome.result.slots.length).toBeGreaterThan(0);
    for (const slot of outcome.result.slots) expect(slot.start >= '12:00').toBe(true);
  });

  it('drives the app: views, panels, settings, export and sync', async () => {
    const host = makeHost();
    expect((await executeDexterTool('show_calendar', { view: 'week', date: '2026-10-20' }, host)).closesDexter).toBe(true);
    expect(host.navigate).toHaveBeenCalledWith({ view: 'week', date: expect.any(Date) });
    expect((await executeDexterTool('show_calendar', { view: 'galaxy' }, host)).ok).toBe(false);

    await executeDexterTool('open_panel', { panel: 'settings', tab: 'sounds' }, host);
    expect(host.openPanel).toHaveBeenCalledWith('settings', { tab: 'sounds', date: undefined });

    await executeDexterTool('update_settings', { notificationMode: 'silent' }, host);
    expect(host.patchSettings).toHaveBeenCalledWith({ notificationMode: 'silent' });

    await executeDexterTool('export_view', { format: 'pdf' }, host);
    expect(host.exportView).toHaveBeenCalledWith('pdf');

    const sync = await executeDexterTool('sync_subscriptions', {}, host);
    expect(sync.result).toEqual({ refreshed: 2, failed: 1 });
  });

  it('reports unknown tools to the model', async () => {
    const outcome = await executeDexterTool('format_disk', {}, makeHost());
    expect(outcome).toEqual({ ok: false, result: { error: 'Outil inconnu : format_disk.' } });
  });
});
