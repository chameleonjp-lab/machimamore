import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { FlightPresentation } from '../src/flight-presentation';
import { fixture } from './simulation-fixtures';
import { getPlayer, NEUTRAL_INPUT, startGame, stepGame, pauseGame, resumeGame } from '../src/simulation';
import { getFlightCameraPose } from '../src/flight-view';
import { updateQuaternion } from '../src/flight';
import { MachiMamoreScene } from '../src/scene';

test('aircraft and UFO position, attitude and bank use one display fraction without changing simulation', () => {
  const state=fixture(),view=new FlightPresentation(),player=getPlayer(state)!;startGame(state);
  player.pitch=player.bank=0;updateQuaternion(player);const previous=player.position.clone();view.capture(state);
  player.position.x+=10;player.pitch=.4;player.bank=.6;updateQuaternion(player);state.ufos[0].position.x+=20;state.tick++;
  const before=JSON.stringify(state),sample=view.sample(state,.5),display=getPlayer(sample)!;
  assert.equal(display.position.x,previous.x+5);assert.ok(Math.abs(display.pitch-.2)<1e-12);assert.ok(Math.abs(display.bank-.3)<1e-12);
  assert.equal(sample.ufos[0].position.x,state.ufos[0].position.x-10);
  const q=new Quaternion().slerp(player.quaternion,.5);assert.ok(1-Math.abs(display.quaternion.dot(q))<1e-12);
  assert.equal(JSON.stringify(state),before);
});

for(const mode of ['easy','normal'] as const) test(`${mode}: rendering at 30, 60 and 120Hz cannot change flight, bullets, score or clock`,()=>{
  const snapshots:string[]=[];
  for(const rate of [30,60,120]){
    const state=fixture(),view=new FlightPresentation();state.mode=mode;startGame(state);let accumulator=0;
    for(let frame=0;frame<rate;frame++){
      accumulator+=1/rate;while(accumulator+1e-12>=1/60){view.capture(state);stepGame(state,{...NEUTRAL_INPUT,climb:.1,turn:.1,steeringActive:true,fire:state.tick%20<10});accumulator-=1/60;}
      view.sample(state,accumulator*60);
    }
    assert.equal(state.tick,60);assert.equal(state.fault,null);
    snapshots.push(JSON.stringify(state,(key,value)=>key==='missionId'?0:value));
  }
  assert.equal(snapshots[0],snapshots[1]);assert.equal(snapshots[1],snapshots[2]);
});

for(const mode of ['easy','normal'] as const) test(`${mode}: 120Hz camera views never repeat during continuous climb`,()=>{
  const state=fixture(),view=new FlightPresentation();state.mode=mode;getPlayer(state)!.position.y=800;startGame(state);
  const scene:any={camera:{position:new Vector3(),quaternion:new Quaternion()},cameraMission:state.missionId,cameraPlayer:state.playerId,cameraTransferTick:-1,transferPosition:new Vector3(),transferQuaternion:new Quaternion()};
  let accumulator=0,last:Quaternion|null=null,repeats=0;
  for(let frame=0;frame<52;frame++){
    accumulator+=1/120;while(accumulator+1e-12>=1/60){view.capture(state);stepGame(state,{...NEUTRAL_INPUT,climb:.45,steeringActive:true});accumulator-=1/60;}
    const alpha=Math.max(0,Math.min(1,accumulator*60)),sample=view.sample(state,alpha);
    (MachiMamoreScene.prototype as any).updateCamera.call(scene,sample,true,alpha);
    if(frame>=4&&last&&1-Math.abs(last.dot(scene.camera.quaternion))<1e-14)repeats++;
    last=scene.camera.quaternion.clone();
  }
  assert.equal(state.fault,null);assert.equal(repeats,0);
});

test('pause, new mission and new entity generation cannot reuse an old display pose',()=>{
  const view=new FlightPresentation(),state=fixture();startGame(state);view.capture(state);stepGame(state,{...NEUTRAL_INPUT,climb:.45,steeringActive:true});
  pauseGame(state);assert.equal(view.sample(state,0),state);resumeGame(state);assert.equal(view.sample(state,0),state);
  view.capture(state);stepGame(state);getPlayer(state)!.generation++;
  assert.equal(getPlayer(view.sample(state,0)),getPlayer(state));
  const next=fixture();startGame(next);assert.equal(view.sample(next,0),next);
});

test('aircraft takeover camera completes its separate 18-tick transfer once',()=>{
  const state=fixture(2),old=getPlayer(state)!,next=state.fighters[1];startGame(state);
  const scene:any={camera:{position:new Vector3(200,400,600),quaternion:new Quaternion()},cameraMission:state.missionId,cameraPlayer:old.id,cameraTransferTick:-1,transferPosition:new Vector3(),transferQuaternion:new Quaternion()};
  state.playerId=next.id;state.pilotAimReadyTick=state.tick+18;
  (MachiMamoreScene.prototype as any).updateCamera.call(scene,state,true,0);
  assert.deepEqual(scene.camera.position.toArray(),[200,400,600]);
  state.tick+=18;(MachiMamoreScene.prototype as any).updateCamera.call(scene,state,true,0);
  const position=new Vector3(),rotation=new Quaternion();getFlightCameraPose(next,state.mode,position,rotation);
  assert.ok(scene.camera.position.distanceTo(position)<1e-10);assert.ok(1-Math.abs(scene.camera.quaternion.dot(rotation))<1e-12);
  state.tick++;(MachiMamoreScene.prototype as any).updateCamera.call(scene,state,true,0);
  assert.ok(scene.camera.position.distanceTo(position)<1e-10);
});
