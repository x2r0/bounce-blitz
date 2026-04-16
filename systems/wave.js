'use strict';

import { W, H, STATE, FONT } from '../config.js';
import { G } from '../state.js';
import { events } from '../eventbus.js';
import { ctx } from '../canvas.js';

const DEFAULT_ENEMY_COUNT_FORMULA = w => Math.floor(3 + w * 1.8);

const COMPOSITION_PRESETS = {
  intro_drifters: { drifter: 1.0 },
  tracker_pressure: { drifter: 0.35, tracker: 0.65 },
  split_cleanup: { drifter: 0.18, tracker: 0.32, splitter: 0.50 },
  zoning_intro: { drifter: 0.10, tracker: 0.42, splitter: 0.20, pulser: 0.28 },
  teleport_fakeout: { drifter: 0.08, tracker: 0.18, splitter: 0.30, teleporter: 0.44 },
  bomber_priority: { drifter: 0.12, tracker: 0.34, splitter: 0.16, bomber: 0.38 },
  sniper_ring: { tracker: 0.20, splitter: 0.36, teleporter: 0.10, sniper: 0.34 },
  fortress_anchor: { tracker: 0.28, splitter: 0.12, bomber: 0.18, spawner: 0.22, sniper: 0.20 },
  route_commitment: { tracker: 0.18, pulser: 0.28, teleporter: 0.12, bomber: 0.30, spawner: 0.12 },
  geometry_tool: { tracker: 0.12, teleporter: 0.34, bomber: 0.18, sniper: 0.36 },
  flood_management: { tracker: 0.14, splitter: 0.24, bomber: 0.18, spawner: 0.26, sniper: 0.18 },
  crossing_test: { tracker: 0.26, teleporter: 0.08, bomber: 0.30, sniper: 0.36 },
  attrition_labyrinth: { tracker: 0.12, pulser: 0.26, teleporter: 0.30, bomber: 0.14, sniper: 0.18 },
  void_rotation: { tracker: 0.24, splitter: 0.12, pulser: 0.24, teleporter: 0.22, bomber: 0.18 },
  final_exam: { tracker: 0.10, splitter: 0.08, pulser: 0.20, teleporter: 0.24, bomber: 0.18, sniper: 0.20 },
};

