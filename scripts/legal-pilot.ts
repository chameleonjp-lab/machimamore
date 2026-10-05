import { Vector3 } from 'three';
import { getPlayer, NEUTRAL_INPUT } from '../src/simulation';
import { clamp, CRUISE_SPEED, forwardOf, MAX_SPEED, normalizeAngle, STALL_SPEED, updateAircraftMotion } from '../src/flight';
import { getFlightAssist, PLAYER_MAX_PITCH } from '../src/flight-assist';
import { rosterCounts } from '../src/roster';
import { BASE_DAMAGE, BULLET_LIFETIME_TICKS, damageMultiplier, FIXED_DT } from '../src/rules';
import type { Aircraft, FlightInput, GameState, Ufo } from '../src/types';

export type Policy = 'active' | 'idle' | 'fire-held' | 'crash-repeat' | 'leave-last';
type Gun = 'mg' | 'cannon';
interface Track { velocity: Vector3; tick: number; acceleration: number; stillSince: number; }
interface PlannedRound { kind: Gun; damage: number; flightTicks: number; }
interface PendingDamage { target: string; damage: number; expiresTick: number; }
interface Proposal { target: string; rounds: PlannedRound[]; }
interface Memory {
  mission: number; player: string; tick: number; mg: number; cannon: number;
  target: string | null; throttle: number; previousInput: FlightInput;
  tracks: Map<string, Track>; pending: PendingDamage[]; proposal: Proposal | null;
  breakUntil: number;
}
const memories = new WeakMap<GameState, Memory>();
const ASPECT = 1366 / 768;
const UFO_RADIUS = 14;
const SAFE_ALTITUDE = 550;
const COLLISION_RADIUS = 23;
const keyOf = (u: { token: number; generation: number }) => `${u.token}:${u.generation}`;

/** Read-only accepted-input driver: forecasts use copied aircraft and external memory. */
export function pilotInput(state: GameState, policy: Policy): FlightInput {
  const player = getPlayer(state);
  if (!player) { memories.delete(state); return { ...NEUTRAL_INPUT }; }
  if (policy === 'idle') return { ...NEUTRAL_INPUT };
  if (policy === 'fire-held') return { ...NEUTRAL_INPUT, fire: state.mode === 'normal' };
  if (policy === 'crash-repeat') return { ...NEUTRAL_INPUT, climb: -1, fire: false };
  if (policy === 'leave-last' && rosterCounts(state.rosters.enemy).remaining <= 1) return { ...NEUTRAL_INPUT };
  const playerKey = keyOf(player);
  let memory = memories.get(state);
  if (!memory || memory.mission !== state.missionId || memory.player !== playerKey) {
    memory = { mission: state.missionId, player: playerKey, tick: state.tick, mg: player.mg, cannon: player.cannon,
      target: null, throttle: CRUISE_SPEED, previousInput: { ...NEUTRAL_INPUT }, tracks: new Map(), pending: [], proposal: null, breakUntil: 0 };
    memories.set(state, memory);
  }
  reconcileObservation(state, player, memory);
  let target = chooseTarget(state, player, memory);
  if (target && player.position.distanceTo(target.position) < 430) memory.breakUntil = Math.max(memory.breakUntil, state.tick + 120);
  const breaking = state.tick < memory.breakUntil;
  const engaging = !breaking && target !== undefined && player.position.y >= 430 && player.position.distanceTo(target.position) < 900;
  const desiredSpeed = engaging ? 92 : 114;
  const accelerate = state.mode === 'normal' && memory.throttle < desiredSpeed - .3;
  const brake = state.mode === 'normal' && memory.throttle > desiredSpeed + .3;
  const preferredSpeed = clamp(memory.throttle + (Number(accelerate) - Number(brake)) * 18 * FIXED_DT, STALL_SPEED, MAX_SPEED);
  let input: FlightInput;
  if (engaging && target) {
    input = aimInput(player, target, state, preferredSpeed);
  } else {
    let objective: Vector3;
    if (breaking) {
      const closest = nearestUfo(state, player);
      const away = closest ? player.position.clone().sub(closest.position).setY(0).normalize() : forwardOf(player).setY(0).normalize();
      objective = player.position.clone().addScaledVector(away, 550); objective.y = SAFE_ALTITUDE;
    } else if (target) {
      objective = target.position.clone(); objective.y = SAFE_ALTITUDE;
    } else {
      objective = new Vector3(0, SAFE_ALTITUDE, -950);
    }
    input = steerTo(player, objective, new Vector3(), state, preferredSpeed);
    // Gain altitude promptly without pointing steeply down at a low UFO.
    if (player.position.y < 430) input.climb = clamp(Math.atan2(SAFE_ALTITUDE - player.position.y, 330) / PLAYER_MAX_PITCH, 0, 1);
    input = pointerCompatible(input);
  }
  input = { ...input, accelerate, brake, viewAspect: ASPECT, fire: false, loop: false };
  const safe = selectSafeInput(player, state, input, preferredSpeed);
  if (safe.changed) { memory.breakUntil = Math.max(memory.breakUntil, state.tick + 90); input = safe.input; }
  else input = safe.input;
  memory.proposal = null;
  if (engaging && !safe.changed && target && state.mode === 'normal') {
    const pose = nextPose(player, state, input, preferredSpeed);
    const rounds = forecastRounds(pose, target, state, memory);
    const queued = pendingFor(memory, target);
    const damage = rounds.reduce((sum, r) => sum + r.damage, 0);
    // Keep shooting when queued rounds are insufficient; other targets remain available.
    if (rounds.length > 0 && queued + damage <= target.health + 1e-8) {
      input.fire = true; memory.proposal = { target: keyOf(target), rounds };
    }
  }
  memory.previousInput = { ...input }; memory.tick = state.tick; memory.mg = player.mg; memory.cannon = player.cannon;
  return input;
}

