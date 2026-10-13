import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExtensionStorage } from './extensionStorage';

describe('createExtensionStorage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('isolates extensions and coalesces disk writes', async () => {
    vi.useFakeTimers();
    const disk = { 'com.example.a': { saved: true } };
    const backend = {
      read: vi.fn(async (id) => disk[id] || {}),
      write: vi.fn(async (id, data) => {
        disk[id] = data;
      }),
    };
    const storage = createExtensionStorage(backend);
    const a = storage.forExtension('com.example.a');
    const b = storage.forExtension('com.example.b');

    expect(await a.get('saved')).toBe(true);
    await a.set('count', 1);
    await a.set('count', 2);
    expect(await b.get('count')).toBeUndefined();
    expect(backend.write).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(backend.write).toHaveBeenCalledTimes(1);
    expect(disk['com.example.a']).toEqual({ saved: true, count: 2 });
  });

  it('returns copies and enforces the size limit', async () => {
    const storage = createExtensionStorage().forExtension('com.example.c');
    const value = { list: [1] };
    await storage.set('value', value);
    value.list.push(2);
    expect(await storage.get('value')).toEqual({ list: [1] });

    await expect(storage.set('big', 'x'.repeat(1024 * 1024 + 1))).rejects.toThrow(/1 Mo/);
    await expect(storage.set('', 1)).rejects.toThrow(/clé/);
  });
});
