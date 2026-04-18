'use strict';

import { W, H, STATE } from '../config.js';

const TRANSITION_LORE = {
  boss_approach: {
    hive_queen: [
      ['The brood gate seals ahead.', 'The hive is already awake.'],
      ['The courier steadies at the threshold.', 'The swarm is already moving.'],
    ],
    nexus_core: [
      ['The processor gate hums ahead.', 'The core behind it is already active.'],
      ['The chamber narrows to a single line.', 'The system ahead is already watching.'],
    ],
    void_warden: [
      ['The last gate opens into black glass.', 'Something immense is holding the core.'],
      ['The chamber goes quiet before the final gate.', 'The void is waiting at the center.'],
    ],
  },
  chapter_return: {
    hive_queen: [
      ['The brood gate collapses behind you.', 'A cleaner path opens ahead.'],
      ['The swarm breaks.', 'The relay opens a path deeper in.'],
    ],
    nexus_core: [
      ['The processor fades behind you.', 'A calmer signal pulls you onward.'],
      ['The aftershock settles.', 'The next sector lights up ahead.'],
    ],
  },
  epilogue: {
    void_warden: [
      ['The chamber stops shaking at last.', 'The core is still there.'],
      ['The last ward falls away.', 'The signal still holds.'],
    ],
  },
};

export const TRANSITION_REWARD_COPY = {
  shield: 'Shield the shell against the next sector.',
  magnet: 'Draw the field tighter around the courier.',
  surge: 'Sharpen the drift into a faster line.',
  multipop: 'Turn breakpoints into chain collapse.',
  chainLightning: 'Arc pressure through clustered constructs.',
  timeWarp: 'Stretch danger into readable motion.',
  dashBurst: 'Punch harder through crowded lanes.',
  shellGuard: 'Orbit a defensive shell around the core.',
  lifeSteal: 'Recover on clean impact.',
  staminaOverflow: 'Carry a deeper reserve into the grid.',
  overdrive: 'Spike tempo when the run is on fire.',
  soulHarvest: 'Leave a harvest trail through pressure.',
  gravityBomb: 'Collapse space around a problem point.',
  thunderDash: 'Turn the dash line into thunder.',
  reflectiveShield: 'Reflect pressure back into the loop.',
  novaCore: 'Build a larger orbiting shell.',
};

const TRANSITION_ROUTE_WHISPERS = {
  boss_approach: {
    steady: 'Patch the shell and take the safer line.',
    risk: 'Take the bonus, then survive the gate.',
  },
  chapter_return: {
    signal_cache: 'Bank the shards and move on.',
    evolution: 'Take the finished form into the next act.',
  },
};

export const EPILOGUE_REVEAL_LINES = [
  'The core was never dark.',
  'It was buried under a defense that forgot what it was guarding.',
  'The Void Warden falls. The signal holds.',
  'The grid remembers.',
  'When it calls again, the line will open.',
];

export const TRANSITION_REWARD_TAGS = {
  shield: ['Block Hit', 'Safe Route'],
  magnet: ['Pickup Pull', 'Control'],
  surge: ['Faster Drift', 'Tempo'],
  multipop: ['Chain Burst', 'Clear'],
  chainLightning: ['Arc Damage', 'Crowd'],
  timeWarp: ['Slow Field', 'Control'],
  dashBurst: ['Dash Impact', 'Aggro'],
  shellGuard: ['Orbit Shield', 'Safe Route'],
  lifeSteal: ['On-Hit Heal', 'Sustain'],
  staminaOverflow: ['Deep Reserve', 'Endurance'],
  overdrive: ['Speed Spike', 'Aggro'],
  soulHarvest: ['Harvest Heal', 'Sustain'],
  gravityBomb: ['Pull Field', 'Control'],
  thunderDash: ['Shock Trail', 'Aggro'],
  reflectiveShield: ['Reflect Hit', 'Safe Route'],
  novaCore: ['Large Orbit', 'Fortress'],
};

function defaultTrimText(text, maxChars) {
  if (!text || text.length <= maxChars) return text || '';
  return text.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}

export function getActLabel(index) {
  const numerals = ['I', 'II', 'III', 'IV', 'V'];
  return 'Act ' + (numerals[index] || String(index + 1));
}

export function getTransitionLoreLines(mode, bossType, seed) {
  const pool = TRANSITION_LORE[mode]?.[bossType] || [['The relay opens one more path.', 'Then asks you to move again.']];
  return pool[(seed || 0) % pool.length];
}

