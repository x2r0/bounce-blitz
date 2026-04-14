'use strict';

import { W, H, ENEMY_COLORS } from '../config.js';
import { ctx } from '../canvas.js';

// --- State ---
let inited = false;
let time = 0;

// Player patrol
const player = { x: 400, y: 390 };
let trailTimer = 0;
const trails = [];

// Ambient enemies
const enemies = [];

// Sparkle particles
const sparkles = [];
const SPARKLE_COLORS = ['#00ffff', '#4488ff', '#ffdd44'];

// Grid pulse
const pulse = { active: false, radius: 0, gap: 0 };

// --- Init ---
function init() {
  if (inited) return;
  inited = true;
  time = 0;
  trailTimer = 0;
  trails.length = 0;

  // 4 enemies: 2 drifters, 1 tracker, 1 pulser
  const types = ['drifter', 'drifter', 'tracker', 'pulser'];
  enemies.length = 0;
  for (let i = 0; i < 4; i++) {
    enemies.push({
      x: 100 + Math.random() * (W - 200),
      y: 240 + Math.random() * (H - 280),
      vx: (30 + Math.random() * 20) * (Math.random() < 0.5 ? -1 : 1),
      vy: (30 + Math.random() * 20) * (Math.random() < 0.5 ? -1 : 1),
      r: 8 + Math.random() * 4,
      type: types[i],
    });
  }

  // 8 sparkles
  sparkles.length = 0;
  for (let i = 0; i < 8; i++) {
    sparkles.push(makeSparkle());
  }

  // Start pulse gap
  pulse.active = false;
  pulse.radius = 0;
  pulse.gap = 1;
}

function makeSparkle() {
  return {
    x: Math.random() * W,
    y: H * 0.4 + Math.random() * H * 0.6,
    vy: -(15 + Math.random() * 10),
    vx: (Math.random() - 0.5) * 10,
    life: 0,
    maxLife: 3 + Math.random() * 2,
    color: SPARKLE_COLORS[Math.floor(Math.random() * 3)],
  };
}

// --- Update ---
export function updateTitleBackground(dt) {
  init();
  time += dt;

  // Player figure-8
  const t = time;
  player.x = 400 + 120 * Math.sin(t * 2 * Math.PI / 8);
  player.y = 390 + 60 * Math.sin(t * 4 * Math.PI / 8);

  // Trail every 3 frames (~0.05s)
  trailTimer += dt;
  if (trailTimer >= 0.05) {
    trailTimer = 0;
    trails.push({ x: player.x, y: player.y, life: 0.12 });
  }
  for (let i = trails.length - 1; i >= 0; i--) {
    trails[i].life -= dt;
    if (trails[i].life <= 0) trails.splice(i, 1);
  }

  // Enemies drift + bounce
  for (const e of enemies) {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (e.x < e.r || e.x > W - e.r) { e.vx = -e.vx; e.x = Math.max(e.r, Math.min(W - e.r, e.x)); }
    if (e.y < 240 || e.y > H - e.r) { e.vy = -e.vy; e.y = Math.max(240, Math.min(H - e.r, e.y)); }
  }

  // Sparkles
  for (let i = 0; i < sparkles.length; i++) {
    const s = sparkles[i];
    s.life += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.life >= s.maxLife) {
      sparkles[i] = makeSparkle();
    }
  }

  // Grid pulse
  if (pulse.active) {
    pulse.radius += 100 * dt; // 0->300 in 3s
    if (pulse.radius >= 300) {
      pulse.active = false;
      pulse.gap = 1;
    }
  } else {
    pulse.gap -= dt;
    if (pulse.gap <= 0) {
      pulse.active = true;
      pulse.radius = 0;
    }
  }
}

// --- Draw ---
export function drawTitleBackground() {
  if (!inited) return;

  // Dark band for text readability
  const band = ctx.createLinearGradient(0, 0, 0, 330);
  band.addColorStop(0, 'rgba(10,10,15,0.6)');
  band.addColorStop(1, 'rgba(10,10,15,0)');

  // Draw enemies (behind everything)
  ctx.save();
  ctx.globalAlpha = 0.6;
  for (const e of enemies) {
    const ec = ENEMY_COLORS[e.type] || ENEMY_COLORS.drifter;
    ctx.save();
    ctx.shadowColor = ec.glow;
    ctx.shadowBlur = ec.blur * 0.6;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fillStyle = ec.core;
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // Grid pulse ring
  if (pulse.active) {
    const pAlpha = 0.15 * (1 - pulse.radius / 300);
    if (pAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = pAlpha;
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, pulse.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Player trails
  for (const t of trails) {
    const a = 0.4 * (t.life / 0.12);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#00ffff';
    ctx.fill();
    ctx.restore();
  }

  // Player character
  ctx.save();
  // Cyan glow
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(player.x, player.y, 12, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowBlur = 0;
  // Eyes (track movement direction)
  const dx = Math.cos(time * 2 * Math.PI / 8);
  const eyeOff = dx >= 0 ? 3 : -3;
  ctx.fillStyle = '#0a0a0f';
  ctx.beginPath();
  ctx.arc(player.x + eyeOff - 2, player.y - 2, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(player.x + eyeOff + 2, player.y - 2, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Sparkle particles
  for (const s of sparkles) {
    const t = s.life / s.maxLife;
    let alpha;
    const fadeIn = 0.5 / s.maxLife;
    const fadeOut = 0.5 / s.maxLife;
    if (t < fadeIn) alpha = t / fadeIn;
    else if (t > 1 - fadeOut) alpha = (1 - t) / fadeOut;
    else alpha = 1;
    alpha = Math.max(0, Math.min(1, alpha));

    ctx.save();
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Dark band overlay for text readability (drawn last before text)
  ctx.save();
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, W, 330);
  ctx.restore();
}

// Reset on game start so we re-init next time we return to title
export function resetTitleBackground() {
  inited = false;
}
