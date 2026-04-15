'use strict';

import { W, H, CLARITY } from '../config.js';
import { rand, dist, clamp, lerp, easeOutCubic } from '../utils.js';
import { G } from '../state.js';
import { ctx } from '../canvas.js';
import { isBossWave, getBossType } from './wave.js';
import { spawnParticles } from './particles.js';
import { spawnCombatText } from './combat-text.js';
import { events } from '../eventbus.js';
import { POWER_DEFS } from './powers.js';
import { isInvincibleFromBoost } from './lootcrate.js';

// --- Map Modifiers: Obstacle Pillars, Bounce Pads, Hazard Zones ---

export function initArenaModifiers() {
  G.pillars = [];
  G.bouncePads = [];
  G.hazardZones = [];
  G.flatBouncers = [];
  G.staminaOrbs = [];
  G.powerGems = [];
  G.pillarDestroyedCount = 0;
}

// --- Revised Obstacle Formulas (new caps) ---
function getPillarCount(wave)    { return wave < 4 ? 0 : Math.min(3, 1 + Math.floor((wave - 4) / 4)); }
function getBouncePadCount(wave) { return wave < 5 ? 0 : Math.min(3, 1 + Math.floor((wave - 5) / 3)); }
function getFlatBouncerCount(wave){ return wave < 8 ? 0 : Math.min(2, 1 + Math.floor((wave - 8) / 6)); }
function getHazardZoneCount(wave){ return wave < 7 ? 0 : Math.min(2, 1 + Math.floor((wave - 7) / 4)); }
const TOTAL_OBSTACLE_CAP = 8;

