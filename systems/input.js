'use strict';

import { W, H, STATE, BOUNCE_MIN_SPEED, DASH_COOLDOWN, DASH_SPEED,
  STAMINA_DASH_COST, STAMINA_REGEN_DELAY,
  CHARGE_TAP_THRESHOLD, CHARGE_MAX_DURATION, CHARGE_INITIAL_COST_RATIO,
  CHARGE_DRAIN_RATE_RATIO, CHARGE_SPEED_MIN, CHARGE_SPEED_MAX,
  CHARGE_GRACE_MIN, CHARGE_GRACE_MAX, CHARGE_RECOVERY_MIN, CHARGE_RECOVERY_MAX,
  CHARGE_DASH_MASTER_TAP, CHARGE_POWER_SCALE_MIN, CHARGE_POWER_SCALE_MAX,
  CHARGE_TIMEWARP_SCALE_MIN, CHARGE_TIMEWARP_SCALE_MAX,
  CHARGE_THUNDER_TRAIL_MIN, CHARGE_THUNDER_TRAIL_MAX,
  CHARGE_OVERDRIVE_SPEED_MUL,
  AIM_CANCEL_RADIUS, DIFFICULTY_DASH_OVERRIDES,
  DASH_TOOLTIP_COUNT, DASH_TOOLTIP_DURATION, DASH_TOOLTIP_STORAGE_KEY } from '../config.js';
import { mag } from '../utils.js';
import { G, resetGameState, restoreRunState } from '../state.js';
import { C } from '../canvas.js';
import { getCardAtPosition } from './cards.js';
import { UPGRADES, canPurchaseUpgrade, purchaseUpgrade, LOADOUTS, isLoadoutUnlocked, saveMeta, canPurchaseHardcore, purchaseHardcore } from './meta.js';
import { POWER_DEFS, getPlayerPower } from './powers.js';
import { isFreeDash } from './lootcrate.js';
import { hitEnemy, killEnemy } from '../entities/enemy.js';
import { dist } from '../utils.js';
import { spawnParticles } from './particles.js';
import { FX_THUNDER_TRAIL_LIMIT, pushCapped } from './runtime-flags.js';
import { ensureTitleMusicStarted, sfxDash, sfxUIClick, sfxCardPick, startMusic, stopMusic, setBossMusic, setMusicState,
  getMusicVolume, getSfxVolume, isMuted, setMusicVolume, setSfxVolume, toggleMute } from './audio.js';
import { saveRunState, hasSavedRun, clearRunState, saveSettings } from './save.js';
import { getStorageItem, setStorageItem } from './storage.js';
import { openGlossary, closeGlossary, glossaryInput, glossaryClickTest, glossaryDetailWheel } from './glossary.js';

function quitRun() {
  // Skip save if no meaningful progress (wave 1, no kills)
  if (G.wave <= 1 && G.runKills === 0) {
    clearRunState();
  } else {
    saveRunState(G);
  }
  setMusicState('title'); // Keep music alive, transition to title ambience
  G.state = STATE.TITLE;
}

function resumeFromPause() {
  G.state = G._prevState || STATE.PLAYING;
}

function openPauseMenu() {
  if (G.player?.dashCharging) cancelDashCharge(true);
  G._prevState = G.state;
  G.state = STATE.PAUSED;
}

