import test from 'node:test';
import assert from 'node:assert/strict';

import { stepDashChargeState } from '../systems/dash-charge-state.js';

function makePlayer(overrides = {}) {
  return {
    dashCharging: true,
    dashChargeTime: 0,
    dashChargeStaminaDrained: 0,
    dashChargeExhausted: false,
    stamina: 10,
    ...overrides,
  };
}

test('dash charge stops accumulating once stamina is exhausted instead of auto-releasing', () => {
  const player = makePlayer({ stamina: 5 });

  const exhausted = stepDashChargeState(player, 1, 10);

  assert.equal(exhausted, true);
  assert.equal(player.dashCharging, true);
  assert.equal(player.dashChargeExhausted, true);
  assert.equal(player.stamina, 0);
  assert.equal(player.dashChargeTime, 0.5);
  assert.equal(player.dashChargeStaminaDrained, 5);
});

test('exhausted dash charge holds its stored power on later frames until release', () => {
  const player = makePlayer({
    stamina: 0,
    dashChargeTime: 0.5,
    dashChargeStaminaDrained: 5,
    dashChargeExhausted: true,
  });

  const exhausted = stepDashChargeState(player, 0.25, 10);

  assert.equal(exhausted, false);
  assert.equal(player.dashChargeTime, 0.5);
  assert.equal(player.dashChargeStaminaDrained, 5);
  assert.equal(player.stamina, 0);
});
