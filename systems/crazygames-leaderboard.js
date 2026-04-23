'use strict';

export const CRAZYGAMES_LEADERBOARD_CONFIG = Object.freeze({
  // These settings should match the leaderboard configuration on CrazyGames.
  guide: 'Highest score in a single run',
  label: 'Score',
  metric: 'POINTS',
  sorting: 'DESC',
  minValue: 0,
  maxValue: 99999999,
  cooldownSeconds: 10,
  isIncremental: false,
  encryptionKey: 'hdxUStVoyPg0A1QpbJNLBcar9tA2LsZ3gCKqM0e0V3A=',
});

function ensureCrypto() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto API unavailable for CrazyGames leaderboard encryption');
  return subtle;
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(base64, 'base64'));
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptCrazyGamesLeaderboardScore(score, encryptionKey = CRAZYGAMES_LEADERBOARD_CONFIG.encryptionKey) {
  const subtle = ensureCrypto();
  const normalizedScore = Math.max(0, Math.floor(Number(score) || 0));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const payload = new TextEncoder().encode(String(normalizedScore));
  const keyData = base64ToBytes(encryptionKey);
  const key = await subtle.importKey('raw', keyData, 'AES-GCM', false, ['encrypt']);
  const encrypted = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, payload));

  const packed = new Uint8Array(iv.length + encrypted.length);
  packed.set(iv, 0);
  packed.set(encrypted, iv.length);
  return bytesToBase64(packed);
}

export async function submitCrazyGamesLeaderboardScore(sdk, score, config = CRAZYGAMES_LEADERBOARD_CONFIG) {
  if (!sdk?.user?.submitScore) return false;
  const normalizedScore = Math.max(0, Math.floor(Number(score) || 0));
  if (normalizedScore <= 0) return false;
  const encryptedScore = await encryptCrazyGamesLeaderboardScore(normalizedScore, config.encryptionKey);
  await Promise.resolve(sdk.user.submitScore({ encryptedScore }));
  return true;
}

/**
 * Fetch the top-N CrazyGames leaderboard entries and the current user's rank.
 *
 * The SDK's method surface for reading leaderboards has shifted a few times;
 * this helper feature-detects the most likely methods in priority order and
 * falls back gracefully. Never throws — returns an empty shape if the SDK is
 * unavailable or the call fails, so the UI can render a clean "unavailable"
 * state instead of crashing.
 *
 * Shape: { scores: [{ username, score, rank?, isSelf? }], userRank: number|null,
 *          userScore: number|null, username: string|null, error: string|null }
 */
export async function fetchCrazyGamesLeaderboard(sdk, opts = {}) {
  const out = { scores: [], userRank: null, userScore: null, username: null, error: null };
  if (!sdk?.user) { out.error = 'sdk-unavailable'; return out; }

  const top = Math.max(3, Math.min(50, opts.top ?? 10));
  let username = null;
  try {
    if (typeof sdk.user.getUser === 'function') {
      const user = await Promise.resolve(sdk.user.getUser());
      username = user?.username ?? user?.name ?? null;
    }
  } catch { /* ignore */ }
  out.username = username;

  // Top scores — try the documented SDK v3 signature, then a few fallbacks.
  try {
    let raw = null;
    if (typeof sdk.user.getUserScores === 'function') {
      raw = await Promise.resolve(sdk.user.getUserScores({ top }));
    } else if (typeof sdk.user.getScores === 'function') {
      raw = await Promise.resolve(sdk.user.getScores({ top }));
    } else if (typeof sdk.leaderboards?.getLeaderboard === 'function') {
      raw = await Promise.resolve(sdk.leaderboards.getLeaderboard({ top }));
    }
    if (raw) {
      // Normalize across the different response shapes the SDK has shipped.
      const list = Array.isArray(raw) ? raw
        : Array.isArray(raw.scores) ? raw.scores
        : Array.isArray(raw.entries) ? raw.entries
        : Array.isArray(raw.leaderboard) ? raw.leaderboard
        : [];
      out.scores = list.slice(0, top).map((entry, i) => ({
        rank: entry.rank ?? entry.position ?? (i + 1),
        username: entry.username ?? entry.name ?? entry.user ?? 'Anonymous',
        score: Number(entry.score ?? entry.value ?? 0) || 0,
        isSelf: (username && (entry.username === username || entry.name === username)) || !!entry.self,
      }));
    }
  } catch (e) {
    out.error = 'scores-fetch-failed';
    if (typeof console !== 'undefined') console.warn('[CrazyGames] leaderboard fetch failed:', e);
  }

  // User's own rank — best-effort, don't error if unavailable.
  try {
    if (typeof sdk.user.getUserRank === 'function') {
      const r = await Promise.resolve(sdk.user.getUserRank({}));
      out.userRank = Number(r?.rank ?? r) || null;
      if (r?.score != null) out.userScore = Number(r.score) || null;
    }
  } catch { /* ignore */ }

  // If the user's own entry is in the list but not flagged, tag it now.
  if (username && !out.scores.some(s => s.isSelf)) {
    const match = out.scores.find(s => s.username === username);
    if (match) match.isSelf = true;
  }

  return out;
}
