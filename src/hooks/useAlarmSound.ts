'use client';

import { useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// KITCHEN BELL ALARM SYSTEM — Loud Service Bell & Background Tab Alert
// Layer 1: Physical-modeling Web Audio Synthesizer (Loud metallic counter bell)
// Layer 2: Audio Element (/alarm.wav fallback & reinforcement)
// Layer 3: Web Speech API (Voice announcement: "¡Atención cocina, nuevo pedido!")
// Layer 4: Native Desktop Notification API (OS banner with requireInteraction)
// Layer 5: Dynamic Tab Title Blinking (alerts user even if window minimized)
// Layer 6: Mobile Haptic Vibration pattern
// ─────────────────────────────────────────────────────────────────────────────

let sharedAudioCtx: AudioContext | null = null;
let audioUnlocked = false;
let lastPlayedTimestamp = 0;

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
 * Pre-unlocks AudioContext and SpeechSynthesis on user interaction.
 */
export async function unlockAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch { /* ignore */ }
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.getVoices();
    } catch {}
  }

  audioUnlocked = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// METALLIC COUNTER SERVICE BELL SYNTHESIZER
// ─────────────────────────────────────────────────────────────────────────────

function synthesizeKitchenBell(ctx: AudioContext): void {
  const now = ctx.currentTime;

  // Master Dynamics Compressor: boosts perceived loudness, prevents digital clipping
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-18, now);
  compressor.knee.setValueAtTime(4, now);
  compressor.ratio.setValueAtTime(14, now);
  compressor.attack.setValueAtTime(0.002, now);
  compressor.release.setValueAtTime(0.2, now);

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(1.4, now); // Loud volume boost

  compressor.connect(masterGain);
  masterGain.connect(ctx.destination);

  /**
   * Generates a single metallic bell strike with inharmonic dome modes and click transient
   */
  const strikeBell = (startTime: number, baseFreq: number, intensity = 1.0) => {
    // 1. Mechanical transient click (striker hitting brass dome)
    try {
      const bufferLength = Math.max(1, Math.floor(ctx.sampleRate * 0.02));
      const clickBuffer = ctx.createBuffer(1, bufferLength, ctx.sampleRate);
      const data = clickBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.0035));
      }
      const clickSource = ctx.createBufferSource();
      clickSource.buffer = clickBuffer;

      const clickFilter = ctx.createBiquadFilter();
      clickFilter.type = 'highpass';
      clickFilter.frequency.setValueAtTime(3200, startTime);

      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.75 * intensity, startTime);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.022);

      clickSource.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(compressor);

      clickSource.start(startTime);
    } catch {}

    // 2. Inharmonic metallic modes characteristic of a brass service bell
    const modes = [
      { freqRatio: 1.00, gain: 0.95, decay: 2.2, type: 'sine' as OscillatorType },     // Fundamental (rich body)
      { freqRatio: 0.77, gain: 0.40, decay: 1.6, type: 'sine' as OscillatorType },     // Sub-tierce (warmth)
      { freqRatio: 1.51, gain: 0.70, decay: 1.8, type: 'triangle' as OscillatorType }, // Tierce (piercing brass ring)
      { freqRatio: 2.00, gain: 0.55, decay: 1.4, type: 'sine' as OscillatorType },     // Octave
      { freqRatio: 2.76, gain: 0.45, decay: 1.1, type: 'sine' as OscillatorType },     // Clang overtone
      { freqRatio: 4.15, gain: 0.35, decay: 0.7, type: 'sine' as OscillatorType },     // High metallic shimmer
      { freqRatio: 5.40, gain: 0.25, decay: 0.4, type: 'triangle' as OscillatorType }, // Sparkle transient
    ];

    modes.forEach(({ freqRatio, gain: partialGain, decay, type }) => {
      try {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = type;
        const targetFreq = baseFreq * freqRatio;
        osc.frequency.setValueAtTime(targetFreq, startTime);

        // Micro-pitch slide for metallic acoustic realism
        osc.frequency.exponentialRampToValueAtTime(Math.max(100, targetFreq * 0.998), startTime + decay);

        // Sharp envelope: 3ms punch attack, then rich exponential ring-out
        const peakGain = partialGain * intensity;
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(peakGain, startTime + 0.003);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + decay);

        osc.connect(gainNode);
        gainNode.connect(compressor);

        osc.start(startTime);
        osc.stop(startTime + decay);
      } catch {}
    });
  };

  // 4-strike kitchen service sequence: "DING! DING! ... DING-DONG!"
  // Strike 1: Bright opening chime (1396.9 Hz - F6)
  strikeBell(now + 0.00, 1396.91, 1.1);
  // Strike 2: Piercing high chime (1567.98 Hz - G6)
  strikeBell(now + 0.32, 1567.98, 1.2);
  // Strike 3: Resonant call (1760.00 Hz - A6)
  strikeBell(now + 0.90, 1760.00, 1.25);
  // Strike 4: Heavy brass counter chime with long 2.5s decay (1396.9 Hz - F6)
  strikeBell(now + 1.25, 1396.91, 1.4);
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB TITLE FLASHING & DESKTOP NOTIFICATIONS (FOR BACKGROUND TABS)
// ─────────────────────────────────────────────────────────────────────────────

