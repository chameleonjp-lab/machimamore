import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { fixture } from './simulation-fixtures';
import { getPlayer, NEUTRAL_INPUT, startGame, stepGame } from '../src/simulation';
import { getFlightCameraPose } from '../src/flight-view';
import { updateQuaternion } from '../src/flight';
import { autoFireTarget, getFlightAssist } from '../src/flight-assist';
import { createFlightTargetLock } from '../src/flight-target';

const aspect = 402 / 874;
function setup(mode: 'easy' | 'normal', right = 105, front = 500) {
  const state = fixture(1, 1, false); state.mode = mode; state.seed = state.randomState = 73;
  const player = getPlayer(state)!; player.position.set(0, 800, 0); player.previous.copy(player.position);
  player.pitch = player.yaw = player.bank = 0; updateQuaternion(player);
  const position = new Vector3(), rotation = new Quaternion(); getFlightCameraPose(player, mode, position, rotation);
  const enemy = state.ufos[0]; enemy.position.copy(position).addScaledVector(new Vector3(0, 0, -1).applyQuaternion(rotation), front)
    .addScaledVector(new Vector3(1, 0, 0).applyQuaternion(rotation), right);
  enemy.previous.copy(enemy.position); enemy.health = 1e8;
  startGame(state); return state;
}

for (const mode of ['easy', 'normal'] as const) {
  test(`${mode}: enemy placements and stale assistance cannot change the same manual flight`, () => {
    for (const input of [{}, { turn: .1, steeringActive: true }, { climb: .1, steeringActive: true }, { turn: -.1, climb: .1, steeringActive: true }]) {
      const reference = setup(mode, 0, -500);
      const variants = [setup(mode), setup(mode, 0), setup(mode, -105), setup(mode, 300)];
      for (const state of variants) { state.controller.assistTurn = .6; state.controller.assistClimb = -.4; state.controller.responseMultiplier = 1.65; }
      for (let tick = 0; tick < 12; tick++) {
        const command = { ...NEUTRAL_INPUT, ...input, viewAspect: aspect };
        stepGame(reference, command);
        for (const state of variants) {
          stepGame(state, command); assert.equal(state.fault, null);
          const actual = getPlayer(state)!, expected = getPlayer(reference)!;
          assert.ok(actual.position.distanceTo(expected.position) < .001, `position at tick${tick}`);
          assert.ok(actual.quaternion.angleTo(expected.quaternion) < .001 * Math.PI / 180, `attitude at tick${tick}`);
          assert.equal(state.controller.responseMultiplier, 1);
        }
      }
    }
  });

  test(`${mode}: center-held steering preserves pitch and release levels smoothly`, () => {
    const state = setup(mode, 0, -500), player = getPlayer(state)!;
    player.pitch = 20 * Math.PI / 180; updateQuaternion(player);
    for (let tick = 0; tick < 12; tick++) stepGame(state, { ...NEUTRAL_INPUT, steeringActive: true, viewAspect: aspect });
    assert.ok(Math.abs(player.pitch - 20 * Math.PI / 180) < 1e-12);
    stepGame(state, { ...NEUTRAL_INPUT, viewAspect: aspect });
    assert.ok(player.pitch < 20 * Math.PI / 180 && player.pitch > 19 * Math.PI / 180);
  });

  test(`${mode}: both MG and cannon muzzles launch along the current aircraft forward`, () => {
    const state = setup(mode, 0), player = getPlayer(state)!, enemy = state.ufos[0];
    enemy.velocity.set(40, 0, 0); enemy.speed = 40; enemy.movement = 'linear'; enemy.waypoint.copy(enemy.position).add(new Vector3(1000, 0, 0));
    stepGame(state, { ...NEUTRAL_INPUT, fire: mode === 'normal', steeringActive: true, viewAspect: aspect });
    const bullets = state.bullets.filter(b => b.playerOwned); assert.equal(bullets.length, 4);
    const forward = new Vector3(0, 0, -1).applyQuaternion(player.quaternion);
    for (const bullet of bullets) assert.ok(bullet.velocity.angleTo(forward) < .001 * Math.PI / 180, bullet.kind);
  });
}

test('steering does not inspect target visibility or seed a fire lock in either mode', () => {
  const state = setup('easy'), player = getPlayer(state)!;
  for (const mode of ['easy', 'normal'] as const) {
    const lock = createFlightTargetLock(); let queries = 0;
    const result = getFlightAssist(player, state.ufos, { ...NEUTRAL_INPUT, turn: .1 }, mode, () => { queries++; return true; }, lock);
    assert.deepEqual(result, { turn: .1, climb: 0, responseMultiplier: 1, hasVisibleTarget: false });
    assert.equal(queries, 0); assert.equal(lock.key, null);
  }
});

test('Easy trigger uses the live circle and validates health, faction, range and obstruction', () => {
  for (const viewAspect of [402 / 874, 874 / 402]) {
    const state = setup('easy', 0), player = getPlayer(state)!, enemy = state.ufos[0];
    const lock = createFlightTargetLock(); lock.key = 'departed:99:1';
    assert.equal(autoFireTarget(player, state.ufos, 'easy', viewAspect, () => true, lock), enemy);
    assert.equal(autoFireTarget(player, state.ufos, 'easy', viewAspect, () => false, lock), null);
    enemy.health = 0; assert.equal(autoFireTarget(player, state.ufos, 'easy', viewAspect), null); enemy.health = 80;
    enemy.team = 'friendly' as any; assert.equal(autoFireTarget(player, state.ufos, 'easy', viewAspect), null); enemy.team = 'enemy';
    enemy.position.z = -1400; assert.equal(autoFireTarget(player, state.ufos, 'easy', viewAspect), null);
  }
});