function hitTest(x, y, rect) {
  return rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function canvasCoords(cx, cy) {
  const rect = C.getBoundingClientRect();
  return { x: (cx - rect.left) / rect.width * W, y: (cy - rect.top) / rect.height * H };
}

function claimInputFocus() {
  try { window.focus(); } catch {}
  if (document.activeElement === C) return;
  try { C.focus({ preventScroll: true }); }
  catch {
    try { C.focus(); } catch {}
  }
}

function openSettings(fromState) {
  G._settingsPrevState = fromState;
  G._settingsCursor = 0;
  G._settingsHoverBack = false;
  G._settingsHoverMute = false;
  G.state = STATE.SETTINGS;
}

function closeSettings() {
  // Persist current audio state
  saveSettings({ musicVolume: getMusicVolume(), sfxVolume: getSfxVolume(), muted: isMuted() });
  G.state = G._settingsPrevState || STATE.TITLE;
}

function settingsAdjust(delta) {
  const step = 0.05;
  if (G._settingsCursor === 0) {
    setMusicVolume(Math.round((getMusicVolume() + delta * step) * 100) / 100);
  } else if (G._settingsCursor === 1) {
    setSfxVolume(Math.round((getSfxVolume() + delta * step) * 100) / 100);
    sfxUIClick(); // preview SFX at new volume
  }
}

function settingsToggleMute() {
  toggleMute();
  saveSettings({ musicVolume: getMusicVolume(), sfxVolume: getSfxVolume(), muted: isMuted() });
}

// Mode select card positions (must match draw code)
const MODE_CARD_W = 260, MODE_CARD_H = 280;
const MODE_STORY_X = 260 - MODE_CARD_W / 2, MODE_STORY_Y = 320 - MODE_CARD_H / 2;
const MODE_ENDLESS_X = 540 - MODE_CARD_W / 2, MODE_ENDLESS_Y = 320 - MODE_CARD_H / 2;

function modeSelectCardAt(x, y) {
  if (x >= MODE_STORY_X && x <= MODE_STORY_X + MODE_CARD_W && y >= MODE_STORY_Y && y <= MODE_STORY_Y + MODE_CARD_H) return 0;
  if (x >= MODE_ENDLESS_X && x <= MODE_ENDLESS_X + MODE_CARD_W && y >= MODE_ENDLESS_Y && y <= MODE_ENDLESS_Y + MODE_CARD_H) return 1;
  return -1;
}

function beginStoryRun() {
  G.isEndlessRun = false;
  G.storyIntro = { timer: 0, skipReady: false, canAdvance: false };
  setMusicState('title');
  G.state = STATE.STORY_INTRO;
}

function confirmModeSelect(cursor) {
  if (cursor === 1) {
    G.isEndlessRun = true;
    resetGameState();
    startMusic();
    return;
  }
  beginStoryRun();
}

function getLoadoutCardAt(x, y) {
  if (!G._loadoutCardRects) return -1;
  for (let i = 0; i < G._loadoutCardRects.length; i++) {
    if (hitTest(x, y, G._loadoutCardRects[i])) return i;
  }
  return -1;
}

function activateLoadout(index) {
  const l = LOADOUTS[index];
  if (!l) return false;
  G.loadoutCursor = index;
  if (isLoadoutUnlocked(G.meta, l.id)) {
    G.meta.selectedLoadout = l.id;
    saveMeta(G.meta);
    sfxCardPick();
    return true;
  }
  if (l.id === 'hardcore' && canPurchaseHardcore(G.meta)) {
    purchaseHardcore(G.meta);
    sfxCardPick();
    return true;
  }
  return false;
}

function beginTitleRun() {
  if (G._titleTransitioning) return;
  ensureTitleMusicStarted();
  G._titleTransitioning = true;
  import('../game.js').then(m => m.startTransition(() => {
    G._titleTransitioning = false;
    const hasEndless = G.meta.unlocks.includes(15) || G.meta.endlessUnlocked;
    if (hasEndless) {
      clearRunState();
      G.modeSelectCursor = 0;
      G.state = STATE.MODE_SELECT;
      return;
    }
    clearRunState();
    beginStoryRun();
  }, 3.33));
}

function continueTitleRun() {
  if (!hasSavedRun() || G._titleTransitioning) return;
  ensureTitleMusicStarted();
  G._titleTransitioning = true;
  import('../game.js').then(m => m.startTransition(() => {
    G._titleTransitioning = false;
    restoreRunState();
    clearRunState();
    startMusic();
  }, 3.33));
}

function getTitleActionAt(x, y) {
  if (hitTest(x, y, G._titlePlayBtnRect)) return 'play';
  if (hitTest(x, y, G._titleContinueBtnRect)) return 'continue';
  if (hitTest(x, y, G._titleUpgradesBtnRect)) return 'upgrades';
  if (hitTest(x, y, G._titleLoadoutBtnRect)) return 'loadout';
  if (hitTest(x, y, G._titleGlossaryBtnRect)) return 'glossary';
  if (hitTest(x, y, G._titleSettingsBtnRect)) return 'settings';
  return null;
}

function activateTitleAction(action) {
  if (!action) return false;
  ensureTitleMusicStarted();
  if (action === 'play') {
    beginTitleRun();
    return true;
  }
  if (action === 'continue') {
    continueTitleRun();
    return true;
  }
  if (action === 'upgrades') {
    sfxUIClick();
    openUpgradesScreen(STATE.TITLE);
    return true;
  }
  if (action === 'loadout') {
    sfxUIClick();
    G.state = STATE.LOADOUT;
    G.loadoutCursor = 0;
    return true;
  }
  if (action === 'glossary') {
    sfxUIClick();
    openGlossary(STATE.TITLE);
    return true;
  }
  if (action === 'settings') {
    sfxUIClick();
    openSettings(STATE.TITLE);
    return true;
  }
  return false;
}

function getPauseActionAt(x, y) {
  if (hitTest(x, y, G._pauseResumeBtnRect)) return 'resume';
  if (hitTest(x, y, G._pauseSettingsBtnRect)) return 'settings';
  if (hitTest(x, y, G._pauseGlossaryBtnRect)) return 'glossary';
  if (hitTest(x, y, G._pauseQuitBtnRect)) return 'quit';
  return null;
}

function activatePauseAction(action) {
  if (action === 'resume') { sfxUIClick(); resumeFromPause(); return true; }
  if (action === 'settings') { sfxUIClick(); openSettings(STATE.PAUSED); return true; }
  if (action === 'glossary') { sfxUIClick(); openGlossary(STATE.PAUSED); return true; }
  if (action === 'quit') { sfxUIClick(); quitRun(); return true; }
  return false;
}

function shouldShowRelayChamber() {
  const s = G.runSummary;
  return !!(s && !s.isVictory && !s.isEndlessRun);
}

function continueFromRunSummary() {
  if (!G.runSummaryReady) return false;
  sfxUIClick();
  if (shouldShowRelayChamber()) {
    import('../game.js').then(m => m.startTransition(() => m.enterRelayChamber(), 4.5));
  } else {
    setMusicState('title');
    G.state = STATE.TITLE;
  }
  return true;
}

function getRelayActionAt(x, y) {
  if (hitTest(x, y, G._relayActionRects.runback)) return 'runback';
  if (hitTest(x, y, G._relayActionRects.upgrades)) return 'upgrades';
  if (hitTest(x, y, G._relayActionRects.menu)) return 'menu';
  return null;
}

function getRelayUpgradeAt(x, y) {
  if (!G._relayUpgradeRects) return -1;
  for (let i = 0; i < G._relayUpgradeRects.length; i++) {
    if (hitTest(x, y, G._relayUpgradeRects[i])) return i;
  }
  return -1;
}

function getRelayLoadoutAt(x, y) {
  if (!G._relayLoadoutRects) return -1;
  for (let i = 0; i < G._relayLoadoutRects.length; i++) {
    if (hitTest(x, y, G._relayLoadoutRects[i])) return i;
  }
  return -1;
}

function getTransitionRoomOptionAt(x, y) {
  if (!G._transitionOptionRects) return -1;
  for (let i = 0; i < G._transitionOptionRects.length; i++) {
    if (hitTest(x, y, G._transitionOptionRects[i])) return i;
  }
  return -1;
}

function openUpgradesScreen(fromState) {
  G._upgradesPrevState = fromState;
  G.upgradeCursor = 0;
  G.state = STATE.UPGRADES;
}

function activateRelayAction(action) {
  if (!G.relayChamber || !action) return false;
  if (action === 'runback') {
    sfxUIClick();
    import('../game.js').then(m => m.startRunFromRelayChamber());
    return true;
  }
  if (action === 'upgrades') {
    sfxUIClick();
    const firstQuickUpgrade = G.relayChamber.quickUpgradeIds?.[0];
    const firstIndex = firstQuickUpgrade ? UPGRADES.findIndex(u => u.id === firstQuickUpgrade) : 0;
    G.upgradeCursor = Math.max(0, firstIndex);
    openUpgradesScreen(STATE.RELAY_CHAMBER);
    return true;
  }
  if (action === 'menu') {
    sfxUIClick();
    setMusicState('title');
    G.relayChamber = null;
    G.state = STATE.TITLE;
    return true;
  }
  return false;
}

function purchaseRelayUpgrade(index) {
  if (!G.relayChamber) return false;
  const upgradeId = G.relayChamber.quickUpgradeIds?.[index];
  if (!upgradeId || !canPurchaseUpgrade(G.meta, upgradeId)) return false;
  sfxCardPick();
  purchaseUpgrade(G.meta, upgradeId);
  import('../game.js').then(m => m.refreshRelayChamber());
  return true;
}

function previewRelayLoadout(index) {
  if (!G.relayChamber) return false;
  if (index < 0 || index >= LOADOUTS.length) return false;
  G.relayChamber.loadoutIndex = index;
  return true;
}

function equipRelayLoadout(index) {
  if (!previewRelayLoadout(index)) return false;
  const loadout = LOADOUTS[index];
  if (!loadout || !isLoadoutUnlocked(G.meta, loadout.id)) return false;
  G.meta.selectedLoadout = loadout.id;
  saveMeta(G.meta);
  sfxCardPick();
  return true;
}

function handleInput(x, y) {
  // Settings screen clicks
  if (G.state === STATE.SETTINGS) {
    if (hitTest(x, y, G._settingsBackBtnRect)) { sfxUIClick(); closeSettings(); return; }
    if (hitTest(x, y, G._settingsMuteBtnRect)) { sfxUIClick(); settingsToggleMute(); return; }
    // Slider clicks
    if (G._settingsSliderRects) {
      for (let i = 0; i < G._settingsSliderRects.length; i++) {
        const r = G._settingsSliderRects[i];
        if (hitTest(x, y, r)) {
          const val = Math.max(0, Math.min(1, (x - r.x) / r.w));
          if (i === 0) setMusicVolume(val);
          else setSfxVolume(val);
          G._settingsCursor = i;
          saveSettings({ musicVolume: getMusicVolume(), sfxVolume: getSfxVolume(), muted: isMuted() });
          return;
        }
      }
    }
    return;
  }
  // Pause menu button clicks
  if (G.state === STATE.PAUSED) {
    if (activatePauseAction(getPauseActionAt(x, y))) return;
    return;
  }
  if (G.state === STATE.TITLE) {
    if (activateTitleAction(getTitleActionAt(x, y))) return;
    if (G._titleTransitioning) return;
    beginTitleRun();
    return;
  }
  if (G.state === STATE.RELAY_CHAMBER) {
    const action = getRelayActionAt(x, y);
    if (action) {
      G.relayChamber.focusSection = 'cta';
      G.relayChamber.ctaIndex = ['runback', 'upgrades', 'menu'].indexOf(action);
      activateRelayAction(action);
      return;
    }
    const upgradeIndex = getRelayUpgradeAt(x, y);
    if (upgradeIndex >= 0) {
      G.relayChamber.focusSection = 'upgrades';
      G.relayChamber.upgradeIndex = upgradeIndex;
      purchaseRelayUpgrade(upgradeIndex);
      return;
    }
    const loadoutIndex = getRelayLoadoutAt(x, y);
    if (loadoutIndex >= 0) {
      G.relayChamber.focusSection = 'loadouts';
      G.relayChamber.loadoutIndex = loadoutIndex;
      equipRelayLoadout(loadoutIndex);
      return;
    }
    return;
  }
  if (G.state === STATE.TRANSITION_ROOM && G.transitionRoom) {
    if (G.transitionRoom.preludeActive) {
      if (G.transitionRoom.preludeReady) {
        import('../game.js').then(m => m.advanceTransitionRoomPrelude());
      }
      return;
    }
    const optionIndex = getTransitionRoomOptionAt(x, y);
    if (optionIndex >= 0) {
      import('../game.js').then(m => m.chooseTransitionRoomOption(optionIndex));
      return;
    }
    if (hitTest(x, y, G._transitionContinueRect)) {
      import('../game.js').then(m => m.continueTransitionRoom());
      return;
    }
    return;
  }
  if (G.state === STATE.STORY_INTRO) {
    if (G.storyIntro?.beat === 3) return;
    import('../game.js').then(m => m.advanceStoryIntro());
    return;
  }
  if (G.state === STATE.LOADOUT) {
    const idx = getLoadoutCardAt(x, y);
    if (idx >= 0) {
      activateLoadout(idx);
      return;
    }
    return;
  }
  if (G.state === STATE.MODE_SELECT) {
    // Click handled separately in mousedown/touch
    return;
  }
  if (G.state === STATE.BOSS_INTRO_CARD) {
    // Skip boss intro if skippable
    import('../systems/boss.js').then(m => m.skipBossIntro());
    return;
  }
  if (G.state === STATE.BOSS_READY) {
    import('../systems/boss.js').then(m => m.confirmBossReady());
    return;
  }
  if (G.state === STATE.BOSS_TUTORIAL) {
    import('../systems/boss.js').then(m => m.dismissBossTutorial());
    return;
  }
  if (G.state === STATE.GAME_OVER) {
    if (G.gameOverTimer > 1.5) {
      import('../game.js').then(m => m.transitionToRunSummary());
    }
    return;
  }
  if (G.state === STATE.RUN_SUMMARY) {
    continueFromRunSummary();
    return;
  }
  if (G.state === STATE.TUTORIAL) { G.tutorialDismissed = true; G.state = STATE.PLAYING; return; }
}

function pickCard(index) {
  if (G.state !== STATE.POWER_SELECT) return;
  if (G.cardPickAnim) return; // already animating
  if (index < 0 || index >= G.cardOffering.length) return;
  G.cardPickAnim = { index, t: 0 };
  sfxCardPick();
}

function handleCardClick(x, y) {
  if (G.state !== STATE.POWER_SELECT) return;
  if (G.cardPickAnim) return;
  const idx = getCardAtPosition(x, y);
  if (idx >= 0) pickCard(idx);
}

function handleCardHover(x, y) {
  if (G.state !== STATE.POWER_SELECT) return;
  G.cardHover = getCardAtPosition(x, y);
}

// --- Charge-aware dash helpers ---

function getDifficultyOverrides() {
  const loadout = G.meta.selectedLoadout || 'standard';
  return DIFFICULTY_DASH_OVERRIDES[loadout] || DIFFICULTY_DASH_OVERRIDES.standard;
}

function getEffectiveBase() {
  return STAMINA_DASH_COST - (G.player.dashCostReduction || 0);
}

function getInitialCost() {
  if (isFreeDash()) return 0;
  const overrides = getDifficultyOverrides();
  const reduction = G.player.dashCostReduction || 0;
  return Math.max(0, overrides.initialCost - reduction);
}

function getDrainRate() {
  if (isFreeDash()) return 0;
  return getEffectiveBase() * CHARGE_DRAIN_RATE_RATIO;
}

function getChargeLevel(holdTime) {
  const tapThresh = G.meta.unlocks.includes(9) ? CHARGE_DASH_MASTER_TAP : CHARGE_TAP_THRESHOLD;
  if (holdTime <= tapThresh) return 0;
  return Math.min(1, (holdTime - tapThresh) / (CHARGE_MAX_DURATION - tapThresh));
}

function getDashSpeedBonus() {
  const player = G.player;
  let bonus = 0;
  // Thunder Dash evolution (+500)
  if (player.powers.find(p => p.id === 'thunderDash')) {
    bonus = Math.max(bonus, 500);
  }
  // Surge power (convert old absolute dashSpeed to additive bonus)
  if (player.surgeActive && player.surgeDashSpeed) {
    bonus = Math.max(bonus, player.surgeDashSpeed - DASH_SPEED);
  }
  // Reflective Shield evolution (permanent Surge L1: +400)
  if (player.powers.find(p => p.id === 'reflectiveShield')) {
    bonus = Math.max(bonus, 400);
  }
  return bonus;
}

function getDashSpeed(t) {
  const bonus = getDashSpeedBonus();
  let speed = (CHARGE_SPEED_MIN + bonus) + (CHARGE_SPEED_MAX - CHARGE_SPEED_MIN) * t;
  // Overdrive: 1.2× multiplier applied AFTER all additive bonuses
  if (G.player.overdriveTimer > 0) {
    speed *= CHARGE_OVERDRIVE_SPEED_MUL;
  }
  return speed;
}

function getDashCooldown() {
  return G.meta.unlocks.includes(9) ? 0.12 : DASH_COOLDOWN;
}

export function isTouchActive() {
  return G.joystick.active || (G.player && G.player.dashChargeTouchId !== null);
}

function getDashDirection() {
  const player = G.player;

  // --- Mobile: active dash touch aims directly ---
  if (player.dashCharging && player.dashChargeTouchId !== null) {
    const dx = G.mouseX - player.x;
    const dy = G.mouseY - player.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < AIM_CANCEL_RADIUS) {
      return { bdx: 0, bdy: 0, cancel: true };
    }
    return { bdx: dx / d, bdy: dy / d, cancel: false };
  }

  // --- Mobile: joystick direction fallback ---
  if (isTouchActive()) {
    if (G.joystick.active && (G.joystick.dx !== 0 || G.joystick.dy !== 0)) {
      const jLen = Math.sqrt(G.joystick.dx * G.joystick.dx + G.joystick.dy * G.joystick.dy);
      return { bdx: G.joystick.dx / jLen, bdy: G.joystick.dy / jLen, cancel: false };
    }
    // Joystick neutral — check velocity fallback
    const spd = mag(player.vx, player.vy);
    if (spd > 30) {
      return { bdx: player.vx / spd, bdy: player.vy / spd, cancel: false };
    }
    // Neutral joystick + low velocity = cancel
    return { bdx: 0, bdy: 0, cancel: true };
  }

  // --- Desktop: mouse cursor direction ---
  const dx = G.mouseX - player.x;
  const dy = G.mouseY - player.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < AIM_CANCEL_RADIUS) {
    // Mouse too close to ball center — cancel
    return { bdx: 0, bdy: 0, cancel: true };
  }
  return { bdx: dx / d, bdy: dy / d, cancel: false };
}

