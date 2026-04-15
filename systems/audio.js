'use strict';

// --- Web Audio API Sound System ---
// All sounds are synthesized — no external audio files.

let audioCtx = null;
let masterGain = null;
let sfxGain = null;
let musicGain = null;
let _muted = false;
let _volume = 0.5;
let _musicVolume = 0.5;
let _sfxVolume = 0.5;

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
  playTone(523, 'sine', 0.15, 0.15);
  setTimeout(() => playTone(659, 'sine', 0.15, 0.12), 80);
  setTimeout(() => playTone(784, 'sine', 0.15, 0.12), 160);
  setTimeout(() => playTone(1047, 'sine', 0.3, 0.15), 240);
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
// BACKGROUND MUSIC — Procedural Music System
// 4-voice architecture: bass, harmony, lead, texture
// ==========================================

// --- Arc parameter definitions (6 arcs) ---
const MUSIC_ARCS = [
  { // Arc 0: The Awakening (Waves 1–9)
    waveMin: 1, waveMax: 9, bpm: [90, 110],
    bass: { freq: 110, type: 'sine', gain: [0.10, 0.14], lfoRate: 0.2, lfoDepth: 0.03 },
    harmony: { freq: 165, type: 'triangle', gain: [0.06, 0.10], fadeInWave: 3 },
    lead: { notes: [220, 262, 330, 440], type: 'sawtooth', gain: [0.04, 0.08], fadeInWave: 5, subdiv: 1, legato: 1.0 },
    texture: { freq: 880, type: 'square', gain: [0.02, 0.04], fadeInWave: 7, burstSec: 0.05, everyBeats: 4, cutoff: 1200 },
    filter: { hz: [500, 1800], Q: [1, 1] },
    lfo: { rate: [0.25, 0.6], depth: 0.04 },
    transIn: 2.0,
  },
  { // Arc 1: Hive Nest (Wave 10)
    waveMin: 10, waveMax: 10, bpm: [115, 115],
    bass: { freq: 73.4, type: 'sine', gain: [0.12, 0.12], lfoRate: 0.3, lfoDepth: 0.02 },
    harmony: { freqs: [175, 220], type: 'triangle', gain: [0.08, 0.08], swapBeats: 2 },
    lead: { notes: [294, 349, 440, 587], type: 'sawtooth', gain: [0.06, 0.06], subdiv: 1, legato: 0.8 },
    texture: { freq: 660, type: 'triangle', gain: [0.04, 0.04], burstSec: 0.03, everyBeats: 2 },
    filter: { hz: [2000, 2000], Q: [2, 2] },
    lfo: { rate: [0.4, 0.4], depth: 0.03 },
    transIn: 2.0,
  },
  { // Arc 2: The Deep Grid (Waves 11–19)
    waveMin: 11, waveMax: 19, bpm: [118, 130],
    bass: { freq: 82.4, type: 'sine', gain: [0.12, 0.16], staccato: true },
    harmony: { freqs: [87.3, 123.5], type: 'triangle', gain: [0.07, 0.10], swapBeats: 4 },
    lead: { notes: [165, 175, 220, 247], type: 'sawtooth', gain: [0.05, 0.09], subdiv: 4, legato: 0.7, cutoff: 1500 },
    texture: { freq: 440, type: 'square', gain: [0.03, 0.05], burstSec: 0.02, everyBeats: 1, pitchDev: 0.1 },
    filter: { hz: [1200, 2500], Q: [1, 4] },
    lfo: { rate: [0.8, 1.5], depth: 0.05 },
    transIn: 2.0,
  },
  { // Arc 3: Nexus Chamber (Wave 20)
    waveMin: 20, waveMax: 20, bpm: [135, 135],
    bass: { freq: 110, type: 'sine', gain: [0.15, 0.15], bass2Freq: 82.4 },
    harmony: { freq: 262, type: 'triangle', gain: [0.09, 0.09], vibratoHz: 1, vibratoDep: 5 },
    lead: { notes: [440, 494, 523, 659, 880], type: 'sawtooth', gain: [0.08, 0.08], subdiv: 8, legato: 0.6, cutoff: 3000 },
    texture: { freq: 4000, type: 'square', gain: [0.05, 0.05], burstSec: 0.015, everyBeats: 0.5 },
    filter: { hz: [3000, 3000], Q: [6, 6] },
    lfo: { rate: [1.2, 1.2], depth: 0.06 },
    transIn: 1.5,
  },
  { // Arc 4: The Void Approaches (Waves 21–29)
    waveMin: 21, waveMax: 29, bpm: [125, 108],
    bass: { freq: 77.8, type: 'sine', gain: [0.12, 0.16], pitchLfoRate: 0.15, pitchLfoDep: 2 },
    harmony: { freqs: [110, 92.5], type: 'triangle', gain: [0.05, 0.05], swapBeats: 4 },
    lead: { notes: [156, 185, 220, 311], type: 'sawtooth', gain: [0.05, 0.08], subdiv: 0.667, legato: 0.7, silenceChance: 0.3 },
    texture: { freq: 40, type: 'square', gain: [0.04, 0.04], continuous: true, cutoff: 200, contLfoRate: 0.1 },
    filter: { hz: [2200, 800], Q: [2, 3] },
    lfo: { rate: [0.4, 0.4], depth: [0.02, 0.06] },
    transIn: 2.0,
  },
  { // Arc 5: The Void (Wave 30)
    waveMin: 30, waveMax: 30, bpm: [100, 100],
    bass: { freq: 55, type: 'sine', gain: [0.12, 0.12] },
    harmony: { freq: 82.4, type: 'triangle', gain: [0.03, 0.03] },
    lead: { notes: [220], type: 'sawtooth', gain: [0.05, 0.05], subdiv: 0.5, legato: 0.2, cutoff: 600 },
    texture: { freq: 0, type: 'sine', gain: [0, 0] },
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
    lead: { notes: [147, 175, 220, 294], type: 'sawtooth', gain: 0.07, subdiv: 4, legato: 0.25, cutoff: 2000 },
    texture: { freq: 220, type: 'square', gain: 0.05, burstSec: 0.01, everyBeats: 0.5 },
    filter: 2200, filterQ: 4, lfoRate: 2.0,
  },
  { // Boss 2: Nexus Core (Wave 20)
    bpm: 150, outGain: 0.22,
    bass: { freq: 65.4, type: 'square', gain: 0.14, cutoff: 300 },
    harmony: { freqs: [77.8, 98], type: 'triangle', gain: 0.07, swapBeats: 1 },
    lead: { notes: [131, 156, 196, 233, 262], type: 'sawtooth', gain: 0.08, subdiv: 8, legato: 0.5, cutoff: 2500 },
    texture: { freq: 5000, type: 'square', gain: 0.04, burstSec: 0.008, everyBeats: 1 },
    filter: 2500, filterQ: 5, lfoRate: 2.5,
    phaseEsc: { bpmAdd: 10, filterAdd: 500, texGainAdd: 0.02 },
  },
  { // Boss 3: Void Warden (Wave 30)
    bpm: 95, outGain: 0.22,
    bass: { freqs: [55, 77.8], type: 'sine', gain: 0.18, lfoRate: 0.08, lfoDepth: 3, swapBars: 4 },
    harmony: { type: 'triangle', gain: 0.04 },
    lead: { notes: [880, 440, 220, 110], type: 'sawtooth', gain: 0.06, subdiv: 0.25, legato: 0.3, cutoff: 500, silenceAfter: 4 },
    texture: { freq: 30, type: 'sine', gain: 0.06, continuous: true, contLfoRate: 0.05 },
    filter: 800, filterQ: 2, lfoRate: 0.5,
    phaseEsc: { bassGainAdd: 0.01, texGainAdd: 0.01, leadFilterAdd: 100 },
  },
];