const STORY_WAVE_PLAN = {
  1: { templateKey: null, compositionKey: 'intro_drifters', enemyCount: 4, enemyCap: 4, burstProfile: { bursts: 2, interval: 0.70, pause: 3.5 }, notes: 'Open onboarding wave.' },
  2: { templateKey: null, compositionKey: 'tracker_pressure', enemyCount: 5, enemyCap: 5, burstProfile: { bursts: 2, interval: 0.60, pause: 3.1 }, notes: 'Introduce light chase pressure.' },
  3: { templateKey: null, compositionKey: 'tracker_pressure', enemyCount: 6, enemyCap: 6, burstProfile: { bursts: 2, interval: 0.55, pause: 2.8 }, notes: 'Finish open-arena onboarding.' },
  4: { templateKey: 'Corridor', compositionKey: 'tracker_pressure', notes: 'First geometry read.' },
  5: { templateKey: 'FourCorners', compositionKey: 'split_cleanup', notes: 'Introduce fragment cleanup.' },
  6: { templateKey: 'Tunnels', compositionKey: 'split_cleanup', notes: 'Route before greed.' },
  7: { templateKey: 'Cross', compositionKey: 'zoning_intro', notes: 'Center denial tutorial.' },
  8: { templateKey: 'Diamond', compositionKey: 'teleport_fakeout', notes: 'First relocation reads.' },
  9: { templateKey: 'Corridor', compositionKey: 'bomber_priority', notes: 'Pre-boss target hierarchy exam.' },
  10: { templateKey: 'TheNest', compositionKey: 'bomber_priority', notes: 'Boss arena owned by Hive Queen flow.' },
  11: { templateKey: 'Ring', compositionKey: 'sniper_ring', notes: 'Protect the outer route.' },
  12: { templateKey: 'Fortress', compositionKey: 'fortress_anchor', enemyCap: 13, burstProfile: { bursts: 2, interval: 0.48, pause: 2.8 }, notes: 'Anchor wave with lower concurrency.' },
  13: { templateKey: 'Gauntlet', compositionKey: 'route_commitment', notes: 'Commit to a route.' },
  14: { templateKey: 'Zigzag', compositionKey: 'geometry_tool', notes: 'Cross lines only when safe.' },
  15: { templateKey: 'Arena', compositionKey: 'bomber_priority', notes: 'Safe path versus fast path.' },
  16: { templateKey: 'ReflectionChamber', compositionKey: 'geometry_tool', enemyCap: 12, burstProfile: { bursts: 2, interval: 0.44, pause: 2.5 }, notes: 'Explicit geometry-tool wave.' },
  17: { templateKey: 'Fortress', compositionKey: 'flood_management', notes: 'Solve target hierarchy fast.' },
  18: { templateKey: 'SplitField', compositionKey: 'crossing_test', enemyCap: 12, burstProfile: { bursts: 2, interval: 0.44, pause: 2.6 }, notes: 'Crossing timing problem.' },
  19: { templateKey: 'Labyrinth', compositionKey: 'attrition_labyrinth', notes: 'Preserve escape vectors.' },
  20: { templateKey: 'TheProcessor', compositionKey: 'attrition_labyrinth', notes: 'Boss arena owned by Nexus Core flow.' },
  21: { templateKey: 'Pinch', compositionKey: 'void_rotation', notes: 'Begin late-story spatial dread.' },
  22: { templateKey: 'Spiral', compositionKey: 'teleport_fakeout', notes: 'Safe route versus tempo route.' },
  23: { templateKey: 'Arena', compositionKey: 'crossing_test', notes: 'Kill line-breakers first.' },
  24: { templateKey: 'ReflectionChamber', compositionKey: 'geometry_tool', enemyCap: 13, burstProfile: { bursts: 2, interval: 0.40, pause: 2.4 }, notes: 'High-clarity mastery wave.' },
  25: { templateKey: 'SplitField', compositionKey: 'fortress_anchor', enemyCap: 13, notes: 'Break the anchor, then cross.' },
  26: { templateKey: 'Labyrinth', compositionKey: 'attrition_labyrinth', notes: 'Read dead zones before they trap you.' },
  27: { templateKey: 'Pinch', compositionKey: 'final_exam', enemyCap: 13, notes: 'Low-space risk management.' },
  28: { templateKey: 'Spiral', compositionKey: 'flood_management', notes: 'Multi-problem solve under tempo.' },
  29: { templateKey: 'RiftLite', compositionKey: 'final_exam', enemyCap: 13, burstProfile: { bursts: 2, interval: 0.36, pause: 2.2 }, notes: 'Final pre-boss exam.' },
  30: { templateKey: 'TheRift', compositionKey: 'final_exam', notes: 'Boss arena owned by Void Warden flow.' },
};

const STORY_WAVE_SUBTITLES = {
  1: 'Find your drift.',
  2: 'Hold your lane.',
  3: 'Stay smooth under chase.',
  4: 'Read the corridor.',
  5: 'Clean the fragments.',
  6: 'Route before greed.',
  7: 'Control the center.',
  8: 'Watch the relocations.',
  9: 'Break the bomb line.',
  10: 'The nest stirs.',
  11: 'Protect the outer route.',
  12: 'Break the anchor.',
  13: 'Commit to the gauntlet.',
  14: 'Cross only when safe.',
  15: 'Safe path or fast path.',
  16: 'Turn the geometry on them.',
  17: 'Solve the flood fast.',
  18: 'Time the crossing.',
  19: 'Preserve an escape vector.',
  20: 'Enter the processor.',
  21: 'Do not get pinched.',
  22: 'Spiral for tempo.',
  23: 'Kill the line-breakers.',
  24: 'Reflect and punish.',
  25: 'Break, then cross.',
  26: 'Read the dead zones.',
  27: 'Protect your space.',
  28: 'Keep the route alive.',
  29: 'Final exam.',
  30: 'Face the void.',
};

