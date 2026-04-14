'use strict';

import { G } from '../state.js';
import { ctx } from '../canvas.js';
import { getDashProjection } from './input.js';
import { getPlayerPowerLevel } from './powers.js';
import { getPlayerAccentColor } from '../entities/player.js';

// --- Pre-allocated result arrays (no per-frame allocations) ---
const killPreviewSlots = new Array(20);   // enemy indices
const collectPreviewSlots = new Array(50); // {pool, index, color, r}
for (let i = 0; i < 50; i++) collectPreviewSlots[i] = { pool: '', index: 0, color: '', r: 0 };
let killPreviewCount = 0;
let collectPreviewCount = 0;

// --- Collection radii per spec ---
const SHARD_COLLECT_RADIUS = 24;
const SHARD_COLLECT_RADIUS_MAGNET = 40;
const BOOST_COLLECT_RADIUS = 14;
const STAMINA_ORB_COLLECT_RADIUS = 8;
const POWER_GEM_COLLECT_RADIUS = 12;

// --- Shard color ---
const SHARD_RING_COLOR = '#00E5FF';
const STAMINA_ORB_RING_COLOR = '#44ff88';

// --- Pulse timing ---
const ENEMY_PULSE_PERIOD = 0.4;  // 400ms
const COLLECT_PULSE_PERIOD = 0.6; // 600ms

// --- Point-to-segment squared distance ---
function ptSegDistSq(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 0.001) {
    const ex = px - x1, ey = py - y1;
    return ex * ex + ey * ey;
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = x1 + t * dx, cy = y1 + t * dy;
  const ex = px - cx, ey = py - cy;
  return ex * ex + ey * ey;
}

// --- Pre-allocated cumulative lengths array (max 5 = maxBounces + 1) ---
const _cumLengths = new Array(5);

// --- Compute cumulative segment lengths (for kill zone trimming) ---
function getSegmentCumLengths(segments) {
  let total = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    total += Math.sqrt(dx * dx + dy * dy);
    _cumLengths[i] = total;
  }
  return _cumLengths;
}

// --- Test point against path segments with radius, up to maxDist along path ---
function isNearPath(px, py, radius, segments, cumLengths, maxDist) {
  const rSq = radius * radius;
  let prevCum = 0;
  for (let i = 0; i < segments.length; i++) {
    const segLen = cumLengths[i] - prevCum;
    // If this segment starts beyond maxDist, stop
    if (prevCum >= maxDist) break;

    const s = segments[i];
    let sx1 = s.x1, sy1 = s.y1, sx2 = s.x2, sy2 = s.y2;

    // If segment extends beyond maxDist, trim it
    if (cumLengths[i] > maxDist && segLen > 0.001) {
      const frac = (maxDist - prevCum) / segLen;
      sx2 = sx1 + (sx2 - sx1) * frac;
      sy2 = sy1 + (sy2 - sy1) * frac;
    }

    if (ptSegDistSq(px, py, sx1, sy1, sx2, sy2) <= rSq) return true;
    prevCum = cumLengths[i];
  }
  return false;
}

// --- Test point against full path (all segments) ---
function isNearFullPath(px, py, radius, segments) {
  const rSq = radius * radius;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (ptSegDistSq(px, py, s.x1, s.y1, s.x2, s.y2) <= rSq) return true;
  }
  return false;
}

// --- Shield-pierce check for preview (mirrors enemy.js isShieldPiercing for dash source) ---
function canPierceShield() {
  const player = G.player;
  if (player.overdriveTimer > 0) return true;
  if (player.surgeActive && getPlayerPowerLevel('surge') >= 2) return true;
  // Evolution powers pierce shields
  const evos = ['reflectiveShield', 'gravityBomb', 'thunderDash', 'novaCore'];
  for (let i = 0; i < evos.length; i++) {
    if (player.powers.find(p => p.id === evos[i])) return true;
  }
  return false;
}

// --- Compute AABB of path segments with padding ---
function getPathAABB(segments, padding) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s.x1 < minX) minX = s.x1;
    if (s.x2 < minX) minX = s.x2;
    if (s.y1 < minY) minY = s.y1;
    if (s.y2 < minY) minY = s.y2;
    if (s.x1 > maxX) maxX = s.x1;
    if (s.x2 > maxX) maxX = s.x2;
    if (s.y1 > maxY) maxY = s.y1;
    if (s.y2 > maxY) maxY = s.y2;
  }
  return {
    x1: minX - padding, y1: minY - padding,
    x2: maxX + padding, y2: maxY + padding,
  };
}

