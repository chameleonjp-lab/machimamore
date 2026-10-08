import './style.css';
import './common-shell.css';
import './control-settings.css';
import { createGame, startGame, stepGame, pauseGame, resumeGame, abortGame, getPlayer, getHudSnapshot } from './simulation';
import { FIXED_DT, RULES_VERSION } from './rules';
import { FlightControls } from './input';
import { ControlSettings } from './control-settings';
import { KeyboardSettings, ControlInputPresentation } from './keyboard-settings';
import { RulesGuide } from './rules-guide';
import { MachiMamoreScene } from './scene';
import { FlightAudio } from './audio';
import { Hud, modeName } from './hud';
import type { FlightInput, GameMode, GameState } from './types';

type SceneView = Pick<MachiMamoreScene, 'render' | 'resize' | 'dispose' | 'setReducedMotion'> & { metrics(): unknown };

function el<T extends HTMLElement=HTMLElement>(id:string):T{const node=document.getElementById(id);if(!node)throw new Error(`Missing UI: ${id}`);return node as T;}
const app=el('app'),canvas=el<HTMLCanvasElement>('flight'),overlay=el<HTMLCanvasElement>('markers'),hud=new Hud(),audio=new FlightAudio();
let selectedMode:GameMode='easy',state=createGame({mode:selectedMode}),screen:'home'|'playing'|'paused'|'result'='home',scene:SceneView|null=null;
let graphicsReady=false,contextLost=false,preparing=false,disposed=false,preparationGeneration=0,frameId=0,lastFrame=0,accumulator=0;
let cancelPreparation:(()=>void)|null=null,presentationPending=false;
let pendingLoop=false,pendingFire=false,pendingAccelerate=false,pendingBrake=false,lastPlayerIdentity='',lastEventId=-1,lastEventMission=-1,announcementUntil=0,lastNoticeTick=-999,resultPresentationStart=0;
const buttons={fire:el<HTMLButtonElement>('fire'),loop:el<HTMLButtonElement>('loop'),throttle:el<HTMLElement>('throttle')};
for(const button of Object.values(buttons))button.dataset.flightControl='true';
const keyboard=new KeyboardSettings(),presentation=new ControlInputPresentation(),settings=new ControlSettings(buttons,keyboard,presentation);
let rules:RulesGuide|null=null;
const controls=new FlightControls(canvas,buttons,()=>screen==='playing'&&state.phase==='playing'&&!!getPlayer(state)&&!settings.isOpen&&!rules?.isOpen,keyboard);
function clearInput(){controls.clear();pendingLoop=false;pendingFire=false;pendingAccelerate=false;pendingBrake=false;}
function phase():GameState['phase']{return state.phase;}
function syncPilotOwnership(raw:FlightInput){const p=getPlayer(state),identity=p?`${state.missionId}:${p.token}:${p.generation}`:'';if(identity!==lastPlayerIdentity){lastPlayerIdentity=identity;clearInput();raw.turn=0;raw.climb=0;raw.fire=false;raw.loop=false;raw.accelerate=false;raw.brake=false;raw.throttle=0;}}
function syncInstructions(){const peek=controls.peek();if(peek.steerPointer!==null||peek.throttlePointer!==null||peek.throttle!==0||peek.keys.length||Object.values(peek.heldPointers).some(ids=>ids.length)){presentationPending=true;return;}presentationPending=false;const touch=presentation.value==='touch';app.dataset.input=presentation.value;el('input-guide').textContent=touch?'画面をドラッグして操縦':'矢印キー・相対ドラッグで操縦';el('flight-tip').textContent=touch?'触れた位置からドラッグして操縦':'矢印キーで操縦';el('mode-guide').textContent=state.mode==='easy'?'自動射撃・巡航速度 · 相手の少し先を狙う':'射撃は長押し · 速度はレバーで調整';el('keyboard-guide').hidden=touch;el('keyboard-guide').textContent=keyboard.describe(state.mode);}
function syncMode(){app.dataset.mode=state.mode;controls.setMode(state.mode);settings.setActiveMode(state.mode);el('normal-controls').hidden=state.mode!=='normal';el('friendly-fire-guide').hidden=state.mode!=='normal';el('hud-mode').textContent=modeName(state.mode);syncInstructions();}
const unsubscribeKeys=keyboard.subscribe(syncInstructions),unsubscribePresentation=presentation.subscribe(syncInstructions);
rules=new RulesGuide(()=>({mode:state.mode,input:presentation.value,keyboardDescription:keyboard.describe(state.mode)}),clearInput);
for(const id of ['home-rules','pause-rules']){const button=el(id);button.addEventListener('click',()=>rules?.open(button));}
for(const [id,allowBoth]of [['home-controls',true],['pause-controls',false],['result-controls',true]]as const){const button=el(id);button.addEventListener('click',()=>{clearInput();settings.open(button,screen==='home'?selectedMode:state.mode,allowBoth);});}
function setScreen(next:typeof screen){settings.close();rules?.close();screen=next;app.dataset.screen=next;el('home').hidden=next!=='home';el('hud').hidden=next!=='playing'&&next!=='paused';el('pause-screen').hidden=next!=='paused';el('result').hidden=next!=='result';el('home').inert=next!=='home';el('hud').inert=next!=='playing';el('result').inert=next!=='result';canvas.inert=next!=='playing';clearInput();if(next==='playing')canvas.focus({preventScroll:true});else el(next==='home'?'start':next==='paused'?'resume':'retry').focus({preventScroll:true});}
function syncAudio(){audio.active=screen==='playing'&&state.phase==='playing'&&!document.hidden;audio.sync();el('home-sound').textContent=audio.enabled?'音をオフにする':'音をオンにする';el('game-sound').textContent=audio.enabled?'音 ON':'音 OFF';el('game-sound').setAttribute('aria-label',audio.enabled?'音をオフにする':'音をオンにする');for(const id of ['home-sound','game-sound'])el(id).setAttribute('aria-pressed',String(audio.enabled));}
async function toggleAudio(){audio.enabled=!audio.enabled;syncAudio();if(audio.enabled){await audio.unlock();syncAudio();if(audio.failed)announce('音を再生できません。飛行は続けられます。',4);}}
for(const id of ['home-sound','game-sound'])el(id).addEventListener('click',()=>void toggleAudio());
function announce(message:string,seconds=3){el('announcement').textContent=message;announcementUntil=state.tick+seconds*60;}
function begin(){if(!scene||!graphicsReady||contextLost||document.hidden||preparing||screen==='playing'||settings.isOpen||rules?.isOpen)return;state=createGame({mode:selectedMode});startGame(state);accumulator=0;lastFrame=0;const p=getPlayer(state);lastPlayerIdentity=p?`${state.missionId}:${p.token}:${p.generation}`:'';lastEventId=-1;lastEventMission=state.missionId;lastNoticeTick=-999;announcementUntil=0;resultPresentationStart=0;audio.resetFlight();syncMode();setScreen('playing');syncAudio();if(audio.enabled)void audio.unlock();hud.update(state,getHudSnapshot(state));announce('街を守りUFO50機を撃破 · 味方残機は自機込み',4);renderScene(true);lastFrame=0;}
function home(){if(state.phase==='playing'||state.phase==='paused')abortGame(state);state=createGame({mode:selectedMode});accumulator=0;lastFrame=0;audio.resetFlight();syncMode();setScreen('home');syncAudio();el('announcement').textContent='';renderScene(false);}
const reasonLabels:Record<string,string>={manual:'作戦時計・装填・復帰・レーザーも止まっています。',blur:'フォーカスが外れたため停止しました。',hidden:'画面が非表示になったため停止しました。',frame:'画面更新に長い空白があったため停止しました。','webgl-lost':'描画コンテキストが失われたため停止しました。復旧を待っています。','render-failed':'描画を続けられないため停止しました。画面の準備を再試行してください。',fault:'出撃・戦闘処理の異常を検出したため停止しました。'};
function pause(reason:string){if(state.phase!=='playing'&&state.phase!=='paused')return;pauseGame(state,reason);clearInput();accumulator=0;lastFrame=0;setScreen('paused');el('pause-reason').textContent=state.pauseReasons.map(r=>reasonLabels[r]??r).join(' ')+(state.fault?` ${state.fault}`:'');el<HTMLButtonElement>('resume').disabled=contextLost||!graphicsReady||!!state.fault;el('pause-reload').hidden=graphicsReady;el('pause-reload').textContent=contextLost?'ページを再読み込み':'画面の準備を再試行';syncAudio();}
function resume(){if(state.phase!=='paused'||document.hidden||contextLost||!graphicsReady||preparing||state.fault||settings.isOpen||rules?.isOpen)return;resumeGame(state);if(phase()!=='playing')return;accumulator=0;lastFrame=0;clearInput();setScreen('playing');syncAudio();if(audio.enabled)void audio.unlock();}
function finish(){if(!state.result)return;accumulator=0;lastFrame=0;resultPresentationStart=performance.now();clearInput();audio.active=false;audio.resetFlight();syncAudio();hud.result(state.result);setScreen('result');el('announcement').textContent='';}
function graphicsFailure(message:string){
  graphicsReady=false;clearInput();const failedScene=scene;scene=null;
  el<HTMLButtonElement>('start').disabled=true;el('start').textContent='描画を準備できません';
  el('startup-error').hidden=false;el('startup-error').textContent=message;el('reload').hidden=false;el('reload').textContent='画面の準備を再試行';
  if(screen==='playing'||screen==='paused')pause('render-failed');
  else if(screen==='result')announce(message,10);
  try{failedScene?.dispose();}catch{}
}
function renderScene(flight:boolean,alpha=1,resultAnimationTime=0){try{scene?.render(state,flight,alpha,resultAnimationTime);}catch{graphicsFailure('画面の描画を続けられません。画面の準備を再試行してください。');}}
for(const id of ['start','retry','pause-restart'])el(id).addEventListener('click',begin);for(const id of ['pause-home','result-home'])el(id).addEventListener('click',home);el('pause').addEventListener('click',()=>pause('manual'));el('resume').addEventListener('click',resume);
for(const radio of document.querySelectorAll<HTMLInputElement>('input[name="game-mode"]'))radio.addEventListener('change',()=>{if(screen!=='home'||!radio.checked)return;selectedMode=radio.value==='normal'?'normal':'easy';state=createGame({mode:selectedMode});syncMode();renderScene(false);});
window.addEventListener('keydown',event=>{if(settings.isOpen||rules?.isOpen)return;if((screen==='playing'||screen==='paused')&&keyboard.matchesPause(event)){event.preventDefault();if(screen==='playing')pause('manual');else resume();return;}if(screen==='paused'&&event.key==='Tab'){const buttons=Array.from(el('pause-screen').querySelectorAll<HTMLButtonElement>('button')).filter(b=>!b.hidden&&!b.disabled);const index=buttons.indexOf(document.activeElement as HTMLButtonElement),target=event.shiftKey?index<=0?buttons.at(-1):null:index<0||index===buttons.length-1?buttons[0]:null;if(target){event.preventDefault();target.focus();}}});
window.addEventListener('blur',()=>pause('blur'));window.addEventListener('pagehide',()=>pause('hidden'));document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('hidden');lastFrame=0;});
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');reducedMotion.addEventListener('change',()=>scene?.setReducedMotion(reducedMotion.matches));
function resizeScene(){clearInput();try{scene?.resize();}catch{graphicsFailure('画面サイズの更新を続けられません。画面の準備を再試行してください。');}}
window.addEventListener('resize',resizeScene);window.visualViewport?.addEventListener('resize',resizeScene);
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();contextLost=true;graphicsReady=false;preparationGeneration++;cancelPreparation?.();cancelPreparation=null;preparing=false;scene?.dispose();scene=null;pause('webgl-lost');el<HTMLButtonElement>('start').disabled=true;el('startup-error').hidden=false;el('startup-error').textContent='描画コンテキストが失われました。復旧を待つか、ページを再読み込みしてください。復旧後も明示的な再開が必要です。';el('reload').hidden=false;el('reload').textContent='ページを再読み込み';});
canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;void prepareGraphics();});
async function prepareGraphics(){
  if(preparing||disposed||contextLost)return;
  preparing=true;graphicsReady=false;const generation=++preparationGeneration;
  el<HTMLButtonElement>('start').disabled=true;el('start').textContent='画面を準備しています';el('startup-error').hidden=true;el('reload').hidden=true;el('reload').textContent='画面の準備を再試行';
  let candidate:MachiMamoreScene|null=null,timer:number|undefined;
  let cancel:()=>void=()=>{};
  const cancellation=new Promise<void>((_,reject)=>{cancel=()=>reject(new Error('描画準備が中断されました。'));});
  cancelPreparation=cancel;
  const timeout=new Promise<void>((_,reject)=>{timer=window.setTimeout(()=>reject(new Error('描画準備が10秒以内に完了しませんでした。')),10000);});
  try{
    scene?.dispose();scene=null;candidate=new MachiMamoreScene(canvas,overlay);candidate.setReducedMotion(reducedMotion.matches);
    await Promise.race([candidate.prepare(state),timeout,cancellation]);
    if(disposed||generation!==preparationGeneration){candidate.dispose();return;}
    scene=candidate;graphicsReady=true;contextLost=false;el('start').textContent='街を守りに出撃';el<HTMLButtonElement>('start').disabled=false;el('startup-error').hidden=true;el<HTMLButtonElement>('resume').disabled=!!state.fault;el('pause-reload').hidden=true;
    if(screen==='paused')el('pause-reason').textContent='描画が復旧しました。作戦は停止中です。「飛行を再開」で続けられます。';scene.render(state,screen!=='home');
  }catch(error){
    if(disposed||generation!==preparationGeneration){candidate?.dispose();return;}
    console.error('MachiMamore graphics preparation failed:', error);
    graphicsFailure('画面を準備できません。WebGL対応とブラウザの描画設定を確認して再試行してください。');
    candidate?.dispose();
  }finally{
    if(timer!==undefined)window.clearTimeout(timer);
    if(cancelPreparation===cancel)cancelPreparation=null;
    if(generation===preparationGeneration){preparing=false;lastFrame=0;}
  }
}
let retryGraphics = prepareGraphics;
for(const id of ['reload','pause-reload'])el(id).addEventListener('click',()=>{if(contextLost)window.location.reload();else void retryGraphics();});
function processEvents(){if(lastEventMission!==state.missionId){lastEventMission=state.missionId;lastEventId=-1;}for(const event of state.events){if(event.id<=lastEventId)continue;lastEventId=event.id;if((event.type==='respawn'||event.type==='takeover')&&event.owner===state.playerId)announce(event.type==='takeover'?'僚機の操縦を引き継ぎました':'自機が復帰しました',2);if((event.type==='kill'||event.type==='city-destroyed')&&state.tick-lastNoticeTick>=120){lastNoticeTick=state.tick;el('ally-announcements').textContent=event.type==='city-destroyed'?'街の区画が破壊されました。残る街を守ろう。':'交戦中 · 残機と街の耐久を確認';}}
  audio.updatePlayer(getPlayer(state));audio.consume(state.events);}
