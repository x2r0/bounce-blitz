import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getRewardContextForWave,
  getAllowedRaritiesForContext,
  getRewardTags,
  getSlotBudgets,
  getFallbackRarities,
} from '../systems/reward-context.js';

test('milestone waves are every 5th wave', () => {
  assert.equal(getRewardContextForWave(1), 'standard');
  assert.equal(getRewardContextForWave(4), 'standard');
  assert.equal(getRewardContextForWave(5), 'milestone');
  assert.equal(getRewardContextForWave(25), 'milestone');
});

test('standard context cannot roll epic rarity', () => {
  assert.deepEqual(getAllowedRaritiesForContext('standard'), ['common', 'rare']);
  assert.deepEqual(getAllowedRaritiesForContext('milestone'), ['common', 'rare', 'epic']);
  assert.deepEqual(getAllowedRaritiesForContext('boss_power_path'), ['common', 'rare', 'epic']);
});

test('slot budgets stay common-heavy outside milestones', () => {
  assert.deepEqual(getSlotBudgets('standard', false, () => 0.9), ['common', 'common', 'common']);
  assert.deepEqual(getSlotBudgets('standard', false, () => 0.1), ['common', 'common', 'rare']);
  assert.deepEqual(getSlotBudgets('start_common_choice', false, () => 0.9), ['common', 'common', 'common']);
  assert.deepEqual(getSlotBudgets('start_arsenal_choice', false, () => 0.9), ['common', 'common', 'rare']);
});

test('milestone luck upgrades one offered milestone slot by one rarity tier', () => {
  assert.deepEqual(getSlotBudgets('milestone', false, () => 0.8), ['common', 'rare', 'rare']);
  assert.deepEqual(getSlotBudgets('milestone', true, () => 0.8), ['common', 'rare', 'epic']);
  assert.deepEqual(getSlotBudgets('milestone', true, () => 0.1), ['common', 'epic', 'epic']);
});

test('reward tags distinguish standard, milestone, boss path, and start choices', () => {
  assert.deepEqual(getRewardTags('common', 'standard', false), ['New Power', 'Common']);
  assert.deepEqual(getRewardTags('rare', 'standard', true), ['Upgrade', 'Rare']);
  assert.deepEqual(getRewardTags('rare', 'milestone', false), ['Milestone', 'Rare']);
  assert.deepEqual(getRewardTags('epic', 'boss_power_path', false), ['Power Path', 'Epic']);
  assert.deepEqual(getRewardTags('common', 'start_common_choice', false), ['Start', 'Common']);
});

test('fallback rarities prefer nearby legal tiers first', () => {
  assert.deepEqual(getFallbackRarities('rare', ['common', 'rare']), ['rare', 'common']);
  assert.deepEqual(getFallbackRarities('epic', ['common', 'rare', 'epic']), ['epic', 'rare', 'common']);
});
