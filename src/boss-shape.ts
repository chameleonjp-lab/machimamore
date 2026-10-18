import { BoxGeometry, BufferGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, Triangle, Vector3 } from 'three';

/** One authoritative, non-rotating mesh contract, in mothership model units. */
export const BOSS_SCALE = .4;
// Targeting hint only; collision broad phases use per-component vertex AABBs.
export const BOSS_HORIZONTAL_RADIUS = 156;
const RING = Object.freeze({ radius: 341, tube: 14, radialSegments: 8, tubularSegments: 56 });
export interface HullPlane { normal: Vector3; constant: number; }
export interface HullPart { planes: HullPlane[]; paddingPlanes: HullPlane[]; triangles: Triangle[]; min: Vector3; max: Vector3; }
export interface BossMesh { geometry: BufferGeometry; material: 'hull' | 'dark' | 'glow'; }
export function createBossMeshes(): BossMesh[] {
  const meshes: BossMesh[] = [];
  const add = (geometry: BufferGeometry, material: BossMesh['material']) => meshes.push({ geometry, material });
  add(new CylinderGeometry(300, 390, 85, 48, 1), 'hull');
  add(new SphereGeometry(1, 12, 8).scale(235, 85, 235).translate(0, 42, 0), 'hull');
  add(new TorusGeometry(RING.radius, RING.tube, RING.radialSegments, RING.tubularSegments).rotateX(Math.PI / 2), 'dark');
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, x = Math.cos(a) * 285, z = Math.sin(a) * 285;
    add(new BoxGeometry(34, 70, 36).translate(x, 48, z), 'dark');
    add(new SphereGeometry(1, 12, 8).scale(9, 4, 9).translate(x, -41, z), 'glow');
  }
  add(new CylinderGeometry(32, 52, 48, 20).translate(0, -61, 0), 'dark');
  return meshes;
}
function convexPart(triangles: Triangle[]): HullPart {
  const points = triangles.flatMap(t => [t.a, t.b, t.c]);
  const center = points.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(points.length);
  const min = new Vector3(Infinity, Infinity, Infinity), max = min.clone().negate(), planes: HullPlane[] = [];
  for (const p of points) { min.min(p); max.max(p); }
  for (const triangle of triangles) {
    if (triangle.getArea() < 1e-9) continue;
    const normal = triangle.getNormal(new Vector3());
    if (normal.dot(center.clone().sub(triangle.a)) > 0) normal.negate();
    const constant = Math.max(...points.map(p => normal.dot(p)));
    if (!planes.some(p => p.normal.distanceToSquared(normal) < 1e-12 && Math.abs(p.constant - constant) < 1e-5)) planes.push({ normal, constant });
  }
  // Supporting guard planes leave the unpadded solid unchanged, but avoid
  // arbitrarily long mitres when the laser footprint offsets an acute edge.
  // Aircraft/spawn queries still use exact rounded triangle features below.
  for (const x of [-1,0,1]) for (const y of [-1,0,1]) for (const z of [-1,0,1]) {
    if (!x && !y && !z) continue;
    const normal = new Vector3(x,y,z).normalize(), constant = Math.max(...points.map(p => normal.dot(p)));
    if (!planes.some(p => p.normal.distanceToSquared(normal) < 1e-12)) planes.push({normal,constant});
  }
  const paddingPlanes = [...planes];
  const edges = new Map<string, Vector3[]>();
  const key = (p: Vector3) => p.toArray().map(v => v.toFixed(4)).join(',');
  for (const triangle of triangles) {
    if (triangle.getArea() < 1e-9) continue;
    const normal = triangle.getNormal(new Vector3());
    if (normal.dot(center.clone().sub(triangle.a)) > 0) normal.negate();
    const vertices = [triangle.a,triangle.b,triangle.c];
    for (let i=0;i<3;i++) {
      const edge = [key(vertices[i]),key(vertices[(i+1)%3])].sort().join('|');
      const normals=edges.get(edge)??[];normals.push(normal);edges.set(edge,normals);
    }
  }
  // Local normal-cone guards touch the same acute edge, unlike distant global
  // axis planes. Split large normal arcs into at most 30-degree spans.
  for (const normals of edges.values()) for(let i=0;i<normals.length;i++) for(let j=i+1;j<normals.length;j++) {
    const a=normals[i],b=normals[j],angle=Math.acos(Math.max(-1,Math.min(1,a.dot(b))));
    const steps=Math.ceil(angle/(Math.PI/6));if(steps<2||Math.sin(angle)<1e-8)continue;
    for(let step=1;step<steps;step++) {
      const t=step/steps,normal=a.clone().multiplyScalar(Math.sin((1-t)*angle)).addScaledVector(b,Math.sin(t*angle)).normalize();
      const constant=Math.max(...points.map(p=>normal.dot(p)));
      if(!paddingPlanes.some(p=>p.normal.distanceToSquared(normal)<1e-12))paddingPlanes.push({normal,constant});
    }
  }
  return { planes, paddingPlanes, triangles, min, max };
}
function geometryPart(geometry: BufferGeometry): HullPart {
  const positions = geometry.getAttribute('position'), index = geometry.index, triangles: Triangle[] = [];
  const count = index?.count ?? positions.count;
  for (let i = 0; i < count; i += 3) {
    const point = (j: number) => new Vector3().fromBufferAttribute(positions, index ? index.getX(j) : j).multiplyScalar(BOSS_SCALE);
    triangles.push(new Triangle(point(i), point(i + 1), point(i + 2)));
  }
  return convexPart(triangles);
}
function makeHull(): HullPart[] {
  const meshes = createBossMeshes(), parts = meshes.filter((_, i) => i !== 2).map(m => geometryPart(m.geometry));
  // The torus is not convex. Each adjacent pair of its 8-sided cross sections
  // forms a closed convex wedge; together they reproduce the rendered ring.
  for (let i = 0; i < RING.tubularSegments; i++) {
    const positions = meshes[2].geometry.getAttribute('position');
    const points: Vector3[][] = [i, i + 1].map(k => Array.from({ length: RING.radialSegments }, (_, j) =>
      new Vector3().fromBufferAttribute(positions, j * (RING.tubularSegments + 1) + k).multiplyScalar(BOSS_SCALE)));

    const triangles: Triangle[] = [], tri = (a: Vector3, b: Vector3, c: Vector3) => triangles.push(new Triangle(a, b, c));
    for (let j = 0; j < RING.radialSegments; j++) { const k = (j + 1) % RING.radialSegments; tri(points[0][j], points[0][k], points[1][j]); tri(points[0][k], points[1][k], points[1][j]); }
    for (const side of points) for (let j = 1; j < RING.radialSegments - 1; j++) tri(side[0], side[j], side[j + 1]);
    parts.push(convexPart(triangles));
  }
  for (const mesh of meshes) mesh.geometry.dispose();
  return parts;
}
export const BOSS_HULL: readonly HullPart[] = makeHull();

