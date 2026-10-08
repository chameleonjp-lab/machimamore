// Loaded only by main.ts in Vite's explicit DEV ui-test mode; never shipped.
import { PerspectiveCamera, Vector3 } from 'three';
import { createGame, getPlayer, startGame } from './simulation';
import { drawFlightMarkers, MarkerKeepOutCache, type MarkerLabelBox } from './flight-markers';
import { FLIGHT_FAR, FLIGHT_FOV, getFlightCameraPose } from './flight-view';
import type { GameResult, GameState } from './types';

export const UI_FIXTURES = ['home','easy','normal','reload','wait','notices','paused','victory','defeat','interrupted','startup-error'] as const;
export type UiFixtureName = typeof UI_FIXTURES[number];
export type UiScreen = 'home' | 'playing' | 'paused' | 'result';
export interface UiFixtureDriver {
  show(name: UiFixtureName): void;
  read(): { screen: UiScreen; tick: number; phase: GameState['phase']; frameScheduled: boolean };
  markerBoxes(): readonly MarkerLabelBox[];
}

/** Fixed display examples, not simulated outcomes or combat acceptance evidence. */
export function uiFixtureState(name: UiFixtureName): {state: GameState; screen: UiScreen} {
  const state = createGame({ mode: ['home','easy','startup-error'].includes(name) ? 'easy' : 'normal', seed: 1 });
  if (name === 'home' || name === 'startup-error') return {state, screen:'home'};
  startGame(state); // Initializes phase only; never stepGame, physics, AI, or wall-clock waiting.
  const player = getPlayer(state)!;
  if (name === 'notices') player.position.y=50;
  state.ufos = state.ufos.slice(0, 1);
  state.fighters = state.fighters.slice(0, 2);
  state.ufos[0].position.copy(player.position).add(new Vector3(-70, 35, -500));
  state.fighters[1].position.copy(player.position).add(new Vector3(70, 35, -500));
  state.city[0].position.copy(player.position).add(new Vector3(95, -50, -500));
  state.city[1].position.copy(player.position).add(new Vector3(2000, 0, -500));
  if (name === 'reload' || name === 'notices') {player.mg=0;player.cannon=0;player.reloadTicksRemaining=180;}
  if (name === 'notices') {
    for (const district of state.city.slice(0,2)) {district.attacked=true;district.health=125;}
  }
  if (name === 'wait') {state.playerId=null;state.pilotReadyTick=180;}
  if (name === 'paused') {state.phase='paused';state.pauseReasons=['manual'];return {state,screen:'paused'};}
  if (['victory','defeat','interrupted'].includes(name)) {
    const outcome=name as GameResult['outcome'];
    state.phase='ended';
    state.result={outcome, reason:outcome==='victory'?'all-clear':outcome==='defeat'?'city-destroyed':'interrupted',
      mode:state.mode,tick:0,time:123.45,score:12345,
      breakdown:{ufoDestruction:10000,damage:2500,time:500,playerLoss:100,allyLoss:200,accuracy:300,cityLoss:55,total:12345},
      stats:{...state.stats,playerKills:12,allyKills:38,playerLosses:1,allyLosses:2,shots:100,hits:75},
      accuracy:.75,cityHealth:outcome==='defeat'?0:4321,cityDestroyed:outcome==='defeat'?20:2,enemyDestroyed:outcome==='victory'?50:23,friendlyRemaining:47};
    return {state,screen:'result'};
  }
  return {state,screen:'playing'};
}

export function installUiTestDriver(host: {
  overlay: HTMLCanvasElement;
  present(state: GameState, screen: UiScreen): void;
  startupError(): void;
  read: UiFixtureDriver['read'];
}) {
  const context=host.overlay.getContext('2d');
  if (!context) throw new Error('UI fixture needs the actual Canvas2D marker layer');
  const markerKeepOuts=new MarkerKeepOutCache(document);
  const camera=new PerspectiveCamera(FLIGHT_FOV,1,1,FLIGHT_FAR);
  let last: {state: GameState; flight: boolean} | null=null;
  let markerBoxes: MarkerLabelBox[]=[];
  const scene={
    render(state: GameState, flight: boolean) {
      last={state,flight};
      const width=innerWidth,height=innerHeight,dpr=Math.min(devicePixelRatio||1,2);
      host.overlay.width=Math.round(width*dpr);host.overlay.height=Math.round(height*dpr);
      context.setTransform(dpr,0,0,dpr,0,0);
      camera.aspect=width/height;camera.updateProjectionMatrix();
      const player=getPlayer(state);
      if(player)getFlightCameraPose(player,state.mode,camera.position,camera.quaternion);
      camera.updateMatrixWorld();
      markerBoxes=drawFlightMarkers(context,width,height,state,flight,position=>{
        const local=position.clone().sub(camera.position).applyQuaternion(camera.quaternion.clone().invert()),point=position.clone().project(camera);
        return {x:(point.x*.5+.5)*width,y:(.5-point.y*.5)*height,visible:local.z<-.5&&point.z<1&&Math.abs(point.x)<.97&&Math.abs(point.y)<.94,behind:local.z>=-.5};
      },camera,markerKeepOuts.read());
    },
    resize(){markerKeepOuts.invalidate();if(last)this.render(last.state,last.flight);},
    dispose(){markerKeepOuts.dispose();context.clearRect(0,0,host.overlay.width,host.overlay.height);},
    setReducedMotion(_value: boolean){},
    metrics(){return {uiOnly:true,worldRendered:false};},
  };
  const driver: UiFixtureDriver={
    show(name){
      const announcement=document.getElementById('announcement');
      if(announcement)announcement.textContent=name==='notices'?'街を守りUFO50機を撃破 · 味方残機は自機込み':'';
      const allyAnnouncement=document.getElementById('ally-announcements');
      if(allyAnnouncement)allyAnnouncement.textContent='';
      markerKeepOuts.invalidate();
      const {state,screen}=uiFixtureState(name);host.present(state,screen);
      if(name==='startup-error')host.startupError();
    },
    read:host.read,
    markerBoxes:()=>markerBoxes,
  };
  Object.defineProperty(window,'__machimamoreUi',{configurable:true,value:driver});
  document.documentElement.dataset.uiFixtureReady='true';
  const requested=new URL(location.href).searchParams.get('ui');
  const initial=UI_FIXTURES.find(name=>name===requested)??'home';
  return {...driver,scene,initial};
}
