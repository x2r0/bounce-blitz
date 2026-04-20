'use strict';

import { W, H, STATE, STAMINA_MAX } from './config.js';
import { loadMeta } from './systems/meta.js';
import { loadHighScore, loadRunState } from './systems/save.js';

export const G = {
  state: STATE.TITLE,
  score: 0,
  highScore: loadHighScore(),
  combo: 0,
  comboTimer: 0,
  wave: 0,
  waveTimer: 0,
  waveSpawnTimer: 0,
  waveEnemiesLeft: 0,
  waveBreakTimer: 0,
  waveDuration: 0,
  spawnInterval: 0,
  player: null,
  enemies: [],
  powerUps: [],
  particles: [],
  floatTexts: [],
  combatTexts: [],
  shockwaves: [],
  thunderTrails: [],
  afterimages: [],
  wallFlashes: [],
  collectRings: [],
  multiPopExplosions: [],
  tapBounceRipples: [],
  shakeX: 0,
  shakeY: 0,
  shakeTimer: 0,
  shakeIntensity: 6,
  shakeDuration: 0.2,
  freezeTimer: 0,
  vignetteAlpha: 0,
  lastTime: null,
  gameOverFadeIn: 0,
  gameOverTimer: 0,
  elapsedTime: 0,
  tutorialDismissed: false,
  keysDown: {},
  collectFlashTimer: 0,
  collectFlashAlpha: 0,
  waveClearFlashTimer: 0,
  joystick: { active: false, touchId: null, cx: 0, cy: 0, tx: 0, ty: 0, dx: 0, dy: 0 },
  dashStick: { active: false, touchId: null, cx: 0, cy: 0, tx: 0, ty: 0, dx: 0, dy: 0 },
  mouseX: W / 2, mouseY: 0,  // mouse position in canvas coords (for dash aiming)
  dashAimCancelFlashTimer: 0, // red ring flash when mouse too close to ball center
  dashTooltipTimer: 0,         // countdown for "NEW" dash tooltip display
  dashTooltipCount: 0,         // how many dashes since update (for first-3 tooltip)

  // --- Roguelike: Power selection ---
  cardOffering: [],
  cardPickAnim: null,
  cardHover: -1,
  previousOffering: [],
  pendingEvolution: null,
  pendingPowerSelect: false,
  pendingPowerSelectContext: null,
  powerSelectConfig: null,

  // --- Roguelike: Run stats ---
  runKills: 0,
  runWaves: 0,
  runPowersHeld: [],
  runTelemetry: null,
  runUnlockedEndlessThisRun: false,

  // --- Roguelike: Run summary ---
  runSummary: null,
  runSummaryTimer: 0,
  runSummaryShardCounter: 0,
  runSummaryScoreCounter: 0,
  runSummaryReady: false,
  summaryParticles: [],
  relayChamber: null,
  transitionRoom: null,

  // --- Roguelike: Meta-progression ---
  meta: loadMeta(),

  // --- Roguelike: Upgrade/Loadout screen ---
  upgradeScrollY: 0,
  upgradeCursor: 0,
  loadoutCursor: 0,

  // --- Second Wind (revive) ---
  usedSecondWind: false,

  // --- Boss system ---
  boss: null,
  bossIntro: null,
  bossShardBonus: 0,
  bossClearPause: 0,
  bossRouteShardBonus: 0,
  bossRouteScoreBonus: 0,
  victoryPending: false,
  isVictory: false,
  lastBossResult: null,
  sniperBeams: [],

  // --- Burst-and-breathe spawning ---
  spawnBursts: [],
  currentBurst: 0,
  burstSpawnTimer: 0,
  burstPauseTimer: 0,
  inBurstPause: false,
  spawnQueue: [],
  spawnQueueTimer: 0,
  enemyCap: 15,
  lastTemplateIndex: -1,

  // --- Arena modifiers ---
  pillars: [],
  bouncePads: [],
  hazardZones: [],
  flatBouncers: [],
  staminaOrbs: [],
  powerGems: [],
  pillarDestroyedCount: 0,

  // --- Gravity wells ---
  gravityWells: [],

  // --- Boost system ---
  boostPickups: [],
  activeBoost: null,       // { type, timer, maxTimer, color, label } or null
  boostBanner: null,       // { label, color, timer } for instant-boost banners
  boostKillCounter: 0,

  // --- Physical shard pickups ---
  shardPickups: [],
  shardsCollected: 0,      // Total shard value collected during this run
  shardHudPulse: 0,        // HUD counter pulse timer

  // --- Hardcore mode ---
  isHardcore: false,

  // --- Mode selection ---
  isEndlessRun: false,
  modeSelectCursor: 0,

  // --- Wave transition animation ---
  waveTransitionOffset: 0,
  waveTransitionInitialBreak: 0,
  waveTransitionParallaxDots: [],
  waveTransitionTintAlpha: 0,
  waveTransitionTrail: [],     // [{x, y, timer, maxTimer}] player trail during scroll
  waveTransitionSlideIn: false, // true when new obstacles are offset for slide-in
  waveTransitionAnnounce: null, // {wave, timer, duration} for "WAVE X" text during scroll
  waveStartFlash: 0,           // white screen flash timer on wave start

  // --- Lore system ---
  loreSnippet: null,           // { text, timer } during wave transition
  endlessEntryShown: false,    // one-time post-W30 message
  endlessEntryMessage: null,   // { timer } for entry message display
  endlessLoreIndex: 0,         // rotating index for endless general snippets

  // --- Stage arc background progression ---
  currentArcIndex: -1,         // current stage arc index (0-5)
  ambientParticles: [],        // decorative particles for current arc
  ambientShapes: [],           // persistent slow-moving background shapes per arc
  gridCrossfade: 0,            // 0 = show new grid only, >0 = blending old/new
  gridCrossfadeTimer: 0,       // timer for grid crossfade during transitions

  // --- Settings screen ---
  _settingsPrevState: null,      // which state to return to (TITLE or PAUSED)
  _settingsCursor: 0,            // 0 = music, 1 = sfx, 2 = mute
  _settingsSliderRects: [],      // [{x,y,w,h}] for click detection on sliders
  _settingsMuteBtnRect: null,    // {x,y,w,h} for mute toggle button
  _settingsBackBtnRect: null,    // {x,y,w,h} for back button
  _settingsHoverBack: false,
  _settingsHoverMute: false,
  _upgradesPrevState: STATE.TITLE,
  _relayActionRects: {},
  _relayUpgradeRects: [],
  _relayLoadoutRects: [],
  _relayHoverAction: null,
  _relayHoverUpgradeIndex: -1,
  _relayHoverLoadoutIndex: -1,
  _transitionOptionRects: [],
  _transitionContinueRect: null,
  _mobilePauseBtnRect: null,

  // --- Story intro ---
  storyIntro: null,
};

