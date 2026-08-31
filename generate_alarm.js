// Generates /public/alarm.wav — a 3-note restaurant bell chime
const fs = require('fs');
const path = require('path');

const sampleRate = 22050;
const duration = 2.2;
const numSamples = Math.floor(sampleRate * duration);

const buffer = new ArrayBuffer(44 + numSamples * 2);
const view = new DataView(buffer);

const writeString = (offset, str) => {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
};

writeString(0, 'RIFF');
view.setUint32(4, 36 + numSamples * 2, true);
writeString(8, 'WAVE');
writeString(12, 'fmt ');
view.setUint32(16, 16, true);
view.setUint16(20, 1, true);  // PCM
view.setUint16(22, 1, true);  // mono
view.setUint32(24, sampleRate, true);
view.setUint32(28, sampleRate * 2, true);
view.setUint16(32, 2, true);
view.setUint16(34, 16, true);
writeString(36, 'data');
view.setUint32(40, numSamples * 2, true);

// Restaurant bell chime: 2 triplet sequences
const notes = [
  { startSec: 0.00, freq: 1046.5, dur: 0.22 },
  { startSec: 0.26, freq: 1318.5, dur: 0.22 },
  { startSec: 0.52, freq: 1567.98, dur: 0.38 },
  { startSec: 1.00, freq: 1046.5, dur: 0.22 },
  { startSec: 1.26, freq: 1318.5, dur: 0.22 },
  { startSec: 1.52, freq: 1567.98, dur: 0.50 },
];

const pcm = new Float32Array(numSamples);

for (const note of notes) {
  const startSample = Math.floor(note.startSec * sampleRate);
  const durSamples = Math.floor(note.dur * sampleRate);
  const attackSamples = Math.max(1, Math.floor(0.012 * sampleRate));

  for (let i = 0; i < durSamples && startSample + i < numSamples; i++) {
    const t = i / sampleRate;
    const relPos = (i - attackSamples) / Math.max(1, durSamples - attackSamples);
    const env = i < attackSamples
      ? i / attackSamples
      : Math.exp(-5.5 * relPos);
    pcm[startSample + i] = Math.max(-1, Math.min(1,
      (pcm[startSample + i] || 0) + 0.92 * env * Math.sin(2 * Math.PI * note.freq * t)
    ));
  }
}

for (let i = 0; i < numSamples; i++) {
  const s = Math.max(-1, Math.min(1, pcm[i]));
  view.setInt16(44 + i * 2, Math.round(s * 32767), true);
}

const bytes = new Uint8Array(buffer);
const outPath = path.join(__dirname, 'public', 'alarm.wav');
fs.writeFileSync(outPath, Buffer.from(bytes));
console.log('✅ Generated:', outPath, '— size:', bytes.length, 'bytes');
