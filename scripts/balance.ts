import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createGame, startGame, stepGame } from '../src/simulation';
import { assertRoster, rosterCounts } from '../src/roster';
import { assertStats } from '../src/score';
import { RULES_VERSION } from '../src/rules';
import type { GameMode } from '../src/types';

import { pilotInput, type Policy } from './legal-pilot';

const tuningSeeds = [11, 29, 47, 71, 103, 151];
const confirmationSeeds = [211, 307, 401, 503, 601, 701];
const policies: Policy[] = ['active', 'idle', 'fire-held', 'crash-repeat', 'leave-last'];
const smoke = process.argv.includes('--smoke');
const partition = Number(process.argv.find(a => a.startsWith('--partition='))?.split('=')[1] ?? 0);
const partitions = Number(process.argv.find(a => a.startsWith('--partitions='))?.split('=')[1] ?? 1);
if (!Number.isInteger(partitions) || partitions < 1 || !Number.isInteger(partition) || partition < 0 || partition >= partitions) throw new Error('Invalid balance partition');
const output = smoke ? 'smoke.json' : `results-${partition}.json`;
const sourceHash = createHash('sha256');
for (const file of ['simulation', 'types', 'rules', 'roster', 'city', 'score', 'ufo-ai', 'laser', 'collision', 'flight', 'flight-types', 'throttle-lever', 'flight-view', 'flight-assist', 'ammunition'].map(name => `${name}.ts`).sort()) {
  sourceHash.update(file); sourceHash.update(await readFile(`src/${file}`));
}
const simulationSourceDigest = sourceHash.digest('hex');
const policyDigest = createHash('sha256').update(await readFile('scripts/legal-pilot.ts')).digest('hex');
const rows: Record<string, unknown>[] = [];
await mkdir('artifacts/balance', { recursive: true });
for (const mode of ['easy', 'normal'] as GameMode[]) {
  for (const seed of (smoke ? [11] : [...tuningSeeds, ...confirmationSeeds]).filter((_, i) => i % partitions === partition)) {
    for (const policy of smoke ? ['active', 'idle'] as Policy[] : policies) {
      const state = createGame({ mode, seed }); startGame(state);
      const inputHash = createHash('sha256'), start = performance.now();
      let maxBullets = 0, maxBeams = 0, maxEvents = 0;
      for (let i = 0; i < 36000 && state.phase === 'playing'; i++) {
        const input = pilotInput(state, policy);
        inputHash.update(JSON.stringify(input)); stepGame(state, input);
        maxBullets = Math.max(maxBullets, state.bullets.length); maxBeams = Math.max(maxBeams, state.beams.length); maxEvents = Math.max(maxEvents, state.events.length);
      }
      assertRoster(state.rosters.friendly); assertRoster(state.rosters.enemy); assertStats(state);
      const record = { mode, seed, group: tuningSeeds.includes(seed) ? 'tuning' : 'confirmation', policy,
        tick: state.tick, seconds: state.elapsed, outcome: state.result?.outcome ?? (state.fault ? 'fault' : 'cutoff-600s'), fault: state.fault,
        score: state.result?.score ?? null, enemyDestroyed: rosterCounts(state.rosters.enemy).D, friendlyLosses: rosterCounts(state.rosters.friendly).D,
        stats: state.stats, cityHealth: state.city.reduce((sum, d) => sum + d.health, 0),
        maxBullets, maxBeams, maxEvents, inputDigest: inputHash.digest('hex'), cpuMs: performance.now() - start,
      };
      rows.push(record); console.log(JSON.stringify(record));
      await writeFile(`artifacts/balance/${output}`, JSON.stringify({ generatedAt: new Date().toISOString(), simulationSourceDigest, policyDigest, rules: RULES_VERSION, partition, partitions, explorationLimitSeconds: 600, tuningSeeds, confirmationSeeds, policyDescription: 'Accepted FlightInput only; no state mutation after Start; observes fixed-tick state, not a human playtest. Easy manual fire is not emitted. See legal-pilot.ts and policyDigest for the exact input policy.', rows }, null, 2) + '\n');
    }
  }
}
const faults = rows.filter(r => r.fault);
if (faults.length) throw new Error(`${faults.length} simulation faults; see evidence`);
