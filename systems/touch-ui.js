'use strict';

import { STATE } from '../config.js';
import { G } from '../state.js';

let root = null;
let leftBase = null;
let leftThumb = null;
let rightBase = null;
let rightThumb = null;
let pauseBtn = null;
let leftHint = null;
let rightHint = null;
let pauseHandler = null;

export function isTouchUILayout() {
  if (typeof window === 'undefined') return false;
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
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
    .bb-stick {
      position: absolute;
      width: 132px;
      height: 132px;
      margin-left: -66px;
      margin-top: -66px;
      opacity: 0;
      transition: opacity 100ms ease-out;
    }
    .bb-stick.is-visible {
      opacity: 1;
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
      bottom: calc(16px + env(safe-area-inset-bottom, 0px));
      min-width: 148px;
      max-width: 220px;
      padding: 10px 14px;
      border-radius: 14px;
      background: rgba(7, 12, 22, 0.82);
      border: 1px solid rgba(255,255,255,0.08);
      backdrop-filter: blur(4px);
      opacity: 0;
      transition: opacity 140ms ease-out;
    }
    .bb-touch-hint.is-visible {
      opacity: 1;
    }
    .bb-touch-hint h4 {
      margin: 0 0 4px;
      font: 700 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .bb-touch-hint p {
      margin: 0;
      font: 500 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #d9e8f8;
    }
    #bb-touch-left-hint { left: 14px; }
    #bb-touch-left-hint h4 { color: #78f3ff; }
    #bb-touch-right-hint { right: 14px; text-align: right; }
    #bb-touch-right-hint h4 { color: #ffd966; }
    #bb-touch-pause {
      position: absolute;
      top: calc(12px + env(safe-area-inset-top, 0px));
      right: calc(12px + env(safe-area-inset-right, 0px));
      width: 58px;
      height: 58px;
      border-radius: 18px;
      border: 1px solid rgba(140, 210, 255, 0.28);
      background: rgba(7, 12, 22, 0.88);
      color: #eef6ff;
      display: none;
      align-items: center;
      justify-content: center;
      font: 700 24px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      backdrop-filter: blur(6px);
      pointer-events: auto;
      box-shadow: 0 10px 30px rgba(0,0,0,0.18);
    }
    #bb-touch-pause.is-visible {
      display: flex;
    }
  `;
  document.head.appendChild(style);

  root = document.createElement('div');
  root.id = 'bb-touch-ui';
  root.innerHTML = `
    <div id="bb-touch-left" class="bb-stick">
      <div class="bb-stick-base"></div>
      <div class="bb-stick-thumb"></div>
    </div>
    <div id="bb-touch-right" class="bb-stick">
      <div class="bb-stick-base"></div>
      <div class="bb-stick-thumb"></div>
    </div>
    <button id="bb-touch-pause" aria-label="Pause game">||</button>
    <div id="bb-touch-left-hint" class="bb-touch-hint">
      <h4>Move</h4>
      <p>Left thumb joystick</p>
    </div>
    <div id="bb-touch-right-hint" class="bb-touch-hint">
      <h4>Charge Dash</h4>
      <p>Press, aim, release</p>
    </div>
  `;

  document.body.appendChild(root);

  leftBase = root.querySelector('#bb-touch-left');
  leftThumb = leftBase?.querySelector('.bb-stick-thumb') || null;
  rightBase = root.querySelector('#bb-touch-right');
  rightThumb = rightBase?.querySelector('.bb-stick-thumb') || null;
  pauseBtn = root.querySelector('#bb-touch-pause');
  leftHint = root.querySelector('#bb-touch-left-hint');
  rightHint = root.querySelector('#bb-touch-right-hint');

  const handlePause = (e) => {
    e.preventDefault();
    e.stopPropagation();
    pauseHandler?.();
  };
  pauseBtn?.addEventListener('click', handlePause);
  pauseBtn?.addEventListener('touchstart', handlePause, { passive: false });
}

function setStickVisual(container, thumb, stick) {
  if (!container || !thumb) return;
  if (!stick?.active) {
    container.classList.remove('is-visible');
    return;
  }
  container.classList.add('is-visible');
  container.style.left = `${stick.cx}px`;
  container.style.top = `${stick.cy}px`;
  thumb.style.transform = `translate(${stick.dx}px, ${stick.dy}px)`;
}

export function bindTouchPauseButton(handler) {
  ensureTouchUI();
  pauseHandler = handler;
}

export function syncTouchOverlay() {
  ensureTouchUI();
  if (!root) return;

  const inGameplay =
    G.state === STATE.PLAYING ||
    G.state === STATE.WAVE_BREAK ||
    G.state === STATE.BOSS_FIGHT;

  root.style.display = isTouchUILayout() ? 'block' : 'none';
  if (!isTouchUILayout()) return;

  setStickVisual(leftBase, leftThumb, G.joystick);
  setStickVisual(rightBase, rightThumb, G.dashStick);

  if (pauseBtn) {
    pauseBtn.classList.toggle('is-visible', inGameplay);
  }

  const showHints = inGameplay && (!G.tutorialDismissed || G.wave <= 2 || G.elapsedTime < 20);
  leftHint?.classList.toggle('is-visible', showHints);
  rightHint?.classList.toggle('is-visible', showHints);
}
