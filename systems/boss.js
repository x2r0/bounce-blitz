'use strict';

import { W, H, STATE, FONT, ENEMY_COLORS } from '../config.js';
import { rand, dist, clamp, mag, triggerShake } from '../utils.js';
import { G } from '../state.js';
import { ctx, drawGlowText } from '../canvas.js';
import { spawnParticles } from './particles.js';
import { spawnCombatText } from './combat-text.js';
import { events } from '../eventbus.js';
import { spawnEnemy, killEnemy } from '../entities/enemy.js';
import { getSpeedScale, getBossType, getBossScaling } from './wave.js';
import { sfxBossIntro, sfxBossHit, sfxBossPhaseTransition, sfxBossDefeat, setBossMusic, setMusicState, notifyBossEvent } from './audio.js';
import { spawnPowerGem } from './arena.js';
import { spawnBossBoost } from './lootcrate.js';
import { saveMeta } from './meta.js';
import { BOSS_LORE } from './lore.js';

// --- Boss Definitions ---
export const BOSS_DEFS = {
  hive_queen: {
    name: 'The Hive Queen', tagline: 'Mother of Swarms',
    loreText: BOSS_LORE.hive_queen,
    r: 30, baseHp: 12, baseSpeed: 65, points: 3000,
    shards: 30, firstTimeShards: 60,
    color: ENEMY_COLORS.hive_queen,
    phases: [
      { name: 'BROOD', hpThreshold: 8/12 },
      { name: 'FRENZY', hpThreshold: 4/12 },
      { name: 'DESPERATION', hpThreshold: 0 },
    ],
  },
  nexus_core: {
    name: 'The Nexus Core', tagline: 'All Things Combined',
    loreText: BOSS_LORE.nexus_core,
    r: 40, baseHp: 20, baseSpeed: 60, points: 5000,
    shards: 50, firstTimeShards: 100,
    color: ENEMY_COLORS.nexus_core,
    phases: [
      { name: 'SWARM', hpThreshold: 15/20 },
      { name: 'PULSE', hpThreshold: 10/20 },
      { name: 'PHANTOM', hpThreshold: 5/20 },
      { name: 'RAGE', hpThreshold: 0 },
    ],
  },
  void_warden: {
    name: 'The Void Warden', tagline: 'End of All Runs',
    loreText: BOSS_LORE.void_warden,
    r: 45, baseHp: 30, baseSpeed: 70, points: 8000,
    shards: 80, firstTimeShards: 150,
    color: ENEMY_COLORS.void_warden,
    phases: [
      { name: 'GRAVITY', hpThreshold: 24/30 },
      { name: 'STORM', hpThreshold: 18/30 },
      { name: 'WARP', hpThreshold: 12/30 },
      { name: 'MIRROR', hpThreshold: 6/30 },
      { name: 'OBLIVION', hpThreshold: 0 },
    ],
  },
};

// --- Boss Intro Card State ---
export function startBossIntro(wave) {
  const bossType = getBossType(wave);
  const def = BOSS_DEFS[bossType];
  const scaling = getBossScaling(wave);

  G.bossIntro = {
    bossType, def, wave, scaling,
    phase: 'dim', // dim -> slideIn -> hold -> slideOut -> undim -> spawn
    timer: 0, totalTime: 0,
    cardY: -200, // starts off-screen
    dimAlpha: 0,
    skippable: false,
    skipTimer: 0,
  };
  G.state = STATE.BOSS_INTRO_CARD;
  setMusicState('boss_intro');
  sfxBossIntro();
  events.emit('bossIntroStarted', { bossType });
}

export function updateBossIntro(dt) {
  const intro = G.bossIntro;
  if (!intro) return;
  intro.timer += dt;
  intro.skipTimer += dt;
  if (intro.skipTimer > 0.5) intro.skippable = true;

  if (intro.phase === 'dim') {
    intro.dimAlpha = Math.min(0.6, intro.dimAlpha + dt * 2); // 0.3s
    if (intro.dimAlpha >= 0.6) { intro.phase = 'slideIn'; intro.timer = 0; }
  } else if (intro.phase === 'slideIn') {
    const t = Math.min(1, intro.timer / 0.5);
    intro.cardY = -200 + t * t * (180 + 200); // ease-out to y=180
    if (t >= 1) { intro.phase = 'hold'; intro.timer = 0; }
  } else if (intro.phase === 'hold') {
    if (intro.timer >= 2.0) { intro.phase = 'slideOut'; intro.timer = 0; }
  } else if (intro.phase === 'slideOut') {
    const t = Math.min(1, intro.timer / 0.3);
    intro.cardY = 180 + t * t * 400; // ease-in downward
    if (t >= 1) { intro.phase = 'undim'; intro.timer = 0; }
  } else if (intro.phase === 'undim') {
    intro.dimAlpha = Math.max(0, intro.dimAlpha - dt * 3.3); // 0.3s
    if (intro.dimAlpha <= 0) { intro.phase = 'spawn'; intro.timer = 0; }
  } else if (intro.phase === 'spawn') {
    // Instead of spawning immediately, transition to ready screen
    G.bossReady = {
      bossType: intro.bossType,
      def: intro.def,
      wave: intro.wave,
      scaling: intro.scaling,
      pulseTimer: 0,
    };
    G.bossIntro = null;
    G.state = STATE.BOSS_READY;
  }
}

export function skipBossIntro() {
  const intro = G.bossIntro;
  if (!intro || !intro.skippable) return;
  // Fast-forward to ready screen
  G.bossReady = {
    bossType: intro.bossType,
    def: intro.def,
    wave: intro.wave,
    scaling: intro.scaling,
    pulseTimer: 0,
  };
  G.bossIntro = null;
  G.state = STATE.BOSS_READY;
}

// --- Boss Tutorial Overlay (first encounter) ---
export function updateBossTutorial(dt) {
  if (!G.bossTutorial) return;
  G.bossTutorial.timer += dt;
  if (G.bossTutorial.timer >= G.bossTutorial.duration) {
    dismissBossTutorial();
  }
}

export function dismissBossTutorial() {
  if (!G.bossTutorial) return;
  if (G.bossTutorial.timer < G.bossTutorial.dismissableAfter) return;
  G.meta.firstBossSeen = true;
  saveMeta(G.meta);
  G.bossTutorial = null;
  G.state = STATE.BOSS_FIGHT;
}

export function drawBossTutorial() {
  if (!G.bossTutorial) return;
  const tut = G.bossTutorial;

  // Semi-transparent overlay
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  const cx = W / 2, cy = H / 2;

  // "BOSS FIGHT"
  ctx.font = 'bold 28px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffdd44';
  ctx.shadowColor = '#ffdd44';
  ctx.shadowBlur = 10;
  ctx.fillText('BOSS FIGHT', cx, cy - 40);
  ctx.shadowBlur = 0;

  // "Dash into the boss to deal damage"
  ctx.font = '16px ' + FONT;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Dash into the boss to deal damage', cx, cy);

  // Controls hint
  ctx.font = '12px ' + FONT;
  ctx.fillStyle = '#888888';
  const isTouchDevice = 'ontouchstart' in window;
  if (isTouchDevice) {
    ctx.fillText('[TAP] Dash   [DRAG] Move', cx, cy + 30);
  } else {
    ctx.fillText('[SPACE] Dash   [WASD] Move', cx, cy + 30);
  }

  // "Press any key to begin" — pulse alpha
  if (tut.timer >= tut.dismissableAfter) {
    const pulseA = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() * 0.004));
    ctx.globalAlpha = pulseA;
    ctx.fillStyle = '#666666';
    ctx.font = '12px ' + FONT;
    ctx.fillText('Press any key to begin', cx, cy + 65);
  }

  ctx.restore();
}

