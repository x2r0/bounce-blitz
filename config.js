'use strict';

// --- Canvas dimensions ---
export const W = 800;
export const H = 600;

// --- Game states ---
export const STATE = {
  PLAYING: 0, GAME_OVER: 1, WAVE_BREAK: 2, PAUSED: 3, TUTORIAL: 4, TITLE: 5,
  POWER_SELECT: 6, RUN_SUMMARY: 7, UPGRADES: 8, LOADOUT: 9,
  BOSS_INTRO_CARD: 10, BOSS_FIGHT: 11, GLOSSARY: 12, BOSS_TUTORIAL: 13,
  MODE_SELECT: 14, BOSS_READY: 15, SETTINGS: 16
};

// --- Drift & Dash Constants ---
export const DRIFT_ACCEL = 1200;
export const DRIFT_MAX_SPEED = 250;
export const DRIFT_FRICTION = 600;
export const IDLE_FRICTION = 1400;
export const DASH_COOLDOWN = 0.20;
export const BOUNCE_MIN_SPEED = 30;
export const SURGE_DRIFT_MAX = 400;
export const SURGE_DRIFT_ACCEL = 1800;
export const DASH_SPEED = 900;
export const DASH_SPEED_SURGE = 1400;
export const STAMINA_MAX = 100;
export const STAMINA_DASH_COST = 30;
export const STAMINA_REGEN_RATE = 25;
export const STAMINA_REGEN_DELAY = 0.4;
export const KILL_SPEED_THRESHOLD = 100;
export const SURGE_ACTIVE_SPEED_THRESHOLD = 100;

// --- Dash Charge Constants ---
export const CHARGE_TAP_THRESHOLD = 0.10;        // seconds — holds shorter than this → t=0
export const CHARGE_MAX_DURATION = 0.60;          // seconds — holds longer than this → t=1
export const CHARGE_INITIAL_COST_RATIO = 2/3;      // × effectiveBase (20 pts from base 30)
export const CHARGE_DRAIN_RATE_RATIO = 1.80;      // × effectiveBase per second
export const CHARGE_SPEED_MIN = 700;              // px/s at t=0
export const CHARGE_SPEED_MAX = 1100;             // px/s at t=1
export const CHARGE_GRACE_MIN = 0.20;             // seconds at t=0
export const CHARGE_GRACE_MAX = 0.45;             // seconds at t=1
export const CHARGE_RECOVERY_MIN = 0.15;          // seconds at t=0
export const CHARGE_RECOVERY_MAX = 0.30;          // seconds at t=1
export const CHARGE_DASH_MASTER_TAP = 0.06;       // seconds (reduced tap threshold)
export const CHARGE_POWER_SCALE_MIN = 0.70;       // power effect multiplier at t=0
export const CHARGE_POWER_SCALE_MAX = 1.00;       // power effect multiplier at t=1
export const CHARGE_TIMEWARP_SCALE_MIN = 0.60;    // time warp duration multiplier at t=0
export const CHARGE_TIMEWARP_SCALE_MAX = 1.00;    // time warp duration multiplier at t=1
export const CHARGE_THUNDER_TRAIL_MIN = 1.40;     // seconds at t=0
export const CHARGE_THUNDER_TRAIL_MAX = 2.00;     // seconds at t=1
export const CHARGE_OVERDRIVE_SPEED_MUL = 1.20;   // speed multiplier during Overdrive
export const CHARGE_GLOW_COLOR_START = '#4488ff';  // blue
export const CHARGE_GLOW_COLOR_END = '#ffcc00';    // gold
export const CHARGE_RING_RADIUS_MIN = 20;         // px
export const CHARGE_RING_RADIUS_MAX = 50;         // px
export const CHARGE_READY_PULSE_HZ = 4;           // Hz at full charge

// --- Visual Direction: Color Tables ---
export const ENEMY_COLORS = {
  drifter:       { core: '#00ff88', glow: '#00ff88', blur: 14 },
  tracker:       { core: '#ff8800', glow: '#ffaa33', blur: 16 },
  splitter:      { core: '#ff2244', glow: '#ff4466', blur: 16 },
  mini_splitter: { core: '#ff5566', glow: '#ff6677', blur: 10 },
  pulser:        { core: '#aa44ff', glow: '#cc66ff', blur: 18 },
  teleporter:    { core: '#cc44ff', glow: '#dd66ff', blur: 14 },
  bomber:        { core: '#ff2200', glow: '#ff4400', blur: 14 },
  spawner:       { core: '#ff4400', glow: '#ff6622', blur: 20 },
  spawner_minion:{ core: '#ff6644', glow: '#ff6644', blur: 10 },
  sniper:        { core: '#ff0044', glow: '#ff2266', blur: 12 },
  // Bosses
  hive_queen:    { core: '#ff8800', glow: '#ffaa22', blur: 22 },
  nexus_core:    { core: '#ffffff', glow: '#ffffff', blur: 24 },
  void_warden:   { core: '#220033', glow: '#8844cc', blur: 30 },
};