export function resetGameState() {
  const meta = G.meta;
  const isHardcore = meta.selectedLoadout === 'hardcore';
  const hasThickSkin = meta.unlocks.includes(1);
  const hasIronSkin = meta.unlocks.includes(8);
  const hasQuickFeet = meta.unlocks.includes(2);
  const hasDeepBreath = meta.unlocks.includes(3);
  const hasDashMaster = meta.unlocks.includes(9);

  // Loadout adjustments
  let baseHp = 3, baseStamina = STAMINA_MAX, startPowers = [], scoreMod = 1.0;
  if (isHardcore) {
    baseHp = 1; baseStamina = 100; scoreMod = 2.0;
  } else if (meta.selectedLoadout === 'glass_cannon') {
    baseHp = 2; baseStamina = 120; scoreMod = 1.15;
  } else if (meta.selectedLoadout === 'tank') {
    baseHp = 4; baseStamina = 85; scoreMod = 0.9;
  }

  // Meta upgrades — HP upgrades do NOT apply in Hardcore
  let maxHp = baseHp;
  if (!isHardcore && meta.selectedLoadout !== 'glass_cannon') {
    if (hasThickSkin) maxHp += 1;
    if (hasIronSkin) maxHp += 1;
  }

  let maxStamina = baseStamina;
  if (hasDeepBreath) maxStamina += 15;

  G.state = STATE.WAVE_BREAK;
  G.score = 0;
  G.combo = 0;
  G.comboTimer = 0;
  G.wave = 0;
  G.waveBreakTimer = isHardcore ? 1.0 : 1.5;
  G.player = {
    x: W / 2, y: H / 2, vx: 0, vy: 0, r: 16, hp: maxHp, maxHp: maxHp,
    invTimer: 0, flashTimer: 0,
    dashGraceTimer: 0, dashRecoveryTimer: 0, dashCooldown: 0,
    pendingRecoveryTime: 0.25,
    // Dash charging state
    dashCharging: false,
    dashChargeTime: 0,
    dashChargeStaminaDrained: 0,
    dashChargeTouchId: null,
    staminaFlashTimer: 0,
    bouncerImmunity: 0,
    stamina: maxStamina, maxStamina: maxStamina,
    staminaRegenDelay: 0,
    staminaRegenBonus: 0,
    dashCostReduction: 0,
    eyeBlinkTimer: 0, eyeNextBlink: 3 + Math.random(), eyeSquashTimer: 0,
    eyeWideTimer: 0, eyeHappyTimer: 0, eyeDead: false,
    // Persistent powers: { id: string, level: number } entries
    powers: [],
    sigils: [],
    sigilState: { broodbreakerKillsLeft: 0, feedbackDashCount: 0 },
    // Active power state per-wave
    shieldCharges: 0, shieldRegenTimer: 0,
    magnetActive: false, magnetRadius: 0, magnetSpeed: 0,
    surgeActive: false, surgeDriftMax: 0, surgeDashSpeed: 0, surgeKillsRemaining: 0,
    multiPopCharges: 0, multiPopRadius: 0,
    shellGuardOrbs: [],
    thunderTrailSpawnTimer: 0,
    thunderTrailLife: 0,
    thunderTrailNodeLife: 0,
    thunderTrailRadius: 0,
    thunderTrailInterval: 0.024,
    thunderTrailDirX: 0,
    thunderTrailDirY: 0,
    thunderTrailChainId: 0,
    overdriveTimer: 0, overdriveSpeed: 0, overdrive2x: false,
    soulHarvestPierceTimer: 0,
    // Shield visual
    shieldDashOffset: 0,
    // Score modifier from loadout
    scoreMod: scoreMod,
  };

  // Apply starting loadout powers
  if (meta.selectedLoadout === 'glass_cannon') {
    G.player.powers.push({ id: 'dashBurst', level: 1 });
  } else if (meta.selectedLoadout === 'tank') {
    G.player.powers.push({ id: 'shield', level: 1 });
  }

  G.enemies = [];
  G.powerUps = [];
  G.particles = [];
  G.floatTexts = [];
  G.combatTexts = [];
  G.shockwaves = [];
  G.thunderTrails = [];
  G.afterimages = [];
  G.wallFlashes = [];
  G.collectRings = [];
  G.multiPopExplosions = [];
  G.shakeX = 0;
  G.shakeY = 0;
  G.shakeTimer = 0;
  G.shakeIntensity = 6;
  G.shakeDuration = 0.2;
  G.freezeTimer = 0;
  G.vignetteAlpha = 0;
  G.waveEnemiesLeft = 0;
  G.gameOverFadeIn = 0;
  G.gameOverTimer = 0;
  G.elapsedTime = 0;
  G.waveClearFlashTimer = 0;

  G.cardOffering = [];
  G.cardPickAnim = null;
  G.cardHover = -1;
  G.previousOffering = [];
  G.pendingEvolution = null;
  G.pendingPowerSelect = false;
  G.pendingPowerSelectContext = null;
  G.powerSelectConfig = null;

  if (meta.unlocks.includes(13)) {
    G.pendingPowerSelect = true;
    G.pendingPowerSelectContext = 'start_arsenal_choice';
  } else if (meta.unlocks.includes(5)) {
    G.pendingPowerSelect = true;
    G.pendingPowerSelectContext = 'start_common_choice';
  }

  G.runKills = 0;
  G.runWaves = 0;
  G.runPowersHeld = [];
  G.runUnlockedEndlessThisRun = false;
  G.runTelemetry = {
    loadout: meta.selectedLoadout || 'standard',
    isEndlessRun: !!G.isEndlessRun,
    damageTaken: 0,
    revivesUsed: 0,
    waveReached: 0,
    leaderboardSubmitted: false,
    killSources: { player: 0, multipop: 0, chainLightning: 0, nuke: 0, broodbreakerSigil: 0, feedbackSigil: 0, other: 0 },
  };

  G.runSummary = null;
  G.runSummaryTimer = 0;
  G.runSummaryShardCounter = 0;
  G.runSummaryReady = false;
  G.relayChamber = null;
  G.transitionRoom = null;

  G.usedSecondWind = false;

  G.boss = null;
  G.bossIntro = null;
  G.bossShardBonus = 0;
  G.bossClearPause = 0;
  G.bossRouteShardBonus = 0;
  G.bossRouteScoreBonus = 0;
  G.victoryPending = false;
  G.isVictory = false;
  G.lastBossResult = null;
  G.sniperBeams = [];

  G.spawnBursts = [];
  G.currentBurst = 0;
  G.burstSpawnTimer = 0;
  G.burstPauseTimer = 0;
  G.inBurstPause = false;
  G.spawnQueue = [];
  G.spawnQueueTimer = 0;
  G.enemyCap = 15;
  G.lastTemplateIndex = -1;

  G.pillars = [];
  G.bouncePads = [];
  G.hazardZones = [];
  G.flatBouncers = [];
  G.staminaOrbs = [];
  G.powerGems = [];
  G.pillarDestroyedCount = 0;

  G.gravityWells = [];

  G.boostPickups = [];
  G.activeBoost = null;
  G.boostBanner = null;
  G.boostKillCounter = 0;

  G.shardPickups = [];
  G.shardsCollected = 0;
  G.shardHudPulse = 0;

  G.isHardcore = isHardcore;

  G.waveTransitionOffset = 0;
  G.waveTransitionInitialBreak = 0;
  G.waveTransitionParallaxDots = [];
  G.waveTransitionTintAlpha = 0;
  G.waveTransitionTrail = [];
  G.waveTransitionSlideIn = false;
  G.waveTransitionAnnounce = null;
  G.waveStartFlash = 0;

  G.loreSnippet = null;
  G.storyIntro = null;
  G.endlessEntryShown = false;
  G.endlessEntryMessage = null;
  G.endlessLoreIndex = 0;
  G._upgradesPrevState = STATE.TITLE;
  G._relayActionRects = {};
  G._relayUpgradeRects = [];
  G._relayLoadoutRects = [];
  G._relayHoverAction = null;
  G._relayHoverUpgradeIndex = -1;
  G._relayHoverLoadoutIndex = -1;
  G._transitionOptionRects = [];
  G._transitionContinueRect = null;
  G._mobilePauseBtnRect = null;
  G.joystick = { active: false, touchId: null, cx: 0, cy: 0, tx: 0, ty: 0, dx: 0, dy: 0 };
  G.dashStick = { active: false, touchId: null, cx: 0, cy: 0, tx: 0, ty: 0, dx: 0, dy: 0 };

  G.currentArcIndex = -1;
  G.ambientParticles = [];
  G.ambientShapes = [];
  G.gridCrossfade = 0;
  G.gridCrossfadeTimer = 0;
}

