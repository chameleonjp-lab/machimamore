/** Independent literal requirements calculation over the committed legal-input evidence. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const digest = createHash('sha256');
for (const file of ['simulation', 'types', 'rules', 'roster', 'city', 'score', 'ufo-ai', 'laser', 'collision', 'flight', 'flight-types', 'flight-view', 'flight-assist', 'ammunition'].map(name => `${name}.ts`).sort()) {
  digest.update(file); digest.update(await readFile(`src/${file}`));
}
const sourceDigest = digest.digest('hex');
const reports = [];
let cases = 0;
for (const [path, count] of [['docs/evidence/balance-final.json', 120], ['docs/evidence/turn-held-easy.json', 12], ['docs/evidence/normal-negative-comparison.json', 5]]) {
  const data = await readFile(path);
  const report = JSON.parse(data);
  assert.equal(report.simulationSourceDigest, sourceDigest, `${path}: source changed; rerun legal-input evidence`);
  assert.equal(report.rules, 'machimamore-2');
  assert.equal(report.rows.length, count);
  if (count === 120) assert.equal(report.policyDigest, createHash('sha256').update(await readFile('scripts/legal-pilot.ts')).digest('hex'));
  if (count === 12) assert.equal(report.policyDigest, createHash('sha256').update(await readFile('scripts/turn-held.ts')).digest('hex'));
  if (count === 5) {
    const policyHash = createHash('sha256');
    for (const file of ['scripts/defeat-search.ts', 'scripts/legal-pilot.ts']) { policyHash.update(file); policyHash.update(await readFile(file)); }
    assert.equal(report.policyDigest, policyHash.digest('hex'));
  }
  for (const row of report.rows) {
    const s = row.stats;
    assert.equal(row.fault, null);
    assert.ok(['victory', 'defeat'].includes(row.outcome));
    assert.ok(Number.isInteger(row.tick) && row.tick > 0);
    assert.ok(Math.abs(row.seconds - row.tick / 60) < 1e-8);
    assert.ok(Number.isInteger(row.enemyDestroyed) && row.enemyDestroyed >= 0 && row.enemyDestroyed <= 50);
    assert.ok(Number.isInteger(row.friendlyLosses) && row.friendlyLosses >= 0 && row.friendlyLosses <= 50);
    assert.equal(s.playerLosses + s.allyLosses, row.friendlyLosses);
    assert.ok(Number.isInteger(s.shots) && Number.isInteger(s.hits) && s.hits >= 0 && s.hits <= s.shots);
    assert.ok(s.ufoDamage >= 0 && s.ufoDamage <= 4000 + 1e-6);
    assert.ok(s.cityDamage >= 0 && s.cityDamage <= 5000 + 1e-6);
    assert.ok(Math.abs(row.cityHealth + s.cityDamage - 5000) < 1e-6);
    const literal = 1000 * row.enemyDestroyed + 5 * s.ufoDamage
      + (row.outcome === 'victory' ? 30000 / (1 + row.seconds / 180) : 0)
      - 2000 * s.playerLosses - 500 * s.allyLosses
      - (s.shots ? 10000 * (1 - s.hits / s.shots) : 0)
      - 2000 * s.cityDestroyed - 2 * s.cityDamage;
    assert.equal(row.score, Math.floor(literal), `${row.mode}/${row.seed}/${row.policy}: literal score`);
    cases++;
  }
  reports.push({ path, cases: count, sha256: createHash('sha256').update(data).digest('hex') });
}
console.log(JSON.stringify({ cases, sourceDigest, scoreMismatches: 0, faults: 0, cutoffs: 0, reports }));