// --- Strategic Placement Templates ---
// Each slot: { type, pctX, pctY } or { type, angle, radius } for Ring
// Positions are % of canvas (W=800, H=600). ±30px jitter applied at spawn.
const TEMPLATES = [
  { // 0: Corridor (waves 4-8)
    name: 'Corridor', minWave: 4, maxWave: 8,
    slots: [
      { type: 'pillar',    pctX: 0.50, pctY: 0.25 },
      { type: 'pillar',    pctX: 0.50, pctY: 0.75 },
      { type: 'bouncePad', pctX: 0.20, pctY: 0.50, aimAngle: 0 },
      { type: 'bouncePad', pctX: 0.80, pctY: 0.50, aimAngle: Math.PI },
      { type: 'hazardZone',pctX: 0.50, pctY: 0.50 },
    ]
  },
  { // 1: Four Corners (waves 5-10)
    name: 'FourCorners', minWave: 5, maxWave: 10,
    slots: [
      { type: 'pillar',    pctX: 0.20, pctY: 0.22 },
      { type: 'pillar',    pctX: 0.80, pctY: 0.22 },
      { type: 'pillar',    pctX: 0.20, pctY: 0.78 },
      { type: 'bouncePad', pctX: 0.50, pctY: 0.20, aimAngle: Math.PI / 2 },
      { type: 'bouncePad', pctX: 0.50, pctY: 0.80, aimAngle: -Math.PI / 2 },
      { type: 'hazardZone',pctX: 0.50, pctY: 0.50 },
    ]
  },
  { // 2: Cross (waves 7-12)
    name: 'Cross', minWave: 7, maxWave: 12,
    slots: [
      { type: 'pillar',      pctX: 0.50, pctY: 0.50 },
      { type: 'flatBouncer', pctX: 0.50, pctY: 0.30, fbAngle: 0 },
      { type: 'flatBouncer', pctX: 0.50, pctY: 0.70, fbAngle: 0 },
      { type: 'bouncePad',   pctX: 0.25, pctY: 0.25, aimAngle: Math.PI / 4 + Math.PI },
      { type: 'bouncePad',   pctX: 0.75, pctY: 0.25, aimAngle: 3 * Math.PI / 4 + Math.PI },
      { type: 'hazardZone',  pctX: 0.25, pctY: 0.50 },
    ]
  },
  { // 3: Ring (waves 9-15)
    name: 'Ring', minWave: 9, maxWave: 15,
    slots: [
      { type: 'pillar',    ringAngle: 0,              ringRadius: 210 },
      { type: 'pillar',    ringAngle: 2 * Math.PI / 3,ringRadius: 210 },
      { type: 'pillar',    ringAngle: 4 * Math.PI / 3,ringRadius: 210 },
      { type: 'bouncePad', ringAngle: Math.PI / 3,    ringRadius: 210, aimAngle: Math.PI / 3 + Math.PI },
      { type: 'bouncePad', ringAngle: Math.PI,         ringRadius: 210, aimAngle: 0 },
      { type: 'hazardZone',pctX: 0.50, pctY: 0.50 },
    ]
  },
  { // 4: Gauntlet (waves 12+)
    name: 'Gauntlet', minWave: 12, maxWave: 999,
    slots: [
      { type: 'pillar',      pctX: 0.35, pctY: 0.30 },
      { type: 'pillar',      pctX: 0.65, pctY: 0.30 },
      { type: 'flatBouncer', pctX: 0.35, pctY: 0.60, fbAngle: Math.PI / 2 },
      { type: 'flatBouncer', pctX: 0.65, pctY: 0.60, fbAngle: Math.PI / 2 },
      { type: 'hazardZone',  pctX: 0.50, pctY: 0.70 },
      { type: 'bouncePad',   pctX: 0.50, pctY: 0.15, aimAngle: Math.PI / 2 },
    ]
  },
  { // 5: Tunnels (waves 6-12)
    name: 'Tunnels', minWave: 6, maxWave: 12,
    slots: [
      { type: 'pillar',     pctX: 0.30, pctY: 0.30 },
      { type: 'pillar',     pctX: 0.70, pctY: 0.30 },
      { type: 'pillar',     pctX: 0.30, pctY: 0.70 },
      { type: 'pillar',     pctX: 0.70, pctY: 0.70 },
      { type: 'bouncePad',  pctX: 0.50, pctY: 0.50, aimAngle: Math.PI / 2 },
      { type: 'hazardZone', pctX: 0.50, pctY: 0.15 },
    ]
  },
  { // 6: Diamond (waves 8-14)
    name: 'Diamond', minWave: 8, maxWave: 14,
    slots: [
      { type: 'pillar',      pctX: 0.50, pctY: 0.20 },
      { type: 'pillar',      pctX: 0.50, pctY: 0.80 },
      { type: 'flatBouncer', pctX: 0.25, pctY: 0.50, fbAngle: Math.PI / 4 },
      { type: 'flatBouncer', pctX: 0.75, pctY: 0.50, fbAngle: -Math.PI / 4 },
      { type: 'bouncePad',   pctX: 0.50, pctY: 0.50, aimAngle: 0 },
      { type: 'hazardZone',  pctX: 0.15, pctY: 0.50 },
    ]
  },
  { // 7: Fortress (waves 10-18)
    name: 'Fortress', minWave: 10, maxWave: 18,
    slots: [
      { type: 'pillar',      pctX: 0.42, pctY: 0.42 },
      { type: 'pillar',      pctX: 0.58, pctY: 0.42 },
      { type: 'pillar',      pctX: 0.42, pctY: 0.58 },
      { type: 'flatBouncer', pctX: 0.50, pctY: 0.35, fbAngle: 0 },
      { type: 'flatBouncer', pctX: 0.50, pctY: 0.65, fbAngle: 0 },
      { type: 'hazardZone',  pctX: 0.50, pctY: 0.50 },
      { type: 'bouncePad',   pctX: 0.15, pctY: 0.50, aimAngle: 0 },
      { type: 'bouncePad',   pctX: 0.85, pctY: 0.50, aimAngle: Math.PI },
    ]
  },
  { // 8: Zigzag (waves 12-20)
    name: 'Zigzag', minWave: 12, maxWave: 20,
    slots: [
      { type: 'pillar',      pctX: 0.25, pctY: 0.25 },
      { type: 'pillar',      pctX: 0.75, pctY: 0.50 },
      { type: 'pillar',      pctX: 0.25, pctY: 0.75 },
      { type: 'flatBouncer', pctX: 0.50, pctY: 0.35, fbAngle: Math.PI / 6 },
      { type: 'flatBouncer', pctX: 0.50, pctY: 0.65, fbAngle: -Math.PI / 6 },
      { type: 'hazardZone',  pctX: 0.75, pctY: 0.25 },
      { type: 'bouncePad',   pctX: 0.50, pctY: 0.15, aimAngle: Math.PI / 2 },
    ]
  },
  { // 9: Arena (waves 15-25)
    name: 'Arena', minWave: 15, maxWave: 25,
    slots: [
      { type: 'hazardZone',  pctX: 0.10, pctY: 0.10 },
      { type: 'hazardZone',  pctX: 0.80, pctY: 0.70 },
      { type: 'bouncePad',   pctX: 0.20, pctY: 0.20, aimAngle: Math.PI / 4 + Math.PI },
      { type: 'bouncePad',   pctX: 0.80, pctY: 0.80, aimAngle: Math.PI / 4 },
      { type: 'bouncePad',   pctX: 0.20, pctY: 0.80, aimAngle: -Math.PI / 4 },
      { type: 'flatBouncer', pctX: 0.50, pctY: 0.50, fbAngle: Math.PI / 4 },
    ]
  },
  { // 10: Labyrinth (waves 20+)
    name: 'Labyrinth', minWave: 20, maxWave: 999,
    slots: [
      { type: 'pillar',      pctX: 0.30, pctY: 0.30 },
      { type: 'pillar',      pctX: 0.70, pctY: 0.30 },
      { type: 'pillar',      pctX: 0.50, pctY: 0.65 },
      { type: 'flatBouncer', pctX: 0.30, pctY: 0.50, fbAngle: Math.PI / 3 },
      { type: 'flatBouncer', pctX: 0.70, pctY: 0.50, fbAngle: -Math.PI / 3 },
      { type: 'hazardZone',  pctX: 0.50, pctY: 0.15 },
      { type: 'bouncePad',   pctX: 0.50, pctY: 0.85, aimAngle: -Math.PI / 2 },
      { type: 'bouncePad',   pctX: 0.15, pctY: 0.65, aimAngle: Math.PI / 4 },
    ]
  }
];

