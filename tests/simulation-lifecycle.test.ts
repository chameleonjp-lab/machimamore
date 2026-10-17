import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { abortGame, createGame, getHudSnapshot, getPlayer, NEUTRAL_INPUT, pauseGame, resumeGame, startGame, stepGame } from '../src/simulation';
import { rosterCounts } from '../src/roster';
import { beam, bullet, fixture, remapFighter } from './simulation-fixtures';
import { getFlightCameraPose } from '../src/flight-view';
import { updateQuaternion } from '../src/flight';
test('A04 self respawns only at 180 ticks, neutralizes waiting input, restores HP and full magazines', () => {
  const state = fixture(), old = getPlayer(state)!; old.position.y = 1; old.mg = 20; old.cannon = 4;
  startGame(state); stepGame(state, { ...NEUTRAL_INPUT, fire: true });
  assert.equal(state.playerId, null); assert.equal(state.stats.playerLosses, 1);
  assert.equal(state.rosters.friendly.reservations[0].slot, 0); assert.equal(getHudSnapshot(state).waitingFor, 'respawn');
  const issuedBefore = state.stats.shots;
  for (let i = 0; i < 179; i++) stepGame(state, { ...NEUTRAL_INPUT, fire: true });
  assert.equal(getPlayer(state), null); assert.equal(state.tick, 180);
  stepGame(state, { ...NEUTRAL_INPUT, fire: true });
  const player = getPlayer(state)!;
  assert.notEqual(player.token, old.token); assert.equal(player.generation, 2); assert.equal(player.health, 80); assert.equal(player.mg, 288); assert.equal(player.cannon, 96);
  assert.equal(state.stats.shots, issuedBefore); assert.equal(state.input.fire, false); assert.equal(state.fault, null);
  stepGame(state, { ...NEUTRAL_INPUT, fire: true }); assert.equal(state.stats.shots, issuedBefore + 4);
});
test('A04/A05 no reserves transfers to smallest surviving token after 180 without resetting aircraft', () => {
  const state = fixture(2, 1, false), old = state.fighters[0], wingman = state.fighters[1];
  remapFighter(state, wingman, 49); wingman.health = 63; wingman.mg = 78; wingman.cannon = 32; wingman.reloadTicksRemaining = 900;
  old.position.y = 1; startGame(state); stepGame(state);
  assert.equal(getPlayer(state), null); assert.equal(getHudSnapshot(state).waitingFor, 'takeover'); assert.equal(state.rosters.friendly.reservations.length, 0);
  for (let i = 0; i < 179; i++) stepGame(state);
  assert.equal(getPlayer(state), null); const reloadBefore = wingman.reloadTicksRemaining;
  stepGame(state, { ...NEUTRAL_INPUT, fire: true });
  assert.equal(getPlayer(state), wingman); assert.equal(wingman.health, 63); assert.equal(wingman.mg, 78); assert.equal(wingman.cannon, 32); assert.equal(wingman.reloadTicksRemaining, reloadBefore - 1);
  assert.equal(wingman.role, 'player'); assert.equal(state.stats.playerLosses, 1); assert.equal(state.stats.allyLosses, 48); assert.equal(rosterCounts(state.rosters.friendly).D, 49);
  assert.equal(state.stats.shots, 0); assert.equal(state.events.filter(e => e.type === 'takeover').length, 1); assert.equal(state.fault, null);
});

