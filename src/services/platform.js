import { type } from '@tauri-apps/plugin-os';

export async function getPlatform() {
    try {
        const osType = await type();
        // 'linux', 'macos', 'windows'
        // Map to simpler keys if needed, but these are standard
        return osType;
    } catch (error) {
        console.error("Failed to get platform:", error);
        return 'unknown';
    }
}