const frameIntervals:number[]=[];let gapCount=0,maxFrameGap=0;
function frame(now:number){if(disposed)return;frameId=requestAnimationFrame(frame);if(presentationPending)syncInstructions();if(!lastFrame){lastFrame=now;renderScene(screen!=='home',1);return;}const seconds=(now-lastFrame)/1000;lastFrame=now;
  if(screen==='playing'&&state.phase==='playing'){
    if(seconds>.25){gapCount++;maxFrameGap=Math.max(maxFrameGap,seconds);pause('frame');}
    else{frameIntervals.push(seconds*1000);if(frameIntervals.length>4096)frameIntervals.shift();const raw=controls.sample(false);pendingLoop||=raw.loop;pendingFire||=raw.fire;pendingAccelerate||=!!raw.accelerate;pendingBrake||=!!raw.brake;accumulator+=Math.max(0,seconds);let count=0;
      while(accumulator+1e-12>=FIXED_DT&&state.phase==='playing'&&count<15){syncPilotOwnership(raw);
        const input:FlightInput={...raw,throttle:controls.sampleThrottle(raw.accelerate||pendingAccelerate,raw.brake||pendingBrake),fire:raw.fire||pendingFire,accelerate:raw.accelerate||pendingAccelerate,brake:raw.brake||pendingBrake,loop:pendingLoop,viewAspect:window.innerWidth/Math.max(1,window.innerHeight)};pendingLoop=false;pendingFire=false;pendingAccelerate=false;pendingBrake=false;stepGame(state,input);syncPilotOwnership(raw);accumulator-=FIXED_DT;count++;processEvents();if(phase()==='paused'){pause(state.fault?'fault':'frame');break;}if(phase()==='ended'){finish();break;}}
      if(accumulator+1e-12>=FIXED_DT&&state.phase==='playing')pause('frame');hud.update(state,getHudSnapshot(state));if(announcementUntil&&state.tick>=announcementUntil){el('announcement').textContent='';announcementUntil=0;}
    }
  }
  renderScene(screen!=='home',screen==='playing'?Math.min(1,accumulator/FIXED_DT):1,resultPresentationStart?Math.max(0,(now-resultPresentationStart)/1000):0);
}
canvas.inert=true;syncMode();syncAudio();
// This branch is removed from release builds. It runs the real UI with direct
// presentation data, no WebGL world and no game frame/step scheduler.
if(import.meta.env.DEV && import.meta.env.MODE === 'ui-test') {
  void import('./ui-test-driver').then(({ installUiTestDriver }) => {
    const ready = () => {
      graphicsReady=true; contextLost=false; preparing=false;
      el<HTMLButtonElement>('start').disabled=false; el('start').textContent='街を守りに出撃';
      el('startup-error').hidden=true; el('reload').hidden=true;
      el<HTMLButtonElement>('resume').disabled=false; el('pause-reload').hidden=true;
    };
    let fixtureScene: SceneView | null=null;
    const driver = installUiTestDriver({
      overlay,
      present(next, nextScreen) {
        scene=fixtureScene;ready();selectedMode=next.mode; state=next;
        for(const radio of document.querySelectorAll<HTMLInputElement>('input[name="game-mode"]'))radio.checked=radio.value===next.mode;
        syncMode(); setScreen(nextScreen); hud.update(state,getHudSnapshot(state));
        if(nextScreen==='result')finish();
        if(nextScreen==='paused')pause('manual');
        syncAudio(); renderScene(nextScreen!=='home');
      },
      startupError() { graphicsFailure('画面を準備できません。WebGL対応とブラウザの描画設定を確認して再試行してください。'); },
      read:()=>({screen, tick:state.tick, phase:state.phase, frameScheduled:frameId!==0}),
    });
    fixtureScene=driver.scene;
    retryGraphics=async()=>{scene=driver.scene;ready();renderScene(screen!=='home');};
    void retryGraphics();driver.show(driver.initial);
  });
} else { void prepareGraphics();frameId=requestAnimationFrame(frame); }
// Only read-only development observation; Vite removes this branch from release builds.
if(import.meta.env.DEV){Object.defineProperty(window,'__machimamoreRead',{configurable:true,value:()=>JSON.parse(JSON.stringify({phase:state.phase,screen,tick:state.tick,missionId:state.missionId,seed:state.seed,mode:state.mode,rulesVersion:RULES_VERSION,pauseReasons:state.pauseReasons,playerId:state.playerId,player:getPlayer(state),ufos:state.ufos.map(u=>({id:u.id,token:u.token,generation:u.generation,position:u.position,velocity:u.velocity,health:u.health,movement:u.movement})),input:controls.peek(),acceptedInput:state.input,hud:getHudSnapshot(state),render:scene?.metrics()??null,audio:{enabled:audio.enabled,active:audio.active,contextCount:audio.contextCount,activeSources:audio.activeSources,activeEffectSources:audio.activeEffectSourceCount,contextState:audio.contextState},timing:{gapCount,maxFrameGap,frameIntervals}}))});}
function dispose(){if(disposed)return;disposed=true;preparationGeneration++;cancelPreparation?.();cancelPreparation=null;cancelAnimationFrame(frameId);clearInput();controls.dispose();settings.dispose();rules?.dispose();unsubscribeKeys();unsubscribePresentation();presentation.dispose();scene?.dispose();audio.dispose();}
if(import.meta.hot)import.meta.hot.dispose(dispose);
