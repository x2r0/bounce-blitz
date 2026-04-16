'use strict';

const META_KEY = 'bounceblitz_meta';

const ANALYTICS_LOADOUT_IDS = ['standard', 'glass_cannon', 'tank', 'hardcore'];

function createDefaultLoadoutAnalytics() {
  return {
    runs: 0,
    wins: 0,
    deaths: 0,
    storyRuns: 0,
    endlessRuns: 0,
    totalWave: 0,
    totalScore: 0,
    totalKills: 0,
    totalDamageTaken: 0,
    totalRevivesUsed: 0,
    bestWave: 0,
    bestScore: 0,
  };
}

function createDefaultAnalytics() {
  const loadouts = {};
  for (const id of ANALYTICS_LOADOUT_IDS) loadouts[id] = createDefaultLoadoutAnalytics();
  return {
    storyRuns: 0,
    endlessRuns: 0,
    storyVictories: 0,
    endlessDeaths: 0,
    totalDamageTaken: 0,
    totalRevivesUsed: 0,
    totalStoryIntroSkips: 0,
    loadouts,
    recentRuns: [],
  };
}

function normalizeAnalytics(analytics) {
  const merged = { ...createDefaultAnalytics(), ...(analytics || {}) };
  const loadouts = {};
  const incomingLoadouts = analytics?.loadouts || {};
  for (const id of ANALYTICS_LOADOUT_IDS) {
    loadouts[id] = { ...createDefaultLoadoutAnalytics(), ...(incomingLoadouts[id] || {}) };
  }
  merged.loadouts = loadouts;
  merged.recentRuns = Array.isArray(merged.recentRuns) ? merged.recentRuns.slice(-20) : [];
  return merged;
}

const DEFAULT_META = {
  shards: 0,
  totalShardsEarned: 0,
  unlocks: [],
  selectedLoadout: 'standard',
  bestWave: 0,
  totalRuns: 0,
  totalKills: 0,
  endlessUnlocked: false,
  hardcoreUnlocked: false,
  hardcoreBestWave: 0,
  hardcoreHighScore: 0,
  hardcoreFirstClear: false,
  glossaryUnlocked: [],
  analytics: createDefaultAnalytics(),
};

export function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_META, ...parsed, analytics: normalizeAnalytics(parsed.analytics) };
    }
  } catch (e) { /* ignore */ }
  return { ...DEFAULT_META, analytics: createDefaultAnalytics() };
}

