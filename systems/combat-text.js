'use strict';

import { FONT } from '../config.js';
import { rand } from '../utils.js';
import { G } from '../state.js';
import { ctx } from '../canvas.js';

const MAX_COMBAT_TEXTS = 20;
const RISE_SPEED = 60; // px/s
const LIFESPAN = 0.8;

// --- Spawn Combat Text ---
export function spawnCombatText(text, x, y, options = {}) {
  if (G.combatTexts.length >= MAX_COMBAT_TEXTS) {
    G.combatTexts.shift(); // remove oldest
  }

  const horizontalSpread = rand(-10, 10);
  const ct = {
    text,
    x: x + horizontalSpread,
    y,
    size: options.size || 18,
    color: options.color || '#ffffff',
    bold: options.bold !== false,
    alpha: 1,
    life: options.life || LIFESPAN,
    maxLife: options.life || LIFESPAN,
    rise: options.rise !== false,
    scaleTimer: 0.05, // brief scale-up on spawn
    hold: options.hold || false, // for center-screen texts
  };

  // Stack with nearby texts (within 0.2s and similar position)
  let stackOffset = 0;
  for (const existing of G.combatTexts) {
    if (Math.abs(existing.x - ct.x) < 40 && existing.life > existing.maxLife - 0.2) {
      stackOffset += 16;
    }
  }
  ct.y -= stackOffset;

  G.combatTexts.push(ct);
}

// --- Update ---
export function updateCombatTexts(dt) {
  for (let i = G.combatTexts.length - 1; i >= 0; i--) {
    const ct = G.combatTexts[i];
    ct.life -= dt;
    if (ct.scaleTimer > 0) ct.scaleTimer -= dt;

    if (ct.rise && !ct.hold) {
      ct.y -= RISE_SPEED * dt;
    }

    // Linear alpha fade
    ct.alpha = Math.max(0, ct.life / ct.maxLife);

    if (ct.life <= 0) {
      G.combatTexts.splice(i, 1);
    }
  }
}

// --- Draw ---
export function drawCombatTexts() {
  for (const ct of G.combatTexts) {
    ctx.save();
    ctx.globalAlpha = ct.alpha;

    // Scale-up on spawn
    let scale = 1;
    if (ct.scaleTimer > 0) {
      scale = 1.1;
    }

    ctx.translate(ct.x, ct.y);
    ctx.scale(scale, scale);

    const weight = ct.bold ? 'bold ' : '';
    ctx.font = weight + ct.size + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Dark shadow for readability
    ctx.fillStyle = '#000000';
    ctx.fillText(ct.text, 1, 1);

    // Main text
    ctx.fillStyle = ct.color;
    if (ct.color === '#ffdd44') {
      ctx.shadowColor = '#ffdd44';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
    ctx.fillText(ct.text, 0, 0);

    ctx.restore();
  }
}
