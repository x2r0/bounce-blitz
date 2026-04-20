'use strict';

import { W, H, DRIFT_ACCEL, DRIFT_MAX_SPEED, DRIFT_FRICTION, IDLE_FRICTION,
  BOUNCE_MIN_SPEED, STAMINA_REGEN_RATE, STATE, CLARITY,
  CHARGE_TAP_THRESHOLD, CHARGE_MAX_DURATION, CHARGE_DASH_MASTER_TAP,
  CHARGE_RING_RADIUS_MIN, CHARGE_RING_RADIUS_MAX, CHARGE_READY_PULSE_HZ } from '../config.js';
import { mag, dist, triggerShake } from '../utils.js';
import { G } from '../state.js';
import { ctx } from '../canvas.js';
import { spawnParticles, addWallFlash } from '../systems/particles.js';
import { events } from '../eventbus.js';
import { getDashProjection, isTouchActive } from '../systems/input.js';
import { CROSSHAIR_ARM_LENGTH, CROSSHAIR_STROKE_WIDTH,
  AIM_CHARGE_SHOW_THRESHOLD } from '../config.js';
import { sfxBounce, sfxShieldBlock } from '../systems/audio.js';
import { saveHighScore, saveHardcoreHighScore } from '../systems/save.js';
import { spawnCombatText } from '../systems/combat-text.js';
import { POWER_DEFS } from '../systems/powers.js';
import { FX_AFTERIMAGE_LIMIT, FX_SHOCKWAVE_LIMIT, FX_THUNDER_TRAIL_LIMIT, getFxBlur, pushCapped } from '../systems/runtime-flags.js';

