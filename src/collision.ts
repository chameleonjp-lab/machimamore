import { Vector3 } from 'three';
import type { EntityRef } from './types';
const EPS = 1e-10;
export interface SphereCollider { shape: 'sphere'; key: string; ref: EntityRef; previous: Vector3; position: Vector3; radius: number; }
export interface BoxCollider { shape: 'box'; key: string; ref: EntityRef | null; min: Vector3; max: Vector3; radius?: number; }
export type Collider = SphereCollider | BoxCollider;
export interface Contact { collider: Collider; fraction: number; point: Vector3; }
export interface ContactInterval { collider: Collider; from: number; to: number; }

export function segmentSphereFraction(start: Vector3, end: Vector3, center: Vector3, radius: number): number | null {
  const delta = end.clone().sub(start), offset = start.clone().sub(center);
  const c = offset.lengthSq() - radius * radius;
  if (c <= EPS) return 0;
  const a = delta.lengthSq();
  if (a < EPS) return null;
  const b = 2 * offset.dot(delta), discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= -EPS && t <= 1 + EPS ? Math.max(0, Math.min(1, t)) : null;
}
export function movingSphereFraction(a0: Vector3, a1: Vector3, b0: Vector3, b1: Vector3, radius: number): number | null {
  return segmentSphereFraction(a0.clone().sub(b0), a1.clone().sub(b1), new Vector3(), radius);
}
export function segmentBoxFraction(start: Vector3, end: Vector3, min: Vector3, max: Vector3): number | null {
  let lo = 0, hi = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const delta = end[axis] - start[axis];
    if (Math.abs(delta) < EPS) { if (start[axis] < min[axis] || start[axis] > max[axis]) return null; continue; }
    const a = (min[axis] - start[axis]) / delta, b = (max[axis] - start[axis]) / delta;
    lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
    if (lo > hi + EPS) return null;
  }
  return lo <= 1 && hi >= 0 ? Math.max(0, lo) : null;
}
export function sphereTouchesBox(center: Vector3, radius: number, min: Vector3, max: Vector3): boolean {
  return center.distanceToSquared(center.clone().clamp(min, max)) <= radius * radius;
}
/** Exact ray entry into the box's rounded (spherical) radius expansion. */
export function segmentRoundedBoxFraction(start: Vector3, end: Vector3, min: Vector3, max: Vector3, radius: number): number | null {
  if (radius <= 0) return segmentBoxFraction(start, end, min, max);
  // The rounded shape is a subset of this expanded box. A miss therefore
  // proves no contact without finding any rounded-surface polynomial roots.
  // The legacy roots also accept scale*EPS residuals. Bound every quadratic
  // coefficient over all possible clamped box faces, so the broad envelope
  // preserves that relative tolerance as well as the absolute EPS tolerance.
  let broadLo = 0, broadHi = 1;
  let squaredOffsets = radius * radius, mixedOffsets = 0, squaredChanges = 0;
  for (const axis of ['x', 'y', 'z'] as const) {
    const offset = Math.max(Math.abs(start[axis] - min[axis]), Math.abs(start[axis] - max[axis]));
    const change = Math.abs(end[axis] - start[axis]);
    squaredOffsets += offset * offset; mixedOffsets += 2 * offset * change; squaredChanges += change * change;
  }
  const broadRadius = radius + Math.sqrt(Math.max(1, squaredOffsets, mixedOffsets, squaredChanges) * EPS);
  for (const axis of ['x', 'y', 'z'] as const) {
    const change = end[axis] - start[axis], lower = min[axis] - broadRadius, upper = max[axis] + broadRadius;
    if (Math.abs(change) < EPS) { if (start[axis] < lower || start[axis] > upper) return null; continue; }
    const a = (lower - start[axis]) / change, b = (upper - start[axis]) / change;
    broadLo = Math.max(broadLo, Math.min(a, b)); broadHi = Math.min(broadHi, Math.max(a, b));
    if (broadLo > broadHi + EPS) return null;
  }
  const delta = end.clone().sub(start), edges = [0, 1];
  for (const axis of ['x', 'y', 'z'] as const) if (Math.abs(delta[axis]) > EPS) for (const bound of [min[axis], max[axis]]) {
    const t = (bound - start[axis]) / delta[axis]; if (t > 0 && t < 1) edges.push(t);
  }
  edges.sort((a, b) => a - b);
  for (let i = 1; i < edges.length; i++) {
    const lo = edges[i - 1], hi = edges[i], middle = (lo + hi) / 2;
    const c = [-radius * radius, 0, 0];
    for (const axis of ['x', 'y', 'z'] as const) {
      const point = start[axis] + delta[axis] * middle;
      if (point >= min[axis] && point <= max[axis]) continue;
      const offset = start[axis] - (point < min[axis] ? min[axis] : max[axis]);
      c[0] += offset * offset; c[1] += 2 * offset * delta[axis]; c[2] += delta[axis] ** 2;
    }
    if (c[0] + c[1] * lo + c[2] * lo * lo <= EPS) return lo;
    const root = roots(c, lo, hi)[0]; if (root !== undefined) return root;
  }
  return null;
}
export function nearestBeamContact(start: Vector3, end: Vector3, colliders: readonly Collider[], time = 1): Contact | null {
  let best: Contact | null = null;
  for (const collider of colliders) {
    const fraction = collider.shape === 'box'
      ? segmentRoundedBoxFraction(start, end, collider.min, collider.max, collider.radius ?? 0)
      : segmentSphereFraction(start, end, collider.previous.clone().lerp(collider.position, time), collider.radius);
    if (fraction === null) continue;
    if (!best || fraction < best.fraction - EPS || (Math.abs(fraction - best.fraction) <= EPS && collider.key < best.collider.key)) best = { collider, fraction, point: start.clone().lerp(end, fraction) };
  }
  return best;
}

