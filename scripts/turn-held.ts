/** A20: Easy's operative ArrowRight held action, observed inputs only. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createGame, getPlayer, NEUTRAL_INPUT, startGame, stepGame } from '../src/simulation';
import { assertRoster, rosterCounts } from '../src/roster';
import { assertStats } from '../src/score';
import { RULES_VERSION } from '../src/rules';
import type { FlightInput } from '../src/types';

const seeds = [11, 29, 47, 71, 103, 151, 211, 307, 401, 503, 601, 701];
const sourceHash = createHash('sha256');
for (const file of ['simulation', 'types', 'rules', 'roster', 'city', 'score', 'ufo-ai', 'laser', 'collision', 'flight', 'flight-types', 'flight-view', 'flight-assist', 'ammunition'].map(name => `${name}.ts`).sort()) {
  sourceHash.update(file); sourceHash.update(await readFile(`src/${file}`));
}
const simulationSourceDigest = sourceHash.digest('hex');
const policyDigest = createHash('sha256').update(await readFile('scripts/turn-held.ts')).digest('hex');
const held: FlightInput = { ...NEUTRAL_INPUT, turn: 1, climb: 0, fire: false, loop: false, accelerate: false, brake: false, viewAspect: 1366 / 768 };
const neutral: FlightInput = { ...held, turn: 0 };
const rows: unknown[] = [];
await mkdir('artifacts/balance', { recursive: true });
for (const seed of seeds) {
  const state = createGame({ mode: 'easy', seed }); startGame(state);
  const inputHash = createHash('sha256'), started = performance.now();
  let maxBullets = 0, maxBeams = 0, maxEvents = 0;
  for (let tick = 0; tick < 36000 && state.phase === 'playing'; tick++) {
    // Neutral while waiting; a fresh actor receives a fresh ArrowRight press.
    const input = getPlayer(state) ? { ...held } : { ...neutral };
    inputHash.update(JSON.stringify(input)); stepGame(state, input);
    maxBullets = Math.max(maxBullets, state.bullets.length);
    maxBeams = Math.max(maxBeams, state.beams.length);
    maxEvents = Math.max(maxEvents, state.events.length);
  }
  assertRoster(state.rosters.friendly); assertRoster(state.rosters.enemy); assertStats(state);
  const row = { mode: state.mode, seed, policy: 'turn-held', tick: state.tick, seconds: state.elapsed,
    outcome: state.result?.outcome ?? (state.fault ? 'fault' : 'cutoff-600s'), reason: state.result?.reason, fault: state.fault,
    score: state.result?.score ?? null, enemyDestroyed: rosterCounts(state.rosters.enemy).D, friendlyLosses: rosterCounts(state.rosters.friendly).D,
    stats: state.stats, cityHealth: state.city.reduce((sum, d) => sum + d.health, 0), maxBullets, maxBeams, maxEvents,
    inputDigest: inputHash.digest('hex'), caseElapsedWallMs: performance.now() - started };
  rows.push(row); console.log(JSON.stringify(row));
  await writeFile('artifacts/balance/turn-held-easy.json', JSON.stringify({ generatedAt: new Date().toISOString(), rules: RULES_VERSION,
    simulationSourceDigest, policyDigest, mode: 'easy', policy: 'turn-held', operativeKey: 'ArrowRight', seeds, explorationLimitSeconds: 600,
    fixture: 'None: createGame(mode,seed), Start, and accepted FlightInput only. No authoritative writes. Neutral while waiting; ArrowRight re-pressed for a fresh actor.',
    relationToFinal120: 'The frozen fire-held Easy records correspond to inactive Space and therefore idle. This separate operative single-key comparison fills A20 without changing the 120-policy source/input hashes.', rows }, null, 2) + '\n');
  if (state.fault) throw new Error(state.fault);
}
