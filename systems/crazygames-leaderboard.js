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
