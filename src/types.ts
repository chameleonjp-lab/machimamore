import type { Quaternion, Vector3 } from 'three';
import type { Aircraft as FlightAircraft, FlightInput, GameMode } from './flight-types';
import type { FlightController } from './flight';
export type { FlightInput, GameMode } from './flight-types';
export type Team = 'friendly' | 'enemy';
export type TokenStatus = 'active' | 'queued' | 'reserve' | 'destroyed';
export interface RosterToken { id: number; status: TokenStatus; slot: number | null; generation: number; maxHealth: number; damageTaken: number; }
export interface RespawnReservation { token: number; slot: number; generation: number; dueTick: number; blockedSince: number | null; }
export interface Roster { team: Team; tokens: RosterToken[]; slots: (number | null)[]; generations: number[]; reservations: RespawnReservation[]; }
export interface RosterCounts { A: number; Q: number; R: number; D: number; remaining: number; }
export interface EntityRef { kind: 'fighter' | 'ufo' | 'city'; token: number; generation: number; }
export interface Aircraft extends FlightAircraft {
  kind: 'aircraft'; id: number; token: number; generation: number; slot: number; team: 'friendly'; role: 'player' | 'wingman';
  previous: Vector3; health: number; maxHealth: number; radius: number; velocity: Vector3;
  mg: number; cannon: number; reloadTicksRemaining: number; nextMgTick: number; nextCannonTick: number;
}
export type UfoMovement = 'linear' | 'braking' | 'stationary' | 'three-dimensional';
export interface LaserAttack {
  phase: 'idle' | 'warning' | 'burst' | 'cooldown'; start: Vector3; aimPoint: Vector3;
  target: EntityRef | null; warningTick: number; firstFireTick: number; nextFireTick: number; fired: number;
  lastExpireTick: number; holdUntilTick: number; cooldownUntilTick: number;
}
export interface Ufo {
  kind: 'ufo'; id: number; token: number; generation: number; slot: number; team: 'enemy';
  position: Vector3; previous: Vector3; quaternion: Quaternion; velocity: Vector3; speed: number;
  health: number; maxHealth: number; radius: number; role: 'city-attacker' | 'interceptor';
  movement: UfoMovement; movementUntilTick: number; brakeNext?: 'stationary' | 'linear'; waypoint: Vector3; target: EntityRef | null; attack: LaserAttack;
}
export interface CityDistrict {
  kind: 'city'; id: number; token: number; generation: number; position: Vector3; halfExtent: Vector3;
  health: number; maxHealth: number; destroyed: boolean; attacked: boolean;
}
export interface Bullet {
  id: number; missionId: number; owner: number; ownerToken: number; ownerGeneration: number; playerOwned: boolean;
  team: 'friendly'; kind: 'mg' | 'cannon'; position: Vector3; previous: Vector3; velocity: Vector3;
  birthTick: number; expiresTick: number; damage: number; distanceTravelled: number;
}
export interface LaserBeam {
  id: number; missionId: number; owner: number; ownerToken: number; ownerGeneration: number;
  start: Vector3; aimPoint: Vector3; end: Vector3; birthTick: number; expiresTick: number;
  lastIntegratedTick: number; actualTarget: EntityRef | null; actualDamage: number;
}
export interface MissionStats {
  playerKills: number; allyKills: number; playerLosses: number; allyLosses: number;
  playerDamage: number; allyDamage: number; ufoDamage: number; cityDamage: number; cityDestroyed: number;
  shots: number; hits: number; loops: number; damageTaken: number;
}
export interface ScoreBreakdown {
  ufoDestruction: number; damage: number; time: number; playerLoss: number; allyLoss: number;
  accuracy: number; cityLoss: number; total: number;
}
export type EndReason = 'all-clear' | 'city-destroyed' | 'friendly-exhausted' | 'interrupted';
export interface GameResult {
  outcome: 'victory' | 'defeat' | 'interrupted'; reason: EndReason; tick: number; time: number; mode: GameMode;
  score: number; breakdown: Readonly<ScoreBreakdown>; stats: Readonly<MissionStats>;
  accuracy: number | null; cityHealth: number; cityDestroyed: number; enemyDestroyed: number; friendlyRemaining: number;
}
export type EventType = 'shot' | 'hit' | 'kill' | 'damage' | 'loop' | 'end' | 'splash' | 'reload-start' | 'reload-complete' | 'respawn' | 'takeover' | 'warning' | 'laser' | 'city-destroyed' | 'fault';
export interface GameEvent {
  id: number; missionId: number; tick: number; type: EventType; position: Vector3;
  owner: number; target?: number; targetKind?: 'aircraft' | 'ufo' | 'city'; amount?: number; weapon?: 'mg' | 'cannon'; detail?: string;
}
export interface MissionConfig { mode: GameMode; seed?: number; }
export interface PlayerController extends FlightController {}
export interface GameState {
  missionId: number; phase: 'ready' | 'playing' | 'paused' | 'ended'; mode: GameMode; seed: number; randomState: number;
  tick: number; elapsed: number; rosters: { friendly: Roster; enemy: Roster };
  fighters: Aircraft[]; ufos: Ufo[]; city: CityDistrict[]; bullets: Bullet[]; beams: LaserBeam[]; events: GameEvent[];
  playerId: number | null; playerSlot: number; pilotReadyTick: number; controller: PlayerController;
  stats: MissionStats; result: GameResult | null; endReason: EndReason | null; pauseReasons: string[]; fault: string | null;
  nextAttackId: number; nextEventId: number; input: FlightInput;
}
export interface HudSnapshot {
  tick: number; time: number; mode: GameMode; friendly: RosterCounts; enemy: RosterCounts;
  cityHealth: number; cityPercent: number; cityDestroyed: number; accuracy: number | null; score: number;
  player: Aircraft | null; respawnSeconds: number; waitingFor: 'respawn' | 'takeover' | null;
}
