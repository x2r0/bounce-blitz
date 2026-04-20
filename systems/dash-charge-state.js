'use strict';

export function stepDashChargeState(player, dt, drainRate) {
  if (!player?.dashCharging || dt <= 0) return false;
  if (player.dashChargeExhausted || player.stamina <= 0) {
    player.stamina = 0;
    player.dashChargeExhausted = true;
    return false;
  }

  if (drainRate <= 0) {
    player.dashChargeTime += dt;
    return false;
  }

  const timeUntilExhausted = player.stamina / drainRate;
  const activeDt = Math.max(0, Math.min(dt, timeUntilExhausted));
  const drainAmount = drainRate * activeDt;

  player.dashChargeTime += activeDt;
  player.stamina = Math.max(0, player.stamina - drainAmount);
  player.dashChargeStaminaDrained += drainAmount;

  if (activeDt < dt || player.stamina <= 0) {
    player.stamina = 0;
    player.dashChargeExhausted = true;
    return true;
  }

  return false;
}