export function getEpilogueRevealDuration(text, isLast = false) {
  const base = Math.max(2.1, Math.min(4.2, 1.4 + String(text || '').length * 0.028));
  return isLast ? base + 0.8 : base;
}

export function buildTransitionRouteNodes(mode, actIndex, bossName) {
  const currentLabel = getActLabel(Math.max(0, actIndex));
  const nextLabel = mode === 'epilogue' ? 'Relay' : getActLabel(Math.min(3, actIndex + 1));
  return [
    { x: 470, y: 214, label: currentLabel, state: mode === 'boss_approach' ? 'active' : 'cleared', kind: 'act' },
    { x: 596, y: 166, label: bossName || 'Gate', state: mode === 'chapter_return' || mode === 'epilogue' ? 'broken' : 'threat', kind: 'boss' },
    { x: 712, y: 228, label: nextLabel, state: mode === 'boss_approach' ? 'dim' : 'lit', kind: mode === 'epilogue' ? 'relay' : 'act' },
  ];
}

export function buildBossApproachOptions(bossWave) {
  const shardBonus = bossWave === 30 ? 40 : 20;
  return [
    {
      id: 'steady',
      routeLabel: 'Steady Route',
      title: 'Seal the shell',
      accent: '#72e2ff',
      summary: ['Recover 1 HP and refill stamina.', 'Start the boss fight stable and ready.'],
    },
    {
      id: 'risk',
      routeLabel: 'Risk Route',
      title: 'Cut the shortest line',
      accent: '#ff9b7c',
      summary: [`Boss payout: +${shardBonus} shards.`, 'Carry +10% score into the boss.'],
      shardBonus,
      scoreBonus: 0.10,
    },
  ];
}

export function buildTransitionRewardOptions({
  bossType,
  playerSigils = [],
  bossSigilDefs = {},
  offeringCard = null,
  pendingEvolution = null,
  rewardCopyByPowerId = TRANSITION_REWARD_COPY,
  trimText = defaultTrimText,
}) {
  const sigilDef = bossSigilDefs[bossType];
  const options = [];

  if (sigilDef && !playerSigils.includes(sigilDef.id)) {
    options.push({
      id: 'sigil:' + sigilDef.id,
      kind: 'sigil',
      sigilId: sigilDef.id,
      routeLabel: sigilDef.routeLabel,
      title: sigilDef.title,
      accent: sigilDef.accent,
      summary: sigilDef.summary,
      chips: sigilDef.chips,
    });
  }

  if (offeringCard) {
    options.push({
      id: 'power:' + (offeringCard.powerId || 'path'),
      kind: 'power',
      card: offeringCard,
      routeLabel: 'Power Path',
      title: offeringCard.name,
      accent: offeringCard.isEvolution ? '#ffd86f' : (offeringCard.rarity === 'epic' ? '#d68cff' : '#8dd8ff'),
      summary: [
        rewardCopyByPowerId[offeringCard.powerId]
          || trimText(offeringCard.desc || 'Carry a stronger line into the next act.', 54),
        offeringCard.isEvolution || pendingEvolution
          ? 'Take the finished form into the next act.'
          : 'Lock a stronger path into the build.',
      ],
    });
  } else {
    options.push({
      id: 'signal_cache:boss',
      kind: 'signal_cache',
      routeLabel: 'Power Path',
      title: 'Signal Cache',
      accent: '#ffd86f',
      shardBonus: 30,
      summary: ['No clean power path surfaced here.', 'Bank +30 shards instead.'],
    });
  }

  if (options.length < 2) {
    options.push({
      id: 'signal_cache:fallback',
      kind: 'signal_cache',
      routeLabel: 'Power Path',
      title: 'Signal Cache',
      accent: '#ffd86f',
      shardBonus: 30,
      summary: ['No clean power path surfaced here.', 'Bank +30 shards instead.'],
    });
  }

  return options.slice(0, 2);
}

export function getTransitionRouteWhisper(mode, option, rewardCopyByPowerId = TRANSITION_REWARD_COPY) {
  if (!option) return '';
  if (mode === 'boss_approach') {
    return TRANSITION_ROUTE_WHISPERS.boss_approach[option.id] || '';
  }
  if (mode === 'chapter_return') {
    if (option.kind === 'sigil') {
      return option.sigilId === 'broodbreaker'
        ? 'Take the broodbreaker mark into the next act.'
        : 'Let each fifth dash answer with a chain strike.';
    }
    if (option.kind === 'signal_cache') return TRANSITION_ROUTE_WHISPERS.chapter_return.signal_cache;
    if (option.card?.isEvolution) return TRANSITION_ROUTE_WHISPERS.chapter_return.evolution;
    if (option.card?.powerId) {
      const summary = rewardCopyByPowerId[option.card.powerId];
      if (summary) return summary;
    }
  }
  return option.summary?.[0] || '';
}

