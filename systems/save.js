'use strict';

const STORAGE_KEY = 'bounceblitz_highscore';
const HARDCORE_STORAGE_KEY = 'bounceblitz_hardcore_highscore';
const RUN_SAVE_KEY = 'bounceblitz_savedrun';
const SETTINGS_KEY = 'bounceblitz_settings';

export function loadHighScore() {
  return parseInt(localStorage.getItem(STORAGE_KEY)) || 0;
}

export function saveHighScore(score) {
  localStorage.setItem(STORAGE_KEY, score);
}

export function loadHardcoreHighScore() {
  return parseInt(localStorage.getItem(HARDCORE_STORAGE_KEY)) || 0;
}

export function saveHardcoreHighScore(score) {
  localStorage.setItem(HARDCORE_STORAGE_KEY, score);
}

// --- Run save/load for Save & Quit ---

export function hasSavedRun() {
  return localStorage.getItem(RUN_SAVE_KEY) !== null;
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
    player: {
      hp: p.hp,
      maxHp: p.maxHp,
      maxStamina: p.maxStamina,
      powers: p.powers.map(pw => ({ id: pw.id, level: pw.level })),
      scoreMod: p.scoreMod,
      dashCostReduction: p.dashCostReduction || 0,
      staminaRegenBonus: p.staminaRegenBonus || 0,
    },
  };
  localStorage.setItem(RUN_SAVE_KEY, JSON.stringify(data));
}

export function loadRunState() {
  try {
    const raw = localStorage.getItem(RUN_SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore corrupt data */ }
  return null;
}

export function clearRunState() {
  localStorage.removeItem(RUN_SAVE_KEY);
}

// --- Audio settings persistence ---

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore corrupt data */ }
  return null;
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
