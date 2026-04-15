'use strict';

import { W, H, STATE, FONT, MAX_POWER_SLOTS, CLARITY, SURGE_ACTIVE_SPEED_THRESHOLD } from './config.js';
import { rand, dist, lerp, formatScore, formatTime } from './utils.js';
import { events } from './eventbus.js';
import { G } from './state.js';
import { ctx, gridCanvas, drawGlowText } from './canvas.js';
import { hasSavedRun, clearRunState, loadSettings } from './systems/save.js';

import { updatePlayer, damagePlayer, drawPlayer } from './entities/player.js';
import { spawnEnemy, updateEnemies, killEnemy, hitEnemy, drawEnemies } from './entities/enemy.js';
import { updatePowerUps, drawPowerUps } from './entities/powerup.js';

import { startNextWave, pickEnemyType, getEnemyCount, isBossWave, drawBurstTexts, updateBurstSpawning, getWaveBreakDuration } from './systems/wave.js';
import { startBossIntro, updateBossIntro, skipBossIntro, drawBossIntro,
  updateBossReady, drawBossReady, confirmBossReady,
  updateBoss, updateBossClearPause, hitBoss, defeatBoss, drawBossHPBar, drawBossExtras,
  checkMirrorCopyCollisions,
  updateBossTutorial, drawBossTutorial } from './systems/boss.js';
import { initArenaModifiers, updateArenaModifiersForWave, updateArenaModifiers, drawArenaModifiers, spawnPowerGem, slideObstacleTo, slideAllObstacles } from './systems/arena.js';
import {
  spawnParticles,
  updateParticles, updateFloatTexts, updateShockwaves, updateAfterimages,
  updateWallFlashes, updateCollectRings, updateMultiPopExplosions, updateTapBounceRipples,
  drawWallFlashes, drawParticles, drawCollectRings, drawMultiPopExplosions,
  drawShockwaves, drawAfterimages, drawJoystick, drawTapBounceRipples
} from './systems/particles.js';
import { setupInput, updateDashCharge } from './systems/input.js';
import { updateDashPreview, drawDashPreview } from './systems/dash-preview.js';
import { updateTitleBackground, drawTitleBackground } from './systems/title-bg.js';
import { drawHUD } from './systems/hud.js';
import { drawPowerSelectScreen, drawPowerIcon } from './systems/cards.js';
import { updateCombatTexts, drawCombatTexts } from './systems/combat-text.js';
import { POWER_DEFS, EVOLUTION_RECIPES, generateOffering, checkEvolutionAvailable, createEvolutionCard, applyPowerPick, applyWaveStartPowers, resetWaveCounters } from './systems/powers.js';
import { calculateRunBonusShards, applyShardMagnetBonus, saveMeta, getCheapestLockedUpgrade, UPGRADES, canPurchaseUpgrade, purchaseUpgrade, LOADOUTS, isLoadoutUnlocked, isTierUnlocked, canPurchaseHardcore, purchaseHardcore, getHardcoreWaveMilestoneBonus } from './systems/meta.js';
import { spawnCombatText } from './systems/combat-text.js';
import {
  onEnemyKilled as boostOnEnemyKilled,
  updateBoostPickups, updateActiveBoost,
  drawBoostPickups, drawBoostTimerBar,
  clearBoostsOnWaveEnd, isInvincibleFromBoost, getScoreMultiplier, getBoostSpeedBonus, isFreeDash
} from './systems/lootcrate.js';
import {
  rollEnemyShardDrop, updateShardPickups, drawShardPickups
} from './systems/shard-pickup.js';
import {
  setupGlossaryTracking, updateToasts, drawToasts,
  drawGlossaryScreen
} from './systems/glossary.js';
import {
  initLoreSnippet, updateLoreSnippet, drawLoreSnippet,
  showEndlessEntryMessage, updateEndlessEntryMessage, drawEndlessEntryMessage
} from './systems/lore.js';
import {
  resumeAudio, sfxDash, sfxBounce, sfxEnemyKill, sfxComboKill,
  sfxCardPick, sfxShieldBlock, sfxShieldBreak, sfxDamageTaken,
  sfxWaveClear, sfxBossIntro, sfxBossHit, sfxBossPhaseTransition,
  sfxBossDefeat, sfxGameOver, sfxShardCollect, sfxEvolutionUnlock,
  sfxUIClick, sfxMultiPop, sfxGravityBomb,
  startMusic, stopMusic, setMusicIntensity, setBossMusic, setMusicState,
  setPlayerActivity,
  getMusicVolume, getSfxVolume, isMuted, setMusicVolume, setSfxVolume, toggleMute
} from './systems/audio.js';
import platformSDK from './platform-sdk.js';
import { setupCrazyGames } from './platform-crazygames.js';
import { setupPoki } from './platform-poki.js';
import { setupGameDistribution } from './platform-gamedistribution.js';

// --- Grid crossfade infrastructure (offscreen canvas for arc transitions) ---
const gridCanvasOld = document.createElement('canvas');
gridCanvasOld.width = W;
gridCanvasOld.height = H;

// --- Parallax background grid (larger scale, drawn behind main grid) ---
const bgGridCanvas = document.createElement('canvas');
bgGridCanvas.width = W;
bgGridCanvas.height = H;
const bgGridCanvasOld = document.createElement('canvas');
bgGridCanvasOld.width = W;
bgGridCanvasOld.height = H;

function renderGridTo(canvas, color) {
  const gc = canvas.getContext('2d');
  gc.clearRect(0, 0, W, H);
  gc.strokeStyle = color;
  gc.lineWidth = 0.5;
  for (let x = 0; x <= W; x += 40) {
    gc.beginPath(); gc.moveTo(x, 0); gc.lineTo(x, H); gc.stroke();
  }
  for (let y = 0; y <= H; y += 40) {
    gc.beginPath(); gc.moveTo(0, y); gc.lineTo(W, y); gc.stroke();
  }
}

function renderBgGridTo(canvas, color) {
  const gc = canvas.getContext('2d');
  gc.clearRect(0, 0, W, H);
  gc.strokeStyle = color;
  gc.lineWidth = 1;
  for (let x = 0; x <= W; x += 80) {
    gc.beginPath(); gc.moveTo(x, 0); gc.lineTo(x, H); gc.stroke();
  }
  for (let y = 0; y <= H; y += 80) {
    gc.beginPath(); gc.moveTo(0, y); gc.lineTo(W, y); gc.stroke();
  }
}

// Render initial grids with Arc 0 (The Awakening) color
renderGridTo(gridCanvas, '#1a2a1a');
renderBgGridTo(bgGridCanvas, '#1a2a1a');

// --- Transition state ---
let transitionAlpha = 0;
let transitionDir = 0; // 1 = fading in (to black), -1 = fading out (from black)
let transitionSpeed = 4;
let transitionCallback = null;

export function startTransition(callback, speed) {
  transitionAlpha = 0;
  transitionDir = 1;
  transitionSpeed = speed || 4;
  transitionCallback = callback;
}

function updateTransition(dt) {
  if (transitionDir === 0) return;
  transitionAlpha += transitionDir * dt * transitionSpeed;
  if (transitionDir === 1 && transitionAlpha >= 1) {
    transitionAlpha = 1;
    transitionDir = -1;
    if (transitionCallback) { transitionCallback(); transitionCallback = null; }
  }
  if (transitionDir === -1 && transitionAlpha <= 0) {
    transitionAlpha = 0;
    transitionDir = 0;
  }
}

