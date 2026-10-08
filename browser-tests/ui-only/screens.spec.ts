import { test, expect, type Page, type TestInfo } from '@playwright/test';
import type { UiFixtureDriver, UiFixtureName, UiScreen } from '../../src/ui-test-driver';

declare global { interface Window { __machimamoreUi: UiFixtureDriver; } }

async function show(page: Page, name: UiFixtureName) {
  await page.evaluate(name => window.__machimamoreUi.show(name), name);
  expect(await page.evaluate(() => window.__machimamoreUi.read())).toMatchObject({ tick:0, frameScheduled:false });
}
async function expectFixedUi(page: Page, screen: UiScreen, phase: 'ready'|'playing'|'paused'|'ended') {
  await expect(page.locator('#app')).toHaveAttribute('data-screen',screen);
  expect(await page.evaluate(() => window.__machimamoreUi.read())).toMatchObject({screen,phase,tick:0,frameScheduled:false});
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
async function expectActualHitTargets(page:Page,selectors:string[]) {
  const results=await page.evaluate((items)=>items.map(selector=>{
    const target=document.querySelector<HTMLElement>(selector);if(!target)return{selector,hit:false};
    const rect=target.getBoundingClientRect(),hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
    return{selector,hit:!!hit&&(hit===target||target.contains(hit)),width:rect.width,height:rect.height,top:hit?.tagName??null};
  }),selectors);
  for(const result of results){expect(result.width,result.selector).toBeGreaterThanOrEqual(44);expect(result.height,result.selector).toBeGreaterThanOrEqual(44);expect(result.hit,`${result.selector} receives a center-point hit (${result.top})`).toBe(true);}
}
async function expectMarkerLabelsClear(page:Page,expected:string[]) {
  const report=await page.evaluate(()=>{
    const labels=window.__machimamoreUi.markerBoxes().map(box=>({text:box.text,x:box.x,y:box.y,width:box.width,height:box.height}));
    const selectors=['#hud .time-block','#hud .hud-actions','#hud .enemy-tally','#hud .friendly-tally','#hud .city-tally','#hud .flight-data','#hud .flight-tip',
      '#hud .hud-notices > :not([hidden])','#hud .flight-button:not([hidden])','#hud #throttle:not([hidden])','#hud #throttle-layout-note:not([hidden])',
      '#announcement:not(:empty)','#ally-announcements:not(:empty)'];
    const obstacles=selectors.flatMap(selector=>[...document.querySelectorAll<HTMLElement>(selector)].flatMap(element=>{
      if(element.hidden||element.closest('[hidden]'))return[];const style=getComputedStyle(element),rect=element.getBoundingClientRect();
      if(style.display==='none'||style.visibility==='hidden'||rect.width<=0||rect.height<=0)return[];
      return[{selector,x:rect.x,y:rect.y,width:rect.width,height:rect.height}];
    }));
    const overlaps=(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number})=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
    const conflicts=labels.flatMap(label=>obstacles.filter(obstacle=>overlaps(label,obstacle)).map(obstacle=>`${label.text} overlaps ${obstacle.selector}`));
    for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)if(overlaps(labels[i]!,labels[j]!))conflicts.push(`${labels[i]!.text} overlaps ${labels[j]!.text}`);
    const notices=obstacles.filter(box=>box.selector==='#hud .hud-notices > :not([hidden])');
    const protectedUi=obstacles.filter(box=>box.selector!=='#hud .hud-notices > :not([hidden])');
    for(const notice of notices)for(const target of protectedUi)if(overlaps(notice,target))conflicts.push(`notice overlaps ${target.selector}`);
    for(let i=0;i<notices.length;i++)for(let j=i+1;j<notices.length;j++)if(overlaps(notices[i]!,notices[j]!))conflicts.push('notices overlap each other');
    const messages=protectedUi.filter(box=>box.selector==='#announcement:not(:empty)'||box.selector==='#ally-announcements:not(:empty)');
    const otherProtectedUi=protectedUi.filter(box=>!messages.includes(box));
    for(const message of messages)for(const target of otherProtectedUi)if(overlaps(message,target))conflicts.push(`${message.selector} overlaps ${target.selector}`);
    for(let i=0;i<messages.length;i++)for(let j=i+1;j<messages.length;j++)if(overlaps(messages[i]!,messages[j]!))conflicts.push('announcement messages overlap each other');
    return{width:innerWidth,height:innerHeight,labels,conflicts};
  });
  expect(report.labels.map(label=>label.text.startsWith('街')?'city':label.text)).toEqual(expected);
  for(const label of report.labels){expect(label.x).toBeGreaterThanOrEqual(0);expect(label.y).toBeGreaterThanOrEqual(0);expect(label.x+label.width).toBeLessThanOrEqual(report.width);expect(label.y+label.height).toBeLessThanOrEqual(report.height);}
  expect(report.conflicts).toEqual([]);
}
async function expectAnnouncementLayout(page:Page) {
  const layout=await page.locator('#announcement').evaluate((element:HTMLElement)=>{
    const rect=element.getBoundingClientRect(),lineHeight=Number.parseFloat(getComputedStyle(element).lineHeight);
    return{x:rect.x,y:rect.y,width:rect.width,height:rect.height,lines:Math.round(rect.height/lineHeight),viewportWidth:innerWidth,viewportHeight:innerHeight};
  });
  expect(layout.x).toBeGreaterThanOrEqual(0);expect(layout.y).toBeGreaterThanOrEqual(0);
  expect(layout.x+layout.width).toBeLessThanOrEqual(layout.viewportWidth);expect(layout.y+layout.height).toBeLessThanOrEqual(layout.viewportHeight);
  if(layout.viewportWidth===320&&layout.viewportHeight===568){
    expect(layout.x).toBeCloseTo(184,0);expect(layout.y).toBeCloseTo(230.2,1);expect(layout.width).toBeCloseTo(124,0);expect(layout.lines).toBe(3);
  }
  if(layout.viewportWidth===568&&layout.viewportHeight===320){
    expect(layout.x).toBeCloseTo(150,0);expect(layout.y).toBeCloseTo(12,0);expect(layout.width).toBeCloseTo(268,0);expect(layout.lines).toBe(1);
  }
}

