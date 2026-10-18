import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { BOSS_HULL, BOSS_SCALE, createBossMeshes, hullSegmentFraction, hullSphereFraction } from '../src/boss-shape';
import { integrateBeamContacts, nearestBeamContact, type Collider } from '../src/collision';

const hullColliders = (previous = new Vector3(), position = previous, padding = 0): Collider[] => BOSS_HULL.map((part, i) => ({shape:'hull',key:`boss:${i}`,ref:{kind:'ufo',token:50,generation:1},previous,position,part,padding}));

test('boss hull parts are convex and share the complete production mesh silhouette', () => {
  const group = new Group();
  for (const part of createBossMeshes()) group.add(new Mesh(part.geometry, new MeshBasicMaterial()));
  group.scale.setScalar(BOSS_SCALE); group.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(group);
  assert.ok(Math.abs(bounds.min.y + 34) < 1e-4); assert.ok(Math.abs(bounds.max.y - 50.8) < 1e-4);
  for (const part of BOSS_HULL) for (const triangle of part.triangles) for (const vertex of [triangle.a,triangle.b,triangle.c])
    for (const plane of part.planes) assert.ok(plane.normal.dot(vertex) <= plane.constant + 1e-4, 'every solid component is convex');
  for (const axis of ['x','y','z'] as const) for (let a = -164.959; a <= 165; a += 11) for (let b = -59.877; b <= 60; b += 6) {
    const start = axis === 'z' ? new Vector3(a,b,400) : axis === 'x' ? new Vector3(400,b,a) : new Vector3(a,400,b);
    const direction = new Vector3(axis==='x'?-1:0,axis==='y'?-1:0,axis==='z'?-1:0), end = start.clone().addScaledVector(direction,800);
    const meshHit = new Raycaster(start,direction,0,800).intersectObject(group,true)[0];
    const hit = nearestBeamContact(start,end,hullColliders());
    assert.equal(Boolean(hit),Boolean(meshHit), `mesh/solid agreement ${axis},${a},${b}`);
    if (hit && meshHit) assert.ok(Math.abs(hit.fraction*800-meshHit.distance)<1e-3, `distance ${axis},${a},${b}: ${hit.fraction*800} vs ${meshHit.distance} key ${hit.collider.key}`);
  }
});

test('sphere sweep rejects overhead voids but hits side, core, face and fast crossings', () => {
  for (const y of [70,100,150]) assert.equal(hullSphereFraction(new Vector3(0,y,300),new Vector3(0,y,-300),9),null);
  assert.notEqual(hullSphereFraction(new Vector3(0,0,300),new Vector3(0,0,-300),9),null);
  assert.notEqual(hullSphereFraction(new Vector3(0,-100,0),new Vector3(0,100,0),9),null);
  assert.equal(hullSphereFraction(new Vector3(0,0,0),new Vector3(0,0,0),9),0);
  assert.equal(hullSphereFraction(new Vector3(0,60,0),new Vector3(0,60,0),9),null);
  assert.notEqual(hullSphereFraction(new Vector3(0,59,0),new Vector3(0,59,0),9),null);
});

test('continuous beam occlusion agrees with independent temporal samples while hull translates through beam', () => {
  const start = new Vector3(-400,25,0), end = new Vector3(400,25,0);
  const colliders = [...hullColliders(new Vector3(0,0,-250),new Vector3(0,0,250),2),
    {shape:'sphere' as const,key:'fighter',ref:{kind:'fighter' as const,token:0,generation:1},previous:new Vector3(220,25,0),position:new Vector3(230,25,0),radius:11}];
  const slices = integrateBeamContacts(start,end,colliders);
  let bossSamples=0,fighterSamples=0;
  for(let i=0;i<2000;i++) {
    const t=(i+.5)/2000, expected=nearestBeamContact(start,end,colliders,t);
    const actual=slices.find(slice=>t>=slice.from&&t<slice.to);
    assert.equal(actual?.collider.ref?.kind,expected?.collider.ref?.kind,`occlusion t=${t}`);
    if(expected?.collider.ref?.kind==='ufo')bossSamples++; else fighterSamples++;
  }
  assert.ok(bossSamples>100&&fighterSamples>100);
});

test('projectile and LOS use the same translating disk; no arbitrary enclosing sphere', () => {
  const start=new Vector3(0,100,300),end=new Vector3(0,100,-300);
  assert.equal(nearestBeamContact(start,end,hullColliders()),null);
  assert.ok(BOSS_HULL.every(part=>hullSegmentFraction(start,end,part)===null));
  const tangent = nearestBeamContact(new Vector3(150,-16,300),new Vector3(150,-16,-300),hullColliders());
  assert.ok(tangent,'wide lower rim remains hittable');
});

test('near-coincident moving convex surfaces retain the exact ordering switch', () => {
  const part=BOSS_HULL[0],start=new Vector3(-400,0,0),end=new Vector3(400,0,0);
  const colliders: Collider[]=[{shape:'hull',key:'a',ref:{kind:'ufo',token:50,generation:1},previous:new Vector3(),position:new Vector3(),part,padding:0},
    {shape:'hull',key:'b',ref:{kind:'ufo',token:51,generation:1},previous:new Vector3(.0001,0,0),position:new Vector3(-.0001,0,0),part,padding:0}];
  const slices=integrateBeamContacts(start,end,colliders);
  assert.equal(slices.find(s=>s.from<=.25&&s.to>.25)?.collider.key,'a');
  assert.equal(slices.find(s=>s.from<=.75&&s.to>.75)?.collider.key,'b');
  assert.ok(Math.abs(slices[0].to-.5)<1e-7);
});

test('laser padding guards do not create a long invisible spike at the acute lower rim', () => {
  const point=new Vector3(0,-19,161),body=BOSS_HULL[0];
  assert.equal(hullSphereFraction(point,point,2,[body]),null);
  assert.equal(hullSegmentFraction(point,point,body,2),null);
});

test('acute-rim laser guards also hold between world-axis directions', () => {
  for(let i=0;i<48;i++) {
    const a=i*Math.PI*2/48,point=new Vector3(Math.cos(a)*161,-19,Math.sin(a)*161);
    assert.equal(hullSegmentFraction(point,point,BOSS_HULL[0],2),null,`azimuth ${i}`);
  }
});

test('closed collision hull contains every Float32 render vertex, including seams and tangencies', () => {
  for(const part of BOSS_HULL)for(const triangle of part.triangles)for(const vertex of [triangle.a,triangle.b,triangle.c])
    assert.equal(hullSegmentFraction(vertex,vertex,part),0,`render vertex ${vertex.toArray()}`);
});

test('actual generated render vertices, including torus Float32 seams, are inside the shared solid', () => {
  for(const mesh of createBossMeshes()) {
    const positions=mesh.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++) {
      const point=new Vector3().fromBufferAttribute(positions,i).multiplyScalar(BOSS_SCALE);
      assert.ok(BOSS_HULL.some(part=>hullSegmentFraction(point,point,part)===0),`actual render vertex ${point.toArray()}`);
    }
    mesh.geometry.dispose();
  }
});
