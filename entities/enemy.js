'use strict';

import { W, H, ENEMY_COLORS, CLARITY } from '../config.js';
import { rand, randInt, dist, mag, clamp, triggerShake } from '../utils.js';
import { G } from '../state.js';
import { ctx } from '../canvas.js';
import { spawnParticles, addWallFlash } from '../systems/particles.js';
import { getSpeedScale, getShieldChance, canHaveShield } from '../systems/wave.js';
import { events } from '../eventbus.js';
import { getPlayerPower, getPlayerPowerLevel, POWER_DEFS, tryLifeSteal } from '../systems/powers.js';
import { spawnCombatText } from '../systems/combat-text.js';
import { sfxShieldBreak, sfxMultiPop, sfxBeamDeflect } from '../systems/audio.js';
import { applyBeamDamageToPillar, cleanupDestroyedPillar } from '../systems/arena.js';

// --- Spawn helpers ---
function spawnPosEdge(player) {
  let x, y;
  for (let tries = 0; tries < 20; tries++) {
    const side = randInt(0, 3);
    if (side === 0) { x = rand(0, W); y = 0; }
    else if (side === 1) { x = W; y = rand(0, H); }
    else if (side === 2) { x = rand(0, W); y = H; }
    else { x = 0; y = rand(0, H); }
    if (dist({ x, y }, player) >= 200) return { x, y };
  }
  return { x, y };
}

function spawnPosInterior(player, margin, minPlayerDist) {
  let x, y;
  for (let tries = 0; tries < 20; tries++) {
    x = rand(margin, W - margin);
    y = rand(margin, H - margin);
    if (dist({ x, y }, player) >= minPlayerDist) return { x, y };
  }
  return { x, y };
}

function spawnPosWallEdge(player) {
  let x, y;
  for (let tries = 0; tries < 20; tries++) {
    const side = randInt(0, 3);
    if (side === 0) { x = rand(20, W - 20); y = 10; }
    else if (side === 1) { x = W - 10; y = rand(20, H - 20); }
    else if (side === 2) { x = rand(20, W - 20); y = H - 10; }
    else { x = 10; y = rand(20, H - 20); }
    if (dist({ x, y }, player) >= 200) return { x, y };
  }
  return { x, y };
}

// --- Main spawn function ---
export function spawnEnemy(type, x, y, speedMul, opts) {
  const player = G.player;
  opts = opts || {};

  if (x === undefined) {
    if (type === 'pulser' || type === 'spawner') {
      const minDist = type === 'spawner' ? 250 : 200;
      const pos = spawnPosInterior(player, type === 'spawner' ? 80 : 60, minDist);
      x = pos.x; y = pos.y;
    } else if (type === 'sniper') {
      const pos = spawnPosWallEdge(player);
      x = pos.x; y = pos.y;
    } else {
      const pos = spawnPosEdge(player);
      x = pos.x; y = pos.y;
    }
  }

  const ss = speedMul || getSpeedScale(G.wave);
  const ec = ENEMY_COLORS[type] || ENEMY_COLORS.drifter;
  const e = {
    type, x, y, vx: 0, vy: 0, alive: true, spawnScale: 0, spawnTimer: 0.2,
    color: ec.core, glowColor: ec.glow, shadowBlur: ec.blur,
    hp: 1, maxHp: 1, invTimer: 0,
    shield: false, shieldHp: 0,
    isBoss: false, owner: opts.owner || null,
    idleSeed: Math.random() * 6283, // random phase offset so idle bobs don't sync
  };

  if (type === 'drifter' || type === 'mini_splitter' || type === 'spawner_minion') {
    const baseSpeed = type === 'mini_splitter' ? 100 : type === 'spawner_minion' ? 90 : 60;
    const speed = baseSpeed * ss;
    const angle = rand(0, Math.PI * 2);
    e.vx = Math.cos(angle) * speed; e.vy = Math.sin(angle) * speed;
    e.r = type === 'mini_splitter' ? 10 : type === 'spawner_minion' ? 8 : 14;
    e.points = type === 'mini_splitter' ? 75 : type === 'spawner_minion' ? 50 : 100;
    e.speed = speed;
  } else if (type === 'tracker') {
    e.vx = 0; e.vy = 0; e.accel = 120 * ss; e.maxSpeed = 160 * ss;
    e.r = 14; e.points = 250;
  } else if (type === 'splitter') {
    const speed = 50 * ss;
    const angle = rand(0, Math.PI * 2);
    e.vx = Math.cos(angle) * speed; e.vy = Math.sin(angle) * speed;
    e.r = 20; e.points = 200; e.speed = speed;
  } else if (type === 'pulser') {
    e.vx = 0; e.vy = 0; e.r = 12; e.points = 400; e.pulseTimer = 3.5;
  } else if (type === 'teleporter') {
    const speed = 80 * ss;
    const angle = rand(0, Math.PI * 2);
    e.vx = Math.cos(angle) * speed; e.vy = Math.sin(angle) * speed;
    e.r = 12; e.points = 350; e.speed = speed;
    e.teleportTimer = 2.5; e.telegraphing = false; e.telegraphTimer = 0;
    e.teleportDest = null;
  } else if (type === 'bomber') {
    const speed = 100 * ss;
    e.vx = 0; e.vy = 0; e.r = 14; e.points = 300;
    e.speed = speed; e.maxSpeed = 140 * ss;
    e.homingAccel = 40;
    e.fuseTimer = 0; e.fusing = false; e.fuseX = 0; e.fuseY = 0;
  } else if (type === 'spawner') {
    e.vx = 0; e.vy = 0; e.r = 22; e.points = 500;
    e.hp = 2; e.maxHp = 2;
    e.spawnMinionTimer = 4.0; e.activeMinions = [];
  } else if (type === 'sniper') {
    e.r = 10; e.points = 450;
    e.speed = 40 * ss;
    // Wall-hugging: determine nearest wall and move direction
    e.wallSide = getNearestWall(x, y); // 'top','bottom','left','right'
    setWallVelocity(e, ss);
    e.aimTimer = 3.0; e.aiming = false; e.aimTime = 0;
    e.aimTargetX = 0; e.aimTargetY = 0;
    e.recoilTimer = 0;
  }

  // Apply shield if eligible
  if (!opts.noShield && canHaveShield(type)) {
    const chance = getShieldChance(G.wave);
    if (Math.random() < chance) {
      e.shield = true;
      e.shieldHp = 1;
    }
  }

  G.enemies.push(e);
  events.emit('enemySpawned', { type });
  return e;
}

