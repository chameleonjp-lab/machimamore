import { Vector3 } from 'three';
import { flightTargetKey } from './flight-target';
import { flightTargetLineOfSight, selectedFlightTargetKey } from './simulation';
import { EASY_AIM_RADIUS } from './flight-view';
import { RELOAD_TICKS } from './rules';
import type { GameState } from './types';

export interface MarkerProjection { x:number; y:number; visible:boolean; behind:boolean; }
export interface MarkerLabelBox { text:string; x:number; y:number; width:number; height:number; anchorX:number; anchorY:number; }
export interface MarkerKeepOut { x:number; y:number; width:number; height:number; }

const MARKER_GEOMETRY_SELECTOR = [
  '#app','#hud','#hud .hud-top','#hud .mission-hud','#hud .flight-data','#hud .hud-notices','#hud .flight-tip',
  '#hud .hud-notices > *','#hud .flight-button','#hud #throttle','#hud #throttle-layout-note','#announcement','#ally-announcements',
].join(',');

/** Visible product UI and touch targets that should remain unobscured by marker text. */
export function collectMarkerKeepOuts(root: ParentNode, includeVisuallyHidden=false): MarkerKeepOut[] {
  const selector = [
    '#hud .hud-top','#hud .mission-hud','#hud .flight-data','#hud .flight-tip',
    '#hud .hud-notices > :not([hidden])','#hud .flight-button:not([hidden])','#hud #throttle:not([hidden])',
    '#hud #throttle-layout-note:not([hidden])','#announcement:not(:empty)','#ally-announcements:not(:empty)',
  ].join(',');
  const boxes: MarkerKeepOut[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    if (element.hidden || element.closest('[hidden]')) continue;
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    if (style.display === 'none' || (!includeVisuallyHidden&&style.visibility === 'hidden') || rect.width <= 0 || rect.height <= 0) continue;
    boxes.push({ x:rect.left, y:rect.top, width:rect.width, height:rect.height });
  }
  return boxes;
}

/** Keep DOM geometry reads off the render loop; invalidate on layout or UI changes. */
export class MarkerKeepOutCache {
  private dirty=true;
  private boxes:MarkerKeepOut[]=[];
  private readonly resizeObserver:ResizeObserver|null;
  private readonly mutationObserver:MutationObserver;
  private active=false;
  private readonly observed=new Set<Element>();
  private readonly resize=()=>{this.dirty=true;};
  private readonly mutations=(records:MutationRecord[])=>{
    if(records.some(record=>record.type!=='attributes'||(record.attributeName!==null&&record.oldValue!==(record.target as Element).getAttribute(record.attributeName))))this.dirty=true;
  };
  constructor(private readonly root:Document) {
    this.resizeObserver=typeof ResizeObserver==='undefined'?null:new ResizeObserver(this.resize);
    this.mutationObserver=new MutationObserver(this.mutations);
    this.connect();
    this.refresh();
  }
  invalidate():void{this.dirty=true;}
  read():readonly MarkerKeepOut[]{
    if(!this.active)this.connect();
    const pending=this.mutationObserver.takeRecords();if(pending.length)this.mutations(pending);
    if(this.dirty)this.refresh();
    return this.boxes;
  }
  private connect():void{
    if(this.active)return;this.active=true;
    const app=this.root.getElementById('app'),hud=this.root.getElementById('hud');
    if(app)this.mutationObserver.observe(app,{attributes:true,attributeFilter:['data-screen','data-mode','data-input'],attributeOldValue:true});
    if(hud)this.mutationObserver.observe(hud,{attributes:true,attributeFilter:['hidden'],attributeOldValue:true});
    for(const element of this.root.querySelectorAll<HTMLElement>(MARKER_GEOMETRY_SELECTOR)){
      if(element.id==='app'||element.id==='hud')continue;
      const announcement=element.id==='announcement'||element.id==='ally-announcements';
      this.mutationObserver.observe(element,{attributes:true,attributeFilter:['hidden','class','style'],attributeOldValue:true,childList:announcement,characterData:announcement});
    }
    this.root.defaultView?.addEventListener('resize',this.resize);this.dirty=true;
  }
  private refresh():void{
    this.boxes=collectMarkerKeepOuts(this.root);this.dirty=false;
    if(this.resizeObserver){
      for(const element of this.root.querySelectorAll<HTMLElement>(MARKER_GEOMETRY_SELECTOR)){
        if(this.observed.has(element))continue;this.observed.add(element);this.resizeObserver.observe(element);
      }
    }
  }
  dispose():void{
    this.resizeObserver?.disconnect();this.mutationObserver.disconnect();this.root.defaultView?.removeEventListener('resize',this.resize);this.observed.clear();this.active=false;this.dirty=true;
  }
}

