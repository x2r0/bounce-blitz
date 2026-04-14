'use strict';

// --- Web Audio API Sound System ---
// All sounds are synthesized — no external audio files.

let audioCtx = null;
let masterGain = null;
let sfxGain = null;
let musicGain = null;
let _muted = false;
let _volume = 0.5;

function ensureCtx() {
  if (audioCtx) return audioCtx;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = _volume;
  masterGain.connect(audioCtx.destination);
  sfxGain = audioCtx.createGain();
  sfxGain.gain.value = 1.0;
  sfxGain.connect(masterGain);
  musicGain = audioCtx.createGain();
  musicGain.gain.value = 0.25;
  musicGain.connect(masterGain);
  return audioCtx;
}

// Resume on user gesture (required by browsers)
export function resumeAudio() {
  const ctx = ensureCtx();
  if (ctx.state === 'suspended') ctx.resume();
}

export function setVolume(v) {
  _volume = v;
  if (masterGain) masterGain.gain.value = _muted ? 0 : v;
}

export function toggleMute() {
  _muted = !_muted;
  if (masterGain) masterGain.gain.value = _muted ? 0 : _volume;
  return _muted;
}

// --- Helper: play a tone ---
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
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

// --- Helper: noise burst ---
function playNoise(duration, volume, filterFreq, filterType, dest) {
  const ctx = ensureCtx();
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume || 0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  if (filterFreq) {
    const filter = ctx.createBiquadFilter();
    filter.type = filterType || 'lowpass';
    filter.frequency.value = filterFreq;
    source.connect(filter);
    filter.connect(gain);
  } else {
    source.connect(gain);
  }
  gain.connect(dest || sfxGain);
  source.start(ctx.currentTime);
  source.stop(ctx.currentTime + duration);
}

// ==========================================
// SOUND EFFECTS
// ==========================================

// Dash / bounce: short whoosh
export function sfxDash() {
  const ctx = ensureCtx();
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
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.1);
}

// Wall bounce
export function sfxBounce() {
  playTone(300, 'triangle', 0.06, 0.12);
  playTone(450, 'sine', 0.04, 0.06);
}

// Enemy kill: satisfying pop (pitch varies)
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
}

// Combo kills: escalating pitch
export function sfxComboKill(comboCount) {
  const baseFreq = 400 + Math.min(comboCount, 20) * 40;
  playTone(baseFreq, 'sine', 0.1, 0.2);
  playTone(baseFreq * 1.25, 'triangle', 0.06, 0.1);
}

// Power-up select: card pick confirmation
export function sfxCardPick() {
  const ctx = ensureCtx();
  playTone(523, 'sine', 0.1, 0.15);
  setTimeout(() => playTone(659, 'sine', 0.1, 0.15), 60);
  setTimeout(() => playTone(784, 'sine', 0.15, 0.15), 120);
}

// Shield block: metallic clang
export function sfxShieldBlock() {
  const ctx = ensureCtx();
  playTone(1200, 'square', 0.06, 0.12);
  playTone(800, 'triangle', 0.1, 0.1);
  playNoise(0.05, 0.1, 6000, 'highpass');
}

// Shield break (enemy): glass shatter
export function sfxShieldBreak() {
  playNoise(0.2, 0.2, 8000, 'highpass');
  playTone(2000, 'square', 0.03, 0.1);
  playTone(1500, 'square', 0.05, 0.08);
  playTone(1000, 'sine', 0.08, 0.06);
}

// Damage taken: low thud
export function sfxDamageTaken() {
  playTone(80, 'sine', 0.2, 0.3);
  playTone(60, 'triangle', 0.15, 0.2);
  playNoise(0.1, 0.12, 400, 'lowpass');
}

// Wave clear: triumphant chime
export function sfxWaveClear() {
  playTone(523, 'sine', 0.15, 0.15);
  setTimeout(() => playTone(659, 'sine', 0.15, 0.12), 80);
  setTimeout(() => playTone(784, 'sine', 0.15, 0.12), 160);
  setTimeout(() => playTone(1047, 'sine', 0.3, 0.15), 240);
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
}

// Boss hit: heavy impact
export function sfxBossHit() {
  playTone(120, 'sine', 0.15, 0.25);
  playTone(80, 'triangle', 0.1, 0.15);
  playNoise(0.08, 0.12, 2000, 'lowpass');
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
    playTone(523, 'sine', 0.2, 0.15);
    setTimeout(() => playTone(659, 'sine', 0.2, 0.12), 120);
    setTimeout(() => playTone(784, 'sine', 0.2, 0.12), 240);
    setTimeout(() => playTone(1047, 'sine', 0.5, 0.18), 360);
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
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 1.0);
  playNoise(0.3, 0.08, 600, 'lowpass');
}

// Shard collect: coin-like chime
export function sfxShardCollect() {
  playTone(1200, 'sine', 0.06, 0.12);
  playTone(1800, 'sine', 0.08, 0.08);
}