function reconcileObservation(state: GameState, player: Aircraft, memory: Memory): void {
  const elapsedTicks = Math.max(0, state.tick - memory.tick);
  memory.throttle = clamp(memory.throttle + (Number(Boolean(memory.previousInput.accelerate)) - Number(Boolean(memory.previousInput.brake))) * 18 * elapsedTicks * FIXED_DT, STALL_SPEED, MAX_SPEED);
  if (memory.proposal) {
    for (const kind of ['mg', 'cannon'] as Gun[]) {
      const quantity = Math.max(0, memory[kind] - player[kind]);
      const planned = memory.proposal.rounds.filter(r => r.kind === kind);
      if (quantity > 0 && planned.length > 0) {
        const mean = planned.reduce((sum, r) => sum + r.damage, 0) / planned.length;
        const delay = Math.max(...planned.map(r => r.flightTicks));
        // Browser observations may span several ticks. Ammo decrements confirm real emission.
        memory.pending.push({ target: memory.proposal.target, damage: mean * quantity, expiresTick: state.tick + delay + 2 });
      }
    }
  }
  const alive = new Set(state.ufos.filter(u => u.health > 0).map(keyOf));
  memory.pending = memory.pending.filter(p => p.expiresTick > state.tick && alive.has(p.target));
  for (const u of state.ufos) {
    const key = keyOf(u), previous = memory.tracks.get(key);
    const seconds = previous ? Math.max(FIXED_DT, (state.tick - previous.tick) * FIXED_DT) : FIXED_DT;
    const speed = u.velocity.length();
    memory.tracks.set(key, { velocity: u.velocity.clone(), tick: state.tick,
      acceleration: previous ? u.velocity.distanceTo(previous.velocity) / seconds : 0,
      stillSince: speed < 1 ? previous ? previous.velocity.length() < 1 ? previous.stillSince : state.tick : Number.NEGATIVE_INFINITY : -1 });
  }
  for (const key of memory.tracks.keys()) if (!alive.has(key)) memory.tracks.delete(key);
}

function pendingFor(memory: Memory, target: Ufo): number {
  return memory.pending.filter(p => p.target === keyOf(target)).reduce((sum, p) => sum + p.damage, 0);
}