function overlaps(a: MarkerKeepOut, b: MarkerKeepOut, padding=3): boolean {
  return a.x < b.x+b.width+padding && a.x+a.width+padding > b.x && a.y < b.y+b.height+padding && a.y+a.height+padding > b.y;
}

export interface RadarLayout { x:number; y:number; radius:number; bounds:MarkerKeepOut; }
let lastRadarSignature='',lastRadarLayout:RadarLayout|null=null;

/** Find the closest open viewport slot while reserving HUD, controls and sight space. */
export function chooseRadarLayout(width:number,height:number,keepOuts:readonly MarkerKeepOut[],sightKeepOut?:MarkerKeepOut):RadarLayout|null {
  const radius=width<360?42:49,boxWidth=radius*2+8,boxHeight=radius*2+34,padding=4;
  const minX=boxWidth/2+8,maxX=width-boxWidth/2-8,minY=boxHeight/2+8,maxY=height-boxHeight/2-8;
  if(minX>maxX||minY>maxY)return null;
  const obstacles=sightKeepOut?[...keepOuts,sightKeepOut]:keepOuts;
  const quantize=(value:number)=>Math.round(value*2)/2;
  const signature=[width,height,radius,...obstacles.flatMap(box=>[box.x,box.y,box.width,box.height].map(quantize))].join(':');
  if(signature===lastRadarSignature)return lastRadarLayout;
  const preferredX=maxX,preferredY=Math.max(minY,Math.min(maxY,Math.min(height*.33,180)));
  const xs=[preferredX,minX,maxX];
  for(const box of obstacles){xs.push(box.x-boxWidth/2-padding,box.x+box.width+boxWidth/2+padding);}
  const candidates=[...new Set(xs.map(x=>Math.max(minX,Math.min(maxX,x))))].sort((a,b)=>Math.abs(a-preferredX)-Math.abs(b-preferredX));
  let best:{x:number;y:number;distance:number}|null=null;
  for(const x of candidates){
    const radarX=x-boxWidth/2,blocked: [number,number][]=[];
    for(const box of obstacles){
      if(radarX<box.x+box.width+padding&&radarX+boxWidth+padding>box.x)blocked.push([box.y-boxHeight/2-padding,box.y+box.height+boxHeight/2+padding]);
    }
    blocked.sort((a,b)=>a[0]-b[0]);
    let cursor=minY;
    const consider=(low:number,high:number)=>{if(low>high)return;const y=Math.max(low,Math.min(high,preferredY)),distance=Math.hypot(x-preferredX,y-preferredY);if(!best||distance<best.distance)best={x,y,distance};};
    for(const [from,to] of blocked){if(to<minY||from>maxY)continue;consider(cursor,Math.min(maxY,from));cursor=Math.max(cursor,to);if(cursor>maxY)break;}
    consider(cursor,maxY);
  }
  lastRadarSignature=signature;
  const chosen=best as {x:number;y:number;distance:number}|null;
  lastRadarLayout=chosen?{x:chosen.x,y:chosen.y,radius,bounds:{x:chosen.x-boxWidth/2,y:chosen.y-boxHeight/2,width:boxWidth,height:boxHeight}}:null;
  return lastRadarLayout;
}
function placeMarkerLabel(context: CanvasRenderingContext2D, text: string, anchorX: number, anchorY: number, preferredBaseline: number,
  width: number, height: number, keepOuts: readonly MarkerKeepOut[], occupied: readonly MarkerLabelBox[]): MarkerLabelBox {
  const metrics=context.measureText(text), ascent=metrics.actualBoundingBoxAscent||10, descent=metrics.actualBoundingBoxDescent||3, labelWidth=metrics.width, labelHeight=ascent+descent;
  const boxAt=(x:number,baseline:number):MarkerLabelBox=>({text,x:x-labelWidth/2,y:baseline-ascent,width:labelWidth,height:labelHeight,anchorX:x,anchorY:baseline});
  const horizontal=labelWidth/2+12, vertical=labelHeight+12;
  const offsets:[number,number][]=[
    [0,0],[0,vertical],[0,-vertical],[horizontal,0],[-horizontal,0],[0,vertical*2],[0,-vertical*2],
    [horizontal,vertical],[-horizontal,vertical],[horizontal,-vertical],[-horizontal,-vertical],
    [horizontal*2,0],[-horizontal*2,0],[0,vertical*3],[0,-vertical*3],
  ];
  const fits=(box:MarkerLabelBox)=>box.x>=2&&box.y>=2&&box.x+box.width<=width-2&&box.y+box.height<=height-2&&
    !keepOuts.some(rect=>overlaps(box,rect))&&!occupied.some(rect=>overlaps(box,rect));
  for (const [dx,dy] of offsets) {
    const box=boxAt(anchorX+dx,preferredBaseline+dy);
    if(fits(box))return box;
  }
  // Dense overlays still leave every required label visible in the nearest open canvas cell.
  let nearest:MarkerLabelBox|null=null,nearestDistance=Infinity;
  for(let y=10;y<height-8;y+=16)for(let x=labelWidth/2+4;x<width-labelWidth/2-4;x+=20){
    const candidate=boxAt(x,y);if(!fits(candidate))continue;
    const distance=Math.hypot(x-anchorX,y-anchorY);if(distance<nearestDistance){nearest=candidate;nearestDistance=distance;}
  }
  return nearest??boxAt(Math.max(labelWidth/2+2,Math.min(width-labelWidth/2-2,anchorX)),Math.max(ascent+2,Math.min(height-descent-2,preferredBaseline)));
}
function drawMarkerLabel(context: CanvasRenderingContext2D, box: MarkerLabelBox, anchorX: number, anchorY: number, color: string): void {
  const moved=Math.hypot(box.anchorX-anchorX,box.anchorY-anchorY)>3;
  if(moved){
    const edgeX=Math.max(box.x,Math.min(anchorX,box.x+box.width)),edgeY=Math.max(box.y,Math.min(anchorY,box.y+box.height));
    context.save();context.globalAlpha=.65;context.strokeStyle=color;context.lineWidth=1;context.beginPath();context.moveTo(anchorX,anchorY);context.lineTo(edgeX,edgeY);context.stroke();context.restore();
  }
  context.fillStyle=color;
  context.fillText(box.text,box.anchorX,box.anchorY);
}

