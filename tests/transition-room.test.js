import test from 'node:test';
import assert from 'node:assert/strict';

import { STATE } from '../config.js';
import {
  EPILOGUE_REVEAL_LINES,
  buildBossApproachOptions,
  buildTransitionRewardOptions,
  buildTransitionRouteNodes,
  createTransitionRoom,
  getActLabel,
  getEpilogueRevealDuration,
  getTransitionOptionChips,
  getTransitionRouteWhisper,
} from '../systems/transition-room.js';

const bossSigilDefs = {
  hive_queen: {
    id: 'broodbreaker',
    routeLabel: 'Boss Sigil',
    title: 'Broodbreaker Sigil',
    accent: '#ffb26f',
    summary: ['The first 3 minion kills each wave refund stamina.', 'Those kills also burst nearby pressure apart.'],
    chips: ['+12 STA', 'Minion Burst'],
  },
};

test('act labels and route nodes stay deterministic', () => {
  assert.equal(getActLabel(0), 'Act I');
  assert.equal(getActLabel(3), 'Act IV');
  const nodes = buildTransitionRouteNodes('epilogue', 2, 'Void Warden');
  assert.equal(nodes[0].label, 'Act III');
  assert.equal(nodes[1].label, 'Void Warden');
  assert.equal(nodes[2].label, 'Relay');
});

test('boss approach options keep the intended steady vs risk tradeoff', () => {
  const early = buildBossApproachOptions(10);
  const final = buildBossApproachOptions(30);
  assert.equal(early[0].id, 'steady');
  assert.equal(early[1].id, 'risk');
  assert.equal(early[1].shardBonus, 20);
  assert.equal(final[1].shardBonus, 40);
});

test('boss return options prefer sigil plus power path when available', () => {
  const options = buildTransitionRewardOptions({
    bossType: 'hive_queen',
    playerSigils: [],
    bossSigilDefs,
    offeringCard: {
      powerId: 'dashBurst',
      name: 'Dash Burst',
      rarity: 'common',
      desc: 'Hit harder while dashing.',
      isEvolution: false,
    },
  });
  assert.equal(options.length, 2);
  assert.equal(options[0].kind, 'sigil');
  assert.equal(options[1].kind, 'power');
  assert.deepEqual(getTransitionOptionChips('chapter_return', options[0]), ['+12 STA', 'Minion Burst']);
});

test('boss return falls back to signal cache when no clean power path exists', () => {
  const options = buildTransitionRewardOptions({
    bossType: 'hive_queen',
    playerSigils: ['broodbreaker'],
    bossSigilDefs,
    offeringCard: null,
  });
  assert.equal(options.length, 2);
  assert.equal(options[0].kind, 'signal_cache');
  assert.equal(options[1].kind, 'signal_cache');
  assert.equal(getTransitionRouteWhisper('chapter_return', options[0]), 'Bank the shards and move on.');
});

test('transition room builder keeps chapter and epilogue rooms consistent', () => {
  const room = createTransitionRoom({
    mode: 'chapter_return',
    bossWave: 20,
    bossType: 'nexus_core',
    bossName: 'Nexus Core',
    totalRuns: 7,
    options: [{
      id: 'power:dashBurst',
      kind: 'power',
      routeLabel: 'Power Path',
      title: 'Dash Burst',
      accent: '#8dd8ff',
      summary: ['Punch harder through crowded lanes.', 'Lock a stronger path into the build.'],
      card: { powerId: 'dashBurst', isEvolution: false },
    }],
  });
  assert.equal(room.title, 'RETURN CHAMBER');
  assert.equal(room.subtitle, 'The relay opens the next path.');
  assert.equal(room.routeNodes[1].label, 'Nexus Core');
  assert.equal(room.returnTarget, STATE.WAVE_BREAK);
  assert.equal(room.gates.length, 1);
});

test('epilogue reveal timing gives the last line more space', () => {
  const first = getEpilogueRevealDuration(EPILOGUE_REVEAL_LINES[0], false);
  const last = getEpilogueRevealDuration(EPILOGUE_REVEAL_LINES.at(-1), true);
  assert.ok(last > first);
});
