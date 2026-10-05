import assert from 'node:assert/strict';
import test from 'node:test';
import { beginAircraftReload, tickAircraftReload, beginPlayerReload, tickPlayerReload } from '../src/ammunition';

test('either nonempty magazine prevents a reload and dead aircraft cannot reload', () => {
  for (const [mg, cannon] of [[1, 0], [0, 1], [288, 96]]) {
    const aircraft = { health: 80, mg, cannon, reloadTicksRemaining: 0 };
    assert.equal(beginAircraftReload(aircraft), false);
    assert.equal(aircraft.reloadTicksRemaining, 0);
  }
  const dead = { health: 0, mg: 0, cannon: 0, reloadTicksRemaining: 0 };
  assert.equal(beginAircraftReload(dead), false);
  dead.reloadTicksRemaining = 1;
  assert.equal(tickAircraftReload(dead), false);
  assert.equal(dead.reloadTicksRemaining, 1);
});

test('player and wingmen finish one shared reload at tick 360, with unlimited later replenishment', () => {
  for (const role of ['player', 'wingman']) {
    const aircraft = { health: 80, mg: 0, cannon: 0, reloadTicksRemaining: 0 };
    for (let reload = 0; reload < 3; reload++) {
      assert.equal(beginAircraftReload(aircraft), true, role);
      assert.equal(aircraft.reloadTicksRemaining, 360);
      assert.equal(beginAircraftReload(aircraft), false);
      for (let tick = 1; tick <= 359; tick++) assert.equal(tickAircraftReload(aircraft), false);
      assert.equal(aircraft.reloadTicksRemaining, 1);
      assert.equal(aircraft.mg, 0); assert.equal(aircraft.cannon, 0);
      assert.equal(tickAircraftReload(aircraft), true);
      assert.equal(aircraft.reloadTicksRemaining, 0);
      assert.equal(aircraft.mg, 288); assert.equal(aircraft.cannon, 96);
      assert.equal(tickAircraftReload(aircraft), false);
      aircraft.mg = 0; aircraft.cannon = 0;
    }
  }
  assert.equal(beginPlayerReload, beginAircraftReload);
  assert.equal(tickPlayerReload, tickAircraftReload);
});
