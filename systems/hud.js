'use strict';

import { W, H, STATE, FONT, STAMINA_MAX, STAMINA_DASH_COST, MAX_POWER_SLOTS } from '../config.js';
import { formatScore, formatTime, lerp } from '../utils.js';
import { G } from '../state.js';
import { ctx, drawGlowText } from '../canvas.js';
import { getEnemyCount } from '../systems/wave.js';
import { POWER_DEFS, EVOLUTION_RECIPES } from '../systems/powers.js';

export function drawHUD() {
  const player = G.player;

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
      ctx.fillText('Wave ' + G.wave + ' — ' + remaining + ' remaining', 16, 65);
    } else {
      const fa = Math.min(1, G.waveClearFlashTimer);
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(0,255,204,' + fa + ')';
      ctx.fillText('Wave ' + G.wave + ' — CLEAR!', 16, 65);
      ctx.shadowBlur = 0;
      ctx.fillText('Wave ' + G.wave + ' — CLEAR!', 16, 65);
    }
    ctx.restore();

    const barX = 16, barY = 85, barW = 120, barH = 4;
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
    ctx.fillText('Wave ' + G.wave + ' — CLEAR!', 16, 55);
    ctx.shadowBlur = 0;
    ctx.fillText('Wave ' + G.wave + ' — CLEAR!', 16, 55);
    ctx.restore();
  } else if (G.state === STATE.GAME_OVER) {
    ctx.save();
    ctx.fillStyle = '#aaaaaa';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = '16px ' + FONT;
    ctx.fillText('Wave ' + G.wave, 16, 55);
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

  // Persistent power indicators (left side) — pill style with mini icon
  let iy = 95;
  for (const power of player.powers) {
    const def = POWER_DEFS[power.id];
    const evoRecipe = !def ? EVOLUTION_RECIPES.find(r => r.id === power.id) : null;
    if (!def && !evoRecipe) continue;
    const stars = power.evolved ? '★' : '★'.repeat(power.level);
    const color = def ? (def.icon || '#ffffff') : (evoRecipe.icon || '#ffdd44');
    const name = def ? (def.name || power.id) : evoRecipe.name;

    ctx.save();
    // Dark pill background
    ctx.fillStyle = 'rgba(10, 10, 20, 0.7)';
    ctx.beginPath();
    ctx.roundRect(16, iy, 120, 16, 3);
    ctx.fill();
    // Colored left accent bar
    ctx.fillStyle = color;
    ctx.fillRect(16, iy, 3, 16);
    // Power name and stars
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.font = 'bold 10px ' + FONT;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(name.substring(0, 13), 22, iy + 8);
    // Level stars right-aligned
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffdd44';
    ctx.fillText(stars, 134, iy + 8);
    ctx.restore();
    iy += 18;
  }

  // Empty slot indicators
  const filledSlots = player.powers.length;
  for (let i = filledSlots; i < MAX_POWER_SLOTS; i++) {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 10, 20, 0.35)';
    ctx.beginPath();
    ctx.roundRect(16, iy, 120, 16, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.font = '10px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('—', 76, iy + 8);
    ctx.restore();
    iy += 18;
  }

  // Overdrive timer
  if (player.overdriveTimer > 0) {
    ctx.save();
    ctx.font = 'bold 14px ' + FONT;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffdd44';
    ctx.shadowColor = '#ffdd44';
    ctx.shadowBlur = 6;
    ctx.fillText('OVERDRIVE ' + player.overdriveTimer.toFixed(1) + 's', 16, iy + 4);
    ctx.restore();
  }

  // Control hints — visible during waves 1-2, fade out after
  if (G.wave >= 1) {
    let hintAlpha;
    if (G.wave <= 2) { hintAlpha = 0.6; }
    else if (G.wave === 3) { hintAlpha = Math.max(0, 0.6 * (1 - G.waveTimer / 3)); }
    else { hintAlpha = 0; }
    if (hintAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = hintAlpha;
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#555555';
      ctx.fillText('WASD to move · Space to bounce · P to pause', W / 2, H - 12);
      ctx.restore();
    }
  }
}
