import test from 'node:test';
import assert from 'node:assert/strict';
import { activateReservations, assertRoster, createRoster, destroyToken, reserveEmptySlots, rosterCounts } from '../src/roster';
test('A01 finite roster begins A8 Q0 R42 D0 and exhausts exactly fifty unique tokens', () => {
  const r = createRoster('friendly');
  assert.deepEqual(rosterCounts(r), { A: 8, Q: 0, R: 42, D: 0, remaining: 50 });
  let tick = 0;
  while (rosterCounts(r).A) {
    const active = r.tokens.filter(t => t.status === 'active');
    for (const t of active) assert.equal(destroyToken(r, t.id, t.generation), true);
    for (const t of active) assert.equal(destroyToken(r, t.id, t.generation), false);
    reserveEmptySlots(r, tick, 0); assertRoster(r);
    tick += 180; activateReservations(r, tick, () => true); assertRoster(r);
  }
  assert.deepEqual(rosterCounts(r), { A: 0, Q: 0, R: 0, D: 50, remaining: 0 });
});
test('A02 last reserve is allocated to current player slot before ascending wing slots', () => {
  const r = createRoster('friendly');
  for (let i = 8; i < 49; i++) r.tokens[i].status = 'destroyed';
  destroyToken(r, 0, 1); destroyToken(r, 4, 1); destroyToken(r, 7, 1);
  assert.deepEqual(reserveEmptySlots(r, 100, 7).map(q => [q.token, q.slot, q.dueTick]), [[49, 7, 280]]);
  assert.equal(reserveEmptySlots(r, 100, 7).length, 0); assertRoster(r);
});
test('A03 179/180 tick boundary, blocked Q and five second fault do not consume tokens twice', () => {
  const r = createRoster('enemy'); destroyToken(r, 0, 1); reserveEmptySlots(r, 10);
  assert.equal(activateReservations(r, 189, () => true).length, 0);
  assert.equal(activateReservations(r, 190, () => false).length, 0);
  assert.deepEqual(rosterCounts(r), { A: 7, Q: 1, R: 41, D: 1, remaining: 49 });
  assert.equal(activateReservations(r, 489, () => false).length, 0);
  assert.throws(() => activateReservations(r, 490, () => false), /5秒/); assertRoster(r);
  const [spawn] = activateReservations(r, 490, () => true);
  assert.deepEqual([spawn.token, spawn.slot, spawn.generation], [8, 0, 2]);
  assert.equal(destroyToken(r, 8, 1), false); assertRoster(r);
});
test('A01 intentionally corrupted duplicate slots are rejected', () => {
  const r = createRoster('friendly'); r.tokens[1].slot = 0; assert.throws(() => assertRoster(r), /Duplicate/);
});
