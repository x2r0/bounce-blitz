'use strict';

/**
 * Poki SDK adapter for the platform integration layer.
 *
 * Auto-detects the Poki environment (SDK global present or hosted on
 * a poki domain) and wires into platform-sdk hooks.
 *
 * When the SDK is not available the adapter silently no-ops, so the
 * game runs unchanged on other platforms.
 *
 * Ref: https://sdk.poki.com/
 */

import platformSDK from './platform-sdk.js';

/** Resolved PokiSDK handle (set during init). */
let poki = null;

/**
 * True when running inside a Poki context:
 *  - the PokiSDK global already exists (script tag in HTML), OR
 *  - the page is hosted on a poki.* domain, OR
 *  - the URL contains ?platform=poki
 */
function isPokiEnv() {
  if (window.PokiSDK) return true;
  if (/poki\./i.test(location.hostname)) return true;
  if (new URLSearchParams(location.search).get('platform') === 'poki') return true;
  return false;
}

/** Dynamically load the Poki SDK script if not already present. */
function loadSDKScript() {
  return new Promise((resolve, reject) => {
    if (window.PokiSDK) { resolve(window.PokiSDK); return; }
    const s = document.createElement('script');
    s.src = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';
    s.onload = () => {
      if (window.PokiSDK) resolve(window.PokiSDK);
      else reject(new Error('Poki SDK loaded but global not found'));
    };
    s.onerror = () => reject(new Error('Failed to load Poki SDK'));
    document.head.appendChild(s);
  });
}

const pokiAdapter = {
  async init() {
    if (!isPokiEnv()) return;
    try {
      const sdk = await loadSDKScript();
      await sdk.init();
      poki = sdk;
      console.log('[platform] Poki SDK initialised');
    } catch (e) {
      console.warn('[platform] Poki SDK init failed, continuing without it:', e);
    }
  },

  loadingProgress(pct) {
    // Poki SDK uses setLoading(finished) — we call it at 100%.
    if (poki && pct >= 1) poki.setLoading(true);
  },

  loadingDone() {
    if (poki) poki.gameLoadingFinished();
  },

  gameplayStart() {
    if (poki) poki.gameplayStart();
  },

  gameplayStop() {
    if (poki) poki.gameplayStop();
  },

  adBreak() {
    if (!poki) return Promise.resolve();
    return poki.commercialBreak().catch(() => {
      // Ad unavailable or blocked — resolve silently so the game continues.
    });
  },

  event(name, data) {
    // Poki does not expose a custom analytics API; log for dev diagnostics.
    if (poki) {
      console.log('[Poki] event:', name, data);
    }
  },
};

/**
 * Bootstrap: detect environment and activate.
 * Call this before platformSDK.init() in the game entry point.
 */
export function setupPoki() {
  if (isPokiEnv()) {
    platformSDK.use(pokiAdapter);
    console.log('[platform] Poki adapter activated');
  }
}
