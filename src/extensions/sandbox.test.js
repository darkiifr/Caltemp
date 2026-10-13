import { describe, expect, it, vi } from 'vitest';
import { ExtensionManager } from './extensionManager';
import { validateExtensionManifest } from './manifest';
import { hostMatches, isCustomEventName, pickReadableSettings } from './sandbox/hostApi';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function pluginRecord(id, { permissions = [], hosts, settings, enabled = true, config } = {}) {
  return {
    enabled,
    config,
    manifest: validateExtensionManifest({ id, name: id, version: '1.0.0', permissions, hosts, settings }),
    entryCode: '',
  };
}

// A memory store with the subset of ExtensionStore the manager uses.
function createStore(records) {
  return {
    records,
    listInstalled: async () => records.map((record) => ({ ...record })),
    setEnabled: async (id, enabled) => {
      const record = records.find((item) => item.manifest.id === id);
      record.enabled = enabled;
    },
    setConfig: async (id, config) => {
      records.find((item) => item.manifest.id === id).config = config;
    },
    removeExtension: async (id) => {
      records.splice(records.findIndex((item) => item.manifest.id === id), 1);
    },
  };
}

function createManager({ records, modules, host = {}, ...options }) {
  return new ExtensionManager({
    store: createStore(records),
    host,
    rootStyle: null,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    loadPluginModule: async (record) => modules[record.manifest.id],
    ...options,
  });
}

