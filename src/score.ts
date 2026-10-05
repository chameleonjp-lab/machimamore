import { cityHealth } from './city';
import { rosterCounts } from './roster';
import { SCORE_RULES } from './rules';
import type { GameResult, GameState, MissionStats, ScoreBreakdown } from './types';
export function createStats(): MissionStats { return { playerKills: 0, allyKills: 0, playerLosses: 0, allyLosses: 0, playerDamage: 0, allyDamage: 0, ufoDamage: 0, cityDamage: 0, cityDestroyed: 0, shots: 0, hits: 0, loops: 0, damageTaken: 0 }; }
export function calculateScore(stats: Readonly<MissionStats>, enemyDestroyed: number, elapsed: number, victory: boolean): ScoreBreakdown {
  const ufoDestruction = SCORE_RULES.ufoKill * enemyDestroyed;
  const damage = SCORE_RULES.ufoDamage * stats.ufoDamage;
  const time = victory ? SCORE_RULES.timeBonus / (1 + elapsed / SCORE_RULES.timeScale) : 0;
  const playerLoss = SCORE_RULES.playerLoss * stats.playerLosses, allyLoss = SCORE_RULES.allyLoss * stats.allyLosses;
  const accuracy = stats.shots > 0 ? SCORE_RULES.accuracyPenalty * (1 - stats.hits / stats.shots) : 0;
  const cityLoss = SCORE_RULES.cityDestroyed * stats.cityDestroyed + SCORE_RULES.cityDamage * stats.cityDamage;
  return { ufoDestruction, damage, time, playerLoss, allyLoss, accuracy, cityLoss, total: Math.floor(ufoDestruction + damage + time - playerLoss - allyLoss - accuracy - cityLoss) };
}
export function assertStats(state: GameState): void {
  const s = state.stats;
  if (s.shots < 0 || s.hits < 0 || s.hits > s.shots || !Number.isInteger(s.shots) || !Number.isInteger(s.hits)) throw new Error('Invalid accuracy ledger');
  if (s.ufoDamage < -1e-8 || s.ufoDamage > 4000 + 1e-6 || s.cityDamage < -1e-8 || s.cityDamage > 5000 + 1e-6) throw new Error('Damage ledger exceeded finite HP');
  if (s.playerLosses + s.allyLosses !== rosterCounts(state.rosters.friendly).D) throw new Error('Friendly loss ownership mismatch');
}
export function freezeResult(state: GameState, outcome: GameResult['outcome'], reason: GameResult['reason']): GameResult {
  const destroyed = rosterCounts(state.rosters.enemy).D;
  const breakdown = Object.freeze(calculateScore(state.stats, destroyed, state.elapsed, outcome === 'victory'));
  return Object.freeze({ outcome, reason, tick: state.tick, time: state.elapsed, mode: state.mode, score: breakdown.total, breakdown,
    stats: Object.freeze({ ...state.stats }), accuracy: state.stats.shots ? state.stats.hits / state.stats.shots : null,
    cityHealth: cityHealth(state.city), cityDestroyed: state.stats.cityDestroyed, enemyDestroyed: destroyed, friendlyRemaining: rosterCounts(state.rosters.friendly).remaining });
}