// One pass per viewport; no mission progress, combat, reload countdown, waits,
// performance sampling or recovery loop. Screenshots remain review evidence.
test('real Home, HUD, dialogs, results and error UI from fixed display states', async ({page,baseURL},info) => {
  const started=Date.now(), errors:string[]=[], failures:string[]=[], outbound:string[]=[];
  const mainFrameNavigations:string[]=[];
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())mainFrameNavigations.push(frame.url());});
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

  await page.locator('#home-controls').tap();await expect(page.locator('#control-settings')).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-input','touch');
  await page.locator('#control-cancel').tap();await expect(page.locator('#control-settings')).toBeHidden();
  await expect(page.locator('#app')).toHaveAttribute('data-input','touch');
  expect(await page.evaluate(()=>window.__machimamoreUi.read())).toMatchObject({screen:'home',tick:0,frameScheduled:false});

  const normalMode=page.locator('input[name="game-mode"][value="normal"]');
  await normalMode.tap();await expect(normalMode).toBeChecked();
  await expect(page.locator('#app')).toHaveAttribute('data-mode','normal');
  await page.locator('#start').tap();
  await expect(page.locator('#home')).toBeHidden();await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-mode','normal');
  await expectFixedUi(page,'playing','playing');

  await show(page,'normal');
  await expect(page.locator('#app')).toHaveAttribute('data-input','touch');
  await expect(page.locator('#app')).toHaveAttribute('data-screen','playing');
  await expectFixedUi(page,'playing','playing');
  await fits(page,['#pause','#game-sound','#loop','#fire','#throttle'],true);
  await expectActualHitTargets(page,['#pause','#game-sound','#loop','#fire','#throttle']);
  await expectMarkerLabelsClear(page,['UFO','味方']);
  await expect(page.locator('#throttle')).toHaveAttribute('aria-valuenow','0');
  await expect(page.locator('#throttle')).toHaveAttribute('aria-orientation','vertical');
  await expect(page.locator('#hud-mode')).toHaveText('ノーマル');
  await noHorizontalOverflow(page);expect(await canvasPixels(page)).toBeGreaterThan(30);
  await capture(page,info,'normal-hud');
  await page.locator('#pause').tap();await expect(page.locator('#pause-screen')).toBeVisible();
  await expectFixedUi(page,'paused','paused');
  await capture(page,info,'pause');
  await page.locator('#pause-rules').tap();await page.locator('#rules-close').tap();
  await expect(page.locator('#app')).toHaveAttribute('data-screen','paused');
  expect(await page.evaluate(()=>window.__machimamoreUi.read())).toMatchObject({screen:'paused',tick:0,frameScheduled:false});
  await page.locator('#pause-controls').tap();await expect(page.locator('#control-mode')).toBeDisabled();
  await page.locator('#control-close').tap();await expect(page.locator('#app')).toHaveAttribute('data-screen','paused');
  expect(await page.evaluate(()=>window.__machimamoreUi.read())).toMatchObject({screen:'paused',tick:0,frameScheduled:false});
  await page.locator('#resume').tap();await expect(page.locator('#pause-screen')).toBeHidden();
  await expectFixedUi(page,'playing','playing');
  await page.locator('#pause').tap();await expectFixedUi(page,'paused','paused');
  await page.locator('#pause-home').tap();await expect(page.locator('#home')).toBeVisible();
  await expectFixedUi(page,'home','ready');

  await show(page,'easy');await expect(page.locator('#loop')).toBeVisible();await expectMarkerLabelsClear(page,['UFO','味方']);
  await expect(page.locator('#fire')).toBeHidden();await expect(page.locator('#throttle')).toBeHidden();
  expect(await canvasPixels(page)).toBeGreaterThan(30);await capture(page,info,'easy-hud');
  await show(page,'reload');await expect(page.locator('#reload-status')).toHaveText('再装填 3.0秒');
  await expect(page.locator('#reload-progress')).toBeVisible();
  await show(page,'wait');await expect(page.locator('#player-wait')).toContainText('引き継ぎ待ち');await capture(page,info,'waiting-hud');
  await show(page,'notices');await fits(page,['#warning','#city-warning','#reload-status','#reload-progress']);await expect(page.locator('#announcement')).toBeVisible();await expect(page.locator('#announcement')).toHaveText('街を守りUFO50機を撃破 · 味方残機は自機込み');await expectAnnouncementLayout(page);await expectMarkerLabelsClear(page,['UFO','味方','city']);
  await capture(page,info,'hud-notices');

  for(const [name,title] of [['victory','防衛成功'],['defeat','防衛失敗'],['interrupted','作戦中断']] as const){
    await show(page,name);await expect(page.locator('#result')).toBeVisible();
    await expectFixedUi(page,'result','ended');
    await expect(page.locator('#result-title')).toHaveText(title);
    await expect(page.locator('#result-time')).toHaveText('02:03.45');
    await expect(page.locator('#result-score')).toHaveText('12,345');
    await expect(page.locator('#score-breakdown > div')).toHaveCount(7);
    await noHorizontalOverflow(page);
    await captureScrollSegments(page,info,`score-result-${name}`,'#result',['#retry','#result-home','#result-controls']);
  }
  await page.locator('#result-controls').tap();await page.locator('#control-cancel').tap();
  await expect(page.locator('#app')).toHaveAttribute('data-screen','result');
  await expectFixedUi(page,'result','ended');
  await page.locator('#retry').tap();await expect(page.locator('#result')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();await expectFixedUi(page,'playing','playing');

  await show(page,'startup-error');await expect(page.locator('#startup-error')).toBeVisible();await expect(page.locator('#announcement')).toBeEmpty();
  await expect(page.locator('#start')).toBeDisabled();await expect(page.locator('#reload')).toBeVisible();
  await captureScrollSegments(page,info,'startup-error','#home',['#reload']);
  await expectFixedUi(page,'home','ready');
  const navigationsBeforeRetry=mainFrameNavigations.length;
  await page.locator('#reload').tap();await expect(page.locator('#startup-error')).toBeHidden();
  await expect(page.locator('#reload')).toBeHidden();await expect(page.locator('#start')).toBeEnabled();
  await expectFixedUi(page,'home','ready');
  await show(page,'normal');await expectMarkerLabelsClear(page,['UFO','味方']);await expectActualHitTargets(page,['#pause','#game-sound','#loop','#fire','#throttle']);
  expect(mainFrameNavigations).toHaveLength(navigationsBeforeRetry);
  expect(errors,'No uncaught/rejected runtime or console errors').toEqual([]);
  expect(failures,'No failed local assets').toEqual([]);expect(outbound,'No external requests').toEqual([]);
  } finally {
  await info.attach('runtime-diagnostics',{body:JSON.stringify({errors,failures,outbound},null,2),contentType:'application/json'});
  await info.attach('ui-duration',{body:JSON.stringify({uiBodyMs:Date.now()-started,targetSuiteMs:60000,scope:'UI only; install/build/server setup and human screenshot review excluded; no gameplay or GPU performance claim'}),contentType:'application/json'});
  }
});
