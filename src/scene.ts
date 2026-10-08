import { drawFlightMarkers } from './flight-markers';
import { ACESFilmicToneMapping, BackSide, BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DirectionalLight, Fog, Group, HemisphereLight, InstancedMesh, Line, LineBasicMaterial, LineDashedMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Quaternion, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3, Vector4, WebGLRenderer, type Material } from 'three';
import { AircraftFactory, type AircraftVisual } from './aircraft';
import { AircraftBatchFactory } from './aircraft-batch';
import { FLIGHT_FOV, FLIGHT_FAR, EASY_AIM_RADIUS, getFlightCameraPose } from './flight-view';
import { ACTIVE_LIMIT, MAX_BEAMS, MAX_BULLETS } from './rules';
import type { Aircraft, CityDistrict, GameState } from './types';

type DistrictVisual = { root: Group; intact: Group; rubble: Group; smoke: Group; material: MeshStandardMaterial; danger: LineSegments };
const UP = new Vector3(0, 1, 0);
const DISTRICT_INTACT = new Color(0xb3ae91), DISTRICT_DAMAGED = new Color(0x555b53);
/** Rendering reads fixed-tick facts only. All flight/laser/city pools have fixed capacities. */
export class MachiMamoreScene {
  readonly renderer: WebGLRenderer;
  readonly camera = new PerspectiveCamera(FLIGHT_FOV, 1, .5, FLIGHT_FAR);
  private world = new Scene();
  private factory = new AircraftFactory();
  private batches = new AircraftBatchFactory();
  private planes: AircraftVisual[] = [];
  private saucers: Group[] = [];
  private beamMeshes: Mesh[] = [];
  private warningLines: Line[] = [];
  private districts: DistrictVisual[] = [];
  private geometries = new Set<BufferGeometry>();
  private materials = new Set<Material>();
  private box = this.geometry(new BoxGeometry(1, 1, 1));
  private sphere = this.geometry(new SphereGeometry(1, 12, 8));
  private cylinder = this.geometry(new CylinderGeometry(1, 1, 1, 24));
  private mother = new Group();
  private tracerGeometry = this.geometry(new BufferGeometry());
  private tracerPositions = new Float32Array(MAX_BULLETS * 6);
  private tracers: LineSegments;
  private sea: ShaderMaterial;
  private ctx: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private disposed = false;
  private current: GameState | null = null;
  private reducedMotion = false;
  private ready = false;
  private cameraMission = -1;
  private cameraPlayer: number | null = null;
  private cameraTransferTick = -1;
  private transferPosition = new Vector3();
  private transferQuaternion = new Quaternion();

