/** Pre-start fixtures only. These are not evidence of legal-input mission wins. */
import { Vector3 } from 'three';
import { createGame } from '../src/simulation';
import type { Aircraft, Bullet, GameState, LaserBeam } from '../src/types';
export function fixture(friendlyCount = 1, enemyCount = 1, reserves = true): GameState {
  const state = createGame({ mode: 'normal', seed: 123 });
  state.fighters = state.fighters.slice(0, friendlyCount); state.ufos = state.ufos.slice(0, enemyCount);
  for (const team of ['friendly', 'enemy'] as const) {
    const roster = state.rosters[team], entities = team === 'friendly' ? state.fighters : state.ufos;
    roster.slots.fill(null);
    for (const token of roster.tokens) { token.status = reserves && token.id >= 8 ? 'reserve' : 'destroyed'; token.slot = null; }
    for (const e of entities) { roster.tokens[e.token].status = 'active'; roster.tokens[e.token].slot = e.slot; roster.slots[e.slot] = e.token; }
  }
  state.stats.allyLosses = state.rosters.friendly.tokens.filter(t => t.status === 'destroyed').length;
  for (const [i, f] of state.fighters.entries()) { f.position.set(i * 300, 250 + i * 100, 500 + i * 300); f.previous.copy(f.position); }
  for (const [i, u] of state.ufos.entries()) {
    u.position.set(1000 + i * 100, 400, -1500); u.previous.copy(u.position); u.velocity.set(0, 0, 0); u.speed = 0;
    u.movement = 'stationary'; u.movementUntilTick = 100000; u.attack.phase = 'cooldown'; u.attack.cooldownUntilTick = 100000;
  }
  state.nextAttackId = 10000;
  return state;
}
export function beam(state: GameState, id = 1, start = new Vector3(0, 250, 1000), aimPoint = new Vector3(0, 250, -1000)): LaserBeam {
  return { id, missionId: state.missionId, owner: 100, ownerToken: 0, ownerGeneration: 1, start, aimPoint, end: aimPoint.clone(), birthTick: 0, expiresTick: 60, lastIntegratedTick: -1, actualTarget: null, actualDamage: 0 };
}
export function bullet(state: GameState, position: Vector3, velocity: Vector3, damage = 20, playerOwned = true): Bullet {
  return { id: 100, missionId: state.missionId, owner: 0, ownerToken: 0, ownerGeneration: 1, playerOwned, team: 'friendly', kind: 'cannon', position, previous: position.clone(), velocity,
    birthTick: 0, expiresTick: 90, damage, distanceTravelled: 0 };
}
export function remapFighter(state: GameState, fighter: Aircraft, token: number): void {
  const r = state.rosters.friendly;
  r.tokens[fighter.token].status = 'destroyed'; r.tokens[fighter.token].slot = null;
  fighter.token = token; fighter.id = token; fighter.generation = 2;
  r.tokens[token].status = 'active'; r.tokens[token].slot = fighter.slot; r.tokens[token].generation = 2;
  r.slots[fighter.slot] = token; r.generations[fighter.slot] = 2;
}