// --- Boss-Specific Arena Templates ---
// These bypass selectTemplate() and per-type count caps on boss waves.
const BOSS_TEMPLATES = {
  hive_queen: { // Wave 10: "The Nest"
    name: 'TheNest',
    slots: [
      { type: 'pillar',     pctX: 0.25, pctY: 0.25 },  // Cover NW
      { type: 'pillar',     pctX: 0.75, pctY: 0.25 },  // Cover NE
      { type: 'pillar',     pctX: 0.50, pctY: 0.75 },  // Central southern refuge
      { type: 'bouncePad',  pctX: 0.15, pctY: 0.50, aimAngle: 0 },          // Escape launch right
      { type: 'bouncePad',  pctX: 0.85, pctY: 0.50, aimAngle: Math.PI },    // Escape launch left
      { type: 'hazardZone', pctX: 0.50, pctY: 0.15 },  // Queen spawn danger zone
    ]
  },
  nexus_core: { // Wave 20: "The Processor"
    name: 'TheProcessor',
    slots: [
      { type: 'pillar',      pctX: 0.50, pctY: 0.50 },                       // Central pillar
      { type: 'flatBouncer', pctX: 0.30, pctY: 0.30, fbAngle: Math.PI / 4 }, // Deflect NW
      { type: 'flatBouncer', pctX: 0.70, pctY: 0.30, fbAngle: -Math.PI / 4 },// Deflect NE
      { type: 'flatBouncer', pctX: 0.30, pctY: 0.70, fbAngle: -Math.PI / 4 },// Deflect SW
      { type: 'flatBouncer', pctX: 0.70, pctY: 0.70, fbAngle: Math.PI / 4 }, // Deflect SE
      { type: 'bouncePad',   pctX: 0.50, pctY: 0.15, aimAngle: Math.PI / 2 },// Top escape
      { type: 'bouncePad',   pctX: 0.50, pctY: 0.85, aimAngle: -Math.PI / 2 },// Bottom escape
    ]
  },
  void_warden: { // Wave 30: "The Rift"
    name: 'TheRift',
    slots: [
      { type: 'hazardZone',  pctX: 0.15, pctY: 0.15 },                            // Void rift NW
      { type: 'hazardZone',  pctX: 0.85, pctY: 0.85 },                            // Void rift SE
      { type: 'bouncePad',   pctX: 0.15, pctY: 0.85, aimAngle: -Math.PI / 4 },    // Diagonal launch
      { type: 'bouncePad',   pctX: 0.85, pctY: 0.15, aimAngle: 3 * Math.PI / 4 }, // Diagonal launch
      { type: 'flatBouncer', pctX: 0.50, pctY: 0.50, fbAngle: 0 },                // Central deflector
      { type: 'pillar',      pctX: 0.35, pctY: 0.50 },                            // Left cover
      { type: 'pillar',      pctX: 0.65, pctY: 0.50 },                            // Right cover
    ]
  }
};

// Boss type order for endless mode cycling
const BOSS_CYCLE = ['hive_queen', 'nexus_core', 'void_warden'];

function getEligibleTemplates(wave) {
  return TEMPLATES.filter(t => wave >= t.minWave && wave <= t.maxWave);
}

function selectTemplate(wave) {
  const eligible = getEligibleTemplates(wave);
  if (eligible.length === 0) return null;
  // Deterministic selection: wave % eligible count, skip repeat of last template
  let idx = wave % eligible.length;
  const selected = eligible[idx];
  const selectedGlobalIdx = TEMPLATES.indexOf(selected);
  if (selectedGlobalIdx === G.lastTemplateIndex && eligible.length > 1) {
    idx = (idx + 1) % eligible.length;
    const alt = eligible[idx];
    G.lastTemplateIndex = TEMPLATES.indexOf(alt);
    return alt;
  }
  G.lastTemplateIndex = selectedGlobalIdx;
  return selected;
}

function jitter() { return rand(-30, 30); }

function resolveSlotPosition(slot) {
  if (slot.ringAngle !== undefined) {
    // Ring: position relative to center
    const cx = W / 2 + Math.cos(slot.ringAngle) * slot.ringRadius + jitter();
    const cy = H / 2 + Math.sin(slot.ringAngle) * slot.ringRadius + jitter();
    return { x: clamp(cx, 40, W - 40), y: clamp(cy, 40, H - 40) };
  }
  const x = clamp(slot.pctX * W + jitter(), 40, W - 40);
  const y = clamp(slot.pctY * H + jitter(), 40, H - 40);
  return { x, y };
}

// Determine which boss template to use for a given wave.
// Returns the template object or null if not a boss wave.
function selectBossTemplate(wave) {
  if (!isBossWave(wave)) return null;
  // Endless mode cycling: cycle = floor((wave - 1) / 10) % 3
  const cycle = Math.floor((wave - 1) / 10) % 3;
  const bossType = BOSS_CYCLE[cycle];
  return BOSS_TEMPLATES[bossType] || null;
}

