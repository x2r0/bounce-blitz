'use strict';

import { W, H, FONT } from './config.js';
import { getFxBlur } from './systems/runtime-flags.js';

export const C = document.getElementById('c');
export const ctx = C.getContext('2d', { alpha: false, desynchronized: true }) || C.getContext('2d');
let canvasScale = 1;
C.tabIndex = 0;
if (typeof C.setAttribute === 'function') {
  C.setAttribute('aria-label', 'Bounce Blitz game canvas');
}

function getDeviceCanvasScale() {
  if (typeof window === 'undefined') return 1;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  // DPR caps. We let the canvas render at full device-native DPR on every
  // platform — the wave-8 perf mitigations (FX particle/shockwave caps,
  // blur-scale reduction in runtime-flags.js) are the real freeze fix,
  // so the DPR cap doesn't need to do double duty anymore. Rendering at
  // the device's native DPR closes the last bit of visible graininess
  // between the game canvas and the DOM-based HUD overlays on iPhones
  // (where DPR is typically 3 and a 2.5 cap left a 17% downscale gap).
  const cap = 3;
  return Math.max(1, Math.min(dpr, cap));
}

function syncCanvasResolution() {
  const nextScale = getDeviceCanvasScale();
  const nextWidth = Math.round(W * nextScale);
  const nextHeight = Math.round(H * nextScale);
  if (C.width === nextWidth && C.height === nextHeight && canvasScale === nextScale) return;
  canvasScale = nextScale;
  C.width = nextWidth;
  C.height = nextHeight;
  if (typeof ctx.resetTransform === 'function') {
    ctx.resetTransform();
  } else if (typeof ctx.setTransform === 'function') {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  if (typeof ctx.setTransform === 'function') {
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);
  }
  ctx.imageSmoothingEnabled = true;
  // Default imageSmoothingQuality is 'low' — fine for fast upscaling but
  // visibly soft when the backbuffer is downscaled to CSS pixels. 'high'
  // gives the grid canvas and any offscreen pre-renders a cleaner resample.
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
}

export function getCanvasScale() {
  return canvasScale;
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
  syncCanvasResolution();
  const r = W / H;
  const viewport = window.visualViewport;
  let cw = viewport?.width || window.innerWidth;
  let ch = viewport?.height || window.innerHeight;
  if (cw / ch > r) { cw = ch * r; } else { ch = cw / r; }
  C.style.width = Math.round(cw) + 'px';
  C.style.height = Math.round(ch) + 'px';
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
