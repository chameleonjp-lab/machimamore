/**
 * Fixed review reference: the rounded-box implementation before the broad reject.
 * Extracted from the reviewer's in-memory collision source, including its original
 * absolute and polynomial relative tolerances. Keep independent of production.
 */
import { Vector3 } from 'three';
const EPS = 1e-10;
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
export function segmentRoundedBoxFraction(start: Vector3, end: Vector3, min: Vector3, max: Vector3, radius: number): number | null {
  if (radius <= 0) return segmentBoxFraction(start, end, min, max);
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
