'use strict';

const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
const vendor = typeof navigator !== 'undefined' ? navigator.vendor || '' : '';

export const IS_SAFARI = /Safari/i.test(ua) &&
  /Apple/i.test(vendor) &&
  !/Chrome|Chromium|CriOS|Edg|OPR|OPiOS|FxiOS|Firefox|Android/i.test(ua);

export const IS_EMBEDDED = (() => {
  if (typeof window === 'undefined') return false;
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
})();

export const REDUCED_FX = IS_SAFARI;
export const REDUCED_FX_EMBED = REDUCED_FX && IS_EMBEDDED;
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
