import { Vector3 } from 'three';
import { LASER_COOLDOWN_TICKS, LASER_INTERVAL_TICKS, LASER_LIFETIME_TICKS, LASER_MAX_BURST, LASER_WARNING_TICKS } from './rules';
import type { EntityRef, LaserAttack, LaserBeam, Ufo } from './types';
export function createLaserAttack(): LaserAttack {
  return { phase: 'idle', start: new Vector3(), aimPoint: new Vector3(), target: null, warningTick: -1, firstFireTick: -1, nextFireTick: -1, fired: 0, lastExpireTick: -1, holdUntilTick: 0, cooldownUntilTick: 0 };
}
export function beginLaserWarning(attack: LaserAttack, tick: number, start: Vector3, point: Vector3, target: EntityRef): boolean {
  if (tick < attack.cooldownUntilTick || tick < attack.holdUntilTick || attack.phase === 'warning' || attack.phase === 'burst') return false;
  attack.phase = 'warning'; attack.start.copy(start); attack.aimPoint.copy(point); attack.target = { ...target };
  attack.warningTick = tick; attack.firstFireTick = tick + LASER_WARNING_TICKS; attack.nextFireTick = attack.firstFireTick; attack.fired = 0;
  attack.holdUntilTick = attack.firstFireTick + LASER_INTERVAL_TICKS * (LASER_MAX_BURST - 1) + LASER_LIFETIME_TICKS;
  return true;
}
export function cancelLaserBurst(attack: LaserAttack, tick: number): void {
  attack.phase = 'cooldown';
  attack.holdUntilTick = attack.fired ? attack.lastExpireTick : tick;
  attack.cooldownUntilTick = attack.holdUntilTick + LASER_COOLDOWN_TICKS;
}
/** A refused allocation never consumes a burst shot. */
export function advanceLaserAttack(ufo: Ufo, tick: number, targetValid: boolean, allocate: (beam: Omit<LaserBeam, 'id' | 'missionId'>) => boolean): boolean {
  const attack = ufo.attack;
  if (attack.phase === 'cooldown' && tick >= attack.cooldownUntilTick) attack.phase = 'idle';
  if (attack.phase !== 'warning' && attack.phase !== 'burst') return false;
  if (!targetValid) { cancelLaserBurst(attack, tick); return false; }
  if (tick < attack.nextFireTick) return false;
  const beam = { owner: ufo.id, ownerToken: ufo.token, ownerGeneration: ufo.generation,
    start: attack.start.clone(), aimPoint: attack.aimPoint.clone(), end: attack.aimPoint.clone(), birthTick: tick, expiresTick: tick + LASER_LIFETIME_TICKS,
    lastIntegratedTick: tick - 1, actualTarget: null, actualDamage: 0 };
  if (!allocate(beam)) return false;
  attack.fired++; attack.lastExpireTick = beam.expiresTick; attack.nextFireTick = tick + LASER_INTERVAL_TICKS;
  attack.phase = 'burst';
  if (attack.fired >= LASER_MAX_BURST) cancelLaserBurst(attack, tick);
  return true;
}
