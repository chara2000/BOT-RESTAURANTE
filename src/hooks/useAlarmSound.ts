'use client';

import { useEffect, useRef } from 'react';

// Singleton AudioContext shared across all instances
let sharedCtx: AudioContext | null = null;
let audioUnlocked = false;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedCtx) {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        sharedCtx = new AudioCtxClass();
      }
    } catch {
      return null;
    }
  }
  return sharedCtx;
}

export async function unlockAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch { /* ignore */ }
  }
  audioUnlocked = true;
}

/**
 * Generates and plays a rich, loud, restaurant order alarm buzzer / chime sequence.
 * Includes multiple harmonics, piercing bell chimes, and high volume to ensure
 * kitchen / cashier staff never miss an incoming order.
 */
export async function playAlarmSound(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    let ctx = getAudioContext();
    if (!ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        ctx = new AudioCtxClass();
        sharedCtx = ctx;
      }
    }

    if (ctx && ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    if (ctx) {
      const now = ctx.currentTime;
      // Piercing Restaurant Chime sequence: 3 energetic chimes
      const chimeChords = [
        { time: now + 0.0, freqs: [1046.5, 1318.5, 1567.98], dur: 0.22 }, // High C, E, G
        { time: now + 0.25, freqs: [1174.66, 1479.98, 1760.0], dur: 0.25 }, // D, F#, A
        { time: now + 0.55, freqs: [1046.5, 1318.5, 1567.98, 2093.0], dur: 0.45 }, // C Major chord with top C7
        { time: now + 1.1, freqs: [1046.5, 1318.5, 1567.98], dur: 0.22 },
        { time: now + 1.35, freqs: [1174.66, 1479.98, 1760.0], dur: 0.25 },
        { time: now + 1.65, freqs: [1046.5, 1318.5, 1567.98, 2093.0], dur: 0.60 },
      ];

      chimeChords.forEach(({ time, freqs, dur }) => {
        freqs.forEach((freq, idx) => {
          try {
            const osc = ctx!.createOscillator();
            const gain = ctx!.createGain();

            osc.type = idx === 0 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(freq, time);

            // Loud punchy attack and smooth bell decay
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(0.85, time + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

            osc.connect(gain);
            gain.connect(ctx!.destination);

            osc.start(time);
            osc.stop(time + dur);
          } catch {}
        });
      });
    }
  } catch (err) {
    console.warn('[AlarmSound] AudioContext chime notice:', err);
  }

  // Also trigger mobile haptic vibration
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([300, 100, 300, 100, 600]);
    } catch {}
  }
}

export const playAlarmBeep = playAlarmSound;

/**
 * Global hook — mount once in the root layout (NotificationManager).
 * Unlocks AudioContext on first user interaction and listens for alarm events.
 */
export function useAlarmSound() {
  const unlockedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Unlock audio on any first gesture anywhere in the app
    const unlock = async () => {
      await unlockAudio();
      unlockedRef.current = true;
    };

    // Listen for manual alarm test event (from Topbar button)
    const handleManualAlarm = () => {
      unlockAudio().then(() => playAlarmSound());
    };

    // Listen for new order event to auto-play alarm
    const handleNewOrder = () => {
      unlockAudio().then(() => playAlarmSound());
    };

    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('play_alarm_sound', handleManualAlarm);
    window.addEventListener('new_order', handleNewOrder);

    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('play_alarm_sound', handleManualAlarm);
      window.removeEventListener('new_order', handleNewOrder);
    };
  }, []);
}

