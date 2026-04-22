'use strict';

// --- Web Audio API Sound System ---
// All sounds are synthesized — no external audio files.

let audioCtx = null;
let masterGain = null;
let sfxGain = null;
let musicGain = null;
let _muted = false;
let _forcedMuted = false;
let _volume = 0.5;
let _musicVolume = 0.5;
let _sfxVolume = 0.5;
const _noiseBufferCache = new Map();

function ensureCtx() {
  if (audioCtx) return audioCtx;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = _volume;
  masterGain.connect(audioCtx.destination);
  sfxGain = audioCtx.createGain();
  sfxGain.gain.value = _sfxVolume;
  sfxGain.connect(masterGain);
  musicGain = audioCtx.createGain();
  musicGain.gain.value = _musicVolume;
  musicGain.connect(masterGain);
  return audioCtx;
}

// Resume on user gesture (required by browsers).
//
// iOS WKWebView — including the one the CrazyGames mobile app runs the game
// inside — only fully unlocks the AudioContext when a zero-length buffer is
// started synchronously inside the gesture callback. ctx.resume() alone can
// silently leave playback muted on those webviews, which is why the game
// had audio in mobile Safari but not inside the CrazyGames mobile app.
function _playSilentUnlockBuffer(ctx) {
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    if (typeof source.start === 'function') source.start(0);
    else if (typeof source.noteOn === 'function') source.noteOn(0);
  } catch { /* older Safari builds without BufferSource — ignore */ }
}

// iOS physical silent switch silences WebAudio by default. Playing a silent
// looping HTMLAudioElement alongside the AudioContext makes iOS classify the
// tab as "playing media", which then IGNORES the silent switch for the whole
// audio pipeline — including WebAudio. This is the widely-used "silent audio
// trick" for mobile web games. The data URI is a ~0.5s silent MP3 (~200 bytes).
let _silentAudioEl = null;
const _SILENT_MP3 =
  'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2L' +
  'jEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQ' +
  'bFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//Wrey' +
  'TRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948N' +
  'MBWInljyzsNRFLPWdnZGWrddDsjK1unuSrVN9jJsK8KuQtQCtMBjCEtImISdNK' +
  'JOopIpBFpNSMbIHCSRpRR5iakjTiyzLhchUUBwCgyKiweFwwJcI2WGYpodPKQj' +
  '0HFgMpWjsnGsWVAZIIDAMZGh4JgIKo9DocxFn+5qcqxvVpNvO5o5CnF66suuyj' +
  'wNdu2l6VnZmdq+Z3+72/PX5n4f/uqvnP6/5WXcyz48KS';
function _unlockHTMLAudio() {
  if (_silentAudioEl) return;
  try {
    _silentAudioEl = new Audio(_SILENT_MP3);
    _silentAudioEl.loop = true;
    // iOS refuses to play volume 0; tiny-but-nonzero keeps it silent yet valid.
    _silentAudioEl.volume = 0.001;
    _silentAudioEl.setAttribute('playsinline', '');
    _silentAudioEl.setAttribute('webkit-playsinline', '');
    const playPromise = _silentAudioEl.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => { /* autoplay rejected — harmless, retry next gesture */ });
    }
  } catch { /* ignore */ }
}

export function resumeAudio() {
  _unlockHTMLAudio();
  const ctx = ensureCtx();
  _playSilentUnlockBuffer(ctx);
  if (ctx.state === 'suspended') return ctx.resume();
  return Promise.resolve();
}

export function isAudioUnlocked() {
  return !!audioCtx && audioCtx.state === 'running';
}

export function ensureTitleMusicStarted() {
  return Promise.resolve(resumeAudio()).then(() => {
    startMusic();
  });
}

export function setVolume(v) {
  _volume = v;
  if (masterGain) masterGain.gain.value = (_muted || _forcedMuted) ? 0 : v;
}

export function toggleMute() {
  _muted = !_muted;
  if (masterGain) masterGain.gain.value = (_muted || _forcedMuted) ? 0 : _volume;
  return _muted;
}

export function setForcedMuted(v) {
  _forcedMuted = !!v;
  if (masterGain) masterGain.gain.value = (_muted || _forcedMuted) ? 0 : _volume;
  return _forcedMuted;
}

export function setMusicVolume(v) {
  _musicVolume = Math.max(0, Math.min(1, v));
  if (musicGain) musicGain.gain.value = _musicVolume;
}

export function setSfxVolume(v) {
  _sfxVolume = Math.max(0, Math.min(1, v));
  if (sfxGain) sfxGain.gain.value = _sfxVolume;
}

export function getMusicVolume() { return _musicVolume; }
export function getSfxVolume() { return _sfxVolume; }
export function isMuted() { return _muted; }
export function isForcedMuted() { return _forcedMuted; }

// --- Helper: play a tone ---
function _disconnectNode(node) {
  if (!node) return;
  try { node.disconnect(); } catch (e) { /* already disconnected */ }
}

function _cleanupNodes(nodes) {
  if (!nodes) return;
  for (const node of nodes) _disconnectNode(node);
}

function playTone(freq, type, duration, volume, dest) {
  const ctx = ensureCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume || 0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(dest || sfxGain);
  osc.onended = () => _cleanupNodes([osc, gain]);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

// --- Helper: noise burst ---
function _getNoiseBuffer(ctx, duration) {
  const sampleCount = Math.max(1, Math.ceil(ctx.sampleRate * duration));
  const key = `${ctx.sampleRate}:${sampleCount}`;
  if (_noiseBufferCache.has(key)) return _noiseBufferCache.get(key);
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) data[i] = Math.random() * 2 - 1;
  _noiseBufferCache.set(key, buffer);
  return buffer;
}

function playNoise(duration, volume, filterFreq, filterType, dest) {
  const ctx = ensureCtx();
  const source = ctx.createBufferSource();
  source.buffer = _getNoiseBuffer(ctx, duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume || 0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  let filter = null;
  if (filterFreq) {
    filter = ctx.createBiquadFilter();
    filter.type = filterType || 'lowpass';
    filter.frequency.value = filterFreq;
    source.connect(filter);
    filter.connect(gain);
  } else {
    source.connect(gain);
  }
  gain.connect(dest || sfxGain);
  source.onended = () => _cleanupNodes(filter ? [source, filter, gain] : [source, gain]);
  source.start(ctx.currentTime);
  source.stop(ctx.currentTime + duration);
}

// ==========================================
// SOUND EFFECTS
// ==========================================

// Dash / bounce: short whoosh
export function sfxDash() {
  const ctx = ensureCtx();
  // Set dash state for bass sequencer (8th notes during dash)
  _playerDashing = true;
  setTimeout(() => { _playerDashing = false; }, 300);
  playNoise(0.12, 0.15, 3000, 'highpass');
  playTone(200, 'sine', 0.08, 0.1);
  // Frequency sweep up
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.onended = () => _cleanupNodes([osc, gain]);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.1);
  _reactToAction('dash');
}

// Wall bounce
export function sfxBounce() {
  playTone(300, 'triangle', 0.06, 0.12);
  playTone(450, 'sine', 0.04, 0.06);
}

// Enemy kill: satisfying pop (pitch varies) + music accent
export function sfxEnemyKill(enemyType) {
  const pitchMap = {
    drifter: 600, tracker: 500, splitter: 450, mini_splitter: 800,
    pulser: 400, teleporter: 700, bomber: 350, spawner: 380,
    spawner_minion: 900, sniper: 550,
  };
  const freq = pitchMap[enemyType] || 600;
  playTone(freq, 'sine', 0.08, 0.18);
  playTone(freq * 1.5, 'sine', 0.05, 0.08);
  playNoise(0.04, 0.06, 4000, 'highpass');
  // Pass enemy's scale degree so music plays an in-key note
  const degree = ENEMY_SCALE_DEGREE[enemyType] || 0;
  _reactToAction('kill', degree);
}

// Combo kills: escalating pitch
export function sfxComboKill(comboCount) {
  const baseFreq = 400 + Math.min(comboCount, 20) * 40;
  playTone(baseFreq, 'sine', 0.1, 0.2);
  playTone(baseFreq * 1.25, 'triangle', 0.06, 0.1);
  _reactToAction('combo', comboCount);
}

// Power-up select: card pick confirmation
export function sfxCardPick() {
  ensureCtx();
  _playKeyedTone(0, 1, 'sine', 0.1, 0.12, 0);
  _playKeyedTone(1, 1, 'sine', 0.1, 0.12, 60);
  _playKeyedTone(2, 1, 'triangle', 0.16, 0.13, 120);
  _reactToAction('card_pick');
}

// Shield block: metallic clang
export function sfxShieldBlock() {
  const ctx = ensureCtx();
  playTone(1200, 'square', 0.06, 0.12);
  playTone(800, 'triangle', 0.1, 0.1);
  playNoise(0.05, 0.1, 6000, 'highpass');
  _reactToAction('shield_block');
}

// Beam deflected by obstacle: metallic ping
export function sfxBeamDeflect() {
  playTone(1800, 'sine', 0.05, 0.15);
  playTone(2400, 'triangle', 0.03, 0.1);
  playNoise(0.04, 0.08, 8000, 'highpass');
}

// Shield break (enemy): glass shatter
export function sfxShieldBreak() {
  playNoise(0.2, 0.2, 8000, 'highpass');
  playTone(2000, 'square', 0.03, 0.1);
  playTone(1500, 'square', 0.05, 0.08);
  playTone(1000, 'sine', 0.08, 0.06);
  _reactToAction('shield_break');
}

// Damage taken: low thud
export function sfxDamageTaken() {
  playTone(80, 'sine', 0.2, 0.3);
  playTone(60, 'triangle', 0.15, 0.2);
  playNoise(0.1, 0.12, 400, 'lowpass');
  _reactToAction('damage');
}

// Wave clear: triumphant chime
export function sfxWaveClear() {
  _playKeyedTone(0, 1, 'sine', 0.15, 0.12, 0);
  _playKeyedTone(2, 1, 'sine', 0.15, 0.11, 80);
  _playKeyedTone(1, 2, 'triangle', 0.18, 0.11, 170);
  _playKeyedTone(3, 1, 'sine', 0.3, 0.14, 280);
  _reactToAction('wave_clear');
}

// Boss intro: dramatic reveal
export function sfxBossIntro() {
  const ctx = ensureCtx();
  playTone(100, 'sawtooth', 0.6, 0.15);
  playTone(50, 'sine', 0.8, 0.12);
  setTimeout(() => {
    playTone(150, 'sawtooth', 0.4, 0.1);
    playNoise(0.3, 0.08, 800, 'lowpass');
  }, 300);
  _reactToAction('boss_intro');
}

// Boss hit: heavy impact
export function sfxBossHit() {
  playTone(120, 'sine', 0.15, 0.25);
  playTone(80, 'triangle', 0.1, 0.15);
  playNoise(0.08, 0.12, 2000, 'lowpass');
  _reactToAction('boss_hit');
}

// Boss phase transition: dramatic shift
export function sfxBossPhaseTransition() {
  const ctx = ensureCtx();
  // Deep rising sweep
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(60, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.5);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.onended = () => _cleanupNodes([osc, gain]);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.6);
  playNoise(0.4, 0.1, 1500, 'lowpass');
}

// Boss defeat: explosion + fanfare
export function sfxBossDefeat() {
  // Explosion
  playNoise(0.4, 0.25, 1200, 'lowpass');
  playTone(60, 'sine', 0.3, 0.2);
  // Victory fanfare
  setTimeout(() => {
    _playKeyedTone(0, 1, 'sine', 0.2, 0.13, 0);
    _playKeyedTone(1, 1, 'sine', 0.2, 0.12, 120);
    _playKeyedTone(2, 1, 'triangle', 0.22, 0.12, 240);
    _playKeyedTone(3, 2, 'sine', 0.5, 0.16, 360);
  }, 300);
}

// Game over: descending tone
export function sfxGameOver() {
  const ctx = ensureCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(500, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.8);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.onended = () => _cleanupNodes([osc, gain]);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 1.0);
  playNoise(0.3, 0.08, 600, 'lowpass');
}

// Shard collect: coin-like chime
export function sfxShardCollect() {
  _playKeyedTone(2, 2, 'sine', 0.06, 0.08, 0);
  _playKeyedTone(4, 2, 'triangle', 0.09, 0.06, 28);
}

// Evolution unlock: epic reveal
export function sfxEvolutionUnlock() {
  _playKeyedTone(0, 0, 'sine', 0.15, 0.12, 0);
  _playKeyedTone(1, 0, 'sine', 0.15, 0.12, 100);
  _playKeyedTone(2, 1, 'sine', 0.18, 0.12, 200);
  _playKeyedTone(3, 1, 'triangle', 0.42, 0.16, 320);
  setTimeout(() => playNoise(0.2, 0.06, 6000, 'highpass'), 300);
  _reactToAction('evolution');
}