/** Segment against a convex piece. Padding is a conservative planar offset,
 * used only for the laser's 2 m footprint (not aircraft sphere contacts). */
export function hullSegmentFraction(start: Vector3, end: Vector3, part: HullPart, padding = 0): number | null {
  let lo = 0, hi = 1;
  const delta = end.clone().sub(start);
  for (const axis of ['x', 'y', 'z'] as const) {
    const lower = part.min[axis] - padding, upper = part.max[axis] + padding;
    if (Math.abs(delta[axis]) < 1e-12) { if (start[axis] < lower || start[axis] > upper) return null; }
    else { const a = (lower - start[axis]) / delta[axis], b = (upper - start[axis]) / delta[axis]; lo = Math.max(lo, Math.min(a,b)); hi = Math.min(hi, Math.max(a,b)); if (lo > hi + 1e-9) return null; }
  }
  lo = 0; hi = 1;
  for (const plane of padding > 0 ? part.paddingPlanes : part.planes) {
    const distance = plane.constant + padding - plane.normal.dot(start), change = plane.normal.dot(delta);
    if (Math.abs(change) < 1e-12) { if (distance < -1e-7) return null; continue; }
    const fraction = distance / change;
    if (change < 0) lo = Math.max(lo, fraction); else hi = Math.min(hi, fraction);
    if (lo > hi + 1e-9) return null;
  }
  return lo <= 1 && hi >= 0 ? Math.max(0, lo) : null;
}
function sphereFraction(start: Vector3, delta: Vector3, center: Vector3, radius: number): number | null {
  const offset = start.clone().sub(center), c = offset.lengthSq() - radius * radius;
  if (c <= 1e-8) return 0;
  const a = delta.lengthSq(), b = offset.dot(delta), d = b * b - a * c;
  if (a < 1e-12 || d < 0) return null;
  const t = (-b - Math.sqrt(d)) / a;
  return t >= 0 && t <= 1 ? t : null;
}
/** Exact swept sphere vs closed triangle mesh, in relative translation space.
 * Face, finite-edge and vertex roots prevent both tunnelling and corner ghosts. */
export function hullSphereFraction(start: Vector3, end: Vector3, radius: number, parts: readonly HullPart[] = BOSS_HULL): number | null {
  let best: number | null = null;
  const delta = end.clone().sub(start), closest = new Vector3();
  const keep = (t: number | null) => { if (t !== null && t >= 0 && t <= 1 && (best === null || t < best)) best = t; };
  for (const part of parts) {
    if (hullSegmentFraction(start, end, part, radius) === null) continue;
    if (part.planes.every(p => p.normal.dot(start) <= p.constant + 1e-7)) return 0;
    for (const triangle of part.triangles) {
      if (triangle.getArea() < 1e-9) continue;
      triangle.closestPointToPoint(start, closest);
      if (closest.distanceToSquared(start) <= radius * radius + 1e-8) return 0;
      const normal = triangle.getNormal(new Vector3()), speed = normal.dot(delta), offset = normal.dot(start.clone().sub(triangle.a));
      if (Math.abs(speed) > 1e-12) for (const sign of [-1, 1]) {
        const t = (sign * radius - offset) / speed;
        if (t >= 0 && t <= 1) {
          const contact = start.clone().addScaledVector(delta, t).addScaledVector(normal, -sign * radius);
          if (triangle.containsPoint(contact)) keep(t);
        }
      }
      const vertices = [triangle.a, triangle.b, triangle.c];
      for (let i = 0; i < 3; i++) {
        const a = vertices[i], edge = vertices[(i + 1) % 3].clone().sub(a), lengthSq = edge.lengthSq();
        keep(sphereFraction(start, delta, a, radius));
        if (lengthSq < 1e-12) continue;
        const from = start.clone().sub(a), alongStart = from.dot(edge) / lengthSq, alongDelta = delta.dot(edge) / lengthSq;
        const perpendicularStart = from.addScaledVector(edge, -alongStart), perpendicularDelta = delta.clone().addScaledVector(edge, -alongDelta);
        const t = sphereFraction(perpendicularStart, perpendicularDelta, new Vector3(), radius);
        if (t !== null && alongStart + alongDelta * t >= 0 && alongStart + alongDelta * t <= 1) keep(t);
      }
    }
  }
  return best;
}