const ENEMY_COLOR='#ffb28b',ALLY_COLOR='#77dacb',AIM_COLORS={clear:'#ffffff',enemy:'#ff645b',friendly:'#6cb8ff'} as const;

function aimRadius(mode:GameState['mode'],width:number,height:number):number{
  return mode==='normal'?Math.max(26,Math.min(38,Math.min(width,height)*.085)):Math.min(width,height)*EASY_AIM_RADIUS;
}
function sightPoint(state:GameState,width:number,height:number,project:(position:Vector3)=>MarkerProjection):MarkerProjection{
  if(state.mode==='easy')return{x:width/2,y:height/2,visible:true,behind:false};
  const player=state.fighters.find(fighter=>fighter.id===state.playerId&&fighter.health>0);
  if(!player)return{x:width/2,y:height/2,visible:false,behind:false};
  return project(new Vector3(0,0,-504.5).applyQuaternion(player.quaternion).add(player.position));
}
function aimColor(state:GameState,sight:MarkerProjection,radius:number,project:(position:Vector3)=>MarkerProjection):string{
  const player=state.fighters.find(fighter=>fighter.id===state.playerId&&fighter.health>0);
  if(!player)return AIM_COLORS.clear;
  const selected=selectedFlightTargetKey(state);let color:keyof typeof AIM_COLORS='clear';
  for(const target of [...state.fighters,...state.ufos]){
    if(target.id===player.id||target.health<=0)continue;
    const enemy=target.kind==='ufo',distance=player.position.distanceTo(target.position),range=state.mode==='easy'?1200:1500;
    if(distance>range)continue;
    if(enemy&&state.mode==='easy'&&flightTargetKey(target)!==selected)continue;
    const projection=project(target.position);
    if(!projection.visible||Math.hypot(projection.x-sight.x,projection.y-sight.y)>radius||!flightTargetLineOfSight(state,target))continue;
    if(!enemy)return AIM_COLORS.friendly;
    color='enemy';
  }
  return AIM_COLORS[color];
}