export function sfxBoostCollect(boostType) {
  const motifs = {
    screenNuke: [0, 6, 1],
    invincibility: [0, 2, 4],
    healthRestore: [1, 2, 0],
    pointFrenzy: [2, 4, 6],
    staminaBurst: [0, 1, 2],
  };
  const degrees = motifs[boostType] || [0, 2, 4];
  _playKeyedTone(degrees[0], 1, 'triangle', 0.08, 0.09, 0);
  _playKeyedTone(degrees[1], 1, 'sine', 0.10, 0.09, 55);
  _playKeyedTone(degrees[2], 1, 'triangle', 0.14, 0.10, 110);
  _reactToAction('boost', boostType);
}

// UI navigation: subtle click
export function sfxUIClick() {
  _playKeyedTone(1, 1, 'sine', 0.03, 0.04, 0);
}

// Multi-Pop explosion
export function sfxMultiPop() {
  playTone(250, 'sine', 0.12, 0.15);
  playNoise(0.08, 0.1, 3000, 'highpass');
}

// Gravity Bomb detonation
export function sfxGravityBomb() {
  playTone(60, 'sine', 0.3, 0.2);
  playNoise(0.15, 0.15, 800, 'lowpass');
}

// ==========================================
// BACKGROUND MUSIC — Procedural Music System
// 6-voice architecture: bass, harmony, lead, texture, choirLow, choirHigh
// ==========================================

// --- Arc parameter definitions (6 arcs) ---
const MUSIC_ARCS = [
  { // Arc 0: The Awakening (Waves 1–9)
    waveMin: 1, waveMax: 9, bpm: [90, 110],
    bass: { freq: 110, type: 'sine', gain: [0.10, 0.14], lfoRate: 0.2, lfoDepth: 0.03 },
    harmony: { freq: 165, type: 'triangle', gain: [0.06, 0.10], fadeInWave: 3 },
    lead: {
      notes: [220, 262, 330, 440], type: 'sawtooth', gain: [0.04, 0.08], fadeInWave: 5, subdiv: 1, legato: 1.0, revealBeats: 8,
      variation: { octaveUpChance: 0.015, octaveDownChance: 0, passingToneChance: 0.01, graceChance: 0.015, heatGraceScale: 0.03, graceHeatThreshold: 0.78 }
    },
    texture: { freq: 880, type: 'square', gain: [0.02, 0.04], fadeInWave: 7, burstSec: 0.05, everyBeats: 4, cutoff: 1200 },
    choir: { gain: [0.016, 0.040], cutoff: [780, 1180], Q: [0.8, 1.2], fadeInWave: 4 },
    progression: [
      { root: 0, quality: 'minor' },
      { root: 3, quality: 'major' },
      { root: 0, quality: 'minor' },
      { root: 8, quality: 'major' },
    ],
    progressionBeats: 8,
    filter: { hz: [500, 1800], Q: [1, 1] },
    lfo: { rate: [0.25, 0.6], depth: 0.04 },
    transIn: 2.0,
  },
  { // Arc 1: Hive Nest (Wave 10)
    waveMin: 10, waveMax: 10, bpm: [115, 115],
    bass: { freq: 73.4, type: 'sine', gain: [0.12, 0.12], lfoRate: 0.3, lfoDepth: 0.02 },
    harmony: { freqs: [175, 220], type: 'triangle', gain: [0.08, 0.08], swapBeats: 2 },
    lead: {
      notes: [294, 349, 440, 587], type: 'sawtooth', gain: [0.06, 0.06], subdiv: 1, legato: 0.8,
      variation: { octaveUpChance: 0.02, octaveDownChance: 0.01, passingToneChance: 0.02, graceChance: 0.03, heatGraceScale: 0.04, graceHeatThreshold: 0.72 }
    },
    texture: { freq: 660, type: 'triangle', gain: [0.04, 0.04], burstSec: 0.03, everyBeats: 2 },
    choir: { gain: [0.045, 0.055], cutoff: [1000, 1200], Q: [1.0, 1.4] },
    progression: [
      { root: 0, quality: 'minor' },
      { root: 8, quality: 'major' },
      { root: 3, quality: 'major' },
      { root: 0, quality: 'minor' },
    ],
    progressionBeats: 4,
    filter: { hz: [2000, 2000], Q: [2, 2] },
    lfo: { rate: [0.4, 0.4], depth: 0.03 },
    transIn: 2.0,
  },
  { // Arc 2: The Deep Grid (Waves 11–19)
    waveMin: 11, waveMax: 19, bpm: [118, 130],
    bass: { freq: 82.4, type: 'sine', gain: [0.12, 0.16], staccato: true },
    harmony: { freqs: [87.3, 123.5], type: 'triangle', gain: [0.07, 0.10], swapBeats: 4 },
    lead: {
      notes: [165, 175, 220, 247], type: 'sawtooth', gain: [0.05, 0.09], subdiv: 4, legato: 0.7, cutoff: 1500, revealBeats: 6,
      variation: { octaveUpChance: 0.03, octaveDownChance: 0.01, passingToneChance: 0.03, graceChance: 0.04, heatGraceScale: 0.05, graceHeatThreshold: 0.68 }
    },
    texture: { freq: 440, type: 'square', gain: [0.03, 0.05], burstSec: 0.02, everyBeats: 1, pitchDev: 0.1 },
    choir: { gain: [0.026, 0.052], cutoff: [850, 1380], Q: [1.2, 2.0], fadeInWave: 13 },
    progression: [
      { root: 0, quality: 'minor' },
      { root: 1, quality: 'major' },
      { root: 8, quality: 'major' },
      { root: 0, quality: 'minor' },
    ],
    progressionBeats: 8,
    filter: { hz: [1200, 2500], Q: [1, 4] },
    lfo: { rate: [0.8, 1.5], depth: 0.05 },
    transIn: 2.0,
  },
  { // Arc 3: Nexus Chamber (Wave 20)
    waveMin: 20, waveMax: 20, bpm: [135, 135],
    bass: { freq: 110, type: 'sine', gain: [0.15, 0.15], bass2Freq: 82.4 },
    harmony: { freq: 262, type: 'triangle', gain: [0.09, 0.09], vibratoHz: 1, vibratoDep: 5 },
    lead: {
      notes: [440, 494, 523, 659, 880], type: 'sawtooth', gain: [0.08, 0.08], subdiv: 8, legato: 0.6, cutoff: 3000,
      variation: { octaveUpChance: 0.04, octaveDownChance: 0.015, passingToneChance: 0.04, graceChance: 0.05, heatGraceScale: 0.06, graceHeatThreshold: 0.62 }
    },
    texture: { freq: 4000, type: 'square', gain: [0.05, 0.05], burstSec: 0.015, everyBeats: 0.5 },
    choir: { gain: [0.055, 0.065], cutoff: [1300, 1700], Q: [1.3, 1.7] },
    progression: [
      { root: 0, quality: 'minor' },
      { root: 3, quality: 'major' },
      { root: 8, quality: 'major' },
      { root: 0, quality: 'minor' },
    ],
    progressionBeats: 4,
    filter: { hz: [3000, 3000], Q: [6, 6] },
    lfo: { rate: [1.2, 1.2], depth: 0.06 },
    transIn: 1.5,
  },
  { // Arc 4: The Void Approaches (Waves 21–29)
    waveMin: 21, waveMax: 29, bpm: [125, 108],
    bass: { freq: 77.8, type: 'sine', gain: [0.12, 0.16], pitchLfoRate: 0.15, pitchLfoDep: 2 },
    harmony: { freqs: [110, 92.5], type: 'triangle', gain: [0.05, 0.05], swapBeats: 4 },
    lead: {
      notes: [156, 185, 220, 311], type: 'sawtooth', gain: [0.05, 0.08], subdiv: 0.667, legato: 0.7, silenceChance: 0.3,
      variation: { octaveUpChance: 0.015, octaveDownChance: 0.02, passingToneChance: 0.015, graceChance: 0.015, heatGraceScale: 0.02, graceHeatThreshold: 0.8 }
    },
    texture: { freq: 40, type: 'square', gain: [0.04, 0.04], continuous: true, cutoff: 200, contLfoRate: 0.1 },
    choir: { gain: [0.040, 0.070], cutoff: [700, 1000], Q: [1.0, 1.8] },
    progression: [
      { root: 0, quality: 'minor', fifth: 6, choirRole: 'fifth' },
      { root: 3, quality: 'minor', fifth: 6, choirRole: 'fifth' },
      { root: 0, quality: 'minor', fifth: 6, choirRole: 'fifth' },
      { root: 9, quality: 'minor', fifth: 6, choirRole: 'fifth' },
    ],
    progressionBeats: 8,
    filter: { hz: [2200, 800], Q: [2, 3] },
    lfo: { rate: [0.4, 0.4], depth: [0.02, 0.06] },
    transIn: 2.0,
  },
  { // Arc 5: The Void (Wave 30)
    waveMin: 30, waveMax: 30, bpm: [100, 100],
    bass: { freq: 55, type: 'sine', gain: [0.12, 0.12] },
    harmony: { freq: 82.4, type: 'triangle', gain: [0.03, 0.03] },
    lead: {
      notes: [220], type: 'sawtooth', gain: [0.05, 0.05], subdiv: 0.5, legato: 0.2, cutoff: 600,
      variation: { octaveUpChance: 0, octaveDownChance: 0.01, passingToneChance: 0, graceChance: 0, heatGraceScale: 0, graceHeatThreshold: 1 }
    },
    texture: { freq: 0, type: 'sine', gain: [0, 0] },
    choir: { gain: [0.055, 0.085], cutoff: [500, 700], Q: [1.5, 2.4] },
    progression: [
      { root: 0, quality: 'minor' },
      { root: 1, quality: 'minor', fifth: 6 },
      { root: 0, quality: 'minor' },
      { root: 10, quality: 'major' },
    ],
    progressionBeats: 4,
    filter: { hz: [600, 600], Q: [1, 1] },
    lfo: { rate: [0.2, 0.2], depth: 0.02 },
    transIn: 3.0,
  },
];

// --- Boss theme definitions ---
const BOSS_THEMES = [
  { // Boss 1: Hive Queen (Wave 10)
    bpm: 140, outGain: 0.22,
    bass: { freq: 73.4, type: 'sine', gain: 0.16, lfoRate: 2.3, lfoDepth: 0.04 },
    harmony: { freqs: [87.3, 110], type: 'triangle', gain: 0.08, vibratoHz: 5, vibratoDep: 3 },
    lead: {
      notes: [147, 175, 220, 294], type: 'sawtooth', gain: 0.07, subdiv: 4, legato: 0.25, cutoff: 2000,
      variation: { octaveUpChance: 0.02, octaveDownChance: 0.01, passingToneChance: 0.02, graceChance: 0.03, heatGraceScale: 0.05, graceHeatThreshold: 0.68 }
    },
    texture: { freq: 220, type: 'square', gain: 0.05, burstSec: 0.01, everyBeats: 0.5 },
    choir: { gain: 0.060, cutoff: 1200, Q: 1.6 },
    progression: [
      { root: 0, quality: 'minor' },
      { root: 8, quality: 'major' },
      { root: 3, quality: 'major' },
      { root: 0, quality: 'minor' },
    ],
    progressionBeats: 4,
    filter: 2200, filterQ: 4, lfoRate: 2.0,
  },
  { // Boss 2: Nexus Core (Wave 20)
    bpm: 150, outGain: 0.22,
    bass: { freq: 65.4, type: 'square', gain: 0.14, cutoff: 300 },
    harmony: { freqs: [77.8, 98], type: 'triangle', gain: 0.07, swapBeats: 1 },
    lead: {
      notes: [131, 156, 196, 233, 262], type: 'sawtooth', gain: 0.08, subdiv: 8, legato: 0.5, cutoff: 2500,
      variation: { octaveUpChance: 0.04, octaveDownChance: 0.015, passingToneChance: 0.04, graceChance: 0.05, heatGraceScale: 0.07, graceHeatThreshold: 0.6 }
    },
    texture: { freq: 5000, type: 'square', gain: 0.04, burstSec: 0.008, everyBeats: 1 },
    choir: { gain: 0.055, cutoff: 1400, Q: 2.0 },
    progression: [
      { root: 0, quality: 'minor' },
      { root: 8, quality: 'major' },
      { root: 3, quality: 'major' },
      { root: 0, quality: 'minor' },
    ],
    progressionBeats: 4,
    filter: 2500, filterQ: 5, lfoRate: 2.5,
    phaseEsc: { bpmAdd: 10, filterAdd: 500, texGainAdd: 0.02 },
  },
  { // Boss 3: Void Warden (Wave 30)
    bpm: 95, outGain: 0.22,
    bass: { freqs: [55, 77.8], type: 'sine', gain: 0.18, lfoRate: 0.08, lfoDepth: 3, swapBars: 4 },
    harmony: { type: 'triangle', gain: 0.04 },
    lead: {
      notes: [880, 440, 220, 110], type: 'sawtooth', gain: 0.06, subdiv: 0.25, legato: 0.3, cutoff: 500, silenceAfter: 4,
      variation: { octaveUpChance: 0, octaveDownChance: 0.02, passingToneChance: 0.01, graceChance: 0.01, heatGraceScale: 0.01, graceHeatThreshold: 0.85 }
    },
    texture: { freq: 30, type: 'sine', gain: 0.06, continuous: true, contLfoRate: 0.05 },
    choir: { gain: 0.080, cutoff: 650, Q: 2.4 },
    filter: 800, filterQ: 2, lfoRate: 0.5,
    phaseEsc: { bassGainAdd: 0.01, texGainAdd: 0.01, leadFilterAdd: 100 },
  },
];