// --- Internal music state ---
let _musicPlaying = false;
let _musicIntensity = 0;
let _isBossMusic = false;
let _currentWave = 0;
let _currentArcIdx = 0;
let _bossPhase = 0;
let _gameState = 'title'; // title | playing | wave_break | power_select | boss_intro | boss_fight | game_over

// Voice nodes
let _voices = null;   // { bass, harmony, lead, texture, bass2? }
let _outputGain = null;
let _globalFilter = null;
let _lfo = null;
let _lfoGain = null;
let _bassPitchLfo = null;
let _harmonyVibrato = null;
let _leadFilter = null;
let _textureFilter = null;

// Scheduler state
let _schedulerTimer = null;
let _nextLeadTime = 0;
let _leadIdx = 0;
let _nextTextureTime = 0;
let _nextHarmonySwapTime = 0;
let _harmonyFlip = false;
let _nextBassSwapTime = 0;
let _bassFlip = false;
let _currentBpm = 90;
let _leadSilenced = false; // for void gaps
let _voidLeadCount = 0; // for Void Warden silence-after pattern

// Saved params for state restoration
let _savedFilterHz = 0;
let _savedLeadGain = 0;
let _savedBpm = 0;

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
// A minor scale intervals (semitones from root)
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

function _getArcRoot() {
  if (_isBossMusic) {
    const boss = BOSS_THEMES[_getBossIndex(_currentWave)];
    return boss.bass.freq || boss.bass.freqs?.[0] || 110;
  }
  if (_gameState === 'title') return 110;
  const arc = MUSIC_ARCS[_currentArcIdx];
  return arc ? arc.bass.freq : 110;
}

