'use client';

import { useEffect, useRef } from 'react';

// Singleton AudioContext shared across all instances
let sharedCtx: AudioContext | null = null;
let audioUnlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedCtx) {
    try {
      sharedCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return sharedCtx;
}

async function unlockAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx || audioUnlocked) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch { /* ignore */ }
  }
  audioUnlocked = true;
}

/**
 * Plays a crisp, audible 2-ring restaurant bell chime using Web Audio API.
 * No external sound files needed. Works in iOS Safari, Android Chrome, and desktop.
 */
export async function playAlarmBeep(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch { /* ignore */ }
  }

  const now = ctx.currentTime;
  // High-visibility restaurant order chime (Bell chime: 1046Hz, 1318Hz, 1568Hz + double ring)
  const notes = [
    { freq: 1046.5, time: now, dur: 0.15 },
    { freq: 1318.5, time: now + 0.12, dur: 0.18 },
    { freq: 1567.98, time: now + 0.26, dur: 0.35 },
    { freq: 1046.5, time: now + 0.65, dur: 0.15 },
    { freq: 1318.5, time: now + 0.77, dur: 0.18 },
    { freq: 1567.98, time: now + 0.91, dur: 0.45 },
  ];

  notes.forEach(({ freq, time, dur }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.7, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + dur);
  });
}

/**
 * Global hook — mount once in the root layout (NotificationManager).
 * Unlocks AudioContext on first user interaction and listens for alarm events.
 */
export function useAlarmSound() {
  const unlockedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Unlock audio on first touch/click anywhere in the app
    const unlock = async () => {
      if (unlockedRef.current) return;
      await unlockAudio();
      unlockedRef.current = true;
    };

    // Listen for manual alarm test event (from Topbar button)
    const handleManualAlarm = () => {
      unlockAudio().then(playAlarmBeep);
    };

    // Listen for new order event to auto-play alarm
    const handleNewOrder = () => {
      unlockAudio().then(playAlarmBeep);
    };

    document.addEventListener('click', unlock, { once: false, passive: true });
    document.addEventListener('touchstart', unlock, { once: false, passive: true });
    window.addEventListener('play_alarm_sound', handleManualAlarm);
    window.addEventListener('new_order', handleNewOrder);

    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
      window.removeEventListener('play_alarm_sound', handleManualAlarm);
      window.removeEventListener('new_order', handleNewOrder);
    };
  }, []);
}
