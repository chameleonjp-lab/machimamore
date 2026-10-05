/** Legal accepted-input exploration. Never writes game state after Start. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { desiredFlightInput, forwardOf } from '../src/flight';
import { createGame, getPlayer, NEUTRAL_INPUT, startGame, stepGame } from '../src/simulation';
import { rosterCounts } from '../src/roster';
import { RULES_VERSION } from '../src/rules';
import type { FlightInput, GameMode, GameState } from '../src/types';
import { pilotInput } from './legal-pilot';
const arg = (name: string, fallback: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const mode = arg('mode', 'easy') as GameMode;
const policies = arg('policies', arg('policy', 'crash-fast')).split(',');
const firstSeed = Number(arg('seed', '1')), count = Number(arg('count', '24'));
const sourceHash = createHash('sha256');
for (const file of ['simulation', 'types', 'rules', 'roster', 'city', 'score', 'ufo-ai', 'laser', 'collision', 'flight', 'flight-types', 'flight-view', 'flight-assist', 'ammunition'].map(name => `${name}.ts`).sort()) { sourceHash.update(file); sourceHash.update(await readFile(`src/${file}`)); }
const simulationSourceDigest = sourceHash.digest('hex');
const policyHash = createHash('sha256');
for (const file of ['scripts/defeat-search.ts', 'scripts/legal-pilot.ts']) { policyHash.update(file); policyHash.update(await readFile(file)); }
const policyDigest = policyHash.digest('hex');
const rows: unknown[] = [];
await mkdir('artifacts/defeat-search', { recursive: true });
for (const policy of policies) for (let seed = firstSeed; seed < firstSeed + count; seed++) {
  let targetId: number | null = null, cityTargetId: number | null = null;
  function inputFor(state: GameState): FlightInput {
    const player = getPlayer(state);
    if (!player) return { ...NEUTRAL_INPUT };
    if (policy === 'active' || policy === 'idle') return pilotInput(state, policy);
    if (policy === 'crash-fast') return { ...NEUTRAL_INPUT, climb: -1, accelerate: mode === 'normal', viewAspect: 1366 / 768 };
    if (policy === 'friendly') {
      let target = state.fighters.find(f => f.id === targetId && f.id !== player.id);
      if (!target) {
        target = state.fighters.filter(f => f.id !== player.id).sort((a, b) => {
          const score = (f: typeof a) => forwardOf(player).angleTo(f.position.clone().sub(player.position)) + player.position.distanceTo(f.position) / 1500;
          return score(a) - score(b);
        })[0];
        targetId = target?.id ?? null;
      }
      if (!target) return { ...NEUTRAL_INPUT, climb: -1, accelerate: mode === 'normal' };
      const point = target.position.clone().addScaledVector(target.velocity, player.position.distanceTo(target.position) / 900);
      const direction = point.clone().sub(player.position), steering = desiredFlightInput(player, point);
      return { ...NEUTRAL_INPUT, turn: steering.turn, climb: Math.max(-1, Math.min(1, Math.atan2(direction.y, Math.hypot(direction.x, direction.z)) / .95)),
        accelerate: mode === 'normal', fire: mode === 'normal' && direction.length() < 1000 && forwardOf(player).angleTo(direction) < .1, viewAspect: 1366 / 768 };
    }
    if (policy === 'city-fire' || policy === 'dead-city') {
      const target = policy === 'dead-city' && cityTargetId !== null ? state.city.find(d => d.token === cityTargetId)
        : [...state.city].filter(d => !d.destroyed).sort((a, b) => player.position.distanceToSquared(a.position) - player.position.distanceToSquared(b.position))[0];
      if (!target) return { ...NEUTRAL_INPUT };
      if (policy === 'dead-city') cityTargetId = target.token;
      const direction = target.position.clone().sub(player.position), steering = desiredFlightInput(player, target.position);
      return { ...NEUTRAL_INPUT, turn: steering.turn, climb: Math.max(-1, Math.min(1, Math.atan2(direction.y, Math.hypot(direction.x, direction.z)) / .95)),
        accelerate: mode === 'normal', fire: mode === 'normal' && forwardOf(player).angleTo(direction) < .14, viewAspect: 1366 / 768 };
    }
    throw new Error(`Unknown policy ${policy}`);
  }
  const state = createGame({ mode, seed }); startGame(state); const hash = createHash('sha256'), started = performance.now();
  for (let tick = 0; tick < 36000 && state.phase === 'playing'; tick++) { const input = inputFor(state); hash.update(JSON.stringify(input)); stepGame(state, input); }
  const row = { mode, seed, policy, tick: state.tick, seconds: state.elapsed, outcome: state.result?.outcome ?? (state.fault ? 'fault' : 'cutoff-600s'), reason: state.result?.reason,
    friendlyLosses: rosterCounts(state.rosters.friendly).D, enemyDestroyed: rosterCounts(state.rosters.enemy).D, cityHealth: state.city.reduce((sum, d) => sum + d.health, 0), stats: state.stats,
    score: state.result?.score, fault: state.fault, inputDigest: hash.digest('hex'), cpuMs: performance.now() - started };
  rows.push(row); console.log(JSON.stringify(row));
  await writeFile(`artifacts/defeat-search/${mode}-${policies.join('-')}-${firstSeed}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), simulationSourceDigest, policyDigest, rules: RULES_VERSION,
    fixture: 'None: createGame({mode,seed}) then startGame; accepts FlightInput only; no post-start HP/time/roster/score writes.', explorationLimitSeconds: 600, rows }, null, 2) + '\n');
  if (row.outcome === 'defeat') break;
  if (state.fault) throw new Error(state.fault);
}