test('pilot reassignment clears old assistance and delays Easy targeting and auto fire for 18 ticks', () => {
  const state = fixture(2, 1, false);
  state.mode = 'easy';
  const departing = state.fighters[0], nextPilot = state.fighters[1], target = state.ufos[0];
  departing.position.y = 1;
  // Keep the sole enemy alive while the wingman spends the assignment delay
  // pursuing it. The test resets its health when the new pilot takes over.
  target.position.set(1700, 1000, 1900); target.previous.copy(target.position);
  target.health = 1e8; target.velocity.set(0, 0, 0); target.speed = 0;
  target.movement = 'stationary'; target.movementUntilTick = 100000;
  target.attack.phase = 'cooldown'; target.attack.cooldownUntilTick = 100000;
  startGame(state); stepGame(state);
  assert.equal(getPlayer(state), null);
  for (let i = 0; i < 179; i++) stepGame(state, { ...NEUTRAL_INPUT, turn: 0.9, climb: -0.8, fire: true, loop: true, steeringActive: true });
  assert.equal(state.tick, 180);
  state.controller.targetLock.key = 'ufo:0:1';
  state.controller.targetLock.manual = true;
  state.controller.assistTurn = 0.6; state.controller.assistClimb = -0.4; state.controller.responseMultiplier = 1.65;

  // The last waiting input is deliberately hot; assignment must still neutralize it.
  stepGame(state, { ...NEUTRAL_INPUT, turn: -0.9, climb: 0.8, fire: true, loop: true, steeringActive: true });
  assert.equal(getPlayer(state), nextPilot);
  assert.equal(state.tick, 181);
  assert.equal(state.pilotAimReadyTick, 198);
  assert.deepEqual(state.input, { ...NEUTRAL_INPUT });
  assert.equal(state.controller.targetLock.key, null);
  assert.equal(state.controller.targetLock.manual, false);
  assert.equal(state.controller.assistTurn, 0); assert.equal(state.controller.assistClimb, 0);
  assert.equal(state.controller.responseMultiplier, 1);
  assert.equal(state.stats.shots, 0, 'old held fire and automatic fire must both wait during assignment');

  // A new aircraft pose must be the one used for its camera and target tests.
  nextPilot.position.set(300, 800, 1600); nextPilot.previous.copy(nextPilot.position);
  nextPilot.pitch = 0.2; nextPilot.yaw = 0.15; nextPilot.bank = 0.45;
  updateQuaternion(nextPilot);
  target.health = 80;
  const cameraPosition = new Vector3(), cameraRotation = new Quaternion();
  getFlightCameraPose(nextPilot, state.mode, cameraPosition, cameraRotation);
  target.position.copy(cameraPosition).addScaledVector(new Vector3(0, 0, -1).applyQuaternion(cameraRotation), 500);
  target.previous.copy(target.position); target.velocity.set(0, 0, 0); target.speed = 0;
  target.movement = 'stationary'; target.movementUntilTick = 100000;
  target.attack.phase = 'cooldown'; target.attack.cooldownUntilTick = 100000;

  for (let i = 0; i < 17; i++) {
    stepGame(state);
    assert.equal(state.stats.shots, 0, `Easy autofire should remain unavailable at takeover-relative tick ${i + 1}`);
    assert.equal(state.controller.targetLock.key, null);
  }
  assert.equal(state.tick, 198);
  // The incoming pilot has pitched back during the wait. Place a visible
  // target on the current Easy camera axis for the first eligible tick.
  getFlightCameraPose(nextPilot, state.mode, cameraPosition, cameraRotation);
  target.position.copy(cameraPosition).addScaledVector(new Vector3(0, 0, -1).applyQuaternion(cameraRotation), 500);
  target.previous.copy(target.position);
  stepGame(state);
  assert.ok(state.stats.shots > 0, 'Easy auto fire should resume at takeover-relative tick 18');
  assert.equal(state.fault, null);
});

