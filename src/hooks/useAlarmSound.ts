'use client';

import { useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// ALARM SOUND SYSTEM — Restaurant order bell
// Strategy: Use a real /public/alarm.wav file via HTMLAudioElement.
// The element is pre-unlocked on the FIRST user interaction so it can play
// at any time afterwards (including when a realtime order arrives).
// ─────────────────────────────────────────────────────────────────────────────

let _audio: HTMLAudioElement | null = null;
let _unlocked = false;
let _unlocking = false;

function getAlarmAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (_audio) return _audio;
  try {
    const el = new Audio('/alarm.wav');
    el.preload = 'auto';
    el.volume = 1.0;
    el.load();
    _audio = el;
    return el;
  } catch {
    return null;
  }
}

/**
 * Must be called inside a real user-gesture event handler.
 * Silently plays & pauses the audio so the browser "grants" it permission.
 */
async function doUnlock() {
  if (_unlocked || _unlocking) return;
  _unlocking = true;
  const audio = getAlarmAudio();
  if (!audio) { _unlocking = false; return; }
  try {
    audio.volume = 0;
    audio.currentTime = 0;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1.0;
    _unlocked = true;
    console.log('[Alarm] Audio pre-unlocked ✓');
  } catch (e) {
    console.warn('[Alarm] Pre-unlock failed:', e);
    _unlocked = true; // attempt anyway
  } finally {
    _unlocking = false;
  }
}

/**
 * Play the restaurant alarm chime.
 * Safe to call from anywhere (realtime callbacks, effects, etc.).
 */
export async function playAlarmSound(): Promise<void> {
  if (typeof window === 'undefined') return;

  const audio = getAlarmAudio();
  if (audio) {
    try {
      audio.volume = 1.0;
      audio.currentTime = 0;
      await audio.play();
    } catch (err) {
      console.warn('[Alarm] play() blocked — triggering unlock then retry:', err);
      // Unlock and retry once
      await doUnlock();
      try {
        audio.volume = 1.0;
        audio.currentTime = 0;
        await audio.play();
      } catch (e2) {
        console.warn('[Alarm] Retry also failed — AudioContext fallback:', e2);
        playOscillatorFallback();
      }
    }
  } else {
    playOscillatorFallback();
  }

  // Haptic on mobile
  try { if ('vibrate' in navigator) navigator.vibrate([300, 100, 300, 100, 500]); } catch {}
}

/** AudioContext oscillator as absolute last resort */
function playOscillatorFallback() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx: AudioContext = new AudioCtx();
    const notes = [
      [0.00, 1046.5, 0.22], [0.26, 1318.5, 0.22], [0.52, 1567.98, 0.38],
      [1.00, 1046.5, 0.22], [1.26, 1318.5, 0.22], [1.52, 1567.98, 0.50],
    ];
    const now = ctx.currentTime;
    notes.forEach(([delay, freq, dur]) => {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + delay);
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(0.8, now + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + dur);
      } catch {}
    });
  } catch {}
}

export const playAlarmBeep = playAlarmSound;

/**
 * Mount this hook ONCE in the root layout (via NotificationManager).
 * It eagerly loads /alarm.wav and unlocks it on the first user touch/click.
 */
export function useAlarmSound() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Pre-load the audio file immediately
    getAlarmAudio();

    const onGesture = () => { doUnlock(); };
    const onAlarm = () => { playAlarmSound(); };

    // Unlock on any real user interaction
    window.addEventListener('click',      onGesture, { passive: true });
    window.addEventListener('touchstart', onGesture, { passive: true });
    window.addEventListener('pointerdown',onGesture, { passive: true });
    window.addEventListener('keydown',    onGesture, { passive: true });
    window.addEventListener('scroll',     onGesture, { passive: true, once: true } as any);

    // Listen for alarm triggers
    window.addEventListener('play_alarm_sound', onAlarm);
    window.addEventListener('new_order',        onAlarm);

    return () => {
      window.removeEventListener('click',       onGesture);
      window.removeEventListener('touchstart',  onGesture);
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown',     onGesture);
      window.removeEventListener('scroll',      onGesture);
      window.removeEventListener('play_alarm_sound', onAlarm);
      window.removeEventListener('new_order',        onAlarm);
    };
  }, []);
}
