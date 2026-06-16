import { readTextFile, writeTextFile, exists, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { normalizeEvents, normalizeSettings } from '../domain/events';
// import { appDataDir } from '@tauri-apps/api/path';

const EVENTS_FILE = 'events.json';
const SETTINGS_FILE = 'settings.json';
let portableModePromise;

async function isPortableMode() {
    if (!window.__TAURI_INTERNALS__) return false;
    if (!portableModePromise) {
        portableModePromise = invoke('is_portable_mode')
            .catch(error => {
                console.error('Failed to detect portable mode:', error);
                return false;
            });
    }
    return portableModePromise;
}

async function readDataFile(fileName) {
    if (await isPortableMode()) {
        return invoke('read_portable_data_file', { fileName });
    }

    const fileExists = await exists(fileName, { baseDir: BaseDirectory.AppData });
    if (!fileExists) return null;
    return readTextFile(fileName, { baseDir: BaseDirectory.AppData });
}

async function writeDataFile(fileName, content) {
    if (await isPortableMode()) {
        await invoke('write_portable_data_file', { fileName, content });
        return;
    }

    await ensureDir();
    await writeTextFile(fileName, content, { baseDir: BaseDirectory.AppData });
}

// Helper to ensure directory exists
async function ensureDir() {
    try {
        const dirExists = await exists('', { baseDir: BaseDirectory.AppData });
        if (!dirExists) {
            await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true });
        }
    } catch (e) {
        console.error("Error ensuring directory:", e);
    }
}

export async function loadEvents() {
    try {
        const content = await readDataFile(EVENTS_FILE);

        if (!content) {
            return [];
        }

        return normalizeEvents(JSON.parse(content));
    } catch (error) {
        console.error('Failed to load events:', error);
        return [];
    }
}

export async function saveEvents(events) {
    try {
        await writeDataFile(EVENTS_FILE, JSON.stringify(events, null, 2));
    } catch (error) {
        console.error('Failed to save events:', error);
        throw error;
    }
}

export async function loadSettings() {
    try {
        const content = await readDataFile(SETTINGS_FILE);

        if (!content) {
            return normalizeSettings({
                startMinimized: false,
            });
        }

        return normalizeSettings(JSON.parse(content));
    } catch (error) {
        console.error('Failed to load settings:', error);
        return normalizeSettings({});
    }
}

export async function saveSettings(settings) {
    try {
        await writeDataFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('Failed to save settings:', error);
        throw error;
    }
}
