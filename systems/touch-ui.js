'use strict';

import { STATE } from '../config.js';
import { G } from '../state.js';
import { C } from '../canvas.js';
import { formatScore, formatTime } from '../utils.js';
import { getEnemyCount } from './wave.js';

let root = null;
let leftGutter = null;
let rightGutter = null;
let leftHud = null;
let rightHud = null;
let leftBase = null;
let leftThumb = null;
let rightBase = null;
let rightThumb = null;
let backBtn = null;
let pauseBtn = null;
let leftHint = null;
let rightHint = null;
let orientationOverlay = null;
let pauseHandler = null;
let backHandler = null;

export function isTouchUILayout() {
  if (typeof window === 'undefined') return false;
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
}

function getViewportSize() {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  const viewport = window.visualViewport;
  return {
    width: viewport?.width || window.innerWidth || 0,
    height: viewport?.height || window.innerHeight || 0,
  };
}

export function isTouchPortraitBlocked() {
  if (!isTouchUILayout()) return false;
  const { width, height } = getViewportSize();
  return height > width;
}

function ensureTouchUI() {
  if (!isTouchUILayout() || root || typeof document === 'undefined') return;

  const style = document.createElement('style');
  style.textContent = `
    #bb-touch-ui {
      position: fixed;
      inset: 0;
      z-index: 25;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }
    .bb-touch-gutter {
      position: absolute;
      top: 0;
      bottom: 0;
      pointer-events: none;
      opacity: 0;
      transition: opacity 140ms ease-out;
      overflow: hidden;
    }
    .bb-touch-gutter.is-visible {
      opacity: 1;
    }
    .bb-touch-gutter::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 50% 20%, rgba(120, 243, 255, 0.14), rgba(120, 243, 255, 0) 48%),
        linear-gradient(180deg, rgba(8, 16, 28, 0.96), rgba(6, 12, 22, 0.82));
    }
    .bb-touch-gutter::after {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(120, 243, 255, 0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(120, 243, 255, 0.05) 1px, transparent 1px);
      background-size: 26px 26px;
      opacity: 0.4;
      mix-blend-mode: screen;
    }
    .bb-touch-hud {
      position: absolute;
      top: calc(22px + env(safe-area-inset-top, 0px));
      min-height: 96px;
      padding: 10px 12px 10px;
      border-radius: 18px;
      background: rgba(8, 14, 24, 0.78);
      border: 1px solid rgba(120, 243, 255, 0.14);
      backdrop-filter: blur(8px);
      box-shadow: 0 18px 48px rgba(0,0,0,0.22);
      opacity: 0;
      transition: opacity 140ms ease-out;
      pointer-events: none;
      color: #eef6ff;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .bb-touch-hud.is-visible {
      opacity: 1;
    }
    .bb-touch-hud--left {
      left: 12px;
    }
    .bb-touch-hud--right {
      right: 12px;
      text-align: right;
    }
    .bb-touch-hud-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .bb-touch-hud--right .bb-touch-hud-row {
      justify-content: flex-end;
    }
    .bb-touch-hud + .bb-touch-hud {
      margin-left: auto;
    }
    .bb-touch-orbs {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 9px;
    }
    .bb-touch-orb {
      width: 18px;
      height: 18px;
      border-radius: 999px;
      border: 1.5px solid rgba(129, 153, 180, 0.34);
      background: transparent;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03);
    }
    .bb-touch-orb.is-filled {
      background: rgba(120, 243, 255, 0.95);
      border-color: rgba(120, 243, 255, 0.92);
      box-shadow: 0 0 14px rgba(120, 243, 255, 0.28);
    }
    .bb-touch-meter {
      width: 100%;
      height: 8px;
      border-radius: 999px;
      background: rgba(255,255,255,0.08);
      overflow: hidden;
      margin-bottom: 9px;
    }
    .bb-touch-meter-fill {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #00cfff, #4df6ff);
      box-shadow: 0 0 10px rgba(77, 246, 255, 0.28);
    }
    .bb-touch-sigils {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      min-height: 18px;
      flex-wrap: wrap;
    }
    .bb-touch-sigil-label,
    .bb-touch-wave-label,
    .bb-touch-stat-label {
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #8ea9c9;
    }
    .bb-touch-sigil-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.08);
      color: #eef6ff;
    }
    .bb-touch-sigil-chip.is-broodbreaker {
      color: #ffcf86;
      border-color: rgba(255, 207, 134, 0.28);
    }
    .bb-touch-sigil-chip.is-feedback {
      color: #8dd8ff;
      border-color: rgba(141, 216, 255, 0.28);
    }
    .bb-touch-wave-text {
      font-size: 13px;
      font-weight: 700;
      color: #dfeaff;
      margin-bottom: 6px;
    }
    .bb-touch-wave-progress {
      width: 100%;
      height: 5px;
      border-radius: 999px;
      background: rgba(120, 243, 255, 0.12);
      overflow: hidden;
    }
    .bb-touch-wave-progress-fill {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #00b88f, #00f0c1);
    }
    .bb-touch-statline {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 7px;
    }
    .bb-touch-statline:last-child {
      margin-bottom: 0;
    }
    .bb-touch-hud--right .bb-touch-statline {
      justify-content: space-between;
    }
    .bb-touch-statline-value {
      font-size: 18px;
      font-weight: 800;
      line-height: 1;
      color: #eef6ff;
      white-space: nowrap;
    }
    .bb-touch-statline-value.is-score {
      text-shadow: 0 0 12px rgba(170,170,255,0.22);
    }
    .bb-touch-meta-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 2px;
      flex-wrap: wrap;
    }
    .bb-touch-meta-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      color: #eef6ff;
      white-space: nowrap;
    }
    .bb-touch-meta-chip-label {
      color: #8ea9c9;
      font-size: 10px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .bb-touch-meta-chip-value.is-shards {
      color: #00e5ff;
    }
    .bb-touch-meta-chip-value.is-combo {
      color: #ffeb63;
    }
    #bb-touch-gutter-left::before {
      border-right: 1px solid rgba(120, 243, 255, 0.16);
    }
    #bb-touch-gutter-right::before {
      border-left: 1px solid rgba(120, 243, 255, 0.16);
    }
    .bb-stick {
      position: absolute;
      width: 132px;
      height: 132px;
      margin-left: -66px;
      margin-top: -66px;
      opacity: 0;
      transition: opacity 100ms ease-out, transform 100ms ease-out;
    }
    .bb-stick.is-idle {
      opacity: 0.28;
    }
    .bb-stick.is-visible {
      opacity: 0.94;
    }
    .bb-stick-base,
    .bb-stick-thumb {
      position: absolute;
      border-radius: 999px;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.08) inset;
    }
    .bb-stick-base {
      left: 16px;
      top: 16px;
      width: 100px;
      height: 100px;
      border: 2px solid rgba(255,255,255,0.18);
      background: radial-gradient(circle at 50% 50%, rgba(12,22,35,0.28), rgba(4,8,15,0.08));
      backdrop-filter: blur(3px);
    }
    .bb-stick-thumb {
      left: 45px;
      top: 45px;
      width: 42px;
      height: 42px;
      transition: transform 30ms linear;
    }
    #bb-touch-left .bb-stick-thumb {
      background: rgba(120, 243, 255, 0.34);
      border: 2px solid rgba(120, 243, 255, 0.8);
      box-shadow: 0 0 18px rgba(120,243,255,0.25);
    }
    #bb-touch-right .bb-stick-thumb {
      background: rgba(255, 217, 102, 0.34);
      border: 2px solid rgba(255, 217, 102, 0.86);
      box-shadow: 0 0 18px rgba(255,217,102,0.22);
    }
    .bb-touch-hint {
      position: absolute;
      min-width: 126px;
      max-width: 180px;
      padding: 8px 12px;
      border-radius: 14px;
      background: rgba(7, 12, 22, 0.82);
      border: 1px solid rgba(255,255,255,0.08);
      backdrop-filter: blur(4px);
      opacity: 0;
      transition: opacity 140ms ease-out;
    }
    .bb-touch-hint.is-idle {
      opacity: 0.34;
    }
    .bb-touch-hint.is-visible {
      opacity: 0.82;
    }
    .bb-touch-hint h4 {
      margin: 0 0 4px;
      font: 700 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .bb-touch-hint p {
      margin: 0;
      font: 500 11px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #d9e8f8;
    }
    #bb-touch-left-hint { left: 14px; }
    #bb-touch-left-hint h4 { color: #78f3ff; }
    #bb-touch-right-hint { right: 14px; text-align: right; }
    #bb-touch-right-hint h4 { color: #ffd966; }
    .bb-touch-corner-btn {
      position: absolute;
      top: calc(12px + env(safe-area-inset-top, 0px));
      width: auto;
      min-width: 58px;
      height: 58px;
      border-radius: 18px;
      border: 1px solid rgba(140, 210, 255, 0.28);
      background: rgba(7, 12, 22, 0.88);
      color: #eef6ff;
      display: none;
      align-items: center;
      justify-content: center;
      font: 700 18px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      backdrop-filter: blur(6px);
      pointer-events: auto;
      box-shadow: 0 10px 30px rgba(0,0,0,0.18);
      padding: 0 16px;
    }
    .bb-touch-orientation {
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      padding:
        calc(24px + env(safe-area-inset-top, 0px))
        calc(20px + env(safe-area-inset-right, 0px))
        calc(24px + env(safe-area-inset-bottom, 0px))
        calc(20px + env(safe-area-inset-left, 0px));
      pointer-events: auto;
      background:
        radial-gradient(circle at 50% 20%, rgba(120, 243, 255, 0.14), rgba(120, 243, 255, 0) 36%),
        linear-gradient(180deg, rgba(2, 6, 13, 0.98), rgba(5, 11, 20, 0.97));
    }
    .bb-touch-orientation.is-visible {
      display: flex;
    }
    .bb-touch-orientation-card {
      width: min(320px, calc(100vw - 40px));
      padding: 22px 22px 20px;
      border-radius: 22px;
      background: rgba(8, 14, 24, 0.92);
      border: 1px solid rgba(120, 243, 255, 0.18);
      box-shadow: 0 20px 60px rgba(0,0,0,0.32);
      text-align: center;
    }
    .bb-touch-orientation-icon {
      width: 84px;
      height: 84px;
      margin: 0 auto 16px;
      position: relative;
    }
    .bb-touch-orientation-icon::before,
    .bb-touch-orientation-icon::after {
      content: "";
      position: absolute;
      border-radius: 18px;
      border: 2px solid rgba(120, 243, 255, 0.8);
      background: rgba(120, 243, 255, 0.08);
      box-shadow: 0 0 18px rgba(120, 243, 255, 0.12);
    }
    .bb-touch-orientation-icon::before {
      width: 34px;
      height: 58px;
      left: 8px;
      top: 12px;
    }
    .bb-touch-orientation-icon::after {
      width: 58px;
      height: 34px;
      right: 2px;
      bottom: 6px;
    }
    .bb-touch-orientation h3 {
      margin: 0 0 8px;
      color: #eef6ff;
      font: 800 28px/1.05 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .bb-touch-orientation p {
      margin: 0;
      color: #d7e8fb;
      font: 500 15px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .bb-touch-orientation p + p {
      margin-top: 8px;
      color: rgba(215, 232, 251, 0.72);
      font-size: 13px;
    }
    .bb-touch-corner-btn.is-visible {
      display: flex;
    }
    #bb-touch-back {
      left: calc(12px + env(safe-area-inset-left, 0px));
      display: none;
      justify-content: center;
      gap: 8px;
    }
    #bb-touch-pause {
      right: calc(12px + env(safe-area-inset-right, 0px));
      display: none;
      font-size: 24px;
      padding: 0;
    }
    .bb-touch-back-arrow {
      font-size: 20px;
      line-height: 1;
    }
  `;
  document.head.appendChild(style);

  root = document.createElement('div');
  root.id = 'bb-touch-ui';
  root.innerHTML = `
    <div id="bb-touch-gutter-left" class="bb-touch-gutter"></div>
    <div id="bb-touch-gutter-right" class="bb-touch-gutter"></div>
    <div id="bb-touch-hud-left" class="bb-touch-hud bb-touch-hud--left"></div>
    <div id="bb-touch-hud-right" class="bb-touch-hud bb-touch-hud--right"></div>
    <div id="bb-touch-left" class="bb-stick">
      <div class="bb-stick-base"></div>
      <div class="bb-stick-thumb"></div>
    </div>
    <div id="bb-touch-right" class="bb-stick">
      <div class="bb-stick-base"></div>
      <div class="bb-stick-thumb"></div>
    </div>
    <button id="bb-touch-back" class="bb-touch-corner-btn" aria-label="Back">
      <span class="bb-touch-back-arrow">‹</span><span id="bb-touch-back-label">Back</span>
    </button>
    <button id="bb-touch-pause" class="bb-touch-corner-btn" aria-label="Pause game">||</button>
    <div id="bb-touch-left-hint" class="bb-touch-hint">
      <h4>Move</h4>
      <p>Left thumb joystick</p>
    </div>
    <div id="bb-touch-right-hint" class="bb-touch-hint">
      <h4>Dash</h4>
      <p>Press, aim, release</p>
    </div>
    <div id="bb-touch-orientation" class="bb-touch-orientation" aria-hidden="true">
      <div class="bb-touch-orientation-card">
        <div class="bb-touch-orientation-icon" aria-hidden="true"></div>
        <h3>Rotate Device</h3>
        <p>Bounce Blitz is played in landscape on mobile.</p>
        <p>Turn your phone sideways to continue.</p>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  leftGutter = root.querySelector('#bb-touch-gutter-left');
  rightGutter = root.querySelector('#bb-touch-gutter-right');
  leftHud = root.querySelector('#bb-touch-hud-left');
  rightHud = root.querySelector('#bb-touch-hud-right');
  leftBase = root.querySelector('#bb-touch-left');
  leftThumb = leftBase?.querySelector('.bb-stick-thumb') || null;
  rightBase = root.querySelector('#bb-touch-right');
  rightThumb = rightBase?.querySelector('.bb-stick-thumb') || null;
  backBtn = root.querySelector('#bb-touch-back');
  pauseBtn = root.querySelector('#bb-touch-pause');
  leftHint = root.querySelector('#bb-touch-left-hint');
  rightHint = root.querySelector('#bb-touch-right-hint');
  orientationOverlay = root.querySelector('#bb-touch-orientation');

  const handlePause = (e) => {
    e.preventDefault();
    e.stopPropagation();
    pauseHandler?.();
  };
  const handleBack = (e) => {
    e.preventDefault();
    e.stopPropagation();
    backHandler?.();
  };
  backBtn?.addEventListener('click', handleBack);
  backBtn?.addEventListener('touchstart', handleBack, { passive: false });
  pauseBtn?.addEventListener('click', handlePause);
  pauseBtn?.addEventListener('touchstart', handlePause, { passive: false });
}

function shouldShowTouchHud() {
  return G.state === STATE.PLAYING || G.state === STATE.WAVE_BREAK || G.state === STATE.BOSS_FIGHT;
}

function renderTouchHud(anchors) {
  if (!leftHud || !rightHud) return;
  const visible = !!anchors && !!G.player && shouldShowTouchHud();
  leftHud.classList.toggle('is-visible', visible);
  rightHud.classList.toggle('is-visible', visible);
  if (!visible) return;

  const player = G.player;
  const leftWidth = Math.max(142, (anchors.leftWidth || 170) - 24);
  const rightWidth = Math.max(142, (anchors.rightWidth || 170) - 24);
  leftHud.style.width = `${leftWidth}px`;
  rightHud.style.width = `${rightWidth}px`;

  const maxStam = player.maxStamina || 100;
  const staminaFill = Math.max(0, Math.min(1, player.stamina / maxStam));
  const hpDots = Array.from({ length: player.maxHp }, (_, i) =>
    `<span class="bb-touch-orb${i < player.hp ? ' is-filled' : ''}"></span>`
  ).join('');
  const sigils = (player.sigils || []).map((sigilId) => {
    if (sigilId === 'broodbreaker') return '<span class="bb-touch-sigil-chip is-broodbreaker">◆</span>';
    if (sigilId === 'feedback') return '<span class="bb-touch-sigil-chip is-feedback">⚡</span>';
    return '<span class="bb-touch-sigil-chip">•</span>';
  }).join('');
  const remaining = G.waveEnemiesLeft + G.enemies.filter(e => e.alive).length;
  const total = getEnemyCount(G.wave);
  const killed = total - remaining;
  const waveProgress = total > 0 ? Math.max(0, Math.min(1, killed / total)) : 0;
  const waveText = G.state === STATE.WAVE_BREAK
    ? `Wave ${G.wave} — Clear`
    : `Wave ${G.wave} — ${remaining > 0 ? `${remaining} left` : 'Clear'}`;

  leftHud.innerHTML = `
    <div class="bb-touch-orbs">${hpDots}</div>
    <div class="bb-touch-meter"><div class="bb-touch-meter-fill" style="width:${(staminaFill * 100).toFixed(1)}%"></div></div>
    <div class="bb-touch-sigils">
      <span class="bb-touch-sigil-label">Sigils</span>
      ${sigils || '<span class="bb-touch-sigil-chip">—</span>'}
    </div>
    <div class="bb-touch-wave-text">${waveText}</div>
    <div class="bb-touch-wave-progress"><div class="bb-touch-wave-progress-fill" style="width:${(waveProgress * 100).toFixed(1)}%"></div></div>
  `;

  rightHud.innerHTML = `
    <div class="bb-touch-statline">
      <span class="bb-touch-stat-label">Time</span>
      <span class="bb-touch-statline-value">${formatTime(G.elapsedTime)}</span>
    </div>
    <div class="bb-touch-statline">
      <span class="bb-touch-stat-label">Score</span>
      <span class="bb-touch-statline-value is-score">${formatScore(G.score)}</span>
    </div>
    <div class="bb-touch-meta-row">
      <span class="bb-touch-meta-chip">
        <span class="bb-touch-meta-chip-label">Hi</span>
        <span class="bb-touch-meta-chip-value">${formatScore(G.highScore)}</span>
      </span>
      <span class="bb-touch-meta-chip">
        <span class="bb-touch-meta-chip-label">◆</span>
        <span class="bb-touch-meta-chip-value is-shards">${G.shardsCollected || 0}</span>
      </span>
      <span class="bb-touch-meta-chip">
        <span class="bb-touch-meta-chip-label">Combo</span>
        <span class="bb-touch-meta-chip-value is-combo">${G.combo >= 2 ? 'x' + G.combo : '—'}</span>
      </span>
    </div>
  `;
}

function setStickVisual(container, thumb, state, visibility = 'hidden') {
  if (!container || !thumb) return;
  if (!state) {
    container.classList.remove('is-visible');
    container.classList.remove('is-idle');
    return;
  }
  container.classList.toggle('is-visible', visibility === 'active');
  container.classList.toggle('is-idle', visibility === 'idle');
  container.style.left = `${state.cx}px`;
  container.style.top = `${state.cy}px`;
  thumb.style.transform = `translate(${state.dx}px, ${state.dy}px)`;
}

export function bindTouchPauseButton(handler) {
  ensureTouchUI();
  pauseHandler = handler;
}

export function bindTouchBackButton(handler) {
  ensureTouchUI();
  backHandler = handler;
}

function setHintCard(card, title, body, visibility = 'hidden') {
  if (!card) return;
  const titleEl = card.querySelector('h4');
  const bodyEl = card.querySelector('p');
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.textContent = body;
  card.classList.toggle('is-visible', visibility === 'active');
  card.classList.toggle('is-idle', visibility === 'idle');
}

function getTouchUiMode() {
  const introBeat = G.storyIntro?.beat ?? -1;
  if (G.state === STATE.STORY_INTRO && introBeat === 1) return 'intro_move';
  if (G.state === STATE.STORY_INTRO && introBeat === 3) return 'intro_dash';
  if (G.state === STATE.TUTORIAL) return 'tutorial';
  if (G.state === STATE.PLAYING || G.state === STATE.WAVE_BREAK || G.state === STATE.BOSS_FIGHT) return 'gameplay';
  return 'menu';
}

function getDemoStickStates(mode, now, anchors) {
  if (mode !== 'intro_move' && mode !== 'intro_dash' && mode !== 'tutorial') {
    return { left: null, right: null };
  }
  const t = now / 1000;
  const baseY = anchors?.baseY || (window.innerHeight - 110 - Math.max(0, window.innerHeight * 0.02));
  const left = {
    active: true,
    cx: anchors?.leftX || window.innerWidth * 0.18,
    cy: baseY,
    dx: Math.sin(t * 2.1) * 24,
    dy: Math.cos(t * 1.8) * 16,
  };
  const right = (mode === 'intro_dash' || mode === 'tutorial')
    ? {
        active: true,
        cx: anchors?.rightX || window.innerWidth * 0.82,
        cy: baseY,
        dx: Math.cos(t * 2.6) * 18,
        dy: Math.sin(t * 2.6) * 18,
      }
    : null;
  return { left, right };
}

function getTouchAnchors(rect) {
  const bottomInset = 110 + Math.max(0, window.innerHeight * 0.02);
  const leftWidth = Math.max(0, Math.floor(rect.left));
  const rightWidth = Math.max(0, Math.floor(window.innerWidth - rect.right));
  const outerInset = 84;
  const leftX = leftWidth > 0
    ? Math.max(76, Math.min(Math.max(76, leftWidth - 76), outerInset))
    : 76;
  const rightX = rightWidth > 0
    ? window.innerWidth - Math.max(76, Math.min(Math.max(76, rightWidth - 76), outerInset))
    : window.innerWidth - 76;
  return {
    leftWidth,
    rightWidth,
    leftGutterX: 0,
    rightGutterX: Math.floor(rect.right),
    leftX,
    rightX,
    baseY: window.innerHeight - bottomInset,
  };
}

function positionHint(card, gutterX, gutterWidth, cy, alignRight = false, minTop = 12) {
  if (!card) return;
  const width = Math.min(176, Math.max(124, gutterWidth - 18));
  const x = alignRight
    ? Math.max(8, gutterX + gutterWidth - width - 12)
    : Math.min(window.innerWidth - width - 8, gutterX + 12);
  card.style.width = `${width}px`;
  card.style.left = `${Math.round(x)}px`;
  card.style.right = 'auto';
  card.style.top = `${Math.max(minTop, Math.round(cy - 148))}px`;
}

function updateGutters() {
  if (!leftGutter || !rightGutter) return;
  const rect = C?.getBoundingClientRect?.();
  if (!rect) return null;
  const anchors = getTouchAnchors(rect);
  const { leftWidth, rightWidth } = anchors;
  leftGutter.style.left = '0px';
  leftGutter.style.width = `${leftWidth}px`;
  rightGutter.style.left = `${Math.floor(rect.right)}px`;
  rightGutter.style.width = `${rightWidth}px`;
  const showLeft = leftWidth > 18;
  const showRight = rightWidth > 18;
  leftGutter.classList.toggle('is-visible', showLeft);
  rightGutter.classList.toggle('is-visible', showRight);
  return anchors;
}

export function syncTouchOverlay() {
  ensureTouchUI();
  if (!root) return;

  root.style.display = isTouchUILayout() ? 'block' : 'none';
  if (!isTouchUILayout()) return;

  const orientationBlocked = isTouchPortraitBlocked();
  orientationOverlay?.classList.toggle('is-visible', orientationBlocked);
  if (orientationBlocked) {
    leftGutter?.classList.remove('is-visible');
    rightGutter?.classList.remove('is-visible');
    leftHud?.classList.remove('is-visible');
    rightHud?.classList.remove('is-visible');
    setStickVisual(leftBase, leftThumb, null);
    setStickVisual(rightBase, rightThumb, null);
    setHintCard(leftHint, 'Move', 'Left thumb joystick', 'hidden');
    setHintCard(rightHint, 'Dash', 'Press, aim, release', 'hidden');
    backBtn?.classList.remove('is-visible');
    pauseBtn?.classList.remove('is-visible');
    return;
  }

  const mode = getTouchUiMode();
  const inGameplay = mode === 'gameplay';
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const anchors = updateGutters();
  renderTouchHud(anchors);
  const demos = getDemoStickStates(mode, now, anchors);
  const idleLeft = anchors ? { cx: anchors.leftX, cy: anchors.baseY, dx: 0, dy: 0 } : null;
  const idleRight = anchors ? { cx: anchors.rightX, cy: anchors.baseY, dx: 0, dy: 0 } : null;
  const leftHintVisibility = G.joystick.active ? 'active' : 'idle';
  const rightHintVisibility = G.dashStick.active ? 'active' : 'idle';

  if (mode === 'intro_move') {
    setStickVisual(leftBase, leftThumb, demos.left, 'active');
    setStickVisual(rightBase, rightThumb, idleRight, 'idle');
  } else if (mode === 'intro_dash' || mode === 'tutorial') {
    setStickVisual(leftBase, leftThumb, demos.left || idleLeft, demos.left ? 'active' : 'idle');
    setStickVisual(rightBase, rightThumb, demos.right || idleRight, demos.right ? 'active' : 'idle');
  } else if (inGameplay) {
    setStickVisual(leftBase, leftThumb, G.joystick.active ? G.joystick : idleLeft, G.joystick.active ? 'active' : 'idle');
    setStickVisual(rightBase, rightThumb, G.dashStick.active ? G.dashStick : idleRight, G.dashStick.active ? 'active' : 'idle');
  } else {
    setStickVisual(leftBase, leftThumb, null);
    setStickVisual(rightBase, rightThumb, null);
  }

  if (pauseBtn) {
    pauseBtn.classList.toggle('is-visible', inGameplay);
  }

  let showBack = false;
  let backLabel = 'Back';
  if (G.state === STATE.STORY_INTRO && G.storyIntro?.skipReady) {
    showBack = true;
    backLabel = 'Skip';
  } else if (G.state === STATE.SETTINGS || G.state === STATE.LOADOUT || G.state === STATE.UPGRADES || G.state === STATE.GLOSSARY || G.state === STATE.MODE_SELECT) {
    showBack = true;
    backLabel = 'Back';
  } else if (G.state === STATE.PAUSED) {
    showBack = true;
    backLabel = 'Resume';
  } else if (G.state === STATE.RELAY_CHAMBER) {
    showBack = true;
    backLabel = G.relayChamber?.mobileOverlay ? 'Close' : 'Menu';
  }
  if (backBtn) {
    backBtn.classList.toggle('is-visible', showBack);
    const labelEl = backBtn.querySelector('#bb-touch-back-label');
    if (labelEl) labelEl.textContent = backLabel;
  }

  const gameplayHints = inGameplay;
  if (mode === 'intro_move') {
    setHintCard(leftHint, 'Move', 'Slide the left stick to steer.', 'active');
    setHintCard(rightHint, 'Dash', 'The dash stick appears next.', 'hidden');
  } else if (mode === 'intro_dash') {
    setHintCard(leftHint, 'Move', 'Keep drifting with the left stick.', 'idle');
    setHintCard(rightHint, 'Dash', 'Press, aim, then release.', 'active');
  } else if (mode === 'tutorial') {
    setHintCard(leftHint, 'Move', 'Left stick steers the courier.', 'active');
    setHintCard(rightHint, 'Dash', 'Press, aim, and release to burst.', 'active');
  } else {
    setHintCard(leftHint, 'Move', 'Left thumb joystick', gameplayHints ? leftHintVisibility : 'hidden');
    setHintCard(rightHint, 'Dash', 'Press, aim, release', gameplayHints ? rightHintVisibility : 'hidden');
  }

  if (anchors) {
    const leftHudBottom = shouldShowTouchHud() && leftHud
      ? leftHud.getBoundingClientRect().bottom + 12
      : 12;
    const rightHudBottom = shouldShowTouchHud() && rightHud
      ? rightHud.getBoundingClientRect().bottom + 12
      : 12;
    positionHint(leftHint, anchors.leftGutterX, anchors.leftWidth || 150, anchors.baseY, false, leftHudBottom);
    positionHint(rightHint, anchors.rightGutterX, anchors.rightWidth || 150, anchors.baseY, true, rightHudBottom);
  }
}
