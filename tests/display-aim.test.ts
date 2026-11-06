import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { fixture } from './simulation-fixtures';
import { getPlayer, startGame } from '../src/simulation';
import { getFlightCameraPose } from '../src/flight-view';
import { FlightPresentation } from '../src/flight-presentation';
import { drawFlightMarkers } from '../src/flight-markers';
import { flightTargetKey } from '../src/flight-target';
import type { GameState } from '../src/types';

function sightColor(state:GameState):string{
  const width=402,height=874,camera=new PerspectiveCamera(64,width/height,.5,6500);
  getFlightCameraPose(getPlayer(state)!,'easy',camera.position,camera.quaternion);camera.updateMatrixWorld();
  const properties:Record<string,unknown>={};let color='';
  const context=new Proxy(properties,{get:(object,name)=>name in object?object[String(name)]:(...args:unknown[])=>{
    if(name==='measureText')return{width:50,actualBoundingBoxAscent:9,actualBoundingBoxDescent:3};
    if(name==='fillRect'&&args[2]===2&&args[3]===2)color=String(object.fillStyle);
  },set:(object,name,value)=>{object[String(name)]=value;return true;}}) as CanvasRenderingContext2D;
  const project=(position:Vector3)=>{const local=position.clone().sub(camera.position).applyQuaternion(camera.quaternion.clone().invert()),p=position.clone().project(camera);return{x:(p.x*.5+.5)*width,y:(.5-p.y*.5)*height,visible:local.z<-.5&&Math.abs(p.x)<1&&Math.abs(p.y)<1,behind:local.z>=-.5};};
  drawFlightMarkers(context,width,height,state,true,project,camera);return color;
}
test('Easy contact color follows display-time entry, exit and ID switch without borrowing the live trigger key',()=>{
  const red='#ff645b',white='#ffffff';
  for(const scenario of [
    {before:[75],after:[0],selected:-1,want:[white,red,red]},
    {before:[0],after:[75],selected:0,want:[red,red,white]},
    {before:[0,75],after:[75,0],selected:1,want:[red,red,red]},
  ]){
    const state=fixture(1,scenario.before.length,false);state.mode='easy';const player=getPlayer(state)!;player.position.set(0,800,0);player.previous.copy(player.position);
    state.city.forEach(d=>d.destroyed=true);startGame(state);
    const position=new Vector3(),rotation=new Quaternion();getFlightCameraPose(player,'easy',position,rotation);
    const point=(x:number)=>position.clone().addScaledVector(new Vector3(0,0,-1).applyQuaternion(rotation),500).addScaledVector(new Vector3(1,0,0).applyQuaternion(rotation),x);
    state.ufos.forEach((u,i)=>u.position.copy(point(scenario.before[i])));const view=new FlightPresentation();view.capture(state);
    state.ufos.forEach((u,i)=>u.position.copy(point(scenario.after[i])));state.tick++;
    state.controller.targetLock.key=scenario.selected<0?'departed:99:1':flightTargetKey(state.ufos[scenario.selected]);
    const before=JSON.stringify(state);
    for(const [i,alpha]of [0,.5,1].entries())assert.equal(sightColor(view.sample(state,alpha)),scenario.want[i],`entry/exit/switch at alpha=${alpha}`);
    assert.equal(JSON.stringify(state),before);
  }
});