const ENDLESS_WAVE_CYCLES = [
  [
    { templateKey: 'Ring', compositionKey: 'sniper_ring', enemyCap: 14, burstProfile: { bursts: 2, interval: 0.36, pause: 1.8 }, subtitle: 'Guard the orbit.' },
    { templateKey: 'Fortress', compositionKey: 'fortress_anchor', enemyCap: 14, burstProfile: { bursts: 2, interval: 0.35, pause: 1.8 }, subtitle: 'Break the anchor fast.' },
    { templateKey: 'ReflectionChamber', compositionKey: 'geometry_tool', enemyCap: 13, burstProfile: { bursts: 2, interval: 0.34, pause: 1.7 }, subtitle: 'Turn the chamber on them.' },
    { templateKey: 'SplitField', compositionKey: 'crossing_test', enemyCap: 13, burstProfile: { bursts: 2, interval: 0.34, pause: 1.7 }, subtitle: 'Cross on your terms.' },
    { templateKey: 'Gauntlet', compositionKey: 'route_commitment', enemyCap: 14, burstProfile: { bursts: 3, interval: 0.33, pause: 1.7 }, subtitle: 'Commit or get trapped.' },
    { templateKey: 'Labyrinth', compositionKey: 'attrition_labyrinth', enemyCap: 14, burstProfile: { bursts: 3, interval: 0.32, pause: 1.6 }, subtitle: 'Do not lose the exit.' },
    { templateKey: 'Pinch', compositionKey: 'void_rotation', enemyCap: 14, burstProfile: { bursts: 3, interval: 0.31, pause: 1.6 }, subtitle: 'Protect your pocket.' },
    { templateKey: 'Spiral', compositionKey: 'flood_management', enemyCap: 14, burstProfile: { bursts: 3, interval: 0.30, pause: 1.5 }, subtitle: 'Spiral for survival.' },
    { templateKey: 'RiftLite', compositionKey: 'final_exam', enemyCap: 15, burstProfile: { bursts: 3, interval: 0.29, pause: 1.4 }, subtitle: 'The loop wants you dead.' },
  ],
  [
    { templateKey: 'Corridor', compositionKey: 'tracker_pressure', enemyCap: 14, burstProfile: { bursts: 2, interval: 0.35, pause: 1.8 }, subtitle: 'Run the corridor clean.' },
    { templateKey: 'Diamond', compositionKey: 'teleport_fakeout', enemyCap: 13, burstProfile: { bursts: 2, interval: 0.34, pause: 1.7 }, subtitle: 'Read the blinks early.' },
    { templateKey: 'Cross', compositionKey: 'zoning_intro', enemyCap: 13, burstProfile: { bursts: 2, interval: 0.34, pause: 1.7 }, subtitle: 'Center is never free.' },
    { templateKey: 'Arena', compositionKey: 'bomber_priority', enemyCap: 14, burstProfile: { bursts: 2, interval: 0.33, pause: 1.6 }, subtitle: 'Break the bomb line.' },
    { templateKey: 'ReflectionChamber', compositionKey: 'geometry_tool', enemyCap: 14, burstProfile: { bursts: 3, interval: 0.32, pause: 1.6 }, subtitle: 'Reflect before you rush.' },
    { templateKey: 'Fortress', compositionKey: 'flood_management', enemyCap: 14, burstProfile: { bursts: 3, interval: 0.31, pause: 1.5 }, subtitle: 'Flood control starts now.' },
    { templateKey: 'SplitField', compositionKey: 'crossing_test', enemyCap: 14, burstProfile: { bursts: 3, interval: 0.30, pause: 1.5 }, subtitle: 'Every crossing costs something.' },
    { templateKey: 'Spiral', compositionKey: 'void_rotation', enemyCap: 14, burstProfile: { bursts: 3, interval: 0.29, pause: 1.4 }, subtitle: 'Keep the route alive.' },
    { templateKey: 'RiftLite', compositionKey: 'final_exam', enemyCap: 15, burstProfile: { bursts: 3, interval: 0.28, pause: 1.3 }, subtitle: 'Corruption learns your rhythm.' },
  ],
  [
    { templateKey: 'Tunnels', compositionKey: 'split_cleanup', enemyCap: 14, burstProfile: { bursts: 2, interval: 0.35, pause: 1.8 }, subtitle: 'Clean the tunnels quickly.' },
    { templateKey: 'Ring', compositionKey: 'sniper_ring', enemyCap: 14, burstProfile: { bursts: 2, interval: 0.34, pause: 1.7 }, subtitle: 'Orbit under pressure.' },
    { templateKey: 'Gauntlet', compositionKey: 'route_commitment', enemyCap: 14, burstProfile: { bursts: 2, interval: 0.33, pause: 1.7 }, subtitle: 'Pick a lane and keep it.' },
    { templateKey: 'Pinch', compositionKey: 'final_exam', enemyCap: 14, burstProfile: { bursts: 3, interval: 0.32, pause: 1.6 }, subtitle: 'Space is the resource.' },
    { templateKey: 'Labyrinth', compositionKey: 'attrition_labyrinth', enemyCap: 14, burstProfile: { bursts: 3, interval: 0.31, pause: 1.5 }, subtitle: 'Dead zones are the enemy.' },
    { templateKey: 'ReflectionChamber', compositionKey: 'geometry_tool', enemyCap: 14, burstProfile: { bursts: 3, interval: 0.30, pause: 1.5 }, subtitle: 'Solve it with angles.' },
    { templateKey: 'Arena', compositionKey: 'crossing_test', enemyCap: 15, burstProfile: { bursts: 3, interval: 0.29, pause: 1.4 }, subtitle: 'Line-breakers first.' },
    { templateKey: 'Spiral', compositionKey: 'flood_management', enemyCap: 15, burstProfile: { bursts: 3, interval: 0.28, pause: 1.3 }, subtitle: 'Stabilize the collapse.' },
    { templateKey: 'RiftLite', compositionKey: 'final_exam', enemyCap: 15, burstProfile: { bursts: 3, interval: 0.27, pause: 1.2 }, subtitle: 'The loop tightens.' },
  ],
];