function chooseTarget(state: GameState, player: Aircraft, memory: Memory): Ufo | undefined {
  const candidates = state.ufos.filter(u => u.health >= 8 && pendingFor(memory, u) < u.health - 2 && player.position.distanceTo(u.position) <= 1500);
  const retained = candidates.find(u => keyOf(u) === memory.target);
  const retainedTrack = retained ? memory.tracks.get(keyOf(retained)) : undefined;
  const retainedFresh = !retainedTrack || retainedTrack.stillSince < 0 || state.tick - retainedTrack.stillSince < 90;
  if (retained && retainedFresh && retained.velocity.length() < 45 && player.position.distanceTo(retained.position) > 440) return retained;
  const priority = (u: Ufo) => {
    const track = memory.tracks.get(keyOf(u));
    const freshStop = u.velocity.length() < 1 && (track?.stillSince ?? -1) >= 0 && state.tick - track!.stillSince < 90;
    const stable = freshStop || u.velocity.length() >= 1 && u.velocity.length() < 35 && (track?.acceleration ?? 0) < 10;
    const direction = u.position.clone().sub(player.position);
    return direction.length() * (stable ? .5 : 1) + (80 - u.health) * 4 + forwardOf(player).angleTo(direction) * 80;
  };
  const target = candidates.sort((a, b) => priority(a) - priority(b) || a.token - b.token)[0];
  memory.target = target ? keyOf(target) : null;
  return target;
}

function interceptTime(relative: Vector3, velocity: Vector3, speed: number): number | null {
  const a = velocity.lengthSq() - speed * speed, b = 2 * relative.dot(velocity), c = relative.lengthSq();
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  if (Math.abs(a) < 1e-9) return b < 0 ? -c / b : null;
  const root = Math.sqrt(disc);
  const values = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter(t => t > 0 && t <= BULLET_LIFETIME_TICKS * FIXED_DT);
  return values.length ? Math.min(...values) : null;
}

function weightedAim(player: Aircraft, target: Ufo): Vector3 {
  const point = new Vector3(), relative = target.position.clone().sub(player.position);
  let totalWeight = 0;
  for (const kind of ['mg', 'cannon'] as Gun[]) {
    if (player[kind] < 2) continue;
    const speed = player.speed + (kind === 'mg' ? 820 : 700);
    const t = interceptTime(relative, target.velocity, speed);
    if (t === null) continue;
    const weight = BASE_DAMAGE.player[kind] * damageMultiplier(kind, speed * t);
    const offset = (kind === 'mg' ? new Vector3(0, .52, -4.25) : new Vector3(0, 0, -2.4)).applyQuaternion(player.quaternion);
    point.addScaledVector(target.position.clone().addScaledVector(target.velocity, t).sub(offset), weight); totalWeight += weight;
  }
  return totalWeight ? point.divideScalar(totalWeight) : target.position.clone();
}

function angularRate(relative: Vector3, velocity: Vector3): { yaw: number; pitch: number } {
  const horizontalSq = relative.x * relative.x + relative.z * relative.z, horizontal = Math.sqrt(horizontalSq);
  const yaw = horizontalSq > 1e-8 ? (relative.z * velocity.x - relative.x * velocity.z) / horizontalSq : 0;
  const horizontalRate = horizontal > 1e-8 ? (relative.x * velocity.x + relative.z * velocity.z) / horizontal : 0;
  const pitch = relative.lengthSq() > 1e-8 ? (horizontal * velocity.y - relative.y * horizontalRate) / relative.lengthSq() : 0;
  return { yaw, pitch };
}

function yawRate(player: Aircraft, response: number): number {
  const low = player.speed <= STALL_SPEED + 20 ? .92 + (player.speed - STALL_SPEED) / 20 * .23
    : player.speed <= CRUISE_SPEED ? 1.15 - (player.speed - (STALL_SPEED + 20)) / (CRUISE_SPEED - (STALL_SPEED + 20)) * .15 : 1;
  const high = clamp(1 - Math.max(0, player.speed - 115) * .008, .78, 1);
  return .82 * low * high * response;
}

