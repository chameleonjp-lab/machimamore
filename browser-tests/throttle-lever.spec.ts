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
  await page.mouse.up();await expect(lever).toHaveAttribute('aria-valuenow','0');
  await expect.poll(async()=>Number(((await readRequiredObservation(page)).acceptedInput as Record<string,unknown>).throttle)).toBe(0);
  // Mouse compatibility click selects PC presentation; a fresh touch re-exposes touch controls.
  await page.touchscreen.tap(196,420);await expect(lever).toBeVisible();
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
