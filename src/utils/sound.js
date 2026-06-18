import { convertFileSrc } from '@tauri-apps/api/core';
import {
  getSoundMimeType,
  isAppDataSoundEntry,
  normalizeSoundEntry,
  readAppDataSoundBytes,
  resolveSoundFilePath,
} from './soundFiles';

export const SOUND_PRESETS = [
  {
    id: 'calm',
    name: 'Calme',
    description: 'Doux, discret et adapté au travail prolongé.',
  },
  {
    id: 'focus',
    name: 'Focus',
    description: 'Plus grave, court et peu intrusif.',
  },
  {
    id: 'bright',
    name: 'Clair',
    description: 'Plus audible pour ne pas manquer les rappels.',
  },
];

export const DEFAULT_SOUND_CONFIG = {
  enabled: true,
  volume: 0.7,
  profile: 'calm',
  bubble: null,
  notification: null,
  ringtone: null,
};

const profileIds = new Set(SOUND_PRESETS.map((preset) => preset.id));
let soundConfig = { ...DEFAULT_SOUND_CONFIG };
let audioContext = null;
let activePreviewAudio = null;
let activePreviewObjectUrl = '';
let activePreviewStopTimer = null;
const runtimeAudioRefs = new Set();

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const isAudioPlaybackSupported = () => (
  typeof window !== 'undefined'
  && typeof Audio !== 'undefined'
  && Boolean(window.AudioContext || window.webkitAudioContext)
);

export const normalizeSoundConfig = (config = {}) => {
  const volume = Number.isFinite(Number(config.volume))
    ? clamp(Number(config.volume), 0, 1)
    : DEFAULT_SOUND_CONFIG.volume;

  return {
    ...DEFAULT_SOUND_CONFIG,
    ...config,
    enabled: config.enabled !== false,
    volume,
    profile: profileIds.has(config.profile) ? config.profile : DEFAULT_SOUND_CONFIG.profile,
    bubble: normalizeSoundEntry(config.bubble),
    notification: normalizeSoundEntry(config.notification),
    ringtone: normalizeSoundEntry(config.ringtone),
  };
};

const getAudioContext = () => {
  if (!isAudioPlaybackSupported()) return null;
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
};

export const resumeAudioContext = async () => {
  if (soundConfig.enabled === false) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
};

export const configureSounds = (config) => {
  soundConfig = normalizeSoundConfig(config || {});
};

export const getCurrentSoundConfig = () => soundConfig;

const tryResume = async (ctx) => {
  if (ctx.state !== 'suspended') return true;
  try {
    await ctx.resume();
    return true;
  } catch {
    console.warn('Impossible de démarrer le contexte audio sans interaction utilisateur.');
    return false;
  }
};

const stopAudio = (audio) => {
  if (!audio) return;
  audio.__caltempStopped = true;
  try {
    audio.pause?.();
    audio.currentTime = 0;
  } catch {
    // Some WebView media backends reject currentTime updates before metadata is loaded.
  }
};

const stopActivePreview = () => {
  if (activePreviewStopTimer) {
    clearTimeout(activePreviewStopTimer);
    activePreviewStopTimer = null;
  }
  stopAudio(activePreviewAudio);
  if (activePreviewObjectUrl) {
    URL.revokeObjectURL(activePreviewObjectUrl);
    activePreviewObjectUrl = '';
  }
  activePreviewAudio = null;
};

const releaseAudio = (audio, objectUrl = '', preview = false) => {
  runtimeAudioRefs.delete(audio);
  if (preview && activePreviewAudio === audio) {
    activePreviewAudio = null;
    if (activePreviewStopTimer) {
      clearTimeout(activePreviewStopTimer);
      activePreviewStopTimer = null;
    }
  }
  if (objectUrl) {
    if (preview && activePreviewObjectUrl === objectUrl) activePreviewObjectUrl = '';
    URL.revokeObjectURL(objectUrl);
  }
};

const playAudioSource = async (src, { objectUrl = '', preview = false, maxDurationMs = null } = {}) => {
  const audio = new Audio(src);
  audio.volume = soundConfig.volume;
  audio.loop = false;
  audio.preload = 'auto';

  if (preview) {
    stopActivePreview();
    activePreviewAudio = audio;
    activePreviewObjectUrl = objectUrl;
  } else {
    runtimeAudioRefs.add(audio);
  }

  const cleanup = () => releaseAudio(audio, objectUrl, preview);
  audio.addEventListener?.('ended', cleanup, { once: true });
  audio.addEventListener?.('error', cleanup, { once: true });

  try {
    await audio.play();
    if (preview && maxDurationMs) {
      activePreviewStopTimer = setTimeout(() => {
        stopActivePreview();
      }, maxDurationMs);
      activePreviewStopTimer.unref?.();
    }
    return { ok: true };
  } catch (error) {
    cleanup();
    if (
      preview
      && audio.__caltempStopped
      && /interrupted by a call to pause/i.test(error?.message || String(error))
    ) {
      return { ok: true, interrupted: true };
    }
    throw error;
  }
};