function steerTo(player: Aircraft, objective: Vector3, objectiveVelocity: Vector3, state: GameState, preferredSpeed: number): FlightInput {
  const direction = objective.clone().sub(player.position);
  const desiredYaw = Math.atan2(-direction.x, -direction.z);
  const desiredPitch = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
  const relativeVelocity = objectiveVelocity.clone().sub(forwardOf(player).multiplyScalar(player.speed));
  const rate = angularRate(direction, relativeVelocity);
  const response = getFlightAssist(player, state.ufos, { ...NEUTRAL_INPUT, viewAspect: ASPECT }, state.mode).responseMultiplier;
  const turn = clamp(-(3.8 * normalizeAngle(desiredYaw - player.yaw) + rate.yaw) / yawRate(player, response), -1, 1);
  const climb = clamp((desiredPitch + rate.pitch / 4.2 + .75 * (desiredPitch - player.pitch)) / PLAYER_MAX_PITCH, -1, 1);
  return pointerCompatible({ ...NEUTRAL_INPUT, turn, climb });
}

function aimInput(player: Aircraft, target: Ufo, state: GameState, preferredSpeed: number): FlightInput {
  let input = steerTo(player, weightedAim(player, target), target.velocity, state, preferredSpeed);
  const pose = nextPose(player, state, input, preferredSpeed);
  const copiedTarget = { ...target, position: target.position.clone().addScaledVector(target.velocity, FIXED_DT) };
  input = steerTo(player, weightedAim(pose, copiedTarget), target.velocity, state, preferredSpeed);
  return input;
}

function pointerCompatible(input: FlightInput): FlightInput {
  const magnitude = Math.hypot(input.turn, input.climb);
  return magnitude > 1 ? { ...input, turn: input.turn / magnitude, climb: input.climb / magnitude } : input;
}

function cloneAircraft(player: Aircraft): Aircraft {
  return { ...player, position: player.position.clone(), quaternion: player.quaternion.clone(), previous: player.position.clone(),
    velocity: forwardOf(player).multiplyScalar(player.speed) };
}

function nextPose(player: Aircraft, state: GameState, input: FlightInput, preferredSpeed: number): Aircraft {
  const pose = cloneAircraft(player);
  const assist = getFlightAssist(player, state.ufos, input, state.mode);
  updateAircraftMotion(pose, assist.turn, assist.climb, FIXED_DT, preferredSpeed, false, MAX_SPEED, PLAYER_MAX_PITCH, assist.responseMultiplier);
  return pose;
}

function nearestUfo(state: GameState, player: Aircraft): Ufo | undefined {
  return [...state.ufos].sort((a, b) => player.position.distanceToSquared(a.position) - player.position.distanceToSquared(b.position))[0];
}

function closestApproach(player: Aircraft, target: Ufo): { time: number; distance: number } {
  const r = target.position.clone().sub(player.position), v = target.velocity.clone().sub(forwardOf(player).multiplyScalar(player.speed));
  const t = v.lengthSq() > 1e-9 ? clamp(-r.dot(v) / v.lengthSq(), 0, 3) : 0;
  return { time: t, distance: r.addScaledVector(v, t).length() };
}

function safetyScore(player: Aircraft, state: GameState, input: FlightInput, preferredSpeed: number): number {
  const pose = cloneAircraft(player), response = getFlightAssist(player, state.ufos, input, state.mode).responseMultiplier;
  let minimum = Infinity, time = 0;
  for (let step = 0; step < 10; step++) {
    const previous = pose.position.clone();
    updateAircraftMotion(pose, input.turn, input.climb, .2, preferredSpeed, false, MAX_SPEED, PLAYER_MAX_PITCH, response);
    const nextTime = time + .2;
    minimum = Math.min(minimum, (pose.position.y - 150) * 2);
    for (const u of state.ufos) {
      const r0 = previous.clone().sub(u.position.clone().addScaledVector(u.velocity, time));
      const r1 = pose.position.clone().sub(u.position.clone().addScaledVector(u.velocity, nextTime));
      const delta = r1.clone().sub(r0), f = delta.lengthSq() > 1e-9 ? clamp(-r0.dot(delta) / delta.lengthSq(), 0, 1) : 0;
      const uncertainty = Math.min(35, 30 * nextTime * nextTime);
      minimum = Math.min(minimum, r0.addScaledVector(delta, f).length() - COLLISION_RADIUS - uncertainty);
    }
    time = nextTime;
  }
  return minimum;
}

