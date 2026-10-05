/** MachiMamore rules, independent of the source games' mission rules. */
export const RULES_VERSION = 'machimamore-2';
export const SCORE_RULES = Object.freeze({ ufoKill: 1000, ufoDamage: 5, timeBonus: 30000, timeScale: 180, playerLoss: 2000, allyLoss: 500, accuracyPenalty: 10000, cityDestroyed: 2000, cityDamage: 2 });
export const TICK_RATE = 60;
export const FIXED_DT = 1 / TICK_RATE;
export const TOTAL_AIRCRAFT = 50;
export const ACTIVE_LIMIT = 8;
export const RESPAWN_TICKS = 180;
export const SPAWN_BLOCK_TIMEOUT_TICKS = 300;
export const AIRCRAFT_HEALTH = 80;
export const UFO_HEALTH = 80;
export const MG_CAPACITY = 288;
export const CANNON_CAPACITY = 96;
export const RELOAD_TICKS = 360;
export const PLAYER_MG_INTERVAL = 5;
export const PLAYER_CANNON_INTERVAL = 15;
/**
 * V2 wing cadence doubles pinned Kaisen's 17/57-tick intervals. Isolated legal
 * input comparisons made Easy exhaustion reproducible and rewarded defensive
 * play with the predictive driver. Evidence: artifacts/cadence-experiment/.
 */
export const ALLY_MG_INTERVAL = 34;
export const ALLY_CANNON_INTERVAL = 114;
export const MAX_BULLETS = 2048;
export const BULLET_LIFETIME_TICKS = 90;
export const LASER_WARNING_TICKS = 30;
export const LASER_LIFETIME_TICKS = 60;
export const LASER_INTERVAL_TICKS = 12;
export const LASER_MAX_BURST = 5;
export const LASER_COOLDOWN_TICKS = 180;
export const LASER_RANGE = 1200;
export const LASER_RADIUS = 2;
export const LASER_AIRCRAFT_DPS = 8;
export const LASER_CITY_DPS = 4;
export const MAX_BEAMS = 40;
export const UFO_MAX_SPEED = 120;
export const UFO_ACCELERATION = 60;
export const UFO_MIN_ALTITUDE = 80;
export const UFO_BOUNDARY_MARGIN = 30;
export const CITY_DISTRICTS = 20;
export const CITY_DISTRICT_HEALTH = 250;
export const CITY_TOTAL_HEALTH = 5000;
export const CITY_COLLISION_DAMAGE = 50;
/** HP below this explicit tolerance is destroyed; UI rounding is never used. */
export const HP_EPSILON = 1e-8;
export const WORLD_BOUNDS = Object.freeze({ minX: -1800, maxX: 1800, minZ: -2000, maxZ: 2000, minY: 20, maxY: 1100 });
/** Source: Kaisen 5f4565e, aircraft-damage.ts, unchanged values. */
export const BASE_DAMAGE = Object.freeze({ player: { mg: 4, cannon: 20 }, ally: { mg: 2.4, cannon: 9.6 } });
export const DAMAGE_BANDS = Object.freeze([
  { fromMetres: 0, mg: 1, cannon: 1 },
  { fromMetres: 200, mg: 0.75, cannon: 0.9 },
  { fromMetres: 500, mg: 0.5, cannon: 0.8 },
  { fromMetres: 800, mg: 0.25, cannon: 0.7 },
]);
export function damageMultiplier(kind: 'mg' | 'cannon', distance: number): number {
  if (!Number.isFinite(distance) || distance < 0) throw new RangeError('Invalid projectile distance');
  return [...DAMAGE_BANDS].reverse().find(band => distance >= band.fromMetres)![kind];
}