describe('plugin sandbox', () => {
  it('registers commands that call back into the plugin and removes them on disable', async () => {
    const dispose = vi.fn();
    const actions = [];
    const run = vi.fn(() => 'done');
    const id = 'com.example.commands';
    const manager = createManager({
      records: [pluginRecord(id)],
      modules: { [id]: { activate: (ctx) => { ctx.commands.register({ id: 'go', label: 'Go', run }); } } },
      host: {
        registerAction: (action) => {
          actions.push(action);
          return dispose;
        },
      },
    });

    await manager.initialize();
    await flush();

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ id: `${id}:go`, label: 'Go', extensionId: id });
    await expect(actions[0].run()).resolves.toBe('done');
    expect(run).toHaveBeenCalledOnce();

    await manager.setEnabled(id, false);

    expect(dispose).toHaveBeenCalledOnce();
    expect(manager.getStatus(id)).toBe('disabled');
    await expect(actions[0].run()).rejects.toThrow(/arrêtée/);
  });

  it('only sends calendar details to plugins allowed to read the calendar', async () => {
    const received = { reader: [], blind: [] };
    const manager = createManager({
      records: [
        pluginRecord('com.example.reader', { permissions: ['calendar:read'] }),
        pluginRecord('com.example.blind'),
      ],
      modules: {
        'com.example.reader': { activate: (ctx) => { ctx.on('calendar:event-created', (p) => received.reader.push(p)); } },
        'com.example.blind': { activate: (ctx) => { ctx.on('calendar:event-created', (p) => received.blind.push(p)); } },
      },
    });

    await manager.initialize();
    await flush();
    manager.emit('calendar:event-created', { event: { id: 'e1', title: 'Rendez-vous privé' } });
    await flush();

    expect(received.reader).toEqual([{ event: { id: 'e1', title: 'Rendez-vous privé' } }]);
    expect(received.blind).toEqual([{ eventId: 'e1' }]);
  });

  it('filters settings:changed payloads', async () => {
    const received = { reader: [], blind: [] };
    const manager = createManager({
      records: [
        pluginRecord('com.example.settings-reader', { permissions: ['settings:read'] }),
        pluginRecord('com.example.settings-blind'),
      ],
      modules: {
        'com.example.settings-reader': { activate: (ctx) => { ctx.on('settings:changed', (p) => received.reader.push(p)); } },
        'com.example.settings-blind': { activate: (ctx) => { ctx.on('settings:changed', (p) => received.blind.push(p)); } },
      },
    });

    await manager.initialize();
    await flush();
    manager.emit('settings:changed', { settings: { theme: 'dark', icsSources: [{ url: 'https://x/secret.ics' }] } });
    await flush();

    expect(received.reader).toEqual([{ settings: { theme: 'dark' } }]);
    expect(received.blind).toEqual([{}]);
  });

  it('enforces permissions on the host side', async () => {
    const createEvent = vi.fn();
    const id = 'com.example.blocked';
    const manager = createManager({
      records: [pluginRecord(id)],
      modules: { [id]: { activate: (ctx) => ctx.calendar.create({ title: 'x' }) } },
      host: { createEvent },
    });

    await manager.initialize();

    expect(createEvent).not.toHaveBeenCalled();
    expect(manager.getStatus(id)).toBe('error');
    expect(manager.getInstalled()[0].error).toMatch(/calendar:write/);
  });

  it('lets plugins talk through custom events but not spoof app events', async () => {
    const heard = vi.fn();
    let spoofError = null;
    const manager = createManager({
      records: [pluginRecord('com.example.sender'), pluginRecord('com.example.listener')],
      modules: {
        'com.example.sender': {
          activate: async (ctx) => {
            ctx.commands.register({
              id: 'send',
              label: 'Send',
              run: async () => {
                await ctx.emit('sender:ping', { n: 1 });
                await ctx.emit('calendar:event-deleted', { eventId: 'x' }).catch((error) => {
                  spoofError = error;
                });
              },
            });
          },
        },
        'com.example.listener': { activate: (ctx) => { ctx.on('sender:ping', heard); } },
      },
      host: { registerAction: (action) => { manager.sendAction = action; return () => {}; } },
    });

    await manager.initialize();
    await flush();
    await manager.sendAction.run();
    await flush();

    expect(heard).toHaveBeenCalledWith({ n: 1 });
    expect(spoofError?.message).toMatch(/personnalisés/);
  });

  it('keeps private storage across reloads and pushes config changes live', async () => {
    const id = 'com.example.stateful';
    const seen = [];
    const records = [pluginRecord(id, { settings: [{ key: 'name', default: 'Ada' }] })];
    const manager = createManager({
      records,
      modules: {
        [id]: {
          activate: async (ctx) => {
            const runs = ((await ctx.storage.get('runs')) || 0) + 1;
            await ctx.storage.set('runs', runs);
            seen.push({ runs, name: ctx.config.get('name') });
            ctx.config.onChange((config) => seen.push({ changed: config.name }));
          },
        },
      },
    });

    await manager.initialize();
    await manager.saveConfig(id, { name: 'Grace' });
    await flush();
    await manager.reload(id);

    expect(seen).toEqual([
      { runs: 1, name: 'Ada' },
      { changed: 'Grace' },
      { runs: 2, name: 'Grace' },
    ]);
    expect(records[0].config).toEqual({ name: 'Grace' });
  });

  it('restricts http.fetch to the hosts declared in the manifest', async () => {
    const id = 'com.example.net';
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '{"temp":21}',
      headers: new Map([['content-type', 'application/json']]),
    }));
    const results = {};
    const manager = createManager({
      records: [pluginRecord(id, { permissions: ['network'], hosts: ['*.example.com'] })],
      modules: {
        [id]: {
          activate: async (ctx) => {
            results.allowed = await (await ctx.http.fetch('https://api.example.com/weather')).json();
            results.denied = await ctx.http.fetch('https://evil.test/steal').catch((error) => error.message);
            results.plain = await ctx.http.fetch('http://api.example.com/').catch((error) => error.message);
          },
        },
      },
      host: { fetch },
    });

    await manager.initialize();

    expect(results.allowed).toEqual({ temp: 21 });
    expect(results.denied).toMatch(/evil\.test/);
    expect(results.plain).toMatch(/HTTPS/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows sanitized panels whose buttons run plugin code', async () => {
    const id = 'com.example.panel';
    const clicked = vi.fn();
    let shown = null;
    const manager = createManager({
      records: [pluginRecord(id)],
      modules: {
        [id]: {
          activate: async (ctx) => {
            await ctx.ui.showPanel({
              title: 'Panneau',
              blocks: [
                { type: 'text', text: 'Bonjour' },
                { type: 'image', url: 'javascript:alert(1)' },
                { type: 'script', code: 'x' },
                { type: 'actions', items: [{ label: 'OK', variant: 'primary', onClick: clicked }] },
              ],
            });
          },
        },
      },
      host: {
        showPanel: (panel) => {
          shown = panel;
          return { close: vi.fn() };
        },
      },
    });

    await manager.initialize();

    expect(shown.title).toBe('Panneau');
    expect(shown.blocks.map((block) => block.type)).toEqual(['text', 'actions']);
    await shown.blocks[1].items[0].onClick();
    expect(clicked).toHaveBeenCalledOnce();
  });

  it('isolates a failing plugin from the others', async () => {
    const ok = vi.fn();
    const manager = createManager({
      records: [pluginRecord('com.example.broken'), pluginRecord('com.example.fine')],
      modules: {
        'com.example.broken': { activate: () => { throw new Error('boom'); } },
        'com.example.fine': { default: { activate: ok } },
      },
    });

    await manager.initialize();

    expect(ok).toHaveBeenCalledOnce();
    expect(manager.getStatus('com.example.broken')).toBe('error');
    expect(manager.getStatus('com.example.fine')).toBe('active');
  });
});

describe('host API helpers', () => {
  it('matches exact and wildcard hosts', () => {
    expect(hostMatches('api.example.com', ['api.example.com'])).toBe(true);
    expect(hostMatches('a.b.example.com', ['*.example.com'])).toBe(true);
    expect(hostMatches('example.com', ['*.example.com'])).toBe(false);
    expect(hostMatches('notexample.com', ['*.example.com'])).toBe(false);
  });

  it('recognizes custom event names', () => {
    expect(isCustomEventName('meteo:updated')).toBe(true);
    expect(isCustomEventName('calendar:event-created')).toBe(false);
    expect(isCustomEventName('nocolon')).toBe(false);
  });

  it('exposes display settings only', () => {
    expect(pickReadableSettings({ theme: 'dark', icsSources: [{ url: 'secret' }], localAi: {} }))
      .toEqual({ theme: 'dark' });
  });
});
