import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3, Quaternion } from 'three';
import { getFlightAssist, autoFireTarget } from '../src/flight-assist';
import { FLIGHT_FOV, getFlightCameraPose } from '../src/flight-view';
import { createFlightTargetLock, clearFlightAssistance } from '../src/flight-target';

const input = { turn: 0, climb: 0, fire: false, loop: false, viewAspect: 393 / 852 };
function player(): any { return { id:1,kind:'aircraft',team:'friendly',health:80,position:new Vector3(0,300,0),previous:new Vector3(0,300,0),quaternion:new Quaternion(),pitch:0,yaw:0,bank:0,speed:110,loopProgress:0,loopCooldown:0 }; }
function target(p:any,id:number,x:number,y:number,depth:number):any {
  const position=new Vector3(),rotation=new Quaternion();getFlightCameraPose(p,'easy',position,rotation);
  const tan=Math.tan(FLIGHT_FOV*Math.PI/360);
  return {id,kind:'ufo',team:'enemy',health:80,generation:1,position:new Vector3(x*depth*tan*input.viewAspect,y*depth*tan,-depth).applyQuaternion(rotation).add(position),velocity:new Vector3()};
}
function fire(p:any,targets:any[],lock=createFlightTargetLock()) { return autoFireTarget(p,targets,'easy',input.viewAspect,undefined,lock); }

test('trigger selects a circle target over a closer off-circle target in either order',()=>{
  for(const reversed of [false,true]){const p=player(),a=target(p,2,0,0,950),b=target(p,3,.8,.55,400);assert.equal(fire(p,reversed?[b,a]:[a,b])?.id,2);}
});
test('equal circle ranks have a deterministic ID tie break',()=>{
  for(const reversed of [false,true]){const p=player(),a=target(p,2,.1,0,500),b=target(p,3,.1,0,500);assert.equal(fire(p,reversed?[b,a]:[a,b])?.id,2);}
});
test('trigger replaces a departing target using the current post-motion circle',()=>{
  const p=player(),lock=createFlightTargetLock(),a=target(p,2,0,0,950),b=target(p,3,.8,.55,400);
  assert.equal(fire(p,[a,b],lock),a);a.position.copy(target(p,2,.8,.55,950).position);b.position.copy(target(p,3,0,0,400).position);
  assert.equal(fire(p,[a,b],lock),b);
});
test('dead and absent targets clear the trigger lock; a new generation is selected freshly',()=>{
  const p=player(),a=target(p,2,0,0,500),lock=createFlightTargetLock();fire(p,[a],lock);const first=lock.key;
  a.generation++;assert.equal(fire(p,[a],lock),a);assert.notEqual(lock.key,first);
  a.health=0;assert.equal(fire(p,[a],lock),null);assert.equal(lock.key,null);
});
test('target changes cannot alter small, reverse or neutral manual steering',()=>{
  const p=player(),targets=[target(p,2,.8,.55,500),target(p,3,0,0,400)];
  for(const mode of ['easy','normal'] as const)for(const axes of [{turn:.1,climb:.02},{turn:-.6,climb:-.7},{turn:0,climb:0}]){
    const result=getFlightAssist(p,targets,{...input,...axes},mode);assert.equal(result.turn,axes.turn);assert.equal(result.climb,axes.climb);assert.equal(result.responseMultiplier,1);
  }
});
test('ownership reset discards all assistance history and the old trigger identity',()=>{
  const state={assistTurn:.6,assistClimb:-.4,assistClimbMode:'absolute' as const,responseMultiplier:1.65,targetLock:{key:'old:1',manual:true,changed:true}};
  clearFlightAssistance(state);assert.equal(state.assistTurn,0);assert.equal(state.assistClimb,0);assert.equal(state.responseMultiplier,1);
  assert.equal(Object.hasOwn(state,'assistClimbMode'),false);assert.deepEqual(state.targetLock,{key:null,manual:false,changed:false});
});
