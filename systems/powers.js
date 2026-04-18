'use strict';

import { G } from '../state.js';
import { RARITY_COLORS, MAX_POWER_SLOTS } from '../config.js';
import {
  RARITY_ORDER,
  getRewardContextForWave,
  getAllowedRaritiesForContext,
  getRewardTags,
  getSlotBudgets,
  getFallbackRarities,
} from './reward-context.js';

// --- Power Definitions ---
// Each power: { id, name, rarity, maxLevel, description(level), levelValues }
export const POWER_DEFS = {
  // Existing — reclassified
  shield: {
    id: 'shield', name: 'Shield', rarity: 'common', maxLevel: 3, special: false,
    desc: l => ['Block 1 hit/wave, regen 20s', 'Block 2 hits/wave, regen 15s', 'Block 3 hits/wave, regen 12s'][l - 1],
    icon: '#4488ff', shape: 'circle',
    levels: [
      { charges: 1, duration: 12, regenTime: 20 },
      { charges: 2, duration: 15, regenTime: 15 },
      { charges: 3, duration: 18, regenTime: 12 },
    ],
  },
  magnet: {
    id: 'magnet', name: 'Magnet', rarity: 'common', maxLevel: 3, special: false,
    desc: l => ['Pull 100px, 180px/s', 'Pull 150px, 260px/s +15% slow', 'Pull 220px, 340px/s +25% slow'][l - 1],
    icon: '#ffdd00', shape: 'diamond',
    levels: [
      { radius: 100, speed: 180, duration: 5, enemySlow: 0 },
      { radius: 150, speed: 260, duration: 7, enemySlow: 0.15 },
      { radius: 220, speed: 340, duration: 9, enemySlow: 0.25 },
    ],
  },
  surge: {
    id: 'surge', name: 'Surge', rarity: 'rare', maxLevel: 3, special: false,
    desc: l => ['350 drift, 1300 dash, 8 kills', '400 drift, 1500 dash, 12 kills', '450 drift, 1700 dash, 16 kills'][l - 1],
    icon: '#ff4444', shape: 'triangle',
    levels: [
      { driftMax: 350, dashSpeed: 1300, duration: 6, surgeKillsPerWave: 8 },
      { driftMax: 400, dashSpeed: 1500, duration: 8, surgeKillsPerWave: 12 },
      { driftMax: 450, dashSpeed: 1700, duration: 10, surgeKillsPerWave: 16 },
    ],
  },
  multipop: {
    id: 'multipop', name: 'Multi-Pop', rarity: 'rare', maxLevel: 3, special: false,
    desc: l => ['3 charges, 80px', '5 charges, 100px', '8 charges, 120px'][l - 1],
    icon: '#44ff88', shape: 'star',
    levels: [
      { charges: 3, radius: 80 },
      { charges: 5, radius: 100 },
      { charges: 8, radius: 120 },
    ],
  },
  heart: {
    id: 'heart', name: 'Heart', rarity: 'common', maxLevel: 1, special: true,
    desc: () => 'Restore 1 HP',
    icon: '#ff4488', shape: 'heart',
    levels: [{}],
  },
  // New powers
  chainLightning: {
    id: 'chainLightning', name: 'Chain Lightning', rarity: 'rare', maxLevel: 3, special: false,
    desc: l => ['Chain 2, 100px', 'Chain 3, 130px', 'Chain 4, 160px'][l - 1],
    icon: '#88ccff', shape: 'bolt',
    levels: [
      { chainRange: 100, maxBounces: 2 },
      { chainRange: 130, maxBounces: 3 },
      { chainRange: 160, maxBounces: 4 },
    ],
  },
  timeWarp: {
    id: 'timeWarp', name: 'Time Warp', rarity: 'rare', maxLevel: 3, special: false,
    desc: l => ['110px, 55% slow', '145px, 65% slow +freeze', '180px, 75% slow +freeze'][l - 1],
    icon: '#6644cc', shape: 'clock',
    levels: [
      { radius: 110, speedMul: 0.45, freezeDuration: 0.5 },
      { radius: 145, speedMul: 0.35, freezeDuration: 0.8 },
      { radius: 180, speedMul: 0.25, freezeDuration: 1.2 },
    ],
  },
  dashBurst: {
    id: 'dashBurst', name: 'Dash Burst', rarity: 'common', maxLevel: 3, special: false,
    desc: l => ['60px explosion', '80px explosion', '100px + fire zone'][l - 1],
    icon: '#ff8844', shape: 'burst',
    levels: [
      { radius: 60, fireZone: false },
      { radius: 80, fireZone: false },
      { radius: 100, fireZone: true, fireZoneDuration: 1.5 },
    ],
  },
  shellGuard: {
    id: 'shellGuard', name: 'Shell Guard', rarity: 'common', maxLevel: 3, special: false,
    desc: l => ['2 orbs, 50px orbit, regen 8s', '3 orbs, 55px orbit, regen 5.5s', '4 orbs, 60px orbit, regen 4s'][l - 1],
    icon: '#44ff88', shape: 'orb',
    levels: [
      { orbCount: 2, orbitRadius: 50, respawn: true, respawnTime: 8.0, orbKillCooldown: 0.3 },
      { orbCount: 3, orbitRadius: 55, respawn: true, respawnTime: 5.5, orbKillCooldown: 0.3 },
      { orbCount: 4, orbitRadius: 60, respawn: true, respawnTime: 4.0, orbKillCooldown: 0.3 },
    ],
  },
  lifeSteal: {
    id: 'lifeSteal', name: 'Soul Harvest', rarity: 'epic', maxLevel: 3, special: false,
    desc: l => ['Every 8th kill heals 1 HP (2/wave)', 'Every 6th kill heals 1 HP (3/wave)', 'Every 5th kill heals 1 HP (4/wave) +shield-pierce'][l - 1],
    icon: '#44ff44', shape: 'cross',
    levels: [
      { killInterval: 8, maxHeals: 2, hardcoreStamina: 10, shieldPierceDuration: 0 },
      { killInterval: 6, maxHeals: 3, hardcoreStamina: 15, shieldPierceDuration: 0 },
      { killInterval: 5, maxHeals: 4, hardcoreStamina: 20, shieldPierceDuration: 0.5 },
    ],
  },
  staminaOverflow: {
    id: 'staminaOverflow', name: 'Stamina Overflow', rarity: 'common', maxLevel: 3, special: false,
    desc: l => ['+35 max, +12/s regen', '+60 max, +18/s regen, -3 dash', '+80 max, +24/s, -8 dash'][l - 1],
    icon: '#00eeff', shape: 'bar',
    levels: [
      { maxBonus: 35, regenBonus: 12, dashCostReduction: 0 },
      { maxBonus: 60, regenBonus: 18, dashCostReduction: 3 },
      { maxBonus: 80, regenBonus: 24, dashCostReduction: 8 },
    ],
  },
  overdrive: {
    id: 'overdrive', name: 'Overdrive', rarity: 'epic', maxLevel: 3, special: false,
    desc: l => ['4s invincible', '5s invincible +20% speed', '6s invincible +30% +2x pts'][l - 1],
    icon: '#ffdd44', shape: 'star',
    levels: [
      { duration: 4.0, speedBoost: 0, doublePoints: false },
      { duration: 5.0, speedBoost: 0.2, doublePoints: false },
      { duration: 6.0, speedBoost: 0.3, doublePoints: true },
    ],
  },
};

