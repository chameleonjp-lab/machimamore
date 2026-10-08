import { Vector3 } from 'three';
import { EASY_AIM_RADIUS } from './flight-view';
import type { GameState } from './types';

export interface MarkerProjection { x:number; y:number; visible:boolean; behind:boolean; }
/** Actual product Canvas2D UI, independent of the WebGL world renderer. */
export function drawFlightMarkers(context: CanvasRenderingContext2D, width: number, height: number, state: GameState, flight: boolean, project: (position: Vector3) => MarkerProjection, camera: {position: Vector3; quaternion: import('three').Quaternion}): void {
    const c=context;c.clearRect(0,0,width,height);if(!flight)return;c.font='600 12px system-ui';c.textAlign='center';c.lineWidth=1.5;
    for(const ufo of state.ufos){const p=project(ufo.position);if(!p.visible)continue;c.strokeStyle='#ffdaa3';c.fillStyle='#ffeed3';c.beginPath();c.moveTo(p.x,p.y-12);c.lineTo(p.x+12,p.y);c.lineTo(p.x,p.y+12);c.lineTo(p.x-12,p.y);c.closePath();c.stroke();c.fillText('UFO',p.x,p.y-18);}
    for(const f of state.fighters){if(f.id===state.playerId)continue;const p=project(f.position);if(!p.visible)continue;c.strokeStyle='#cbeae5';c.strokeRect(p.x-9,p.y-9,18,18);c.fillStyle='#d8efe9';c.fillText('味方',p.x,p.y-15);}
    for(const d of state.city){if(!d.attacked||d.destroyed)continue;const p=project(d.position);c.strokeStyle='#ffe6a6';c.fillStyle='#ffe6a6';if(p.visible){c.beginPath();c.moveTo(p.x,p.y-13);c.lineTo(p.x+13,p.y+10);c.lineTo(p.x-13,p.y+10);c.closePath();c.stroke();c.fillText(`街 ${d.token+1} · ${Math.ceil(d.health)}HP`,p.x,p.y+29);}else{const local=d.position.clone().sub(camera.position).applyQuaternion(camera.quaternion.clone().invert());const angle=Math.atan2(local.x,-local.z),x=width*.5+Math.sin(angle)*width*.41,y=height*.5-Math.cos(angle)*height*.34;c.save();c.translate(x,y);c.rotate(angle);c.beginPath();c.moveTo(0,-9);c.lineTo(7,5);c.lineTo(-7,5);c.closePath();c.stroke();c.restore();}}
    const player=state.fighters.find(f=>f.id===state.playerId);if(!player)return;const cx=width/2,cy=height/2;
    c.strokeStyle='#eff4db';c.lineWidth=1.2;if(state.mode==='easy'){c.setLineDash([6,5]);c.beginPath();c.arc(cx,cy,Math.min(width,height)*EASY_AIM_RADIUS,0,Math.PI*2);c.stroke();c.setLineDash([]);}
    else{const forward=new Vector3(0,0,-504.5).applyQuaternion(player.quaternion).add(player.position),sight=project(forward);c.beginPath();c.arc(sight.x,sight.y,8,0,Math.PI*2);c.moveTo(sight.x-16,sight.y);c.lineTo(sight.x-4,sight.y);c.moveTo(sight.x+4,sight.y);c.lineTo(sight.x+16,sight.y);c.moveTo(sight.x,sight.y-16);c.lineTo(sight.x,sight.y-4);c.stroke();}
  }
