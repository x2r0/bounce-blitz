'use strict';

import { W, H, FONT } from '../config.js';
import { G } from '../state.js';
import { ctx } from '../canvas.js';

// --- Wave Transition Lore Snippets ---
// Keyed by wave range: [minWave, maxWave] → snippet text
const WAVE_SNIPPETS = [
  { min: 1, max: 2, text: 'The grid hums beneath you. It knows you\'re here.' },
  { min: 3, max: 4, text: 'Every bounce sends ripples through the code.' },
  { min: 5, max: 6, text: 'The Glitch is watching. It adapts.' },
  { min: 7, max: 8, text: 'New enemies. The corruption is learning.' },
  { min: 9, max: 9, text: 'Something massive stirs in the data stream...' },
  { min: 11, max: 12, text: 'The Queen is gone, but her code lingers.' },
  { min: 13, max: 14, text: 'Deeper into the grid. The light flickers here.' },
  { min: 15, max: 16, text: 'Your powers grow. The arena remembers how to fight.' },
  { min: 17, max: 18, text: 'The Glitch isn\'t random. It has a plan.' },
  { min: 19, max: 19, text: 'The arena\'s core pulses. Something ancient wakes.' },
  { min: 21, max: 22, text: 'Two down. The arena breathes easier.' },
  { min: 23, max: 24, text: 'The Void bleeds through cracks in the grid.' },
  { min: 25, max: 26, text: 'Lux. Champion. The last light still burning.' },
  { min: 27, max: 28, text: 'Reality bends at the edges. The Warden approaches.' },
  { min: 29, max: 29, text: 'The end of all things waits at Wave 30.' },
];

// --- Endless Mode Lore ---
export const ENDLESS_ENTRY_TEXT = 'The Glitch is beaten \u2014 but the arena\'s wounds won\'t heal. Corrupted data loops endlessly, spawning new threats from old patterns. You choose to stay. Someone has to keep the light on.';

const ENDLESS_BOSS_SNIPPET = 'The echoes reform. Stronger this time.';
const ENDLESS_POST_BOSS_SNIPPET = 'Again. And again. The loop never ends.';
const ENDLESS_GENERAL_SNIPPETS = [
  'How long can one light hold back the dark?',
  'The grid remembers every run you\'ve ever done.',
  'Wave {N}. Still here. Still bouncing.',
  'The arena whispers your name between the static.',
];

// --- Boss Lore Text (rendered below tagline on intro card) ---
export const BOSS_LORE = {
  hive_queen: 'She was the arena\'s first guardian \u2014 a protector who\nspawned smaller orbs to maintain balance. The Glitch\ndidn\'t destroy her. It turned her.',
  nexus_core: 'The Nexus was the arena\'s central processor \u2014 the\nintelligence that kept every system in sync. The Glitch\nconsumed it whole. Now it wields every weapon.',
  void_warden: 'Beyond the arena\'s edge is the Void \u2014 pure emptiness\nwhere deleted data goes to dissolve. The Warden is the\nGlitch\'s final creation: made from nothing.',
};

// --- Boss Glossary Extended Lore ---
export const BOSS_GLOSSARY_LORE = {
  hive_queen: 'The Hive Queen remembers what she was. Between waves of minions, you can see her hesitate \u2014 just for a frame. Then the Glitch tightens its grip, and she spawns another swarm.',
  nexus_core: 'Four phases. Four different attack patterns. The Nexus Core doesn\'t fight like one enemy \u2014 it fights like all of them. Watch the color shifts. They tell you which mode is coming next.',
  void_warden: 'Five phases. Gravity wells, bullet storms, teleport clones, mirror copies, and finally \u2014 Oblivion. The Void Warden is the final test. Defeat it, and the arena is free. But is it?',
};

// --- Get lore snippet for a given wave ---
export function getLoreSnippet(wave) {
  // Endless mode (wave > 30)
  if (wave > 30) {
    return getEndlessSnippet(wave);
  }
  // Story mode
  for (const entry of WAVE_SNIPPETS) {
    if (wave >= entry.min && wave <= entry.max) return entry.text;
  }
  return null;
}