const playFile = async (entry, { quiet = false, preview = false, maxDurationMs = null } = {}) => {
  if (!entry || soundConfig.enabled === false || typeof Audio === 'undefined') {
    return { ok: false, reason: 'Lecture audio indisponible.' };
  }

  if (preview && isAppDataSoundEntry(entry) && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
    try {
      const bytes = await readAppDataSoundBytes(entry);
      if (bytes) {
        const blob = new Blob([bytes], { type: getSoundMimeType(entry) });
        const objectUrl = URL.createObjectURL(blob);
        const result = await playAudioSource(objectUrl, { objectUrl, preview, maxDurationMs });
        return { ...result, source: 'blob' };
      }
    } catch (blobError) {
      if (!quiet) console.error('Failed to play copied sound blob:', blobError);
      return { ok: false, reason: blobError?.message || String(blobError) };
    }
  }

  let assetError = null;
  try {
    const path = await resolveSoundFilePath(entry);
    if (!path) return { ok: false, reason: 'Chemin audio introuvable.' };
    const src = convertFileSrc(path);
    const result = await playAudioSource(src, { preview, maxDurationMs });
    if (result.interrupted) return result;
    return result;
  } catch (e) {
    assetError = e;
  }

  if (isAppDataSoundEntry(entry) && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
    try {
      const bytes = await readAppDataSoundBytes(entry);
      if (bytes) {
        const blob = new Blob([bytes], { type: getSoundMimeType(entry) });
        const objectUrl = URL.createObjectURL(blob);
        const result = await playAudioSource(objectUrl, { objectUrl, preview, maxDurationMs });
        return { ...result, source: 'blob' };
      }
    } catch (blobError) {
      if (!quiet) console.error('Failed to play copied sound blob:', blobError);
      return { ok: false, reason: blobError?.message || assetError?.message || String(blobError || assetError) };
    }
  }

  if (!quiet) console.error('Failed to play custom sound file:', assetError);
  return { ok: false, reason: assetError?.message || String(assetError) };
};

const soundLibrary = {
  calm: {
    bubble: [
      { type: 'sine', from: 520, to: 340, start: 0, duration: 0.14, gain: 0.18 },
    ],
    notification: [
      { type: 'triangle', from: 440, to: 660, start: 0, duration: 0.16, gain: 0.22 },
      { type: 'sine', from: 660, to: 660, start: 0.12, duration: 0.22, gain: 0.16 },
    ],
    ringtone: [
      { type: 'sine', from: 523.25, to: 523.25, start: 0, duration: 0.65, gain: 0.22 },
      { type: 'triangle', from: 659.25, to: 659.25, start: 0.32, duration: 0.85, gain: 0.18 },
    ],
  },
  focus: {
    bubble: [
      { type: 'triangle', from: 360, to: 260, start: 0, duration: 0.1, gain: 0.14 },
    ],
    notification: [
      { type: 'sine', from: 330, to: 440, start: 0, duration: 0.18, gain: 0.18 },
    ],
    ringtone: [
      { type: 'sine', from: 392, to: 392, start: 0, duration: 0.45, gain: 0.2 },
      { type: 'sine', from: 330, to: 330, start: 0.28, duration: 0.65, gain: 0.18 },
      { type: 'triangle', from: 440, to: 440, start: 0.62, duration: 0.55, gain: 0.14 },
    ],
  },
  bright: {
    bubble: [
      { type: 'sine', from: 780, to: 520, start: 0, duration: 0.13, gain: 0.26 },
    ],
    notification: [
      { type: 'triangle', from: 587.33, to: 880, start: 0, duration: 0.18, gain: 0.3 },
      { type: 'sine', from: 1174.66, to: 1174.66, start: 0.13, duration: 0.16, gain: 0.22 },
    ],
    ringtone: [
      { type: 'triangle', from: 659.25, to: 659.25, start: 0, duration: 0.5, gain: 0.3 },
      { type: 'sine', from: 880, to: 880, start: 0.28, duration: 0.6, gain: 0.26 },
      { type: 'triangle', from: 1046.5, to: 1046.5, start: 0.62, duration: 0.5, gain: 0.2 },
    ],
  },
};

const playTone = (ctx, tone) => {
  const start = ctx.currentTime + tone.start;
  const stop = start + tone.duration;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.type = tone.type;
  oscillator.frequency.setValueAtTime(tone.from, start);
  if (tone.to !== tone.from) {
    oscillator.frequency.exponentialRampToValueAtTime(tone.to, stop);
  }

  const peak = tone.gain * soundConfig.volume;
  gainNode.gain.setValueAtTime(0.0001, start);
  gainNode.gain.linearRampToValueAtTime(peak, start + Math.min(0.03, tone.duration / 3));
  gainNode.gain.exponentialRampToValueAtTime(0.0001, stop);

  oscillator.start(start);
  oscillator.stop(stop + 0.02);
};

const playGeneratedSound = async (type) => {
  if (soundConfig.enabled === false || soundConfig.volume <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  const canPlay = await tryResume(ctx);
  if (!canPlay) return;

  const preset = soundLibrary[soundConfig.profile] || soundLibrary[DEFAULT_SOUND_CONFIG.profile];
  const tones = preset[type] || soundLibrary[DEFAULT_SOUND_CONFIG.profile][type] || [];
  tones.forEach((tone) => playTone(ctx, tone));
};

const playSound = async (type, options = {}) => {
  if (soundConfig.enabled === false) return;

  if (soundConfig[type]) {
    const result = await playFile(soundConfig[type], {
      quiet: options.quietFileErrors,
      preview: options.preview === true,
      maxDurationMs: options.preview === true ? options.maxDurationMs : null,
    });
    if (result.ok) return result;
    if (options.fallbackToGenerated === false) return result;
  }

  await playGeneratedSound(type);
  return { ok: true, generated: true };
};

export const playSoundPreview = async (type, config, options = {}) => {
  const previousConfig = soundConfig;
  soundConfig = normalizeSoundConfig(config || {});
  stopActivePreview();
  try {
    return await playSound(type, {
      fallbackToGenerated: options.fallbackToGenerated === true,
      quietFileErrors: true,
      preview: true,
      maxDurationMs: options.maxDurationMs || 8000,
    });
  } finally {
    soundConfig = previousConfig;
  }
};

export const playBubbleSound = () => playSound('bubble');
export const playRingtone = () => playSound('ringtone');
export const playNotificationSound = () => playSound('notification');
