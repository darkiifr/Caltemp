import { describe, expect, it, vi } from 'vitest';
import { ExtensionManager } from './extensionManager';
import { getBundledExtensionExamples } from './localExamples';
import { parseQuickEntry } from '../../examples/extensions/quick-add/index.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const examples = getBundledExtensionExamples();
const plugins = examples.filter((example) => example.manifest.type === 'plugin');
const modules = import.meta.glob('../../examples/extensions/*/index.js');

const inDays = (days, hour = 10) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

// Runs one bundled example plugin, in-process, against a recording host.
async function runExample(id, { events = [], config, hostOverrides = {} } = {}) {
  const example = examples.find((item) => item.manifest.id === id);
  const calls = { actions: new Map(), panels: [], toasts: [], notifications: [], galleries: [], created: [] };
  const host = {
    getEvents: () => events,
    getSettings: () => ({ theme: 'dark' }),
    createEvent: async (event) => {
      const saved = { id: `new-${calls.created.length}`, color: '#22c55e', ...event };
      calls.created.push(saved);
      return saved;
    },
    notify: (title, body, type) => calls.notifications.push({ title, body, type }),
    toast: (title, body, type) => calls.toasts.push({ body, type }),
    registerAction: (action) => {
      calls.actions.set(action.id.split(':').pop(), action);
      return () => calls.actions.delete(action.id.split(':').pop());
    },
    openGallery: (gallery) => calls.galleries.push(gallery),
    showPanel: (panel) => {
      const entry = { current: panel, closed: false };
      calls.panels.push(entry);
      return {
        update: (next) => {
          entry.current = next;
        },
        close: () => {
          entry.closed = true;
        },
      };
    },
    ...hostOverrides,
  };
  const manager = new ExtensionManager({
    rootStyle: null,
    host,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    store: { listInstalled: async () => [{ enabled: true, config, manifest: example.manifest, entryCode: example.entryCode }] },
    loadPluginModule: () => modules[`../../${example.folderPath}/index.js`](),
  });
  await manager.initialize();
  await flush();
  const run = async (command, ...args) => {
    const result = await calls.actions.get(command).run(...args);
    await flush();
    return result;
  };
  const lastPanel = () => calls.panels.at(-1)?.current;
  const blocksOf = (type) => lastPanel()?.blocks.filter((block) => block.type === type) || [];
  return { manager, calls, run, lastPanel, blocksOf };
}

