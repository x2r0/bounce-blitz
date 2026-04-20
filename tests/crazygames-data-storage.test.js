import test from 'node:test';
import assert from 'node:assert/strict';

import { loadMeta, saveMeta } from '../systems/meta.js';
import { loadHighScore, saveHighScore } from '../systems/save.js';
import {
  META_KEY,
  HIGH_SCORE_KEY,
  SETTINGS_KEY,
  installCrazyGamesDataStorage,
  migrateLocalStorageToCrazyGamesData,
  resetStorageBackend,
} from '../systems/storage.js';

function makeStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    _dump() {
      return store;
    },
  };
}

test.beforeEach(() => {
  resetStorageBackend();
  globalThis.localStorage = makeStorage();
});

test.afterEach(() => {
  resetStorageBackend();
});

test('CrazyGames data migration copies existing local save keys once', () => {
  globalThis.localStorage.setItem(META_KEY, JSON.stringify({ shards: 42, unlocks: [1, 2] }));
  globalThis.localStorage.setItem(HIGH_SCORE_KEY, '1337');
  globalThis.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ muted: true }));

  const cgData = makeStorage();
  assert.equal(installCrazyGamesDataStorage(cgData), true);
  assert.equal(migrateLocalStorageToCrazyGamesData(), 3);
  assert.equal(migrateLocalStorageToCrazyGamesData(), 0);

  assert.deepEqual(JSON.parse(cgData.getItem(META_KEY)), { shards: 42, unlocks: [1, 2] });
  assert.equal(cgData.getItem(HIGH_SCORE_KEY), '1337');
  assert.deepEqual(JSON.parse(cgData.getItem(SETTINGS_KEY)), { muted: true });
});

test('meta and score reads/writes use the CrazyGames data backend once installed', () => {
  globalThis.localStorage.setItem(META_KEY, JSON.stringify({ shards: 2 }));
  globalThis.localStorage.setItem(HIGH_SCORE_KEY, '9');

  const cgData = makeStorage();
  cgData.setItem(META_KEY, JSON.stringify({ shards: 77, unlocks: [4] }));
  cgData.setItem(HIGH_SCORE_KEY, '2468');
  installCrazyGamesDataStorage(cgData);

  const meta = loadMeta();
  assert.equal(meta.shards, 77);
  assert.ok(meta.unlocks.includes(4));
  assert.equal(loadHighScore(), 2468);

  saveHighScore(9999);
  saveMeta({ ...meta, shards: 88 });

  assert.equal(cgData.getItem(HIGH_SCORE_KEY), '9999');
  assert.equal(JSON.parse(cgData.getItem(META_KEY)).shards, 88);
  assert.equal(globalThis.localStorage.getItem(HIGH_SCORE_KEY), '9');
  assert.equal(JSON.parse(globalThis.localStorage.getItem(META_KEY)).shards, 2);
});
