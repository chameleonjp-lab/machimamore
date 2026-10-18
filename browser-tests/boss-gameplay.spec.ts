import { test, expect } from './fixtures';

// Real simulation driven only through accepted FlightInput, rendered with the
// production WebGL scene. This is separate from fixed DOM display fixtures.
// The overview camera is inspection-only; it never edits the simulation state.
test('boss real simulation and 3D geometry acceptance', async ({ page }, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__machimamoreRead === 'function');
  await page.evaluate(async () => {
    const simulationUrl='/src/simulation.ts',sceneUrl='/src/scene.ts',pilotUrl='/scripts/legal-pilot.ts';
    const simulation=await import(simulationUrl),{MachiMamoreScene}=await import(sceneUrl),{pilotInput}=await import(pilotUrl);
    const canvas=document.createElement('canvas'),overlay=document.createElement('canvas');
    canvas.id='boss-acceptance-world';overlay.id='boss-acceptance-markers';
    for(const [index,element] of [canvas,overlay].entries()) {element.style.cssText=`position:fixed;inset:0;width:100vw;height:100vh;z-index:${100+index};pointer-events:none`;document.body.append(element);}
    const scene=new MachiMamoreScene(canvas,overlay),state=simulation.createGame({mode:'easy',seed:11});simulation.startGame(state);await scene.prepare(state);
    const record={warning:0,start:0,minimum:6,maximum:0,steps:0};
    (window as any).__bossAcceptance={state,scene,record,advance(target:string){
      while(state.phase==='playing'&&state.tick<36000) {
        simulation.stepGame(state,pilotInput(state,'active'));record.steps++;
        if(state.fault)throw new Error(state.fault);
        record.warning+=state.events.filter((e:any)=>e.type==='boss-warning').length;
        record.start+=state.events.filter((e:any)=>e.type==='boss-start').length;
        if(state.bossBattle.phase==='entering'||state.bossBattle.phase==='active') {
          const count=state.ufos.filter((u:any)=>u.variant==='escort'&&u.health>0).length;
          record.minimum=Math.min(record.minimum,count);record.maximum=Math.max(record.maximum,count);
          if(count<3||count>6)throw new Error(`escort population ${count}`);
        }
        if(state.bossBattle.phase===target||state.phase==='ended')break;
      }
      scene.render(state,true,1,0,state.events);
      const boss=state.ufos.find((u:any)=>u.variant==='boss');
      const mother=scene['mother'];
      {
        // Inspect the actual model and world draw, not a replacement marker.
        const target=boss?.position??mother.position, scale=boss?1:2.5;
        scene.camera.position.copy(target).add({x:440*scale,y:190*scale,z:440*scale});
        scene.camera.lookAt(target);scene.camera.updateMatrixWorld(true);
        scene.renderer.render(scene['world'],scene.camera);overlay.getContext('2d')!.clearRect(0,0,overlay.width,overlay.height);
      }
      return {phase:state.phase,battle:state.bossBattle.phase,tick:state.tick,record:{...record},outcome:state.result?.outcome,
        motherPosition:mother.position.toArray(),bossPosition:boss?.position.toArray(),scale:mother.scale.toArray(),bossHealth:boss?.health,
        meshes:mother.children.filter((child:any)=>child.isMesh).length,metrics:scene.metrics()};
    }};
  });
  for(const stage of ['alert','entering','active']) {
    const observation=await page.evaluate(stage=>(window as any).__bossAcceptance.advance(stage),stage);
    expect(observation.battle).toBe(stage);expect(observation.metrics.drawCalls).toBeGreaterThan(0);expect(observation.meshes).toBeGreaterThan(20);
    if(stage!=='alert'){expect(observation.scale).toEqual([.4,.4,.4]);expect(observation.motherPosition).toEqual(observation.bossPosition);expect(observation.bossHealth).toBeGreaterThan(0);}
    await page.screenshot({path:info.outputPath(`real-boss-${stage}.png`)});
    await info.attach(`real-boss-${stage}`,{body:JSON.stringify(observation,null,2),contentType:'application/json'});
  }
  const result=await page.evaluate(()=>(window as any).__bossAcceptance.advance('defeated'));
  expect(result.outcome).toBe('victory');expect(result.record.warning).toBe(1);expect(result.record.start).toBe(1);
  expect(result.record.minimum).toBeGreaterThanOrEqual(3);expect(result.record.maximum).toBeLessThanOrEqual(6);
  await info.attach('legal-simulation-result',{body:JSON.stringify(result,null,2),contentType:'application/json'});
});
