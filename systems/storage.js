'use strict';

export const META_KEY = 'bounceblitz_meta';
export const HIGH_SCORE_KEY = 'bounceblitz_highscore';
export const HARDCORE_HIGH_SCORE_KEY = 'bounceblitz_hardcore_highscore';
export const RUN_SAVE_KEY = 'bounceblitz_savedrun';
export const SETTINGS_KEY = 'bounceblitz_settings';
export const DASH_TOOLTIP_STORAGE_KEY = 'bounceblitz_dash_tooltip_seen';

const CRAZYGAMES_MIGRATION_KEY = 'bounceblitz_crazygames_migrated_v1';

const PERSISTED_KEYS = [
  META_KEY,
  HIGH_SCORE_KEY,
  HARDCORE_HIGH_SCORE_KEY,
  RUN_SAVE_KEY,
  SETTINGS_KEY,
  DASH_TOOLTIP_STORAGE_KEY,
];

let forcedStorage = null;

function getBrowserStorage() {
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  return null;
}

function getActiveStorage() {
  return forcedStorage || getBrowserStorage();
}

function safeGet(storage, key) {
  if (!storage?.getItem) return null;
  try {
    const value = storage.getItem(key);
    return value == null ? null : value;
  } catch {
    return null;
  }
}

function safeSet(storage, key, value) {
  if (!storage?.setItem) return false;
  try {
    storage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function safeRemove(storage, key) {
  if (!storage?.removeItem) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function getStorageItem(key) {
  return safeGet(getActiveStorage(), key);
}

export function setStorageItem(key, value) {
  return safeSet(getActiveStorage(), key, value);
}

export function removeStorageItem(key) {
  return safeRemove(getActiveStorage(), key);
}

export function installCrazyGamesDataStorage(storageLike) {
  if (!storageLike?.getItem || !storageLike?.setItem || !storageLike?.removeItem) return false;
  forcedStorage = storageLike;
  return true;
}

export function resetStorageBackend() {
  forcedStorage = null;
}

export function isUsingCrazyGamesDataStorage() {
  return !!forcedStorage;
}

export function migrateLocalStorageToCrazyGamesData() {
  const active = getActiveStorage();
  const local = getBrowserStorage();
  if (!forcedStorage || !active || !local || active === local) return 0;
  if (safeGet(active, CRAZYGAMES_MIGRATION_KEY) === '1') return 0;

  let copied = 0;
  for (const key of PERSISTED_KEYS) {
    const targetValue = safeGet(active, key);
    const localValue = safeGet(local, key);
    if (targetValue == null && localValue != null && safeSet(active, key, localValue)) {
      copied++;
    }
  }
  safeSet(active, CRAZYGAMES_MIGRATION_KEY, '1');
  return copied;
}
