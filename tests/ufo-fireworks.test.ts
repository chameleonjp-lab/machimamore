import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { createGame } from '../src/simulation';
import { UFO_FIREWORK_CAPACITY, UFO_FIREWORK_LIFETIME, UFO_FIREWORK_SPARKS, UfoFireworks } from '../src/ufo-fireworks';
import type { GameEvent, GameState } from '../src/types';

function kill(state: GameState, id: number, tick = 0, targetKind: GameEvent['targetKind'] = 'ufo'): GameEvent {
  return { id, missionId: state.missionId, tick, type: 'kill', owner: 0, target: 100 + id, targetKind, position: new Vector3(id * 2, 280, -1200) };
}

test('only confirmed UFO kills are accepted once per event id', () => {
  const state = createGame({ mode: 'easy', seed: 1 }), fireworks = new UfoFireworks();
  const valid = kill(state, 1);
  fireworks.update(state, 1, 0, false, [valid,
    { ...kill(state, 2), type: 'hit' }, kill(state, 3, 0, 'aircraft'), kill(state, 4, 0, 'city')]);
  assert.equal(fireworks.activeCount, 1);
  fireworks.update(state, 1, 0, false, [valid]);
  assert.equal(fireworks.activeCount, 1);
  fireworks.dispose();
});

test('fireworks follow the fixed mission clock, stay still while paused, and expire at 1.8 seconds', () => {
  const state = createGame({ mode: 'normal', seed: 2 }), fireworks = new UfoFireworks();
  fireworks.update(state, 1, 0, false, [kill(state, 1)]);
  state.phase = 'paused'; state.tick = 30; state.elapsed = .5;
  fireworks.update(state, 1, 0, false, []);
  const positions = (fireworks as unknown as { pointsGeometry: { attributes: { position: { array: Float32Array } } } }).pointsGeometry.attributes.position.array.slice();
  fireworks.update(state, 1, 0, false, []);
  assert.deepEqual((fireworks as unknown as { pointsGeometry: { attributes: { position: { array: Float32Array } } } }).pointsGeometry.attributes.position.array, positions);
  state.phase = 'playing'; state.tick = Math.ceil(UFO_FIREWORK_LIFETIME * 60); state.elapsed = state.tick / 60;
  fireworks.update(state, 1, 0, false, []);
  assert.equal(fireworks.activeCount, 0);
  fireworks.dispose();
});

test('terminal kills survive and age on result presentation time until they disappear', () => {
  const state = createGame({ mode: 'easy', seed: 3 }), fireworks = new UfoFireworks();
  fireworks.update(state, 1, 0, false, [kill(state, 1)]);
  state.phase = 'ended'; state.tick = 24; state.elapsed = .4;
  const finalKill = kill(state, 2, 23);
  fireworks.update(state, 1, 0, false, [finalKill]);
  assert.equal(fireworks.activeCount, 2);
  fireworks.update(state, 1, 1.41, false, []);
  assert.equal(fireworks.activeCount, 1);
  fireworks.update(state, 1, 1.8, false, []);
  assert.equal(fireworks.activeCount, 0);
  fireworks.dispose();
});

test('a new mission clears old effects and rejects notifications from the previous mission', () => {
  const state = createGame({ mode: 'easy', seed: 4 }), fireworks = new UfoFireworks();
  const stale = kill(state, 1);
  fireworks.update(state, 1, 0, false, [stale]);
  const next = createGame({ mode: 'easy', seed: 5 });
  fireworks.update(next, 1, 0, false, [stale]);
  assert.equal(fireworks.activeCount, 0);
  fireworks.update(next, 1, 0, false, [kill(next, 1)]);
  assert.equal(fireworks.activeCount, 1);
  fireworks.dispose();
});

test('the fixed eight-effect pool stays bounded and uploads its full pool only during preparation', () => {
  const state = createGame({ mode: 'normal', seed: 6 }), fireworks = new UfoFireworks();
  const events = Array.from({ length: UFO_FIREWORK_CAPACITY + 2 }, (_, index) => kill(state, index + 1));
  fireworks.update(state, 1, 0, false, events);
  assert.equal(fireworks.activeCount, UFO_FIREWORK_CAPACITY);
  const internal = fireworks as unknown as { pointsGeometry: { drawRange: { count: number }; attributes: { position: { array: Float32Array } } }; linesGeometry: { drawRange: { count: number } } };
  assert.equal(internal.pointsGeometry.drawRange.count, UFO_FIREWORK_CAPACITY * UFO_FIREWORK_SPARKS);
  assert.equal(internal.linesGeometry.drawRange.count, UFO_FIREWORK_CAPACITY * UFO_FIREWORK_SPARKS * 2);
  const pointBuffer = internal.pointsGeometry.attributes.position.array;
  const restore = fireworks.prepareForUpload();
  assert.equal(internal.pointsGeometry.drawRange.count, UFO_FIREWORK_CAPACITY * UFO_FIREWORK_SPARKS);
  restore();
  assert.equal(internal.pointsGeometry.attributes.position.array, pointBuffer);
  for (let i = 0; i < 200; i++) fireworks.update(state, 1, 0, false, []);
  assert.equal(fireworks.activeCount, UFO_FIREWORK_CAPACITY);
  assert.equal(internal.pointsGeometry.attributes.position.array, pointBuffer);
  fireworks.dispose();
});

test('boss kill replaces the oldest occupied effect without expanding the eight-slot pool',()=>{
 const state=createGame(),fireworks=new UfoFireworks();fireworks.update(state,1,0,false,Array.from({length:8},(_,i)=>kill(state,i+1)));
 const boss={...kill(state,9),detail:'boss'};fireworks.update(state,1,0,false,[boss]);
 const effects=(fireworks as unknown as {effects:({eventId:number}|null)[]}).effects;
 assert.equal(fireworks.activeCount,8);assert.ok(effects.some(e=>e?.eventId===9));assert.equal(effects.some(e=>e?.eventId===1),false);fireworks.dispose();
});