// Called at wave start to add/manage arena modifiers
export function updateArenaModifiersForWave(wave) {
  if (!G.pillars) initArenaModifiers();

  // Before wave 4, no obstacles (unless it's a boss wave, which starts at 10)
  if (wave < 4) return;

  // Clear existing obstacles (they'll be placed fresh per template)
  G.pillars = [];
  G.bouncePads = [];
  G.flatBouncers = [];
  G.hazardZones = [];

  // Boss waves use dedicated templates, bypassing normal selection and per-type caps
  const bossTemplate = selectBossTemplate(wave);
  if (bossTemplate) {
    for (const slot of bossTemplate.slots) {
      placeSlot(slot);
    }
    return;
  }

  // Normal waves: get per-type counts from formulas
  const wantPillars = getPillarCount(wave);
  const wantPads    = getBouncePadCount(wave);
  const wantFlat    = getFlatBouncerCount(wave);
  const wantHazard  = getHazardZoneCount(wave);

  // Select template
  const template = selectTemplate(wave);
  if (!template) return;

  // Place slots from template, respecting per-type counts and total cap
  let placed = 0;
  let pillarCount = 0, padCount = 0, flatCount = 0, hazardCount = 0;

  for (const slot of template.slots) {
    if (placed >= TOTAL_OBSTACLE_CAP) break;

    // Check per-type cap
    if (slot.type === 'pillar'      && pillarCount >= wantPillars) continue;
    if (slot.type === 'bouncePad'   && padCount    >= wantPads)    continue;
    if (slot.type === 'flatBouncer' && flatCount   >= wantFlat)    continue;
    if (slot.type === 'hazardZone'  && hazardCount >= wantHazard)  continue;

    placeSlot(slot);

    if (slot.type === 'pillar')      pillarCount++;
    else if (slot.type === 'bouncePad')   padCount++;
    else if (slot.type === 'flatBouncer') flatCount++;
    else if (slot.type === 'hazardZone')  hazardCount++;
    placed++;
  }
}

// Place a single obstacle slot into the arena
function placeSlot(slot) {
  const pos = resolveSlotPosition(slot);

  if (slot.type === 'pillar') {
    G.pillars.push({
      x: pos.x, y: pos.y, r: 25, hp: 5, maxHp: 5,
      alive: true, crackLevel: 0, fadeAlpha: 1,
    });
  } else if (slot.type === 'bouncePad') {
    const dir = slot.aimAngle !== undefined ? slot.aimAngle : 0;
    G.bouncePads.push({
      x: pos.x, y: pos.y, r: 30,
      launchDir: dir, launchDx: Math.cos(dir), launchDy: Math.sin(dir),
      cooldown: 0, fadeAlpha: 1,
    });
  } else if (slot.type === 'flatBouncer') {
    const angle = slot.fbAngle !== undefined ? slot.fbAngle : 0;
    G.flatBouncers.push({
      x: pos.x, y: pos.y,
      w: 80, h: 12,
      angle: angle,
      nx: Math.cos(angle + Math.PI / 2), ny: Math.sin(angle + Math.PI / 2),
      cooldown: 0, fadeAlpha: 1,
    });
  } else if (slot.type === 'hazardZone') {
    G.hazardZones.push({
      x: pos.x - 60, y: pos.y - 60, w: 120, h: 120,
      cx: pos.x, cy: pos.y,
      damageTimer: 0, fadeAlpha: 1,
    });
  }
}

// --- Obstacle Slide Animation ---
// Call this to animate an obstacle from its current position to a new target.
// Works for pillars, bouncePads, flatBouncers, and hazardZones.
export function slideObstacleTo(obj, targetX, targetY) {
  obj.slideFromX = obj.x;
  obj.slideFromY = obj.y;
  obj.slideTargetX = targetX;
  obj.slideTargetY = targetY;
  obj.slideTimer = CLARITY.OBSTACLE_SLIDE_DURATION;
}

// Batch-slide all obstacles when transitioning to new template positions.
// `targets` is a Map or array of { obj, x, y } entries.
export function slideAllObstacles(targets) {
  for (const { obj, x, y } of targets) {
    slideObstacleTo(obj, x, y);
  }
}

export function setAllObstacleFadeAlpha(alpha) {
  for (const arr of [G.pillars, G.bouncePads, G.hazardZones, G.flatBouncers]) {
    if (!arr) continue;
    for (const obj of arr) obj.fadeAlpha = alpha;
  }
}

function updateObstacleSlides(dt) {
  const allObstacles = [
    ...(G.pillars || []),
    ...(G.bouncePads || []),
    ...(G.flatBouncers || []),
    ...(G.hazardZones || []),
  ];
  for (const obj of allObstacles) {
    if (obj.slideTimer == null || obj.slideTimer <= 0) continue;
    obj.slideTimer -= dt;
    const progress = 1 - Math.max(0, obj.slideTimer) / CLARITY.OBSTACLE_SLIDE_DURATION;
    const eased = easeOutCubic(Math.min(1, progress));
    obj.x = lerp(obj.slideFromX, obj.slideTargetX, eased);
    obj.y = lerp(obj.slideFromY, obj.slideTargetY, eased);
    // For hazard zones, also update cx/cy (center coords)
    if (obj.cx !== undefined) {
      obj.cx = obj.x + (obj.w || 0) / 2;
      obj.cy = obj.y + (obj.h || 0) / 2;
    }
    if (obj.slideTimer <= 0) {
      obj.x = obj.slideTargetX;
      obj.y = obj.slideTargetY;
      if (obj.cx !== undefined) {
        obj.cx = obj.x + (obj.w || 0) / 2;
        obj.cy = obj.y + (obj.h || 0) / 2;
      }
      obj.slideTimer = 0;
    }
  }
}

