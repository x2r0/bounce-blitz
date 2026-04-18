import test from 'node:test';
import assert from 'node:assert/strict';

import { getPowerSelectConfig } from '../systems/power-select-config.js';

test('start-common choice config teaches the smaller draft clearly', () => {
  assert.deepEqual(getPowerSelectConfig('start_common_choice'), {
    title: 'CHOOSE A STARTING POWER',
    hint: 'Choose 1 of 3 Common powers',
  });
});

test('milestone config calls out richer progression timing', () => {
  assert.deepEqual(getPowerSelectConfig('milestone'), {
    title: 'CHOOSE A POWER',
    hint: 'Milestone draft · rarer rewards can surface here',
  });
});

test('default config stays generic for regular drafts', () => {
  assert.deepEqual(getPowerSelectConfig('standard'), {
    title: 'CHOOSE A POWER',
    hint: 'Choose the next line for this run',
  });
});
