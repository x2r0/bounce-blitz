'use strict';

import { POWERUP_COLORS } from '../config.js';
import { dist } from '../utils.js';
import { G } from '../state.js';
import { ctx } from '../canvas.js';
import { spawnParticles } from '../systems/particles.js';
import { events } from '../eventbus.js';

export function collectPowerUp(p) {
  const player = G.player;
  const pc = POWERUP_COLORS[p.type] || { icon: '#ffffff' };
  G.collectRings.push({ x: p.x, y: p.y, r: 10, maxR: 40, life: 0.3, maxLife: 0.3, color: pc.icon });
  spawnParticles(p.x, p.y, '#ffffff', 12);
  const puNames = { shield: 'SHIELD!', magnet: 'MAGNET!', surge: 'SURGE!', multipop: 'MULTI-POP!', heart: 'HEAL!' };
  G.floatTexts.push({ text: puNames[p.type] || p.type.toUpperCase() + '!', x: p.x, y: p.y - 20, size: 20, alpha: 1,
    phase: 'float', scaleT: 1, color: pc.icon, glowColor: pc.icon, vy: -60, life: 1.0 });
  G.collectFlashTimer = 0.1; G.collectFlashAlpha = 0.2;
  events.emit('powerUpCollected', { type: p.type });
  if (p.type === 'shield') { player.shield = true; player.shieldTimer = 12; }
  else if (p.type === 'magnet') { player.magnet = true; player.magnetTimer = 5; }
  else if (p.type === 'surge') { player.surge = true; player.surgeTimer = 6; }
  else if (p.type === 'multipop') { player.multiPop = 3; player.multiPopTimer = 10; }
  else if (p.type === 'heart') {
    if (player.hp < player.maxHp) {
      player.hp++;
      G.collectFlashTimer = 0.15; G.collectFlashAlpha = 0.15;
      G.floatTexts.push({ text: '+1 HP', x: player.x, y: player.y - 30, size: 22, alpha: 1,
        phase: 'float', scaleT: 1, color: '#44ff88', glowColor: '#44ff88', vy: -60, life: 1.0 });
    } else {
      G.score += 200;
      G.floatTexts.push({ text: '+200', x: player.x, y: player.y - 30, size: 22, alpha: 1,
        phase: 'float', scaleT: 1, color: '#ffdd00', glowColor: '#ffdd00', vy: -60, life: 1.0 });
    }
  }
}

export function updatePowerUps(dt) {
  const player = G.player;
  for (let i = G.powerUps.length - 1; i >= 0; i--) {
    const p = G.powerUps[i];
    p.life -= dt;
    if (p.life <= 1) p.fadeTimer = p.life;
    if (p.life <= 0) { G.powerUps.splice(i, 1); continue; }
    if (dist(player, p) < player.r + p.r) { collectPowerUp(p); G.powerUps.splice(i, 1); }
  }
}

export function drawPowerUps() {
  for (const p of G.powerUps) {
    const alpha = p.life <= 1 ? p.life : 1;
    const pulseAlpha = 0.6 + 0.4 * Math.sin(Date.now() / 500 * Math.PI * 2);
    const pulseBlur = 8 + 12 * (0.5 + 0.5 * Math.sin(Date.now() / 250 * Math.PI));
    const pc = POWERUP_COLORS[p.type] || { icon: '#ffffff' };
    ctx.save();
    // Expanding ring effect
    const ringPhase = (Date.now() % 2000) / 2000;
    const ringR = p.r + ringPhase * 18;
    const ringAlpha = alpha * (1 - ringPhase) * 0.4;
    ctx.globalAlpha = ringAlpha;
    ctx.strokeStyle = pc.icon;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
    ctx.stroke();
    // Outer white ring (pulsing)
    ctx.globalAlpha = alpha * pulseAlpha;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = pc.icon;
    ctx.shadowBlur = pulseBlur;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.stroke();
    // Inner icon shape
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pc.icon;
    ctx.shadowColor = pc.icon;
    ctx.shadowBlur = pulseBlur;
    if (p.type === 'heart') {
      ctx.beginPath();
      const hx = p.x, hy = p.y;
      const hs = 6;
      ctx.moveTo(hx, hy + hs * 0.6);
      ctx.bezierCurveTo(hx - hs * 1.2, hy - hs * 0.3, hx - hs * 0.6, hy - hs * 1.2, hx, hy - hs * 0.4);
      ctx.bezierCurveTo(hx + hs * 0.6, hy - hs * 1.2, hx + hs * 1.2, hy - hs * 0.3, hx, hy + hs * 0.6);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