// --- Sniper wall-hugging helpers ---
function getNearestWall(x, y) {
  const dists = { top: y, bottom: H - y, left: x, right: W - x };
  let min = Infinity, wall = 'top';
  for (const [w, d] of Object.entries(dists)) { if (d < min) { min = d; wall = w; } }
  return wall;
}

function setWallVelocity(e, ss) {
  const speed = 40 * ss;
  const dir = Math.random() < 0.5 ? 1 : -1;
  if (e.wallSide === 'top' || e.wallSide === 'bottom') {
    e.vx = speed * dir; e.vy = 0;
  } else {
    e.vx = 0; e.vy = speed * dir;
  }
}

// --- Shield-piercing check ---
function isShieldPiercing(source, enemy) {
  const player = G.player;
  // Frozen enemies shatter on hit (bypass shield)
  if (enemy && enemy.freezeTimer > 0) return true;
  // Overdrive bypasses shields
  if (player.overdriveTimer > 0) return true;
  // Surge L2+ bypasses shields
  if (player.surgeActive && getPlayerPowerLevel('surge') >= 2) return true;
  // Evolution powers bypass shields
  const evos = ['reflectiveShield', 'gravityBomb', 'thunderDash', 'novaCore'];
  for (const id of evos) { if (player.powers.find(p => p.id === id)) return true; }
  // Multi-Pop explosion source
  if (source === 'multipop') return true;
  // Chain Lightning L3
  if (source === 'chainLightning' && (getPlayerPowerLevel('chainLightning') >= 3 || player.powers.find(p => p.id === 'thunderDash'))) return true;
  // Soul Harvest L3 shield-pierce window
  if (player.soulHarvestPierceTimer > 0) return true;
  return false;
}

// --- Hit enemy (handles shield + multi-HP) ---
export function hitEnemy(e, source) {
  if (e.invTimer > 0) return false;

  // Shield check
  if (e.shield && e.shieldHp > 0 && !isShieldPiercing(source, e)) {
    e.shieldHp--;
    if (e.shieldHp <= 0) {
      e.shield = false;
      // Shield break effects
      spawnParticles(e.x, e.y, '#44ddff', 6);
      spawnCombatText('SHIELD!', e.x, e.y - e.r - 10, { size: 14, color: '#44ddff' });
      sfxShieldBreak();
      G.score += 50;
      triggerShake(G, 3, 0.05);
      // Knockback + invincibility on shield break
      const player = G.player;
      const dx = e.x - player.x, dy = e.y - player.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      e.vx = (dx / d) * 200; e.vy = (dy / d) * 200;
      e.invTimer = 0.3;
    }
    return false; // not killed
  }

  // Multi-HP check
  if (e.hp > 1) {
    e.hp--;
    e.invTimer = 0.5;
    // Knockback + flash
    const player = G.player;
    const dx = e.x - player.x, dy = e.y - player.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    e.vx = (dx / d) * 400; e.vy = (dy / d) * 400;
    e.hitFlashTimer = 0.2;
    spawnCombatText('-1', e.x, e.y - e.r - 10, { size: 16, color: '#ff4444', bold: true });
    return false; // not killed
  }

  return true; // can be killed
}

// --- Kill enemy ---
export function killEnemy(e, index, source) {
  // Bosses must go through hitBoss/defeatBoss — never instakill via killEnemy
  if (e.isBoss) return;

  const player = G.player;
  e.alive = false;

  // Spawner: kill all owned minions
  if (e.type === 'spawner' && e.activeMinions) {
    for (const minion of e.activeMinions) {
      if (minion.alive) {
        minion.alive = false;
        spawnParticles(minion.x, minion.y, minion.color, 4);
      }
    }
  }

  // Bomber: start fuse on death
  if (e.type === 'bomber' && !e.fusing) {
    e.fusing = true; e.fuseTimer = 1.0;
    e.fuseX = e.x; e.fuseY = e.y;
    // Don't actually remove yet — handled in update
    e.alive = true; // keep alive during fuse
    e.isFusing = true;
    return; // fuse handles the rest
  }

  const comboTimer = G.meta.unlocks.includes(14) ? 2.5 : 1.5;
  G.combo++; G.comboTimer = comboTimer;
  player.eyeHappyTimer = 0.25;

  let pointsMul = G.combo;
  if (player.overdriveTimer > 0 && player.overdrive2x) pointsMul *= 2;
  const points = Math.floor(e.points * pointsMul * (player.scoreMod || 1));
  G.score += points;
  triggerShake(G, 3, 0.08); G.freezeTimer = 0.03;
  spawnParticles(e.x, e.y, e.color, 8);
  events.emit('enemyKilled', {
    type: e.type,
    points,
    combo: G.combo,
    x: e.x,
    y: e.y,
    source: source || 'other',
    isMinion: e.type === 'mini_splitter' || e.type === 'spawner_minion' || !!e.owner,
    ownerBossType: e.owner?.bossType || null,
  });

  if (G.combo >= 2) {
    G.floatTexts.push({ text: 'x' + G.combo, x: e.x, y: e.y, size: 24, alpha: 1,
      phase: 'combo', scaleT: 0, color: '#ffff44', glowColor: '#ffdd00', vy: -67, life: 0.6 });
  }

  // Multi-Pop: area explosion on kill
  if (player.multiPopCharges > 0) {
    player.multiPopCharges--;
    sfxMultiPop();
    triggerShake(G, 3, 0.1);
    const radius = player.multiPopRadius || 80;
    G.multiPopExplosions.push({ x: e.x, y: e.y, r: 0, maxR: radius, life: 0.2, maxLife: 0.2 });
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      if (G.enemies[i] !== e && G.enemies[i].alive && !G.enemies[i].isFusing && dist(e, G.enemies[i]) < radius) {
        // Multi-pop bypasses shields
        if (G.enemies[i].shield && G.enemies[i].shieldHp > 0) {
          G.enemies[i].shield = false; G.enemies[i].shieldHp = 0;
          spawnParticles(G.enemies[i].x, G.enemies[i].y, '#44ddff', 6);
          G.score += 50;
        }
        killEnemy(G.enemies[i], i, 'multipop');
      }
    }
    spawnParticles(e.x, e.y, '#44ff88', 12);
  }

  // Chain Lightning
  const chainPower = getPlayerPower('chainLightning') || (player.powers.find(p => p.id === 'thunderDash') ? { level: 3 } : null);
  if (chainPower) {
    const vals = POWER_DEFS.chainLightning.levels[chainPower.level - 1];
    let lastX = e.x, lastY = e.y;
    let chainCount = 0;
    const killed = new Set();
    killed.add(e);
    while (chainCount < vals.maxBounces) {
      let nearest = null, nearDist = Infinity;
      for (const enemy of G.enemies) {
        if (!enemy.alive || enemy.isFusing || killed.has(enemy)) continue;
        const d = dist({ x: lastX, y: lastY }, enemy);
        if (d < vals.chainRange && d < nearDist) {
          nearest = enemy; nearDist = d;
        }
      }
      if (!nearest) break;
      killed.add(nearest);
      spawnParticles(nearest.x, nearest.y, '#88ccff', 4);
      // Chain Lightning L3 bypasses shields
      if (nearest.shield && nearest.shieldHp > 0 && chainPower.level >= 3) {
        nearest.shield = false; nearest.shieldHp = 0;
        spawnParticles(nearest.x, nearest.y, '#44ddff', 6);
        G.score += 50;
      }
      killEnemy(nearest, G.enemies.indexOf(nearest), 'chainLightning');
      lastX = nearest.x; lastY = nearest.y;
      chainCount++;
    }
  }

  // Gravity Bomb evolution
  const gravityBomb = player.powers.find(p => p.id === 'gravityBomb');
  if (gravityBomb) {
    G.gravityWells = G.gravityWells || [];
    G.gravityWells.push({ x: e.x, y: e.y, timer: 1.8, radius: 90, pullSpeed: 360, explosionRadius: 120 });
  }

  // Splitter spawns mini-splitters
  if (e.type === 'splitter') {
    const ss = getSpeedScale(G.wave);
    for (let i = 0; i < 2; i++) spawnEnemy('mini_splitter', e.x, e.y, ss, { noShield: true });
  }

  // Heart drops at 5% rate — in Hardcore, convert to score
  if (Math.random() < 0.05) {
    if (G.isHardcore) {
      G.score += 500;
      spawnCombatText('+500', e.x, e.y - 20, { size: 16, color: '#ffdd00', bold: true });
    } else {
      G.powerUps.push({ type: 'heart', x: e.x, y: e.y, r: 10, life: 8, fadeTimer: 0 });
    }
  }

  // Soul Harvest check (works in both Normal and Hardcore)
  const harvestResult = tryLifeSteal();
  if (harvestResult === 'heal') {
    spawnCombatText('+1 HP', e.x, e.y - 20, { size: 16, color: '#44ff44', bold: true });
    spawnParticles(player.x, player.y, '#44ff44', 4);
  } else if (harvestResult === 'stamina') {
    const power = getPlayerPower('lifeSteal');
    const vals = POWER_DEFS.lifeSteal.levels[power.level - 1];
    spawnCombatText('+' + vals.hardcoreStamina + ' STA', e.x, e.y - 20, { size: 16, color: '#00eeff', bold: true });
    spawnParticles(player.x, player.y, '#00eeff', 4);
  }
}