export function drawBossIntro() {
  const intro = G.bossIntro;
  if (!intro) return;

  // Dim overlay
  if (intro.dimAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = intro.dimAlpha;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Card
  if (intro.phase === 'slideIn' || intro.phase === 'hold' || intro.phase === 'slideOut') {
    const cardW = 340, cardH = 240;
    const cardX = (W - cardW) / 2;
    const cardY = intro.cardY;

    ctx.save();
    // Card background
    ctx.fillStyle = 'rgba(10, 10, 26, 0.95)';
    ctx.fillRect(cardX, cardY, cardW, cardH);

    // Gold border with glow
    const borderGlow = 8 + 8 * Math.sin(Date.now() * 0.006);
    ctx.strokeStyle = '#ffdd44';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ffdd44';
    ctx.shadowBlur = borderGlow;
    ctx.strokeRect(cardX, cardY, cardW, cardH);
    ctx.shadowBlur = 0;

    // "BOSS" label
    ctx.font = '12px ' + FONT;
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#ff4444';
    ctx.fillText('BOSS', cardX + cardW - 8, cardY + 8);

    // Wave label
    ctx.textAlign = 'left';
    ctx.fillStyle = '#888888';
    ctx.fillText('WAVE ' + intro.wave, cardX + 8, cardY + 8);

    // Boss name
    ctx.font = 'bold 28px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffdd44';
    ctx.fillText(intro.def.name, cardX + cardW / 2, cardY + 40);

    // Tagline
    ctx.font = 'italic 14px ' + FONT;
    ctx.fillStyle = '#aaaacc';
    ctx.fillText('"' + intro.def.tagline + '"', cardX + cardW / 2, cardY + 70);

    // Boss lore text (3 lines below tagline)
    if (intro.def.loreText) {
      ctx.font = 'italic 12px ' + FONT;
      ctx.fillStyle = '#aaaaaa';
      const loreLines = intro.def.loreText.split('\n');
      for (let i = 0; i < loreLines.length; i++) {
        ctx.fillText(loreLines[i], cardX + cardW / 2, cardY + 90 + i * 14);
      }
    }

    // Hint line: "DASH to attack!"
    ctx.font = 'bold 16px ' + FONT;
    ctx.fillStyle = '#00ffff';
    ctx.fillText('DASH to attack!', cardX + cardW / 2, cardY + 145);

    // Boss silhouette — distinct shape per boss
    const silX = cardX + cardW / 2, silY = cardY + 195, silR = 28;
    ctx.fillStyle = intro.def.color.core;
    ctx.shadowColor = intro.def.color.glow;
    ctx.shadowBlur = 16;
    ctx.globalAlpha = 0.7;

    if (intro.bossType === 'hive_queen') {
      // Hexagon with crown protrusions
      ctx.beginPath();
      for (let j = 0; j < 6; j++) {
        const a = (j / 6) * Math.PI * 2 - Math.PI / 2;
        const px = silX + Math.cos(a) * silR, py = silY + Math.sin(a) * silR;
        j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffaa22';
      for (let j = 0; j < 3; j++) {
        const a = ((j + 5) / 6) * Math.PI * 2 - Math.PI / 2;
        const bx = silX + Math.cos(a) * silR, by = silY + Math.sin(a) * silR;
        const tx = silX + Math.cos(a) * (silR + 8), ty = silY + Math.sin(a) * (silR + 8);
        ctx.beginPath();
        ctx.moveTo(bx - 3, by); ctx.lineTo(tx, ty); ctx.lineTo(bx + 3, by);
        ctx.closePath();
        ctx.fill();
      }
    } else if (intro.bossType === 'nexus_core') {
      // Dodecagon with inner glow
      ctx.beginPath();
      for (let j = 0; j < 12; j++) {
        const a = (j / 12) * Math.PI * 2 - Math.PI / 2;
        const px = silX + Math.cos(a) * silR, py = silY + Math.sin(a) * silR;
        j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(silX, silY, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (intro.bossType === 'void_warden') {
      // Jagged irregular circle with cosmic center
      ctx.beginPath();
      for (let j = 0; j < 16; j++) {
        const a = (j / 16) * Math.PI * 2;
        const jag = silR * (0.85 + 0.15 * Math.sin(j * 3.7));
        const px = silX + Math.cos(a) * jag, py = silY + Math.sin(a) * jag;
        j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      const grad = ctx.createRadialGradient(silX, silY, 0, silX, silY, silR * 0.6);
      grad.addColorStop(0, 'rgba(204, 136, 255, 0.5)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(silX, silY, silR * 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(silX, silY, silR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    ctx.restore();
  }
}

// --- Boss Ready Screen (wait for player input) ---
export function updateBossReady(dt) {
  if (!G.bossReady) return;
  G.bossReady.pulseTimer += dt;
}

export function confirmBossReady() {
  const ready = G.bossReady;
  if (!ready) return;
  spawnBoss(ready.bossType, ready.wave, ready.scaling);
  G.bossReady = null;
  if (!G.meta.firstBossSeen) {
    G.bossTutorial = { timer: 0, duration: 3.0, dismissableAfter: 1.0 };
    G.state = STATE.BOSS_TUTORIAL;
  } else {
    G.state = STATE.BOSS_FIGHT;
  }
  setBossMusic(true);
}

export function drawBossReady() {
  if (!G.bossReady) return;
  const ready = G.bossReady;
  const cx = W / 2, cy = H / 2;

  // Semi-transparent overlay
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  // Boss name
  ctx.font = 'bold 24px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffdd44';
  ctx.shadowColor = '#ffdd44';
  ctx.shadowBlur = 10;
  ctx.fillText(ready.def.name, cx, cy - 30);
  ctx.shadowBlur = 0;

  // Pulsing "Press SPACE to begin" prompt
  const pulse = 0.6 + 0.4 * Math.sin(ready.pulseTimer * 3);
  ctx.globalAlpha = pulse;
  ctx.font = 'bold 18px ' + FONT;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Press SPACE to begin', cx, cy + 20);

  // Mobile touch hint
  ctx.font = '13px ' + FONT;
  ctx.fillStyle = '#888888';
  ctx.globalAlpha = pulse * 0.8;
  ctx.fillText('or tap anywhere', cx, cy + 48);

  ctx.restore();
}

// --- Spawn Boss ---
function spawnBoss(bossType, wave, scaling) {
  const def = BOSS_DEFS[bossType];
  const totalHp = Math.ceil(def.baseHp * scaling.hpMul);
  const speedMul = scaling.speedMul;

  const boss = {
    type: bossType, x: W / 2, y: H / 2,
    vx: 0, vy: 0, alive: true,
    spawnScale: 0, spawnTimer: 0.5,
    color: def.color.core, glowColor: def.color.glow, shadowBlur: def.color.blur,
    r: def.r, hp: totalHp, maxHp: totalHp,
    points: def.points, isBoss: true,
    phase: 0, phaseTransitioning: false, phaseTransitionTimer: 0,
    invTimer: 0, hitFlashTimer: 0, hpBarFlashTimer: 0, hitCount: 0,
    speed: def.baseSpeed * speedMul,
    shield: false, shieldHp: 0,
    idleSeed: Math.random() * 6283,
    // Boss-specific timers
    bossType, def, wave, scaling,
    attackTimer: 0, spawnTimer2: 0,
    activeMinions: [],
    // Hive Queen
    swarmCommandTimer: 0, swarmCommandActive: false, swarmCommandDuration: 0,
    swarmDiveCooldown: 6.0, swarmDiveTelegraph: 0, swarmDiveActive: false, swarmDiveDuration: 0,
    swarmDiveTargetX: 0, swarmDiveTargetY: 0,
    // Nexus Core
    shockwaveTimer: 0, teleportTimer: 0, aimTimer: 0, aiming: false, aimTime: 0,
    aimTargetX: 0, aimTargetY: 0,
    // Void Warden
    gravityWells: [], teleportTimer2: 0, telegraphing: false, telegraphTimer: 0,
    teleportDest: null, hazardZones: [], mirrorCopies: [],
    shrinkTimer: 0, safeZone: { x: 0, y: 0, w: W, h: H },
  };

  G.boss = boss;
  G.enemies.push(boss);

  // Burst particles
  spawnParticles(W / 2, H / 2, def.color.core, 8);
}

// --- Boss HP Thresholds ---
function getPhaseHpThreshold(boss, phaseIndex) {
  const def = BOSS_DEFS[boss.bossType];
  return Math.ceil(boss.maxHp * def.phases[phaseIndex].hpThreshold);
}

// --- Update Boss ---
export function updateBoss(dt) {
  const boss = G.boss;
  if (!boss || !boss.alive) return;
  const player = G.player;

  // Phase transition
  if (boss.phaseTransitioning) {
    boss.phaseTransitionTimer -= dt;
    if (boss.phaseTransitionTimer <= 0) {
      boss.phaseTransitioning = false;
      boss.invTimer = 0;
      // Kill all boss-spawned enemies
      for (const m of boss.activeMinions) { if (m.alive) { m.alive = false; spawnParticles(m.x, m.y, m.color, 6); } }
      boss.activeMinions = [];
      // Phase name text with phase number subtitle
      const def = BOSS_DEFS[boss.bossType];
      const phaseName = def.phases[boss.phase].name;
      G.floatTexts.push({ text: phaseName, x: W / 2, y: H / 2, size: 28, alpha: 1,
        phase: 'scale', scaleT: 0, color: '#ffffff', glowColor: '#ffdd44', vy: 0, life: 1.0 });
      G.floatTexts.push({ text: 'Phase ' + (boss.phase + 1) + '/' + def.phases.length, x: W / 2, y: H / 2 + 30, size: 14, alpha: 1,
        phase: 'scale', scaleT: 0, color: '#aaaaaa', glowColor: '#aaaaaa', vy: 0, life: 1.0 });
      // Track divider glow timer
      boss.dividerGlowTimer = 0.5;
    }
    return;
  }

  if (boss.invTimer > 0) { boss.invTimer -= dt; }
  if (boss.hitFlashTimer > 0) { boss.hitFlashTimer -= dt; }
  if (boss.hpBarFlashTimer > 0) { boss.hpBarFlashTimer -= dt; }
  if (boss.dividerGlowTimer > 0) { boss.dividerGlowTimer -= dt; }

  // Spawn animation
  if (boss.spawnTimer > 0) {
    boss.spawnTimer -= dt;
    boss.spawnScale = 1 - (boss.spawnTimer / 0.5);
    if (boss.spawnTimer <= 0) {
      boss.spawnScale = 1;
      spawnParticles(boss.x, boss.y, boss.color, 16); // particle burst on spawn complete
      triggerShake(G, 4, 0.15);
    }
    return;
  }

  // Check phase transitions
  const def = BOSS_DEFS[boss.bossType];
  if (boss.phase < def.phases.length - 1) {
    const nextThreshold = getPhaseHpThreshold(boss, boss.phase + 1);
    if (boss.hp <= nextThreshold) {
      boss.phase++;
      boss.phaseTransitioning = true;
      const transTime = boss.bossType === 'void_warden' ? 2.0 : boss.bossType === 'nexus_core' ? 1.5 : 1.2;
      boss.phaseTransitionTimer = transTime;
      boss.invTimer = transTime;
      triggerShake(G, boss.bossType === 'void_warden' ? 10 : 8, boss.bossType === 'void_warden' ? 0.4 : 0.3);
      G.freezeTimer = 0.1; // hitstop on phase transition
      sfxBossPhaseTransition();
      notifyBossEvent('phase_change', boss.phase);
      spawnParticles(boss.x, boss.y, boss.color, 12);
      // Reset phase-specific timers
      boss.attackTimer = 0; boss.spawnTimer2 = 0;
      boss.swarmCommandTimer = 0; boss.swarmDiveCooldown = 6.0; boss.swarmDiveTelegraph = 0;
      boss.swarmDiveActive = false; boss.swarmDiveDuration = 0;
      boss.shockwaveTimer = 0;
      boss.teleportTimer = 0; boss.teleportTimer2 = 0;
      boss.aiming = false; boss.aimTimer = 0;
      // Void Warden: clear hazards and copies on phase change
      if (boss.bossType === 'void_warden') {
        boss.gravityWells = [];
        boss.hazardZones = [];
        for (const copy of boss.mirrorCopies) { if (copy.alive) { copy.alive = false; spawnParticles(copy.x, copy.y, '#8844cc', 6); } }
        boss.mirrorCopies = [];
        boss.safeZone = { x: 0, y: 0, w: W, h: H };
      }
      return;
    }
  }

  // Clean dead minions
  boss.activeMinions = boss.activeMinions.filter(m => m.alive);

  // Type-specific behavior
  if (boss.bossType === 'hive_queen') updateHiveQueen(boss, dt, player);
  else if (boss.bossType === 'nexus_core') updateNexusCore(boss, dt, player);
  else if (boss.bossType === 'void_warden') updateVoidWarden(boss, dt, player);
}

// --- Hive Queen ---
function updateHiveQueen(boss, dt, player) {
  const phase = boss.phase;

  // Movement
  const speed = phase === 0 ? boss.speed : phase === 1 ? boss.speed * 1.6 : boss.speed * 2;
  if (phase < 2) {
    // Random bouncing
    if (boss.vx === 0 && boss.vy === 0) {
      const angle = rand(0, Math.PI * 2);
      boss.vx = Math.cos(angle) * speed; boss.vy = Math.sin(angle) * speed;
    }
    boss.x += boss.vx * dt; boss.y += boss.vy * dt;
    if (boss.x - boss.r < 0) { boss.x = boss.r; boss.vx = Math.abs(boss.vx); }
    if (boss.x + boss.r > W) { boss.x = W - boss.r; boss.vx = -Math.abs(boss.vx); }
    if (boss.y - boss.r < 0) { boss.y = boss.r; boss.vy = Math.abs(boss.vy); }
    if (boss.y + boss.r > H) { boss.y = H - boss.r; boss.vy = -Math.abs(boss.vy); }
  } else {
    // Phase 3: light homing
    const dx = player.x - boss.x, dy = player.y - boss.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    boss.vx += (dx / d) * 45 * dt; boss.vy += (dy / d) * 45 * dt;
    const s = mag(boss.vx, boss.vy);
    if (s > speed) { boss.vx = (boss.vx / s) * speed; boss.vy = (boss.vy / s) * speed; }
    boss.x += boss.vx * dt; boss.y += boss.vy * dt;
    boss.x = clamp(boss.x, boss.r, W - boss.r); boss.y = clamp(boss.y, boss.r, H - boss.r);
  }

  // Minion spawning
  const spawnRate = phase === 0 ? 2.0 : phase === 1 ? 1.5 : 1.0;
  const spawnCount = phase === 0 ? 2 : phase === 1 ? 3 : 5;
  const maxMinions = phase === 0 ? 8 : phase === 1 ? 15 : 24;

  boss.spawnTimer2 -= dt;
  if (boss.spawnTimer2 <= 0 && boss.activeMinions.length < maxMinions) {
    boss.spawnTimer2 = spawnRate;
    const ss = getSpeedScale(boss.wave);
    for (let i = 0; i < spawnCount && boss.activeMinions.length < maxMinions; i++) {
      const minion = spawnEnemy('spawner_minion', undefined, undefined, ss, { owner: boss, noShield: true });
      // Override minion stats for boss minions
      const mSpeed = 140 * ss;
      const angle = rand(0, Math.PI * 2);
      minion.vx = Math.cos(angle) * mSpeed; minion.vy = Math.sin(angle) * mSpeed;
      minion.speed = mSpeed;
      minion.r = 10; // buffed radius
      if (phase === 2) { minion.hp = 2; minion.maxHp = 2; } // DESPERATION minions tougher
      boss.activeMinions.push(minion);
    }
  }

  // Swarm Command (Phase 2+)
  if (phase >= 1) {
    const commandInterval = phase === 1 ? 3.0 : 2.0;
    boss.swarmCommandTimer -= dt;
    if (boss.swarmCommandTimer <= 0 && !boss.swarmCommandActive) {
      boss.swarmCommandTimer = commandInterval;
      boss.swarmCommandActive = true;
      boss.swarmCommandDuration = 1.5;
      boss.hitFlashTimer = 0.5; // yellow flash telegraph
    }
    if (boss.swarmCommandActive) {
      boss.swarmCommandDuration -= dt;
      // Minions home toward player
      for (const m of boss.activeMinions) {
        if (!m.alive) continue;
        const dx = player.x - m.x, dy = player.y - m.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        m.vx = (dx / d) * 280; m.vy = (dy / d) * 280;
      }
      if (boss.swarmCommandDuration <= 0) boss.swarmCommandActive = false;
    }
  }

  // SWARM DIVE (DESPERATION phase only)
  if (phase === 2) {
    if (boss.swarmDiveActive) {
      // Minions are dashing toward locked position
      boss.swarmDiveDuration -= dt;
      for (const m of boss.activeMinions) {
        if (!m.alive) continue;
        const dx = boss.swarmDiveTargetX - m.x, dy = boss.swarmDiveTargetY - m.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        m.vx = (dx / d) * 350; m.vy = (dy / d) * 350;
      }
      if (boss.swarmDiveDuration <= 0) {
        boss.swarmDiveActive = false;
        boss.swarmDiveCooldown = 6.0;
      }
    } else if (boss.swarmDiveTelegraph > 0) {
      // Telegraph phase — queen flashes yellow, lock target on start
      boss.swarmDiveTelegraph -= dt;
      boss.hitFlashTimer = boss.swarmDiveTelegraph; // keep yellow flash during telegraph
      if (boss.swarmDiveTelegraph <= 0) {
        boss.swarmDiveActive = true;
        boss.swarmDiveDuration = 0.6;
      }
    } else {
      // Cooldown
      boss.swarmDiveCooldown -= dt;
      if (boss.swarmDiveCooldown <= 0 && boss.activeMinions.length >= 16) {
        boss.swarmDiveTelegraph = 0.8;
        boss.swarmDiveTargetX = player.x; // lock current position (not predicted)
        boss.swarmDiveTargetY = player.y;
      }
    }
  }

  // Knockback pulse (Phase 3, on each hit) — handled in hitBoss
}

// --- Nexus Core ---
function updateNexusCore(boss, dt, player) {
  const phase = boss.phase;

  if (phase === 0) {
    // Random movement, spawn drifters
    if (boss.vx === 0 && boss.vy === 0) {
      const angle = rand(0, Math.PI * 2);
      boss.vx = Math.cos(angle) * boss.speed; boss.vy = Math.sin(angle) * boss.speed;
    }
    boss.x += boss.vx * dt; boss.y += boss.vy * dt;
    if (boss.x - boss.r < 0) { boss.x = boss.r; boss.vx = Math.abs(boss.vx); }
    if (boss.x + boss.r > W) { boss.x = W - boss.r; boss.vx = -Math.abs(boss.vx); }
    if (boss.y - boss.r < 0) { boss.y = boss.r; boss.vy = Math.abs(boss.vy); }
    if (boss.y + boss.r > H) { boss.y = H - boss.r; boss.vy = -Math.abs(boss.vy); }

    boss.spawnTimer2 -= dt;
    if (boss.spawnTimer2 <= 0) {
      boss.spawnTimer2 = 3.0;
      const ss = getSpeedScale(boss.wave);
      const m = spawnEnemy('drifter', undefined, undefined, ss, { noShield: true });
      boss.activeMinions.push(m);
    }
  } else if (phase === 1) {
    // Stationary, shockwaves, spawn trackers
    boss.vx = 0; boss.vy = 0;
    boss.shockwaveTimer -= dt;
    if (boss.shockwaveTimer <= 0) {
      boss.shockwaveTimer = 2.5;
      G.shockwaves.push({ x: boss.x, y: boss.y, r: 0, maxR: 200, life: 1.0, maxLife: 1.0, thickness: 10 });
    }
    boss.spawnTimer2 -= dt;
    if (boss.spawnTimer2 <= 0) {
      boss.spawnTimer2 = 4.0;
      const ss = getSpeedScale(boss.wave);
      const m = spawnEnemy('tracker', undefined, undefined, ss, { noShield: true });
      boss.activeMinions.push(m);
    }
  } else if (phase === 2) {
    // Teleport + sniper beams + spawn bombers
    boss.teleportTimer -= dt;
    if (boss.teleportTimer <= 0 && !boss.telegraphing) {
      boss.telegraphing = true;
      boss.telegraphTimer = 0.5;
      const tpDist = rand(100, 250);
      const angle = rand(0, Math.PI * 2);
      let destX = clamp(boss.x + Math.cos(angle) * tpDist, 50, W - 50);
      let destY = clamp(boss.y + Math.sin(angle) * tpDist, 50, H - 50);
      boss.teleportDest = { x: destX, y: destY };
    }
    if (boss.telegraphing) {
      boss.telegraphTimer -= dt;
      if (boss.telegraphTimer <= 0) {
        spawnParticles(boss.x, boss.y, '#ffffff', 6);
        boss.x = boss.teleportDest.x; boss.y = boss.teleportDest.y;
        spawnParticles(boss.x, boss.y, '#ffffff', 6);
        boss.telegraphing = false;
        boss.teleportTimer = 2.0;
        // Fire sniper beam after teleport
        boss.aiming = true; boss.aimTime = 0;
      }
    }
    if (boss.aiming) {
      boss.aimTime += dt;
      boss.aimTargetX = player.x; boss.aimTargetY = player.y;
      if (boss.aimTime >= 1.0) {
        const dx = boss.aimTargetX - boss.x, dy = boss.aimTargetY - boss.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        G.sniperBeams = G.sniperBeams || [];
        G.sniperBeams.push({ sx: boss.x, sy: boss.y, headX: boss.x, headY: boss.y,
          dx: dx / d, dy: dy / d, timer: 0.3, hitPlayer: false });
        boss.aiming = false;
      }
    }
    boss.spawnTimer2 -= dt;
    if (boss.spawnTimer2 <= 0) {
      boss.spawnTimer2 = 5.0;
      const ss = getSpeedScale(boss.wave);
      const m = spawnEnemy('bomber', undefined, undefined, ss, { noShield: true });
      boss.activeMinions.push(m);
    }
  } else if (phase === 3) {
    // Rage: fast homing + shockwaves
    const speed = 120 * boss.scaling.speedMul;
    const dx = player.x - boss.x, dy = player.y - boss.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    boss.vx += (dx / d) * 60 * dt; boss.vy += (dy / d) * 60 * dt;
    const s = mag(boss.vx, boss.vy);
    if (s > speed) { boss.vx = (boss.vx / s) * speed; boss.vy = (boss.vy / s) * speed; }
    boss.x += boss.vx * dt; boss.y += boss.vy * dt;
    boss.x = clamp(boss.x, boss.r, W - boss.r); boss.y = clamp(boss.y, boss.r, H - boss.r);

    boss.shockwaveTimer -= dt;
    if (boss.shockwaveTimer <= 0) {
      boss.shockwaveTimer = 2.0;
      G.shockwaves.push({ x: boss.x, y: boss.y, r: 0, maxR: 150, life: 1.0, maxLife: 1.0, thickness: 8 });
    }

    boss.teleportTimer -= dt;
    if (boss.teleportTimer <= 0 && !boss.telegraphing) {
      boss.telegraphing = true;
      boss.telegraphTimer = 0.4;
      const tpDist = rand(100, 200);
      const angle = rand(0, Math.PI * 2);
      boss.teleportDest = { x: clamp(boss.x + Math.cos(angle) * tpDist, 50, W - 50),
                            y: clamp(boss.y + Math.sin(angle) * tpDist, 50, H - 50) };
    }
    if (boss.telegraphing) {
      boss.telegraphTimer -= dt;
      if (boss.telegraphTimer <= 0) {
        spawnParticles(boss.x, boss.y, '#ffffff', 6);
        boss.x = boss.teleportDest.x; boss.y = boss.teleportDest.y;
        spawnParticles(boss.x, boss.y, '#ff4444', 6);
        boss.telegraphing = false;
        boss.teleportTimer = 3.0;
      }
    }
  }
}

// --- Void Warden ---
function updateVoidWarden(boss, dt, player) {
  const phase = boss.phase;

  if (phase === 0) {
    // Stationary, gravity wells, spawn drifters
    updateVoidWardenGravityWells(boss, dt, player);
    boss.spawnTimer2 -= dt;
    if (boss.spawnTimer2 <= 0) {
      boss.spawnTimer2 = 3.0;
      const ss = getSpeedScale(boss.wave);
      const m = spawnEnemy('drifter', undefined, undefined, ss, { noShield: true });
      boss.activeMinions.push(m);
    }
  } else if (phase === 1) {
    // Moving, triple sniper beams, gravity wells
    const speed = boss.speed;
    if (boss.vx === 0 && boss.vy === 0) {
      const angle = rand(0, Math.PI * 2);
      boss.vx = Math.cos(angle) * speed; boss.vy = Math.sin(angle) * speed;
    }
    boss.x += boss.vx * dt; boss.y += boss.vy * dt;
    if (boss.x - boss.r < 0) { boss.x = boss.r; boss.vx = Math.abs(boss.vx); }
    if (boss.x + boss.r > W) { boss.x = W - boss.r; boss.vx = -Math.abs(boss.vx); }
    if (boss.y - boss.r < 0) { boss.y = boss.r; boss.vy = Math.abs(boss.vy); }
    if (boss.y + boss.r > H) { boss.y = H - boss.r; boss.vy = -Math.abs(boss.vy); }

    // Triple sniper beams every 4s
    boss.attackTimer -= dt;
    if (boss.attackTimer <= 0 && !boss.aiming) {
      boss.aiming = true; boss.aimTime = 0;
    }
    if (boss.aiming) {
      boss.aimTime += dt;
      boss.aimTargetX = player.x; boss.aimTargetY = player.y;
      if (boss.aimTime >= 1.0) {
        const dx = boss.aimTargetX - boss.x, dy = boss.aimTargetY - boss.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const baseAngle = Math.atan2(dy, dx);
        G.sniperBeams = G.sniperBeams || [];
        for (const offset of [0, Math.PI / 6, -Math.PI / 6]) {
          const a = baseAngle + offset;
          G.sniperBeams.push({ sx: boss.x, sy: boss.y, headX: boss.x, headY: boss.y,
            dx: Math.cos(a), dy: Math.sin(a), timer: 0.3, hitPlayer: false });
        }
        boss.aiming = false;
        boss.attackTimer = 4.0;
      }
    }
    // Reduced gravity wells
    if (boss.gravityWells.length < 2) {
      boss.teleportTimer2 -= dt;
      if (boss.teleportTimer2 <= 0) {
        boss.teleportTimer2 = 5.0;
        const gx = rand(80, W - 80), gy = rand(80, H - 80);
        boss.gravityWells.push({ x: gx, y: gy, r: 80, timer: 5.0, fadeTimer: 0 });
      }
    }
    updateVoidWardenGravityWells(boss, dt, player);

    boss.spawnTimer2 -= dt;
    if (boss.spawnTimer2 <= 0) {
      boss.spawnTimer2 = 4.0;
      const ss = getSpeedScale(boss.wave);
      const m = spawnEnemy('tracker', undefined, undefined, ss, { noShield: true });
      boss.activeMinions.push(m);
    }
  } else if (phase === 2) {
    // Teleport, drop hazard zones, spawn bombers
    boss.teleportTimer -= dt;
    if (boss.teleportTimer <= 0 && !boss.telegraphing) {
      boss.telegraphing = true;
      boss.telegraphTimer = 0.4;
      const tpDist = rand(100, 250);
      const angle = rand(0, Math.PI * 2);
      boss.teleportDest = { x: clamp(boss.x + Math.cos(angle) * tpDist, 50, W - 50),
                            y: clamp(boss.y + Math.sin(angle) * tpDist, 50, H - 50) };
    }
    if (boss.telegraphing) {
      boss.telegraphTimer -= dt;
      if (boss.telegraphTimer <= 0) {
        // Drop hazard zone at previous position
        if (boss.hazardZones.length < 4) {
          boss.hazardZones.push({ x: boss.x - 40, y: boss.y - 40, w: 80, h: 80,
            cx: boss.x, cy: boss.y, timer: 8.0, damageTimer: 0 });
        } else {
          // Remove oldest
          boss.hazardZones.shift();
          boss.hazardZones.push({ x: boss.x - 40, y: boss.y - 40, w: 80, h: 80,
            cx: boss.x, cy: boss.y, timer: 8.0, damageTimer: 0 });
        }
        spawnParticles(boss.x, boss.y, '#8844cc', 6);
        boss.x = boss.teleportDest.x; boss.y = boss.teleportDest.y;
        spawnParticles(boss.x, boss.y, '#8844cc', 6);
        boss.telegraphing = false;
        boss.teleportTimer = 1.5;
      }
    } else {
      // Move between teleports
      const speed = 90 * boss.scaling.speedMul;
      if (boss.vx === 0 && boss.vy === 0) {
        const angle = rand(0, Math.PI * 2);
        boss.vx = Math.cos(angle) * speed; boss.vy = Math.sin(angle) * speed;
      }
      boss.x += boss.vx * dt; boss.y += boss.vy * dt;
      boss.x = clamp(boss.x, boss.r, W - boss.r); boss.y = clamp(boss.y, boss.r, H - boss.r);
    }

    // Update hazard zones
    for (let i = boss.hazardZones.length - 1; i >= 0; i--) {
      const hz = boss.hazardZones[i];
      hz.timer -= dt;
      if (hz.timer <= 0) { boss.hazardZones.splice(i, 1); continue; }
      // Damage player inside
      if (player.x > hz.x && player.x < hz.x + hz.w && player.y > hz.y && player.y < hz.y + hz.h) {
        hz.damageTimer += dt;
        if (hz.damageTimer >= 2.0) {
          hz.damageTimer = 0;
          if (player.invTimer <= 0 && player.overdriveTimer <= 0) {
            events.emit('hazardZoneDamage', { x: hz.cx, y: hz.cy });
          }
        }
      } else {
        hz.damageTimer = 0;
      }
    }

    boss.spawnTimer2 -= dt;
    if (boss.spawnTimer2 <= 0) {
      boss.spawnTimer2 = 4.0;
      const ss = getSpeedScale(boss.wave);
      const m = spawnEnemy('bomber', undefined, undefined, ss, { noShield: true });
      boss.activeMinions.push(m);
    }
  } else if (phase === 3) {
    // Mirror copies, homing, shockwaves
    const speed = 80 * boss.scaling.speedMul;
    const dx = player.x - boss.x, dy = player.y - boss.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    boss.vx += (dx / d) * 40 * dt; boss.vy += (dy / d) * 40 * dt;
    const s = mag(boss.vx, boss.vy);
    if (s > speed) { boss.vx = (boss.vx / s) * speed; boss.vy = (boss.vy / s) * speed; }
    boss.x += boss.vx * dt; boss.y += boss.vy * dt;
    boss.x = clamp(boss.x, boss.r, W - boss.r); boss.y = clamp(boss.y, boss.r, H - boss.r);

    // Mirror copies
    boss.mirrorCopies = boss.mirrorCopies.filter(c => c.alive);
    while (boss.mirrorCopies.length < 2) {
      const angle = rand(0, Math.PI * 2);
      const copyDist = 150;
      const copy = {
        x: clamp(W / 2 + Math.cos(angle) * copyDist, 50, W - 50),
        y: clamp(H / 2 + Math.sin(angle) * copyDist, 50, H - 50),
        vx: 0, vy: 0, alive: true, hp: 1, r: boss.r,
        respawnTimer: 0, isCopy: true,
      };
      boss.mirrorCopies.push(copy);
    }
    // Update copies
    for (const copy of boss.mirrorCopies) {
      if (!copy.alive) {
        copy.respawnTimer -= dt;
        if (copy.respawnTimer <= 0) {
          copy.alive = true; copy.hp = 1;
          const angle = rand(0, Math.PI * 2);
          copy.x = clamp(boss.x + Math.cos(angle) * 100, 50, W - 50);
          copy.y = clamp(boss.y + Math.sin(angle) * 100, 50, H - 50);
        }
        continue;
      }
      const cdx = player.x - copy.x, cdy = player.y - copy.y;
      const cd = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
      copy.vx += (cdx / cd) * 40 * dt; copy.vy += (cdy / cd) * 40 * dt;
      const cs = mag(copy.vx, copy.vy);
      if (cs > speed) { copy.vx = (copy.vx / cs) * speed; copy.vy = (copy.vy / cs) * speed; }
      copy.x += copy.vx * dt; copy.y += copy.vy * dt;
      copy.x = clamp(copy.x, 50, W - 50); copy.y = clamp(copy.y, 50, H - 50);
    }

    // Shockwaves every 3s from each entity
    boss.shockwaveTimer -= dt;
    if (boss.shockwaveTimer <= 0) {
      boss.shockwaveTimer = 3.0;
      G.shockwaves.push({ x: boss.x, y: boss.y, r: 0, maxR: 150, life: 1.0, maxLife: 1.0, thickness: 8 });
      for (const copy of boss.mirrorCopies) {
        if (copy.alive) {
          G.shockwaves.push({ x: copy.x, y: copy.y, r: 0, maxR: 150, life: 1.0, maxLife: 1.0, thickness: 8 });
        }
      }
    }
  } else if (phase === 4) {
    // Oblivion: shrinking arena, fast homing, shockwaves
    const speed = 120 * boss.scaling.speedMul;
    const dx = player.x - boss.x, dy = player.y - boss.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    boss.vx += (dx / d) * 80 * dt; boss.vy += (dy / d) * 80 * dt;
    const s = mag(boss.vx, boss.vy);
    if (s > speed) { boss.vx = (boss.vx / s) * speed; boss.vy = (boss.vy / s) * speed; }
    boss.x += boss.vx * dt; boss.y += boss.vy * dt;
    boss.x = clamp(boss.x, boss.r, W - boss.r); boss.y = clamp(boss.y, boss.r, H - boss.r);

    // Shrink arena every 3s
    boss.shrinkTimer -= dt;
    if (boss.shrinkTimer <= 0) {
      boss.shrinkTimer = 3.0;
      const sz = boss.safeZone;
      sz.x = Math.min(sz.x + 20, 200);
      sz.y = Math.min(sz.y + 20, 150);
      sz.w = Math.max(sz.w - 40, 400);
      sz.h = Math.max(sz.h - 40, 300);
    }
    // Damage player outside safe zone
    const sz = boss.safeZone;
    if (player.x < sz.x || player.x > sz.x + sz.w || player.y < sz.y || player.y > sz.y + sz.h) {
      boss.attackTimer += dt;
      if (boss.attackTimer >= 1.5) {
        boss.attackTimer = 0;
        if (player.invTimer <= 0 && player.overdriveTimer <= 0) {
          events.emit('hazardZoneDamage', { x: player.x, y: player.y });
        }
      }
    }

    // Shockwaves every 2s
    boss.shockwaveTimer -= dt;
    if (boss.shockwaveTimer <= 0) {
      boss.shockwaveTimer = 2.0;
      G.shockwaves.push({ x: boss.x, y: boss.y, r: 0, maxR: 120, life: 1.0, maxLife: 1.0, thickness: 8 });
    }
  }
}

function updateVoidWardenGravityWells(boss, dt, player) {
  // Initialize gravity wells for phase 0
  if (boss.phase === 0 && boss.gravityWells.length < 3) {
    boss.teleportTimer2 -= dt;
    if (boss.teleportTimer2 <= 0) {
      boss.teleportTimer2 = 5.0;
      notifyBossEvent('gravity_well');
      // Reposition all wells
      boss.gravityWells = [];
      for (let i = 0; i < 3; i++) {
        boss.gravityWells.push({
          x: rand(80, W - 80), y: rand(80, H - 80), r: 80, timer: 5.0, fadeTimer: 0,
        });
      }
    }
  }

  // Pull player toward wells
  for (const well of boss.gravityWells) {
    const d = dist(player, well);
    if (d < well.r && d > 0) {
      const pullSpeed = 150;
      const dx = well.x - player.x, dy = well.y - player.y;
      const nd = Math.sqrt(dx * dx + dy * dy);
      player.vx += (dx / nd) * pullSpeed * dt;
      player.vy += (dy / nd) * pullSpeed * dt;
    }
  }
}

// --- Hit Boss ---
export function hitBoss(boss) {
  if (boss.invTimer > 0 || boss.phaseTransitioning) return;
  boss.hp--;
  boss.invTimer = 0.3;
  boss.hitFlashTimer = 0.25;
  boss.hpBarFlashTimer = 0.15;
  boss.hitCount++;
  triggerShake(G, 6, 0.2);
  G.freezeTimer = 0.03; // hitstop
  sfxBossHit();
  spawnCombatText('-1', boss.x, boss.y - boss.r - 10, { size: 26, color: '#ff4444', bold: true });
  // Hit particles in boss color
  const def = BOSS_DEFS[boss.bossType];
  spawnParticles(boss.x, boss.y, def.color.core, 6);

  // Hive Queen Phase 3: knockback pulse on hit
  if (boss.bossType === 'hive_queen' && boss.phase === 2) {
    const player = G.player;
    const dx = player.x - boss.x, dy = player.y - boss.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    player.vx = (dx / d) * 600; player.vy = (dy / d) * 600;
    G.shockwaves.push({ x: boss.x, y: boss.y, r: 0, maxR: 100, life: 0.3, maxLife: 0.3, thickness: 6 });
  }

  // Check if boss is dead
  if (boss.hp <= 0) {
    defeatBoss(boss);
  }
}

// --- Defeat Boss ---
export function defeatBoss(boss) {
  boss.alive = false;
  G.boss = null;
  sfxBossDefeat();
  setBossMusic(false);

  // Kill all boss-spawned enemies
  for (const m of boss.activeMinions) {
    if (m.alive) { m.alive = false; spawnParticles(m.x, m.y, m.color, 6); }
  }

  // Void Warden copies
  if (boss.mirrorCopies) {
    for (const c of boss.mirrorCopies) {
      if (c.alive) { c.alive = false; spawnParticles(c.x, c.y, '#8844cc', 6); }
    }
  }

  const def = BOSS_DEFS[boss.bossType];
  const isFinalBoss = boss.bossType === 'void_warden' && boss.wave === 30;
  const isEndlessFinalBoss = boss.bossType === 'void_warden' && boss.wave > 30;

  // Points
  const routeScoreBonus = G.bossRouteScoreBonus || 0;
  G.score += def.points + Math.round(def.points * routeScoreBonus);
  spawnParticles(boss.x, boss.y, boss.color, isFinalBoss ? 24 : 16);

  // Shards
  const scaling = getBossScaling(boss.wave);
  let shardBonus = def.shards + scaling.shardBonus;
  // First-time bonus
  const bossKey = 'boss_' + boss.bossType + '_defeated';
  if (!G.meta[bossKey]) {
    shardBonus = def.firstTimeShards + scaling.shardBonus;
    G.meta[bossKey] = true;
  }
  shardBonus += G.bossRouteShardBonus || 0;
  G.bossShardBonus = (G.bossShardBonus || 0) + shardBonus;
  G.lastBossResult = {
    bossWave: boss.wave,
    bossType: boss.bossType,
    nextWave: boss.wave + 1,
    isFinalBoss,
    isEndlessFinalBoss,
  };
  G.bossRouteShardBonus = 0;
  G.bossRouteScoreBonus = 0;

  if (boss.wave > 30) {
    // Endless bosses keep the old drop cadence because they have no story return room.
    spawnPowerGem(boss.x, boss.y, { common: 15, rare: 50, epic: 35 });
    spawnBossBoost(boss.x + 25, boss.y);
  }

  // Screen effects
  if (isFinalBoss) {
    triggerShake(G, 10, 0.5);
    G.freezeTimer = 1.0;
    // Auto-unlock Endless Mode
    if (!G.meta.unlocks.includes(15)) {
      G.meta.unlocks.push(15);
      G.meta.endlessUnlocked = true;
      G.runUnlockedEndlessThisRun = true;
    }
    G.victoryPending = true;
  } else {
    triggerShake(G, 10, 0.5);
    G.floatTexts.push({ text: 'BOSS DEFEATED', x: W / 2, y: H / 2, size: 36, alpha: 1,
      phase: 'scale', scaleT: 0, color: '#ffdd44', glowColor: '#ffdd44', vy: 0, life: 1.5 });
    G.floatTexts.push({ text: '+' + shardBonus + (shardBonus === 1 ? ' Shard' : ' Shards'), x: W / 2, y: H / 2 + 40, size: 20, alpha: 1,
      phase: 'scale', scaleT: 0, color: '#ffdd44', glowColor: '#ffdd44', vy: 0, life: 1.0 });
  }

  // Transition back to power select after pause
  G.bossClearPause = isFinalBoss ? 3.0 : 1.0;
}

// --- Update boss clear pause ---
export function updateBossClearPause(dt) {
  if (G.bossClearPause > 0) {
    G.bossClearPause -= dt;
    if (G.bossClearPause <= 0) {
      if (G.victoryPending) {
        G.victoryPending = false;
        G.isVictory = true;
        return 'victory';
      }
      return 'cleared';
    }
  }
  return null;
}

// --- Draw Boss HP Bar ---
export function drawBossHPBar() {
  const boss = G.boss;
  if (!boss || !boss.alive) return;

  const def = BOSS_DEFS[boss.bossType];
  const barW = boss.bossType === 'void_warden' ? 360 : boss.bossType === 'nexus_core' ? 300 : 240;
  const barH = boss.bossType === 'void_warden' ? 10 : boss.bossType === 'nexus_core' ? 8 : 6;
  const barX = (W - barW) / 2;
  const barY = 20;

  // Determine phase fill color
  let fillColor, labelColor;
  if (boss.bossType === 'void_warden') {
    fillColor = boss.phase >= 4 ? '#ff0000' : boss.phase >= 3 ? '#cc2222' : '#8844cc';
    labelColor = '#8844cc';
  } else if (boss.bossType === 'nexus_core') {
    fillColor = boss.phase >= 3 ? '#ff0000' : boss.phase >= 2 ? '#ffdd00' : '#ffffff';
    labelColor = '#ffffff';
  } else {
    fillColor = '#ff8800';
    labelColor = '#ff8800';
  }

  ctx.save();
  // Label with boss-colored glow
  ctx.font = 'bold 14px ' + FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.shadowColor = labelColor;
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = labelColor;
  ctx.fillText(def.name.toUpperCase(), W / 2, barY - 4);
  ctx.shadowBlur = 0;
  ctx.fillText(def.name.toUpperCase(), W / 2, barY - 4);

  // Background
  ctx.fillStyle = '#111118';
  ctx.beginPath();
  ctx.roundRect(barX - 1, barY - 1, barW + 2, barH + 2, 3);
  ctx.fill();

  // Fill with glow — clip to bar bounds so glow doesn't bleed past the fill edge
  const hpRatio = boss.hp / boss.maxHp;
  if (hpRatio > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(barX - 1, barY - 12, barW + 2, barH + 24);
    ctx.clip();
    // HP bar flash on hit
    const barFillColor = boss.hpBarFlashTimer > 0 ? '#ffffff' : fillColor;
    ctx.fillStyle = barFillColor;
    ctx.shadowColor = barFillColor;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * hpRatio, barH, 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * hpRatio, barH, 2);
    ctx.fill();
    ctx.restore();
  }

  // Phase dividers with glow on transition
  for (let i = 1; i < def.phases.length; i++) {
    const threshold = def.phases[i].hpThreshold;
    if (threshold > 0) {
      const divX = barX + barW * threshold;
      if (boss.dividerGlowTimer > 0) {
        ctx.save();
        ctx.shadowColor = '#ffdd44';
        ctx.shadowBlur = 8 * (boss.dividerGlowTimer / 0.5);
        ctx.fillStyle = '#ffdd44';
        ctx.fillRect(divX - 1, barY - 1, 2, barH + 2);
        ctx.restore();
      } else {
        ctx.fillStyle = '#000000';
        ctx.fillRect(divX - 1, barY - 1, 2, barH + 2);
      }
    }
  }

  // Border
  ctx.strokeStyle = '#444455';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(barX - 1, barY - 1, barW + 2, barH + 2, 3);
  ctx.stroke();

  // Phase name indicator (moved to bottom-left)
  const phaseName = def.phases[boss.phase].name;
  ctx.font = '10px ' + FONT;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = fillColor;
  ctx.globalAlpha = 0.7;
  ctx.fillText(phaseName, barX, barY + barH + 12);

  // Numeric HP display (after first hit)
  if (boss.hitCount > 0) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#888888';
    ctx.font = '10px ' + FONT;
    ctx.fillText('HP ' + boss.hp + '/' + boss.maxHp, barX + barW, barY + barH + 12);
  }
  ctx.globalAlpha = 1;

  ctx.restore();
}

// --- Draw Boss (additional visuals) ---
export function drawBossExtras() {
  const boss = G.boss;
  if (!boss || !boss.alive) return;
  const def = BOSS_DEFS[boss.bossType];

  const isVulnerable = boss.invTimer <= 0 && !boss.phaseTransitioning;

  if (isVulnerable) {
    // Glow pulse: oscillate shadow blur on 500ms sine cycle
    const glowPulse = def.color.blur + 12 * Math.abs(Math.sin(Date.now() * 0.00628));
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.shadowColor = def.color.glow;
    ctx.shadowBlur = glowPulse;
    ctx.fillStyle = 'transparent';
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, boss.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Dashed border ring, rotating clockwise at 60 deg/s
    const ringR = boss.r + 6;
    const rot = Date.now() * 0.001047; // 60 deg/s in radians
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = def.color.core;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.translate(boss.x, boss.y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  } else {
    // Not vulnerable: dim + shield icon
    // Shield "X" icon above boss
    ctx.save();
    const iconY = boss.y - boss.r - 14;
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(boss.x - 5, iconY - 5);
    ctx.lineTo(boss.x + 5, iconY + 5);
    ctx.moveTo(boss.x + 5, iconY - 5);
    ctx.lineTo(boss.x - 5, iconY + 5);
    ctx.stroke();
    // Small circle around it
    ctx.beginPath();
    ctx.arc(boss.x, iconY, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Phase transition flash: rapid white/color toggle during phaseTransitioning
  if (boss.phaseTransitioning) {
    const flashOn = Math.floor(Date.now() / 100) % 2 === 0;
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = flashOn ? '#ffffff' : def.color.core;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, boss.r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Void Warden gravity wells
  if (boss.bossType === 'void_warden' && boss.gravityWells) {
    for (const well of boss.gravityWells) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#440066';
      ctx.shadowColor = '#8844cc';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(well.x, well.y, well.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Void Warden hazard zones
  if (boss.bossType === 'void_warden' && boss.hazardZones) {
    for (const hz of boss.hazardZones) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#8844cc';
      ctx.fillRect(hz.x, hz.y, hz.w, hz.h);
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#8844cc';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(hz.x, hz.y, hz.w, hz.h);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // Void Warden safe zone boundary (phase 4)
  if (boss.bossType === 'void_warden' && boss.phase === 4) {
    const sz = boss.safeZone;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.strokeRect(sz.x, sz.y, sz.w, sz.h);
    // Danger zone overlay outside safe zone
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, W, sz.y);
    ctx.fillRect(0, sz.y + sz.h, W, H - sz.y - sz.h);
    ctx.fillRect(0, sz.y, sz.x, sz.h);
    ctx.fillRect(sz.x + sz.w, sz.y, W - sz.x - sz.w, sz.h);
    ctx.restore();
  }

  // Mirror copies
  if (boss.bossType === 'void_warden' && boss.mirrorCopies) {
    for (const copy of boss.mirrorCopies) {
      if (!copy.alive) continue;
      ctx.save();
      ctx.translate(copy.x, copy.y);
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#8844cc';
      ctx.shadowColor = '#8844cc';
      ctx.shadowBlur = 20;
      // Irregular jagged circle
      ctx.beginPath();
      for (let j = 0; j < 12; j++) {
        const angle = (j / 12) * Math.PI * 2;
        const rVar = copy.r + rand(-3, 3);
        const px = Math.cos(angle) * rVar, py = Math.sin(angle) * rVar;
        j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

// --- Check mirror copy collisions ---
export function checkMirrorCopyCollisions(player) {
  const boss = G.boss;
  if (!boss || boss.bossType !== 'void_warden' || !boss.mirrorCopies) return;
  const canKill = player.dashGraceTimer > 0 || player.overdriveTimer > 0;

  for (const copy of boss.mirrorCopies) {
    if (!copy.alive) continue;
    const d = dist(player, copy);
    if (d < player.r + copy.r) {
      if (canKill) {
        copy.alive = false;
        copy.respawnTimer = 3.0;
        spawnParticles(copy.x, copy.y, '#8844cc', 8);
      } else {
        // Push copy away on passive collision
        const pdx = copy.x - player.x;
        const pdy = copy.y - player.y;
        const pushDist = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
        const overlap = (player.r + copy.r) - pushDist;
        if (overlap > 0) {
          copy.x += (pdx / pushDist) * overlap;
          copy.y += (pdy / pushDist) * overlap;
        }
        events.emit('hazardZoneDamage', { x: copy.x, y: copy.y });
      }
    }
  }
}
