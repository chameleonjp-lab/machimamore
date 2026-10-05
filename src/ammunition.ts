import { CANNON_CAPACITY, MG_CAPACITY, RELOAD_TICKS } from './rules';
import type { MagazineState } from './flight-types';

/** Called once at the beginning of each active fixed tick, never by the view. */
export function tickAircraftReload(player: MagazineState): boolean {
  if (player.health <= 0 || player.reloadTicksRemaining <= 0) return false;
  player.reloadTicksRemaining -= 1;
  if (player.reloadTicksRemaining > 0) return false;
  player.mg = MG_CAPACITY;
  player.cannon = CANNON_CAPACITY;
  return true;
}
/** A shared reload starts only after both magazines have actually been emitted. */
export function beginAircraftReload(player: MagazineState): boolean {
  if (player.health <= 0 || player.reloadTicksRemaining > 0 || player.mg > 0 || player.cannon > 0) return false;
  player.reloadTicksRemaining = RELOAD_TICKS;
  return true;
}

/** Compatibility names for the original player reload integration. */
export const tickPlayerReload = tickAircraftReload;
export const beginPlayerReload = beginAircraftReload;
