'use strict';

import { W, H, FONT, RARITY_COLORS } from '../config.js';
import { G } from '../state.js';
import { ctx, drawGlowText } from '../canvas.js';
import { POWER_DEFS, EVOLUTION_RECIPES, getPlayerPower, getPlayerPowerLevel } from './powers.js';
import { isTouchUILayout } from './touch-ui.js';

// --- Card Layout Constants ---
const CARD_W = 140;
const CARD_H = 200;
const CARD_SPACING = 16;
const ROW_Y = 200;
const EVO_CARD_W = 160;
const EVO_CARD_H = 220;
const EVO_Y = 140;

function getCardX(index, count) {
  const totalW = count * CARD_W + (count - 1) * CARD_SPACING;
  const startX = (W - totalW) / 2;
  return startX + index * (CARD_W + CARD_SPACING);
}

function getEvoCardX() {
  return (W - EVO_CARD_W) / 2;
}

function getMobileCardLayout(offering) {
  const hasEvolution = offering.length > 0 && offering[offering.length - 1].isEvolution;
  const regularCount = hasEvolution ? offering.length - 1 : offering.length;
  const rects = [];
  const x = 46;
  const w = W - 92;
  const regularH = 108;
  const evoH = 124;
  const gap = 12;
  let y = 98;
  for (let i = 0; i < regularCount; i++) {
    rects.push({ x, y, w, h: regularH });
    y += regularH + gap;
  }
  const evoRect = hasEvolution ? { x, y, w, h: evoH } : null;
  return { hasEvolution, regularCount, rects, evoRect };
}

// --- Card Hit Testing ---
export function getCardAtPosition(x, y) {
  const offering = G.cardOffering;
  if (!offering || offering.length === 0) return -1;

  if (isTouchUILayout()) {
    const layout = getMobileCardLayout(offering);
    for (let i = 0; i < layout.regularCount; i++) {
      const rect = layout.rects[i];
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return i;
    }
    if (layout.evoRect && x >= layout.evoRect.x && x <= layout.evoRect.x + layout.evoRect.w && y >= layout.evoRect.y && y <= layout.evoRect.y + layout.evoRect.h) {
      return offering.length - 1;
    }
    return -1;
  }

  // Check evolution card first (index = offering.length - 1 if it's an evolution)
  const lastCard = offering[offering.length - 1];
  if (lastCard && lastCard.isEvolution) {
    const ex = getEvoCardX();
    if (x >= ex && x <= ex + EVO_CARD_W && y >= EVO_Y && y <= EVO_Y + EVO_CARD_H) {
      return offering.length - 1;
    }
  }

  // Check regular cards (first 3)
  const regularCount = lastCard && lastCard.isEvolution ? offering.length - 1 : offering.length;
  for (let i = 0; i < regularCount; i++) {
    const cx = getCardX(i, regularCount);
    if (x >= cx && x <= cx + CARD_W && y >= ROW_Y && y <= ROW_Y + CARD_H) {
      return i;
    }
  }

  return -1;
}

