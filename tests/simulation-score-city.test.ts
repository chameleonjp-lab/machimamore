import test from 'node:test';
import assert from 'node:assert/strict';
import { createCity, cityHealth, damageDistrict } from '../src/city';
import { createStats, calculateScore, assertStats } from '../src/score';
import { createGame, getHudSnapshot } from '../src/simulation';
test('A16 twenty finite districts begin 250HP each, overkill destroys once, no repair/repeated losses', () => {
  const city = createCity(); assert.equal(city.length, 20); assert.equal(cityHealth(city), 5000);
  const first = damageDistrict(city[0], 70); assert.deepEqual(first, { actual: 70, destroyed: false });
  assert.deepEqual(damageDistrict(city[0], 500), { actual: 180, destroyed: true });
  assert.deepEqual(damageDistrict(city[0], 500), { actual: 0, destroyed: false }); assert.equal(cityHealth(city), 4750);
  assert.throws(() => damageDistrict(city[1], NaN), /Invalid/);
});
test('A17 score components independently follow requirement literals and floor only final sum', () => {
  assert.equal(calculateScore(createStats(), 3, 0, false).total, 3000);
  assert.equal(calculateScore({ ...createStats(), ufoDamage: 7.5 }, 0, 0, false).total, 37);
  assert.equal(calculateScore(createStats(), 0, 180, true).time, 15000);
  assert.equal(calculateScore(createStats(), 0, 180, false).time, 0);
  assert.equal(calculateScore({ ...createStats(), playerLosses: 2 }, 0, 0, false).total, -4000);
  assert.equal(calculateScore({ ...createStats(), allyLosses: 3 }, 0, 0, false).total, -1500);
  assert.equal(calculateScore({ ...createStats(), shots: 3, hits: 2 }, 0, 0, false).total, -3334);
  assert.equal(calculateScore({ ...createStats(), cityDestroyed: 2, cityDamage: 700 }, 0, 0, false).total, -5400);
  const stats = { ...createStats(), ufoDamage: 1.25, playerLosses: 1, allyLosses: 2, shots: 3, hits: 2, cityDestroyed: 1, cityDamage: 10.2 };
  const expected = Math.floor(1000 + 6.25 + 30000 / (1 + 17 / 180) - 2000 - 1000 - 10000 * (1 - 2 / 3) - 2000 - 20.4);
  assert.equal(calculateScore(stats, 1, 17, true).total, expected);
});
test('A17 time bonus is strictly decreasing before integer rounding, finite upper scores cannot grow by waiting', () => {
  const stats = { ...createStats(), ufoDamage: 4000 };
  const a = calculateScore(stats, 50, 100, true), b = calculateScore(stats, 50, 101, true);
  assert.ok(a.time > b.time); assert.ok(a.total <= 100000); assert.ok(b.total < a.total);
  assert.equal(calculateScore(stats, 50, 100000, false).total, 70000);
});
test('A18 no-shot denominator is undefined and has zero penalty; miss and perfect hit are distinct', () => {
  const state = createGame(); assert.equal(getHudSnapshot(state).accuracy, null); assert.equal(calculateScore(state.stats, 0, 0, false).accuracy, 0);
  state.stats.shots = 1; assert.equal(getHudSnapshot(state).accuracy, 0); assert.equal(calculateScore(state.stats, 0, 0, false).accuracy, 10000);
  state.stats.hits = 1; assert.equal(getHudSnapshot(state).accuracy, 1); assert.equal(calculateScore(state.stats, 0, 0, false).accuracy, 0);
  state.stats.hits = 2; assert.throws(() => assertStats(state), /accuracy/);
});
test('A19 unbounded damage or inconsistent loss ownership is rejected by the ledger checker', () => {
  const state = createGame(); state.stats.ufoDamage = 4001; assert.throws(() => assertStats(state), /finite HP/);
  state.stats.ufoDamage = 0; state.stats.cityDamage = 5001; assert.throws(() => assertStats(state), /finite HP/);
  state.stats.cityDamage = 0; state.stats.playerLosses = 1; assert.throws(() => assertStats(state), /ownership/);
});
