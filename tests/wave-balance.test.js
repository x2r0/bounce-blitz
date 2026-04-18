import test from 'node:test';
import assert from 'node:assert/strict';

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
  };
}

globalThis.localStorage = makeStorage();

function makeContext() {
  return {
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    save() {},
    restore() {},
    fillText() {},
  };
}

function makeCanvas() {
  return {
    width: 0,
    height: 0,
    style: {},
    getContext() {
      return makeContext();
    },
  };
}

globalThis.window = {
  innerWidth: 800,
  innerHeight: 600,
  addEventListener() {},
};

globalThis.document = {
  getElementById() {
    return makeCanvas();
  },
  createElement() {
    return makeCanvas();
  },
};

const { getEnemyCap, getStoryWavePlanEntry } = await import('../systems/wave.js');

test('late-story mastery waves keep higher concurrent pressure after capstone rebalance', () => {
  assert.equal(getEnemyCap(24), 14);
  assert.equal(getEnemyCap(25), 14);
  assert.equal(getEnemyCap(27), 14);
  assert.equal(getEnemyCap(29), 14);
});

test('final pre-boss authored pauses are tightened to keep act three pressure up', () => {
  assert.equal(getStoryWavePlanEntry(24).burstProfile.pause, 2.2);
  assert.equal(getStoryWavePlanEntry(29).burstProfile.pause, 2.0);
});
