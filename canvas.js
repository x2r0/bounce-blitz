'use strict';

import { W, H, FONT } from './config.js';
import { getFxBlur } from './systems/runtime-flags.js';

export const C = document.getElementById('c');
export const ctx = C.getContext('2d', { alpha: false, desynchronized: true }) || C.getContext('2d');

C.width = W;
C.height = H;
C.tabIndex = 0;
if (typeof C.setAttribute === 'function') {
  C.setAttribute('aria-label', 'Bounce Blitz game canvas');
}

// --- Pre-rendered grid (offscreen canvas) ---
export const gridCanvas = document.createElement('canvas');
gridCanvas.width = W;
gridCanvas.height = H;
(function renderGrid() {
  const gc = gridCanvas.getContext('2d');
  gc.strokeStyle = '#1a1a2e';
  gc.lineWidth = 0.5;
  for (let x = 0; x <= W; x += 40) {
    gc.beginPath(); gc.moveTo(x, 0); gc.lineTo(x, H); gc.stroke();
  }
  for (let y = 0; y <= H; y += 40) {
    gc.beginPath(); gc.moveTo(0, y); gc.lineTo(W, y); gc.stroke();
  }
})();

// --- Resize ---
export function resize() {
  const r = W / H;
  const viewport = window.visualViewport;
  let cw = viewport?.width || window.innerWidth;
  let ch = viewport?.height || window.innerHeight;
  if (cw / ch > r) { cw = ch * r; } else { ch = cw / r; }
  C.style.width = cw + 'px';
  C.style.height = ch + 'px';
}

window.addEventListener('resize', resize);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resize);
  window.visualViewport.addEventListener('scroll', resize);
}
resize();

// --- Draw Helpers ---
export function drawGlowText(text, x, y, font, fillColor, glowColor, glowBlur) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = getFxBlur(glowBlur || 6);
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.fillText(text, x, y);
  ctx.restore();
}
