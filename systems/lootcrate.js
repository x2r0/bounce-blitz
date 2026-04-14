'use strict';

import { W, H, FONT, BOOST_COLORS, STAMINA_MAX } from '../config.js';
import { dist } from '../utils.js';
import { G } from '../state.js';
import { ctx } from '../canvas.js';
import { spawnParticles } from './particles.js';
import { spawnCombatText } from './combat-text.js';
import { killEnemy, hitEnemy } from '../entities/enemy.js';
import { events } from '../eventbus.js';

// --- Boost Definitions ---
export const BOOST_DEFS = [
  { type: 'screenNuke',    weight: 20, instant: true,  duration: 0,   label: 'NUKE!' },
  { type: 'invincibility', weight: 20, instant: false, duration: 5.0, label: 'INVINCIBLE!' },
  { type: 'healthRestore', weight: 30, instant: true,  duration: 0,   label: 'HEAL!' },
  { type: 'pointFrenzy',   weight: 18, instant: false, duration: 8.0, label: 'FRENZY!' },
  { type: 'staminaBurst',  weight: 12, instant: false, duration: 6.0, label: 'STAMINA!' },
];

// Hardcore: healthRestore → pointFrenzy (weight redistributed)
const BOOST_DEFS_HARDCORE = [
  { type: 'screenNuke',    weight: 20, instant: true,  duration: 0,   label: 'NUKE!' },
  { type: 'invincibility', weight: 20, instant: false, duration: 5.0, label: 'INVINCIBLE!' },
  { type: 'pointFrenzy',   weight: 48, instant: false, duration: 8.0, label: 'FRENZY!' },
  { type: 'staminaBurst',  weight: 12, instant: false, duration: 6.0, label: 'STAMINA!' },
];

const TOTAL_WEIGHT = BOOST_DEFS.reduce((s, b) => s + b.weight, 0);
const TOTAL_WEIGHT_HARDCORE = BOOST_DEFS_HARDCORE.reduce((s, b) => s + b.weight, 0);

function rollBoostType() {
  const defs = G.isHardcore ? BOOST_DEFS_HARDCORE : BOOST_DEFS;
  const total = G.isHardcore ? TOTAL_WEIGHT_HARDCORE : TOTAL_WEIGHT;
  let r = Math.random() * total;
  for (const b of defs) {
    r -= b.weight;
    if (r <= 0) return b;
  }
  return defs[0];
}

// --- Direct Boost Spawn Logic ---
// Called on every enemy kill; tracks kill counter and rolls for boost spawn
export function onEnemyKilled(x, y) {
  if (G.wave < 3) return;
  G.boostKillCounter++;
  if (G.boostKillCounter < 12) return;
  G.boostKillCounter = 0;

  // Max 2 boost pickups on field
  if (G.boostPickups.length >= 2) return;

  // Roll chance: base 25% + 2.5% per wave above 3, cap 50%
  const chance = Math.min(0.50, 0.25 + (G.wave - 3) * 0.025);
  if (Math.random() > chance) return;

  spawnBoostPickup(x, y);
}

// Spawn a boost pickup at a position (with safety margin from edges/player)
function spawnBoostPickup(x, y) {
  // Find valid position near the given coordinates
  let bx = x, by = y, attempts = 0;
  // Clamp to arena bounds with margin
  bx = Math.max(80, Math.min(W - 80, bx));
  by = Math.max(80, Math.min(H - 80, by));
  // Push away from player if too close
  while (dist(G.player, { x: bx, y: by }) < 60 && attempts < 20) {
    bx = 80 + Math.random() * (W - 160);
    by = 80 + Math.random() * (H - 160);
    attempts++;
  }

  const boost = rollBoostType();
  const bc = BOOST_COLORS[boost.type];
  G.boostPickups.push({
    type: boost.type,
    x: bx, y: by,
    r: 14, lifetime: 10.0,
    color: bc.color, label: bc.label,
  });
}

// Guaranteed boss drop boost pickup
export function spawnBossBoost(x, y) {
  const boost = rollBoostType();
  const bc = BOOST_COLORS[boost.type];
  G.boostPickups.push({
    type: boost.type,
    x, y,
    r: 14, lifetime: 10.0,
    color: bc.color, label: bc.label,
  });
}