// --- Update enemies ---
export function updateEnemies(dt) {
  const player = G.player;

  // Time Warp
  const timeWarp = getPlayerPower('timeWarp');
  let twRadius = 0, twSpeedMul = 1;
  if (timeWarp) {
    const vals = POWER_DEFS.timeWarp.levels[timeWarp.level - 1];
    twRadius = vals.radius;
    twSpeedMul = vals.speedMul;
  }

  // Magnet enemy slow (L2+)
  const magnetPower = getPlayerPower('magnet');
  let magSlowRadius = 0, magSlowFactor = 0;
  if (magnetPower && player.magnetActive) {
    const magVals = POWER_DEFS.magnet.levels[magnetPower.level - 1];
    if (magVals.enemySlow > 0) {
      magSlowRadius = magVals.radius;
      magSlowFactor = magVals.enemySlow;
    }
  }

  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (!e.alive && !e.isFusing) { G.enemies.splice(i, 1); continue; }
    // Boss timers are handled by updateBoss — skip here to avoid double-decrement
    if (e.isBoss) continue;
    if (e.invTimer > 0) e.invTimer -= dt;
    if (e.hitFlashTimer > 0) e.hitFlashTimer -= dt;

    if (e.spawnTimer > 0) {
      e.spawnTimer -= dt;
      e.spawnScale = 1 - (e.spawnTimer / 0.2);
      if (e.spawnTimer <= 0) e.spawnScale = 1;
      continue;
    }

    // Time Warp slowdown (not for bosses)
    let eDt = dt;
    const eDist = dist(player, e);
    if (!e.isBoss && twRadius > 0 && eDist < twRadius) {
      eDt = dt * twSpeedMul;
    }
    // Magnet enemy slow (L2+, stacks with Time Warp)
    if (!e.isBoss && magSlowRadius > 0 && eDist < magSlowRadius) {
      eDt *= (1 - magSlowFactor);
    }
    // Minimum speed floor: enemies cannot be slowed below 30% base speed
    if (eDt < dt * 0.30) eDt = dt * 0.30;

    // Time Freeze: frozen enemies skip all movement
    if (e.freezeTimer > 0) {
      e.freezeTimer -= dt;
      continue;
    }

    // --- Bomber fuse ---
    if (e.isFusing) {
      e.fuseTimer -= dt;
      if (e.fuseTimer <= 0) {
        // Explode
        const explosionRadius = 90;
        if (dist(player, e) < explosionRadius && player.invTimer <= 0 && player.overdriveTimer <= 0) {
          // Import damagePlayer would be circular — emit event instead
          events.emit('bomberExplosion', { x: e.x, y: e.y });
        }
        G.multiPopExplosions.push({ x: e.x, y: e.y, r: 0, maxR: explosionRadius, life: 0.2, maxLife: 0.2 });
        spawnParticles(e.x, e.y, '#ff4400', 16);
        triggerShake(G, 6, 0.2);
        e.alive = false;
        e.isFusing = false;
        G.enemies.splice(i, 1);
      }
      continue;
    }

    // --- Type-specific updates ---
    if (e.type === 'drifter' || e.type === 'mini_splitter' || e.type === 'splitter' || e.type === 'spawner_minion') {
      e.x += e.vx * eDt; e.y += e.vy * eDt;
      const wallDamp = e.bouncerImmunity > 0 ? 0.75 : 1.0;
      if (e.x - e.r < 0) { e.x = e.r; e.vx = Math.abs(e.vx) * wallDamp; addWallFlash(e.x, e.y, 'left', e.glowColor); }
      if (e.x + e.r > W) { e.x = W - e.r; e.vx = -Math.abs(e.vx) * wallDamp; addWallFlash(e.x, e.y, 'right', e.glowColor); }
      if (e.y - e.r < 0) { e.y = e.r; e.vy = Math.abs(e.vy) * wallDamp; addWallFlash(e.x, e.y, 'top', e.glowColor); }
      if (e.y + e.r > H) { e.y = H - e.r; e.vy = -Math.abs(e.vy) * wallDamp; addWallFlash(e.x, e.y, 'bottom', e.glowColor); }
    } else if (e.type === 'tracker') {
      const dx = player.x - e.x, dy = player.y - e.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      e.vx += (dx / d) * e.accel * eDt; e.vy += (dy / d) * e.accel * eDt;
      const s = mag(e.vx, e.vy);
      if (s > e.maxSpeed) { e.vx = (e.vx / s) * e.maxSpeed; e.vy = (e.vy / s) * e.maxSpeed; }
      e.x += e.vx * eDt; e.y += e.vy * eDt;
      e.x = clamp(e.x, e.r, W - e.r); e.y = clamp(e.y, e.r, H - e.r);
    } else if (e.type === 'pulser') {
      e.pulseTimer -= eDt;
      if (e.pulseTimer <= 0) {
        e.pulseTimer = 3.5;
        G.shockwaves.push({ x: e.x, y: e.y, r: 0, maxR: 170, life: 1.0, maxLife: 1.0, thickness: 8 });
      }
    } else if (e.type === 'teleporter') {
      updateTeleporter(e, eDt, player);
    } else if (e.type === 'bomber') {
      updateBomber(e, eDt, player);
    } else if (e.type === 'spawner') {
      updateSpawner(e, eDt);
    } else if (e.type === 'sniper') {
      updateSniper(e, eDt, player);
    }
  }

  // Update gravity wells
  if (G.gravityWells) {
    for (let i = G.gravityWells.length - 1; i >= 0; i--) {
      const well = G.gravityWells[i];
      well.timer -= dt;
      for (const e of G.enemies) {
        if (!e.alive || e.isFusing) continue;
        const d = dist(well, e);
        if (d < well.radius && d > 0) {
          const dx = well.x - e.x, dy = well.y - e.y;
          const nd = Math.sqrt(dx * dx + dy * dy);
          e.x += (dx / nd) * well.pullSpeed * dt;
          e.y += (dy / nd) * well.pullSpeed * dt;
        }
      }
      if (well.timer <= 0) {
        const explosionRadius = well.explosionRadius || 100;
        G.multiPopExplosions.push({ x: well.x, y: well.y, r: 0, maxR: explosionRadius, life: 0.2, maxLife: 0.2 });
        for (let j = G.enemies.length - 1; j >= 0; j--) {
          const e = G.enemies[j];
          if (e.alive && !e.isFusing && dist(well, e) < explosionRadius) {
            killEnemy(e, j);
          }
        }
        spawnParticles(well.x, well.y, '#8844aa', 12);
        G.gravityWells.splice(i, 1);
      }
    }
  }

  // Magnet pull
  if (player.magnetActive) {
    const radius = player.magnetRadius || 80;
    const speed = player.magnetSpeed || 150;
    for (const p of G.powerUps) {
      if (dist(player, p) < radius) {
        const dx = player.x - p.x, dy = player.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        p.x += (dx / d) * speed * dt; p.y += (dy / d) * speed * dt;
      }
    }
    // Magnet also pulls boost pickups
    for (const b of G.boostPickups) {
      if (dist(player, b) < radius) {
        const dx = player.x - b.x, dy = player.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        b.x += (dx / d) * speed * dt; b.y += (dy / d) * speed * dt;
      }
    }
    for (const e of G.enemies) {
      if (!e.alive || e.isFusing) continue;
      if (dist(player, e) < radius) {
        const dx = player.x - e.x, dy = player.y - e.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        e.x += (dx / d) * speed * dt; e.y += (dy / d) * speed * dt;
      }
    }
  }

  // Update sniper beams
  if (G.sniperBeams) {
    const pendingPillarDeaths = [];

    for (let i = G.sniperBeams.length - 1; i >= 0; i--) {
      const beam = G.sniperBeams[i];
      beam.timer -= dt;

      // Advance beam position (skip if already blocked by obstacle)
      if (!beam.blocked) {
        beam.headX += beam.dx * 600 * dt;
        beam.headY += beam.dy * 600 * dt;
      }

      // Test beam against blocking obstacles
      if (!beam.blocked && beam.timer > 0) {
        let closestT = Infinity;
        let hitX, hitY, hitObstacle = null, hitIsPillar = false;

        // Pillars (circle r=25)
        if (G.pillars) {
          for (const p of G.pillars) {
            if (!p.alive) continue;
            const res = segCircleIntersect(beam.sx, beam.sy, beam.headX, beam.headY, p.x, p.y, p.r);
            if (res && res.t < closestT) {
              closestT = res.t; hitX = res.x; hitY = res.y;
              hitObstacle = p; hitIsPillar = true;
            }
          }
        }
        // Bounce pads (circle r=30)
        if (G.bouncePads) {
          for (const pad of G.bouncePads) {
            const res = segCircleIntersect(beam.sx, beam.sy, beam.headX, beam.headY, pad.x, pad.y, pad.r);
            if (res && res.t < closestT) {
              closestT = res.t; hitX = res.x; hitY = res.y;
              hitObstacle = pad; hitIsPillar = false;
            }
          }
        }
        // Flat bouncers (OBB 80x12)
        if (G.flatBouncers) {
          for (const fb of G.flatBouncers) {
            const res = segOBBIntersect(beam.sx, beam.sy, beam.headX, beam.headY, fb);
            if (res && res.t < closestT) {
              closestT = res.t; hitX = res.x; hitY = res.y;
              hitObstacle = fb; hitIsPillar = false;
            }
          }
        }

        if (hitObstacle) {
          beam.headX = hitX;
          beam.headY = hitY;
          beam.blocked = true;

          // Pillar takes 1 HP damage per beam blocked
          if (hitIsPillar) {
            if (applyBeamDamageToPillar(hitObstacle)) {
              pendingPillarDeaths.push(hitObstacle);
            }
          }

          spawnBeamImpactSparks(hitX, hitY);
          spawnCombatText('BLOCKED', hitX, hitY - 15, { size: 14, color: '#ffffff', life: 0.6 });
          sfxBeamDeflect();
        }
      }

      // Check if beam hits player (only if not blocked by obstacle)
      if (beam.timer > 0 && !beam.hitPlayer && !beam.blocked) {
        const beamDist = pointToSegmentDist(player.x, player.y, beam.sx, beam.sy, beam.headX, beam.headY);
        if (beamDist < player.r + 3) {
          beam.hitPlayer = true;
          events.emit('sniperBeamHit', { x: beam.headX, y: beam.headY });
        }
      }
      if (beam.timer <= 0) G.sniperBeams.splice(i, 1);
    }

    // Deferred pillar cleanup (preserves multi-beam blocking on same frame)
    for (const p of pendingPillarDeaths) {
      cleanupDestroyedPillar(p);
    }
  }
}

