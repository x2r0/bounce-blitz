'use strict';

/**
 * Platform SDK integration layer.
 *
 * Default implementation is no-op — the game runs unchanged.
 * Each platform adapter (CrazyGames, Poki, GameDistribution) replaces
 * these hooks with its own SDK calls via `platformSDK.use(adapter)`.
 */

const noopAdapter = {
  /** Called once at startup. Return a Promise if async init is needed. */
  init()            {},

  /** Report asset-loading progress (0–1). */
  loadingProgress(/** @type {number} */ _pct) {},

  /** Signal that loading is complete and the game is ready to play. */
  loadingDone()     {},

  /** Gameplay session started (wave begun). */
  gameplayStart()   {},

  /** Gameplay session stopped (game over, pause, wave break). */
  gameplayStop()    {},

  /**
   * Request an ad break (interstitial).
   * Called during wave transitions. Must return a Promise that resolves
   * when the ad finishes (or is skipped/unavailable) so the game can resume.
   * @returns {Promise<void>}
   */
  adBreak()         { return Promise.resolve(); },

  /**
   * Submit a final run score to a platform leaderboard when supported.
   * @param {number} _score
   * @param {Object} _meta
   * @returns {Promise<boolean>}
   */
  submitLeaderboardScore(/** @type {number} */ _score, /** @type {Object} */ _meta) {
    return Promise.resolve(false);
  },

  /**
   * Fetch the top-N leaderboard entries (and the current user's rank, when
   * available) for display on the run summary. Platforms without a leaderboard
   * return an empty shape that the UI treats as "unavailable".
   *
   * Shape: { scores: [{rank, username, score, isSelf}], userRank: number|null,
   *          userScore: number|null, username: string|null, error: string|null }
   * @param {Object} _opts
   * @returns {Promise<Object>}
   */
  fetchLeaderboard(/** @type {Object} */ _opts) {
    return Promise.resolve({ scores: [], userRank: null, userScore: null, username: null, error: 'unsupported' });
  },

  /**
   * Report an analytics / game event.
   * @param {string} name  — event name (e.g. 'score', 'waveReached', 'death')
   * @param {Object} data  — event payload
   */
  event(/** @type {string} */ _name, /** @type {Object} */ _data) {},
};

/** Active adapter — starts as no-op. */
let adapter = { ...noopAdapter };

const platformSDK = {
  /**
   * Swap in a platform-specific adapter.
   * Any missing hooks fall back to no-op so partial adapters are safe.
   */
  use(custom) {
    adapter = { ...noopAdapter, ...custom };
  },

  // --- Forwarding calls to active adapter ---
  init()                    { return adapter.init(); },
  loadingProgress(pct)      { adapter.loadingProgress(pct); },
  loadingDone()             { adapter.loadingDone(); },
  gameplayStart()           { adapter.gameplayStart(); },
  gameplayStop()            { adapter.gameplayStop(); },
  adBreak()                 { return adapter.adBreak(); },
  submitLeaderboardScore(score, meta = {}) { return adapter.submitLeaderboardScore(score, meta); },
  fetchLeaderboard(opts = {}) { return adapter.fetchLeaderboard(opts); },
  event(name, data)         { adapter.event(name, data); },
};

export default platformSDK;