describe('bundled examples', () => {
  it('bundles every example folder with a valid manifest', () => {
    expect(examples.length).toBeGreaterThanOrEqual(15);
    expect(new Set(examples.map((example) => example.manifest.id)).size).toBe(examples.length);
    for (const example of plugins) expect(example.entryCode).toMatch(/export (async )?function activate/);
    for (const theme of examples.filter((example) => example.manifest.type === 'theme')) {
      expect(theme.manifest.theme.variables['--caltemp-accent']).toMatch(/^#/);
    }
  });

  it.each(plugins.map((example) => example.manifest.id))('%s activates and registers commands', async (id) => {
    const { manager, calls } = await runExample(id);

    expect(manager.getErrors()).toEqual([]);
    expect(manager.getStatus(id)).toBe('active');
    expect(calls.actions.size).toBeGreaterThan(0);
  });
});

describe('example plugins', () => {
  it('hello shows a toast', async () => {
    const { run, calls } = await runExample('com.caltemp.examples.hello');
    await run('hello');
    expect(calls.toasts[0].body).toMatch(/Bonjour/);
  });

  it('french-football-gallery opens its gallery', async () => {
    const { run, calls } = await runExample('com.caltemp.examples.french-football-gallery');
    await run('open');
    expect(calls.galleries[0].items.length).toBeGreaterThan(5);
  });

  it('week-summary counts upcoming occurrences', async () => {
    const events = [
      { id: 'a', title: 'Cours de maths', date: inDays(1), category: 'cours', durationMinutes: 90 },
      { id: 'b', title: 'Footing', date: inDays(2), category: 'sport' },
      { id: 'c', title: 'Passé', date: inDays(-3) },
    ];
    const { run, blocksOf } = await runExample('com.caltemp.examples.week-summary', { events });
    await run('open');

    expect(blocksOf('stats')[0].items[0]).toEqual({ label: 'Événements', value: '2' });
    expect(blocksOf('list')[0].items.map((item) => item.title)).toEqual(['Cours de maths', 'Footing']);
  });

  it('pomodoro starts a focus session from its panel', async () => {
    const { run, lastPanel, blocksOf } = await runExample('com.caltemp.examples.pomodoro', { config: { focusMinutes: 25 } });
    await run('open');
    expect(blocksOf('stats')[0].items[0].value).toBe('Prêt');

    await blocksOf('actions')[0].items[0].onClick();
    await flush();

    expect(lastPanel().description).toMatch(/Concentration · 2[45]:\d\d/);
    await run('stop');
    expect(blocksOf('stats')[0].items[0].value).toBe('Prêt');
  });

  it('quick-add parses the prompt and creates the event', async () => {
    const prompt = vi.fn(async () => 'Dentiste demain 14h30 pendant 45 min');
    const { run, calls } = await runExample('com.caltemp.examples.quick-add', {
      config: { category: 'perso', reminder: true },
      hostOverrides: { prompt },
    });
    await run('add');

    expect(prompt).toHaveBeenCalledOnce();
    expect(calls.created[0]).toMatchObject({ title: 'Dentiste', durationMinutes: 45, category: 'perso', reminder: true });
    const date = new Date(calls.created[0].date);
    expect([date.getHours(), date.getMinutes()]).toEqual([14, 30]);
    expect(calls.toasts[0].body).toMatch(/Ajouté : Dentiste/);
  });

  it('quick-add does nothing when the prompt is cancelled', async () => {
    const { run, calls } = await runExample('com.caltemp.examples.quick-add', {
      hostOverrides: { prompt: async () => null },
    });
    await run('add');
    expect(calls.created).toEqual([]);
  });

  it('reminder-log records triggered reminders', async () => {
    const { manager, run, blocksOf } = await runExample('com.caltemp.examples.reminder-log');
    manager.emit('reminder:triggered', {
      event: { id: 'e', title: 'Rendez-vous', color: '#f00' },
      occurrence: inDays(0, 15),
      phase: 'final',
    });
    await flush();
    await flush();
    await run('open');

    expect(blocksOf('list')[0].items[0]).toMatchObject({ title: 'Rendez-vous', color: '#f00' });
  });

  it('countdown lists matching deadlines and warns on start', async () => {
    const events = [
      { id: 'x', title: 'Partiel de physique', date: inDays(2), category: 'examen' },
      { id: 'y', title: 'Ciné', date: inDays(1), category: 'perso' },
    ];
    const { manager, run, calls, blocksOf } = await runExample('com.caltemp.examples.countdown', { events });
    await run('open');
    expect(blocksOf('list')[0].items).toEqual([expect.objectContaining({ title: 'Partiel de physique', meta: 'J-2' })]);

    manager.emit('app:ready', {});
    await flush();
    await flush();
    await flush();
    expect(calls.notifications[0]).toMatchObject({ title: 'Échéance proche', type: 'warning' });
  });

  it('weather geocodes the city and shows the forecast through declared hosts only', async () => {
    const json = (body) => ({ ok: true, status: 200, headers: new Map(), text: async () => JSON.stringify(body) });
    const fetch = vi.fn(async (url) => {
      if (url.startsWith('https://geocoding-api.open-meteo.com/')) {
        return json({ results: [{ name: 'Lyon', admin1: 'Auvergne-Rhône-Alpes', country: 'France', latitude: 45.75, longitude: 4.85 }] });
      }
      return json({
        current: { temperature_2m: 18.4, apparent_temperature: 17.2, weather_code: 2, wind_speed_10m: 11 },
        daily: {
          time: ['2026-10-13', '2026-10-14', '2026-10-15'],
          weather_code: [2, 63, 0],
          temperature_2m_max: [19, 15, 21],
          temperature_2m_min: [9, 8, 7],
          precipitation_probability_max: [10, 80, 0],
        },
      });
    });
    const { run, lastPanel, blocksOf } = await runExample('com.caltemp.examples.weather', {
      config: { city: 'Lyon' },
      hostOverrides: { fetch },
    });
    await run('open');

    expect(fetch.mock.calls[0][0]).toMatch(/name=Lyon/);
    expect(lastPanel().title).toBe('Météo · Lyon, Auvergne-Rhône-Alpes, France');
    expect(blocksOf('stats')[0].items[0].value).toBe('18 °C');
    expect(blocksOf('list')[0].items[1].subtitle).toBe('Pluie · pluie 80 %');

    await run('open');
    expect(fetch).toHaveBeenCalledTimes(2); // second opening served from the cache
  });
});

describe('parseQuickEntry', () => {
  // Tuesday 13 October 2026, 10:00.
  const now = new Date(2026, 9, 13, 10, 0, 0);
  const parse = (input) => parseQuickEntry(input, { now, defaultHour: 9 });
  const parts = (date) => [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];

  it('reads relative days, weekdays and times', () => {
    expect(parts(parse('Dentiste demain 14h30').date)).toEqual([2026, 10, 14, 14, 30]);
    expect(parse('Dentiste demain 14h30').title).toBe('Dentiste');
    expect(parts(parse('Réunion lundi à 9h').date)).toEqual([2026, 10, 19, 9, 0]);
    expect(parts(parse('Sport mardi 18:15').date)).toEqual([2026, 10, 20, 18, 15]);
    expect(parts(parse('Courses après-demain').date)).toEqual([2026, 10, 15, 9, 0]);
    expect(parts(parse('Dîner ce soir').date)).toEqual([2026, 10, 13, 19, 0]);
  });

  it('reads explicit dates, delays and durations', () => {
    expect(parts(parse('Partiel 12/06 8h').date)).toEqual([2027, 6, 12, 8, 0]);
    expect(parts(parse('Partiel le 20/10/2026 à 8h').date)).toEqual([2026, 10, 20, 8, 0]);
    expect(parts(parse('Appeler maman dans 2h').date)).toEqual([2026, 10, 13, 12, 0]);
    expect(parse('Appeler maman dans 2h').title).toBe('Appeler maman');
    expect(parse('Révisions demain 10h pendant 1h30').durationMinutes).toBe(90);
    expect(parse('Pause dans 3 jours pendant 20 min').durationMinutes).toBe(20);
  });

  it('falls back to the default hour today', () => {
    const entry = parse('Faire les courses');
    expect(parts(entry.date)).toEqual([2026, 10, 13, 9, 0]);
    expect(entry.hasTime).toBe(false);
  });
});
