import { test, expect, openHome, settleActiveMission, pauseActiveMission, readRequiredObservation } from './fixtures';

test('Normal exposes three controls, a named 44px lever, native pointer release and pause recovery',async({page},testInfo)=>{
  await openHome(page);await page.getByRole('radio',{name:'ノーマル'}).check();
  // A native touch Start selects the existing touch presentation after click commits.
  await page.locator('#start').tap();await settleActiveMission(page,testInfo);const lever=page.getByRole('slider',{name:'速度レバー'});
  await expect(lever).toBeVisible();await expect(lever).toHaveAttribute('aria-orientation','vertical');
  await expect(page.locator('#accelerate, #brake, #bomb, #torpedo')).toHaveCount(0);
  const box=await lever.boundingBox();expect(box).not.toBeNull();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);
  const x=box!.x+box!.width/2;await page.mouse.move(x,box!.y+22);await page.mouse.down();
  await expect(lever).toHaveAttribute('aria-valuenow','100');
  await expect.poll(async()=>Number(((await readRequiredObservation(page)).acceptedInput as Record<string,unknown>).throttle)).toBe(1);
  await page.mouse.move(x,box!.y+box!.height-22);await expect(lever).toHaveAttribute('aria-valuenow','-100');
  await page.mouse.up();
  // The committed mouse click selects PC presentation, which hides the touch
  // slider from role queries. Inspect its retained DOM state and real input
  // release before using a native touch to expose the accessible slider again.
  const retainedLever=page.locator('#throttle');
  await expect(page.locator('#app')).toHaveAttribute('data-input','keyboard');
  await expect(retainedLever).toHaveCount(1);await expect(retainedLever).toBeHidden();
  await expect(retainedLever).toHaveAttribute('aria-valuenow','0');
  await expect.poll(async()=>{
    const observation=await readRequiredObservation(page),input=observation.input as Record<string,unknown>;
    return {pointer:input.throttlePointer,axis:input.throttle,accepted:(observation.acceptedInput as Record<string,unknown>).throttle};
  }).toEqual({pointer:null,axis:0,accepted:0});
  await expect(page.locator('#app')).toHaveAttribute('data-screen','playing');
  // A fresh native canvas touch re-exposes touch controls without changing
  // game state. Record its real event sequence for browser-specific diagnosis.
  await page.evaluate(()=>{
    const target=window as Window & {__touchRecoveryEvents?:PointerEvent[]};target.__touchRecoveryEvents=[];
    for(const type of ['pointerdown','pointerup','click'])window.addEventListener(type,event=>{
      target.__touchRecoveryEvents!.push(event as PointerEvent);
    },{capture:true,once:true});
  });
  await page.locator('#flight').tap({position:{x:196,y:420}});
  const nativeEvents=await page.evaluate(()=>((window as Window & {__touchRecoveryEvents?:PointerEvent[]}).__touchRecoveryEvents??[]).map(event=>({type:event.type,pointerId:event.pointerId,pointerType:event.pointerType,trusted:event.isTrusted,target:(event.target as HTMLElement|null)?.id,defaultPrevented:event.defaultPrevented})));
  console.log('Native touch recovery events:',JSON.stringify(nativeEvents));
  expect(nativeEvents).toEqual(expect.arrayContaining([expect.objectContaining({type:'pointerdown',pointerType:'touch',trusted:true,target:'flight'}),expect.objectContaining({type:'pointerup',pointerType:'touch',trusted:true,target:'flight'})]));
  await expect(page.locator('#app')).toHaveAttribute('data-input','touch');
  await expect(lever).toBeVisible();
  await expect.poll(async()=>((await readRequiredObservation(page)).input as Record<string,unknown>).steerPointer).toBeNull();
  await lever.focus();await page.keyboard.down('ArrowUp');await expect(lever).toHaveAttribute('aria-valuenow','100');
  await page.keyboard.up('ArrowUp');await expect(lever).toHaveAttribute('aria-valuenow','0');
  await pauseActiveMission(page,testInfo);const stopped=await readRequiredObservation(page);expect((stopped.input as Record<string,unknown>).throttlePointer).toBeNull();expect((stopped.input as Record<string,unknown>).throttle).toBe(0);
});

test('legacy layouts remain byte-identical through lever Save, Cancel and reload, Easy has no lever option',async({page})=>{
  const legacy='{"version":1,"controls":{"fire":{"x":0.83,"y":0.84,"size":96,"opacity":0.9},"loop":{"x":0.83,"y":0.66,"size":72,"opacity":0.78},"accelerate":{"x":0.17,"y":0.84,"size":76,"opacity":0.82},"brake":{"x":0.17,"y":0.66,"size":76,"opacity":0.82}}}';
  await page.addInitScript(raw=>{if(localStorage.getItem('machimamore-controls-v1')===null)localStorage.setItem('machimamore-controls-v1',raw);},legacy);
  await openHome(page);await page.getByRole('radio',{name:'ノーマル'}).check();await page.locator('#home-controls').click();await page.locator('#control-editor-touch').click();
  await page.locator('#control-target').selectOption('throttle');const size=page.locator('#control-size'),initial=await size.inputValue();
  await size.focus();await size.press('ArrowRight');await page.locator('#control-cancel').click();
  expect(await page.evaluate(()=>localStorage.getItem('machimamore-controls-v2'))).toBeNull();
  await page.locator('#home-controls').click();await page.locator('#control-editor-touch').click();await page.locator('#control-target').selectOption('throttle');await expect(size).toHaveValue(initial);
  await size.focus();await size.press('ArrowRight');const saved=await size.inputValue();await page.locator('#control-save').click();
  expect(await page.evaluate(()=>localStorage.getItem('machimamore-controls-v1'))).toBe(legacy);
  const raw=await page.evaluate(()=>localStorage.getItem('machimamore-controls-v2'));expect(JSON.parse(raw!).version).toBe(2);expect(Object.keys(JSON.parse(raw!).controls)).toEqual(['fire','loop','throttle']);
  await page.reload();await expect(page.locator('#start')).toBeEnabled();await page.getByRole('radio',{name:'ノーマル'}).check();await page.locator('#home-controls').click();await page.locator('#control-editor-touch').click();await page.locator('#control-target').selectOption('throttle');await expect(size).toHaveValue(saved);
  await page.locator('#control-mode').selectOption('easy');await expect(page.locator('#control-target')).toHaveValue('loop');await expect(page.locator('#control-target option[value="throttle"]')).toBeDisabled();
  await page.locator('#control-cancel').click();expect(await page.evaluate(()=>localStorage.getItem('machimamore-controls-v1'))).toBe(legacy);
});
