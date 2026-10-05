import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createGame, getPlayer, NEUTRAL_INPUT, startGame, stepGame } from '../src/simulation';
import { rosterCounts } from '../src/roster';
import { beginLaserWarning } from '../src/laser';
import { beam, bullet, fixture } from './simulation-fixtures';
test('A08 generated two-barrel shots count four, depleted magazines reload at 359/360 ticks and held fire resumes', () => {
  const state = fixture(), player = getPlayer(state)!;
  player.mg = 0; player.cannon = 2;
  startGame(state); stepGame(state, { ...NEUTRAL_INPUT, fire: true });
  assert.equal(state.stats.shots, 2); assert.equal(player.cannon, 0); assert.equal(player.reloadTicksRemaining, 360);
  for (let i = 0; i < 359; i++) stepGame(state, { ...NEUTRAL_INPUT, fire: true });
  assert.equal(player.reloadTicksRemaining, 1); assert.equal(state.stats.shots, 2);
  stepGame(state, { ...NEUTRAL_INPUT, fire: true });
  assert.equal(player.reloadTicksRemaining, 0); assert.equal(player.mg, 286); assert.equal(player.cannon, 94); assert.equal(state.stats.shots, 6); assert.equal(state.fault, null);
});
test('A08 saturated round pool stops as a fault without consuming magazines or accuracy shots', () => {
  const state = fixture(), player = getPlayer(state)!;
  state.bullets = Array.from({ length: 2048 }, (_, i) => ({ ...bullet(state, new Vector3(10000, 1000, 10000), new Vector3()), id: i + 1 }));
  startGame(state); stepGame(state, { ...NEUTRAL_INPUT, fire: true });
  assert.equal(state.phase, 'paused'); assert.match(state.fault!, /航空弾/); assert.equal(player.mg, 288); assert.equal(player.cannon, 96); assert.equal(state.stats.shots, 0);
});
test('A18 actual swept rounds damage one live UFO each and count player launch ownership', () => {
  const state = fixture(), player = getPlayer(state)!, ufo = state.ufos[0];
  ufo.position.set(0, 250, 380); ufo.previous.copy(ufo.position);
  startGame(state); stepGame(state, { ...NEUTRAL_INPUT, fire: true });
  for (let i = 0; i < 10; i++) stepGame(state, NEUTRAL_INPUT);
  assert.equal(state.stats.shots, 4); assert.equal(state.stats.hits, 4); assert.ok(Math.abs(state.stats.playerDamage - 48) < 1e-8); assert.ok(Math.abs(ufo.health - 32) < 1e-8);
  assert.equal(state.rosters.enemy.tokens[0].damageTaken, 48); assert.equal(player.mg, 286);
});
test('A18/19 overkill clips HP, one round has at most one hit, and queued reserve prevents premature victory', () => {
  const state = fixture(), ufo = state.ufos[0]; ufo.position.set(1000, 400, -1500);
  state.bullets = [bullet(state, new Vector3(1000, 400, -1460), new Vector3(0, 0, -2000), 1000)]; state.stats.shots = 1;
  startGame(state); stepGame(state); stepGame(state);
  assert.equal(state.stats.hits, 1); assert.equal(state.stats.playerDamage, 80); assert.equal(state.rosters.enemy.tokens[0].damageTaken, 80);
  assert.equal(state.ufos.length, 0); assert.equal(state.phase, 'playing'); assert.equal(rosterCounts(state.rosters.enemy).Q, 8);
  assert.equal(state.result, null);
});
test('A18 launch ownership remains with the player after the shooter is destroyed', () => {
  const state = fixture(); state.fighters[0].position.y = 1;
  state.bullets = [bullet(state, new Vector3(1000, 400, -1400), new Vector3(0, 0, -500), 20)]; state.stats.shots = 1;
  startGame(state);
  for (let i = 0; i < 15; i++) stepGame(state);
  assert.equal(state.playerId, null); assert.equal(state.stats.playerLosses, 1); assert.equal(state.stats.hits, 1); assert.equal(state.stats.playerDamage, 20);
});
test('A14 one fixed one-second beam gives 8 HP; five beams give 40, shooter destruction does not erase them', () => {
  for (const count of [1, 5]) {
    const state = fixture(), player = getPlayer(state)!; state.beams = Array.from({ length: count }, (_, i) => beam(state, i + 1));
    state.bullets = [bullet(state, new Vector3(1000, 400, -1460), new Vector3(0, 0, -2000), 1000, false)];
    startGame(state); for (let t = 0; t < 60; t++) stepGame(state);
    assert.ok(Math.abs(player.health - (80 - 8 * count)) < 1e-6, String(player.health));
    assert.equal(state.ufos.length, 0); assert.equal(state.beams.length, count); assert.equal(state.fault, null);
    assert.ok(Math.abs(state.beams.reduce((sum, b) => sum + b.actualDamage, 0) - 8 * count) < 1e-6);
    stepGame(state); assert.equal(state.beams.length, 0); assert.ok(Math.abs(player.health - (80 - 8 * count)) < 1e-6);
  }
});
test('A13/14 a district exhausted halfway through the tick exposes the rear fighter for only the remainder', () => {
  const state = fixture(), player = getPlayer(state)!, district = state.city[0];
  player.position.set(0, 250, 100); player.previous.copy(player.position);
  district.position.set(0, 250, 200); district.halfExtent.set(10, 10, 10); district.health = 1 / 30;
  state.beams = [beam(state, 1, new Vector3(0, 250, 300), new Vector3(0, 250, -100))];
  startGame(state); stepGame(state);
  assert.equal(district.destroyed, true); assert.ok(Math.abs(player.health - (80 - 1 / 15)) < 1e-8, String(player.health));
  assert.equal(state.beams[0].actualTarget?.kind, 'fighter'); assert.ok(state.beams[0].end.z < 120); assert.equal(state.fault, null);
});
test('A13 UFOs shield a rear fighter without receiving allied laser damage', () => {
  const state = fixture(1, 2), player = getPlayer(state)!, shield = state.ufos[1];
  shield.position.set(0, 250, 650); shield.previous.copy(shield.position); state.beams = [beam(state)];
  startGame(state); stepGame(state);
  assert.equal(player.health, 80); assert.equal(shield.health, 80); assert.equal(state.beams[0].actualTarget?.kind, 'ufo');
});
test('A16 Normal player round damages the street while Easy stops it without street damage or accuracy credit', () => {
  for (const mode of ['normal', 'easy'] as const) {
    const state = fixture(); state.mode = mode; const district = state.city[0];
    state.bullets = [bullet(state, district.position.clone().add(new Vector3(0, 0, 80)), new Vector3(0, 0, -2000))]; state.stats.shots = 1;
    startGame(state); stepGame(state);
    assert.equal(district.health, mode === 'normal' ? 230 : 250); assert.equal(state.stats.hits, 0); assert.equal(state.bullets.length, 0);
  }
});
test('IR06 an enemy destroyed before the swept collision cannot cause a phantom player crash', () => {
  const state = fixture(), f = state.fighters[0], u = state.ufos[0];
  f.position.set(0, 300, 0); f.previous.copy(f.position); u.position.set(0, 300, -23.5); u.previous.copy(u.position); u.attack.holdUntilTick = 100;
  state.bullets = [bullet(state, new Vector3(0, 300, -40), new Vector3(0, 0, 1000), 100, false)];
  startGame(state); stepGame(state);
  assert.equal(state.stats.playerLosses, 0); assert.equal(getPlayer(state), f); assert.equal(u.health, 0); assert.equal(state.fault, null);
});
test('IR06 real aircraft/UFO contact destroys both participants of the same event', () => {
  const state = fixture(), f = state.fighters[0], u = state.ufos[0];
  f.position.set(0, 300, 0); f.previous.copy(f.position); u.position.set(0, 300, -23.5); u.previous.copy(u.position); u.attack.holdUntilTick = 100;
  startGame(state); stepGame(state);
  assert.equal(f.health, 0); assert.equal(u.health, 0); assert.equal(state.stats.playerLosses, 1); assert.equal(state.fault, null);
  assert.equal(state.stats.ufoDamage, 80); assert.equal(state.stats.playerDamage, 80); assert.equal(state.stats.hits, 0); assert.equal(state.stats.shots, 0);
});
test('accepted Easy input rejects manual fire and throttle and malformed steering is finite', () => {
  const state = createGame({ mode: 'easy', seed: 4 }); startGame(state);
  stepGame(state, { turn: NaN, climb: Infinity, fire: true, loop: false, accelerate: true, brake: true });
  assert.deepEqual([state.input.turn, state.input.climb, state.input.fire, state.input.accelerate, state.input.brake], [0, 0, false, false, false]);
  assert.ok(getPlayer(state)!.position.toArray().every(Number.isFinite)); assert.equal(state.fault, null);
});
test('A08 the production wingman loop also empties magazines, reloads for360 ticks, and resumes its slower cadence', () => {
  // No additional fixture enemies may change the wingman's target at tick180.
  const state = fixture(2, 1, false), wing = state.fighters[1], ufo = state.ufos[0];
  wing.position.set(300, 350, 800); wing.previous.copy(wing.position); wing.mg = 0; wing.cannon = 2;
  ufo.position.set(300, 350, 650); ufo.previous.copy(ufo.position); ufo.velocity.set(0, 0, -120); ufo.speed = 120; ufo.movement = 'linear'; ufo.waypoint.set(300, 350, -100000);
  startGame(state); stepGame(state);
  assert.equal(wing.cannon, 0); assert.equal(wing.reloadTicksRemaining, 360); assert.equal(state.stats.shots, 0);
  for (let i = 0; i < 359; i++) stepGame(state);
  assert.equal(wing.reloadTicksRemaining, 1); stepGame(state);
  assert.equal(wing.reloadTicksRemaining, 0); assert.equal(wing.mg, 286); assert.equal(wing.cannon, 94); assert.equal(state.stats.shots, 0); assert.equal(state.fault, null);
});
test('A18 Normal player rounds damage a friendly without accuracy credit and Easy protects that friendly', () => {
  for (const mode of ['normal', 'easy'] as const) {
    const state = fixture(2); state.mode = mode; const wing = state.fighters[1]; wing.reloadTicksRemaining = 1000;
    state.bullets = [bullet(state, wing.position.clone().add(new Vector3(0, 0, 40)), new Vector3(0, 0, -2000))]; state.stats.shots = 1;
    startGame(state); stepGame(state); stepGame(state);
    assert.equal(wing.health, mode === 'normal' ? 60 : 80); assert.equal(state.stats.hits, 0); assert.equal(state.stats.shots, 1); assert.equal(state.fault, null);
  }
});
test('A28 eight simultaneous legal five-beam bursts reach forty active beams without dropping an attack', () => {
  const state = fixture(1, 8, false); state.fighters[0].position.set(0, 250, 1000);
  state.ufos.forEach((u, i) => {
    const district = state.city[i]; u.position.copy(district.position).add(new Vector3(0, 180, 0)); u.previous.copy(u.position); u.attack.cooldownUntilTick = 0;
    assert.equal(beginLaserWarning(u.attack, 0, u.position, district.position, { kind: 'city', token: i, generation: 1 }), true);
  });
  startGame(state); let peak = 0;
  for (let tick = 0; tick < 139; tick++) { stepGame(state); peak = Math.max(peak, state.beams.length); assert.ok(state.beams.length <= 40); assert.equal(state.fault, null); }
  assert.equal(peak, 40); assert.equal(state.beams.length, 0); assert.ok(state.ufos.every(u => u.attack.fired === 5));
  for (let i = 0; i < 8; i++) assert.ok(Math.abs(state.city[i].health - 230) < 1e-6, String(state.city[i].health));
});
test('A14 a beam lifetime ending within a fixture tick integrates only its remaining half interval', () => {
  const state = fixture(), player = getPlayer(state)!, b = beam(state); b.birthTick = -59.5; b.expiresTick = 0.5; state.beams = [b];
  startGame(state); stepGame(state); assert.ok(Math.abs(player.health - (80 - 4 / 60)) < 1e-8);
  stepGame(state); assert.equal(state.beams.length, 0); assert.ok(Math.abs(player.health - (80 - 4 / 60)) < 1e-8);
});
