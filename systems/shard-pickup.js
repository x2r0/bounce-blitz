'use strict';

import { W, H, FONT } from '../config.js';
import { dist, rand, randInt } from '../utils.js';
import { G } from '../state.js';
import { ctx } from '../canvas.js';
import { spawnCombatText } from './combat-text.js';
import { sfxShardCollect } from './audio.js';

// --- Shard Drop Tables (per design spec BROA-62) ---
const SHARD_DROP_TABLE = {
  drifter:        { value: 1, chance: 0.50 },
  tracker:        { value: 1, chance: 0.60 },
  splitter:       { value: 1, chance: 0.65 },
  mini_splitter:  { value: 0, chance: 0 },
  pulser:         { value: 2, chance: 0.55 },
  teleporter:     { value: 1, chance: 0.70 },
  bomber:         { value: 2, chance: 0.60 },
  spawner:        { value: 3, chance: 0.75 },
  spawner_minion: { value: 0, chance: 0 },
  sniper:         { value: 2, chance: 0.70 },
};

const MAX_SHARD_PICKUPS = 40;
const SHARD_DESPAWN_TIME = 8.0;
const SHARD_BLINK_START = 2.0; // seconds before despawn to start blinking
const SHARD_PICKUP_RADIUS = 24;
const SHARD_PICKUP_RADIUS_MAGNET_UPGRADE = 40;
const SHARD_SIZE = 8;
const SHARD_BOB_AMPLITUDE = 3;
const SHARD_BOB_FREQUENCY = 2; // Hz
const SHARD_SCATTER_MIN = 20;
const SHARD_SCATTER_MAX = 50;

// Pitch escalation for rapid pickups
let lastPickupTime = 0;
let pickupChain = 0;

// --- Spawn shard pickup from enemy death ---
export function rollEnemyShardDrop(enemyType, x, y) {
  const entry = SHARD_DROP_TABLE[enemyType];
  if (!entry || entry.value === 0 || entry.chance === 0) return;
  if (Math.random() > entry.chance) return;

  const angle = rand(0, Math.PI * 2);
  const scatter = rand(SHARD_SCATTER_MIN, SHARD_SCATTER_MAX);
  const sx = x + Math.cos(angle) * scatter;
  const sy = y + Math.sin(angle) * scatter;

  spawnShardPickup(sx, sy, entry.value);
}

// --- Spawn shard pickups from crate destruction ---
export function spawnCrateShards(x, y) {
  const count = randInt(5, 8);
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + rand(-0.3, 0.3);
    const scatter = rand(30, 70);
    const sx = x + Math.cos(angle) * scatter;
    const sy = y + Math.sin(angle) * scatter;
    spawnShardPickup(sx, sy, 2);
  }
}

// --- Core spawn function ---
function spawnShardPickup(x, y, value) {
  // Clamp to arena bounds
  x = Math.max(SHARD_SIZE, Math.min(W - SHARD_SIZE, x));
  y = Math.max(SHARD_SIZE, Math.min(H - SHARD_SIZE, y));

  // Enforce max cap — despawn oldest if exceeded
  while (G.shardPickups.length >= MAX_SHARD_PICKUPS) {
    G.shardPickups.shift();
  }

  G.shardPickups.push({
    x, y, value,
    spawnTime: Date.now(),
    lifetime: SHARD_DESPAWN_TIME,
    collected: false,
  });
}

// --- Update shard pickups (called each frame) ---
export function updateShardPickups(dt) {
  const player = G.player;
  const hasShardMagnetUpgrade = G.meta.unlocks.includes(7);
  const pickupRadius = hasShardMagnetUpgrade ? SHARD_PICKUP_RADIUS_MAGNET_UPGRADE : SHARD_PICKUP_RADIUS;

  // Magnet power pulls shards
  if (player.magnetActive) {
    const magRadius = player.magnetRadius || 80;
    const magSpeed = player.magnetSpeed || 150;
    for (const s of G.shardPickups) {
      if (s.collected) continue;
      const d = dist(player, s);
      if (d < magRadius) {
        const dx = player.x - s.x;
        const dy = player.y - s.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        s.x += (dx / len) * magSpeed * dt;
        s.y += (dy / len) * magSpeed * dt;
      }
    }
  }

  for (let i = G.shardPickups.length - 1; i >= 0; i--) {
    const s = G.shardPickups[i];
    s.lifetime -= dt;

    // Despawn
    if (s.lifetime <= 0) {
      G.shardPickups.splice(i, 1);
      continue;
    }

    // Collection check
    if (dist(player, s) < player.r + pickupRadius) {
      collectShard(s);
      G.shardPickups.splice(i, 1);
    }
  }
}

function collectShard(shard) {
  G.shardsCollected += shard.value;

  // Pickup chain for ascending pitch SFX
  const now = Date.now();
  if (now - lastPickupTime < 300) {
    pickupChain++;
  } else {
    pickupChain = 0;
  }
  lastPickupTime = now;

  sfxShardCollect();

  // Combat text popup
  spawnCombatText('+' + shard.value, shard.x, shard.y, {
    size: 12, color: '#ffffff', bold: true, life: 0.4,
  });

  // HUD pulse
  G.shardHudPulse = 0.2;
}

// --- Draw shard pickups ---
export function drawShardPickups() {
  const now = Date.now();

  for (const s of G.shardPickups) {
    // Blink warning when about to despawn
    if (s.lifetime <= SHARD_BLINK_START) {
      const blinkOn = Math.floor(s.lifetime * 6) % 2 === 0; // 3 Hz blink
      if (!blinkOn) continue;
    }

    // Vertical bobble
    const elapsed = (now - s.spawnTime) / 1000;
    const bobY = Math.sin(elapsed * SHARD_BOB_FREQUENCY * Math.PI * 2) * SHARD_BOB_AMPLITUDE;

    // Glow pulse
    const glowAlpha = 0.6 + 0.4 * Math.sin(elapsed * 1.5 * Math.PI * 2);

    const dx = s.x;
    const dy = s.y + bobY;
    const half = SHARD_SIZE / 2;

    ctx.save();
    ctx.globalAlpha = glowAlpha;

    // Outer glow
    ctx.shadowColor = '#00E5FF';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Diamond shape
    ctx.fillStyle = '#00E5FF';
    ctx.beginPath();
    ctx.moveTo(dx, dy - half);        // top
    ctx.lineTo(dx + half, dy);        // right
    ctx.lineTo(dx, dy + half);        // bottom
    ctx.lineTo(dx - half, dy);        // left
    ctx.closePath();
    ctx.fill();

    // White inner glow
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const innerHalf = half * 0.4;
    ctx.moveTo(dx, dy - innerHalf);
    ctx.lineTo(dx + innerHalf, dy);
    ctx.lineTo(dx, dy + innerHalf);
    ctx.lineTo(dx - innerHalf, dy);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

// --- Clear shards on wave end (keep them — they persist) ---
// Shards persist across wave breaks per design. No clearOnWaveEnd needed.

// --- Reset pickup chain (for audio) ---
export function resetShardPickupChain() {
  lastPickupTime = 0;
  pickupChain = 0;
}
