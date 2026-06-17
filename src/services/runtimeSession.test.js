import { describe, expect, it } from 'vitest';
import { consumeRuntimeSession, saveRuntimeSession } from './runtimeSession';

function createMemoryFs() {
  const files = new Map();
  return {
    files,
    async readTextFile(path) {
      if (!files.has(path)) throw new Error('missing');
      return files.get(path);
    },
    async writeTextFile(path, content) {
      files.set(path, content);
    },
    async remove(path) {
      files.delete(path);
    },
  };
}

describe('runtime session', () => {
  it('saves and consumes restart session state once', async () => {
    const fs = createMemoryFs();
    const session = {
      settingsTab: 'extensions',
      calendarView: 'week',
      selectedDate: '2026-06-17T00:00:00.000Z',
    };

    await saveRuntimeSession(session, { fs });
    const consumed = await consumeRuntimeSession({ fs });

    expect(consumed).toMatchObject(session);
    expect(fs.files.has('runtime-session.json')).toBe(false);
  });
});
