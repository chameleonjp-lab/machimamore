import { chooseRadarLayout, collectMarkerKeepOuts } from './flight-markers';

/** Unscaled layout-CSS-pixel centre rectangles shared by live placement, preview and Save. */
export type ControlObstacle = { x: number; y: number; width: number; height: number };

/** offset dimensions exclude CSS zoom/transforms, matching the CSS size written by settings. */
export function controlLayoutSize(element: HTMLElement): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  return { width: element.offsetWidth || rect.width, height: element.offsetHeight || rect.height };
}

/** Measure only a detached copy of the HUD, including when the real HUD is hidden.
 * No real visibility, focus, listeners or saved positions are changed. The clone
 * has the current app dimensions and inherited CSS, including font zoom/safe area.
 */
export function measureHudObstacles(app: HTMLElement): ControlObstacle[] {
  const hud = app.querySelector<HTMLElement>('#hud');
  const rect = controlLayoutSize(app);
  if (!hud || typeof app.cloneNode !== 'function' || !(rect.width > 0 && rect.height > 0)) return [];
  const host = app.cloneNode(false) as HTMLElement;
  host.removeAttribute('hidden');
  host.classList.add('playing'); host.classList.remove('easy-mode');
  host.dataset.phase = 'playing'; host.dataset.mode = 'normal'; host.dataset.screen = 'playing';
  host.inert = true; host.setAttribute('aria-hidden', 'true');
  for (const [property,value] of Object.entries({ position:'fixed', left:'-100000px', top:'0', right:'auto', bottom:'auto', width:`${rect.width}px`, height:`${rect.height}px`, minWidth:'0', maxWidth:'none', minHeight:'0', maxHeight:'none', margin:'0', transform:'translateZ(0)', visibility:'hidden', pointerEvents:'none' })) {
    host.style.setProperty(property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`),value,'important');
  }
  const copy = hud.cloneNode(true) as HTMLElement;
  copy.removeAttribute('hidden'); host.append(copy);
  const normalControls=copy.querySelector<HTMLElement>('#normal-controls');if(normalControls)normalControls.hidden=false;
  app.parentElement?.append(host);
  try {
    if (!host.isConnected) return [];
    const origin = host.getBoundingClientRect();
    const scaleX = rect.width / origin.width, scaleY = rect.height / origin.height;
    const obstacles:ControlObstacle[]=[...copy.querySelectorAll<HTMLElement>('button:not(.action-control):not(.flight-button):not([data-flight-control])')]
      .filter(element => !element.hidden && !element.closest('[hidden]'))
      .map(element => element.getBoundingClientRect())
      .filter(item => item.width > 0 && item.height > 0)
      .map(item => ({ x:(item.left-origin.left+item.width/2)*scaleX, y:(item.top-origin.top+item.height/2)*scaleY, width:item.width*scaleX, height:item.height*scaleY }));
    const uiBoxes=collectMarkerKeepOuts(host,true).map(item=>({x:(item.x-origin.left)*scaleX,y:(item.y-origin.top)*scaleY,width:item.width*scaleX,height:item.height*scaleY}));
    const shortEdge=Math.min(rect.width,rect.height),radius=Math.max(26,Math.min(38,shortEdge*.085))+11;
    const sight={x:rect.width/2-radius,y:rect.height*.363-radius,width:radius*2,height:radius*2};
    const radar=chooseRadarLayout(rect.width,rect.height,uiBoxes,sight);
    if(radar)obstacles.push({x:radar.x,y:radar.y,width:radar.bounds.width,height:radar.bounds.height});
    return obstacles;
  } finally { host.remove(); }
}

/** Convert visual viewport pixels into the editor's unscaled layout space.
 * getBoundingClientRect includes inherited zoom/transforms; offsets do not.
 */
export function settingsViewportSize(element: HTMLElement, width: number, height: number): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  const x = element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1;
  const y = element.offsetHeight > 0 ? rect.height / element.offsetHeight : 1;
  return { width: width / (Number.isFinite(x) && x > 0 ? x : 1),
    height: height / (Number.isFinite(y) && y > 0 ? y : 1) };
}