// --- Teleporter update ---
function updateTeleporter(e, dt, player) {
  if (e.telegraphing) {
    e.telegraphTimer -= dt;
    if (e.telegraphTimer <= 0) {
      // Teleport
      spawnParticles(e.x, e.y, '#cc44ff', 6);
      e.x = e.teleportDest.x;
      e.y = e.teleportDest.y;
      spawnParticles(e.x, e.y, '#cc44ff', 6);
      e.telegraphing = false;
      e.teleportTimer = 2.5;
      // Resume random movement
      const angle = rand(0, Math.PI * 2);
      e.vx = Math.cos(angle) * e.speed; e.vy = Math.sin(angle) * e.speed;
    }
  } else {
    // Normal movement
    e.x += e.vx * dt; e.y += e.vy * dt;
    const teleWallDamp = e.bouncerImmunity > 0 ? 0.75 : 1.0;
    if (e.x - e.r < 0) { e.x = e.r; e.vx = Math.abs(e.vx) * teleWallDamp; }
    if (e.x + e.r > W) { e.x = W - e.r; e.vx = -Math.abs(e.vx) * teleWallDamp; }
    if (e.y - e.r < 0) { e.y = e.r; e.vy = Math.abs(e.vy) * teleWallDamp; }
    if (e.y + e.r > H) { e.y = H - e.r; e.vy = -Math.abs(e.vy) * teleWallDamp; }

    e.teleportTimer -= dt;
    if (e.teleportTimer <= 0) {
      // Start telegraph
      e.telegraphing = true;
      e.telegraphTimer = 0.6;
      // Pick destination
      const tpDist = rand(150, 300);
      const angle = rand(0, Math.PI * 2);
      let destX = e.x + Math.cos(angle) * tpDist;
      let destY = e.y + Math.sin(angle) * tpDist;
      destX = clamp(destX, 40, W - 40);
      destY = clamp(destY, 40, H - 40);
      e.teleportDest = { x: destX, y: destY };
      e.vx = 0; e.vy = 0; // stop while telegraphing
    }
  }
}

