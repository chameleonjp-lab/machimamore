import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { integrateBeamContacts, type Collider } from '../src/collision';

// Independent geometric reference: distance to a ray and sphere surface entry.
// It deliberately does not call the production intersection functions.
function referenceAt(colliders: Collider[], time: number): string | null {
  let distance = 100, key: string | null = null;
  for (const c of colliders) {
    if (c.shape !== 'sphere') continue;
    const x = c.previous.x + (c.position.x - c.previous.x) * time;
    const y = c.previous.y + (c.position.y - c.previous.y) * time;
    const z = c.previous.z + (c.position.z - c.previous.z) * time;
    const discriminant = c.radius * c.radius - y * y - z * z;
    if (discriminant < 0) continue;
    const halfChord = Math.sqrt(discriminant);
    if (x + halfChord < 0 || x - halfChord > 100) continue;
    const entry = Math.max(0, x - halfChord);
    if (entry < distance || (entry === distance && c.key < (key ?? '\uffff'))) { distance = entry; key = c.key; }
  }
  return key;
}

test('continuous beam occlusion agrees with independent sampled geometry over crossing trajectories', () => {
  let seed = 19531;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const samples = 4000;
  for (let trial = 0; trial < 36; trial++) {
    const colliders: Collider[] = Array.from({ length: 4 }, (_, token) => ({
      shape: 'sphere', key: `sphere-${token}`, ref: { kind: 'fighter', token, generation: 1 },
      previous: new Vector3(random() * 120 - 10, random() * 18 - 9, random() * 6 - 3),
      position: new Vector3(random() * 120 - 10, random() * 18 - 9, random() * 6 - 3), radius: 1 + random() * 4,
    }));
    const analytic = integrateBeamContacts(new Vector3(), new Vector3(100, 0, 0), colliders);
    const measured = new Map<string, number>();
    for (let i = 0; i < samples; i++) {
      const key = referenceAt(colliders, (i + 0.5) / samples);
      if (key) measured.set(key, (measured.get(key) ?? 0) + 1 / samples);
    }
    for (const c of colliders) {
      const exact = analytic.filter(hit => hit.collider.key === c.key).reduce((sum, hit) => sum + hit.to - hit.from, 0);
      assert.ok(Math.abs(exact - (measured.get(c.key) ?? 0)) <= 8 / samples, `trial ${trial}, ${c.key}: ${exact} vs ${measured.get(c.key) ?? 0}`);
    }
    assert.ok(analytic.reduce((sum, hit) => sum + hit.to - hit.from, 0) <= 1 + 1e-10, 'nearest target alone receives dose');
  }
});