// --- Evolution Recipes ---
export const EVOLUTION_RECIPES = [
  {
    id: 'reflectiveShield', name: 'Reflective Shield',
    requires: [{ id: 'shield', minLevel: 3 }, { id: 'surge', minLevel: 3 }],
    desc: 'Keep Shield III and Surge III, plus shockwave blocks',
    icon: '#4488ff', shape: 'circle', borderColor: RARITY_COLORS.evolution,
  },
  {
    id: 'gravityBomb', name: 'Gravity Bomb',
    requires: [{ id: 'magnet', minLevel: 3 }, { id: 'multipop', minLevel: 3 }],
    desc: 'Keep Magnet III and Multi-Pop III, plus gravity wells on kill',
    icon: '#8844aa', shape: 'burst', borderColor: RARITY_COLORS.evolution,
  },
  {
    id: 'thunderDash', name: 'Thunder Dash',
    requires: [{ id: 'surge', minLevel: 3 }, { id: 'chainLightning', minLevel: 3 }],
    desc: 'Dash leaves 2s lightning trail that kills on contact',
    icon: '#aaddff', shape: 'bolt', borderColor: RARITY_COLORS.evolution,
  },
  {
    id: 'novaCore', name: 'Nova Core',
    requires: [{ id: 'shellGuard', minLevel: 3 }, { id: 'dashBurst', minLevel: 3 }],
    desc: 'Keep Shell Guard III and Dash Burst III, plus orb detonations',
    icon: '#ff8844', shape: 'burst', borderColor: RARITY_COLORS.evolution,
  },
];