// --- Draw Power Selection Screen ---
export function drawPowerSelectScreen() {
  const offering = G.cardOffering;
  if (!offering || offering.length === 0) return;
  const config = G.powerSelectConfig || {};
  const isTouchDev = isTouchUILayout();

  // Dim background
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  // Title
  drawGlowText(config.title || 'CHOOSE A POWER', W / 2, isTouchDev ? 66 : 160, 'bold ' + (isTouchDev ? 28 : 32) + 'px ' + FONT, '#ffffff', '#00ffff', 10);

  // Pick animation
  const pickAnim = G.cardPickAnim;
  const animScale = pickAnim ? Math.min(1, pickAnim.t / 0.4) : 0;

  // Determine regular vs evolution cards
  const hasEvolution = offering.length > 0 && offering[offering.length - 1].isEvolution;
  const regularCards = hasEvolution ? offering.slice(0, -1) : offering;
  const evoCard = hasEvolution ? offering[offering.length - 1] : null;

  if (isTouchDev) {
    const layout = getMobileCardLayout(offering);
    for (let i = 0; i < regularCards.length; i++) {
      const card = regularCards[i];
      const rect = layout.rects[i];
      const isHovered = G.cardHover === i;
      const isPicked = pickAnim && pickAnim.index === i;
      if (isPicked) {
        const scale = 1 + animScale * 0.04;
        const alpha = 1 - animScale * 0.45;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
        ctx.scale(scale, scale);
        drawCard(card, -rect.w / 2, -rect.h / 2, rect.w, rect.h, isHovered, i);
        ctx.restore();
      } else if (pickAnim) {
        ctx.save();
        ctx.globalAlpha = 1 - animScale;
        drawCard(card, rect.x, rect.y, rect.w, rect.h, false, i);
        ctx.restore();
      } else {
        drawCard(card, rect.x, rect.y, rect.w, rect.h, isHovered, i);
      }
    }
    if (evoCard && layout.evoRect) {
      const evoIdx = offering.length - 1;
      const rect = layout.evoRect;
      const isHovered = G.cardHover === evoIdx;
      const isPicked = pickAnim && pickAnim.index === evoIdx;
      if (isPicked) {
        const scale = 1 + animScale * 0.04;
        const alpha = 1 - animScale * 0.45;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
        ctx.scale(scale, scale);
        drawCard(evoCard, -rect.w / 2, -rect.h / 2, rect.w, rect.h, isHovered, evoIdx);
        ctx.restore();
      } else if (pickAnim) {
        ctx.save();
        ctx.globalAlpha = 1 - animScale;
        drawCard(evoCard, rect.x, rect.y, rect.w, rect.h, false, evoIdx);
        ctx.restore();
      } else {
        drawCard(evoCard, rect.x, rect.y, rect.w, rect.h, isHovered, evoIdx);
      }
    }
  } else {
    // Draw regular cards
    for (let i = 0; i < regularCards.length; i++) {
      const card = regularCards[i];
      const cx = getCardX(i, regularCards.length);
      const isHovered = G.cardHover === i;
      const isPicked = pickAnim && pickAnim.index === i;

      if (isPicked) {
        const scale = 1 + animScale * 0.3;
        const alpha = 1 - animScale * 0.5;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(cx + CARD_W / 2, ROW_Y + CARD_H / 2);
        ctx.scale(scale, scale);
        drawCard(card, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, isHovered, i);
        ctx.restore();
      } else if (pickAnim) {
        ctx.save();
        ctx.globalAlpha = 1 - animScale;
        drawCard(card, cx, ROW_Y, CARD_W, CARD_H, false, i);
        ctx.restore();
      } else {
        drawCard(card, cx, ROW_Y, CARD_W, CARD_H, isHovered, i);
      }
    }

    if (evoCard) {
      const ex = getEvoCardX();
      const evoIdx = offering.length - 1;
      const isHovered = G.cardHover === evoIdx;
      const isPicked = pickAnim && pickAnim.index === evoIdx;

      if (isPicked) {
        const scale = 1 + animScale * 0.3;
        const alpha = 1 - animScale * 0.5;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(ex + EVO_CARD_W / 2, EVO_Y + EVO_CARD_H / 2);
        ctx.scale(scale, scale);
        drawCard(evoCard, -EVO_CARD_W / 2, -EVO_CARD_H / 2, EVO_CARD_W, EVO_CARD_H, isHovered, evoIdx);
        ctx.restore();
      } else if (pickAnim) {
        ctx.save();
        ctx.globalAlpha = 1 - animScale;
        drawCard(evoCard, ex, EVO_Y, EVO_CARD_W, EVO_CARD_H, false, evoIdx);
        ctx.restore();
      } else {
        drawCard(evoCard, ex, EVO_Y, EVO_CARD_W, EVO_CARD_H, isHovered, evoIdx);
      }
    }
  }

  // Input hints
  if (!pickAnim) {
    ctx.save();
    if (config.hint) {
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#8ca4c2';
      ctx.fillText(config.hint, W / 2, isTouchDev ? H - 24 : ROW_Y + CARD_H + 14);
    }
    if (!isTouchDev) {
      ctx.font = '14px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#666666';
      const keys = offering.map((_, index) => String(index + 1)).join('/');
      ctx.fillText('Press ' + keys + ' or click to choose', W / 2, ROW_Y + CARD_H + 32);
    }
    ctx.restore();
  }

  ctx.restore();
}

