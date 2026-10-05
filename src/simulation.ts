import { Euler, Quaternion, Vector3 } from 'three';
import { advanceThrottle, CRUISE_SPEED, desiredFlightInput, forwardOf, MAX_SPEED, updateAircraftMotion, updatePlayerLoop } from './flight';
import { applyEasyShotCorrection, autoFireTarget, getFlightAssist, predictedShotDirection } from './flight-assist';
import { beginAircraftReload, tickAircraftReload } from './ammunition';
import { createCity, cityHealth, damageDistrict, groundHeight } from './city';
import { integrateBeamContacts, movingSphereFraction, nearestBeamContact, segmentBoxFraction, segmentRoundedBoxFraction, segmentSphereFraction, sphereTouchesBox, type Collider } from './collision';
import { advanceLaserAttack, beginLaserWarning, createLaserAttack } from './laser';
import { activateReservations, assertRoster, createRoster, destroyToken, reserveEmptySlots, rosterCounts } from './roster';
import { assertStats, calculateScore, createStats, freezeResult } from './score';
import { moveUfo, seededRandom } from './ufo-ai';
import { ACTIVE_LIMIT, AIRCRAFT_HEALTH, ALLY_CANNON_INTERVAL, ALLY_MG_INTERVAL, BASE_DAMAGE, BULLET_LIFETIME_TICKS, CANNON_CAPACITY, CITY_COLLISION_DAMAGE, CITY_TOTAL_HEALTH, FIXED_DT, HP_EPSILON, LASER_AIRCRAFT_DPS, LASER_CITY_DPS, LASER_RADIUS, LASER_RANGE, MAX_BEAMS, MAX_BULLETS, MG_CAPACITY, PLAYER_CANNON_INTERVAL, PLAYER_MG_INTERVAL, RESPAWN_TICKS, UFO_HEALTH, WORLD_BOUNDS, damageMultiplier } from './rules';
import type { Aircraft, Bullet, CityDistrict, EntityRef, FlightInput, GameEvent, GameState, HudSnapshot, MissionConfig, RespawnReservation, Team, Ufo } from './types';

