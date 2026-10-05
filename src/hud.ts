import { CITY_TOTAL_HEALTH, CITY_DISTRICTS, RELOAD_TICKS, TICK_RATE, TOTAL_AIRCRAFT } from './rules';
import type { GameResult, GameState, HudSnapshot } from './types';

function el<T extends HTMLElement=HTMLElement>(id:string):T{const node=document.getElementById(id);if(!node)throw new Error(`Missing UI: ${id}`);return node as T;}
function text(id:string,value:string){const node=el(id);if(node.textContent!==value)node.textContent=value;}
export function modeName(mode:'easy'|'normal'){return mode==='easy'?'イージー':'ノーマル';}
export function formatTime(seconds:number){const cs=Math.floor(Math.max(0,seconds)*100+1e-6);return`${String(Math.floor(cs/6000)).padStart(2,'0')}:${String(Math.floor(cs/100)%60).padStart(2,'0')}.${String(cs%100).padStart(2,'0')}`;}
export function formatAccuracy(value:number|null){return value===null?'—（未射撃）':`${(value*100).toFixed(1)}%`;}
export class Hud {
  private lastCityNotice=-999;
  private mission=-1;
  update(state:GameState,h:HudSnapshot):void{
    if(this.mission!==state.missionId){this.mission=state.missionId;this.lastCityNotice=-999;text('city-warning','');text('ally-announcements','');}
    text('timer',formatTime(h.time));text('hud-mode',modeName(h.mode));
    text('enemy-count',`${h.enemy.D} / ${TOTAL_AIRCRAFT}`);text('enemy-total',`残機${h.enemy.remaining} · 出撃${h.enemy.A} · 予備＋待機${h.enemy.R+h.enemy.Q}`);
    text('allies-count',`残機${h.friendly.remaining}`);text('allies-total',`出撃${h.friendly.A} · 予備＋待機${h.friendly.R+h.friendly.Q}`);
    text('city-health',`${Math.ceil(h.cityPercent)}%`);text('city-destroyed',`破壊 ${h.cityDestroyed} / ${CITY_DISTRICTS}区画`);el('city-bar').style.width=`${h.cityPercent}%`;
    const p=h.player;text('health',p?String(Math.ceil(p.health/p.maxHealth*100)):'—');el('health-bar').style.width=`${p?p.health/p.maxHealth*100:0}%`;
    text('altitude',p?`${Math.round(p.position.y)}m`:'待機中');text('speed',p?`${Math.round(p.speed*3.6)}km/h`:'—');text('mg-ammo',p?String(p.mg):'—');text('cannon-ammo',p?String(p.cannon):'—');
    text('score',h.score.toLocaleString('ja-JP'));text('accuracy',formatAccuracy(h.accuracy));
    const reload=p?.reloadTicksRemaining??0;el('reload-status').hidden=reload===0;el('reload-progress').hidden=reload===0;if(reload>0){text('reload-status',`再装填 ${(reload/TICK_RATE).toFixed(1)}秒`);el<HTMLProgressElement>('reload-progress').value=RELOAD_TICKS-reload;}
    text('loop-status',!p?'待機中':p.loopProgress>0?'宙返り中':p.loopCooldown>0?`${p.loopCooldown.toFixed(1)}秒`:'すぐ使える');
    el('player-wait').hidden=!!p;if(!p)text('player-wait',`${h.waitingFor==='takeover'?'僚機の操縦引き継ぎ':'自機の復帰'}待ち · ${Math.max(0,h.respawnSeconds).toFixed(1)}秒 · 味方残機${h.friendly.remaining}`);
    el('warning').hidden=!p||p.position.y>=70;
    const attacked=state.city.filter(d=>d.attacked&&!d.destroyed);el('city-warning').hidden=attacked.length===0;
    if(attacked.length&&(state.tick-this.lastCityNotice>=90||!el('city-warning').textContent)){
      this.lastCityNotice=state.tick;const d=attacked.sort((a,b)=>a.health-b.health||a.token-b.token)[0]!,local=p?d.position.clone().sub(p.position).applyQuaternion(p.quaternion.clone().invert()):null;
      const direction=!local?'街':Math.abs(local.x)>Math.abs(local.z)?local.x>0?'右側':'左側':local.z<0?'前方':'後方';
      text('city-warning',`△ ${direction}の街が攻撃中 · 区画${d.token+1} ${Math.ceil(d.health)}HP${attacked.length>1?` · 計${attacked.length}区画`:''}`);
    }
  }
  result(r:GameResult):void{
    text('result-title',r.outcome==='victory'?'防衛成功':r.outcome==='interrupted'?'作戦中断':'防衛失敗');
    text('result-kicker',r.outcome==='victory'?'CITY DEFENDED':'MISSION REPORT');text('result-mode',modeName(r.mode));
    const reasons:Record<GameResult['reason'],string>={'all-clear':`UFO全${TOTAL_AIRCRAFT}機を撃破。母艦は撤退します。`,'city-destroyed':'街の耐久が0になりました。','friendly-exhausted':'味方の全50機を失いました。','interrupted':'ホームへ戻ったため中断しました。確定した勝利記録ではありません。'};
    text('result-reason',reasons[r.reason]);text('result-time',formatTime(r.time));text('result-score',r.score.toLocaleString('ja-JP'));
    text('player-kills',`${r.stats.playerKills}機`);text('ally-kills',`${r.stats.allyKills}機`);text('losses',`${r.stats.playerLosses} / ${r.stats.allyLosses}機`);
    text('city-result',`${r.cityHealth.toFixed(1)} / ${CITY_TOTAL_HEALTH}HP · ${r.cityDestroyed}区画`);text('accuracy-result',`${r.stats.hits} / ${r.stats.shots}発 · ${formatAccuracy(r.accuracy)}`);text('survivors',`${r.friendlyRemaining} / ${TOTAL_AIRCRAFT-r.enemyDestroyed}機`);
    const entries:[string,number,boolean][]=[['UFO破壊点',r.breakdown.ufoDestruction,false],['与ダメージ点',r.breakdown.damage,false],['時間点（勝利時）',r.breakdown.time,false],['自機損失',r.breakdown.playerLoss,true],['僚機損失',r.breakdown.allyLoss,true],['命中率減点',r.breakdown.accuracy,true],['街損失',r.breakdown.cityLoss,true]];
    const list=el('score-breakdown');list.replaceChildren();for(const [label,value,negative]of entries){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=`${negative?'−':'＋'}${value.toLocaleString('ja-JP',{maximumFractionDigits:1})}`;row.append(dt,dd);list.append(row);}
  }
}