// --- Bomber update ---
function updateBomber(e, dt, player) {
  // Homing toward player
  const dx = player.x - e.x, dy = player.y - e.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  e.vx += (dx / d) * e.homingAccel * dt;
  e.vy += (dy / d) * e.homingAccel * dt;
  const s = mag(e.vx, e.vy);
  if (s > e.maxSpeed) {
    e.vx = (e.vx / s) * e.maxSpeed;
    e.vy = (e.vy / s) * e.maxSpeed;
  }
  e.x += e.vx * dt; e.y += e.vy * dt;
  e.x = clamp(e.x, e.r, W - e.r); e.y = clamp(e.y, e.r, H - e.r);
}

// --- Spawner update ---
function updateSpawner(e, dt) {
  // Clean dead minions
  if (e.activeMinions) {
    e.activeMinions = e.activeMinions.filter(m => m.alive);
  }

  e.spawnMinionTimer -= dt;
  if (e.spawnMinionTimer <= 0 && e.activeMinions.length < 3) {
    e.spawnMinionTimer = 4.0;
    const ss = getSpeedScale(G.wave);
    const minion = spawnEnemy('spawner_minion', e.x + rand(-20, 20), e.y + rand(-20, 20), ss, { owner: e, noShield: true });
    e.activeMinions.push(minion);
  }
}

// --- Sniper update ---
function updateSniper(e, dt, player) {
  if (e.recoilTimer > 0) {
    e.recoilTimer -= dt;
    return;
  }

  if (e.aiming) {
    e.aimTime += dt;
    // Track player during aim
    e.aimTargetX = player.x;
    e.aimTargetY = player.y;

    if (e.aimTime >= 1.2) {
      // Fire beam
      const dx = e.aimTargetX - e.x, dy = e.aimTargetY - e.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      G.sniperBeams = G.sniperBeams || [];
      G.sniperBeams.push({
        sx: e.x, sy: e.y,
        headX: e.x, headY: e.y,
        dx: dx / d, dy: dy / d,
        timer: 0.3, hitPlayer: false,
      });
      e.aiming = false;
      e.aimTimer = 3.0;
      e.recoilTimer = 0.5;
    }
  } else {
    // Wall movement
    e.x += e.vx * dt; e.y += e.vy * dt;
    // Keep on wall
    if (e.wallSide === 'top') { e.y = 10; if (e.x < e.r || e.x > W - e.r) e.vx = -e.vx; }
    else if (e.wallSide === 'bottom') { e.y = H - 10; if (e.x < e.r || e.x > W - e.r) e.vx = -e.vx; }
    else if (e.wallSide === 'left') { e.x = 10; if (e.y < e.r || e.y > H - e.r) e.vy = -e.vy; }
    else if (e.wallSide === 'right') { e.x = W - 10; if (e.y < e.r || e.y > H - e.r) e.vy = -e.vy; }
    e.x = clamp(e.x, e.r, W - e.r); e.y = clamp(e.y, e.r, H - e.r);

    e.aimTimer -= dt;
    if (e.aimTimer <= 0) {
      e.aiming = true;
      e.aimTime = 0;
      e.vx = 0; e.vy = 0;
    }
  }
}

// --- Beam-obstacle intersection helpers ---

// Segment (ax,ay)→(bx,by) vs circle (cx,cy,r). Returns {t, x, y} of entry point or null.
// Skips if source is inside or very close (t < 0.05).
function segCircleIntersect(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay;
  const fx = ax - cx, fy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-8) return null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0.05 || t > 1) return null;
  return { t, x: ax + t * dx, y: ay + t * dy };
}