export const BOSS_SIGIL_DEFS = {
  hive_queen: {
    id: 'broodbreaker',
    name: 'Broodbreaker Sigil',
    routeLabel: 'Boss Sigil',
    title: 'Broodbreaker Sigil',
    accent: '#ffb26f',
    summary: [
      'The first 3 minion kills each wave refund stamina.',
      'Those kills also burst nearby pressure apart.',
    ],
    chips: ['+12 STA', 'Minion Burst'],
  },
  nexus_core: {
    id: 'feedback',
    name: 'Feedback Sigil',
    routeLabel: 'Boss Sigil',
    title: 'Feedback Sigil',
    accent: '#8dd8ff',
    summary: [
      'Every 5th dash fires a short chain zap.',
      'Arc pressure into up to 2 nearby enemies.',
    ],
    chips: ['Every 5th Dash', 'Chain Zap'],
  },
};

const START_COMMON_POWER_IDS = ['shield', 'magnet', 'dashBurst', 'shellGuard', 'staminaOverflow'];
const START_ARSENAL_POWER_IDS = [
  'shield', 'magnet', 'dashBurst', 'shellGuard', 'staminaOverflow',
  'surge', 'multipop', 'chainLightning', 'timeWarp',
];

// --- Offering Algorithm ---
export function getPlayerPower(powerId) {
  return G.player.powers.find(p => p.id === powerId);
}

export function getPlayerPowerLevel(powerId) {
  const p = getPlayerPower(powerId);
  return p ? p.level : 0;
}

function buildPowerCard(def, rewardContext) {
  const held = getPlayerPower(def.id);
  const isUpgrade = held && held.level < def.maxLevel;
  return {
    powerId: def.id,
    name: def.name,
    rarity: def.rarity,
    desc: def.desc(isUpgrade ? held.level + 1 : 1),
    icon: def.icon,
    shape: def.shape,
    currentLevel: held ? held.level : 0,
    nextLevel: held ? held.level + 1 : 1,
    isUpgrade,
    isEvolution: false,
    rewardContext,
    rewardTags: getRewardTags(def.rarity, rewardContext, isUpgrade),
  };
}

function applyPreviousOfferingWeights(candidates, respectPreviousPenalty) {
  if (!respectPreviousPenalty || G.previousOffering.length === 0) {
    return candidates.map(c => ({ ...c, weight: 1 }));
  }
  return candidates.map(c => ({
    ...c,
    weight: G.previousOffering.includes(c.id) ? 0.5 : 1,
  }));
}

function pickWeightedCandidate(candidates) {
  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  let r = Math.random() * totalWeight;
  let picked = candidates[0];
  for (const c of candidates) {
    r -= c.weight;
    if (r <= 0) {
      picked = c;
      break;
    }
  }
  return picked;
}

function getRecipePartnerPriority(powerId) {
  let priority = 0;
  for (const recipe of EVOLUTION_RECIPES) {
    const entry = recipe.requires.find(req => req.id === powerId);
    if (!entry) continue;
    const otherReq = recipe.requires.find(req => req.id !== powerId);
    if (otherReq && getPlayerPowerLevel(otherReq.id) > 0) priority = 2;
    else priority = Math.max(priority, 1);
  }
  return priority;
}

function sortBossPathCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const aHeld = !!getPlayerPower(a.id);
    const bHeld = !!getPlayerPower(b.id);
    if (aHeld !== bHeld) return aHeld ? -1 : 1;
    const aPair = getRecipePartnerPriority(a.id);
    const bPair = getRecipePartnerPriority(b.id);
    if (aPair !== bPair) return bPair - aPair;
    const aRarity = RARITY_ORDER.indexOf(a.rarity);
    const bRarity = RARITY_ORDER.indexOf(b.rarity);
    if (aRarity !== bRarity) return bRarity - aRarity;
    return a.name.localeCompare(b.name);
  });
}

