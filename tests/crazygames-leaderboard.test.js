import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import {
  CRAZYGAMES_LEADERBOARD_CONFIG,
  encryptCrazyGamesLeaderboardScore,
  submitCrazyGamesLeaderboardScore,
} from '../systems/crazygames-leaderboard.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

function decodeBase64ToBytes(base64) {
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

async function decryptScore(encoded, encryptionKey = CRAZYGAMES_LEADERBOARD_CONFIG.encryptionKey) {
  const packed = decodeBase64ToBytes(encoded);
  const iv = packed.subarray(0, 12);
  const ciphertext = packed.subarray(12);
  const keyData = decodeBase64ToBytes(encryptionKey);
  const key = await globalThis.crypto.subtle.importKey('raw', keyData, 'AES-GCM', false, ['decrypt']);
  const decrypted = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return Number(new TextDecoder().decode(decrypted));
}

test('CrazyGames leaderboard score encryption decrypts back to the original score', async () => {
  const encrypted = await encryptCrazyGamesLeaderboardScore(123456);
  assert.ok(typeof encrypted === 'string' && encrypted.length > 20);
  assert.equal(await decryptScore(encrypted), 123456);
});

test('CrazyGames leaderboard encryption uses a fresh IV for each payload', async () => {
  const a = await encryptCrazyGamesLeaderboardScore(777);
  const b = await encryptCrazyGamesLeaderboardScore(777);
  assert.notEqual(a, b);
  assert.equal(await decryptScore(a), 777);
  assert.equal(await decryptScore(b), 777);
});

test('CrazyGames leaderboard submit hands encryptedScore to the SDK user module', async () => {
  let seenPayload = null;
  const sdk = {
    user: {
      submitScore(payload) {
        seenPayload = payload;
        return true;
      },
    },
  };

  const submitted = await submitCrazyGamesLeaderboardScore(sdk, 4242);
  assert.equal(submitted, true);
  assert.ok(seenPayload?.encryptedScore);
  assert.equal(await decryptScore(seenPayload.encryptedScore), 4242);
});

test('CrazyGames leaderboard submit skips unsupported SDKs and zero scores', async () => {
  assert.equal(await submitCrazyGamesLeaderboardScore(null, 500), false);
  assert.equal(await submitCrazyGamesLeaderboardScore({ user: { submitScore() {} } }, 0), false);
});