// Segment vs OBB (flat bouncer: center fb.x/y, 80x12, rotated fb.angle).
// Returns {t, x, y} in world space or null.
function segOBBIntersect(ax, ay, bx, by, fb) {
  const cosA = Math.cos(-fb.angle), sinA = Math.sin(-fb.angle);
  const rax = (ax - fb.x) * cosA - (ay - fb.y) * sinA;
  const ray = (ax - fb.x) * sinA + (ay - fb.y) * cosA;
  const rbx = (bx - fb.x) * cosA - (by - fb.y) * sinA;
  const rby = (bx - fb.x) * sinA + (by - fb.y) * cosA;
  const rdx = rbx - rax, rdy = rby - ray;
  let tmin = 0, tmax = 1;
  // X slab [-40, 40]
  if (Math.abs(rdx) < 1e-8) { if (rax < -40 || rax > 40) return null; }
  else {
    let t1 = (-40 - rax) / rdx, t2 = (40 - rax) / rdx;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  // Y slab [-6, 6]
  if (Math.abs(rdy) < 1e-8) { if (ray < -6 || ray > 6) return null; }
  else {
    let t1 = (-6 - ray) / rdy, t2 = (6 - ray) / rdy;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmin < 0.05) return null;
  const lx = rax + tmin * rdx, ly = ray + tmin * rdy;
  const cosB = Math.cos(fb.angle), sinB = Math.sin(fb.angle);
  return { t: tmin, x: lx * cosB - ly * sinB + fb.x, y: lx * sinB + ly * cosB + fb.y };
}

// Impact sparks at beam-obstacle intersection (white, 6-10 small fast particles)
function spawnBeamImpactSparks(x, y) {
  const count = 6 + Math.floor(Math.random() * 5);
  for (let i = 0; i < count; i++) {
    if (G.particles.length >= 100) G.particles.shift();
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 70;
    const life = 0.15 + Math.random() * 0.1;
    G.particles.push({
      x, y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      r: 2, initR: 2, color: '#ffffff', alpha: 1, life, maxLife: life,
    });
  }
}

// Point-to-segment distance for beam collision
function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return Math.sqrt(apx * apx + apy * apy);
  let t = (apx * abx + apy * aby) / ab2;
  t = clamp(t, 0, 1);
  const closestX = ax + t * abx, closestY = ay + t * aby;
  const dx = px - closestX, dy = py - closestY;
  return Math.sqrt(dx * dx + dy * dy);
}

// --- Draw enemies ---
const ENEMY_DRAW_ORDER = ['drifter', 'mini_splitter', 'spawner_minion', 'tracker', 'splitter',
  'pulser', 'teleporter', 'bomber', 'spawner', 'sniper'];

// Cached per-frame alive enemy count for clarity dimming
let _frameAliveCount = 0;