function getCuratedBossPathCard(meta) {
  if (G.pendingEvolution) {
    return createEvolutionCard(G.pendingEvolution, 'boss_power_path');
  }

  const pool = getCandidatePool().filter(def => def.rarity === 'rare' || def.rarity === 'epic');
  if (pool.length === 0) return null;

  const heldPriority = sortBossPathCandidates(pool.filter(def => {
    const held = getPlayerPower(def.id);
    return held && held.level < def.maxLevel;
  }));
  if (heldPriority.length > 0) return buildPowerCard(heldPriority[0], 'boss_power_path');

  const pairingPriority = sortBossPathCandidates(pool.filter(def => {
    if (getPlayerPower(def.id)) return false;
    return getRecipePartnerPriority(def.id) >= 2;
  }));
  if (pairingPriority.length > 0) return buildPowerCard(pairingPriority[0], 'boss_power_path');

  const unheldPriority = sortBossPathCandidates(pool.filter(def => !getPlayerPower(def.id)));
  if (unheldPriority.length > 0) return buildPowerCard(unheldPriority[0], 'boss_power_path');

  return null;
}

function getRarityRoll(wave, meta) {
  // Base probabilities by wave range
  let common, rare, epic;
  if (wave <= 3) { common = 60; rare = 30; epic = 10; }
  else {
    const tier = Math.floor((wave - 1) / 3);
    common = Math.max(40, 60 - tier * 3);
    rare = Math.min(42, 30 + tier * 2);
    epic = Math.min(18, 10 + tier * 1);
  }

  const roll = Math.random() * 100;
  if (roll < common) return 'common';
  if (roll < common + rare) return 'rare';
  return 'epic';
}

function getCandidatePool() {
  const pool = [];
  const atCap = G.player.powers.length >= MAX_POWER_SLOTS;

  for (const def of Object.values(POWER_DEFS)) {
    if (def.special && def.id === 'heart') {
      // Heart only if HP < max — exempt from slot cap
      if (G.player.hp < G.player.maxHp) pool.push(def);
      continue;
    }
    if (def.special) continue;
    // Overdrive removed from offering pool (replaced by Loot Crate boosts)
    if (def.id === 'overdrive') continue;
    // Soul Harvest works in hardcore (grants stamina instead of HP)
    const held = getPlayerPower(def.id);
    if (held && held.level >= def.maxLevel) continue; // already maxed
    // Check if power was consumed by evolution
    if (held && held.evolved) continue;
    // At cap: only offer upgrades to existing powers, no new base powers
    if (atCap && !held) continue;
    pool.push(def);
  }
  // Filter out powers consumed by evolutions
  const evolvedIds = G.player.powers.filter(p => p.evolved).map(p => p.id);
  return pool.filter(p => !evolvedIds.includes(p.id));
}

export function generateOffering(wave, meta, rewardContext = 'standard') {
  if (rewardContext === 'boss_power_path') {
    const card = getCuratedBossPathCard(meta);
    return card ? [card] : [];
  }

  const basePool = getCandidatePool();
  let pool = basePool;
  if (rewardContext === 'start_common_choice') {
    pool = basePool.filter(def => START_COMMON_POWER_IDS.includes(def.id) && !getPlayerPower(def.id));
  } else if (rewardContext === 'start_arsenal_choice') {
    pool = basePool.filter(def => START_ARSENAL_POWER_IDS.includes(def.id) && !getPlayerPower(def.id));
  }

  const offering = [];
  const usedIds = new Set();
  const atCap = G.player.powers.length >= MAX_POWER_SLOTS;
  const allowedRarities = getAllowedRaritiesForContext(rewardContext);
  const respectPreviousPenalty = rewardContext === 'standard';
  const includeEvolution = rewardContext === 'milestone' && !!G.pendingEvolution;
  const budgets = getSlotBudgets(rewardContext, meta.unlocks.includes(10));
  const cardCount = includeEvolution ? 2 : 3;

  for (let slot = 0; slot < cardCount; slot++) {
    const desiredRarity = budgets[slot] || getRarityRoll(wave, meta);
    let candidates = [];

    for (const rarity of getFallbackRarities(desiredRarity, allowedRarities)) {
      candidates = pool.filter(def => def.rarity === rarity && !usedIds.has(def.id));
      if (candidates.length > 0) break;
    }

    if (candidates.length === 0) {
      candidates = pool.filter(def => !usedIds.has(def.id) && allowedRarities.includes(def.rarity));
    }

    if (candidates.length === 0 && atCap) {
      candidates = pool.filter(def => {
        const held = getPlayerPower(def.id);
        return held && held.level < def.maxLevel && def.id !== 'heart' && allowedRarities.includes(def.rarity);
      });
    }

    if (candidates.length === 0) break;

    const picked = pickWeightedCandidate(applyPreviousOfferingWeights(candidates, respectPreviousPenalty));
    offering.push(buildPowerCard(picked, rewardContext));
    usedIds.add(picked.id);
  }

  if (includeEvolution) {
    offering.push(createEvolutionCard(G.pendingEvolution, rewardContext));
  }
  return offering;
}

