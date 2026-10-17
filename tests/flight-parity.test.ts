// Regression equations from pinned Kaisen; see docs/PROVENANCE_CONTROLS.md.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Euler, Quaternion, Vector3 } from 'three';
import { advanceThrottle, createFlightController, MAX_SPEED, STALL_SPEED, updateAircraftMotion, updatePlayerLoop, updateQuaternion } from '../src/flight';
import { getFlightCameraPose } from '../src/flight-view';
import type { Aircraft } from '../src/flight-types';
function makeAircraft(_id: number, _team: string, position: Vector3, yaw: number, _role: string): Aircraft {
  return {position, quaternion: new Quaternion().setFromEuler(new Euler(0,yaw,0,'YXZ')), yaw, pitch:0, bank:0, speed:110, loopProgress:0, loopCooldown:0};
}

const neutral = { turn: 0, climb: 0, fire: false, loop: false };
const dt = 1 / 60;
/** Independent reference equations transcribed from pinned Kaisen 5f4565ee updateAircraftMotion. */
function referenceStep(p: { pitch: number; yaw: number; bank: number; speed: number; position: Vector3 }, turn: number, climb: number, trim: number): void {
  const limit = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const authority = (p.speed <= 85 ? .92 + ((p.speed - 65) / 20) * .23 : p.speed <= 110 ? 1.15 - ((p.speed - 85) / 25) * .15 : 1)
    * limit(1 - Math.max(0, p.speed - 115) * .008, .78, 1);
  p.pitch += (climb * .95 - p.pitch) * (1 - Math.exp(-dt * 4.2));
  p.yaw = ((p.yaw - turn * .82 * authority * dt + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  p.bank += (turn * .72 - p.bank) * (1 - Math.exp(-dt * 5.5));
  p.speed = limit(p.speed + ((trim - p.speed) * .72 - Math.abs(turn) * 2.7 - Math.max(0, climb) * 2.1 - Math.sin(p.pitch) * 2.6) * dt, 65, 141);
  p.position.addScaledVector(new Vector3(0, 0, -1).applyEuler(new Euler(p.pitch, p.yaw, -p.bank, 'YXZ')), p.speed * dt);
}

test('source motion parity across slow/cruise/fast throttle and changing stick traces', () => {
  for (const speed of [65, 85, 110, 141]) {
    const actual = makeAircraft(1, 'friendly', new Vector3(0, 2400, 0), 0, 'player'); actual.speed = speed;
    const expected = { pitch: 0, yaw: 0, bank: 0, speed, position: actual.position.clone() };
    for (let tick = 0; tick < 600; tick++) {
      const turn = Math.sin(tick / 73) * .8, climb = Math.cos(tick / 110) * .6, preferred = tick < 300 ? 141 : 65;
      updateAircraftMotion(actual, turn, climb, dt, preferred, false, 141, .95); referenceStep(expected, turn, climb, preferred);
    }
    assert.ok(actual.position.distanceTo(expected.position) < 1e-8);
    for (const key of ['pitch', 'yaw', 'bank', 'speed'] as const) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-10, key);
  }
});

test('five second source loop restores heading and pitch then has two second cooldown', () => {
  const plane = makeAircraft(1, 'friendly', new Vector3(0, 800, 0), .3, 'player'); plane.pitch = .12;
  const control = createFlightController(plane); let completed = 0;
  for (let i = 0; i < 300; i++) completed += Number(updatePlayerLoop(plane, control, neutral, neutral, i === 0, dt, 110, 141, 1));
  assert.equal(completed, 1); assert.equal(plane.loopProgress, 0); assert.equal(plane.loopCooldown, 2);
  assert.equal(plane.yaw, .3); assert.equal(plane.pitch, .12); assert.ok(plane.position.toArray().every(Number.isFinite));
  updatePlayerLoop(plane, control, neutral, neutral, true, dt, 110, 141, 1); assert.equal(plane.loopProgress, 0);
});

test('intent revision cancels a loop smoothly and throttle retains source mode semantics', () => {
  const plane = makeAircraft(1, 'friendly', new Vector3(0, 800, 0), 0, 'player'); const control = createFlightController(plane);
  const input = { ...neutral, steeringRevision: 1 };
  for (let i = 0; i < 90; i++) updatePlayerLoop(plane, control, input, input, i === 0, dt, 110, 141, 1);
  const before = plane.position.clone();
  const steering = { ...neutral, turn: .5, steeringRevision: 2 };
  updatePlayerLoop(plane, control, steering, steering, false, dt, 110, 141, 1);
  assert.equal(plane.loopProgress, 0); assert.equal(plane.loopCooldown, 2); assert.ok(plane.position.distanceTo(before) < 3);
  for (let i = 0; i < 600; i++) advanceThrottle(control, { ...neutral, accelerate: true }, 'easy', dt);
  assert.equal(control.playerTargetSpeed, 110);
  for (let i = 0; i < 600; i++) advanceThrottle(control, { ...neutral, accelerate: true }, 'normal', dt);
  assert.equal(control.playerTargetSpeed, MAX_SPEED);
  for (let i = 0; i < 600; i++) advanceThrottle(control, { ...neutral, brake: true }, 'normal', dt);
  assert.equal(control.playerTargetSpeed, STALL_SPEED);
});

function cameraForward(aircraft: Aircraft, mode: 'normal' | 'easy'): Vector3 {
  const position = new Vector3(), rotation = new Quaternion();
  getFlightCameraPose(aircraft, mode, position, rotation);
  return new Vector3(0, 0, -1).applyQuaternion(rotation).normalize();
}

function cameraRotation(aircraft: Aircraft, mode: 'normal' | 'easy'): Quaternion {
  const position = new Vector3(), rotation = new Quaternion();
  getFlightCameraPose(aircraft, mode, position, rotation);
  return rotation;
}

function directionAngle(before: Vector3, after: Vector3): number {
  return Math.atan2(new Vector3().crossVectors(before, after).length(), before.dot(after));
}

function authority(speed: number): number {
  const lowSpeed = speed <= 85 ? 0.92 + ((speed - 65) / 20) * 0.23
    : speed <= 110 ? 1.15 - ((speed - 85) / 25) * 0.15 : 1;
  return lowSpeed * Math.max(0.78, Math.min(1, 1 - Math.max(0, speed - 115) * 0.008));
}

test('manual camera forward uses the same fixed-tick rate across modes, speeds, pitch, bank, yaw and eight directions', () => {
  let cases = 0;
  for (const mode of ['easy', 'normal'] as const) {
    for (const speed of [65, 85, 110, 141]) {
      for (const pitch of [-0.9, 0, 0.9]) {
        for (const bank of [-0.72, 0, 0.72]) {
          for (const yaw of [-3.14, 0, 3.14]) {
            for (let direction = 0; direction < 8; direction++) {
              for (const strength of [0.25, 0.45, 0.6]) {
              const aircraft = makeAircraft(1, 'friendly', new Vector3(0, 2400, 0), 0, 'player');
              const theta = direction * Math.PI / 4;
              const turn = Math.cos(theta) * strength, climb = Math.sin(theta) * strength;
              aircraft.speed = speed; aircraft.yaw = yaw; aircraft.bank = bank;
              aircraft.pitch = pitch;
              updateQuaternion(aircraft);
              const control = createFlightController(aircraft);
              const before = cameraForward(aircraft, mode);
              const steering = { ...neutral, turn, climb, steeringActive: true };
              updatePlayerLoop(aircraft, control, steering, steering, false, dt, 110, 141, 1, mode);
              const measured = directionAngle(before, cameraForward(aircraft, mode));
              const expected = 0.82 * authority(speed) * dt * strength;
              assert.ok(Math.abs(measured - expected) <= 1e-12,
                `${mode} direction=${direction} ${strength} speed=${speed} pitch=${pitch} bank=${bank} yaw=${yaw}: ${measured} vs ${expected}`);
              if (Math.abs(climb) <= 1e-8) assert.ok(Math.abs(aircraft.pitch - pitch) <= 1e-12, 'horizontal control must retain pitch');
              cases++;
              }
            }
          }
        }
      }
    }
  }
  assert.equal(cases, 5184);
});

test('manual diagonal input shares one circular budget and neutral leveling is capped by that budget', () => {
  const aircraft = makeAircraft(1, 'friendly', new Vector3(0, 2400, 0), 0, 'player');
  aircraft.pitch = 0.4;
  updateQuaternion(aircraft);
  const control = createFlightController(aircraft);
  const before = cameraForward(aircraft, 'normal');
  const diagonal = { ...neutral, turn: 0.6, climb: 0.6, steeringActive: true };
  updatePlayerLoop(aircraft, control, diagonal, diagonal, false, dt, 110, 141, 1, 'normal');
  const diagonalAngle = directionAngle(before, cameraForward(aircraft, 'normal'));
  assert.ok(Math.abs(diagonalAngle - 0.82 * dt * Math.hypot(0.6, 0.6)) <= 1e-12);
  assert.ok(Math.abs(aircraft.pitch - 0.4) <= 0.6 * 0.82 * dt + 1e-12);

  const heldPitch = aircraft.pitch;
  const horizontal = { ...neutral, turn: 0.5, steeringActive: true };
  updatePlayerLoop(aircraft, control, horizontal, horizontal, false, dt, 110, 141, 1, 'normal');
  assert.ok(Math.abs(aircraft.pitch - heldPitch) <= 1e-12, 'turn-only input must not trigger neutral return');

  const beforeLevel = aircraft.pitch;
  updatePlayerLoop(aircraft, control, { ...neutral, steeringActive: true }, { ...neutral, steeringActive: true }, false, dt, 110, 141, 1, 'normal');
  assert.ok(Math.abs(aircraft.pitch - beforeLevel) <= 0.82 * authority(aircraft.speed) * dt + 1e-12,
    'neutral return must not exceed the manual angular step');
});

test('offscreen response multiplier changes horizontal rate only', () => {
  for (const mode of ['easy', 'normal'] as const) {
    for (const speed of [65, 85, 110, 141]) {
      for (const pitch of [-0.9, 0, 0.9]) {
        for (const bank of [-0.72, 0, 0.72]) {
          for (const yaw of [-3.14, 0, 3.14]) {
            for (const sign of [-1, 1]) {
              for (const axis of ['turn', 'climb'] as const) {
                const ratio = (responseMultiplier: number) => {
                  const aircraft = makeAircraft(1, 'friendly', new Vector3(0, 2400, 0), yaw, 'player');
                  aircraft.speed = speed; aircraft.pitch = pitch; aircraft.yaw = yaw; aircraft.bank = bank; updateQuaternion(aircraft);
                  const control = createFlightController(aircraft), before = cameraForward(aircraft, mode);
                  const steering = { ...neutral, turn: axis === 'turn' ? sign * 0.45 : 0,
                    climb: axis === 'climb' ? sign * 0.45 : 0, steeringActive: true };
                  updatePlayerLoop(aircraft, control, steering, steering, false, dt, 110, 141, responseMultiplier, mode);
                  return directionAngle(before, cameraForward(aircraft, mode));
                };
                const one = ratio(1), offscreen = ratio(1.65);
                assert.ok(Math.abs(offscreen / one - (axis === 'turn' ? 1.65 : 1)) <= 1e-12,
                  `${mode} ${axis} speed=${speed} pitch=${pitch} bank=${bank} yaw=${yaw}`);
              }
            }
          }
        }
      }
    }
  }
});

test('loop interruption keeps the continuous camera branch near vertical at every phase', () => {
  let cases = 0;
  for (const mode of ['easy', 'normal'] as const) {
    for (const startPitch of [-0.95, 0, 0.95]) {
      for (const ticks of [1, 25, 50, 75, 90, 100, 125, 150, 175, 200, 225, 250, 275, 299]) {
        for (const turn of [-1, 0, 1]) {
          for (const climb of [-1, 0, 1]) {
            const aircraft = makeAircraft(1, 'friendly', new Vector3(0, 2400, 0), 0, 'player');
            aircraft.pitch = startPitch; updateQuaternion(aircraft);
            const control = createFlightController(aircraft);
            const loopInput = { ...neutral, steeringRevision: 1 };
            for (let tick = 0; tick < ticks; tick++) {
              updatePlayerLoop(aircraft, control, loopInput, loopInput, tick === 0, dt, 110, 141, 1, mode);
            }
            const beforeRotation = cameraRotation(aircraft, mode), beforePitch = aircraft.pitch;
            const steering = { ...neutral, turn, climb, steeringActive: true, steeringRevision: 2 };
            updatePlayerLoop(aircraft, control, steering, steering, false, dt, 110, 141, 1, mode);
            const cameraChange = beforeRotation.angleTo(cameraRotation(aircraft, mode));
            const pitchChange = Math.abs(Math.atan2(Math.sin(aircraft.pitch - beforePitch), Math.cos(aircraft.pitch - beforePitch)));
            assert.ok(cameraChange < 0.1, `${mode} ticks=${ticks} turn=${turn} climb=${climb}: ${cameraChange}`);
            assert.ok(pitchChange < 0.016, `${mode} ticks=${ticks} turn=${turn} climb=${climb}: ${pitchChange}`);
            cases++;
          }
        }
      }
    }
  }
  assert.equal(cases, 756);
});