/** Real polynomial roots on a bounded interval, including repeated roots. */
function roots(coefficients: number[], lo: number, hi: number): number[] {
  const c = [...coefficients];
  while (c.length > 1 && Math.abs(c[c.length - 1]) < 1e-12) c.pop();
  const value = (x: number) => c.reduceRight((sum, v) => sum * x + v, 0);
  if (c.length < 2) return [];
  if (c.length === 2) { const r = -c[0] / c[1]; return r >= lo - EPS && r <= hi + EPS ? [Math.max(lo, Math.min(hi, r))] : []; }
  const critical = roots(c.slice(1).map((v, i) => v * (i + 1)), lo, hi);
  const edges = [lo, ...critical.filter(x => x > lo + EPS && x < hi - EPS), hi];
  const found: number[] = [];
  const scale = Math.max(1, ...c.map(Math.abs));
  for (const edge of edges) if (Math.abs(value(edge)) <= scale * 1e-10) found.push(edge);
  for (let i = 1; i < edges.length; i++) {
    let a = edges[i - 1], b = edges[i], va = value(a), vb = value(b);
    if (va * vb >= 0) continue;
    for (let j = 0; j < 52; j++) { const m = (a + b) / 2, vm = value(m); if (va * vm <= 0) { b = m; vb = vm; } else { a = m; va = vm; } }
    found.push((a + b) / 2);
  }
  return [...new Set(found)].sort((a, b) => a - b);
}
function polyAdd(a: number[], b: number[], factor = 1): number[] { return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + factor * (b[i] ?? 0)); }
function polyMultiply(a: number[], b: number[]): number[] {
  const result = Array(a.length + b.length - 1).fill(0) as number[];
  a.forEach((x, i) => b.forEach((y, j) => { result[i + j] += x * y; })); return result;
}
interface SpherePath { collider: SphereCollider; p: number[]; q: number[]; boundaries: number[]; }
function spherePath(start: Vector3, end: Vector3, collider: SphereCollider, from: number, to: number): SpherePath {
  const line = end.clone().sub(start), length = line.length();
  const direction = length > EPS ? line.clone().divideScalar(length) : new Vector3();
  const offset = collider.previous.clone().sub(start), velocity = collider.position.clone().sub(collider.previous);
  const p = [offset.dot(direction), velocity.dot(direction)];
  const perpendicular = offset.clone().addScaledVector(direction, -p[0]);
  const vPerpendicular = velocity.clone().addScaledVector(direction, -p[1]);
  const q = [collider.radius ** 2 - perpendicular.lengthSq(), -2 * perpendicular.dot(vPerpendicular), -vPerpendicular.lengthSq()];
  const boundaries = [from, to, ...roots(q, from, to), ...roots(polyAdd(q, polyMultiply(p, p), -1), from, to), ...roots(polyAdd(q, polyMultiply([p[0] - length, p[1]], [p[0] - length, p[1]]), -1), from, to)];
  return { collider, p, q, boundaries };
}
/**
 * Integrates a fixed beam against linearly moving spheres. Capsule entry/exit
 * and all nearest-surface ordering roots split the interval. This detects a
 * fast crossing even when both fixed-tick endpoints are outside the beam.
 */
export function integrateBeamContacts(start: Vector3, end: Vector3, colliders: readonly Collider[], from = 0, to = 1): ContactInterval[] {
  if (to <= from) return [];
  const paths = colliders.filter((c): c is SphereCollider => c.shape === 'sphere').map(c => spherePath(start, end, c, from, to)).filter(path => {
    const edges = [...path.boundaries].sort((a, b) => a - b);
    return edges.some((v, i) => i > 0 && nearestBeamContact(start, end, [path.collider], (edges[i - 1] + v) / 2) !== null);
  });
  const boundaries = [from, to, ...paths.flatMap(p => p.boundaries)];
  const staticContact = nearestBeamContact(start, end, colliders.filter(c => c.shape === 'box'), 0);
  if (!paths.length) return staticContact ? [{ collider: staticContact.collider, from, to }] : [];
  const relevant = [...paths.map(path => path.collider), ...(staticContact ? [staticContact.collider] : [])];
  const lineLength = start.distanceTo(end);
  for (let i = 0; i < paths.length; i++) {
    const a = paths[i];
    if (staticContact) {
      const relative = [a.p[0] - staticContact.fraction * lineLength, a.p[1]];
      boundaries.push(...roots(polyAdd(a.q, polyMultiply(relative, relative), -1), from, to));
    }
    for (let j = i + 1; j < paths.length; j++) {
      const b = paths[j], dp = polyAdd(a.p, b.p, -1);
      const sum = polyAdd(polyAdd(a.q, b.q), polyMultiply(dp, dp), -1);
      boundaries.push(...roots(polyAdd(polyMultiply(sum, sum), polyMultiply(a.q, b.q).map(x => 4 * x), -1), from, to));
    }
  }
  boundaries.sort((a, b) => a - b);
  const edges = boundaries.filter((v, i) => v >= from - EPS && v <= to + EPS && (i === 0 || v - boundaries[i - 1] > EPS));
  const result: ContactInterval[] = [];
  for (let i = 1; i < edges.length; i++) {
    const lo = edges[i - 1], hi = edges[i];
    if (hi - lo <= EPS) continue;
    const hit = nearestBeamContact(start, end, relevant, (lo + hi) / 2);
    if (!hit) continue;
    const previous = result[result.length - 1];
    if (previous?.collider.key === hit.collider.key && Math.abs(previous.to - lo) < EPS) previous.to = hi;
    else result.push({ collider: hit.collider, from: lo, to: hi });
  }
  return result;
}
