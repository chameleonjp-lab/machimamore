import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PerspectiveCamera, Vector3 } from 'three';
import { UI_FIXTURES, uiFixtureState } from '../src/ui-test-driver';
import { chooseRadarLayout, drawFlightMarkers } from '../src/flight-markers';
import { flightTargetKey } from '../src/flight-target';
import { FLIGHT_FAR, FLIGHT_FOV, getFlightCameraPose } from '../src/flight-view';
import { getPlayer } from '../src/simulation';

const source=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
test('every UI sample is directly reachable without advancing a game tick',()=>{
  for(const name of UI_FIXTURES){const {state,screen}=uiFixtureState(name);assert.equal(state.tick,0);assert.equal(state.elapsed,0);
    assert.ok(['home','playing','paused','result'].includes(screen));if(screen==='result')assert.equal(state.result?.outcome,name);}
  assert.equal(uiFixtureState('reload').state.fighters[0].reloadTicksRemaining,180);
  const easyNotices=uiFixtureState('easy-notices').state;assert.equal(easyNotices.mode,'easy');assert.equal(easyNotices.fighters[0].reloadTicksRemaining,180);assert.ok(easyNotices.city.some(district=>district.attacked));
  assert.equal(uiFixtureState('wait').state.playerId,null);
  const driver=source('src/ui-test-driver.ts');
  assert.doesNotMatch(driver,/\bstepGame\s*\(|\brequestAnimationFrame\s*\(|\bset(?:Timeout|Interval)\s*\(|new\s+WebGLRenderer/);
});
test('the shared Canvas2D draws Kaisen-style targets, range/HP marks, radar and both sights',()=>{
  for(const mode of ['easy','normal'] as const){
    const {state}=uiFixtureState('notices');state.mode=mode;
    state.ufos[0]!.health=20;
    const camera=new PerspectiveCamera(FLIGHT_FOV,393/852,1,FLIGHT_FAR);
    getFlightCameraPose(getPlayer(state)!,mode,camera.position,camera.quaternion);camera.updateMatrixWorld();
    const calls:{name:string;args:unknown[];fillStyle?:unknown}[]=[];let fillStyle:unknown;
    const context=new Proxy({},{get:(_target,name)=> (...args:unknown[])=>{calls.push({name:String(name),args,...(name==='fillText'?{fillStyle}:{})});if(name==='measureText')return{width:String(args[0]).length*8,actualBoundingBoxAscent:9,actualBoundingBoxDescent:3};},set:(_target,name,value)=>{if(name==='fillStyle')fillStyle=value;return true;}}) as CanvasRenderingContext2D;
    const project=(position:Vector3)=>{
      const local=position.clone().sub(camera.position).applyQuaternion(camera.quaternion.clone().invert()),p=position.clone().project(camera);
      return{x:(p.x*.5+.5)*393,y:(.5-p.y*.5)*852,visible:local.z<-.5&&p.z<1&&Math.abs(p.x)<.97&&Math.abs(p.y)<.94,behind:local.z>=-.5};
    };
    const before=JSON.stringify(state);
    drawFlightMarkers(context,393,852,state,true,project,camera);
    const text=calls.filter(x=>x.name==='fillText').map(x=>x.args[0]);
    const enemy=project(state.ufos[0]!.position),ally=project(state.fighters[1]!.position),distance=Math.round(getPlayer(state)!.position.distanceTo(state.ufos[0]!.position));
    assert.ok(!text.includes('UFO')&&!text.includes('味方'),'fixed text labels are replaced with the shared color/shape key');
    assert.ok(text.includes(`${distance}m`));assert.ok(text.includes('2.4km'));assert.ok(text.some(x=>String(x).startsWith('街 1')));
    assert.ok(calls.some(call=>call.name==='fillText'&&call.args[0]===`${distance}m`&&call.fillStyle==='#f4e3c8'),'enemy distance text uses the Kaisen marker label color');
    assert.ok(calls.some(x=>x.name==='rotate'),'offscreen city direction arrow');
    const radius=mode==='easy'?Math.min(393,852)*.135:Math.max(26,Math.min(38,Math.min(393,852)*.085));
    assert.ok(calls.some(x=>x.name==='arc'&&x.args[2]===radius),'Kaisen-size sight drawing');
    assert.ok(calls.some(x=>x.name==='moveTo'&&x.args[0]===enemy.x&&x.args[1]===enemy.y-6),'enemy uses the small diamond marker');
    assert.ok(calls.some(x=>x.name==='arc'&&x.args[0]===ally.x&&x.args[1]===ally.y&&x.args[2]===4),'ally uses the small round marker');
    assert.ok(calls.some(x=>x.name==='fillRect'&&x.args[2]===38&&x.args[3]===3),'enemy HP background has the reference dimensions');
    assert.ok(calls.some(x=>x.name==='fillRect'&&x.args[2]===9.5&&x.args[3]===3),'enemy HP fill tracks the 25% health ratio');
    assert.equal(JSON.stringify(state),before,'drawing and line-of-sight color checks leave game state unchanged');
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
    assert.deepEqual(boxes.map(box=>box.text.startsWith('街')?'city':box.text),[`${Math.round(getPlayer(state)!.position.distanceTo(state.ufos[0]!.position))}m`,'city']);
    for(const box of boxes){assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=layout.width&&box.y+box.height<=layout.height);for(const obstacle of layout.keepOuts)assert.ok(box.x+box.width<=obstacle.x||obstacle.x+obstacle.width<=box.x||box.y+box.height<=obstacle.y||obstacle.y+obstacle.height<=box.y,`${box.text} overlaps a HUD or notice keep-out`);}
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i]!,b=boxes[j]!;assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'marker labels do not overlap each other');}
    if(layout.width===320){assert.ok(boxes[0]!.anchorY>anchors[0]!.y+20,'portrait label moves below its fixed marker anchor');assert.ok(collisionCalls.some(call=>call.name==='lineTo'&&call.args[0]===boxes[0]!.anchorX&&call.args[1]===boxes[0]!.y),'a leader line keeps the displaced label tied to its marker');}
  }
  const fallbackState=uiFixtureState('notices').state;fallbackState.fighters=fallbackState.fighters.slice(0,1);for(const district of fallbackState.city)district.attacked=false;
  const fallbackCamera=new PerspectiveCamera(FLIGHT_FOV,320/568,1,FLIGHT_FAR);getFlightCameraPose(getPlayer(fallbackState)!,fallbackState.mode,fallbackCamera.position,fallbackCamera.quaternion);fallbackCamera.updateMatrixWorld();
  let fallbackMeasurements=0;const fallbackContext=new Proxy({},{get:(_target,name)=> (...args:unknown[])=>{if(name==='measureText'){fallbackMeasurements++;return{width:String(args[0]).length*8,actualBoundingBoxAscent:9,actualBoundingBoxDescent:3};}},set:()=>true}) as CanvasRenderingContext2D;
  const fallbackProject=(position:Vector3)=>{const local=position.clone().sub(fallbackCamera.position).applyQuaternion(fallbackCamera.quaternion.clone().invert()),point=position.clone().project(fallbackCamera);return{x:(point.x*.5+.5)*320,y:(.5-point.y*.5)*568,visible:local.z<-.5&&point.z<1&&Math.abs(point.x)<.97&&Math.abs(point.y)<.94,behind:local.z>=-.5};};
  const fallback=drawFlightMarkers(fallbackContext,320,568,fallbackState,true,fallbackProject,fallbackCamera,[{x:0,y:60,width:200,height:220}]);
  assert.deepEqual(fallback.map(box=>box.text),[`${Math.round(getPlayer(fallbackState)!.position.distanceTo(fallbackState.ufos[0]!.position))}m`]);
  const denseKeepOut={x:0,y:60,width:200,height:220},denseLabel=fallback[0]!;
  assert.ok(denseLabel.x+denseLabel.width<=denseKeepOut.x||denseKeepOut.x+denseKeepOut.width<=denseLabel.x||denseLabel.y+denseLabel.height<=denseKeepOut.y||denseKeepOut.y+denseKeepOut.height<=denseLabel.y,'dense-label fallback finds an open marker cell');
  assert.equal(fallbackMeasurements,1,'fallback reuses one text measurement instead of measuring every cell');
});
test('aim color follows the visible target and existing lock without mutating the mission',()=>{
  const draw=(kind:'enemy'|'friendly',mode:'easy'|'normal',selected:boolean)=>{
    const state=uiFixtureState('normal').state;state.mode=mode;
    const player=getPlayer(state)!;
    const target=kind==='enemy'?state.ufos[0]!:state.fighters[1]!;
    state.city.forEach(district=>district.destroyed=true);
    if(kind==='enemy'){state.fighters=state.fighters.slice(0,1);state.ufos=state.ufos.slice(0,1);}
    else state.ufos=[];
    const sightTarget=new Vector3(0,0,-504.5).applyQuaternion(player.quaternion).add(player.position);
    target.position.copy(sightTarget);target.previous.copy(sightTarget);
    if(kind==='enemy'&&mode==='easy'&&selected)state.controller.targetLock.key=flightTargetKey(target);
    const before=JSON.stringify(state),writes:string[]=[],calls:{name:string;args:unknown[]}[]=[],properties:Record<string,unknown>={};
    const context=new Proxy(properties,{get:(object,name)=>name in object?object[name as string]:(...args:unknown[])=>{calls.push({name:String(name),args});if(name==='measureText')return{width:String(args[0]).length*7,actualBoundingBoxAscent:9,actualBoundingBoxDescent:3};},set:(object,name,value)=>{object[name as string]=value;if(name==='strokeStyle'||name==='fillStyle')writes.push(String(value));return true;}}) as CanvasRenderingContext2D;
    const width=393,height=852,camera=new PerspectiveCamera(FLIGHT_FOV,width/height,1,FLIGHT_FAR);
    getFlightCameraPose(player,mode,camera.position,camera.quaternion);camera.updateMatrixWorld();
    drawFlightMarkers(context,width,height,state,true,()=>({x:width/2,y:height/2,visible:true,behind:false}),camera);
    assert.equal(JSON.stringify(state),before,'presentation reads target lock and LOS without changing state');
    return writes;
  };
  assert.ok(draw('enemy','normal',false).includes('#ff645b'),'an enemy in the sight ring turns the sight red');
  assert.ok(draw('enemy','easy',false).includes('#ffffff'),'Easy does not color an unselected enemy as locked');
  assert.ok(draw('enemy','easy',true).includes('#ff645b'),'Easy uses the existing selected target lock');
  assert.ok(draw('friendly','normal',false).includes('#6cb8ff'),'a friendly aircraft in the sight ring turns the sight blue');
});
test('distance labels stop at the shared 1500m marker range',()=>{
  const state=uiFixtureState('normal').state,statePlayer=getPlayer(state)!;state.fighters=state.fighters.slice(0,1);
  const target=state.ufos[0]!,camera=new PerspectiveCamera(FLIGHT_FOV,320/568,1,FLIGHT_FAR);
  getFlightCameraPose(statePlayer,state.mode,camera.position,camera.quaternion);camera.updateMatrixWorld();
  const seen:string[]=[],context=new Proxy({},{get:(_target,name)=> (...args:unknown[])=>{if(name==='fillText')seen.push(String(args[0]));if(name==='measureText')return{width:String(args[0]).length*7,actualBoundingBoxAscent:9,actualBoundingBoxDescent:3};},set:()=>true}) as CanvasRenderingContext2D;
  const project=()=>({x:160,y:200,visible:true,behind:false});
  target.position.copy(statePlayer.position).add(new Vector3(0,0,-1499));target.previous.copy(target.position);
  drawFlightMarkers(context,320,568,state,true,project,camera);assert.ok(seen.includes('1499m'));
  seen.length=0;target.position.copy(statePlayer.position).add(new Vector3(0,0,-1501));target.previous.copy(target.position);
  drawFlightMarkers(context,320,568,state,true,project,camera);assert.ok(!seen.some(label=>/^\d+m$/.test(label)),'out-of-range enemies do not receive a target distance label');
});
test('radar layouts keep the Kaisen panel and its range label clear of UI and sight at target viewports',()=>{
  for(const [width,height] of [[320,568],[393,852],[568,320],[852,393]]){
    const radius=width<360?42:49,flightWidth=width<=350?108:width<=440?width/2-18:Math.min(190,width*.35);
    const missionWidth=width<=350?108:width<=440?width/2-18:Math.min(190,width*.35);
    const keepOuts=width===568?[
      {x:12,y:12,width:544,height:48},
      {x:12,y:80,width:199,height:90},
      {x:420,y:64,width:136,height:84},
      {x:214,y:192,width:92,height:100},
      {x:64,y:176,width:64,height:128},
      {x:435,y:175,width:72,height:72},
      {x:423,y:221,width:96,height:96},
      {x:150,y:12,width:268,height:28},
    ]:[
      {x:12,y:80,width:flightWidth,height:150},
      {x:width-12-missionWidth,y:78,width:missionWidth,height:120},
      {x:12,y:Math.round(height*.42),width:Math.min(164,width*.38),height:92},
    ];
    const sightRadius=Math.max(26,Math.min(38,Math.min(width,height)*.085))+11;
    const sight={x:width/2-sightRadius,y:height*.363-sightRadius,width:sightRadius*2,height:sightRadius*2};
    const layout=chooseRadarLayout(width,height,keepOuts,sight);
    assert.ok(layout,`${width}x${height} has an open radar slot`);
    assert.equal(layout!.radius,radius);
    assert.equal(layout!.bounds.width,radius*2+8);assert.equal(layout!.bounds.height,radius*2+34);
    assert.ok(layout!.bounds.y+layout!.bounds.height>=layout!.y+radius+16,'radar keep-out includes the 2.4km caption glyph below its baseline');
    assert.ok(layout!.bounds.x>=0&&layout!.bounds.y>=0&&layout!.bounds.x+layout!.bounds.width<=width&&layout!.bounds.y+layout!.bounds.height<=height);
    if(width===568)assert.ok(layout!.bounds.x>=width/2,'short-landscape radar occupies the reserved right-side slot');
    for(const obstacle of [...keepOuts,sight])assert.ok(layout!.bounds.x+layout!.bounds.width<=obstacle.x||obstacle.x+obstacle.width<=layout!.bounds.x||layout!.bounds.y+layout!.bounds.height<=obstacle.y||obstacle.y+obstacle.height<=layout!.bounds.y,`${width}x${height} radar avoids HUD and sight`);
  }
});
test('UI driver uses the product entry/styles, guarded boot and a separate legacy suite',()=>{
  const main=source('src/main.ts'), scene=source('src/scene.ts'), markers=source('src/flight-markers.ts'), styles=source('src/style.css'), index=source('index.html'), driver=source('src/ui-test-driver.ts'), config=source('playwright.config.ts');
  assert.match(main,/import\.meta\.env\.DEV && import\.meta\.env\.MODE === 'ui-test'/);
  assert.match(main,/import\('\.\/ui-test-driver'\)/);assert.match(main,/else \{ void prepareGraphics\(\);frameId=requestAnimationFrame\(frame\); \}/);
  assert.match(source('index.html'),/src="\/src\/main.ts"/);assert.match(main,/import '\.\/style\.css'/);
  assert.match(scene,/drawFlightMarkers\(this\.ctx/);assert.match(scene,/markerKeepOuts\.read\(\)/);assert.match(scene,/resize\(\):void\{\s*if\(this\.disposed\)return;this\.markerKeepOuts\.invalidate\(\)/);assert.match(source('src/ui-test-driver.ts'),/drawFlightMarkers\(context/);assert.match(source('src/ui-test-driver.ts'),/markerBoxes/);
  assert.doesNotMatch(markers,/subtree:\s*true|mutationObserver\.observe\([^,]*documentElement/);assert.match(markers,/attributeFilter:\['data-screen','data-mode','data-input'\]/);assert.match(markers,/attributeOldValue:true/);assert.match(markers,/record\.oldValue!==\(record\.target as Element\)\.getAttribute\(record\.attributeName\)/);assert.match(markers,/childList:announcement,characterData:announcement/);assert.match(markers,/if\(!this\.active\)this\.connect\(\)/);
  assert.equal((styles.match(/#app\[data-mode="normal"\] \.hud-notices:has\(> :not\(\[hidden\]\) ~ :not\(\[hidden\]\)\)/g)??[]).length,3,'all desktop notice-stack rules are scoped to Normal');
  assert.match(styles,/#app\[data-mode="normal"\] \.hud-notices:has\(> :not\(\[hidden\]\) ~ :not\(\[hidden\]\)\)\{position:absolute;top:55%;left:50%/);
  assert.match(styles,/width:min\(132px,calc\(50vw - 72px\)\)/);
  assert.match(styles,/left:calc\(50% - 38px\);right:auto;transform:none;width:84px/);
  assert.match(styles,/left:calc\(50% - 70px\);right:auto;top:calc\(50% \+ 32px\);width:min\(92px,calc\(100% - 436px\)\)/);
  assert.match(styles,/width:min\(300px,calc\(100% - 400px\)\)/);
  assert.doesNotMatch(styles,/#app:has\(#announcement:not\(:empty\)\) #ally-announcements\{display:none\}/);
  assert.match(driver,/announcement\.textContent=\(name==='notices'\|\|name==='easy-notices'\)\?'街を守りUFO50機を撃破 · 味方残機は自機込み':''/);assert.match(driver,/allyAnnouncement\.textContent='交戦中 · 残機と街の耐久を確認'/);
  assert.match(config,/testDir: '\.\/browser-tests\/ui-only'/);assert.doesNotMatch(config,/swiftshader|waitForMission|test:balance/);
  assert.match(source('playwright.gameplay.config.ts'),/testIgnore: '\*\*\/ui-only\/\*\*'/);
  const missionStart=index.indexOf('<div class="mission-hud">'),flightStart=index.indexOf('<div class="flight-data">'),friendlyStart=index.indexOf('class="tally friendly-tally"');
  assert.ok(missionStart>=0&&flightStart>missionStart&&friendlyStart>flightStart,'friendly reserve information is kept with the left flight data');
  assert.ok(!index.slice(missionStart,flightStart).includes('friendly-tally'),'right mission tally contains only enemy and city summaries');
  assert.match(styles,/#app #hud \.mission-hud\{[^}]*right:max\(18px,var\(--safe-right\)\)/);
  assert.match(styles,/#app #hud \.flight-data\{[^}]*left:max\(18px,var\(--safe-left\)\)[^}]*background:transparent[^}]*border:0/);
  assert.match(styles,/#app #hud \.flight-data \.friendly-tally\{[^}]*grid-column:auto[^}]*grid-row:auto[^}]*width:auto/);
  assert.match(styles,/#app #hud \.flight-data \.accuracy,#app #hud \.flight-data \.bonus-note\{display:none\}/);
  assert.match(index,/<details id="pause-status-details" class="pause-status-details"><summary>戦況詳細/);
  for(const id of ['pause-time','pause-enemy-status','pause-friendly-status','pause-city-status','pause-player-status','pause-flight-status','pause-score-status','pause-time-bonus'])assert.ok(index.includes(`id="${id}"`),`pause details expose ${id}`);
  assert.match(source('src/hud.ts'),/text\('pause-enemy-status',rosterDetail\(h\.enemy\)\)/);
  assert.match(source('src/main.ts'),/querySelectorAll<HTMLElement>\('button:not\(\[hidden\]\):not\(:disabled\),summary/);
});
