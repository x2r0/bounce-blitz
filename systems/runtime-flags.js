'use strict';

const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
const vendor = typeof navigator !== 'undefined' ? navigator.vendor || '' : '';
const maxTouchPoints = typeof navigator !== 'undefined' ? (navigator.maxTouchPoints || 0) : 0;

export const IS_SAFARI = /Safari/i.test(ua) &&
  /Apple/i.test(vendor) &&
  !/Chrome|Chromium|CriOS|Edg|OPR|OPiOS|FxiOS|Firefox|Android/i.test(ua);

// iOS detection that also catches WKWebViews hosted inside native apps
// (e.g. the CrazyGames mobile app) where the UA lacks the "Safari" token
// but the rendering engine is still WebKit with the same perf profile.
export const IS_IOS = /iPad|iPhone|iPod/i.test(ua)
  || (/Mac/i.test(ua) && maxTouchPoints > 1);

// Any WebKit-based engine (includes in-app webviews that omit "Safari")
export const IS_WEBKIT = !/Chrome|Chromium|CriOS|Edg|OPR|FxiOS|Firefox|Android/i.test(ua)
  && (/AppleWebKit/i.test(ua) || IS_IOS);

export const IS_EMBEDDED = (() => {
  if (typeof window === 'undefined') return false;
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
})();

export const IS_TOUCH = (typeof window !== 'undefined' && 'ontouchstart' in window) || maxTouchPoints > 0;

// Hosts known to embed the game in a constrained webview where we must
// assume a low-perf rendering path even if the UA doesn't say "Safari".
export const IS_CRAZYGAMES = (() => {
  if (typeof window === 'undefined') return false;
  try {
    if (window.CrazyGames?.SDK) return true;
    if (/crazygames\./i.test(location.hostname)) return true;
    if (new URLSearchParams(location.search).get('platform') === 'crazygames') return true;
  } catch { /* ignore */ }
  return false;
})();

// Treat iOS (incl. in-app webviews), any portal-embedded touch device, and
// known low-perf hosts as REDUCED_FX, not just desktop Safari. This is what
// fixes the wave-8 freeze on CrazyGames mobile: the old IS_SAFARI-only check
// missed the CrazyGames iOS WKWebView entirely, so blur/particle caps never
// kicked in when bombers + teleporters appeared together.
export const REDUCED_FX = IS_SAFARI || IS_IOS || IS_WEBKIT
  || (IS_EMBEDDED && IS_TOUCH) || IS_CRAZYGAMES;
export const REDUCED_FX_EMBED = REDUCED_FX && (IS_EMBEDDED || IS_CRAZYGAMES);
export const FX_BLUR_SCALE = REDUCED_FX_EMBED ? 0.38 : REDUCED_FX ? 0.52 : 1;
export const FX_PARTICLE_LIMIT = REDUCED_FX_EMBED ? 40 : REDUCED_FX ? 60 : 100;
export const FX_WALL_FLASH_LIMIT = REDUCED_FX_EMBED ? 8 : REDUCED_FX ? 10 : 24;
export const FX_AFTERIMAGE_LIMIT = REDUCED_FX_EMBED ? 10 : REDUCED_FX ? 12 : 24;
export const FX_THUNDER_TRAIL_LIMIT = REDUCED_FX_EMBED ? 18 : REDUCED_FX ? 26 : 52;
export const FX_SHOCKWAVE_LIMIT = REDUCED_FX_EMBED ? 8 : REDUCED_FX ? 10 : 22;
export const FX_AMBIENT_PARTICLE_SCALE = REDUCED_FX_EMBED ? 0.35 : REDUCED_FX ? 0.6 : 1;
export const FX_AMBIENT_SHAPE_COUNT = REDUCED_FX_EMBED ? 1 : REDUCED_FX ? 2 : 4;

export function getFxBlur(value) {
  return value <= 0 ? 0 : value * FX_BLUR_SCALE;
}

export function pushCapped(arr, item, max) {
  while (arr.length >= max) arr.shift();
  arr.push(item);
}
