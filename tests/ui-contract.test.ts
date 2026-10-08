import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PerspectiveCamera, Vector3 } from 'three';
import { UI_FIXTURES, uiFixtureState } from '../src/ui-test-driver';
import { drawFlightMarkers } from '../src/flight-markers';
import { FLIGHT_FAR, FLIGHT_FOV, getFlightCameraPose } from '../src/flight-view';
import { getPlayer } from '../src/simulation';

const source=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
test('every UI sample is directly reachable without advancing a game tick',()=>{
  for(const name of UI_FIXTURES){const {state,screen}=uiFixtureState(name);assert.equal(state.tick,0);assert.equal(state.elapsed,0);
    assert.ok(['home','playing','paused','result'].includes(screen));if(screen==='result')assert.equal(state.result?.outcome,name);}
  assert.equal(uiFixtureState('reload').state.fighters[0].reloadTicksRemaining,180);
  assert.equal(uiFixtureState('wait').state.playerId,null);
  const driver=source('src/ui-test-driver.ts');
  assert.doesNotMatch(driver,/\bstepGame\s*\(|\brequestAnimationFrame\s*\(|\bset(?:Timeout|Interval)\s*\(|new\s+WebGLRenderer/);
});
test('the shared product Canvas2D draws labels, offscreen direction and both sights',()=>{
  for(const mode of ['easy','normal'] as const){
    const {state}=uiFixtureState('notices');state.mode=mode;
    const camera=new PerspectiveCamera(FLIGHT_FOV,393/852,1,FLIGHT_FAR);
    getFlightCameraPose(getPlayer(state)!,mode,camera.position,camera.quaternion);camera.updateMatrixWorld();
    const calls:{name:string;args:unknown[]}[]=[];
    const context=new Proxy({},{get:(_target,name)=> (...args:unknown[])=>{calls.push({name:String(name),args});},set:()=>true}) as CanvasRenderingContext2D;
    drawFlightMarkers(context,393,852,state,true,position=>{
      const local=position.clone().sub(camera.position).applyQuaternion(camera.quaternion.clone().invert()),p=position.clone().project(camera);
      return{x:(p.x*.5+.5)*393,y:(.5-p.y*.5)*852,visible:local.z<-.5&&p.z<1&&Math.abs(p.x)<.97&&Math.abs(p.y)<.94,behind:local.z>=-.5};
    },camera);
    const text=calls.filter(x=>x.name==='fillText').map(x=>x.args[0]);
    assert.ok(text.includes('UFO'));assert.ok(text.includes('味方'));assert.ok(text.some(x=>String(x).startsWith('街 1')));
    assert.ok(calls.some(x=>x.name==='rotate'),'offscreen city direction arrow');
    assert.ok(calls.some(x=>x.name==='arc'&&x.args[2]===(mode==='easy'?393*.135:8)),'actual sight drawing');
    calls.length=0;drawFlightMarkers(context,393,852,state,false,()=>{throw new Error('Home must not project markers');},camera);
    assert.deepEqual(calls,[{name:'clearRect',args:[0,0,393,852]}]);
  }
});
test('UI driver uses the product entry/styles, guarded boot and a separate legacy suite',()=>{
  const main=source('src/main.ts'), scene=source('src/scene.ts'), config=source('playwright.config.ts');
  assert.match(main,/import\.meta\.env\.DEV && import\.meta\.env\.MODE === 'ui-test'/);
  assert.match(main,/import\('\.\/ui-test-driver'\)/);assert.match(main,/else \{ void prepareGraphics\(\);frameId=requestAnimationFrame\(frame\); \}/);
  assert.match(source('index.html'),/src="\/src\/main.ts"/);assert.match(main,/import '\.\/style\.css'/);
  assert.match(scene,/drawFlightMarkers\(this\.ctx/);assert.match(source('src/ui-test-driver.ts'),/drawFlightMarkers\(context/);
  assert.match(config,/testDir: '\.\/browser-tests\/ui-only'/);assert.doesNotMatch(config,/swiftshader|waitForMission|test:balance/);
  assert.match(source('playwright.gameplay.config.ts'),/testIgnore: '\*\*\/ui-only\/\*\*'/);
});