test('normal fire on or off leaves manual camera pose identical for the same 12 accepted ticks', () => {
  const off = fixture(1, 1, false), on = fixture(1, 1, false);
  for (const state of [off, on]) {
    state.fighters[0].position.set(0, 500, 0); state.fighters[0].previous.copy(state.fighters[0].position);
    state.ufos[0].position.set(1700, 900, 1900); state.ufos[0].previous.copy(state.ufos[0].position);
    state.ufos[0].movement = 'stationary'; state.ufos[0].speed = 0; state.ufos[0].velocity.set(0, 0, 0);
    state.ufos[0].attack.phase = 'cooldown'; state.ufos[0].attack.cooldownUntilTick = 100000;
    startGame(state);
  }
  const pose = (state: ReturnType<typeof fixture>) => {
    const player = getPlayer(state)!;
    const position = new Vector3(), rotation = new Quaternion();
    getFlightCameraPose(player, state.mode, position, rotation);
    const forward = new Vector3(0, 0, -1).applyQuaternion(rotation).normalize();
    return [...player.position.toArray(), ...player.quaternion.toArray(), ...forward.toArray()];
  };
  for (let tick = 0; tick < 12; tick++) {
    const input = { ...NEUTRAL_INPUT, turn: 0.45, climb: 0.1, steeringActive: true };
    stepGame(off, input);
    stepGame(on, { ...input, fire: true });
    assert.deepEqual(pose(on), pose(off), `fire changed the pose at tick ${tick + 1}`);
  }
  assert.equal(off.stats.shots, 0);
  assert.ok(on.stats.shots > 0, 'the test must exercise actual Normal firing');
  assert.equal(off.fault, null); assert.equal(on.fault, null);
});
test('A04 if only Q survives, pilot waits for its first legal spawn and does not lose', () => {
  const state = fixture(2, 1, false), player = state.fighters[0], wing = state.fighters[1], r = state.rosters.friendly;
  r.tokens[49].status = 'reserve'; state.stats.allyLosses--;
  player.position.y = 1; wing.position.y = 1;
  startGame(state); stepGame(state);
  assert.equal(state.fighters.length, 0); assert.equal(rosterCounts(r).Q, 1); assert.equal(state.phase, 'playing'); assert.equal(state.rosters.friendly.reservations[0].slot, 0);
  for (let i = 0; i < 180; i++) stepGame(state);
  assert.equal(getPlayer(state)?.token, 49); assert.equal(state.phase, 'playing'); assert.equal(state.fault, null);
});
test('A03 pending player reservation checks all deterministic safe candidates and retains its single token when blocked', () => {
  const state = fixture(1, 5), old = state.fighters[0]; old.position.y = 1;
  const candidates = [new Vector3(-210, 250, 580), new Vector3(-160, 380, 580), new Vector3(-260, 510, 580), new Vector3(-210, 650, 580), new Vector3(40, 300, 760)];
  state.ufos.forEach((u, i) => { u.position.copy(candidates[i]); u.previous.copy(u.position); u.attack.holdUntilTick = 1000; });
  startGame(state); stepGame(state);
  const reservedToken = state.rosters.friendly.reservations.find(q => q.slot === 0)!.token;
  for (let i = 0; i < 180; i++) stepGame(state);
  assert.equal(getPlayer(state), null);
  const pending = state.rosters.friendly.reservations.find(q => q.slot === 0)!;
  assert.equal(pending.token, reservedToken); assert.equal(pending.blockedSince, 180); assert.equal(state.rosters.friendly.tokens[reservedToken].status, 'queued'); assert.equal(state.fault, null);
});
test('A06 last enemy token gives victory exactly once, and A0 with Q/R is not victory', () => {
  const state = fixture(1, 1, false);
  state.bullets = [bullet(state, new Vector3(1000, 400, -1460), new Vector3(0, 0, -2000), 1000)]; state.stats.shots = 1;
  startGame(state); stepGame(state); stepGame(state);
  assert.equal(state.result?.outcome, 'victory'); assert.equal(state.result?.enemyDestroyed, 50); assert.equal(state.endReason, 'all-clear'); assert.equal(state.events.filter(e => e.type === 'end').length, 1);
  const result = state.result, frozen = JSON.stringify(state);
  for (let i = 0; i < 60; i++) stepGame(state, { ...NEUTRAL_INPUT, fire: true });
  assert.equal(state.result, result); assert.equal(JSON.stringify(state), frozen); assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result?.stats), true); assert.equal(Object.isFrozen(result?.breakdown), true);
});
test('A07 same-tick last friendly and last enemy losses prioritize defeat and freeze all in-flight attacks', () => {
  const state = fixture(1, 1, false); state.fighters[0].position.y = 1;
  state.bullets = [bullet(state, new Vector3(1000, 400, -1480), new Vector3(0, 0, -2000), 1000)]; state.stats.shots = 1;
  state.beams = [beam(state)];
  startGame(state); stepGame(state);
  assert.equal(rosterCounts(state.rosters.friendly).D, 50); assert.equal(rosterCounts(state.rosters.enemy).D, 50);
  assert.equal(state.result?.outcome, 'defeat'); assert.equal(state.result?.reason, 'friendly-exhausted'); assert.equal(state.result?.breakdown.time, 0);
  const frozen = JSON.stringify(state); pauseGame(state); resumeGame(state); abortGame(state); stepGame(state);
  assert.equal(JSON.stringify(state), frozen);
});
test('A07 street zero wins priority over simultaneous enemy exhaustion', () => {
  const state = fixture(1, 1, false), district = state.city[0];
  for (const d of state.city) { d.destroyed = true; d.health = 0; }
  district.destroyed = false; district.health = 1 / 30; district.position.set(0, 250, 200); district.halfExtent.set(10, 10, 10);
  state.stats.cityDamage = 5000 - district.health; state.stats.cityDestroyed = 19;
  state.fighters[0].position.set(400, 500, 1000); state.beams = [beam(state, 1, new Vector3(0, 250, 300), new Vector3(0, 250, -100))];
  state.bullets = [bullet(state, new Vector3(1000, 400, -1480), new Vector3(0, 0, -2000), 1000)]; state.stats.shots = 1;
  startGame(state); stepGame(state);
  assert.equal(state.result?.enemyDestroyed, 50); assert.equal(state.result?.cityHealth, 0); assert.equal(state.result?.reason, 'city-destroyed'); assert.equal(state.result?.outcome, 'defeat');
});
test('A27 pause freezes clocks, beams, reload and reservations; closing unrelated reasons never calls resume', () => {
  const state = fixture(); state.fighters[0].reloadTicksRemaining = 100; state.beams = [beam(state)];
  startGame(state); stepGame(state); pauseGame(state, 'hidden'); pauseGame(state, 'manual');
  const frozen = JSON.stringify(state);
  for (let i = 0; i < 600; i++) stepGame(state, { ...NEUTRAL_INPUT, fire: true });
  assert.equal(JSON.stringify(state), frozen); assert.deepEqual(state.pauseReasons, ['hidden', 'manual']);
  resumeGame(state); assert.equal(state.phase, 'playing'); stepGame(state); assert.equal(state.tick, 2);
});
test('P02 restarting allocates an independent mission ID, fresh finite rosters and zeroed score', () => {
  const first = createGame({ mode: 'normal', seed: 7 }); startGame(first); stepGame(first, { ...NEUTRAL_INPUT, fire: true }); abortGame(first);
  const second = createGame({ mode: 'normal', seed: 7 });
  assert.notEqual(second.missionId, first.missionId); assert.equal(second.tick, 0); assert.equal(second.stats.shots, 0); assert.equal(second.phase, 'ready');
  assert.deepEqual(rosterCounts(second.rosters.friendly), { A: 8, Q: 0, R: 42, D: 0, remaining: 50 });
  assert.equal(second.events.length, 0); assert.notEqual(first.city[0], second.city[0]);
});
test('R91 accepted tick inputs produce identical state at 30, 60 and 120Hz rendering', () => {
  const snapshots: string[] = [];
  for (const renderRate of [30, 60, 120]) {
    const state = createGame({ mode: 'normal', seed: 20261004 }); startGame(state); let accumulator = 0;
    for (let frame = 0; frame < renderRate * 5; frame++) {
      accumulator += 1 / renderRate;
      while (accumulator >= 1 / 60 - 1e-12) { stepGame(state, { ...NEUTRAL_INPUT, turn: Math.sin(state.tick / 80) * 0.5, climb: 0.1, fire: state.tick % 100 < 50 }); accumulator -= 1 / 60; }
    }
    assert.equal(state.tick, 300); assert.equal(state.fault, null);
    snapshots.push(JSON.stringify(state, (key, value) => key === 'missionId' ? 0 : value));
  }
  assert.equal(snapshots[0], snapshots[1]); assert.equal(snapshots[1], snapshots[2]);
});
