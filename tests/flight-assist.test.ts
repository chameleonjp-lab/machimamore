import assert from 'node:assert/strict';
import test from 'node:test';
import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { Aircraft, CombatTarget } from '../src/flight-types';
import { applyEasyShotCorrection, autoFireTarget, getFlightAssist, predictedShotDirection, targetAimPoint } from '../src/flight-assist';
import { EASY_CAMERA_LOOK_ANGLE, FLIGHT_FAR, FLIGHT_FOV, FLIGHT_CAMERA_BANK_FACTOR, NORMAL_CAMERA_LOOK_ANGLE, getFlightCameraPose, projectFlightTarget } from '../src/flight-view';

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
    const expectedPositionRotation = aircraft.quaternion.clone().multiply(
      new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), aircraft.bank * (1 - FLIGHT_CAMERA_BANK_FACTOR)),
    );
    const expectedPosition = new Vector3(0, 11, 29).applyQuaternion(expectedPositionRotation).add(aircraft.position);
    const expected = aircraft.quaternion.clone()
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), aircraft.bank))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), mode === 'easy' ? EASY_CAMERA_LOOK_ANGLE : NORMAL_CAMERA_LOOK_ANGLE))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -aircraft.bank * FLIGHT_CAMERA_BANK_FACTOR));
    assert.ok(position.distanceTo(expectedPosition) < 1e-10);
    assert.ok(1 - Math.abs(rotation.dot(expected)) < 1e-12);
    const axisPoint = new Vector3(0, 0, -450).applyQuaternion(rotation).add(position);
    const projection = projectFlightTarget(aircraft, axisPoint, 393 / 852, mode);
    assert.ok(Math.abs(projection.x) < 1e-12); assert.ok(Math.abs(projection.y) < 1e-12);
    assert.equal(projection.inCircle, true);
  }
});

test('bank remains screen roll only; the view forward follows the aircraft quaternion and projects like Three', () => {
  const widths = [[393, 852], [393, 648], [568, 320], [852, 393], [1280, 720]] as const;
  for (const mode of ['normal', 'easy'] as const) {
    for (const pitch of [-0.9, 0, 0.9]) {
      for (const yaw of [-2.7, 0, 2.7]) {
        const reference = plane();
        reference.pitch = pitch; reference.yaw = yaw; reference.bank = 0;
        reference.quaternion.setFromEuler(new Euler(pitch, yaw, 0, 'YXZ'));
        const unbankedForward = new Vector3(0, 0, -1);
        {
          const position = new Vector3(), rotation = new Quaternion();
          getFlightCameraPose(reference, mode, position, rotation);
          unbankedForward.applyQuaternion(rotation).normalize();
        }
        for (const bank of [-0.72, 0, 0.72]) {
          const aircraft = plane();
          aircraft.pitch = pitch; aircraft.yaw = yaw; aircraft.bank = bank;
          aircraft.quaternion.setFromEuler(new Euler(pitch, yaw, -bank, 'YXZ'));
          const position = new Vector3(), rotation = new Quaternion();
          getFlightCameraPose(aircraft, mode, position, rotation);
          const forward = new Vector3(0, 0, -1).applyQuaternion(rotation).normalize();
          assert.ok(forward.distanceTo(unbankedForward) < 1e-12, `${mode} pitch=${pitch} yaw=${yaw} bank=${bank}`);
          const expectedPosition = new Vector3(0, 11, 29)
            .applyQuaternion(aircraft.quaternion.clone().multiply(
              new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), bank * (1 - FLIGHT_CAMERA_BANK_FACTOR)),
            )).add(aircraft.position);
          assert.ok(position.distanceTo(expectedPosition) < 1e-10);
          for (const [width, height] of widths) {
            const aspect = width / height;
            const camera = new PerspectiveCamera(FLIGHT_FOV, aspect, 0.5, FLIGHT_FAR);
            camera.position.copy(position); camera.quaternion.copy(rotation); camera.updateMatrixWorld(true);
            const right = new Vector3(1, 0, 0).applyQuaternion(rotation);
            const up = new Vector3(0, 1, 0).applyQuaternion(rotation);
            const bore = new Vector3(0, 0, -504.5).applyQuaternion(aircraft.quaternion).add(aircraft.position);
            const points = [bore, position.clone().addScaledVector(forward, 500).addScaledVector(right, 24).addScaledVector(up, -18)];
            for (const point of points) {
              const rendered = point.clone().project(camera);
              const target = projectFlightTarget(aircraft, point, aspect, mode);
              assert.ok(Math.abs(rendered.x - target.x) < 1e-12);
              assert.ok(Math.abs(rendered.y - target.y) < 1e-12);
            }
          }
        }
      }
    }
  }
});

test('camera orientation uses the rendered quaternion rather than stale Euler fields', () => {
  const aircraft = plane();
  aircraft.pitch = 0.21; aircraft.yaw = -0.38; aircraft.bank = 0.57;
  aircraft.quaternion.setFromEuler(new Euler(-0.34, 0.63, -aircraft.bank, 'YXZ'));
  for (const mode of ['normal', 'easy'] as const) {
    const position = new Vector3(), rotation = new Quaternion();
    getFlightCameraPose(aircraft, mode, position, rotation);
    const expected = aircraft.quaternion.clone()
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), aircraft.bank))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), mode === 'easy' ? EASY_CAMERA_LOOK_ANGLE : NORMAL_CAMERA_LOOK_ANGLE))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -aircraft.bank * FLIGHT_CAMERA_BANK_FACTOR));
    const staleEuler = new Quaternion().setFromEuler(new Euler(aircraft.pitch, aircraft.yaw, -aircraft.bank, 'YXZ'))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), aircraft.bank))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), mode === 'easy' ? EASY_CAMERA_LOOK_ANGLE : NORMAL_CAMERA_LOOK_ANGLE))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -aircraft.bank * FLIGHT_CAMERA_BANK_FACTOR));
    assert.ok(1 - Math.abs(rotation.dot(expected)) < 1e-12);
    assert.ok(1 - Math.abs(rotation.dot(staleEuler)) > 1e-4);
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