function getEndlessSnippet(wave) {
  // Boss waves in endless: every 10th wave
  if (wave % 10 === 0) return ENDLESS_BOSS_SNIPPET;
  // Post-boss: wave right after a boss
  if ((wave - 1) % 10 === 0 && wave > 31) return ENDLESS_POST_BOSS_SNIPPET;
  // General: cycle through rotating snippets
  const idx = G.endlessLoreIndex % ENDLESS_GENERAL_SNIPPETS.length;
  const snippet = ENDLESS_GENERAL_SNIPPETS[idx];
  return snippet.replace('{N}', String(wave));
}

// --- Advance endless lore rotation (call once per wave transition in endless) ---
export function advanceEndlessLoreIndex() {
  G.endlessLoreIndex = (G.endlessLoreIndex + 1) % ENDLESS_GENERAL_SNIPPETS.length;
}

// --- Draw lore snippet during wave transition ---
// Called during WAVE_BREAK rendering. Uses G.loreSnippet state.
export function updateLoreSnippet(dt) {
  const ls = G.loreSnippet;
  if (!ls || !ls.text) return;
  ls.timer += dt;
}

export function drawLoreSnippet() {
  const ls = G.loreSnippet;
  if (!ls || !ls.text) return;

  const fadeIn = 0.6, hold = 2.5, fadeOut = 0.6;
  const t = ls.timer;
  let alpha = 0;

  if (t < fadeIn) {
    alpha = t / fadeIn;
  } else if (t < fadeIn + hold) {
    alpha = 1;
  } else if (t < fadeIn + hold + fadeOut) {
    alpha = 1 - (t - fadeIn - hold) / fadeOut;
  }

  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = 'italic 18px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Position below wave announce text
  const loreY = H / 2 + 50;
  // Semi-transparent dark background box for readability
  const metrics = ctx.measureText(ls.text);
  const padX = 16, padY = 10;
  const boxW = metrics.width + padX * 2;
  const boxH = 24 + padY * 2;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.roundRect(W / 2 - boxW / 2, loreY - boxH / 2, boxW, boxH, 6);
  ctx.fill();
  // Lore text
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#bbccdd';
  ctx.fillText(ls.text, W / 2, loreY);
  ctx.restore();
}

// --- Init lore snippet for a wave transition ---
export function initLoreSnippet(wave) {
  const text = getLoreSnippet(wave);
  if (!text) {
    G.loreSnippet = null;
    return;
  }
  G.loreSnippet = { text, timer: 0 };

  // Advance endless rotation for general snippets
  if (wave > 30 && wave % 10 !== 0 && !((wave - 1) % 10 === 0 && wave > 31)) {
    advanceEndlessLoreIndex();
  }
}

// --- Draw endless mode entry message (one-time) ---
export function drawEndlessEntryMessage() {
  if (!G.endlessEntryMessage) return;

  const fadeIn = 0.8, hold = 3.0, fadeOut = 0.8;
  const t = G.endlessEntryMessage.timer;
  let alpha = 0;

  if (t < fadeIn) {
    alpha = t / fadeIn;
  } else if (t < fadeIn + hold) {
    alpha = 1;
  } else if (t < fadeIn + hold + fadeOut) {
    alpha = 1 - (t - fadeIn - hold) / fadeOut;
  } else {
    G.endlessEntryMessage = null;
    return;
  }

  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = 'italic 14px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#888888';

  // Word-wrap the entry text across multiple lines
  const lines = wrapText(ENDLESS_ENTRY_TEXT, 55);
  const lineHeight = 20;
  const startY = H / 2 - ((lines.length - 1) * lineHeight) / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], W / 2, startY + i * lineHeight);
  }
  ctx.restore();
}

export function updateEndlessEntryMessage(dt) {
  if (!G.endlessEntryMessage) return;
  G.endlessEntryMessage.timer += dt;
  if (G.endlessEntryMessage.timer > 0.8 + 3.0 + 0.8) {
    G.endlessEntryMessage = null;
  }
}

// --- Show endless entry message (call once on first endless wave) ---
export function showEndlessEntryMessage() {
  if (G.endlessEntryShown) return;
  G.endlessEntryShown = true;
  G.endlessEntryMessage = { timer: 0 };
}

// Simple word-wrap helper
function wrapText(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}