const TITLE_PROGRESSION = [
  { root: 0, quality: 'minor' },
  { root: 3, quality: 'major' },
  { root: 7, quality: 'minor' },
  { root: 5, quality: 'major' },
];
const TITLE_PROGRESSION_BEATS = 4;
const TITLE_CHOIR = { gain: 0.05, cutoff: 1350, Q: 1.2 };

// --- Internal music state ---
let _musicPlaying = false;
let _musicIntensity = 0;
let _isBossMusic = false;
let _currentWave = 0;
let _currentArcIdx = 0;
let _bossPhase = 0;
let _gameState = 'title'; // title | playing | wave_break | power_select | boss_intro | boss_fight | game_over

// Voice nodes
let _voices = null;   // { bass, harmony, lead, texture, choirLow, choirHigh, bass2? }
let _outputGain = null;
let _globalFilter = null;
let _lfo = null;
let _lfoGain = null;
let _bassPitchLfo = null;
let _harmonyVibrato = null;
let _leadFilter = null;
let _textureFilter = null;
let _choirFilter = null;

// Scheduler state
let _schedulerTimer = null;
let _transportAnchorTime = 0;
let _pendingTransitions = [];
let _nextLeadTime = 0;
let _leadIdx = 0;
let _nextTextureTime = 0;
let _nextChordTime = 0;
let _nextHarmonySwapTime = 0;
let _harmonyFlip = false;
let _nextBassSwapTime = 0;
let _bassFlip = false;
let _currentBpm = 90;
let _leadSilenced = false; // for void gaps
let _voidLeadCount = 0; // for Void Warden silence-after pattern
let _chordIdx = 0;
let _currentHarmonicRoot = 110;
let _currentChordQuality = 'minor';
let _currentChordFifth = 7;
let _leadSpotlightUntil = 0;
let _reactiveCooldowns = Object.create(null);

// Saved params for state restoration
let _savedFilterHz = 0;
let _savedLeadGain = 0;
let _savedBpm = 0;
let _savedChoirCutoff = 0;
let _elementEntrances = {
  lead: null,
  texture: null,
  choir: null,
};

// --- Gameplay-reactive music state ---
let _actionHeat = 0;        // 0-1 cumulative action intensity, decays over time
let _heatDecayTimer = null;
let _lastFilterBoost = 0;

function _startHeatDecay() {
  if (_heatDecayTimer) return;
  _heatDecayTimer = setInterval(() => {
    _actionHeat = Math.max(0, _actionHeat - 0.015);
    if (_actionHeat <= 0 && _heatDecayTimer) {
      clearInterval(_heatDecayTimer);
      _heatDecayTimer = null;
    }
    // Apply heat to music parameters
    if (_musicPlaying && _voices && _globalFilter && !_isBossMusic && _gameState === 'playing') {
      const heatFilterBoost = _actionHeat * 800;
      const heatLeadGain = _actionHeat * 0.04;
      if (Math.abs(heatFilterBoost - _lastFilterBoost) > 20) {
        _ramp(_globalFilter.frequency, (_savedFilterHz || 800) + heatFilterBoost, 0.08);
        _lastFilterBoost = heatFilterBoost;
      }
      // Texture gains up with heat
      if (_voices.texture) {
        _voices.texture.gain.gain.value = Math.min(0.08, _actionHeat * 0.06);
      }
      // Subtle lead gain boost
      if (_voices.lead) {
        const baseLead = _getLeadTargetGain();
        _voices.lead.gain.gain.value = baseLead + heatLeadGain;
      }
    }
  }, 50);
}

// --- Musical accent system: play in-key notes through music channel ---
// Enemy type → scale degree (0-6 in current key)
const ENEMY_SCALE_DEGREE = {
  drifter: 0, tracker: 2, splitter: 3, mini_splitter: 5,
  pulser: 1, teleporter: 4, bomber: 0, spawner: 2,
  spawner_minion: 6, sniper: 3,
};
function _getArcRoot() {
  if (_currentHarmonicRoot > 0) return _currentHarmonicRoot;
  if (_isBossMusic) {
    const boss = BOSS_THEMES[_getBossIndex(_currentWave)];
    return boss.bass.freq || boss.bass.freqs?.[0] || 110;
  }
  if (_gameState === 'title') return 110;
  const arc = MUSIC_ARCS[_currentArcIdx];
  return arc ? arc.bass.freq : 110;
}

function _freqWithSemitone(base, semitones) {
  return base * Math.pow(2, semitones / 12);
}

function _startElementEntrance(key, duration) {
  if (!audioCtx) return;
  _elementEntrances[key] = {
    start: audioCtx.currentTime,
    duration: Math.max(0.1, duration || 1.2),
  };
}