export function restoreRunState() {
  const saved = loadRunState();
  if (!saved) return false;

  const inferredLoadout = saved.selectedLoadout
    || (saved.isHardcore ? 'hardcore' : (
      saved.player && saved.player.scoreMod === 1.3 ? 'glass_cannon'
      : saved.player && saved.player.scoreMod === 0.8 ? 'tank'
      : 'standard'
    ));

  // Resumed runs should keep the original loadout's dash tuning.
  G.meta.selectedLoadout = inferredLoadout;

  // Start with a clean slate via resetGameState, then overlay saved values
  resetGameState();

  // Wave break handler calls startNextWave() which does G.wave++.
  // Replay the saved wave only when quitting mid-wave; otherwise continue to the next one.
  G.wave = saved.runWaves < saved.wave ? saved.wave - 1 : saved.wave;
  G.score = saved.score;
  G.elapsedTime = saved.elapsedTime || 0;
  G.runKills = saved.runKills || 0;
  G.runWaves = saved.runWaves || 0;
  G.usedSecondWind = saved.usedSecondWind || false;
  G.bossShardBonus = saved.bossShardBonus || 0;
  G.shardsCollected = saved.shardsCollected || 0;
  G.isHardcore = saved.isHardcore || false;
  G.isEndlessRun = saved.isEndlessRun || false;
  G.previousOffering = saved.previousOffering || [];
  G.pendingEvolution = saved.pendingEvolution || null;
  G.pendingPowerSelect = false;
  G.pendingPowerSelectContext = null;
  G.powerSelectConfig = null;
  G.runTelemetry = saved.runTelemetry || {
    loadout: inferredLoadout,
    isEndlessRun: !!saved.isEndlessRun,
    damageTaken: 0,
    revivesUsed: saved.usedSecondWind ? 1 : 0,
    waveReached: saved.wave || 0,
    leaderboardSubmitted: false,
    killSources: { player: 0, multipop: 0, chainLightning: 0, nuke: 0, broodbreakerSigil: 0, feedbackSigil: 0, other: 0 },
  };
  G.runTelemetry.leaderboardSubmitted = !!G.runTelemetry.leaderboardSubmitted;
  G.runTelemetry.killSources = {
    player: 0,
    multipop: 0,
    chainLightning: 0,
    nuke: 0,
    broodbreakerSigil: 0,
    feedbackSigil: 0,
    other: 0,
    ...(G.runTelemetry.killSources || {}),
  };

  const sp = saved.player;
  G.player.hp = sp.hp;
  G.player.maxHp = sp.maxHp;
  G.player.stamina = sp.maxStamina; // full stamina on resume
  G.player.maxStamina = sp.maxStamina;
  G.player.powers = sp.powers.map(pw => ({ id: pw.id, level: pw.level }));
  G.player.sigils = Array.isArray(sp.sigils) ? [...sp.sigils] : [];
  G.player.sigilState = {
    broodbreakerKillsLeft: sp.sigilState?.broodbreakerKillsLeft || 0,
    feedbackDashCount: sp.sigilState?.feedbackDashCount || 0,
  };
  G.player.scoreMod = sp.scoreMod;
  G.player.dashCostReduction = sp.dashCostReduction || 0;
  G.player.staminaRegenBonus = sp.staminaRegenBonus || 0;

  // Resume at wave break before current wave
  G.state = STATE.WAVE_BREAK;
  G.waveBreakTimer = G.isHardcore ? 1.0 : 1.5;
  G.storyIntro = null;

  // If restoring past wave 30, mark endless entry as already shown
  if (saved.wave > 31 && G.isEndlessRun) {
    G.endlessEntryShown = true;
  }

  return true;
}
