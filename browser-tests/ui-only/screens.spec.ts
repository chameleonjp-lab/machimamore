import { test, expect, type Page, type TestInfo } from '@playwright/test';
import type { UiFixtureDriver, UiFixtureName } from '../../src/ui-test-driver';

declare global { interface Window { __machimamoreUi: UiFixtureDriver; } }

async function show(page: Page, name: UiFixtureName) {
  await page.evaluate(name => window.__machimamoreUi.show(name), name);
  expect(await page.evaluate(() => window.__machimamoreUi.read())).toMatchObject({ tick:0, frameScheduled:false });
}
async function capture(page: Page, info: TestInfo, name: string) {
  const path=info.outputPath(`${name}.png`);
  await page.screenshot({path,animations:'disabled'});
  await info.attach(name,{path,contentType:'image/png'});
}
async function captureScrollSegments(page: Page, info: TestInfo, name: string, selector: string, bottomSelectors: string[]) {
  const scroller=page.locator(selector);
  const {clientHeight,scrollHeight}=await scroller.evaluate((element:HTMLElement)=>({clientHeight:element.clientHeight,scrollHeight:element.scrollHeight}));
  expect(clientHeight,`${selector} scroll viewport`).toBeGreaterThan(0);
  const maxScroll=Math.max(0,scrollHeight-clientHeight);
  const overlap=Math.min(48,Math.max(24,Math.ceil(clientHeight*.12)));
  const step=Math.max(1,clientHeight-overlap);
  const count=maxScroll===0?1:Math.max(3,Math.ceil(maxScroll/step)+1);
  const positions=Array.from({length:count},(_,index)=>count===1?0:Math.round(maxScroll*index/(count-1)));
  const middleIndex=Math.ceil((positions.length-1)/2);
  for(let index=0;index<positions.length;index++) {
    const top=positions[index];
    await scroller.evaluate((element:HTMLElement,scrollTop:number)=>{element.scrollTop=scrollTop;},top);
    expect(await scroller.evaluate((element:HTMLElement)=>Math.round(element.scrollTop)),`${selector} segment ${index}`).toBe(top);
    if(index===positions.length-1) await fits(page,bottomSelectors);
    const segment=index===0?'top':index===positions.length-1?'bottom':index===middleIndex?'middle':`middle-${index}`;
    await capture(page,info,`${name}-${segment}`);
  }
}
async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
}
async function fits(page: Page, selectors: string[], targets=false) {
  for(const selector of selectors) {
    const target=page.locator(selector);await expect(target).toBeVisible();
    const box=await target.boundingBox(), viewport=page.viewportSize()!;
    expect(box,selector).not.toBeNull();
    expect(box!.x,selector).toBeGreaterThanOrEqual(-1);expect(box!.y,selector).toBeGreaterThanOrEqual(-1);
    expect(box!.x+box!.width,selector).toBeLessThanOrEqual(viewport.width+1);
    expect(box!.y+box!.height,selector).toBeLessThanOrEqual(viewport.height+1);
    if(targets){expect(box!.width,selector).toBeGreaterThanOrEqual(44);expect(box!.height,selector).toBeGreaterThanOrEqual(44);}
  }
}
async function canvasPixels(page: Page) {
  return page.locator('#markers').evaluate((canvas:HTMLCanvasElement)=>{
    const data=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;
    let opaque=0;for(let i=3;i<data.length;i+=4)if(data[i])opaque++;
    return opaque;
  });
}