function _getElementEntranceMul(key) {
  const entrance = _elementEntrances[key];
  if (!entrance || !audioCtx) return 1;
  const t = (audioCtx.currentTime - entrance.start) / entrance.duration;
  if (t >= 1) {
    _elementEntrances[key] = null;
    return 1;
  }
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function _crossedFadeWave(prevWave, wave, fadeInWave) {
  return !!fadeInWave && prevWave < fadeInWave && wave >= fadeInWave;
}

function _getAccentIntervals() {
  const third = _currentChordQuality === 'major' ? 4 : 3;
  const fifth = _currentChordFifth || 7;
  const seventh = fifth === 6 ? 9 : (_currentChordQuality === 'major' ? 11 : 10);
  return [0, third, fifth, 12, third + 12, fifth + 12, seventh + 12];
}

function _accentFreq(root, degree, octaveShift) {
  const intervals = _getAccentIntervals();
  const idx = ((degree % intervals.length) + intervals.length) % intervals.length;
  const oct = Math.floor(degree / intervals.length) + (octaveShift || 0);
  return root * Math.pow(2, (intervals[idx] / 12) + oct);
}

function _playKeyedTone(degree, octaveShift, type, duration, volume, delayMs, dest) {
  const root = _getArcRoot();
  const play = () => playTone(_accentFreq(root, degree, octaveShift), type, duration, volume, dest);
  if (delayMs && delayMs > 0) setTimeout(play, delayMs);
  else play();
}

function _getCurrentProgression() {
  if (_gameState === 'title') {
    return { steps: TITLE_PROGRESSION, beats: TITLE_PROGRESSION_BEATS, baseFreq: 110 };
  }
  if (_isBossMusic) {
    const boss = BOSS_THEMES[_getBossIndex(_currentWave)];
    if (!boss || !boss.progression) return null;
    return {
      steps: boss.progression,
      beats: boss.progressionBeats || 4,
      baseFreq: boss.bass.freq || boss.bass.freqs?.[0] || 110
    };
  }
  const arc = MUSIC_ARCS[_currentArcIdx];
  if (!arc || !arc.progression) return null;
  return {
    steps: arc.progression,
    beats: arc.progressionBeats || 4,
    baseFreq: arc.bass.freq
  };
}

function _getCurrentChoirDef() {
  if (_gameState === 'title') return TITLE_CHOIR;
  if (_isBossMusic) {
    const boss = BOSS_THEMES[_getBossIndex(_currentWave)];
    return boss ? boss.choir : null;
  }
  const arc = MUSIC_ARCS[_currentArcIdx];
  return arc ? arc.choir : null;
}

function _getChoirTargetGain() {
  const choir = _getCurrentChoirDef();
  if (!choir) return 0;
  let base = 0;
  if (_gameState === 'title') {
    base = choir.gain || 0;
  } else if (_isBossMusic) {
    base = choir.gain || 0;
  } else {
    const arc = MUSIC_ARCS[_currentArcIdx];
    const p = _getArcProgress(_currentWave, arc);
    base = Array.isArray(choir.gain) ? _lerp(choir.gain[0], choir.gain[1], p) : (choir.gain || 0);
    if (choir.fadeInWave && _currentWave < choir.fadeInWave) return 0;
  }

  let stateMul = 1.0;
  if (_gameState === 'wave_break') stateMul = 1.12;
  else if (_gameState === 'power_select') stateMul = 1.22;
  else if (_gameState === 'boss_intro') stateMul = 1.35;
  else if (_gameState === 'playing' || _gameState === 'boss_fight') {
    stateMul = 0.90 + _actionHeat * 0.28 + _playerSpeed * 0.12;
  }

  const spotlightMul = _isLeadSpotlightActive() ? 0.74 : 1;
  return Math.min(0.12, base * stateMul * spotlightMul * _getElementEntranceMul('choir'));
}

function _applyChoirParams(def, wave, dur) {
  if (!_voices || !_choirFilter || !def) return;
  const td = dur || 1.0;
  let cutoff = def.cutoff || 1200;
  let q = def.Q || 1.0;
  if (Array.isArray(def.cutoff) && !_isBossMusic && _gameState !== 'title') {
    const arc = MUSIC_ARCS[_currentArcIdx];
    const p = _getArcProgress(wave, arc);
    cutoff = _lerp(def.cutoff[0], def.cutoff[1], p);
  }
  if (Array.isArray(def.Q) && !_isBossMusic && _gameState !== 'title') {
    const arc = MUSIC_ARCS[_currentArcIdx];
    const p = _getArcProgress(wave, arc);
    q = _lerp(def.Q[0], def.Q[1], p);
  }
  _savedChoirCutoff = cutoff;
  _ramp(_choirFilter.frequency, cutoff, td);
  _ramp(_choirFilter.Q, q, td);
  _voices.choirLow.osc.type = 'triangle';
  _voices.choirHigh.osc.type = _isBossMusic ? 'sawtooth' : 'triangle';
}

function _applyChordToVoices(time, chord, baseFreq) {
  if (!_voices || !chord) return;
  const root = _freqWithSemitone(baseFreq, chord.root || 0);
  const third = chord.quality === 'major' ? 4 : 3;
  const fifth = chord.fifth || 7;
  const harmonySemi = chord.harmonyRole === 'fifth' ? fifth : third;
  const choirSemi = chord.choirRole === 'fifth' ? fifth + 12 : third + 12;
  _currentHarmonicRoot = root;
  _currentChordQuality = chord.quality || 'minor';
  _currentChordFifth = fifth;

  if (_voices.harmony) {
    _voices.harmony.osc.frequency.setValueAtTime(_freqWithSemitone(root, harmonySemi), time);
  }
  if (_voices.choirLow) {
    _voices.choirLow.osc.frequency.setValueAtTime(root * 2, time);
  }
  if (_voices.choirHigh) {
    _voices.choirHigh.osc.frequency.setValueAtTime(_freqWithSemitone(root, choirSemi), time);
  }
}

function _scheduleChoirChord(time, beatInterval) {
  if (!_voices || !_voices.choirLow || !_voices.choirHigh) return;
  const targetGain = _getChoirTargetGain();
  const intervalSec = Math.max(0.4, _beatSec() * beatInterval);
  const tension = 1 - _playerHpRatio;
  const lowTarget = Math.min(0.14, targetGain * (1.10 + tension * 0.20));
  const highTarget = Math.min(0.12, targetGain * (0.82 + _actionHeat * 0.35 + _playerSpeed * 0.10));
  const attack = Math.min(0.55, intervalSec * 0.22);
  const hold = time + Math.max(attack + 0.05, intervalSec * 0.72);
  const release = time + intervalSec * 0.96;
  const lowGain = _voices.choirLow.gain.gain;
  const highGain = _voices.choirHigh.gain.gain;

  lowGain.setValueAtTime(0, time);
  lowGain.linearRampToValueAtTime(lowTarget, time + attack);
  lowGain.setValueAtTime(lowTarget, hold);
  lowGain.linearRampToValueAtTime(targetGain * 0.18, release);

  highGain.setValueAtTime(0, time);
  highGain.linearRampToValueAtTime(highTarget, time + attack * 0.85);
  highGain.setValueAtTime(highTarget, hold);
  highGain.linearRampToValueAtTime(targetGain * 0.12, release);
}

function _applyProgressionStep(time) {
  const progression = _getCurrentProgression();
  if (!progression || !progression.steps || progression.steps.length === 0) return;
  const chord = progression.steps[_chordIdx % progression.steps.length];
  _applyChordToVoices(time, chord, progression.baseFreq);
  _scheduleChoirChord(time, progression.beats || 4);
  _chordIdx++;
}

function _playMusicAccent(freq, dur, vol, delay, prominent) {
  if (!audioCtx || !musicGain) return;
  const ctx = audioCtx;
  const t = ctx.currentTime + (delay || 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(4000, freq * 4);
  const v = vol || 0.07;
  gain.gain.setValueAtTime(v, t);
  gain.gain.setValueAtTime(v, t + dur * 0.6);
  gain.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(filter);
  filter.connect(gain);
  // Prominent accents route through sfxGain (louder, cuts through)
  gain.connect(prominent ? sfxGain : (_outputGain || musicGain));
  osc.onended = () => _cleanupNodes([osc, filter, gain]);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

function _canReactNow(action, minInterval) {
  if (!audioCtx) return false;
  const now = audioCtx.currentTime;
  const last = _reactiveCooldowns[action] || -Infinity;
  if (now - last < minInterval) return false;
  _reactiveCooldowns[action] = now;
  return true;
}

function _getQuantizedAccentDelay(subdivisionBeats) {
  if (!audioCtx || !_schedulerTimer) return 0;
  const now = audioCtx.currentTime;
  const target = subdivisionBeats >= 1
    ? _getNextBeatTime(now + 0.005)
    : _getNextEighthTime(now + 0.005);
  return Math.max(0, target - now);
}

function _isLeadSpotlightActive() {
  return !!audioCtx && _leadSpotlightUntil > audioCtx.currentTime;
}

function _triggerLeadSpotlight(beats, gainBoost) {
  if (!audioCtx) return;
  const root = _getArcRoot();
  const now = audioCtx.currentTime;
  const duration = Math.max(1.2, _beatSec() * (beats || 6));
  _leadSpotlightUntil = Math.max(_leadSpotlightUntil, now + duration);
  if (_leadFilter) {
    _ramp(_leadFilter.frequency, Math.min(4200, (_leadFilter.frequency.value || 1800) + 600), 0.18);
  }
  _playMusicAccent(_accentFreq(root, 0, 1), 0.16, 0.06 + (gainBoost || 0), 0);
  _playMusicAccent(_accentFreq(root, 2, 1), 0.22, 0.05 + (gainBoost || 0), 0.18);
}

function _reactToAction(action, intensity) {
  if (!_musicPlaying || !_voices || !audioCtx) return;
  const now = audioCtx.currentTime;
  const root = _getArcRoot();
  const spotlightBusy = _isLeadSpotlightActive() || _gameState === 'boss_intro';

  if (action === 'kill') {
    _actionHeat = Math.min(1, _actionHeat + 0.06);
    _killQueue++; // Queue kill for bass sequencer bar variation
    _startHeatDecay();
    // Prominent in-key accent note based on enemy type
    const degree = intensity || 0;
    const freq = _accentFreq(root, degree, 1);
    const vol = (0.10 + _actionHeat * 0.06) * (spotlightBusy ? 0.72 : 1);
    _playMusicAccent(freq, 0.15, vol, _getQuantizedAccentDelay(0.5), true);
    // Filter spike
    if (_globalFilter) {
      const cur = _globalFilter.frequency.value;
      _globalFilter.frequency.setValueAtTime(Math.min(5000, cur + 400), now);
      _globalFilter.frequency.linearRampToValueAtTime(cur, now + 0.15);
    }
  } else if (action === 'combo') {
    const count = intensity || 2;
    _actionHeat = Math.min(1, _actionHeat + 0.04 * Math.min(count, 10));
    _startHeatDecay();
    // Prominent ascending arpeggio burst
    const noteCount = spotlightBusy ? Math.min(2, 1 + Math.floor(count / 4)) : Math.min(4, 1 + Math.floor(count / 3));
    const baseDeg = count % 7;
    const startDelay = _getQuantizedAccentDelay(0.5);
    for (let i = 0; i < noteCount; i++) {
      const freq = _accentFreq(root, baseDeg + i, 1);
      _playMusicAccent(freq, 0.10, spotlightBusy ? 0.075 : 0.10, startDelay + i * 0.06, true);
    }
    // Filter sweep
    if (_globalFilter) {
      const boost = Math.min(1500, count * 150);
      const cur = _globalFilter.frequency.value;
      _globalFilter.frequency.setValueAtTime(Math.min(5000, cur + boost), now);
      _globalFilter.frequency.linearRampToValueAtTime(cur, now + 0.3);
    }
  } else if (action === 'dash') {
    _actionHeat = Math.min(1, _actionHeat + 0.04);
    _startHeatDecay();
    // Prominent bass stab on dash — rhythmic low note
    const freq = _accentFreq(root, 0, 0);
    const startDelay = _getQuantizedAccentDelay(0.5);
    _playMusicAccent(freq, 0.10, spotlightBusy ? 0.09 : 0.12, startDelay, true);
    // Plus a high shimmer
    _playMusicAccent(_accentFreq(root, 2, 2), 0.08, spotlightBusy ? 0.04 : 0.06, startDelay + 0.02);
  } else if (action === 'damage') {
    // Filter dip — music pulls back on hit
    if (_globalFilter) {
      const cur = _globalFilter.frequency.value;
      _globalFilter.frequency.setValueAtTime(Math.max(200, cur * 0.6), now);
      _globalFilter.frequency.linearRampToValueAtTime(cur, now + 0.4);
    }
    if (_outputGain) {
      _outputGain.gain.setValueAtTime(0.7, now);
      _outputGain.gain.linearRampToValueAtTime(1.0, now + 0.4);
    }
  } else if (action === 'wave_clear') {
    const startDelay = _getQuantizedAccentDelay(1);
    // Resolving descending phrase: root→5th→root (tension release)
    _playMusicAccent(_accentFreq(root, 0, 2), 0.25, 0.09, startDelay);
    _playMusicAccent(_accentFreq(root, 2, 1), 0.25, 0.08, startDelay + 0.2);
    _playMusicAccent(_accentFreq(root, 1, 1), 0.4, 0.07, startDelay + 0.4);
    // Filter open + gain swell
    if (_globalFilter) {
      _globalFilter.frequency.setValueAtTime(4000, now);
      _globalFilter.frequency.linearRampToValueAtTime(_savedFilterHz || 1200, now + 1.0);
    }
    if (_outputGain) {
      _outputGain.gain.setValueAtTime(1.2, now);
      _outputGain.gain.linearRampToValueAtTime(1.0, now + 0.5);
    }
    _actionHeat = 0;
  } else if (action === 'boss_hit') {
    _actionHeat = Math.min(1, _actionHeat + 0.08);
    _startHeatDecay();
    // Aggressive accent note — low power chord hit
    _playMusicAccent(_accentFreq(root, 0, 0), 0.15, 0.08);
    _playMusicAccent(_accentFreq(root, 2, 0), 0.12, 0.06, 0.02);
    if (_globalFilter) {
      const cur = _globalFilter.frequency.value;
      _globalFilter.frequency.setValueAtTime(Math.min(5000, cur + 600), now);
      _globalFilter.frequency.linearRampToValueAtTime(cur, now + 0.2);
    }
  } else if (action === 'shield_block') {
    if (!_canReactNow(action, 0.18)) return;
    _playMusicAccent(_accentFreq(root, 0, 1), 0.08, 0.05, 0);
    _playMusicAccent(_accentFreq(root, 2, 1), 0.10, 0.04, 0.03);
  } else if (action === 'shield_break') {
    if (!_canReactNow(action, 0.14)) return;
    _playMusicAccent(_accentFreq(root, 6, 0), 0.08, 0.05, 0, true);
    _playMusicAccent(_accentFreq(root, 0, 1), 0.16, 0.05, 0.08);
  } else if (action === 'card_pick') {
    if (!_canReactNow(action, 0.20)) return;
    const startDelay = _getQuantizedAccentDelay(0.5);
    _playMusicAccent(_accentFreq(root, 0, 1), 0.10, 0.05, startDelay);
    _playMusicAccent(_accentFreq(root, 1, 1), 0.14, 0.05, startDelay + 0.07);
  } else if (action === 'evolution') {
    _actionHeat = Math.min(1, _actionHeat + 0.12);
    _startHeatDecay();
    _triggerLeadSpotlight(10, 0.02);
    const startDelay = _getQuantizedAccentDelay(1);
    _playMusicAccent(_accentFreq(root, 0, 1), 0.18, 0.07, startDelay, true);
    _playMusicAccent(_accentFreq(root, 1, 1), 0.20, 0.06, startDelay + 0.12);
    _playMusicAccent(_accentFreq(root, 2, 2), 0.32, 0.05, startDelay + 0.28);
    if (_outputGain) {
      _outputGain.gain.setValueAtTime(1.08, now);
      _outputGain.gain.linearRampToValueAtTime(1.0, now + 0.5);
    }
  } else if (action === 'boss_intro') {
    if (!_canReactNow(action, 0.50)) return;
    _triggerLeadSpotlight(8, 0.01);
    const startDelay = _getQuantizedAccentDelay(1);
    _playMusicAccent(_accentFreq(root, 0, 0), 0.24, 0.05, startDelay, true);
    _playMusicAccent(_accentFreq(root, 2, 1), 0.28, 0.04, startDelay + 0.16);
  } else if (action === 'boost') {
    if (!_canReactNow(action, 0.20)) return;
    const boostType = intensity;
    const patterns = {
      screenNuke: [0, 6, 1],
      invincibility: [0, 2, 4],
      healthRestore: [1, 2, 0],
      pointFrenzy: [2, 4, 6],
      staminaBurst: [0, 1, 2],
    };
    const degrees = patterns[boostType] || [0, 2, 4];
    const startDelay = _getQuantizedAccentDelay(0.5);
    for (let i = 0; i < degrees.length; i++) {
      _playMusicAccent(_accentFreq(root, degrees[i], i === 2 ? 2 : 1), 0.12 + i * 0.03, 0.04 + i * 0.01, startDelay + i * 0.06);
    }
  }
}

// --- Helpers ---
function _lerp(a, b, t) { return a + (b - a) * Math.min(1, Math.max(0, t)); }

function _getMusicArcIndex(wave) {
  if (wave <= 0) return 0;
  for (let i = 0; i < MUSIC_ARCS.length; i++) {
    if (wave >= MUSIC_ARCS[i].waveMin && wave <= MUSIC_ARCS[i].waveMax) return i;
  }
  // Endless mode (31+)
  const ew = wave - 31;
  const pos = ew % 10;
  if (pos === 9) return [1, 3, 5][Math.floor(ew / 10) % 3]; // boss arcs
  return pos < 5 ? 2 : 4; // alternate Deep Grid / Void Approaches
}

function _getArcProgress(wave, arc) {
  if (arc.waveMin === arc.waveMax) return 1;
  return Math.min(1, Math.max(0, (wave - arc.waveMin) / (arc.waveMax - arc.waveMin)));
}

function _getBossIndex(wave) {
  if (wave <= 10) return 0;
  if (wave <= 20) return 1;
  if (wave <= 30) return 2;
  // Endless: cycle
  const ew = wave - 31;
  return Math.floor(ew / 10) % 3;
}

function _ramp(param, val, dur) {
  const ctx = audioCtx;
  if (!ctx || !param) return;
  param.cancelScheduledValues(ctx.currentTime);
  param.setValueAtTime(param.value, ctx.currentTime);
  if (dur > 0) {
    param.linearRampToValueAtTime(val, ctx.currentTime + dur);
  } else {
    param.setValueAtTime(val, ctx.currentTime);
  }
}

function _queueTransition(key, time, fn) {
  _pendingTransitions = _pendingTransitions.filter((t) => t.key !== key);
  _pendingTransitions.push({ key, time, fn });
  _pendingTransitions.sort((a, b) => a.time - b.time);
}

function _flushPendingTransitions(now) {
  while (_pendingTransitions.length && _pendingTransitions[0].time <= now + 0.001) {
    const pending = _pendingTransitions.shift();
    pending.fn(pending.time);
  }
}

function _getNextGridTime(subdivisionBeats, fromTime) {
  const ctx = audioCtx;
  if (!ctx) return 0;
  const now = fromTime === undefined ? ctx.currentTime : fromTime;
  const beat = _beatSec();
  const step = Math.max(0.001, beat * Math.max(0.125, subdivisionBeats || 1));
  const anchor = _transportAnchorTime || now;
  if (anchor > now + 0.001) return anchor;
  const steps = Math.ceil((now - anchor + 0.0001) / step);
  const target = anchor + Math.max(0, steps) * step;
  return target <= now + 0.01 ? target + step : target;
}

function _getNextBeatTime(fromTime) {
  return _getNextGridTime(1, fromTime);
}

function _getNextEighthTime(fromTime) {
  return _getNextGridTime(0.5, fromTime);
}

function _getNextBarTime(fromTime) {
  const now = fromTime === undefined ? (audioCtx ? audioCtx.currentTime : 0) : fromTime;
  const progression = _getCurrentProgression();
  if (_nextChordTime > now + 0.01) return _nextChordTime;
  return _getNextGridTime(progression?.beats || 4, now);
}

function _syncRhythmicClocks(time, opts) {
  const options = opts || {};
  const progression = _getCurrentProgression();
  const interval = _beatSec() * (progression?.beats || 4);
  _transportAnchorTime = time;
  if (options.resetLead) _leadIdx = 0;
  if (options.resetChord) _chordIdx = 0;
  if (options.resetBassPattern) {
    _bassSeqIdx = 0;
    _buildNextBassBar();
  }
  _nextLeadTime = time;
  _nextTextureTime = time;
  _nextHarmonySwapTime = time;
  _nextBassSwapTime = time;
  if (_bassSeqActive) _nextBassSeqTime = time;
  _nextChordTime = progression ? (time + interval) : time;
}

function _createOsc(type, freq, dest) {
  const ctx = ensureCtx();
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  osc.connect(gain);
  gain.connect(dest);
  osc.start();
  return { osc, gain };
}

function _stopOsc(voice) {
  if (!voice) return;
  try { voice.osc.stop(); } catch (e) { /* already stopped */ }
  _cleanupNodes([voice.osc, voice.gain]);
  voice.osc = null;
  voice.gain = null;
}

function _beatSec() { return 60 / _currentBpm; }

// --- Create / destroy all music voices ---
function _createVoices() {
  const ctx = ensureCtx();

  _outputGain = ctx.createGain();
  _outputGain.gain.value = 0;
  _outputGain.connect(musicGain);

  _globalFilter = ctx.createBiquadFilter();
  _globalFilter.type = 'lowpass';
  _globalFilter.frequency.value = 500;
  _globalFilter.Q.value = 1;
  _globalFilter.connect(_outputGain);

  // Lead filter (separate, pre-global)
  _leadFilter = ctx.createBiquadFilter();
  _leadFilter.type = 'lowpass';
  _leadFilter.frequency.value = 2000;
  _leadFilter.Q.value = 1;
  _leadFilter.connect(_globalFilter);

  // Texture filter
  _textureFilter = ctx.createBiquadFilter();
  _textureFilter.type = 'lowpass';
  _textureFilter.frequency.value = 5000;
  _textureFilter.Q.value = 1;
  _textureFilter.connect(_globalFilter);

  _choirFilter = ctx.createBiquadFilter();
  _choirFilter.type = 'bandpass';
  _choirFilter.frequency.value = 1200;
  _choirFilter.Q.value = 1.2;
  _choirFilter.connect(_globalFilter);

  _voices = {
    bass: _createOsc('sine', 110, _globalFilter),
    harmony: _createOsc('triangle', 165, _globalFilter),
    lead: _createOsc('sawtooth', 220, _leadFilter),
    texture: _createOsc('square', 880, _textureFilter),
    choirLow: _createOsc('triangle', 220, _choirFilter),
    choirHigh: _createOsc('triangle', 330, _choirFilter),
    bass2: null,
  };
  _voices.choirLow.osc.detune.value = -6;
  _voices.choirHigh.osc.detune.value = 7;

  // LFO → outputGain
  _lfo = ctx.createOscillator();
  _lfo.type = 'sine';
  _lfo.frequency.value = 0.3;
  _lfoGain = ctx.createGain();
  _lfoGain.gain.value = 0.04;
  _lfo.connect(_lfoGain);
  _lfoGain.connect(_outputGain.gain);
  _lfo.start();
}

function _destroyVoices() {
  _stopScheduler();
  if (_heatDecayTimer) { clearInterval(_heatDecayTimer); _heatDecayTimer = null; }
  _actionHeat = 0;
  _lastFilterBoost = 0;
  _bassSeqActive = false;
  _killQueue = 0;
  _bassSeqIdx = 0;
  if (_voices) {
    _stopOsc(_voices.bass);
    _stopOsc(_voices.harmony);
    _stopOsc(_voices.lead);
    _stopOsc(_voices.texture);
    _stopOsc(_voices.choirLow);
    _stopOsc(_voices.choirHigh);
    if (_voices.bass2) _stopOsc(_voices.bass2);
    _voices = null;
  }
  if (_lfo) { try { _lfo.stop(); } catch (e) {} _lfo = null; }
  if (_bassPitchLfo) { try { _bassPitchLfo.stop(); } catch (e) {} _bassPitchLfo = null; }
  if (_harmonyVibrato) { try { _harmonyVibrato.stop(); } catch (e) {} _harmonyVibrato = null; }
  _lfoGain = null;
  _outputGain = null;
  _globalFilter = null;
  _leadFilter = null;
  _textureFilter = null;
  _choirFilter = null;
}

// --- Scheduler ---
function _startScheduler() {
  if (_schedulerTimer) return;
  const ctx = ensureCtx();
  _transportAnchorTime = ctx.currentTime + 0.05;
  _nextLeadTime = ctx.currentTime + 0.05;
  _nextTextureTime = ctx.currentTime + 0.05;
  _nextChordTime = ctx.currentTime + 0.05;
  _nextHarmonySwapTime = ctx.currentTime + 0.05;
  _nextBassSwapTime = ctx.currentTime + 0.05;
  _leadIdx = 0;
  _chordIdx = 0;
  _harmonyFlip = false;
  _bassFlip = false;
  _voidLeadCount = 0;
  _schedulerTimer = setInterval(_schedulerTick, 25);
}

function _stopScheduler() {
  if (_schedulerTimer) { clearInterval(_schedulerTimer); _schedulerTimer = null; }
  _pendingTransitions = [];
}

// Title-state scheduler definitions
// Title arpeggio: Am → C → Em → F progression, 16 notes per cycle
const TITLE_LEAD_NOTES = [
  220, 262, 330, 440,   // Am: A3→C4→E4→A4
  262, 330, 392, 523,   // C:  C4→E4→G4→C5
  330, 392, 494, 330,   // Em: E4→G4→B4→E4
  349, 440, 523, 349,   // F:  F4→A4→C5→F4
];
const _titleLeadDef = { notes: TITLE_LEAD_NOTES, subdiv: 1, legato: 0.8, type: 'sawtooth' };
const _titleTexDef = { freq: 880, burstSec: 0.04, everyBeats: 2, type: 'triangle' };

function _schedulerTick() {
  if (!audioCtx || !_musicPlaying || !_voices) return;
  const now = audioCtx.currentTime;
  _flushPendingTransitions(now);
  const ahead = 0.1;
  const isTitle = _gameState === 'title';
  const arc = (_isBossMusic || isTitle) ? null : MUSIC_ARCS[_currentArcIdx];
  const boss = _isBossMusic ? BOSS_THEMES[_getBossIndex(_currentWave)] : null;
  const beat = _beatSec();
  const progression = _getCurrentProgression();

  if (progression) {
    const interval = beat * (progression.beats || 4);
    while (_nextChordTime < now + ahead) {
      _applyProgressionStep(_nextChordTime);
      _nextChordTime += interval;
    }
  }

  // Lead arpeggio
  const leadDef = isTitle ? _titleLeadDef : (_isBossMusic ? boss.lead : arc.lead);
  if (leadDef && leadDef.notes && leadDef.notes.length > 0) {
    const subdiv = leadDef.subdiv || 1;
    const noteDur = beat / Math.max(0.1, subdiv);
    while (_nextLeadTime < now + ahead) {
      _scheduleLeadNote(_nextLeadTime, leadDef, noteDur);
      _nextLeadTime += noteDur;
    }
  }

  // Texture bursts (skip if continuous or silent)
  const texDef = isTitle ? _titleTexDef : (_isBossMusic ? boss.texture : arc.texture);
  if (texDef && texDef.burstSec && texDef.everyBeats && _voices.texture) {
    const interval = beat * texDef.everyBeats;
    while (_nextTextureTime < now + ahead) {
      _scheduleTextureBurst(_nextTextureTime, texDef);
      _nextTextureTime += interval;
    }
  }

  // Harmony swap (alternating freqs) — skip during title (no alternating harmony)
  const harmDef = _isBossMusic ? boss.harmony : (arc ? arc.harmony : null);
  if (!progression && harmDef && harmDef.freqs && harmDef.swapBeats && _voices.harmony) {
    const interval = beat * harmDef.swapBeats;
    while (_nextHarmonySwapTime < now + ahead) {
      const freq = harmDef.freqs[_harmonyFlip ? 1 : 0];
      _voices.harmony.osc.frequency.setValueAtTime(freq, _nextHarmonySwapTime);
      _harmonyFlip = !_harmonyFlip;
      _nextHarmonySwapTime += interval;
    }
  }

  // Boss bass swap (Void Warden tritone alternation)
  if (boss && boss.bass.freqs && boss.bass.swapBars) {
    const interval = beat * 4 * boss.bass.swapBars;
    while (_nextBassSwapTime < now + ahead) {
      const freq = boss.bass.freqs[_bassFlip ? 1 : 0];
      _voices.bass.osc.frequency.setValueAtTime(freq, _nextBassSwapTime);
      // Set harmony to tritone partner
      if (_voices.harmony && boss.harmony) {
        const partnerFreq = boss.bass.freqs[_bassFlip ? 0 : 1];
        _voices.harmony.osc.frequency.setValueAtTime(partnerFreq, _nextBassSwapTime);
      }
      _bassFlip = !_bassFlip;
      _nextBassSwapTime += interval;
    }
  }

  // Generative bass sequencer: rhythmic bass notes driven by player movement
  // Pattern plays at quarter-note rate. Dash inserts root 8ths between quarters.
  if (_bassSeqActive && !isTitle && _voices.bass) {
    const halfBeat = beat / 2;
    while (_nextBassSeqTime < now + ahead) {
      // Quarter note: play the pattern note
      _scheduleBassSeqNote(_nextBassSeqTime, false);
      // If dashing, insert an 8th-note root fill halfway to the next quarter
      if (_playerDashing) {
        _scheduleBassSeqNote(_nextBassSeqTime + halfBeat, true); // true = root fill
      }
      _nextBassSeqTime += beat; // always advance by quarter note
    }
  }
}

function _scheduleLeadNote(time, def, noteDur) {
  if (!_voices || !_voices.lead) return;
  const notes = def.notes;
  const gain = _voices.lead.gain.gain;

  // Void Warden silence-after pattern
  if (def.silenceAfter && _voidLeadCount >= def.silenceAfter) {
    gain.setValueAtTime(0, time);
    _voidLeadCount++;
    if (_voidLeadCount >= def.silenceAfter * 2) _voidLeadCount = 0;
    return;
  }

  // Silence chance (Void Approaches random gaps)
  if (def.silenceChance && Math.random() < def.silenceChance) {
    gain.setValueAtTime(0, time);
    _leadIdx = (_leadIdx + 1) % notes.length;
    _voidLeadCount++;
    return;
  }

  let freq = notes[_leadIdx % notes.length];
  const variation = def.variation || {};
  const octaveUpChance = variation.octaveUpChance || 0;
  const octaveDownChance = variation.octaveDownChance || 0;
  const passingToneChance = variation.passingToneChance || 0;
  const graceChance = variation.graceChance || 0;
  const heatGraceScale = variation.heatGraceScale || 0;
  const graceHeatThreshold = variation.graceHeatThreshold === undefined ? 0.7 : variation.graceHeatThreshold;

  const rnd = Math.random();
  if (rnd < octaveUpChance && freq < 2000) freq *= 2;
  else if (rnd < octaveUpChance + octaveDownChance && freq > 100) freq *= 0.5;
  else if (rnd < octaveUpChance + octaveDownChance + passingToneChance) freq *= (Math.random() < 0.5 ? 1.125 : 0.943);

  if (_actionHeat > graceHeatThreshold && Math.random() < (graceChance + _actionHeat * heatGraceScale) && _voices.lead.osc) {
    const graceFreq = freq * (Math.random() < 0.5 ? 1.059 : 0.943);
    _voices.lead.osc.frequency.setValueAtTime(graceFreq, time);
    _voices.lead.osc.frequency.setValueAtTime(freq, time + noteDur * 0.15);
  } else {
    _voices.lead.osc.frequency.setValueAtTime(freq, time);
  }

  // Note envelope: attack → sustain → release
  const legato = def.legato || 1.0;
  const onDur = noteDur * legato;
  const targetGain = _leadSilenced ? 0 : _getLeadTargetGain();
  // Heat-influenced dynamics: louder notes during intense action
  const heatGainBoost = _actionHeat * 0.03;
  const finalGain = Math.min(0.15, targetGain + heatGainBoost);
  gain.setValueAtTime(finalGain, time);
  if (legato < 1.0) {
    gain.setValueAtTime(finalGain, time + Math.max(0.005, onDur - 0.005));
    gain.linearRampToValueAtTime(0, time + onDur);
  }

  _leadIdx = (_leadIdx + 1) % notes.length;
  _voidLeadCount++;
}

function _getLeadTargetGain() {
  if (_gameState === 'title') return 0.05; // Title arpeggio gain
  if (_isBossMusic) {
    const boss = BOSS_THEMES[_getBossIndex(_currentWave)];
    return boss.lead.gain * (_isLeadSpotlightActive() ? 1.22 : 1);
  }
  const arc = MUSIC_ARCS[_currentArcIdx];
  const p = _getArcProgress(_currentWave, arc);
  const g = _lerp(arc.lead.gain[0], arc.lead.gain[1], p);
  // Fade in based on wave
  if (arc.lead.fadeInWave && _currentWave < arc.lead.fadeInWave) return 0;
  return g * (_isLeadSpotlightActive() ? 1.28 : 1) * _getElementEntranceMul('lead');
}

function _scheduleTextureBurst(time, def) {
  if (!_voices || !_voices.texture) return;
  const gain = _voices.texture.gain.gain;
  const burstDur = def.burstSec || 0.02;

  // Optional pitch deviation (Deep Grid glitch)
  if (def.pitchDev && _voices.texture.osc) {
    const deviation = 1 + (Math.random() * 2 - 1) * def.pitchDev;
    _voices.texture.osc.frequency.setValueAtTime(def.freq * deviation, time);
  }

  const targetGain = _getTextureTargetGain();
  gain.setValueAtTime(targetGain, time);
  gain.setValueAtTime(targetGain, time + burstDur * 0.8);
  gain.linearRampToValueAtTime(0, time + burstDur);
  if ((_gameState === 'playing' || _gameState === 'boss_fight') && _actionHeat > 0.55) {
    const echoGain = targetGain * (0.35 + _actionHeat * 0.25);
    gain.setValueAtTime(echoGain, time + burstDur * 1.35);
    gain.linearRampToValueAtTime(0, time + burstDur * 2.1);
  }
}

function _getTextureTargetGain() {
  if (_gameState === 'title') return 0.03; // Title texture ping gain
  if (_isBossMusic) {
    const boss = BOSS_THEMES[_getBossIndex(_currentWave)];
    return boss.texture.gain * (_isLeadSpotlightActive() ? 0.72 : 1);
  }
  const arc = MUSIC_ARCS[_currentArcIdx];
  const p = _getArcProgress(_currentWave, arc);
  const g = _lerp(arc.texture.gain[0], arc.texture.gain[1], p);
  if (arc.texture.fadeInWave && _currentWave < arc.texture.fadeInWave) return 0;
  return g * (_isLeadSpotlightActive() ? 0.58 : 1) * _getElementEntranceMul('texture');
}

// --- Apply arc parameters to voices ---
function _applyArcParams(wave, dur) {
  const ctx = ensureCtx();
  if (!_voices) return;
  const arcIdx = _getMusicArcIndex(wave);
  const arc = MUSIC_ARCS[arcIdx];
  const p = _getArcProgress(wave, arc);
  const td = dur || arc.transIn || 2.0;
  _currentArcIdx = arcIdx;
  _currentWave = wave;

  // Tempo
  _currentBpm = _lerp(arc.bpm[0], arc.bpm[1], p);

  // Bass
  _ramp(_voices.bass.osc.frequency, arc.bass.freq, td);
  const bassGain = _lerp(arc.bass.gain[0], arc.bass.gain[1], p);
  _ramp(_voices.bass.gain.gain, bassGain, td);
  _voices.bass.osc.type = arc.bass.type || 'sine';

  // Bass2 (power chord, e.g. Arc 3)
  if (arc.bass.bass2Freq) {
    if (!_voices.bass2) {
      _voices.bass2 = _createOsc('sine', arc.bass.bass2Freq, _globalFilter);
    }
    _ramp(_voices.bass2.osc.frequency, arc.bass.bass2Freq, td);
    _ramp(_voices.bass2.gain.gain, bassGain, td);
  } else if (_voices.bass2) {
    _ramp(_voices.bass2.gain.gain, 0, td);
  }

  // Bass pitch LFO (Void Approaches)
  _setupBassPitchLfo(arc, td);

  // Harmony
  const harmGain = _lerp(arc.harmony.gain[0], arc.harmony.gain[1], p);
  const shouldFadeHarmony = arc.harmony.fadeInWave && wave < arc.harmony.fadeInWave;
  _ramp(_voices.harmony.gain.gain, shouldFadeHarmony ? 0 : harmGain, td);
  _voices.harmony.osc.type = arc.harmony.type || 'triangle';
  if (arc.harmony.freq) {
    _ramp(_voices.harmony.osc.frequency, arc.harmony.freq, td);
  } else if (arc.harmony.freqs) {
    _voices.harmony.osc.frequency.setValueAtTime(arc.harmony.freqs[0], ctx.currentTime);
    _harmonyFlip = false;
  }

  // Harmony vibrato (Nexus Chamber)
  _setupHarmonyVibrato(arc, td);

  // Lead
  const leadGain = _getLeadTargetGain();
  _savedLeadGain = leadGain;
  _voices.lead.osc.type = arc.lead.type || 'sawtooth';
  // Lead filter
  if (arc.lead.cutoff) {
    _ramp(_leadFilter.frequency, arc.lead.cutoff, td);
  } else {
    _ramp(_leadFilter.frequency, 5000, td);
  }
  _leadIdx = 0;

  // Texture
  _voices.texture.osc.type = arc.texture.type || 'square';
  if (arc.texture.freq) {
    _ramp(_voices.texture.osc.frequency, arc.texture.freq, td);
  }
  if (arc.texture.cutoff) {
    _ramp(_textureFilter.frequency, arc.texture.cutoff, td);
  } else {
    _ramp(_textureFilter.frequency, 5000, td);
  }
  // Continuous texture (Void Approaches sub-bass rumble)
  if (arc.texture.continuous) {
    const tGain = _lerp(arc.texture.gain[0], arc.texture.gain[1], p);
    _ramp(_voices.texture.gain.gain, tGain, td);
  } else {
    // Bursts handled by scheduler; start silent
    _voices.texture.gain.gain.setValueAtTime(0, ctx.currentTime);
  }

  // Global filter
  const fHz = _lerp(arc.filter.hz[0], arc.filter.hz[1], p);
  const fQ = _lerp(arc.filter.Q[0], arc.filter.Q[1], p);
  _savedFilterHz = fHz;
  _ramp(_globalFilter.frequency, fHz, td);
  _ramp(_globalFilter.Q, fQ, td);

  // Choir
  _applyChoirParams(arc.choir, wave, td);
  _voices.choirLow.gain.gain.setValueAtTime(0, ctx.currentTime);
  _voices.choirHigh.gain.gain.setValueAtTime(0, ctx.currentTime);

  // LFO
  const lfoRate = _lerp(arc.lfo.rate[0], arc.lfo.rate[1], p);
  const lfoDepth = Array.isArray(arc.lfo.depth) ? _lerp(arc.lfo.depth[0], arc.lfo.depth[1], p) : arc.lfo.depth;
  _ramp(_lfo.frequency, lfoRate, td);
  _ramp(_lfoGain.gain, lfoDepth, td);

  // Output gain — per-voice gains handle balance; outputGain stays ~1.0
  _ramp(_outputGain.gain, 1.0, td);
  _currentHarmonicRoot = arc.bass.freq;
  _chordIdx = 0;
  _nextChordTime = ctx.currentTime + 0.05;
  _applyProgressionStep(ctx.currentTime);
}

function _setupBassPitchLfo(arc, dur) {
  // Clean up existing
  if (_bassPitchLfo) {
    try { _bassPitchLfo.stop(); } catch (e) {}
    _bassPitchLfo = null;
  }
  if (!arc.bass.pitchLfoRate || !_voices || !_voices.bass) return;
  const ctx = ensureCtx();
  _bassPitchLfo = ctx.createOscillator();
  _bassPitchLfo.type = 'sine';
  _bassPitchLfo.frequency.value = arc.bass.pitchLfoRate;
  const depthGain = ctx.createGain();
  depthGain.gain.value = arc.bass.pitchLfoDep || 2;
  _bassPitchLfo.connect(depthGain);
  depthGain.connect(_voices.bass.osc.frequency);
  _bassPitchLfo.start();
}

function _setupHarmonyVibrato(arc, dur) {
  if (_harmonyVibrato) {
    try { _harmonyVibrato.stop(); } catch (e) {}
    _harmonyVibrato = null;
  }
  if (!arc.harmony.vibratoHz || !_voices || !_voices.harmony) return;
  const ctx = ensureCtx();
  _harmonyVibrato = ctx.createOscillator();
  _harmonyVibrato.type = 'sine';
  _harmonyVibrato.frequency.value = arc.harmony.vibratoHz;
  const depthGain = ctx.createGain();
  depthGain.gain.value = arc.harmony.vibratoDep || 3;
  _harmonyVibrato.connect(depthGain);
  depthGain.connect(_voices.harmony.osc.frequency);
  _harmonyVibrato.start();
}

// --- Apply boss theme ---
function _applyBossParams(dur) {
  const ctx = ensureCtx();
  if (!_voices) return;
  const bIdx = _getBossIndex(_currentWave);
  const boss = BOSS_THEMES[bIdx];
  const td = dur || 1.5;
  _bossPhase = 0;

  _currentBpm = boss.bpm;

  // Bass
  _voices.bass.osc.type = boss.bass.type || 'sine';
  if (boss.bass.freqs) {
    _ramp(_voices.bass.osc.frequency, boss.bass.freqs[0], td);
    _bassFlip = false;
    _nextBassSwapTime = ctx.currentTime + td;
  } else {
    _ramp(_voices.bass.osc.frequency, boss.bass.freq, td);
  }
  _ramp(_voices.bass.gain.gain, boss.bass.gain, td);

  // Bass cutoff (Nexus Core)
  if (boss.bass.cutoff) {
    // Create per-bass filter by lowering global for bass effect
    // (simplified: use lead filter approach isn't right, just lower global + raise lead)
  }

  // Bass2 off
  if (_voices.bass2) _ramp(_voices.bass2.gain.gain, 0, td);

  // Bass LFO
  if (_bassPitchLfo) { try { _bassPitchLfo.stop(); } catch (e) {} _bassPitchLfo = null; }
  if (boss.bass.lfoRate) {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = boss.bass.lfoRate;
    const g = ctx.createGain();
    g.gain.value = boss.bass.lfoDepth || 3;
    lfo.connect(g);
    g.connect(_voices.bass.osc.frequency);
    lfo.start();
    _bassPitchLfo = lfo;
  }

  // Harmony
  _voices.harmony.osc.type = boss.harmony.type || 'triangle';
  _ramp(_voices.harmony.gain.gain, boss.harmony.gain, td);
  if (boss.harmony.freqs) {
    _voices.harmony.osc.frequency.setValueAtTime(boss.harmony.freqs[0], ctx.currentTime);
    _harmonyFlip = false;
  } else if (boss.harmony.freq) {
    _ramp(_voices.harmony.osc.frequency, boss.harmony.freq, td);
  }

  // Harmony vibrato
  if (_harmonyVibrato) { try { _harmonyVibrato.stop(); } catch (e) {} _harmonyVibrato = null; }
  if (boss.harmony.vibratoHz) {
    _harmonyVibrato = ctx.createOscillator();
    _harmonyVibrato.type = 'sine';
    _harmonyVibrato.frequency.value = boss.harmony.vibratoHz;
    const dg = ctx.createGain();
    dg.gain.value = boss.harmony.vibratoDep || 3;
    _harmonyVibrato.connect(dg);
    dg.connect(_voices.harmony.osc.frequency);
    _harmonyVibrato.start();
  }

  // Lead
  _voices.lead.osc.type = boss.lead.type || 'sawtooth';
  _ramp(_leadFilter.frequency, boss.lead.cutoff || 2000, td);
  _leadIdx = 0;
  _voidLeadCount = 0;

  // Texture
  _voices.texture.osc.type = boss.texture.type || 'square';
  if (boss.texture.freq) _ramp(_voices.texture.osc.frequency, boss.texture.freq, td);
  if (boss.texture.continuous) {
    _ramp(_voices.texture.gain.gain, boss.texture.gain, td);
  } else {
    _voices.texture.gain.gain.setValueAtTime(0, ctx.currentTime);
  }

  // Global filter
  _ramp(_globalFilter.frequency, boss.filter, td);
  _ramp(_globalFilter.Q, boss.filterQ, td);

  // LFO
  _ramp(_lfo.frequency, boss.lfoRate || 1.5, td);
  _ramp(_lfoGain.gain, 0.05, td);

  // Output gain — per-voice gains handle balance; outputGain stays ~1.0
  _ramp(_outputGain.gain, 1.0, td);

  _savedFilterHz = boss.filter;
  _savedLeadGain = boss.lead.gain;
  _applyChoirParams(boss.choir, _currentWave, td);
  _voices.choirLow.gain.gain.setValueAtTime(0, ctx.currentTime);
  _voices.choirHigh.gain.gain.setValueAtTime(0, ctx.currentTime);
  _currentHarmonicRoot = boss.bass.freq || boss.bass.freqs?.[0] || 110;
  _chordIdx = 0;
  _nextChordTime = ctx.currentTime + 0.05;
  if (boss.progression) _applyProgressionStep(ctx.currentTime);
}

// --- Title music (proper melodic piece — captivating from moment 0) ---
function _applyTitleParams() {
  if (!_voices) return;
  _currentBpm = 80;  // Proper tempo for a melodic piece
  _gameState = 'title';

  // Bass: warm A2 foundation with gentle pulse
  _ramp(_voices.bass.osc.frequency, 110, 0);
  _voices.bass.osc.type = 'sine';
  _ramp(_voices.bass.gain.gain, 0.14, 1.0);

  // Harmony: E3 fifth, audible and warm
  _ramp(_voices.harmony.osc.frequency, 165, 0);
  _voices.harmony.osc.type = 'triangle';
  _ramp(_voices.harmony.gain.gain, 0.08, 1.5);

  // Lead: melodic arpeggio with chord progression
  _voices.lead.osc.type = 'sawtooth';
  _ramp(_voices.lead.gain.gain, 0.06, 1.5);
  _ramp(_leadFilter.frequency, 1600, 0);

  // Texture: rhythmic pings every 2 beats for pulse
  _voices.texture.osc.type = 'triangle';
  _ramp(_voices.texture.osc.frequency, 880, 0);
  _voices.texture.gain.gain.setValueAtTime(0, audioCtx.currentTime);

  _applyChoirParams(TITLE_CHOIR, 0, 0);
  _voices.choirLow.gain.gain.setValueAtTime(0, audioCtx.currentTime);
  _voices.choirHigh.gain.gain.setValueAtTime(0, audioCtx.currentTime);

  // Open filter for bright, inviting sound
  _ramp(_globalFilter.frequency, 1800, 0);
  _ramp(_globalFilter.Q, 2.0, 0);
  _ramp(_lfo.frequency, 0.2, 0);
  _ramp(_lfoGain.gain, 0.03, 0);

  _ramp(_outputGain.gain, 1.0, 0.8);

  // Start scheduler so lead arpeggio + texture pings play on title
  _leadIdx = 0;
  _chordIdx = 0;
  _currentHarmonicRoot = 110;
  _startScheduler();
  _applyProgressionStep(audioCtx.currentTime);
}

// --- Game over music sequence ---
function _playGameOverSequence() {
  if (!_voices) return;
  const ctx = ensureCtx();
  _gameState = 'game_over';
  _stopScheduler();

  // Cut harmony and lead immediately
  _voices.harmony.gain.gain.setValueAtTime(0, ctx.currentTime);
  _voices.lead.gain.gain.setValueAtTime(0, ctx.currentTime);
  _voices.choirLow.gain.gain.setValueAtTime(0, ctx.currentTime);
  _voices.choirHigh.gain.gain.setValueAtTime(0, ctx.currentTime);

  // Texture: single burst at 200 Hz, 500ms
  _voices.texture.osc.frequency.setValueAtTime(200, ctx.currentTime);
  _voices.texture.osc.type = 'square';
  _voices.texture.gain.gain.setValueAtTime(0.08, ctx.currentTime);
  _voices.texture.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);

  // Bass: pitch bend down 20% over 3s, then fade over 2s
  const currentBassFreq = _voices.bass.osc.frequency.value;
  _voices.bass.osc.frequency.linearRampToValueAtTime(currentBassFreq * 0.8, ctx.currentTime + 3.0);
  _voices.bass.gain.gain.setValueAtTime(_voices.bass.gain.gain.value, ctx.currentTime + 3.0);
  _voices.bass.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 5.0);

  // Fade output over 5s
  _outputGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 5.0);

  // Cleanup after sequence
  setTimeout(() => {
    _destroyVoices();
    _musicPlaying = false;
    _isBossMusic = false;
  }, 5500);
}

