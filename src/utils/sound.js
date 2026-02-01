
// Sound Utility with Custom File Support
import { convertFileSrc } from '@tauri-apps/api/core';

// Configuration object to store custom paths
let soundConfig = {
    bubble: null,
    notification: null,
    ringtone: null
};

// Global audio context
let audioContext = null;

const getAudioContext = () => {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
};

// Ensure context is running (must be called on user interaction first)
export const resumeAudioContext = async () => {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        await ctx.resume();
    }
};

export const configureSounds = (config) => {
    if (config) {
        soundConfig = { ...soundConfig, ...config };
    }
};

const playFile = async (path) => {
    try {
        const src = convertFileSrc(path);
        const audio = new Audio(src);
        audio.volume = 1.0;
        await audio.play();
        return true;
    } catch (e) {
        console.error("Failed to play custom sound file:", e);
        return false;
    }
};

export const playBubbleSound = async () => {
    // 1. Try custom file
    if (soundConfig.bubble) {
        const success = await playFile(soundConfig.bubble);
        if (success) return;
    }

    // 2. Fallback to Synthesis
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch { console.warn("Cannot resume audio context without user gesture"); }
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Softer Bubble Effect
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15);

    // Louder Envelope (increased from 0.3 to 0.6)
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.25);
};

export const playRingtone = async () => {
    // 1. Try custom file
    if (soundConfig.ringtone) {
        const success = await playFile(soundConfig.ringtone);
        if (success) return;
    }

    // 2. Fallback
    const ctx = getAudioContext();
    // Force resume attempt
    if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch { }
    }

    const now = ctx.currentTime;

    // First Tone (Ding) - Louder
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now); // A5

    // Increased volume 0.3 -> 0.8
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.8, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 1.5);

    osc1.start(now);
    osc1.stop(now + 1.5);

    // Second Tone (Dong) - Louder
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, now + 0.4); // E5

    // Increased volume 0.3 -> 0.8
    gain2.gain.setValueAtTime(0, now + 0.4);
    gain2.gain.linearRampToValueAtTime(0.8, now + 0.45);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 2.5);

    osc2.start(now + 0.4);
    osc2.stop(now + 2.5);
};

export const playNotificationSound = async () => {
    // 1. Try custom file
    if (soundConfig.notification) {
        const success = await playFile(soundConfig.notification);
        if (success) return;
    }

    // 2. Fallback
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch { }
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.1); // C6

    // Increased volume 0.1 -> 0.5
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    osc.start(now);
    osc.stop(now + 0.3);
}
