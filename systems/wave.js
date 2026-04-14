'use strict';

import { W, H, STATE, FONT } from '../config.js';
import { G } from '../state.js';
import { events } from '../eventbus.js';
import { ctx } from '../canvas.js';

// --- Wave Configuration (updated difficulty scaling) ---
export function getWaveDuration(w) {
  if (w <= 3) return 15;
  if (w <= 7) return 12;
  if (w <= 12) return Math.max(10, 12 - (w - 7));
  return 10;
}

// Updated: floor(3 + wave × 1.8)
export function getEnemyCount(w) { return Math.floor(3 + w * 1.8); }

// Updated: 1 + (wave−1) × 0.06, cap at 2.50
// Hardcore: 1.15 + (wave−1) × 0.08, cap at 2.80
export function getSpeedScale(w) {
  if (G.isHardcore) return Math.min(2.8, 1.15 + (w - 1) * 0.08);
  return Math.min(2.5, 1 + (w - 1) * 0.06);
}

// Boss waves: every 10 waves
export function isBossWave(w) {
  return w > 0 && w % 10 === 0;
}

export function getBossType(w) {
  const cycle = ((w / 10 - 1) % 3);
  if (cycle === 0) return 'hive_queen';
  if (cycle === 1) return 'nexus_core';
  return 'void_warden';
}

// Boss scaling for endless mode (waves > 30)
export function getBossScaling(w) {
  if (w <= 30) return { hpMul: 1, speedMul: 1, shardBonus: 0 };
  const cycleNum = Math.floor((w - 31) / 30); // 0 for waves 31-60, 1 for 61-90...
  const pos = Math.floor((w - 31) / 10) % 3; // position within cycle (0,1,2)
  const fullCycles = Math.floor((w - 1) / 30) - 1; // cycles past the first 30
  const hpMul = 1.5 + fullCycles * 0.5;
  const speedMul = 1.3 + fullCycles * 0.2;
  const baseBonus = [15, 25, 40][pos] || 15;
  const shardBonus = baseBonus + fullCycles * 20;
  return { hpMul, speedMul, shardBonus };
}

// Updated enemy mix table from spec (Section 5.5)
// Returns array: [drifter, tracker, splitter, pulser, teleporter, bomber, spawner, sniper]
export function getEnemyMix(w) {
  if (w <= 2) return [1, 0, 0, 0, 0, 0, 0, 0];
  if (w <= 4) return [0.60, 0.40, 0, 0, 0, 0, 0, 0];
  if (w <= 6) return [0.40, 0.30, 0.30, 0, 0, 0, 0, 0];
  if (w === 7) return [0.30, 0.25, 0.25, 0.10, 0.10, 0, 0, 0];
  if (w === 8) return [0.25, 0.25, 0.20, 0.10, 0.10, 0.10, 0, 0];
  if (w === 9) return [0.20, 0.22, 0.18, 0.10, 0.10, 0.10, 0.10, 0];
  if (w <= 11) return [0.15, 0.20, 0.15, 0.10, 0.10, 0.10, 0.10, 0.10];
  return [0.10, 0.18, 0.15, 0.12, 0.12, 0.12, 0.10, 0.11];
}

const ENEMY_TYPES = ['drifter', 'tracker', 'splitter', 'pulser', 'teleporter', 'bomber', 'spawner', 'sniper'];

export function pickEnemyType(w) {
  const mix = getEnemyMix(w);
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < ENEMY_TYPES.length; i++) {
    acc += mix[i];
    if (r < acc) return ENEMY_TYPES[i];
  }
  return 'drifter';
}

// Shield chance: 10% base at wave 8, +3%/wave, cap 30% (Hardcore: 12% at W6, cap 35%)
export function getShieldChance(w) {
  if (G.isHardcore) {
    if (w < 6) return 0;
    return Math.min(0.35, 0.12 + (w - 6) * 0.03);
  }
  if (w < 8) return 0;
  return Math.min(0.30, 0.10 + (w - 8) * 0.03);
}

// Eligible for shields: drifter, tracker, splitter, teleporter, bomber
const SHIELD_ELIGIBLE = new Set(['drifter', 'tracker', 'splitter', 'teleporter', 'bomber']);
export function canHaveShield(type) { return SHIELD_ELIGIBLE.has(type); }

// --- Enemy Concurrent Cap ---
export function getEnemyCap(w) {
  if (w <= 5) return Math.min(12, getEnemyCount(w));
  if (w <= 8) return 13;
  return 15;
}

// --- Burst-and-Breathe pacing ---
function getInterBurstPause(w) {
  if (w <= 5) return 3.0;
  if (w <= 10) return 2.5;
  return 2.0;
}

export function getWaveBreakDuration(w) {
  if (w <= 5) return 4.5;
  if (w <= 10) return 4.0;
  return 3.5;
}