// --- Update modifiers ---
export function updateArenaModifiers(dt) {
  const player = G.player;
  if (!player) return;

  // Advance obstacle slide animations
  updateObstacleSlides(dt);

  // Pillar collisions (player + enemies bounce)
  if (G.pillars) {
    for (let i = G.pillars.length - 1; i >= 0; i--) {
      const p = G.pillars[i];
      if (!p.alive) continue;

      // Beam-block flash timer
      if (p.flashTimer > 0) p.flashTimer -= dt;

      // Player bounce off pillar
      const pd = dist(player, p);
      if (pd < player.r + p.r) {
        const dx = player.x - p.x, dy = player.y - p.y;
        const nd = Math.sqrt(dx * dx + dy * dy) || 1;
        // Push player out
        player.x = p.x + (dx / nd) * (player.r + p.r);
        player.y = p.y + (dy / nd) * (player.r + p.r);
        // Reflect velocity
        const dot = (player.vx * dx / nd + player.vy * dy / nd);
        player.vx -= 2 * dot * dx / nd;
        player.vy -= 2 * dot * dy / nd;
        player.vx *= 0.8; player.vy *= 0.8;

        // Damage pillar via dash/overdrive/invincibility only
        if (player.dashGraceTimer > 0 || player.overdriveTimer > 0 || isInvincibleFromBoost()) {
          p.hp--;
          p.crackLevel = p.maxHp - p.hp;
          spawnParticles(p.x, p.y, '#555566', 3);
          if (p.hp <= 0) {
            p.alive = false;
            G.pillarDestroyedCount++;
            spawnParticles(p.x, p.y, '#555566', 8);
            // Shard drops: 3 + floor(wave/5), min 3, max 6
            const shardCount = Math.min(6, 3 + Math.floor(G.wave / 5));
            spawnPillarShards(p.x, p.y, shardCount);
            // 25% chance: stamina orb
            if (Math.random() < 0.25) {
              G.staminaOrbs = G.staminaOrbs || [];
              G.staminaOrbs.push({ x: p.x, y: p.y, r: 8, life: 8.0 });
            }
            spawnCombatText('DESTROYED!', p.x, p.y - 30, { size: 14, color: '#aaaaaa' });
            G.pillars.splice(i, 1);
          }
        }
      }

      // Enemy bounce off pillar
      for (const e of G.enemies) {
        if (!e.alive || e.isFusing) continue;
        const ed = dist(e, p);
        if (ed < e.r + p.r) {
          const dx = e.x - p.x, dy = e.y - p.y;
          const nd = Math.sqrt(dx * dx + dy * dy) || 1;
          e.x = p.x + (dx / nd) * (e.r + p.r);
          e.y = p.y + (dy / nd) * (e.r + p.r);
          const dot = (e.vx * dx / nd + e.vy * dy / nd);
          e.vx -= 2 * dot * dx / nd;
          e.vy -= 2 * dot * dy / nd;
          e.vx *= 0.8; e.vy *= 0.8;
        }
      }
    }
  }

  // Bounce pad interactions
  // Tick per-entity bouncer immunity timers
  if (player.bouncerImmunity > 0) player.bouncerImmunity -= dt;
  for (const e of G.enemies) {
    if (e.bouncerImmunity > 0) e.bouncerImmunity -= dt;
  }

  if (G.bouncePads) {
    for (const pad of G.bouncePads) {
      if (pad.cooldown > 0) { pad.cooldown -= dt; continue; }

      // Player launch — skip if recently bounced (prevents loops)
      if (!(player.bouncerImmunity > 0) && dist(player, pad) < player.r + pad.r) {
        // Cancel any active dash charge (no refund — initial cost and drain lost)
        if (player.dashCharging) {
          player.dashCharging = false;
          player.dashChargeTime = 0;
          player.dashChargeStaminaDrained = 0;
          player.dashChargeTouchId = null;
        }
        player.vx = pad.launchDx * 1200;
        player.vy = pad.launchDy * 1200;
        player.dashGraceTimer = 0.4;
        player.pendingRecoveryTime = 0.25;
        player.bouncerImmunity = 1.5;
        pad.cooldown = 1.5;
        spawnParticles(pad.x, pad.y, '#00ffcc', 4);
      }

      // Enemy launch — skip if recently bounced (prevents loops)
      for (const e of G.enemies) {
        if (!e.alive || e.isFusing) continue;
        if (e.bouncerImmunity > 0) continue;
        if (dist(e, pad) < e.r + pad.r) {
          e.vx = pad.launchDx * 1200;
          e.vy = pad.launchDy * 1200;
          e.bouncerImmunity = 1.5;
          pad.cooldown = 1.5;
        }
      }
    }
  }

  // Hazard zone damage
  if (G.hazardZones) {
    for (const zone of G.hazardZones) {
      if (player.x > zone.x && player.x < zone.x + zone.w &&
          player.y > zone.y && player.y < zone.y + zone.h) {
        zone.damageTimer += dt;
        if (zone.damageTimer >= 2.0) {
          zone.damageTimer = 0;
          if (player.invTimer <= 0 && player.overdriveTimer <= 0) {
            events.emit('hazardZoneDamage', { x: zone.cx, y: zone.cy });
          }
        }
      } else {
        zone.damageTimer = Math.max(0, zone.damageTimer - dt);
      }
    }
  }

  // Flat bouncer physics
  if (G.flatBouncers) {
    for (const fb of G.flatBouncers) {
      if (fb.cooldown > 0) { fb.cooldown -= dt; continue; }
      // Check player collision with rotated rectangle
      if (entityHitsFlatBouncer(player, fb)) {
        reflectOffFlatBouncer(player, fb);
        player.dashGraceTimer = 0.4;
        fb.cooldown = 0.6;
        spawnParticles(fb.x, fb.y, '#00ffcc', 3);
      }
      // Check enemy collisions
      for (const e of G.enemies) {
        if (!e.alive || e.isFusing) continue;
        if (e.bouncerImmunity > 0) continue;
        if (entityHitsFlatBouncer(e, fb)) {
          reflectOffFlatBouncer(e, fb);
          e.bouncerImmunity = 1.5;
          fb.cooldown = 0.6;
        }
      }
    }
  }

  // Stamina orb collection
  if (G.staminaOrbs) {
    for (let i = G.staminaOrbs.length - 1; i >= 0; i--) {
      const orb = G.staminaOrbs[i];
      orb.life -= dt;
      if (orb.life <= 0) { G.staminaOrbs.splice(i, 1); continue; }
      if (dist(player, orb) < player.r + orb.r) {
        player.stamina = Math.min(player.maxStamina, player.stamina + 20);
        spawnCombatText('+20 STA', orb.x, orb.y - 20, { size: 12, color: '#44ff88', bold: true });
        spawnParticles(orb.x, orb.y, '#44ff88', 3);
        G.staminaOrbs.splice(i, 1);
      }
    }
  }

  // Power gem collection
  if (G.powerGems) {
    for (let i = G.powerGems.length - 1; i >= 0; i--) {
      const gem = G.powerGems[i];
      gem.life -= dt;
      if (gem.life <= 0) { G.powerGems.splice(i, 1); continue; }
      if (dist(player, gem) < player.r + gem.r) {
        collectPowerGem(gem);
        G.powerGems.splice(i, 1);
      }
    }
  }
}