  constructor(private canvas: HTMLCanvasElement, private overlay: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias:false, alpha:false, powerPreference:'high-performance' });
    this.renderer.outputColorSpace=SRGBColorSpace;this.renderer.toneMapping=ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    const ctx=overlay.getContext('2d');if(!ctx)throw new Error('危険マーカーを描画できません');this.ctx=ctx;
    this.world.fog=new Fog(0xb5c4bf,1600,6100);this.world.background=new Color(0xb5c4bf);
    this.world.add(new HemisphereLight(0xd4ebf0,0x575142,2.6));const sun=new DirectionalLight(0xffe2b0,3.3);sun.position.set(-1600,2400,1400);this.world.add(sun);
    const sky=this.mesh(this.geometry(new SphereGeometry(6200,24,12)),this.material(new ShaderMaterial({side:BackSide,depthWrite:false,vertexShader:'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vPosition;void main(){float h=clamp(normalize(vPosition).y,0.,1.);vec3 c=mix(vec3(.79,.80,.70),vec3(.20,.38,.48),pow(h,.55));gl_FragColor=vec4(c,1.);}'})));this.world.add(sky);
    this.sea=this.material(new ShaderMaterial({uniforms:{uTime:{value:0}},vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform float uTime;varying vec3 vP;void main(){float a=sin(vP.x*.042+uTime*.23)*sin(vP.y*.027-uTime*.2);float b=pow(max(0.,sin(vP.x*.014+vP.y*.047+uTime*.14)),22.);vec3 c=vec3(.10,.25,.30)+a*.014+b*.045;gl_FragColor=vec4(c,1.);}'}));
    const ocean=this.mesh(this.geometry(new PlaneGeometry(22000,22000)),this.sea);ocean.rotation.x=-Math.PI/2;ocean.position.y=-.1;this.world.add(ocean);
    this.createLandscape();this.createMothership();
    const saucerPrototype=this.createSaucer();
    for(let i=0;i<ACTIVE_LIMIT;i++) {const detail=i===0?'hero':'enemy',plane=this.batches.optimize(this.factory.create(detail),detail);plane.root.visible=false;this.planes.push(plane);this.world.add(plane.root);const saucer=saucerPrototype.clone(true);saucer.visible=false;this.saucers.push(saucer);this.world.add(saucer);
      const geom=this.geometry(new BufferGeometry().setAttribute('position',new BufferAttribute(new Float32Array(6),3)).setAttribute('lineDistance',new BufferAttribute(new Float32Array(2),1)));
      const line=new Line(geom,this.material(new LineDashedMaterial({color:0xffdb9a,dashSize:12,gapSize:9,depthTest:true})));line.visible=false;line.frustumCulled=false;this.warningLines.push(line);this.world.add(line);
    }
    const beamGeometry=this.geometry(new CylinderGeometry(1,1,1,6,1));const beamMaterial=this.material(new MeshBasicMaterial({color:0xffd8a1}));
    for(let i=0;i<MAX_BEAMS;i++){const mesh=this.mesh(beamGeometry,beamMaterial);mesh.visible=false;mesh.frustumCulled=false;this.beamMeshes.push(mesh);this.world.add(mesh);}
    this.tracerGeometry.setAttribute('position',new BufferAttribute(this.tracerPositions,3));this.tracerGeometry.setDrawRange(0,0);
    this.tracers=new LineSegments(this.tracerGeometry,this.material(new LineBasicMaterial({color:0xffe6a4})));this.tracers.frustumCulled=false;this.world.add(this.tracers);this.resize();
  }
  private geometry<T extends BufferGeometry>(value:T):T{this.geometries.add(value);return value;}
  private material<T extends Material>(value:T):T{this.materials.add(value);return value;}
  private mesh(geometry:BufferGeometry,material:Material):Mesh{return new Mesh(geometry,material);}
  private block(parent:Group,x:number,y:number,z:number,w:number,h:number,d:number,material:Material):Mesh{const mesh=this.mesh(this.box,material);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);return mesh;}
  private createLandscape():void {
    const land=new Group();const ground=this.material(new MeshStandardMaterial({color:0x747f66,roughness:1}));this.block(land,0,2,-2400,2600,8,4100,ground);
    const quay=this.material(new MeshStandardMaterial({color:0x8a8c7d,roughness:1}));this.block(land,0,4,-364,2600,6,26,quay);
    const road=this.material(new MeshStandardMaterial({color:0x626d69,roughness:1}));for(let row=0;row<5;row++)this.block(land,0,6.2,-565-row*190,1150,.3,26,road);for(let col=0;col<6;col++)this.block(land,-550+col*220,6.25,-970,24,.3,890,road);
    const dock=this.material(new MeshStandardMaterial({color:0x858b83,roughness:.85}));const crane=this.material(new MeshStandardMaterial({color:0x3d5b60,roughness:.7}));
    for(const side of [-1,1]) {this.block(land,side*865,3,-230,130,10,265,dock);this.block(land,side*1100,3,-105,30,10,480,dock);for(let i=0;i<3;i++){const x=side*865,z=-315+i*70;this.block(land,x,31,z,5,50,5,crane);this.block(land,x+side*22,56,z,50,4,4,crane);this.block(land,x+side*42,39,z,2,31,2,crane);}}
    const mountainGeo=this.geometry(new ConeGeometry(1,1,7,1));const mountainMat=this.material(new MeshStandardMaterial({color:0x607a6c,roughness:1}));
    for(let i=0;i<18;i++){const m=this.mesh(mountainGeo,mountainMat),h=160+(i*113)%360;m.position.set((i-8.5)*370,h/2-12,-2600-(i%3)*240);m.scale.set(300+(i%4)*60,h,320+(i%3)*80);land.add(m);}
    this.world.add(land);
  }
  private createSaucer():Group {
    const root=new Group();const hull=this.material(new MeshStandardMaterial({color:0x666d78,metalness:.65,roughness:.32}));const rim=this.material(new MeshStandardMaterial({color:0x293b49,metalness:.7,roughness:.45}));const glow=this.material(new MeshBasicMaterial({color:0xffc38a}));
    const disc=this.mesh(this.geometry(new CylinderGeometry(8,12,3,28,1)),hull);disc.position.y=2;root.add(disc);
    const top=this.mesh(this.sphere,hull);top.scale.set(6,3.7,6);top.position.y=4;root.add(top);
    const ring=this.mesh(this.geometry(new TorusGeometry(10.4,.7,7,32)),rim);ring.rotation.x=Math.PI/2;ring.position.y=2;root.add(ring);
    // The emissive muzzle is the entity origin: the authoritative warning/beam start S.
    const emitter=this.mesh(this.sphere,glow);emitter.scale.set(1.5,.75,1.5);root.add(emitter);
    for(let i=0;i<8;i++){const light=this.mesh(this.sphere,glow);light.scale.set(.45,.4,.45);light.position.set(Math.cos(i*Math.PI/4)*10.3,1.5,Math.sin(i*Math.PI/4)*10.3);root.add(light);}
    return root;
  }
  private createMothership():void {
    const hull=this.material(new MeshStandardMaterial({color:0x47525c,metalness:.7,roughness:.44}));const dark=this.material(new MeshStandardMaterial({color:0x263b49,metalness:.5,roughness:.6}));const glow=this.material(new MeshBasicMaterial({color:0xbad5ca}));
    const body=this.mesh(this.geometry(new CylinderGeometry(300,390,85,48,1)),hull);this.mother.add(body);
    const top=this.mesh(this.sphere,hull);top.scale.set(235,85,235);top.position.y=42;this.mother.add(top);
    const ring=this.mesh(this.geometry(new TorusGeometry(341,14,8,56)),dark);ring.rotation.x=Math.PI/2;this.mother.add(ring);
    for(let i=0;i<12;i++){const a=i*Math.PI/6,x=Math.cos(a)*285,z=Math.sin(a)*285;this.block(this.mother,x,48,z,34,70,36,dark);const lamp=this.mesh(this.sphere,glow);lamp.scale.set(9,4,9);lamp.position.set(x,-41,z);this.mother.add(lamp);}
    const core=this.mesh(this.geometry(new CylinderGeometry(32,52,48,20)),dark);core.position.y=-61;this.mother.add(core);this.mother.position.set(160,1050,-2580);this.world.add(this.mother);
  }
  private createDistrict(d:CityDistrict):DistrictVisual {
    const root=new Group(),intact=new Group(),rubble=new Group(),smoke=new Group();root.position.copy(d.position);root.add(intact,rubble,smoke);
    const material=this.material(new MeshStandardMaterial({color:0xb3ae91,roughness:.95})),roof=this.material(new MeshStandardMaterial({color:0x626d64,roughness:.95}));
    const base=this.material(new MeshStandardMaterial({color:0x949786,roughness:1}));this.block(root,0,-d.halfExtent.y+.5,0,d.halfExtent.x*2,1,d.halfExtent.z*2,base);
    // Six facades and roofs use two draw calls per district. Tallest roof stays in its AABB.
    const buildings=new InstancedMesh(this.box,material,6),roofs=new InstancedMesh(this.box,roof,6),pose=new Object3D();let instance=0;
    for(let z=0;z<2;z++)for(let x=0;x<3;x++){const w=d.halfExtent.x*2/3-8,depth=d.halfExtent.z-8,h=d.halfExtent.y*2-2-(x+z)%3*8,cx=(x-1)*d.halfExtent.x*2/3,cz=(z-.5)*d.halfExtent.z;
      pose.position.set(cx,-d.halfExtent.y+h/2,cz);pose.scale.set(w,h,depth);pose.updateMatrix();buildings.setMatrixAt(instance,pose.matrix);
      pose.position.set(cx,-d.halfExtent.y+h+1,cz);pose.scale.set(w+2,2,depth+2);pose.updateMatrix();roofs.setMatrixAt(instance,pose.matrix);instance++;
    }
    intact.add(buildings,roofs);
    // One persistent rubble representation per district: 20 meshes, below the debris cap 24.
    this.block(rubble,0,-d.halfExtent.y+3,0,d.halfExtent.x*2,5,d.halfExtent.z*2,roof);
    const smokeMat=this.material(new MeshBasicMaterial({color:0x384748,transparent:true,opacity:.36,depthWrite:false}));for(let i=0;i<3;i++){const puff=this.mesh(this.sphere,smokeMat);puff.position.set(i*5-5,d.halfExtent.y+12+i*20,0);puff.scale.set(12+i*7,14+i*10,12+i*7);smoke.add(puff);}
    const h=d.halfExtent,p=new Float32Array([-h.x, -h.y+.6,-h.z,h.x,-h.y+.6,-h.z,h.x,-h.y+.6,-h.z,h.x,-h.y+.6,h.z,h.x,-h.y+.6,h.z,-h.x,-h.y+.6,h.z,-h.x,-h.y+.6,h.z,-h.x,-h.y+.6,-h.z]);
    const danger=new LineSegments(this.geometry(new BufferGeometry().setAttribute('position',new BufferAttribute(p,3))),this.material(new LineBasicMaterial({color:0xffd79b})));root.add(danger);this.world.add(root);return{root,intact,rubble,smoke,material,danger};
  }
  async prepare(state:GameState):Promise<void>{
    this.ready=false;this.syncWorld(state,1);this.updateCamera(state,false,1);
    const flags:{object:Object3D;visible:boolean;frustumCulled:boolean}[]=[];
    this.world.traverse(object=>{flags.push({object,visible:object.visible,frustumCulled:object.frustumCulled});object.visible=true;object.frustumCulled=false;});
    const target=this.renderer.getRenderTarget(),face=this.renderer.getActiveCubeFace(),level=this.renderer.getActiveMipmapLevel();
    const viewport=this.renderer.getViewport(new Vector4()),scissor=this.renderer.getScissor(new Vector4()),scissorTest=this.renderer.getScissorTest();
    const cameraPosition=this.camera.position.clone(),cameraRotation=this.camera.quaternion.clone(),cameraUp=this.camera.up.clone();
    const drawRange={...this.tracerGeometry.drawRange};
    const player=state.fighters.find(f=>f.id===state.playerId)??state.fighters[0];
    try{
      // Render targets change Three's output color space and tone-mapping shader variant.
      // A tiny backbuffer viewport uploads the exact canvas programs and every pooled VAO,
      // texture and attribute, including effects whose logical state is not yet visible.
      this.renderer.setRenderTarget(null);this.renderer.setViewport(0,0,8,8);this.renderer.setScissor(0,0,8,8);this.renderer.setScissorTest(true);
      this.tracerGeometry.setDrawRange(0,MAX_BULLETS*2);
      if(player)getFlightCameraPose(player,state.mode,this.camera.position,this.camera.quaternion);
      await this.renderer.compileAsync(this.world,this.camera);
      if(this.disposed)return;
      this.renderer.render(this.world,this.camera);
      await this.waitForGpu();
    }finally{
      for(const flag of flags){flag.object.visible=flag.visible;flag.object.frustumCulled=flag.frustumCulled;}
      this.tracerGeometry.setDrawRange(drawRange.start,drawRange.count);
      this.camera.position.copy(cameraPosition);this.camera.quaternion.copy(cameraRotation);this.camera.up.copy(cameraUp);
      // An obsolete preparation must not change the context used by a newer scene.
      if(!this.disposed){this.renderer.setRenderTarget(target,face,level);this.renderer.setViewport(viewport);this.renderer.setScissor(scissor);this.renderer.setScissorTest(scissorTest);}
    }
    if(this.disposed)return;
    // Finish both real viewport paths while the mission clock is still stopped.
    this.resize();
    try{
      if(player){getFlightCameraPose(player,state.mode,this.camera.position,this.camera.quaternion);this.renderer.render(this.world,this.camera);}
    }finally{this.camera.position.copy(cameraPosition);this.camera.quaternion.copy(cameraRotation);this.camera.up.copy(cameraUp);}
    this.renderer.render(this.world,this.camera);
    await this.waitForGpu();
    if(!this.disposed)this.ready=true;
  }
  private async waitForGpu():Promise<void>{
    const gl=this.renderer.getContext() as WebGL2RenderingContext;
    if(gl.isContextLost())throw new Error('描画コンテキストが失われました。');
    const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
    if(!fence)throw new Error('描画準備の完了を確認できません。');
    try{
      gl.flush();
      while(!this.disposed){
        if(gl.isContextLost())throw new Error('描画コンテキストが失われました。');
        const status=gl.clientWaitSync(fence,0,0);
        if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)return;
        if(status===gl.WAIT_FAILED)throw new Error('描画準備の完了待機に失敗しました。');
        await new Promise<void>(resolve=>window.setTimeout(resolve,8));
      }
    }finally{gl.deleteSync(fence);}
  }
  setReducedMotion(value:boolean):void{this.reducedMotion=value;}
  resize():void{
    if(this.disposed)return;this.width=Math.max(1,window.innerWidth);this.height=Math.max(1,window.innerHeight);this.dpr=Math.min(window.devicePixelRatio||1,1.5);
    this.renderer.setPixelRatio(this.dpr);this.renderer.setSize(this.width,this.height,false);this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();this.overlay.width=Math.round(this.width*this.dpr);this.overlay.height=Math.round(this.height*this.dpr);this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
  }
  private syncWorld(state:GameState,alpha:number,resultAnimationTime=0):void{
    this.current=state;while(this.districts.length<state.city.length)this.districts.push(this.createDistrict(state.city[this.districts.length]!));
    for(let i=0;i<state.city.length;i++){const d=state.city[i]!,v=this.districts[i]!,ratio=d.health/d.maxHealth;v.intact.visible=!d.destroyed;v.rubble.visible=d.destroyed;v.smoke.visible=ratio<.55;v.danger.visible=d.attacked&&!d.destroyed;v.material.color.copy(DISTRICT_DAMAGED).lerp(DISTRICT_INTACT,ratio);}
    const player=state.fighters.find(f=>f.id===state.playerId)??null;const ordered=player?[player,...state.fighters.filter(f=>f.id!==player.id)]:state.fighters;
    for(let i=0;i<this.planes.length;i++){const visual=this.planes[i]!,fighter=ordered[i];visual.root.visible=!!fighter;if(!fighter)continue;visual.root.position.lerpVectors(fighter.previous,fighter.position,alpha);visual.root.quaternion.copy(fighter.quaternion);visual.propeller.rotation.z=state.elapsed*110;visual.ailerons[0].rotation.x=fighter.bank*.18;visual.ailerons[1].rotation.x=-fighter.bank*.18;visual.elevator.rotation.x=fighter.pitch*.13;}
    for(let i=0;i<this.saucers.length;i++){const visual=this.saucers[i]!,ufo=state.ufos[i];visual.visible=!!ufo;if(!ufo)continue;visual.position.lerpVectors(ufo.previous,ufo.position,alpha);visual.quaternion.copy(ufo.quaternion);const warning=this.warningLines[i]!;warning.visible=ufo.attack.phase==='warning';if(warning.visible){const pos=warning.geometry.attributes.position! as BufferAttribute;pos.setXYZ(0,ufo.attack.start.x,ufo.attack.start.y,ufo.attack.start.z);pos.setXYZ(1,ufo.attack.aimPoint.x,ufo.attack.aimPoint.y,ufo.attack.aimPoint.z);pos.needsUpdate=true;const distances=warning.geometry.attributes.lineDistance! as BufferAttribute;distances.setX(0,0);distances.setX(1,ufo.attack.start.distanceTo(ufo.attack.aimPoint));distances.needsUpdate=true;}}
    for(let i=state.ufos.length;i<this.warningLines.length;i++)this.warningLines[i]!.visible=false;
    for(let i=0;i<this.beamMeshes.length;i++){const mesh=this.beamMeshes[i]!,beam=state.beams[i];mesh.visible=!!beam;if(!beam)continue;const direction=beam.end.clone().sub(beam.start),length=direction.length();if(length<.001){mesh.visible=false;continue;}mesh.position.copy(beam.start).addScaledVector(direction,.5);mesh.quaternion.setFromUnitVectors(UP,direction.multiplyScalar(1/length));mesh.scale.set(1.2,length,1.2);}
    let count=0;for(const bullet of state.bullets){if(count>=MAX_BULLETS)break;bullet.previous.toArray(this.tracerPositions,count*6);bullet.position.toArray(this.tracerPositions,count*6+3);count++;}this.tracerGeometry.setDrawRange(0,count*2);this.tracerGeometry.attributes.position!.needsUpdate=true;
    this.sea.uniforms.uTime!.value=this.reducedMotion?0:state.elapsed;
    // Victory-only presentation time is supplied by main; the terminal game tick stays frozen.
    const retreat=state.result?.outcome==='victory'?Math.min(1,this.reducedMotion?1:Math.max(0,resultAnimationTime)/3):0;this.mother.position.set(160+retreat*1500,1050+retreat*2400,-2580-retreat*2000);
  }
  private updateCamera(state:GameState,flight:boolean,alpha:number):void{
    const player=state.fighters.find(f=>f.id===state.playerId)??null;
    if(!flight){this.camera.position.set(620,255,860);this.camera.up.set(0,1,0);this.camera.lookAt(0,280,-1050);this.cameraMission=state.missionId;this.cameraPlayer=null;return;}
    if(!player)return;
    const position=new Vector3(),rotation=new Quaternion();getFlightCameraPose({...player,position:new Vector3().lerpVectors(player.previous,player.position,alpha)},state.mode,position,rotation);
    if(this.cameraMission!==state.missionId){this.cameraMission=state.missionId;this.cameraPlayer=player.id;this.cameraTransferTick=-1;}
    else if(this.cameraPlayer!==player.id){this.cameraPlayer=player.id;this.cameraTransferTick=state.tick;this.transferPosition.copy(this.camera.position);this.transferQuaternion.copy(this.camera.quaternion);}
    const blend=this.cameraTransferTick<0?1:Math.min(1,(state.tick-this.cameraTransferTick+alpha)/18);
    this.camera.position.copy(this.transferPosition).lerp(position,blend);this.camera.quaternion.copy(this.transferQuaternion).slerp(rotation,blend);
  }
  render(state:GameState,flight:boolean,alpha=1,resultAnimationTime=0):void{if(this.disposed||!this.ready)return;this.syncWorld(state,alpha,resultAnimationTime);this.updateCamera(state,flight,alpha);this.renderer.render(this.world,this.camera);this.drawMarkers(state,flight);}
  private project(position:Vector3):{x:number;y:number;visible:boolean;behind:boolean}{const local=position.clone().sub(this.camera.position).applyQuaternion(this.camera.quaternion.clone().invert()),point=position.clone().project(this.camera);return{x:(point.x*.5+.5)*this.width,y:(.5-point.y*.5)*this.height,visible:local.z<-.5&&point.z<1&&Math.abs(point.x)<.97&&Math.abs(point.y)<.94,behind:local.z>=-.5};}
  private drawMarkers(state:GameState,flight:boolean):void{drawFlightMarkers(this.ctx,this.width,this.height,state,flight,position=>this.project(position),this.camera);}
  metrics(){const debrisMeshes=this.districts.filter(d=>d.rubble.visible).length,smokeMeshes=this.districts.filter(d=>d.smoke.visible).length*3;return{ready:this.ready,aircraft:(this.current?.fighters.length??0)+(this.current?.ufos.length??0),activeLasers:this.current?.beams.length??0,projectiles:this.current?.bullets.length??0,decorations:debrisMeshes,debrisMeshes,smokeMeshes,drawCalls:this.renderer.info.render.calls,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,programs:this.renderer.info.programs?.length??0};}
  dispose():void{if(this.disposed)return;this.disposed=true;this.ready=false;this.world.clear();this.batches.dispose();this.factory.dispose();for(const geometry of this.geometries)geometry.dispose();for(const material of this.materials)material.dispose();this.renderer.dispose();this.ctx.clearRect(0,0,this.width,this.height);}
}