export function checkEvolutionAvailable() {
  for (const recipe of EVOLUTION_RECIPES) {
    // Check if player already has this evolution
    if (G.player.powers.find(p => p.id === recipe.id)) continue;

    const allMet = recipe.requires.every(req => {
      const held = getPlayerPower(req.id);
      return held && held.level >= req.minLevel;
    });

    if (allMet) return recipe;
  }
  return null;
}

export function createEvolutionCard(recipe, rewardContext = 'milestone') {
  return {
    powerId: recipe.id,
    name: recipe.name,
    rarity: 'evolution',
    desc: recipe.desc,
    icon: recipe.icon,
    shape: recipe.shape,
    currentLevel: 0,
    nextLevel: 1,
    isUpgrade: false,
    isEvolution: true,
    recipe: recipe,
    rewardContext,
    rewardTags: rewardContext === 'boss_power_path'
      ? ['Power Path', 'Evolution']
      : rewardContext === 'milestone'
        ? ['Milestone', 'Evolution']
        : ['Evolution'],
  };
}

// --- Apply Power Pick ---
export function applyPowerPick(card) {
  if (card.isEvolution) {
    // Remove component powers
    for (const req of card.recipe.requires) {
      const idx = G.player.powers.findIndex(p => p.id === req.id);
      if (idx >= 0) G.player.powers.splice(idx, 1);
    }
    // Add evolution
    G.player.powers.push({ id: card.powerId, level: 1, evolved: true });
    return;
  }

  if (card.powerId === 'heart') {
    if (G.isHardcore) {
      // Hardcore: hearts convert to score
      G.score += 500;
      return;
    }
    // Instant heal
    if (G.player.hp < G.player.maxHp) {
      G.player.hp++;
    } else {
      G.score += 200;
    }
    return;
  }

  const existing = getPlayerPower(card.powerId);
  if (existing) {
    existing.level = Math.min(existing.level + 1, POWER_DEFS[card.powerId].maxLevel);
  } else {
    // Enforce slot cap — never exceed MAX_POWER_SLOTS
    if (G.player.powers.length >= MAX_POWER_SLOTS) return;
    G.player.powers.push({ id: card.powerId, level: 1 });
  }
}