// --- Endless mode filter/gain escalation ---
function _getEndlessEscalation(wave) {
  if (wave <= 30) return { filterBonus: 0, leadGainBonus: 0 };
  const cycles = Math.floor((wave - 31) / 10);
  return {
    filterBonus: cycles * 200,
    leadGainBonus: Math.min(0.10, cycles * 0.02),
  };
}

// ==========================================
// PUBLIC API
// ==========================================

export function startMusic() {
  if (_musicPlaying) return;
  ensureCtx();
  _createVoices();
  _musicPlaying = true;
  _isBossMusic = false;
  _currentWave = 0;
  _gameState = 'title';
  _elementEntrances = { lead: null, texture: null, choir: null };

  // Start with title ambient
  _applyTitleParams();

  // Quick fade in — browser game needs to capture immediately
  const ctx = audioCtx;
  _outputGain.gain.setValueAtTime(0, ctx.currentTime);
  _outputGain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 0.8);
}

export function stopMusic() {
  if (!_musicPlaying) return;

  if (_gameState !== 'game_over') {
    // Play game over sequence (pitch bend + fade)
    _playGameOverSequence();
  } else {
    // Already in game over, just fade
    if (_outputGain) {
      _ramp(_outputGain.gain, 0, 1.0);
    }
    setTimeout(() => {
      _destroyVoices();
      _musicPlaying = false;
      _isBossMusic = false;
    }, 1200);
  }
}