// --- Flat Bouncer Physics ---
function entityHitsFlatBouncer(entity, fb) {
  // Project entity center onto bouncer local space
  const dx = entity.x - fb.x;
  const dy = entity.y - fb.y;
  const cosA = Math.cos(-fb.angle), sinA = Math.sin(-fb.angle);
  const lx = dx * cosA - dy * sinA;
  const ly = dx * sinA + dy * cosA;
  // Check overlap with rotated rectangle (half-extents 40, 6)
  const closestX = clamp(lx, -40, 40);
  const closestY = clamp(ly, -6, 6);
  const distX = lx - closestX, distY = ly - closestY;
  return (distX * distX + distY * distY) < entity.r * entity.r;
}

function reflectOffFlatBouncer(entity, fb) {
  // True velocity reflection across the bouncer's surface normal
  const dot = entity.vx * fb.nx + entity.vy * fb.ny;
  entity.vx = (entity.vx - 2 * dot * fb.nx) * 1.15;
  entity.vy = (entity.vy - 2 * dot * fb.ny) * 1.15;
  // Speed cap at 1400
  const speed = Math.sqrt(entity.vx * entity.vx + entity.vy * entity.vy);
  if (speed > 1400) {
    entity.vx = (entity.vx / speed) * 1400;
    entity.vy = (entity.vy / speed) * 1400;
  }
  // Push entity away from bouncer
  entity.x += fb.nx * (entity.r + 8);
  entity.y += fb.ny * (entity.r + 8);
}

// --- Pillar Shard Drops (value 1 each, ring pattern) ---
function spawnPillarShards(x, y, count) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + rand(-0.3, 0.3);
    const scatter = rand(20, 40);
    const sx = clamp(x + Math.cos(angle) * scatter, 8, W - 8);
    const sy = clamp(y + Math.sin(angle) * scatter, 8, H - 8);
    G.shardPickups.push({
      x: sx, y: sy, value: 1,
      spawnTime: Date.now(),
      lifetime: 8.0,
      collected: false,
    });
  }
}

// --- Beam-block pillar damage helpers ---
// Called per beam that a pillar blocks. Returns true if pillar reached 0 HP.
export function applyBeamDamageToPillar(p) {
  p.hp--;
  p.crackLevel = p.maxHp - p.hp;
  p.flashTimer = 0.12;
  spawnParticles(p.x, p.y, '#555566', 3);
  return p.hp <= 0;
}

// Deferred cleanup for pillars destroyed by beam blocks (call after all beams tested).
export function cleanupDestroyedPillar(p) {
  p.alive = false;
  G.pillarDestroyedCount = (G.pillarDestroyedCount || 0) + 1;
  spawnParticles(p.x, p.y, '#555566', 8);
  const shardCount = Math.min(6, 3 + Math.floor(G.wave / 5));
  spawnPillarShards(p.x, p.y, shardCount);
  if (Math.random() < 0.25) {
    G.staminaOrbs = G.staminaOrbs || [];
    G.staminaOrbs.push({ x: p.x, y: p.y, r: 8, life: 8.0 });
  }
  spawnCombatText('DESTROYED!', p.x, p.y - 30, { size: 14, color: '#aaaaaa' });
  const idx = G.pillars.indexOf(p);
  if (idx >= 0) G.pillars.splice(idx, 1);
}

// --- Power Gem: one-time power pickup ---
const GEM_RARITY_COLORS = { common: '#ffffff', rare: '#4488ff', epic: '#aa44ff' };
const GEM_SCORE_VALUES = { common: 500, rare: 1000, epic: 2000 };

export function spawnPowerGem(x, y, rarityWeights) {
  if (!G.powerGems) G.powerGems = [];
  const roll = Math.random() * 100;
  let rarity = 'common';
  if (roll < rarityWeights.epic) rarity = 'epic';
  else if (roll < rarityWeights.epic + rarityWeights.rare) rarity = 'rare';
  G.powerGems.push({
    x, y, r: 12, rarity,
    color: GEM_RARITY_COLORS[rarity],
    life: 15.0,
  });
}