function performDash(bdx, bdy, t) {
  const player = G.player;
  const dashSpd = getDashSpeed(t);
  const overrides = getDifficultyOverrides();
  const graceTime = overrides.graceMin + (overrides.graceMax - overrides.graceMin) * t;
  const recoveryTime = CHARGE_RECOVERY_MIN + (CHARGE_RECOVERY_MAX - CHARGE_RECOVERY_MIN) * t;

  player.vx = bdx * dashSpd;
  player.vy = bdy * dashSpd;
  player.dashGraceTimer = graceTime;
  player.dashRecoveryTimer = 0;
  player.pendingRecoveryTime = recoveryTime;
  player.dashCooldown = getDashCooldown();
  // Stamina already deducted during charge (initial cost + continuous drain)
  player.staminaRegenDelay = STAMINA_REGEN_DELAY;
  player.eyeSquashTimer = 0.15;

  // Clear charging state
  player.dashCharging = false;
  player.dashChargeTime = 0;
  player.dashChargeStaminaDrained = 0;
  player.dashChargeTouchId = null;

  sfxDash();

  // First-3-dashes "NEW" tooltip
  if (!getStorageItem(DASH_TOOLTIP_STORAGE_KEY)) {
    G.dashTooltipCount++;
    G.dashTooltipTimer = DASH_TOOLTIP_DURATION;
    if (G.dashTooltipCount >= DASH_TOOLTIP_COUNT) {
      setStorageItem(DASH_TOOLTIP_STORAGE_KEY, '1');
    }
  }

  // Power scale factor for charge level
  const powerScale = CHARGE_POWER_SCALE_MIN + (CHARGE_POWER_SCALE_MAX - CHARGE_POWER_SCALE_MIN) * t;

  // Dash Burst: explosion at launch point, radius scaled by charge
  const dashBurst = getPlayerPower('dashBurst');
  const novaCore = player.powers.find(p => p.id === 'novaCore');
  const dashBurstVals = dashBurst
    ? POWER_DEFS.dashBurst.levels[dashBurst.level - 1]
    : (novaCore ? POWER_DEFS.dashBurst.levels[2] : null);
  if (dashBurstVals) {
    const scaledRadius = dashBurstVals.radius * powerScale;
    G.multiPopExplosions.push({ x: player.x, y: player.y, r: 0, maxR: scaledRadius, life: 0.2, maxLife: 0.2 });
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      if (!e.alive) continue;
      if (dist(player, e) < scaledRadius) {
        killEnemy(e, i);
      }
    }
    // L3 fire zone: spawns regardless of charge level (no scaling)
    if (dashBurstVals.fireZone) {
      G.multiPopExplosions.push({ x: player.x, y: player.y, r: 0, maxR: dashBurstVals.radius, life: dashBurstVals.fireZoneDuration, maxLife: dashBurstVals.fireZoneDuration, isFireZone: true });
    }
  }

  // Nova Core: detonate all orbs, orb explosion radius scaled by charge
  if (novaCore && player.shellGuardOrbs) {
    const scaledOrbRadius = 70 * powerScale;
    for (const orb of player.shellGuardOrbs) {
      if (orb.alive) {
        const orbX = player.x + Math.cos(orb.angle) * 60;
        const orbY = player.y + Math.sin(orb.angle) * 60;
        G.multiPopExplosions.push({ x: orbX, y: orbY, r: 0, maxR: scaledOrbRadius, life: 0.2, maxLife: 0.2 });
        for (let i = G.enemies.length - 1; i >= 0; i--) {
          const e = G.enemies[i];
          if (!e.alive) continue;
          if (dist({ x: orbX, y: orbY }, e) < scaledOrbRadius) {
            killEnemy(e, i);
          }
        }
        orb.alive = false;
        orb.respawnTimer = 4.0;
      }
    }
  }

  if (player.powers.find(p => p.id === 'thunderDash')) {
    const trailDuration = CHARGE_THUNDER_TRAIL_MIN + (CHARGE_THUNDER_TRAIL_MAX - CHARGE_THUNDER_TRAIL_MIN) * t;
    const segmentRadius = 18 + 4 * t;
    const trailInterval = Math.max(0.016, 0.026 - 0.006 * t);
    G.thunderTrails = G.thunderTrails || [];
    player.thunderTrailChainId = (player.thunderTrailChainId || 0) + 1;
    player.thunderTrailSpawnTimer = 0;
    player.thunderTrailLife = trailDuration;
    player.thunderTrailNodeLife = trailDuration;
    player.thunderTrailRadius = segmentRadius;
    player.thunderTrailInterval = trailInterval;
    player.thunderTrailDirX = bdx;
    player.thunderTrailDirY = bdy;
    pushCapped(G.thunderTrails, {
      x: player.x - bdx * player.r * 0.35,
      y: player.y - bdy * player.r * 0.35,
      r: segmentRadius,
      life: trailDuration,
      maxLife: trailDuration,
      chain: player.thunderTrailChainId,
    }, FX_THUNDER_TRAIL_LIMIT);
    spawnParticles(player.x + bdx * 26, player.y + bdy * 26, '#88ccff', 10);
  }

  // Time Warp: freeze enemies, duration scaled by charge
  const twPower = getPlayerPower('timeWarp');
  if (twPower) {
    const twVals = POWER_DEFS.timeWarp.levels[twPower.level - 1];
    const twScale = CHARGE_TIMEWARP_SCALE_MIN + (CHARGE_TIMEWARP_SCALE_MAX - CHARGE_TIMEWARP_SCALE_MIN) * t;
    const scaledFreeze = twVals.freezeDuration * twScale;
    for (const e of G.enemies) {
      if (!e.alive || e.isBoss || e.spawnTimer > 0) continue;
      if (dist(player, e) < twVals.radius) {
        e.freezeTimer = scaledFreeze;
      }
    }
  }

  if (player.sigils?.includes('feedback')) {
    player.sigilState.feedbackDashCount = (player.sigilState.feedbackDashCount || 0) + 1;
    if (player.sigilState.feedbackDashCount % 5 === 0) {
      const targets = G.enemies
        .filter(enemy => enemy.alive && !enemy.isBoss && enemy.spawnTimer <= 0)
        .map(enemy => ({ enemy, distance: dist(player, enemy) }))
        .filter(entry => entry.distance <= 150)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 2);

      for (const { enemy } of targets) {
        spawnParticles(enemy.x, enemy.y, '#8dd8ff', 6);
        spawnParticles((player.x + enemy.x) / 2, (player.y + enemy.y) / 2, '#8dd8ff', 4);
        if (hitEnemy(enemy, 'feedbackSigil')) {
          killEnemy(enemy, G.enemies.indexOf(enemy), 'feedbackSigil');
        }
      }
    }
  }
}

