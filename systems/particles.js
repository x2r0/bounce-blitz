'use strict';

import { W, H } from '../config.js';
import { rand, lerp } from '../utils.js';
import { G } from '../state.js';
import { ctx } from '../canvas.js';

// --- Particle Spawning ---
export function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    if (G.particles.length >= 100) G.particles.shift();
    const angle = rand(0, Math.PI * 2);
    const speed = rand(200, 400);
    const r = rand(3, 6);
    G.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      r, initR: r, color, alpha: 1, life: 0.4, maxLife: 0.4 });
  }
}

// --- Wall Bounce Flash ---
export function addWallFlash(x, y, wall, color) {
  let x1, y1, x2, y2, nx, ny;
  const span = 60;
  if (wall === 'top' || wall === 'bottom') {
    const wy = wall === 'top' ? 0 : H;
    x1 = x - span; y1 = wy; x2 = x + span; y2 = wy;
    nx = 0; ny = wall === 'top' ? 1 : -1;
  } else {
    const wx = wall === 'left' ? 0 : W;
    x1 = wx; y1 = y - span; x2 = wx; y2 = y + span;
    nx = wall === 'left' ? 1 : -1; ny = 0;
  }
  G.wallFlashes.push({ x1, y1, x2, y2, cx: x, cy: y, nx, ny, wall, color, alpha: 1, life: 0.35, maxLife: 0.35 });
}

// --- Update Functions ---
export function updateParticles(dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt;
    const t = Math.max(0, p.life / p.maxLife);
    p.alpha = t;
    p.r = p.initR * t;
    if (p.life <= 0) G.particles.splice(i, 1);
  }
}

export function updateFloatTexts(dt) {
  for (let i = G.floatTexts.length - 1; i >= 0; i--) {
    const f = G.floatTexts[i];
    f.life -= dt;
    if (f.phase === 'scale') {
      f.scaleT += dt / 0.3;
      if (f.scaleT >= 1) { f.scaleT = 1; f.phase = 'hold'; f.holdTimer = 1; }
    } else if (f.phase === 'hold') {
      f.holdTimer -= dt;
      if (f.holdTimer <= 0) { f.phase = 'fade'; f.fadeTimer = 0.5; }
    } else if (f.phase === 'fade') {
      f.fadeTimer -= dt;
      f.alpha = Math.max(0, f.fadeTimer / 0.5);
    } else if (f.phase === 'float') {
      f.y += f.vy * dt;
      f.alpha = Math.max(0, f.life / 0.6);
    } else if (f.phase === 'combo') {
      f.scaleT = Math.min(1, f.scaleT + dt / 0.2);
      f.y += f.vy * dt;
      f.alpha = Math.max(0, f.life / 0.6);
    }
    if (f.life <= 0) G.floatTexts.splice(i, 1);
  }
}

export function updateShockwaves(dt) {
  for (let i = G.shockwaves.length - 1; i >= 0; i--) {
    const s = G.shockwaves[i];
    s.life -= dt;
    const progress = 1 - (s.life / s.maxLife);
    s.r = progress * s.maxR;
    s.alpha = 1 - progress;
    if (s.life <= 0) { G.shockwaves.splice(i, 1); }
  }
}

export function updateThunderTrails(dt) {
  for (let i = G.thunderTrails.length - 1; i >= 0; i--) {
    const trail = G.thunderTrails[i];
    trail.life -= dt;
    if (trail.life <= 0) G.thunderTrails.splice(i, 1);
  }
}

export function updateAfterimages(dt) {
  for (let i = G.afterimages.length - 1; i >= 0; i--) {
    const a = G.afterimages[i];
    a.life -= dt;
    a.alpha = Math.max(0, a.life / 0.15) * (a.maxAlpha || 0.5);
    if (a.life <= 0) G.afterimages.splice(i, 1);
  }
}

export function updateWallFlashes(dt) {
  for (let i = G.wallFlashes.length - 1; i >= 0; i--) {
    const f = G.wallFlashes[i];
    f.life -= dt;
    const t = Math.max(0, f.life / f.maxLife);
    f.alpha = t * t;
    if (f.life <= 0) G.wallFlashes.splice(i, 1);
  }
}

export function updateCollectRings(dt) {
  for (let i = G.collectRings.length - 1; i >= 0; i--) {
    const r = G.collectRings[i];
    r.life -= dt;
    const progress = 1 - (r.life / r.maxLife);
    r.r = lerp(10, r.maxR, progress);
    if (r.life <= 0) G.collectRings.splice(i, 1);
  }
}

export function updateMultiPopExplosions(dt) {
  for (let i = G.multiPopExplosions.length - 1; i >= 0; i--) {
    const e = G.multiPopExplosions[i];
    e.life -= dt;
    const progress = 1 - (e.life / e.maxLife);
    e.r = progress * e.maxR;
    if (e.life <= 0) G.multiPopExplosions.splice(i, 1);
  }
}

export function updateTapBounceRipples(dt) {
  for (let i = G.tapBounceRipples.length - 1; i >= 0; i--) {
    const rp = G.tapBounceRipples[i];
    rp.life -= dt;
    if (rp.life <= 0) { G.tapBounceRipples.splice(i, 1); continue; }
    rp.r = rp.maxR * (1 - rp.life / rp.maxLife);
  }
}

