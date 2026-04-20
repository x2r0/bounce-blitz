'use strict';

import { W, H, STATE, FONT, ENEMY_COLORS, RARITY_COLORS, BOOST_COLORS } from '../config.js';
import { G } from '../state.js';
import { ctx, drawGlowText } from '../canvas.js';
import { events } from '../eventbus.js';
import { saveMeta } from './meta.js';
import { POWER_DEFS, EVOLUTION_RECIPES } from './powers.js';
import { BOSS_DEFS } from './boss.js';
import { BOOST_DEFS } from './lootcrate.js';
import { BOSS_GLOSSARY_LORE } from './lore.js';
import { isTouchUILayout } from './touch-ui.js';

// --- Glossary State ---
export const glossary = {
  category: 0,      // 0=Enemies, 1=Bosses, 2=Powers, 3=Boosts
  cursor: 0,        // selected entry index within category
  scrollOffset: 0,  // list scroll offset
  detailScroll: 0,  // vertical scroll offset for detail panel
  prevState: null,   // state to return to (TITLE or PAUSED)
};

// --- Notification Toast Queue ---
const toasts = [];
const TOAST_DURATION = 2.0;
const TOAST_FADE_IN = 0.3;
const TOAST_HOLD = 1.4;
const TOAST_FADE_OUT = 0.3;
const MAX_TOASTS = 3;

// --- Enemy Definition Table ---
const ENEMY_DEFS = {
  drifter: {
    name: 'Drifter',
    desc: 'Floats around aimlessly, bouncing off walls. Harmless-looking but clutters the arena.',
    stats: 'Speed: Slow \u00b7 Worth: 100 pts',
    color: ENEMY_COLORS.drifter,
  },
  tracker: {
    name: 'Tracker',
    desc: 'Locks onto you and accelerates. The longer it chases, the faster it gets.',
    stats: 'Speed: Fast \u00b7 Worth: 250 pts',
    color: ENEMY_COLORS.tracker,
  },
  splitter: {
    name: 'Splitter',
    desc: 'Pops into two smaller copies when destroyed. Kill the pieces before they swarm you.',
    stats: 'Speed: Slow \u00b7 Worth: 200 pts',
    color: ENEMY_COLORS.splitter,
  },
  mini_splitter: {
    name: 'Mini Splitter',
    desc: 'A tiny, fast fragment left behind by a Splitter. Easy to miss in the chaos.',
    stats: 'Speed: Very Fast \u00b7 Worth: 75 pts',
    color: ENEMY_COLORS.mini_splitter,
  },
  pulser: {
    name: 'Pulser',
    desc: 'Sits still and sends out shockwave rings. Stay clear of the expanding pulses.',
    stats: 'Attack: Every 3.5s \u00b7 Worth: 400 pts',
    color: ENEMY_COLORS.pulser,
  },
  teleporter: {
    name: 'Teleporter',
    desc: 'Blinks to a new spot every few seconds. Hard to predict, harder to corner.',
    stats: 'Teleport: Every 2.5s \u00b7 Worth: 350 pts',
    color: ENEMY_COLORS.teleporter,
  },
  bomber: {
    name: 'Bomber',
    desc: 'Rushes you and explodes on contact. The blast damages you even through shields.',
    stats: 'Speed: Fast \u00b7 Worth: 300 pts',
    color: ENEMY_COLORS.bomber,
  },
  spawner: {
    name: 'Spawner',
    desc: 'Summons minions and takes two hits to destroy. Prioritize these or get overwhelmed.',
    stats: 'HP: 2 hits \u00b7 Worth: 500 pts',
    color: ENEMY_COLORS.spawner,
  },
  spawner_minion: {
    name: 'Spawner Minion',
    desc: 'Tiny and quick. Created by Spawners \u2014 killing the parent stops the flood.',
    stats: 'Speed: Fast \u00b7 Worth: 50 pts',
    color: ENEMY_COLORS.spawner_minion,
  },
  sniper: {
    name: 'Sniper',
    desc: 'Hugs the walls and fires aimed beams. Watch for the targeting laser before it shoots.',
    stats: 'Aim Time: 3s \u00b7 Worth: 450 pts',
    color: ENEMY_COLORS.sniper,
  },
};

// --- Category Definitions ---
const CATEGORY_COLORS = {
  enemies: '#00ff88',
  bosses: '#ffdd44',
  powers: '#4488ff',
  boosts: '#ff44ff',
};

const ENEMY_ORDER = ['drifter', 'tracker', 'splitter', 'mini_splitter', 'pulser', 'teleporter', 'bomber', 'spawner', 'spawner_minion', 'sniper'];

const BOSS_ORDER = ['hive_queen', 'nexus_core', 'void_warden'];

// Powers: by rarity then alpha, excluding heart (consumable)
const POWER_ORDER = (() => {
  const rarityRank = { common: 0, rare: 1, epic: 2 };
  const powers = Object.values(POWER_DEFS)
    .filter(p => p.id !== 'heart')
    .sort((a, b) => {
      const rd = rarityRank[a.rarity] - rarityRank[b.rarity];
      if (rd !== 0) return rd;
      return a.name.localeCompare(b.name);
    })
    .map(p => p.id);
  // Evolutions at the end
  const evos = EVOLUTION_RECIPES.map(r => r.id);
  return [...powers, ...evos];
})();

const BOOST_ORDER = BOOST_DEFS.map(b => b.type);

function getCategoryEntries(catIndex) {
  switch (catIndex) {
    case 0: return ENEMY_ORDER;
    case 1: return BOSS_ORDER;
    case 2: return POWER_ORDER;
    case 3: return BOOST_ORDER;
    default: return [];
  }
}

function getCategoryName(catIndex) {
  return ['Enemies', 'Bosses', 'Powers', 'Boosts'][catIndex] || '';
}

function getCategoryColor(catIndex) {
  return [CATEGORY_COLORS.enemies, CATEGORY_COLORS.bosses, CATEGORY_COLORS.powers, CATEGORY_COLORS.boosts][catIndex] || '#ffffff';
}

function getEntryName(catIndex, entryId) {
  switch (catIndex) {
    case 0: return ENEMY_DEFS[entryId]?.name || entryId;
    case 1: return BOSS_DEFS[entryId]?.name || entryId;
    case 2: {
      const def = POWER_DEFS[entryId];
      if (def) return def.name;
      const evo = EVOLUTION_RECIPES.find(r => r.id === entryId);
      return evo ? evo.name : entryId;
    }
    case 3: return BOOST_COLORS[entryId]?.label?.replace('!', '') || entryId;
    default: return entryId;
  }
}

