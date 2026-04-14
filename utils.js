'use strict';

export function rand(a, b) { return a + Math.random() * (b - a); }
export function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
export function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
export function mag(vx, vy) { return Math.sqrt(vx * vx + vy * vy); }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function formatScore(n) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

export function triggerShake(G, intensity, duration) {
  G.shakeIntensity = intensity;
  G.shakeDuration = duration;
  G.shakeTimer = duration;
}

export function easeOutCubic(t) { const t1 = t - 1; return t1 * t1 * t1 + 1; }

export function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}