let nextMissionId = 1;
export const NEUTRAL_INPUT: Readonly<FlightInput> = Object.freeze({ turn: 0, climb: 0, fire: false, loop: false });
function spawnCandidates(team: Team, slot: number): Vector3[] {
  const x = (slot % 4 - 1.5) * 140, z = team === 'friendly' ? 580 + Math.floor(slot / 4) * 140 : -1470 - Math.floor(slot / 4) * 140;
  return [new Vector3(x, team === 'friendly' ? 250 : 280, z), new Vector3(x + 50, 380, z), new Vector3(x - 50, 510, z), new Vector3(x, 650, z), new Vector3(x + 250, 300, z + (team === 'friendly' ? 180 : -180))];
}
function makeFighter(token: number, slot: number, generation: number, position: Vector3): Aircraft {
  return { kind: 'aircraft', id: token, token, slot, generation, team: 'friendly', role: 'wingman', position: position.clone(), previous: position.clone(), quaternion: new Quaternion(),
    yaw: 0, pitch: 0, bank: 0, speed: CRUISE_SPEED, health: AIRCRAFT_HEALTH, maxHealth: AIRCRAFT_HEALTH, radius: 9, velocity: new Vector3(0, 0, -CRUISE_SPEED),
    mg: MG_CAPACITY, cannon: CANNON_CAPACITY, reloadTicksRemaining: 0, nextMgTick: 0, nextCannonTick: 0, loopProgress: 0, loopCooldown: 0 };
}
function makeUfo(token: number, slot: number, generation: number, position: Vector3, tick: number): Ufo {
  return { kind: 'ufo', id: 100 + token, token, slot, generation, team: 'enemy', position: position.clone(), previous: position.clone(), quaternion: new Quaternion(), velocity: new Vector3(0, 0, 70), speed: 70,
    health: UFO_HEALTH, maxHealth: UFO_HEALTH, radius: 14, role: slot < 6 ? 'city-attacker' : 'interceptor', movement: 'linear', movementUntilTick: tick + 180,
    waypoint: position.clone().add(new Vector3(0, 0, 450)), target: null, attack: createLaserAttack() };
}
export function createGame(config: MissionConfig = { mode: 'easy' }): GameState {
  const seed = (config.seed ?? 0x4d414348) >>> 0;
  const state: GameState = { missionId: nextMissionId++, phase: 'ready', mode: config.mode, seed, randomState: seed || 1, tick: 0, elapsed: 0,
    rosters: { friendly: createRoster('friendly'), enemy: createRoster('enemy') }, fighters: [], ufos: [], city: createCity(), bullets: [], beams: [], events: [],
    playerId: 0, playerSlot: 0, pilotReadyTick: 0, controller: { loopHeld: false, assistTurn: 0, assistClimb: 0, responseMultiplier: 1, playerTargetSpeed: CRUISE_SPEED, playerLoopActive: false, loopStartYaw: 0, loopStartPitch: 0, loopStartTurn: 0, loopStartClimb: 0, loopStartSteeringRevision: undefined },
    stats: createStats(), result: null, endReason: null, pauseReasons: [], fault: null, nextAttackId: 1, nextEventId: 1, input: { ...NEUTRAL_INPUT } };
  for (let slot = 0; slot < ACTIVE_LIMIT; slot++) { state.fighters.push(makeFighter(slot, slot, 1, spawnCandidates('friendly', slot)[0])); state.ufos.push(makeUfo(slot, slot, 1, spawnCandidates('enemy', slot)[0], 0)); }
  state.fighters[0].role = 'player';
  return state;
}
export function startGame(state: GameState): void { if (state.phase === 'ready') { state.phase = 'playing'; state.input = { ...NEUTRAL_INPUT }; } }
export function pauseGame(state: GameState, reason = 'manual'): void {
  if (state.phase === 'playing' || state.phase === 'paused') { state.phase = 'paused'; if (!state.pauseReasons.includes(reason)) state.pauseReasons.push(reason); state.input = { ...NEUTRAL_INPUT }; }
}
/** Resume is explicitly invoked by the UI. Closing a dialog never calls it. */
export function resumeGame(state: GameState): void { if (state.phase === 'paused' && !state.fault) { state.pauseReasons = []; state.phase = 'playing'; state.input = { ...NEUTRAL_INPUT }; } }
export function abortGame(state: GameState): void { if (!state.result && state.phase !== 'ready') finishGame(state, 'interrupted', 'interrupted'); }
export function getPlayer(state: GameState): Aircraft | null { return state.fighters.find(f => f.id === state.playerId && f.health > 0) ?? null; }
export function getHudSnapshot(state: GameState): HudSnapshot {
  const hp = cityHealth(state.city), player = getPlayer(state), ownQueue = state.rosters.friendly.reservations.find(q => q.slot === state.playerSlot);
  return { tick: state.tick, time: state.elapsed, mode: state.mode, friendly: rosterCounts(state.rosters.friendly), enemy: rosterCounts(state.rosters.enemy),
    cityHealth: hp, cityPercent: hp / CITY_TOTAL_HEALTH * 100, cityDestroyed: state.stats.cityDestroyed, accuracy: state.stats.shots ? state.stats.hits / state.stats.shots : null,
    score: state.result?.score ?? calculateScore(state.stats, rosterCounts(state.rosters.enemy).D, state.elapsed, false).total, player,
    respawnSeconds: player ? 0 : Math.max(0, ((ownQueue?.dueTick ?? state.pilotReadyTick) - state.tick) * FIXED_DT), waitingFor: player ? null : ownQueue ? 'respawn' : 'takeover' };
}
function emit(state: GameState, type: GameEvent['type'], position: Vector3, owner: number, extra: Partial<GameEvent> = {}): void {
  state.events.push({ id: state.nextEventId++, missionId: state.missionId, tick: state.tick, type, position: position.clone(), owner, ...extra });
}
function refOf(entity: Aircraft | Ufo | CityDistrict): EntityRef { return { kind: entity.kind === 'aircraft' ? 'fighter' : entity.kind, token: entity.token, generation: entity.generation }; }
function resolveRef(state: GameState, ref: EntityRef | null): Aircraft | Ufo | CityDistrict | null {
  if (!ref) return null;
  const entities = ref.kind === 'city' ? state.city : ref.kind === 'ufo' ? state.ufos : state.fighters;
  return entities.find(e => e.token === ref.token && e.generation === ref.generation && e.health > 0) ?? null;
}
function collidersFor(state: GameState, excludedId?: number, beamRadius = 0): Collider[] {
  const colliders: Collider[] = [];
  for (const e of [...state.fighters, ...state.ufos]) if (e.health > 0 && e.id !== excludedId) colliders.push({ shape: 'sphere', key: `${e.kind}:${String(e.token).padStart(2, '0')}:${e.generation}`, ref: refOf(e), previous: e.previous, position: e.position, radius: e.radius + beamRadius });
  for (const d of state.city) if (!d.destroyed) colliders.push({ shape: 'box', key: `city:${String(d.token).padStart(2, '0')}`, ref: refOf(d), min: d.position.clone().sub(d.halfExtent), max: d.position.clone().add(d.halfExtent), radius: beamRadius });
  colliders.push({ shape: 'box', key: 'terrain:sea', ref: null, min: new Vector3(-1e6, -1000, -1e6), max: new Vector3(1e6, 0, 1e6), radius: beamRadius });
  colliders.push({ shape: 'box', key: 'terrain:land', ref: null, min: new Vector3(-1300, 0, -1e6), max: new Vector3(1300, 6, -350), radius: beamRadius });
  return colliders;
}
function clearLine(state: GameState, start: Vector3, point: Vector3, ownerId: number, intendedId?: number): boolean {
  const hit = nearestBeamContact(start, point, collidersFor(state, ownerId), 1);
  if (!hit || !hit.collider.ref) return hit === null;
  return resolveRef(state, hit.collider.ref)?.id === intendedId;
}
function spawnSafe(state: GameState, point: Vector3, radius: number): boolean {
  if (point.y - radius <= groundHeight(point)) return false;
  for (const e of [...state.fighters, ...state.ufos]) if (e.health > 0 && point.distanceToSquared(e.position) < (radius + e.radius + 20) ** 2) return false;
  for (const d of state.city) if (!d.destroyed && sphereTouchesBox(point, radius, d.position.clone().sub(d.halfExtent), d.position.clone().add(d.halfExtent))) return false;
  for (const b of state.beams) if (state.tick >= b.birthTick && state.tick < b.expiresTick && segmentSphereFraction(b.start, b.end, point, radius + LASER_RADIUS) !== null) return false;
  return true;
}
function spawnDue(state: GameState): void {
  for (const team of ['friendly', 'enemy'] as const) {
    const points = new Map<number, Vector3>();
    const activated = activateReservations(state.rosters[team], state.tick, q => {
      const point = spawnCandidates(team, q.slot).find(p => spawnSafe(state, p, team === 'friendly' ? 9 : 14));
      if (!point) return false;
      // Occupancy is checked immediately so simultaneous slots cannot overlap.
      points.set(q.token, point);
      const entity = team === 'friendly' ? makeFighter(q.token, q.slot, q.generation, point) : makeUfo(q.token, q.slot, q.generation, point, state.tick);
      if (team === 'friendly') state.fighters.push(entity as Aircraft); else state.ufos.push(entity as Ufo);
      return true;
    });
    for (const q of activated) {
      if (team === 'friendly' && state.playerId === null && q.slot === state.playerSlot) assignPilot(state, state.fighters.find(f => f.token === q.token)!, 'respawn');
      emit(state, 'respawn', points.get(q.token)!, team === 'friendly' ? q.token : 100 + q.token, { detail: team });
    }
  }
}
function assignPilot(state: GameState, fighter: Aircraft, event: 'respawn' | 'takeover'): void {
  for (const f of state.fighters) f.role = f === fighter ? 'player' : 'wingman';
  state.playerId = fighter.id; state.playerSlot = fighter.slot; state.controller.playerTargetSpeed = fighter.speed; state.controller.playerLoopActive = fighter.loopProgress > 0;
  state.controller.loopStartYaw = fighter.yaw; state.controller.loopStartPitch = fighter.pitch;
  state.input = { ...NEUTRAL_INPUT };
  if (event === 'takeover') emit(state, event, fighter.position, fighter.id);
}
function attemptTakeover(state: GameState): void {
  if (getPlayer(state) || state.tick < state.pilotReadyTick || state.rosters.friendly.reservations.some(q => q.slot === state.playerSlot) || rosterCounts(state.rosters.friendly).R > 0) return;
  const fighter = [...state.fighters].filter(f => f.health > 0).sort((a, b) => a.token - b.token)[0];
  if (fighter) assignPilot(state, fighter, 'takeover');
}
function selectTargets(state: GameState): void {
  const reservations = new Map<number, number>();
  for (const d of state.city) d.attacked = false;
  // Fixed warning/burst reservations of every slot precede all new choices.
  for (const u of state.ufos) {
    const locked = resolveRef(state, u.attack.target);
    if ((u.attack.phase === 'warning' || u.attack.phase === 'burst') && locked?.kind === 'city') {
      reservations.set(locked.token, (reservations.get(locked.token) ?? 0) + 1); locked.attacked = true;
    }
  }
  for (const u of [...state.ufos].sort((a, b) => a.slot - b.slot)) {
    const locked = resolveRef(state, u.attack.target);
    if ((u.attack.phase === 'warning' || u.attack.phase === 'burst') && locked) { u.target = u.attack.target; continue; }
    let target: Aircraft | CityDistrict | null = null;
    if (u.role === 'interceptor') target = [...state.fighters].filter(f => f.health > 0 && u.position.distanceTo(f.position) <= LASER_RANGE).sort((a, b) => u.position.distanceToSquared(a.position) - u.position.distanceToSquared(b.position) || a.token - b.token)[0] ?? null;
    if (!target) target = [...state.city].filter(d => d.health > 0 && (reservations.get(d.token) ?? 0) < 2).sort((a, b) => u.position.distanceToSquared(a.position) - u.position.distanceToSquared(b.position) || a.token - b.token)[0] ?? null;
    u.target = target ? refOf(target) : null;
    if (target?.kind === 'city') { reservations.set(target.token, (reservations.get(target.token) ?? 0) + 1); target.attacked = true; }
  }
}
function updateUfos(state: GameState): void {
  selectTargets(state);
  for (const ufo of state.ufos) {
    const target = resolveRef(state, ufo.target), attackTarget = resolveRef(state, ufo.attack.target);
    const valid = attackTarget !== null && ufo.attack.start.distanceTo(attackTarget.position) <= LASER_RANGE;
    advanceLaserAttack(ufo, state.tick, valid, beam => {
      if (state.beams.length >= MAX_BEAMS) throw new Error('レーザープール上限を超えました。');
      state.beams.push({ ...beam, id: state.nextAttackId++, missionId: state.missionId }); emit(state, 'laser', beam.start, ufo.id); return true;
    });
    moveUfo(ufo, state.tick, () => seededRandom(state), target?.position ?? null, point => {
      if (point.y - ufo.radius <= groundHeight(point)) return false;
      return !state.city.some(d => !d.destroyed && sphereTouchesBox(point, ufo.radius, d.position.clone().sub(d.halfExtent), d.position.clone().add(d.halfExtent)));
    }, (start, end) => !state.city.some(d => !d.destroyed && segmentRoundedBoxFraction(start, end, d.position.clone().sub(d.halfExtent), d.position.clone().add(d.halfExtent), ufo.radius) !== null));
    // The preceding finite braking phase must finish before fixing the muzzle.
    if (target && ufo.movement === 'stationary' && ufo.speed < 1e-8 && state.tick >= ufo.attack.cooldownUntilTick && ufo.position.distanceTo(target.position) <= LASER_RANGE && clearLine(state, ufo.position, target.position, ufo.id, target.id)) {
      if (beginLaserWarning(ufo.attack, state.tick, ufo.position, target.position, refOf(target))) emit(state, 'warning', ufo.position, ufo.id, { target: target.id, targetKind: target.kind === 'aircraft' ? 'aircraft' : 'city' });
    }
  }
}
function fireAircraft(state: GameState, fighter: Aircraft, firing: boolean, target: Ufo | null): void {
  if (!firing || fighter.reloadTicksRemaining > 0 || fighter.health <= 0) return;
  const playerOwned = fighter.id === state.playerId;
  for (const kind of ['mg', 'cannon'] as const) {
    const clock = kind === 'mg' ? 'nextMgTick' : 'nextCannonTick';
    if (state.tick < fighter[clock] || fighter[kind] < 2) continue;
    if (state.bullets.length + 2 > MAX_BULLETS) throw new Error('航空弾プール上限を超えました。');
    for (const side of [-1, 1]) {
      const forward = forwardOf(fighter), offset = kind === 'mg' ? new Vector3(side * 0.3, 0.52, -4.25) : new Vector3(side * 2.5, 0, -2.4);
      const position = fighter.position.clone().add(offset.applyQuaternion(fighter.quaternion));
      const speed = fighter.speed + (kind === 'mg' ? 820 : 700);
      const prediction = target ? predictedShotDirection(position, forward, target, speed, BULLET_LIFETIME_TICKS * FIXED_DT) : forward;
      const direction = playerOwned && state.mode === 'easy' ? applyEasyShotCorrection(forward, prediction) : !playerOwned ? prediction : forward;
      if (!playerOwned) { direction.x += Math.sin(state.tick * 1.7 + fighter.id * 3 + side) * 0.012; direction.y += Math.cos(state.tick * 1.3 + fighter.id * 2 + side) * 0.012; direction.normalize(); }
      const bullet: Bullet = { id: state.nextAttackId++, missionId: state.missionId, owner: fighter.id, ownerToken: fighter.token, ownerGeneration: fighter.generation, playerOwned, team: 'friendly', kind,
        position, previous: position.clone(), velocity: direction.multiplyScalar(speed), birthTick: state.tick, expiresTick: state.tick + BULLET_LIFETIME_TICKS, damage: BASE_DAMAGE[playerOwned ? 'player' : 'ally'][kind], distanceTravelled: 0 };
      state.bullets.push(bullet); if (playerOwned) state.stats.shots++;
      emit(state, 'shot', position, fighter.id, { weapon: kind });
    }
    fighter[kind] -= 2;
    fighter[clock] = state.tick + (playerOwned ? kind === 'mg' ? PLAYER_MG_INTERVAL : PLAYER_CANNON_INTERVAL : kind === 'mg' ? ALLY_MG_INTERVAL : ALLY_CANNON_INTERVAL);
  }
  if (beginAircraftReload(fighter)) emit(state, 'reload-start', fighter.position, fighter.id);
}
function updateFighters(state: GameState, input: FlightInput): void {
  for (const fighter of state.fighters) {
    fighter.previous.copy(fighter.position);
    if (tickAircraftReload(fighter)) emit(state, 'reload-complete', fighter.position, fighter.id);
    const candidates = [...state.ufos].filter(u => u.health > 0).sort((a, b) => fighter.position.distanceToSquared(a.position) - fighter.position.distanceToSquared(b.position) || a.token - b.token);
    const target = candidates[0] ?? null;
    let firing = false, firingTarget: Ufo | null = target;
    if (fighter.id === state.playerId) {
      const unobstructed = (u: { position: Vector3 }) => clearLine(state, fighter.position, u.position, fighter.id, state.ufos.find(e => e === u)?.id);
      const assist = getFlightAssist(fighter, state.ufos, input, state.mode, unobstructed);
      const speed = advanceThrottle(state.controller, input, state.mode, FIXED_DT);
      const completed = updatePlayerLoop(fighter, state.controller, { ...input, turn: assist.turn, climb: assist.climb }, input, input.loop, FIXED_DT, speed, MAX_SPEED, assist.responseMultiplier);
      if (completed) { state.stats.loops++; emit(state, 'loop', fighter.position, fighter.id); }
      const automatic = autoFireTarget(fighter, state.ufos, state.mode, input.viewAspect, unobstructed);
      firing = input.fire || automatic !== null; firingTarget = automatic as Ufo | null;
    } else {
      const objective = target ? target.position.clone().addScaledVector(target.velocity, 0.4) : new Vector3(0, 280, -700);
      if (fighter.position.y < 90) objective.y = Math.max(objective.y, 240);
      if (Math.abs(fighter.position.x) > WORLD_BOUNDS.maxX || Math.abs(fighter.position.z) > WORLD_BOUNDS.maxZ) objective.set(0, 280, -700);
      const steering = desiredFlightInput(fighter, objective);
      updateAircraftMotion(fighter, steering.turn, steering.climb, FIXED_DT, CRUISE_SPEED);
      if (target) {
        const direction = target.position.clone().sub(fighter.position), distance = direction.length();
        firing = distance < 1100 && distance > 30 && forwardOf(fighter).angleTo(direction) < 0.16 && clearLine(state, fighter.position, target.position, fighter.id, target.id);
      }
    }
    fighter.velocity.copy(fighter.position).sub(fighter.previous).divideScalar(FIXED_DT);
    fireAircraft(state, fighter, firing, firingTarget);
  }
}
interface DamageRequest { time: number; attackId: number; target: EntityRef | null; amount: number; owner: number; playerOwned: boolean; friendlySource: boolean; bullet?: Bullet; impactPoint?: Vector3; collisionParticipants?: EntityRef[]; }
function projectileRequests(state: GameState): DamageRequest[] {
  const requests: DamageRequest[] = [], survivors: Bullet[] = [];
  const colliders = collidersFor(state);
  for (const bullet of state.bullets) {
    if (bullet.missionId !== state.missionId || state.tick >= bullet.expiresTick) continue;
    bullet.previous.copy(bullet.position); bullet.position.addScaledVector(bullet.velocity, FIXED_DT);
    const travelled = bullet.previous.distanceTo(bullet.position);
    for (const collider of colliders) {
      if (collider.ref?.kind === 'fighter' && collider.ref.token === bullet.ownerToken && collider.ref.generation === bullet.ownerGeneration) continue;
      if (collider.ref?.kind === 'fighter' && (!bullet.playerOwned || state.mode === 'easy')) continue;
      const time = collider.shape === 'box' ? segmentBoxFraction(bullet.previous, bullet.position, collider.min, collider.max) : movingSphereFraction(bullet.previous, bullet.position, collider.previous, collider.position, collider.radius);
      if (time === null) continue;
      const ref = collider.ref;
      const damages = ref && (ref.kind !== 'city' || bullet.playerOwned && state.mode === 'normal');
      requests.push({ time, attackId: bullet.id, target: ref, amount: damages ? bullet.damage * damageMultiplier(bullet.kind, bullet.distanceTravelled + travelled * time) : 0,
        owner: bullet.owner, playerOwned: bullet.playerOwned, friendlySource: true, bullet, impactPoint: bullet.previous.clone().lerp(bullet.position, time) });
    }
    bullet.distanceTravelled += travelled; survivors.push(bullet);
  }
  state.bullets = survivors; return requests;
}
interface BeamDose extends DamageRequest { from: number; to: number; rate: number; }
function beamDoses(state: GameState, from: number): BeamDose[] {
  const doses: BeamDose[] = [];
  for (const beam of state.beams) {
    if (beam.missionId !== state.missionId || state.tick < beam.birthTick || state.tick >= beam.expiresTick || beam.lastIntegratedTick >= state.tick) continue;
    const colliders = collidersFor(state, beam.owner, LASER_RADIUS);
    const slices = integrateBeamContacts(beam.start, beam.aimPoint, colliders, Math.max(from, beam.birthTick - state.tick, 0), Math.min(1, beam.expiresTick - state.tick));
    for (const slice of slices) {
      const ref = slice.collider.ref;
      if (!ref || ref.kind === 'ufo') continue;
      const rate = FIXED_DT * (ref.kind === 'city' ? LASER_CITY_DPS : LASER_AIRCRAFT_DPS);
      doses.push({ time: slice.from, from: slice.from, to: slice.to, rate, attackId: beam.id, target: ref, amount: 0, owner: beam.owner, playerOwned: false, friendlySource: false });
    }
  }
  return doses;
}
function crashRequests(state: GameState): DamageRequest[] {
  const requests: DamageRequest[] = [];
  for (const f of state.fighters) {
    for (const d of state.city) {
      if (d.destroyed) continue;
      const t = segmentRoundedBoxFraction(f.previous, f.position, d.position.clone().sub(d.halfExtent), d.position.clone().add(d.halfExtent), f.radius);
      if (t === null) continue;
      const id = state.nextAttackId++, collisionParticipants = [refOf(f), refOf(d)];
      requests.push({ time: t, attackId: id, target: refOf(d), amount: CITY_COLLISION_DAMAGE, owner: f.id, playerOwned: f.id === state.playerId, friendlySource: true, collisionParticipants });
      requests.push({ time: t, attackId: id, target: refOf(f), amount: f.health, owner: -1, playerOwned: false, friendlySource: false, collisionParticipants });
    }
    for (const terrain of collidersFor(state).filter(c => c.shape === 'box' && c.ref === null)) {
      if (terrain.shape !== 'box') continue;
      const t = segmentRoundedBoxFraction(f.previous, f.position, terrain.min, terrain.max, f.radius);
      if (t === null) continue;
      requests.push({ time: t, attackId: state.nextAttackId++, target: refOf(f), amount: f.health, owner: -1, playerOwned: false, friendlySource: false, collisionParticipants: [refOf(f)] });
    }
    for (const u of state.ufos) {
      const t = movingSphereFraction(f.previous, f.position, u.previous, u.position, f.radius + u.radius);
      if (t === null) continue;
      const id = state.nextAttackId++, collisionParticipants = [refOf(f), refOf(u)];
      requests.push({ time: t, attackId: id, target: refOf(f), amount: f.health, owner: u.id, playerOwned: false, friendlySource: false, collisionParticipants });
      requests.push({ time: t, attackId: id, target: refOf(u), amount: u.health, owner: f.id, playerOwned: f.id === state.playerId, friendlySource: true, collisionParticipants });
    }
  }
  return requests;
}
function applyDamage(state: GameState, request: DamageRequest): boolean {
  const target = resolveRef(state, request.target);
  if (!target) return false;
  if (target.kind === 'city') {
    const damage = damageDistrict(target, request.amount); state.stats.cityDamage += damage.actual;
    if (damage.actual > 0) emit(state, 'damage', target.position, request.owner, { target: target.id, targetKind: 'city', amount: damage.actual });
    if (damage.destroyed) { state.stats.cityDestroyed++; emit(state, 'city-destroyed', target.position, request.owner, { target: target.id, targetKind: 'city' }); }
    const beam = state.beams.find(b => b.id === request.attackId); if (beam) beam.actualDamage += damage.actual;
    return damage.destroyed;
  }
  const before = target.health;
  target.health = Math.max(0, before - request.amount); if (target.health < HP_EPSILON) target.health = 0;
  const actual = before - target.health;
  if (actual <= 0) return false;
  state.rosters[target.team].tokens[target.token].damageTaken += actual;
  emit(state, 'hit', target.position, request.owner, { target: target.id, targetKind: target.kind, amount: actual });
  if (target.kind === 'ufo' && request.friendlySource) {
    state.stats.ufoDamage += actual; state.stats[request.playerOwned ? 'playerDamage' : 'allyDamage'] += actual;
    if (request.bullet?.playerOwned) state.stats.hits++;
  }
  if (target.kind === 'aircraft' && target.id === state.playerId) state.stats.damageTaken += actual;
  const beam = state.beams.find(b => b.id === request.attackId); if (beam) beam.actualDamage += actual;
  if (target.health > 0) return false;
  const roster = state.rosters[target.team];
  if (!destroyToken(roster, target.token, target.generation)) return false;
  if (target.kind === 'aircraft') {
    const wasPlayer = target.id === state.playerId;
    state.stats[wasPlayer ? 'playerLosses' : 'allyLosses']++;
    if (wasPlayer) { state.playerId = null; state.playerSlot = target.slot; state.pilotReadyTick = state.tick + RESPAWN_TICKS; state.controller.playerLoopActive = false; state.input = { ...NEUTRAL_INPUT }; }
  } else if (request.owner >= 0 && request.owner < 50) state.stats[request.playerOwned ? 'playerKills' : 'allyKills']++;
  emit(state, 'kill', target.position, request.owner, { target: target.id, targetKind: target.kind });
  return true;
}
/** Integrate dose to the next collision, surface-order change or HP exhaustion. */
function applyCombat(state: GameState, instantaneous: DamageRequest[]): void {
  instantaneous.sort((a, b) => a.time - b.time || a.attackId - b.attackId || (a.target?.token ?? -1) - (b.target?.token ?? -1));
  const consumed = new Set<number>();
  const collisionValid = new Map<number, boolean>();
  let time = 0, index = 0, doses = beamDoses(state, 0);
  while (time <= 1 + 1e-10) {
    let geometryChanged = false;
    while (index < instantaneous.length && instantaneous[index].time <= time + 1e-10) {
      const request = instantaneous[index++];
      if (request.collisionParticipants) {
        if (!collisionValid.has(request.attackId)) collisionValid.set(request.attackId, request.collisionParticipants.every(ref => resolveRef(state, ref) !== null));
        if (!collisionValid.get(request.attackId)) continue;
      }
      if (request.bullet) {
        if (consumed.has(request.bullet.id) || request.target && !resolveRef(state, request.target)) continue;
        consumed.add(request.bullet.id);
        request.bullet.position.copy(request.impactPoint!);
        request.bullet.distanceTravelled -= request.bullet.velocity.length() * FIXED_DT * (1 - request.time);
        if (!request.amount) { emit(state, 'splash', request.bullet.position, request.owner); continue; }
      }
      geometryChanged = applyDamage(state, request) || geometryChanged;
    }
    if (geometryChanged) doses = beamDoses(state, time);
    if (time >= 1 - 1e-10) break;
    let next = Math.min(1, instantaneous[index]?.time ?? 1);
    for (const dose of doses) {
      if (dose.from > time + 1e-10) next = Math.min(next, dose.from);
      if (dose.to > time + 1e-10) next = Math.min(next, dose.to);
    }
    const active = doses.filter(d => d.from <= time + 1e-10 && d.to > time + 1e-10 && resolveRef(state, d.target));
    const rateByTarget = new Map<string, { target: NonNullable<ReturnType<typeof resolveRef>>; rate: number }>();
    for (const dose of active) {
      const ref = dose.target!, key = `${ref.kind}:${ref.token}:${ref.generation}`;
      const value = rateByTarget.get(key) ?? { target: resolveRef(state, ref)!, rate: 0 };
      value.rate += dose.rate; rateByTarget.set(key, value);
    }
    for (const { target, rate } of rateByTarget.values()) next = Math.min(next, time + target.health / rate);
    const duration = Math.max(0, next - time);
    if (duration < 1e-12) { time = Math.min(1, time + 1e-10); continue; }
    geometryChanged = false;
    for (const dose of active.sort((a, b) => a.attackId - b.attackId || a.target!.token - b.target!.token)) geometryChanged = applyDamage(state, { ...dose, time, amount: dose.rate * duration }) || geometryChanged;
    time = next;
    if (geometryChanged) doses = beamDoses(state, time);
  }
  state.bullets = state.bullets.filter(b => !consumed.has(b.id));
  for (const beam of state.beams) {
    if (state.tick < beam.birthTick || state.tick >= beam.expiresTick || beam.lastIntegratedTick >= state.tick) continue;
    const hit = nearestBeamContact(beam.start, beam.aimPoint, collidersFor(state, beam.owner, LASER_RADIUS));
    beam.end.copy(hit?.point ?? beam.aimPoint); beam.actualTarget = hit?.collider.ref ?? null; beam.lastIntegratedTick = state.tick;
  }
}
function finishGame(state: GameState, outcome: 'victory' | 'defeat' | 'interrupted', reason: NonNullable<GameState['endReason']>): void {
  if (state.result) return;
  state.phase = 'ended'; state.endReason = reason; state.result = freezeResult(state, outcome, reason); state.input = { ...NEUTRAL_INPUT };
  emit(state, 'end', getPlayer(state)?.position ?? new Vector3(), -1, { detail: reason });
}
/** One authoritative 60Hz interval. The renderer never supplies a variable dt. */
export function stepGame(state: GameState, input: FlightInput = NEUTRAL_INPUT): void {
  if (state.phase !== 'playing' || state.result) return;
  state.events = [];
  try {
    state.beams = state.beams.filter(b => b.missionId === state.missionId && state.tick < b.expiresTick);
    const hadPilot = getPlayer(state) !== null;
    spawnDue(state); attemptTakeover(state);
    state.input = hadPilot && getPlayer(state) ? { ...input,
      turn: Number.isFinite(input.turn) ? Math.max(-1, Math.min(1, input.turn)) : 0,
      climb: Number.isFinite(input.climb) ? Math.max(-1, Math.min(1, input.climb)) : 0,
      fire: state.mode === 'normal' && Boolean(input.fire), loop: Boolean(input.loop),
      accelerate: state.mode === 'normal' && Boolean(input.accelerate), brake: state.mode === 'normal' && Boolean(input.brake) } : { ...NEUTRAL_INPUT };
    updateUfos(state); updateFighters(state, state.input);
    applyCombat(state, [...projectileRequests(state), ...crashRequests(state)]);
    state.fighters = state.fighters.filter(f => f.health > 0); state.ufos = state.ufos.filter(u => u.health > 0);
    reserveEmptySlots(state.rosters.friendly, state.tick, state.playerId === null ? state.playerSlot : undefined); reserveEmptySlots(state.rosters.enemy, state.tick);
    state.tick++; state.elapsed = state.tick * FIXED_DT;
    assertRoster(state.rosters.friendly); assertRoster(state.rosters.enemy); assertStats(state);
    if (cityHealth(state.city) <= HP_EPSILON) finishGame(state, 'defeat', 'city-destroyed');
    else if (rosterCounts(state.rosters.friendly).remaining === 0) finishGame(state, 'defeat', 'friendly-exhausted');
    else if (rosterCounts(state.rosters.enemy).remaining === 0) finishGame(state, 'victory', 'all-clear');
  } catch (error) {
    state.fault = error instanceof Error ? error.message : String(error); pauseGame(state, 'simulation-fault'); emit(state, 'fault', new Vector3(), -1, { detail: state.fault });
  }
}