export function updatePlayer(dt) {
  const player = G.player;

  // Timers
  if (player.invTimer > 0) player.invTimer -= dt;
  if (player.flashTimer > 0) player.flashTimer -= dt;
  if (player.dashGraceTimer > 0) {
    const prev = player.dashGraceTimer;
    player.dashGraceTimer -= dt;
    if (player.dashGraceTimer <= 0 && prev > 0) {
      player.dashRecoveryTimer = player.pendingRecoveryTime || 0.25;
    }
  }
  if (player.dashRecoveryTimer > 0) player.dashRecoveryTimer -= dt;
  if (player.dashCooldown > 0) player.dashCooldown -= dt;
  if (player.staminaFlashTimer > 0) player.staminaFlashTimer -= dt;
  if (G.dashAimCancelFlashTimer > 0) G.dashAimCancelFlashTimer -= dt;
  if (G.dashTooltipTimer > 0) G.dashTooltipTimer -= dt;
  if (player.soulHarvestPierceTimer > 0) player.soulHarvestPierceTimer -= dt;
  if (player.thunderTrailLife > 0) {
    player.thunderTrailLife = Math.max(0, player.thunderTrailLife - dt);
  }

  // Stamina regen
  if (player.staminaRegenDelay > 0) player.staminaRegenDelay -= dt;
  else {
    const maxStam = player.maxStamina || 100;
    const regenRate = STAMINA_REGEN_RATE + (player.staminaRegenBonus || 0);
    if (player.stamina < maxStam) {
      player.stamina = Math.min(maxStam, player.stamina + regenRate * dt);
    }
  }

  player.shieldDashOffset = (player.shieldDashOffset || 0) + 2;

  // Eye blink timer
  if (player.eyeBlinkTimer > 0) player.eyeBlinkTimer -= dt;
  else {
    player.eyeNextBlink -= dt;
    if (player.eyeNextBlink <= 0) {
      player.eyeBlinkTimer = 0.15;
      player.eyeNextBlink = 3 + Math.random() * 2 - 1;
    }
  }
  if (player.eyeSquashTimer > 0) player.eyeSquashTimer -= dt;
  if (player.eyeWideTimer > 0) player.eyeWideTimer -= dt;
  if (player.eyeHappyTimer > 0) player.eyeHappyTimer -= dt;

  // --- Continuous drift from WASD/Arrows + virtual joystick ---
  let driftX = 0, driftY = 0;
  if (G.keysDown['w'] || G.keysDown['arrowup']) driftY -= 1;
  if (G.keysDown['s'] || G.keysDown['arrowdown']) driftY += 1;
  if (G.keysDown['a'] || G.keysDown['arrowleft']) driftX -= 1;
  if (G.keysDown['d'] || G.keysDown['arrowright']) driftX += 1;
  if (G.joystick.active && (G.joystick.dx !== 0 || G.joystick.dy !== 0)) {
    const jLen = Math.sqrt(G.joystick.dx * G.joystick.dx + G.joystick.dy * G.joystick.dy);
    const maxDist = 40;
    const jNorm = Math.min(jLen / maxDist, 1);
    driftX += (G.joystick.dx / jLen) * jNorm;
    driftY += (G.joystick.dy / jLen) * jNorm;
  }
  const driftHeld = driftX !== 0 || driftY !== 0;

  // Determine effective drift values from powers
  let driftMax = DRIFT_MAX_SPEED;
  let driftAccel = DRIFT_ACCEL;

  // Quick Feet upgrade: +25 drift max
  if (G.meta.unlocks.includes(2)) driftMax += 25;

  // Surge power
  if (player.surgeActive) {
    driftMax = player.surgeDriftMax || 400;
    driftAccel = 1800;
  }

  // Overdrive speed boost
  if (player.overdriveTimer > 0 && player.overdriveSpeed > 0) {
    driftMax *= (1 + player.overdriveSpeed);
  }

  // Invincibility boost: +20% speed
  if (G.activeBoost && G.activeBoost.type === 'invincibility') {
    driftMax *= 1.2;
  }

  // Post-dash recovery: 50% drift acceleration (partial steering)
  if (player.dashRecoveryTimer > 0 && player.overdriveTimer <= 0 &&
      !(G.activeBoost && G.activeBoost.type === 'invincibility')) {
    driftAccel *= 0.5;
  }

  if (driftHeld) {
    const dLen = Math.sqrt(driftX * driftX + driftY * driftY);
    driftX /= dLen; driftY /= dLen;
    const speed = mag(player.vx, player.vy);
    if (speed < driftMax) {
      player.vx += driftX * driftAccel * dt;
      player.vy += driftY * driftAccel * dt;
      const newSpeed = mag(player.vx, player.vy);
      if (newSpeed > driftMax) {
        player.vx = (player.vx / newSpeed) * driftMax;
        player.vy = (player.vy / newSpeed) * driftMax;
      }
    }
  }

  // --- Friction ---
  const speed = mag(player.vx, player.vy);
  if (speed > 0) {
    const friction = driftHeld ? DRIFT_FRICTION : IDLE_FRICTION;
    const newSpeed = Math.max(0, speed - friction * dt);
    const ratio = newSpeed / speed;
    player.vx *= ratio; player.vy *= ratio;
  }
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // Wall bouncing
  const bounceRetain = G.meta.unlocks.includes(6) ? 0.95 : 0.8;
  const glowCol = player.surgeActive ? '#ff4444' : '#00ffff';
  let bounced = false;
  if (player.x - player.r < 0) { player.x = player.r; player.vx = Math.abs(player.vx) * bounceRetain; addWallFlash(player.x, player.y, 'left', glowCol); bounced = true; }
  if (player.x + player.r > W) { player.x = W - player.r; player.vx = -Math.abs(player.vx) * bounceRetain; addWallFlash(player.x, player.y, 'right', glowCol); bounced = true; }
  if (player.y - player.r < 0) { player.y = player.r; player.vy = Math.abs(player.vy) * bounceRetain; addWallFlash(player.x, player.y, 'top', glowCol); bounced = true; }
  if (player.y + player.r > H) { player.y = H - player.r; player.vy = -Math.abs(player.vy) * bounceRetain; addWallFlash(player.x, player.y, 'bottom', glowCol); bounced = true; }
  if (bounced && mag(player.vx, player.vy) > 100) sfxBounce();

  const pSpeed = mag(player.vx, player.vy);
  if (player.thunderTrailLife > 0) {
    player.thunderTrailSpawnTimer -= dt;
    const trailDirX = pSpeed > 10 ? player.vx / pSpeed : (player.thunderTrailDirX || 0);
    const trailDirY = pSpeed > 10 ? player.vy / pSpeed : (player.thunderTrailDirY || 0);
    const tailOffset = player.r * 0.35;
    while (player.thunderTrailSpawnTimer <= 0) {
      pushCapped(G.thunderTrails, {
        x: player.x - trailDirX * tailOffset,
        y: player.y - trailDirY * tailOffset,
        r: player.thunderTrailRadius || 20,
        life: player.thunderTrailNodeLife || 0.95,
        maxLife: player.thunderTrailNodeLife || 0.95,
        chain: player.thunderTrailChainId || 0,
      }, FX_THUNDER_TRAIL_LIMIT);
      player.thunderTrailSpawnTimer += player.thunderTrailInterval || 0.024;
    }
  }
  if (pSpeed > 200) {
    const trailColor = player.surgeActive ? '#ff4444' :
      (player.overdriveTimer > 0 ? getOverdriveColor() : '#00ffff');
    const maxAlpha = player.surgeActive ? 0.6 : 0.5;
    pushCapped(G.afterimages, { x: player.x, y: player.y, r: player.r, alpha: maxAlpha, life: 0.15,
      color: trailColor, maxAlpha }, FX_AFTERIMAGE_LIMIT);
  }
}