function selectSafeInput(player: Aircraft, state: GameState, base: FlightInput, preferredSpeed: number): { input: FlightInput; changed: boolean } {
  const cpaDanger = state.ufos.some(u => { const cpa = closestApproach(player, u); return cpa.distance < 115 && cpa.time < 3; });
  const score = safetyScore(player, state, base, preferredSpeed);
  if (!cpaDanger && score >= 65) return { input: base, changed: false };
  const choices = [base, ...[-1, 1].flatMap(turn => [0, .5, .85].map(climb => pointerCompatible({ ...base, turn, climb, fire: false }))), { ...base, turn: 0, climb: 1, fire: false }];
  let best = base, bestValue = score;
  for (const choice of choices) {
    const value = safetyScore(player, state, choice, preferredSpeed) - Math.hypot(choice.turn - base.turn, choice.climb - base.climb) * 4;
    if (value > bestValue) { bestValue = value; best = choice; }
  }
  return { input: { ...best, fire: false }, changed: best !== base || score < 65 };
}

function forecastRounds(pose: Aircraft, target: Ufo, state: GameState, memory: Memory): PlannedRound[] {
  if (pose.reloadTicksRemaining > 0 || pose.position.distanceTo(target.position) < 450 || pose.position.distanceTo(target.position) > 850) return [];
  const track = memory.tracks.get(keyOf(target));
  if (target.velocity.length() > 35 || (track?.acceleration ?? 0) > 12) return [];
  const targetPosition = target.position.clone().addScaledVector(target.velocity, FIXED_DT), forward = forwardOf(pose);
  const rounds: PlannedRound[] = [];
  for (const kind of ['mg', 'cannon'] as Gun[]) {
    const clock = kind === 'mg' ? pose.nextMgTick : pose.nextCannonTick;
    if (pose[kind] < 2 || clock > state.tick + 3) continue;
    const speed = pose.speed + (kind === 'mg' ? 820 : 700), bulletVelocity = forward.clone().multiplyScalar(speed);
    for (const side of [-1, 1]) {
      const offset = kind === 'mg' ? new Vector3(side * .3, .52, -4.25) : new Vector3(side * 2.5, 0, -2.4);
      const muzzle = pose.position.clone().add(offset.applyQuaternion(pose.quaternion));
      const r = muzzle.clone().sub(targetPosition), relativeVelocity = bulletVelocity.clone().sub(target.velocity);
      const t = clamp(-r.dot(relativeVelocity) / relativeVelocity.lengthSq(), 0, BULLET_LIFETIME_TICKS * FIXED_DT);
      const miss = r.addScaledVector(relativeVelocity, t).length();
      const uncertainty = 2 + .5 * (track?.acceleration ?? 0) * t * t;
      if (t <= 0 || miss + uncertainty >= UFO_RADIUS - 2) return [];
      // Use the contact time, not the closest-point time, for distance bands.
      const contactAdvance = Math.sqrt(UFO_RADIUS * UFO_RADIUS - miss * miss) / relativeVelocity.length();
      const contactTime = Math.max(0, t - contactAdvance);
      rounds.push({ kind, damage: BASE_DAMAGE.player[kind] * damageMultiplier(kind, speed * contactTime), flightTicks: Math.ceil(contactTime / FIXED_DT) });
    }
  }
  // Only a stop actually observed by this driver gives a usable stationary-age estimate.
  if (target.movement === 'stationary' && (!track || track.stillSince < 0)) return [];
  // Keep arrival inside the initial two-second stationary dwell, with a ten-tick margin.
  if (target.movement === 'stationary' && track && track.stillSince >= 0 && rounds.length > 0
    && state.tick - track.stillSince + Math.max(...rounds.map(r => r.flightTicks)) > 110) return [];
  return rounds;
}