export function getStoryWavePlanEntry(w) {
  return STORY_WAVE_PLAN[w] || null;
}

export function getStoryWaveSubtitle(w) {
  const subtitle = STORY_WAVE_SUBTITLES[w];
  return subtitle || '';
}

function getEndlessWavePlanEntry(w) {
  if (!G.isEndlessRun || w <= 30) return null;
  const endlessIndex = w - 31;
  const posInCycle = endlessIndex % 10;
  if (posInCycle === 9) return null;

  const cycleTheme = Math.floor(endlessIndex / 10) % ENDLESS_WAVE_CYCLES.length;
  const cycleDepth = Math.floor(endlessIndex / 30);
  const base = ENDLESS_WAVE_CYCLES[cycleTheme][posInCycle];
  if (!base) return null;

  const burstProfile = base.burstProfile ? {
    ...base.burstProfile,
    interval: Math.max(0.22, base.burstProfile.interval - cycleDepth * 0.015),
    pause: Math.max(0.95, base.burstProfile.pause - cycleDepth * 0.10),
  } : undefined;

  return {
    ...base,
    enemyCap: Math.min(17, (base.enemyCap || 14) + Math.min(2, cycleDepth)),
    burstProfile,
    notes: 'Endless authored cycle',
  };
}

export function getWavePlanEntry(w) {
  return getStoryWavePlanEntry(w) || getEndlessWavePlanEntry(w);
}

export function getWaveSubtitle(w) {
  const storySubtitle = getStoryWaveSubtitle(w);
  if (storySubtitle) return storySubtitle;
  return getEndlessWavePlanEntry(w)?.subtitle || '';
}

function getWaveBurstProfile(w) {
  return getWavePlanEntry(w)?.burstProfile || null;
}

function pickFromWeightedMix(mix) {
  const entries = Object.entries(mix).filter(([, weight]) => weight > 0);
  if (entries.length === 0) return 'drifter';
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let r = Math.random() * total;
  for (const [type, weight] of entries) {
    r -= weight;
    if (r <= 0) return type;
  }
  return entries[entries.length - 1][0];
}

// --- Wave Configuration (updated difficulty scaling) ---
export function getWaveDuration(w) {
  if (w <= 3) return 15;
  if (w <= 7) return 12;
  if (w <= 12) return Math.max(10, 12 - (w - 7));
  return 10;
}