function _scaleFreq(root, degree, octaveShift) {
  const semitones = MINOR_SCALE[degree % 7];
  const oct = Math.floor(degree / 7) + (octaveShift || 0);
  return root * Math.pow(2, (semitones / 12) + oct);
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
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

function _reactToAction(action, intensity) {
  if (!_musicPlaying || !_voices || !audioCtx) return;
  const now = audioCtx.currentTime;
  const root = _getArcRoot();

  if (action === 'kill') {
    _actionHeat = Math.min(1, _actionHeat + 0.06);
    _killQueue++; // Queue kill for bass sequencer bar variation
    _startHeatDecay();
    // Prominent in-key accent note based on enemy type
    const degree = intensity || 0;
    const freq = _scaleFreq(root, degree, 2);
    const vol = 0.10 + _actionHeat * 0.06;
    _playMusicAccent(freq, 0.15, vol, 0, true); // prominent — through sfxGain
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
    const noteCount = Math.min(4, 1 + Math.floor(count / 3));
    const baseDeg = count % 7;
    for (let i = 0; i < noteCount; i++) {
      const freq = _scaleFreq(root, baseDeg + i, 2);
      _playMusicAccent(freq, 0.10, 0.10, i * 0.06, true);
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
    const freq = _scaleFreq(root, 0, 1); // bass octave root
    _playMusicAccent(freq, 0.10, 0.12, 0, true); // prominent bass hit
    // Plus a high shimmer
    _playMusicAccent(_scaleFreq(root, 4, 3), 0.08, 0.06, 0.02);
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
    // Resolving descending phrase: root→5th→root (tension release)
    _playMusicAccent(_scaleFreq(root, 0, 3), 0.25, 0.09, 0);
    _playMusicAccent(_scaleFreq(root, 4, 2), 0.25, 0.08, 0.2);
    _playMusicAccent(_scaleFreq(root, 0, 2), 0.4, 0.07, 0.4);
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
    _playMusicAccent(_scaleFreq(root, 0, 1), 0.15, 0.08);
    _playMusicAccent(_scaleFreq(root, 4, 1), 0.12, 0.06, 0.02);
    if (_globalFilter) {
      const cur = _globalFilter.frequency.value;
      _globalFilter.frequency.setValueAtTime(Math.min(5000, cur + 600), now);
      _globalFilter.frequency.linearRampToValueAtTime(cur, now + 0.2);
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

  _voices = {
    bass: _createOsc('sine', 110, _globalFilter),
    harmony: _createOsc('triangle', 165, _globalFilter),
    lead: _createOsc('sawtooth', 220, _leadFilter),
    texture: _createOsc('square', 880, _textureFilter),
    bass2: null,
  };

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
}

// --- Scheduler ---
function _startScheduler() {
  if (_schedulerTimer) return;
  const ctx = ensureCtx();
  _nextLeadTime = ctx.currentTime + 0.05;
  _nextTextureTime = ctx.currentTime + 0.05;
  _nextHarmonySwapTime = ctx.currentTime + 0.05;
  _nextBassSwapTime = ctx.currentTime + 0.05;
  _leadIdx = 0;
  _harmonyFlip = false;
  _bassFlip = false;
  _voidLeadCount = 0;
  _schedulerTimer = setInterval(_schedulerTick, 25);
}

function _stopScheduler() {
  if (_schedulerTimer) { clearInterval(_schedulerTimer); _schedulerTimer = null; }
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
  const ahead = 0.1;
  const isTitle = _gameState === 'title';
  const arc = (_isBossMusic || isTitle) ? null : MUSIC_ARCS[_currentArcIdx];
  const boss = _isBossMusic ? BOSS_THEMES[_getBossIndex(_currentWave)] : null;
  const beat = _beatSec();

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
  if (harmDef && harmDef.freqs && harmDef.swapBeats && _voices.harmony) {
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

  // --- Arpeggio variation (reduces repetitiveness) ---
  // Occasional octave shift (12% chance up, 5% chance down)
  const rnd = Math.random();
  if (rnd < 0.12 && freq < 2000) freq *= 2;
  else if (rnd < 0.17 && freq > 100) freq *= 0.5;
  // Occasional passing tone — shift by a musical third (8% chance)
  else if (rnd < 0.25) freq *= (Math.random() < 0.5 ? 1.26 : 0.84); // ~major 3rd up/down
  // Action heat adds energy: occasional grace note doubling
  if (_actionHeat > 0.4 && Math.random() < _actionHeat * 0.3 && _voices.lead.osc) {
    // Quick grace note at current freq before the main note
    const graceFreq = freq * (Math.random() < 0.5 ? 1.125 : 0.89); // major 2nd
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
    return boss.lead.gain;
  }
  const arc = MUSIC_ARCS[_currentArcIdx];
  const p = _getArcProgress(_currentWave, arc);
  const g = _lerp(arc.lead.gain[0], arc.lead.gain[1], p);
  // Fade in based on wave
  if (arc.lead.fadeInWave && _currentWave < arc.lead.fadeInWave) return 0;
  return g;
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
}

function _getTextureTargetGain() {
  if (_gameState === 'title') return 0.03; // Title texture ping gain
  if (_isBossMusic) {
    const boss = BOSS_THEMES[_getBossIndex(_currentWave)];
    return boss.texture.gain;
  }
  const arc = MUSIC_ARCS[_currentArcIdx];
  const p = _getArcProgress(_currentWave, arc);
  const g = _lerp(arc.texture.gain[0], arc.texture.gain[1], p);
  if (arc.texture.fadeInWave && _currentWave < arc.texture.fadeInWave) return 0;
  return g;
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

  // LFO
  const lfoRate = _lerp(arc.lfo.rate[0], arc.lfo.rate[1], p);
  const lfoDepth = Array.isArray(arc.lfo.depth) ? _lerp(arc.lfo.depth[0], arc.lfo.depth[1], p) : arc.lfo.depth;
  _ramp(_lfo.frequency, lfoRate, td);
  _ramp(_lfoGain.gain, lfoDepth, td);

  // Output gain — per-voice gains handle balance; outputGain stays ~1.0
  _ramp(_outputGain.gain, 1.0, td);
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

  // Open filter for bright, inviting sound
  _ramp(_globalFilter.frequency, 1800, 0);
  _ramp(_globalFilter.Q, 2.0, 0);
  _ramp(_lfo.frequency, 0.2, 0);
  _ramp(_lfoGain.gain, 0.03, 0);

  _ramp(_outputGain.gain, 1.0, 0.8);

  // Start scheduler so lead arpeggio + texture pings play on title
  _leadIdx = 0;
  _startScheduler();
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

  // If wave provided, use it for arc determination
  if (wave !== undefined && wave > 0) {
    const newArcIdx = _getMusicArcIndex(wave);
    const arcChanged = newArcIdx !== _currentArcIdx || _gameState === 'title';
    _currentWave = wave;

    if (arcChanged || _gameState === 'title') {
      _gameState = 'playing';
      _startScheduler();
      const arc = MUSIC_ARCS[newArcIdx];
      _applyArcParams(wave, arc.transIn || 2.0);
    } else {
      // Same arc, update intensity-dependent params
      _gameState = 'playing';
      const arc = MUSIC_ARCS[_currentArcIdx];
      const p = _getArcProgress(wave, arc);

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
      const harmFaded = arc.harmony.fadeInWave && wave < arc.harmony.fadeInWave;
      _ramp(_voices.harmony.gain.gain, harmFaded ? 0 : harmGain, 0.5);
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
  _isBossMusic = isBoss;
  if (!_voices || !_musicPlaying) return;

  if (isBoss) {
    _gameState = 'boss_fight';
    _startScheduler();
    _applyBossParams(1.5);
  } else {
    // Return to stage music
    _gameState = 'playing';
    _bossPhase = 0;
    _applyArcParams(_currentWave, 2.5);
  }
}

// New: notify music system of game state changes
export function setMusicState(state) {
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
  } else if (state === 'power_select') {
    _gameState = 'power_select';
    _savedBpm = _currentBpm;
    _savedLeadGain = _voices.lead.gain.gain.value;
    _currentBpm = _currentBpm * 0.85;
    // Lead switches to sustained root note
    const arc = MUSIC_ARCS[_currentArcIdx];
    if (arc && arc.bass) {
      _voices.lead.osc.frequency.setValueAtTime(arc.bass.freq * 2, ctx.currentTime);
    }
    _leadSilenced = false;
  } else if (state === 'playing') {
    // Restore from wave_break or power_select
    if (_gameState === 'wave_break') {
      _ramp(_globalFilter.frequency, _savedFilterHz, 0.5);
      _ramp(_voices.lead.gain.gain, _savedLeadGain, 0.5);
    } else if (_gameState === 'power_select') {
      _currentBpm = _savedBpm;
      // Restore lead arpeggio (scheduler will pick up new notes)
      _leadIdx = 0;
    }
    _gameState = 'playing';
  } else if (state === 'boss_intro') {
    _gameState = 'boss_intro';
    // Drop to 40% gain, filter to 400 Hz
    _ramp(_outputGain.gain, _outputGain.gain.value * 0.4, 1.0);
    _ramp(_globalFilter.frequency, 400, 1.0);
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
    _bossPhase = phase;
    if (boss.phaseEsc) {
      // Escalate params per phase
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

// Build next bar's bass pattern based on recent gameplay events
// User's requested format: R R R [variation] — last note changes based on kills
// Example: E3 E3 E3 D3, or E3 E3 E3 F3
function _buildNextBassBar() {
  const R = 0; // root (e.g. E3)
  if (_killQueue === 0) {
    // No action: steady root → R R R R
    _bassBarPattern = [R, R, R, R];
  } else if (_killQueue <= 2) {
    // Light: last note drops a step → R R R flat7 (like E E E D)
    _bassBarPattern = [R, R, R, 6]; // degree 6 = minor 7th (D if root is E)
  } else if (_killQueue <= 4) {
    // Moderate: last note goes up → R R R 3rd (like E E E F)
    _bassBarPattern = [R, R, R, 2]; // degree 2 = minor 3rd
  } else if (_killQueue <= 7) {
    // Active: two variations → R R 5th flat7 (like E E G D)
    _bassBarPattern = [R, R, 4, 6];
  } else if (_killQueue <= 12) {
    // Heavy: walk with 4th beat variation → R 5th R flat7
    _bassBarPattern = [R, 4, R, 6];
  } else {
    // Intense: ascending bass walk → R 2nd 3rd 5th
    _bassBarPattern = [R, 1, 2, 4];
  }
  _killQueue = 0;
}

function _scheduleBassSeqNote(time, isRootFill) {
  if (!_voices || !_voices.bass) return;
  const root = _getArcRoot();
  const beat = _beatSec();

  // Root fills (during dash) always play the root at same octave
  // Pattern notes play the bar's degree sequence
  const degree = isRootFill ? 0 : _bassBarPattern[_bassSeqIdx % 4];
  const freq = _scaleFreq(root, degree, 1); // octave 1 = E3/A3 register (~165-220 Hz)
  const noteDur = isRootFill ? beat * 0.25 : beat * 0.45; // fills are shorter staccato

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
      if (_lfo) {
        _ramp(_lfo.frequency, 0.3 + tension * 2.0, 0.3);
        _ramp(_lfoGain.gain, 0.03 + tension * 0.06, 0.3);
      }
    }
  }

  // Track movement state for bass sequencer
  _playerSpeed = Math.min(1, speed);

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
