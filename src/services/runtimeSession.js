import { BaseDirectory, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs';

const RUNTIME_SESSION_FILE = 'runtime-session.json';

const defaultFs = {
  readTextFile,
  remove,
  writeTextFile,
};

function appDataOptions() {
  return { baseDir: BaseDirectory.AppData };
}

export async function saveRuntimeSession(session, { fs = defaultFs } = {}) {
  const payload = {
    savedAt: new Date().toISOString(),
    settingsTab: session.settingsTab || 'extensions',
    calendarView: session.calendarView || 'month',
    selectedDate: session.selectedDate || null,
  };

  await fs.writeTextFile(RUNTIME_SESSION_FILE, JSON.stringify(payload, null, 2), appDataOptions());
  return payload;
}

export async function consumeRuntimeSession({ fs = defaultFs } = {}) {
  try {
    const session = JSON.parse(await fs.readTextFile(RUNTIME_SESSION_FILE, appDataOptions()));
    await fs.remove(RUNTIME_SESSION_FILE, appDataOptions());
    return session;
  } catch {
    return null;
  }
}