export function setMusicIntensity(intensity, wave) {
  _musicIntensity = Math.min(1, Math.max(0, intensity));
  if (!_voices || !_musicPlaying) return;
  if (_isBossMusic) return; // boss music handles its own params
  const ctx = ensureCtx();

  // If wave provided, use it for arc determination
  if (wave !== undefined && wave > 0) {
    const previousWave = _currentWave;
    const newArcIdx = _getMusicArcIndex(wave);
    const fromTitle = _gameState === 'title';
    const arcChanged = newArcIdx !== _currentArcIdx || fromTitle;
    _currentWave = wave;

    if (arcChanged || fromTitle) {
      _gameState = 'playing';
      _startScheduler();
      const arc = MUSIC_ARCS[newArcIdx];
      const transitionTime = fromTitle ? ctx.currentTime : _getNextBarTime(ctx.currentTime + 0.02);
      _queueTransition('arc-change', transitionTime, (time) => {
        _gameState = 'playing';
        _applyArcParams(wave, arc.transIn || 2.0);
        _syncRhythmicClocks(time, { resetLead: true, resetBassPattern: true });
      });
    } else {
      // Same arc, update intensity-dependent params
      _gameState = 'playing';
      const arc = MUSIC_ARCS[_currentArcIdx];
      const p = _getArcProgress(wave, arc);
      const transitionTime = _getNextBarTime(ctx.currentTime + 0.02);
      _queueTransition('arc-update', transitionTime, (time) => {
        _currentBpm = _lerp(arc.bpm[0], arc.bpm[1], p);

        const fHz = _lerp(arc.filter.hz[0], arc.filter.hz[1], p);
        const fQ = _lerp(arc.filter.Q[0], arc.filter.Q[1], p);
        _savedFilterHz = fHz;
        _ramp(_globalFilter.frequency, fHz, 0.5);
        _ramp(_globalFilter.Q, fQ, 0.5);

        const lfoRate = _lerp(arc.lfo.rate[0], arc.lfo.rate[1], p);
        _ramp(_lfo.frequency, lfoRate, 0.5);

        const bassGain = _lerp(arc.bass.gain[0], arc.bass.gain[1], p);
        _ramp(_voices.bass.gain.gain, bassGain, 0.5);

        const harmGain = _lerp(arc.harmony.gain[0], arc.harmony.gain[1], p);
        const justActivatedHarmony = _crossedFadeWave(previousWave, wave, arc.harmony.fadeInWave);
        const harmFaded = arc.harmony.fadeInWave && wave < arc.harmony.fadeInWave;
        _ramp(_voices.harmony.gain.gain, harmFaded ? 0 : harmGain, justActivatedHarmony ? 1.6 : 0.5);

        _applyChoirParams(arc.choir, wave, 0.5);
        _applyProgressionStep(time);
        _syncRhythmicClocks(time, {});
      });
    }

    const activeArc = MUSIC_ARCS[_currentArcIdx];
    if (_crossedFadeWave(previousWave, wave, activeArc?.lead?.fadeInWave)) {
      _startElementEntrance('lead', 1.8);
    }
    if (_crossedFadeWave(previousWave, wave, activeArc?.texture?.fadeInWave)) {
      _startElementEntrance('texture', 1.6);
    }
    if (_crossedFadeWave(previousWave, wave, activeArc?.choir?.fadeInWave)) {
      _startElementEntrance('choir', 2.0);
    }
    if (wave !== previousWave && activeArc?.lead?.fadeInWave === wave) {
      _triggerLeadSpotlight(activeArc.lead.revealBeats || 6, 0.01);
    }

    // Endless escalation
    const esc = _getEndlessEscalation(wave);
    if (esc.filterBonus > 0) {
      _ramp(_globalFilter.frequency, _savedFilterHz + esc.filterBonus, 0.5);
    }
  } else {
    // Legacy fallback: no wave number, use intensity for basic scaling
    if (_globalFilter) _ramp(_globalFilter.frequency, 500 + _musicIntensity * 1600, 0.5);
    if (_outputGain) _ramp(_outputGain.gain, 0.8 + _musicIntensity * 0.2, 0.5);
    if (_lfo) _ramp(_lfo.frequency, 0.3 + _musicIntensity * 1.5, 0.5);
  }
}

