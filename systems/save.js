'use strict';

import {
  HIGH_SCORE_KEY,
  HARDCORE_HIGH_SCORE_KEY,
  RUN_SAVE_KEY,
  SETTINGS_KEY,
  getStorageItem,
  setStorageItem,
  removeStorageItem,
} from './storage.js';

export function loadHighScore() {
  return parseInt(getStorageItem(HIGH_SCORE_KEY)) || 0;
}

export function saveHighScore(score) {
  setStorageItem(HIGH_SCORE_KEY, score);
}

export function loadHardcoreHighScore() {
  return parseInt(getStorageItem(HARDCORE_HIGH_SCORE_KEY)) || 0;
}

export function saveHardcoreHighScore(score) {
  setStorageItem(HARDCORE_HIGH_SCORE_KEY, score);
}

// --- Run save/load for Save & Quit ---

export function hasSavedRun() {
  return getStorageItem(RUN_SAVE_KEY) !== null;
}

export function saveRunState(G) {
  const p = G.player;
  const data = {
    wave: G.wave,
    score: G.score,
    elapsedTime: G.elapsedTime,
    runKills: G.runKills,
    runWaves: G.runWaves,
    usedSecondWind: G.usedSecondWind,
    bossShardBonus: G.bossShardBonus,
    shardsCollected: G.shardsCollected,
    isHardcore: G.isHardcore,
    isEndlessRun: G.isEndlessRun,
    selectedLoadout: G.meta.selectedLoadout,
    previousOffering: G.previousOffering,
    pendingEvolution: G.pendingEvolution,
    runTelemetry: G.runTelemetry,
    player: {
      hp: p.hp,
      maxHp: p.maxHp,
      maxStamina: p.maxStamina,
      powers: p.powers.map(pw => ({ id: pw.id, level: pw.level })),
      sigils: Array.isArray(p.sigils) ? [...p.sigils] : [],
      sigilState: p.sigilState ? { ...p.sigilState } : { broodbreakerKillsLeft: 0, feedbackDashCount: 0 },
      scoreMod: p.scoreMod,
      dashCostReduction: p.dashCostReduction || 0,
      staminaRegenBonus: p.staminaRegenBonus || 0,
    },
  };
  setStorageItem(RUN_SAVE_KEY, JSON.stringify(data));
}

export function loadRunState() {
  try {
    const raw = getStorageItem(RUN_SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore corrupt data */ }
  return null;
}

export function clearRunState() {
  removeStorageItem(RUN_SAVE_KEY);
}

// --- Audio settings persistence ---

export function loadSettings() {
  try {
    const raw = getStorageItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore corrupt data */ }
  return null;
}

export function saveSettings(settings) {
  setStorageItem(SETTINGS_KEY, JSON.stringify(settings));
}