function collectPowerGem(gem) {
  // Build pool based on gem rarity
  const player = G.player;
  const pool = [];
  for (const def of Object.values(POWER_DEFS)) {
    if (def.special || def.id === 'overdrive') continue;
    // Soul Harvest works in hardcore (grants stamina instead of HP)
    const rarities = gem.rarity === 'epic' ? ['common', 'rare', 'epic'] :
                     gem.rarity === 'rare' ? ['common', 'rare'] : ['common'];
    if (!rarities.includes(def.rarity)) continue;
    const held = player.powers.find(p => p.id === def.id);
    if (held && held.level >= def.maxLevel) continue;
    if (held && held.evolved) continue;
    pool.push(def);
  }

  if (pool.length === 0) {
    // All powers maxed — convert to score
    G.score += GEM_SCORE_VALUES[gem.rarity];
    spawnCombatText('+' + GEM_SCORE_VALUES[gem.rarity], gem.x, gem.y - 20, { size: 20, color: gem.color, bold: true });
    spawnParticles(gem.x, gem.y, gem.color, 8);
    return;
  }

  const picked = pool[Math.floor(Math.random() * pool.length)];
  const existing = player.powers.find(p => p.id === picked.id);
  if (existing) {
    existing.level = Math.min(existing.level + 1, picked.maxLevel);
  } else if (player.powers.length < 6) {
    player.powers.push({ id: picked.id, level: 1 });
  } else {
    // At cap and no upgradeable match — score fallback
    G.score += GEM_SCORE_VALUES[gem.rarity];
    spawnCombatText('+' + GEM_SCORE_VALUES[gem.rarity], gem.x, gem.y - 20, { size: 20, color: gem.color, bold: true });
    spawnParticles(gem.x, gem.y, gem.color, 8);
    return;
  }

  // Feedback
  G.collectFlashTimer = 0.15;
  G.collectFlashAlpha = 0.2;
  spawnCombatText(picked.name, gem.x, gem.y - 30, { size: 20, color: gem.color, bold: true, life: 1.5 });
  spawnParticles(gem.x, gem.y, gem.color, 8);
}


