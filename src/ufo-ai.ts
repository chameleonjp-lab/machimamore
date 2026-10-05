import { Vector3 } from 'three';
import { FIXED_DT, UFO_ACCELERATION, UFO_BOUNDARY_MARGIN, UFO_MAX_SPEED, UFO_MIN_ALTITUDE, WORLD_BOUNDS } from './rules';
import type { Ufo } from './types';
export function seededRandom(state: { randomState: number }): number {
  let x = state.randomState | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.randomState = x >>> 0;
  return state.randomState / 4294967296;
}
function constrainWaypoint(point: Vector3): void {
  const margin = UFO_BOUNDARY_MARGIN + UFO_MAX_SPEED ** 2 / (2 * UFO_ACCELERATION);
  point.x = Math.max(WORLD_BOUNDS.minX + margin, Math.min(WORLD_BOUNDS.maxX - margin, point.x));
  point.z = Math.max(WORLD_BOUNDS.minZ + margin, Math.min(WORLD_BOUNDS.maxZ - margin, point.z));
  point.y = Math.max(100, Math.min(500, point.y));
}
/** UFO steering is free in all three axes and has no aircraft stall rule. */
export function moveUfo(ufo: Ufo, tick: number, random: () => number, targetPoint: Vector3 | null, canMove: (point: Vector3) => boolean, canTraverse?: (start: Vector3, end: Vector3) => boolean): void {
  ufo.previous.copy(ufo.position);
  if (tick < ufo.attack.holdUntilTick || ufo.attack.phase === 'warning' || ufo.attack.phase === 'burst') { ufo.velocity.set(0, 0, 0); ufo.speed = 0; return; }
  if (ufo.movement === 'braking' && ufo.velocity.lengthSq() < 1e-12) {
    ufo.movement = ufo.brakeNext ?? 'stationary'; ufo.movementUntilTick = tick + (ufo.movement === 'stationary' ? 120 : 180);
    if (ufo.movement === 'linear') {
      const anchor = targetPoint ?? new Vector3(0, 180, -800);
      ufo.waypoint.copy(anchor).add(new Vector3((random() - 0.5) * 650, 0, (random() - 0.5) * 450));
      ufo.waypoint.y = ufo.position.y;
      constrainWaypoint(ufo.waypoint);
      // Linear motion remains horizontal even when recovering at the floor.
      ufo.waypoint.y = ufo.position.y;
    }
  } else if (tick >= ufo.movementUntilTick) {
    const nextLinear = ufo.movement === 'three-dimensional';
    ufo.brakeNext = nextLinear ? 'linear' : 'stationary';
    ufo.movement = ufo.movement === 'stationary' ? 'three-dimensional' : 'braking';
    ufo.movementUntilTick = ufo.movement === 'braking' ? Infinity : tick + 180;
    const anchor = targetPoint ?? new Vector3(0, 180, -800);
    ufo.waypoint.copy(anchor).add(new Vector3((random() - 0.5) * 650, 160 + random() * 120, (random() - 0.5) * 450));
    constrainWaypoint(ufo.waypoint);
  }
  // Stop while there is still enough distance for a finite deceleration. The
  // full vector stopping distance is conservative for every individual axis.
  const stopDistance = ufo.velocity.lengthSq() / (2 * UFO_ACCELERATION) + UFO_MAX_SPEED * FIXED_DT;
  const minimum = { x: WORLD_BOUNDS.minX + UFO_BOUNDARY_MARGIN, y: UFO_MIN_ALTITUDE, z: WORLD_BOUNDS.minZ + UFO_BOUNDARY_MARGIN };
  const maximum = { x: WORLD_BOUNDS.maxX - UFO_BOUNDARY_MARGIN, y: WORLD_BOUNDS.maxY - UFO_BOUNDARY_MARGIN, z: WORLD_BOUNDS.maxZ - UFO_BOUNDARY_MARGIN };
  const approachingBoundary = (['x', 'y', 'z'] as const).some(axis =>
    ufo.velocity[axis] < 0 && ufo.position[axis] - minimum[axis] <= stopDistance ||
    ufo.velocity[axis] > 0 && maximum[axis] - ufo.position[axis] <= stopDistance);
  const corridorClear = (start: Vector3, end: Vector3): boolean => {
    if (canTraverse) return canTraverse(start, end);
    // The production caller supplies an exact rounded-box sweep. Pure callers
    // with only a point predicate get deterministic one-metre path sampling.
    const samples = Math.max(1, Math.ceil(start.distanceTo(end)));
    for (let i = 0; i <= samples; i++) if (!canMove(start.clone().lerp(end, i / samples))) return false;
    return true;
  };
  const stopPoint = ufo.position.clone().addScaledVector(ufo.velocity.clone().normalize(), stopDistance);
  const approachingObstacle = ufo.speed > 1e-8 && !corridorClear(ufo.position, stopPoint);
  if (approachingBoundary || approachingObstacle) { ufo.movement = 'braking'; ufo.brakeNext = 'linear'; ufo.movementUntilTick = Infinity; }
  const desired = ufo.movement === 'stationary' || ufo.movement === 'braking' ? new Vector3() : ufo.waypoint.clone().sub(ufo.position);
  if (desired.lengthSq() > 1) desired.normalize().multiplyScalar(UFO_MAX_SPEED);
  const acceleration = desired.sub(ufo.velocity);
  acceleration.clampLength(0, UFO_ACCELERATION * FIXED_DT);
  ufo.velocity.add(acceleration).clampLength(0, UFO_MAX_SPEED);
  const next = ufo.position.clone().addScaledVector(ufo.velocity, FIXED_DT);
  if ((['x', 'y', 'z'] as const).some(axis => next[axis] < minimum[axis] - 1e-7 || next[axis] > maximum[axis] + 1e-7)) throw new Error('UFOが有限減速で飛行領域へ収まりません。');
  if (!canMove(next) || !corridorClear(ufo.position, next)) throw new Error('UFOの経路が塞がれ、有限減速で衝突を避けられません。');
  ufo.position.copy(next);
  ufo.speed = ufo.velocity.length();
}