function getEntryColor(catIndex, entryId) {
  switch (catIndex) {
    case 0: return ENEMY_DEFS[entryId]?.color?.core || '#ffffff';
    case 1: return BOSS_DEFS[entryId]?.color?.core || '#ffffff';
    case 2: {
      const def = POWER_DEFS[entryId];
      if (def) return def.icon;
      const evo = EVOLUTION_RECIPES.find(r => r.id === entryId);
      return evo ? evo.icon : '#ffffff';
    }
    case 3: return BOOST_COLORS[entryId]?.color || '#ffffff';
    default: return '#ffffff';
  }
}

function drawTrianglePath(x, y, r) {
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.866, y + r * 0.5);
  ctx.lineTo(x - r * 0.866, y + r * 0.5);
  ctx.closePath();
}

function drawHexagonPath(x, y, r) {
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 6;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawDiamondPath(x, y, rw, rh) {
  ctx.moveTo(x, y - rh);
  ctx.lineTo(x + rw, y);
  ctx.lineTo(x, y + rh);
  ctx.lineTo(x - rw, y);
  ctx.closePath();
}

function drawGlossaryEnemyPreview(entryId, cx, cy, r) {
  const def = ENEMY_DEFS[entryId];
  if (!def) return;

  const now = Date.now();
  const bob = Math.sin(now * 0.0038) * 1.6;
  const color = def.color.core;
  const glow = def.color.glow || color;

  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.fillStyle = color;
  ctx.shadowColor = glow;
  ctx.shadowBlur = Math.max(8, (def.color.blur || 14) * 0.8);

  if (entryId === 'tracker') {
    ctx.rotate(Math.PI / 4 + now * 0.0014);
    ctx.beginPath();
    drawDiamondPath(0, 0, r * 0.7, r);
    ctx.fill();
  } else if (entryId === 'pulser') {
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.0045);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 - Math.PI / 8;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(204, 102, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = glow;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 8 + pulse * 6;
    ctx.beginPath();
    ctx.arc(0, 0, 3 + pulse * 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.18 + pulse * 0.18;
    ctx.lineWidth = 2.5 - pulse * 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, r + 6 + pulse * 12, 0, Math.PI * 2);
    ctx.stroke();
  } else if (entryId === 'teleporter') {
    const flicker = 0.72 + 0.28 * Math.sin(now * 0.008);
    ctx.globalAlpha = flicker;
    ctx.rotate(Math.sin(now * 0.002) * 0.08);
    ctx.beginPath();
    drawTrianglePath(0, 0, r);
    ctx.fill();
  } else if (entryId === 'bomber') {
    const sparkPulse = 0.5 + 0.5 * Math.sin(now * 0.02);
    const fuseJitter = Math.sin(now * 0.047) * 2.5;
    const fuseJitter2 = Math.cos(now * 0.031) * 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(fuseJitter * 0.5, -r - 5);
    ctx.lineTo(fuseJitter2, -r - 9);
    ctx.lineTo(fuseJitter * 0.35 + 4, -r - 13);
    ctx.stroke();

    ctx.fillStyle = '#ffdd00';
    ctx.shadowColor = '#ffdd00';
    ctx.shadowBlur = 8 + sparkPulse * 6;
    ctx.beginPath();
    ctx.arc(fuseJitter * 0.35 + 4, -r - 13, 1.8 + sparkPulse * 0.9, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000000';
    ctx.globalAlpha = 0.6;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 1);
  } else if (entryId === 'spawner' || entryId === 'spawner_minion') {
    const rot = entryId === 'spawner' ? now * 0.0008 : now * 0.0012;
    ctx.rotate(rot);
    ctx.beginPath();
    drawHexagonPath(0, 0, entryId === 'spawner_minion' ? r * 0.78 : r);
    ctx.fill();

    if (entryId === 'spawner') {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 100, 34, 0.38)';
      ctx.lineWidth = 0.9;
      const cellR = r * 0.22;
      for (const [ox, oy] of [[0, 0], [cellR * 1.5, cellR * 0.9], [-cellR * 1.5, cellR * 0.9]]) {
        ctx.beginPath();
        drawHexagonPath(ox, oy, cellR);
        ctx.stroke();
      }

      const pipY = -r - 8;
      ctx.fillStyle = color;
      ctx.shadowBlur = 6;
      for (let i = 0; i < 2; i++) {
        const pipGlow = 0.5 + 0.5 * Math.sin(now * 0.004 + i * 1.2);
        ctx.globalAlpha = 0.6 + pipGlow * 0.4;
        ctx.beginPath();
        ctx.arc(-4 + i * 8, pipY, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (entryId === 'sniper') {
    const eyePulse = 0.5 + 0.5 * Math.sin(now * 0.006);
    ctx.beginPath();
    drawDiamondPath(0, 0, 5, r);
    ctx.fill();

    ctx.fillStyle = '#ff0044';
    ctx.shadowColor = '#ff0044';
    ctx.shadowBlur = 6 + eyePulse * 8;
    ctx.beginPath();
    ctx.arc(0, 0, 1.8 + eyePulse * 1.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const baseScale = entryId === 'splitter' ? 1 + Math.sin(now * 0.0035) * 0.04 : 1;
    ctx.scale(baseScale, baseScale);
    ctx.beginPath();
    ctx.arc(0, 0, entryId === 'mini_splitter' ? r * 0.72 : r, 0, Math.PI * 2);
    ctx.fill();

    if (entryId === 'splitter') {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawGlossaryBossPreview(entryId, cx, cy, r) {
  const def = BOSS_DEFS[entryId];
  if (!def) return;

  const now = Date.now();
  const bob = Math.sin(now * 0.0032) * 1.8;
  const color = def.color.core;
  const glow = def.color.glow || color;

  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.fillStyle = color;
  ctx.shadowColor = glow;
  ctx.shadowBlur = Math.max(12, (def.color.blur || 22) * 0.75);

  if (entryId === 'hive_queen') {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = glow;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 10;
    for (let i = 0; i < 3; i++) {
      const angle = ((i + 5) / 6) * Math.PI * 2 - Math.PI / 2;
      const bx = Math.cos(angle) * r;
      const by = Math.sin(angle) * r;
      const tipLen = r + 8 + Math.sin(now * 0.005 + i * 1.2) * 3;
      const tipX = Math.cos(angle) * tipLen;
      const tipY = Math.sin(angle) * tipLen;
      ctx.beginPath();
      ctx.moveTo(bx - 4, by);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(bx + 4, by);
      ctx.closePath();
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 170, 34, 0.45)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.rotate(now * 0.0007);
    drawHexagonPath(0, 0, r * 0.5);
    ctx.stroke();
  } else if (entryId === 'nexus_core') {
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.36)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const angle = now * 0.001 + (i / 12) * Math.PI * 2;
      const px = Math.cos(angle) * r * 0.6;
      const py = Math.sin(angle) * r * 0.6;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 12 + (0.5 + 0.5 * Math.sin(now * 0.005)) * 10;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (entryId === 'void_warden') {
    const points = 16;
    ctx.beginPath();
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const jag = r * (0.85 + 0.15 * Math.sin(i * 3.7 + now * 0.002));
      const px = Math.cos(angle) * jag;
      const py = Math.sin(angle) * jag;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const jag = r * (0.85 + 0.15 * Math.sin(i * 3.7 + now * 0.002));
      const px = Math.cos(angle) * jag;
      const py = Math.sin(angle) * jag;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.clip();
    const armLen = r * 0.8;
    for (let i = 0; i < 3; i++) {
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, armLen);
      grad.addColorStop(0, '#cc88ff');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let t = 0; t <= 1; t += 0.08) {
        const angle = now * 0.001 + i * (Math.PI * 2 / 3) + t * Math.PI * 0.8;
        const pr = t * armLen;
        ctx.lineTo(Math.cos(angle) * pr, Math.sin(angle) * pr);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = '#8844cc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const jag = r * (0.85 + 0.15 * Math.sin(i * 3.7 + now * 0.002));
      const px = Math.cos(angle) * jag;
      const py = Math.sin(angle) * jag;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();
}

function isUnlocked(entryId) {
  return G.meta.glossaryUnlocked.includes(entryId);
}

// --- Unlock Logic ---
export function unlockGlossaryEntry(entryId) {
  if (G.meta.glossaryUnlocked.includes(entryId)) return;
  G.meta.glossaryUnlocked.push(entryId);
  saveMeta(G.meta);

  // Find entry name for toast
  let name = entryId;
  if (ENEMY_DEFS[entryId]) name = ENEMY_DEFS[entryId].name;
  else if (BOSS_DEFS[entryId]) name = BOSS_DEFS[entryId].name;
  else if (POWER_DEFS[entryId]) name = POWER_DEFS[entryId].name;
  else {
    const evo = EVOLUTION_RECIPES.find(r => r.id === entryId);
    if (evo) name = evo.name;
    else if (BOOST_COLORS[entryId]) name = BOOST_COLORS[entryId].label.replace('!', '');
  }

  addToast(name);
  events.emit('glossary:unlock', entryId);
}

// --- Toast Notifications ---
function addToast(name) {
  // Only show toasts during gameplay states
  if (G.state !== STATE.PLAYING && G.state !== STATE.WAVE_BREAK &&
      G.state !== STATE.BOSS_FIGHT && G.state !== STATE.BOSS_INTRO_CARD &&
      G.state !== STATE.POWER_SELECT) return;

  if (toasts.length >= MAX_TOASTS) toasts.shift();
  toasts.push({ text: 'NEW: ' + name + ' discovered!', timer: 0 });
}

export function updateToasts(dt) {
  for (let i = toasts.length - 1; i >= 0; i--) {
    toasts[i].timer += dt;
    if (toasts[i].timer >= TOAST_DURATION) {
      toasts.splice(i, 1);
    }
  }
}

export function drawToasts() {
  if (toasts.length === 0) return;
  const touch = isTouchUILayout();
  ctx.save();
  for (let i = 0; i < toasts.length; i++) {
    const t = toasts[i];
    let alpha;
    if (t.timer < TOAST_FADE_IN) {
      alpha = t.timer / TOAST_FADE_IN;
    } else if (t.timer < TOAST_FADE_IN + TOAST_HOLD) {
      alpha = 1;
    } else {
      alpha = 1 - (t.timer - TOAST_FADE_IN - TOAST_HOLD) / TOAST_FADE_OUT;
    }
    alpha = Math.max(0, Math.min(1, alpha));

    const tx = touch ? 24 : W - 20;
    const ty = touch ? (28 + i * 30) : (H - 40 - i * 28);
    const toastW = touch ? 308 : 240;

    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = 'rgba(5, 5, 20, 0.9)';
    ctx.beginPath();
    ctx.roundRect(touch ? tx : (tx - 230), ty - 12, toastW, touch ? 28 : 24, 6);
    ctx.fill();

    ctx.globalAlpha = alpha;
    ctx.font = 'bold ' + (touch ? '13px ' : '12px ') + FONT;
    ctx.textAlign = touch ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffdd44';
    ctx.shadowColor = '#ffdd44';
    ctx.shadowBlur = 4;
    ctx.fillText(t.text, touch ? (tx + 14) : (tx - 6), ty);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

// --- Encounter Tracking Setup ---
export function setupGlossaryTracking() {
  // Enemies: unlock when they spawn (alive, spawn timer expired)
  // We track via a post-spawn event
  events.on('enemySpawned', (data) => {
    unlockGlossaryEntry(data.type);
  });

  // Bosses: unlock when boss intro card plays
  events.on('bossIntroStarted', (data) => {
    unlockGlossaryEntry(data.bossType);
  });

  // Powers: unlock when offered to player (card appears)
  events.on('powerOffered', (data) => {
    if (data.powerId) unlockGlossaryEntry(data.powerId);
  });

  // Evolutions: unlock when evolution card shown
  events.on('evolutionOffered', (data) => {
    if (data.recipeId) unlockGlossaryEntry(data.recipeId);
  });

  // Boosts: unlock when player collects a boost pickup
  events.on('boostCollected', (data) => {
    if (data.type) unlockGlossaryEntry(data.type);
  });
}

// --- Glossary Screen Navigation ---
export function openGlossary(fromState) {
  glossary.prevState = fromState;
  glossary.category = 0;
  glossary.cursor = 0;
  glossary.scrollOffset = 0;
  glossary.detailScroll = 0;
  glossary._listDragAccum = 0;
  G.state = STATE.GLOSSARY;
}

export function closeGlossary() {
  G.state = glossary.prevState || STATE.TITLE;
}

export function glossaryDetailWheel(deltaY) {
  const step = 30;
  glossary.detailScroll += deltaY > 0 ? step : -step;
  const max = glossary._maxDetailScroll || 0;
  glossary.detailScroll = Math.max(0, Math.min(glossary.detailScroll, max));
}

export function glossaryInput(action) {
  const entries = getCategoryEntries(glossary.category);

  switch (action) {
    case 'left':
      glossary.category = (glossary.category + 3) % 4;
      glossary.cursor = 0;
      glossary.scrollOffset = 0;
      glossary.detailScroll = 0;
      break;
    case 'right':
      glossary.category = (glossary.category + 1) % 4;
      glossary.cursor = 0;
      glossary.scrollOffset = 0;
      glossary.detailScroll = 0;
      break;
    case 'up':
      if (entries.length > 0) {
        glossary.cursor = (glossary.cursor + entries.length - 1) % entries.length;
        glossary.detailScroll = 0;
        ensureCursorVisible(entries.length);
      }
      break;
    case 'down':
      if (entries.length > 0) {
        glossary.cursor = (glossary.cursor + 1) % entries.length;
        glossary.detailScroll = 0;
        ensureCursorVisible(entries.length);
      }
      break;
    case 'back':
      closeGlossary();
      break;
  }
}

const LIST_VISIBLE = 16; // max visible entries in list
const LIST_ITEM_H = 28;
const LIST_TOP = 88;
const LIST_LEFT = 20;
const LIST_WIDTH = 340;

function getGlossaryLayout() {
  if (isTouchUILayout()) {
    const tabW = 176;
    const tabH = 34;
    const tabGap = 8;
    const tabStartX = W / 2 - (tabW * 4 + tabGap * 3) / 2;
    const tabStartY = 62;
    return {
      isTouch: true,
      tabs: {
        w: tabW,
        h: tabH,
        gap: tabGap,
        startX: tabStartX,
        startY: tabStartY,
      },
      list: {
        x: 38,
        y: 112,
        w: W - 76,
        h: 182,
        itemH: 34,
        visible: 5,
      },
      detail: {
        x: 38,
        y: 308,
        w: W - 76,
        h: 244,
      },
    };
  }
  return {
    isTouch: false,
    tabs: {
      w: 180,
      h: 24,
      gap: 0,
      startX: (W - 180 * 4) / 2,
      startY: 55,
    },
    list: {
      x: LIST_LEFT,
      y: LIST_TOP,
      w: LIST_WIDTH,
      h: LIST_VISIBLE * LIST_ITEM_H,
      itemH: LIST_ITEM_H,
      visible: LIST_VISIBLE,
    },
    detail: {
      x: 380,
      y: LIST_TOP,
      w: W - 380 - 20,
      h: LIST_VISIBLE * LIST_ITEM_H,
    },
  };
}

function ensureCursorVisible(total) {
  const visible = getGlossaryLayout().list.visible;
  if (glossary.cursor < glossary.scrollOffset) {
    glossary.scrollOffset = glossary.cursor;
  } else if (glossary.cursor >= glossary.scrollOffset + visible) {
    glossary.scrollOffset = glossary.cursor - visible + 1;
  }
}

// --- Click/Tap Hit Testing ---
export function glossaryClickTest(x, y) {
  const layout = getGlossaryLayout();

  for (let i = 0; i < 4; i++) {
    const tx = layout.isTouch
      ? layout.tabs.startX + (i % 2) * (layout.tabs.w + layout.tabs.gap)
      : layout.tabs.startX + i * layout.tabs.w;
    const ty = layout.isTouch
      ? layout.tabs.startY + Math.floor(i / 2) * (layout.tabs.h + 10)
      : layout.tabs.startY - layout.tabs.h / 2;
    const tw = layout.tabs.w;
    const th = layout.isTouch ? layout.tabs.h : 28;
    if (x >= tx && x < tx + tw && y >= ty && y <= ty + th) {
        glossary.category = i;
        glossary.cursor = 0;
        glossary.scrollOffset = 0;
        glossary.detailScroll = 0;
        glossary._listDragAccum = 0;
        return true;
    }
  }

  const list = layout.list;
  if (x >= list.x && x < list.x + list.w && y >= list.y && y < list.y + list.h) {
    const entries = getCategoryEntries(glossary.category);
    const idx = Math.floor((y - list.y) / list.itemH) + glossary.scrollOffset;
    if (idx >= 0 && idx < entries.length) {
      glossary.cursor = idx;
      glossary.detailScroll = 0;
      return true;
    }
  }

  return false;
}

export function glossaryTouchScroll(x, y, deltaY) {
  const layout = getGlossaryLayout();
  if (!layout.isTouch) {
    glossaryDetailWheel(-deltaY);
    return;
  }

  const list = layout.list;
  const detail = layout.detail;
  if (x >= list.x && x < list.x + list.w && y >= list.y && y < list.y + list.h) {
    glossary._listDragAccum = (glossary._listDragAccum || 0) - deltaY;
    const stepThreshold = Math.max(14, list.itemH * 0.5);
    const entries = getCategoryEntries(glossary.category);
    const maxOffset = Math.max(0, entries.length - list.visible);
    while (glossary._listDragAccum >= stepThreshold && glossary.scrollOffset < maxOffset) {
      glossary.scrollOffset += 1;
      glossary._listDragAccum -= stepThreshold;
    }
    while (glossary._listDragAccum <= -stepThreshold && glossary.scrollOffset > 0) {
      glossary.scrollOffset -= 1;
      glossary._listDragAccum += stepThreshold;
    }
    return;
  }

  if (x >= detail.x && x < detail.x + detail.w && y >= detail.y && y < detail.y + detail.h) {
    const max = glossary._maxDetailScroll || 0;
    glossary.detailScroll = Math.max(0, Math.min(max, glossary.detailScroll - deltaY));
  }
}

// --- Detail Panel Data ---
function getEntryDetail(catIndex, entryId) {
  const unlocked = isUnlocked(entryId);

  switch (catIndex) {
    case 0: { // Enemies
      const def = ENEMY_DEFS[entryId];
      if (!def) return null;
      return {
        name: unlocked ? def.name : '???',
        desc: unlocked ? def.desc : 'Not yet encountered.',
        stats: unlocked ? def.stats : '',
        color: unlocked ? def.color.core : '#444444',
        glowColor: unlocked ? def.color.glow : '#222222',
      };
    }
    case 1: { // Bosses
      const def = BOSS_DEFS[entryId];
      if (!def) return null;
      const bossDescs = {
        hive_queen: 'Summons swarms of minions and dashes across the arena. Destroy her before the hive overruns you.',
        nexus_core: 'Teleports and fires beam attacks from multiple angles. Stay mobile and strike between volleys.',
        void_warden: 'The final guardian. Combines all boss abilities with devastating area attacks. Survive the void.',
      };
      const bossGuide = {
        hive_queen: {
          appearance: 'First: Wave 10',
          phases: [
            { name: 'BROOD', desc: 'Bounces around the arena. Spawns 2 minions every 2s (max 8). Straightforward \u2014 focus on landing hits.' },
            { name: 'FRENZY', desc: 'Speed x1.6. Spawns 3 minions every 1.5s (max 15). Every 3s she commands all minions to home on you for 1.5s \u2014 dash away when she flashes yellow.' },
            { name: 'DESPERATION', desc: 'Speed x2, lightly homes on you. Spawns 5 minions every 1s (max 24, 2 HP each). Swarm Command every 2s. At 16+ minions, triggers Swarm Dive \u2014 all minions rush your last position (0.8s telegraph). Each hit on the Queen triggers a knockback pulse.' },
          ],
          tactics: 'Clear minions between dashes to keep the arena manageable. Watch for the yellow flash \u2014 it telegraphs Swarm Command and Swarm Dive. In Desperation, dash through the Queen and immediately change direction to avoid the knockback pulse sending you into the swarm.',
          recommended: 'Chain Lightning, Multi-Pop, Dash Burst, Surge',
        },
        nexus_core: {
          appearance: 'First: Wave 20',
          phases: [
            { name: 'SWARM', desc: 'Bounces around randomly. Spawns drifters every 3s. A warm-up phase \u2014 land hits freely while the arena is clear.' },
            { name: 'PULSE', desc: 'Stops moving. Emits shockwave rings every 2.5s (200px radius). Spawns trackers every 4s. Time your dashes between shockwaves.' },
            { name: 'PHANTOM', desc: 'Teleports every 2s (0.5s telegraph \u2014 watch for particles). Fires a sniper beam after each teleport (1s aim time \u2014 move sideways). Spawns bombers every 5s.' },
            { name: 'RAGE', desc: 'Fast homing (120 px/s). Shockwaves every 2s (150px radius). Teleports every 3s. No more adds \u2014 pure 1v1 pressure.' },
          ],
          tactics: "Each phase introduces a different enemy type's signature attack. In PULSE, dash in right after a shockwave. In PHANTOM, start moving as soon as you see the aim laser \u2014 the beam locks direction after 1s. In RAGE, stay mobile and use the brief teleport recovery window to land hits.",
          recommended: 'Surge, Time Warp, Shield, Stamina Overflow',
        },
        void_warden: {
          appearance: 'First: Wave 30 (Final Boss)',
          phases: [
            { name: 'GRAVITY', desc: 'Stationary. Places 3 gravity wells (80px radius) that pull you in at 150 px/s. Spawns drifters every 3s. Wells reposition every 5s \u2014 memorize their locations.' },
            { name: 'STORM', desc: 'Bounces around. Fires triple sniper beams every 4s (30\u00b0 spread, 1s aim). Up to 2 gravity wells active. Spawns trackers every 4s.' },
            { name: 'WARP', desc: 'Teleports every 1.5s. Leaves an 80x80 hazard zone at each departure point (max 4 active, 8s duration \u2014 deals damage after 2s inside). Moves between teleports at 90 px/s. Spawns bombers every 4s.' },
            { name: 'MIRROR', desc: 'Homing (80 px/s). Spawns 2 mirror copies (same size, 1 HP, respawn after destroyed). All three emit shockwaves every 3s (150px radius). Destroy copies to reduce shockwave pressure.' },
            { name: 'OBLIVION', desc: 'Fast homing (120 px/s). The arena shrinks every 3s (minimum 400x300). Standing outside the safe zone deals damage every 1.5s. Shockwaves every 2s. No adds \u2014 survive and finish it.' },
          ],
          tactics: 'Five phases, each harder than the last. In GRAVITY, dash against the pull to maintain control. In STORM, dodge sideways when you see the triple laser. In WARP, track hazard zones and never backtrack into one. In MIRROR, pop the copies first \u2014 they only take 1 hit. In OBLIVION, stay center and dash aggressively \u2014 the shrinking arena punishes passive play.',
          recommended: 'Shield, Surge, Time Warp, Overdrive, Stamina Overflow',
        },
      };
      const guide = bossGuide[entryId];
      return {
        name: unlocked ? def.name : '???',
        desc: unlocked ? (bossDescs[entryId] || def.tagline) : 'Not yet encountered.',
        stats: unlocked ? ('HP: ' + def.baseHp + ' \u00b7 Phases: ' + def.phases.length + ' \u00b7 Points: ' + def.points) : '',
        extra: unlocked ? ('Shards: ' + def.shards + ' (first time: ' + def.firstTimeShards + ')') : '',
        lore: unlocked ? (BOSS_GLOSSARY_LORE[entryId] || '') : '',
        color: unlocked ? def.color.core : '#444444',
        glowColor: unlocked ? def.color.glow : '#222222',
        appearance: unlocked && guide ? guide.appearance : null,
        phases: unlocked && guide ? guide.phases : null,
        tactics: unlocked && guide ? guide.tactics : null,
        recommended: unlocked && guide ? guide.recommended : null,
      };
    }
    case 2: { // Powers
      const def = POWER_DEFS[entryId];
      if (def) {
        const rarityColor = RARITY_COLORS[def.rarity] || '#ffffff';
        let levelProgression = '';
        if (unlocked && def.maxLevel > 1) {
          const parts = [];
          for (let lv = 1; lv <= def.maxLevel; lv++) {
            parts.push('L' + lv + ': ' + def.desc(lv));
          }
          levelProgression = parts.join(' \u2192 ');
        }
        return {
          name: unlocked ? def.name : '???',
          desc: unlocked ? def.desc(1) : 'Not yet encountered.',
          stats: unlocked ? ('Rarity: ' + def.rarity.charAt(0).toUpperCase() + def.rarity.slice(1) + ' \u00b7 Max Level: ' + def.maxLevel) : '',
          extra: levelProgression,
          color: unlocked ? def.icon : '#444444',
          glowColor: unlocked ? def.icon : '#222222',
          rarity: unlocked ? def.rarity : null,
          rarityColor: unlocked ? rarityColor : '#444444',
        };
      }
      // Evolution
      const evo = EVOLUTION_RECIPES.find(r => r.id === entryId);
      if (evo) {
        return {
          name: unlocked ? evo.name : '???',
          desc: unlocked ? evo.desc : 'Not yet encountered.',
          stats: unlocked ? ('Requires: ' + evo.requires.map(r => {
            const pd = POWER_DEFS[r.id];
            return (pd ? pd.name : r.id) + ' L' + r.minLevel;
          }).join(' + ')) : '',
          color: unlocked ? evo.icon : '#444444',
          glowColor: unlocked ? evo.icon : '#222222',
          rarity: unlocked ? 'evolution' : null,
          rarityColor: unlocked ? RARITY_COLORS.evolution : '#444444',
        };
      }
      return null;
    }
    case 3: { // Boosts
      const bDef = BOOST_DEFS.find(b => b.type === entryId);
      const bColor = BOOST_COLORS[entryId];
      if (!bDef || !bColor) return null;
      const boostDescs = {
        screenNuke: 'Instantly destroys every enemy on screen. Pure devastation.',
        invincibility: "You can't be hurt for 5 seconds. Dash through everything.",
        healthRestore: 'Instantly restores 1 HP. A lifesaver in tough waves.',
        pointFrenzy: 'All kills are worth double points for 8 seconds. Go on a rampage.',
        staminaBurst: 'Unlimited stamina for 6 seconds. Dash without limits.',
      };
      const durStr = bDef.instant ? 'Instant' : (bDef.duration + 's duration');
      return {
        name: unlocked ? bColor.label.replace('!', '') : '???',
        desc: unlocked ? (boostDescs[entryId] || (bDef.instant ? 'Instant effect when collected.' : 'Timed boost when collected.')) : 'Not yet encountered.',
        stats: unlocked ? ('Type: ' + (bDef.instant ? 'Instant' : 'Timed') + ' \u00b7 ' + durStr) : '',
        color: unlocked ? bColor.color : '#444444',
        glowColor: unlocked ? bColor.color : '#222222',
      };
    }
    default: return null;
  }
}

// --- Evolution Recipe Diagram ---
function drawEvolutionRecipeDiagram(cx, y, recipe, unlocked, panelW) {
  const hasEvoSense = G.meta.unlocks.includes(12);
  const showNames = unlocked || hasEvoSense;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Divider
  ctx.strokeStyle = '#222244';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - panelW / 2 + 20, y - 10);
  ctx.lineTo(cx + panelW / 2 - 20, y - 10);
  ctx.stroke();

  // "RECIPE" label
  ctx.font = 'bold 11px ' + FONT;
  ctx.fillStyle = '#555577';
  ctx.fillText('RECIPE', cx, y + 4);
  y += 24;

  // Layout: [comp1] + [comp2] → [evolution]
  const spacing = 60;
  const comp1X = cx - spacing - 20;
  const comp2X = cx;
  const evoX = cx + spacing + 20;

  for (let i = 0; i < 2; i++) {
    const req = recipe.requires[i];
    const def = POWER_DEFS[req.id];
    const compX = i === 0 ? comp1X : comp2X;

    // Component circle (16px radius)
    if (unlocked && def) {
      ctx.fillStyle = def.icon;
      ctx.shadowColor = def.icon;
      ctx.shadowBlur = 6;
    } else if (showNames && def) {
      ctx.fillStyle = def.icon;
      ctx.globalAlpha = 0.5;
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = '#333344';
      ctx.shadowBlur = 0;
    }
    ctx.beginPath();
    ctx.arc(compX, y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Component name
    ctx.font = '10px ' + FONT;
    ctx.fillStyle = showNames ? '#999999' : '#444444';
    ctx.fillText(showNames && def ? def.name : '???', compX, y + 24);

    // Level requirement
    ctx.font = '9px ' + FONT;
    ctx.fillStyle = showNames ? '#666688' : '#333344';
    ctx.fillText(showNames ? 'L' + req.minLevel + '+' : '', compX, y + 36);
  }

  // "+" between components
  ctx.font = 'bold 16px ' + FONT;
  ctx.fillStyle = '#555577';
  ctx.fillText('+', (comp1X + comp2X) / 2, y);

  // "→" arrow
  ctx.fillText('→', (comp2X + evoX) / 2, y);

  // Evolution icon (20px radius, #ffdd44 border)
  if (unlocked) {
    ctx.fillStyle = recipe.icon;
    ctx.shadowColor = recipe.icon;
    ctx.shadowBlur = 8;
  } else {
    ctx.fillStyle = '#333344';
    ctx.shadowBlur = 0;
  }
  ctx.beginPath();
  ctx.arc(evoX, y, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Evolution border
  ctx.strokeStyle = unlocked ? RARITY_COLORS.evolution : '#333344';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(evoX, y, 23, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

// --- Draw Glossary Screen ---
export function drawGlossaryScreen() {
  ctx.save();
  const layout = getGlossaryLayout();
  const listLayout = layout.list;
  const detailLayout = layout.detail;

  // Background
  ctx.fillStyle = 'rgba(5, 5, 20, 0.95)';
  ctx.fillRect(0, 0, W, H);

  // Header
  drawGlowText('CODEX', W / 2, layout.isTouch ? 30 : 26, 'bold ' + (layout.isTouch ? 30 : 28) + 'px ' + FONT, '#ffffff', '#aaaaff', 8);

  // Category tabs
  for (let i = 0; i < 4; i++) {
    const entries = getCategoryEntries(i);
    const catName = getCategoryName(i);
    const catColor = getCategoryColor(i);
    const unlockCount = entries.filter(e => isUnlocked(e)).length;
    const isActive = glossary.category === i;

    const tabX = layout.isTouch
      ? layout.tabs.startX + i * (layout.tabs.w + layout.tabs.gap)
      : layout.tabs.startX + i * layout.tabs.w;
    const tabY = layout.isTouch
      ? layout.tabs.startY
      : layout.tabs.startY - 12;
    const tx = tabX + layout.tabs.w / 2;
    const ty = layout.isTouch ? tabY + layout.tabs.h / 2 : layout.tabs.startY;
    const tabLabel = layout.isTouch
      ? `${catName} ${unlockCount}/${entries.length}`
      : `${catName} (${unlockCount}/${entries.length})`;

    ctx.save();
    ctx.font = (isActive ? 'bold ' : '') + (layout.isTouch ? '13px ' : '14px ') + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (layout.isTouch) {
      ctx.fillStyle = isActive ? 'rgba(20, 26, 42, 0.94)' : 'rgba(10, 14, 24, 0.84)';
      ctx.beginPath();
      ctx.roundRect(tabX, tabY, layout.tabs.w, layout.tabs.h, 14);
      ctx.fill();
      ctx.strokeStyle = isActive ? catColor : 'rgba(120, 150, 190, 0.18)';
      ctx.lineWidth = isActive ? 1.8 : 1;
      ctx.stroke();
      ctx.fillStyle = isActive ? catColor : '#7d8fa7';
      if (isActive) {
        ctx.shadowColor = catColor;
        ctx.shadowBlur = 6;
      }
      ctx.fillText(tabLabel, tx, ty);
    } else {
      if (isActive) {
        ctx.fillStyle = catColor;
        ctx.shadowColor = catColor;
        ctx.shadowBlur = 6;
        ctx.fillText(tabLabel, tx, ty);
        ctx.shadowBlur = 0;
        const textW = ctx.measureText(tabLabel).width;
        ctx.strokeStyle = catColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx - textW / 2, ty + 10);
        ctx.lineTo(tx + textW / 2, ty + 10);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#555555';
        ctx.fillText(tabLabel, tx, ty);
      }
    }
    ctx.restore();
  }

  // Divider line
  ctx.strokeStyle = '#222244';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, layout.isTouch ? 102 : 76);
  ctx.lineTo(W - 20, layout.isTouch ? 102 : 76);
  ctx.stroke();

  // Entry list (left panel)
  const entries = getCategoryEntries(glossary.category);
  const catColor = getCategoryColor(glossary.category);

  if (layout.isTouch) {
    ctx.save();
    ctx.fillStyle = 'rgba(8, 12, 24, 0.86)';
    ctx.beginPath();
    ctx.roundRect(listLayout.x, listLayout.y, listLayout.w, listLayout.h, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,150,190,0.18)';
    ctx.stroke();
    ctx.restore();
  }

  for (let i = 0; i < listLayout.visible && i + glossary.scrollOffset < entries.length; i++) {
    const idx = i + glossary.scrollOffset;
    const entryId = entries[idx];
    const unlocked = isUnlocked(entryId);
    const isSelected = idx === glossary.cursor;
    const ey = listLayout.y + i * listLayout.itemH;

    // Selection highlight
    if (isSelected) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath();
      ctx.roundRect(listLayout.x + 6, ey + 4, listLayout.w - 12, listLayout.itemH - 8, layout.isTouch ? 10 : 3);
      ctx.fill();
      ctx.strokeStyle = catColor;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(listLayout.x + 6, ey + 4, listLayout.w - 12, listLayout.itemH - 8, layout.isTouch ? 10 : 3);
      ctx.stroke();
      ctx.restore();
    }

    // Entry color dot
    const dotColor = unlocked ? getEntryColor(glossary.category, entryId) : '#333333';
    ctx.save();
    ctx.fillStyle = dotColor;
    if (unlocked) {
      ctx.shadowColor = dotColor;
      ctx.shadowBlur = 4;
    }
    ctx.beginPath();
    ctx.arc(listLayout.x + 18, ey + listLayout.itemH / 2, layout.isTouch ? 6 : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Entry name
    ctx.save();
    ctx.font = (layout.isTouch ? '14px ' : '13px ') + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = unlocked ? '#cccccc' : '#444444';
    ctx.fillText(unlocked ? getEntryName(glossary.category, entryId) : '???', listLayout.x + 34, ey + listLayout.itemH / 2);
    ctx.restore();
  }

  // Scroll indicators
  if (glossary.scrollOffset > 0) {
    ctx.save();
    ctx.font = '12px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#555555';
    ctx.fillText('\u25B2', listLayout.x + listLayout.w / 2, listLayout.y - 6);
    ctx.restore();
  }
  if (glossary.scrollOffset + listLayout.visible < entries.length) {
    ctx.save();
    ctx.font = '12px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#555555';
    ctx.fillText('\u25BC', listLayout.x + listLayout.w / 2, listLayout.y + listLayout.visible * listLayout.itemH + 4);
    ctx.restore();
  }

  // Detail panel (right side)
  const detailX = detailLayout.x;
  const detailY = detailLayout.y;
  const detailW = detailLayout.w;
  const detailH = detailLayout.h;

  // Panel border
  ctx.save();
  if (layout.isTouch) {
    ctx.fillStyle = 'rgba(8, 12, 24, 0.88)';
    ctx.beginPath();
    ctx.roundRect(detailX, detailY, detailW, detailH, 16);
    ctx.fill();
  }
  ctx.strokeStyle = '#222244';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(detailX, detailY, detailW, detailH, layout.isTouch ? 16 : 4);
  ctx.stroke();
  ctx.restore();

  if (entries.length > 0 && glossary.cursor < entries.length) {
    const entryId = entries[glossary.cursor];
    const detail = getEntryDetail(glossary.category, entryId);
    const unlocked = isUnlocked(entryId);

    if (detail) {
      // Clip detail panel for scrolling
      ctx.save();
      ctx.beginPath();
      ctx.rect(detailX, detailY, detailW, detailH);
      ctx.clip();
      ctx.translate(0, -glossary.detailScroll);

      let dy = detailY + 40;
      const cx = detailX + detailW / 2;

      const usesGameplayPreview = glossary.category === 0 || glossary.category === 1;
      const previewRadius = glossary.category === 1 ? (layout.isTouch ? 24 : 30) : glossary.category === 0 ? (layout.isTouch ? 20 : 24) : 20;

      // Icon / preview
      ctx.save();
      if (unlocked) {
        if (usesGameplayPreview) {
          if (glossary.category === 0) drawGlossaryEnemyPreview(entryId, cx, dy, previewRadius);
          else drawGlossaryBossPreview(entryId, cx, dy, previewRadius);
        } else {
          ctx.fillStyle = detail.color;
          ctx.shadowColor = detail.glowColor || detail.color;
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.arc(cx, dy, 20, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        if (!usesGameplayPreview && detail.rarityColor && detail.rarity) {
          ctx.strokeStyle = detail.rarityColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, dy, 23, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#222233';
        ctx.beginPath();
        ctx.arc(cx, dy, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#333344';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, dy, 20, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      dy += usesGameplayPreview ? (previewRadius * 2 + 12) : 40;

      // Name
      ctx.save();
      ctx.font = 'bold ' + (layout.isTouch ? '20px ' : '18px ') + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = unlocked ? '#ffffff' : '#555555';
      if (unlocked) { ctx.shadowColor = detail.color; ctx.shadowBlur = 4; }
      ctx.fillText(detail.name, cx, dy);
      ctx.shadowBlur = 0;
      ctx.restore();
      dy += 20;

      // Rarity/Type tag
      if (detail.rarity && unlocked) {
        ctx.save();
        ctx.font = 'bold ' + (layout.isTouch ? '12px ' : '11px ') + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = detail.rarityColor || '#aaaaaa';
        ctx.fillText(detail.rarity.toUpperCase(), cx, dy);
        ctx.restore();
        dy += 12;
      }

      // Divider line
      ctx.save();
      ctx.strokeStyle = '#222244';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(detailX + 20, dy);
      ctx.lineTo(detailX + detailW - 20, dy);
      ctx.stroke();
      ctx.restore();
      dy += 16;

      // Description
      ctx.save();
      ctx.font = (layout.isTouch ? '14px ' : '13px ') + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = unlocked ? '#aaaacc' : '#444444';
      const descLineH = layout.isTouch ? 18 : 16;
      const descLines = wrapTextMeasure(detail.desc, detailW - 30, ctx);
      wrapText(detail.desc, cx, dy, detailW - 30, descLineH);
      dy += descLines * descLineH + 20;
      ctx.restore();

      // Stats section
      if (detail.stats && unlocked) {
        // Stats header
        ctx.save();
        ctx.font = 'bold 11px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#555577';
        ctx.fillText('STATS', cx, dy);
        ctx.restore();
        dy += 16;

        // Vertical key-value stats
        ctx.save();
        ctx.font = '12px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#777799';
        const statParts = detail.stats.split(' \u00b7 ');
        for (const part of statParts) {
          ctx.fillText(part.trim(), cx, dy);
          dy += 16;
        }
        ctx.restore();
        dy += 4;
      }

      // Extra info (shards for bosses)
      if (detail.extra && !detail.rarity && unlocked) {
        ctx.save();
        ctx.font = '11px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#666688';
        ctx.fillText(detail.extra, cx, dy);
        ctx.restore();
        dy += 16;
      }

      // Boss lore (extended glossary entry)
      if (detail.lore && unlocked) {
        dy += 8;
        ctx.save();
        ctx.font = 'italic 11px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#888888';
        const loreLines = wrapTextMeasure(detail.lore, detailW - 30, ctx);
        wrapText(detail.lore, cx, dy, detailW - 30, 14);
        dy += loreLines * 14 + 8;
        ctx.restore();
      }

      // --- Boss Fight Guide Sections ---
      if (detail.appearance && unlocked) {
        // Appearance
        dy += 8;
        ctx.save();
        ctx.strokeStyle = '#222244';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(detailX + 20, dy);
        ctx.lineTo(detailX + detailW - 20, dy);
        ctx.stroke();
        ctx.restore();
        dy += 12;

        ctx.save();
        ctx.font = 'bold 11px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#555577';
        ctx.fillText('APPEARS', cx, dy);
        ctx.restore();
        dy += 14;

        ctx.save();
        ctx.font = '12px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#777799';
        ctx.fillText(detail.appearance, cx, dy);
        ctx.restore();
        dy += 16;
      }

      if (detail.phases && unlocked) {
        // Phase Breakdown
        ctx.save();
        ctx.font = 'bold 11px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#555577';
        ctx.fillText('PHASES', cx, dy);
        ctx.restore();
        dy += 14;

        for (let pi = 0; pi < detail.phases.length; pi++) {
          const phase = detail.phases[pi];
          // Phase name
          ctx.save();
          ctx.font = 'bold ' + (layout.isTouch ? '13px ' : '12px ') + FONT;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffdd44';
          ctx.fillText(phase.name, cx, dy);
          ctx.restore();
          dy += 14;

          // Phase description (word-wrapped)
          ctx.save();
          ctx.font = (layout.isTouch ? '12px ' : '11px ') + FONT;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#888899';
          const phaseLineH = layout.isTouch ? 14 : 13;
          const phaseLines = wrapTextMeasure(phase.desc, detailW - 30, ctx);
          wrapText(phase.desc, cx, dy, detailW - 30, phaseLineH);
          dy += phaseLines * phaseLineH;
          ctx.restore();
          dy += 8;
        }
        dy += 4;
      }

      if (detail.tactics && unlocked) {
        // Tactics
        ctx.save();
        ctx.font = 'bold 11px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#555577';
        ctx.fillText('TACTICS', cx, dy);
        ctx.restore();
        dy += 14;

        ctx.save();
        ctx.font = 'italic ' + (layout.isTouch ? '13px ' : '12px ') + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#aaddaa';
        const tacticsLineH = layout.isTouch ? 15 : 14;
        const tacticsLines = wrapTextMeasure(detail.tactics, detailW - 30, ctx);
        wrapText(detail.tactics, cx, dy, detailW - 30, tacticsLineH);
        dy += tacticsLines * tacticsLineH;
        ctx.restore();
        dy += 12;
      }

      if (detail.recommended && unlocked) {
        // Recommended Powers
        ctx.save();
        ctx.font = 'bold 11px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#555577';
        ctx.fillText('RECOMMENDED POWERS', cx, dy);
        ctx.restore();
        dy += 14;

        ctx.save();
        ctx.font = '12px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#88aaff';
        ctx.fillText(detail.recommended, cx, dy);
        ctx.restore();
        dy += 8;
      }

      // Level progression (powers)
      if (detail.extra && detail.rarity && unlocked) {
        dy += 4;
        ctx.save();
        ctx.font = '11px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#666688';
        wrapText(detail.extra, cx, dy, detailW - 20, 13);
        ctx.restore();
      }

      // Evolution recipe diagram (for evolution entries in Powers category)
      if (glossary.category === 2) {
        const evo = EVOLUTION_RECIPES.find(r => r.id === entryId);
        if (evo) {
          drawEvolutionRecipeDiagram(cx, dy + 30, evo, unlocked, detailW);
        }
      }

      // Track content height for scroll clamping
      const contentBottom = dy + 20;
      const maxScroll = Math.max(0, contentBottom - detailY - detailH);
      if (glossary.detailScroll > maxScroll) glossary.detailScroll = maxScroll;
      glossary._maxDetailScroll = maxScroll;

      // Restore clip
      ctx.restore();

      // Scroll indicators (drawn outside clip)
      if (maxScroll > 0) {
        if (glossary.detailScroll > 0) {
          ctx.save();
          ctx.font = '12px ' + FONT;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#555577';
          ctx.fillText('\u25B2', cx, detailY + 10);
          ctx.restore();
        }
        if (glossary.detailScroll < maxScroll) {
          ctx.save();
          ctx.font = '12px ' + FONT;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#555577';
          ctx.fillText('\u25BC', cx, detailY + detailH - 6);
          ctx.restore();
        }
      }
    }
  }

  // Footer hints
  if (!layout.isTouch) {
    ctx.save();
    ctx.font = '13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#444444';
    ctx.fillText('\u2190\u2192 Category  \u2191\u2193 Select  ESC Back', W / 2, H - 18);
    ctx.restore();
  }

  ctx.restore();
}

// Simple text wrapping helper
function wrapText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let lineY = y;

  for (const word of words) {
    const test = line + (line ? ' ' : '') + word;
    const w = ctx.measureText(test).width;
    if (w > maxWidth && line) {
      ctx.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, lineY);
}

// Measure how many lines wrapText would produce
function wrapTextMeasure(text, maxWidth, context) {
  const words = text.split(' ');
  let line = '';
  let lines = 1;
  for (const word of words) {
    const test = line + (line ? ' ' : '') + word;
    const w = context.measureText(test).width;
    if (w > maxWidth && line) {
      lines++;
      line = word;
    } else {
      line = test;
    }
  }
  return lines;
}
