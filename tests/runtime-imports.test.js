import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gameSource = readFileSync(new URL('../game.js', import.meta.url), 'utf8');

test('game runtime imports reward-context helpers from the dedicated module seam', () => {
  assert.match(gameSource, /import\s+\{\s*getRewardContextForWave\s*\}\s+from\s+'\.\/systems\/reward-context\.js';/);
  assert.doesNotMatch(gameSource, /import\s+\{[^}]*getRewardContextForWave[^}]*\}\s+from\s+'\.\/systems\/powers\.js';/s);
});

test('game runtime imports power select copy from the dedicated config module', () => {
  assert.match(gameSource, /import\s+\{\s*getPowerSelectConfig\s*\}\s+from\s+'\.\/systems\/power-select-config\.js';/);
});
