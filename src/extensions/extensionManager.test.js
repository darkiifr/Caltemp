import { describe, expect, it, vi } from 'vitest';
import { ExtensionManager } from './extensionManager';

describe('ExtensionManager', () => {
  it('activates enabled plugins and emits app ready', async () => {
    const activate = vi.fn((ctx) => {
      ctx.events.on('app:ready', () => ctx.logger.info('ready'));
    });
    const manager = new ExtensionManager({
      store: {
        listInstalled: async () => [
          {
            enabled: true,
            manifest: {
              id: 'com.caltemp.plugin.ready',
              name: 'Ready plugin',
              type: 'plugin',
              version: '1.0.0',
              sdkVersion: '1.0.0',
              compatibility: { caltemp: '>=6.0.0' },
              entry: 'index.js',
              permissions: [],
            },
            entryCode: 'export function activate() {}',
          },
        ],
      },
      loadPluginModule: async () => ({ activate }),
    });

    await manager.initialize();
    manager.emit('app:ready');

    expect(activate).toHaveBeenCalledOnce();
    expect(manager.getInstalled()).toHaveLength(1);
  });

  it('applies enabled theme variables', async () => {
    const style = { setProperty: vi.fn(), removeProperty: vi.fn() };
    const manager = new ExtensionManager({
      rootStyle: style,
      store: {
        listInstalled: async () => [
          {
            enabled: true,
            manifest: {
              id: 'com.caltemp.theme.aurora',
              name: 'Aurora',
              type: 'theme',
              version: '1.0.0',
              sdkVersion: '1.0.0',
              compatibility: { caltemp: '>=6.0.0' },
              permissions: [],
              theme: { variables: { '--caltemp-accent': '#67e8f9' } },
            },
          },
        ],
      },
    });

    await manager.initialize();

    expect(style.setProperty).toHaveBeenCalledWith('--caltemp-accent', '#67e8f9');
  });

  it('blocks SDK calendar writes without permission', async () => {
    const manager = new ExtensionManager({
      store: {
        listInstalled: async () => [
          {
            enabled: true,
            manifest: {
              id: 'com.caltemp.plugin.blocked',
              name: 'Blocked plugin',
              type: 'plugin',
              version: '1.0.0',
              sdkVersion: '1.0.0',
              compatibility: { caltemp: '>=6.0.0' },
              entry: 'index.js',
              permissions: [],
            },
          },
        ],
      },
      loadPluginModule: async () => ({
        activate: (ctx) => ctx.calendar.createEvent({ title: 'blocked' }),
      }),
    });

    await expect(manager.initialize()).resolves.not.toThrow();
    expect(manager.getErrors()[0].message).toMatch(/calendar:write/i);
  });

  it('exposes a host-backed gallery UI method to plugins', async () => {
    const openGallery = vi.fn();
    const gallery = {
      title: 'Galerie Bleus',
      description: 'Photos de footballeurs français',
      items: [{ name: 'Kylian Mbappé', imageUrl: 'https://example.com/mbappe.jpg' }],
    };
    const manager = new ExtensionManager({
      host: { openGallery },
      store: {
        listInstalled: async () => [
          {
            enabled: true,
            manifest: {
              id: 'com.caltemp.plugin.gallery',
              name: 'Gallery plugin',
              type: 'plugin',
              version: '1.0.0',
              sdkVersion: '1.1.0',
              compatibility: { caltemp: '>=6.0.0' },
              entry: 'index.js',
              permissions: [],
            },
          },
        ],
      },
      loadPluginModule: async () => ({
        activate: (ctx) => ctx.ui.openGallery(gallery),
      }),
    });

    await manager.initialize();

    expect(openGallery).toHaveBeenCalledWith(gallery);
  });
});