function getOverdriveColor() {
  const colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#00ffff', '#4444ff', '#aa00ff'];
  const idx = Math.floor(Date.now() / 150) % colors.length;
  return colors[idx];
}

export function getPlayerAccentColor() {
  const player = G.player;
  if (player.overdriveTimer > 0) return getOverdriveColor();
  if (player.surgeActive) return '#ff4444';
  return '#00ffff';
}

export function damagePlayer(sourceX, sourceY) {
  if (window.__DEBUG_INVINCIBLE) return;
  const player = G.player;
  if (player.invTimer > 0) return;

  // Overdrive: immune to all damage
  if (player.overdriveTimer > 0) return;

  // Invincibility boost: immune to all damage
  if (G.activeBoost && G.activeBoost.type === 'invincibility') return;

  // Cancel any active dash charge on hit (no refund — initial cost and drain lost)
  if (player.dashCharging) {
    player.dashCharging = false;
    player.dashChargeTime = 0;
    player.dashChargeStaminaDrained = 0;
    player.dashChargeTouchId = null;
  }

  // Shell Guard defensive block — positional: orb must be between player and enemy
  if (player.shellGuardOrbs) {
    const sourceAngle = Math.atan2(sourceY - player.y, sourceX - player.x);
    const blockHalfAngle = Math.PI / 4; // each orb covers ±45° sector
    let blockingOrb = null;
    let bestAngleDist = Infinity;
    for (const orb of player.shellGuardOrbs) {
      if (!orb.alive) continue;
      // Signed angular distance, wrapped to [-π, π]
      let ad = sourceAngle - orb.angle;
      ad = ((ad + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      const absDist = Math.abs(ad);
      if (absDist < blockHalfAngle && absDist < bestAngleDist) {
        bestAngleDist = absDist;
        blockingOrb = orb;
      }
    }
    if (blockingOrb) {
      blockingOrb.alive = false;
      const sgPower = player.powers.find(p => p.id === 'shellGuard' || p.id === 'novaCore');
      if (sgPower && sgPower.id === 'shellGuard') {
        const shellGuardLevel = POWER_DEFS.shellGuard.levels[sgPower.level - 1];
        blockingOrb.respawnTimer = shellGuardLevel.respawnTime;
      } else {
        blockingOrb.respawnTimer = POWER_DEFS.shellGuard.levels[2].respawnTime;
      }
      player.invTimer = 0.3;
      spawnParticles(player.x, player.y, '#44ff88', 4);
      spawnCombatText('BLOCKED!', player.x, player.y - 30, { size: 14, color: '#44ff88' });
      sfxShieldBlock();
      return;
    }
  }

  // Shield charges
  if (player.shieldCharges > 0) {
    player.shieldCharges--;
    player.invTimer = 0.3;
    spawnParticles(player.x, player.y, '#4488ff', 6);
    spawnCombatText('SHIELD!', player.x, player.y - 30, { size: 14, color: '#44ddff' });
    sfxShieldBlock();

    // Reflective Shield evolution: emit kill shockwave on block
    const reflective = player.powers.find(p => p.id === 'reflectiveShield');
    if (reflective) {
      const burstRadius = 95;
      pushCapped(G.shockwaves, { x: player.x, y: player.y, r: 0, maxR: burstRadius, life: 0.26, maxLife: 0.26, thickness: 8, killsEnemies: true }, FX_SHOCKWAVE_LIMIT);
      const candidates = G.enemies
        .map((enemy, index) => ({ enemy, index, distance: dist(player, enemy) }))
        .filter(({ enemy, distance }) => enemy.alive && !enemy.isBoss && distance < burstRadius)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 2);
      for (const { enemy: e } of candidates) {
        e.alive = false;
        G.combo++;
        G.comboTimer = 1.5;
        G.score += e.points * G.combo;
        spawnParticles(e.x, e.y, e.color, 8);
        events.emit('enemyKilled', {
          type: e.type,
          points: e.points * G.combo,
          combo: G.combo,
          x: e.x,
          y: e.y,
          source: 'reflectiveShield',
          isMinion: e.type === 'mini_splitter' || e.type === 'spawner_minion' || !!e.owner,
          ownerBossType: e.owner?.bossType || null,
        });
      }
    }
    return;
  }

  player.hp--;
  if (G.runTelemetry) G.runTelemetry.damageTaken++;
  player.invTimer = 2; player.flashTimer = 2;
  player.eyeWideTimer = 0.3;
  const dx = player.x - sourceX, dy = player.y - sourceY;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  player.vx = (dx / d) * 800; player.vy = (dy / d) * 800;
  triggerShake(G, 6, 0.2);
  events.emit('playerDamaged', { hp: player.hp });

  if (player.hp <= 0) {
    // Second Wind check — disabled in Hardcore
    if (!G.isHardcore && !G.usedSecondWind && G.meta.unlocks.includes(11)) {
      G.usedSecondWind = true;
      if (G.runTelemetry) G.runTelemetry.revivesUsed++;
      player.hp = 1;
      player.invTimer = 3.0;
      player.flashTimer = 3.0;
      spawnCombatText('SECOND WIND!', player.x, player.y - 40, { size: 22, color: '#00ff88', bold: true });
      spawnParticles(player.x, player.y, '#00ff88', 12);
      return;
    }

    player.eyeDead = true; player.eyeWideTimer = 0;
    G.state = STATE.GAME_OVER; G.freezeTimer = 0.5;
    G.gameOverFadeIn = 0; G.gameOverTimer = 0;
    if (G.isHardcore) {
      if (G.score > (G.meta.hardcoreHighScore || 0)) {
        G.meta.hardcoreHighScore = G.score;
        saveHardcoreHighScore(G.score);
      }
    } else {
      if (G.score > G.highScore) { G.highScore = G.score; saveHighScore(G.highScore); }
    }
    events.emit('gameOver', { score: G.score, wave: G.wave });
  }
}

export function drawPlayer() {
  const player = G.player;
  const invFlashing = player.invTimer > 0;
  const flashPhase = Math.floor(Date.now() / 100) % 2;
  const isOverdrive = player.overdriveTimer > 0;

  ctx.save();
  ctx.translate(player.x, player.y);

  // Time Warp bubble
  const twPower = player.powers.find(p => p.id === 'timeWarp');
  if (twPower) {
    const twVals = [100, 130, 160];
    const radius = twVals[twPower.level - 1];
    ctx.save();
    ctx.fillStyle = 'rgba(102, 68, 204, 0.12)';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    // Clock tick marks
    ctx.strokeStyle = 'rgba(102, 68, 204, 0.3)';
    ctx.lineWidth = 1;
    const rotation = Date.now() / 4000 * Math.PI * 2;
    for (let t = 0; t < 12; t++) {
      const angle = rotation + (t / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * (radius - 6), Math.sin(angle) * (radius - 6));
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Magnet active aura
  if (player.magnetActive) {
    const magRadius = player.magnetRadius || 80;
    const magPulse = magRadius * (0.9 + 0.1 * Math.sin(Date.now() / 1000 * Math.PI * 6));
    ctx.save();
    ctx.fillStyle = 'rgba(255, 221, 0, 0.12)';
    ctx.shadowColor = '#ffdd00';
    ctx.shadowBlur = getFxBlur(20);
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.beginPath();
    ctx.arc(0, 0, magPulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#ffdd00';
    ctx.lineWidth = 1;
    for (let d = 0; d < 4; d++) {
      const a = d * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * magPulse, Math.sin(a) * magPulse);
      ctx.lineTo(Math.cos(a) * (magPulse - 6), Math.sin(a) * (magPulse - 6));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Shell Guard orbs
  if (player.shellGuardOrbs && player.shellGuardOrbs.length > 0) {
    const power = player.powers.find(p => p.id === 'shellGuard' || p.id === 'novaCore');
    const orbitRadius = power ? (power.id === 'novaCore' ? 60 : (power.level === 1 ? 50 : power.level === 2 ? 55 : 60)) : 50;
    const orbColor = power && power.id === 'novaCore' ? '#ff8844' : '#44ff88';

    for (const orb of player.shellGuardOrbs) {
      if (!orb.alive) continue;
      const ox = Math.cos(orb.angle) * orbitRadius;
      const oy = Math.sin(orb.angle) * orbitRadius;
      ctx.save();
      ctx.fillStyle = orbColor;
      ctx.shadowColor = orbColor;
      ctx.shadowBlur = getFxBlur(8);
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.beginPath();
      ctx.arc(ox, oy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Orbit path
    ctx.save();
    ctx.strokeStyle = orbColor;
    ctx.globalAlpha = 0.08;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, orbitRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Proximity ring — subtle radar indicator when screen is busy
  const aliveEnemies = G.enemies.filter(e => e.alive).length;
  if (aliveEnemies > CLARITY.PROXIMITY_RING_THRESHOLD) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = CLARITY.PROXIMITY_RING_OPACITY;
    ctx.lineWidth = 1;
    ctx.setLineDash(CLARITY.PROXIMITY_RING_DASH);
    ctx.beginPath();
    ctx.arc(0, 0, CLARITY.PROXIMITY_RING_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Multi-Pop orbiting charge indicators
  if (player.multiPopCharges > 0) {
    for (let i = 0; i < player.multiPopCharges; i++) {
      const angle = (Date.now() / 1000 * 4) + (i * Math.PI * 2 / Math.max(1, player.multiPopCharges));
      const sx = Math.cos(angle) * (player.r + 10);
      const sy = Math.sin(angle) * (player.r + 10);
      ctx.save();
      ctx.fillStyle = '#44ff88';
      ctx.shadowColor = '#44ff88';
      ctx.shadowBlur = getFxBlur(8);
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Player orb
  const isLowHp = player.hp === 1 && player.hp > 0;
  const pSpeed = mag(player.vx, player.vy);
  let playerGlowColor, playerFillColor, playerBlur;

  if (isOverdrive) {
    playerGlowColor = getOverdriveColor();
    playerFillColor = getOverdriveColor();
    playerBlur = 40;
  } else if (player.surgeActive) {
    playerGlowColor = '#ff4444';
    playerFillColor = '#ffcccc';
    playerBlur = 35;
  } else if (isLowHp) {
    playerGlowColor = '#ff3333';
    playerFillColor = '#ff6666';
    playerBlur = pSpeed > 200 ? 30 : 20;
  } else {
    playerGlowColor = '#00ffff';
    playerFillColor = '#ffffff';
    playerBlur = pSpeed > 200 ? 30 : 20;
  }

  if (invFlashing) {
    playerFillColor = flashPhase === 0 ? '#ffffff' : '#00ffff';
  }

  // Post-dash recovery green flash (10 Hz, distinct from damage flash)
  const inRecovery = player.dashRecoveryTimer > 0 && player.overdriveTimer <= 0 &&
    !(G.activeBoost && G.activeBoost.type === 'invincibility');
  if (inRecovery && !invFlashing) {
    const recoveryPhase = Math.floor(Date.now() / 50) % 2;
    playerFillColor = recoveryPhase === 0 ? '#44ff88' : playerFillColor;
    playerGlowColor = '#44ff88';
  }

  ctx.save();
  ctx.shadowColor = playerGlowColor;
  ctx.shadowBlur = getFxBlur(playerBlur);
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = isOverdrive ? getOverdriveColor() : (player.surgeActive ? '#ff4444' : '#00ffff');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, player.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = playerFillColor;
  ctx.beginPath();
  ctx.arc(0, 0, player.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Shield active — rotating dashed ring (one ring per charge)
  if (player.shieldCharges > 0) {
    for (let c = 0; c < player.shieldCharges; c++) {
      ctx.save();
      ctx.strokeStyle = '#4488ff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#4488ff';
      ctx.shadowBlur = getFxBlur(15);
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.setLineDash([8, 4]);
      ctx.lineDashOffset = player.shieldDashOffset + c * 8;
      ctx.beginPath();
      ctx.arc(0, 0, player.r + 6 + c * 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // Surge red glow override
  if (player.surgeActive && !isOverdrive) {
    ctx.save();
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur = getFxBlur(35);
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#ff4444';
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, player.r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Dash charge visual feedback (player-colored glow + expanding ring)
  if (player.dashCharging) {
    const tapThresh = G.meta.unlocks.includes(9) ? CHARGE_DASH_MASTER_TAP : CHARGE_TAP_THRESHOLD;
    const chargeTime = player.dashChargeTime;
    if (chargeTime > tapThresh) {
      const t = Math.min(1, (chargeTime - tapThresh) / (CHARGE_MAX_DURATION - tapThresh));
      // Use player accent color (matches body: cyan, surge red, overdrive rainbow)
      const glowColor = getPlayerAccentColor();

      // Body glow
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = getFxBlur(20 + 20 * t);
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = glowColor;
      ctx.globalAlpha = 0.15 + 0.25 * t;
      ctx.beginPath();
      ctx.arc(0, 0, player.r + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Expanding particle ring
      let ringRadius = CHARGE_RING_RADIUS_MIN + (CHARGE_RING_RADIUS_MAX - CHARGE_RING_RADIUS_MIN) * t;
      let ringAlpha = 0.3 + 0.4 * t;
      // At full charge: pulse the ring at 4 Hz
      if (t >= 1.0) {
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 1000 * Math.PI * 2 * CHARGE_READY_PULSE_HZ);
        ringRadius = CHARGE_RING_RADIUS_MAX * (0.95 + 0.05 * pulse);
        ringAlpha = 0.5 + 0.3 * pulse;
      }
      ctx.save();
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = ringAlpha;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = getFxBlur(10);
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Aim cancel red ring flash
      if (G.dashAimCancelFlashTimer > 0) {
        const flashAlpha = G.dashAimCancelFlashTimer / 0.15;
        ctx.save();
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 3;
        ctx.globalAlpha = flashAlpha * 0.8;
        ctx.shadowColor = '#ff4444';
        ctx.shadowBlur = getFxBlur(12);
        ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Mobile: chevron direction indicator on expanding ring
      if (isTouchActive()) {
        let adx = 0;
        let ady = 0;
        if (player.dashCharging && player.dashChargeTouchId !== null) {
          const dx = G.mouseX - player.x;
          const dy = G.mouseY - player.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d >= 0.001) {
            adx = dx / d;
            ady = dy / d;
          }
        } else if (G.joystick.active && (G.joystick.dx !== 0 || G.joystick.dy !== 0)) {
          const jLen = Math.sqrt(G.joystick.dx * G.joystick.dx + G.joystick.dy * G.joystick.dy);
          adx = G.joystick.dx / jLen;
          ady = G.joystick.dy / jLen;
        }
        if (adx !== 0 || ady !== 0) {
          const chevronX = adx * ringRadius;
          const chevronY = ady * ringRadius;
          const angle = Math.atan2(ady, adx);
          const chevSize = 8;
          ctx.save();
          ctx.translate(chevronX, chevronY);
          ctx.rotate(angle);
          ctx.fillStyle = glowColor;
          ctx.globalAlpha = ringAlpha;
          ctx.beginPath();
          ctx.moveTo(chevSize, 0);
          ctx.lineTo(-chevSize * 0.5, -chevSize * 0.6);
          ctx.lineTo(-chevSize * 0.5, chevSize * 0.6);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      // Dash projection line — multi-segment bounced path
      const proj = getDashProjection();
      if (proj && proj.segments.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const lineW = 3 + 2 * t;
        const dashOffset = -Date.now() / 60;

        // Draw each segment, fading alpha along total path distance
        let distSoFar = 0;
        for (let si = 0; si < proj.segments.length; si++) {
          const seg = proj.segments[si];
          // Convert world coords to player-local coords
          const sx1 = seg.x1 - player.x, sy1 = seg.y1 - player.y;
          const sx2 = seg.x2 - player.x, sy2 = seg.y2 - player.y;
          const segLen = Math.sqrt((sx2 - sx1) ** 2 + (sy2 - sy1) ** 2);
          const segStart = distSoFar / proj.dist;
          const segEnd = (distSoFar + segLen) / proj.dist;
          distSoFar += segLen;

          // Alpha fades along total path
          const alphaStart = (0.4 + 0.4 * t) * (1 - segStart * 0.7);
          const alphaEnd = (0.4 + 0.4 * t) * (1 - segEnd * 0.7);

          // Gradient per segment
          const grad = ctx.createLinearGradient(sx1, sy1, sx2, sy2);
          grad.addColorStop(0, glowColor);
          grad.addColorStop(1, segEnd > 0.85 ? 'rgba(0,0,0,0)' : glowColor);

          ctx.strokeStyle = grad;
          ctx.lineWidth = lineW * (1 - segStart * 0.3);
          ctx.globalAlpha = alphaStart;
          ctx.setLineDash([8, 6]);
          ctx.lineDashOffset = dashOffset;

          // Skip the first few pixels from player center on first segment
          let mx1 = sx1, my1 = sy1;
          if (si === 0 && segLen > player.r + 4) {
            const skipFrac = (player.r + 4) / segLen;
            mx1 = sx1 + (sx2 - sx1) * skipFrac;
            my1 = sy1 + (sy2 - sy1) * skipFrac;
          }

          ctx.beginPath();
          ctx.moveTo(mx1, my1);
          ctx.lineTo(sx2, sy2);
          ctx.stroke();

          // Bounce marker — small circle at each bounce point (except last)
          if (si < proj.segments.length - 1) {
            ctx.setLineDash([]);
            ctx.fillStyle = glowColor;
            ctx.globalAlpha = alphaEnd * 0.8;
            ctx.beginPath();
            ctx.arc(sx2, sy2, 3 + t, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.setLineDash([]);

        // Endpoint diamond marker at final position
        if (t > 0.15 && proj.segments.length > 0) {
          const last = proj.segments[proj.segments.length - 1];
          const endX = last.x2 - player.x;
          const endY = last.y2 - player.y;
          const markerSize = 3 + 3 * t;
          ctx.fillStyle = glowColor;
          ctx.globalAlpha = 0.3 + 0.5 * t;
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = getFxBlur(6);
          ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
          ctx.beginPath();
          ctx.moveTo(endX, endY - markerSize);
          ctx.lineTo(endX + markerSize, endY);
          ctx.lineTo(endX, endY + markerSize);
          ctx.lineTo(endX - markerSize, endY);
          ctx.closePath();
          ctx.fill();
        }

        ctx.restore();
      }

      // At full charge: bright flash + particle burst indicator
      if (t >= 1.0) {
        const flashPhase = Math.floor(Date.now() / 250) % 2;
        if (flashPhase === 0) {
          ctx.save();
          ctx.fillStyle = glowColor;
          ctx.globalAlpha = 0.15;
          ctx.beginPath();
          ctx.arc(0, 0, player.r + 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  // Crosshair at mouse cursor — only visible while charging a dash
  if (!isTouchActive() && (G.state === STATE.PLAYING || G.state === STATE.BOSS_FIGHT || G.state === STATE.WAVE_BREAK)) {
    const isCharging = player.dashCharging && player.dashChargeTime >= AIM_CHARGE_SHOW_THRESHOLD;
    if (isCharging) {
      const cursorX = G.mouseX - player.x;
      const cursorY = G.mouseY - player.y;
      const arm = CROSSHAIR_ARM_LENGTH;

      // Charge-based color: cyan (#00ffff) at 0% → gold (#ffd700) at 100%
      const tapThresh = G.meta.unlocks.includes(9) ? CHARGE_DASH_MASTER_TAP : CHARGE_TAP_THRESHOLD;
      const t = Math.min(1, (player.dashChargeTime - tapThresh) / (CHARGE_MAX_DURATION - tapThresh));
      const r = Math.round(255 * t);
      const g = Math.round(255 - 40 * t);
      const b = Math.round(255 * (1 - t));
      const chargeColor = `rgb(${r},${g},${b})`;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = chargeColor;
      ctx.lineWidth = CROSSHAIR_STROKE_WIDTH;
      ctx.globalAlpha = 0.6;
      ctx.shadowColor = chargeColor;
      ctx.shadowBlur = getFxBlur(4);
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      // Horizontal arm
      ctx.beginPath();
      ctx.moveTo(cursorX - arm, cursorY);
      ctx.lineTo(cursorX + arm, cursorY);
      ctx.stroke();
      // Vertical arm
      ctx.beginPath();
      ctx.moveTo(cursorX, cursorY - arm);
      ctx.lineTo(cursorX, cursorY + arm);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Overdrive rainbow glow
  if (isOverdrive) {
    ctx.save();
    ctx.shadowColor = getOverdriveColor();
    ctx.shadowBlur = getFxBlur(40);
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = getOverdriveColor();
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, player.r + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Eyes direction indicator
  {
    ctx.globalCompositeOperation = 'source-over';
    let adx = 0, ady = 0;
    if (G.keysDown['w'] || G.keysDown['arrowup']) ady -= 1;
    if (G.keysDown['s'] || G.keysDown['arrowdown']) ady += 1;
    if (G.keysDown['a'] || G.keysDown['arrowleft']) adx -= 1;
    if (G.keysDown['d'] || G.keysDown['arrowright']) adx += 1;
    if (adx === 0 && ady === 0 && G.joystick.active && (G.joystick.dx !== 0 || G.joystick.dy !== 0)) {
      const jLen = Math.sqrt(G.joystick.dx * G.joystick.dx + G.joystick.dy * G.joystick.dy);
      adx = G.joystick.dx / jLen; ady = G.joystick.dy / jLen;
    }
    if (adx === 0 && ady === 0) {
      const spd = mag(player.vx, player.vy);
      if (spd > BOUNCE_MIN_SPEED) { adx = player.vx / spd; ady = player.vy / spd; }
      else { ady = -1; }
    } else {
      const aLen = Math.sqrt(adx * adx + ady * ady);
      adx /= aLen; ady /= aLen;
    }

    let scleraColor = '#ffffff', pupilColor = '#111111', scleraStroke = 'rgba(0,0,0,0.3)';
    if (isOverdrive) {
      scleraColor = '#ffffdd'; pupilColor = '#ffdd00'; scleraStroke = 'rgba(255,200,0,0.4)';
    } else if (player.surgeActive) {
      scleraColor = '#ffdddd'; pupilColor = '#cc0000'; scleraStroke = 'rgba(255,50,50,0.4)';
    } else if (isLowHp) {
      scleraColor = '#ffcccc';
    }
    if (invFlashing && flashPhase === 1) {
      scleraColor = '#00ffff'; pupilColor = '#006666';
    }

    const eyeSpeed = mag(player.vx, player.vy);
    const isDead = player.eyeDead;
    const isWide = !isDead && player.eyeWideTimer > 0;
    const isHappy = !isDead && !isWide && player.eyeHappyTimer > 0;
    const isSpeedSquint = !isDead && !isWide && !isHappy && eyeSpeed > 400;

    let eyeScaleY = 1;
    let eyeScaleX = 1;
    if (!isDead) {
      if (player.eyeBlinkTimer > 0) {
        const bt = player.eyeBlinkTimer;
        if (bt > 0.10) eyeScaleY = 1 - (0.15 - bt) / 0.05;
        else if (bt > 0.05) eyeScaleY = 0;
        else eyeScaleY = 1 - bt / 0.05;
      }
      if (player.eyeSquashTimer > 0) {
        const st = player.eyeSquashTimer;
        if (st > 0.05) eyeScaleY = Math.min(eyeScaleY, 0.5);
        else eyeScaleY = Math.min(eyeScaleY, 0.5 + 0.5 * (1 - st / 0.05));
      }
      if (isWide) { eyeScaleY = 1.4; eyeScaleX = 1.3; }
      if (isSpeedSquint) {
        const squintAmount = Math.min((eyeSpeed - 400) / 400, 1);
        eyeScaleY = Math.min(eyeScaleY, 1 - squintAmount * 0.45);
      }
    }

    let scleraR = 4, pupilR = 2;
    if (isWide) { scleraR = 5; pupilR = 2.5; }

    const eyePositions = [[-5, -2], [5, -2]];
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    for (const [ex, ey] of eyePositions) {
      ctx.save();
      ctx.translate(ex, ey);

      if (isDead) {
        ctx.strokeStyle = pupilColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-3, -3); ctx.lineTo(3, 3);
        ctx.moveTo(3, -3); ctx.lineTo(-3, 3);
        ctx.stroke();
      } else if (isHappy) {
        ctx.scale(eyeScaleX, eyeScaleY);
        ctx.strokeStyle = pupilColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 1, 3, Math.PI + 0.3, -0.3);
        ctx.stroke();
      } else {
        ctx.scale(eyeScaleX, eyeScaleY);
        ctx.fillStyle = scleraColor;
        ctx.beginPath();
        ctx.arc(0, 0, scleraR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = scleraStroke;
        ctx.lineWidth = 1;
        ctx.stroke();
        if (eyeScaleY > 0.1) {
          ctx.fillStyle = pupilColor;
          ctx.beginPath();
          ctx.arc(adx * 2, ady * 2, pupilR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter';
  }

  ctx.restore(); // end player translate
}
