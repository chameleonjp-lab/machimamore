import { ACTIVE_LIMIT, RESPAWN_TICKS, SPAWN_BLOCK_TIMEOUT_TICKS, TOTAL_AIRCRAFT } from './rules';
import type { RespawnReservation, Roster, RosterCounts, Team } from './types';
export function createRoster(team: Team, activeLimit = ACTIVE_LIMIT): Roster {
  return {
    team,
    tokens: Array.from({ length: TOTAL_AIRCRAFT }, (_, id) => ({ id, status: id < activeLimit ? 'active' : 'reserve', slot: id < activeLimit ? id : null, generation: id < activeLimit ? 1 : 0, maxHealth: 80, damageTaken: 0 })),
    slots: Array.from({ length: activeLimit }, (_, i) => i), generations: Array(activeLimit).fill(1), reservations: [],
  };
}
export function rosterCounts(roster: Roster): RosterCounts {
  const counts = { A: 0, Q: 0, R: 0, D: 0, remaining: 0 };
  for (const token of roster.tokens) counts[token.status === 'active' ? 'A' : token.status === 'queued' ? 'Q' : token.status === 'reserve' ? 'R' : 'D']++;
  counts.remaining = counts.A + counts.Q + counts.R;
  return counts;
}
export function assertRoster(roster: Roster): void {
  const c = rosterCounts(roster);
  if (c.A + c.Q + c.R + c.D !== 50 || c.A + c.Q > roster.slots.length) throw new Error('Roster conservation failed');
  if (new Set(roster.tokens.map(t => t.id)).size !== 50 || roster.tokens.some((t, i) => t.id !== i)) throw new Error('Roster token identity failed');
  const occupied = new Set<number>();
  for (const token of roster.tokens) {
    if (!Number.isFinite(token.damageTaken) || token.damageTaken < 0 || token.damageTaken > token.maxHealth + 1e-6) throw new Error('Token damage exceeded finite health');
    if (token.status === 'active' || token.status === 'queued') {
      if (token.slot === null || token.slot < 0 || token.slot >= roster.slots.length || occupied.has(token.slot)) throw new Error('Duplicate roster slot');
      occupied.add(token.slot);
      if (token.status === 'active' && roster.slots[token.slot] !== token.id) throw new Error('Active token missing from slot');
      if (token.status === 'queued' && !roster.reservations.some(q => q.token === token.id && q.slot === token.slot && q.generation === token.generation)) throw new Error('Queued token missing reservation');
    } else if (token.slot !== null) throw new Error('Unassigned token occupies a slot');
  }
  if (roster.reservations.length !== c.Q || new Set(roster.reservations.map(q => q.token)).size !== c.Q) throw new Error('Duplicate respawn reservation');
  for (let slot = 0; slot < roster.slots.length; slot++) {
    const id = roster.slots[slot];
    if (id !== null && (roster.tokens[id]?.status !== 'active' || roster.tokens[id].slot !== slot)) throw new Error('Stale active slot');
  }
}
/** Retiring an old generation is an idempotent no-op. */
export function destroyToken(roster: Roster, tokenId: number, generation: number): boolean {
  const token = roster.tokens[tokenId];
  if (!token || token.status !== 'active' || token.generation !== generation || token.slot === null) return false;
  roster.slots[token.slot] = null;
  token.status = 'destroyed'; token.slot = null;
  return true;
}
/** All deaths of a tick are collected before this deterministic allocation. */
export function reserveEmptySlots(roster: Roster, tick: number, prioritySlot?: number): RespawnReservation[] {
  const slots = Array.from({ length: roster.slots.length }, (_, i) => i).sort((a, b) => Number(b === prioritySlot) - Number(a === prioritySlot) || a - b);
  const created: RespawnReservation[] = [];
  for (const slot of slots) {
    if (roster.slots[slot] !== null || roster.reservations.some(q => q.slot === slot)) continue;
    const token = roster.tokens.find(t => t.status === 'reserve');
    if (!token) break;
    token.status = 'queued'; token.slot = slot; token.generation = ++roster.generations[slot];
    const q = { token: token.id, slot, generation: token.generation, dueTick: tick + RESPAWN_TICKS, blockedSince: null };
    roster.reservations.push(q); created.push(q);
  }
  return created;
}
export function activateReservations(roster: Roster, tick: number, canSpawn: (reservation: RespawnReservation) => boolean): RespawnReservation[] {
  const activated: RespawnReservation[] = [];
  for (const q of [...roster.reservations].sort((a, b) => a.dueTick - b.dueTick || a.slot - b.slot)) {
    if (q.dueTick > tick) continue;
    if (!canSpawn(q)) {
      q.blockedSince ??= tick;
      if (tick - q.blockedSince >= SPAWN_BLOCK_TIMEOUT_TICKS) throw new Error('出撃回廊が5秒間塞がっています。');
      continue;
    }
    const token = roster.tokens[q.token];
    token.status = 'active'; roster.slots[q.slot] = q.token;
    roster.reservations.splice(roster.reservations.indexOf(q), 1); activated.push(q);
  }
  return activated;
}