// --- Charge start / release / cancel ---

function startDashCharge() {
  const player = G.player;
  const initialCost = getInitialCost();
  if (player.dashCooldown > 0 || player.stamina < initialCost || player.dashCharging) return false;
  player.dashCharging = true;
  player.dashChargeTime = 0;
  player.dashChargeStaminaDrained = 0;
  player.stamina -= initialCost;
  return true;
}

function releaseDashCharge() {
  const player = G.player;
  if (!player.dashCharging) return;
  // Only execute dash during active gameplay states
  if (G.state !== STATE.PLAYING && G.state !== STATE.BOSS_FIGHT && G.state !== STATE.WAVE_BREAK) {
    cancelDashCharge(true);
    return;
  }
  const t = getChargeLevel(player.dashChargeTime);
  const { bdx, bdy, cancel } = getDashDirection();
  if (cancel) {
    // Cancel with full refund (initial cost + drain)
    const initialCost = getInitialCost();
    player.stamina = Math.min(
      player.maxStamina || 100,
      player.stamina + player.dashChargeStaminaDrained + initialCost
    );
    player.dashCharging = false;
    player.dashChargeTime = 0;
    player.dashChargeStaminaDrained = 0;
    player.dashChargeTouchId = null;
    // Red ring flash for aim cancel
    G.dashAimCancelFlashTimer = 0.15;
    return;
  }
  performDash(bdx, bdy, t);
}