function drawTransition() {
  if (transitionAlpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = transitionAlpha;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// --- Stage Arc Definitions (lore-driven background progression) ---
const STAGE_ARCS = [
  { // Arc 0: The Awakening (waves 1-9)
    name: 'The Awakening', waveMin: 1, waveMax: 9,
    baseFill: '#0a0a0f', gridColor: '#1a2a1a', tintColor: '#00aa66',
    tintAlpha: (wave) => 0.10 + (wave - 1) * (0.08 / 8),
    particles: { count: 8, speed: 15, alpha: 0.06, shape: 'circle', size: 2, pulse: 0, dirY: 0 },
  },
  { // Arc 1: Hive Queen's Nest (wave 10)
    name: "Hive Queen's Nest", waveMin: 10, waveMax: 10,
    baseFill: '#0f0a05', gridColor: '#2a1a0a', tintColor: '#ff8800',
    tintAlpha: () => 0.22,
    particles: { count: 12, speed: 25, alpha: 0.08, shape: 'circle', size: 2, pulse: 3, pulseAmp: 0.03, dirY: 0 },
  },
  { // Arc 2: The Deep Grid (waves 11-19)
    name: 'The Deep Grid', waveMin: 11, waveMax: 19,
    baseFill: '#050510', gridColor: '#0a1a2a',
    tintColor: (wave) => {
      const t = (wave - 11) / 8;
      const r = Math.round(0x00 + t * (0x66 - 0x00));
      const g = Math.round(0x66 + t * (0x00 - 0x66));
      const b = Math.round(0xcc + t * (0x99 - 0xcc));
      return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
    },
    tintAlpha: (wave) => 0.14 + (wave - 11) * (0.08 / 8),
    particles: { count: 10, speed: 20, alpha: 0.07, shape: 'rect', size: 2, sizeH: 4, pulse: 0, dirY: 0 },
  },
  { // Arc 3: Nexus Chamber (wave 20)
    name: 'Nexus Chamber', waveMin: 20, waveMax: 20,
    baseFill: '#0a0a10', gridColor: '#1a1a2a', tintColor: '#ffffff',
    tintAlpha: () => 0.20,
    particles: { count: 15, speed: 40, alpha: 0.10, shape: 'circle', size: 2, pulse: 0, dirY: 0, flash: true, flashLife: 0.3 },
  },
  { // Arc 4: The Void Approaches (waves 21-29)
    name: 'The Void Approaches', waveMin: 21, waveMax: 29,
    baseFill: '#050008', gridColor: '#150020',
    tintColor: (wave) => {
      const t = (wave - 21) / 8;
      const r = Math.round(0x66);
      const g = Math.round(0x00);
      const b = Math.round(0x99 + t * (0x66 - 0x99));
      return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
    },
    tintAlpha: (wave) => 0.16 + (wave - 21) * (0.12 / 8),
    particles: { count: 12, speed: 10, alpha: 0.09, shape: 'circle', size: 2, pulse: 0, dirY: 0, scaleOscillate: true },
  },
  { // Arc 5: The Void (wave 30)
    name: 'The Void', waveMin: 30, waveMax: 30,
    baseFill: '#020004', gridColor: '#0a0010', tintColor: '#aa66ff',
    tintAlpha: () => 0.30,
    particles: { count: 20, speed: 30, alpha: 0.12, shape: 'circle', size: 2, pulse: 0, dirY: -1 },
  },
];

function getStageArcIndex(wave) {
  if (wave <= 0) return 0;
  if (wave <= 30) {
    for (let i = 0; i < STAGE_ARCS.length; i++) {
      if (wave >= STAGE_ARCS[i].waveMin && wave <= STAGE_ARCS[i].waveMax) return i;
    }
    return 0;
  }
  // Endless mode (31+): cycle arcs 0-4 (non-boss) every 10 waves
  // Boss waves (every 10th in endless) use their dedicated arc based on cycle position
  const endlessWave = wave - 31;
  const posInCycle = endlessWave % 10; // 0-9 position within 10-wave group
  const cycleGroup = Math.floor(endlessWave / 10) % 3; // which boss pattern (0,1,2)
  if (posInCycle === 9) {
    // Boss wave: cycle through Hive(1), Nexus(3), Void(5)
    return [1, 3, 5][cycleGroup];
  }
  // Non-boss waves: cycle through arcs 0 (Awakening) and 4 (Void Approaches)
  // First 5 waves of group use arc 0, next 4 use arc 4
  if (posInCycle < 5) return 0;
  return 4;
}

function getStageArc(wave) {
  return STAGE_ARCS[getStageArcIndex(wave)];
}

function getArcTintColor(wave) {
  const arc = getStageArc(wave);
  return typeof arc.tintColor === 'function' ? arc.tintColor(wave) : arc.tintColor;
}

function getArcTintAlpha(wave) {
  const arc = getStageArc(wave);
  let alpha = typeof arc.tintAlpha === 'function' ? arc.tintAlpha(wave) : arc.tintAlpha;
  if (wave > 30) {
    const bonus = Math.floor((wave - 31) / 30) * 0.02;
    alpha = Math.min(0.38, alpha + bonus);
  }
  return alpha;
}

// --- Ambient Particle System ---
function initAmbientParticles(wave) {
  const arc = getStageArc(wave);
  const p = arc.particles;
  const tintColor = typeof arc.tintColor === 'function' ? arc.tintColor(wave) : arc.tintColor;
  G.ambientParticles = [];
  for (let i = 0; i < p.count; i++) {
    G.ambientParticles.push(spawnAmbientParticle(p, tintColor, true));
  }
}

function spawnAmbientParticle(pDef, color, randomPos) {
  const edge = Math.floor(Math.random() * 4);
  let x, y;
  if (randomPos) {
    x = Math.random() * W;
    y = Math.random() * H;
  } else {
    // Spawn at a random edge
    if (edge === 0) { x = Math.random() * W; y = -4; }
    else if (edge === 1) { x = Math.random() * W; y = H + 4; }
    else if (edge === 2) { x = -4; y = Math.random() * H; }
    else { x = W + 4; y = Math.random() * H; }
  }
  // Drift direction: mostly random, or forced upward for arc 5
  let angle = Math.random() * Math.PI * 2;
  if (pDef.dirY === -1) angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
  const speed = pDef.speed * (0.6 + Math.random() * 0.8);
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    alpha: pDef.alpha,
    size: pDef.size,
    sizeH: pDef.sizeH || pDef.size,
    shape: pDef.shape,
    color: color,
    pulse: pDef.pulse || 0,
    pulseAmp: pDef.pulseAmp || 0,
    flash: pDef.flash || false,
    flashLife: pDef.flashLife || 0,
    flashTimer: pDef.flash ? Math.random() * (pDef.flashLife || 0.3) : 0,
    scaleOscillate: pDef.scaleOscillate || false,
    age: Math.random() * 10, // randomize phase
  };
}

function updateAmbientParticles(dt) {
  if (G.wave <= 0) return;
  const arc = getStageArc(G.wave);
  const pDef = arc.particles;
  const tintColor = typeof arc.tintColor === 'function' ? arc.tintColor(G.wave) : arc.tintColor;
  for (let i = G.ambientParticles.length - 1; i >= 0; i--) {
    const p = G.ambientParticles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.age += dt;
    if (p.flash) {
      p.flashTimer -= dt;
      if (p.flashTimer <= 0) {
        // Respawn at random position
        p.x = Math.random() * W;
        p.y = Math.random() * H;
        p.flashTimer = p.flashLife;
        p.age = 0;
      }
    }
    // Respawn if off-screen
    if (p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) {
      G.ambientParticles[i] = spawnAmbientParticle(pDef, tintColor, false);
    }
  }
  // Maintain target count
  while (G.ambientParticles.length < pDef.count) {
    G.ambientParticles.push(spawnAmbientParticle(pDef, tintColor, false));
  }
  while (G.ambientParticles.length > pDef.count) {
    G.ambientParticles.pop();
  }
}

function drawAmbientParticles() {
  if (G.ambientParticles.length === 0) return;
  ctx.save();
  const now = performance.now() / 1000;
  for (const p of G.ambientParticles) {
    let a = p.alpha;
    if (p.pulse > 0) {
      a += Math.sin(now * p.pulse) * p.pulseAmp;
    }
    if (p.flash) {
      // Flash: bright at start, fade over lifetime
      a = p.alpha * Math.max(0, p.flashTimer / p.flashLife);
    }
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = p.color;
    let s = p.size;
    if (p.scaleOscillate) {
      s *= 0.8 + 0.4 * Math.sin(p.age * 2);
    }
    if (p.shape === 'rect') {
      ctx.fillRect(p.x - s / 2, p.y - p.sizeH / 2, s, p.sizeH);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// --- Parallax Dot Layer (persistent background depth dots) ---
function initParallaxDots() {
  G.waveTransitionParallaxDots = [];
  const dotCount = 20 + Math.floor(Math.random() * 11); // 20-30
  for (let i = 0; i < dotCount; i++) {
    G.waveTransitionParallaxDots.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 1.5 + Math.random() * 1.5,
      vy: -(3 + Math.random() * 5), // gentle upward drift
    });
  }
}

function updateParallaxDots(dt) {
  if (!G.waveTransitionParallaxDots || G.waveTransitionParallaxDots.length === 0) return;
  for (const dot of G.waveTransitionParallaxDots) {
    dot.y += dot.vy * dt;
    // Wrap around when off-screen
    if (dot.y < -4) { dot.y = H + 2; dot.x = Math.random() * W; }
  }
}

// --- Ambient Background Shapes (slow-moving depth layer, per arc) ---
const AMBIENT_SHAPE_COUNT = 4; // 3-5 range, using 4 as baseline

function initAmbientShapes(wave) {
  const arc = getStageArc(wave);
  const tintColor = typeof arc.tintColor === 'function' ? arc.tintColor(wave) : arc.tintColor;
  G.ambientShapes = [];
  for (let i = 0; i < AMBIENT_SHAPE_COUNT; i++) {
    G.ambientShapes.push(spawnAmbientShape(tintColor));
  }
}

function spawnAmbientShape(color, randomPos) {
  const isCircle = Math.random() > 0.4; // ~60% circles, 40% line segments
  const x = randomPos !== false ? Math.random() * W : (Math.random() < 0.5 ? -60 : W + 60);
  const y = Math.random() * H;
  const angle = Math.random() * Math.PI * 2;
  const speed = 3 + Math.random() * 5; // very slow drift
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    shape: isCircle ? 'circle' : 'line',
    size: isCircle ? (20 + Math.random() * 30) : (30 + Math.random() * 50),
    alpha: 0.03 + Math.random() * 0.04,
    color,
    age: Math.random() * 20,
    fadeSpeed: 0.3 + Math.random() * 0.4,
  };
}

function updateAmbientShapes(dt) {
  if (G.wave <= 0 || G.ambientShapes.length === 0) return;
  const arc = getStageArc(G.wave);
  const tintColor = typeof arc.tintColor === 'function' ? arc.tintColor(G.wave) : arc.tintColor;
  for (let i = G.ambientShapes.length - 1; i >= 0; i--) {
    const s = G.ambientShapes[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.age += dt;
    // Respawn if off-screen with margin
    if (s.x < -80 || s.x > W + 80 || s.y < -80 || s.y > H + 80) {
      G.ambientShapes[i] = spawnAmbientShape(tintColor, false);
    }
  }
  while (G.ambientShapes.length < AMBIENT_SHAPE_COUNT) {
    G.ambientShapes.push(spawnAmbientShape(tintColor, false));
  }
}

function drawAmbientShapes() {
  if (G.ambientShapes.length === 0) return;
  ctx.save();
  for (const s of G.ambientShapes) {
    // Fade in/out with a slow sine cycle
    const fade = 0.5 + 0.5 * Math.sin(s.age * s.fadeSpeed);
    ctx.globalAlpha = s.alpha * fade;
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.color;
    if (s.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x - s.size / 2, s.y);
      ctx.lineTo(s.x + s.size / 2, s.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// --- Arc transition helpers ---
function onArcChange(newWave) {
  const newArcIdx = getStageArcIndex(newWave);
  if (newArcIdx !== G.currentArcIndex) {
    const newArc = STAGE_ARCS[newArcIdx];
    // Snapshot old grids for crossfade
    const oldCtx = gridCanvasOld.getContext('2d');
    oldCtx.clearRect(0, 0, W, H);
    oldCtx.drawImage(gridCanvas, 0, 0);
    const oldBgCtx = bgGridCanvasOld.getContext('2d');
    oldBgCtx.clearRect(0, 0, W, H);
    oldBgCtx.drawImage(bgGridCanvas, 0, 0);
    // Render new grids with new arc color
    renderGridTo(gridCanvas, newArc.gridColor);
    renderBgGridTo(bgGridCanvas, newArc.gridColor);
    G.gridCrossfade = 1.0; // start fully showing old
    G.gridCrossfadeTimer = 0;
    G.currentArcIndex = newArcIdx;
    // Reinit ambient particles and shapes for new arc
    initAmbientParticles(newWave);
    initAmbientShapes(newWave);
  }
}

function updateGridCrossfade(dt, transProgress) {
  // During wave transition scroll, use scroll progress to drive crossfade
  if (G.gridCrossfade > 0) {
    if (transProgress !== undefined) {
      G.gridCrossfade = Math.max(0, 1 - transProgress);
    } else {
      // Fallback: decay over time (for non-scroll transitions)
      G.gridCrossfade = Math.max(0, G.gridCrossfade - dt * 2);
    }
  }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function offsetAllObstacleY(delta) {
  for (const p of G.pillars) p.y += delta;
  for (const b of G.bouncePads) b.y += delta;
  for (const f of G.flatBouncers) f.y += delta;
  for (const h of G.hazardZones) { h.y += delta; h.cy += delta; }
}

function initWaveTransition(breakDuration) {
  G.waveTransitionInitialBreak = breakDuration;
  G.waveTransitionOffset = 0;
  // Wave announce text state for scroll transition
  const nextWave = G.wave + 1;
  G.waveTransitionAnnounce = { wave: nextWave, timer: 0, duration: Math.min(breakDuration, 2.0) };
  // Regenerate parallax dots with fresh positions for the scroll
  initParallaxDots();
  // Trigger arc change for grid crossfade and ambient particles
  onArcChange(nextWave);

  // Swap obstacles early and position above screen for slide-in effect
  const transDur = getWaveTransitionDuration(breakDuration);
  if (transDur > 0) {
    updateArenaModifiersForWave(nextWave);
    offsetAllObstacleY(-H); // start above screen, slide in during scroll
    G.waveTransitionSlideIn = true;
  } else {
    G.waveTransitionSlideIn = false;
  }

  // Init lore snippet (skip for very short breaks like boss intro)
  if (breakDuration >= 1.0) {
    initLoreSnippet(nextWave);
    // Show endless entry message on first post-W30 wave
    if (nextWave === 31 && G.isEndlessRun) {
      showEndlessEntryMessage();
    }
  } else {
    G.loreSnippet = null;
  }

  // Platform SDK: request ad break during wave transition
  platformSDK.adBreak();
}

function getWaveTransitionScrollDist(wave) {
  // Full-screen scroll for all waves
  return H;
}

function getWaveTransitionDuration(initialBreak) {
  const isBoss = G.wave === 9 || G.wave === 19 || G.wave === 29; // next wave is boss
  const maxDur = isBoss ? 2.5 : 1.8;
  return Math.min(initialBreak - 0.3, maxDur);
}

// --- Wire up events for combat text ---
events.on('enemyKilled', (data) => {
  G.runKills++;
  // Apply score multiplier from Point Frenzy boost
  const scoreMul = getScoreMultiplier();
  const displayPts = data.points * scoreMul;
  if (scoreMul > 1) G.score += data.points * (scoreMul - 1); // extra score from multiplier
  if (data.combo >= 2) {
    spawnCombatText('+' + displayPts + ' x' + data.combo, data.x || 0, data.y || 0,
      { size: 20, color: '#ffdd44', bold: true });
  } else {
    spawnCombatText('+' + displayPts, data.x || 0, data.y || 0,
      { size: 18, color: scoreMul > 1 ? '#ff44ff' : '#ffffff', bold: true });
  }
  // Physical shard drop
  rollEnemyShardDrop(data.type, data.x || 0, data.y || 0);
  // Power gem drop from elite enemies (spawner, sniper): 8%
  if ((data.type === 'spawner' || data.type === 'sniper') && Math.random() < 0.08) {
    spawnPowerGem(data.x || 0, data.y || 0, { common: 60, rare: 30, epic: 10 });
  }
  // Boost pickup spawn roll
  boostOnEnemyKilled(data.x || 0, data.y || 0);
});

events.on('waveCleared', () => {
  G.runWaves = G.wave;
});

// Bomber explosion damages player
events.on('bomberExplosion', (data) => {
  damagePlayer(data.x, data.y);
});

// Sniper beam damages player
events.on('sniperBeamHit', (data) => {
  damagePlayer(data.x, data.y);
});

// Hazard zone damage
events.on('hazardZoneDamage', (data) => {
  damagePlayer(data.x, data.y);
});

// Victory (Void Warden defeated)
events.on('victory', () => {
  transitionToRunSummary();
});

// --- Wire up audio events ---
events.on('enemyKilled', (data) => {
  if (data.combo >= 2) {
    sfxComboKill(data.combo);
  } else {
    sfxEnemyKill(data.type);
  }
});

events.on('playerDamaged', () => {
  sfxDamageTaken();
});

events.on('gameOver', () => {
  sfxGameOver();
  stopMusic();
});

events.on('waveCleared', () => {
  sfxWaveClear();
});

events.on('waveStarted', (data) => {
  // Increase music intensity with wave
  setMusicIntensity(Math.min(1, data.wave / 25), data.wave);
});

events.on('powerUpCollected', () => {
  sfxShardCollect();
});

// --- Platform SDK analytics hooks ---
events.on('waveStarted', (data) => {
  platformSDK.gameplayStart();
  platformSDK.event('waveReached', { wave: data.wave });
});

events.on('enemyKilled', (data) => {
  platformSDK.event('score', { score: G.score, points: data.points, combo: data.combo });
});

events.on('gameOver', (data) => {
  platformSDK.gameplayStop();
  platformSDK.event('death', { score: data.score, wave: data.wave });
});

events.on('waveCleared', (data) => {
  platformSDK.gameplayStop();
  platformSDK.event('waveCleared', { wave: data.wave, bonus: data.bonus });
});

events.on('victory', () => {
  platformSDK.gameplayStop();
  platformSDK.event('victory', { score: G.score, wave: G.wave });
});

// --- Collision Detection ---
function checkCollisions() {
  const player = G.player;
  const pSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
  const surgeCanKill = player.surgeActive && pSpeed >= SURGE_ACTIVE_SPEED_THRESHOLD &&
    (player.surgeKillsRemaining === -1 || player.surgeKillsRemaining > 0);
  const canKill = player.dashGraceTimer > 0 || player.overdriveTimer > 0 || isInvincibleFromBoost() || surgeCanKill;
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (!e.alive || e.spawnTimer > 0 || e.isFusing) continue;
    const d = dist(player, e);
    if (d < player.r + e.r) {
      if (canKill) {
        if (e.isBoss) {
          // Boss takes hits, not instant kills
          hitBoss(e);
        } else {
          // Try to hit (handles shield + multi-HP)
          const canDie = hitEnemy(e, 'player');
          if (canDie) {
            killEnemy(e, i, 'player');
            // Surge decay: decrement kills remaining
            if (surgeCanKill && player.surgeKillsRemaining > 0) {
              player.surgeKillsRemaining--;
            }
          }
        }
      } else if (player.dashRecoveryTimer > 0) {
        // Recovery phase: knockback only, no damage, no kill
        const pdx = player.x - e.x;
        const pdy = player.y - e.y;
        const pushDist = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
        player.vx = (pdx / pushDist) * 400;
        player.vy = (pdy / pushDist) * 400;
        // Separate overlapping bodies
        const overlap = (player.r + e.r) - pushDist;
        if (overlap > 0) {
          player.x += (pdx / pushDist) * overlap;
          player.y += (pdy / pushDist) * overlap;
        }
      } else {
        // Push enemy away from player on passive collision
        const pdx = e.x - player.x;
        const pdy = e.y - player.y;
        const pushDist = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
        const pushForce = 200;
        e.vx = (pdx / pushDist) * pushForce;
        e.vy = (pdy / pushDist) * pushForce;
        // Separate overlapping bodies
        const overlap = (player.r + e.r) - pushDist;
        if (overlap > 0) {
          e.x += (pdx / pushDist) * overlap;
          e.y += (pdy / pushDist) * overlap;
        }
        damagePlayer(e.x, e.y);
      }
    }
  }
  // Check mirror copy collisions
  checkMirrorCopyCollisions(player);
}

function checkShockwaveCollisions() {
  const player = G.player;
  for (const s of G.shockwaves) {
    if (G.state !== STATE.GAME_OVER && player.invTimer <= 0 && player.overdriveTimer <= 0 && !isInvincibleFromBoost()) {
      const d = dist(player, s);
      if (Math.abs(d - s.r) < s.thickness / 2 + player.r) damagePlayer(s.x, s.y);
    }
  }
}

// --- Shell Guard collision check ---
function checkShellGuardCollisions() {
  const player = G.player;
  if (!player.shellGuardOrbs || player.shellGuardOrbs.length === 0) return;

  const power = player.powers.find(p => p.id === 'shellGuard' || p.id === 'novaCore');
  if (!power) return;

  const orbitRadius = power.id === 'novaCore' ? 60 : (power.level === 1 ? 50 : power.level === 2 ? 55 : 60);

  for (const orb of player.shellGuardOrbs) {
    if (!orb.alive || orb.killCooldown > 0) continue;

    const orbX = player.x + Math.cos(orb.angle) * orbitRadius;
    const orbY = player.y + Math.sin(orb.angle) * orbitRadius;

    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      if (!e.alive || e.spawnTimer > 0) continue;
      const d = dist({ x: orbX, y: orbY }, e);
      if (d < 8 + e.r) {
        if (e.isBoss) {
          // Boss takes 1 hit from orb, not instakill
          hitBoss(e);
        } else {
          killEnemy(e, i);
        }
        orb.alive = false;
        orb.respawnTimer = power.id === 'novaCore' ? 4.0 :
          (POWER_DEFS.shellGuard.levels[power.level - 1].respawnTime || 3.0);
        break;
      }
    }

  }
}

function transitionToPowerSelect() {
  const offering = generateOffering(G.wave, G.meta);
  if (G.pendingEvolution) {
    offering.push(createEvolutionCard(G.pendingEvolution));
    events.emit('evolutionOffered', { recipeId: G.pendingEvolution.id });
    G.pendingEvolution = null;
  }
  // Skip power select if no cards to offer (all powers maxed)
  if (offering.length === 0) {
    const breakDur = G.isHardcore ? 1.0 : getWaveBreakDuration(G.wave);
    G.state = STATE.WAVE_BREAK;
    G.waveBreakTimer = breakDur;
    setMusicState('wave_break');
    initWaveTransition(breakDur);
    return;
  }
  // Emit glossary tracking for offered powers
  for (const card of offering) {
    if (card.isEvolution) continue; // already emitted above
    events.emit('powerOffered', { powerId: card.powerId });
  }
  G.state = STATE.POWER_SELECT;
  setMusicState('power_select');
  G.cardOffering = offering;
  G.cardHover = -1;
  G.cardPickAnim = null;
  G.collectFlashTimer = 0;
  G.collectFlashAlpha = 0;
}

// --- Main Update ---
function update(dt) {
  if (G.state === STATE.GAME_OVER) {
    if (G.freezeTimer > 0) { G.freezeTimer -= dt; return; }
    G.gameOverFadeIn = Math.min(1, G.gameOverFadeIn + dt * 2);
    G.gameOverTimer += dt;
    return;
  }

  if (G.state === STATE.RUN_SUMMARY) {
    G.runSummaryTimer += dt;
    if (G.runSummary && G.runSummaryShardCounter < G.runSummary.total) {
      G.runSummaryShardCounter = Math.min(G.runSummary.total,
        G.runSummaryShardCounter + (G.runSummary.total / 1.5) * dt);
    }
    if (G.runSummary && G.runSummaryScoreCounter < G.runSummary.score) {
      G.runSummaryScoreCounter = Math.min(G.runSummary.score,
        G.runSummaryScoreCounter + (G.runSummary.score / 1.5) * dt);
    }
    // Update victory particles
    for (let i = G.summaryParticles.length - 1; i >= 0; i--) {
      const p = G.summaryParticles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt; // slight gravity
      p.life -= dt;
      const t = Math.max(0, p.life / p.maxLife);
      p.alpha = t;
      p.r = p.initR * t;
      if (p.life <= 0) G.summaryParticles.splice(i, 1);
    }
    if (G.runSummaryTimer > 2.0) G.runSummaryReady = true;
    return;
  }

  if (G.state === STATE.TITLE) { updateTitleBackground(dt); return; }
  if (G.state === STATE.MODE_SELECT) return;
  if (G.state === STATE.PAUSED) return;
  if (G.state === STATE.TUTORIAL) return;
  if (G.state === STATE.UPGRADES) return;
  if (G.state === STATE.LOADOUT) return;
  if (G.state === STATE.GLOSSARY) return;
  if (G.state === STATE.SETTINGS) return;

  if (G.state === STATE.POWER_SELECT) {
    // Animate card pick
    if (G.cardPickAnim) {
      G.cardPickAnim.t += dt;
      if (G.cardPickAnim.t >= 0.4) {
        // Apply the pick
        const card = G.cardOffering[G.cardPickAnim.index];
        applyPowerPick(card);
        if (card.isEvolution) {
          sfxEvolutionUnlock();
          G.freezeTimer = 0.2; // hitstop on evolution
        }
        G.previousOffering = G.cardOffering.filter(c => !c.isEvolution).map(c => c.powerId);
        G.cardPickAnim = null;
        G.cardOffering = [];
        G.cardHover = -1;

        // Check if there's a pending evolution for next wave
        G.pendingEvolution = checkEvolutionAvailable();

        // Resume wave break
        const breakDur2 = G.isHardcore ? 1.0 : getWaveBreakDuration(G.wave);
        G.state = STATE.WAVE_BREAK;
        setMusicState('wave_break');
        G.waveBreakTimer = breakDur2;
        initWaveTransition(breakDur2);
      }
    }
    return;
  }

  if (G.freezeTimer > 0) { G.freezeTimer -= dt; return; }

  const comboTimer = G.meta.unlocks.includes(14) ? 2.5 : 1.5;
  if (G.comboTimer > 0) { G.comboTimer -= dt; if (G.comboTimer <= 0) { G.combo = 0; G.comboTimer = 0; } }

  if (G.shakeTimer > 0) {
    G.shakeTimer -= dt;
    const shakeDuration = G.shakeDuration || 0.2;
    const t = Math.max(0, G.shakeTimer / shakeDuration); // 1 -> 0 decay
    const intensity = (G.shakeIntensity || 6) * t;
    G.shakeX = rand(-intensity, intensity);
    G.shakeY = rand(-intensity, intensity);
    if (G.shakeTimer <= 0) { G.shakeX = 0; G.shakeY = 0; }
  }

  G.vignetteAlpha = G.player.hp === 1 ? 0.10 + 0.05 * Math.sin(Date.now() / 1000 * Math.PI * 2) : 0;
  if (G.collectFlashTimer > 0) { G.collectFlashTimer -= dt; G.collectFlashAlpha = Math.max(0, G.collectFlashAlpha * (G.collectFlashTimer / 0.1)); }
  if (G.waveClearFlashTimer > 0) G.waveClearFlashTimer -= dt;
  if (G.waveStartFlash > 0) G.waveStartFlash -= dt;
  if (G.shardHudPulse > 0) G.shardHudPulse -= dt;

  // Boss intro card state
  if (G.state === STATE.BOSS_INTRO_CARD) {
    updateBossIntro(dt);
    updateParticles(dt); updateFloatTexts(dt); updateCombatTexts(dt);
    updateToasts(dt);
    return;
  }

  // Boss ready screen (wait for player input)
  if (G.state === STATE.BOSS_READY) {
    updateBossReady(dt);
    updateParticles(dt); updateFloatTexts(dt); updateCombatTexts(dt);
    updateToasts(dt);
    return;
  }

  // Boss tutorial overlay (first encounter)
  if (G.state === STATE.BOSS_TUTORIAL) {
    updateBossTutorial(dt);
    return;
  }

  if (G.state === STATE.WAVE_BREAK) {
    // Lazy init transition if not yet initialized (e.g. from resetGameState)
    // Skip if this is a pre-card-select pause (no visual transition needed)
    if (G.waveTransitionInitialBreak === 0 && G.waveBreakTimer > 0 && !G.pendingPowerSelect) {
      initWaveTransition(G.waveBreakTimer);
    }

    // Break timer countdown
    G.waveBreakTimer -= dt;

    // Compute wave transition scroll offset
    if (G.waveTransitionInitialBreak > 0) {
      const initialBreak = G.waveTransitionInitialBreak;
      const transDur = getWaveTransitionDuration(initialBreak);
      const elapsed = initialBreak - G.waveBreakTimer;
      if (transDur > 0 && elapsed <= transDur) {
        const rawProgress = Math.min(1, elapsed / transDur);
        const eased = easeInOutCubic(rawProgress);
        const scrollDist = getWaveTransitionScrollDist(G.wave + 1);
        G.waveTransitionOffset = eased * scrollDist;
        // Drive grid crossfade with scroll progress
        updateGridCrossfade(dt, rawProgress);
      }
    }

    // Update wave announce timer during scroll
    if (G.waveTransitionAnnounce) G.waveTransitionAnnounce.timer += dt;

    // Update lore snippet and endless entry message timing
    updateLoreSnippet(dt);
    updateEndlessEntryMessage(dt);
    updateAmbientParticles(dt);
    updateAmbientShapes(dt);
    updateParallaxDots(dt);

    if (G.waveBreakTimer <= 0) {
      // Pre-card-select pause: show powerup cards now
      if (G.pendingPowerSelect) {
        G.pendingPowerSelect = false;
        transitionToPowerSelect();
        return;
      }

      G.waveTransitionOffset = 0;
      G.waveTransitionInitialBreak = 0;
      G.waveTransitionAnnounce = null;
      // Brief white screen flash when scroll completes and new wave starts
      G.waveStartFlash = 0.1;
      G.loreSnippet = null;
      applyWaveStartPowers();
      resetWaveCounters();

      // Clear any remaining pickups — they don't carry forward between waves
      G.powerUps = [];
      G.boostPickups = [];
      G.shardPickups = [];

      // Finalize arena modifiers and proceed to next wave/boss
      const nextWave = G.wave + 1;
      const obstaclesAlreadyPlaced = G.waveTransitionSlideIn;
      if (obstaclesAlreadyPlaced) {
        // Obstacles were placed early and offset — fix positions to target
        offsetAllObstacleY(H);
        G.waveTransitionSlideIn = false;
      }
      if (isBossWave(nextWave) && (nextWave <= 30 || G.isEndlessRun)) {
        G.wave++;
        if (!obstaclesAlreadyPlaced) updateArenaModifiersForWave(G.wave);
        startBossIntro(G.wave);
        return;
      }
      if (!obstaclesAlreadyPlaced) updateArenaModifiersForWave(nextWave);
      startNextWave();
    }

    updateDashCharge(dt); updatePlayer(dt); updateEnemies(dt); updateParticles(dt);
    updatePowerUps(dt); updateBoostPickups(dt); updateShardPickups(dt);
    updateDashPreview();
    { const p = G.player; setPlayerActivity(Math.sqrt(p.vx*p.vx+p.vy*p.vy)/400, p.hp/p.maxHp); }
    updateFloatTexts(dt); updateShockwaves(dt); updateAfterimages(dt);

    // Spawn physics-style afterimage trail during wave transition scroll
    // Afterimages placed at player's effective world-Y so they trail below the viewport-fixed player
    if (G.waveTransitionOffset > 0 && G.player) {
      const trailColor = G.player.surgeActive ? '#ff4444' :
        (G.player.overdriveTimer > 0 ? '#ff0000' : '#00ffff');
      G.afterimages.push({
        x: G.player.x, y: G.player.y - G.waveTransitionOffset,
        r: G.player.r, alpha: 0.5, life: 0.15, color: trailColor, maxAlpha: 0.5
      });
    }
    updateWallFlashes(dt); updateCollectRings(dt); updateMultiPopExplosions(dt);
    updateTapBounceRipples(dt); updateCombatTexts(dt);
    updateToasts(dt);
    return;
  }

  G.elapsedTime += dt;

  // Boss clear pause (after defeating a boss)
  if (G.bossClearPause > 0) {
    const done = updateBossClearPause(dt);
    if (done && G.state === STATE.POWER_SELECT) {
      const offering = generateOffering(G.wave, G.meta);
      if (G.pendingEvolution) {
        offering.push(createEvolutionCard(G.pendingEvolution));
        events.emit('evolutionOffered', { recipeId: G.pendingEvolution.id });
        G.pendingEvolution = null;
      }
      // Emit glossary tracking for offered powers
      for (const card of offering) {
        if (!card.isEvolution) events.emit('powerOffered', { powerId: card.powerId });
      }
      // Skip power select if no cards to offer (all powers maxed)
      if (offering.length === 0) {
        const breakDur3 = G.isHardcore ? 1.0 : getWaveBreakDuration(G.wave);
        G.state = STATE.WAVE_BREAK;
        G.waveBreakTimer = breakDur3;
        initWaveTransition(breakDur3);
      } else {
        G.cardOffering = offering;
        G.cardHover = -1;
        G.cardPickAnim = null;
        G.collectFlashTimer = 0;
        G.collectFlashAlpha = 0;
      }
    }
    updateParticles(dt); updateFloatTexts(dt); updateShockwaves(dt);
    updateAfterimages(dt); updateCombatTexts(dt);
    return;
  }

  // Boss fight update
  if (G.state === STATE.BOSS_FIGHT) {
    updateBoss(dt);
    // Boss is defeated — check handled inside updateBoss/hitBoss
  }

  // Normal wave spawning (not during boss fights)
  if (G.state === STATE.PLAYING) {
    G.waveTimer += dt;
    if (!window.__DEBUG_PAUSE_SPAWNS) updateBurstSpawning(dt, (type) => spawnEnemy(type));
  }

  // Overdrive timer
  if (G.player.overdriveTimer > 0) {
    G.player.overdriveTimer -= dt;
  }

  // Shell Guard orb rotation, cooldown, and respawn
  if (G.player.shellGuardOrbs) {
    const orbSpeed = Math.PI; // 1 rev per 2s
    for (const orb of G.player.shellGuardOrbs) {
      orb.angle += orbSpeed * dt;
      if (orb.killCooldown > 0) orb.killCooldown -= dt;
      if (!orb.alive && orb.respawnTimer > 0) {
        orb.respawnTimer -= dt;
        if (orb.respawnTimer <= 0) {
          const power = G.player.powers.find(p => p.id === 'shellGuard' || p.id === 'novaCore');
          if (power) {
            const canRespawn = power.id === 'novaCore' || (power.id === 'shellGuard' && POWER_DEFS.shellGuard.levels[power.level - 1].respawn);
            if (canRespawn) {
              orb.alive = true;
              orb.killCooldown = 0.3;
            }
          }
        }
      }
    }
  }

  // Shield passive charge regeneration
  const shieldPower = G.player.powers.find(p => p.id === 'shield');
  if (shieldPower) {
    const shieldVals = POWER_DEFS.shield.levels[shieldPower.level - 1];
    if (G.player.shieldCharges < shieldVals.charges) {
      G.player.shieldRegenTimer = (G.player.shieldRegenTimer || 0) + dt;
      if (G.player.shieldRegenTimer >= shieldVals.regenTime) {
        G.player.shieldCharges++;
        G.player.shieldRegenTimer = 0;
        spawnParticles(G.player.x, G.player.y, '#4488ff', 4);
        spawnCombatText('SHIELD+', G.player.x, G.player.y - 30, { size: 14, color: '#44ddff' });
      }
    } else {
      G.player.shieldRegenTimer = 0;
    }
  }

  // Wave clear check (only for PLAYING state, not boss fights)
  // Queue must also be empty for wave to clear
  if (G.state === STATE.PLAYING && G.waveEnemiesLeft <= 0 &&
      (!G.spawnQueue || G.spawnQueue.length === 0) &&
      G.enemies.every(e => !e.alive || e.isFusing)) {
    G.waveClearFlashTimer = 1.0;
    clearBoostsOnWaveEnd();
    const bonus = 500 * G.wave;
    G.score += bonus;
    spawnCombatText('+' + bonus + ' CLEAR!', W / 2, H / 2 - 40, { size: 24, color: '#00ccff', bold: true, life: 1.2, hold: true });
    events.emit('waveCleared', { wave: G.wave, bonus });

    if (G.player.hp < G.player.maxHp) {
      G.player.hp++;
      spawnCombatText('+1 HP', G.player.x, G.player.y - 30, { size: 16, color: '#44ff44', bold: true });
    }

    // Check if next wave is a boss wave → go to boss intro
    const nextWave = G.wave + 1;
    if (isBossWave(nextWave)) {
      if (nextWave <= 30 || G.isEndlessRun) {
        // Brief pause then boss intro — too short for full transition
        G.state = STATE.WAVE_BREAK;
        setMusicState('wave_break');
        G.waveBreakTimer = 0.3;
        initWaveTransition(0.3);
        // Power select will happen after boss defeat instead
      } else {
        // No endless mode — brief pause then power select
        G.pendingPowerSelect = true;
        G.state = STATE.WAVE_BREAK;
        setMusicState('wave_break');
        G.waveBreakTimer = 1.5;
      }
    } else {
      // Brief pause before showing powerup cards
      G.pendingPowerSelect = true;
      G.state = STATE.WAVE_BREAK;
      setMusicState('wave_break');
      G.waveBreakTimer = 1.5;
    }
  }

  // Boss fight wave clear check — safety net for boss killed outside defeatBoss
  if (G.state === STATE.BOSS_FIGHT && G.boss && !G.boss.alive && G.bossClearPause <= 0) {
    defeatBoss(G.boss);
  }

  updateDashCharge(dt); updatePlayer(dt); updateEnemies(dt); updatePowerUps(dt); updateParticles(dt);
  { const p = G.player; setPlayerActivity(Math.sqrt(p.vx*p.vx+p.vy*p.vy)/400, p.hp/p.maxHp); }
  updateFloatTexts(dt); updateShockwaves(dt); updateAfterimages(dt);
  updateWallFlashes(dt); updateCollectRings(dt); updateMultiPopExplosions(dt);
  updateTapBounceRipples(dt); updateCombatTexts(dt);
  updateArenaModifiers(dt);
  updateBoostPickups(dt); updateActiveBoost(dt); updateShardPickups(dt);
  updateDashPreview();
  updateAmbientParticles(dt);
  updateAmbientShapes(dt);
  // Init parallax dots if not yet created (e.g. after resetGameState)
  if (!G.waveTransitionParallaxDots || G.waveTransitionParallaxDots.length === 0) initParallaxDots();
  updateParallaxDots(dt);
  updateToasts(dt);
  checkShockwaveCollisions();
  checkShellGuardCollisions();
  checkCollisions();
}

// --- Title Screen ---
function drawTitleScreen() {
  ctx.save();
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.3;
  ctx.drawImage(gridCanvas, 0, 0);
  ctx.globalAlpha = 1;

  drawTitleBackground();

  const titleGrad = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, 300);
  titleGrad.addColorStop(0, 'rgba(0, 255, 255, 0.08)');
  titleGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = titleGrad;
  ctx.fillRect(0, 0, W, H);

  const titlePulse = 14 + 6 * Math.sin(Date.now() / 800 * Math.PI);
  drawGlowText('BOUNCE BLITZ', W / 2, H * 0.28, 'bold 64px ' + FONT, '#ffffff', '#00ffff', titlePulse);

  if (G.highScore > 0) {
    drawGlowText('HIGH SCORE: ' + formatScore(G.highScore), W / 2, H * 0.42, 'bold 22px ' + FONT, '#ffdd00', '#ffaa00', 6);
  }

  // Shard count with shimmer glow
  if (G.meta.shards > 0) {
    const shardText = '✦ ' + G.meta.shards + (G.meta.shards === 1 ? ' Shard' : ' Shards');
    const shimmerT = Date.now() / 1200;
    const shimmerGlow = 4 + 8 * (0.5 + 0.5 * Math.sin(shimmerT * Math.PI * 2));
    const shimmerAlpha = 0.6 + 0.4 * Math.sin(shimmerT * Math.PI * 2 + 1);
    ctx.save();
    ctx.font = 'bold 16px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = `rgba(255, 200, 50, ${shimmerAlpha})`;
    ctx.shadowBlur = shimmerGlow;
    ctx.fillStyle = '#ffdd44';
    ctx.fillText(shardText, W / 2, H * 0.48);
    ctx.shadowBlur = 0;
    ctx.fillText(shardText, W / 2, H * 0.48);
    ctx.restore();
  }

  const startPulse = 0.4 + 0.6 * Math.sin(Date.now() / 600 * Math.PI);
  ctx.save();
  ctx.globalAlpha = startPulse;
  ctx.font = '18px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#cccccc';
  ctx.fillText('Click or Press Any Key to Play', W / 2, H * 0.56);
  ctx.restore();

  // Continue Run prompt
  if (hasSavedRun()) {
    const contPulse = 0.6 + 0.4 * Math.sin(Date.now() / 500 * Math.PI);
    ctx.save();
    ctx.globalAlpha = contPulse;
    ctx.font = 'bold 16px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00ffcc';
    ctx.fillText('Press C to Continue Run', W / 2, H * 0.62);
    ctx.restore();
  }

  ctx.save();
  ctx.font = '14px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#555555';
  ctx.fillText('WASD to move · Space to bounce · P to pause', W / 2, H * 0.68);
  ctx.fillText('U — Upgrades · L — Loadout · G — Glossary · S — Settings', W / 2, H * 0.74);
  ctx.restore();

  // Selected loadout
  const loadout = LOADOUTS.find(l => l.id === G.meta.selectedLoadout) || LOADOUTS[0];
  ctx.save();
  ctx.font = '13px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#448888';
  ctx.fillText('Loadout: ' + loadout.name, W / 2, H * 0.80);
  ctx.restore();

  ctx.restore();
}

// --- Settings Screen ---
function drawSettingsScreen() {
  ctx.save();
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.3;
  ctx.drawImage(gridCanvas, 0, 0);
  ctx.globalAlpha = 1;

  // Title
  drawGlowText('SETTINGS', W / 2, 80, 'bold 36px ' + FONT, '#ffffff', '#00ffff', 10);

  // Layout
  const sliderW = 300, sliderH = 12, knobR = 10;
  const labelX = W / 2 - sliderW / 2;
  const sliderX = labelX;
  const startY = 180;
  const rowH = 90;
  const cursor = G._settingsCursor;

  const musicVol = getMusicVolume();
  const sfxVol = getSfxVolume();
  const muted = isMuted();

  // Store slider rects for click detection
  G._settingsSliderRects = [];

  // --- Music Volume ---
  const musicY = startY;
  const musicSelected = cursor === 0;
  ctx.save();
  ctx.font = 'bold 16px ' + FONT;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = musicSelected ? '#00ffff' : '#aaaacc';
  ctx.fillText('Music Volume', sliderX, musicY);
  ctx.font = '14px ' + FONT;
  ctx.textAlign = 'right';
  ctx.fillText(Math.round(musicVol * 100) + '%', sliderX + sliderW, musicY);
  ctx.restore();
  // Track
  const musicTrackY = musicY + 30;
  ctx.save();
  ctx.fillStyle = '#222233';
  ctx.beginPath();
  ctx.roundRect(sliderX, musicTrackY - sliderH / 2, sliderW, sliderH, sliderH / 2);
  ctx.fill();
  // Fill
  const musicFillW = musicVol * sliderW;
  ctx.fillStyle = musicSelected ? '#00dddd' : '#007788';
  ctx.beginPath();
  ctx.roundRect(sliderX, musicTrackY - sliderH / 2, musicFillW, sliderH, sliderH / 2);
  ctx.fill();
  // Knob
  const musicKnobX = sliderX + musicFillW;
  if (musicSelected) {
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 12;
  }
  ctx.fillStyle = musicSelected ? '#00ffff' : '#aaaacc';
  ctx.beginPath();
  ctx.arc(musicKnobX, musicTrackY, knobR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
  G._settingsSliderRects.push({ x: sliderX, y: musicTrackY - 16, w: sliderW, h: 32 });

  // --- SFX Volume ---
  const sfxY = startY + rowH;
  const sfxSelected = cursor === 1;
  ctx.save();
  ctx.font = 'bold 16px ' + FONT;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = sfxSelected ? '#00ffff' : '#aaaacc';
  ctx.fillText('SFX Volume', sliderX, sfxY);
  ctx.font = '14px ' + FONT;
  ctx.textAlign = 'right';
  ctx.fillText(Math.round(sfxVol * 100) + '%', sliderX + sliderW, sfxY);
  ctx.restore();
  // Track
  const sfxTrackY = sfxY + 30;
  ctx.save();
  ctx.fillStyle = '#222233';
  ctx.beginPath();
  ctx.roundRect(sliderX, sfxTrackY - sliderH / 2, sliderW, sliderH, sliderH / 2);
  ctx.fill();
  // Fill
  const sfxFillW = sfxVol * sliderW;
  ctx.fillStyle = sfxSelected ? '#00dddd' : '#007788';
  ctx.beginPath();
  ctx.roundRect(sliderX, sfxTrackY - sliderH / 2, sfxFillW, sliderH, sliderH / 2);
  ctx.fill();
  // Knob
  const sfxKnobX = sliderX + sfxFillW;
  if (sfxSelected) {
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 12;
  }
  ctx.fillStyle = sfxSelected ? '#00ffff' : '#aaaacc';
  ctx.beginPath();
  ctx.arc(sfxKnobX, sfxTrackY, knobR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
  G._settingsSliderRects.push({ x: sliderX, y: sfxTrackY - 16, w: sliderW, h: 32 });

  // --- Mute Toggle ---
  const muteY = startY + rowH * 2 + 10;
  const muteSelected = cursor === 2;
  const muteBtnW = 200, muteBtnH = 40;
  const muteBtnX = W / 2 - muteBtnW / 2;
  const muteHover = muteSelected || G._settingsHoverMute;
  ctx.save();
  if (muteHover) {
    ctx.shadowColor = muted ? '#ff4466' : '#00ffaa';
    ctx.shadowBlur = 14;
  }
  ctx.fillStyle = muted
    ? (muteHover ? '#4f1f1f' : '#3a1a1a')
    : (muteHover ? '#1f4f35' : '#1a3a2a');
  ctx.beginPath();
  ctx.roundRect(muteBtnX, muteY, muteBtnW, muteBtnH, 6);
  ctx.fill();
  ctx.strokeStyle = muted
    ? (muteHover ? '#ff6688' : '#ff4466')
    : (muteHover ? '#44ffcc' : '#00ffaa');
  ctx.lineWidth = muteHover ? 3 : 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = 'bold 16px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = muted
    ? (muteHover ? '#ff6688' : '#ff4466')
    : (muteHover ? '#44ffcc' : '#00ffaa');
  ctx.fillText(muted ? 'Unmute (M)' : 'Mute (M)', muteBtnX + muteBtnW / 2, muteY + muteBtnH / 2);
  ctx.restore();
  G._settingsMuteBtnRect = { x: muteBtnX, y: muteY, w: muteBtnW, h: muteBtnH };

  // --- Back Button ---
  const backY = muteY + muteBtnH + 40;
  const backBtnW = 160, backBtnH = 40;
  const backBtnX = W / 2 - backBtnW / 2;
  const backHover = G._settingsHoverBack;
  ctx.save();
  if (backHover) {
    ctx.shadowColor = '#aaaaff';
    ctx.shadowBlur = 14;
  }
  ctx.fillStyle = backHover ? '#2a2a44' : '#1a1a2e';
  ctx.beginPath();
  ctx.roundRect(backBtnX, backY, backBtnW, backBtnH, 6);
  ctx.fill();
  ctx.strokeStyle = backHover ? '#aaaaff' : '#6666aa';
  ctx.lineWidth = backHover ? 3 : 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = 'bold 16px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = backHover ? '#aaaaff' : '#6666aa';
  ctx.fillText('Back (Esc)', backBtnX + backBtnW / 2, backY + backBtnH / 2);
  ctx.restore();
  G._settingsBackBtnRect = { x: backBtnX, y: backY, w: backBtnW, h: backBtnH };

  // Hint text
  ctx.save();
  ctx.font = '13px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#444466';
  ctx.fillText('W/S or Up/Down to select · A/D or Left/Right to adjust', W / 2, H - 50);
  ctx.restore();

  ctx.restore();
}

// --- Mode Selection Screen ---
function drawModeSelectScreen() {
  ctx.save();
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.3;
  ctx.drawImage(gridCanvas, 0, 0);
  ctx.globalAlpha = 1;

  // Title
  drawGlowText('SELECT MODE', W / 2, 120, 'bold 36px ' + FONT, '#ffffff', '#aaaaff', 10);

  // Card dimensions
  const cardW = 260, cardH = 280;
  const storyX = 260, endlessX = 540;
  const cardY = 320;
  const cursor = G.modeSelectCursor;

  // Draw each card
  for (let i = 0; i < 2; i++) {
    const cx = i === 0 ? storyX : endlessX;
    const isHovered = cursor === i;
    const color = i === 0 ? '#00ffcc' : '#ffdd44';
    const label = i === 0 ? 'STORY' : 'ENDLESS';
    const desc = i === 0 ? 'Waves 1–30\nBoss battles\nComplete the game' : 'Infinite waves\nEscalating difficulty\nHow far can you go?';

    ctx.save();
    const drawX = cx - cardW / 2;
    const drawY = cardY - cardH / 2;

    if (isHovered) {
      const scale = 1.03;
      ctx.translate(cx, cardY);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cardY);
    }

    // Card background
    ctx.fillStyle = 'rgba(20, 20, 40, 0.9)';
    ctx.beginPath();
    ctx.roundRect(drawX, drawY, cardW, cardH, 8);
    ctx.fill();

    // Card border
    ctx.strokeStyle = isHovered ? '#ffffff' : color;
    ctx.lineWidth = isHovered ? 3 : 2;
    if (isHovered) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
    }
    ctx.beginPath();
    ctx.roundRect(drawX, drawY, cardW, cardH, 8);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Hover bg fill
    if (isHovered) {
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(drawX, drawY, cardW, cardH, 8);
      ctx.fill();
      ctx.restore();
    }

    // Mode icon (large circle)
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(cx, cardY - 60, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Mode label
    ctx.font = 'bold 28px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.fillText(label, cx, cardY + 10);
    ctx.shadowBlur = 0;

    // Description
    ctx.font = '14px ' + FONT;
    ctx.fillStyle = '#888899';
    const lines = desc.split('\n');
    for (let li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], cx, cardY + 50 + li * 20);
    }

    ctx.restore();
  }

  // Input hints
  ctx.save();
  ctx.font = '14px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#444444';
  ctx.fillText('A/D or ←→ to select · Enter to confirm · ESC to go back', W / 2, H - 40);
  ctx.restore();

  ctx.restore();
}

// --- Run Summary Screen ---
function drawRunSummary() {
  ctx.save();
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, W, H);
  const s = G.runSummary;
  if (s && s.isHardcore) {
    ctx.fillStyle = 'rgba(100, 10, 10, 0.3)';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 0.3;
  ctx.drawImage(gridCanvas, 0, 0);
  ctx.globalAlpha = 1;

  if (!s) { ctx.restore(); return; }

  // --- Helpers ---
  const drawSeparator = (sy) => {
    const grad = ctx.createLinearGradient(W * 0.2, sy, W * 0.8, sy);
    grad.addColorStop(0, 'rgba(140, 140, 230, 0)');
    grad.addColorStop(0.5, 'rgba(140, 140, 230, 0.6)');
    grad.addColorStop(1, 'rgba(140, 140, 230, 0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W * 0.2, sy);
    ctx.lineTo(W * 0.8, sy);
    ctx.stroke();
  };
  const drawSectionLabel = (text, sy) => {
    ctx.font = 'bold 13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8888bb';
    ctx.fillText(text.toUpperCase(), W / 2, sy);
  };

  // --- Title ---
  let y = 48;
  if (s.isVictory) {
    drawGlowText('VOID WARDEN DEFEATED!', W / 2, y, 'bold 28px ' + FONT, '#ffdd44', '#ffdd44', 12);
    y += 32;
  }
  if (s.isHardcore) {
    drawGlowText('HARDCORE RUN COMPLETE', W / 2, y, 'bold 30px ' + FONT, '#cc2222', '#cc2222', 10);
  } else {
    drawGlowText('RUN COMPLETE', W / 2, y, 'bold 34px ' + FONT, '#ffffff', '#aaaaff', 8);
  }
  y += 30;

  // === Section 1: Run Stats ===
  drawSeparator(y); y += 14;
  drawSectionLabel('Run Stats', y); y += 20;

  ctx.font = '20px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#cccccc';
  ctx.fillText('Waves Survived: ' + s.waves, W / 2, y); y += 26;
  ctx.fillText('Enemies Killed: ' + s.kills, W / 2, y); y += 26;
  ctx.fillStyle = '#00ccff';
  ctx.fillText('Final Score: ' + formatScore(Math.floor(G.runSummaryScoreCounter)), W / 2, y); y += 22;

  // === Section 2: Powers Earned ===
  if (s.powersHeld.length > 0) {
    drawSeparator(y); y += 14;
    drawSectionLabel('Powers Earned', y); y += 22;

    const iconR = 18; // 36px diameter
    const slotW = 70; // space per power (icon + label)
    const totalPW = s.powersHeld.length * slotW;
    let px = W / 2 - totalPW / 2 + slotW / 2;
    const iconCY = y;
    for (const p of s.powersHeld) {
      drawPowerIcon(p.icon, p.shape, px, iconCY, iconR);
      // Label below icon
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#bbbbbb';
      ctx.fillText(p.name, px, iconCY + iconR + 5);
      px += slotW;
    }
    y = iconCY + iconR + 20;
  }

  // === Section 3: Shard Breakdown ===
  drawSeparator(y); y += 14;
  drawSectionLabel('Shard Breakdown', y); y += 20;

  ctx.font = '14px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#00E5FF';
  ctx.fillText('Shards Collected: +' + s.collectedShards, W / 2, y); y += 18;
  ctx.fillStyle = '#aaaaaa';
  ctx.fillText('Wave Bonus: +' + s.waveShards, W / 2, y); y += 18;
  ctx.fillText('Score Bonus: +' + s.scoreShards, W / 2, y); y += 18;
  if (s.recordShards > 0) {
    ctx.fillStyle = '#ffdd44';
    ctx.fillText('New Record: +' + s.recordShards, W / 2, y); y += 18;
  }
  if (s.bossShards > 0) {
    ctx.fillStyle = '#ffdd44';
    ctx.fillText('Bosses: +' + s.bossShards, W / 2, y); y += 18;
  }
  if (s.hasShardMagnet) {
    ctx.fillStyle = '#ffdd44';
    ctx.fillText('Shard Magnet: x1.25', W / 2, y); y += 18;
  }
  if (s.isHardcore) {
    ctx.fillStyle = '#cc2222';
    ctx.fillText('Hardcore: x1.75', W / 2, y); y += 18;
    if (s.hardcoreMilestoneBonus > 0) {
      ctx.fillStyle = '#cc2222';
      ctx.fillText('Wave Milestone: +' + s.hardcoreMilestoneBonus, W / 2, y); y += 18;
    }
    if (s.hardcoreFirstClearBonus > 0) {
      ctx.fillStyle = '#ffdd44';
      ctx.font = 'bold 15px ' + FONT;
      ctx.fillText('FIRST HARDCORE CLEAR: +500!', W / 2, y); y += 18;
      ctx.font = '14px ' + FONT;
    }
  }
  if (s.endlessUnlocked) {
    const unlockPulse = 0.5 + 0.5 * Math.sin(Date.now() / 400 * Math.PI);
    ctx.save();
    ctx.globalAlpha = unlockPulse;
    ctx.fillStyle = '#ffdd44';
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillText('Endless Mode Unlocked!', W / 2, y);
    ctx.restore();
    y += 22;
  }

  // Total shards (animated counter)
  y += 6;
  drawSeparator(y); y += 16;
  ctx.font = 'bold 24px ' + FONT;
  ctx.fillStyle = '#ffdd44';
  ctx.shadowColor = '#ffdd44';
  ctx.shadowBlur = 6;
  ctx.fillText('Shards Earned: ' + Math.floor(G.runSummaryShardCounter), W / 2, y);
  ctx.shadowBlur = 0;
  y += 28;

  ctx.font = '16px ' + FONT;
  ctx.fillStyle = '#888888';
  ctx.fillText('Total Shards: ' + G.meta.shards, W / 2, y);
  y += 28;

  // Unlock hint
  const cheapest = getCheapestLockedUpgrade(G.meta);
  if (cheapest && G.meta.shards >= cheapest.cost) {
    const hintPulse = 0.5 + 0.5 * Math.sin(Date.now() / 500 * Math.PI);
    ctx.save();
    ctx.globalAlpha = hintPulse;
    ctx.font = '15px ' + FONT;
    ctx.fillStyle = '#ffdd44';
    ctx.fillText('New upgrades available!', W / 2, y);
    ctx.restore();
  }

  // --- Victory particle burst ---
  for (const p of G.summaryParticles) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Continue prompt
  if (G.runSummaryReady) {
    const contPulse = 0.4 + 0.6 * Math.sin(Date.now() / 600 * Math.PI);
    ctx.save();
    ctx.globalAlpha = contPulse;
    ctx.font = '16px ' + FONT;
    ctx.fillStyle = '#888888';
    ctx.fillText('Press any key to continue', W / 2, H - 50);
    ctx.restore();
  }

  ctx.restore();
}

// --- Upgrade Screen ---
function drawUpgradeScreen() {
  ctx.save();
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, W, H);
  // Subtle center glow
  const ugGrad = ctx.createRadialGradient(W / 2, H / 3, 0, W / 2, H / 3, 300);
  ugGrad.addColorStop(0, 'rgba(255, 221, 68, 0.04)');
  ugGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = ugGrad;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.3;
  ctx.drawImage(gridCanvas, 0, 0);
  ctx.globalAlpha = 1;

  drawGlowText('UPGRADES', W / 2, 40, 'bold 32px ' + FONT, '#ffffff', '#ffdd44', 8);

  // Shard balance with glow
  ctx.font = 'bold 18px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ffdd44';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#ffdd44';
  ctx.fillText('✦ ' + G.meta.shards + (G.meta.shards === 1 ? ' Shard' : ' Shards'), W / 2, 70);
  ctx.shadowBlur = 0;
  ctx.fillText('✦ ' + G.meta.shards + (G.meta.shards === 1 ? ' Shard' : ' Shards'), W / 2, 70);

  let y = 100;
  for (let tier = 1; tier <= 4; tier++) {
    const tierUnlocked = isTierUnlocked(G.meta, tier);

    // Tier header
    ctx.font = 'bold 14px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillStyle = tierUnlocked ? '#00ccff' : '#444444';
    ctx.fillText('TIER ' + tier, 60, y);
    if (!tierUnlocked) {
      ctx.font = '12px ' + FONT;
      ctx.fillStyle = '#444444';
      ctx.fillText('(locked)', 110, y);
    }
    y += 22;

    const tierUpgrades = UPGRADES.filter(u => u.tier === tier);
    for (let i = 0; i < tierUpgrades.length; i++) {
      const u = tierUpgrades[i];
      const owned = G.meta.unlocks.includes(u.id);
      const affordable = canPurchaseUpgrade(G.meta, u.id);
      const isSelected = G.upgradeCursor === UPGRADES.indexOf(u);

      // Row background for selected — highlighted pill
      if (isSelected) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.roundRect(50, y - 10, W - 100, 22, 4);
        ctx.fill();
        ctx.strokeStyle = affordable ? 'rgba(255,221,68,0.2)' : 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(50, y - 10, W - 100, 22, 4);
        ctx.stroke();
      }

      ctx.font = '13px ' + FONT;
      ctx.textAlign = 'left';

      if (owned) {
        ctx.fillStyle = '#44ff88';
        ctx.fillText('✓ ' + u.name + ' — ' + u.effect, 70, y);
      } else if (affordable) {
        ctx.fillStyle = '#ffffff';
        ctx.fillText(u.name + ' — ' + u.effect, 70, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffdd44';
        ctx.fillText(u.cost + ' ✦', W - 70, y);
      } else if (tierUnlocked) {
        ctx.fillStyle = '#666666';
        ctx.fillText(u.name + ' — ' + u.effect, 70, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#666666';
        ctx.fillText(u.cost + ' ✦', W - 70, y);
      } else {
        ctx.fillStyle = '#333333';
        ctx.fillText('???', 70, y);
      }
      y += 22;
    }
    y += 10;
  }

  // Controls hint
  ctx.font = '14px ' + FONT;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#555555';
  ctx.fillText('↑↓ Navigate · Enter/Space to buy · ESC to return', W / 2, H - 30);

  ctx.restore();
}

// --- Loadout Screen ---
function drawLoadoutScreen() {
  ctx.save();
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, W, H);
  // Subtle center glow
  const loGrad = ctx.createRadialGradient(W / 2, H / 3, 0, W / 2, H / 3, 300);
  loGrad.addColorStop(0, 'rgba(0, 255, 255, 0.03)');
  loGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = loGrad;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.3;
  ctx.drawImage(gridCanvas, 0, 0);
  ctx.globalAlpha = 1;

  drawGlowText('LOADOUT', W / 2, 60, 'bold 32px ' + FONT, '#ffffff', '#00ffff', 8);

  let y = 120;
  for (let i = 0; i < LOADOUTS.length; i++) {
    const l = LOADOUTS[i];
    const unlocked = isLoadoutUnlocked(G.meta, l.id);
    const selected = G.meta.selectedLoadout === l.id;
    const isCursor = G.loadoutCursor === i;

    if (isCursor) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.roundRect(100, y - 20, W - 200, 80, 6);
      ctx.fill();
      ctx.strokeStyle = selected ? 'rgba(0,255,255,0.2)' : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(100, y - 20, W - 200, 80, 6);
      ctx.stroke();
    }

    const isHc = l.id === 'hardcore';
    const hcColor = '#cc2222';

    ctx.font = 'bold 20px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (isHc) {
      ctx.fillStyle = unlocked ? (selected ? hcColor : '#cc4444') : '#444444';
    } else {
      ctx.fillStyle = unlocked ? (selected ? '#00ffff' : '#ffffff') : '#444444';
    }
    ctx.fillText(l.name + (selected ? ' ✓' : ''), W / 2, y);
    if (isHc && unlocked) {
      ctx.font = '11px ' + FONT;
      ctx.fillStyle = '#884444';
      ctx.fillText('One life. Maximum glory.', W / 2, y + 14);
    }
    y += 25;

    ctx.font = '14px ' + FONT;
    ctx.fillStyle = unlocked ? '#aaaaaa' : '#444444';
    ctx.fillText('HP: ' + l.hp + ' · Stamina: ' + l.stamina + ' · Score: x' + l.scoreMod, W / 2, y);
    y += 20;

    if (l.powers.length > 0) {
      ctx.fillText('Starts with: ' + l.powers.join(', '), W / 2, y);
    } else {
      ctx.fillText(isHc && unlocked ? 'No healing · No Second Wind · 2 card picks' : 'No starting powers', W / 2, y);
    }
    y += 20;

    if (!unlocked) {
      ctx.fillStyle = '#666666';
      if (isHc) {
        if (G.meta.bestWave < (l.unlockWave || 15)) {
          ctx.fillText('Reach Wave ' + (l.unlockWave || 15) + ' to unlock', W / 2, y);
        } else {
          ctx.fillStyle = canPurchaseHardcore(G.meta) ? '#ffdd44' : '#666666';
          ctx.fillText(l.unlockCost + ' shards to unlock', W / 2, y);
        }
      } else {
        ctx.fillText('Requires ' + l.unlockCost + ' total shards earned', W / 2, y);
      }
    }
    y += 40;
  }

  ctx.font = '14px ' + FONT;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#555555';
  ctx.fillText('↑↓ Navigate · Enter/Space to select · ESC to return', W / 2, H - 30);

  ctx.restore();
}

