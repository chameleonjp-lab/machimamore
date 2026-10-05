import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createGame, startGame, stepGame } from '../src/simulation';
import { moveUfo, seededRandom } from '../src/ufo-ai';
import { beginLaserWarning } from '../src/laser';
import { segmentRoundedBoxFraction, sphereTouchesBox } from '../src/collision';
import { fixture } from './simulation-fixtures';
test('A10 UFO has actual linear, stationary and 3D trajectories with finite speed/acceleration', () => {
  const state = createGame({ mode: 'normal', seed: 31 }), ufo = state.ufos[0], seen = new Set<string>(); let verticalTravel = 0, stationaryTicks = 0;
  for (let tick = 0; tick < 1400; tick++) {
    const velocity = ufo.velocity.clone(); moveUfo(ufo, tick, () => seededRandom(state), new Vector3(0, 200, -800), () => true);
    seen.add(ufo.movement); assert.ok(ufo.velocity.length() <= 120 + 1e-8); assert.ok(velocity.distanceTo(ufo.velocity) <= 1 + 1e-8);
    if (ufo.movement === 'stationary') { stationaryTicks++; assert.equal(ufo.previous.distanceTo(ufo.position), 0); assert.equal(ufo.speed, 0); }
    if (ufo.movement === 'three-dimensional') verticalTravel += Math.abs(ufo.position.y - ufo.previous.y);
    if (ufo.movement === 'linear') assert.equal(ufo.position.y, ufo.previous.y);
    assert.ok(ufo.position.toArray().every(Number.isFinite));
  }
  assert.ok(seen.has('linear') && seen.has('stationary') && seen.has('three-dimensional') && seen.has('braking')); assert.ok(stationaryTicks >= 120); assert.ok(verticalTravel > 5);
});
test('A12 warning and issued beams hold UFO still through last expiry', () => {
  const state = createGame(), ufo = state.ufos[0], original = ufo.position.clone(); ufo.attack.phase = 'warning'; ufo.attack.holdUntilTick = 138;
  for (let tick = 0; tick < 138; tick++) moveUfo(ufo, tick, () => seededRandom(state), new Vector3(), () => true);
  assert.deepEqual(ufo.position.toArray(), original.toArray()); assert.equal(ufo.speed, 0);
});
test('A10/32 offscreen AI retains deterministic roles and at most two city reservations per district', () => {
  const state = createGame({ mode: 'normal', seed: 81 }); startGame(state);
  for (let tick = 0; tick < 420; tick++) {
    stepGame(state);
    const targets = new Map<number, number>();
    for (const ufo of state.ufos) {
      assert.equal(ufo.role, ufo.slot < 6 ? 'city-attacker' : 'interceptor');
      if (ufo.target?.kind === 'city') targets.set(ufo.target.token, (targets.get(ufo.target.token) ?? 0) + 1);
      assert.ok(ufo.position.toArray().every(Number.isFinite));
    }
    assert.ok([...targets.values()].every(n => n <= 2)); assert.equal(state.fault, null);
  }
});
test('IR07 later-slot fixed warning reserves capacity before earlier idle slots choose a city', () => {
  const state = createGame({ mode: 'normal', seed: 1 });
  for (const u of state.ufos) { u.position.set(1500, 300, -1800); u.previous.copy(u.position); u.attack.cooldownUntilTick = 100000; }
  state.ufos[0].position.set(-20, 300, -660); state.ufos[1].position.set(20, 300, -660);
  const locked = state.ufos[5], city = state.city[2]; locked.position.set(0, 300, -720);
  beginLaserWarning(locked.attack, 0, locked.position, city.position, { kind: 'city', token: 2, generation: 1 });
  // Permit the pre-start locked warning despite the default idle cooldown.
  locked.attack.cooldownUntilTick = 0;
  beginLaserWarning(locked.attack, 0, locked.position, city.position, { kind: 'city', token: 2, generation: 1 });
  startGame(state); stepGame(state);
  assert.equal(state.ufos.filter(u => u.role === 'city-attacker' && u.target?.kind === 'city' && u.target.token === 2).length, 2);
  assert.equal(locked.target?.token, 2); assert.equal(state.fault, null);
});
test('A10 boundary targets are constrained and actual displacement always agrees with finite velocity', () => {
  const state = createGame(), ufo = state.ufos[0];
  ufo.position.set(1650, 300, -800); ufo.previous.copy(ufo.position); ufo.velocity.set(0, 0, 0); ufo.speed = 0; ufo.movement = 'stationary'; ufo.movementUntilTick = 0;
  for (let tick = 0; tick < 1200; tick++) {
    const velocity = ufo.velocity.clone();
    moveUfo(ufo, tick, () => 0.999999, new Vector3(1800, 250, -800), () => true);
    const actual = ufo.position.clone().sub(ufo.previous).multiplyScalar(60);
    assert.ok(actual.distanceTo(ufo.velocity) < 1e-8, `tick${tick}`); assert.ok(velocity.distanceTo(ufo.velocity) <= 1 + 1e-8);
    assert.ok(ufo.position.x <= 1770 && ufo.position.x >= -1770); assert.ok(ufo.position.y >= 80); assert.ok(ufo.position.z <= 1970 && ufo.position.z >= -1970);
    assert.ok(ufo.waypoint.x <= 1650); assert.ok(ufo.position.toArray().every(Number.isFinite));
  }
});
test('A10 speed120 approaching the x edge brakes within the domain instead of clamping position', () => {
  const state = createGame(), ufo = state.ufos[0];
  ufo.position.set(1650, 300, 0); ufo.previous.copy(ufo.position); ufo.velocity.set(120, 0, 0); ufo.speed = 120; ufo.waypoint.set(1650, 300, 0); ufo.movementUntilTick = 100000;
  for (let tick = 0; tick < 120; tick++) {
    const speed = ufo.speed; moveUfo(ufo, tick, () => 0.5, new Vector3(), () => true);
    assert.ok(speed - ufo.speed <= 1 + 1e-8); assert.ok(ufo.position.x <= 1770); assert.ok(ufo.position.clone().sub(ufo.previous).multiplyScalar(60).distanceTo(ufo.velocity) < 1e-8);
  }
  assert.equal(ufo.speed, 0); assert.equal(ufo.movement, 'braking');
});
test('A10 coincident waypoint and entity positions never normalize a zero vector', () => {
  const state = createGame(), ufo = state.ufos[0]; ufo.velocity.set(0, 0, 0); ufo.speed = 0; ufo.waypoint.copy(ufo.position); ufo.movementUntilTick = 100000;
  for (let tick = 0; tick < 180; tick++) moveUfo(ufo, tick, () => seededRandom(state), ufo.position, () => true);
  assert.ok(ufo.position.toArray().every(Number.isFinite)); assert.equal(ufo.position.distanceTo(ufo.previous), 0); assert.equal(ufo.speed, 0);
});
test('IR10 safe descent anticipates the whole stopping corridor and brakes before the district roof', () => {
  const state = createGame(), ufo = state.ufos[0], city = state.city[2];
  ufo.position.set(0, 140, -660); ufo.previous.copy(ufo.position); ufo.velocity.set(0, -40, 0); ufo.speed = 40; ufo.movement = 'three-dimensional'; ufo.movementUntilTick = 1000; ufo.waypoint.set(0, 100, -660);
  const min = city.position.clone().sub(city.halfExtent), max = city.position.clone().add(city.halfExtent);
  const canMove = (point: Vector3) => !sphereTouchesBox(point, ufo.radius, min, max);
  const canTraverse = (start: Vector3, end: Vector3) => segmentRoundedBoxFraction(start, end, min, max, ufo.radius) === null;
  let braking = false;
  for (let tick = 0; tick < 150; tick++) {
    const velocity = ufo.velocity.clone(); moveUfo(ufo, tick, () => 0.5, city.position, canMove, canTraverse);
    braking ||= ufo.movement === 'braking'; assert.ok(velocity.distanceTo(ufo.velocity) <= 1 + 1e-8); assert.ok(canMove(ufo.position));
    assert.ok(ufo.position.clone().sub(ufo.previous).multiplyScalar(60).distanceTo(ufo.velocity) < 1e-8);
  }
  assert.equal(braking, true);
});
test('IR10 a pre-start unsafe stopping distance becomes an explicit fault, never an instant zero velocity', () => {
  const state = fixture(), ufo = state.ufos[0];
  state.fighters[0].position.set(1200, 600, 1200);
  ufo.position.set(0, 100, -660); ufo.previous.copy(ufo.position); ufo.velocity.set(0, -40, 0); ufo.speed = 40; ufo.movement = 'three-dimensional'; ufo.movementUntilTick = 1000; ufo.waypoint.copy(ufo.position);
  startGame(state);
  for (let tick = 0; tick < 8 && state.phase === 'playing'; tick++) stepGame(state);
  assert.equal(state.phase, 'paused'); assert.match(state.fault!, /有限減速/); assert.ok(ufo.velocity.length() > 30); assert.ok(state.pauseReasons.includes('simulation-fault'));
});
