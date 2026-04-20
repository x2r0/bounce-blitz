'use strict';

import {
  W, H, STATE, FONT, MAX_POWER_SLOTS, CLARITY, SURGE_ACTIVE_SPEED_THRESHOLD, ENEMY_COLORS,
  CHARGE_TAP_THRESHOLD, CHARGE_MAX_DURATION, CHARGE_SPEED_MIN, CHARGE_SPEED_MAX,
  CHARGE_GRACE_MIN, CHARGE_GRACE_MAX, CHARGE_RECOVERY_MIN, CHARGE_RECOVERY_MAX,
  IDLE_FRICTION
} from './config.js';
import { rand, dist, lerp, formatScore, formatTime } from './utils.js';
import { events } from './eventbus.js';
import { G, resetGameState } from './state.js';
import { ctx, gridCanvas, drawGlowText } from './canvas.js';
import { hasSavedRun, clearRunState, loadSettings, loadHighScore } from './systems/save.js';

import { updatePlayer, damagePlayer, drawPlayer } from './entities/player.js';
import { spawnEnemy, updateEnemies, killEnemy, hitEnemy, drawEnemies } from './entities/enemy.js';
import { updatePowerUps, drawPowerUps } from './entities/powerup.js';

import { startNextWave, pickEnemyType, getEnemyCount, isBossWave, getBossType, drawBurstTexts, updateBurstSpawning, getWaveBreakDuration } from './systems/wave.js';
import { BOSS_DEFS, startBossIntro, updateBossIntro, skipBossIntro, drawBossIntro,
  updateBossReady, drawBossReady, confirmBossReady,
  updateBoss, updateBossClearPause, hitBoss, defeatBoss, drawBossHPBar, drawBossExtras,
  checkMirrorCopyCollisions,
  updateBossTutorial, drawBossTutorial } from './systems/boss.js';
import { initArenaModifiers, updateArenaModifiersForWave, updateArenaModifiers, drawArenaModifiers, spawnPowerGem, slideObstacleTo, slideAllObstacles } from './systems/arena.js';
import {
  spawnParticles,
  updateParticles, updateFloatTexts, updateShockwaves, updateThunderTrails, updateAfterimages,
  updateWallFlashes, updateCollectRings, updateMultiPopExplosions, updateTapBounceRipples,
  drawWallFlashes, drawParticles, drawCollectRings, drawMultiPopExplosions, drawThunderTrails,
  drawShockwaves, drawAfterimages, drawTapBounceRipples
} from './systems/particles.js';
import { setupInput, updateDashCharge, clearTouchSticks, cancelDashCharge } from './systems/input.js';
import { isTouchUILayout, isTouchPortraitBlocked, syncTouchOverlay } from './systems/touch-ui.js';
import { updateDashPreview, drawDashPreview } from './systems/dash-preview.js';
import { updateTitleBackground, drawTitleBackground } from './systems/title-bg.js';
import { drawHUD } from './systems/hud.js';
import { drawPowerSelectScreen, drawPowerIcon } from './systems/cards.js';
import { updateCombatTexts, drawCombatTexts } from './systems/combat-text.js';
import { POWER_DEFS, EVOLUTION_RECIPES, BOSS_SIGIL_DEFS, generateOffering, checkEvolutionAvailable, createEvolutionCard, applyPowerPick, applyWaveStartPowers, resetWaveCounters } from './systems/powers.js';
import { getPowerSelectConfig } from './systems/power-select-config.js';
import { getRewardContextForWave } from './systems/reward-context.js';
import { FX_AFTERIMAGE_LIMIT, FX_AMBIENT_PARTICLE_SCALE, FX_AMBIENT_SHAPE_COUNT, pushCapped } from './systems/runtime-flags.js';
import {
  TRANSITION_REWARD_COPY,
  EPILOGUE_REVEAL_LINES,
  getActLabel,
  getEpilogueRevealDuration,
  buildTransitionRewardOptions as buildTransitionRewardOptionsData,
  getTransitionRouteWhisper,
  getTransitionOptionChips,
  createTransitionRoom,
} from './systems/transition-room.js';
import { calculateRunBonusShards, applyShardMagnetBonus, loadMeta, saveMeta, getCheapestLockedUpgrade, UPGRADES, canPurchaseUpgrade, purchaseUpgrade, LOADOUTS, isLoadoutUnlocked, isTierUnlocked, canPurchaseHardcore, purchaseHardcore, getHardcoreWaveMilestoneBonus, getUnlockedCountForTier, TIER_REQUIREMENTS, recordRunAnalytics, recordStoryIntroSkip } from './systems/meta.js';
import { spawnCombatText } from './systems/combat-text.js';
import {
  onEnemyKilled as boostOnEnemyKilled,
  updateBoostPickups, updateActiveBoost,
  drawBoostPickups, drawBoostTimerBar,
  clearBoostsOnWaveEnd, isInvincibleFromBoost, getScoreMultiplier, getBoostSpeedBonus, isFreeDash
} from './systems/lootcrate.js';
import {
  rollEnemyShardDrop, updateShardPickups, drawShardPickups
} from './systems/shard-pickup.js';
import {
  setupGlossaryTracking, updateToasts, drawToasts,
  drawGlossaryScreen
} from './systems/glossary.js';
import {
  initLoreSnippet, updateLoreSnippet, drawLoreSnippet,
  showEndlessEntryMessage, updateEndlessEntryMessage, drawEndlessEntryMessage
} from './systems/lore.js';
import {
  ensureTitleMusicStarted, sfxDash, sfxBounce, sfxEnemyKill, sfxComboKill,
  sfxCardPick, sfxShieldBlock, sfxShieldBreak, sfxDamageTaken,
  sfxWaveClear, sfxBossIntro, sfxBossHit, sfxBossPhaseTransition,
  sfxBossDefeat, sfxGameOver, sfxShardCollect, sfxEvolutionUnlock, sfxBoostCollect,
  sfxUIClick, sfxMultiPop, sfxGravityBomb,
  startMusic, stopMusic, setMusicIntensity, setBossMusic, setMusicState,
  setPlayerActivity,
  getMusicVolume, getSfxVolume, isMuted, setMusicVolume, setSfxVolume, toggleMute
} from './systems/audio.js';
import platformSDK from './platform-sdk.js';
import { setupCrazyGames } from './platform-crazygames.js';
import { setupPoki } from './platform-poki.js';
import { setupGameDistribution } from './platform-gamedistribution.js';

// --- Grid crossfade infrastructure (offscreen canvas for arc transitions) ---
const gridCanvasOld = document.createElement('canvas');
gridCanvasOld.width = W;
gridCanvasOld.height = H;

// --- Parallax background grid (larger scale, drawn behind main grid) ---
const bgGridCanvas = document.createElement('canvas');
bgGridCanvas.width = W;
bgGridCanvas.height = H;
const bgGridCanvasOld = document.createElement('canvas');
bgGridCanvasOld.width = W;
bgGridCanvasOld.height = H;

function renderGridTo(canvas, color) {
  const gc = canvas.getContext('2d');
  gc.clearRect(0, 0, W, H);
  gc.strokeStyle = color;
  gc.lineWidth = 0.5;
  for (let x = 0; x <= W; x += 40) {
    gc.beginPath(); gc.moveTo(x, 0); gc.lineTo(x, H); gc.stroke();
  }
  for (let y = 0; y <= H; y += 40) {
    gc.beginPath(); gc.moveTo(0, y); gc.lineTo(W, y); gc.stroke();
  }
}

function renderBgGridTo(canvas, color) {
  const gc = canvas.getContext('2d');
  gc.clearRect(0, 0, W, H);
  gc.strokeStyle = color;
  gc.lineWidth = 1;
  for (let x = 0; x <= W; x += 80) {
    gc.beginPath(); gc.moveTo(x, 0); gc.lineTo(x, H); gc.stroke();
  }
  for (let y = 0; y <= H; y += 80) {
    gc.beginPath(); gc.moveTo(0, y); gc.lineTo(W, y); gc.stroke();
  }
}

// Render initial grids with Arc 0 (The Awakening) color
renderGridTo(gridCanvas, '#1a2a1a');
renderBgGridTo(bgGridCanvas, '#1a2a1a');

// --- Transition state ---
let transitionAlpha = 0;
let transitionDir = 0; // 1 = fading in (to black), -1 = fading out (from black)
let transitionSpeed = 4;
let transitionCallback = null;

const RELAY_LORE_LINES = [
  ['The relay steadies your shell.', 'The core is still calling.'],
  ['The chamber catches your return.', 'The grid is ready for another run.'],
  ['Shards settle into the relay frame.', 'Your next descent can be cleaner.'],
  ['The loop releases you for a breath.', 'Then asks you to dive back in.'],
];

const RELAY_UPGRADE_COPY = {
  1: '+1 max HP',
  2: '+25 drift max speed',
  3: '+15 max stamina',
  4: 'Show rarity borders and reward tags',
  5: 'Choose 1 of 3 Common powers',
  6: '95% wall velocity',
  7: '+25% shard earnings',
  8: '+1 max HP again',
  9: 'Dash cooldown to 0.12s',
  10: 'Upgrade one milestone reward tier',
  11: 'One revive per run',
  12: 'Show evolution recipes and progress',
  13: 'Choose 1 of 3 Common or Rare powers',
  14: 'Longer combo timer',
  15: 'Play past Wave 30',
};

export function startTransition(callback, speed) {
  transitionAlpha = 0;
  transitionDir = 1;
  transitionSpeed = speed || 4;
  transitionCallback = callback;
}

function updateTransition(dt) {
  if (transitionDir === 0) return;
  transitionAlpha += transitionDir * dt * transitionSpeed;
  if (transitionDir === 1 && transitionAlpha >= 1) {
    transitionAlpha = 1;
    transitionDir = -1;
    if (transitionCallback) { transitionCallback(); transitionCallback = null; }
  }
  if (transitionDir === -1 && transitionAlpha <= 0) {
    transitionAlpha = 0;
    transitionDir = 0;
  }
}

function drawTransition() {
  if (transitionAlpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = transitionAlpha;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function finishStoryIntro(skipped = false) {
  if (!G.storyIntro) return;
  if (skipped) {
    recordStoryIntroSkip(G.meta);
    saveMeta(G.meta);
  }
  G.joystick.active = false;
  G.joystick.touchId = null;
  G.joystick.dx = 0;
  G.joystick.dy = 0;
  G.storyIntro = null;
  startTransition(() => {
    resetGameState();
    startMusic();
  }, 5);
}

function canShowRelayChamber() {
  const s = G.runSummary;
  return !!(s && !s.isVictory && !s.isEndlessRun);
}

function trimRelayText(text, maxChars) {
  if (!text || text.length <= maxChars) return text || '';
  return text.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}

function wrapRelayText(text, maxWidth, maxLines = 2) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines = [];
  let truncated = false;
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const next = current + ' ' + words[i];
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length === maxLines - 1) {
        truncated = i < words.length - 1;
        break;
      }
    }
  }
  const consumedWords = lines.join(' ').split(/\s+/).filter(Boolean).length;
  const remaining = words.slice(consumedWords);
  if (lines.length < maxLines && remaining.length > 0) {
    current = remaining.join(' ');
  }
  while (ctx.measureText(current).width > maxWidth && current.length > 1) {
    current = current.slice(0, -1);
    truncated = true;
  }
  if (truncated) {
    current = current.trimEnd().replace(/[.,;:!?-]*$/, '') + '…';
    while (ctx.measureText(current).width > maxWidth && current.length > 1) {
      current = current.slice(0, -2).trimEnd() + '…';
    }
  }
  lines.push(current);
  return lines.slice(0, maxLines);
}

function wrapRelayParagraphs(text, maxWidth, maxLinesPerParagraph = 2) {
  const parts = String(text || '')
    .split('\n')
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return [''];
  const lines = [];
  for (const part of parts) {
    const wrapped = wrapRelayText(part, maxWidth, maxLinesPerParagraph);
    for (const line of wrapped) lines.push(line);
  }
  return lines;
}

function getRelayFittedFont(text, maxWidth, startSize, minSize, weight = 'bold') {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  return `${weight} ${Math.max(size, minSize)}px ${FONT}`;
}

function getRelayQuickUpgradeIds(limit = 4) {
  const locked = UPGRADES.filter(u => !G.meta.unlocks.includes(u.id));
  const affordable = locked
    .filter(u => isTierUnlocked(G.meta, u.tier) && G.meta.shards >= u.cost)
    .sort((a, b) => a.cost - b.cost || a.tier - b.tier || a.id - b.id);
  const nearbyLocked = locked
    .filter(u => !affordable.some(a => a.id === u.id))
    .sort((a, b) => {
      const tierDelta = (isTierUnlocked(G.meta, a.tier) ? 0 : 1000) - (isTierUnlocked(G.meta, b.tier) ? 0 : 1000);
      return tierDelta || a.cost - b.cost || a.tier - b.tier || a.id - b.id;
    });
  return affordable.concat(nearbyLocked).slice(0, limit).map(u => u.id);
}

export function refreshRelayChamber() {
  if (!G.relayChamber) return;
  G.relayChamber.quickUpgradeIds = getRelayQuickUpgradeIds(4);
  G.relayChamber.totalShards = G.meta.shards;
  if (G.relayChamber.quickUpgradeIds.length === 0) {
    G.relayChamber.upgradeIndex = 0;
    if (G.relayChamber.mobileOverlay === 'quickSpend') G.relayChamber.mobileOverlay = null;
  } else {
    G.relayChamber.upgradeIndex = Math.min(
      G.relayChamber.upgradeIndex || 0,
      G.relayChamber.quickUpgradeIds.length - 1
    );
  }
  const selectedLoadoutIndex = Math.max(0, LOADOUTS.findIndex(l => l.id === G.meta.selectedLoadout));
  if (typeof G.relayChamber.loadoutIndex !== 'number' || G.relayChamber.loadoutIndex < 0) {
    G.relayChamber.loadoutIndex = selectedLoadoutIndex;
  }
}

export function enterRelayChamber() {
  if (!G.runSummary) return;
  const selectedLoadoutIndex = Math.max(0, LOADOUTS.findIndex(l => l.id === G.meta.selectedLoadout));
  G.relayChamber = {
    shardGain: G.runSummary.total,
    totalShards: G.meta.shards,
    loreIndex: (G.meta.totalRuns + G.runSummary.waves + G.runSummary.kills) % RELAY_LORE_LINES.length,
    quickUpgradeIds: [],
    focusSection: 'cta',
    ctaIndex: 0,
    upgradeIndex: 0,
    loadoutIndex: selectedLoadoutIndex,
    mobileOverlay: null,
    returnTarget: STATE.RELAY_CHAMBER,
  };
  G._relayHoverAction = null;
  G._relayHoverUpgradeIndex = -1;
  G._relayHoverLoadoutIndex = -1;
  G._relayActionRects = {};
  G._relayUpgradeRects = [];
  G._relayLoadoutRects = [];
  refreshRelayChamber();
  setMusicState('title');
  G.state = STATE.RELAY_CHAMBER;
}

export function startRunFromRelayChamber() {
  const mode = G.runSummary?.mode || 'story';
  startTransition(() => {
    G.relayChamber = null;
    G.isEndlessRun = mode === 'endless';
    resetGameState();
    startMusic();
  }, 5);
}

function buildTransitionRewardOptions(bossType) {
  const card = generateOffering(G.wave, G.meta, 'boss_power_path')[0] || null;
  if (card) {
    if (card.isEvolution && G.pendingEvolution) {
      events.emit('evolutionOffered', { recipeId: G.pendingEvolution.id });
    } else if (card.powerId) {
      events.emit('powerOffered', { powerId: card.powerId });
    }
  }
  return buildTransitionRewardOptionsData({
    bossType,
    playerSigils: G.player.sigils || [],
    bossSigilDefs: BOSS_SIGIL_DEFS,
    offeringCard: card,
    pendingEvolution: G.pendingEvolution,
    rewardCopyByPowerId: TRANSITION_REWARD_COPY,
    trimText: trimRelayText,
  });
}

function clearTransitionRoomUi() {
  G._transitionOptionRects = [];
  G._transitionContinueRect = null;
}

function enterTransitionRoom(mode, bossWave, bossType) {
  const bossDef = BOSS_DEFS[bossType];
  const options = mode === 'chapter_return' ? buildTransitionRewardOptions(bossType) : null;
  G.transitionRoom = createTransitionRoom({
    mode,
    bossWave,
    bossType,
    bossName: bossDef?.name,
    totalRuns: G.meta.totalRuns,
    options,
  });
  if (G.player) {
    G.player.x = G.transitionRoom.spawn.x;
    G.player.y = G.transitionRoom.spawn.y;
    G.player.vx = 0;
    G.player.vy = 0;
    G.player.dashCharging = false;
    G.player.dashChargeTime = 0;
    G.player.dashChargeStaminaDrained = 0;
    G.player.dashChargeExhausted = false;
    G.player.dashChargeTouchId = null;
    G.player.stamina = G.player.maxStamina;
  }
  clearTransitionRoomUi();
  setMusicState(mode, { bossWave, nextWave: bossWave + 1 });
  G.state = STATE.TRANSITION_ROOM;
}

export function enterBossApproachRoom(bossWave) {
  enterTransitionRoom('boss_approach', bossWave, getBossType(bossWave));
}

export function enterChapterReturnRoom(bossWave, bossType) {
  enterTransitionRoom('chapter_return', bossWave, bossType || getBossType(bossWave));
}

export function enterBossEpilogueRoom(bossWave, bossType) {
  enterTransitionRoom('epilogue', bossWave, bossType || getBossType(bossWave));
}

export function chooseTransitionRoomOption(index) {
  const room = G.transitionRoom;
  if (!room) return;
  if (room.preludeActive || room.outroActive || room.mode === 'epilogue' || room.selectedIndex >= 0) return;
  const option = room.options?.[index];
  if (!option) return;

  room.selectedIndex = index;
  room.cursor = index;
  room.commitLine = getTransitionRouteWhisper(room.mode, option);
  room.commitColor = option.accent || '#ffffff';
  room.outroActive = true;
  room.outroTimer = 0;
  room.outroResolved = false;
  if (G.player) {
    G.player.vx = 0;
    G.player.vy = 0;
  }
}

export function previewTransitionRoomOption(index) {
  if (!G.transitionRoom) return;
  G.transitionRoom.hoverIndex = index;
  if (index >= 0 && G.transitionRoom.options?.length) {
    G.transitionRoom.cursor = index;
  }
}

export function advanceTransitionRoomPrelude() {
  const room = G.transitionRoom;
  if (!room || !room.preludeActive || !room.preludeReady) return;
  sfxUIClick();
  room.preludeActive = false;
  room.controlDelay = Math.max(room.controlDelay || 0, 0.12);
}

export function continueTransitionRoom() {
  if (!G.transitionRoom || G.transitionRoom.preludeActive || G.transitionRoom.outroActive || G.transitionRoom.mode !== 'epilogue' || G.transitionRoom.selectedIndex >= 0) return;
  sfxUIClick();
  G.transitionRoom.selectedIndex = 0;
  G.transitionRoom.commitLine = EPILOGUE_REVEAL_LINES[0];
  G.transitionRoom.commitColor = G.transitionRoom.exitGate?.accent || '#ffd86f';
  G.transitionRoom.outroActive = true;
  G.transitionRoom.outroTimer = 0;
  G.transitionRoom.outroResolved = false;
  G.transitionRoom.outroLineIndex = 0;
  G.transitionRoom.outroLineDuration = getEpilogueRevealDuration(
    EPILOGUE_REVEAL_LINES[0],
    EPILOGUE_REVEAL_LINES.length === 1
  );
  if (G.player) {
    G.player.vx = 0;
    G.player.vy = 0;
  }
}

export function advanceStoryIntro() {
  if (G.state !== STATE.STORY_INTRO || !G.storyIntro) return;
  const intro = G.storyIntro;
  ensureStoryIntroState(intro);
  if (!intro.canAdvance) return;
  if (intro.beat === 0) {
    intro.beat = 1;
    intro.beatStartedAt = intro.timer;
    intro.canAdvance = false;
    intro.player.eyeWideTimer = 0.9;
    return;
  }
  if (intro.beat === 2) {
    intro.beat = 3;
    intro.beatStartedAt = intro.timer;
    intro.canAdvance = false;
    primeStoryIntroBreakthrough(intro);
    return;
  }
  if (intro.beat === 3) {
    intro.beat = 4;
    intro.beatStartedAt = intro.timer;
    intro.canAdvance = false;
    intro.player.eyeHappyTimer = 0.55;
    return;
  }
  if (intro.beat === 4) {
    finishStoryIntro(false);
  }
}

export function skipStoryIntro() {
  if (G.state !== STATE.STORY_INTRO || !G.storyIntro?.skipReady) return;
  finishStoryIntro(true);
}

export function startStoryIntroDashCharge(touchId = null) {
  if (G.state !== STATE.STORY_INTRO || !G.storyIntro) return false;
  const intro = G.storyIntro;
  ensureStoryIntroState(intro);
  if (intro.beat !== 3 || !intro.breakthroughEnemy?.visible) return false;
  const player = intro.player;
  if (player.dashCharging || player.dashCooldown > 0) return false;
  player.dashCharging = true;
  player.dashChargeTime = 0;
  player.dashChargeTouchId = touchId;
  player.eyeWideTimer = Math.max(player.eyeWideTimer, 0.12);
  return true;
}

export function releaseStoryIntroDashCharge() {
  if (G.state !== STATE.STORY_INTRO || !G.storyIntro) return false;
  const intro = G.storyIntro;
  ensureStoryIntroState(intro);
  const player = intro.player;
  if (intro.beat !== 3 || !player.dashCharging) return false;
  const t = getStoryIntroChargeLevel(player.dashChargeTime);
  const { dx, dy } = getStoryIntroDashDirection(intro);
  const dashSpd = lerp(CHARGE_SPEED_MIN, CHARGE_SPEED_MAX, t);
  player.vx = dx * dashSpd;
  player.vy = dy * dashSpd;
  player.dashGraceTimer = lerp(CHARGE_GRACE_MIN, CHARGE_GRACE_MAX, t);
  player.dashRecoveryTimer = 0;
  player.pendingRecoveryTime = lerp(CHARGE_RECOVERY_MIN, CHARGE_RECOVERY_MAX, t);
  player.dashCooldown = 0.2;
  player.dashCharging = false;
  player.dashChargeTime = 0;
  player.dashChargeTouchId = null;
  player.eyeSquashTimer = 0.15;
  player.eyeWideTimer = 0.16;
  sfxDash();
  return true;
}