// --- Max path length from segments ---
function getMaxPathLength(segments) {
  let total = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

// ==========================================================================
// UPDATE — compute which enemies / collectibles are in the preview this frame
// ==========================================================================
export function updateDashPreview() {
  killPreviewCount = 0;
  collectPreviewCount = 0;

  const proj = getDashProjection();
  if (!proj) return; // not charging or aim cancelled

  const player = G.player;
  const segments = proj.segments;
  if (!segments || segments.length === 0) return;

  const killDistance = proj.dist; // speed * grace
  const maxPathLen = getMaxPathLength(segments);
  const cumLengths = getSegmentCumLengths(segments);

  // Shield-pierce cached once per frame
  const pierceShield = canPierceShield();
  const isOverdrive = player.overdriveTimer > 0;
  const isSurge = player.surgeActive && player.surgeKillsRemaining !== 0;

  // Shard magnet upgrade check
  const hasShardMagnet = G.meta.unlocks.includes(7);
  const shardCollectR = hasShardMagnet ? SHARD_COLLECT_RADIUS_MAGNET : SHARD_COLLECT_RADIUS;

  // --- 3-step spatial cull ---
  // Step 1: radius cull threshold
  const radiusCullDist = maxPathLen + 56; // 56 = max collection radius (shard magnet)
  const radiusCullDistSq = radiusCullDist * radiusCullDist;
  const px = player.x, py = player.y;

  // Step 2: AABB
  const aabb = getPathAABB(segments, 56);

  // ---- ENEMIES ----
  const enemies = G.enemies;
  for (let i = 0; i < enemies.length && killPreviewCount < 20; i++) {
    const e = enemies[i];
    if (!e.alive) continue;
    if (e.spawnTimer > 0) continue;

    // Edge case: invulnerable enemies not highlighted
    if (e.invTimer > 0) continue;

    // Edge case: bosses never highlighted
    if (e.isBoss) continue;

    // Step 1: radius cull
    const edx = e.x - px, edy = e.y - py;
    if (edx * edx + edy * edy > radiusCullDistSq) continue;

    // Step 2: AABB cull
    if (e.x < aabb.x1 - e.r || e.x > aabb.x2 + e.r ||
        e.y < aabb.y1 - e.r || e.y > aabb.y2 + e.r) continue;

    // Step 3: segment intersection (kill zone only, up to killDistance)
    const killZoneR = player.r + e.r;
    if (!isNearPath(e.x, e.y, killZoneR, segments, cumLengths, killDistance)) continue;

    // --- Can-kill determination ---
    // Overdrive: kills everything (except bosses, already filtered)
    if (isOverdrive) {
      // Overdrive one-shots all including spawners (hp=2)
      killPreviewSlots[killPreviewCount++] = i;
      continue;
    }

    // Multi-HP enemies (spawner hp=2) — not killable without Overdrive
    if (e.hp > 1) continue;

    // Surge active with kills remaining — kills if speed threshold met (always true during dash)
    if (isSurge) {
      killPreviewSlots[killPreviewCount++] = i;
      continue;
    }

    // Shield check
    if (e.shield && e.shieldHp > 0) {
      // Frozen enemies shatter through shields
      if (e.freezeTimer > 0) {
        killPreviewSlots[killPreviewCount++] = i;
        continue;
      }
      if (!pierceShield) continue; // shielded, no pierce = not killable
    }

    // HP = 1, no shield (or pierced) — killable
    killPreviewSlots[killPreviewCount++] = i;
  }

  // ---- COLLECTIBLES: Shards ----
  const shards = G.shardPickups;
  const shardR = player.r + shardCollectR;
  for (let i = 0; i < shards.length && collectPreviewCount < 50; i++) {
    const s = shards[i];
    if (s.collected) continue;

    // Step 1: radius cull
    const sdx = s.x - px, sdy = s.y - py;
    if (sdx * sdx + sdy * sdy > radiusCullDistSq) continue;

    // Step 2: AABB cull
    if (s.x < aabb.x1 || s.x > aabb.x2 || s.y < aabb.y1 || s.y > aabb.y2) continue;

    // Step 3: full path intersection
    if (!isNearFullPath(s.x, s.y, shardR, segments)) continue;

    const slot = collectPreviewSlots[collectPreviewCount++];
    slot.pool = 'shard'; slot.index = i; slot.color = SHARD_RING_COLOR; slot.r = 8;
  }

  // ---- COLLECTIBLES: Boost Pickups ----
  const boosts = G.boostPickups;
  const boostR = player.r + BOOST_COLLECT_RADIUS;
  for (let i = 0; i < boosts.length && collectPreviewCount < 50; i++) {
    const b = boosts[i];

    const bdx2 = b.x - px, bdy2 = b.y - py;
    if (bdx2 * bdx2 + bdy2 * bdy2 > radiusCullDistSq) continue;
    if (b.x < aabb.x1 || b.x > aabb.x2 || b.y < aabb.y1 || b.y > aabb.y2) continue;
    if (!isNearFullPath(b.x, b.y, boostR, segments)) continue;

    const slot = collectPreviewSlots[collectPreviewCount++];
    slot.pool = 'boost'; slot.index = i; slot.color = b.color; slot.r = b.r;
  }

  // ---- COLLECTIBLES: Stamina Orbs ----
  if (G.staminaOrbs) {
    const orbR = player.r + STAMINA_ORB_COLLECT_RADIUS;
    for (let i = 0; i < G.staminaOrbs.length && collectPreviewCount < 50; i++) {
      const o = G.staminaOrbs[i];

      const odx = o.x - px, ody = o.y - py;
      if (odx * odx + ody * ody > radiusCullDistSq) continue;
      if (o.x < aabb.x1 || o.x > aabb.x2 || o.y < aabb.y1 || o.y > aabb.y2) continue;
      if (!isNearFullPath(o.x, o.y, orbR, segments)) continue;

      const slot = collectPreviewSlots[collectPreviewCount++];
      slot.pool = 'staminaOrb'; slot.index = i; slot.color = STAMINA_ORB_RING_COLOR; slot.r = o.r;
    }
  }

  // ---- COLLECTIBLES: Power Gems ----
  if (G.powerGems) {
    const gemR = player.r + POWER_GEM_COLLECT_RADIUS;
    for (let i = 0; i < G.powerGems.length && collectPreviewCount < 50; i++) {
      const g = G.powerGems[i];

      const gdx = g.x - px, gdy = g.y - py;
      if (gdx * gdx + gdy * gdy > radiusCullDistSq) continue;
      if (g.x < aabb.x1 || g.x > aabb.x2 || g.y < aabb.y1 || g.y > aabb.y2) continue;
      if (!isNearFullPath(g.x, g.y, gemR, segments)) continue;

      const slot = collectPreviewSlots[collectPreviewCount++];
      slot.pool = 'powerGem'; slot.index = i; slot.color = g.color; slot.r = g.r;
    }
  }
}

// ==========================================================================
// DRAW — render preview highlights (called from game.js draw pipeline)
// ==========================================================================
export function drawDashPreview() {
  if (killPreviewCount === 0 && collectPreviewCount === 0) return;

  const now = Date.now() / 1000; // seconds

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // --- Draw collectible rings first (lower z-order per spec) ---
  for (let i = 0; i < collectPreviewCount; i++) {
    const entry = collectPreviewSlots[i];
    let item;
    if (entry.pool === 'shard') item = G.shardPickups[entry.index];
    else if (entry.pool === 'boost') item = G.boostPickups[entry.index];
    else if (entry.pool === 'staminaOrb') item = G.staminaOrbs[entry.index];
    else if (entry.pool === 'powerGem') item = G.powerGems[entry.index];
    if (!item) continue;

    // Pulse: 40%–80% opacity over 600ms
    const pulse = Math.sin(now * Math.PI * 2 / COLLECT_PULSE_PERIOD);
    const alpha = 0.6 + 0.2 * pulse; // 0.4 to 0.8

    const ringR = entry.r + 6;

    ctx.beginPath();
    ctx.arc(item.x, item.y, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = entry.color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // --- Draw enemy kill outlines + crosshairs (higher z-order) ---
  // Use the same accent color as the charged dash line (cyan / surge red / overdrive rainbow)
  const accentColor = getPlayerAccentColor();
  const enemies = G.enemies;
  for (let i = 0; i < killPreviewCount; i++) {
    const eIdx = killPreviewSlots[i];
    const e = enemies[eIdx];
    if (!e || !e.alive) continue;

    // Pulse: 50%–90% opacity over 400ms
    const pulse = Math.sin(now * Math.PI * 2 / ENEMY_PULSE_PERIOD);
    const alpha = 0.7 + 0.2 * pulse; // 0.5 to 0.9

    // Pulsing outline in dash accent color (3px)
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = accentColor;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 3;
    ctx.stroke();

    // 8x8 crosshair icon 6px above enemy center
    const cx = e.x, cy = e.y - e.r - 6;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;

    // Horizontal line (6px total, centered)
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy);
    ctx.lineTo(cx + 3, cy);
    ctx.stroke();

    // Vertical line (6px total, centered)
    ctx.beginPath();
    ctx.moveTo(cx, cy - 3);
    ctx.lineTo(cx, cy + 3);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}
