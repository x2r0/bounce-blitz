'use strict';

export const RARITY_ORDER = ['common', 'rare', 'epic'];

function capitalize(word) {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : '';
}

export function upgradeRarity(rarity) {
  if (rarity === 'common') return 'rare';
  if (rarity === 'rare') return 'epic';
  return rarity;
}

export function getRewardContextForWave(wave) {
  return wave > 0 && wave % 5 === 0 ? 'milestone' : 'standard';
}

export function getAllowedRaritiesForContext(rewardContext) {
  if (rewardContext === 'standard') return ['common', 'rare'];
  if (rewardContext === 'milestone' || rewardContext === 'boss_power_path') return ['common', 'rare', 'epic'];
  if (rewardContext === 'start_common_choice') return ['common'];
  if (rewardContext === 'start_arsenal_choice') return ['common', 'rare'];
  return ['common', 'rare'];
}

export function getRewardTags(rarity, rewardContext, isUpgrade) {
  const rarityTag = capitalize(rarity);
  if (rewardContext === 'milestone') return ['Milestone', rarityTag];
  if (rewardContext === 'boss_power_path') return ['Power Path', rarityTag];
  if (rewardContext === 'start_common_choice' || rewardContext === 'start_arsenal_choice') return ['Start', rarityTag];
  return [isUpgrade ? 'Upgrade' : 'New Power', rarityTag];
}

export function getSlotBudgets(rewardContext, hasMilestoneLuck = false, rng = Math.random) {
  if (rewardContext === 'start_common_choice') return ['common', 'common', 'common'];
  if (rewardContext === 'start_arsenal_choice') return ['common', 'common', 'rare'];
  if (rewardContext === 'milestone') {
    const budgets = ['common', 'rare', rng() < 0.35 ? 'epic' : 'rare'];
    if (hasMilestoneLuck) {
      for (let i = budgets.length - 1; i >= 0; i--) {
        const upgraded = upgradeRarity(budgets[i]);
        if (upgraded !== budgets[i]) {
          budgets[i] = upgraded;
          break;
        }
      }
    }
    return budgets;
  }
  return ['common', 'common', rng() < 0.28 ? 'rare' : 'common'];
}

export function getFallbackRarities(desired, allowed) {
  const idx = RARITY_ORDER.indexOf(desired);
  const result = [];
  for (let distance = 0; distance < RARITY_ORDER.length; distance++) {
    const lower = idx - distance;
    const higher = idx + distance;
    if (lower >= 0) {
      const rarity = RARITY_ORDER[lower];
      if (allowed.includes(rarity) && !result.includes(rarity)) result.push(rarity);
    }
    if (higher < RARITY_ORDER.length) {
      const rarity = RARITY_ORDER[higher];
      if (allowed.includes(rarity) && !result.includes(rarity)) result.push(rarity);
    }
  }
  return result;
}
