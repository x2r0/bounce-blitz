'use strict';

/**
 * CrazyGames SDK adapter for the platform integration layer.
 *
 * Auto-detects the CrazyGames environment (SDK script present or
 * hosted on a crazygames domain) and wires into platform-sdk hooks.
 *
 * When the SDK is not available the adapter silently no-ops, so the
 * game runs unchanged on other platforms.
 */

import platformSDK from './platform-sdk.js';
import { setForcedMuted } from './systems/audio.js';
import { installCrazyGamesDataStorage, migrateLocalStorageToCrazyGamesData } from './systems/storage.js';

/** Resolved CrazyGames SDK handle (set during init). */
let cg = null;

/**
 * True when running inside a CrazyGames context:
 *  - the SDK global already exists (script tag in HTML), OR
 *  - the page is hosted on a crazygames.* domain, OR
 *  - the URL contains ?platform=crazygames
 */
function isCrazyGamesEnv() {
  if (window.CrazyGames?.SDK) return true;
  if (/crazygames\./i.test(location.hostname)) return true;
  if (new URLSearchParams(location.search).get('platform') === 'crazygames') return true;
  return false;
}

/** Dynamically load the SDK script if not already present. */
function loadSDKScript() {
  return new Promise((resolve, reject) => {
    if (window.CrazyGames?.SDK) { resolve(window.CrazyGames.SDK); return; }
    const s = document.createElement('script');
    s.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
    s.onload = () => {
      if (window.CrazyGames?.SDK) resolve(window.CrazyGames.SDK);
      else reject(new Error('CrazyGames SDK loaded but global not found'));
    };
    s.onerror = () => reject(new Error('Failed to load CrazyGames SDK'));
    document.head.appendChild(s);
  });
}

const crazyGamesAdapter = {
  async init() {
    if (!isCrazyGamesEnv()) return;
    try {
      const sdk = await loadSDKScript();
      await sdk.init();
      cg = sdk;
      if (installCrazyGamesDataStorage(cg.data)) {
        const migratedKeys = migrateLocalStorageToCrazyGamesData();
        if (migratedKeys > 0) {
          console.log(`[platform] Migrated ${migratedKeys} local save keys into CrazyGames Data`);
        }
      } else {
        console.warn('[platform] CrazyGames Data module unavailable; falling back to browser localStorage');
      }
      cg.game.loadingStart();
      console.log('[platform] CrazyGames SDK initialised');
    } catch (e) {
      console.warn('[platform] CrazyGames SDK init failed, continuing without it:', e);
    }
  },

  loadingProgress(_pct) {
    // CrazyGames SDK uses start/stop rather than a progress fraction.
    // loadingStart is called once on init; loadingDone calls loadingStop.
  },

  loadingDone() {
    if (cg) cg.game.loadingStop();
  },

  gameplayStart() {
    if (cg) cg.game.gameplayStart();
  },

  gameplayStop() {
    if (cg) cg.game.gameplayStop();
  },

  adBreak() {
    if (!cg) return Promise.resolve();
    return new Promise((resolve) => {
      cg.ad.requestAd('midgame', {
        adStarted:  () => {
          setForcedMuted(true);
        },
        adFinished: () => {
          setForcedMuted(false);
          resolve();
        },
        adError:    () => {
          setForcedMuted(false);
          resolve();
        },
      });
    });
  },

  event(name, data) {
    // CrazyGames analytics is limited; log for portal diagnostics.
    if (cg) {
      console.log('[CrazyGames] event:', name, data);
    }
  },
};

/**
 * Bootstrap: detect environment and activate.
 * Call this before platformSDK.init() in the game entry point.
 */
export function setupCrazyGames() {
  if (isCrazyGamesEnv()) {
    platformSDK.use(crazyGamesAdapter);
    console.log('[platform] CrazyGames adapter activated');
  }
}
