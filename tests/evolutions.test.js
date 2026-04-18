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

const powersModule = await import('../systems/powers.js');
const stateModule = await import('../state.js');

const { EVOLUTION_RECIPES, applyWaveStartPowers } = powersModule;
const { G, resetGameState } = stateModule;

function freshRun(powers) {
  G.meta.unlocks = [];
  G.meta.selectedLoadout = 'standard';
  resetGameState();
  G.player.powers = powers;
}

test('evolutions require top-level versions of both component powers', () => {
  for (const recipe of EVOLUTION_RECIPES) {
    assert.ok(recipe.requires.every(req => req.minLevel === 3), `${recipe.id} should require component level 3`);
  }
});

test('reflective shield preserves shield III and surge III baselines', () => {
  freshRun([{ id: 'reflectiveShield', level: 1, evolved: true }]);
  applyWaveStartPowers();
  assert.equal(G.player.shieldCharges, 3);
  assert.equal(G.player.surgeActive, true);
  assert.equal(G.player.surgeDriftMax, 450);
  assert.equal(G.player.surgeDashSpeed, 1700);
  assert.equal(G.player.surgeKillsRemaining, 16);
});

test('gravity bomb preserves magnet III and multipop III baselines', () => {
  freshRun([{ id: 'gravityBomb', level: 1, evolved: true }]);
  applyWaveStartPowers();
  assert.equal(G.player.magnetActive, true);
  assert.equal(G.player.magnetRadius, 220);
  assert.equal(G.player.magnetSpeed, 340);
  assert.equal(G.player.multiPopCharges, 8);
  assert.equal(G.player.multiPopRadius, 120);
});

test('thunder dash and nova core preserve their parent run-shaping baselines', () => {
  freshRun([
    { id: 'thunderDash', level: 1, evolved: true },
    { id: 'novaCore', level: 1, evolved: true },
  ]);
  applyWaveStartPowers();
  assert.equal(G.player.surgeActive, true);
  assert.equal(G.player.surgeDriftMax, 450);
  assert.equal(G.player.surgeDashSpeed, 1700);
  assert.equal(G.player.surgeKillsRemaining, 16);
  assert.equal(G.player.shellGuardOrbs.length, 4);
});