export function saveMeta(meta) {
  meta.analytics = normalizeAnalytics(meta.analytics);
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export function recordRunAnalytics(meta, run) {
  const analytics = normalizeAnalytics(meta.analytics);
  const loadoutId = ANALYTICS_LOADOUT_IDS.includes(run.loadout) ? run.loadout : 'standard';
  const bucket = analytics.loadouts[loadoutId];

  if (run.isEndlessRun) analytics.endlessRuns++;
  else analytics.storyRuns++;
  if (run.isVictory && !run.isEndlessRun) analytics.storyVictories++;
  if (!run.isVictory && run.isEndlessRun) analytics.endlessDeaths++;

  analytics.totalDamageTaken += run.damageTaken || 0;
  analytics.totalRevivesUsed += run.revivesUsed || 0;

  bucket.runs++;
  if (run.isVictory) bucket.wins++;
  else bucket.deaths++;
  if (run.isEndlessRun) bucket.endlessRuns++;
  else bucket.storyRuns++;
  bucket.totalWave += run.wave || 0;
  bucket.totalScore += run.score || 0;
  bucket.totalKills += run.kills || 0;
  bucket.totalDamageTaken += run.damageTaken || 0;
  bucket.totalRevivesUsed += run.revivesUsed || 0;
  bucket.bestWave = Math.max(bucket.bestWave || 0, run.wave || 0);
  bucket.bestScore = Math.max(bucket.bestScore || 0, run.score || 0);

  analytics.recentRuns.push({
    ts: Date.now(),
    loadout: loadoutId,
    endless: !!run.isEndlessRun,
    victory: !!run.isVictory,
    wave: run.wave || 0,
    score: run.score || 0,
    kills: run.kills || 0,
    damageTaken: run.damageTaken || 0,
    revivesUsed: run.revivesUsed || 0,
    killSources: { ...(run.killSources || {}) },
    powersHeld: Array.isArray(run.powersHeld) ? run.powersHeld.slice(0, 6) : [],
  });
  analytics.recentRuns = analytics.recentRuns.slice(-20);
  meta.analytics = analytics;
  return analytics;
}

export function recordStoryIntroSkip(meta) {
  const analytics = normalizeAnalytics(meta.analytics);
  analytics.totalStoryIntroSkips++;
  meta.analytics = analytics;
  return analytics;
}

// --- Upgrade Tree ---
// Each upgrade: { id, name, effect, cost, tier }
export const UPGRADES = [
  // Tier 1
  { id: 1, name: 'Thick Skin', effect: '+1 max HP (total 4)', cost: 100, tier: 1 },
  { id: 2, name: 'Quick Feet', effect: '+25 px/s drift max speed', cost: 100, tier: 1 },
  { id: 3, name: 'Deep Breath', effect: '+15 max stamina', cost: 75, tier: 1 },
  // Tier 2 (requires 2 from Tier 1)
  { id: 4, name: 'Power Sight', effect: 'Rarity borders on cards', cost: 200, tier: 2 },
  { id: 5, name: 'Lucky Start', effect: 'Begin with 1 random Common L1', cost: 250, tier: 2 },
  { id: 6, name: 'Bouncy Walls', effect: '95% wall velocity (up from 80%)', cost: 150, tier: 2 },
  { id: 7, name: 'Shard Magnet', effect: '+25% shard earnings, +16px pickup radius', cost: 300, tier: 2 },
  // Tier 3 (requires 3 from Tier 2)
  { id: 8, name: 'Iron Skin', effect: '+1 max HP again (total 5)', cost: 425, tier: 3 },
  { id: 9, name: 'Dash Master', effect: 'Dash cooldown 0.12s (from 0.20s)', cost: 375, tier: 3 },
  { id: 10, name: 'Rare Luck', effect: '+5% Rare, +3% Epic chance', cost: 500, tier: 3 },
  { id: 11, name: 'Second Wind', effect: 'Revive once per run with 1 HP', cost: 575, tier: 3 },
  // Tier 4 (requires 3 from Tier 3)
  { id: 12, name: 'Evolution Sense', effect: 'Evolution recipes shown on cards', cost: 700, tier: 4 },
  { id: 13, name: 'Starting Arsenal', effect: 'Choose any 1 power at L1', cost: 800, tier: 4 },
  { id: 14, name: 'Combo King', effect: 'Combo timer 2.5s (from 1.5s)', cost: 600, tier: 4 },
  { id: 15, name: 'Endless Mode', effect: 'Play past Wave 30', cost: 1000, tier: 4 },
];

export const TIER_REQUIREMENTS = {
  1: 0,
  2: 2, // 2 from tier 1
  3: 3, // 3 from tier 2
  4: 3, // 3 from tier 3
};

export function getUnlockedCountForTier(meta, tier) {
  return UPGRADES.filter(u => u.tier === tier && meta.unlocks.includes(u.id)).length;
}

export function isTierUnlocked(meta, tier) {
  if (tier === 1) return true;
  const prevTier = tier - 1;
  return getUnlockedCountForTier(meta, prevTier) >= TIER_REQUIREMENTS[tier];
}

export function canPurchaseUpgrade(meta, upgradeId) {
  const upgrade = UPGRADES.find(u => u.id === upgradeId);
  if (!upgrade) return false;
  if (meta.unlocks.includes(upgradeId)) return false;
  if (meta.shards < upgrade.cost) return false;
  return isTierUnlocked(meta, upgrade.tier);
}

export function purchaseUpgrade(meta, upgradeId) {
  const upgrade = UPGRADES.find(u => u.id === upgradeId);
  if (!upgrade || !canPurchaseUpgrade(meta, upgradeId)) return false;
  meta.shards -= upgrade.cost;
  meta.unlocks.push(upgradeId);
  saveMeta(meta);
  return true;
}

// --- Loadouts ---
export const LOADOUTS = [
  { id: 'standard', name: 'Standard', hp: 3, stamina: 100, powers: [], scoreMod: 1.0, unlockCost: 0 },
  { id: 'glass_cannon', name: 'Glass Cannon', hp: 2, stamina: 120, powers: ['Dash Burst L1'], scoreMod: 1.15, unlockCost: 600 },
  { id: 'tank', name: 'Tank', hp: 4, stamina: 85, powers: ['Shield L1'], scoreMod: 0.9, unlockCost: 1500 },
  { id: 'hardcore', name: 'HARDCORE', hp: 1, stamina: 100, powers: [], scoreMod: 2.0, unlockCost: 250, unlockWave: 15 },
];

export function isLoadoutUnlocked(meta, loadoutId) {
  if (loadoutId === 'standard') return true;
  const loadout = LOADOUTS.find(l => l.id === loadoutId);
  if (!loadout) return false;
  if (loadoutId === 'hardcore') return meta.hardcoreUnlocked === true;
  return meta.totalShardsEarned >= loadout.unlockCost;
}

export function canPurchaseHardcore(meta) {
  const loadout = LOADOUTS.find(l => l.id === 'hardcore');
  if (!loadout) return false;
  if (meta.hardcoreUnlocked) return false;
  return meta.bestWave >= loadout.unlockWave && meta.shards >= loadout.unlockCost;
}

export function purchaseHardcore(meta) {
  const loadout = LOADOUTS.find(l => l.id === 'hardcore');
  if (!loadout || !canPurchaseHardcore(meta)) return false;
  meta.shards -= loadout.unlockCost;
  meta.hardcoreUnlocked = true;
  saveMeta(meta);
  return true;
}

// Hardcore wave milestone bonuses
export function getHardcoreWaveMilestoneBonus(wave) {
  let bonus = 0;
  if (wave >= 5) bonus += 15;
  if (wave >= 10) bonus += 30;
  if (wave >= 20) bonus += 50;
  if (wave >= 30) bonus += 100;
  return bonus;
}

// --- End-of-Run Bonus Shard Calculation (physical drops are added separately) ---
export function calculateRunBonusShards(waves, score, reachedWave, prevBestWave) {
  const waveShards = waves * 2;
  const scoreShards = Math.floor(score / 2500);
  let recordShards = 0;
  if (reachedWave > prevBestWave) recordShards = 10;

  let subtotal = waveShards + scoreShards + recordShards;

  return { subtotal, waves: waveShards, score: scoreShards, record: recordShards };
}

// Apply Shard Magnet bonus to final total
export function applyShardMagnetBonus(total, meta) {
  if (meta.unlocks.includes(7)) {
    return Math.floor(total * 1.25);
  }
  return total;
}

export function getCheapestLockedUpgrade(meta) {
  let cheapest = null;
  for (const u of UPGRADES) {
    if (meta.unlocks.includes(u.id)) continue;
    if (!isTierUnlocked(meta, u.tier)) continue;
    if (!cheapest || u.cost < cheapest.cost) cheapest = u;
  }
  return cheapest;
}