// --- Draw modifiers ---
export function drawArenaModifiers() {
  // Hazard zones (draw first, below everything)
  if (G.hazardZones) {
    for (const zone of G.hazardZones) {
      const fa = zone.fadeAlpha ?? 1;
      if (fa <= 0) continue;
      const player = G.player;
      const inside = player && player.x > zone.x && player.x < zone.x + zone.w &&
                     player.y > zone.y && player.y < zone.y + zone.h;
      const pulse = 0.3 + 0.1 * Math.sin(Date.now() * 0.003);

      ctx.save();
      // Fill
      ctx.globalAlpha = 0.15 * fa;
      ctx.fillStyle = '#ff4422';
      ctx.fillRect(zone.x, zone.y, zone.w, zone.h);

      // Warning stripes
      ctx.save();
      ctx.beginPath();
      ctx.rect(zone.x, zone.y, zone.w, zone.h);
      ctx.clip();
      ctx.globalAlpha = 0.08 * fa;
      ctx.strokeStyle = '#ff4422';
      ctx.lineWidth = 4;
      const offset = (Date.now() * (inside ? 0.04 : 0.02)) % 24;
      for (let s = -zone.w; s < zone.w + zone.h; s += 24) {
        ctx.beginPath();
        ctx.moveTo(zone.x + s + offset, zone.y);
        ctx.lineTo(zone.x + s + offset - zone.h, zone.y + zone.h);
        ctx.stroke();
      }
      ctx.restore();

      // Border
      ctx.globalAlpha = (inside ? 0.8 : pulse) * fa;
      ctx.strokeStyle = '#ff4422';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // Obstacle Pillars
  if (G.pillars) {
    for (const p of G.pillars) {
      if (!p.alive) continue;
      const fa = p.fadeAlpha ?? 1;
      if (fa <= 0) continue;
      ctx.save();
      ctx.globalAlpha = fa;
      ctx.translate(p.x, p.y);
      // Radial gradient fill: warm sandstone
      const pillarGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.r);
      pillarGrad.addColorStop(0, '#8B6B50');
      pillarGrad.addColorStop(1, '#5C3D28');
      ctx.fillStyle = pillarGrad;
      ctx.shadowColor = '#3D2816';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, Math.PI * 2);
      ctx.fill();
      // Border ring
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#3D2816';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Beam-block flash overlay (white lerp back over 0.12s)
      if (p.flashTimer > 0) {
        ctx.save();
        ctx.globalAlpha = (p.flashTimer / 0.12) * fa;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = fa; // restore for subsequent draws
      }

      // Critical glow (HP = 1)
      if (p.hp === 1) {
        ctx.save();
        ctx.globalAlpha = 0.35 * fa;
        ctx.shadowColor = '#CC4422';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        ctx.fillStyle = pillarGrad;
        ctx.fill();
        ctx.restore();
      }

      // Enhanced crack lines
      if (p.crackLevel > 0) {
        const crackColor = p.crackLevel >= 3 ? '#6B3318' : p.crackLevel >= 2 ? '#4A2A12' : '#3D2816';
        const crackWidth = p.crackLevel >= 3 ? 2.0 : 1.5;
        const crackAlpha = p.crackLevel >= 3 ? 0.7 : p.crackLevel >= 2 ? 0.6 : 0.5;
        ctx.strokeStyle = crackColor;
        ctx.lineWidth = crackWidth;
        ctx.globalAlpha = crackAlpha * fa;
        for (let c = 0; c < p.crackLevel; c++) {
          const angle = (c / p.maxHp) * Math.PI * 2 + 0.3;
          const endX = Math.cos(angle) * p.r * 0.85;
          const endY = Math.sin(angle) * p.r * 0.85;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(endX, endY);
          ctx.stroke();
          // Branch forks at crackLevel >= 3
          if (p.crackLevel >= 3) {
            const midX = endX * 0.6;
            const midY = endY * 0.6;
            const branchLen = p.r * 0.25;
            for (const offset of [-Math.PI / 6, Math.PI / 6]) {
              const bAngle = angle + offset;
              ctx.beginPath();
              ctx.moveTo(midX, midY);
              ctx.lineTo(midX + Math.cos(bAngle) * branchLen, midY + Math.sin(bAngle) * branchLen);
              ctx.stroke();
            }
          }
        }
      }
      ctx.restore();
    }
  }

  // Bounce Pads
  if (G.bouncePads) {
    for (const pad of G.bouncePads) {
      const fa = pad.fadeAlpha ?? 1;
      if (fa <= 0) continue;
      const dimmed = pad.cooldown > 0;
      ctx.save();
      ctx.translate(pad.x, pad.y);
      ctx.globalAlpha = (dimmed ? 0.2 : 0.7) * fa;
      ctx.fillStyle = '#00FF88';
      ctx.shadowColor = '#00FF88';
      ctx.shadowBlur = dimmed ? 3 : 10;
      ctx.beginPath();
      ctx.arc(0, 0, pad.r, 0, Math.PI * 2);
      ctx.fill();

      // Ring edge with radial pulse
      ctx.strokeStyle = '#00CC66';
      ctx.lineWidth = 2;
      ctx.globalAlpha = (dimmed ? 0.15 : 0.6) * fa;
      const ringPulse = dimmed ? 0 : 1.5 * Math.sin(Date.now() * 0.005);
      ctx.beginPath();
      ctx.arc(0, 0, pad.r + ringPulse, 0, Math.PI * 2);
      ctx.stroke();

      // Direction arrow
      ctx.globalAlpha = (dimmed ? 0.2 : 0.8) * fa;
      ctx.fillStyle = '#ffffff';
      ctx.save();
      ctx.rotate(pad.launchDir);
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-4, -6);
      ctx.lineTo(-4, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.restore();
    }
  }

  // Flat Bouncers
  if (G.flatBouncers) {
    for (const fb of G.flatBouncers) {
      const fa = fb.fadeAlpha ?? 1;
      if (fa <= 0) continue;
      const dimmed = fb.cooldown > 0;
      const pulse = 0.7 + 0.15 * Math.sin(Date.now() * 0.004);
      ctx.save();
      ctx.translate(fb.x, fb.y);
      ctx.rotate(fb.angle);
      ctx.globalAlpha = (dimmed ? 0.2 : pulse) * fa;
      ctx.shadowColor = '#7755FF';
      ctx.shadowBlur = dimmed ? 4 : 12;
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      // Gradient bar
      const grad = ctx.createLinearGradient(-40, 0, 40, 0);
      grad.addColorStop(0, '#7755FF');
      grad.addColorStop(0.5, '#BB99FF');
      grad.addColorStop(1, '#7755FF');
      ctx.fillStyle = grad;
      ctx.fillRect(-40, -6, 80, 12);
      // Surface normal indicator (small triangle)
      ctx.shadowBlur = 0;
      ctx.globalAlpha = (dimmed ? 0.15 : 0.6) * fa;
      ctx.fillStyle = '#DDCCFF';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(-4, -12);
      ctx.lineTo(4, -12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // Stamina Orbs
  if (G.staminaOrbs) {
    for (const orb of G.staminaOrbs) {
      if (orb.life <= 2.0 && Math.floor(orb.life * 6) % 2 !== 0) continue;
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() * 0.005);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.shadowColor = '#44ff88';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = '#44ff88';
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, orb.r * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Power Gems
  if (G.powerGems) {
    for (const gem of G.powerGems) {
      if (gem.life <= 3.0 && Math.floor(gem.life * 6) % 2 !== 0) continue;
      const shimmer = 0.6 + 0.4 * Math.sin(Date.now() / 400 * Math.PI);
      ctx.save();
      ctx.globalAlpha = shimmer;
      ctx.shadowColor = gem.color;
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = gem.color;
      // Diamond shape
      ctx.beginPath();
      ctx.moveTo(gem.x, gem.y - gem.r);
      ctx.lineTo(gem.x + gem.r * 0.7, gem.y);
      ctx.lineTo(gem.x, gem.y + gem.r);
      ctx.lineTo(gem.x - gem.r * 0.7, gem.y);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(gem.x, gem.y - gem.r * 0.4);
      ctx.lineTo(gem.x + gem.r * 0.28, gem.y);
      ctx.lineTo(gem.x, gem.y + gem.r * 0.4);
      ctx.lineTo(gem.x - gem.r * 0.28, gem.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}
