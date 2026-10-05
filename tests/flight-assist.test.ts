import assert from 'node:assert/strict';
import test from 'node:test';
import { Euler, Quaternion, Vector3 } from 'three';
import type { Aircraft, CombatTarget } from '../src/flight-types';
import { applyEasyShotCorrection, autoFireTarget, getFlightAssist, predictedShotDirection, targetAimPoint } from '../src/flight-assist';
import { getFlightCameraPose, projectFlightTarget } from '../src/flight-view';

const neutral = { turn: 0, climb: 0, fire: false, loop: false, viewAspect: 393 / 852 };
function plane(): Aircraft {
  return { position: new Vector3(0, 800, 0), quaternion: new Quaternion(), yaw: 0, pitch: 0, bank: 0,
    speed: 110, loopProgress: 0, loopCooldown: 0 };
}
function target(position = new Vector3(0, 800, -450), velocity = new Vector3()): CombatTarget {
  return { position, velocity, health: 80 };
}

test('pinned camera offset and 45 percent bank are shared by projection and rendering', () => {
  const aircraft = plane();
  aircraft.pitch = 0.21; aircraft.yaw = -0.38; aircraft.bank = 0.57;
  aircraft.quaternion.setFromEuler(new Euler(aircraft.pitch, aircraft.yaw, -aircraft.bank, 'YXZ'));
  for (const mode of ['normal', 'easy'] as const) {
    const position = new Vector3(), rotation = new Quaternion();
    getFlightCameraPose(aircraft, mode, position, rotation);
    const expected = new Quaternion().setFromEuler(new Euler(0.21, -0.38, -0.57 * 0.45, 'YXZ'));
    const expectedPosition = new Vector3(0, 11, 29).applyQuaternion(expected).add(aircraft.position);
    expected.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), mode === 'easy' ? -Math.atan2(11, 479) : -0.19));
    assert.ok(position.distanceTo(expectedPosition) < 1e-10);
    assert.ok(1 - Math.abs(rotation.dot(expected)) < 1e-12);
    const axisPoint = new Vector3(0, 0, -450).applyQuaternion(rotation).add(position);
    const projection = projectFlightTarget(aircraft, axisPoint, 393 / 852, mode);
    assert.ok(Math.abs(projection.x) < 1e-12); assert.ok(Math.abs(projection.y) < 1e-12);
    assert.equal(projection.inCircle, true);
  }
});

test('normal retains manual stick and fire; Easy ignores dead or occluded targets', () => {
  const aircraft = plane(), ufo = target();
  assert.equal(autoFireTarget(aircraft, [ufo], 'normal', neutral.viewAspect), null);
  assert.equal(autoFireTarget(aircraft, [ufo], 'easy', neutral.viewAspect), ufo);
  assert.equal(autoFireTarget(aircraft, [ufo], 'easy', neutral.viewAspect, () => false), null);
  const manual = getFlightAssist(aircraft, [ufo], { ...neutral, turn: 0.4, climb: -0.6 }, 'normal');
  assert.equal(manual.turn, 0.4); assert.equal(manual.climb, -0.6);
  const blocked = getFlightAssist(aircraft, [ufo], neutral, 'easy', () => false);
  assert.equal(blocked.hasVisibleTarget, false); assert.equal(blocked.turn, 0); assert.equal(blocked.climb, 0);
  ufo.health = 0;
  assert.equal(autoFireTarget(aircraft, [ufo], 'easy', neutral.viewAspect), null);
  assert.equal(getFlightAssist(aircraft, [ufo], neutral, 'easy').responseMultiplier, 1);
});

test('UFO aiming uses free 3D velocity, immutable aim points and the pinned gentle correction', () => {
  const ufo = target(new Vector3(0, 800, -450), new Vector3(40, 12, 0));
  const originalPosition = ufo.position.clone(), originalVelocity = ufo.velocity.clone();
  const origin = new Vector3(0, 800, 0), forward = new Vector3(0, 0, -1);
  const predicted = predictedShotDirection(origin, forward, ufo, 720, 1.5);
  assert.ok(predicted.x > 0); assert.ok(predicted.y > 0);
  const corrected = applyEasyShotCorrection(forward, predicted);
  const angle = forward.angleTo(predicted), expectedAngle = Math.min(angle * 0.35, 0.028);
  assert.ok(Math.abs(forward.angleTo(corrected) - expectedAngle) < 1e-10);
  assert.ok(Math.abs(corrected.length() - 1) < 1e-12);
  const point = targetAimPoint(ufo); point.y += 100;
  assert.deepEqual(ufo.position, originalPosition); assert.deepEqual(ufo.velocity, originalVelocity);
  const outside = new Vector3(1, 0, -1).normalize();
  assert.deepEqual(applyEasyShotCorrection(forward, outside), forward);
  assert.deepEqual(predictedShotDirection(origin, forward, target(new Vector3(700, 800, -100)), 720, 1.5), forward);
});