// One pass per viewport; no mission progress, combat, reload countdown, waits,
// performance sampling or recovery loop. Screenshots remain review evidence.
test('real Home, HUD, dialogs, results and error UI from fixed display states', async ({page,baseURL},info) => {
  const started=Date.now(), errors:string[]=[], failures:string[]=[], outbound:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('requestfailed',request=>failures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
  const origin=new URL(baseURL!).origin;
  await page.route('**/*',async route=>{
    if(new URL(route.request().url()).origin!==origin){outbound.push(route.request().url());await route.abort();}
    else await route.continue();
  });
  page.on('websocket',socket=>{if(new URL(socket.url()).host!==new URL(origin).host)outbound.push(socket.url());});
  try {
  await page.goto('/?ui=home');
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready','true');
  await show(page,'home');
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('#title')).toHaveText('マチマモレ');
  await expect(page.locator('#start')).toBeEnabled();
  await noHorizontalOverflow(page);await capture(page,info,'home');

  await page.locator('#home-rules').tap();
  await expect(page.locator('#rules-guide')).toBeVisible();
  await expect(page.locator('#rules-content h3')).toHaveCount(7);
  await fits(page,['#rules-close','#rules-back'],true);
  await capture(page,info,'rules');
  await page.locator('#rules-back').tap();
  await expect(page.locator('#rules-guide')).toBeHidden();
  await expect(page.locator('#home-rules')).toBeFocused();

  await page.locator('#home-controls').tap();
  await expect(page.locator('#control-settings')).toBeVisible();
  await fits(page,['#control-close','#control-cancel','#control-save'],true);
  await page.locator('#control-editor-touch').tap();
  await page.locator('#control-mode').selectOption('normal');
  await page.locator('#control-target').selectOption('throttle');
  const size=page.locator('#control-size'), initial=await size.inputValue();
  await size.press('ArrowRight');const changed=await size.inputValue();expect(changed).not.toBe(initial);
  await capture(page,info,'settings-touch');
  await page.locator('#control-cancel').tap();
  expect(await page.evaluate(()=>localStorage.getItem('machimamore-controls-v2'))).toBeNull();
  await page.locator('#home-controls').tap();await page.locator('#control-editor-touch').tap();
  await page.locator('#control-mode').selectOption('normal');await page.locator('#control-target').selectOption('throttle');
  await expect(size).toHaveValue(initial);await size.press('ArrowRight');await page.locator('#control-save').tap();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('machimamore-controls-v2')!).controls.throttle.size)).toBe(Number(changed));
  await page.locator('#home-controls').tap();await page.locator('#control-editor-touch').tap();
  await page.locator('#control-mode').selectOption('easy');
  await expect(page.locator('#control-target')).toHaveValue('loop');
  await expect(page.locator('#control-target option[value="throttle"]')).toBeDisabled();
  await page.locator('#control-editor-keyboard').tap();
  await expect(page.locator('#control-keyboard-editor')).toBeVisible();
  await expect(page.locator('[data-key-action]')).toHaveCount(9);
  await capture(page,info,'settings-keyboard');
  await page.locator('[data-key-action="loop"]').tap();await page.keyboard.press('Escape');
  await expect(page.locator('#control-settings')).toBeVisible(); // First Escape cancels key capture.
  await page.keyboard.press('Escape');await expect(page.locator('#control-settings')).toBeHidden();
  await expect(page.locator('#home-controls')).toBeFocused();

  await show(page,'normal');
  await expect(page.locator('#app')).toHaveAttribute('data-screen','playing');
  await fits(page,['#pause','#game-sound','#loop','#fire','#throttle'],true);
  await expect(page.locator('#throttle')).toHaveAttribute('aria-valuenow','0');
  await expect(page.locator('#throttle')).toHaveAttribute('aria-orientation','vertical');
  await expect(page.locator('#hud-mode')).toHaveText('ノーマル');
  await noHorizontalOverflow(page);expect(await canvasPixels(page)).toBeGreaterThan(30);
  await capture(page,info,'normal-hud');
  await show(page,'paused');await expect(page.locator('#pause-screen')).toBeVisible();
  await capture(page,info,'pause');
  await page.locator('#pause-rules').tap();await page.locator('#rules-close').tap();
  await expect(page.locator('#app')).toHaveAttribute('data-screen','paused');
  expect(await page.evaluate(()=>window.__machimamoreUi.read())).toMatchObject({screen:'paused',tick:0,frameScheduled:false});
  await page.locator('#pause-controls').tap();await expect(page.locator('#control-mode')).toBeDisabled();
  await page.locator('#control-close').tap();await expect(page.locator('#app')).toHaveAttribute('data-screen','paused');
  expect(await page.evaluate(()=>window.__machimamoreUi.read())).toMatchObject({screen:'paused',tick:0,frameScheduled:false});

  await show(page,'easy');await expect(page.locator('#loop')).toBeVisible();
  await expect(page.locator('#fire')).toBeHidden();await expect(page.locator('#throttle')).toBeHidden();
  expect(await canvasPixels(page)).toBeGreaterThan(30);await capture(page,info,'easy-hud');
  await show(page,'reload');await expect(page.locator('#reload-status')).toHaveText('再装填 3.0秒');
  await expect(page.locator('#reload-progress')).toBeVisible();
  await show(page,'wait');await expect(page.locator('#player-wait')).toContainText('引き継ぎ待ち');await capture(page,info,'waiting-hud');
  await show(page,'notices');await fits(page,['#warning','#city-warning','#reload-status','#reload-progress']);
  await capture(page,info,'hud-notices');

  for(const [name,title] of [['victory','防衛成功'],['defeat','防衛失敗'],['interrupted','作戦中断']] as const){
    await show(page,name);await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#result-title')).toHaveText(title);
    await expect(page.locator('#result-time')).toHaveText('02:03.45');
    await expect(page.locator('#result-score')).toHaveText('12,345');
    await expect(page.locator('#score-breakdown > div')).toHaveCount(7);
    await noHorizontalOverflow(page);
    await captureScrollSegments(page,info,`score-result-${name}`,'#result',['#retry','#result-home','#result-controls']);
  }
  await page.locator('#result-controls').tap();await page.locator('#control-cancel').tap();
  await expect(page.locator('#app')).toHaveAttribute('data-screen','result');
  expect(await page.evaluate(()=>window.__machimamoreUi.read())).toMatchObject({screen:'result',tick:0,frameScheduled:false});

  await show(page,'startup-error');await expect(page.locator('#startup-error')).toBeVisible();
  await expect(page.locator('#start')).toBeDisabled();await expect(page.locator('#reload')).toBeVisible();
  await captureScrollSegments(page,info,'startup-error','#home',['#reload']);
  expect(await page.evaluate(()=>window.__machimamoreUi.read())).toMatchObject({screen:'home',tick:0,frameScheduled:false});
  expect(errors,'No uncaught/rejected runtime or console errors').toEqual([]);
  expect(failures,'No failed local assets').toEqual([]);expect(outbound,'No external requests').toEqual([]);
  } finally {
  await info.attach('runtime-diagnostics',{body:JSON.stringify({errors,failures,outbound},null,2),contentType:'application/json'});
  await info.attach('ui-duration',{body:JSON.stringify({uiBodyMs:Date.now()-started,targetSuiteMs:60000,scope:'UI only; install/build/server setup and human screenshot review excluded; no gameplay or GPU performance claim'}),contentType:'application/json'});
  }
});
