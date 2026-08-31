'use client';

import { useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// ALARM SOUND — Dual strategy: <audio> element (primary) + AudioContext (fallback)
// The <audio> approach bypasses Chrome/Safari AutoPlay restrictions because
// it gets pre-unlocked via a muted "tap" during first user interaction.
// ─────────────────────────────────────────────────────────────────────────────

// Singleton audio element reused on every alarm
let _audioEl: HTMLAudioElement | null = null;
let _audioUnlocked = false;

// Short 2-note PCM bell chime encoded as WAV base64 (2 tones, ~1.2 seconds)
// Generated via offline synthesis — no external files needed
const ALARM_WAV_B64 = (() => {
  // Build a simple loud beep programmatically as a data URI using AudioContext offline
  // We'll generate this lazily on first call to keep the module lightweight
  return null;
})();

function buildAlarmDataURI(): string {
  // Build two-burst beep as WAV bytes via offline rendering
  const sampleRate = 22050;
  const duration = 1.8; // seconds
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);

  // Chime pattern: 3 notes x 2 bursts
  const notes = [
    { startSec: 0.00, freq: 1046.5, dur: 0.18 },
    { startSec: 0.22, freq: 1318.5, dur: 0.18 },
    { startSec: 0.44, freq: 1567.98, dur: 0.30 },
    { startSec: 0.85, freq: 1046.5, dur: 0.18 },
    { startSec: 1.07, freq: 1318.5, dur: 0.18 },
    { startSec: 1.29, freq: 1567.98, dur: 0.35 },
  ];

  for (const note of notes) {
    const startSample = Math.floor(note.startSec * sampleRate);
    const durSamples = Math.floor(note.dur * sampleRate);
    const attackSamples = Math.floor(0.015 * sampleRate);
    for (let i = 0; i < durSamples; i++) {
      const t = i / sampleRate;
      const amp = i < attackSamples ? i / attackSamples : Math.exp(-5 * (i - attackSamples) / sampleRate);
      buffer[startSample + i] = (buffer[startSample + i] || 0) + 0.9 * amp * Math.sin(2 * Math.PI * note.freq * t);
    }
  }

  // Encode Float32Array to 16-bit PCM WAV
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = numSamples * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.max(-1, Math.min(1, buffer[i]));
    view.setInt16(44 + i * 2, sample * 0x7FFF, true);
  }

  // Convert to base64 data URI
  const bytes = new Uint8Array(wavBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + btoa(binary);
}

function getOrCreateAudioEl(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (_audioEl) return _audioEl;

  try {
    const el = new Audio();
    el.volume = 1.0;
    el.preload = 'auto';
    el.src = buildAlarmDataURI();
    el.load();
    _audioEl = el;
    return el;
  } catch {
    return null;
  }
}

/**
 * Unlock audio by "playing" and immediately pausing a muted audio element.
 * This must be called inside a user gesture handler (click, touchstart, etc.)
 */
export async function unlockAudio(): Promise<void> {
  if (_audioUnlocked) return;
  const el = getOrCreateAudioEl();
  if (!el) return;

  try {
    el.muted = true;
    await el.play();
    el.pause();
    el.currentTime = 0;
    el.muted = false;
    _audioUnlocked = true;
  } catch {
    // Some browsers still block — AudioContext fallback will be used
    _audioUnlocked = true; // Mark anyway so we don't loop
  }
}

/**
 * Play the alarm chime. Uses <audio> element (most reliable) with
 * AudioContext synthesis as fallback.
 */
export async function playAlarmSound(): Promise<void> {
  if (typeof window === 'undefined') return;

  // Primary: HTMLAudioElement (works even without prior user gesture if pre-unlocked)
  const el = getOrCreateAudioEl();
  if (el) {
    try {
      el.muted = false;
      el.volume = 1.0;
      el.currentTime = 0;
      await el.play();
    } catch (audioErr) {
      console.warn('[Alarm] audio.play() blocked, trying AudioContext:', audioErr);
      // Fallback: AudioContext oscillator synthesis
      await playAlarmFallback();
    }
  } else {
    await playAlarmFallback();
  }

  // Haptic vibration on mobile
  try {
    if ('vibrate' in navigator) navigator.vibrate([300, 100, 300, 100, 600]);
  } catch {}
}

async function playAlarmFallback(): Promise<void> {
  try {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return;

    const ctx: AudioContext = new AudioCtxClass();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const notes = [
      { time: now + 0.0, freq: 1046.5, dur: 0.18 },
      { time: now + 0.22, freq: 1318.5, dur: 0.18 },
      { time: now + 0.44, freq: 1567.98, dur: 0.30 },
      { time: now + 0.85, freq: 1046.5, dur: 0.18 },
      { time: now + 1.07, freq: 1318.5, dur: 0.18 },
      { time: now + 1.29, freq: 1567.98, dur: 0.35 },
    ];

    notes.forEach(({ time, freq, dur }) => {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.85, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + dur);
      } catch {}
    });
  } catch {}
}

export const playAlarmBeep = playAlarmSound;

/**
 * Global hook — mount once in the root layout (NotificationManager).
 * Pre-unlocks the audio element on ANY first user interaction so the
 * alarm can play immediately when a new order arrives.
 */
export function useAlarmSound() {
  const mounted = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || mounted.current) return;
    mounted.current = true;

    // Pre-create the audio element immediately
    getOrCreateAudioEl();

    const handleUnlock = () => {
      unlockAudio();
    };

    const handleManualAlarm = () => {
      playAlarmSound();
    };

    const handleNewOrder = () => {
      playAlarmSound();
    };

    // Unlock on ANY user interaction — click, touch, key, scroll
    window.addEventListener('click', handleUnlock, { passive: true });
    window.addEventListener('touchstart', handleUnlock, { passive: true });
    window.addEventListener('pointerdown', handleUnlock, { passive: true });
    window.addEventListener('keydown', handleUnlock, { passive: true });
    window.addEventListener('scroll', handleUnlock, { passive: true, once: true });

    window.addEventListener('play_alarm_sound', handleManualAlarm);
    window.addEventListener('new_order', handleNewOrder);

    return () => {
      window.removeEventListener('click', handleUnlock);
      window.removeEventListener('touchstart', handleUnlock);
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
      window.removeEventListener('scroll', handleUnlock);
      window.removeEventListener('play_alarm_sound', handleManualAlarm);
      window.removeEventListener('new_order', handleNewOrder);
    };
  }, []);
}