// --- Clarity: Threat Lines ---
function drawThreatLines() {
  const alive = G.enemies.filter(e => e.alive);
  if (alive.length < CLARITY.THREAT_LINE_THRESHOLD) return;
  const p = G.player;
  // Sort by distance, take closest within range
  const close = alive
    .map(e => ({ e, d: dist(p, e) }))
    .filter(o => o.d <= CLARITY.THREAT_LINE_RANGE)
    .sort((a, b) => a.d - b.d)
    .slice(0, CLARITY.THREAT_LINE_COUNT);
  if (close.length === 0) return;
  ctx.save();
  ctx.strokeStyle = '#ff0000';
  ctx.globalAlpha = CLARITY.THREAT_LINE_OPACITY;
  ctx.lineWidth = 1;
  for (const { e } of close) {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
  }
  ctx.restore();
}

// --- Clarity: Proximity Ring ---
function drawProximityRing() {
  const alive = G.enemies.filter(e => e.alive);
  if (alive.length <= CLARITY.PROXIMITY_RING_THRESHOLD) return;
  const p = G.player;
  if (!p) return;
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = CLARITY.PROXIMITY_RING_OPACITY;
  ctx.lineWidth = 1;
  ctx.setLineDash(CLARITY.PROXIMITY_RING_DASH);
  ctx.beginPath();
  ctx.arc(p.x, p.y, CLARITY.PROXIMITY_RING_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// --- Main Draw ---
function draw() {
  if (G.state === STATE.TITLE) { drawTitleScreen(); return; }
  if (G.state === STATE.MODE_SELECT) { drawModeSelectScreen(); return; }
  if (G.state === STATE.UPGRADES) { drawUpgradeScreen(); return; }
  if (G.state === STATE.LOADOUT) { drawLoadoutScreen(); return; }
  if (G.state === STATE.RUN_SUMMARY) { drawRunSummary(); return; }
  if (G.state === STATE.GLOSSARY) { drawGlossaryScreen(); return; }
  if (G.state === STATE.SETTINGS) { drawSettingsScreen(); return; }

  ctx.save();
  ctx.translate(G.shakeX, G.shakeY);

  // 1. Background fill — use arc base fill color
  ctx.globalCompositeOperation = 'source-over';
  const arc = G.wave > 0 ? getStageArc(G.wave) : STAGE_ARCS[0];
  ctx.fillStyle = arc.baseFill;
  ctx.fillRect(-20, -20, W + 40, H + 40);

  // 2. Radial gradient overlay
  const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 500);
  bgGrad.addColorStop(0, 'rgba(30, 30, 60, 0.15)');
  bgGrad.addColorStop(1, 'rgba(10, 10, 15, 0)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 3a. Parallax background grid (larger scale, behind main grid, 0.3x scroll speed)
  const gridH = gridCanvas.height;
  const transOffset = G.waveTransitionOffset || 0;
  {
    const bgAlpha = 0.6;
    const bgYOff = transOffset > 0 ? (transOffset * 0.3) % gridH : 0;
    if (G.gridCrossfade > 0) {
      ctx.save();
      ctx.globalAlpha = bgAlpha * G.gridCrossfade;
      ctx.drawImage(bgGridCanvasOld, 0, bgYOff);
      if (bgYOff > 0) ctx.drawImage(bgGridCanvasOld, 0, bgYOff - gridH);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = bgAlpha * (1 - G.gridCrossfade);
      ctx.drawImage(bgGridCanvas, 0, bgYOff);
      if (bgYOff > 0) ctx.drawImage(bgGridCanvas, 0, bgYOff - gridH);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = bgAlpha;
      ctx.drawImage(bgGridCanvas, 0, bgYOff);
      if (bgYOff > 0) ctx.drawImage(bgGridCanvas, 0, bgYOff - gridH);
      ctx.restore();
    }
  }

  // 3b. Main grid lines (with wave transition scroll offset and crossfade)
  if (transOffset > 0) {
    const yOff = transOffset % gridH;
    if (G.gridCrossfade > 0) {
      ctx.save();
      ctx.globalAlpha = G.gridCrossfade;
      ctx.drawImage(gridCanvasOld, 0, yOff);
      if (yOff > 0) ctx.drawImage(gridCanvasOld, 0, yOff - gridH);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 1 - G.gridCrossfade;
      ctx.drawImage(gridCanvas, 0, yOff);
      if (yOff > 0) ctx.drawImage(gridCanvas, 0, yOff - gridH);
      ctx.restore();
    } else {
      ctx.drawImage(gridCanvas, 0, yOff);
      if (yOff > 0) ctx.drawImage(gridCanvas, 0, yOff - gridH);
    }

  } else {
    if (G.gridCrossfade > 0) {
      ctx.save();
      ctx.globalAlpha = G.gridCrossfade;
      ctx.drawImage(gridCanvasOld, 0, 0);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 1 - G.gridCrossfade;
      ctx.drawImage(gridCanvas, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(gridCanvas, 0, 0);
    }
  }

  // 3c. Parallax dot layer (always visible, scrolls at 50% during transitions, drifts during gameplay)
  if (G.waveTransitionParallaxDots && G.waveTransitionParallaxDots.length > 0) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#5588aa';
    const parallaxOff = transOffset * 0.5;
    for (const dot of G.waveTransitionParallaxDots) {
      const dy = ((dot.y + parallaxOff) % H + H) % H;
      ctx.beginPath();
      ctx.arc(dot.x, dy, dot.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 3d. Ambient background shapes (slow drifting, between grid and tint)
  drawAmbientShapes();

  // Environmental tint overlay — arc-based
  if (G.wave > 0) {
    const tintColor = getArcTintColor(G.wave);
    const tintAlpha = getArcTintAlpha(G.wave);
    ctx.save();
    const tintGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 550);
    tintGrad.addColorStop(0, tintColor);
    tintGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = tintAlpha;
    ctx.fillStyle = tintGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Arena border glow (viewport-fixed, drawn before transition offset)
  ctx.save();
  ctx.strokeStyle = '#2a2a4a';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#4a4aff';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.strokeRect(0, 0, W, H);
  ctx.restore();

  // Apply wave transition scroll offset to all game-world elements
  if (transOffset > 0) ctx.translate(0, transOffset);

  // Ambient particles (below enemies, above grid)
  drawAmbientParticles();

  // Boss wave vignette pulse during transition
  if (transOffset > 0) {
    const nextWave = G.wave + 1;
    if (nextWave === 10 || nextWave === 20 || nextWave === 30) {
      const pulseAlpha = 0.25 * Math.sin(Date.now() * 0.004 * Math.PI);
      if (pulseAlpha > 0) {
        ctx.save();
        const vigGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.7);
        const bossColor = nextWave === 10 ? '#ff8800' : nextWave === 20 ? '#ffffff' : '#8844cc';
        vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vigGrad.addColorStop(1, bossColor);
        ctx.globalAlpha = pulseAlpha;
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }
  }

  // Arena modifiers (drawn in source-over before switching to lighter)
  drawArenaModifiers();

  // Proximity ring — subtle dashed circle around player when enemies > 12
  drawProximityRing();

  // Threat lines — thin red lines from player to nearest close enemies
  drawThreatLines();

  // Boss extras (gravity wells, hazard zones, safe zone) drawn before enemies
  drawBossExtras();

  // 4. Switch to lighter for additive glow blending
  ctx.globalCompositeOperation = 'lighter';

  // 5. Wall bounce flashes
  drawWallFlashes();

  // 6. Power-ups on ground (hearts only now)
  drawPowerUps();

  // 6b. Boost pickups
  drawBoostPickups();

  // 6c. Shard pickups
  drawShardPickups();

  // 7. Enemies
  drawEnemies();

  // 7b. Dash path preview (kill markers + collectible rings)
  drawDashPreview();

  // 8. Pulser shockwave rings
  drawShockwaves();

  // 9. Player dash trail / afterimages
  drawAfterimages();

  // 10. Player orb + active power-up visuals
  // During wave transition: player stays viewport-fixed, afterimage trail handled by update
  if (transOffset > 0 && G.player) {
    ctx.translate(0, -transOffset); // exit world-space — player is viewport-fixed
    drawPlayer();
    ctx.translate(0, transOffset); // back to world-space
  } else {
    drawPlayer();
  }

  // 11. All particles
  drawParticles();

  // Collect rings
  drawCollectRings();

  // Multi-Pop explosions
  drawMultiPopExplosions();

  // Reverse wave transition offset before UI overlays
  if (transOffset > 0) ctx.translate(0, -transOffset);

  // 11b. Virtual joystick overlay (mobile)
  drawJoystick();

  // 11c. Tap bounce ripples (mobile)
  drawTapBounceRipples();

  // 12. Switch back to source-over for UI
  ctx.globalCompositeOperation = 'source-over';

  // Combat text
  drawCombatTexts();

  // 13. Low HP vignette
  if (G.vignetteAlpha > 0) {
    const vGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.7);
    vGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vGrad.addColorStop(1, 'rgba(255, 0, 0, ' + G.vignetteAlpha + ')');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, W, H);
  }

  // 15. Combo floater text
  for (const f of G.floatTexts) {
    if (f.phase !== 'combo') continue;
    const scaleVal = lerp(1.2, 1, Math.min(1, f.scaleT));
    ctx.save();
    ctx.globalAlpha = f.alpha;
    ctx.translate(f.x, f.y);
    ctx.scale(scaleVal, scaleVal);
    drawGlowText(f.text, 0, 0, 'bold ' + f.size + 'px ' + FONT, f.color, f.glowColor, 8);
    ctx.restore();
  }

  // 15b. Burst text (no-glow float texts from burst-and-breathe pacing)
  drawBurstTexts();

  // 16. HUD
  drawHUD();

  // 16b. Boost timer bar
  drawBoostTimerBar();

  // 16c. Glossary unlock toasts
  drawToasts();

  // 16c2. "NEW: Aim your dash" tooltip (first 3 dashes after update)
  if (G.dashTooltipTimer > 0 && (G.state === STATE.PLAYING || G.state === STATE.BOSS_FIGHT)) {
    const ttAlpha = Math.min(1, G.dashTooltipTimer / 0.3);
    const isTouchDev = 'ontouchstart' in window;
    const ttText = isTouchDev
      ? 'NEW: Aim your dash with the joystick!'
      : 'NEW: Aim your dash with the mouse!';
    ctx.save();
    ctx.globalAlpha = ttAlpha * 0.9;
    ctx.font = 'bold 16px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Background pill
    const tw = ctx.measureText(ttText).width + 24;
    const th = 32;
    const tx = W / 2, ty = H * 0.18;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.roundRect(tx - tw / 2, ty - th / 2, tw, th, 8);
    ctx.fill();
    // Text
    ctx.fillStyle = '#ffdd44';
    ctx.fillText(ttText, tx, ty);
    ctx.restore();
  }

  // Boss HP bar (on top of HUD)
  if (G.boss && G.boss.alive) drawBossHPBar();

  // 16d. Wave start screen flash (white, 0.1s)
  if (G.waveStartFlash > 0) {
    ctx.save();
    ctx.globalAlpha = G.waveStartFlash / 0.1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // 16e. Wave transition announce text (large "WAVE X" during scroll)
  if (G.state === STATE.WAVE_BREAK && G.waveTransitionAnnounce && G.waveTransitionOffset > 0) {
    const ann = G.waveTransitionAnnounce;
    const dur = ann.duration;
    const fadeIn = 0.3, fadeOut = 0.4;
    const t = ann.timer;
    let alpha = 0;
    if (t < fadeIn) alpha = t / fadeIn;
    else if (t < dur - fadeOut) alpha = 1;
    else if (t < dur) alpha = (dur - t) / fadeOut;
    if (alpha > 0) {
      ctx.save();
      ctx.globalAlpha = alpha;
      drawGlowText('WAVE ' + ann.wave, W / 2, H / 2, 'bold 56px ' + FONT, '#ffffff', '#00ffff', 18);
      ctx.restore();
    }
  }

  // 16f. Lore snippet during wave transition
  if (G.state === STATE.WAVE_BREAK) {
    drawLoreSnippet();
    drawEndlessEntryMessage();
  }

  // 17. Wave announce text & float texts (skip burst texts with null glowColor)
  for (const f of G.floatTexts) {
    if (f.phase === 'combo' || f.glowColor === null) continue;
    ctx.save();
    ctx.globalAlpha = f.alpha;
    if (f.phase === 'scale' || f.phase === 'hold' || f.phase === 'fade') {
      let size = f.size;
      if (f.phase === 'scale') size = f.size * lerp(1.5, 1, Math.min(1, f.scaleT));
      drawGlowText(f.text, f.x, f.y, 'bold ' + Math.round(size) + 'px ' + FONT, f.color, f.glowColor || '#00ffff', 12);
    } else if (f.phase === 'float') {
      drawGlowText(f.text, f.x, f.y, 'bold ' + f.size + 'px ' + FONT, f.color, f.glowColor || '#ffdd00', 8);
    }
    ctx.restore();
  }

  ctx.restore(); // end shake transform

  // 18. Power Select overlay (outside shake)
  if (G.state === STATE.POWER_SELECT) {
    drawPowerSelectScreen();
  }

  // Boss intro card overlay (outside shake)
  if (G.state === STATE.BOSS_INTRO_CARD) {
    drawBossIntro();
  }

  // Boss ready screen (wait for player)
  if (G.state === STATE.BOSS_READY) {
    drawBossReady();
  }

  // Boss tutorial overlay (first encounter)
  if (G.state === STATE.BOSS_TUTORIAL) {
    drawBossTutorial();
  }

  // 19. Game Over overlay (outside shake)
  if (G.state === STATE.GAME_OVER && G.freezeTimer <= 0) {
    ctx.save();
    ctx.globalAlpha = G.gameOverFadeIn * 0.75;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = G.gameOverFadeIn;

    const goBlur = 12 + 4 * Math.sin(G.gameOverTimer * Math.PI);
    const goText = G.isHardcore ? 'OBLITERATED' : 'GAME OVER';
    ctx.save();
    ctx.font = 'bold 56px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = G.isHardcore ? '#cc2222' : '#ff2222';
    ctx.shadowBlur = goBlur;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = G.isHardcore ? '#cc2222' : '#ff4444';
    ctx.fillText(goText, W / 2, H * 0.35);
    ctx.shadowBlur = 0;
    ctx.fillText(goText, W / 2, H * 0.35);
    ctx.restore();

    ctx.globalAlpha = G.gameOverFadeIn;
    drawGlowText('SCORE: ' + formatScore(G.score), W / 2, H * 0.35 + 50, 'bold 28px ' + FONT, '#ffffff', '#aaaaff', 6);

    const dispHighScore = G.isHardcore ? (G.meta.hardcoreHighScore || 0) : G.highScore;
    const isNew = G.score >= dispHighScore && G.score > 0;
    drawGlowText((G.isHardcore ? 'Hardcore ' : '') + 'High Score: ' + formatScore(dispHighScore), W / 2, H * 0.35 + 85,
      (isNew ? 'bold ' : '') + '22px ' + FONT, '#ffdd00', '#ffaa00', 6);

    if (isNew) {
      const newPulse = 0.6 + 0.4 * Math.sin(G.gameOverTimer * Math.PI * 4);
      const newBlur = 10 + 8 * Math.sin(G.gameOverTimer * Math.PI * 3);
      ctx.save();
      ctx.globalAlpha = G.gameOverFadeIn * newPulse;
      drawGlowText('NEW HIGH SCORE!', W / 2, H * 0.35 + 115, 'bold 20px ' + FONT, '#00ff88', '#00ff88', newBlur);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = G.gameOverFadeIn;
    ctx.font = '18px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('Wave ' + G.wave + '  ·  ' + formatTime(G.elapsedTime), W / 2, H * 0.35 + 140);
    ctx.restore();

    if (G.gameOverTimer > 1.5) {
      const restartPulse = 0.5 + 0.5 * Math.sin(G.gameOverTimer * Math.PI * 2);
      ctx.save();
      ctx.globalAlpha = G.gameOverFadeIn * restartPulse;
      ctx.font = '16px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#888888';
      ctx.fillText('Click / Tap / Any Key for Summary', W / 2, H * 0.35 + 180);
      ctx.restore();
    }

    ctx.restore();
  }

  // 20. Pause overlay with power inventory (outside shake)
  if (G.state === STATE.PAUSED) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    // Title
    drawGlowText('PAUSED', W / 2, 60, 'bold 48px ' + FONT, '#ffffff', '#00ffff', 12);

    // Power inventory grid — 2 columns, widened cards
    const cardW = 370, cardH = 48, gapX = 12, gapY = 6;
    const gridW = cardW * 2 + gapX; // 752px
    const gridX = (W - gridW) / 2;  // 24px
    const gridY = 120;
    const player = G.player;
    const totalSlots = Math.max(player.powers.length, MAX_POWER_SLOTS);
    const visibleSlots = Math.min(totalSlots, 12);

    for (let i = 0; i < visibleSlots; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = gridX + col * (cardW + gapX);
      const cy = gridY + row * (cardH + gapY);

      if (i < player.powers.length) {
        // Filled power card
        const power = player.powers[i];
        const def = POWER_DEFS[power.id];
        // For evolutions, look up recipe data
        const evoRecipe = !def ? EVOLUTION_RECIPES.find(r => r.id === power.id) : null;
        const name = def ? def.name : (evoRecipe ? evoRecipe.name : power.id);
        const color = def ? def.icon : (evoRecipe ? evoRecipe.icon : '#ffffff');
        const desc = def ? def.desc(power.level) : (evoRecipe ? evoRecipe.desc : '');

        // Card background
        ctx.save();
        ctx.fillStyle = '#1a1a2e';
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cardW, cardH, 4);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Left accent bar
        ctx.fillStyle = color;
        ctx.fillRect(cx, cy, 4, cardH);

        // Power name — 14px bold white
        ctx.font = 'bold 14px ' + FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(name, cx + 12, cy + cardH / 2 - 8);

        // Level stars — ★ in #ffdd44
        const stars = '★'.repeat(power.level);
        ctx.fillStyle = '#ffdd44';
        ctx.font = 'bold 12px ' + FONT;
        ctx.fillText(stars, cx + 12, cy + cardH / 2 + 10);

        // Effect summary — 11px #aaaacc right-aligned, truncated to fit card
        ctx.font = '11px ' + FONT;
        ctx.textAlign = 'right';
        ctx.fillStyle = '#aaaacc';
        const descMaxW = cardW - 22;
        let descText = desc;
        if (ctx.measureText(descText).width > descMaxW) {
          while (descText.length > 0 && ctx.measureText(descText + '…').width > descMaxW) {
            descText = descText.slice(0, -1);
          }
          descText = descText + '…';
        }
        ctx.fillText(descText, cx + cardW - 10, cy + cardH / 2);

        ctx.restore();
      } else {
        // Empty slot
        ctx.save();
        ctx.strokeStyle = '#333344';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.roundRect(cx, cy, cardW, cardH, 4);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = '12px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#444466';
        ctx.fillText('Empty', cx + cardW / 2, cy + cardH / 2);
        ctx.restore();
      }
    }

    // --- Pause menu buttons ---
    const btnY = gridY + Math.ceil(visibleSlots / 2) * (cardH + gapY) + 20;
    const btnW = 200, btnH = 40, btnGap = 16;
    const totalBtnW = btnW * 2 + btnGap;
    const btnX = (W - totalBtnW) / 2;

    // Resume button
    const resumeBtnX = btnX, resumeBtnY = btnY;
    const resumeHover = !!G._pauseHoverResume;
    ctx.save();
    if (resumeHover) {
      ctx.shadowColor = '#00ffaa';
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = resumeHover ? '#1f4f35' : '#1a3a2a';
    ctx.beginPath();
    ctx.roundRect(resumeBtnX, resumeBtnY, btnW, btnH, 6);
    ctx.fill();
    ctx.strokeStyle = resumeHover ? '#44ffcc' : '#00ffaa';
    ctx.lineWidth = resumeHover ? 3 : 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = 'bold 16px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = resumeHover ? '#44ffcc' : '#00ffaa';
    ctx.fillText('Resume (P)', resumeBtnX + btnW / 2, resumeBtnY + btnH / 2);
    ctx.restore();

    // Quit Run button
    const quitBtnX = btnX + btnW + btnGap, quitBtnY = btnY;
    const quitHover = !!G._pauseHoverQuit;
    ctx.save();
    if (quitHover) {
      ctx.shadowColor = '#ff4466';
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = quitHover ? '#4f1f1f' : '#3a1a1a';
    ctx.beginPath();
    ctx.roundRect(quitBtnX, quitBtnY, btnW, btnH, 6);
    ctx.fill();
    ctx.strokeStyle = quitHover ? '#ff6688' : '#ff4466';
    ctx.lineWidth = quitHover ? 3 : 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = 'bold 16px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = quitHover ? '#ff6688' : '#ff4466';
    ctx.fillText('Quit Run (Q)', quitBtnX + btnW / 2, quitBtnY + btnH / 2);
    ctx.restore();

    // Store button bounds for click detection
    G._pauseResumeBtnRect = { x: resumeBtnX, y: resumeBtnY, w: btnW, h: btnH };
    G._pauseQuitBtnRect = { x: quitBtnX, y: quitBtnY, w: btnW, h: btnH };

    // Bottom hints
    ctx.save();
    ctx.font = '14px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#555555';
    ctx.fillText('S — Settings · G — Glossary', W / 2, btnY + btnH + 16);
    ctx.restore();

    ctx.restore();
  }

  // 21. Tutorial overlay (outside shake)
  if (G.state === STATE.TUTORIAL) {
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    drawGlowText('HOW TO PLAY', W / 2, H * 0.3, 'bold 36px ' + FONT, '#00ffff', '#00ffff', 12);
    ctx.save();
    ctx.font = '18px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#cccccc';
    const isTouchDev = 'ontouchstart' in window;
    ctx.fillText(isTouchDev
      ? 'Joystick to move · Tap right side to DASH · Aim with joystick!'
      : 'WASD to move · Space to DASH · Aim with your mouse!', W / 2, H * 0.3 + 50);
    ctx.fillText('Moving fast = KILL enemies', W / 2, H * 0.3 + 80);
    ctx.fillStyle = '#ff6666';
    ctx.fillText('Standing still = enemies HURT you', W / 2, H * 0.3 + 110);
    ctx.fillStyle = '#ffdd44';
    ctx.fillText('Pick powers between waves to get stronger!', W / 2, H * 0.3 + 140);
    ctx.restore();
    const tutPulse = 0.5 + 0.5 * Math.sin(Date.now() / 500 * Math.PI);
    ctx.save();
    ctx.globalAlpha = tutPulse;
    ctx.font = '16px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#888888';
    ctx.fillText('Click or press any key to start', W / 2, H * 0.3 + 190);
    ctx.restore();
    ctx.restore();
  }

  // 22. Collect flash overlay
  if (G.collectFlashAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = G.collectFlashAlpha;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

// --- Game Over → Run Summary transition ---
export function transitionToRunSummary() {
  clearRunState(); // Wipe saved run on death or completion
  const prevBest = G.meta.bestWave;
  const bonusInfo = calculateRunBonusShards(G.runWaves, G.score, G.wave, prevBest, G.meta);

  // Collect power info for display (with shape + name from POWER_DEFS)
  const powersHeld = G.player.powers.map(p => {
    const def = POWER_DEFS[p.id];
    return { id: p.id, icon: def ? def.icon : '#ffffff', shape: def ? def.shape : 'circle', name: def ? def.name : p.id };
  });

  // Physical shards collected during gameplay
  const collectedShards = G.shardsCollected || 0;
  // Boss shard bonus (awarded directly, not physical drops)
  const bossShards = G.bossShardBonus || 0;
  // Subtotal before multipliers
  let subtotal = collectedShards + bonusInfo.subtotal + bossShards;
  // Apply Shard Magnet upgrade (+25%)
  let totalShards = applyShardMagnetBonus(subtotal, G.meta);

  // Hardcore: 1.75x shard multiplier (stacks with Shard Magnet)
  let hardcoreMultiplied = 0;
  let hardcoreMilestoneBonus = 0;
  let hardcoreFirstClearBonus = 0;
  if (G.isHardcore) {
    hardcoreMultiplied = Math.floor(totalShards * 1.75);
    totalShards = hardcoreMultiplied;
    hardcoreMilestoneBonus = getHardcoreWaveMilestoneBonus(G.wave);
    totalShards += hardcoreMilestoneBonus;
    // First clear bonus
    if (G.wave >= 30 && !G.meta.hardcoreFirstClear) {
      hardcoreFirstClearBonus = 500;
      totalShards += hardcoreFirstClearBonus;
      G.meta.hardcoreFirstClear = true;
    }
  }

  G.runSummary = {
    kills: G.runKills,
    waves: G.runWaves,
    score: G.score,
    powersHeld,
    collectedShards,
    waveShards: bonusInfo.waves,
    scoreShards: bonusInfo.score,
    recordShards: bonusInfo.record,
    bossShards,
    subtotal,
    total: totalShards,
    hasShardMagnet: G.meta.unlocks.includes(7),
    isVictory: G.isVictory || false,
    endlessUnlocked: G.meta.endlessUnlocked || false,
    isHardcore: G.isHardcore,
    hardcoreMultiplied,
    hardcoreMilestoneBonus,
    hardcoreFirstClearBonus,
  };

  // Apply shards to meta
  G.meta.shards += totalShards;
  G.meta.totalShardsEarned += totalShards;
  G.meta.totalRuns++;
  G.meta.totalKills += G.runKills;
  if (G.isHardcore) {
    if (G.wave > (G.meta.hardcoreBestWave || 0)) G.meta.hardcoreBestWave = G.wave;
  } else {
    if (G.wave > G.meta.bestWave) G.meta.bestWave = G.wave;
  }
  saveMeta(G.meta);

  G.state = STATE.RUN_SUMMARY;
  G.runSummaryTimer = 0;
  G.runSummaryShardCounter = 0;
  G.runSummaryScoreCounter = 0;
  G.runSummaryReady = false;
  G.summaryParticles = [];

  // Spawn victory particle burst for boss-defeat runs
  if (G.runSummary.isVictory) {
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 200;
      G.summaryParticles.push({
        x: W / 2, y: 60,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 2 + Math.random() * 4,
        initR: 2 + Math.random() * 4,
        color: ['#ffdd44', '#ffaa00', '#ff8844', '#ffffff'][Math.floor(Math.random() * 4)],
        alpha: 1,
        life: 1.0 + Math.random() * 1.5,
        maxLife: 1.0 + Math.random() * 1.5,
      });
    }
  }

  G.isVictory = false;
}

// --- Game Loop ---
function gameLoop(now) {
  requestAnimationFrame(gameLoop);
  if (!G.lastTime) G.lastTime = now;
  let dt = (now - G.lastTime) / 1000;
  G.lastTime = now;
  dt = Math.min(dt, 0.05);
  updateTransition(dt);
  update(dt);
  draw();
  drawTransition();
}

// --- Initialize ---
setupCrazyGames();          // detect & activate CrazyGames adapter (no-op elsewhere)
setupPoki();                // detect & activate Poki adapter (no-op elsewhere)
setupGameDistribution();    // detect & activate GameDistribution adapter (no-op elsewhere)
platformSDK.init();
platformSDK.loadingProgress(0.5);
setupInput();
setupGlossaryTracking();
// Restore saved audio settings
const savedSettings = loadSettings();
if (savedSettings) {
  if (typeof savedSettings.musicVolume === 'number') setMusicVolume(savedSettings.musicVolume);
  if (typeof savedSettings.sfxVolume === 'number') setSfxVolume(savedSettings.sfxVolume);
  if (savedSettings.muted) toggleMute();
}
platformSDK.loadingProgress(1);
platformSDK.loadingDone();
G.state = STATE.TITLE;

// Start title music on very first user gesture (browsers require gesture for AudioContext)
function _onFirstGesture() {
  resumeAudio();
  startMusic();
  document.removeEventListener('pointerdown', _onFirstGesture);
  document.removeEventListener('keydown', _onFirstGesture);
}
document.addEventListener('pointerdown', _onFirstGesture, { once: true });
document.addEventListener('keydown', _onFirstGesture, { once: true });

requestAnimationFrame(gameLoop);
