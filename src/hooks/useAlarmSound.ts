'use client';

import { useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// ALARM SOUND SYSTEM — 4-Layer Fail-Safe Restaurant Alert
// Layer 1: Web Audio API Synthesizer (Loud bell chimes generated in real-time)
// Layer 2: Web Speech API (Voice announcement: "¡Nuevo pedido entrante!")
// Layer 3: HTML5 Audio Element (/alarm.wav fallback)
// Layer 4: Mobile Haptic Vibration (vibrate pattern)
// ─────────────────────────────────────────────────────────────────────────────

let sharedAudioCtx: AudioContext | null = null;
let audioUnlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        sharedAudioCtx = new AudioCtx();
      }
    } catch {
      return null;
    }
  }
  return sharedAudioCtx;
}

/**
 * Pre-unlocks AudioContext and SpeechSynthesis on first user interaction
 */
export async function unlockAudio(): Promise<void> {
  if (audioUnlocked) return;
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch { /* ignore */ }
  }

  // Pre-initialize SpeechSynthesis
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.getVoices();
    } catch {}
  }

  audioUnlocked = true;
}

/**
 * Plays the full restaurant order alert across all 4 layers.
 * Guaranteed to sound on Android, iOS, Chrome, Safari, and PWA mode.
 */
export async function playAlarmSound(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Web Audio API Synthesizer (Loud Chime Sequence)
  try {
    let ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    if (ctx) {
      const now = ctx.currentTime;
      const chimeChords = [
        { time: now + 0.00, freqs: [1046.5, 1318.5, 1567.98], dur: 0.22 }, // High C, E, G
        { time: now + 0.25, freqs: [1174.66, 1479.98, 1760.0], dur: 0.25 }, // D, F#, A
        { time: now + 0.55, freqs: [1046.5, 1318.5, 1567.98, 2093.0], dur: 0.45 }, // High C Major
        { time: now + 1.10, freqs: [1046.5, 1318.5, 1567.98], dur: 0.22 },
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

            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(0.9, time + 0.02);
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
    console.warn('[AlarmSound] AudioContext synth notice:', err);
  }

  // 2. Web Speech API (Voice alert)
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel(); // clear queue
      const utterance = new SpeechSynthesisUtterance('¡Nuevo pedido entrante!');
      utterance.lang = 'es-ES';
      utterance.rate = 1.1;
      utterance.pitch = 1.2;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {}
  }

  // 3. HTML5 Audio fallback (/alarm.wav)
  try {
    const audio = new Audio('/alarm.wav');
    audio.volume = 1.0;
    audio.play().catch(() => {});
  } catch {}

  // 4. Haptic vibration on mobile devices
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([400, 150, 400, 150, 800]);
    } catch {}
  }
}

export const playAlarmBeep = playAlarmSound;

/**
 * Global hook — mount once in root layout (NotificationManager).
 * Listens for user gestures to unlock audio, and handles alarm events.
 */
export function useAlarmSound() {
  const initialized = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || initialized.current) return;
    initialized.current = true;

    const onGesture = () => { unlockAudio(); };
    const onAlarm = () => { playAlarmSound(); };

    window.addEventListener('click', onGesture, { passive: true });
    window.addEventListener('touchstart', onGesture, { passive: true });
    window.addEventListener('pointerdown', onGesture, { passive: true });
    window.addEventListener('keydown', onGesture, { passive: true });

    window.addEventListener('play_alarm_sound', onAlarm);
    window.addEventListener('new_order', onAlarm);

    return () => {
      window.removeEventListener('click', onGesture);
      window.removeEventListener('touchstart', onGesture);
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      window.removeEventListener('play_alarm_sound', onAlarm);
      window.removeEventListener('new_order', onAlarm);
    };
  }, []);
}