let titleFlashingTimer: any = null;
let savedOriginalTitle = '';

export function startTitleFlashing(alertMessage = '🔔 (1) ¡NUEVO PEDIDO COCINA!'): void {
  if (typeof document === 'undefined') return;
  if (!savedOriginalTitle) {
    savedOriginalTitle = document.title || 'ChefFlow Restaurante';
  }

  if (titleFlashingTimer) clearInterval(titleFlashingTimer);

  let isAlert = true;
  titleFlashingTimer = setInterval(() => {
    document.title = isAlert ? alertMessage : `🍽️ REVISAR KANBAN — ${savedOriginalTitle}`;
    isAlert = !isAlert;
  }, 650);

  const cleanUp = () => {
    stopTitleFlashing();
    window.removeEventListener('focus', cleanUp);
    window.removeEventListener('click', cleanUp);
    window.removeEventListener('touchstart', cleanUp);
    window.removeEventListener('keydown', cleanUp);
  };

  window.addEventListener('focus', cleanUp);
  window.addEventListener('click', cleanUp);
  window.addEventListener('touchstart', cleanUp);
  window.addEventListener('keydown', cleanUp);
}

export function stopTitleFlashing(): void {
  if (typeof document === 'undefined') return;
  if (titleFlashingTimer) {
    clearInterval(titleFlashingTimer);
    titleFlashingTimer = null;
  }
  if (savedOriginalTitle) {
    document.title = savedOriginalTitle;
  }
}

/**
 * Requests desktop OS notification permission
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch {
    return false;
  }
}

/**
 * Shows a persistent OS desktop notification with requireInteraction.
 * Visible even if the browser is minimized or the user is in another app.
 */
export function showDesktopOrderNotification(title: string, body: string): void {
  if (typeof window === 'undefined') return;

  // Always flash tab title
  startTitleFlashing('🔔 (1) ¡NUEVO PEDIDO COCINA!');

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const notif = new Notification(title, {
        body,
        icon: '/icon-192.jpg',
        badge: '/icon-192.jpg',
        tag: 'kitchen-new-order',
        requireInteraction: true, // Remains on screen until clicked or dismissed!
      } as any);

      notif.onclick = () => {
        window.focus();
        stopTitleFlashing();
        notif.close();
      };
    } catch (err) {
      console.warn('[DesktopNotification] Notice:', err);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// KITCHEN BELL ENABLED SETTING (PERSISTED IN LOCALSTORAGE)
// ─────────────────────────────────────────────────────────────────────────────

export function isKitchenSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const val = localStorage.getItem('chefflow_kitchen_sound_enabled');
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

export function setKitchenSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('chefflow_kitchen_sound_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('kitchen_sound_toggle', { detail: { enabled } }));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ALERT FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Plays the full restaurant kitchen bell alert.
 * Debounced to 1.8s to avoid overlapping audio when multiple listeners trigger.
 */
export async function playAlarmSound(): Promise<void> {
  if (typeof window === 'undefined') return;

  // Check if staff muted the kitchen sound
  if (!isKitchenSoundEnabled()) return;

  // Debounce to prevent acoustic overlap
  const nowMs = Date.now();
  if (nowMs - lastPlayedTimestamp < 1800) return;
  lastPlayedTimestamp = nowMs;

  // 1. Web Audio API — Authentic Loud Kitchen Service Bell Chime
  try {
    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      synthesizeKitchenBell(ctx);
    }
  } catch (err) {
    console.warn('[AlarmSound] AudioContext error:', err);
  }

  // 2. HTML5 Audio fallback / reinforcement (/alarm.wav)
  try {
    const audio = new Audio('/alarm.wav');
    audio.volume = 1.0;
    audio.play().catch(() => {});
  } catch {}

  // 3. Web Speech API Voice alert (delayed slightly so the bell chimes ring clear first)
  setTimeout(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance('¡Atención cocina! Nuevo pedido.');
        utterance.lang = 'es-CO';
        utterance.rate = 1.1;
        utterance.pitch = 1.2;
        utterance.volume = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch {}
    }
  }, 1400);

  // 4. Mobile device vibration pattern
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