function drawCard(card, x, y, w, h, isHovered, index) {
  const rarityColor = RARITY_COLORS[card.rarity] || '#ffffff';
  const isWideMobile = h <= 128;

  // Hover effects: 105% scale + upward translate + border brighten
  let drawX = x, drawY = y;
  ctx.save();
  if (isHovered) {
    const scale = 1.05;
    const cx = x + w / 2, cy = y + h / 2;
    ctx.translate(cx, cy - 6);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
  }

  // Card background
  ctx.fillStyle = 'rgba(26, 26, 46, 0.92)';
  ctx.strokeStyle = isHovered ? '#ffffff' : rarityColor;
  ctx.lineWidth = isHovered ? 3 : 2;

  if (isHovered) {
    ctx.shadowColor = rarityColor;
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  ctx.beginPath();
  ctx.roundRect(drawX, drawY, w, h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (isWideMobile) {
    const iconX = drawX + 40;
    const iconY = drawY + h / 2;
    drawPowerIcon(card.icon, card.shape, iconX, iconY, 18);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 20px ' + FONT;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(card.name, drawX + 74, drawY + 26);
    const hasRewardTags = G.meta.unlocks.includes(4) && Array.isArray(card.rewardTags) && card.rewardTags.length > 0;
    if (hasRewardTags) {
      ctx.font = 'bold 11px ' + FONT;
      ctx.fillStyle = rarityColor;
      ctx.fillText(card.rewardTags.join(' · '), drawX + 74, drawY + 42);
    }
    if (card.isUpgrade && card.currentLevel > 0) {
      const stars = '★'.repeat(card.currentLevel) + '☆'.repeat(card.nextLevel - card.currentLevel);
      ctx.font = '12px ' + FONT;
      ctx.fillStyle = '#ffdd44';
      ctx.fillText(stars, drawX + 74, drawY + h - 22);
    } else if (card.isEvolution) {
      ctx.font = 'bold 12px ' + FONT;
      ctx.fillStyle = '#ffdd44';
      ctx.fillText('★ EVOLUTION ★', drawX + 74, drawY + h - 22);
    }
    ctx.font = '13px ' + FONT;
    ctx.fillStyle = '#b7c4d8';
    wrapText(card.desc, drawX + 74, drawY + 60, w - 170, 16, 2);
    ctx.font = '11px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillStyle = rarityColor;
    ctx.fillText(card.rarity.toUpperCase(), drawX + w - 14, drawY + 18);
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillStyle = '#6e7d96';
    ctx.fillText(String(index + 1), drawX + w - 14, drawY + h - 16);
  } else {
    // Icon area — distinct shape per power
    const iconX = drawX + w / 2;
    const iconY = drawY + 50;
    drawPowerIcon(card.icon, card.shape, iconX, iconY, 20);

    // Power name
    ctx.font = 'bold 14px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(card.name, drawX + w / 2, drawY + 90);

    // Level stars (for upgrades)
    if (card.isUpgrade && card.currentLevel > 0) {
      const stars = '★'.repeat(card.currentLevel) + '☆'.repeat(card.nextLevel - card.currentLevel);
      ctx.font = '12px ' + FONT;
      ctx.fillStyle = '#ffdd44';
      ctx.fillText(stars, drawX + w / 2, drawY + 108);

      // UPGRADE banner
      ctx.font = 'bold 10px ' + FONT;
      ctx.fillStyle = '#ffdd44';
      ctx.fillText('UPGRADE', drawX + w / 2, drawY + 122);
    } else if (card.isEvolution) {
      ctx.font = 'bold 10px ' + FONT;
      ctx.fillStyle = '#ffdd44';
      ctx.fillText('★ EVOLUTION ★', drawX + w / 2, drawY + 108);
    }

    const hasRewardTags = G.meta.unlocks.includes(4) && Array.isArray(card.rewardTags) && card.rewardTags.length > 0;
    let descY = card.isUpgrade ? 140 : 118;
    if (hasRewardTags) {
      ctx.font = 'bold 9px ' + FONT;
      ctx.fillStyle = rarityColor;
      ctx.fillText(card.rewardTags.join(' · '), drawX + w / 2, drawY + descY - 12);
      descY += 6;
    }

    // Effect text (word-wrapped)
    ctx.font = '11px ' + FONT;
    ctx.fillStyle = '#aaaacc';
    wrapText(card.desc, drawX + 10, drawY + descY, w - 20, 14);

    // Rarity label
    ctx.font = '10px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillStyle = rarityColor;
    ctx.fillText(card.rarity.toUpperCase(), drawX + w - 8, drawY + h - 10);

    // Evolution recipe hint row
    if (!card.isEvolution && card.powerId) {
      drawEvolutionHintRow(card.powerId, drawX, drawY, w, h);
    }

    // Card number hint
    ctx.font = 'bold 12px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#555555';
    ctx.fillText(String(index + 1), drawX + 8, drawY + h - 10);
  }

  ctx.restore();
}

// --- Evolution Recipe Hint on Power Cards ---
function drawEvolutionHintRow(powerId, cardX, cardY, cardW, cardH) {
  const hasEvoSense = G.meta.unlocks.includes(12);

  // Find recipes that involve this power
  for (const recipe of EVOLUTION_RECIPES) {
    const reqIdx = recipe.requires.findIndex(r => r.id === powerId);
    if (reqIdx < 0) continue;

    const otherReq = recipe.requires[1 - reqIdx];
    const thisReq = recipe.requires[reqIdx];
    const otherDef = POWER_DEFS[otherReq.id];
    if (!otherDef) continue;

    const thisLevel = getPlayerPowerLevel(thisReq.id);
    const otherLevel = getPlayerPowerLevel(otherReq.id);
    const bothAtL1 = thisLevel >= 1 && otherLevel >= 1;

    // Only show if Evolution Sense OR both components at L1+
    if (!hasEvoSense && !bothAtL1) continue;

    const hintY = cardY + cardH - 28;
    const hintCx = cardX + cardW / 2;

    // Gold glow pulse when both meet minLevel
    const bothReady = thisLevel >= thisReq.minLevel && otherLevel >= otherReq.minLevel;
    if (bothReady) {
      const pulse = 0.3 + 0.7 * Math.abs(Math.sin(Date.now() * 0.002 * Math.PI * 2));
      ctx.save();
      ctx.globalAlpha = pulse * 0.15;
      ctx.fillStyle = '#ffdd44';
      ctx.beginPath();
      ctx.roundRect(cardX + 4, hintY - 8, cardW - 8, 16, 3);
      ctx.fill();
      ctx.restore();
    }

    // Draw: [this icon] + [other icon] → [evo icon]
    const iconR = 5;
    const startX = hintCx - 30;

    // This power icon
    ctx.save();
    const thisDef = POWER_DEFS[thisReq.id];
    ctx.fillStyle = thisDef ? thisDef.icon : '#888888';
    ctx.globalAlpha = thisLevel >= 1 ? 1.0 : 0.3;
    ctx.beginPath();
    ctx.arc(startX, hintY, iconR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // "+"
    ctx.save();
    ctx.font = '10px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#555577';
    ctx.fillText('+', startX + 14, hintY);
    ctx.restore();

    // Other power icon
    ctx.save();
    ctx.fillStyle = otherDef.icon;
    ctx.globalAlpha = otherLevel >= 1 ? 1.0 : 0.3;
    ctx.beginPath();
    ctx.arc(startX + 28, hintY, iconR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // "→"
    ctx.save();
    ctx.font = '10px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#555577';
    ctx.fillText('→', startX + 42, hintY);
    ctx.restore();

    // Evolution icon
    ctx.save();
    ctx.fillStyle = recipe.icon;
    ctx.shadowColor = bothReady ? '#ffdd44' : recipe.icon;
    ctx.shadowBlur = bothReady ? 6 : 3;
    ctx.beginPath();
    ctx.arc(startX + 56, hintY, iconR + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Evolution border
    ctx.strokeStyle = RARITY_COLORS.evolution;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(startX + 56, hintY, iconR + 3, 0, Math.PI * 2);
    ctx.stroke();
    if (hasEvoSense) {
      const readyCount = (thisLevel >= thisReq.minLevel ? 1 : 0) + (otherLevel >= otherReq.minLevel ? 1 : 0);
      ctx.font = 'bold 9px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = bothReady ? '#ffdd44' : '#77839d';
      ctx.fillText(readyCount + '/2', startX + 66, hintY);
    }
    ctx.restore();

    break; // Only show first matching recipe per card
  }
}

// --- Distinct power icon shapes ---
export function drawPowerIcon(color, shape, cx, cy, r) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  if (shape === 'circle') {
    // Shield: concentric rings
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
    ctx.fill();

  } else if (shape === 'diamond') {
    // Magnet: horseshoe magnet shape
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fill();
    // Inner diamond cutout
    ctx.fillStyle = 'rgba(26, 26, 46, 0.8)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.4);
    ctx.lineTo(cx + r * 0.4, cy);
    ctx.lineTo(cx, cy + r * 0.4);
    ctx.lineTo(cx - r * 0.4, cy);
    ctx.closePath();
    ctx.fill();
    // Pull lines
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([2, 3]);
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(cx + i * r * 1.3, cy);
      ctx.lineTo(cx + i * r * 0.7, cy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

  } else if (shape === 'triangle') {
    // Surge: upward arrow / speed chevrons
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.7, cy + r * 0.3);
    ctx.lineTo(cx + r * 0.25, cy + r * 0.1);
    ctx.lineTo(cx + r * 0.25, cy + r);
    ctx.lineTo(cx - r * 0.25, cy + r);
    ctx.lineTo(cx - r * 0.25, cy + r * 0.1);
    ctx.lineTo(cx - r * 0.7, cy + r * 0.3);
    ctx.closePath();
    ctx.fill();

  } else if (shape === 'star') {
    // Star: 5-pointed star
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const starR = i % 2 === 0 ? r : r * 0.45;
      const px = cx + Math.cos(angle) * starR;
      const py = cy + Math.sin(angle) * starR;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

  } else if (shape === 'heart') {
    // Heart
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.7);
    ctx.bezierCurveTo(cx - r * 1.3, cy - r * 0.1, cx - r * 0.7, cy - r, cx, cy - r * 0.4);
    ctx.bezierCurveTo(cx + r * 0.7, cy - r, cx + r * 1.3, cy - r * 0.1, cx, cy + r * 0.7);
    ctx.fill();

  } else if (shape === 'bolt') {
    // Chain Lightning: zigzag lightning bolt
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.1, cy - r);
    ctx.lineTo(cx - r * 0.4, cy - r * 0.1);
    ctx.lineTo(cx + r * 0.05, cy - r * 0.1);
    ctx.lineTo(cx - r * 0.3, cy + r);
    ctx.lineTo(cx + r * 0.5, cy + r * 0.05);
    ctx.lineTo(cx, cy + r * 0.05);
    ctx.closePath();
    ctx.fill();
    // Spark dots
    ctx.globalAlpha = 0.6;
    for (const [dx, dy] of [[0.6, -0.5], [-0.6, 0.4], [0.5, 0.6]]) {
      ctx.beginPath();
      ctx.arc(cx + r * dx, cy + r * dy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

  } else if (shape === 'clock') {
    // Time Warp: clock face
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Tick marks
    ctx.globalAlpha = 0.5;
    for (let t = 0; t < 12; t++) {
      const angle = (t / 12) * Math.PI * 2 - Math.PI / 2;
      const inner = t % 3 === 0 ? r * 0.7 : r * 0.8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * r * 0.95, cy + Math.sin(angle) * r * 0.95);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Hands
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - r * 0.6);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + r * 0.45, cy + r * 0.1);
    ctx.stroke();
    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();

  } else if (shape === 'burst') {
    // Dash Burst: explosion/starburst
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const burstR = i % 2 === 0 ? r : r * 0.5;
      const px = cx + Math.cos(angle) * burstR;
      const py = cy + Math.sin(angle) * burstR;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

  } else if (shape === 'orb') {
    // Shell Guard: orbiting circles
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const orbCount = 3;
    for (let i = 0; i < orbCount; i++) {
      const angle = (i / orbCount) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * r * 0.7, cy + Math.sin(angle) * r * 0.7, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Center core
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

  } else if (shape === 'cross') {
    // Soul Harvest: plus/cross with droplet
    const arm = r * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx - arm, cy - r);
    ctx.lineTo(cx + arm, cy - r);
    ctx.lineTo(cx + arm, cy - arm);
    ctx.lineTo(cx + r, cy - arm);
    ctx.lineTo(cx + r, cy + arm);
    ctx.lineTo(cx + arm, cy + arm);
    ctx.lineTo(cx + arm, cy + r);
    ctx.lineTo(cx - arm, cy + r);
    ctx.lineTo(cx - arm, cy + arm);
    ctx.lineTo(cx - r, cy + arm);
    ctx.lineTo(cx - r, cy - arm);
    ctx.lineTo(cx - arm, cy - arm);
    ctx.closePath();
    ctx.fill();

  } else if (shape === 'bar') {
    // Stamina Overflow: battery bar
    const bw = r * 1.6, bh = r * 0.9;
    ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
    // Fill segments
    for (let i = 0; i < 3; i++) {
      const sx = cx - bw / 2 + 3 + i * (bw / 3 - 1);
      ctx.fillRect(sx, cy - bh / 2 + 3, bw / 3 - 5, bh - 6);
    }
    // Terminal nub
    ctx.fillRect(cx + bw / 2, cy - 3, 4, 6);

  } else {
    // Fallback: filled circle
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function wrapText(text, x, y, maxWidth, lineHeight, maxLines = Infinity) {
  const words = text.split(' ');
  let line = '';
  let lineY = y;
  const originalAlign = ctx.textAlign;
  const centerX = x + maxWidth / 2;
  let linesDrawn = 0;

  for (const word of words) {
    const test = line + (line ? ' ' : '') + word;
    const metrics = ctx.measureText(test);
    if (metrics.width > maxWidth && line) {
      if (linesDrawn >= maxLines - 1) {
        const clipped = line.endsWith('…') ? line : (line + '…');
        ctx.fillText(clipped, originalAlign === 'left' ? x : centerX, lineY);
        ctx.textAlign = originalAlign;
        return;
      }
      ctx.fillText(line, originalAlign === 'left' ? x : centerX, lineY);
      linesDrawn++;
      line = word;
      lineY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line && linesDrawn < maxLines) ctx.fillText(line, originalAlign === 'left' ? x : centerX, lineY);
  ctx.textAlign = originalAlign;
}
