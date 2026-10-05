import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { advanceLaserAttack, beginLaserWarning, cancelLaserBurst } from '../src/laser';
import { createGame } from '../src/simulation';
import { integrateBeamContacts, nearestBeamContact, segmentRoundedBoxFraction, type Collider } from '../src/collision';
const ref = { kind: 'fighter' as const, token: 0, generation: 1 };
test('A11/A12 warning30, five exact60 tick beams spaced12, final expiry+180, fixed S/P', () => {
  const u = createGame().ufos[0], a = u.attack, emissions: number[] = [];
  const start = new Vector3(0, 100, 0), point = new Vector3(0, 100, 100);
  assert.equal(beginLaserWarning(a, 0, start, point, ref), true);
  start.x = 1000; point.x = 1000;
  for (let t = 0; t <= 318; t++) {
    advanceLaserAttack(u, t, true, b => { emissions.push(b.birthTick); assert.equal(b.expiresTick - b.birthTick, 60); assert.equal(b.start.x, 0); assert.equal(b.aimPoint.x, 0); return true; });
    if (t === 317) assert.equal(beginLaserWarning(a, t, new Vector3(), new Vector3(), ref), false);
  }
  assert.deepEqual(emissions, [30, 42, 54, 66, 78]);
  assert.equal(a.lastExpireTick, 138); assert.equal(a.cooldownUntilTick, 318);
  assert.equal(beginLaserWarning(a, 318, new Vector3(), new Vector3(), ref), true);
  assert.equal(a.firstFireTick, 348);
});
test('A11 cancellation with zero through four issued beams waits from last actual expiry', () => {
  for (let count = 0; count <= 4; count++) {
    const u = createGame().ufos[0], a = u.attack;
    beginLaserWarning(a, 0, new Vector3(), new Vector3(0, 0, 100), ref);
    for (let t = 0; t < 30 + count * 12; t++) advanceLaserAttack(u, t, true, () => true);
    const cancelAt = 30 + count * 12;
    advanceLaserAttack(u, cancelAt, false, () => true);
    assert.equal(a.fired, count);
    assert.equal(a.cooldownUntilTick, count ? 30 + (count - 1) * 12 + 60 + 180 : cancelAt + 180);
  }
});
test('A11 refused beam allocation does not count as a shot', () => {
  const u = createGame().ufos[0]; beginLaserWarning(u.attack, 0, new Vector3(), new Vector3(1, 0, 0), ref);
  assert.equal(advanceLaserAttack(u, 30, true, () => false), false); assert.equal(u.attack.fired, 0);
  cancelLaserBurst(u.attack, 31); assert.equal(u.attack.cooldownUntilTick, 211);
});
test('A13/A14 static dose is eight HP at all interval partitions, nearest target blocks the far one', () => {
  const start = new Vector3(), end = new Vector3(0, 0, 100);
  const near: Collider = { shape: 'sphere', key: 'near', ref, previous: new Vector3(0, 0, 30), position: new Vector3(0, 0, 30), radius: 5 };
  const far: Collider = { ...near, key: 'far', ref: { ...ref, token: 1 }, previous: new Vector3(0, 0, 60), position: new Vector3(0, 0, 60) };
  for (const partitions of [1, 3, 30, 60, 120, 127]) {
    let dose = 0;
    for (let i = 0; i < partitions; i++) for (const contact of integrateBeamContacts(start, end, [far, near], i / partitions, (i + 1) / partitions)) {
      assert.equal(contact.collider.key, 'near'); dose += (contact.to - contact.from) * 8;
    }
    assert.ok(Math.abs(dose - 8) < 1e-6);
  }
  assert.equal(nearestBeamContact(start, end, [far, near])?.point.z, 25);
});
test('A14 fast crossing whose endpoints miss integrates only actual overlap', () => {
  const collider: Collider = { shape: 'sphere', key: 'crossing', ref, previous: new Vector3(-10, 0, 50), position: new Vector3(10, 0, 50), radius: 2 };
  const contacts = integrateBeamContacts(new Vector3(), new Vector3(0, 0, 100), [collider]);
  assert.equal(contacts.length, 1); assert.ok(Math.abs(contacts[0].from - 0.4) < 1e-8); assert.ok(Math.abs(contacts[0].to - 0.6) < 1e-8);
  assert.equal(nearestBeamContact(new Vector3(), new Vector3(0, 0, 100), [collider]), null);
});
test('A13 beam radius clips a box edge and uses rounded corners accurately', () => {
  const min = new Vector3(-1, -1, 10), max = new Vector3(1, 1, 12);
  assert.notEqual(segmentRoundedBoxFraction(new Vector3(2, 0, 0), new Vector3(2, 0, 20), min, max, 2), null);
  assert.equal(segmentRoundedBoxFraction(new Vector3(2.9, 2.9, 0), new Vector3(2.9, 2.9, 20), min, max, 2), null);
});
test('broad rounded-box rejection preserves the legacy polynomial relative tolerance at a near edge', () => {
  const fraction = segmentRoundedBoxFraction(new Vector3(74.00002, 34, -1260), new Vector3(74.00002, 34, -60), new Vector3(-72, 6, -724), new Vector3(72, 82, -596), 2);
  assert.equal(fraction, 0.44666666666666666);
});
test('A14 zero-length beam and initial overlap remain finite', () => {
  const c: Collider = { shape: 'sphere', key: 'overlap', ref, previous: new Vector3(), position: new Vector3(), radius: 2 };
  assert.deepEqual(integrateBeamContacts(new Vector3(), new Vector3(), [c]).map(x => [x.from, x.to]), [[0, 1]]);
});