function drawRadar(context:CanvasRenderingContext2D,state:GameState,layout:RadarLayout):void{
  const player=state.fighters.find(fighter=>fighter.id===state.playerId&&fighter.health>0);if(!player)return;
  const c=context,r=layout.radius;c.save();c.shadowBlur=0;c.translate(layout.x,layout.y);
  c.fillStyle='rgba(4,24,34,.66)';c.strokeStyle='rgba(150,212,211,.36)';c.lineWidth=1;
  c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.stroke();
  c.beginPath();c.arc(0,0,r/2,0,Math.PI*2);c.moveTo(-r,0);c.lineTo(r,0);c.moveTo(0,-r);c.lineTo(0,r);c.stroke();
  const cy=Math.cos(player.yaw),sy=Math.sin(player.yaw),range=2400;
  for(const target of [...state.fighters,...state.ufos]){
    if(target.id===player.id||target.health<=0)continue;
    const dx=target.position.x-player.position.x,dz=target.position.z-player.position.z;
    let x=((dx*cy-dz*sy)/range)*r,y=((dx*sy+dz*cy)/range)*r;const distance=Math.hypot(x,y),outside=distance>r-4;
    if(outside){x*=((r-4)/distance);y*=((r-4)/distance);}
    const friendly=target.kind==='aircraft';c.fillStyle=friendly?ALLY_COLOR:ENEMY_COLOR;c.strokeStyle=c.fillStyle;c.beginPath();
    if(friendly)c.arc(x,y,2.2,0,Math.PI*2);
    else{c.moveTo(x,y-3);c.lineTo(x+3,y);c.lineTo(x,y+3);c.lineTo(x-3,y);c.closePath();}
    if(outside)c.stroke();else c.fill();
  }
  c.fillStyle='#fff4ce';c.beginPath();c.moveTo(0,-5);c.lineTo(3,4);c.lineTo(0,2);c.lineTo(-3,4);c.closePath();c.fill();
  c.fillStyle='#b8cfce';c.font='9px system-ui';c.textAlign='center';c.fillText('2.4km',0,r+13);c.restore();
}

function drawSight(context:CanvasRenderingContext2D,state:GameState,width:number,height:number,sight:MarkerProjection,radius:number,color:string):void{
  const c=context;if(!sight.visible)return;
  c.strokeStyle=color;c.lineWidth=1;c.beginPath();c.arc(sight.x,sight.y,radius,0,Math.PI*2);
  if(state.mode==='normal'){
    c.moveTo(sight.x-radius-6,sight.y);c.lineTo(sight.x-radius+5,sight.y);
    c.moveTo(sight.x+radius-5,sight.y);c.lineTo(sight.x+radius+6,sight.y);
    c.moveTo(sight.x,sight.y-radius-6);c.lineTo(sight.x,sight.y-radius+5);
    c.moveTo(sight.x,sight.y+radius-5);c.lineTo(sight.x,sight.y+radius+6);
    c.strokeStyle='rgba(3,25,39,.65)';c.lineWidth=2;c.stroke();c.strokeStyle=color;c.lineWidth=1;
  }
  c.stroke();
  const player=state.fighters.find(fighter=>fighter.id===state.playerId&&fighter.health>0);
  if(player&&player.reloadTicksRemaining>0){
    const progress=Math.max(0,Math.min(1,1-player.reloadTicksRemaining/RELOAD_TICKS));c.strokeStyle='rgba(7,30,43,.8)';c.lineWidth=5;
    c.beginPath();c.arc(sight.x,sight.y,radius+7,0,Math.PI*2);c.stroke();c.strokeStyle='#ffd27a';c.lineWidth=3;
    c.beginPath();c.arc(sight.x,sight.y,radius+7,-Math.PI/2,-Math.PI/2+progress*Math.PI*2);c.stroke();c.lineWidth=1;
  }
  c.fillStyle=color;c.fillRect(sight.x-1,sight.y-1,2,2);
}

