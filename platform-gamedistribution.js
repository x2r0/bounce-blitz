'use strict';

/**
 * GameDistribution (GD) SDK adapter for the platform integration layer.
 *
 * Auto-detects the GameDistribution environment (SDK global present,
 * hosted on a gamedistribution domain, or ?platform=gamedistribution)
 * and wires into platform-sdk hooks.
 *
 * When the SDK is not available the adapter silently no-ops, so the
 * game runs unchanged on other platforms.
 *
 * Ref: https://github.com/GameDistribution/GD-HTML5/wiki/SDK-Implementation
 */

import platformSDK from './platform-sdk.js';

/** True once the SDK fires SDK_GAME_START after an ad. */
let sdkReady = false;

/** Resolve function for the current adBreak promise, if any. */
let adResolve = null;

/**
 * True when running inside a GameDistribution context:
 *  - the gdsdk global already exists (script tag in HTML), OR
 *  - the page is hosted on a gamedistribution.* domain, OR
 *  - the URL contains ?platform=gamedistribution
 */
function isGDEnv() {
  if (typeof gdsdk !== 'undefined') return true;
  if (/gamedistribution\./i.test(location.hostname)) return true;
  if (new URLSearchParams(location.search).get('platform') === 'gamedistribution') return true;
  return false;
}

/** Dynamically load the GD SDK script if not already present. */
function loadSDKScript(gameId) {
  return new Promise((resolve, reject) => {
    if (typeof gdsdk !== 'undefined') { resolve(); return; }

    window['GD_OPTIONS'] = {
      gameId,
      onEvent(event) {
        switch (event.name) {
          case 'SDK_READY':
            sdkReady = true;
            break;
          case 'SDK_GAME_START':
            // Ad finished (or was skipped) — resume game.
            if (adResolve) { adResolve(); adResolve = null; }
            break;
          case 'SDK_GAME_PAUSE':
            // Ad is about to display — game is already paused during wave break.
            break;
        }
      },
    };

    const s = document.createElement('script');
    s.id = 'gamedistribution-jssdk';
    s.src = 'https://html5.api.gamedistribution.com/main.min.js';
    s.onload = () => {
      if (typeof gdsdk !== 'undefined') resolve();
      else reject(new Error('GD SDK loaded but global not found'));
    };
    s.onerror = () => reject(new Error('Failed to load GameDistribution SDK'));
    document.head.appendChild(s);
  });
}

/**
 * Read the GD game ID from:
 *  1. <meta name="gd-game-id" content="...">
 *  2. URL param ?gd-game-id=...
 *  3. Fallback empty string (SDK will still load but ads won't serve)
 */
function getGameId() {
  const meta = document.querySelector('meta[name="gd-game-id"]');
  if (meta) return meta.getAttribute('content');
  return new URLSearchParams(location.search).get('gd-game-id') || '';
}

const gdAdapter = {
  async init() {
    if (!isGDEnv()) return;
    try {
      const gameId = getGameId();
      await loadSDKScript(gameId);
      console.log('[platform] GameDistribution SDK initialised');
    } catch (e) {
      console.warn('[platform] GameDistribution SDK init failed, continuing without it:', e);
    }
  },

  loadingProgress(_pct) {
    // GD SDK does not expose a loading progress API.
  },

  loadingDone() {
    // GD SDK does not have an explicit loading-done signal.
  },

  gameplayStart() {
    // GD SDK manages gameplay flow via ad events (SDK_GAME_START / SDK_GAME_PAUSE).
    // No explicit call needed from the game side.
  },

  gameplayStop() {
    // Same as gameplayStart — GD uses event-driven flow, not explicit calls.
  },

  adBreak() {
    if (typeof gdsdk === 'undefined' || typeof gdsdk.showAd !== 'function') {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      adResolve = resolve;
      try {
        gdsdk.showAd();
      } catch (_e) {
        // Ad call failed — resolve so the game continues.
        adResolve = null;
        resolve();
      }
    });
  },

  event(name, data) {
    // GD SDK does not expose a custom analytics API; log for dev diagnostics.
    if (typeof gdsdk !== 'undefined') {
      console.log('[GameDistribution] event:', name, data);
    }
  },
};

/**
 * Bootstrap: detect environment and activate.
 * Call this before platformSDK.init() in the game entry point.
 */
export function setupGameDistribution() {
  if (isGDEnv()) {
    platformSDK.use(gdAdapter);
    console.log('[platform] GameDistribution adapter activated');
  }
}