// --- Boost Pickup Update ---
export function updateBoostPickups(dt) {
  const player = G.player;
  for (let i = G.boostPickups.length - 1; i >= 0; i--) {
    const b = G.boostPickups[i];
    b.lifetime -= dt;
    if (b.lifetime <= 0) { G.boostPickups.splice(i, 1); continue; }

    // Collection check
    if (dist(player, b) < player.r + b.r) {
      collectBoost(b);
      G.boostPickups.splice(i, 1);
    }
  }
}

// --- Boost Collection ---
function collectBoost(pickup) {
  const def = BOOST_DEFS.find(d => d.type === pickup.type);
  if (!def) return;

  events.emit('boostCollected', { type: pickup.type });
  spawnParticles(pickup.x, pickup.y, pickup.color, 12);

  if (def.instant) {
    applyInstantBoost(pickup.type);
    // Show banner for instant boosts
    G.boostBanner = { label: pickup.label, color: pickup.color, timer: 1.0 };
  } else {
    // Duration boost — replaces any active duration boost
    G.activeBoost = {
      type: pickup.type,
      timer: def.duration,
      maxTimer: def.duration,
      color: pickup.color,
      label: pickup.label,
    };
    applyDurationBoostStart(pickup.type);
  }
}

// --- Instant Boosts ---
function applyInstantBoost(type) {
  const player = G.player;
  if (type === 'screenNuke') {
    // Deal 1 damage to all on-screen enemies
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      if (!e.alive || e.spawnTimer > 0 || e.isFusing) continue;
      if (e.isBoss) continue;
      const canDie = hitEnemy(e, 'nuke');
      if (canDie) killEnemy(e, i, 'nuke');
    }
    // Screen flash
    G.collectFlashTimer = 0.2;
    G.collectFlashAlpha = 0.3;
  } else if (type === 'healthRestore') {
    if (G.isHardcore) {
      // Hardcore: no healing — grant score instead
      G.score += 1000;
      spawnCombatText('+1000', player.x, player.y - 30, { size: 20, color: '#ffdd00', bold: true });
    } else if (player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + 2);
      spawnCombatText('+2 HP', player.x, player.y - 30, { size: 20, color: '#44ff88', bold: true });
    } else {
      G.score += 500;
      spawnCombatText('+500', player.x, player.y - 30, { size: 20, color: '#ffdd00', bold: true });
    }
  }
}

// --- Duration Boost Start Effects ---
function applyDurationBoostStart(type) {
  const player = G.player;
  if (type === 'invincibility') {
    player.invTimer = Math.max(player.invTimer, 0.1); // visual signal
  } else if (type === 'staminaBurst') {
    player.stamina = player.maxStamina || STAMINA_MAX;
  }
}

// --- Active Boost Tick ---
export function updateActiveBoost(dt) {
  // Duration boost timer
  if (G.activeBoost) {
    G.activeBoost.timer -= dt;
    if (G.activeBoost.timer <= 0) {
      endActiveBoost();
      G.activeBoost = null;
    }
  }
  // Instant boost banner
  if (G.boostBanner) {
    G.boostBanner.timer -= dt;
    if (G.boostBanner.timer <= 0) G.boostBanner = null;
  }
}

function endActiveBoost() {
  // Clean up any ongoing effects when boost expires
  // (effects are checked live via isBoostActive, so no explicit cleanup needed)
}

// --- Query helpers for game systems ---
export function isBoostActive(type) {
  return G.activeBoost && G.activeBoost.type === type;
}

export function getScoreMultiplier() {
  if (isBoostActive('pointFrenzy')) return 3;
  return 1;
}

export function isInvincibleFromBoost() {
  return isBoostActive('invincibility');
}

export function getBoostSpeedBonus() {
  if (isBoostActive('invincibility')) return 0.2;
  return 0;
}

export function isFreeDash() {
  return isBoostActive('staminaBurst');
}

// --- Wave End Cleanup ---
export function clearBoostsOnWaveEnd() {
  G.activeBoost = null;
  G.boostBanner = null;
  G.boostPickups = [];
}