export function getTransitionOptionChips(mode, option, rewardTagsByPowerId = TRANSITION_REWARD_TAGS) {
  if (!option) return [];
  if (mode === 'boss_approach') {
    return option.id === 'steady'
      ? ['+1 HP', 'Full Stamina']
      : [`+${option.shardBonus || 20} Shards`, 'Score +10%'];
  }
  if (option.kind === 'sigil') {
    return option.chips || ['Boss Sigil'];
  }
  if (option.kind === 'signal_cache') {
    return [`+${option.shardBonus || 30} Shards`, 'Immediate'];
  }
  if (option.card?.isEvolution) {
    return ['Power Path', 'Evolution'];
  }
  if (option.card?.powerId) {
    return rewardTagsByPowerId[option.card.powerId] || ['Power Gain', 'Route Gain'];
  }
  return [];
}

export function createTransitionRoom({ mode, bossWave, bossType, bossName, totalRuns = 0, options = null }) {
  const actIndex = Math.max(0, Math.floor(bossWave / 10) - 1);
  const loreLines = getTransitionLoreLines(mode, bossType, totalRuns + bossWave);
  const title = mode === 'boss_approach'
    ? 'BOSS GATE'
    : mode === 'chapter_return'
      ? 'RETURN CHAMBER'
      : 'THE LIGHT HOLDS';
  const subtitle = mode === 'boss_approach'
    ? (bossName || 'Unknown boss')
    : mode === 'chapter_return'
      ? 'The relay opens the next path.'
      : 'The signal still remembers your line.';
  const roomAccent = mode === 'boss_approach'
    ? '#ff9b7c'
    : mode === 'chapter_return'
      ? '#7ce3ff'
      : '#ffd86f';
  const arrivalLine = loreLines[0] || subtitle;
  const followLine = loreLines[1] || '';
  const continueLabel = mode === 'boss_approach'
    ? 'Open the gate'
    : mode === 'chapter_return'
      ? 'Step into the next act'
      : 'Return to the relay';
  const resolvedOptions = options || (mode === 'boss_approach' ? buildBossApproachOptions(bossWave) : []);
  const gates = resolvedOptions.map((option, index) => ({
    x: index === 0 ? W * 0.29 : W * 0.71,
    y: mode === 'boss_approach'
      ? (index === 0 ? H * 0.50 : H * 0.38)
      : (index === 0 ? H * 0.47 : H * 0.35),
    r: 30,
    commitRadius: 48,
    optionIndex: index,
    accent: option.accent || '#7ce3ff',
  }));
  const exitGate = mode === 'epilogue'
    ? { x: W * 0.5, y: H * 0.23, r: 34, commitRadius: 52, accent: '#ffd86f' }
    : null;

  return {
    mode,
    bossWave,
    bossType,
    actIndex,
    nextWave: bossWave + (mode === 'chapter_return' ? 1 : 0),
    title,
    subtitle,
    arrivalLine,
    followLine,
    loreLines,
    musicCue: mode,
    routeNodes: buildTransitionRouteNodes(mode, actIndex, bossName),
    options: resolvedOptions,
    gates,
    exitGate,
    spawn: { x: W * 0.5, y: H * 0.78 },
    seal: { x: W * 0.5, y: H * 0.92 },
    bossGate: mode === 'boss_approach' ? { x: W * 0.5, y: H * 0.17 } : null,
    cursor: 0,
    hoverIndex: -1,
    selectedIndex: -1,
    continueLabel,
    continueWhisper: mode === 'epilogue' ? 'The relay holds. Step out of the chamber.' : '',
    preludeActive: true,
    preludeTimer: 0,
    preludeReady: false,
    preludeAdvanceDelay: 1.15,
    outroActive: false,
    outroTimer: 0,
    outroDuration: 0.72,
    outroResolved: false,
    outroLineIndex: 0,
    outroLineDuration: 0,
    controlDelay: 0.22,
    commitLine: '',
    commitColor: roomAccent,
    returnTarget: mode === 'epilogue' ? STATE.RUN_SUMMARY : (mode === 'boss_approach' ? STATE.BOSS_INTRO_CARD : STATE.WAVE_BREAK),
  };
}