// Evolution unlock: epic reveal
export function sfxEvolutionUnlock() {
  playTone(400, 'sine', 0.15, 0.15);
  setTimeout(() => playTone(600, 'sine', 0.15, 0.15), 100);
  setTimeout(() => playTone(800, 'sine', 0.15, 0.15), 200);
  setTimeout(() => playTone(1200, 'triangle', 0.4, 0.2), 300);
  setTimeout(() => playNoise(0.2, 0.06, 6000, 'highpass'), 300);
}

// UI navigation: subtle click
export function sfxUIClick() {
  playTone(800, 'sine', 0.03, 0.06);
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
// BACKGROUND MUSIC
// ==========================================

let bgOsc1 = null;
let bgOsc2 = null;
let bgLfo = null;
let bgGainNode = null;
let bgFilterNode = null;
let _musicPlaying = false;
let _musicIntensity = 0;
let _isBossMusic = false;

export function startMusic() {
  if (_musicPlaying) return;
  const ctx = ensureCtx();

  bgGainNode = ctx.createGain();
  bgGainNode.gain.value = 0;
  bgGainNode.connect(musicGain);

  bgFilterNode = ctx.createBiquadFilter();
  bgFilterNode.type = 'lowpass';
  bgFilterNode.frequency.value = 400;
  bgFilterNode.connect(bgGainNode);

  bgOsc1 = ctx.createOscillator();
  bgOsc1.type = 'sine';
  bgOsc1.frequency.value = 55; // A1
  bgOsc1.connect(bgFilterNode);
  bgOsc1.start();

  bgOsc2 = ctx.createOscillator();
  bgOsc2.type = 'triangle';
  bgOsc2.frequency.value = 82.5; // E2 (fifth)
  const bg2Gain = ctx.createGain();
  bg2Gain.gain.value = 0.3;
  bgOsc2.connect(bg2Gain);
  bg2Gain.connect(bgFilterNode);
  bgOsc2.start();

  // LFO for subtle pulsing
  bgLfo = ctx.createOscillator();
  bgLfo.type = 'sine';
  bgLfo.frequency.value = 0.3;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.05;
  bgLfo.connect(lfoGain);
  lfoGain.connect(bgGainNode.gain);
  bgLfo.start();

  // Fade in
  bgGainNode.gain.setValueAtTime(0, ctx.currentTime);
  bgGainNode.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 2.0);

  _musicPlaying = true;
}

export function stopMusic() {
  if (!_musicPlaying) return;
  const ctx = ensureCtx();
  if (bgGainNode) {
    bgGainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.0);
  }
  setTimeout(() => {
    if (bgOsc1) { bgOsc1.stop(); bgOsc1 = null; }
    if (bgOsc2) { bgOsc2.stop(); bgOsc2 = null; }
    if (bgLfo) { bgLfo.stop(); bgLfo = null; }
    bgGainNode = null;
    bgFilterNode = null;
    _musicPlaying = false;
    _isBossMusic = false;
  }, 1200);
}

// Increase intensity with wave number (0-1 range)
export function setMusicIntensity(intensity) {
  _musicIntensity = Math.min(1, Math.max(0, intensity));
  if (!bgFilterNode || !bgGainNode || !bgLfo) return;
  const ctx = ensureCtx();
  // Higher intensity: brighter filter, louder, faster pulse
  bgFilterNode.frequency.linearRampToValueAtTime(
    400 + _musicIntensity * 1600, ctx.currentTime + 0.5
  );
  bgGainNode.gain.linearRampToValueAtTime(
    0.1 + _musicIntensity * 0.12, ctx.currentTime + 0.5
  );
  bgLfo.frequency.linearRampToValueAtTime(
    0.3 + _musicIntensity * 1.5, ctx.currentTime + 0.5
  );
}

export function setBossMusic(isBoss) {
  if (isBoss === _isBossMusic) return;
  _isBossMusic = isBoss;
  if (!bgOsc1 || !bgOsc2 || !bgFilterNode) return;
  const ctx = ensureCtx();
  if (isBoss) {
    // Switch to more intense: minor key, faster, brighter
    bgOsc1.frequency.linearRampToValueAtTime(73.4, ctx.currentTime + 0.5); // D2
    bgOsc2.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.5);  // A2
    bgFilterNode.frequency.linearRampToValueAtTime(2000, ctx.currentTime + 0.5);
    if (bgLfo) bgLfo.frequency.linearRampToValueAtTime(2.0, ctx.currentTime + 0.3);
    if (bgGainNode) bgGainNode.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.5);
  } else {
    // Restore normal
    bgOsc1.frequency.linearRampToValueAtTime(55, ctx.currentTime + 1.0);
    bgOsc2.frequency.linearRampToValueAtTime(82.5, ctx.currentTime + 1.0);
    setMusicIntensity(_musicIntensity);
  }
}
