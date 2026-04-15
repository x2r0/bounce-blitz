'use strict';

import { W, H, STATE, BOUNCE_MIN_SPEED, DASH_COOLDOWN, DASH_SPEED,
  STAMINA_DASH_COST, STAMINA_REGEN_DELAY,
  CHARGE_TAP_THRESHOLD, CHARGE_MAX_DURATION, CHARGE_INITIAL_COST_RATIO,
  CHARGE_DRAIN_RATE_RATIO, CHARGE_SPEED_MIN, CHARGE_SPEED_MAX,
  CHARGE_GRACE_MIN, CHARGE_GRACE_MAX, CHARGE_RECOVERY_MIN, CHARGE_RECOVERY_MAX,
  CHARGE_DASH_MASTER_TAP, CHARGE_POWER_SCALE_MIN, CHARGE_POWER_SCALE_MAX,
  CHARGE_TIMEWARP_SCALE_MIN, CHARGE_TIMEWARP_SCALE_MAX,
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
import { killEnemy } from '../entities/enemy.js';
import { dist } from '../utils.js';
import { resumeAudio, sfxDash, sfxUIClick, sfxCardPick, startMusic, stopMusic, setBossMusic, setMusicState } from './audio.js';
import { saveRunState, hasSavedRun, clearRunState } from './save.js';
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

function hitTest(x, y, rect) {
  return rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function canvasCoords(cx, cy) {
  const rect = C.getBoundingClientRect();
  return { x: (cx - rect.left) / rect.width * W, y: (cy - rect.top) / rect.height * H };
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

function confirmModeSelect(cursor) {
  G.isEndlessRun = cursor === 1;
  resetGameState();
  startMusic();
}

function handleInput(x, y) {
  // Pause menu button clicks
  if (G.state === STATE.PAUSED) {
    if (hitTest(x, y, G._pauseResumeBtnRect)) { sfxUIClick(); resumeFromPause(); return; }
    if (hitTest(x, y, G._pauseQuitBtnRect)) { sfxUIClick(); quitRun(); return; }
    return;
  }
  if (G.state === STATE.TITLE) {
    if (G._titleTransitioning) return;
    resumeAudio();
    startMusic(); // Start title music immediately on first interaction
    G._titleTransitioning = true;
    import('../game.js').then(m => m.startTransition(() => {
      G._titleTransitioning = false;
      // Check if endless is unlocked → show mode select
      const hasEndless = G.meta.unlocks.includes(15) || G.meta.endlessUnlocked;
      if (hasEndless) {
        clearRunState();
        G.modeSelectCursor = 0;
        G.state = STATE.MODE_SELECT;
        return;
      }
      // Click/tap on title always starts a new run (use keyboard C to continue)
      clearRunState();
      G.isEndlessRun = false;
      resetGameState();
      startMusic();
    }, 3.33));
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
    if (G.runSummaryReady) { G.state = STATE.TITLE; }
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

  // --- Mobile: joystick direction ---
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
  if (!localStorage.getItem(DASH_TOOLTIP_STORAGE_KEY)) {
    G.dashTooltipCount++;
    G.dashTooltipTimer = DASH_TOOLTIP_DURATION;
    if (G.dashTooltipCount >= DASH_TOOLTIP_COUNT) {
      localStorage.setItem(DASH_TOOLTIP_STORAGE_KEY, '1');
    }
  }

  // Power scale factor for charge level
  const powerScale = CHARGE_POWER_SCALE_MIN + (CHARGE_POWER_SCALE_MAX - CHARGE_POWER_SCALE_MIN) * t;

  // Dash Burst: explosion at launch point, radius scaled by charge
  const dashBurst = getPlayerPower('dashBurst');
  if (dashBurst) {
    const vals = POWER_DEFS.dashBurst.levels[dashBurst.level - 1];
    const scaledRadius = vals.radius * powerScale;
    G.multiPopExplosions.push({ x: player.x, y: player.y, r: 0, maxR: scaledRadius, life: 0.2, maxLife: 0.2 });
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      if (!e.alive) continue;
      if (dist(player, e) < scaledRadius) {
        killEnemy(e, i);
      }
    }
    // L3 fire zone: spawns regardless of charge level (no scaling)
    if (vals.fireZone) {
      G.multiPopExplosions.push({ x: player.x, y: player.y, r: 0, maxR: vals.radius, life: vals.fireZoneDuration, maxLife: vals.fireZoneDuration, isFireZone: true });
    }
  }

  // Nova Core: detonate all orbs, orb explosion radius scaled by charge
  const novaCore = player.powers.find(p => p.id === 'novaCore');
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
    e.preventDefault();
    const p = canvasCoords(e.clientX, e.clientY);
    G.mouseX = p.x;
    G.mouseY = p.y;
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
    if (G.state === STATE.PAUSED) {
      G._pauseHoverResume = hitTest(p.x, p.y, G._pauseResumeBtnRect);
      G._pauseHoverQuit = hitTest(p.x, p.y, G._pauseQuitBtnRect);
      return;
    }
    handleCardHover(p.x, p.y);
  });

  C.addEventListener('touchstart', e => {
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
      if (G.state === STATE.TITLE || G.state === STATE.GAME_OVER ||
          G.state === STATE.TUTORIAL || G.state === STATE.RUN_SUMMARY ||
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
          G.tapBounceRipples.push({ x: p.x, y: p.y, r: 0, maxR: 30, life: 0.3, maxLife: 0.3 });
        }
      }
    }
  }, { passive: false });

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

    // --- Title screen ---
    if (G.state === STATE.TITLE) {
      resumeAudio();
      startMusic(); // Start title music on first keypress
      if (key === 'g') { sfxUIClick(); openGlossary(STATE.TITLE); e.preventDefault(); return; }
      if (key === 'u') { sfxUIClick(); G.state = STATE.UPGRADES; G.upgradeCursor = 0; e.preventDefault(); return; }
      if (key === 'l') { sfxUIClick(); G.state = STATE.LOADOUT; G.loadoutCursor = 0; e.preventDefault(); return; }
      // Continue saved run (with fade)
      if (key === 'c' && hasSavedRun()) {
        if (G._titleTransitioning) { e.preventDefault(); return; }
        G._titleTransitioning = true;
        import('../game.js').then(m => m.startTransition(() => {
          G._titleTransitioning = false;
          restoreRunState();
          clearRunState();
          startMusic();
        }, 3.33));
        e.preventDefault();
        return;
      }
      if (G._titleTransitioning) { e.preventDefault(); return; }
      G._titleTransitioning = true;
      import('../game.js').then(m => m.startTransition(() => {
        G._titleTransitioning = false;
        // Check if endless is unlocked → show mode select
        const hasEndless = G.meta.unlocks.includes(15) || G.meta.endlessUnlocked;
        if (hasEndless) {
          clearRunState();
          G.modeSelectCursor = 0;
          G.state = STATE.MODE_SELECT;
          return;
        }
        // New run (clear any stale save)
        clearRunState();
        G.isEndlessRun = false;
        resetGameState();
        startMusic();
      }, 3.33));
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
      if (key === 'escape') { sfxUIClick(); G.state = STATE.TITLE; e.preventDefault(); return; }
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

    // --- Loadout screen ---
    if (G.state === STATE.LOADOUT) {
      if (key === 'escape') { G.state = STATE.TITLE; e.preventDefault(); return; }
      if (key === 'arrowup' || key === 'w') {
        G.loadoutCursor = Math.max(0, G.loadoutCursor - 1);
        e.preventDefault(); return;
      }
      if (key === 'arrowdown' || key === 's') {
        G.loadoutCursor = Math.min(LOADOUTS.length - 1, G.loadoutCursor + 1);
        e.preventDefault(); return;
      }
      if (key === 'enter' || key === ' ') {
        const l = LOADOUTS[G.loadoutCursor];
        if (l) {
          if (isLoadoutUnlocked(G.meta, l.id)) {
            G.meta.selectedLoadout = l.id;
            saveMeta(G.meta);
          } else if (l.id === 'hardcore' && canPurchaseHardcore(G.meta)) {
            purchaseHardcore(G.meta);
          }
        }
        e.preventDefault(); return;
      }
      return;
    }

    // --- Run Summary ---
    if (G.state === STATE.RUN_SUMMARY) {
      if (G.runSummaryReady) { G.state = STATE.TITLE; }
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

    // --- Save & Quit (Q while paused) ---
    if (key === 'q' && G.state === STATE.PAUSED) {
      quitRun();
      e.preventDefault();
      return;
    }

    // --- Pause ---
    if ((key === 'p' || key === 'escape') && (G.state === STATE.PLAYING || G.state === STATE.PAUSED || G.state === STATE.BOSS_FIGHT)) {
      if (G.state === STATE.PAUSED) { resumeFromPause(); }
      else {
        // Cancel any active dash charge on pause (refund drain)
        if (G.player && G.player.dashCharging) cancelDashCharge(true);
        G._prevState = G.state; G.state = STATE.PAUSED;
      }
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

    if ((G.state === STATE.PLAYING || G.state === STATE.BOSS_FIGHT) && (key === 'w' || key === 'a' || key === 's' || key === 'd' ||
        key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright')) {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', e => {
    const key = e.key.toLowerCase();
    G.keysDown[key] = false;
    // Release dash charge on Space up
    if (key === ' ' && G.player && G.player.dashCharging) {
      releaseDashCharge();
    }
  });
}
