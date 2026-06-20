import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path) => `asset://${path}`,
}));

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: async () => 'C:/Users/me/AppData/Roaming/Caltemp',
  join: async (...parts) => parts.join('/'),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 'AppData' },
  mkdir: vi.fn(),
  readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
  writeFile: vi.fn(),
}));

let DEFAULT_SOUND_CONFIG;
let SOUND_PRESETS;
let normalizeSoundConfig;
let playSoundPreview;
let copyCustomSoundToAppData;
let getSoundDisplayName;
let getSoundMimeType;

describe('sound settings', () => {
  beforeEach(async () => {
    vi.resetModules();
    ({
      DEFAULT_SOUND_CONFIG,
      SOUND_PRESETS,
      normalizeSoundConfig,
      playSoundPreview,
    } = await import('./sound'));
    ({
      copyCustomSoundToAppData,
      getSoundDisplayName,
      getSoundMimeType,
    } = await import('./soundFiles'));
  });

  it('normalise une ancienne configuration avec chemins personnalisés', () => {
    const config = normalizeSoundConfig({
      bubble: 'C:/sons/clic.wav',
      notification: 'C:/sons/notif.ogg',
    });

    expect(config).toMatchObject({
      enabled: true,
      volume: DEFAULT_SOUND_CONFIG.volume,
      profile: DEFAULT_SOUND_CONFIG.profile,
      bubble: 'C:/sons/clic.wav',
      notification: 'C:/sons/notif.ogg',
      ringtone: null,
    });
  });

  it('borne le volume et ignore les profils inconnus', () => {
    expect(normalizeSoundConfig({ volume: 2, profile: 'bruyant' })).toMatchObject({
      volume: 1,
      profile: DEFAULT_SOUND_CONFIG.profile,
    });
    expect(normalizeSoundConfig({ volume: -1 })).toMatchObject({ volume: 0 });
  });

  it('expose des profils sonores utilisables par les paramètres', () => {
    expect(SOUND_PRESETS.length).toBeGreaterThanOrEqual(3);
    expect(SOUND_PRESETS.map((preset) => preset.id)).toContain(DEFAULT_SOUND_CONFIG.profile);
  });

  it('normalise un fichier personnalisé stocké dans AppData', () => {
    const config = normalizeSoundConfig({
      bubble: {
        path: 'sounds/bubble-123-click.wav',
        storage: 'appData',
        sourceName: 'click.wav',
      },
    });

    expect(config.bubble).toEqual({
      path: 'sounds/bubble-123-click.wav',
      storage: 'appData',
      sourceName: 'click.wav',
    });
    expect(getSoundDisplayName(config.bubble)).toBe('click.wav');
  });

  it('copie les sons personnalisés dans AppData avec un nom stable', async () => {
    const calls = [];
    const fakeFs = {
      readFile: async (path) => {
        calls.push(['readFile', path]);
        return new Uint8Array([1, 2, 3]);
      },
      mkdir: async (path, options) => calls.push(['mkdir', path, options]),
      writeFile: async (path, bytes, options) => calls.push(['writeFile', path, Array.from(bytes), options]),
    };

    const result = await copyCustomSoundToAppData('C:\\Users\\me\\Sons\\Mon clic!.wav', 'bubble', {
      fs: fakeFs,
      now: () => 123,
    });

    expect(result).toEqual({
      path: 'sounds/bubble-123-mon-clic.wav',
      storage: 'appData',
      sourceName: 'Mon clic!.wav',
    });
    expect(calls[0]).toEqual(['readFile', 'C:\\Users\\me\\Sons\\Mon clic!.wav']);
    expect(calls[1]).toMatchObject(['mkdir', 'sounds', { recursive: true }]);
    expect(calls[2][0]).toBe('writeFile');
    expect(calls[2][1]).toBe('sounds/bubble-123-mon-clic.wav');
    expect(calls[2][2]).toEqual([1, 2, 3]);
  });

  it('préécoute le fichier personnalisé de la configuration fournie', async () => {
    const played = [];
    const OriginalAudio = globalThis.Audio;
    globalThis.Audio = class {
      constructor(src) {
        this.src = src;
        this.volume = 0;
      }

      async play() {
        played.push({ src: this.src, volume: this.volume });
      }
    };

    try {
      await playSoundPreview('notification', {
        enabled: true,
        volume: 0.35,
        notification: {
          path: 'sounds/notification-123-ding.wav',
          storage: 'appData',
          sourceName: 'ding.wav',
        },
      });
    } finally {
      globalThis.Audio = OriginalAudio;
    }

    expect(played).toEqual([{
      src: expect.stringMatching(/^blob:/),
      volume: 0.35,
    }]);
  });

  it('ne joue pas de son généré quand la préécoute du fichier personnalisé échoue', async () => {
    const OriginalAudio = globalThis.Audio;
    globalThis.Audio = class {
      constructor() {
        this.volume = 0;
      }

      async play() {
        throw new Error('audio inaccessible');
      }
    };

    try {
      await expect(playSoundPreview('notification', {
        enabled: true,
        notification: {
          path: 'sounds/missing.wav',
          storage: 'appData',
          sourceName: 'missing.wav',
        },
      })).resolves.toMatchObject({
        ok: false,
        reason: expect.stringContaining('audio inaccessible'),
      });
    } finally {
      globalThis.Audio = OriginalAudio;
    }
  });

  it('préécoute immédiatement un son AppData en blob sans attendre asset://', async () => {
    const played = [];
    const createdUrls = [];
    const OriginalAudio = globalThis.Audio;
    const OriginalBlob = globalThis.Blob;
    const OriginalUrl = globalThis.URL;

    globalThis.Blob = class {
      constructor(parts, options) {
        this.parts = parts;
        this.type = options?.type;
      }
    };
    globalThis.URL = {
      createObjectURL: (blob) => {
        createdUrls.push(blob.type);
        return `blob:test-${createdUrls.length}`;
      },
      revokeObjectURL: vi.fn(),
    };
    globalThis.Audio = class {
      constructor(src) {
        this.src = src;
        this.volume = 0;
      }

      async play() {
        played.push({ src: this.src, volume: this.volume });
      }
    };

    try {
      await expect(playSoundPreview('notification', {
        enabled: true,
        volume: 0.5,
        notification: {
          path: 'sounds/notification-123-ding.mp3',
          storage: 'appData',
          sourceName: 'ding.mp3',
        },
      })).resolves.toMatchObject({ ok: true, source: 'blob' });
    } finally {
      globalThis.Audio = OriginalAudio;
      globalThis.Blob = OriginalBlob;
      globalThis.URL = OriginalUrl;
    }

    expect(createdUrls).toEqual(['audio/mpeg']);
    expect(played).toEqual([{ src: 'blob:test-1', volume: 0.5 }]);
  });

  it('arrête la préécoute précédente avant de lancer la suivante', async () => {
    const instances = [];
    const OriginalAudio = globalThis.Audio;
    globalThis.Audio = class {
      constructor(src) {
        this.src = src;
        this.volume = 0;
        this.loop = true;
        this.currentTime = 12;
        this.pause = vi.fn();
        instances.push(this);
      }

      async play() {}
    };

    try {
      await playSoundPreview('notification', {
        enabled: true,
        notification: {
          path: 'sounds/first.wav',
          storage: 'appData',
          sourceName: 'first.wav',
        },
      });
      await playSoundPreview('notification', {
        enabled: true,
        notification: {
          path: 'sounds/second.wav',
          storage: 'appData',
          sourceName: 'second.wav',
        },
      });
    } finally {
      globalThis.Audio = OriginalAudio;
    }

    expect(instances[0].pause).toHaveBeenCalledTimes(1);
    expect(instances[0].currentTime).toBe(0);
    expect(instances[0].loop).toBe(false);
    expect(instances[1].loop).toBe(false);
  });

  it('ignore une préécoute interrompue par pause lors du lancement suivant', async () => {
    const OriginalAudio = globalThis.Audio;
    globalThis.Audio = class {
      constructor() {
        this.loop = true;
        this.currentTime = 0;
        this.pause = vi.fn();
      }

      async play() {
        throw new Error('The play() request was interrupted by a call to pause().');
      }
    };

    try {
      await expect(playSoundPreview('notification', {
        enabled: true,
        notification: {
          path: 'sounds/interrupted.wav',
          storage: 'appData',
          sourceName: 'interrupted.wav',
        },
      })).resolves.toMatchObject({ ok: false });

      const pending = playSoundPreview('notification', {
        enabled: true,
        notification: {
          path: 'sounds/first.wav',
          storage: 'appData',
          sourceName: 'first.wav',
        },
      });
      const next = playSoundPreview('notification', {
        enabled: true,
        notification: {
          path: 'sounds/second.wav',
          storage: 'appData',
          sourceName: 'second.wav',
        },
      });

      await expect(pending).resolves.toMatchObject({ ok: true, interrupted: true });
      await expect(next).resolves.toMatchObject({ ok: false });
    } finally {
      globalThis.Audio = OriginalAudio;
    }
  });

  it('déduit le type MIME des sons personnalisés', () => {
    expect(getSoundMimeType({ path: 'sounds/test.mp3', storage: 'appData' })).toBe('audio/mpeg');
    expect(getSoundMimeType({ path: 'sounds/test.wav', storage: 'appData' })).toBe('audio/wav');
  });
});