export function cancelStoryIntroDashCharge() {
  if (G.state !== STATE.STORY_INTRO || !G.storyIntro?.player?.dashCharging) return;
  const player = G.storyIntro.player;
  player.dashCharging = false;
  player.dashChargeTime = 0;
  player.dashChargeTouchId = null;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function smooth01(v) {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
}

function makeStoryIntroPlayer() {
  return {
    x: -42,
    y: H * 0.68,
    vx: 110,
    vy: 0,
    r: 16,
    hp: 3,
    maxHp: 3,
    invTimer: 0,
    flashTimer: 0,
    overdriveTimer: 0,
    surgeActive: false,
    shieldCharges: 0,
    shieldDashOffset: 0,
    powers: [],
    multiPopCharges: 0,
    magnetActive: false,
    shellGuardOrbs: [],
    dashCharging: false,
    dashChargeTime: 0,
    dashChargeTouchId: null,
    dashGraceTimer: 0,
    dashCooldown: 0,
    pendingRecoveryTime: 0.25,
    dashRecoveryTimer: 0,
    eyeBlinkTimer: 0,
    eyeNextBlink: 1.2,
    eyeSquashTimer: 0,
    eyeWideTimer: 0.9,
    eyeHappyTimer: 0,
    eyeDead: false,
  };
}

function makeStoryIntroEnemy(type, x, y, wakeAt, extras) {
  const ec = ENEMY_COLORS[type] || ENEMY_COLORS.drifter;
  const enemy = {
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    r: type === 'tracker' ? 14 : 12,
    alive: false,
    isFusing: false,
    spawnScale: 0,
    spawnTimer: 0,
    color: ec.core,
    glowColor: ec.glow,
    shadowBlur: ec.blur,
    hp: 1,
    maxHp: 1,
    invTimer: 0,
    shield: false,
    shieldHp: 0,
    isBoss: false,
    idleSeed: Math.random() * 6283,
    hitFlashTimer: 0,
    freezeTimer: 0,
    pulseTimer: 3.5,
    telegraphing: false,
    telegraphTimer: 0,
    teleportDest: null,
    wakeAt,
    visible: false,
    introDefeated: false,
    anchorX: x,
    anchorY: y,
    orbitRadius: 0,
    orbitSpeed: 0,
    orbitAngle: 0,
  };
  return Object.assign(enemy, extras || {});
}

function defeatStoryIntroEnemy(enemy, particleCount = 8) {
  if (!enemy || enemy.introDefeated) return false;
  enemy.alive = false;
  enemy.visible = false;
  enemy.introDefeated = true;
  spawnParticles(enemy.x, enemy.y, enemy.color, particleCount);
  sfxEnemyKill(enemy.type);
  return true;
}

function ensureStoryIntroState(intro) {
  if (!intro || intro.initialized) return;
  intro.initialized = true;
  intro.timer = intro.timer || 0;
  intro.beat = 0;
  intro.beatStartedAt = 0;
  intro.skipReady = false;
  intro.canAdvance = false;
  intro.lockPoint = null;
  intro.breakthroughEnemy = null;
  intro.resolveEnemy = null;
  intro.resolveEnemyCleared = false;
  intro.resolveEnemyClearedAt = 0;
  intro.core = { x: W * 0.70, y: H * 0.38, r: 28 };
  intro.player = makeStoryIntroPlayer();
  const blocker = makeStoryIntroEnemy('tracker', W * 0.60, H * 0.42, 1.70, {
    static: true,
    r: 16,
  });
  const coreGuard = makeStoryIntroEnemy('pulser', W * 0.69, H * 0.50, 1.25, {
    orbitRadius: 0,
    orbitSpeed: 0,
    orbitAngle: 0,
    introResolveEnemy: true,
  });
  intro.breakthroughEnemy = blocker;
  intro.resolveEnemy = coreGuard;
  intro.enemies = [
    makeStoryIntroEnemy('tracker', W * 0.61, H * 0.28, 0.35, { orbitRadius: 36, orbitSpeed: 0.20, orbitAngle: 0.3 }),
    makeStoryIntroEnemy('teleporter', W * 0.80, H * 0.36, 0.80, { orbitRadius: 48, orbitSpeed: -0.16, orbitAngle: 1.4 }),
    coreGuard,
    blocker,
  ];
}

function drawStoryIntroGlowText(text, x, y, font, fillColor, glowColor, glowBlur, align = 'left') {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = glowBlur || 8;
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawStoryIntroBeacon(x, y, radius, tint, pulse = 1) {
  ctx.save();
  ctx.strokeStyle = tint;
  ctx.lineWidth = 2;
  ctx.shadowColor = tint;
  ctx.shadowBlur = 16;
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = 0.18 + i * 0.08;
    ctx.beginPath();
    ctx.arc(x, y, radius + i * 16 * pulse, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.52, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function updateStoryIntroPlayerFace(player, dt) {
  player.shieldDashOffset = (player.shieldDashOffset || 0) + 2;
  if (player.eyeBlinkTimer > 0) player.eyeBlinkTimer -= dt;
  else {
    player.eyeNextBlink -= dt;
    if (player.eyeNextBlink <= 0) {
      player.eyeBlinkTimer = 0.14;
      player.eyeNextBlink = 2.4 + Math.random() * 1.8;
    }
  }
  if (player.eyeWideTimer > 0) player.eyeWideTimer -= dt;
  if (player.eyeSquashTimer > 0) player.eyeSquashTimer -= dt;
  if (player.eyeHappyTimer > 0) player.eyeHappyTimer -= dt;
}

function getStoryIntroChargeLevel(chargeTime) {
  return Math.max(0, Math.min(1, (chargeTime - CHARGE_TAP_THRESHOLD) / (CHARGE_MAX_DURATION - CHARGE_TAP_THRESHOLD)));
}

function getStoryIntroDashDirection(intro) {
  const player = intro.player;
  if (G.joystick.active && (G.joystick.dx !== 0 || G.joystick.dy !== 0)) {
    const jLen = Math.sqrt(G.joystick.dx * G.joystick.dx + G.joystick.dy * G.joystick.dy) || 1;
    return { dx: G.joystick.dx / jLen, dy: G.joystick.dy / jLen };
  }
  const target = intro.breakthroughEnemy?.visible
    ? intro.breakthroughEnemy
    : (intro.resolveEnemy?.visible ? intro.resolveEnemy : intro.core);
  const tdx = target.x - player.x;
  const tdy = target.y - player.y;
  const td = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
  return { dx: tdx / td, dy: tdy / td };
}

function primeStoryIntroBreakthrough(intro) {
  const player = intro.player;
  const dx = intro.core.x - player.x;
  const dy = intro.core.y - player.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  if (intro.lockPoint) {
    player.x = intro.lockPoint.x;
    player.y = intro.lockPoint.y;
  }
  player.vx = 0;
  player.vy = 0;
  player.dashCharging = false;
  player.dashChargeTime = 0;
  player.dashChargeTouchId = null;
  player.dashGraceTimer = 0;
  player.dashRecoveryTimer = 0;
  intro.resolveEnemyCleared = false;
  intro.resolveEnemyClearedAt = 0;
  for (const enemy of intro.enemies) enemy.introDefeated = false;
  const blocker = intro.breakthroughEnemy;
  if (blocker) {
    blocker.anchorX = intro.core.x - nx * 54;
    blocker.anchorY = intro.core.y - ny * 54;
    blocker.x = blocker.anchorX;
    blocker.y = blocker.anchorY;
  }
}

function updateStoryIntroBreakthrough(intro, dt) {
  if (intro.beat !== 3) return;
  const player = intro.player;
  const blocker = intro.breakthroughEnemy;
  const resolveEnemy = intro.resolveEnemy;

  for (const enemy of intro.enemies) {
    if (!enemy.visible || !enemy.alive || enemy.introDefeated) continue;
    const d = dist(player, enemy);
    if (d >= player.r + enemy.r) continue;

    if (player.dashGraceTimer > 0) {
      const defeated = defeatStoryIntroEnemy(enemy, enemy === blocker ? 10 : 8);
      if (defeated && (enemy === resolveEnemy || enemy.introResolveEnemy)) {
        intro.resolveEnemyCleared = true;
        intro.resolveEnemyClearedAt = intro.timer;
      }
      continue;
    }

    if (enemy !== blocker) continue;
    const pdx = player.x - enemy.x;
    const pdy = player.y - enemy.y;
    const pushDist = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
    const overlap = (player.r + enemy.r) - pushDist;
    player.vx = (pdx / pushDist) * 220;
    player.vy = (pdy / pushDist) * 220;
    if (overlap > 0) {
      player.x += (pdx / pushDist) * overlap;
      player.y += (pdy / pushDist) * overlap;
    }
    player.eyeWideTimer = Math.max(player.eyeWideTimer, 0.14);
    enemy.hitFlashTimer = 0.1;
  }

  if (!intro.resolveEnemyCleared) return;
  if (player.dashGraceTimer > 0 || player.dashCharging) return;

  player.eyeHappyTimer = 0.34;
  intro.breakthroughEnemy = null;
  intro.resolveEnemy = null;
  for (const enemy of intro.enemies) {
    if (!enemy.alive || enemy.introDefeated) continue;
    enemy.alive = false;
    enemy.visible = false;
    enemy.introDefeated = true;
  }
  intro.beat = 4;
  intro.beatStartedAt = intro.timer;
  intro.canAdvance = false;
}

function updateStoryIntroPlayer(intro, dt) {
  const player = intro.player;
  const localT = intro.timer - intro.beatStartedAt;
  const accel = 760;
  const maxSpeed = 240;
  const inputEnabled = intro.beat === 1;

  if (player.dashGraceTimer > 0) {
    const prev = player.dashGraceTimer;
    player.dashGraceTimer = Math.max(0, player.dashGraceTimer - dt);
    if (player.dashGraceTimer <= 0 && prev > 0) {
      player.dashRecoveryTimer = player.pendingRecoveryTime || 0.25;
    }
  }
  if (player.dashRecoveryTimer > 0) player.dashRecoveryTimer = Math.max(0, player.dashRecoveryTimer - dt);
  if (player.dashCooldown > 0) player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  if (player.dashCharging) player.dashChargeTime += dt;

  let driftX = 0;
  let driftY = 0;
  if (inputEnabled) {
    if (G.keysDown['w'] || G.keysDown['arrowup']) driftY -= 1;
    if (G.keysDown['s'] || G.keysDown['arrowdown']) driftY += 1;
    if (G.keysDown['a'] || G.keysDown['arrowleft']) driftX -= 1;
    if (G.keysDown['d'] || G.keysDown['arrowright']) driftX += 1;
    if (G.joystick.active && (G.joystick.dx !== 0 || G.joystick.dy !== 0)) {
      const jLen = Math.sqrt(G.joystick.dx * G.joystick.dx + G.joystick.dy * G.joystick.dy) || 1;
      const jNorm = Math.min(jLen / 40, 1);
      driftX += (G.joystick.dx / jLen) * jNorm;
      driftY += (G.joystick.dy / jLen) * jNorm;
    }
  }

  if (intro.beat === 0) {
    const targetX = W * 0.22;
    const targetY = H * 0.68;
    const steerX = targetX - player.x;
    const steerY = targetY - player.y;
    player.vx += steerX * dt * 1.6;
    player.vy += steerY * dt * 1.6;
    player.vx *= 0.94;
    player.vy *= 0.90;
    if (localT > 0.22 && Math.abs(steerX) < 18 && Math.abs(player.vx) < 16) {
      player.vx *= 0.88;
      player.vy *= 0.88;
      intro.canAdvance = true;
    }
  } else if (inputEnabled && player.dashGraceTimer <= 0) {
    const len = Math.sqrt(driftX * driftX + driftY * driftY);
    if (len > 0) {
      driftX /= len;
      driftY /= len;
      player.vx += driftX * accel * dt;
      player.vy += driftY * accel * dt;
      const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
      if (speed > maxSpeed) {
        player.vx = (player.vx / speed) * maxSpeed;
        player.vy = (player.vy / speed) * maxSpeed;
      }
    }
    const friction = len > 0 ? 220 : 360;
    const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    if (speed > 0) {
      const newSpeed = Math.max(0, speed - friction * dt);
      const ratio = newSpeed / speed;
      player.vx *= ratio;
      player.vy *= ratio;
    }
  } else if (player.dashGraceTimer > 0) {
    const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    if (speed > 0) {
      const newSpeed = Math.max(0, speed - IDLE_FRICTION * dt);
      const ratio = newSpeed / speed;
      player.vx *= ratio;
      player.vy *= ratio;
    }
  } else {
    player.vx *= 0.90;
    player.vy *= 0.90;
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;
  if (player.dashGraceTimer > 0 && Math.sqrt(player.vx * player.vx + player.vy * player.vy) > 220) {
    pushCapped(G.afterimages, {
      x: player.x,
      y: player.y,
      r: player.r,
      alpha: 0.42,
      life: 0.10,
      color: '#78eaff',
      maxAlpha: 0.42,
    }, FX_AFTERIMAGE_LIMIT);
  }
  player.x = Math.max(player.r + 18, Math.min(W - player.r - 18, player.x));
  player.y = Math.max(player.r + 18, Math.min(H - player.r - 18, player.y));

  if (intro.beat === 1 && player.x >= W * 0.47) {
    intro.beat = 2;
    intro.beatStartedAt = intro.timer;
    intro.canAdvance = false;
    intro.lockPoint = { x: player.x, y: player.y };
    player.eyeWideTimer = 1.5;
    player.vx = 0;
    player.vy = 0;
  }
}

function updateStoryIntroEnemies(intro, dt) {
  if (intro.beat !== 2 && intro.beat !== 3 && intro.beat !== 4) return;
  const localT = intro.timer - intro.beatStartedAt;
  for (const enemy of intro.enemies) {
    if (enemy.introDefeated) continue;
    if (!enemy.visible && localT >= enemy.wakeAt) {
      enemy.visible = true;
      enemy.alive = true;
      enemy.spawnTimer = 0.2;
      enemy.spawnScale = 0;
      enemy.hitFlashTimer = 0.14;
      spawnParticles(enemy.x, enemy.y, enemy.color, enemy === intro.breakthroughEnemy ? 9 : 6);
    }
    if (!enemy.visible) continue;
    if (enemy.spawnTimer > 0) {
      enemy.spawnTimer = Math.max(0, enemy.spawnTimer - dt);
      enemy.spawnScale = 1 - (enemy.spawnTimer / 0.2);
    } else {
      enemy.spawnScale = 1;
    }
    enemy.hitFlashTimer = Math.max(0, enemy.hitFlashTimer - dt);
    if (enemy.static) {
      enemy.x = enemy.anchorX;
      enemy.y = enemy.anchorY;
      enemy.pulseTimer = 3.5 - (((intro.timer * 1.2) + enemy.idleSeed * 0.0008) % 3.5);
      continue;
    }
    enemy.pulseTimer = 3.5 - (((intro.timer * 1.2) + enemy.idleSeed * 0.0008) % 3.5);
    enemy.telegraphing = enemy.type === 'teleporter' && Math.sin(intro.timer * 3 + enemy.idleSeed) > 0.72;
    enemy.telegraphTimer = enemy.telegraphing ? 0.3 : 0;
    enemy.x = intro.core.x + Math.cos(enemy.orbitAngle + intro.timer * enemy.orbitSpeed) * enemy.orbitRadius;
    enemy.y = intro.core.y + Math.sin(enemy.orbitAngle + intro.timer * enemy.orbitSpeed) * enemy.orbitRadius;
  }
  if (intro.beat === 2 && localT >= 0.65) {
    intro.canAdvance = true;
  }
  if (intro.beat === 4 && localT >= 0.01) intro.canAdvance = true;
}

function updateStoryIntro(dt) {
  const intro = G.storyIntro;
  if (!intro) return;
  ensureStoryIntroState(intro);
  intro.timer += dt;
  if (intro.timer >= 0.5) intro.skipReady = true;
  updateStoryIntroPlayerFace(intro.player, dt);
  updateStoryIntroPlayer(intro, dt);
  updateStoryIntroEnemies(intro, dt);
  updateStoryIntroBreakthrough(intro, dt);
}

function drawStoryIntroObjective(text, accent) {
  const boxW = 300;
  const boxH = 42;
  const x = W / 2 - boxW / 2;
  const y = H - 88;
  ctx.save();
  ctx.fillStyle = 'rgba(8, 14, 26, 0.82)';
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 14);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = 'bold 16px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#eff7ff';
  ctx.fillText(text, W / 2, y + boxH / 2);
  ctx.restore();
}

function drawStoryIntroWorld(intro) {
  const t = intro.timer;
  const beamAlpha = intro.beat === 1 ? 0.30 + 0.20 * Math.sin(t * 2.6) : 0.18;

  ctx.save();
  ctx.fillStyle = '#050914';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.45;
  ctx.drawImage(bgGridCanvas, 0, 0);
  ctx.globalAlpha = 0.75;
  ctx.drawImage(gridCanvas, 0, 0);
  ctx.globalAlpha = 1;

  const arenaGlow = ctx.createRadialGradient(intro.core.x, intro.core.y, 20, intro.core.x, intro.core.y, 260);
  arenaGlow.addColorStop(0, 'rgba(112, 220, 255, 0.10)');
  arenaGlow.addColorStop(0.45, 'rgba(80, 120, 255, 0.06)');
  arenaGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = arenaGlow;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 18; i++) {
    const px = (i * 93 + 40) % W;
    const py = (i * 57 + Math.sin(t * 0.5 + i) * 18 + 20) % H;
    ctx.globalAlpha = 0.10 + (i % 4) * 0.03;
    ctx.fillStyle = i % 3 === 0 ? '#8ef1ff' : '#c9d9ff';
    ctx.fillRect(px, py, 2, 2);
  }
  ctx.globalAlpha = 1;

  if (intro.beat === 1) {
    ctx.save();
    ctx.globalAlpha = beamAlpha;
    ctx.strokeStyle = '#87ecff';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(intro.player.x, intro.player.y);
    ctx.lineTo(intro.core.x, intro.core.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawStoryIntroBeacon(intro.core.x, intro.core.y, intro.core.r, intro.beat === 2 ? '#ff86ba' : '#78eaff', 0.95 + Math.sin(t * 1.9) * 0.08);

  const prevPlayer = G.player;
  const prevEnemies = G.enemies;
  G.player = intro.player;
  G.enemies = intro.enemies.filter(e => e.visible);
  drawEnemies();
  drawParticles();
  drawAfterimages();
  drawPlayer();
  G.player = prevPlayer;
  G.enemies = prevEnemies;

  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.20, W / 2, H / 2, H * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(1,2,6,0.58)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawStoryIntroScreen() {
  const intro = G.storyIntro;
  if (!intro) return;
  ensureStoryIntroState(intro);
  const localT = intro.timer - intro.beatStartedAt;
  const isTouchDev = isTouchUILayout();

  drawStoryIntroWorld(intro);

  let title = 'A distress signal remains inside the grid.';
  let body = 'You are the last courier in range.';
  let prompt = intro.canAdvance ? (isTouchDev ? '' : 'Press any key or click to answer the signal') : '';
  let objective = '';
  let accent = '#78eaff';

  if (intro.beat === 1) {
    title = 'The core is still active.';
    body = 'Move toward the signal before the link collapses.';
    if (intro.canAdvance) prompt = isTouchDev ? '' : 'Press W/A/S/D or arrows to move';
    objective = isTouchDev ? '' : 'Move toward the core';
  } else if (intro.beat === 2) {
    title = 'Its constructs are waking corrupted.';
    body = 'If the core dies here, the grid goes dark with it.';
    if (intro.canAdvance) prompt = isTouchDev ? '' : 'Press any key or click to continue';
    accent = '#ff86ba';
  } else if (intro.beat === 3) {
    title = '';
    body = isTouchDev
      ? 'Press, aim, and release the right stick\nto break through the construct.'
      : 'Hold Space, then release\nto dash through the construct.';
    prompt = '';
    objective = '';
    accent = '#78eaff';
  } else if (intro.beat === 4) {
    title = 'Hold the line. Keep the core alive.';
    body = 'The run starts now.';
    if (intro.canAdvance) prompt = isTouchDev ? '' : 'Press any key or click to begin';
    accent = '#ff86ba';
  }

  const textAlpha = intro.beat === 0 ? smooth01(localT / 0.8) : 1;
  ctx.save();
  ctx.globalAlpha = textAlpha;
  if (title) drawStoryIntroGlowText(title, 58, 92, 'bold 34px ' + FONT, '#ffffff', accent, 18);
  if (body) {
    ctx.font = '18px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c6d2e7';
    const bodyY = title ? 144 : 116;
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 58, bodyY + i * 28);
  }
  ctx.restore();

  ctx.save();
  ctx.font = '12px ' + FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#7f8eac';
  ctx.fillText('Loadout: ' + ((LOADOUTS.find(l => l.id === G.meta.selectedLoadout) || LOADOUTS[0]).name), 58, H - 44);
  if (intro.skipReady && !isTouchDev) {
    ctx.textAlign = 'right';
    ctx.fillText('Esc to skip', W - 40, 34);
  }
  ctx.restore();

  if (objective) drawStoryIntroObjective(objective, '#78eaff');
  if (prompt) {
    ctx.save();
    ctx.font = 'bold 16px ' + FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#a6d8ff';
    ctx.fillText(prompt, W - 40, H - 48);
    ctx.restore();
  }
}

function drawMenuButton(rect, label, opts) {
  const hovered = !!opts.hovered;
  const accent = opts.accent || '#00ffff';
  const sublabel = opts.sublabel || '';
  const prominent = !!opts.prominent;
  const danger = !!opts.danger;

  ctx.save();
  if (hovered) {
    ctx.shadowColor = accent;
    ctx.shadowBlur = prominent ? 18 : 12;
  }
  ctx.fillStyle = danger
    ? (hovered ? '#52212a' : 'rgba(56, 20, 28, 0.88)')
    : prominent
      ? (hovered ? '#163844' : 'rgba(18, 30, 44, 0.90)')
      : (hovered ? '#202943' : 'rgba(16, 20, 34, 0.82)');
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 10);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = hovered ? 2.5 : 1.5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = hovered ? '#ffffff' : '#dbe8ff';
  const titleSize = prominent ? (rect.h >= 54 ? 22 : 20) : (rect.h >= 50 ? 18 : 16);
  ctx.font = 'bold ' + titleSize + 'px ' + FONT;
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + (sublabel ? -6 : 0));

  if (sublabel) {
    ctx.fillStyle = hovered ? '#d6f7ff' : '#9eb1cc';
    ctx.font = (rect.h >= 50 ? '13px ' : '12px ') + FONT;
    ctx.fillText(sublabel, rect.x + rect.w / 2, rect.y + rect.h / 2 + 14);
  }
  ctx.restore();
}

// --- Stage Arc Definitions (lore-driven background progression) ---
const STAGE_ARCS = [
  { // Arc 0: The Awakening (waves 1-9)
    name: 'The Awakening', waveMin: 1, waveMax: 9,
    baseFill: '#0a0a0f', gridColor: '#1a2a1a', tintColor: '#00aa66',
    tintAlpha: (wave) => 0.10 + (wave - 1) * (0.08 / 8),
    particles: { count: 8, speed: 15, alpha: 0.06, shape: 'circle', size: 2, pulse: 0, dirY: 0 },
  },
  { // Arc 1: Hive Queen's Nest (wave 10)
    name: "Hive Queen's Nest", waveMin: 10, waveMax: 10,
    baseFill: '#0f0a05', gridColor: '#2a1a0a', tintColor: '#ff8800',
    tintAlpha: () => 0.22,
    particles: { count: 12, speed: 25, alpha: 0.08, shape: 'circle', size: 2, pulse: 3, pulseAmp: 0.03, dirY: 0 },
  },
  { // Arc 2: The Deep Grid (waves 11-19)
    name: 'The Deep Grid', waveMin: 11, waveMax: 19,
    baseFill: '#050510', gridColor: '#0a1a2a',
    tintColor: (wave) => {
      const t = (wave - 11) / 8;
      const r = Math.round(0x00 + t * (0x66 - 0x00));
      const g = Math.round(0x66 + t * (0x00 - 0x66));
      const b = Math.round(0xcc + t * (0x99 - 0xcc));
      return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
    },
    tintAlpha: (wave) => 0.14 + (wave - 11) * (0.08 / 8),
    particles: { count: 10, speed: 20, alpha: 0.07, shape: 'rect', size: 2, sizeH: 4, pulse: 0, dirY: 0 },
  },
  { // Arc 3: Nexus Chamber (wave 20)
    name: 'Nexus Chamber', waveMin: 20, waveMax: 20,
    baseFill: '#0a0a10', gridColor: '#1a1a2a', tintColor: '#ffffff',
    tintAlpha: () => 0.20,
    particles: { count: 15, speed: 40, alpha: 0.10, shape: 'circle', size: 2, pulse: 0, dirY: 0, flash: true, flashLife: 0.3 },
  },
  { // Arc 4: The Void Approaches (waves 21-29)
    name: 'The Void Approaches', waveMin: 21, waveMax: 29,
    baseFill: '#050008', gridColor: '#150020',
    tintColor: (wave) => {
      const t = (wave - 21) / 8;
      const r = Math.round(0x66);
      const g = Math.round(0x00);
      const b = Math.round(0x99 + t * (0x66 - 0x99));
      return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
    },
    tintAlpha: (wave) => 0.16 + (wave - 21) * (0.12 / 8),
    particles: { count: 12, speed: 10, alpha: 0.09, shape: 'circle', size: 2, pulse: 0, dirY: 0, scaleOscillate: true },
  },
  { // Arc 5: The Void (wave 30)
    name: 'The Void', waveMin: 30, waveMax: 30,
    baseFill: '#020004', gridColor: '#0a0010', tintColor: '#aa66ff',
    tintAlpha: () => 0.30,
    particles: { count: 20, speed: 30, alpha: 0.12, shape: 'circle', size: 2, pulse: 0, dirY: -1 },
  },
];

function getStageArcIndex(wave) {
  if (wave <= 0) return 0;
  if (wave <= 30) {
    for (let i = 0; i < STAGE_ARCS.length; i++) {
      if (wave >= STAGE_ARCS[i].waveMin && wave <= STAGE_ARCS[i].waveMax) return i;
    }
    return 0;
  }
  // Endless mode (31+): cycle arcs 0-4 (non-boss) every 10 waves
  // Boss waves (every 10th in endless) use their dedicated arc based on cycle position
  const endlessWave = wave - 31;
  const posInCycle = endlessWave % 10; // 0-9 position within 10-wave group
  const cycleGroup = Math.floor(endlessWave / 10) % 3; // which boss pattern (0,1,2)
  if (posInCycle === 9) {
    // Boss wave: cycle through Hive(1), Nexus(3), Void(5)
    return [1, 3, 5][cycleGroup];
  }
  // Non-boss waves: cycle through arcs 0 (Awakening) and 4 (Void Approaches)
  // First 5 waves of group use arc 0, next 4 use arc 4
  if (posInCycle < 5) return 0;
  return 4;
}

function getStageArc(wave) {
  return STAGE_ARCS[getStageArcIndex(wave)];
}

function getArcTintColor(wave) {
  const arc = getStageArc(wave);
  return typeof arc.tintColor === 'function' ? arc.tintColor(wave) : arc.tintColor;
}

function getArcTintAlpha(wave) {
  const arc = getStageArc(wave);
  let alpha = typeof arc.tintAlpha === 'function' ? arc.tintAlpha(wave) : arc.tintAlpha;
  if (wave > 30) {
    const bonus = Math.floor((wave - 31) / 30) * 0.02;
    alpha = Math.min(0.38, alpha + bonus);
  }
  return alpha;
}

// --- Ambient Particle System ---
function initAmbientParticles(wave) {
  const arc = getStageArc(wave);
  const p = arc.particles;
  const tintColor = typeof arc.tintColor === 'function' ? arc.tintColor(wave) : arc.tintColor;
  const targetCount = Math.max(4, Math.round(p.count * FX_AMBIENT_PARTICLE_SCALE));
  G.ambientParticles = [];
  for (let i = 0; i < targetCount; i++) {
    G.ambientParticles.push(spawnAmbientParticle(p, tintColor, true));
  }
}

function spawnAmbientParticle(pDef, color, randomPos) {
  const edge = Math.floor(Math.random() * 4);
  let x, y;
  if (randomPos) {
    x = Math.random() * W;
    y = Math.random() * H;
  } else {
    // Spawn at a random edge
    if (edge === 0) { x = Math.random() * W; y = -4; }
    else if (edge === 1) { x = Math.random() * W; y = H + 4; }
    else if (edge === 2) { x = -4; y = Math.random() * H; }
    else { x = W + 4; y = Math.random() * H; }
  }
  // Drift direction: mostly random, or forced upward for arc 5
  let angle = Math.random() * Math.PI * 2;
  if (pDef.dirY === -1) angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
  const speed = pDef.speed * (0.6 + Math.random() * 0.8);
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    alpha: pDef.alpha,
    size: pDef.size,
    sizeH: pDef.sizeH || pDef.size,
    shape: pDef.shape,
    color: color,
    pulse: pDef.pulse || 0,
    pulseAmp: pDef.pulseAmp || 0,
    flash: pDef.flash || false,
    flashLife: pDef.flashLife || 0,
    flashTimer: pDef.flash ? Math.random() * (pDef.flashLife || 0.3) : 0,
    scaleOscillate: pDef.scaleOscillate || false,
    age: Math.random() * 10, // randomize phase
  };
}

function updateAmbientParticles(dt) {
  if (G.wave <= 0) return;
  const arc = getStageArc(G.wave);
  const pDef = arc.particles;
  const tintColor = typeof arc.tintColor === 'function' ? arc.tintColor(G.wave) : arc.tintColor;
  const targetCount = Math.max(4, Math.round(pDef.count * FX_AMBIENT_PARTICLE_SCALE));
  for (let i = G.ambientParticles.length - 1; i >= 0; i--) {
    const p = G.ambientParticles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.age += dt;
    if (p.flash) {
      p.flashTimer -= dt;
      if (p.flashTimer <= 0) {
        // Respawn at random position
        p.x = Math.random() * W;
        p.y = Math.random() * H;
        p.flashTimer = p.flashLife;
        p.age = 0;
      }
    }
    // Respawn if off-screen
    if (p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) {
      G.ambientParticles[i] = spawnAmbientParticle(pDef, tintColor, false);
    }
  }
  // Maintain target count
  while (G.ambientParticles.length < targetCount) {
    G.ambientParticles.push(spawnAmbientParticle(pDef, tintColor, false));
  }
  while (G.ambientParticles.length > targetCount) {
    G.ambientParticles.pop();
  }
}

function drawAmbientParticles() {
  if (G.ambientParticles.length === 0) return;
  ctx.save();
  const now = performance.now() / 1000;
  for (const p of G.ambientParticles) {
    let a = p.alpha;
    if (p.pulse > 0) {
      a += Math.sin(now * p.pulse) * p.pulseAmp;
    }
    if (p.flash) {
      // Flash: bright at start, fade over lifetime
      a = p.alpha * Math.max(0, p.flashTimer / p.flashLife);
    }
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = p.color;
    let s = p.size;
    if (p.scaleOscillate) {
      s *= 0.8 + 0.4 * Math.sin(p.age * 2);
    }
    if (p.shape === 'rect') {
      ctx.fillRect(p.x - s / 2, p.y - p.sizeH / 2, s, p.sizeH);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// --- Parallax Dot Layer (persistent background depth dots) ---
function initParallaxDots() {
  G.waveTransitionParallaxDots = [];
  const dotCount = 20 + Math.floor(Math.random() * 11); // 20-30
  for (let i = 0; i < dotCount; i++) {
    G.waveTransitionParallaxDots.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 1.5 + Math.random() * 1.5,
      vy: -(3 + Math.random() * 5), // gentle upward drift
    });
  }
}

function updateParallaxDots(dt) {
  if (!G.waveTransitionParallaxDots || G.waveTransitionParallaxDots.length === 0) return;
  for (const dot of G.waveTransitionParallaxDots) {
    dot.y += dot.vy * dt;
    // Wrap around when off-screen
    if (dot.y < -4) { dot.y = H + 2; dot.x = Math.random() * W; }
  }
}

// --- Ambient Background Shapes (slow-moving depth layer, per arc) ---
const AMBIENT_SHAPE_COUNT = FX_AMBIENT_SHAPE_COUNT;

function initAmbientShapes(wave) {
  const arc = getStageArc(wave);
  const tintColor = typeof arc.tintColor === 'function' ? arc.tintColor(wave) : arc.tintColor;
  G.ambientShapes = [];
  for (let i = 0; i < AMBIENT_SHAPE_COUNT; i++) {
    G.ambientShapes.push(spawnAmbientShape(tintColor));
  }
}

function spawnAmbientShape(color, randomPos) {
  const isCircle = Math.random() > 0.4; // ~60% circles, 40% line segments
  const x = randomPos !== false ? Math.random() * W : (Math.random() < 0.5 ? -60 : W + 60);
  const y = Math.random() * H;
  const angle = Math.random() * Math.PI * 2;
  const speed = 3 + Math.random() * 5; // very slow drift
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    shape: isCircle ? 'circle' : 'line',
    size: isCircle ? (20 + Math.random() * 30) : (30 + Math.random() * 50),
    alpha: 0.03 + Math.random() * 0.04,
    color,
    age: Math.random() * 20,
    fadeSpeed: 0.3 + Math.random() * 0.4,
  };
}

function updateAmbientShapes(dt) {
  if (G.wave <= 0 || G.ambientShapes.length === 0) return;
  const arc = getStageArc(G.wave);
  const tintColor = typeof arc.tintColor === 'function' ? arc.tintColor(G.wave) : arc.tintColor;
  for (let i = G.ambientShapes.length - 1; i >= 0; i--) {
    const s = G.ambientShapes[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.age += dt;
    // Respawn if off-screen with margin
    if (s.x < -80 || s.x > W + 80 || s.y < -80 || s.y > H + 80) {
      G.ambientShapes[i] = spawnAmbientShape(tintColor, false);
    }
  }
  while (G.ambientShapes.length < AMBIENT_SHAPE_COUNT) {
    G.ambientShapes.push(spawnAmbientShape(tintColor, false));
  }
}

function drawAmbientShapes() {
  if (G.ambientShapes.length === 0) return;
  ctx.save();
  for (const s of G.ambientShapes) {
    // Fade in/out with a slow sine cycle
    const fade = 0.5 + 0.5 * Math.sin(s.age * s.fadeSpeed);
    ctx.globalAlpha = s.alpha * fade;
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.color;
    if (s.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x - s.size / 2, s.y);
      ctx.lineTo(s.x + s.size / 2, s.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// --- Arc transition helpers ---
function onArcChange(newWave) {
  const newArcIdx = getStageArcIndex(newWave);
  if (newArcIdx !== G.currentArcIndex) {
    const newArc = STAGE_ARCS[newArcIdx];
    // Snapshot old grids for crossfade
    const oldCtx = gridCanvasOld.getContext('2d');
    oldCtx.clearRect(0, 0, W, H);
    oldCtx.drawImage(gridCanvas, 0, 0);
    const oldBgCtx = bgGridCanvasOld.getContext('2d');
    oldBgCtx.clearRect(0, 0, W, H);
    oldBgCtx.drawImage(bgGridCanvas, 0, 0);
    // Render new grids with new arc color
    renderGridTo(gridCanvas, newArc.gridColor);
    renderBgGridTo(bgGridCanvas, newArc.gridColor);
    G.gridCrossfade = 1.0; // start fully showing old
    G.gridCrossfadeTimer = 0;
    G.currentArcIndex = newArcIdx;
    // Reinit ambient particles and shapes for new arc
    initAmbientParticles(newWave);
    initAmbientShapes(newWave);
  }
}

function updateGridCrossfade(dt, transProgress) {
  // During wave transition scroll, use scroll progress to drive crossfade
  if (G.gridCrossfade > 0) {
    if (transProgress !== undefined) {
      G.gridCrossfade = Math.max(0, 1 - transProgress);
    } else {
      // Fallback: decay over time (for non-scroll transitions)
      G.gridCrossfade = Math.max(0, G.gridCrossfade - dt * 2);
    }
  }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function offsetAllObstacleY(delta) {
  for (const p of G.pillars) p.y += delta;
  for (const b of G.bouncePads) b.y += delta;
  for (const f of G.flatBouncers) f.y += delta;
  for (const h of G.hazardZones) { h.y += delta; h.cy += delta; }
}

function initWaveTransition(breakDuration) {
  G.waveTransitionInitialBreak = breakDuration;
  G.waveTransitionOffset = 0;
  // Wave announce text state for scroll transition
  const nextWave = G.wave + 1;
  G.waveTransitionAnnounce = { wave: nextWave, timer: 0, duration: Math.min(breakDuration, 2.0) };
  // Regenerate parallax dots with fresh positions for the scroll
  initParallaxDots();
  // Trigger arc change for grid crossfade and ambient particles
  onArcChange(nextWave);

  // Swap obstacles early and position above screen for slide-in effect
  const transDur = getWaveTransitionDuration(breakDuration);
  if (transDur > 0) {
    updateArenaModifiersForWave(nextWave);
    offsetAllObstacleY(-H); // start above screen, slide in during scroll
    G.waveTransitionSlideIn = true;
  } else {
    G.waveTransitionSlideIn = false;
  }

  // Init lore snippet (skip for very short breaks like boss intro)
  if (breakDuration >= 1.0) {
    initLoreSnippet(nextWave);
    // Show endless entry message on first post-W30 wave
    if (nextWave === 31 && G.isEndlessRun) {
      showEndlessEntryMessage();
    }
  } else {
    G.loreSnippet = null;
  }

  // Platform SDK: request ad break during wave transition
  platformSDK.adBreak();
}

function getWaveTransitionScrollDist(wave) {
  // Full-screen scroll for all waves
  return H;
}

function getWaveTransitionDuration(initialBreak) {
  const isBoss = G.wave === 9 || G.wave === 19 || G.wave === 29; // next wave is boss
  const maxDur = isBoss ? 2.5 : 1.8;
  return Math.min(initialBreak - 0.3, maxDur);
}

function triggerBroodbreakerSigil(data) {
  const player = G.player;
  if (!player?.sigils?.includes('broodbreaker')) return;
  if (!data?.isMinion || data.source === 'broodbreakerSigil') return;
  if (!player.sigilState || player.sigilState.broodbreakerKillsLeft <= 0) return;

  player.sigilState.broodbreakerKillsLeft--;
  player.stamina = Math.min(player.maxStamina || 100, player.stamina + 12);
  spawnCombatText('+12 STA', data.x || player.x, (data.y || player.y) - 20, {
    size: 16,
    color: '#72f6ff',
    bold: true,
  });
  G.multiPopExplosions.push({
    x: data.x || player.x,
    y: data.y || player.y,
    r: 0,
    maxR: 45,
    life: 0.18,
    maxLife: 0.18,
  });
  spawnParticles(data.x || player.x, data.y || player.y, '#ffb26f', 8);

  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const enemy = G.enemies[i];
    if (!enemy.alive || enemy.isBoss || enemy.spawnTimer > 0) continue;
    if (dist({ x: data.x || player.x, y: data.y || player.y }, enemy) > 45) continue;
    if (hitEnemy(enemy, 'broodbreakerSigil')) {
      killEnemy(enemy, i, 'broodbreakerSigil');
    }
  }
}

// --- Wire up events for combat text ---
events.on('enemyKilled', (data) => {
  G.runKills++;
  triggerBroodbreakerSigil(data);
  // Apply score multiplier from Point Frenzy boost
  const scoreMul = getScoreMultiplier();
  const displayPts = data.points * scoreMul;
  if (scoreMul > 1) G.score += data.points * (scoreMul - 1); // extra score from multiplier
  if (data.combo >= 2) {
    spawnCombatText('+' + displayPts + ' x' + data.combo, data.x || 0, data.y || 0,
      { size: 20, color: '#ffdd44', bold: true });
  } else {
    spawnCombatText('+' + displayPts, data.x || 0, data.y || 0,
      { size: 18, color: scoreMul > 1 ? '#ff44ff' : '#ffffff', bold: true });
  }
  // Physical shard drop
  rollEnemyShardDrop(data.type, data.x || 0, data.y || 0);
  // Power gem drop from elite enemies (spawner, sniper): 8%
  if ((data.type === 'spawner' || data.type === 'sniper') && Math.random() < 0.08) {
    spawnPowerGem(data.x || 0, data.y || 0, { common: 60, rare: 30, epic: 10 });
  }
  // Boost pickup spawn roll
  boostOnEnemyKilled(data.x || 0, data.y || 0);
});

events.on('waveCleared', () => {
  G.runWaves = G.wave;
});

// Bomber explosion damages player
events.on('bomberExplosion', (data) => {
  damagePlayer(data.x, data.y);
});

// Sniper beam damages player
events.on('sniperBeamHit', (data) => {
  damagePlayer(data.x, data.y);
});

// Hazard zone damage
events.on('hazardZoneDamage', (data) => {
  damagePlayer(data.x, data.y);
});

// Victory (Void Warden defeated)
events.on('victory', () => {
  transitionToRunSummary();
});

// --- Wire up audio events ---
events.on('enemyKilled', (data) => {
  if (data.combo >= 2) {
    sfxComboKill(data.combo);
  } else {
    sfxEnemyKill(data.type);
  }
});

events.on('playerDamaged', () => {
  sfxDamageTaken();
});

events.on('gameOver', () => {
  clearTouchSticks();
  sfxGameOver();
  stopMusic();
});

events.on('waveCleared', () => {
  sfxWaveClear();
});

events.on('waveStarted', (data) => {
  // Increase music intensity with wave
  setMusicIntensity(Math.min(1, data.wave / 25), data.wave);
});

events.on('powerUpCollected', () => {
  sfxShardCollect();
});

events.on('boostCollected', (data) => {
  sfxBoostCollect(data.type);
});

// --- Platform SDK analytics hooks ---
events.on('waveStarted', (data) => {
  platformSDK.gameplayStart();
  platformSDK.event('waveReached', { wave: data.wave });
  if (G.runTelemetry) G.runTelemetry.waveReached = Math.max(G.runTelemetry.waveReached || 0, data.wave || 0);
});

events.on('enemyKilled', (data) => {
  platformSDK.event('score', { score: G.score, points: data.points, combo: data.combo });
  if (G.runTelemetry) {
    const key = Object.prototype.hasOwnProperty.call(G.runTelemetry.killSources, data.source) ? data.source : 'other';
    G.runTelemetry.killSources[key] = (G.runTelemetry.killSources[key] || 0) + 1;
  }
});

events.on('gameOver', (data) => {
  platformSDK.gameplayStop();
  platformSDK.event('death', { score: data.score, wave: data.wave });
});

events.on('waveCleared', (data) => {
  platformSDK.gameplayStop();
  platformSDK.event('waveCleared', { wave: data.wave, bonus: data.bonus });
});

events.on('victory', () => {
  platformSDK.gameplayStop();
  platformSDK.event('victory', { score: G.score, wave: G.wave });
});

// --- Collision Detection ---
function checkCollisions() {
  const player = G.player;
  const pSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
  const surgeCanKill = player.surgeActive && pSpeed >= SURGE_ACTIVE_SPEED_THRESHOLD &&
    (player.surgeKillsRemaining === -1 || player.surgeKillsRemaining > 0);
  const canKill = player.dashGraceTimer > 0 || player.overdriveTimer > 0 || isInvincibleFromBoost() || surgeCanKill;
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (!e.alive || e.spawnTimer > 0 || e.isFusing) continue;
    const d = dist(player, e);
    if (d < player.r + e.r) {
      if (canKill) {
        if (e.isBoss) {
          // Boss takes hits, not instant kills
          hitBoss(e);
        } else {
          // Try to hit (handles shield + multi-HP)
          const canDie = hitEnemy(e, 'player');
          if (canDie) {
            killEnemy(e, i, 'player');
            // Surge decay: decrement kills remaining
            if (surgeCanKill && player.surgeKillsRemaining > 0) {
              player.surgeKillsRemaining--;
            }
          }
        }
      } else if (player.dashRecoveryTimer > 0) {
        // Recovery phase: knockback only, no damage, no kill
        const pdx = player.x - e.x;
        const pdy = player.y - e.y;
        const pushDist = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
        player.vx = (pdx / pushDist) * 400;
        player.vy = (pdy / pushDist) * 400;
        // Separate overlapping bodies
        const overlap = (player.r + e.r) - pushDist;
        if (overlap > 0) {
          player.x += (pdx / pushDist) * overlap;
          player.y += (pdy / pushDist) * overlap;
        }
      } else {
        // Push enemy away from player on passive collision
        const pdx = e.x - player.x;
        const pdy = e.y - player.y;
        const pushDist = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
        const pushForce = 200;
        e.vx = (pdx / pushDist) * pushForce;
        e.vy = (pdy / pushDist) * pushForce;
        // Separate overlapping bodies
        const overlap = (player.r + e.r) - pushDist;
        if (overlap > 0) {
          e.x += (pdx / pushDist) * overlap;
          e.y += (pdy / pushDist) * overlap;
        }
        damagePlayer(e.x, e.y);
      }
    }
  }
  // Check mirror copy collisions
  checkMirrorCopyCollisions(player);
}

function checkShockwaveCollisions() {
  const player = G.player;
  for (const s of G.shockwaves) {
    if (G.state !== STATE.GAME_OVER && player.invTimer <= 0 && player.overdriveTimer <= 0 && !isInvincibleFromBoost()) {
      const d = dist(player, s);
      if (Math.abs(d - s.r) < s.thickness / 2 + player.r) damagePlayer(s.x, s.y);
    }
  }
}

function checkThunderTrailCollisions() {
  if (!G.thunderTrails || G.thunderTrails.length === 0) return;
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const enemy = G.enemies[i];
    if (!enemy.alive || enemy.isBoss || enemy.spawnTimer > 0 || enemy.isFusing) continue;
    for (const trail of G.thunderTrails) {
      if (dist(trail, enemy) > trail.r + enemy.r) continue;
      if (hitEnemy(enemy, 'thunderDash')) {
        killEnemy(enemy, i, 'thunderDash');
      }
      break;
    }
  }
}

// --- Shell Guard collision check ---
function checkShellGuardCollisions() {
  const player = G.player;
  if (!player.shellGuardOrbs || player.shellGuardOrbs.length === 0) return;

  const power = player.powers.find(p => p.id === 'shellGuard' || p.id === 'novaCore');
  if (!power) return;

  const orbitRadius = power.id === 'novaCore' ? 60 : (power.level === 1 ? 50 : power.level === 2 ? 55 : 60);

  for (const orb of player.shellGuardOrbs) {
    if (!orb.alive || orb.killCooldown > 0) continue;

    const orbX = player.x + Math.cos(orb.angle) * orbitRadius;
    const orbY = player.y + Math.sin(orb.angle) * orbitRadius;

    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      if (!e.alive || e.spawnTimer > 0) continue;
      const d = dist({ x: orbX, y: orbY }, e);
      if (d < 8 + e.r) {
        if (e.isBoss) {
          // Boss takes 1 hit from orb, not instakill
          hitBoss(e);
        } else {
          killEnemy(e, i);
        }
        orb.alive = false;
        orb.respawnTimer = power.id === 'novaCore' ? 4.0 :
          (POWER_DEFS.shellGuard.levels[power.level - 1].respawnTime || 3.0);
        break;
      }
    }

  }
}

function transitionToPowerSelect() {
  const rewardContext = G.pendingPowerSelectContext || getRewardContextForWave(G.wave);
  const offering = generateOffering(G.wave, G.meta, rewardContext);
  if (offering.some(card => card.isEvolution) && G.pendingEvolution) {
    events.emit('evolutionOffered', { recipeId: G.pendingEvolution.id });
  }
  // Skip power select if no cards to offer (all powers maxed)
  if (offering.length === 0) {
    const breakDur = G.isHardcore ? 1.0 : getWaveBreakDuration(G.wave);
    G.state = STATE.WAVE_BREAK;
    G.waveBreakTimer = breakDur;
    setMusicState('wave_break');
    initWaveTransition(breakDur);
    G.pendingPowerSelectContext = null;
    G.powerSelectConfig = null;
    return;
  }
  // Emit glossary tracking for offered powers
  for (const card of offering) {
    if (card.isEvolution) continue; // already emitted above
    events.emit('powerOffered', { powerId: card.powerId });
  }
  G.state = STATE.POWER_SELECT;
  setMusicState('power_select');
  G.cardOffering = offering;
  G.cardHover = -1;
  G.cardPickAnim = null;
  G.powerSelectConfig = getPowerSelectConfig(rewardContext);
  G.pendingPowerSelectContext = null;
  G.collectFlashTimer = 0;
  G.collectFlashAlpha = 0;
}

function finalizeTransitionRoomChoice(room, option) {
  if (!room || !option) return;
  if (room.mode === 'boss_approach') {
    if (option.id === 'steady') {
      G.player.hp = Math.min(G.player.maxHp, G.player.hp + 1);
      G.player.stamina = G.player.maxStamina;
      spawnCombatText('+1 HP', G.player.x, G.player.y - 30, { size: 18, color: '#6ff7ff', bold: true });
    } else {
      G.bossRouteShardBonus = option.shardBonus || 0;
      G.bossRouteScoreBonus = option.scoreBonus || 0;
      spawnCombatText('RISK ROUTE', G.player.x, G.player.y - 30, { size: 16, color: '#ff9b7c', bold: true });
    }
    sfxUIClick();
    startTransition(() => {
      G.transitionRoom = null;
      clearTransitionRoomUi();
      startBossIntro(room.bossWave);
    }, 5);
    return;
  }

  if (option.kind === 'sigil') {
    G.player.sigils = G.player.sigils || [];
    if (!G.player.sigils.includes(option.sigilId)) G.player.sigils.push(option.sigilId);
    if (option.sigilId === 'broodbreaker') {
      G.player.sigilState.broodbreakerKillsLeft = 3;
    }
    sfxUIClick();
  } else if (option.kind === 'signal_cache') {
    const shardBonus = option.shardBonus || 30;
    G.meta.shards += shardBonus;
    G.meta.totalShardsEarned += shardBonus;
    saveMeta(G.meta);
    sfxUIClick();
  } else if (option.card) {
    G.previousOffering = (room.options || [])
      .filter(candidate => candidate.card && !candidate.card.isEvolution)
      .map(candidate => candidate.card.powerId);
    if (option.card.isEvolution) {
      applyPowerPick(option.card);
      sfxEvolutionUnlock();
    } else {
      applyPowerPick(option.card);
      sfxCardPick();
    }
    G.pendingEvolution = checkEvolutionAvailable();
  }

  startTransition(() => {
    const breakDur = G.isHardcore ? 1.0 : getWaveBreakDuration(G.wave);
    G.transitionRoom = null;
    clearTransitionRoomUi();
    G.state = STATE.WAVE_BREAK;
    setMusicState('wave_break');
    G.waveBreakTimer = breakDur;
    initWaveTransition(breakDur);
  }, 5);
}

function updateTransitionRoom(dt) {
  const room = G.transitionRoom;
  const player = G.player;
  if (!room || !player) return;

  if (room.preludeActive) {
    room.preludeTimer += dt;
    if (room.preludeTimer >= room.preludeAdvanceDelay) {
      room.preludeReady = true;
    }
    player.vx *= Math.max(0, 1 - dt * 10);
    player.vy *= Math.max(0, 1 - dt * 10);
    updateParticles(dt);
    updateFloatTexts(dt);
    updateAfterimages(dt);
    updateCombatTexts(dt);
    updateAmbientParticles(dt);
    updateAmbientShapes(dt);
    return;
  }

  if (room.outroActive) {
    room.outroTimer += dt;
    player.vx *= Math.max(0, 1 - dt * 10);
    player.vy *= Math.max(0, 1 - dt * 10);
    updateParticles(dt);
    updateFloatTexts(dt);
    updateAfterimages(dt);
    updateCombatTexts(dt);
    updateAmbientParticles(dt);
    updateAmbientShapes(dt);
    if (room.mode === 'epilogue') {
      if (room.outroTimer >= room.outroLineDuration && !room.outroResolved) {
        const nextIndex = room.outroLineIndex + 1;
        if (nextIndex < EPILOGUE_REVEAL_LINES.length) {
          room.outroLineIndex = nextIndex;
          room.commitLine = EPILOGUE_REVEAL_LINES[nextIndex];
          room.outroTimer = 0;
          room.outroLineDuration = getEpilogueRevealDuration(
            EPILOGUE_REVEAL_LINES[nextIndex],
            nextIndex === EPILOGUE_REVEAL_LINES.length - 1
          );
        } else {
          room.outroResolved = true;
          G.isVictory = true;
          startTransition(() => {
            transitionToRunSummary();
            G.transitionRoom = null;
            clearTransitionRoomUi();
          }, 5);
        }
      }
    } else if (room.outroTimer >= room.outroDuration && !room.outroResolved) {
      room.outroResolved = true;
      if (room.selectedIndex >= 0 && room.options?.[room.selectedIndex]) {
        finalizeTransitionRoomChoice(room, room.options[room.selectedIndex]);
      }
    }
    return;
  }

  if (room.controlDelay > 0) room.controlDelay = Math.max(0, room.controlDelay - dt);

  if (room.mode === 'epilogue' && room.selectedIndex === 0) {
    player.vx *= Math.max(0, 1 - dt * 10);
    player.vy *= Math.max(0, 1 - dt * 10);
  } else {
    updatePlayer(dt);
    player.x = Math.max(40, Math.min(W - 40, player.x));
    player.y = Math.max(90, Math.min(H - 36, player.y));
  }

  updateParticles(dt);
  updateFloatTexts(dt);
  updateAfterimages(dt);
  updateCombatTexts(dt);
  updateAmbientParticles(dt);
  updateAmbientShapes(dt);

  if (room.mode === 'epilogue') {
    const exitGate = room.exitGate;
    if (exitGate) {
      const d = dist(player, exitGate);
      room.hoverIndex = d < 90 ? 0 : -1;
      if (d < exitGate.commitRadius && room.selectedIndex < 0) {
        continueTransitionRoom();
      }
    }
    return;
  }

  let nearestIndex = -1;
  let nearestDist = Infinity;
  for (let i = 0; i < room.gates.length; i++) {
    const gate = room.gates[i];
    const d = dist(player, gate);
    if (d < nearestDist) {
      nearestDist = d;
      nearestIndex = i;
    }
    if (room.selectedIndex < 0 && d < gate.commitRadius && room.controlDelay <= 0) {
      chooseTransitionRoomOption(i);
      return;
    }
  }
  room.hoverIndex = nearestIndex;
  if (nearestIndex >= 0) room.cursor = nearestIndex;
}

// --- Main Update ---
function update(dt) {
  if (G.state === STATE.GAME_OVER) {
    if (G.freezeTimer > 0) { G.freezeTimer -= dt; return; }
    G.gameOverFadeIn = Math.min(1, G.gameOverFadeIn + dt * 2);
    G.gameOverTimer += dt;
    return;
  }

  if (G.state === STATE.RUN_SUMMARY) {
    G.runSummaryTimer += dt;
    if (G.runSummary && G.runSummaryShardCounter < G.runSummary.total) {
      G.runSummaryShardCounter = Math.min(G.runSummary.total,
        G.runSummaryShardCounter + (G.runSummary.total / 1.5) * dt);
    }
    if (G.runSummary && G.runSummaryScoreCounter < G.runSummary.score) {
      G.runSummaryScoreCounter = Math.min(G.runSummary.score,
        G.runSummaryScoreCounter + (G.runSummary.score / 1.5) * dt);
    }
    // Update victory particles
    for (let i = G.summaryParticles.length - 1; i >= 0; i--) {
      const p = G.summaryParticles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt; // slight gravity
      p.life -= dt;
      const t = Math.max(0, p.life / p.maxLife);
      p.alpha = t;
      p.r = p.initR * t;
      if (p.life <= 0) G.summaryParticles.splice(i, 1);
    }
    if (G.runSummaryTimer > 2.0) G.runSummaryReady = true;
    return;
  }

  if (G.state === STATE.TITLE) { updateTitleBackground(dt); return; }
  if (G.state === STATE.STORY_INTRO) {
    updateTitleBackground(dt);
    updateAfterimages(dt);
    updateParticles(dt);
    updateStoryIntro(dt);
    return;
  }
  if (G.state === STATE.MODE_SELECT) return;
  if (G.state === STATE.PAUSED) return;
  if (G.state === STATE.TUTORIAL) return;
  if (G.state === STATE.RELAY_CHAMBER) return;
  if (G.state === STATE.TRANSITION_ROOM) { updateTransitionRoom(dt); return; }
  if (G.state === STATE.UPGRADES) return;
  if (G.state === STATE.LOADOUT) return;
  if (G.state === STATE.GLOSSARY) return;
  if (G.state === STATE.SETTINGS) return;

  if (G.state === STATE.POWER_SELECT) {
    // Animate card pick
    if (G.cardPickAnim) {
      G.cardPickAnim.t += dt;
      if (G.cardPickAnim.t >= 0.4) {
        // Apply the pick
        const card = G.cardOffering[G.cardPickAnim.index];
        applyPowerPick(card);
        if (card.isEvolution) {
          sfxEvolutionUnlock();
          G.freezeTimer = 0.2; // hitstop on evolution
        }
        G.previousOffering = G.cardOffering.filter(c => !c.isEvolution).map(c => c.powerId);
        G.cardPickAnim = null;
        G.cardOffering = [];
        G.cardHover = -1;
        G.powerSelectConfig = null;

        // Check if there's a pending evolution for next wave
        G.pendingEvolution = checkEvolutionAvailable();

        // Resume wave break
        const breakDur2 = G.isHardcore ? 1.0 : getWaveBreakDuration(G.wave);
        G.state = STATE.WAVE_BREAK;
        setMusicState('wave_break');
        G.waveBreakTimer = breakDur2;
        initWaveTransition(breakDur2);
      }
    }
    return;
  }

  if (G.freezeTimer > 0) { G.freezeTimer -= dt; return; }

  const comboTimer = G.meta.unlocks.includes(14) ? 2.5 : 1.5;
  if (G.comboTimer > 0) { G.comboTimer -= dt; if (G.comboTimer <= 0) { G.combo = 0; G.comboTimer = 0; } }

  if (G.shakeTimer > 0) {
    G.shakeTimer -= dt;
    const shakeDuration = G.shakeDuration || 0.2;
    const t = Math.max(0, G.shakeTimer / shakeDuration); // 1 -> 0 decay
    const intensity = (G.shakeIntensity || 6) * t;
    G.shakeX = rand(-intensity, intensity);
    G.shakeY = rand(-intensity, intensity);
    if (G.shakeTimer <= 0) { G.shakeX = 0; G.shakeY = 0; }
  }

  G.vignetteAlpha = G.player.hp === 1 ? 0.10 + 0.05 * Math.sin(Date.now() / 1000 * Math.PI * 2) : 0;
  if (G.collectFlashTimer > 0) { G.collectFlashTimer -= dt; G.collectFlashAlpha = Math.max(0, G.collectFlashAlpha * (G.collectFlashTimer / 0.1)); }
  if (G.waveClearFlashTimer > 0) G.waveClearFlashTimer -= dt;
  if (G.waveStartFlash > 0) G.waveStartFlash -= dt;
  if (G.shardHudPulse > 0) G.shardHudPulse -= dt;

  // Boss intro card state
  if (G.state === STATE.BOSS_INTRO_CARD) {
    updateBossIntro(dt);
    updateParticles(dt); updateFloatTexts(dt); updateCombatTexts(dt);
    updateToasts(dt);
    return;
  }

  // Boss ready screen (wait for player input)
  if (G.state === STATE.BOSS_READY) {
    updateBossReady(dt);
    updateParticles(dt); updateFloatTexts(dt); updateCombatTexts(dt);
    updateToasts(dt);
    return;
  }

  // Boss tutorial overlay (first encounter)
  if (G.state === STATE.BOSS_TUTORIAL) {
    updateBossTutorial(dt);
    return;
  }

  if (G.state === STATE.WAVE_BREAK) {
    // Lazy init transition if not yet initialized (e.g. from resetGameState)
    // Skip if this is a pre-card-select pause (no visual transition needed)
    if (G.waveTransitionInitialBreak === 0 && G.waveBreakTimer > 0 && !G.pendingPowerSelect) {
      initWaveTransition(G.waveBreakTimer);
    }

    // Break timer countdown
    G.waveBreakTimer -= dt;

    // Compute wave transition scroll offset
    if (G.waveTransitionInitialBreak > 0) {
      const initialBreak = G.waveTransitionInitialBreak;
      const transDur = getWaveTransitionDuration(initialBreak);
      const elapsed = initialBreak - G.waveBreakTimer;
      if (transDur > 0 && elapsed <= transDur) {
        const rawProgress = Math.min(1, elapsed / transDur);
        const eased = easeInOutCubic(rawProgress);
        const scrollDist = getWaveTransitionScrollDist(G.wave + 1);
        G.waveTransitionOffset = eased * scrollDist;
        // Drive grid crossfade with scroll progress
        updateGridCrossfade(dt, rawProgress);
      }
    }

    // Update wave announce timer during scroll
    if (G.waveTransitionAnnounce) G.waveTransitionAnnounce.timer += dt;

    // Update lore snippet and endless entry message timing
    updateLoreSnippet(dt);
    updateEndlessEntryMessage(dt);
    updateAmbientParticles(dt);
    updateAmbientShapes(dt);
    updateParallaxDots(dt);

    if (G.waveBreakTimer <= 0) {
      // Pre-card-select pause: show powerup cards now
      if (G.pendingPowerSelect) {
        G.pendingPowerSelect = false;
        transitionToPowerSelect();
        return;
      }

      G.waveTransitionOffset = 0;
      G.waveTransitionInitialBreak = 0;
      G.waveTransitionAnnounce = null;
      // Brief white screen flash when scroll completes and new wave starts
      G.waveStartFlash = 0.1;
      G.loreSnippet = null;
      applyWaveStartPowers();
      resetWaveCounters();

      // Clear any remaining pickups — they don't carry forward between waves
      G.powerUps = [];
      G.boostPickups = [];
      G.shardPickups = [];

      // Finalize arena modifiers and proceed to next wave/boss
      const nextWave = G.wave + 1;
      const obstaclesAlreadyPlaced = G.waveTransitionSlideIn;
      if (obstaclesAlreadyPlaced) {
        // Obstacles were placed early and offset — fix positions to target
        offsetAllObstacleY(H);
        G.waveTransitionSlideIn = false;
      }
      if (isBossWave(nextWave) && (nextWave <= 30 || G.isEndlessRun)) {
        G.wave++;
        if (!obstaclesAlreadyPlaced) updateArenaModifiersForWave(G.wave);
        startBossIntro(G.wave);
        return;
      }
      if (!obstaclesAlreadyPlaced) updateArenaModifiersForWave(nextWave);
      startNextWave();
    }

    updateDashCharge(dt); updatePlayer(dt); updateEnemies(dt); updateParticles(dt);
    updatePowerUps(dt); updateBoostPickups(dt); updateShardPickups(dt);
    updateDashPreview();
    { const p = G.player; setPlayerActivity(Math.sqrt(p.vx*p.vx+p.vy*p.vy)/400, p.hp/p.maxHp); }
    updateFloatTexts(dt); updateShockwaves(dt); updateThunderTrails(dt); updateAfterimages(dt);

    // Spawn physics-style afterimage trail during wave transition scroll
    // Afterimages placed at player's effective world-Y so they trail below the viewport-fixed player
    if (G.waveTransitionOffset > 0 && G.player) {
      const trailColor = G.player.surgeActive ? '#ff4444' :
        (G.player.overdriveTimer > 0 ? '#ff0000' : '#00ffff');
      pushCapped(G.afterimages, {
        x: G.player.x, y: G.player.y - G.waveTransitionOffset,
        r: G.player.r, alpha: 0.5, life: 0.15, color: trailColor, maxAlpha: 0.5
      }, FX_AFTERIMAGE_LIMIT);
    }
    updateWallFlashes(dt); updateCollectRings(dt); updateMultiPopExplosions(dt);
    updateTapBounceRipples(dt); updateCombatTexts(dt);
    updateToasts(dt);
    return;
  }

  G.elapsedTime += dt;

  // Boss clear pause (after defeating a boss)
  if (G.bossClearPause > 0) {
    const clearResult = updateBossClearPause(dt);
    if (clearResult === 'victory' && G.lastBossResult) {
      enterBossEpilogueRoom(G.lastBossResult.bossWave, G.lastBossResult.bossType);
      G.lastBossResult = null;
    } else if (clearResult === 'cleared' && G.lastBossResult) {
      enterChapterReturnRoom(G.lastBossResult.bossWave, G.lastBossResult.bossType);
      G.lastBossResult = null;
    }
    updateParticles(dt); updateFloatTexts(dt); updateShockwaves(dt); updateThunderTrails(dt);
    updateAfterimages(dt); updateCombatTexts(dt);
    return;
  }

  // Boss fight update
  if (G.state === STATE.BOSS_FIGHT) {
    updateBoss(dt);
    // Boss is defeated — check handled inside updateBoss/hitBoss
  }

  // Normal wave spawning (not during boss fights)
  if (G.state === STATE.PLAYING) {
    G.waveTimer += dt;
    if (!window.__DEBUG_PAUSE_SPAWNS) updateBurstSpawning(dt, (type) => spawnEnemy(type));
  }

  // Overdrive timer
  if (G.player.overdriveTimer > 0) {
    G.player.overdriveTimer -= dt;
  }

  // Shell Guard orb rotation, cooldown, and respawn
  if (G.player.shellGuardOrbs) {
    const orbSpeed = Math.PI; // 1 rev per 2s
    for (const orb of G.player.shellGuardOrbs) {
      orb.angle += orbSpeed * dt;
      if (orb.killCooldown > 0) orb.killCooldown -= dt;
      if (!orb.alive && orb.respawnTimer > 0) {
        orb.respawnTimer -= dt;
        if (orb.respawnTimer <= 0) {
          const power = G.player.powers.find(p => p.id === 'shellGuard' || p.id === 'novaCore');
          if (power) {
            const canRespawn = power.id === 'novaCore' || (power.id === 'shellGuard' && POWER_DEFS.shellGuard.levels[power.level - 1].respawn);
            if (canRespawn) {
              orb.alive = true;
              orb.killCooldown = 0.3;
            }
          }
        }
      }
    }
  }

  // Shield passive charge regeneration
  const shieldPower = G.player.powers.find(p => p.id === 'shield' || p.id === 'reflectiveShield');
  if (shieldPower) {
    const shieldVals = shieldPower.id === 'reflectiveShield'
      ? POWER_DEFS.shield.levels[2]
      : POWER_DEFS.shield.levels[shieldPower.level - 1];
    if (G.player.shieldCharges < shieldVals.charges) {
      G.player.shieldRegenTimer = (G.player.shieldRegenTimer || 0) + dt;
      if (G.player.shieldRegenTimer >= shieldVals.regenTime) {
        G.player.shieldCharges++;
        G.player.shieldRegenTimer = 0;
        spawnParticles(G.player.x, G.player.y, '#4488ff', 4);
        spawnCombatText('SHIELD+', G.player.x, G.player.y - 30, { size: 14, color: '#44ddff' });
      }
    } else {
      G.player.shieldRegenTimer = 0;
    }
  }

  // Wave clear check (only for PLAYING state, not boss fights)
  // Queue must also be empty for wave to clear
  if (G.state === STATE.PLAYING && G.waveEnemiesLeft <= 0 &&
      (!G.spawnQueue || G.spawnQueue.length === 0) &&
      G.enemies.every(e => !e.alive || e.isFusing)) {
    G.waveClearFlashTimer = 1.0;
    clearBoostsOnWaveEnd();
    const bonus = 500 * G.wave;
    G.score += bonus;
    spawnCombatText('+' + bonus + ' CLEAR!', W / 2, H / 2 - 40, { size: 24, color: '#00ccff', bold: true, life: 1.2, hold: true });
    events.emit('waveCleared', { wave: G.wave, bonus });

    if (G.player.hp < G.player.maxHp) {
      G.player.hp++;
      spawnCombatText('+1 HP', G.player.x, G.player.y - 30, { size: 16, color: '#44ff44', bold: true });
    }

    // Check if next wave is a boss wave → go to boss intro
    const nextWave = G.wave + 1;
    if (isBossWave(nextWave)) {
      if (nextWave <= 30 || G.isEndlessRun) {
        if (nextWave <= 30) {
          enterBossApproachRoom(nextWave);
        } else {
          // Endless bosses continue using the direct flow.
          G.state = STATE.WAVE_BREAK;
          setMusicState('wave_break');
          G.waveBreakTimer = 0.3;
          initWaveTransition(0.3);
        }
      } else {
        // No endless mode — brief pause then power select
        G.pendingPowerSelect = true;
        G.state = STATE.WAVE_BREAK;
        setMusicState('wave_break');
        G.waveBreakTimer = 1.5;
      }
    } else {
      // Brief pause before showing powerup cards
      G.pendingPowerSelect = true;
      G.state = STATE.WAVE_BREAK;
      setMusicState('wave_break');
      G.waveBreakTimer = 1.5;
    }
  }

  // Boss fight wave clear check — safety net for boss killed outside defeatBoss
  if (G.state === STATE.BOSS_FIGHT && G.boss && !G.boss.alive && G.bossClearPause <= 0) {
    defeatBoss(G.boss);
  }

  updateDashCharge(dt); updatePlayer(dt); updateEnemies(dt); updatePowerUps(dt); updateParticles(dt);
  { const p = G.player; setPlayerActivity(Math.sqrt(p.vx*p.vx+p.vy*p.vy)/400, p.hp/p.maxHp); }
  updateFloatTexts(dt); updateShockwaves(dt); updateThunderTrails(dt); updateAfterimages(dt);
  updateWallFlashes(dt); updateCollectRings(dt); updateMultiPopExplosions(dt);
  updateTapBounceRipples(dt); updateCombatTexts(dt);
  updateArenaModifiers(dt);
  updateBoostPickups(dt); updateActiveBoost(dt); updateShardPickups(dt);
  updateDashPreview();
  updateAmbientParticles(dt);
  updateAmbientShapes(dt);
  // Init parallax dots if not yet created (e.g. after resetGameState)
  if (!G.waveTransitionParallaxDots || G.waveTransitionParallaxDots.length === 0) initParallaxDots();
  updateParallaxDots(dt);
  updateToasts(dt);
  checkShockwaveCollisions();
  checkThunderTrailCollisions();
  checkShellGuardCollisions();
  checkCollisions();
}

// --- Title Screen ---
function drawTitleScreen() {
  const isTouchDev = isTouchUILayout();
  ctx.save();
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.3;
  ctx.drawImage(gridCanvas, 0, 0);
  ctx.globalAlpha = 1;

  drawTitleBackground();

  const titleGrad = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, 300);
  titleGrad.addColorStop(0, 'rgba(0, 255, 255, 0.08)');
  titleGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = titleGrad;
  ctx.fillRect(0, 0, W, H);

  const titlePulse = 14 + 6 * Math.sin(Date.now() / 800 * Math.PI);
  drawGlowText('BOUNCE BLITZ', W / 2, H * 0.255, 'bold 60px ' + FONT, '#ffffff', '#00ffff', titlePulse);
  drawGlowText('LAST COURIER', W / 2, H * 0.335, 'bold 24px ' + FONT, '#ffd58f', '#ff9f66', 10);

  ctx.save();
  ctx.font = 'bold 16px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#b8c8df';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 6;
  ctx.fillText('The core is still active. You are the last courier in range.', W / 2, H * 0.39);
  ctx.restore();

  if (G.highScore > 0) {
    drawGlowText('HIGH SCORE: ' + formatScore(G.highScore), W / 2, H * 0.455, 'bold 22px ' + FONT, '#ffdd00', '#ffaa00', 6);
  }

  // Shard count with shimmer glow
  if (G.meta.shards > 0) {
    const shardText = '✦ ' + G.meta.shards + (G.meta.shards === 1 ? ' Shard' : ' Shards');
    const shimmerT = Date.now() / 1200;
    const shimmerGlow = 4 + 8 * (0.5 + 0.5 * Math.sin(shimmerT * Math.PI * 2));
    const shimmerAlpha = 0.6 + 0.4 * Math.sin(shimmerT * Math.PI * 2 + 1);
    ctx.save();
    ctx.font = 'bold 16px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = `rgba(255, 200, 50, ${shimmerAlpha})`;
    ctx.shadowBlur = shimmerGlow;
    ctx.fillStyle = '#ffdd44';
    ctx.fillText(shardText, W / 2, isTouchDev ? H * 0.49 : H * 0.515);
    ctx.shadowBlur = 0;
    ctx.fillText(shardText, W / 2, isTouchDev ? H * 0.49 : H * 0.515);
    ctx.restore();
  }

  const panelW = isTouchDev ? 500 : 420;
  const panelX = W / 2 - panelW / 2;
  const panelY = isTouchDev ? H * 0.575 : H * 0.595;
  const panelH = hasSavedRun() ? (isTouchDev ? 266 : 246) : (isTouchDev ? 220 : 192);

  ctx.save();
  ctx.fillStyle = 'rgba(8, 12, 22, 0.66)';
  ctx.beginPath();
  ctx.roundRect(panelX, panelY - 26, panelW, panelH, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(70, 160, 220, 0.26)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  const playRect = { x: W / 2 - (isTouchDev ? 190 : 162), y: panelY - 8, w: isTouchDev ? 380 : 324, h: isTouchDev ? 62 : 50 };
  G._titlePlayBtnRect = playRect;
  drawMenuButton(playRect, 'Play', {
    hovered: G._titleHoverAction === 'play',
    accent: '#00eaff',
    sublabel: isTouchDev ? 'Tap to start' : 'Click or press any key',
    prominent: true,
  });

  let lowerButtonsY = playRect.y + playRect.h + 12;
  if (hasSavedRun()) {
    const continueRect = { x: W / 2 - (isTouchDev ? 190 : 162), y: lowerButtonsY, w: isTouchDev ? 380 : 324, h: isTouchDev ? 52 : 42 };
    G._titleContinueBtnRect = continueRect;
    drawMenuButton(continueRect, 'Continue Run', {
      hovered: G._titleHoverAction === 'continue',
      accent: '#00ffcc',
      sublabel: isTouchDev ? 'Tap to continue' : 'Hotkey C',
    });
    lowerButtonsY += isTouchDev ? 62 : 54;
  } else {
    G._titleContinueBtnRect = null;
  }

  const smallW = isTouchDev ? 176 : 148;
  const smallH = isTouchDev ? 52 : 40;
  const smallGap = isTouchDev ? 16 : 12;
  const smallX = W / 2 - (smallW * 2 + smallGap) / 2;
  const secondary = [
    { id: 'upgrades', label: 'Upgrades', key: 'U', x: smallX, y: lowerButtonsY, accent: '#ffd24a' },
    { id: 'loadout', label: 'Loadout', key: 'L', x: smallX + smallW + smallGap, y: lowerButtonsY, accent: '#7fe6ff' },
    { id: 'glossary', label: 'Codex', key: 'G', x: smallX, y: lowerButtonsY + smallH + 10, accent: '#c98cff' },
    { id: 'settings', label: 'Settings', key: 'S', x: smallX + smallW + smallGap, y: lowerButtonsY + smallH + 10, accent: '#9ab4ff' },
  ];
  for (const btn of secondary) {
    const rect = { x: btn.x, y: btn.y, w: smallW, h: smallH };
    G['_title' + btn.id.charAt(0).toUpperCase() + btn.id.slice(1) + 'BtnRect'] = rect;
    drawMenuButton(rect, btn.label, {
      hovered: G._titleHoverAction === btn.id,
      accent: btn.accent,
      sublabel: isTouchDev ? '' : 'Hotkey ' + btn.key,
    });
  }

  // Selected loadout
  const loadout = LOADOUTS.find(l => l.id === G.meta.selectedLoadout) || LOADOUTS[0];
  ctx.save();
  ctx.font = (isTouchDev ? '14px ' : '13px ') + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#95cfd5';
  ctx.fillText('Current loadout: ' + loadout.name, W / 2, panelY + panelH - 26 + 22);
  ctx.restore();

  ctx.restore();
}

// --- Settings Screen ---
function drawSettingsScreen() {
  const isTouchDev = isTouchUILayout();
  ctx.save();
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.3;
  ctx.drawImage(gridCanvas, 0, 0);
  ctx.globalAlpha = 1;

  // Title
  drawGlowText('SETTINGS', W / 2, 80, 'bold 36px ' + FONT, '#ffffff', '#00ffff', 10);

  // Layout
  const sliderW = isTouchDev ? 380 : 300;
  const sliderH = isTouchDev ? 14 : 12;
  const knobR = isTouchDev ? 12 : 10;
  const labelX = W / 2 - sliderW / 2;
  const sliderX = labelX;
  const startY = isTouchDev ? 160 : 180;
  const rowH = isTouchDev ? 82 : 90;
  const cursor = G._settingsCursor;

  const musicVol = getMusicVolume();
  const sfxVol = getSfxVolume();
  const muted = isMuted();

  // Store slider rects for click detection
  G._settingsSliderRects = [];

  // --- Music Volume ---
  const musicY = startY;
  const musicSelected = cursor === 0;
  ctx.save();
  ctx.font = 'bold 16px ' + FONT;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = musicSelected ? '#00ffff' : '#aaaacc';
  ctx.fillText('Music Volume', sliderX, musicY);
  ctx.font = '14px ' + FONT;
  ctx.textAlign = 'right';
  ctx.fillText(Math.round(musicVol * 100) + '%', sliderX + sliderW, musicY);
  ctx.restore();
  // Track
  const musicTrackY = musicY + 30;
  ctx.save();
  ctx.fillStyle = '#222233';
  ctx.beginPath();
  ctx.roundRect(sliderX, musicTrackY - sliderH / 2, sliderW, sliderH, sliderH / 2);
  ctx.fill();
  // Fill
  const musicFillW = musicVol * sliderW;
  ctx.fillStyle = musicSelected ? '#00dddd' : '#007788';
  ctx.beginPath();
  ctx.roundRect(sliderX, musicTrackY - sliderH / 2, musicFillW, sliderH, sliderH / 2);
  ctx.fill();
  // Knob
  const musicKnobX = sliderX + musicFillW;
  if (musicSelected) {
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 12;
  }
  ctx.fillStyle = musicSelected ? '#00ffff' : '#aaaacc';
  ctx.beginPath();
  ctx.arc(musicKnobX, musicTrackY, knobR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
  G._settingsSliderRects.push({ x: sliderX, y: musicTrackY - 16, w: sliderW, h: 32 });

  // --- SFX Volume ---
  const sfxY = startY + rowH;
  const sfxSelected = cursor === 1;
  ctx.save();
  ctx.font = 'bold 16px ' + FONT;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = sfxSelected ? '#00ffff' : '#aaaacc';
  ctx.fillText('SFX Volume', sliderX, sfxY);
  ctx.font = '14px ' + FONT;
  ctx.textAlign = 'right';
  ctx.fillText(Math.round(sfxVol * 100) + '%', sliderX + sliderW, sfxY);
  ctx.restore();
  // Track
  const sfxTrackY = sfxY + 30;
  ctx.save();
  ctx.fillStyle = '#222233';
  ctx.beginPath();
  ctx.roundRect(sliderX, sfxTrackY - sliderH / 2, sliderW, sliderH, sliderH / 2);
  ctx.fill();
  // Fill
  const sfxFillW = sfxVol * sliderW;
  ctx.fillStyle = sfxSelected ? '#00dddd' : '#007788';
  ctx.beginPath();
  ctx.roundRect(sliderX, sfxTrackY - sliderH / 2, sfxFillW, sliderH, sliderH / 2);
  ctx.fill();
  // Knob
  const sfxKnobX = sliderX + sfxFillW;
  if (sfxSelected) {
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 12;
  }
  ctx.fillStyle = sfxSelected ? '#00ffff' : '#aaaacc';
  ctx.beginPath();
  ctx.arc(sfxKnobX, sfxTrackY, knobR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
  G._settingsSliderRects.push({ x: sliderX, y: sfxTrackY - 16, w: sliderW, h: 32 });

  // --- Mute Toggle ---
  const muteY = startY + rowH * 2 + 10;
  const muteSelected = cursor === 2;
  const muteBtnW = isTouchDev ? 260 : 200, muteBtnH = isTouchDev ? 46 : 40;
  const muteBtnX = W / 2 - muteBtnW / 2;
  const muteHover = muteSelected || G._settingsHoverMute;
  ctx.save();
  if (muteHover) {
    ctx.shadowColor = muted ? '#ff4466' : '#00ffaa';
    ctx.shadowBlur = 14;
  }
  ctx.fillStyle = muted
    ? (muteHover ? '#4f1f1f' : '#3a1a1a')
    : (muteHover ? '#1f4f35' : '#1a3a2a');
  ctx.beginPath();
  ctx.roundRect(muteBtnX, muteY, muteBtnW, muteBtnH, 6);
  ctx.fill();
  ctx.strokeStyle = muted
    ? (muteHover ? '#ff6688' : '#ff4466')
    : (muteHover ? '#44ffcc' : '#00ffaa');
  ctx.lineWidth = muteHover ? 3 : 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = 'bold 16px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = muted
    ? (muteHover ? '#ff6688' : '#ff4466')
    : (muteHover ? '#44ffcc' : '#00ffaa');
  ctx.fillText(isTouchDev ? (muted ? 'Unmute' : 'Mute') : (muted ? 'Unmute (M)' : 'Mute (M)'), muteBtnX + muteBtnW / 2, muteY + muteBtnH / 2);
  ctx.restore();
  G._settingsMuteBtnRect = { x: muteBtnX, y: muteY, w: muteBtnW, h: muteBtnH };

  // --- Back Button ---
  const backY = muteY + muteBtnH + (isTouchDev ? 28 : 40);
  const backBtnW = isTouchDev ? 220 : 160, backBtnH = isTouchDev ? 46 : 40;
  const backBtnX = W / 2 - backBtnW / 2;
  const backHover = G._settingsHoverBack;
  ctx.save();
  if (backHover) {
    ctx.shadowColor = '#aaaaff';
    ctx.shadowBlur = 14;
  }
  ctx.fillStyle = backHover ? '#2a2a44' : '#1a1a2e';
  ctx.beginPath();
  ctx.roundRect(backBtnX, backY, backBtnW, backBtnH, 6);
  ctx.fill();
  ctx.strokeStyle = backHover ? '#aaaaff' : '#6666aa';
  ctx.lineWidth = backHover ? 3 : 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = 'bold 16px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = backHover ? '#aaaaff' : '#6666aa';
  ctx.fillText(isTouchDev ? 'Back' : 'Back (Esc)', backBtnX + backBtnW / 2, backY + backBtnH / 2);
  ctx.restore();
  G._settingsBackBtnRect = { x: backBtnX, y: backY, w: backBtnW, h: backBtnH };

  if (!isTouchDev) {
    // Privacy / terms note for platform review surfaces
    ctx.save();
    ctx.font = '12px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#6f7f9c';
    ctx.fillText('Privacy: settings and progress are saved on this device and via platform cloud save where supported.', W / 2, H - 86);
    ctx.fillText('Terms & privacy details are available on the platform page hosting the game.', W / 2, H - 68);
    ctx.restore();

    ctx.save();
    ctx.font = '13px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#444466';
    ctx.fillText('W/S or Up/Down to select · A/D or Left/Right to adjust', W / 2, H - 50);
    ctx.restore();
  }

  ctx.restore();
}

// --- Mode Selection Screen ---
function drawModeSelectScreen() {
  const isTouchDev = isTouchUILayout();
  ctx.save();
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.3;
  ctx.drawImage(gridCanvas, 0, 0);
  ctx.globalAlpha = 1;

  // Title
  drawGlowText('SELECT MODE', W / 2, 120, 'bold 36px ' + FONT, '#ffffff', '#aaaaff', 10);

  // Card dimensions
  const cardW = 260, cardH = 280;
  const storyX = 260, endlessX = 540;
  const cardY = 320;
  const cursor = G.modeSelectCursor;

  // Draw each card
  for (let i = 0; i < 2; i++) {
    const cx = i === 0 ? storyX : endlessX;
    const isHovered = cursor === i;
    const color = i === 0 ? '#00ffcc' : '#ffdd44';
    const label = i === 0 ? 'STORY' : 'ENDLESS';
    const desc = i === 0
      ? '30-wave campaign\n3 boss fights\nReach the core'
      : 'Survive past Wave 30\nRotating late-game cycles\nHow long can you last?';

    ctx.save();
    const drawX = cx - cardW / 2;
    const drawY = cardY - cardH / 2;

    if (isHovered) {
      const scale = 1.03;
      ctx.translate(cx, cardY);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cardY);
    }

    // Card background
    ctx.fillStyle = 'rgba(20, 20, 40, 0.9)';
    ctx.beginPath();
    ctx.roundRect(drawX, drawY, cardW, cardH, 8);
    ctx.fill();

    // Card border
    ctx.strokeStyle = isHovered ? '#ffffff' : color;
    ctx.lineWidth = isHovered ? 3 : 2;
    if (isHovered) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
    }
    ctx.beginPath();
    ctx.roundRect(drawX, drawY, cardW, cardH, 8);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Hover bg fill
    if (isHovered) {
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(drawX, drawY, cardW, cardH, 8);
      ctx.fill();
      ctx.restore();
    }

    // Mode icon (large circle)
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(cx, cardY - 60, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Mode label
    ctx.font = 'bold 28px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.fillText(label, cx, cardY + 10);
    ctx.shadowBlur = 0;

    // Description
    ctx.font = '14px ' + FONT;
    ctx.fillStyle = '#888899';
    const lines = desc.split('\n');
    for (let li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], cx, cardY + 50 + li * 20);
    }

    ctx.restore();
  }

  // Input hints
  ctx.save();
  ctx.font = '14px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#444444';
  ctx.fillText(
    isTouchDev
      ? 'Tap a mode to start · Use the top-left Back button to return'
      : 'A/D or ←→ to select · Enter to confirm · ESC to go back',
    W / 2,
    H - 40
  );
  ctx.restore();

  ctx.restore();
}

// --- Run Summary Screen ---
function drawRunSummary() {
  ctx.save();
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, W, H);
  const isTouchDev = isTouchUILayout();
  const s = G.runSummary;
  if (s && s.isHardcore) {
    ctx.fillStyle = 'rgba(100, 10, 10, 0.3)';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 0.3;
  ctx.drawImage(gridCanvas, 0, 0);
  ctx.globalAlpha = 1;

  if (!s) { ctx.restore(); return; }

  // --- Helpers ---
  const drawSeparator = (sy) => {
    const grad = ctx.createLinearGradient(W * 0.2, sy, W * 0.8, sy);
    grad.addColorStop(0, 'rgba(140, 140, 230, 0)');
    grad.addColorStop(0.5, 'rgba(140, 140, 230, 0.6)');
    grad.addColorStop(1, 'rgba(140, 140, 230, 0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W * 0.2, sy);
    ctx.lineTo(W * 0.8, sy);
    ctx.stroke();
  };
  const drawSectionLabel = (text, sy) => {
    ctx.font = 'bold 13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8888bb';
    ctx.fillText(text.toUpperCase(), W / 2, sy);
  };
  const drawPanel = (px, py, pw, ph, accent) => {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 14, 26, 0.76)';
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 14);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  };

  if (isTouchDev) {
    drawGlowText(s.isVictory ? 'VICTORY' : 'RUN COMPLETE', W / 2, 44, 'bold 30px ' + FONT, '#ffffff', s.isVictory ? '#ffdd44' : '#aaaaff', 10);

    let y = 82;
    const panelX = 64;
    const panelW = W - 128;

    drawPanel(panelX, y, panelW, 102, '#7e90d8');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillStyle = '#8f9fc5';
    ctx.fillText('RUN STATS', W / 2, y + 18);
    ctx.font = '19px ' + FONT;
    ctx.fillStyle = '#d6def3';
    ctx.fillText('Waves Survived: ' + s.waves, W / 2, y + 44);
    ctx.fillText('Enemies Killed: ' + s.kills, W / 2, y + 66);
    ctx.font = 'bold 24px ' + FONT;
    ctx.fillStyle = '#58d6ff';
    ctx.fillText(formatScore(Math.floor(G.runSummaryScoreCounter)), W / 2, y + 86);
    y += 118;

    if (s.powersHeld.length > 0) {
      drawPanel(panelX, y, panelW, 84, '#9f7cff');
      ctx.font = 'bold 13px ' + FONT;
      ctx.fillStyle = '#9f7cff';
      ctx.fillText('POWERS EARNED', W / 2, y + 18);
      const shown = s.powersHeld.slice(0, 4);
      const slotW = 108;
      let px = W / 2 - ((shown.length - 1) * slotW) / 2;
      for (const p of shown) {
        drawPowerIcon(p.icon, p.shape, px, y + 46, 18);
        ctx.font = '11px ' + FONT;
        ctx.fillStyle = '#d6def3';
        ctx.fillText(p.name, px, y + 70);
        px += slotW;
      }
      y += 100;
    }

    drawPanel(panelX, y, panelW, 132, '#66cfff');
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillStyle = '#8fdcff';
    ctx.fillText('SHARD BREAKDOWN', W / 2, y + 18);
    const shardLines = [
      { text: 'Collected +' + s.collectedShards, color: '#00E5FF' },
      { text: 'Wave Bonus +' + s.waveShards, color: '#b9c5d6' },
      { text: 'Score Bonus +' + s.scoreShards, color: '#b9c5d6' },
    ];
    if (s.recordShards > 0) shardLines.push({ text: 'New Record +' + s.recordShards, color: '#ffdd44' });
    if (s.bossShards > 0) shardLines.push({ text: 'Bosses +' + s.bossShards, color: '#ffdd44' });
    if (s.hasShardMagnet) shardLines.push({ text: 'Shard Magnet x1.25', color: '#ffdd44' });
    if (s.isHardcore) shardLines.push({ text: 'Hardcore x1.75', color: '#ff8899' });
    for (let i = 0; i < Math.min(5, shardLines.length); i++) {
      ctx.font = '15px ' + FONT;
      ctx.fillStyle = shardLines[i].color;
      ctx.fillText(shardLines[i].text, W / 2, y + 44 + i * 16);
    }
    y += 148;

    const totalPanelH = s.endlessUnlocked ? 92 : 74;
    drawPanel(panelX, y, panelW, totalPanelH, '#ffdd44');
    if (s.endlessUnlocked) {
      ctx.font = 'bold 15px ' + FONT;
      ctx.fillStyle = '#ffdd44';
      ctx.fillText('Endless Mode Unlocked!', W / 2, y + 18);
    }
    ctx.font = 'bold 28px ' + FONT;
    ctx.fillStyle = '#ffdd44';
    ctx.fillText('Shards Earned: ' + Math.floor(G.runSummaryShardCounter), W / 2, y + (s.endlessUnlocked ? 48 : 32));
    ctx.font = '16px ' + FONT;
    ctx.fillStyle = '#9da6b7';
    ctx.fillText('Total Shards: ' + G.meta.shards, W / 2, y + (s.endlessUnlocked ? 72 : 54));

    for (const p of G.summaryParticles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (G.runSummaryReady) {
      const contPulse = 0.4 + 0.6 * Math.sin(Date.now() / 600 * Math.PI);
      ctx.save();
      ctx.globalAlpha = contPulse;
      ctx.font = '15px ' + FONT;
      ctx.fillStyle = '#7f8a9f';
      ctx.fillText(canShowRelayChamber() ? 'Tap to return to the relay' : 'Tap to continue', W / 2, H - 20);
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  // --- Title ---
  let y = 48;
  if (s.isVictory) {
    drawGlowText('VOID WARDEN DEFEATED!', W / 2, y, 'bold 28px ' + FONT, '#ffdd44', '#ffdd44', 12);
    y += 32;
  }
  if (s.isHardcore) {
    drawGlowText('HARDCORE RUN COMPLETE', W / 2, y, 'bold 30px ' + FONT, '#cc2222', '#cc2222', 10);
  } else {
    drawGlowText('RUN COMPLETE', W / 2, y, 'bold 34px ' + FONT, '#ffffff', '#aaaaff', 8);
  }
  y += 24;

  // === Section 1: Run Stats ===
  drawSeparator(y); y += 10;
  drawSectionLabel('Run Stats', y); y += 14;
  const statsPanelY = y - 4;
  drawPanel(W * 0.22, statsPanelY, W * 0.56, 84, '#7e90d8');

  ctx.font = '18px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#d6def3';
  ctx.fillText('Waves Survived: ' + s.waves, W / 2, statsPanelY + 24);
  ctx.fillText('Enemies Killed: ' + s.kills, W / 2, statsPanelY + 46);
  ctx.fillStyle = '#58d6ff';
  ctx.font = 'bold 20px ' + FONT;
  ctx.fillText('Final Score: ' + formatScore(Math.floor(G.runSummaryScoreCounter)), W / 2, statsPanelY + 68);
  y = statsPanelY + 92;

  // === Section 2: Powers Earned ===
  if (s.powersHeld.length > 0) {
    drawSeparator(y); y += 10;
    drawSectionLabel('Powers Earned', y); y += 14;
    const powersPanelY = y - 4;
    const powersPanelH = s.powersHeld.length <= 2 ? 70 : 82;
    drawPanel(W * 0.22, powersPanelY, W * 0.56, powersPanelH, '#9f7cff');

    const iconR = 18; // 36px diameter
    const slotW = Math.min(68, ((W * 0.56) - 48) / Math.max(1, s.powersHeld.length)); // space per power (icon + label)
    const totalPW = s.powersHeld.length * slotW;
    let px = W / 2 - totalPW / 2 + slotW / 2;
    const iconCY = powersPanelY + (s.powersHeld.length <= 2 ? 24 : 26);
    for (const p of s.powersHeld) {
      drawPowerIcon(p.icon, p.shape, px, iconCY, iconR);
      // Label below icon
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#cbd2e2';
      ctx.fillText(p.name, px, iconCY + iconR + 5);
      px += slotW;
    }
    y = powersPanelY + powersPanelH + 10;
  }

  // === Section 3: Shard Breakdown ===
  drawSeparator(y); y += 10;
  drawSectionLabel('Shard Breakdown', y); y += 14;
  const shardPanelY = y - 4;
  const shardLineH = 16;
  let shardPanelH = 96;
  if (s.recordShards > 0) shardPanelH += shardLineH;
  if (s.bossShards > 0) shardPanelH += shardLineH;
  if (s.hasShardMagnet) shardPanelH += shardLineH;
  if (s.isHardcore) shardPanelH += shardLineH + (s.hardcoreMilestoneBonus > 0 ? shardLineH : 0) + (s.hardcoreFirstClearBonus > 0 ? 20 : 0);
  drawPanel(W * 0.22, shardPanelY, W * 0.56, shardPanelH, '#66cfff');

  y = shardPanelY + 20;
  ctx.font = '14px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#00E5FF';
  ctx.fillText('Shards Collected: +' + s.collectedShards, W / 2, y); y += shardLineH;
  ctx.fillStyle = '#aaaaaa';
  ctx.fillText('Wave Bonus: +' + s.waveShards, W / 2, y); y += shardLineH;
  ctx.fillText('Score Bonus: +' + s.scoreShards, W / 2, y); y += shardLineH;
  if (s.recordShards > 0) {
    ctx.fillStyle = '#ffdd44';
    ctx.fillText('New Record: +' + s.recordShards, W / 2, y); y += shardLineH;
  }
  if (s.bossShards > 0) {
    ctx.fillStyle = '#ffdd44';
    ctx.fillText('Bosses: +' + s.bossShards, W / 2, y); y += shardLineH;
  }
  if (s.hasShardMagnet) {
    ctx.fillStyle = '#ffdd44';
    ctx.fillText('Shard Magnet: x1.25', W / 2, y); y += shardLineH;
  }
  if (s.isHardcore) {
    ctx.fillStyle = '#cc2222';
    ctx.fillText('Hardcore: x1.75', W / 2, y); y += shardLineH;
    if (s.hardcoreMilestoneBonus > 0) {
      ctx.fillStyle = '#cc2222';
      ctx.fillText('Wave Milestone: +' + s.hardcoreMilestoneBonus, W / 2, y); y += shardLineH;
    }
    if (s.hardcoreFirstClearBonus > 0) {
      ctx.fillStyle = '#ffdd44';
      ctx.font = 'bold 15px ' + FONT;
      ctx.fillText('FIRST HARDCORE CLEAR: +500!', W / 2, y); y += 20;
      ctx.font = '14px ' + FONT;
    }
  }
  y = shardPanelY + shardPanelH + 10;

  // Total shards (animated counter)
  drawSeparator(y); y += 12;
  drawPanel(W * 0.22, y - 12, W * 0.56, s.endlessUnlocked ? 84 : 64, '#ffdd44');
  if (s.endlessUnlocked) {
    const unlockPulse = 0.72 + 0.28 * Math.sin(Date.now() / 400 * Math.PI);
    ctx.save();
    ctx.globalAlpha = unlockPulse;
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillStyle = '#ffdd44';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Endless Mode Unlocked!', W / 2, y + 2);
    ctx.restore();
    y += 20;
  }
  ctx.font = 'bold 24px ' + FONT;
  ctx.fillStyle = '#ffdd44';
  ctx.shadowColor = '#ffdd44';
  ctx.shadowBlur = 6;
  ctx.fillText('Shards Earned: ' + Math.floor(G.runSummaryShardCounter), W / 2, y + 6);
  ctx.shadowBlur = 0;
  y += 28;

  ctx.font = '15px ' + FONT;
  ctx.fillStyle = '#9da6b7';
  ctx.fillText('Total Shards: ' + G.meta.shards, W / 2, y + 2);
  y += 28;

  // Unlock hint
  const cheapest = getCheapestLockedUpgrade(G.meta);
  if (!s.endlessUnlocked && cheapest && G.meta.shards >= cheapest.cost) {
    y += 8;
    const hintPulse = 0.5 + 0.5 * Math.sin(Date.now() / 500 * Math.PI);
    ctx.save();
    ctx.globalAlpha = hintPulse;
    ctx.font = '14px ' + FONT;
    ctx.fillStyle = '#ffdd44';
    ctx.fillText('New upgrades available!', W / 2, y);
    ctx.restore();
  }

  // --- Victory particle burst ---
  for (const p of G.summaryParticles) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Continue prompt
  if (G.runSummaryReady) {
    const contPulse = 0.4 + 0.6 * Math.sin(Date.now() / 600 * Math.PI);
    ctx.save();
    ctx.globalAlpha = contPulse;
    ctx.font = '14px ' + FONT;
    ctx.fillStyle = '#7f8a9f';
    ctx.fillText(
      isTouchUILayout()
        ? (canShowRelayChamber() ? 'Tap to return to the relay' : 'Tap to continue')
        : (canShowRelayChamber() ? 'Press any key to return to the relay' : 'Press any key to continue'),
      W / 2,
      H - 22
    );
    ctx.restore();
  }

  ctx.restore();
}

function drawRelayChamber() {
  const isTouchDev = isTouchUILayout();
  ctx.save();
  ctx.fillStyle = '#07111a';
  ctx.fillRect(0, 0, W, H);

  const bgGlow = ctx.createRadialGradient(W * 0.74, H * 0.34, 0, W * 0.74, H * 0.34, 320);
  bgGlow.addColorStop(0, 'rgba(90, 220, 255, 0.13)');
  bgGlow.addColorStop(0.6, 'rgba(50, 100, 190, 0.05)');
  bgGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = bgGlow;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.16;
  ctx.drawImage(bgGridCanvas, 0, 0);
  ctx.globalAlpha = 0.32;
  ctx.drawImage(gridCanvas, 0, 0);
  ctx.globalAlpha = 1;

  const chamber = G.relayChamber;
  if (!chamber) { ctx.restore(); return; }

  const previewLoadout = LOADOUTS[chamber.loadoutIndex] || LOADOUTS[0];
  const selectedLoadout = LOADOUTS.find(l => l.id === G.meta.selectedLoadout) || LOADOUTS[0];
  const previewUnlocked = isLoadoutUnlocked(G.meta, previewLoadout.id);
  const previewSelected = previewLoadout.id === selectedLoadout.id;
  const lore = RELAY_LORE_LINES[chamber.loreIndex % RELAY_LORE_LINES.length];
  const ctaActions = ['runback', 'upgrades', 'menu'];
  const focusSection = chamber.focusSection || 'cta';
  const previewTheme = {
    standard: { accent: '#6ff7ff', glow: '#6ff7ff', tint: 'rgba(111,247,255,0.16)', title: 'Balanced starter' },
    glass_cannon: { accent: '#ffb27c', glow: '#ff9966', tint: 'rgba(255,153,102,0.15)', title: 'High risk, high score' },
    tank: { accent: '#81f3c2', glow: '#5bd8a0', tint: 'rgba(91,216,160,0.16)', title: 'Safer, slower build' },
    hardcore: { accent: '#ff8492', glow: '#ff5c6f', tint: 'rgba(255,92,111,0.17)', title: 'One life challenge' },
  }[previewLoadout.id] || { accent: '#6ff7ff', glow: '#6ff7ff', tint: 'rgba(111,247,255,0.16)', title: 'Balanced starter' };

  if (isTouchDev) {
    const mobilePanel = (x, y, w, h, accent, alpha = 0.84) => {
      ctx.save();
      ctx.fillStyle = `rgba(9, 14, 28, ${alpha})`;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 18);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.24;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    };
    const mobilePill = (x, y, w, label, value, accent) => {
      ctx.save();
      ctx.fillStyle = 'rgba(10, 16, 30, 0.76)';
      ctx.beginPath();
      ctx.roundRect(x, y, w, 30, 15);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.28;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '11px ' + FONT;
      ctx.fillStyle = '#8fa7c8';
      ctx.fillText(label, x + w / 2, y + 10);
      ctx.font = 'bold 14px ' + FONT;
      ctx.fillStyle = accent;
      ctx.fillText(value, x + w / 2, y + 21);
      ctx.restore();
    };
    G._relayActionRects = {};
    G._relayUpgradeRects = [];
    G._relayLoadoutRects = [];
    const mobileOverlay = chamber.mobileOverlay || null;

    drawGlowText('RELAY CHAMBER', W / 2, 40, 'bold 24px ' + FONT, '#ffffff', '#6ff7ff', 8);
    mobilePill(60, 66, 200, 'BANKED', '+' + chamber.shardGain, '#ffdd66');
    mobilePill(540, 66, 200, 'TOTAL', String(chamber.totalShards), '#6ff7ff');

    const contentTop = 126;
    const contentBottom = H - 72;
    const loreH = 62;
    const runH = 60;
    const midRowH = 50;
    const lowerRowH = 58;
    const totalBlockH = loreH + 18 + runH + 18 + midRowH + 16 + lowerRowH;
    const blockTop = Math.round(contentTop + Math.max(0, (contentBottom - contentTop - totalBlockH) / 2));
    const loreY = blockTop;
    const runY = loreY + loreH + 18;
    const midRowY = runY + runH + 18;
    const lowerRowY = midRowY + midRowH + 16;

    mobilePanel(54, loreY, 692, loreH, '#7ecbff');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 14px ' + FONT;
    ctx.fillStyle = '#dfeaff';
    ctx.fillText('The relay steadies your shell.', 74, loreY + 14);
    ctx.font = '12px ' + FONT;
    ctx.fillStyle = '#98abc4';
    ctx.fillText(lore[0], 74, loreY + 34);

    const runItBackRect = { x: 54, y: runY, w: 692, h: runH };
    const upgradesRect = { x: 54, y: midRowY, w: 338, h: midRowH };
    const menuRect = { x: 408, y: midRowY, w: 338, h: midRowH };
    const loadoutRect = { x: 54, y: lowerRowY, w: 338, h: lowerRowH };
    const quickRect = { x: 408, y: lowerRowY, w: 338, h: lowerRowH };
    G._relayActionRects = { runback: runItBackRect, upgrades: upgradesRect, loadout: loadoutRect, quick: quickRect, menu: menuRect };
    drawMenuButton(runItBackRect, 'Start Another Run', {
      hovered: G._relayHoverAction === 'runback',
      accent: '#6ff7ff',
      sublabel: '',
      prominent: true,
    });
    drawMenuButton(upgradesRect, 'Upgrades', {
      hovered: G._relayHoverAction === 'upgrades',
      accent: '#ffd86f',
      sublabel: '',
    });
    drawMenuButton(menuRect, 'Main Menu', {
      hovered: G._relayHoverAction === 'menu',
      accent: '#9ab4ff',
      sublabel: '',
    });
    drawMenuButton(loadoutRect, 'Loadout', {
      hovered: G._relayHoverAction === 'loadout' || mobileOverlay === 'loadouts',
      accent: previewTheme.accent,
      sublabel: '',
    });
    drawMenuButton(quickRect, 'Quick Spend', {
      hovered: G._relayHoverAction === 'quick' || mobileOverlay === 'quickSpend',
      accent: '#ffd86f',
      sublabel: '',
    });

    if (mobileOverlay) {
      ctx.save();
      ctx.fillStyle = 'rgba(4, 8, 18, 0.58)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      const overlayH = mobileOverlay === 'loadouts' ? 290 : 334;
      const overlayX = 54;
      const overlayW = 692;
      const overlayY = Math.round((H - overlayH) / 2);
      mobilePanel(overlayX, overlayY, overlayW, overlayH, mobileOverlay === 'loadouts' ? previewTheme.accent : '#ffd86f', 0.96);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 18px ' + FONT;
      ctx.fillStyle = mobileOverlay === 'loadouts' ? previewTheme.accent : '#ffd86f';
      ctx.fillText(mobileOverlay === 'loadouts' ? 'SELECT LOADOUT' : 'QUICK SPEND', W / 2, overlayY + 28);

      if (mobileOverlay === 'loadouts') {
        ctx.font = '12px ' + FONT;
        ctx.fillStyle = '#b7c6db';
        ctx.fillText('Current frame: ' + selectedLoadout.name, W / 2, overlayY + 52);
        for (let i = 0; i < LOADOUTS.length; i++) {
          const loadout = LOADOUTS[i];
          const x = overlayX + 28 + (i % 2) * 320;
          const y = overlayY + 78 + Math.floor(i / 2) * 86;
          const w = 316;
          const h = 72;
          const unlocked = isLoadoutUnlocked(G.meta, loadout.id);
          const selected = G.meta.selectedLoadout === loadout.id;
          const focused = focusSection === 'loadouts' && chamber.loadoutIndex === i;
          const hovered = G._relayHoverLoadoutIndex === i;
          G._relayLoadoutRects[i] = { x, y, w, h };
          ctx.save();
          ctx.fillStyle = unlocked ? 'rgba(16, 24, 40, 0.96)' : 'rgba(22, 24, 36, 0.96)';
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, 14);
          ctx.fill();
          ctx.strokeStyle = selected ? previewTheme.accent : ((focused || hovered) ? 'rgba(200,225,255,0.42)' : 'rgba(120,150,190,0.16)');
          ctx.lineWidth = selected || focused || hovered ? 2 : 1;
          ctx.stroke();
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.font = 'bold 16px ' + FONT;
          ctx.fillStyle = unlocked ? '#ffffff' : '#aeb8c8';
          ctx.fillText(loadout.name, x + 18, y + 26);
          ctx.font = '12px ' + FONT;
          ctx.fillStyle = selected ? previewTheme.accent : '#8fa2bc';
          ctx.fillText(unlocked ? (selected ? 'Equipped' : 'Tap to equip') : 'Locked', x + 18, y + 48);
          ctx.restore();
        }
      } else if (mobileOverlay === 'quickSpend') {
        const quickUpgradeIds = chamber.quickUpgradeIds || [];
        if (quickUpgradeIds.length === 0) {
          ctx.font = '14px ' + FONT;
          ctx.fillStyle = '#a7b6cb';
          ctx.fillText('No quick upgrades left here.', W / 2, overlayY + 148);
        } else {
          for (let i = 0; i < quickUpgradeIds.length; i++) {
            const upgrade = UPGRADES.find(u => u.id === quickUpgradeIds[i]);
            if (!upgrade) continue;
            const tierUnlocked = isTierUnlocked(G.meta, upgrade.tier);
            const affordable = canPurchaseUpgrade(G.meta, upgrade.id);
            const rowX = overlayX + 24;
            const rowY = overlayY + 66 + i * 58;
            const rowW = overlayW - 48;
            const rowH = 48;
            const focused = focusSection === 'upgrades' && chamber.upgradeIndex === i;
            const hovered = G._relayHoverUpgradeIndex === i;
            G._relayUpgradeRects[i] = { x: rowX, y: rowY, w: rowW, h: rowH };
            ctx.save();
            ctx.fillStyle = affordable ? 'rgba(31, 39, 58, 0.96)' : 'rgba(18, 24, 40, 0.94)';
            ctx.beginPath();
            ctx.roundRect(rowX, rowY, rowW, rowH, 12);
            ctx.fill();
            ctx.strokeStyle = affordable
              ? ((focused || hovered) ? '#ffd86f' : 'rgba(255,216,111,0.32)')
              : ((focused || hovered) ? '#8aa3c4' : 'rgba(138,163,196,0.22)');
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.font = 'bold 14px ' + FONT;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(upgrade.name, rowX + 16, rowY + 10);
            ctx.font = '11px ' + FONT;
            ctx.fillStyle = tierUnlocked ? '#92a5bf' : '#71819a';
            let effectText = affordable ? upgrade.effect : (tierUnlocked ? upgrade.effect : 'Unlock the previous tier first.');
            while (ctx.measureText(effectText).width > rowW - 190 && effectText.length > 0) effectText = effectText.slice(0, -1);
            if (effectText !== upgrade.effect && tierUnlocked) effectText += '…';
            ctx.fillText(effectText, rowX + 16, rowY + 28);
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 12px ' + FONT;
            ctx.fillStyle = affordable ? '#ffd86f' : '#8fa2bc';
            ctx.fillText(affordable ? (upgrade.cost + ' ✦') : (tierUnlocked ? 'Need more' : 'Tier locked'), rowX + rowW - 16, rowY + rowH / 2);
            ctx.restore();
          }
        }
      }
    }
    ctx.restore();
    return;
  }

  const drawPanel = (x, y, w, h, accent, alpha = 0.78) => {
    ctx.save();
    ctx.fillStyle = `rgba(9, 14, 28, ${alpha})`;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 18);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.24;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  };

  const drawHeaderPill = (x, y, w, label, value, accent) => {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 16, 30, 0.76)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, 30, 15);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.28;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '11px ' + FONT;
    ctx.fillStyle = '#8fa7c8';
    ctx.fillText(label, x + w / 2, y + 10);
    ctx.font = 'bold 14px ' + FONT;
    ctx.fillStyle = accent;
    ctx.fillText(value, x + w / 2, y + 21);
    ctx.restore();
  };

  drawGlowText('RELAY CHAMBER', W / 2, 44, 'bold 30px ' + FONT, '#ffffff', '#6ff7ff', 9);
  drawHeaderPill(168, 66, 206, 'BANKED THIS RUN', '+' + chamber.shardGain + ' shards', '#ffdd66');
  drawHeaderPill(426, 66, 206, 'TOTAL SHARDS', String(chamber.totalShards), '#6ff7ff');

  drawPanel(40, 112, 248, 94, '#7ecbff');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 16px ' + FONT;
  ctx.fillStyle = '#dfeaff';
  ctx.fillText('Ready for another run.', 62, 132);
  ctx.font = '13px ' + FONT;
  ctx.fillStyle = '#98abc4';
  const loreLines = lore;
  for (let i = 0; i < loreLines.length; i++) {
    ctx.fillText(loreLines[i], 62, 160 + i * 18);
  }

  drawPanel(40, 220, 320, 248, '#ffd86f');
  ctx.font = 'bold 15px ' + FONT;
  ctx.fillStyle = '#ffd86f';
  ctx.fillText('QUICK SPEND', 62, 240);
  ctx.font = '12px ' + FONT;
  ctx.fillStyle = '#8395b1';
  ctx.fillText('Spend shards, then dive back in.', 62, 261);

  G._relayUpgradeRects = [];
  const quickUpgradeIds = chamber.quickUpgradeIds || [];
  if (quickUpgradeIds.length === 0) {
    ctx.font = '14px ' + FONT;
    ctx.fillStyle = '#a7b6cb';
    ctx.fillText('You already own every quick upgrade here.', 62, 314);
    ctx.fillStyle = '#70809a';
    ctx.fillText('Open Upgrades to review the full tree.', 62, 336);
  } else {
    for (let i = 0; i < quickUpgradeIds.length; i++) {
      const upgrade = UPGRADES.find(u => u.id === quickUpgradeIds[i]);
      if (!upgrade) continue;
      const tierUnlocked = isTierUnlocked(G.meta, upgrade.tier);
      const affordable = canPurchaseUpgrade(G.meta, upgrade.id);
      const status = affordable
        ? `Ready • ${upgrade.cost} shards`
        : (tierUnlocked ? `Need ${upgrade.cost - G.meta.shards} more shards` : `Unlock Tier ${upgrade.tier} first`);
      const summary = RELAY_UPGRADE_COPY[upgrade.id] || upgrade.effect;
      const cardX = 58;
      const cardY = 274 + i * 46;
      const cardW = 284;
      const cardH = 42;
      const isFocused = focusSection === 'upgrades' && chamber.upgradeIndex === i;
      const isHovered = G._relayHoverUpgradeIndex === i;
      G._relayUpgradeRects[i] = { x: cardX, y: cardY, w: cardW, h: cardH };

      ctx.save();
      if (isFocused || isHovered) {
        ctx.shadowColor = affordable ? '#ffd86f' : '#a2b7d7';
        ctx.shadowBlur = 10;
      }
      ctx.fillStyle = affordable ? 'rgba(31, 39, 58, 0.94)' : 'rgba(18, 24, 40, 0.92)';
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, 10);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = affordable
        ? ((isFocused || isHovered) ? '#ffd86f' : 'rgba(255,216,111,0.38)')
        : ((isFocused || isHovered) ? '#8aa3c4' : 'rgba(138,163,196,0.24)');
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = affordable ? '#ffd86f' : '#5f728e';
      ctx.beginPath();
      ctx.roundRect(cardX + 8, cardY + 8, 4, cardH - 16, 2);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 13px ' + FONT;
      ctx.fillStyle = affordable ? '#ffffff' : '#d7deea';
      ctx.fillText(upgrade.name, cardX + 20, cardY + 13);
      ctx.textAlign = 'right';
      ctx.font = '10px ' + FONT;
      ctx.fillStyle = affordable ? '#ffd86f' : '#8fa2bc';
      ctx.fillText(status, cardX + cardW - 16, cardY + 13);
      ctx.textAlign = 'left';
      ctx.font = '10px ' + FONT;
      ctx.fillStyle = affordable ? '#8fa2bc' : '#95a4ba';
      ctx.fillText(summary, cardX + 20, cardY + 29);
      ctx.restore();
    }
  }

  drawPanel(388, 112, 372, 342, previewTheme.accent);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 15px ' + FONT;
  ctx.fillStyle = previewTheme.accent;
  ctx.fillText('LOADOUT', 410, 132);

  const pulse = 0.84 + 0.16 * Math.sin(Date.now() / 500);
  ctx.save();
  ctx.translate(578, 258);
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = previewTheme.glow;
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, 32 + i * 18, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.18 + 0.08 * pulse;
  ctx.fillStyle = previewTheme.tint;
  ctx.beginPath();
  ctx.arc(0, 0, 88, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.shadowColor = previewTheme.glow;
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(-5, -2, 2.6, 0, Math.PI * 2);
  ctx.arc(5, -2, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.font = getRelayFittedFont(previewLoadout.name, 220, 24, 18);
  ctx.textAlign = 'center';
  ctx.fillStyle = previewUnlocked ? '#ffffff' : '#c6cfdb';
  ctx.fillText(previewLoadout.name, 578, 146);
  ctx.font = getRelayFittedFont(previewTheme.title, 180, 13, 11);
  ctx.fillStyle = previewTheme.accent;
  ctx.fillText(previewTheme.title, 578, 168);
  ctx.font = '13px ' + FONT;
  ctx.fillStyle = previewUnlocked ? '#d7e1f1' : '#a9b4c4';
  ctx.fillText(previewSelected ? 'Current deployment frame' : (previewUnlocked ? 'Ready to equip' : 'Locked frame'), 578, 338);

  const statPills = [
    { label: 'HP', value: previewLoadout.hp },
    { label: 'STA', value: previewLoadout.stamina },
    { label: 'SCORE', value: 'x' + previewLoadout.scoreMod },
  ];
  for (let i = 0; i < statPills.length; i++) {
    const x = 430 + i * 106;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.roundRect(x, 344, 92, 42, 12);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '11px ' + FONT;
    ctx.fillStyle = '#8fa2bc';
    ctx.fillText(statPills[i].label, x + 46, 356);
    ctx.font = 'bold 18px ' + FONT;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(statPills[i].value), x + 46, 375);
  }

  ctx.font = 'bold 13px ' + FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#d7e1f1';
  ctx.fillText('Starting kit', 416, 402);
  ctx.font = '12px ' + FONT;
  ctx.fillStyle = previewUnlocked ? '#9ab0cb' : '#aeb8c8';
  const previewStartText = previewLoadout.powers.length > 0
    ? previewLoadout.powers.join(', ')
    : (previewLoadout.id === 'hardcore' ? 'No powers. No revives. Brutal stakes.' : 'No starting powers.');
  const startLines = wrapRelayText(previewStartText, 300, 2);
  for (let i = 0; i < startLines.length; i++) {
    ctx.fillText(startLines[i], 416, 416 + i * 14);
  }
  if (!previewUnlocked) {
    const lockText = previewLoadout.id === 'hardcore'
      ? (G.meta.hardcoreUnlocked ? 'Unlocked elsewhere.' : 'Reach Wave 15 • 250 shards')
      : ('Earn ' + previewLoadout.unlockCost + ' total shards to unlock.');
    ctx.font = '11px ' + FONT;
    ctx.fillStyle = '#ffb6bf';
    const lockLines = wrapRelayText(lockText, 300, 2);
    for (let i = 0; i < lockLines.length; i++) {
      ctx.fillText(lockLines[i], 416, 440 + i * 12);
    }
  }

  G._relayLoadoutRects = [];
  for (let i = 0; i < LOADOUTS.length; i++) {
    const loadout = LOADOUTS[i];
    const x = 408 + i * 86;
    const y = 460;
    const w = 72;
    const h = 40;
    const unlocked = isLoadoutUnlocked(G.meta, loadout.id);
    const selected = G.meta.selectedLoadout === loadout.id;
    const focused = focusSection === 'loadouts' && chamber.loadoutIndex === i;
    const hovered = G._relayHoverLoadoutIndex === i;
    G._relayLoadoutRects[i] = { x, y, w, h };

    ctx.save();
    if (focused || hovered) {
      ctx.shadowColor = unlocked ? '#6ff7ff' : '#9aa8bc';
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = unlocked ? 'rgba(18, 24, 40, 0.94)' : 'rgba(20, 22, 34, 0.92)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = selected
      ? previewTheme.accent
      : ((focused || hovered) ? 'rgba(200,225,255,0.45)' : 'rgba(120,150,190,0.18)');
    ctx.lineWidth = selected || focused || hovered ? 1.8 : 1;
    ctx.stroke();
    ctx.font = 'bold 11px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = unlocked ? '#ffffff' : '#aeb8c8';
    ctx.fillText(loadout.name === 'Glass Cannon' ? 'Glass' : loadout.name, x + w / 2, y + 15);
    ctx.font = '9px ' + FONT;
    ctx.fillStyle = unlocked ? (selected ? previewTheme.accent : '#8fa2bc') : '#7f8ea3';
    ctx.fillText(unlocked ? (selected ? 'Equipped' : 'Preview') : 'Locked', x + w / 2, y + 30);
    ctx.restore();
  }

  const runItBackRect = { x: 40, y: 514, w: 332, h: 48 };
  const upgradesRect = { x: 390, y: 514, w: 206, h: 48 };
  const menuRect = { x: 614, y: 514, w: 146, h: 48 };
  G._relayActionRects = { runback: runItBackRect, upgrades: upgradesRect, menu: menuRect };

  const drawActionButton = (rect, label, sublabel, action, primary = false) => {
    const focused = focusSection === 'cta' && ctaActions[chamber.ctaIndex] === action;
    const hovered = G._relayHoverAction === action;
    ctx.save();
    if (focused || hovered) {
      ctx.shadowColor = primary ? '#6ff7ff' : '#b0bfd7';
      ctx.shadowBlur = primary ? 18 : 10;
    }
    ctx.fillStyle = primary ? 'rgba(18, 56, 76, 0.92)' : 'rgba(11, 16, 28, 0.92)';
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 18);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = primary
      ? ((focused || hovered) ? '#6ff7ff' : 'rgba(111,247,255,0.5)')
      : ((focused || hovered) ? '#dce8ff' : 'rgba(190,205,230,0.25)');
    ctx.lineWidth = primary ? 2 : 1.5;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = primary ? ('bold 20px ' + FONT) : ('bold 15px ' + FONT);
    ctx.fillStyle = primary ? '#ffffff' : '#d7e1f1';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + 18);
    ctx.font = '10px ' + FONT;
    ctx.fillStyle = primary ? '#bceeff' : '#8fa2bc';
    ctx.fillText(sublabel, rect.x + rect.w / 2, rect.y + 34);
    ctx.restore();
  };

  drawActionButton(runItBackRect, 'Run It Back', 'Start another run', 'runback', true);
  drawActionButton(upgradesRect, 'Open Upgrades', 'Spend more shards', 'upgrades');
  drawActionButton(menuRect, 'Main Menu', 'Leave the relay', 'menu');

  ctx.font = '12px ' + FONT;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7f91ad';
  ctx.fillText('Spend fast, swap loadouts, and get back into the grid.', W / 2, 584);

  ctx.restore();
}