// --- Wave Transitions ---
export function startNextWave() {
  G.wave++;
  G.waveDuration = getWaveDuration(G.wave);
  const total = getEnemyCount(G.wave);
  G.waveEnemiesLeft = total;
  G.waveSpawnTimer = 0;
  G.waveTimer = 0;

  // Burst-and-breathe: split wave into 3 bursts
  const perBurst = Math.ceil(total / 3);
  G.spawnBursts = [];
  let remaining = total;
  for (let i = 0; i < 3; i++) {
    const count = Math.min(perBurst, remaining);
    if (count <= 0) break;
    G.spawnBursts.push({ count, spawned: 0, done: false });
    remaining -= count;
  }
  G.currentBurst = 0;
  G.burstSpawnTimer = 0;
  G.burstPauseTimer = 0;
  G.inBurstPause = false;
  G.spawnInterval = 0.4; // intra-burst interval

  // Spawn queue for concurrent cap
  G.spawnQueue = [];
  G.spawnQueueTimer = 0;
  G.enemyCap = getEnemyCap(G.wave);

  if (G.wave === 1 && !G.tutorialDismissed) { G.state = STATE.TUTORIAL; }
  else { G.state = STATE.PLAYING; }
  G.floatTexts.push({ text: 'WAVE ' + G.wave, x: W / 2, y: H / 2, size: 48, alpha: 1,
    phase: 'scale', scaleT: 0, color: '#ffffff', glowColor: '#00ffff', vy: 0, life: 1.8 });
  events.emit('waveStarted', { wave: G.wave });
}

// Update burst-and-breathe spawning. Called each frame from game.js update.
// Returns true when all burst enemies have been spawned (remaining may be in queue).
export function updateBurstSpawning(dt, spawnFn) {
  if (!G.spawnBursts || G.spawnBursts.length === 0) return true;

  const aliveCount = G.enemies.filter(e => e.alive).length;

  // Process spawn queue first (enemies waiting due to cap)
  if (G.spawnQueue && G.spawnQueue.length > 0) {
    G.spawnQueueTimer += dt;
    if (G.spawnQueueTimer >= 0.5 && aliveCount < G.enemyCap) {
      const type = G.spawnQueue.shift();
      spawnFn(type);
      G.spawnQueueTimer = 0;
    }
  }

  // Inter-burst pause
  if (G.inBurstPause) {
    G.burstPauseTimer -= dt;
    if (G.burstPauseTimer <= 0) {
      G.inBurstPause = false;
      G.currentBurst++;
      if (G.currentBurst < G.spawnBursts.length) {
        spawnBurstText(G.currentBurst + 1, G.spawnBursts.length);
      }
    }
    return false;
  }

  if (G.currentBurst >= G.spawnBursts.length) return true;

  const burst = G.spawnBursts[G.currentBurst];
  if (burst.done) return G.currentBurst >= G.spawnBursts.length - 1;

  G.burstSpawnTimer += dt;
  if (G.burstSpawnTimer >= G.spawnInterval && burst.spawned < burst.count) {
    G.burstSpawnTimer -= G.spawnInterval;
    const type = pickEnemyType(G.wave);

    if (aliveCount >= G.enemyCap) {
      // Queue it — will spawn 0.5s after a kill
      G.spawnQueue.push(type);
    } else {
      spawnFn(type);
    }

    burst.spawned++;
    G.waveEnemiesLeft--;

    if (burst.spawned >= burst.count) {
      burst.done = true;
      // Start inter-burst pause if not last burst
      if (G.currentBurst < G.spawnBursts.length - 1) {
        G.inBurstPause = true;
        G.burstPauseTimer = getInterBurstPause(G.wave);
        G.burstSpawnTimer = 0;
      } else {
        G.currentBurst++;
      }
    }
  }

  return false;
}

// --- Burst Text (called by burst-and-breathe pacing system) ---
// Shows "BURST n/total" at the top of the screen, fades over 0.8s.
// Style: same font family as wave announce but smaller, white, no glow.
export function spawnBurstText(current, total) {
  G.floatTexts.push({
    text: 'BURST ' + current + '/' + total,
    x: W / 2, y: 50,
    size: 20, alpha: 1,
    phase: 'fade', scaleT: 1,
    color: '#ffffff', glowColor: null,
    vy: 0, life: 0.8,
  });
}

// Draw burst text entries (called from game.js render loop).
// Burst texts have glowColor === null to distinguish from wave announce.
export function drawBurstTexts() {
  for (const f of G.floatTexts) {
    if (f.glowColor !== null || f.phase === 'combo') continue;
    if (f.alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha = f.alpha;
    ctx.font = 'bold ' + f.size + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = f.color;
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }
}
