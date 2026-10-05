/** Run only from the isolated /tmp candidate tree; this never edits product source. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createGame, startGame, stepGame } from '../src/simulation';
import { rosterCounts } from '../src/roster';
import { ALLY_CANNON_INTERVAL, ALLY_MG_INTERVAL, RULES_VERSION } from '../src/rules';
import { assertStats } from '../src/score';
import { pilotInput, type Policy } from './legal-pilot';
import type { GameMode } from '../src/types';
const label = process.argv.find(a => a.startsWith('--label='))?.split('=')[1] ?? 'cadence-28-95';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid experiment label');
if (!process.cwd().startsWith('/tmp/machimamore-cadence-')) throw new Error('Cadence experiments require the isolated temporary candidate tree.');
const sourceHash = createHash('sha256');
for (const file of ['simulation', 'types', 'rules', 'roster', 'city', 'score', 'ufo-ai', 'laser', 'collision', 'flight', 'flight-types', 'flight-view', 'flight-assist', 'ammunition'].map(name => `${name}.ts`).sort()) { sourceHash.update(file); sourceHash.update(await readFile(`src/${file}`)); }
const simulationSourceDigest = sourceHash.digest('hex');
const policyDigest = createHash('sha256').update(await readFile('scripts/legal-pilot.ts')).digest('hex');
const rows: unknown[] = [];
await mkdir('artifacts/cadence-experiment', { recursive: true });
for (const mode of ['easy', 'normal'] as GameMode[]) for (const seed of [11, 29, 47]) for (const policy of ['active', 'idle', 'crash-repeat'] as Policy[]) {
  const state = createGame({ mode, seed }); startGame(state); const hash = createHash('sha256'), started = performance.now();
  let maxBullets = 0, maxBeams = 0;
  for (let tick = 0; tick < 36000 && state.phase === 'playing'; tick++) {
    const input = pilotInput(state, policy); hash.update(JSON.stringify(input)); stepGame(state, input);
    maxBullets = Math.max(maxBullets, state.bullets.length); maxBeams = Math.max(maxBeams, state.beams.length);
  }
  assertStats(state);
  const row = { mode, seed, policy, tick: state.tick, seconds: state.elapsed, outcome: state.result?.outcome ?? (state.fault ? 'fault' : 'cutoff-600s'), reason: state.result?.reason,
    score: state.result?.score, friendlyLosses: rosterCounts(state.rosters.friendly).D, enemyDestroyed: rosterCounts(state.rosters.enemy).D,
    cityHealth: state.city.reduce((sum, d) => sum + d.health, 0), stats: state.stats, maxBullets, maxBeams, fault: state.fault,
    inputDigest: hash.digest('hex'), cpuMs: performance.now() - started };
  rows.push(row); console.log(JSON.stringify(row));
  await writeFile(`artifacts/cadence-experiment/${label}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), candidate: true, adopted: false,
    label, simulationSourceDigest, policyDigest, baseRulesVersion: RULES_VERSION, overrides: { allyMgIntervalTicks: ALLY_MG_INTERVAL, allyCannonIntervalTicks: ALLY_CANNON_INTERVAL },
    fixture: 'None: initial createGame and accepted FlightInput only; no state changes after Start.', explorationLimitSeconds: 600, rows }, null, 2) + '\n');
  if (state.fault) throw new Error(state.fault);
}
