import { readTextFile, writeTextFile, exists, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs';
import { appDataDir } from '@tauri-apps/api/path';

const EVENTS_FILE = 'events.json';
const SETTINGS_FILE = 'settings.json';

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
        await ensureDir();
        const fileExists = await exists(EVENTS_FILE, { baseDir: BaseDirectory.AppData });
        
        if (!fileExists) {
            return [];
        }

        const content = await readTextFile(EVENTS_FILE, { baseDir: BaseDirectory.AppData });
        return JSON.parse(content);
    } catch (error) {
        console.error('Failed to load events:', error);
        return [];
    }
}

export async function saveEvents(events) {
    try {
        await ensureDir();
        await writeTextFile(EVENTS_FILE, JSON.stringify(events, null, 2), { baseDir: BaseDirectory.AppData });
    } catch (error) {
        console.error('Failed to save events:', error);
        throw error;
    }
}

export async function loadSettings() {
    try {
        await ensureDir();
        const fileExists = await exists(SETTINGS_FILE, { baseDir: BaseDirectory.AppData });
        
        if (!fileExists) {
            return {
                theme: 'dark',
                startMinimized: false,
                notifications: true
            };
        }

        const content = await readTextFile(SETTINGS_FILE, { baseDir: BaseDirectory.AppData });
        return JSON.parse(content);
    } catch (error) {
        console.error('Failed to load settings:', error);
        return {};
    }
}

export async function saveSettings(settings) {
    try {
        await ensureDir();
        await writeTextFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), { baseDir: BaseDirectory.AppData });
    } catch (error) {
        console.error('Failed to save settings:', error);
        throw error;
    }
}
