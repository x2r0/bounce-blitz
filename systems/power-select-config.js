'use strict';

export function getPowerSelectConfig(context) {
  if (context === 'start_common_choice') {
    return {
      title: 'CHOOSE A STARTING POWER',
      hint: 'Choose 1 of 3 Common powers',
    };
  }
  if (context === 'start_arsenal_choice') {
    return {
      title: 'CHOOSE A STARTING POWER',
      hint: 'Choose 1 of 3 Common or Rare powers',
    };
  }
  if (context === 'milestone') {
    return {
      title: 'CHOOSE A POWER',
      hint: 'Milestone draft · rarer rewards can surface here',
    };
  }
  return {
    title: 'CHOOSE A POWER',
    hint: 'Choose the next line for this run',
  };
}
