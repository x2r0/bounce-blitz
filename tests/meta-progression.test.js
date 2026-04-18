import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UPGRADES,
  canPurchaseUpgrade,
  purchaseUpgrade,
  isTierUnlocked,
  getUnlockedCountForTier,
  calculateRunBonusShards,
  applyShardMagnetBonus,
} from '../systems/meta.js';

function makeStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

test.beforeEach(() => {
  globalThis.localStorage = makeStorage();
});

test('tier unlocks follow previous-tier purchase counts', () => {
  const meta = { unlocks: [1, 2], shards: 999 };
  assert.equal(getUnlockedCountForTier(meta, 1), 2);
  assert.equal(isTierUnlocked(meta, 2), true);
  assert.equal(isTierUnlocked(meta, 3), false);
});

test('canPurchaseUpgrade respects shard cost and tier gates', () => {
  const meta = { unlocks: [1, 2], shards: 200 };
  assert.equal(canPurchaseUpgrade(meta, 4), true);
  assert.equal(canPurchaseUpgrade(meta, 10), false);
  assert.equal(canPurchaseUpgrade({ unlocks: [1, 2], shards: 100 }, 4), false);
});

test('purchaseUpgrade mutates shards and unlocks and persists through storage', () => {
  const meta = {
    shards: 600,
    totalShardsEarned: 600,
    unlocks: [1, 2],
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
    analytics: { storyRuns: 0, endlessRuns: 0, storyVictories: 0, endlessDeaths: 0, totalDamageTaken: 0, totalRevivesUsed: 0, totalStoryIntroSkips: 0, loadouts: {}, recentRuns: [] },
  };
  assert.equal(purchaseUpgrade(meta, 4), true);
  assert.equal(meta.shards, 450);
  assert.ok(meta.unlocks.includes(4));
  const saved = JSON.parse(globalThis.localStorage.getItem('bounceblitz_meta'));
  assert.equal(saved.shards, 450);
  assert.ok(saved.unlocks.includes(4));
});

test('run shard math stays deterministic', () => {
  const shards = calculateRunBonusShards(12, 10000, 12, 10);
  assert.deepEqual(shards, {
    subtotal: 38,
    waves: 24,
    score: 4,
    record: 10,
  });
});

test('shard magnet applies only when the upgrade is unlocked', () => {
  assert.equal(applyShardMagnetBonus(100, { unlocks: [] }), 100);
  assert.equal(applyShardMagnetBonus(100, { unlocks: [7] }), 125);
});

test('reward-focused upgrade definitions keep the intended ids', () => {
  const byId = Object.fromEntries(UPGRADES.map(upgrade => [upgrade.id, upgrade]));
  assert.equal(byId[4].name, 'Power Sight');
  assert.equal(byId[5].name, 'Lucky Start');
  assert.equal(byId[10].name, 'Milestone Luck');
  assert.equal(byId[12].name, 'Evolution Sense');
  assert.equal(byId[13].name, 'Starting Arsenal');
  assert.equal(byId[13].cost, 900);
});