// --- Draw: Boost Pickups ---
export function drawBoostPickups() {
  for (const b of G.boostPickups) {
    const blinking = b.lifetime <= 3.0;
    const blinkOn = !blinking || Math.floor(b.lifetime * 6) % 2 === 0;
    if (!blinkOn) continue;

    const alpha = b.lifetime <= 2.0 ? Math.max(0.3, b.lifetime / 2.0) : 1;
    const pulse = 0.8 + 0.2 * Math.sin(Date.now() / 300 * Math.PI);

    ctx.save();
    ctx.globalAlpha = alpha;

    // Expanding ring
    const ringPhase = (Date.now() % 1500) / 1500;
    const ringR = b.r + ringPhase * 14;
    ctx.globalAlpha = alpha * (1 - ringPhase) * 0.4;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(b.x, b.y, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // Outer glow
    ctx.globalAlpha = alpha * pulse;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright core
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Icon overlay at 60% scale
    ctx.globalAlpha = alpha * 0.9;
    const iconR = b.r * 0.6;
    drawBoostIcon(b.x, b.y, iconR, b.type, b.color);

    ctx.restore();
  }
}

// --- Icon overlay shapes per boost type ---
function drawBoostIcon(x, y, r, type, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  if (type === 'screenNuke') {
    // 6-point starburst
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.4;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (type === 'invincibility') {
    // Star outline (5-point)
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.4;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  } else if (type === 'healthRestore') {
    // Heart shape
    const s = r * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.6);
    ctx.bezierCurveTo(x - s, y - s * 0.2, x - s * 0.5, y - s, x, y - s * 0.3);
    ctx.bezierCurveTo(x + s * 0.5, y - s, x + s, y - s * 0.2, x, y + s * 0.6);
    ctx.closePath();
    ctx.fill();
  } else if (type === 'pointFrenzy') {
    // Diamond shape
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.6, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.6, y);
    ctx.closePath();
    ctx.fill();
  } else if (type === 'staminaBurst') {
    // Lightning bolt
    ctx.beginPath();
    ctx.moveTo(x + r * 0.15, y - r);
    ctx.lineTo(x - r * 0.4, y + r * 0.1);
    ctx.lineTo(x + r * 0.05, y + r * 0.1);
    ctx.lineTo(x - r * 0.15, y + r);
    ctx.lineTo(x + r * 0.4, y - r * 0.1);
    ctx.lineTo(x - r * 0.05, y - r * 0.1);
    ctx.closePath();
    ctx.fill();
  }
}

// --- Draw: Active Boost Timer Bar (HUD) ---
export function drawBoostTimerBar() {
  // Duration boost bar
  if (G.activeBoost) {
    const ab = G.activeBoost;
    const barW = 200, barH = 8;
    const barX = (W - barW) / 2;
    const barY = 12;
    const fill = ab.timer / ab.maxTimer;
    const flash = ab.timer <= 1.5 && Math.floor(ab.timer * 6) % 2 === 0;

    ctx.save();

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.roundRect(barX - 2, barY - 2, barW + 4, barH + 4, 4);
    ctx.fill();

    // Fill bar (drains left to right)
    ctx.fillStyle = flash ? '#ffffff' : ab.color;
    ctx.shadowColor = ab.color;
    ctx.shadowBlur = flash ? 12 : 6;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * fill, barH, 3);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Label right of bar
    ctx.font = 'bold 10px ' + FONT;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = ab.color;
    ctx.fillText(ab.label.replace('!', ''), barX + barW + 4, barY + barH / 2);

    // Timer text left of bar
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(ab.timer.toFixed(1) + 's', barX - 30, barY + barH / 2);

    ctx.restore();
  }

  // Instant boost banner (centered, fades out)
  if (G.boostBanner) {
    const bb = G.boostBanner;
    const alpha = Math.min(1, bb.timer / 0.3);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 22px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = bb.color;
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = bb.color;
    ctx.fillText(bb.label, W / 2, 30);
    ctx.shadowBlur = 0;
    ctx.fillText(bb.label, W / 2, 30);
    ctx.restore();
  }
}