export function setBossMusic(isBoss) {
  if (isBoss === _isBossMusic) return;
  if (!_voices || !_musicPlaying) return;
  const ctx = ensureCtx();
  const transitionTime = _getNextBarTime(ctx.currentTime + 0.02);

  if (isBoss) {
    _startScheduler();
    _queueTransition('boss-section', transitionTime, (time) => {
      _isBossMusic = true;
      _gameState = 'boss_fight';
      _applyBossParams(1.5);
      _syncRhythmicClocks(time, { resetLead: true, resetBassPattern: true });
    });
  } else {
    // Return to stage music
    _queueTransition('boss-section', transitionTime, (time) => {
      _isBossMusic = false;
      _gameState = 'playing';
      _bossPhase = 0;
      _applyArcParams(_currentWave, 2.5);
      _syncRhythmicClocks(time, { resetLead: true, resetBassPattern: true });
    });
  }
}

// New: notify music system of game state changes
export function setMusicState(state, detail) {
  if (state === 'title' && (!_voices || !_musicPlaying)) {
    // Music was destroyed (e.g. game over sequence) — restart for title
    startMusic();
    return;
  }
  if (!_voices || !_musicPlaying) return;
  const ctx = ensureCtx();

  if (state === 'wave_break') {
    _gameState = 'wave_break';
    // Filter cutoff drops 30%, lead gain drops 50%
    _savedFilterHz = _globalFilter.frequency.value;
    _savedLeadGain = _voices.lead.gain.gain.value;
    _ramp(_globalFilter.frequency, _savedFilterHz * 0.7, 0.3);
    _ramp(_voices.lead.gain.gain, _savedLeadGain * 0.5, 0.3);
    if (_choirFilter && _savedChoirCutoff) _ramp(_choirFilter.frequency, _savedChoirCutoff * 0.92, 0.3);
  } else if (state === 'power_select') {
    _gameState = 'power_select';
    _savedBpm = _currentBpm;
    _savedLeadGain = _voices.lead.gain.gain.value;
    const targetBpm = _currentBpm * 0.85;
    _queueTransition('state-tempo', _getNextBeatTime(ctx.currentTime + 0.02), (time) => {
      _currentBpm = targetBpm;
      _syncRhythmicClocks(time, {});
    });
    // Lead switches to sustained root note
    const arc = MUSIC_ARCS[_currentArcIdx];
    if (arc && arc.bass) {
      _voices.lead.osc.frequency.setValueAtTime(arc.bass.freq * 2, ctx.currentTime);
    }
    _leadSilenced = false;
    if (_choirFilter && _savedChoirCutoff) _ramp(_choirFilter.frequency, _savedChoirCutoff * 1.08, 0.4);
  } else if (state === 'playing') {
    // Restore from wave_break or power_select
    if (_gameState === 'wave_break') {
      _ramp(_globalFilter.frequency, _savedFilterHz, 0.5);
      _ramp(_voices.lead.gain.gain, _savedLeadGain, 0.5);
    } else if (_gameState === 'power_select') {
      _queueTransition('state-tempo', _getNextBeatTime(ctx.currentTime + 0.02), (time) => {
        _currentBpm = _savedBpm;
        _syncRhythmicClocks(time, {});
      });
      // Restore lead arpeggio (scheduler will pick up new notes)
      _leadIdx = 0;
    }
    if (_choirFilter && _savedChoirCutoff) _ramp(_choirFilter.frequency, _savedChoirCutoff, 0.5);
    _gameState = 'playing';
  } else if (state === 'boss_intro') {
    _gameState = 'boss_intro';
    // Drop to 40% gain, filter to 400 Hz
    _ramp(_outputGain.gain, _outputGain.gain.value * 0.4, 1.0);
    _ramp(_globalFilter.frequency, 400, 1.0);
    if (_choirFilter) _ramp(_choirFilter.frequency, Math.max(350, _savedChoirCutoff * 0.75), 1.0);
  } else if (state === 'boss_approach') {
    const bossWave = detail?.bossWave || (_currentWave + 1);
    const boss = BOSS_THEMES[_getBossIndex(Math.max(10, bossWave))];
    const rootFreq = boss?.bass?.freq || boss?.bass?.freqs?.[0] || 110;
    const harmFreq = boss?.harmony?.freq || boss?.harmony?.freqs?.[0] || rootFreq * 1.5;
    const transitionTime = _getNextBarTime(ctx.currentTime + 0.02);
    _queueTransition('room-boss-approach', transitionTime, (time) => {
      _currentWave = bossWave;
      _gameState = 'boss_approach';
      _isBossMusic = false;
      _currentBpm = (boss?.bpm || _currentBpm) * 0.82;
      _voices.bass.osc.type = boss?.bass?.type || 'sine';
      _voices.harmony.osc.type = boss?.harmony?.type || 'triangle';
      _voices.lead.osc.type = boss?.lead?.type || 'triangle';
      _voices.texture.osc.type = boss?.texture?.type || 'square';
      _ramp(_voices.bass.osc.frequency, rootFreq, 1.1);
      _ramp(_voices.harmony.osc.frequency, harmFreq, 1.1);
      _ramp(_voices.lead.osc.frequency, rootFreq * 2, 1.1);
      if (boss?.texture?.freq) _ramp(_voices.texture.osc.frequency, boss.texture.freq, 1.1);
      _ramp(_voices.bass.gain.gain, Math.max(0.08, (boss?.bass?.gain || 0.16) * 0.72), 1.0);
      _ramp(_voices.harmony.gain.gain, Math.max(0.04, (boss?.harmony?.gain || 0.1) * 0.68), 1.0);
      _ramp(_voices.lead.gain.gain, Math.max(0.02, (boss?.lead?.gain || 0.08) * 0.34), 1.0);
      _ramp(_voices.texture.gain.gain, Math.max(0.015, (boss?.texture?.gain || 0.06) * 0.42), 1.0);
      _ramp(_globalFilter.frequency, Math.max(420, (boss?.filter || _savedFilterHz || 1000) * 0.7), 1.0);
      _ramp(_globalFilter.Q, Math.max(1.4, (boss?.filterQ || 2.0) * 0.85), 1.0);
      if (_choirFilter) _ramp(_choirFilter.frequency, Math.max(450, (_savedChoirCutoff || 1200) * 0.8), 1.0);
      _ramp(_outputGain.gain, 0.92, 1.0);
      _syncRhythmicClocks(time, { resetLead: true, resetBassPattern: true });
    });
  } else if (state === 'chapter_return') {
    const nextWave = detail?.nextWave || Math.max(1, _currentWave + 1);
    const transitionTime = _getNextBarTime(ctx.currentTime + 0.02);
    _queueTransition('room-chapter-return', transitionTime, (time) => {
      _currentWave = nextWave;
      _isBossMusic = false;
      _gameState = 'chapter_return';
      _applyArcParams(nextWave, 1.5);
      _ramp(_globalFilter.frequency, (_savedFilterHz || 1400) + 180, 0.8);
      _ramp(_voices.texture.gain.gain, Math.max(0.01, _voices.texture.gain.gain.value * 0.72), 0.8);
      if (_choirFilter) _ramp(_choirFilter.frequency, (_savedChoirCutoff || 1200) + 120, 0.8);
      _syncRhythmicClocks(time, { resetLead: true, resetBassPattern: true });
    });
  } else if (state === 'epilogue') {
    const transitionTime = _getNextBarTime(ctx.currentTime + 0.02);
    _queueTransition('room-epilogue', transitionTime, (time) => {
      _currentWave = 1;
      _isBossMusic = false;
      _gameState = 'epilogue';
      _applyArcParams(1, 1.8);
      _currentBpm *= 0.84;
      _ramp(_voices.texture.gain.gain, Math.max(0.005, _voices.texture.gain.gain.value * 0.45), 1.1);
      _ramp(_voices.lead.gain.gain, Math.max(0.025, _voices.lead.gain.gain.value * 0.7), 1.1);
      _ramp(_globalFilter.frequency, (_savedFilterHz || 1500) + 240, 1.0);
      if (_choirFilter) _ramp(_choirFilter.frequency, (_savedChoirCutoff || 1200) + 220, 1.0);
      _syncRhythmicClocks(time, { resetLead: true, resetBassPattern: true });
    });
  } else if (state === 'title') {
    // Transition back to title music (e.g. after game over → return to title)
    _isBossMusic = false;
    _stopScheduler();
    _applyTitleParams();
  } else if (state === 'game_over') {
    _playGameOverSequence();
  }
}

