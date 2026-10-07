import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { createGame, startGame, getPlayer, stepGame, getHudSnapshot } from '../src/simulation';
import { FIXED_DT } from '../src/rules';
import { advanceThrottle } from '../src/flight';
import type { FlightInput } from '../src/flight-types';
const neutral = {turn:0,climb:0,fire:false,loop:false};
const main = readFileSync(new URL('../src/main.ts', import.meta.url),'utf8');
function productFunction(name: string): string {
  const ast=ts.createSourceFile('main.ts',main,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
  assert.ok(fn, name);return ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
}
function frameFixture(mode:'normal'|'easy'='normal') {
  const game=createGame({mode});startGame(game);
  let axis=0, pulse=0, accel=false, brake=false, clearCount=0;
  const inputs:FlightInput[]=[];
  const controls={sample(consume=true){const throttle=axis+pulse;if(consume)pulse=0;return {...neutral,accelerate:accel,brake,throttle};},
    sampleThrottle(up=false,down=false){const value=Math.max(-1,Math.min(1,axis+pulse+Number(up)-Number(down)));pulse=0;return mode==='normal'?value:0;},
    clear(){axis=0;pulse=0;accel=false;brake=false;clearCount++;}};
  const player=getPlayer(game)!;
  const ctx=createContext({state:game,controls,getPlayer,getHudSnapshot,FIXED_DT,window:{innerWidth:393,innerHeight:852},
    screen:'playing',disposed:false,frameId:0,lastFrame:1,accumulator:0,presentationPending:false,
    frameIntervals:[],gapCount:0,maxFrameGap:0,pendingLoop:false,pendingFire:false,pendingAccelerate:false,pendingBrake:false,
    lastPlayerIdentity:`${game.missionId}:${player.token}:${player.generation}`,announcementUntil:0,resultPresentationStart:0,
    requestAnimationFrame:()=>1,renderScene(){},processEvents(){},hud:{update(){}},finish(){},pause(){throw Error('unexpected pause');},
    stepGame(s:typeof game,input:FlightInput){inputs.push({...input});stepGame(s,input);},syncInstructions(){}});
  runInContext(['clearInput','phase','syncPilotOwnership','frame'].map(productFunction).join('\n'),ctx);
  return{game,ctx,inputs,controls,pulse(){pulse=1;},accelerate(value:boolean){accel=value;},frame(now:number){ctx.now=now;runInContext('frame(now)',ctx);},clearCount:()=>clearCount};
}
test('M main fixed-step path retains a zero-tick pulse and consumes once during catchup',()=>{
  const f=frameFixture();f.pulse();f.frame(5);assert.equal(f.inputs.length,0);f.frame(55);
  assert.deepEqual(f.inputs.map(i=>i.throttle),[1,0,0]);assert.equal(f.game.tick,3);
  assert.ok(Math.abs(f.game.controller.playerTargetSpeed-110.3)<1e-9);
  const replay=createGame({mode:'normal'});startGame(replay);for(const input of f.inputs)stepGame(replay,input);
  assert.deepEqual(getPlayer(replay),getPlayer(f.game));
});
test('M main pending legacy acceleration survives a zero-tick frame and does not replay after consumption',()=>{
  const f=frameFixture();f.accelerate(true);f.frame(5);f.accelerate(false);f.frame(55);
  assert.deepEqual(f.inputs.map(i=>i.throttle),[1,0,0]);assert.equal(f.ctx.pendingAccelerate,false);
});
test('M main pilot generation change clears held and pending commands before the next tick',()=>{
  const f=frameFixture();f.accelerate(true);f.pulse();f.frame(5);
  f.ctx.pendingLoop=true;f.ctx.pendingFire=true;f.ctx.pendingBrake=true;
  getPlayer(f.game)!.generation++;f.frame(25);
  assert.equal(f.inputs.length,1);assert.equal(f.inputs[0].throttle,0);assert.equal(f.inputs[0].fire,false);assert.equal(f.inputs[0].loop,false);
  assert.equal(f.inputs[0].accelerate,false);assert.equal(f.inputs[0].brake,false);assert.ok(f.clearCount()>0);
});
test('M simulation explicitly neutral throttle wins over legacy and Easy retains cruise',()=>{
  for(const mode of ['normal','easy'] as const){const game=createGame({mode});startGame(game);
    for(let i=0;i<10;i++)stepGame(game,{...neutral,throttle:0,accelerate:true});assert.equal(game.controller.playerTargetSpeed,110);
    stepGame(game,{...neutral,throttle:1});assert.ok(Math.abs(game.controller.playerTargetSpeed-(mode==='normal'?110.3:110))<1e-9);
    const retained=game.controller.playerTargetSpeed;stepGame(game,{...neutral,throttle:0});assert.equal(game.controller.playerTargetSpeed,retained);
    for(let i=0;i<300;i++)advanceThrottle(game.controller,{...neutral,throttle:1},mode,FIXED_DT);
    assert.equal(game.controller.playerTargetSpeed,mode==='normal'?141:110);
    for(let i=0;i<600;i++)advanceThrottle(game.controller,{...neutral,throttle:-1},mode,FIXED_DT);
    assert.equal(game.controller.playerTargetSpeed,mode==='normal'?65:110);
  }
});

test('common shell preserves the city briefing, own HUD and nine-key product boundary',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),shell=readFileSync(new URL('../src/common-shell.css',import.meta.url),'utf8');
  assert.match(shell,/#app \{[^}]*width: 100%;[^}]*max-width: none;/);
  assert.match(shell,/#home h1, #app \.panel h2 \{[^}]*Yu Mincho/);
  assert.match(shell,/#app \.home-screen \{[\s\S]*?display: flex; flex-direction: column/);
  assert.doesNotMatch(html,/id="(?:accelerate|brake|bomb|torpedo)"/);
  for(const id of ['city-health','city-destroyed','enemy-count','allies-count','score','score-breakdown'])assert.ok(html.includes(`id="${id}"`));
  assert.match(html,/街を守りUFO50機を撃破/);assert.match(html,/架空の港湾都市/);
  assert.match(main,/pendingLoop=false;pendingFire=false;pendingAccelerate=false;pendingBrake=false/);
});

/** Run the actual main preparation/failure functions with a rejected renderer, without a browser. */
function graphicsPreparationFixture(failure: unknown, screen: 'home' | 'playing' = 'home', throwInConstructor = false) {
  const nodes = new Map<string, {textContent:string;hidden:boolean;disabled:boolean}>();
  const el = (id:string) => { if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,disabled:false});return nodes.get(id)!; };
  const diagnostics:unknown[][]=[],pauseReasons:string[]=[],timers:number[]=[];
  let shouldFail=true,attempts=0,disposed=0,renders=0,clears=0;
  class SceneStub {
    constructor(){attempts++;if(shouldFail&&throwInConstructor)throw failure;}
    setReducedMotion(){}
    prepare(){return shouldFail?Promise.reject(failure):Promise.resolve();}
    dispose(){disposed++;}
    render(){renders++;}
  }
  const state={phase:screen==='home'?'ready':'playing',fault:null,tick:42};
  const context=createContext({Error,console:{error:(...args:unknown[])=>diagnostics.push(args)},el,state,screen,
    preparing:false,disposed:false,contextLost:false,graphicsReady:false,preparationGeneration:0,cancelPreparation:null,lastFrame:99,
    scene:null,MachiMamoreScene:SceneStub,canvas:{},overlay:{},reducedMotion:{matches:false},
    pendingLoop:true,pendingFire:true,pendingAccelerate:true,pendingBrake:true,controls:{clear(){clears++;}},
    window:{setTimeout:()=>timers.length+1,clearTimeout:(id:number)=>timers.push(id)},
    pause(reason:string){pauseReasons.push(reason);state.phase='paused';},announce(){throw new Error('Unexpected result announcement');}});
  runInContext(['clearInput','graphicsFailure','prepareGraphics'].map(productFunction).join('\n'),context);
  return {context,nodes,diagnostics,pauseReasons,timers,state,run:()=>runInContext('prepareGraphics()',context) as Promise<void>,
    allowSuccess(){shouldFail=false;},counts:()=>({attempts,disposed,renders,clears})};
}
const friendlyGraphicsFailure='画面を準備できません。WebGL対応とブラウザの描画設定を確認して再試行してください。';
for(const [label,error,constructorFailure] of [
  ['technical Error',new Error('THREE.WebGLRenderer: Error creating WebGL context.'),false],
  ['empty Error',new Error(''),false],
  ['technical string','WebGL internal driver failure: diagnostic detail',false],
  ['unknown object',{get message(){throw new Error('The error boundary must not inspect this getter');}},true],
  ['null exception',null,false],
] as const) test(`M-04 ${label} stays in diagnostics while the Japanese failure and retry UI remain intact`,async()=>{
  for(const screen of ['home','playing'] as const){const f=graphicsPreparationFixture(error,screen,constructorFailure);await f.run();
    assert.equal(f.nodes.get('startup-error')?.textContent,friendlyGraphicsFailure);assert.equal(f.nodes.get('startup-error')?.hidden,false);
    assert.equal(f.nodes.get('start')?.disabled,true);assert.equal(f.nodes.get('start')?.textContent,'描画を準備できません');
    assert.equal(f.nodes.get('reload')?.hidden,false);assert.equal(f.nodes.get('reload')?.textContent,'画面の準備を再試行');
    assert.equal(f.context.graphicsReady,false);assert.equal(f.context.preparing,false);assert.equal(f.context.cancelPreparation,null);assert.equal(f.context.lastFrame,0);
    assert.deepEqual(f.diagnostics, [['MachiMamore graphics preparation failed:',error]]);assert.equal(f.diagnostics[0][1],error,'preserve original exception identity');
    assert.deepEqual(f.pauseReasons,screen==='playing'?['render-failed']:[]);assert.equal(f.state.tick,42);
    assert.deepEqual(f.counts(),{attempts:1,disposed:constructorFailure?0:1,renders:0,clears:1});
    for(const field of ['pendingLoop','pendingFire','pendingAccelerate','pendingBrake'])assert.equal(f.context[field],false);
    assert.deepEqual(f.timers,[1]);
  }
});
test('M-04 retains one failure attempt until the existing explicit preparation retry succeeds',async()=>{
  const error=new Error('THREE.WebGLRenderer detail');const f=graphicsPreparationFixture(error);await f.run();
  await Promise.resolve();assert.equal(f.counts().attempts,1,'do not add an automatic retry');assert.equal(f.context.graphicsReady,false);
  f.allowSuccess();await f.run();
  assert.equal(f.context.graphicsReady,true);assert.equal(f.context.preparing,false);assert.equal(f.context.cancelPreparation,null);
  assert.equal(f.nodes.get('start')?.disabled,false);assert.equal(f.nodes.get('start')?.textContent,'街を守りに出撃');
  assert.equal(f.nodes.get('startup-error')?.hidden,true);assert.equal(f.nodes.get('reload')?.hidden,true);
  assert.equal(f.counts().attempts,2);assert.equal(f.counts().renders,1);assert.equal(f.diagnostics.length,1);assert.deepEqual(f.timers,[1,2]);
});
