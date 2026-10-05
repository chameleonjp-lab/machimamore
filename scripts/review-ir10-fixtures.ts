/**
 * Independent IR10 fixtures, saved from the executed stdin body.
 * Placement is exclusively before Start. Afterwards only production stepGame runs.
 * The third start is position-clear but has an unavoidable stopping distance;
 * an explicit fault is expected. These fixtures are not ordinary-play campaigns.
 */
import assert from 'node:assert/strict';
import { createGame, startGame, stepGame } from '../src/simulation';

for (const [height, speed] of [[150, 0], [140, -40], [100, -40]]) {
  const state = createGame({ mode: 'normal', seed: 1 });
  for (const f of state.fighters) { f.position.set(1000 + f.slot * 50, 500, 1000); f.previous.copy(f.position); }
  const u = state.ufos[0];
  u.position.set(0, height, -660); u.previous.copy(u.position); u.velocity.set(0, speed, 0); u.speed = Math.abs(speed);
  u.movement = 'three-dimensional'; u.movementUntilTick = 1000; u.waypoint.set(0, 100, -660); u.attack.cooldownUntilTick = 1000;
  startGame(state);
  let maxAcceleration = 0, minY = height, maxVelocityError = 0;
  for (let i = 0; i < 160 && state.phase === 'playing'; i++) {
    const v = u.velocity.clone(); stepGame(state);
    maxAcceleration = Math.max(maxAcceleration, u.velocity.distanceTo(v) * 60);
    minY = Math.min(minY, u.position.y);
    if (!state.fault) maxVelocityError = Math.max(maxVelocityError, u.position.clone().sub(u.previous).multiplyScalar(60).distanceTo(u.velocity));
  }
  console.log(JSON.stringify({ start: { height, speed }, tick: state.tick, phase: state.phase, fault: state.fault, maxAcceleration, minY, maxVelocityError, finalVelocity: u.velocity.toArray() }));
  if (height > 100) { assert.equal(state.fault, null); assert.ok(maxAcceleration <= 60 + 1e-8); assert.ok(minY > 96); assert.ok(maxVelocityError < 1e-8); }
  else { assert.equal(state.phase, 'paused'); assert.ok(state.fault!.includes('有限減速')); assert.ok(u.velocity.length() > 30); }
}