/** Actual product Canvas2D UI, independent of the WebGL world renderer. */
export function drawFlightMarkers(context:CanvasRenderingContext2D,width:number,height:number,state:GameState,flight:boolean,
  project:(position:Vector3)=>MarkerProjection,camera:{position:Vector3;quaternion:import('three').Quaternion},keepOuts:readonly MarkerKeepOut[]=[]):MarkerLabelBox[]{
  const c=context;c.clearRect(0,0,width,height);if(!flight)return[];
  c.font='600 11px system-ui';c.textAlign='center';c.lineWidth=1.25;c.shadowColor='rgba(0,20,30,.9)';c.shadowBlur=3;
  const labels:MarkerLabelBox[]=[],occupied:MarkerLabelBox[]=[],player=state.fighters.find(f=>f.id===state.playerId&&f.health>0);
  const sight=sightPoint(state,width,height,project),radius=aimRadius(state.mode,width,height),visibleKeepOuts=[...keepOuts];
  const sightKeepOut=sight.visible?{x:sight.x-radius-(player?.reloadTicksRemaining?11:3),y:sight.y-radius-(player?.reloadTicksRemaining?11:3),width:(radius+(player?.reloadTicksRemaining?11:3))*2,height:(radius+(player?.reloadTicksRemaining?11:3))*2}:undefined;
  if(sightKeepOut)visibleKeepOuts.push(sightKeepOut);
  const radar=player?chooseRadarLayout(width,height,keepOuts,sightKeepOut):null;
  if(radar){visibleKeepOuts.push(radar.bounds);drawRadar(c,state,radar);}
  const addLabel=(text:string,x:number,anchorY:number,preferredBaseline:number,color:string)=>{
    const box=placeMarkerLabel(c,text,x,anchorY,preferredBaseline,width,height,visibleKeepOuts,occupied);
    drawMarkerLabel(c,box,x,anchorY,color);labels.push(box);occupied.push(box);
  };
  for(const target of [...state.ufos,...state.fighters]){
    if(target.kind==='aircraft'&&target.id===state.playerId)continue;if(target.health<=0)continue;
    const p=project(target.position),distance=player?player.position.distanceTo(target.position):0;
    if(!p.visible||(player&&distance>1500))continue;
    const enemy=target.kind==='ufo';c.strokeStyle=enemy?ENEMY_COLOR:ALLY_COLOR;c.fillStyle=c.strokeStyle;c.lineWidth=1.25;c.beginPath();
    if(enemy){c.moveTo(p.x,p.y-6);c.lineTo(p.x+5,p.y);c.lineTo(p.x,p.y+6);c.lineTo(p.x-5,p.y);c.closePath();}
    else c.arc(p.x,p.y,4,0,Math.PI*2);
    c.stroke();
    if(enemy){
      c.fillStyle='rgba(7,24,32,.8)';c.fillRect(p.x-19,p.y+12,38,3);
      const ratio=target.maxHealth>0?Math.max(0,Math.min(1,target.health/target.maxHealth)):0;
      c.fillStyle='#ffc69b';c.fillRect(p.x-19,p.y+12,38*ratio,3);
      if(player)addLabel(`${Math.round(distance)}m`,p.x,p.y+14,p.y+28,'#f4e3c8');
    }
  }
  for(const district of state.city){
    if(!district.attacked||district.destroyed)continue;
    const p=project(district.position);c.strokeStyle='#ffe6a6';c.fillStyle='#ffe6a6';
    if(p.visible){c.beginPath();c.moveTo(p.x,p.y-13);c.lineTo(p.x+13,p.y+10);c.lineTo(p.x-13,p.y+10);c.closePath();c.stroke();
      addLabel(`街 ${district.token+1} · ${Math.ceil(district.health)}HP`,p.x,p.y,p.y+29,'#ffe6a6');
    }else{
      const local=district.position.clone().sub(camera.position).applyQuaternion(camera.quaternion.clone().invert()),angle=Math.atan2(local.x,-local.z),x=width*.5+Math.sin(angle)*width*.41,y=height*.5-Math.cos(angle)*height*.34;
      c.save();c.translate(x,y);c.rotate(angle);c.beginPath();c.moveTo(0,-9);c.lineTo(7,5);c.lineTo(-7,5);c.closePath();c.stroke();c.restore();
    }
  }
  if(player){const color=aimColor(state,sight,radius,project);drawSight(c,state,width,height,sight,radius,color);}
  return labels;
}
