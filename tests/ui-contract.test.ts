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
    const context=new Proxy({},{get:(_target,name)=> (...args:unknown[])=>{calls.push({name:String(name),args});if(name==='measureText')return{width:String(args[0]).length*8,actualBoundingBoxAscent:9,actualBoundingBoxDescent:3};},set:()=>true}) as CanvasRenderingContext2D;
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
  const {state}=uiFixtureState('notices');
  const collisionCalls:{name:string;args:unknown[]}[]=[];
  const collisionContext=new Proxy({},{get:(_target,name)=> (...args:unknown[])=>{collisionCalls.push({name:String(name),args});if(name==='measureText')return{width:String(args[0]).length*8,actualBoundingBoxAscent:9,actualBoundingBoxDescent:3};},set:()=>true}) as CanvasRenderingContext2D;
  const layouts=[
    {width:320,height:568,anchors:[[98.2,175.0],[221.8,175.0],[241.3,249.8]],keepOuts:[{x:12,y:64,width:144,height:124},{x:164,y:64,width:144,height:124},{x:12,y:230,width:147,height:100}]},
    {width:568,height:320,anchors:[[249.2,98.6],[318.8,98.6],[329.8,140.7]],keepOuts:[{x:12,y:12,width:170,height:40},{x:12,y:68,width:180,height:64},{x:424,y:68,width:132,height:80},{x:12,y:153,width:180,height:46},{x:198,y:200,width:140,height:108},{x:345,y:180,width:70,height:128},{x:71,y:189,width:51,height:102},{x:445,y:185,width:52,height:52},{x:445,y:243,width:52,height:52}]},
  ];
  for(const layout of layouts){
    const camera=new PerspectiveCamera(FLIGHT_FOV,layout.width/layout.height,1,FLIGHT_FAR);
    getFlightCameraPose(getPlayer(state)!,state.mode,camera.position,camera.quaternion);camera.updateMatrixWorld();
    const project=(position:Vector3)=>{const local=position.clone().sub(camera.position).applyQuaternion(camera.quaternion.clone().invert()),point=position.clone().project(camera);return{x:(point.x*.5+.5)*layout.width,y:(.5-point.y*.5)*layout.height,visible:local.z<-.5&&point.z<1&&Math.abs(point.x)<.97&&Math.abs(point.y)<.94,behind:local.z>=-.5};};
    const anchors=[state.ufos[0]!.position,state.fighters[1]!.position,state.city[0]!.position].map(position=>project(position));
    anchors.forEach((point,index)=>{assert.ok(Math.abs(point.x-layout.anchors[index]![0])<1);assert.ok(Math.abs(point.y-layout.anchors[index]![1])<1);});
    const boxes=drawFlightMarkers(collisionContext,layout.width,layout.height,state,true,project,camera,layout.keepOuts);
    assert.deepEqual(boxes.map(box=>box.text.startsWith('街')?'city':box.text),['UFO','味方','city']);
    for(const box of boxes){assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=layout.width&&box.y+box.height<=layout.height);for(const obstacle of layout.keepOuts)assert.ok(box.x+box.width<=obstacle.x||obstacle.x+obstacle.width<=box.x||box.y+box.height<=obstacle.y||obstacle.y+obstacle.height<=box.y,`${box.text} overlaps a HUD or notice keep-out`);}
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i]!,b=boxes[j]!;assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'marker labels do not overlap each other');}
    if(layout.width===320){assert.ok(boxes[0]!.anchorY>anchors[0]!.y+20,'portrait label moves below its fixed marker anchor');assert.ok(collisionCalls.some(call=>call.name==='lineTo'&&call.args[0]===boxes[0]!.anchorX&&call.args[1]===boxes[0]!.y),'a leader line keeps the displaced label tied to its marker');}
  }
  const fallbackState=uiFixtureState('notices').state;fallbackState.fighters=fallbackState.fighters.slice(0,1);for(const district of fallbackState.city)district.attacked=false;
  const fallbackCamera=new PerspectiveCamera(FLIGHT_FOV,320/568,1,FLIGHT_FAR);getFlightCameraPose(getPlayer(fallbackState)!,fallbackState.mode,fallbackCamera.position,fallbackCamera.quaternion);fallbackCamera.updateMatrixWorld();
  let fallbackMeasurements=0;const fallbackContext=new Proxy({},{get:(_target,name)=> (...args:unknown[])=>{if(name==='measureText'){fallbackMeasurements++;return{width:String(args[0]).length*8,actualBoundingBoxAscent:9,actualBoundingBoxDescent:3};}},set:()=>true}) as CanvasRenderingContext2D;
  const fallbackProject=(position:Vector3)=>{const local=position.clone().sub(fallbackCamera.position).applyQuaternion(fallbackCamera.quaternion.clone().invert()),point=position.clone().project(fallbackCamera);return{x:(point.x*.5+.5)*320,y:(.5-point.y*.5)*568,visible:local.z<-.5&&point.z<1&&Math.abs(point.x)<.97&&Math.abs(point.y)<.94,behind:local.z>=-.5};};
  const fallback=drawFlightMarkers(fallbackContext,320,568,fallbackState,true,fallbackProject,fallbackCamera,[{x:0,y:60,width:200,height:220}]);
  assert.deepEqual(fallback.map(box=>box.text),['UFO']);assert.ok(fallback[0]!.x>=203,'dense-label fallback finds the nearest open grid cell');assert.equal(fallbackMeasurements,1,'fallback reuses one text measurement instead of measuring every cell');
});
test('UI driver uses the product entry/styles, guarded boot and a separate legacy suite',()=>{
  const main=source('src/main.ts'), scene=source('src/scene.ts'), markers=source('src/flight-markers.ts'), styles=source('src/style.css'), driver=source('src/ui-test-driver.ts'), config=source('playwright.config.ts');
  assert.match(main,/import\.meta\.env\.DEV && import\.meta\.env\.MODE === 'ui-test'/);
  assert.match(main,/import\('\.\/ui-test-driver'\)/);assert.match(main,/else \{ void prepareGraphics\(\);frameId=requestAnimationFrame\(frame\); \}/);
  assert.match(source('index.html'),/src="\/src\/main.ts"/);assert.match(main,/import '\.\/style\.css'/);
  assert.match(scene,/drawFlightMarkers\(this\.ctx/);assert.match(scene,/markerKeepOuts\.read\(\)/);assert.match(scene,/resize\(\):void\{\s*if\(this\.disposed\)return;this\.markerKeepOuts\.invalidate\(\)/);assert.match(source('src/ui-test-driver.ts'),/drawFlightMarkers\(context/);assert.match(source('src/ui-test-driver.ts'),/markerBoxes/);
  assert.doesNotMatch(markers,/subtree:\s*true|mutationObserver\.observe\([^,]*documentElement/);assert.match(markers,/attributeFilter:\['data-screen','data-mode','data-input'\]/);assert.match(markers,/attributeOldValue:true/);assert.match(markers,/record\.oldValue!==\(record\.target as Element\)\.getAttribute\(record\.attributeName\)/);assert.match(markers,/childList:announcement,characterData:announcement/);assert.match(markers,/if\(!this\.active\)this\.connect\(\)/);
  assert.doesNotMatch(styles,/:has\(\.hud-notices > :not\(\[hidden\]\)\) :is\(\.announcement,\.ally-announcements\)\{display:none\}/);assert.match(styles,/#app\[data-mode="normal"\]\[data-screen="playing"\]:has\(\.hud-notices > :not\(\[hidden\]\)\) :is\(\.announcement,\.ally-announcements\)\{/);assert.match(styles,/left:calc\(max\(12px,var\(--safe-left\)\) \+ min\(46vw,164px\) \+ 8px\)/);assert.match(styles,/width:min\(300px,calc\(100% - 300px\)\)/);assert.match(driver,/announcement\.textContent=name==='notices'\?'街を守りUFO50機を撃破 · 味方残機は自機込み':''/);assert.match(driver,/allyAnnouncement\.textContent=''/);
  assert.match(config,/testDir: '\.\/browser-tests\/ui-only'/);assert.doesNotMatch(config,/swiftshader|waitForMission|test:balance/);
  assert.match(source('playwright.gameplay.config.ts'),/testIgnore: '\*\*\/ui-only\/\*\*'/);
});
