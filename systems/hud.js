'use strict';

import { W, H, STATE, FONT, STAMINA_MAX, STAMINA_DASH_COST } from '../config.js';
import { formatScore, formatTime, lerp } from '../utils.js';
import { G } from '../state.js';
import { ctx, drawGlowText } from '../canvas.js';
import { getEnemyCount } from '../systems/wave.js';
import { drawPowerIcon } from './cards.js';

function drawHudPanel(x, y, w, h, glow) {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 12, 22, 0.55)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = glow || 'rgba(90, 160, 220, 0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 12);
  ctx.stroke();
  ctx.restore();
}

export function drawHUD() {
  const player = G.player;
  const hasSigils = !!(player.sigils && player.sigils.length);
  const leftPanelH = G.isHardcore
    ? (hasSigils ? 134 : 112)
    : (hasSigils ? 114 : 92);
  const waveTextY = hasSigils ? 83 : 65;
  const waveBarY = hasSigils ? 103 : 85;

  drawHudPanel(8, 8, 184, leftPanelH, 'rgba(0, 220, 255, 0.24)');
  drawHudPanel(W - 176, 8, 168, G.combo >= 2 ? 108 : 88, 'rgba(255, 120, 180, 0.20)');

  // HP orbs — top-left
  for (let i = 0; i < player.maxHp; i++) {
    const ox = 16 + 12 + i * (24 + 8);
    const oy = 16 + 12;
    ctx.save();
    if (i < player.hp) {
      ctx.fillStyle = '#00ffff';
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.beginPath();
      ctx.arc(ox, oy, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(ox, oy, 12, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#334455';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ox, oy, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Stamina bar — below HP orbs
  {
    const maxStam = player.maxStamina || STAMINA_MAX;
    const effectiveBase = STAMINA_DASH_COST - (player.dashCostReduction || 0);
    const dashCost = Math.round(effectiveBase * 0.5); // Initial charge cost
    const barX = 16, barY = 52, barW = Math.min(player.maxHp * 32, 160), barH = 6;
    const fill = player.stamina / maxStam;
    const canDash = player.stamina >= dashCost;
    const isStaminaFlash = player.staminaFlashTimer > 0;
    const barColor = isStaminaFlash ? '#ff2222' : (canDash ? '#00ccff' : '#ff4466');
    const glowColor = isStaminaFlash ? '#ff2222' : (canDash ? '#00ccff' : '#ff4466');

    // Extended bar for overflow
    const overflowFill = maxStam > STAMINA_MAX;
    const totalBarW = overflowFill ? barW * (maxStam / STAMINA_MAX) : barW;

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, totalBarW, barH, 3);
    ctx.fill();
    if (fill > 0) {
      ctx.fillStyle = barColor;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.beginPath();
      ctx.roundRect(barX, barY, totalBarW * fill, barH, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.roundRect(barX, barY, totalBarW * fill, barH, 3);
      ctx.fill();

      // Overflow glow
      if (overflowFill && player.stamina > STAMINA_MAX) {
        const overflowPortion = barW;
        ctx.fillStyle = '#00eeff';
        ctx.globalAlpha = 0.3 + 0.15 * Math.sin(Date.now() / 500 * Math.PI);
        ctx.beginPath();
        ctx.roundRect(barX + overflowPortion, barY, totalBarW * fill - overflowPortion, barH, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    const segments = Math.floor(maxStam / dashCost);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    for (let i = 1; i < segments; i++) {
      const sx = barX + (totalBarW * i / segments);
      ctx.beginPath(); ctx.moveTo(sx, barY); ctx.lineTo(sx, barY + barH); ctx.stroke();
    }
    ctx.restore();
  }

  if (hasSigils) {
    const sigilY = 66;
    ctx.save();
    ctx.font = '10px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#90a8c6';
    ctx.fillText('SIGILS', 16, sigilY);
    ctx.restore();
    for (let i = 0; i < player.sigils.length; i++) {
      const sigilId = player.sigils[i];
      const cx = 66 + i * 34;
      const cy = sigilY + 1;
      if (sigilId === 'broodbreaker') {
        drawPowerIcon('#ffb26f', 'diamond', cx, cy, 8);
      } else if (sigilId === 'feedback') {
        drawPowerIcon('#8dd8ff', 'bolt', cx, cy, 8);
      }
    }
  }

  // Timer — top-right
  ctx.save();
  ctx.font = '16px ' + FONT;
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.shadowColor = '#66aacc';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#88ccee';
  ctx.fillText(formatTime(G.elapsedTime), W - 16, 14);
  ctx.shadowBlur = 0;
  ctx.fillText(formatTime(G.elapsedTime), W - 16, 14);
  ctx.restore();

  // Score — top-right with glow
  ctx.save();
  ctx.font = 'bold 18px ' + FONT;
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.shadowColor = '#aaaaff';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('SCORE: ' + formatScore(G.score), W - 16, 34);
  ctx.shadowBlur = 0;
  ctx.fillText('SCORE: ' + formatScore(G.score), W - 16, 34);
  ctx.restore();

  // High score — below score
  ctx.save();
  ctx.font = '14px ' + FONT;
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffdd00';
  ctx.globalAlpha = 0.7;
  ctx.fillText('HI: ' + formatScore(G.highScore), W - 16, 54);
  ctx.restore();

  // Shard counter — below high score
  {
    const pulse = G.shardHudPulse > 0 ? 1.0 + 0.3 * (G.shardHudPulse / 0.2) : 1.0;
    ctx.save();
    ctx.font = 'bold ' + Math.round(14 * pulse) + 'px ' + FONT;
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#00E5FF';
    ctx.shadowColor = '#00E5FF';
    ctx.shadowBlur = G.shardHudPulse > 0 ? 6 : 0;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.fillText('\u25C6 ' + (G.shardsCollected || 0), W - 16, 72);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // Combo
  if (G.combo >= 2) {
    ctx.save();
    ctx.font = 'bold 18px ' + FONT;
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.shadowColor = '#ffdd00';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#ffff44';
    ctx.fillText('x' + G.combo, W - 16, 90);
    ctx.shadowBlur = 0;
    ctx.fillText('x' + G.combo, W - 16, 90);
    ctx.restore();
  }

  // Wave indicator with progress
  if (G.state === STATE.PLAYING || G.state === STATE.TUTORIAL) {
    const remaining = G.waveEnemiesLeft + G.enemies.filter(e => e.alive).length;
    const total = getEnemyCount(G.wave);
    const killed = total - remaining;

    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = '16px ' + FONT;
    if (remaining > 0) {
      ctx.fillStyle = '#aaaaaa';
      ctx.fillText('Wave ' + G.wave + ' — ' + remaining + ' remaining', 16, waveTextY);
    } else {
      const fa = Math.min(1, G.waveClearFlashTimer);
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(0,255,204,' + fa + ')';
      ctx.fillText('Wave ' + G.wave + ' — CLEAR!', 16, waveTextY);
      ctx.shadowBlur = 0;
      ctx.fillText('Wave ' + G.wave + ' — CLEAR!', 16, waveTextY);
    }
    ctx.restore();

    const barX = 16, barY = waveBarY, barW = 120, barH = 4;
    const progress = total > 0 ? killed / total : 0;
    ctx.save();
    ctx.fillStyle = '#1a2a2a';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#007a6a';
    ctx.shadowColor = '#00ccaa';
    ctx.shadowBlur = 4;
    ctx.fillRect(barX, barY, barW * progress, barH);
    ctx.shadowBlur = 0;
    ctx.fillRect(barX, barY, barW * progress, barH);
    ctx.restore();
  } else if (G.state === STATE.WAVE_BREAK && G.waveClearFlashTimer > 0) {
    const fa = Math.min(1, G.waveClearFlashTimer);
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = '16px ' + FONT;
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(0,255,204,' + fa + ')';
    ctx.fillText('Wave ' + G.wave + ' — CLEAR!', 16, hasSigils ? 73 : 55);
    ctx.shadowBlur = 0;
    ctx.fillText('Wave ' + G.wave + ' — CLEAR!', 16, hasSigils ? 73 : 55);
    ctx.restore();
  } else if (G.state === STATE.GAME_OVER) {
    ctx.save();
    ctx.fillStyle = '#aaaaaa';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = '16px ' + FONT;
    ctx.fillText('Wave ' + G.wave, 16, hasSigils ? 73 : 55);
    ctx.restore();
  }

  // Hardcore indicator — red diamond next to wave counter
  if (G.isHardcore) {
    ctx.save();
    ctx.fillStyle = '#cc2222';
    ctx.shadowColor = '#cc2222';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.font = 'bold 12px ' + FONT;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('◆ HARDCORE', 16, 42);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // Overdrive timer
  if (player.overdriveTimer > 0) {
    const overdriveY = G.isHardcore ? 108 : 96;
    ctx.save();
    ctx.font = 'bold 12px ' + FONT;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffdd44';
    ctx.shadowColor = '#ffdd44';
    ctx.shadowBlur = 6;
    ctx.fillText('OVERDRIVE ' + player.overdriveTimer.toFixed(1) + 's', 16, overdriveY);
    ctx.restore();
  }

  G._mobilePauseBtnRect = null;

}