export function cancelDashCharge(refundDrain) {
  const player = G.player;
  if (!player.dashCharging) return;
  if (refundDrain) {
    player.stamina = Math.min(
      player.maxStamina || 100,
      player.stamina + player.dashChargeStaminaDrained
    );
  }
  player.dashCharging = false;
  player.dashChargeTime = 0;
  player.dashChargeStaminaDrained = 0;
  player.dashChargeTouchId = null;
}

// Called each frame from the game loop while playing
export function updateDashCharge(dt) {
  const player = G.player;
  if (!player.dashCharging) return;

  player.dashChargeTime += dt;

  // Continuous stamina drain
  const drainRate = getDrainRate();
  const drainAmount = drainRate * dt;
  if (drainAmount > 0) {
    player.stamina -= drainAmount;
    player.dashChargeStaminaDrained += drainAmount;
  }

  // Auto-release when stamina hits 0
  if (player.stamina <= 0) {
    player.stamina = 0;
    player.staminaFlashTimer = 0.3;
    releaseDashCharge();
  }
}

// Expose for HUD/visuals
export function getCurrentChargeLevel() {
  const player = G.player;
  if (!player.dashCharging) return 0;
  return getChargeLevel(player.dashChargeTime);
}

// Expose for dash projection line rendering — returns bounced path segments
export function getDashProjection() {
  const player = G.player;
  if (!player.dashCharging) return null;
  const t = getChargeLevel(player.dashChargeTime);
  const { bdx, bdy, cancel } = getDashDirection();
  if (cancel) return null;  // no projection when aim would cancel
  const speed = getDashSpeed(t);
  const overrides = getDifficultyOverrides();
  const grace = overrides.graceMin + (overrides.graceMax - overrides.graceMin) * t;
  const totalDist = speed * grace;

  // Compute bounced path segments
  const segments = [];
  let x = player.x, y = player.y;
  let dx = bdx, dy = bdy;
  let remaining = totalDist;
  const pr = player.r;
  const maxBounces = 4;

  for (let bounce = 0; bounce <= maxBounces && remaining > 1; bounce++) {
    let tMin = remaining;
    let hitType = null; // 'wall-x', 'wall-y', 'pad'
    let hitPad = null;

    // Wall intersection checks
    if (dx < 0) { const t = (pr - x) / dx; if (t > 0.5 && t < tMin) { tMin = t; hitType = 'wall-x'; } }
    if (dx > 0) { const t = (W - pr - x) / dx; if (t > 0.5 && t < tMin) { tMin = t; hitType = 'wall-x'; } }
    if (dy < 0) { const t = (pr - y) / dy; if (t > 0.5 && t < tMin) { tMin = t; hitType = 'wall-y'; } }
    if (dy > 0) { const t = (H - pr - y) / dy; if (t > 0.5 && t < tMin) { tMin = t; hitType = 'wall-y'; } }

    // Bounce pad intersection checks
    if (G.bouncePads) {
      for (const pad of G.bouncePads) {
        if (pad.cooldown > 0) continue;
        const hitR = pad.r + pr;
        const fx = x - pad.x, fy = y - pad.y;
        const a = dx * dx + dy * dy;
        const b = 2 * (fx * dx + fy * dy);
        const c = fx * fx + fy * fy - hitR * hitR;
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
          const t1 = (-b - Math.sqrt(disc)) / (2 * a);
          if (t1 > 0.5 && t1 < tMin) {
            tMin = t1;
            hitType = 'pad';
            hitPad = pad;
          }
        }
      }
    }

    const endX = x + dx * tMin;
    const endY = y + dy * tMin;
    segments.push({ x1: x, y1: y, x2: endX, y2: endY });
    remaining -= tMin;
    x = endX; y = endY;

    if (!hitType) break;
    if (hitType === 'wall-x') dx = -dx;
    else if (hitType === 'wall-y') dy = -dy;
    else if (hitType === 'pad') { dx = hitPad.launchDx; dy = hitPad.launchDy; }
  }

  return { bdx, bdy, speed, grace, t, dist: totalDist, segments };
}