export function drawEnemies() {
  _frameAliveCount = 0;
  for (const e of G.enemies) { if (e.alive) _frameAliveCount++; }

  // Visual priority: sort by distance from player (far first, near last)
  // so near enemies render on top
  const player = G.player;
  const toDraw = G.enemies.filter(e => e.alive || e.isFusing);
  if (player) {
    toDraw.sort((a, b) => dist(b, player) - dist(a, player));
  }
  for (const e of toDraw) {
    drawSingleEnemy(e);
  }

  // Draw sniper beams
  if (G.sniperBeams) {
    for (const beam of G.sniperBeams) {
      ctx.save();
      ctx.strokeStyle = '#ff2200';
      ctx.lineWidth = 6;
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 8;
      ctx.globalAlpha = beam.timer / 0.3;
      ctx.beginPath();
      ctx.moveTo(beam.sx, beam.sy);
      ctx.lineTo(beam.headX, beam.headY);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Draw sniper aim lines
  for (const e of G.enemies) {
    if (e.type !== 'sniper' || !e.aiming || !e.alive) continue;
    const progress = e.aimTime / 1.2;
    ctx.save();
    ctx.strokeStyle = '#ff0000';
    ctx.globalAlpha = 0.2 + progress * 0.4;
    ctx.lineWidth = progress > 0.83 ? 2 : 1;
    ctx.setLineDash(progress > 0.83 ? [] : [4, 4]);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.aimTargetX, e.aimTargetY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Draw teleporter ghost destinations
  for (const e of G.enemies) {
    if (e.type !== 'teleporter' || !e.telegraphing || !e.teleportDest) continue;
    const progress = 1 - (e.telegraphTimer / 0.6);
    if (progress > 0.5) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#cc44ff';
      ctx.beginPath();
      drawTrianglePath(e.teleportDest.x, e.teleportDest.y, e.r);
      ctx.fill();
      ctx.restore();
    }
  }

  // Draw gravity wells
  if (G.gravityWells) {
    for (const well of G.gravityWells) {
      const progress = 1 - (well.timer / 1.5);
      ctx.save();
      ctx.globalAlpha = 0.3 * (1 - progress);
      ctx.fillStyle = '#8844aa';
      ctx.shadowColor = '#8844aa';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(well.x, well.y, well.radius * (0.5 + progress * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawTrianglePath(x, y, r) {
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.866, y + r * 0.5);
  ctx.lineTo(x - r * 0.866, y + r * 0.5);
  ctx.closePath();
}

function drawHexagonPath(x, y, r) {
  for (let j = 0; j < 6; j++) {
    const angle = (j / 6) * Math.PI * 2 - Math.PI / 6;
    const px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r;
    j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawDiamondPath(x, y, rw, rh) {
  ctx.moveTo(x, y - rh);
  ctx.lineTo(x + rw, y);
  ctx.lineTo(x, y + rh);
  ctx.lineTo(x - rw, y);
  ctx.closePath();
}

function drawSingleEnemy(e) {
  const scale = e.spawnTimer > 0 ? e.spawnScale : 1;
  const spawnBlurMul = e.spawnTimer > 0 ? 2 : 1;
  let spawnAlpha = e.spawnTimer > 0 ? e.spawnScale : 1;
  const isFrozen = e.freezeTimer > 0;

  // Far-enemy dimming: reduce visual weight of distant enemies when screen is busy
  const aliveCount = _frameAliveCount;
  const playerDist = G.player ? dist(e, G.player) : 0;
  let farBlurMul = 1;
  if (aliveCount > CLARITY.FAR_BLUR_THRESHOLD && playerDist > CLARITY.FAR_BLUR_DISTANCE) {
    farBlurMul = 0.5;
  }
  if (aliveCount > CLARITY.FAR_DIM_THRESHOLD && playerDist > CLARITY.FAR_DIM_DISTANCE) {
    spawnAlpha *= CLARITY.FAR_DIM_ALPHA;
  }

  // Fusing bomber: flash rapidly
  if (e.isFusing) {
    const flashRate = Math.sin(Date.now() * 0.094) > 0 ? 1 : 0.3;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.globalAlpha = flashRate;
    ctx.fillStyle = e.fuseTimer < 0.3 ? '#ffffff' : '#ff2200';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, Math.PI * 2);
    ctx.fill();
    // Warning circle
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 90, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.save();
  // Idle bob: gentle vertical oscillation (2-3px, ~1.2s period, offset by spawnSeed)
  const idleBob = e.spawnTimer <= 0 ? Math.sin(Date.now() * 0.00524 + (e.idleSeed || 0)) * 2.5 : 0;
  ctx.translate(e.x, e.y + idleBob);
  ctx.scale(scale, scale);
  ctx.globalAlpha = spawnAlpha;

  // Boss vulnerability dimming: alpha 0.5 when invulnerable
  if (e.isBoss && (e.invTimer > 0 || e.phaseTransitioning)) {
    ctx.globalAlpha = spawnAlpha * 0.5;
  }

  // Hit flash (alternating white/boss-color for bosses)
  if (e.hitFlashTimer > 0) {
    if (e.isBoss && Math.floor(Date.now() / 60) % 2 === 0) {
      ctx.fillStyle = e.color;
      ctx.shadowColor = e.glowColor;
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
    }
  } else {
    ctx.fillStyle = e.color;
    ctx.shadowColor = e.glowColor;
  }
  ctx.shadowBlur = e.shadowBlur * spawnBlurMul * farBlurMul;
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

  // Teleporter flicker: subtle shimmer at all times, stronger during telegraph
  if (e.type === 'teleporter') {
    if (e.telegraphing) {
      ctx.globalAlpha = spawnAlpha * (0.3 + 0.7 * Math.abs(Math.sin(Date.now() * 0.063)));
    } else if (e.spawnTimer <= 0) {
      ctx.globalAlpha = spawnAlpha * (0.8 + 0.2 * Math.sin(Date.now() * 0.012 + (e.idleSeed || 0)));
    }
  }

  // Draw shape by type
  if (e.type === 'tracker') {
    // Idle: slow rotation toward player direction
    if (G.player && e.spawnTimer <= 0) {
      const toPlayerAngle = Math.atan2(G.player.y - e.y, G.player.x - e.x);
      ctx.rotate(toPlayerAngle + Math.PI / 2);
    }
    ctx.beginPath();
    ctx.moveTo(0, -e.r); ctx.lineTo(e.r, 0); ctx.lineTo(0, e.r); ctx.lineTo(-e.r, 0);
    ctx.closePath();
    ctx.fill();
  } else if (e.type === 'pulser') {
    // 8-pointed star body
    ctx.beginPath();
    for (let j = 0; j < 8; j++) {
      const angle = (j / 8) * Math.PI * 2 - Math.PI / 8;
      const px = Math.cos(angle) * e.r, py = Math.sin(angle) * e.r;
      j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    // Inner concentric ring detail
    ctx.strokeStyle = e.hitFlashTimer > 0 ? '#ffffff' : 'rgba(204, 102, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    // Center glow core
    ctx.fillStyle = e.hitFlashTimer > 0 ? '#ffffff' : e.glowColor;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = spawnAlpha;
    // Expanding pulse ring
    const progress = 1 - (e.pulseTimer / 3.5);
    ctx.globalAlpha = 0.3 * (1 - progress);
    ctx.strokeStyle = e.glowColor;
    ctx.lineWidth = 3 - progress * 2;
    ctx.shadowBlur = e.shadowBlur * 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 8 + progress * 30, 0, Math.PI * 2);
    ctx.stroke();
  } else if (e.type === 'teleporter') {
    ctx.beginPath();
    drawTrianglePath(0, 0, e.r);
    ctx.fill();
  } else if (e.type === 'bomber') {
    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, Math.PI * 2);
    ctx.fill();
    // Fuse line with crackle animation
    const fuseJitter = Math.sin(Date.now() * 0.047 + (e.idleSeed || 0)) * 3;
    const fuseJitter2 = Math.cos(Date.now() * 0.031 + (e.idleSeed || 0)) * 2;
    ctx.strokeStyle = e.hitFlashTimer > 0 ? '#ffffff' : '#ffaa00';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -e.r);
    ctx.lineTo(fuseJitter * 0.5, -e.r - 3);
    ctx.lineTo(fuseJitter2, -e.r - 5);
    ctx.lineTo(fuseJitter * 0.3 + 2, -e.r - 8);
    ctx.stroke();
    // Fuse spark with crackle glow
    const sparkPulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.02);
    ctx.fillStyle = '#ffdd00';
    ctx.shadowColor = '#ffdd00';
    ctx.shadowBlur = 4 + sparkPulse * 4;
    ctx.beginPath();
    ctx.arc(fuseJitter * 0.3 + 2, -e.r - 8, 1.5 + sparkPulse * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = e.shadowBlur * spawnBlurMul;
    // "!" marker
    ctx.fillStyle = '#000000';
    ctx.globalAlpha = 0.6;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 1);
    ctx.globalAlpha = spawnAlpha;
  } else if (e.type === 'spawner') {
    ctx.beginPath();
    drawHexagonPath(0, 0, e.r);
    ctx.fill();
    // Honeycomb texture inside with slow rotation
    ctx.strokeStyle = e.hitFlashTimer > 0 ? '#ffffff' : 'rgba(255, 100, 34, 0.35)';
    ctx.lineWidth = 0.8;
    const cellR = e.r * 0.3;
    const honeycombRot = e.spawnTimer <= 0 ? Date.now() * 0.0008 + (e.idleSeed || 0) : 0;
    for (const [ox, oy] of [[0, 0], [cellR * 1.5, cellR * 0.85], [-cellR * 1.5, cellR * 0.85], [cellR * 1.5, -cellR * 0.85], [-cellR * 1.5, -cellR * 0.85], [0, cellR * 1.7], [0, -cellR * 1.7]]) {
      if (Math.sqrt(ox * ox + oy * oy) + cellR < e.r * 0.9) {
        ctx.beginPath();
        for (let hj = 0; hj < 6; hj++) {
          const ha = (hj / 6) * Math.PI * 2 - Math.PI / 6 + honeycombRot;
          const hx = ox + Math.cos(ha) * cellR, hy = oy + Math.sin(ha) * cellR;
          hj === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    // HP pips
    const pipY = -e.r - 8;
    for (let j = 0; j < e.maxHp; j++) {
      ctx.fillStyle = j < e.hp ? e.color : '#333333';
      ctx.beginPath();
      ctx.arc(-4 + j * 8, pipY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (e.type === 'sniper') {
    ctx.beginPath();
    drawDiamondPath(0, 0, 4, 10);
    ctx.fill();
    // Red eye glow with idle pulse when not aiming
    const eyePulse = (!e.aiming && e.spawnTimer <= 0)
      ? 0.5 + 0.5 * Math.sin(Date.now() * 0.006 + (e.idleSeed || 0))
      : 1;
    ctx.fillStyle = '#ff0044';
    ctx.shadowColor = '#ff0044';
    ctx.shadowBlur = 4 + eyePulse * 8;
    ctx.beginPath();
    ctx.arc(0, 0, 1.5 + eyePulse * 1, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.type === 'spawner_minion') {
    ctx.beginPath();
    drawHexagonPath(0, 0, e.r);
    ctx.fill();
  } else if (e.isBoss && e.bossType === 'hive_queen') {
    // Hive Queen: ornate hexagon with crown protrusions
    ctx.beginPath();
    for (let j = 0; j < 6; j++) {
      const angle = (j / 6) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(angle) * e.r, py = Math.sin(angle) * e.r;
      j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    // Crown protrusions on top 3 vertices with wave bob
    ctx.fillStyle = e.hitFlashTimer > 0 ? '#ffffff' : '#ffaa22';
    for (let j = 0; j < 3; j++) {
      const angle = ((j + 5) / 6) * Math.PI * 2 - Math.PI / 2;
      const bx = Math.cos(angle) * e.r;
      const by = Math.sin(angle) * e.r;
      const crownBob = e.spawnTimer <= 0 ? Math.sin(Date.now() * 0.005 + j * 1.2 + (e.idleSeed || 0)) * 3 : 0;
      const tipLen = e.r + 10 + crownBob;
      const tipX = Math.cos(angle) * tipLen;
      const tipY = Math.sin(angle) * tipLen;
      ctx.beginPath();
      ctx.moveTo(bx - 4, by); ctx.lineTo(tipX, tipY); ctx.lineTo(bx + 4, by);
      ctx.closePath();
      ctx.fill();
    }
    // Inner honeycomb pattern
    ctx.strokeStyle = e.hitFlashTimer > 0 ? '#ffffff' : 'rgba(255, 170, 34, 0.4)';
    ctx.lineWidth = 1;
    const innerR = e.r * 0.5;
    ctx.beginPath();
    for (let j = 0; j < 6; j++) {
      const angle = (j / 6) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(angle) * innerR, py = Math.sin(angle) * innerR;
      j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

  } else if (e.isBoss && e.bossType === 'nexus_core') {
    // Nexus Core: dodecagon cycling through phase colors
    const phaseColors = ['#ffffff', '#00ff88', '#aa44ff', '#cc44ff', '#ff0000'];
    const coreColor = e.hitFlashTimer > 0 ? '#ffffff' : (phaseColors[e.phase] || '#ffffff');
    ctx.fillStyle = coreColor;
    ctx.shadowColor = coreColor;
    ctx.beginPath();
    for (let j = 0; j < 12; j++) {
      const angle = (j / 12) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(angle) * e.r, py = Math.sin(angle) * e.r;
      j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    // Inner rotating ring
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    const rot = Date.now() / 2000 * Math.PI * 2;
    ctx.beginPath();
    for (let j = 0; j < 12; j++) {
      const angle = rot + (j / 12) * Math.PI * 2;
      const px = Math.cos(angle) * e.r * 0.6, py = Math.sin(angle) * e.r * 0.6;
      j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    // Center glow dot
    ctx.fillStyle = coreColor;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();

  } else if (e.isBoss && e.bossType === 'void_warden') {
    // Void Warden: jagged irregular circle with cosmic interior
    const points = 16;
    ctx.beginPath();
    for (let j = 0; j < points; j++) {
      const angle = (j / points) * Math.PI * 2;
      const jag = e.r * (0.85 + 0.15 * Math.sin(j * 3.7 + Date.now() * 0.002));
      const px = Math.cos(angle) * jag, py = Math.sin(angle) * jag;
      j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    // Interior: mini-galaxy swirl
    ctx.save();
    ctx.beginPath();
    for (let j = 0; j < points; j++) {
      const angle = (j / points) * Math.PI * 2;
      const jag = e.r * (0.85 + 0.15 * Math.sin(j * 3.7 + Date.now() * 0.002));
      j === 0 ? ctx.moveTo(Math.cos(angle) * jag, Math.sin(angle) * jag) : ctx.lineTo(Math.cos(angle) * jag, Math.sin(angle) * jag);
    }
    ctx.closePath();
    ctx.clip();
    const swirl = Date.now() * 0.001;
    ctx.globalAlpha = 0.4;
    for (let s = 0; s < 3; s++) {
      const sAngle = swirl + s * (Math.PI * 2 / 3);
      const armLen = e.r * 0.8;
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, armLen);
      grad.addColorStop(0, '#cc88ff');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let t = 0; t <= 1; t += 0.05) {
        const a = sAngle + t * Math.PI * 0.8;
        const pr = t * armLen;
        ctx.lineTo(Math.cos(a) * pr, Math.sin(a) * pr);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Outer jagged ring stroke
    ctx.strokeStyle = e.hitFlashTimer > 0 ? '#ffffff' : '#8844cc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let j = 0; j < points; j++) {
      const angle = (j / points) * Math.PI * 2;
      const jag = e.r * (0.85 + 0.15 * Math.sin(j * 3.7 + Date.now() * 0.002));
      const px = Math.cos(angle) * jag, py = Math.sin(angle) * jag;
      j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

  } else {
    // Default circle (drifter, mini_splitter, etc.)
    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Frozen overlay — icy tint
  if (isFrozen) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#88ddff';
    ctx.shadowColor = '#88ddff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw shield if present — translucent hexagonal barrier
  if (e.shield && e.shieldHp > 0) {
    const shieldR = e.r + 5;
    const pulse = 0.3 + 0.15 * Math.sin(Date.now() * 0.008);
    const rot = Date.now() * 0.0005;
    ctx.save();
    ctx.translate(e.x, e.y);

    // Inner hex fill (translucent)
    ctx.globalAlpha = pulse * 0.3;
    ctx.fillStyle = '#44ddff';
    ctx.beginPath();
    drawHexagonPath(0, 0, shieldR);
    ctx.fill();

    // Outer hex stroke with glow
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#44ddff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#44ddff';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.beginPath();
    drawHexagonPath(0, 0, shieldR);
    ctx.stroke();

    // Rotating dash inner ring
    ctx.shadowBlur = 0;
    ctx.globalAlpha = pulse * 0.4;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.lineDashOffset = rot * 100;
    ctx.beginPath();
    drawHexagonPath(0, 0, shieldR - 3);
    ctx.stroke();
    ctx.setLineDash([]);

    // Shield HP pips (small dots on vertices)
    ctx.globalAlpha = 0.8;
    for (let j = 0; j < e.shieldHp; j++) {
      const angle = (j / Math.max(e.shieldHp, 3)) * Math.PI * 2 - Math.PI / 2;
      ctx.fillStyle = '#88eeff';
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * (shieldR + 4), Math.sin(angle) * (shieldR + 4), 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
