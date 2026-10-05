import { Vector3 } from 'three';
import { CITY_DISTRICT_HEALTH, HP_EPSILON } from './rules';
import type { CityDistrict } from './types';
export function createCity(): CityDistrict[] {
  return Array.from({ length: 20 }, (_, id) => ({
    kind: 'city', id: 200 + id, token: id, generation: 1,
    position: new Vector3((id % 5 - 2) * 220, 34 + (id % 3) * 5, -660 - Math.floor(id / 5) * 190),
    halfExtent: new Vector3(72, 28 + (id % 3) * 5, 64), health: CITY_DISTRICT_HEALTH, maxHealth: CITY_DISTRICT_HEALTH, destroyed: false, attacked: false,
  }));
}
export function cityHealth(city: readonly CityDistrict[]): number { return city.reduce((sum, d) => sum + d.health, 0); }
export function damageDistrict(district: CityDistrict, amount: number): { actual: number; destroyed: boolean } {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError('Invalid city damage');
  if (district.destroyed || district.health <= 0) return { actual: 0, destroyed: false };
  const before = district.health;
  district.health = Math.max(0, before - amount);
  if (district.health < HP_EPSILON) district.health = 0;
  const destroyed = district.health === 0;
  if (destroyed) district.destroyed = true;
  return { actual: before - district.health, destroyed };
}
/** Procedural coastal ground, unrelated to a precise historical map. */
export function groundHeight(position: Vector3): number { return position.z < -350 && Math.abs(position.x) < 1300 ? 6 : 0; }