// --- Draw Functions ---
export function drawWallFlashes() {
  for (const f of G.wallFlashes) {
    ctx.save();
    ctx.globalAlpha = f.alpha;
    const glowDepth = 45;
    let gx0, gy0, gx1, gy1, rx, ry, rw, rh;
    if (f.wall === 'top') {
      gx0 = f.cx; gy0 = 0; gx1 = f.cx; gy1 = glowDepth;
      rx = f.cx - 70; ry = 0; rw = 140; rh = glowDepth;
    } else if (f.wall === 'bottom') {
      gx0 = f.cx; gy0 = H; gx1 = f.cx; gy1 = H - glowDepth;
      rx = f.cx - 70; ry = H - glowDepth; rw = 140; rh = glowDepth;
    } else if (f.wall === 'left') {
      gx0 = 0; gy0 = f.cy; gx1 = glowDepth; gy1 = f.cy;
      rx = 0; ry = f.cy - 70; rw = glowDepth; rh = 140;
    } else {
      gx0 = W; gy0 = f.cy; gx1 = W - glowDepth; gy1 = f.cy;
      rx = W - glowDepth; ry = f.cy - 70; rw = glowDepth; rh = 140;
    }
    const grad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    grad.addColorStop(0, f.color);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 6;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 28;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.beginPath();
    ctx.moveTo(f.x1, f.y1);
    ctx.lineTo(f.x2, f.y2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.shadowBlur = 40;
    ctx.stroke();
    ctx.restore();
  }
}

export function drawParticles() {
  for (const p of G.particles) {
    if (p.r <= 0) continue;
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10 * p.alpha;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function drawCollectRings() {
  for (const r of G.collectRings) {
    const progress = 1 - (r.life / r.maxLife);
    ctx.save();
    ctx.globalAlpha = lerp(0.8, 0, progress);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = lerp(3, 0.5, progress);
    ctx.shadowColor = r.color;
    ctx.shadowBlur = lerp(12, 0, progress);
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawMultiPopExplosions() {
  for (const e of G.multiPopExplosions) {
    const progress = 1 - (e.life / e.maxLife);
    ctx.save();
    ctx.shadowColor = '#44ff88';
    ctx.shadowBlur = lerp(20, 0, progress);
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.globalAlpha = lerp(0.3, 0, progress);
    ctx.fillStyle = 'rgba(68, 255, 136, 0.3)';
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = lerp(0.8, 0, progress);
    ctx.strokeStyle = '#44ff88';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawThunderTrails() {
  if (!G.thunderTrails || G.thunderTrails.length === 0) return;

  const chains = new Map();
  for (const trail of G.thunderTrails) {
    const key = trail.chain ?? 0;
    if (!chains.has(key)) chains.set(key, []);
    chains.get(key).push(trail);
  }

  for (const nodes of chains.values()) {
    if (nodes.length === 0) continue;
    const newest = nodes[nodes.length - 1];
    const lifeRatio = nodes.reduce((sum, node) => sum + (node.life / node.maxLife), 0) / nodes.length;
    const coreWidth = Math.max(8, (newest.r || 18) * 1.05);
    const glowWidth = coreWidth * 1.7;

    if (nodes.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = '#88ccff';
      ctx.shadowBlur = 18 * lifeRatio;
      ctx.globalAlpha = 0.22 * lifeRatio;
      ctx.strokeStyle = '#88ccff';
      ctx.lineWidth = glowWidth;
      ctx.beginPath();
      ctx.moveTo(nodes[0].x, nodes[0].y);
      for (let i = 1; i < nodes.length; i++) ctx.lineTo(nodes[i].x, nodes[i].y);
      ctx.stroke();
      ctx.globalAlpha = 0.58 * lifeRatio;
      ctx.shadowBlur = 10 * lifeRatio;
      ctx.strokeStyle = '#d9f1ff';
      ctx.lineWidth = coreWidth;
      ctx.beginPath();
      ctx.moveTo(nodes[0].x, nodes[0].y);
      for (let i = 1; i < nodes.length; i++) ctx.lineTo(nodes[i].x, nodes[i].y);
      ctx.stroke();
      ctx.restore();
    }

    for (const trail of nodes) {
      const progress = 1 - (trail.life / trail.maxLife);
      const radius = trail.r * lerp(0.72, 0.34, progress);
      ctx.save();
      ctx.globalAlpha = lerp(0.22, 0, progress);
      ctx.shadowColor = '#88ccff';
      ctx.shadowBlur = lerp(12, 0, progress);
      ctx.fillStyle = '#aee4ff';
      ctx.beginPath();
      ctx.arc(trail.x, trail.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

export function drawShockwaves() {
  for (const s of G.shockwaves) {
    const progress = 1 - (s.life / s.maxLife);
    ctx.save();
    ctx.globalAlpha = lerp(0.7, 0, progress);
    ctx.strokeStyle = '#cc66ff';
    ctx.lineWidth = 8;
    ctx.shadowColor = '#dd88ff';
    ctx.shadowBlur = lerp(8, 0, progress);
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawAfterimages() {
  for (const a of G.afterimages) {
    ctx.save();
    ctx.globalAlpha = a.alpha;
    ctx.shadowColor = a.color;
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = a.color;
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function drawJoystick() {
  if (G.joystick.active) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(G.joystick.cx, G.joystick.cy, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#00ffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.beginPath();
    ctx.arc(G.joystick.cx + G.joystick.dx, G.joystick.cy + G.joystick.dy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function drawTapBounceRipples() {
  for (const rp of G.tapBounceRipples) {
    const progress = 1 - (rp.life / rp.maxLife);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = (1 - progress) * 0.5;
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(rp.x, rp.y, rp.maxR * progress, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