export const POWERUP_COLORS = {
  shield:          { icon: '#4488ff', aura: '#4488ff' },
  magnet:          { icon: '#ffdd00', aura: '#ffdd00' },
  surge:           { icon: '#ff4444', aura: '#ff4444' },
  multipop:        { icon: '#44ff88', aura: '#44ff88' },
  heart:           { icon: '#ff4488', aura: '#ff4488' },
  chainLightning:  { icon: '#88ccff', aura: '#88ccff' },
  timeWarp:        { icon: '#6644cc', aura: '#6644cc' },
  dashBurst:       { icon: '#ff8844', aura: '#ff8844' },
  shellGuard:      { icon: '#44ff88', aura: '#44ff88' },
  lifeSteal:       { icon: '#44ff44', aura: '#44ff44' },
  staminaOverflow: { icon: '#00eeff', aura: '#00eeff' },
  overdrive:       { icon: '#ffdd44', aura: '#ffdd44' }
};

// --- Loot Crate & Boost Colors ---
export const CRATE_COLOR = { core: '#ffaa00', glow: '#ffcc44', blur: 16 };
export const BOOST_COLORS = {
  screenNuke:        { color: '#ff4444', label: 'NUKE!' },
  invincibility:     { color: '#ffdd44', label: 'INVINCIBLE!' },
  healthRestore:     { color: '#44ff88', label: 'HEAL!' },
  pointFrenzy:       { color: '#ff44ff', label: 'FRENZY!' },
  staminaBurst:      { color: '#00eeff', label: 'STAMINA!' },
};

// --- Rarity Colors ---
export const RARITY_COLORS = {
  common:    '#ffffff',
  rare:      '#4488ff',
  epic:      '#aa44ff',
  evolution: '#ffdd44'
};

// --- Power Slots ---
export const MAX_POWER_SLOTS = 6;

// --- Clarity System (visual priority rendering) ---
export const CLARITY = {
  PROXIMITY_RING_RADIUS: 150,
  PROXIMITY_RING_OPACITY: 0.15,
  PROXIMITY_RING_DASH: [6, 6],
  PROXIMITY_RING_THRESHOLD: 12,      // enemies on screen to trigger ring
  THREAT_LINE_OPACITY: 0.2,
  THREAT_LINE_COUNT: 4,
  THREAT_LINE_RANGE: 120,
  THREAT_LINE_THRESHOLD: 8,          // enemies on screen to show threat lines
  FAR_BLUR_THRESHOLD: 10,            // enemies on screen to reduce far-enemy blur
  FAR_BLUR_DISTANCE: 200,            // px from player
  FAR_DIM_THRESHOLD: 12,             // enemies on screen to reduce far-enemy alpha
  FAR_DIM_DISTANCE: 250,             // px from player
  FAR_DIM_ALPHA: 0.7,                // alpha multiplier for far enemies
  OBSTACLE_SLIDE_DURATION: 0.8,      // seconds for obstacle position lerp
};

// --- Mouse-Aimed Dash ---
export const AIM_CANCEL_RADIUS = 5;               // px — mouse distance from ball center to cancel
export const CROSSHAIR_ARM_LENGTH = 12;            // px — crosshair arm size
export const CROSSHAIR_STROKE_WIDTH = 1;           // px
export const CROSSHAIR_ALPHA_MIN = 0.5;            // at t=0
export const CROSSHAIR_ALPHA_MAX = 0.8;            // at t=1
export const AIM_CHARGE_SHOW_THRESHOLD = 0.05;     // seconds — crosshair/projection appears after this
export const DASH_TOOLTIP_COUNT = 3;               // first N dashes show "NEW" tooltip
export const DASH_TOOLTIP_DURATION = 2.0;          // seconds
export const DASH_TOOLTIP_STORAGE_KEY = 'bounceblitz_dash_tooltip_shown';

// --- Difficulty Dash Overrides ---
// Per-loadout overrides for initial cost and grace window
export const DIFFICULTY_DASH_OVERRIDES = {
  standard:     { initialCost: 20, graceMin: 0.20, graceMax: 0.45 },
  glass_cannon: { initialCost: 25, graceMin: 0.18, graceMax: 0.40 },
  tank:         { initialCost: 18, graceMin: 0.22, graceMax: 0.50 },
  hardcore:     { initialCost: 25, graceMin: 0.15, graceMax: 0.35 },
};

// --- Font ---
export const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