// --- Apply Powers at Wave Start ---
export function applyWaveStartPowers() {
  const player = G.player;

  // Reset per-wave active states
  player.shieldCharges = 0;
  player.shieldRegenTimer = 0;
  player.soulHarvestPierceTimer = 0;
  player.magnetActive = false;
  player.surgeActive = false;
  player.surgeKillsRemaining = 0;
  player.multiPopCharges = 0;
  player.overdriveTimer = 0;
  player.overdrive2x = false;
  player.overdriveSpeed = 0;
  player.staminaRegenBonus = 0;
  player.dashCostReduction = 0;

  for (const power of player.powers) {
    const def = POWER_DEFS[power.id];
    if (!def) continue;
    const lv = power.level;
    const vals = def.levels ? def.levels[lv - 1] : null;
    if (!vals) continue;

    switch (power.id) {
      case 'shield':
        player.shieldCharges = vals.charges;
        break;
      case 'magnet':
        player.magnetActive = true;
        player.magnetRadius = vals.radius;
        player.magnetSpeed = vals.speed;
        break;
      case 'surge':
        player.surgeActive = true;
        player.surgeDriftMax = vals.driftMax;
        player.surgeDashSpeed = vals.dashSpeed;
        player.surgeKillsRemaining = vals.surgeKillsPerWave; // -1 = unlimited
        break;
      case 'multipop':
        player.multiPopCharges = vals.charges;
        player.multiPopRadius = vals.radius;
        break;
      case 'shellGuard':
        // Rebuild orbs
        player.shellGuardOrbs = [];
        for (let i = 0; i < vals.orbCount; i++) {
          player.shellGuardOrbs.push({ alive: true, respawnTimer: 0, killCooldown: 0.3, angle: (i / vals.orbCount) * Math.PI * 2 });
        }
        break;
      case 'staminaOverflow':
        player.maxStamina = (G.meta.unlocks.includes(3) ? 115 : 100) + vals.maxBonus;
        player.stamina = Math.min(player.stamina, player.maxStamina);
        player.staminaRegenBonus = vals.regenBonus;
        player.dashCostReduction = vals.dashCostReduction;
        break;
      case 'overdrive':
        player.overdriveTimer = vals.duration;
        player.overdriveSpeed = vals.speedBoost;
        player.overdrive2x = vals.doublePoints;
        break;
    }
  }

  // Evolutions
  for (const power of player.powers) {
    if (!power.evolved) continue;
    switch (power.id) {
      case 'reflectiveShield':
        player.shieldCharges = 3;
        player.surgeActive = true;
        player.surgeDriftMax = 450;
        player.surgeDashSpeed = 1700;
        player.surgeKillsRemaining = 16;
        break;
      case 'gravityBomb':
        player.magnetActive = true;
        player.magnetRadius = 220;
        player.magnetSpeed = 340;
        player.multiPopCharges = 8;
        player.multiPopRadius = 120;
        break;
      case 'thunderDash':
        player.surgeActive = true;
        player.surgeDriftMax = 450;
        player.surgeDashSpeed = 1700;
        player.surgeKillsRemaining = 16;
        break;
      case 'novaCore':
        player.shellGuardOrbs = [];
        for (let i = 0; i < 4; i++) {
          player.shellGuardOrbs.push({ alive: true, respawnTimer: 0, killCooldown: 0.3, angle: (i / 4) * Math.PI * 2 });
        }
        break;
    }
  }
}

// Track Soul Harvest (life steal) state per wave
let soulHarvestHealsThisWave = 0;
let soulHarvestKillCounter = 0;

export function resetWaveCounters() {
  soulHarvestHealsThisWave = 0;
  soulHarvestKillCounter = 0;
  if (G.player?.sigilState) {
    G.player.sigilState.broodbreakerKillsLeft = G.player.sigils?.includes('broodbreaker') ? 3 : 0;
  }
}

// Returns: false | 'heal' | 'stamina' (what happened)
export function tryLifeSteal() {
  const power = getPlayerPower('lifeSteal');
  if (!power) return false;
  const vals = POWER_DEFS.lifeSteal.levels[power.level - 1];
  if (soulHarvestHealsThisWave >= vals.maxHeals) return false;

  soulHarvestKillCounter++;
  if (soulHarvestKillCounter < vals.killInterval) return false;
  soulHarvestKillCounter = 0;

  // Hardcore: grant stamina instead of HP
  if (G.isHardcore) {
    G.player.stamina = Math.min(G.player.maxStamina || 100, G.player.stamina + vals.hardcoreStamina);
    soulHarvestHealsThisWave++;
    // L3 shield-pierce on trigger
    if (vals.shieldPierceDuration > 0) {
      G.player.soulHarvestPierceTimer = vals.shieldPierceDuration;
    }
    return 'stamina';
  }

  // Normal: heal 1 HP
  if (G.player.hp >= G.player.maxHp) return false;
  G.player.hp++;
  soulHarvestHealsThisWave++;
  // L3 shield-pierce on heal
  if (vals.shieldPierceDuration > 0) {
    G.player.soulHarvestPierceTimer = vals.shieldPierceDuration;
  }
  return 'heal';
}