export function setupInput() {
  C.addEventListener('mousedown', e => {
    claimInputFocus();
    e.preventDefault();
    const p = canvasCoords(e.clientX, e.clientY);
    G.mouseX = p.x;
    G.mouseY = p.y;
    if (G.state === STATE.SETTINGS) { handleInput(p.x, p.y); return; }
    if (G.state === STATE.GLOSSARY) { glossaryClickTest(p.x, p.y); return; }
    if (G.state === STATE.POWER_SELECT) { handleCardClick(p.x, p.y); return; }
    if (G.state === STATE.MODE_SELECT) {
      const card = modeSelectCardAt(p.x, p.y);
      if (card >= 0) { sfxUIClick(); confirmModeSelect(card); }
      return;
    }
    handleInput(p.x, p.y);
  });

  C.addEventListener('wheel', e => {
    if (G.state === STATE.GLOSSARY) {
      e.preventDefault();
      glossaryDetailWheel(e.deltaY);
    }
  }, { passive: false });

  C.addEventListener('mousemove', e => {
    const p = canvasCoords(e.clientX, e.clientY);
    // Always track mouse position for dash aiming
    G.mouseX = p.x;
    G.mouseY = p.y;
    if (G.state === STATE.MODE_SELECT) {
      G.modeSelectCursor = Math.max(0, modeSelectCardAt(p.x, p.y));
      return;
    }
    if (G.state === STATE.SETTINGS) {
      G._settingsHoverBack = hitTest(p.x, p.y, G._settingsBackBtnRect);
      G._settingsHoverMute = hitTest(p.x, p.y, G._settingsMuteBtnRect);
      // Slider drag: if mouse is down over slider, update value
      if (G._settingsSliderRects) {
        for (let i = 0; i < G._settingsSliderRects.length; i++) {
          if (hitTest(p.x, p.y, G._settingsSliderRects[i])) {
            G._settingsCursor = i;
          }
        }
      }
      return;
    }
    if (G.state === STATE.PAUSED) {
      G._pauseHoverAction = getPauseActionAt(p.x, p.y);
      G._pauseHoverResume = G._pauseHoverAction === 'resume';
      G._pauseHoverQuit = G._pauseHoverAction === 'quit';
      return;
    }
    if (G.state === STATE.TITLE) {
      G._titleHoverAction = getTitleActionAt(p.x, p.y);
      return;
    }
    if (G.state === STATE.RELAY_CHAMBER && G.relayChamber) {
      G._relayHoverAction = getRelayActionAt(p.x, p.y);
      G._relayHoverUpgradeIndex = getRelayUpgradeAt(p.x, p.y);
      G._relayHoverLoadoutIndex = getRelayLoadoutAt(p.x, p.y);
      if (G._relayHoverUpgradeIndex >= 0) {
        G.relayChamber.focusSection = 'upgrades';
        G.relayChamber.upgradeIndex = G._relayHoverUpgradeIndex;
      }
      if (G._relayHoverLoadoutIndex >= 0) {
        G.relayChamber.focusSection = 'loadouts';
        G.relayChamber.loadoutIndex = G._relayHoverLoadoutIndex;
      }
      if (G._relayHoverAction) {
        G.relayChamber.focusSection = 'cta';
        G.relayChamber.ctaIndex = ['runback', 'upgrades', 'menu'].indexOf(G._relayHoverAction);
      }
      return;
    }
    if (G.state === STATE.TRANSITION_ROOM && G.transitionRoom) {
      if (G.transitionRoom.preludeActive) return;
      const optionIndex = getTransitionRoomOptionAt(p.x, p.y);
      G.transitionRoom.hoverIndex = optionIndex;
      if (optionIndex >= 0) {
        G.transitionRoom.cursor = optionIndex;
      }
      return;
    }
    if (G.state === STATE.LOADOUT) {
      const idx = getLoadoutCardAt(p.x, p.y);
      G._loadoutHoverIndex = idx >= 0 ? idx : -1;
      if (idx >= 0) G.loadoutCursor = idx;
      return;
    }
    handleCardHover(p.x, p.y);
  });

  C.addEventListener('touchstart', e => {
    claimInputFocus();
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const p = canvasCoords(t.clientX, t.clientY);
      if (G.state === STATE.GLOSSARY) { glossaryClickTest(p.x, p.y); return; }
      if (G.state === STATE.POWER_SELECT) { handleCardClick(p.x, p.y); return; }
      if (G.state === STATE.MODE_SELECT) {
        const card = modeSelectCardAt(p.x, p.y);
        if (card >= 0) { sfxUIClick(); confirmModeSelect(card); }
        return;
      }
      if ((G.state === STATE.PLAYING || G.state === STATE.WAVE_BREAK || G.state === STATE.BOSS_FIGHT) &&
          hitTest(p.x, p.y, G._mobilePauseBtnRect)) {
        sfxUIClick();
        openPauseMenu();
        return;
      }
      if (G.state === STATE.STORY_INTRO) {
        if ((G.storyIntro?.beat === 1 || G.storyIntro?.beat === 3) && p.x < W / 2 && !G.joystick.active) {
          G.joystick.active = true;
          G.joystick.touchId = t.identifier;
          G.joystick.cx = p.x; G.joystick.cy = p.y;
          G.joystick.tx = p.x; G.joystick.ty = p.y;
          G.joystick.dx = 0; G.joystick.dy = 0;
        } else if (G.storyIntro?.beat === 3 && p.x >= W / 2) {
          import('../game.js').then(m => m.startStoryIntroDashCharge(t.identifier));
        } else {
          import('../game.js').then(m => m.advanceStoryIntro());
        }
        return;
      }
      if (G.state === STATE.TRANSITION_ROOM && G.transitionRoom) {
        if (G.transitionRoom.preludeActive) {
          if (G.transitionRoom.preludeReady) {
            import('../game.js').then(m => m.advanceTransitionRoomPrelude());
          }
          return;
        }
        const optionIndex = getTransitionRoomOptionAt(p.x, p.y);
        if (optionIndex >= 0 || hitTest(p.x, p.y, G._transitionContinueRect)) {
          handleInput(p.x, p.y);
          return;
        }
        if (!G.joystick.active) {
          G.joystick.active = true;
          G.joystick.touchId = t.identifier;
          G.joystick.cx = p.x; G.joystick.cy = p.y;
          G.joystick.tx = p.x; G.joystick.ty = p.y;
          G.joystick.dx = 0; G.joystick.dy = 0;
        }
        return;
      }
      if (G.state === STATE.TITLE || G.state === STATE.GAME_OVER ||
          G.state === STATE.TUTORIAL || G.state === STATE.RUN_SUMMARY ||
          G.state === STATE.RELAY_CHAMBER ||
          G.state === STATE.PAUSED) {
        handleInput(p.x, p.y);
        return;
      }
      if (G.state !== STATE.PLAYING && G.state !== STATE.WAVE_BREAK && G.state !== STATE.BOSS_FIGHT) return;
      if (p.x < W / 2 && !G.joystick.active) {
        G.joystick.active = true;
        G.joystick.touchId = t.identifier;
        G.joystick.cx = p.x; G.joystick.cy = p.y;
        G.joystick.tx = p.x; G.joystick.ty = p.y;
        G.joystick.dx = 0; G.joystick.dy = 0;
      }
      else if (p.x >= W / 2) {
        if ((G.state === STATE.PLAYING || G.state === STATE.BOSS_FIGHT) && startDashCharge()) {
          G.player.dashChargeTouchId = t.identifier;
          G.mouseX = p.x;
          G.mouseY = p.y;
          G.tapBounceRipples.push({ x: p.x, y: p.y, r: 0, maxR: 30, life: 0.3, maxLife: 0.3 });
        }
      }
    }
  }, { passive: false });

  C.addEventListener('pointerdown', () => {
    claimInputFocus();
  }, { passive: true });

  C.addEventListener('touchmove', e => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (G.joystick.active && t.identifier === G.joystick.touchId) {
        const p = canvasCoords(t.clientX, t.clientY);
        G.joystick.tx = p.x; G.joystick.ty = p.y;
        let jdx = p.x - G.joystick.cx, jdy = p.y - G.joystick.cy;
        const jDist = Math.sqrt(jdx * jdx + jdy * jdy);
        const deadZone = 20;
        if (jDist < deadZone) { G.joystick.dx = 0; G.joystick.dy = 0; }
        else {
          const maxDist = 40;
          const clamped = Math.min(jDist, maxDist);
          G.joystick.dx = (jdx / jDist) * clamped;
          G.joystick.dy = (jdy / jDist) * clamped;
        }
      } else if (G.player && G.player.dashCharging && t.identifier === G.player.dashChargeTouchId) {
        const p = canvasCoords(t.clientX, t.clientY);
        G.mouseX = p.x;
        G.mouseY = p.y;
      }
    }
  }, { passive: false });

  C.addEventListener('touchend', e => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (G.joystick.active && t.identifier === G.joystick.touchId) {
        G.joystick.active = false; G.joystick.touchId = null;
        G.joystick.dx = 0; G.joystick.dy = 0;
      }
      if (G.state === STATE.STORY_INTRO && G.storyIntro?.player?.dashCharging &&
          t.identifier === G.storyIntro.player.dashChargeTouchId) {
        import('../game.js').then(m => m.releaseStoryIntroDashCharge());
      }
      // Release dash charge on finger lift
      if (G.player && G.player.dashCharging && t.identifier === G.player.dashChargeTouchId) {
        releaseDashCharge();
      }
    }
  });

  C.addEventListener('touchcancel', e => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (G.joystick.active && t.identifier === G.joystick.touchId) {
        G.joystick.active = false; G.joystick.touchId = null;
        G.joystick.dx = 0; G.joystick.dy = 0;
      }
      if (G.state === STATE.STORY_INTRO && G.storyIntro?.player?.dashCharging &&
          t.identifier === G.storyIntro.player.dashChargeTouchId) {
        import('../game.js').then(m => m.cancelStoryIntroDashCharge());
      }
      // Cancel dash charge on touch cancel (refund drain, not initial cost)
      if (G.player && G.player.dashCharging && t.identifier === G.player.dashChargeTouchId) {
        cancelDashCharge(true);
      }
    }
  });

  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    G.keysDown[key] = true;

    // --- Power Select: card picking ---
    if (G.state === STATE.POWER_SELECT && !G.cardPickAnim) {
      if (key === '1') { pickCard(0); e.preventDefault(); return; }
      if (key === '2') { pickCard(1); e.preventDefault(); return; }
      if (key === '3') { pickCard(2); e.preventDefault(); return; }
      if (key === '4') { pickCard(3); e.preventDefault(); return; }
    }

    // --- Glossary screen ---
    if (G.state === STATE.GLOSSARY) {
      if (key === 'escape' || key === 'backspace') { sfxUIClick(); glossaryInput('back'); e.preventDefault(); return; }
      if (key === 'arrowleft' || key === 'a') { sfxUIClick(); glossaryInput('left'); e.preventDefault(); return; }
      if (key === 'arrowright' || key === 'd') { sfxUIClick(); glossaryInput('right'); e.preventDefault(); return; }
      if (key === 'arrowup' || key === 'w') { sfxUIClick(); glossaryInput('up'); e.preventDefault(); return; }
      if (key === 'arrowdown' || key === 's') { sfxUIClick(); glossaryInput('down'); e.preventDefault(); return; }
      e.preventDefault();
      return;
    }

    // --- Settings screen ---
    if (G.state === STATE.SETTINGS) {
      if (key === 'escape' || key === 'backspace') { sfxUIClick(); closeSettings(); e.preventDefault(); return; }
      if (key === 'arrowup' || key === 'w') { sfxUIClick(); G._settingsCursor = Math.max(0, G._settingsCursor - 1); e.preventDefault(); return; }
      if (key === 'arrowdown' || key === 's') { sfxUIClick(); G._settingsCursor = Math.min(2, G._settingsCursor + 1); e.preventDefault(); return; }
      if (key === 'arrowleft' || key === 'a') { settingsAdjust(-1); e.preventDefault(); return; }
      if (key === 'arrowright' || key === 'd') { settingsAdjust(1); e.preventDefault(); return; }
      if ((key === 'enter' || key === ' ') && G._settingsCursor === 2) { sfxUIClick(); settingsToggleMute(); e.preventDefault(); return; }
      if (key === 'm') { sfxUIClick(); settingsToggleMute(); e.preventDefault(); return; }
      e.preventDefault();
      return;
    }

    // --- Title screen ---
    if (G.state === STATE.TITLE) {
      ensureTitleMusicStarted();
      if (key === 'g' && activateTitleAction('glossary')) { e.preventDefault(); return; }
      if (key === 'u' && activateTitleAction('upgrades')) { e.preventDefault(); return; }
      if (key === 'l' && activateTitleAction('loadout')) { e.preventDefault(); return; }
      if (key === 's' && activateTitleAction('settings')) { e.preventDefault(); return; }
      // Continue saved run (with fade)
      if (key === 'c' && hasSavedRun()) {
        continueTitleRun();
        e.preventDefault();
        return;
      }
      if (G._titleTransitioning) { e.preventDefault(); return; }
      beginTitleRun();
      e.preventDefault();
      return;
    }

    if (G.state === STATE.STORY_INTRO) {
      if (key === 'escape' || key === 'backspace') {
        if (G.storyIntro?.player?.dashCharging) {
          import('../game.js').then(m => m.cancelStoryIntroDashCharge());
        }
        import('../game.js').then(m => m.skipStoryIntro());
        e.preventDefault();
        return;
      }
      if (G.storyIntro?.beat === 3 && key === ' ' && !e.repeat) {
        import('../game.js').then(m => m.startStoryIntroDashCharge());
        e.preventDefault();
        return;
      }
      if (G.storyIntro?.beat === 1 &&
          (key === 'w' || key === 'a' || key === 's' || key === 'd' ||
           key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright')) {
        e.preventDefault();
        return;
      }
      if (G.storyIntro?.beat === 3 &&
          (key === 'w' || key === 'a' || key === 's' || key === 'd' ||
           key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright')) {
        e.preventDefault();
        return;
      }
      if (G.storyIntro?.beat === 3) {
        e.preventDefault();
        return;
      }
      import('../game.js').then(m => m.advanceStoryIntro());
      e.preventDefault();
      return;
    }

    // --- Mode Select screen ---
    if (G.state === STATE.MODE_SELECT) {
      if (key === 'a' || key === 'arrowleft') { sfxUIClick(); G.modeSelectCursor = 0; e.preventDefault(); return; }
      if (key === 'd' || key === 'arrowright') { sfxUIClick(); G.modeSelectCursor = 1; e.preventDefault(); return; }
      if (key === 'enter' || key === ' ') { sfxUIClick(); confirmModeSelect(G.modeSelectCursor); e.preventDefault(); return; }
      if (key === 'escape' || key === 'backspace') { sfxUIClick(); G.state = STATE.TITLE; e.preventDefault(); return; }
      e.preventDefault();
      return;
    }

    // --- Upgrades screen ---
    if (G.state === STATE.UPGRADES) {
      if (key === 'escape') {
        sfxUIClick();
        if (G._upgradesPrevState === STATE.RELAY_CHAMBER) {
          import('../game.js').then(m => m.refreshRelayChamber());
          G.state = STATE.RELAY_CHAMBER;
        } else {
          G.state = STATE.TITLE;
        }
        e.preventDefault();
        return;
      }
      if (key === 'arrowup' || key === 'w') {
        sfxUIClick();
        G.upgradeCursor = Math.max(0, G.upgradeCursor - 1);
        e.preventDefault(); return;
      }
      if (key === 'arrowdown' || key === 's') {
        sfxUIClick();
        G.upgradeCursor = Math.min(UPGRADES.length - 1, G.upgradeCursor + 1);
        e.preventDefault(); return;
      }
      if (key === 'enter' || key === ' ') {
        const u = UPGRADES[G.upgradeCursor];
        if (u && canPurchaseUpgrade(G.meta, u.id)) {
          sfxCardPick();
          purchaseUpgrade(G.meta, u.id);
        }
        e.preventDefault(); return;
      }
      return;
    }

    if (G.state === STATE.RELAY_CHAMBER && G.relayChamber) {
      if (key === 'escape' || key === 'backspace') {
        sfxUIClick();
        setMusicState('title');
        G.relayChamber = null;
        G.state = STATE.TITLE;
        e.preventDefault();
        return;
      }
      if (key === 'arrowleft' || key === 'a') {
        sfxUIClick();
        if (G.relayChamber.focusSection === 'cta') {
          G.relayChamber.ctaIndex = Math.max(0, G.relayChamber.ctaIndex - 1);
        } else if (G.relayChamber.focusSection === 'loadouts') {
          G.relayChamber.loadoutIndex = Math.max(0, G.relayChamber.loadoutIndex - 1);
        } else {
          G.relayChamber.focusSection = 'loadouts';
        }
        e.preventDefault();
        return;
      }
      if (key === 'arrowright' || key === 'd') {
        sfxUIClick();
        if (G.relayChamber.focusSection === 'cta') {
          G.relayChamber.ctaIndex = Math.min(2, G.relayChamber.ctaIndex + 1);
        } else if (G.relayChamber.focusSection === 'loadouts') {
          G.relayChamber.loadoutIndex = Math.min(LOADOUTS.length - 1, G.relayChamber.loadoutIndex + 1);
        } else {
          G.relayChamber.focusSection = 'loadouts';
        }
        e.preventDefault();
        return;
      }
      if (key === 'arrowup' || key === 'w') {
        sfxUIClick();
        if (G.relayChamber.focusSection === 'cta') {
          G.relayChamber.focusSection = 'upgrades';
        } else if (G.relayChamber.focusSection === 'upgrades') {
          G.relayChamber.upgradeIndex = Math.max(0, G.relayChamber.upgradeIndex - 1);
        } else {
          G.relayChamber.focusSection = 'upgrades';
        }
        e.preventDefault();
        return;
      }
      if (key === 'arrowdown' || key === 's') {
        sfxUIClick();
        if (G.relayChamber.focusSection === 'upgrades') {
          const maxUpgradeIndex = Math.max(0, (G.relayChamber.quickUpgradeIds?.length || 1) - 1);
          if (G.relayChamber.upgradeIndex < maxUpgradeIndex) {
            G.relayChamber.upgradeIndex++;
          } else {
            G.relayChamber.focusSection = 'cta';
          }
        } else if (G.relayChamber.focusSection === 'loadouts') {
          G.relayChamber.focusSection = 'cta';
        }
        e.preventDefault();
        return;
      }
      if (key === 'enter' || key === ' ') {
        if (G.relayChamber.focusSection === 'cta') {
          activateRelayAction(['runback', 'upgrades', 'menu'][G.relayChamber.ctaIndex] || 'runback');
        } else if (G.relayChamber.focusSection === 'upgrades') {
          purchaseRelayUpgrade(G.relayChamber.upgradeIndex);
        } else if (G.relayChamber.focusSection === 'loadouts') {
          equipRelayLoadout(G.relayChamber.loadoutIndex);
        }
        e.preventDefault();
        return;
      }
      return;
    }

    if (G.state === STATE.TRANSITION_ROOM && G.transitionRoom) {
      if (G.transitionRoom.preludeActive) {
        if (G.transitionRoom.preludeReady && !e.metaKey && !e.ctrlKey && !e.altKey) {
          import('../game.js').then(m => m.advanceTransitionRoomPrelude());
          e.preventDefault();
        }
        return;
      }
      if (key === 'arrowleft' || key === 'a' || key === 'arrowup' || key === 'w') {
        if (G.transitionRoom.options?.length) {
          sfxUIClick();
          G.transitionRoom.cursor = Math.max(0, G.transitionRoom.cursor - 1);
        }
        e.preventDefault();
        return;
      }
      if (key === 'arrowright' || key === 'd' || key === 'arrowdown' || key === 's') {
        if (G.transitionRoom.options?.length) {
          sfxUIClick();
          G.transitionRoom.cursor = Math.min((G.transitionRoom.options.length || 1) - 1, G.transitionRoom.cursor + 1);
        }
        e.preventDefault();
        return;
      }
      if (key === 'enter' || key === ' ') {
        if (G.transitionRoom.mode === 'epilogue') {
          import('../game.js').then(m => m.continueTransitionRoom());
        } else {
          import('../game.js').then(m => m.chooseTransitionRoomOption(G.transitionRoom.cursor || 0));
        }
        e.preventDefault();
        return;
      }
      return;
    }

    // --- Loadout screen ---
    if (G.state === STATE.LOADOUT) {
      if (key === 'escape') { G._loadoutHoverIndex = -1; G.state = STATE.TITLE; e.preventDefault(); return; }
      if (key === 'arrowup' || key === 'w') {
        G.loadoutCursor = Math.max(0, G.loadoutCursor - 1);
        e.preventDefault(); return;
      }
      if (key === 'arrowdown' || key === 's') {
        G.loadoutCursor = Math.min(LOADOUTS.length - 1, G.loadoutCursor + 1);
        e.preventDefault(); return;
      }
      if (key === 'enter' || key === ' ') {
        activateLoadout(G.loadoutCursor);
        e.preventDefault(); return;
      }
      return;
    }

    // --- Run Summary ---
    if (G.state === STATE.RUN_SUMMARY) {
      continueFromRunSummary();
      e.preventDefault();
      return;
    }

    // --- Boss intro card skip ---
    if (G.state === STATE.BOSS_INTRO_CARD) {
      import('../systems/boss.js').then(m => m.skipBossIntro());
      e.preventDefault();
      return;
    }

    // --- Boss ready confirm ---
    if (G.state === STATE.BOSS_READY) {
      import('../systems/boss.js').then(m => m.confirmBossReady());
      e.preventDefault();
      return;
    }

    // --- Boss tutorial dismiss ---
    if (G.state === STATE.BOSS_TUTORIAL) {
      import('../systems/boss.js').then(m => m.dismissBossTutorial());
      e.preventDefault();
      return;
    }

    // --- Glossary from pause ---
    if (key === 'g' && G.state === STATE.PAUSED) {
      sfxUIClick();
      openGlossary(STATE.PAUSED);
      e.preventDefault();
      return;
    }

    // --- Settings from pause (S while paused) ---
    if (key === 's' && G.state === STATE.PAUSED) {
      sfxUIClick();
      openSettings(STATE.PAUSED);
      e.preventDefault();
      return;
    }

    // --- Save & Quit (Q while paused) ---
    if (key === 'q' && G.state === STATE.PAUSED) {
      quitRun();
      e.preventDefault();
      return;
    }

    // --- Pause ---
    if ((key === 'p' || key === 'escape') && (G.state === STATE.PLAYING || G.state === STATE.WAVE_BREAK || G.state === STATE.PAUSED || G.state === STATE.BOSS_FIGHT)) {
      if (G.state === STATE.PAUSED) { resumeFromPause(); }
      else openPauseMenu();
      e.preventDefault();
      return;
    }

    // --- Tutorial ---
    if (G.state === STATE.TUTORIAL) {
      G.tutorialDismissed = true;
      G.state = STATE.PLAYING;
      e.preventDefault();
      return;
    }

    // --- Game Over ---
    if (G.state === STATE.GAME_OVER && G.gameOverTimer > 1.5) {
      import('../game.js').then(m => m.transitionToRunSummary());
      e.preventDefault();
      return;
    }

    // --- Dash charge start ---
    if ((G.state === STATE.PLAYING || G.state === STATE.BOSS_FIGHT) && key === ' ') {
      if (!e.repeat) {
        startDashCharge();
      }
      e.preventDefault();
    }

    // --- Cancel charge with Escape ---
    if (key === 'escape' && G.player && G.player.dashCharging) {
      cancelDashCharge(true);
      e.preventDefault();
      return;
    }

    if ((G.state === STATE.PLAYING || G.state === STATE.BOSS_FIGHT || G.state === STATE.TRANSITION_ROOM) && (key === 'w' || key === 'a' || key === 's' || key === 'd' ||
        key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright')) {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', e => {
    const key = e.key.toLowerCase();
    G.keysDown[key] = false;
    if (G.state === STATE.STORY_INTRO && key === ' ' && G.storyIntro?.player?.dashCharging) {
      import('../game.js').then(m => m.releaseStoryIntroDashCharge());
      return;
    }
    // Release dash charge on Space up
    if (key === ' ' && G.player && G.player.dashCharging) {
      releaseDashCharge();
    }
  });
}