// New: boss-specific gameplay events
export function notifyBossEvent(event, phase) {
  if (!_voices || !_musicPlaying || !_isBossMusic) return;
  const ctx = ensureCtx();
  const bIdx = _getBossIndex(_currentWave);
  const boss = BOSS_THEMES[bIdx];

  if (event === 'phase_change' && phase !== undefined) {
    const transitionTime = _getNextBarTime(ctx.currentTime + 0.02);
    _queueTransition('boss-phase', transitionTime, (time) => {
      _bossPhase = phase;
      if (boss.phaseEsc) {
        if (boss.phaseEsc.bpmAdd) _currentBpm = boss.bpm + boss.phaseEsc.bpmAdd * phase;
        if (boss.phaseEsc.filterAdd) {
          _ramp(_globalFilter.frequency, boss.filter + boss.phaseEsc.filterAdd * phase, 0.3);
        }
        if (boss.phaseEsc.texGainAdd && _voices.texture) {
          _ramp(_voices.texture.gain.gain, boss.texture.gain + boss.phaseEsc.texGainAdd * phase, 0.3);
        }
        if (boss.phaseEsc.bassGainAdd && _voices.bass) {
          _ramp(_voices.bass.gain.gain, boss.bass.gain + boss.phaseEsc.bassGainAdd * phase, 0.3);
        }
        if (boss.phaseEsc.leadFilterAdd) {
          _ramp(_leadFilter.frequency, (boss.lead.cutoff || 2000) + boss.phaseEsc.leadFilterAdd * phase, 0.3);
        }
      }
      if (boss.progression) {
        _applyProgressionStep(time);
      }
      _syncRhythmicClocks(time, {});
    });
  } else if (event === 'spawn') {
    // Hive Queen spawn event: spike texture
    if (bIdx === 0 && _voices.texture) {
      _voices.texture.gain.gain.setValueAtTime(0.10, ctx.currentTime);
      _ramp(_globalFilter.frequency, 3500, 0);
      setTimeout(() => {
        if (_voices && _voices.texture) {
          _ramp(_voices.texture.gain.gain, boss.texture.gain, 0.3);
          _ramp(_globalFilter.frequency, boss.filter, 0.3);
        }
      }, 500);
    }
  } else if (event === 'gravity_well') {
    // Void Warden: drop all frequencies 10% over 0.5s, restore over 1s
    if (bIdx === 2 && _voices) {
      const dropFactor = 0.9;
      const bFreq = _voices.bass.osc.frequency.value;
      const hFreq = _voices.harmony.osc.frequency.value;
      _voices.bass.osc.frequency.linearRampToValueAtTime(bFreq * dropFactor, ctx.currentTime + 0.5);
      _voices.harmony.osc.frequency.linearRampToValueAtTime(hFreq * dropFactor, ctx.currentTime + 0.5);
      setTimeout(() => {
        if (_voices && _voices.bass) {
          _voices.bass.osc.frequency.linearRampToValueAtTime(bFreq, audioCtx.currentTime + 1.0);
          _voices.harmony.osc.frequency.linearRampToValueAtTime(hFreq, audioCtx.currentTime + 1.0);
        }
      }, 500);
    }
  }
}

// --- Generative bass sequencer + HP tension ---
// Continuous rhythmic bass line that adapts to gameplay each bar:
//   - Moving: quarter notes on root
//   - Dashing: 8th notes (double speed)
//   - Kills queue note variations for upcoming bars
//   - Low HP: darker intervals

let _playerHpRatio = 1;
let _playerSpeed = 0;
let _playerDashing = false;
let _nextBassSeqTime = 0;
let _bassSeqIdx = 0;
let _bassBarPattern = [0, 0, 0, 0]; // scale degrees for 4-beat bar, 0 = root
let _killQueue = 0; // accumulated kills since last bar reset
let _bassSeqActive = false;

// Get the bass sequencer's home note — the 5th/harmony of current key
// For A minor: E3 = 165 Hz. For other arcs: the harmony frequency.
function _getBassSeqHome() {
  if (_currentHarmonicRoot > 0) return _freqWithSemitone(_currentHarmonicRoot, 7);
  if (_gameState === 'title') return 165; // E3
  if (_isBossMusic) {
    const boss = BOSS_THEMES[_getBossIndex(_currentWave)];
    return (boss.harmony.freq || (boss.harmony.freqs ? boss.harmony.freqs[0] : 165));
  }
  const arc = MUSIC_ARCS[_currentArcIdx];
  if (!arc) return 165;
  return arc.harmony.freq || (arc.harmony.freqs ? arc.harmony.freqs[0] : arc.bass.freq * 1.5);
}

// Build next bar's bass pattern based on recent gameplay events
// Pattern uses semitone offsets from the home note (e.g. E3)
// Example: E3 E3 E3 D3 → [0, 0, 0, -2], E3 E3 E3 F3 → [0, 0, 0, +1]
function _buildNextBassBar() {
  if (_killQueue === 0) {
    // No action: steady home note → E E E E
    _bassBarPattern = [0, 0, 0, 0];
  } else if (_killQueue <= 2) {
    // Light: last note drops a whole step → E E E D
    _bassBarPattern = [0, 0, 0, -2];
  } else if (_killQueue <= 4) {
    // Moderate: last note rises a half step → E E E F
    _bassBarPattern = [0, 0, 0, 1];
  } else if (_killQueue <= 7) {
    // Active: two variations → E E G D
    _bassBarPattern = [0, 0, 3, -2]; // minor 3rd up, whole step down
  } else if (_killQueue <= 12) {
    // Heavy: alternating → E A E D
    _bassBarPattern = [0, 5, 0, -2]; // 4th up, whole step down
  } else {
    // Intense: ascending walk → E F G A
    _bassBarPattern = [0, 1, 3, 5];
  }
  _killQueue = 0;
}

function _scheduleBassSeqNote(time, isRootFill) {
  if (!_voices || !_voices.bass) return;
  const home = _getBassSeqHome(); // E3 = 165 Hz in A minor
  const beat = _beatSec();

  // Semitone offset: 0 for fills and root beats, pattern value for variations
  const semitones = isRootFill ? 0 : _bassBarPattern[_bassSeqIdx % 4];
  const freq = home * Math.pow(2, semitones / 12);
  const noteDur = isRootFill ? beat * 0.25 : beat * 0.45;

  // Modulate the bass voice frequency rhythmically
  _voices.bass.osc.frequency.setValueAtTime(freq, time);

  // Gain envelope: note on → sustain → release
  const tension = 1 - _playerHpRatio;
  const vol = isRootFill ? 0.12 : (0.16 + tension * 0.06);
  _voices.bass.gain.gain.setValueAtTime(vol, time);
  _voices.bass.gain.gain.setValueAtTime(vol, time + noteDur * 0.75);
  _voices.bass.gain.gain.linearRampToValueAtTime(vol * 0.2, time + noteDur);

  // Only advance pattern index on quarter notes (not fills)
  if (!isRootFill) {
    _bassSeqIdx++;
    // Build new pattern at start of each bar (every 4 beats)
    if (_bassSeqIdx % 4 === 0) {
      _buildNextBassBar();
    }
  }
}

export function setPlayerActivity(speed, hpRatio) {
  if (!_musicPlaying || !audioCtx) return;

  // HP tension: lower HP = darker music
  if (hpRatio !== undefined) {
    const prevRatio = _playerHpRatio;
    _playerHpRatio = Math.max(0, Math.min(1, hpRatio));
    if (Math.abs(prevRatio - _playerHpRatio) > 0.05 && _voices) {
      const tension = 1 - _playerHpRatio;
      if (_globalFilter && _savedFilterHz) {
        _ramp(_globalFilter.frequency, Math.max(300, _savedFilterHz - tension * 600), 0.3);
      }
      if (_choirFilter && _savedChoirCutoff) {
        _ramp(_choirFilter.frequency, Math.max(350, _savedChoirCutoff - tension * 220), 0.3);
      }
      if (_lfo) {
        _ramp(_lfo.frequency, 0.3 + tension * 2.0, 0.3);
        _ramp(_lfoGain.gain, 0.03 + tension * 0.06, 0.3);
      }
    }
  }

  // Track movement state for bass sequencer
  _playerSpeed = Math.min(1, speed);

  if (_choirFilter && _savedChoirCutoff && (_gameState === 'playing' || _gameState === 'boss_fight')) {
    const tension = 1 - _playerHpRatio;
    const motionOpen = _playerSpeed * 120 + _actionHeat * 180;
    const dangerClose = tension * 220;
    _ramp(_choirFilter.frequency, Math.max(350, _savedChoirCutoff + motionOpen - dangerClose), 0.2);
  }

  // Activate bass sequencer when player starts moving (if not already)
  if (_playerSpeed > 0.1 && !_bassSeqActive && _voices) {
    _bassSeqActive = true;
    _nextBassSeqTime = audioCtx.currentTime;
    _bassSeqIdx = 0;
    _buildNextBassBar();
  }
  if (_playerSpeed <= 0.05) {
    _bassSeqActive = false;
  }
}