function drawTransitionRoom() {
  ctx.save();
  const room = G.transitionRoom;
  if (!room) { ctx.restore(); return; }

  if (room.outroActive) {
    ctx.fillStyle = '#02050b';
    ctx.fillRect(0, 0, W, H);
    const outroAccent = room.commitColor || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillStyle = outroAccent;
    ctx.fillText(room.mode === 'epilogue' ? room.title : 'LINE CHOSEN', W / 2, room.mode === 'epilogue' ? 192 : 250);
    ctx.font = room.mode === 'epilogue' ? ('bold 22px ' + FONT) : ('bold 24px ' + FONT);
    ctx.fillStyle = '#ffffff';
    const commitLines = room.mode === 'epilogue'
      ? wrapRelayParagraphs(room.commitLine || room.continueWhisper || 'The chamber holds your line.', 620, 2)
      : wrapRelayText(room.commitLine || room.continueWhisper || 'The chamber holds your line.', 540, 3);
    for (let i = 0; i < commitLines.length; i++) {
      ctx.fillText(commitLines[i], W / 2, (room.mode === 'epilogue' ? 252 : 300) + i * (room.mode === 'epilogue' ? 28 : 30));
    }
    ctx.restore();
    return;
  }

  if (room.preludeActive) {
    ctx.fillStyle = '#02050b';
    ctx.fillRect(0, 0, W, H);
    const preludeGlow = ctx.createRadialGradient(W * 0.5, H * 0.38, 0, W * 0.5, H * 0.38, 280);
    const preludeAccent = room.mode === 'boss_approach'
      ? '255,155,124'
      : room.mode === 'chapter_return'
        ? '124,227,255'
        : '255,216,111';
    preludeGlow.addColorStop(0, `rgba(${preludeAccent},0.09)`);
    preludeGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = preludeGlow;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 14px ' + FONT;
    ctx.fillStyle = room.mode === 'boss_approach'
      ? '#ffb091'
      : room.mode === 'chapter_return'
        ? '#7ce3ff'
        : '#ffd86f';
    ctx.fillText(room.title, W / 2, 146);

    ctx.font = 'bold 30px ' + FONT;
    ctx.fillStyle = '#ffffff';
    const arrivalLines = wrapRelayText(room.arrivalLine, 580, 3);
    for (let i = 0; i < arrivalLines.length; i++) {
      ctx.fillText(arrivalLines[i], W / 2, 232 + i * 34);
    }
    if (room.followLine) {
      ctx.font = '16px ' + FONT;
      ctx.fillStyle = '#9db1cb';
      const followLines = wrapRelayText(room.followLine, 560, 2);
      for (let i = 0; i < followLines.length; i++) {
        ctx.fillText(followLines[i], W / 2, 312 + i * 22);
      }
    }

    if (room.preludeReady) {
      const proceedText = isTouchUILayout() ? 'Tap to proceed' : 'Click or press any key to proceed';
      ctx.font = '12px ' + FONT;
      ctx.fillStyle = '#c7d4e9';
      ctx.fillText(proceedText, W / 2, 520);
    }

    ctx.restore();
    return;
  }

  ctx.fillStyle = '#07111a';
  ctx.fillRect(0, 0, W, H);

  const bgGlow = ctx.createRadialGradient(W * 0.5, H * 0.24, 0, W * 0.5, H * 0.24, 400);
  bgGlow.addColorStop(0, 'rgba(130, 190, 255, 0.08)');
  bgGlow.addColorStop(0.65, 'rgba(60, 90, 160, 0.035)');
  bgGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = bgGlow;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.12;
  ctx.drawImage(bgGridCanvas, 0, 0);
  ctx.globalAlpha = 0.28;
  ctx.drawImage(gridCanvas, 0, 0);
  ctx.globalAlpha = 1;

  const roomAccent = room.mode === 'boss_approach'
    ? '#ff9b7c'
    : room.mode === 'chapter_return'
      ? '#7ce3ff'
      : '#ffd86f';
  const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 600);
  const activeIndex = room.selectedIndex >= 0 ? room.selectedIndex : (room.hoverIndex >= 0 ? room.hoverIndex : room.cursor);
  const activeOption = room.options?.[activeIndex] || null;

  const floorGrad = ctx.createLinearGradient(0, H * 0.30, 0, H);
  floorGrad.addColorStop(0, 'rgba(10,18,30,0)');
  floorGrad.addColorStop(1, 'rgba(6,10,18,0.82)');
  ctx.fillStyle = floorGrad;
  ctx.beginPath();
  ctx.moveTo(122, H * 0.30);
  ctx.lineTo(W - 122, H * 0.30);
  ctx.lineTo(W - 28, H);
  ctx.lineTo(28, H);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.18;
  const wallGradL = ctx.createLinearGradient(52, 0, 120, 0);
  wallGradL.addColorStop(0, 'rgba(12,22,40,0.88)');
  wallGradL.addColorStop(1, 'rgba(12,22,40,0)');
  ctx.fillStyle = wallGradL;
  ctx.beginPath();
  ctx.moveTo(44, 84);
  ctx.lineTo(124, 124);
  ctx.lineTo(124, H - 70);
  ctx.lineTo(60, H);
  ctx.lineTo(36, H);
  ctx.closePath();
  ctx.fill();
  const wallGradR = ctx.createLinearGradient(W - 52, 0, W - 120, 0);
  wallGradR.addColorStop(0, 'rgba(12,22,40,0.88)');
  wallGradR.addColorStop(1, 'rgba(12,22,40,0)');
  ctx.fillStyle = wallGradR;
  ctx.beginPath();
  ctx.moveTo(W - 44, 84);
  ctx.lineTo(W - 124, 124);
  ctx.lineTo(W - 124, H - 70);
  ctx.lineTo(W - 60, H);
  ctx.lineTo(W - 36, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const drawPathLine = (x1, y1, x2, y2, accent, active = false) => {
    ctx.save();
    ctx.lineCap = 'round';
    if (active) {
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = -(Date.now() / 36) % 22;
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 3;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 16;
    } else {
      ctx.strokeStyle = 'rgba(122, 160, 205, 0.16)';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  };

  const drawRingGate = (gx, gy, r, accent, focused, broken = false, intensity = 1) => {
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = focused ? 3 : 2;
    ctx.globalAlpha = broken ? 0.32 : 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(gx, gy, r + i * 12 + pulse * (focused ? 4 : 2), 0, Math.PI * 2);
      ctx.stroke();
    }
    const rgb = accent === '#ff9b7c'
      ? '255,155,124'
      : accent === '#ffd86f'
        ? '255,216,111'
        : '124,227,255';
    ctx.fillStyle = `rgba(${rgb},${focused ? 0.16 * intensity : 0.08 * intensity})`;
    ctx.beginPath();
    ctx.arc(gx, gy, r + 10, 0, Math.PI * 2);
    ctx.fill();
    if (focused) {
      ctx.globalAlpha = 1;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.arc(gx, gy, r + 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (broken) {
      ctx.strokeStyle = '#ffe0e5';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gx - 14, gy - 14);
      ctx.lineTo(gx + 14, gy + 14);
      ctx.moveTo(gx + 14, gy - 14);
      ctx.lineTo(gx - 14, gy + 14);
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawChip = (x, y, text, accent, focused = false) => {
    ctx.save();
    ctx.font = 'bold 10px ' + FONT;
    const w = Math.max(58, ctx.measureText(text).width + 22);
    ctx.fillStyle = focused ? 'rgba(11, 20, 34, 0.94)' : 'rgba(8, 15, 26, 0.84)';
    ctx.strokeStyle = focused ? accent : 'rgba(165, 185, 220, 0.18)';
    ctx.lineWidth = focused ? 1.5 : 1;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 11, w, 22, 11);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = focused ? '#ffffff' : '#d7e2f5';
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  };

  const drawBreadcrumb = () => {
    const startX = W - 218;
    const y = 56;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(132, 156, 193, 0.28)';
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(startX + 66, y);
    ctx.lineTo(startX + 132, y);
    ctx.stroke();
    room.routeNodes.forEach((node, i) => {
      const x = startX + i * 66;
      const color = node.state === 'lit'
        ? '#7ce3ff'
        : node.state === 'broken'
          ? '#ff9ca8'
          : node.state === 'threat'
            ? '#ffb091'
            : node.state === 'active'
              ? '#dce7ff'
              : 'rgba(130, 150, 178, 0.65)';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, i === 1 ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      if (node.state === 'broken') {
        ctx.strokeStyle = '#ffe0e5';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 7, y - 7);
        ctx.lineTo(x + 7, y + 7);
        ctx.moveTo(x + 7, y - 7);
        ctx.lineTo(x - 7, y + 7);
        ctx.stroke();
      }
    });
    ctx.font = 'bold 10px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#90a4c2';
    ctx.fillText(getActLabel(room.actIndex), startX, y + 12);
    ctx.fillText(room.mode === 'epilogue' ? 'Core' : 'Gate', startX + 66, y + 12);
    ctx.fillText(room.mode === 'epilogue' ? 'Relay' : getActLabel(Math.min(3, room.actIndex + 1)), startX + 132, y + 12);
    ctx.restore();
  };

  const playerX = G.player?.x ?? room.spawn.x;
  const playerY = G.player?.y ?? room.spawn.y;
  const corridorTop = room.mode === 'epilogue' ? room.exitGate?.y || H * 0.18 : room.bossGate?.y || H * 0.18;
  ctx.save();
  ctx.strokeStyle = 'rgba(130, 168, 210, 0.08)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W * 0.5, H);
  ctx.lineTo(W * 0.5, corridorTop + 48);
  ctx.stroke();
  ctx.restore();

  if (room.seal) {
    drawRingGate(room.seal.x, room.seal.y, 22, room.mode === 'chapter_return' || room.mode === 'epilogue' ? '#c37484' : '#6d7f9a', false, room.mode !== 'boss_approach', 0.8);
  }
  if (room.gates?.length) {
    room.gates.forEach((gate, i) => {
      drawPathLine(playerX, playerY - 8, gate.x, gate.y + 18, gate.accent, activeIndex === i);
    });
  }
  if (room.mode === 'epilogue' && room.exitGate) {
    drawPathLine(playerX, playerY - 8, room.exitGate.x, room.exitGate.y + 22, room.exitGate.accent, true);
  }

  if (room.seal) {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 16, 28, 0.7)';
    ctx.beginPath();
    ctx.ellipse(room.seal.x, room.seal.y + 10, 84, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (room.bossGate) {
    drawRingGate(room.bossGate.x, room.bossGate.y, 28, '#ff9b7c', true, false, 1.1);
    ctx.save();
    const bossGateGlow = ctx.createRadialGradient(room.bossGate.x, room.bossGate.y - 24, 0, room.bossGate.x, room.bossGate.y - 24, 110);
    bossGateGlow.addColorStop(0, 'rgba(255,170,138,0.26)');
    bossGateGlow.addColorStop(0.45, 'rgba(255,155,124,0.12)');
    bossGateGlow.addColorStop(1, 'rgba(255,155,124,0)');
    ctx.fillStyle = bossGateGlow;
    ctx.beginPath();
    ctx.ellipse(room.bossGate.x, room.bossGate.y - 18, 104, 144, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillStyle = '#ffd7cb';
    ctx.fillText(BOSS_DEFS[room.bossType]?.name || 'Boss Gate', room.bossGate.x, room.bossGate.y - 56);
  }
  if (room.exitGate) {
    drawRingGate(room.exitGate.x, room.exitGate.y, 30, room.exitGate.accent, room.hoverIndex === 0 || room.selectedIndex === 0, false, 1.2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillStyle = '#fff0b5';
    ctx.fillText('Relay Exit', room.exitGate.x, room.exitGate.y - 56);
  }

  if (room.gates) {
    G._transitionOptionRects = [];
    for (let i = 0; i < room.gates.length; i++) {
      const gate = room.gates[i];
      const option = room.options[i];
      const focused = room.cursor === i || room.hoverIndex === i || room.selectedIndex === i;
      drawRingGate(gate.x, gate.y, gate.r, gate.accent, focused, false, 1.1);
      G._transitionOptionRects[i] = { x: gate.x - 84, y: gate.y - 84, w: 168, h: 196 };

      ctx.save();
      ctx.fillStyle = 'rgba(9, 16, 28, 0.66)';
      ctx.beginPath();
      ctx.ellipse(gate.x, gate.y + 126, 92, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (room.mode === 'boss_approach') {
        ctx.font = 'bold 11px ' + FONT;
        ctx.fillStyle = gate.accent;
        ctx.fillText(option.routeLabel.toUpperCase(), gate.x, gate.y - 72);
      }

      if (option.card) {
        drawPowerIcon(option.card.icon, option.card.shape, gate.x, gate.y, 20);
      } else {
        ctx.save();
        ctx.translate(gate.x, gate.y);
        ctx.fillStyle = '#ffffff';
        if (option.id === 'steady') {
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#0e1a2a';
          ctx.fillRect(-4, -10, 8, 20);
          ctx.fillRect(-10, -4, 20, 8);
        } else if (option.id === 'risk') {
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-12, -12, 24, 24);
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -15);
          ctx.lineTo(13, 0);
          ctx.lineTo(0, 15);
          ctx.lineTo(-13, 0);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      const titleY = room.mode === 'boss_approach' ? gate.y + 74 : gate.y + 66;
      ctx.font = getRelayFittedFont(option.title, 154, room.mode === 'boss_approach' ? 18 : 20, 13);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(option.title, gate.x, titleY);

      const chips = getTransitionOptionChips(room.mode, option);
      if (chips.length) {
        const spacing = 10;
        ctx.font = 'bold 10px ' + FONT;
        const widths = chips.map(text => Math.max(58, ctx.measureText(text).width + 22));
        const totalWidth = widths.reduce((sum, w) => sum + w, 0) + spacing * (chips.length - 1);
        let cursorX = gate.x - totalWidth / 2;
        const chipY = room.mode === 'boss_approach' ? gate.y + 100 : gate.y + 96;
        for (let j = 0; j < chips.length; j++) {
          const chipCenter = cursorX + widths[j] / 2;
          drawChip(chipCenter, chipY, chips[j], gate.accent, focused);
          cursorX += widths[j] + spacing;
        }
      }
    }
  } else {
    G._transitionOptionRects = [];
  }
  G._transitionContinueRect = room.exitGate
    ? { x: room.exitGate.x - 84, y: room.exitGate.y - 84, w: 168, h: 196 }
    : null;

  if (G.player) {
    drawAfterimages();
    drawPlayer();
  }
  drawParticles();
  drawCombatTexts();

  drawBreadcrumb();

  ctx.restore();
}

// --- Upgrade Screen ---
function drawUpgradeScreen() {
  const isTouchDev = isTouchUILayout();
  ctx.save();
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, W, H);
  // Subtle center glow
  const ugGrad = ctx.createRadialGradient(W / 2, H / 3, 0, W / 2, H / 3, 300);
  ugGrad.addColorStop(0, 'rgba(255, 221, 68, 0.04)');
  ugGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = ugGrad;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.3;
  ctx.drawImage(gridCanvas, 0, 0);
  ctx.globalAlpha = 1;

  drawGlowText('UPGRADES', W / 2, 40, 'bold 32px ' + FONT, '#ffffff', '#ffdd44', 8);

  // Shard balance with glow
  ctx.font = 'bold 18px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ffdd44';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#ffdd44';
  ctx.fillText('✦ ' + G.meta.shards + (G.meta.shards === 1 ? ' Shard' : ' Shards'), W / 2, 70);
  ctx.shadowBlur = 0;
  ctx.fillText('✦ ' + G.meta.shards + (G.meta.shards === 1 ? ' Shard' : ' Shards'), W / 2, 70);

  if (isTouchDev) {
    const panelX = 30;
    const panelY = 102;
    const panelW = W - 60;
    const panelH = H - 138;
    const innerX = panelX + 12;
    const innerY = panelY + 14;
    const innerW = panelW - 24;
    const innerH = panelH - 28;
    const rowH = 52;
    const rowGap = 10;
    const tierGap = 16;

    const drawUpgradePanel = (x, y, w, h, accent) => {
      ctx.save();
      ctx.fillStyle = 'rgba(9, 14, 28, 0.84)';
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 18);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    };

    drawUpgradePanel(panelX, panelY, panelW, panelH, '#7ecbff');
    G._upgradeRowRects = [];
    G._upgradeScrollPanelRect = { x: panelX, y: panelY, w: panelW, h: panelH };

    let contentHeight = 0;
    for (let tier = 1; tier <= 4; tier++) {
      contentHeight += 24;
      contentHeight += UPGRADES.filter(u => u.tier === tier).length * (rowH + rowGap);
      contentHeight += tierGap;
    }
    G._upgradeScrollMax = Math.max(0, contentHeight - innerH);
    if (G.upgradeScrollY > G._upgradeScrollMax) G.upgradeScrollY = G._upgradeScrollMax;
    if (G.upgradeScrollY < 0) G.upgradeScrollY = 0;

    let contentY = 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(innerX, innerY, innerW, innerH);
    ctx.clip();

    for (let tier = 1; tier <= 4; tier++) {
      const tierUnlocked = isTierUnlocked(G.meta, tier);
      const prevTier = tier - 1;
      const neededFromPrev = TIER_REQUIREMENTS[tier] || 0;
      const unlockedFromPrev = prevTier > 0 ? getUnlockedCountForTier(G.meta, prevTier) : 0;
      const headerY = innerY + contentY - G.upgradeScrollY;

      ctx.font = 'bold 15px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = tierUnlocked ? '#7fe7ff' : '#687791';
      ctx.fillText('TIER ' + tier, innerX + 8, headerY);
      if (!tierUnlocked) {
        ctx.font = '12px ' + FONT;
        ctx.fillStyle = '#8091a8';
        ctx.fillText(unlockedFromPrev + '/' + neededFromPrev + ' from Tier ' + prevTier, innerX + 92, headerY + 1);
      }
      contentY += 24;

      const tierUpgrades = UPGRADES.filter(u => u.tier === tier);
      for (let i = 0; i < tierUpgrades.length; i++) {
        const u = tierUpgrades[i];
        const owned = G.meta.unlocks.includes(u.id);
        const affordable = canPurchaseUpgrade(G.meta, u.id);
        const isSelected = G.upgradeCursor === UPGRADES.indexOf(u);
        const statusColor = owned ? '#44ff88' : (affordable ? '#ffdd44' : (tierUnlocked ? '#8ea0b8' : '#657286'));
        const rowY = innerY + contentY - G.upgradeScrollY;
        if (rowY + rowH >= innerY - 12 && rowY <= innerY + innerH + 12) {
          G._upgradeRowRects.push({ x: innerX, y: rowY, w: innerW, h: rowH, upgradeId: u.id, index: UPGRADES.indexOf(u) });
        }

        ctx.save();
        ctx.fillStyle = isSelected ? 'rgba(32, 39, 54, 0.96)' : 'rgba(18, 24, 36, 0.88)';
        ctx.beginPath();
        ctx.roundRect(innerX, rowY, innerW, rowH, 14);
        ctx.fill();
        ctx.strokeStyle = isSelected ? 'rgba(160,220,255,0.36)' : 'rgba(120,150,190,0.14)';
        ctx.lineWidth = isSelected ? 1.5 : 1;
        ctx.stroke();
        ctx.fillStyle = statusColor;
        ctx.beginPath();
        ctx.roundRect(innerX + 10, rowY + 8, 5, rowH - 16, 3);
        ctx.fill();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = 'bold 14px ' + FONT;
        ctx.fillStyle = owned ? '#c8ffe1' : '#ffffff';
        let nameText = owned ? ('✓ ' + u.name) : u.name;
        while (ctx.measureText(nameText).width > innerW - 160 && nameText.length > 0) nameText = nameText.slice(0, -1);
        ctx.fillText(nameText, innerX + 24, rowY + 10);

        ctx.font = '12px ' + FONT;
        ctx.fillStyle = tierUnlocked ? '#92a5bf' : '#71819a';
        let effectText = owned ? u.effect : (tierUnlocked ? u.effect : 'Unlock the previous tier to reveal this upgrade.');
        while (ctx.measureText(effectText).width > innerW - 170 && effectText.length > 0) effectText = effectText.slice(0, -1);
        if (effectText !== u.effect && tierUnlocked) effectText += '…';
        ctx.fillText(effectText, innerX + 24, rowY + 28);

        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 12px ' + FONT;
        ctx.fillStyle = statusColor;
        ctx.fillText(owned ? 'Owned' : (tierUnlocked ? (u.cost + ' ✦') : 'Locked'), innerX + innerW - 16, rowY + rowH / 2);
        ctx.restore();
        contentY += rowH + rowGap;
      }
      contentY += tierGap;
    }

    ctx.restore();

    if (G._upgradeScrollMax > 0) {
      if (G.upgradeScrollY > 0) {
        const topFade = ctx.createLinearGradient(0, panelY, 0, panelY + 20);
        topFade.addColorStop(0, 'rgba(9,14,28,0.96)');
        topFade.addColorStop(1, 'rgba(9,14,28,0)');
        ctx.fillStyle = topFade;
        ctx.fillRect(panelX + 2, panelY + 2, panelW - 4, 26);
      }
      if (G.upgradeScrollY < G._upgradeScrollMax) {
        const bottomFade = ctx.createLinearGradient(0, panelY + panelH - 24, 0, panelY + panelH);
        bottomFade.addColorStop(0, 'rgba(9,14,28,0)');
        bottomFade.addColorStop(1, 'rgba(9,14,28,0.96)');
        ctx.fillStyle = bottomFade;
        ctx.fillRect(panelX + 2, panelY + panelH - 26, panelW - 4, 24);
      }
    }

    ctx.restore();
    return;
  }

  let y = 100;
  G._upgradeRowRects = [];
  for (let tier = 1; tier <= 4; tier++) {
    const tierUnlocked = isTierUnlocked(G.meta, tier);
    const prevTier = tier - 1;
    const neededFromPrev = TIER_REQUIREMENTS[tier] || 0;
    const unlockedFromPrev = prevTier > 0 ? getUnlockedCountForTier(G.meta, prevTier) : 0;

    // Tier header
    ctx.font = 'bold 14px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillStyle = tierUnlocked ? '#00ccff' : '#444444';
    ctx.fillText('TIER ' + tier, 60, y);
    if (!tierUnlocked) {
      ctx.font = '12px ' + FONT;
      ctx.fillStyle = '#444444';
      ctx.fillText('(locked)', 110, y);
    }
    y += 22;

    if (!tierUnlocked) {
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#7a8598';
      ctx.fillText('Unlock ' + neededFromPrev + ' Tier ' + prevTier + ' upgrades (' + unlockedFromPrev + '/' + neededFromPrev + ')', 70, y);
      y += 18;
    }

    const tierUpgrades = UPGRADES.filter(u => u.tier === tier);
    for (let i = 0; i < tierUpgrades.length; i++) {
      const u = tierUpgrades[i];
      const owned = G.meta.unlocks.includes(u.id);
      const affordable = canPurchaseUpgrade(G.meta, u.id);
      const isSelected = G.upgradeCursor === UPGRADES.indexOf(u);
      G._upgradeRowRects.push({ x: 50, y: y - 10, w: W - 100, h: 22, upgradeId: u.id, index: UPGRADES.indexOf(u) });

      // Row background for selected — highlighted pill
      if (isSelected) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.roundRect(50, y - 10, W - 100, 22, 4);
        ctx.fill();
        ctx.strokeStyle = affordable ? 'rgba(255,221,68,0.2)' : 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(50, y - 10, W - 100, 22, 4);
        ctx.stroke();
      }

      ctx.font = '13px ' + FONT;
      ctx.textAlign = 'left';

      if (owned) {
        ctx.fillStyle = '#44ff88';
        ctx.fillText('✓ ' + u.name + ' — ' + u.effect, 70, y);
      } else if (affordable) {
        ctx.fillStyle = '#ffffff';
        ctx.fillText(u.name + ' — ' + u.effect, 70, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffdd44';
        ctx.fillText(u.cost + ' ✦', W - 70, y);
      } else if (tierUnlocked) {
        ctx.fillStyle = '#666666';
        ctx.fillText(u.name + ' — ' + u.effect, 70, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#666666';
        ctx.fillText(u.cost + ' ✦', W - 70, y);
      } else {
        ctx.fillStyle = '#333333';
        ctx.fillText('???', 70, y);
      }
      y += 22;
    }
    y += 10;
  }

  // Controls hint
  ctx.font = '14px ' + FONT;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#555555';
  ctx.fillText(
    G._upgradesPrevState === STATE.RELAY_CHAMBER
      ? '↑↓ Navigate · Enter/Space to buy · ESC to return to relay'
      : '↑↓ Navigate · Enter/Space to buy · ESC to return',
    W / 2, H - 30
  );

  ctx.restore();
}

// --- Loadout Screen ---
function drawLoadoutScreen() {
  const isTouchDev = isTouchUILayout();
  ctx.save();
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, W, H);
  // Subtle center glow
  const loGrad = ctx.createRadialGradient(W / 2, H / 3, 0, W / 2, H / 3, 300);
  loGrad.addColorStop(0, 'rgba(0, 255, 255, 0.03)');
  loGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = loGrad;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.3;
  ctx.drawImage(gridCanvas, 0, 0);
  ctx.globalAlpha = 1;

  drawGlowText('LOADOUT', W / 2, 60, 'bold 32px ' + FONT, '#ffffff', '#00ffff', 8);
  const selectedLoadout = LOADOUTS.find(l => l.id === G.meta.selectedLoadout) || LOADOUTS[0];
  const previewLoadout = LOADOUTS[G.loadoutCursor] || selectedLoadout;
  const loadoutThemes = {
    standard: { accent: '#6ff7ff', accentSoft: 'rgba(111,247,255,0.18)', core: '#ffffff', glow: '#6ff7ff', title: 'Balanced starter', desc: ['Stable health, stable stamina, no gimmicks.', 'Great for learning routes and clean bounces.'] },
    glass_cannon: { accent: '#ff9a6b', accentSoft: 'rgba(255,154,107,0.18)', core: '#fff2e8', glow: '#ff8855', title: 'Precision striker', desc: ['Extra stamina and a Dash Burst start.', 'Fragile, score-positive, and built for clean hits.'] },
    tank: { accent: '#79ffc1', accentSoft: 'rgba(121,255,193,0.18)', core: '#e9fff5', glow: '#56d89a', title: 'Fortress build', desc: ['Extra health, lower stamina, shield first.', 'Built to stabilize mistakes, not erase them.'] },
    hardcore: { accent: '#ff6a7b', accentSoft: 'rgba(255,106,123,0.18)', core: '#ffe5e8', glow: '#ff5a66', title: 'One life challenge', desc: ['No safety systems, huge score multiplier.', 'Pure execution, built for mastery runs.'] },
  };
  const previewTheme = loadoutThemes[previewLoadout.id] || loadoutThemes.standard;
  ctx.save();
  ctx.font = '14px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#8cbac7';
  ctx.fillText('Preview: ' + previewLoadout.name, W / 2, 92);
  ctx.restore();

  if (isTouchDev) {
    G._loadoutCardRects = [];
    const cardX = 54;
    const cardW = W - 108;
    const cardH = 98;
    const gapY = 10;
    const startY = 110;

    for (let i = 0; i < LOADOUTS.length; i++) {
      const l = LOADOUTS[i];
      const y = startY + i * (cardH + gapY);
      const unlocked = isLoadoutUnlocked(G.meta, l.id);
      const selected = G.meta.selectedLoadout === l.id;
      const focused = G.loadoutCursor === i || G._loadoutHoverIndex === i;
      const accent = l.id === 'hardcore' ? '#ff6a7b' : (selected ? '#6ff7ff' : '#9ab8d8');
      const status = unlocked ? (selected ? 'Equipped' : 'Tap to equip') : (l.id === 'hardcore' ? (canPurchaseHardcore(G.meta) ? 'Tap to unlock' : 'Locked') : 'Locked');
      G._loadoutCardRects[i] = { x: cardX, y, w: cardW, h: cardH };

      ctx.save();
      if (focused) {
        ctx.shadowColor = accent;
        ctx.shadowBlur = 12;
      }
      ctx.fillStyle = unlocked ? 'rgba(16, 22, 38, 0.93)' : 'rgba(24, 22, 32, 0.93)';
      ctx.beginPath();
      ctx.roundRect(cardX, y, cardW, cardH, 18);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = selected ? accent : (focused ? 'rgba(200,225,255,0.42)' : 'rgba(120,150,190,0.16)');
      ctx.lineWidth = selected || focused ? 2 : 1;
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(cardX + 8, y + 10, 5, cardH - 20, 2);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 22px ' + FONT;
      ctx.fillStyle = unlocked ? '#ffffff' : '#c8d0dc';
      ctx.fillText(l.name, cardX + 24, y + 24);
      ctx.font = '12px ' + FONT;
      ctx.fillStyle = accent;
      ctx.fillText((loadoutThemes[l.id] || loadoutThemes.standard).title, cardX + 24, y + 44);

      const stats = [
        { label: 'HP', value: String(l.hp) },
        { label: 'STA', value: String(l.stamina) },
        { label: 'SCORE', value: 'x' + l.scoreMod },
      ];
      for (let s = 0; s < stats.length; s++) {
        const bx = cardX + 24 + s * 90;
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.roundRect(bx, y + 56, 78, 26, 9);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = '10px ' + FONT;
        ctx.fillStyle = '#8fa2bc';
        ctx.fillText(stats[s].label, bx + 39, y + 65);
        ctx.font = 'bold 11px ' + FONT;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(stats[s].value, bx + 39, y + 77);
      }

      ctx.textAlign = 'right';
      ctx.font = 'bold 12px ' + FONT;
      ctx.fillStyle = unlocked ? (selected ? accent : '#dbe4f1') : (l.id === 'hardcore' && canPurchaseHardcore(G.meta) ? '#ffdd66' : '#9aa5b4');
      ctx.fillText(status, cardX + cardW - 24, y + 26);
      ctx.textAlign = 'left';
      ctx.font = '11px ' + FONT;
      ctx.fillStyle = unlocked ? '#c8d4e4' : '#9da8b7';
      const kit = l.powers.length > 0 ? l.powers.join(', ') : (l.id === 'hardcore' ? 'No powers. One life.' : 'No starting powers.');
      const kitLines = wrapRelayText(kit, 250, 2);
      for (let k = 0; k < kitLines.length; k++) {
        ctx.fillText(kitLines[k], cardX + 320, y + 60 + k * 13);
      }
      ctx.restore();
    }

    ctx.restore();
    return;
  }

  const cardW = 216;
  const cardH = 156;
  const gapX = 14;
  const gapY = 18;
  const startX = 36;
  const startY = 122;

  for (let i = 0; i < LOADOUTS.length; i++) {
    const l = LOADOUTS[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = startX + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);
    const unlocked = isLoadoutUnlocked(G.meta, l.id);
    const selected = G.meta.selectedLoadout === l.id;
    const isCursor = G.loadoutCursor === i;
    const isHover = G._loadoutHoverIndex === i;
    const focused = isCursor || isHover;
    const isHc = l.id === 'hardcore';
    const accent = isHc ? '#ff5e66' : (selected ? '#00ffff' : '#7fb8ff');
    const baseFill = unlocked
      ? (focused ? 'rgba(24, 30, 46, 0.94)' : 'rgba(14, 18, 32, 0.88)')
      : (focused ? 'rgba(42, 26, 34, 0.92)' : 'rgba(20, 22, 34, 0.90)');

    G._loadoutCardRects = G._loadoutCardRects || [];
    G._loadoutCardRects[i] = { x, y, w: cardW, h: cardH };

    ctx.save();
    if (focused) {
      ctx.shadowColor = accent;
      ctx.shadowBlur = selected ? 16 : 12;
    }
    ctx.fillStyle = baseFill;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 14);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = selected ? accent : (focused ? 'rgba(180,220,255,0.45)' : 'rgba(120,150,190,0.18)');
    ctx.lineWidth = selected || focused ? 2 : 1;
    ctx.stroke();

    ctx.fillStyle = unlocked ? accent : '#4e5360';
    ctx.beginPath();
    ctx.roundRect(x + 6, y + 6, 5, cardH - 12, 3);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + (l.name.length > 10 ? 22 : 24) + 'px ' + FONT;
    ctx.fillStyle = unlocked ? (isHc ? '#ffd1d4' : '#ffffff') : '#a9b4c7';
    ctx.fillText(l.name, x + 18, y + 28);

    const statY = y + 52;
    const stats = [
      { label: 'HP', value: String(l.hp) },
      { label: 'Stamina', value: String(l.stamina) },
      { label: 'Score', value: 'x' + l.scoreMod },
    ];
    const pillW = 58;
    for (let s = 0; s < stats.length; s++) {
      const px = x + 16 + s * (pillW + 8);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.roundRect(px, statY, pillW, 32, 8);
      ctx.fill();
      ctx.font = '11px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillStyle = unlocked ? '#8aa0bb' : '#7f8ba0';
      ctx.fillText(stats[s].label, px + 10, statY + 12);
      ctx.font = 'bold 14px ' + FONT;
      ctx.fillStyle = unlocked ? '#ffffff' : '#c7d0de';
      ctx.fillText(stats[s].value, px + 10, statY + 24);
    }

    ctx.textAlign = 'left';
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillStyle = unlocked ? '#9cb3ce' : '#b5c1d2';
    ctx.fillText('Start', x + 18, y + 100);
    ctx.font = '13px ' + FONT;
    if (l.powers.length > 0) {
      ctx.fillStyle = unlocked ? '#dfe8ff' : '#a5afbe';
      const startText = l.powers.join(', ');
      const maxW = cardW - 34;
      let clipped = startText;
      while (ctx.measureText(clipped).width > maxW && clipped.length > 0) clipped = clipped.slice(0, -1);
      ctx.fillText(clipped !== startText ? clipped.trimEnd() + '…' : clipped, x + 18, y + 120);
    } else {
      ctx.fillStyle = unlocked ? '#c3ccd8' : '#a5afbe';
      ctx.fillText(isHc ? 'One life, no safety nets' : 'No starting powers', x + 18, y + 120);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 16, y + 132);
    ctx.lineTo(x + cardW - 16, y + 132);
    ctx.stroke();

    ctx.font = '12px ' + FONT;
    ctx.textAlign = 'left';
    if (!unlocked) {
      let lockText = '';
      let lockColor = '#7d8594';
      if (isHc) {
        if (G.meta.bestWave < (l.unlockWave || 15)) {
          lockText = 'Reach Wave ' + (l.unlockWave || 15) + ' to unlock';
        } else {
          lockText = canPurchaseHardcore(G.meta)
            ? 'Press Enter or click to unlock for ' + l.unlockCost + ' shards'
            : 'Need ' + l.unlockCost + ' shards to unlock';
          lockColor = canPurchaseHardcore(G.meta) ? '#ffdd66' : '#7d8594';
        }
      } else {
        lockText = 'Requires ' + l.unlockCost + ' total shards earned';
      }
      ctx.fillStyle = lockColor;
      ctx.fillText(lockText, x + 18, y + 146);
    } else {
      ctx.fillStyle = selected ? '#8ef7ff' : '#7f93b1';
      ctx.fillText(selected ? 'Current active loadout' : 'Press Enter or click to equip', x + 18, y + 146);
    }

    ctx.restore();
  }

  const previewX = 504;
  const previewY = 122;
  const previewW = 260;
  const previewH = 336;
  const previewUnlocked = isLoadoutUnlocked(G.meta, previewLoadout.id);
  const previewSelected = G.meta.selectedLoadout === previewLoadout.id;

  ctx.save();
  ctx.fillStyle = 'rgba(10, 14, 24, 0.82)';
  ctx.beginPath();
  ctx.roundRect(previewX, previewY, previewW, previewH, 16);
  ctx.fill();
  ctx.strokeStyle = previewTheme.accentSoft;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = 'bold 22px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = previewUnlocked ? '#ffffff' : (previewLoadout.id === 'hardcore' ? '#f3c5cb' : '#c9d2df');
  ctx.fillText(previewLoadout.name, previewX + previewW / 2, previewY + 28);
  ctx.font = '13px ' + FONT;
  ctx.fillStyle = previewTheme.accent;
  ctx.fillText(previewTheme.title, previewX + previewW / 2, previewY + 52);

  if (previewSelected || !previewUnlocked) {
    const statusLabel = previewSelected
      ? 'Equipped'
      : (previewLoadout.id === 'hardcore'
        ? (canPurchaseHardcore(G.meta) ? 'Ready to unlock' : 'Locked')
        : 'Locked');
    ctx.fillStyle = previewLoadout.id === 'hardcore'
      ? 'rgba(120, 54, 68, 0.78)'
      : 'rgba(34, 46, 72, 0.82)';
    ctx.beginPath();
    ctx.roundRect(previewX + previewW / 2 - 58, previewY + 64, 116, 24, 12);
    ctx.fill();
    ctx.strokeStyle = previewTheme.accentSoft;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = 'bold 11px ' + FONT;
    ctx.fillStyle = previewSelected ? '#bffcff' : (previewLoadout.id === 'hardcore' && canPurchaseHardcore(G.meta) ? '#ffdd66' : '#a3acba');
    ctx.fillText(statusLabel, previewX + previewW / 2, previewY + 76);
  }

  const orbX = previewX + previewW / 2;
  const orbY = previewY + 150;
  ctx.strokeStyle = previewTheme.accentSoft;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(orbX, orbY, 44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = previewTheme.accentSoft;
  ctx.beginPath();
  ctx.arc(orbX, orbY, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.shadowColor = previewTheme.glow;
  ctx.shadowBlur = 20;
  ctx.fillStyle = previewTheme.core;
  ctx.beginPath();
  ctx.arc(orbX, orbY, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#0a0a0f';
  ctx.beginPath(); ctx.arc(orbX - 6, orbY - 3, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(orbX + 6, orbY - 3, 3, 0, Math.PI * 2); ctx.fill();

  for (let i = 0; i < previewLoadout.hp; i++) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i / Math.max(previewLoadout.hp, 3));
    const hx = orbX + Math.cos(angle) * 58;
    const hy = orbY + Math.sin(angle) * 58;
    ctx.fillStyle = previewTheme.accent;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.font = '12px ' + FONT;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#b7c4d8';
  ctx.fillText(previewTheme.desc[0], previewX + previewW / 2, previewY + 214);
  ctx.fillText(previewTheme.desc[1], previewX + previewW / 2, previewY + 230);

  const badgeY = previewY + 246;
  const badges = [
    { label: 'HP', value: String(previewLoadout.hp) },
    { label: 'STA', value: String(previewLoadout.stamina) },
    { label: 'SCORE', value: 'x' + previewLoadout.scoreMod },
  ];
  for (let i = 0; i < badges.length; i++) {
    const bx = previewX + 18 + i * 76;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.roundRect(bx, badgeY, 68, 34, 9);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = '10px ' + FONT;
    ctx.fillStyle = '#8ca0bc';
    ctx.fillText(badges[i].label, bx + 34, badgeY + 11);
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(badges[i].value, bx + 34, badgeY + 24);
  }

  ctx.textAlign = 'left';
  ctx.font = 'bold 12px ' + FONT;
  ctx.fillStyle = '#9cb3ce';
  ctx.fillText('Starting kit', previewX + 18, previewY + 292);

  const previewDefs = previewLoadout.powers
    .map(name => Object.values(POWER_DEFS).find(def => name.startsWith(def.name)))
    .filter(Boolean);
  if (previewDefs.length > 0) {
    for (let i = 0; i < previewDefs.length; i++) {
      const def = previewDefs[i];
      const chipW = previewDefs.length > 1 ? 108 : 220;
      const px = previewX + 18 + i * (chipW + 8);
      const py = previewY + 304;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.roundRect(px, py, chipW, 28, 10);
      ctx.fill();
      drawPowerIcon(def.icon, def.shape, px + 16, py + 14, 9);
      ctx.font = '11px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#d8e2f0';
      ctx.fillText(def.name, px + 32, py + 14);
    }
  } else {
    ctx.font = '11px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7f93b1';
    ctx.fillText(previewLoadout.id === 'hardcore' ? 'No powers, no revives, brutal stakes.' : 'Starts clean with no power advantage.', previewX + 18, previewY + 304);
  }

  if (!previewUnlocked) {
    ctx.font = '11px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = previewLoadout.id === 'hardcore' && canPurchaseHardcore(G.meta) ? '#ffdd66' : '#9aa5b4';
    ctx.fillText(previewLoadout.id === 'hardcore'
      ? (canPurchaseHardcore(G.meta) ? (isTouchUILayout() ? 'Tap to unlock' : 'Click or press Enter to unlock') : 'Locked progression challenge')
      : 'Unlock through meta progression', previewX + previewW / 2, previewY + previewH - 14);
  }

  ctx.restore();

  ctx.font = '14px ' + FONT;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#6c7992';
  ctx.fillText(
    isTouchUILayout()
      ? 'Tap a loadout to preview or equip'
      : 'Click a loadout or use WASD/Arrow keys · Enter selects · Esc returns',
    W / 2,
    H - 24
  );

  ctx.restore();
}

// --- Clarity: Threat Lines ---
function drawThreatLines() {
  const alive = G.enemies.filter(e => e.alive);
  if (alive.length < CLARITY.THREAT_LINE_THRESHOLD) return;
  const p = G.player;
  // Sort by distance, take closest within range
  const close = alive
    .map(e => ({ e, d: dist(p, e) }))
    .filter(o => o.d <= CLARITY.THREAT_LINE_RANGE)
    .sort((a, b) => a.d - b.d)
    .slice(0, CLARITY.THREAT_LINE_COUNT);
  if (close.length === 0) return;
  ctx.save();
  ctx.strokeStyle = '#ff0000';
  ctx.globalAlpha = CLARITY.THREAT_LINE_OPACITY;
  ctx.lineWidth = 1;
  for (const { e } of close) {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
  }
  ctx.restore();
}

// --- Clarity: Proximity Ring ---
function drawProximityRing() {
  const alive = G.enemies.filter(e => e.alive);
  if (alive.length <= CLARITY.PROXIMITY_RING_THRESHOLD) return;
  const p = G.player;
  if (!p) return;
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = CLARITY.PROXIMITY_RING_OPACITY;
  ctx.lineWidth = 1;
  ctx.setLineDash(CLARITY.PROXIMITY_RING_DASH);
  ctx.beginPath();
  ctx.arc(p.x, p.y, CLARITY.PROXIMITY_RING_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// --- Main Draw ---
function draw() {
  syncTouchOverlay();
  if (G.state === STATE.TITLE) { drawTitleScreen(); return; }
  if (G.state === STATE.STORY_INTRO) { drawStoryIntroScreen(); return; }
  if (G.state === STATE.MODE_SELECT) { drawModeSelectScreen(); return; }
  if (G.state === STATE.RELAY_CHAMBER) { drawRelayChamber(); return; }
  if (G.state === STATE.TRANSITION_ROOM) { drawTransitionRoom(); return; }
  if (G.state === STATE.UPGRADES) { drawUpgradeScreen(); return; }
  if (G.state === STATE.LOADOUT) { drawLoadoutScreen(); return; }
  if (G.state === STATE.RUN_SUMMARY) { drawRunSummary(); return; }
  if (G.state === STATE.GLOSSARY) { drawGlossaryScreen(); return; }
  if (G.state === STATE.SETTINGS) { drawSettingsScreen(); return; }

  ctx.save();
  ctx.translate(G.shakeX, G.shakeY);

  // 1. Background fill — use arc base fill color
  ctx.globalCompositeOperation = 'source-over';
  const arc = G.wave > 0 ? getStageArc(G.wave) : STAGE_ARCS[0];
  ctx.fillStyle = arc.baseFill;
  ctx.fillRect(-20, -20, W + 40, H + 40);

  // 2. Radial gradient overlay
  const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 500);
  bgGrad.addColorStop(0, 'rgba(30, 30, 60, 0.15)');
  bgGrad.addColorStop(1, 'rgba(10, 10, 15, 0)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 3a. Parallax background grid (larger scale, behind main grid, 0.3x scroll speed)
  const gridH = gridCanvas.height;
  const transOffset = G.waveTransitionOffset || 0;
  {
    const bgAlpha = 0.6;
    const bgYOff = transOffset > 0 ? (transOffset * 0.3) % gridH : 0;
    if (G.gridCrossfade > 0) {
      ctx.save();
      ctx.globalAlpha = bgAlpha * G.gridCrossfade;
      ctx.drawImage(bgGridCanvasOld, 0, bgYOff);
      if (bgYOff > 0) ctx.drawImage(bgGridCanvasOld, 0, bgYOff - gridH);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = bgAlpha * (1 - G.gridCrossfade);
      ctx.drawImage(bgGridCanvas, 0, bgYOff);
      if (bgYOff > 0) ctx.drawImage(bgGridCanvas, 0, bgYOff - gridH);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = bgAlpha;
      ctx.drawImage(bgGridCanvas, 0, bgYOff);
      if (bgYOff > 0) ctx.drawImage(bgGridCanvas, 0, bgYOff - gridH);
      ctx.restore();
    }
  }

  // 3b. Main grid lines (with wave transition scroll offset and crossfade)
  if (transOffset > 0) {
    const yOff = transOffset % gridH;
    if (G.gridCrossfade > 0) {
      ctx.save();
      ctx.globalAlpha = G.gridCrossfade;
      ctx.drawImage(gridCanvasOld, 0, yOff);
      if (yOff > 0) ctx.drawImage(gridCanvasOld, 0, yOff - gridH);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 1 - G.gridCrossfade;
      ctx.drawImage(gridCanvas, 0, yOff);
      if (yOff > 0) ctx.drawImage(gridCanvas, 0, yOff - gridH);
      ctx.restore();
    } else {
      ctx.drawImage(gridCanvas, 0, yOff);
      if (yOff > 0) ctx.drawImage(gridCanvas, 0, yOff - gridH);
    }

  } else {
    if (G.gridCrossfade > 0) {
      ctx.save();
      ctx.globalAlpha = G.gridCrossfade;
      ctx.drawImage(gridCanvasOld, 0, 0);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 1 - G.gridCrossfade;
      ctx.drawImage(gridCanvas, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(gridCanvas, 0, 0);
    }
  }

  // 3c. Parallax dot layer (always visible, scrolls at 50% during transitions, drifts during gameplay)
  if (G.waveTransitionParallaxDots && G.waveTransitionParallaxDots.length > 0) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#5588aa';
    const parallaxOff = transOffset * 0.5;
    for (const dot of G.waveTransitionParallaxDots) {
      const dy = ((dot.y + parallaxOff) % H + H) % H;
      ctx.beginPath();
      ctx.arc(dot.x, dy, dot.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 3d. Ambient background shapes (slow drifting, between grid and tint)
  drawAmbientShapes();

  // Environmental tint overlay — arc-based
  if (G.wave > 0) {
    const tintColor = getArcTintColor(G.wave);
    const tintAlpha = getArcTintAlpha(G.wave);
    ctx.save();
    const tintGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 550);
    tintGrad.addColorStop(0, tintColor);
    tintGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = tintAlpha;
    ctx.fillStyle = tintGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Arena border glow (viewport-fixed, drawn before transition offset)
  ctx.save();
  ctx.strokeStyle = '#2a2a4a';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#4a4aff';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.strokeRect(0, 0, W, H);
  ctx.restore();

  // Apply wave transition scroll offset to all game-world elements
  if (transOffset > 0) ctx.translate(0, transOffset);

  // Ambient particles (below enemies, above grid)
  drawAmbientParticles();

  // Boss wave vignette pulse during transition
  if (transOffset > 0) {
    const nextWave = G.wave + 1;
    if (nextWave === 10 || nextWave === 20 || nextWave === 30) {
      const pulseAlpha = 0.25 * Math.sin(Date.now() * 0.004 * Math.PI);
      if (pulseAlpha > 0) {
        ctx.save();
        const vigGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.7);
        const bossColor = nextWave === 10 ? '#ff8800' : nextWave === 20 ? '#ffffff' : '#8844cc';
        vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vigGrad.addColorStop(1, bossColor);
        ctx.globalAlpha = pulseAlpha;
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }
  }

  // Arena modifiers (drawn in source-over before switching to lighter)
  drawArenaModifiers();

  // Proximity ring — subtle dashed circle around player when enemies > 12
  drawProximityRing();

  // Threat lines — thin red lines from player to nearest close enemies
  drawThreatLines();

  // Boss extras (gravity wells, hazard zones, safe zone) drawn before enemies
  drawBossExtras();

  // 4. Switch to lighter for additive glow blending
  ctx.globalCompositeOperation = 'lighter';

  // 5. Wall bounce flashes
  drawWallFlashes();

  // 6. Power-ups on ground (hearts only now)
  drawPowerUps();

  // 6b. Boost pickups
  drawBoostPickups();

  // 6c. Shard pickups
  drawShardPickups();

  // 7. Enemies
  drawEnemies();

  // 7b. Dash path preview (kill markers + collectible rings)
  drawDashPreview();

  // 8. Pulser shockwave rings
  drawShockwaves();

  // 9. Player dash trail / afterimages
  drawAfterimages();

  // 10. Player orb + active power-up visuals
  // During wave transition: player stays viewport-fixed, afterimage trail handled by update
  if (transOffset > 0 && G.player) {
    ctx.translate(0, -transOffset); // exit world-space — player is viewport-fixed
    drawPlayer();
    ctx.translate(0, transOffset); // back to world-space
  } else {
    drawPlayer();
  }

  // 11. All particles
  drawParticles();

  // Collect rings
  drawCollectRings();

  // Multi-Pop explosions
  drawMultiPopExplosions();

  // Thunder Dash lingering trail
  drawThunderTrails();

  // Reverse wave transition offset before UI overlays
  if (transOffset > 0) ctx.translate(0, -transOffset);

  // 11b. Tap bounce ripples (mobile)
  drawTapBounceRipples();

  // 12. Switch back to source-over for UI
  ctx.globalCompositeOperation = 'source-over';

  // Combat text
  drawCombatTexts();

  // 13. Low HP vignette
  if (G.vignetteAlpha > 0) {
    const vGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.7);
    vGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vGrad.addColorStop(1, 'rgba(255, 0, 0, ' + G.vignetteAlpha + ')');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, W, H);
  }

  // 15. Combo floater text
  for (const f of G.floatTexts) {
    if (f.phase !== 'combo') continue;
    const scaleVal = lerp(1.2, 1, Math.min(1, f.scaleT));
    ctx.save();
    ctx.globalAlpha = f.alpha;
    ctx.translate(f.x, f.y);
    ctx.scale(scaleVal, scaleVal);
    drawGlowText(f.text, 0, 0, 'bold ' + f.size + 'px ' + FONT, f.color, f.glowColor, 8);
    ctx.restore();
  }

  // 15b. Burst text (no-glow float texts from burst-and-breathe pacing)
  drawBurstTexts();

  // 16. HUD
  drawHUD();

  // 16b. Boost timer bar
  drawBoostTimerBar();

  // 16c. Glossary unlock toasts
  drawToasts();

  // 16c2. "NEW: Aim your dash" tooltip (first 3 dashes after update)
  if (G.dashTooltipTimer > 0 && (G.state === STATE.PLAYING || G.state === STATE.BOSS_FIGHT)) {
    const ttAlpha = Math.min(1, G.dashTooltipTimer / 0.3);
    const isTouchDev = isTouchUILayout();
    const ttText = isTouchDev
      ? 'NEW: Drag on the right side to aim your dash!'
      : 'NEW: Aim your dash with the mouse!';
    ctx.save();
    ctx.globalAlpha = ttAlpha * 0.9;
    ctx.font = 'bold 16px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Background pill
    const tw = ctx.measureText(ttText).width + 24;
    const th = 32;
    const tx = W / 2, ty = H * 0.18;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.roundRect(tx - tw / 2, ty - th / 2, tw, th, 8);
    ctx.fill();
    // Text
    ctx.fillStyle = '#ffdd44';
    ctx.fillText(ttText, tx, ty);
    ctx.restore();
  }

  // Boss HP bar (on top of HUD)
  if (G.boss && G.boss.alive) drawBossHPBar();

  // 16d. Wave start screen flash (white, 0.1s)
  if (G.waveStartFlash > 0) {
    ctx.save();
    ctx.globalAlpha = G.waveStartFlash / 0.1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // 16e. Wave transition announce text (large "WAVE X" during scroll)
  if (G.state === STATE.WAVE_BREAK && G.waveTransitionAnnounce && G.waveTransitionOffset > 0) {
    const ann = G.waveTransitionAnnounce;
    const dur = ann.duration;
    const fadeIn = 0.3, fadeOut = 0.4;
    const t = ann.timer;
    let alpha = 0;
    if (t < fadeIn) alpha = t / fadeIn;
    else if (t < dur - fadeOut) alpha = 1;
    else if (t < dur) alpha = (dur - t) / fadeOut;
    if (alpha > 0) {
      ctx.save();
      ctx.globalAlpha = alpha;
      drawGlowText('WAVE ' + ann.wave, W / 2, H / 2, 'bold 56px ' + FONT, '#ffffff', '#00ffff', 18);
      ctx.restore();
    }
  }

  // 16f. Lore snippet during wave transition
  if (G.state === STATE.WAVE_BREAK) {
    drawLoreSnippet();
    drawEndlessEntryMessage();
  }

  // 17. Wave announce text & float texts (skip burst texts with null glowColor)
  for (const f of G.floatTexts) {
    if (f.phase === 'combo' || f.glowColor === null) continue;
    ctx.save();
    ctx.globalAlpha = f.alpha;
    if (f.phase === 'scale' || f.phase === 'hold' || f.phase === 'fade') {
      let size = f.size;
      if (f.phase === 'scale') size = f.size * lerp(1.5, 1, Math.min(1, f.scaleT));
      drawGlowText(f.text, f.x, f.y, 'bold ' + Math.round(size) + 'px ' + FONT, f.color, f.glowColor || '#00ffff', 12);
    } else if (f.phase === 'float') {
      drawGlowText(f.text, f.x, f.y, 'bold ' + f.size + 'px ' + FONT, f.color, f.glowColor || '#ffdd00', 8);
    }
    ctx.restore();
  }

  ctx.restore(); // end shake transform

  // 18. Power Select overlay (outside shake)
  if (G.state === STATE.POWER_SELECT) {
    drawPowerSelectScreen();
  }

  // Boss intro card overlay (outside shake)
  if (G.state === STATE.BOSS_INTRO_CARD) {
    drawBossIntro();
  }

  // Boss ready screen (wait for player)
  if (G.state === STATE.BOSS_READY) {
    drawBossReady();
  }

  // Boss tutorial overlay (first encounter)
  if (G.state === STATE.BOSS_TUTORIAL) {
    drawBossTutorial();
  }

  // 19. Game Over overlay (outside shake)
  if (G.state === STATE.GAME_OVER && G.freezeTimer <= 0) {
    ctx.save();
    ctx.globalAlpha = G.gameOverFadeIn * 0.75;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = G.gameOverFadeIn;

    const goBlur = 12 + 4 * Math.sin(G.gameOverTimer * Math.PI);
    const goText = G.isHardcore ? 'OBLITERATED' : 'GAME OVER';
    ctx.save();
    ctx.font = 'bold 56px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = G.isHardcore ? '#cc2222' : '#ff2222';
    ctx.shadowBlur = goBlur;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = G.isHardcore ? '#cc2222' : '#ff4444';
    ctx.fillText(goText, W / 2, H * 0.35);
    ctx.shadowBlur = 0;
    ctx.fillText(goText, W / 2, H * 0.35);
    ctx.restore();

    ctx.globalAlpha = G.gameOverFadeIn;
    drawGlowText('SCORE: ' + formatScore(G.score), W / 2, H * 0.35 + 50, 'bold 28px ' + FONT, '#ffffff', '#aaaaff', 6);

    const dispHighScore = G.isHardcore ? (G.meta.hardcoreHighScore || 0) : G.highScore;
    const isNew = G.score >= dispHighScore && G.score > 0;
    drawGlowText((G.isHardcore ? 'Hardcore ' : '') + 'High Score: ' + formatScore(dispHighScore), W / 2, H * 0.35 + 85,
      (isNew ? 'bold ' : '') + '22px ' + FONT, '#ffdd00', '#ffaa00', 6);

    if (isNew) {
      const newPulse = 0.6 + 0.4 * Math.sin(G.gameOverTimer * Math.PI * 4);
      const newBlur = 10 + 8 * Math.sin(G.gameOverTimer * Math.PI * 3);
      ctx.save();
      ctx.globalAlpha = G.gameOverFadeIn * newPulse;
      drawGlowText('NEW HIGH SCORE!', W / 2, H * 0.35 + 115, 'bold 20px ' + FONT, '#00ff88', '#00ff88', newBlur);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = G.gameOverFadeIn;
    ctx.font = '18px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('Wave ' + G.wave + '  ·  ' + formatTime(G.elapsedTime), W / 2, H * 0.35 + 140);
    ctx.restore();

    if (G.gameOverTimer > 1.5) {
      const restartPulse = 0.5 + 0.5 * Math.sin(G.gameOverTimer * Math.PI * 2);
      ctx.save();
      ctx.globalAlpha = G.gameOverFadeIn * restartPulse;
      ctx.font = '16px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#888888';
      ctx.fillText(isTouchUILayout() ? 'Tap for summary' : 'Click / Tap / Any Key for Summary', W / 2, H * 0.35 + 180);
      ctx.restore();
    }

    ctx.restore();
  }

  // 20. Pause overlay with power inventory (outside shake)
  if (G.state === STATE.PAUSED) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    // Title
    drawGlowText('PAUSED', W / 2, 60, 'bold 48px ' + FONT, '#ffffff', '#00ffff', 12);
    const isTouchDev = isTouchUILayout();
    const player = G.player;

    if (isTouchDev) {
      const panelX = 56;
      const panelW = W - 112;
      const powerPanelY = 106;
      const shownPowers = player.powers.slice(0, 6);
      const hiddenPowers = Math.max(0, player.powers.length - shownPowers.length);
      const powerRows = Math.max(1, Math.ceil(shownPowers.length / 2));
      const powerPanelH = 58 + powerRows * 40 + (hiddenPowers > 0 ? 18 : 0);

      ctx.save();
      ctx.fillStyle = 'rgba(10, 14, 24, 0.84)';
      ctx.beginPath();
      ctx.roundRect(panelX, powerPanelY, panelW, powerPanelH, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(110, 150, 200, 0.2)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.font = 'bold 13px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#d6e4ff';
      ctx.fillText('POWERS', panelX + 18, powerPanelY + 14);
      for (let i = 0; i < shownPowers.length; i++) {
        const power = shownPowers[i];
        const def = POWER_DEFS[power.id];
        const evoRecipe = !def ? EVOLUTION_RECIPES.find(r => r.id === power.id) : null;
        const name = def ? def.name : (evoRecipe ? evoRecipe.name : power.id);
        const color = def ? def.icon : (evoRecipe ? evoRecipe.icon : '#ffffff');
        const col = i % 2;
        const row = Math.floor(i / 2);
        const chipX = panelX + 18 + col * 330;
        const chipY = powerPanelY + 38 + row * 40;
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.roundRect(chipX, chipY, 312, 32, 10);
        ctx.fill();
        drawPowerIcon(color, def ? def.shape : (evoRecipe?.shape || 'circle'), chipX + 16, chipY + 16, 8);
        ctx.font = 'bold 12px ' + FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(name, chipX + 32, chipY + 12);
        ctx.font = '10px ' + FONT;
        ctx.fillStyle = '#8fa2bc';
        ctx.fillText('Level ' + power.level, chipX + 32, chipY + 22);
      }
      if (hiddenPowers > 0) {
        ctx.font = '11px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#7f93b1';
        ctx.fillText('+' + hiddenPowers + ' more powers active this run', W / 2, powerPanelY + powerPanelH - 10);
      }
      ctx.restore();

      let sigilRowY = powerPanelY + powerPanelH + 16;
      if (player.sigils && player.sigils.length) {
        ctx.save();
        ctx.font = 'bold 12px ' + FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#9db1cb';
        ctx.fillText('SIGILS', panelX + 4, sigilRowY);
        for (let i = 0; i < player.sigils.length; i++) {
          const sigilId = player.sigils[i];
          const cx = panelX + 64 + i * 34;
          if (sigilId === 'broodbreaker') drawPowerIcon('#ffb26f', 'diamond', cx, sigilRowY, 8);
          else if (sigilId === 'feedback') drawPowerIcon('#8dd8ff', 'bolt', cx, sigilRowY, 8);
        }
        ctx.restore();
        sigilRowY += 18;
      }

      const btnY = sigilRowY + 10;
      const btnW = 324;
      const btnH = 52;
      const btnGap = 12;
      const rowX = W / 2 - (btnW * 2 + btnGap) / 2;
      const pauseButtons = [
        { id: 'resume', label: 'Resume', x: rowX, y: btnY, accent: '#00ffaa' },
        { id: 'settings', label: 'Settings', x: rowX + btnW + btnGap, y: btnY, accent: '#9ab4ff' },
        { id: 'glossary', label: 'Codex', x: rowX, y: btnY + btnH + 12, accent: '#c98cff' },
        { id: 'quit', label: 'Quit Run', x: rowX + btnW + btnGap, y: btnY + btnH + 12, accent: '#ff6688', danger: true },
      ];
      for (const btn of pauseButtons) {
        const rect = { x: btn.x, y: btn.y, w: btnW, h: btnH };
        G['_pause' + btn.id.charAt(0).toUpperCase() + btn.id.slice(1) + 'BtnRect'] = rect;
        drawMenuButton(rect, btn.label, {
          hovered: G._pauseHoverAction === btn.id,
          accent: btn.accent,
          sublabel: '',
          danger: !!btn.danger,
        });
      }

      ctx.restore();
      return;
    }
    // Power inventory grid — 2 columns, widened cards
    const cardW = 370, cardH = 48, gapX = 12, gapY = 6;
    const gridW = cardW * 2 + gapX; // 752px
    const gridX = (W - gridW) / 2;  // 24px
    const gridY = 120;
    const totalSlots = Math.max(player.powers.length, MAX_POWER_SLOTS);
    const visibleSlots = Math.min(totalSlots, 12);

    for (let i = 0; i < visibleSlots; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = gridX + col * (cardW + gapX);
      const cy = gridY + row * (cardH + gapY);

      if (i < player.powers.length) {
        // Filled power card
        const power = player.powers[i];
        const def = POWER_DEFS[power.id];
        // For evolutions, look up recipe data
        const evoRecipe = !def ? EVOLUTION_RECIPES.find(r => r.id === power.id) : null;
        const name = def ? def.name : (evoRecipe ? evoRecipe.name : power.id);
        const color = def ? def.icon : (evoRecipe ? evoRecipe.icon : '#ffffff');
        const desc = def ? def.desc(power.level) : (evoRecipe ? evoRecipe.desc : '');

        // Card background
        ctx.save();
        ctx.fillStyle = '#1a1a2e';
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cardW, cardH, 4);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Left accent bar
        ctx.fillStyle = color;
        ctx.fillRect(cx, cy, 4, cardH);

        // Power name — 14px bold white
        ctx.font = 'bold 14px ' + FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(name, cx + 12, cy + cardH / 2 - 8);

        // Level stars — ★ in #ffdd44
        const stars = '★'.repeat(power.level);
        ctx.fillStyle = '#ffdd44';
        ctx.font = 'bold 12px ' + FONT;
        ctx.fillText(stars, cx + 12, cy + cardH / 2 + 10);

        // Effect summary — 11px #aaaacc right-aligned, truncated to fit card
        ctx.font = '11px ' + FONT;
        ctx.textAlign = 'right';
        ctx.fillStyle = '#aaaacc';
        const descMaxW = cardW - 22;
        let descText = desc;
        if (ctx.measureText(descText).width > descMaxW) {
          while (descText.length > 0 && ctx.measureText(descText + '…').width > descMaxW) {
            descText = descText.slice(0, -1);
          }
          descText = descText + '…';
        }
        ctx.fillText(descText, cx + cardW - 10, cy + cardH / 2);

        ctx.restore();
      } else {
        // Empty slot
        ctx.save();
        ctx.strokeStyle = '#333344';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.roundRect(cx, cy, cardW, cardH, 4);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = '12px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#444466';
        ctx.fillText('Empty', cx + cardW / 2, cy + cardH / 2);
        ctx.restore();
      }
    }

    let sigilRowY = gridY + Math.ceil(visibleSlots / 2) * (cardH + gapY) + 12;
    if (player.sigils && player.sigils.length) {
      ctx.save();
      ctx.font = 'bold 12px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#9db1cb';
      ctx.fillText('SIGILS', gridX, sigilRowY);
      for (let i = 0; i < player.sigils.length; i++) {
        const sigilId = player.sigils[i];
        const cx = gridX + 62 + i * 34;
        if (sigilId === 'broodbreaker') {
          drawPowerIcon('#ffb26f', 'diamond', cx, sigilRowY, 8);
        } else if (sigilId === 'feedback') {
          drawPowerIcon('#8dd8ff', 'bolt', cx, sigilRowY, 8);
        }
      }
      ctx.restore();
      sigilRowY += 20;
    }

    // --- Pause menu buttons ---
    const btnY = sigilRowY + 8;
    const btnW = isTouchDev ? 192 : 184, btnH = isTouchDev ? 44 : 40, btnGap = 12;
    const rowX = W / 2 - (btnW * 2 + btnGap) / 2;
    const pauseButtons = [
      { id: 'resume', label: 'Resume', key: 'P', x: rowX, y: btnY, accent: '#00ffaa' },
      { id: 'settings', label: 'Settings', key: 'S', x: rowX + btnW + btnGap, y: btnY, accent: '#9ab4ff' },
      { id: 'glossary', label: 'Codex', key: 'G', x: rowX, y: btnY + btnH + 10, accent: '#c98cff' },
      { id: 'quit', label: 'Quit Run', key: 'Q', x: rowX + btnW + btnGap, y: btnY + btnH + 10, accent: '#ff6688', danger: true },
    ];
    for (const btn of pauseButtons) {
      const rect = { x: btn.x, y: btn.y, w: btnW, h: btnH };
      G['_pause' + btn.id.charAt(0).toUpperCase() + btn.id.slice(1) + 'BtnRect'] = rect;
      drawMenuButton(rect, btn.label, {
        hovered: G._pauseHoverAction === btn.id,
        accent: btn.accent,
        sublabel: isTouchDev ? '' : 'Hotkey ' + btn.key,
        danger: !!btn.danger,
      });
    }

    const helpY = btnY + (btnH + 10) * 2 + 12;
    ctx.save();
    ctx.fillStyle = 'rgba(10, 14, 24, 0.78)';
    ctx.beginPath();
    ctx.roundRect(W / 2 - 210, helpY, 420, 64, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(110, 150, 200, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = 'bold 13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#d6e4ff';
    ctx.fillText('Controls', W / 2, helpY + 10);
    ctx.font = '12px ' + FONT;
    ctx.fillStyle = '#7e93b6';
    if (isTouchDev) {
      ctx.fillText('Left thumb joystick  •  Right thumb aim + release dash', W / 2, helpY + 30);
      ctx.fillText('Tap the pause button  •  Codex / settings / quit from pause', W / 2, helpY + 46);
    } else {
      ctx.fillText('WASD move  •  Mouse aim  •  Space dash/bounce', W / 2, helpY + 30);
      ctx.fillText('P pause  •  S settings  •  G codex  •  Q save and quit', W / 2, helpY + 46);
    }
    ctx.restore();

    ctx.restore();
  }

  // 21. Tutorial overlay (outside shake)
  if (G.state === STATE.TUTORIAL) {
    const isTouchDev = isTouchUILayout();
    const panelX = isTouchDev ? 96 : 110;
    const panelY = isTouchDev ? 144 : 142;
    const panelW = isTouchDev ? 608 : 580;
    const panelH = isTouchDev ? 208 : 246;
    const cardW = 170;
    const cardH = 84;
    const cardGap = 16;
    const cardsY = panelY + 96;
    const firstCardX = W / 2 - (cardW * 3 + cardGap * 2) / 2;

    ctx.save();
    const shadowGrad = ctx.createRadialGradient(W / 2, panelY + panelH * 0.55, 120, W / 2, panelY + panelH * 0.55, 360);
    shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    shadowGrad.addColorStop(1, 'rgba(4, 8, 18, 0.22)');
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(8, 14, 28, 0.76)';
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 22);
    ctx.fill();

    const panelStroke = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
    panelStroke.addColorStop(0, 'rgba(120, 235, 255, 0.72)');
    panelStroke.addColorStop(0.5, 'rgba(108, 138, 255, 0.34)');
    panelStroke.addColorStop(1, 'rgba(255, 210, 120, 0.30)');
    ctx.strokeStyle = panelStroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.globalAlpha = 0.10;
    ctx.drawImage(gridCanvas, panelX, panelY, panelW, panelH, panelX, panelY, panelW, panelH);
    ctx.globalAlpha = 1;

    if (isTouchDev) {
      drawGlowText('MOVE LEFT. DASH RIGHT.', W / 2, panelY + 40, 'bold 30px ' + FONT, '#78f3ff', '#78f3ff', 14);
      ctx.font = '17px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#c1d0e5';
      ctx.fillText('The gutter controls teach the run.', W / 2, panelY + 80);
      ctx.font = '15px ' + FONT;
      ctx.fillStyle = '#9fb0c8';
      ctx.fillText('Left stick steers the courier.', W / 2, panelY + 112);
      ctx.fillText('Right stick charges, aims, and releases your dash.', W / 2, panelY + 136);

      ctx.save();
      ctx.fillStyle = 'rgba(9, 18, 34, 0.92)';
      ctx.beginPath();
      ctx.roundRect(panelX + 64, panelY + panelH - 54, panelW - 128, 38, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120, 243, 255, 0.34)';
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.restore();

      const tutPulse = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(Date.now() / 500 * Math.PI));
      ctx.save();
      ctx.globalAlpha = tutPulse;
      ctx.font = 'bold 17px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#9fdfff';
      ctx.fillText('Tap to start', W / 2, panelY + panelH - 35);
      ctx.restore();
      ctx.restore();
      return;
    }

    drawGlowText('HOW TO PLAY', W / 2, panelY + 40, 'bold 32px ' + FONT, '#78f3ff', '#78f3ff', 16);
    ctx.font = '15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#b9c8de';
    ctx.fillText('Stay in motion, break through pressure, build power between waves.', W / 2, panelY + 68);

    const cards = [
      {
        title: 'MOVE',
        accent: '#78f3ff',
        lines: [
          isTouchDev ? 'Left thumb to move' : 'WASD to drift',
          'Keep your route alive',
        ],
      },
      {
        title: 'BREAK THROUGH',
        accent: '#ffd966',
        lines: isTouchDev
          ? ['Press right stick to charge', 'Aim, then release to dash']
          : ['Hold Space', 'Release to dash-kill'],
      },
      {
        title: 'DANGER',
        accent: '#ff7b8e',
        lines: [
          'Slow contact hurts you',
          'Pick powers between waves',
        ],
      },
    ];

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const cx = firstCardX + i * (cardW + cardGap);
      ctx.save();
      ctx.fillStyle = 'rgba(14, 20, 36, 0.92)';
      ctx.beginPath();
      ctx.roundRect(cx, cardsY, cardW, cardH, 16);
      ctx.fill();
      ctx.strokeStyle = card.accent;
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = card.accent;
      ctx.fillRect(cx + 16, cardsY + 14, 28, 4);
      ctx.font = 'bold 14px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillText(card.title, cx + 16, cardsY + 34);

      ctx.font = '12px ' + FONT;
      ctx.fillStyle = '#eef5ff';
      ctx.fillText(card.lines[0], cx + 16, cardsY + 54);
      ctx.fillStyle = '#a7b8d3';
      ctx.fillText(card.lines[1], cx + 16, cardsY + 70);
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = 'rgba(9, 18, 34, 0.92)';
    ctx.beginPath();
    ctx.roundRect(panelX + 88, panelY + panelH - 42, panelW - 176, 30, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 243, 255, 0.34)';
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.restore();

    const tutPulse = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(Date.now() / 500 * Math.PI));
    ctx.save();
    ctx.globalAlpha = tutPulse;
    ctx.font = 'bold 14px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#9fdfff';
    ctx.fillText(isTouchUILayout() ? 'Tap to start' : 'Click or press any key to start', W / 2, panelY + panelH - 27);
    ctx.restore();
    ctx.restore();
  }

  // 22. Collect flash overlay
  if (G.collectFlashAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = G.collectFlashAlpha;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

}

// --- Game Over → Run Summary transition ---
export function transitionToRunSummary() {
  clearRunState(); // Wipe saved run on death or completion
  const prevBest = G.isHardcore ? (G.meta.hardcoreBestWave || 0) : G.meta.bestWave;
  const bonusInfo = calculateRunBonusShards(G.runWaves, G.score, G.wave, prevBest);

  // Collect power info for display (with shape + name from POWER_DEFS)
  const powersHeld = G.player.powers.map(p => {
    const def = POWER_DEFS[p.id];
    return { id: p.id, icon: def ? def.icon : '#ffffff', shape: def ? def.shape : 'circle', name: def ? def.name : p.id };
  });

  // Physical shards collected during gameplay
  const collectedShards = G.shardsCollected || 0;
  // Boss shard bonus (awarded directly, not physical drops)
  const bossShards = G.bossShardBonus || 0;
  // Subtotal before multipliers
  let subtotal = collectedShards + bonusInfo.subtotal + bossShards;
  // Apply Shard Magnet upgrade (+25%)
  let totalShards = applyShardMagnetBonus(subtotal, G.meta);

  // Hardcore: 1.75x shard multiplier (stacks with Shard Magnet)
  let hardcoreMultiplied = 0;
  let hardcoreMilestoneBonus = 0;
  let hardcoreFirstClearBonus = 0;
  if (G.isHardcore) {
    hardcoreMultiplied = Math.floor(totalShards * 1.75);
    totalShards = hardcoreMultiplied;
    hardcoreMilestoneBonus = getHardcoreWaveMilestoneBonus(G.wave);
    totalShards += hardcoreMilestoneBonus;
    // First clear bonus
    if (G.wave >= 30 && !G.meta.hardcoreFirstClear) {
      hardcoreFirstClearBonus = 500;
      totalShards += hardcoreFirstClearBonus;
      G.meta.hardcoreFirstClear = true;
    }
  }

  G.runSummary = {
    kills: G.runKills,
    waves: G.runWaves,
    score: G.score,
    powersHeld,
    collectedShards,
    waveShards: bonusInfo.waves,
    scoreShards: bonusInfo.score,
    recordShards: bonusInfo.record,
    bossShards,
    subtotal,
    total: totalShards,
    hasShardMagnet: G.meta.unlocks.includes(7),
    isVictory: G.isVictory || false,
    endlessUnlocked: G.runUnlockedEndlessThisRun || false,
    isHardcore: G.isHardcore,
    isEndlessRun: !!G.isEndlessRun,
    mode: G.isEndlessRun ? 'endless' : 'story',
    hardcoreMultiplied,
    hardcoreMilestoneBonus,
    hardcoreFirstClearBonus,
    telemetry: G.runTelemetry,
  };

  if (G.runTelemetry && !G.runTelemetry.leaderboardSubmitted) {
    G.runTelemetry.leaderboardSubmitted = true;
    void platformSDK.submitLeaderboardScore(G.score, {
      mode: G.runSummary.mode,
      victory: G.runSummary.isVictory,
      wave: G.wave,
    });
  }

  // Apply shards to meta
  G.meta.shards += totalShards;
  G.meta.totalShardsEarned += totalShards;
  G.meta.totalRuns++;
  G.meta.totalKills += G.runKills;
  if (G.isHardcore) {
    if (G.wave > (G.meta.hardcoreBestWave || 0)) G.meta.hardcoreBestWave = G.wave;
  } else {
    if (G.wave > G.meta.bestWave) G.meta.bestWave = G.wave;
  }
  recordRunAnalytics(G.meta, {
    loadout: G.meta.selectedLoadout || 'standard',
    isEndlessRun: !!G.isEndlessRun,
    isVictory: !!(G.isVictory || false),
    wave: G.wave,
    score: G.score,
    kills: G.runKills,
    damageTaken: G.runTelemetry?.damageTaken || 0,
    revivesUsed: G.runTelemetry?.revivesUsed || 0,
    killSources: G.runTelemetry?.killSources || {},
    powersHeld: powersHeld.map(p => p.id),
  });
  saveMeta(G.meta);

  G.state = STATE.RUN_SUMMARY;
  G.runSummaryTimer = 0;
  G.runSummaryShardCounter = 0;
  G.runSummaryScoreCounter = 0;
  G.runSummaryReady = false;
  G.summaryParticles = [];

  // Spawn victory particle burst for boss-defeat runs
  if (G.runSummary.isVictory) {
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 200;
      G.summaryParticles.push({
        x: W / 2, y: 60,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 2 + Math.random() * 4,
        initR: 2 + Math.random() * 4,
        color: ['#ffdd44', '#ffaa00', '#ff8844', '#ffffff'][Math.floor(Math.random() * 4)],
        alpha: 1,
        life: 1.0 + Math.random() * 1.5,
        maxLife: 1.0 + Math.random() * 1.5,
      });
    }
  }

  G.isVictory = false;
}

// --- Game Loop ---
function gameLoop(now) {
  requestAnimationFrame(gameLoop);
  if (!G.lastTime) G.lastTime = now;
  let dt = (now - G.lastTime) / 1000;
  G.lastTime = now;
  dt = Math.min(dt, 0.05);
  const orientationBlocked = isTouchPortraitBlocked();
  if (orientationBlocked) {
    clearTouchSticks();
    if (G.player?.dashCharging) cancelDashCharge(true);
  } else {
    updateTransition(dt);
    update(dt);
  }
  draw();
  if (!orientationBlocked) drawTransition();
}

// --- Initialize ---
async function bootstrap() {
  setupCrazyGames();          // detect & activate CrazyGames adapter (no-op elsewhere)
  setupPoki();                // detect & activate Poki adapter (no-op elsewhere)
  setupGameDistribution();    // detect & activate GameDistribution adapter (no-op elsewhere)

  await Promise.resolve(platformSDK.init());
  platformSDK.loadingProgress(0.5);

  // Reload persisted state after platform storage is ready.
  G.meta = loadMeta();
  G.highScore = loadHighScore();

  setupInput();
  setupGlossaryTracking();

  // Restore saved audio settings
  const savedSettings = loadSettings();
  if (savedSettings) {
    if (typeof savedSettings.musicVolume === 'number') setMusicVolume(savedSettings.musicVolume);
    if (typeof savedSettings.sfxVolume === 'number') setSfxVolume(savedSettings.sfxVolume);
    if (savedSettings.muted) toggleMute();
  }

  platformSDK.loadingProgress(1);
  platformSDK.loadingDone();
  G.state = STATE.TITLE;

  // Start title music on very first user gesture (browsers require gesture for AudioContext)
  function _onFirstGesture() {
    ensureTitleMusicStarted();
    document.removeEventListener('pointerdown', _onFirstGesture);
    document.removeEventListener('keydown', _onFirstGesture);
  }
  document.addEventListener('pointerdown', _onFirstGesture, { once: true });
  document.addEventListener('keydown', _onFirstGesture, { once: true });

  requestAnimationFrame(gameLoop);
}

bootstrap();