// Updated: floor(3 + wave × 1.8), with authored story overrides where needed
export function getEnemyCount(w) {
  const authored = getWavePlanEntry(w);
  if (authored && authored.enemyCount !== undefined) return authored.enemyCount;
  return DEFAULT_ENEMY_COUNT_FORMULA(w);
}

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
  const authored = getWavePlanEntry(w);
  if (authored && authored.compositionKey && COMPOSITION_PRESETS[authored.compositionKey]) {
    return pickFromWeightedMix(COMPOSITION_PRESETS[authored.compositionKey]);
  }
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
  const authored = getWavePlanEntry(w);
  if (authored && authored.enemyCap !== undefined) return authored.enemyCap;
  if (w <= 5) return Math.min(12, getEnemyCount(w));
  if (w <= 8) return 13;
  return 15;
}

// --- Burst-and-Breathe pacing ---
function getInterBurstPause(w) {
  const burstProfile = getWaveBurstProfile(w);
  if (burstProfile && burstProfile.pause !== undefined) return burstProfile.pause;
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
  const burstProfile = getWaveBurstProfile(G.wave);
  G.waveEnemiesLeft = total;
  G.waveSpawnTimer = 0;
  G.waveTimer = 0;

  // Burst-and-breathe: split wave into authored or default bursts
  const burstCount = Math.max(1, burstProfile?.bursts || 3);
  const perBurst = Math.ceil(total / burstCount);
  G.spawnBursts = [];
  let remaining = total;
  for (let i = 0; i < burstCount; i++) {
    const count = Math.min(perBurst, remaining);
    if (count <= 0) break;
    G.spawnBursts.push({ count, spawned: 0, done: false });
    remaining -= count;
  }
  G.currentBurst = 0;
  G.burstSpawnTimer = 0;
  G.burstPauseTimer = 0;
  G.inBurstPause = false;
  G.spawnInterval = burstProfile?.interval || 0.4; // intra-burst interval

  // Spawn queue for concurrent cap
  G.spawnQueue = [];
  G.spawnQueueTimer = 0;
  G.enemyCap = getEnemyCap(G.wave);

  if (G.wave === 1 && !G.tutorialDismissed) {
    G.state = STATE.TUTORIAL;
    G.waveStartFlash = 0;
  }
  else { G.state = STATE.PLAYING; }
  G.floatTexts.push({ text: 'WAVE ' + G.wave, x: W / 2, y: H / 2, size: 48, alpha: 1,
    phase: 'scale', scaleT: 0, color: '#ffffff', glowColor: '#00ffff', vy: 0, life: 1.8 });
  const subtitle = getWaveSubtitle(G.wave);
  if (subtitle) {
    G.floatTexts.push({ text: subtitle, x: W / 2, y: H / 2 + 38, size: 16, alpha: 0.92,
      phase: 'scale', scaleT: 0, color: '#9adfff', glowColor: '#2f7fb6', vy: 0, life: 1.8 });
  }
  events.emit('waveStarted', { wave: G.wave });
}

// Update burst-and-breathe spawning. Called each frame from game.js update.
// Returns true when all burst enemies have been spawned (remaining may be in queue).
export function updateBurstSpawning(dt, spawnFn) {
  if (!G.spawnBursts || G.spawnBursts.length === 0) return true;

  let aliveCount = G.enemies.filter(e => e.alive).length;

  // Process spawn queue first (enemies waiting due to cap)
  if (G.spawnQueue && G.spawnQueue.length > 0) {
    G.spawnQueueTimer += dt;
    if (G.spawnQueueTimer >= 0.5 && aliveCount < G.enemyCap) {
      const type = G.spawnQueue.shift();
      spawnFn(type);
      G.spawnQueueTimer = 0;
      aliveCount++;
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
      aliveCount++;
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

function getBurstLabel(current, total) {
  if (total <= 1) return 'Wave Incoming';
  if (current >= total) return 'Final Push';
  if (current === 1) return 'Opening Push';
  if (current === 2 && total === 3) return 'Pressure Rising';
  return 'Push ' + current + ' of ' + total;
}

// --- Burst Text (called by burst-and-breathe pacing system) ---
// Shows a readable pacing cue at the top of the screen, fades over 0.8s.
// Style: same font family as wave announce but smaller, white, no glow.
export function spawnBurstText(current, total) {
  G.floatTexts.push({
    text: getBurstLabel(current, total),
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
