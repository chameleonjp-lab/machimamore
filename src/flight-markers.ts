import { Vector3 } from 'three';
import { EASY_AIM_RADIUS } from './flight-view';
import type { GameState } from './types';

export interface MarkerProjection { x:number; y:number; visible:boolean; behind:boolean; }
export interface MarkerLabelBox { text:string; x:number; y:number; width:number; height:number; anchorX:number; anchorY:number; }
export interface MarkerKeepOut { x:number; y:number; width:number; height:number; }

const MARKER_GEOMETRY_SELECTOR = [
  '#app','#hud','#hud .hud-top','#hud .enemy-tally','#hud .friendly-tally','#hud .city-tally','#hud .flight-data','#hud .flight-tip',
  '#hud .hud-notices > *','#hud .flight-button','#hud #throttle','#hud #throttle-layout-note','#announcement','#ally-announcements',
].join(',');

/** Visible product UI and touch targets that should remain unobscured by marker text. */
export function collectMarkerKeepOuts(root: ParentNode): MarkerKeepOut[] {
  const selector = [
    '#hud .hud-top','#hud .enemy-tally','#hud .friendly-tally','#hud .city-tally','#hud .flight-data','#hud .flight-tip',
    '#hud .hud-notices > :not([hidden])','#hud .flight-button:not([hidden])','#hud #throttle:not([hidden])',
    '#hud #throttle-layout-note:not([hidden])','#announcement:not(:empty)','#ally-announcements:not(:empty)',
  ].join(',');
  const boxes: MarkerKeepOut[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    if (element.hidden || element.closest('[hidden]')) continue;
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) continue;
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
  context.fillText(box.text,box.anchorX,box.anchorY);
}

/** Actual product Canvas2D UI, independent of the WebGL world renderer. */
export function drawFlightMarkers(context: CanvasRenderingContext2D, width: number, height: number, state: GameState, flight: boolean, project: (position: Vector3) => MarkerProjection, camera: {position: Vector3; quaternion: import('three').Quaternion}, keepOuts: readonly MarkerKeepOut[]=[]): MarkerLabelBox[] {
    const c=context;c.clearRect(0,0,width,height);if(!flight)return[];c.font='600 12px system-ui';c.textAlign='center';c.lineWidth=1.5;
    const labels:MarkerLabelBox[]=[],occupied:MarkerLabelBox[]=[],player=state.fighters.find(f=>f.id===state.playerId);
    const cx=width/2,cy=height/2,visibleKeepOuts=[...keepOuts];let sight:MarkerProjection|null=null,easyRadius=0;
    if(player&&state.mode==='easy'){easyRadius=Math.min(width,height)*EASY_AIM_RADIUS;visibleKeepOuts.push({x:cx-easyRadius,y:cy-easyRadius,width:easyRadius*2,height:easyRadius*2});}
    else if(player){const forward=new Vector3(0,0,-504.5).applyQuaternion(player.quaternion).add(player.position);sight=project(forward);visibleKeepOuts.push({x:sight.x-19,y:sight.y-19,width:38,height:38});}
    const addLabel=(text:string,x:number,anchorY:number,preferredBaseline:number,color:string)=>{const box=placeMarkerLabel(c,text,x,anchorY,preferredBaseline,width,height,visibleKeepOuts,occupied);drawMarkerLabel(c,box,x,anchorY,color);labels.push(box);occupied.push(box);};
    for(const ufo of state.ufos){const p=project(ufo.position);if(!p.visible)continue;c.strokeStyle='#ffdaa3';c.fillStyle='#ffeed3';c.beginPath();c.moveTo(p.x,p.y-12);c.lineTo(p.x+12,p.y);c.lineTo(p.x,p.y+12);c.lineTo(p.x-12,p.y);c.closePath();c.stroke();addLabel('UFO',p.x,p.y,p.y-18,'#ffdaa3');}
    for(const f of state.fighters){if(f.id===state.playerId)continue;const p=project(f.position);if(!p.visible)continue;c.strokeStyle='#cbeae5';c.strokeRect(p.x-9,p.y-9,18,18);c.fillStyle='#d8efe9';addLabel('味方',p.x,p.y,p.y-15,'#cbeae5');}
    for(const d of state.city){if(!d.attacked||d.destroyed)continue;const p=project(d.position);c.strokeStyle='#ffe6a6';c.fillStyle='#ffe6a6';if(p.visible){c.beginPath();c.moveTo(p.x,p.y-13);c.lineTo(p.x+13,p.y+10);c.lineTo(p.x-13,p.y+10);c.closePath();c.stroke();addLabel(`街 ${d.token+1} · ${Math.ceil(d.health)}HP`,p.x,p.y,p.y+29,'#ffe6a6');}else{const local=d.position.clone().sub(camera.position).applyQuaternion(camera.quaternion.clone().invert());const angle=Math.atan2(local.x,-local.z),x=width*.5+Math.sin(angle)*width*.41,y=height*.5-Math.cos(angle)*height*.34;c.save();c.translate(x,y);c.rotate(angle);c.beginPath();c.moveTo(0,-9);c.lineTo(7,5);c.lineTo(-7,5);c.closePath();c.stroke();c.restore();}}
    if(!player)return labels;c.strokeStyle='#eff4db';c.lineWidth=1.2;if(state.mode==='easy'){c.setLineDash([6,5]);c.beginPath();c.arc(cx,cy,easyRadius,0,Math.PI*2);c.stroke();c.setLineDash([]);}
    else if(sight){c.beginPath();c.arc(sight.x,sight.y,8,0,Math.PI*2);c.moveTo(sight.x-16,sight.y);c.lineTo(sight.x-4,sight.y);c.moveTo(sight.x+4,sight.y);c.lineTo(sight.x+16,sight.y);c.moveTo(sight.x,sight.y-16);c.lineTo(sight.x,sight.y-4);c.stroke();}
    return labels;
  }
