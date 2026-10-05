import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This is a DOM-only layout fixture. It starts and pauses a real Normal mission
// through visible controls, then changes DOM presentation only; the read-only
// observer verifies that the simulation stays paused while the screenshot runs.
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../../..');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/workspace/.cache/ms-playwright';
const { chromium } = createRequire(resolve(repositoryRoot, 'package.json'))('playwright');
const out = scriptDirectory;
const width = Number(process.env.FIXTURE_WIDTH ?? 320);
const height = Number(process.env.FIXTURE_HEIGHT ?? 568);
const label = process.env.FIXTURE_LABEL ?? `rerun-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`;
if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) throw new Error('FIXTURE_WIDTH and FIXTURE_HEIGHT must be positive safe integers.');
const stem = `compact-notice-fixture-normal-${width}x${height}-${label}`;
const baseURL = process.env.FIXTURE_URL ?? 'http://127.0.0.1:4176/';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto(baseURL);
  await page.locator('#start').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('#start')?.disabled, null, { timeout: 30000 });
  const tap = async selector => {
    const locator = page.locator(selector);
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error(`Missing touch target: ${selector}`);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  };
  await tap('.mode-picker label:nth-of-type(2)');
  await tap('#start');
  await page.waitForFunction(() => {
    const app = document.querySelector('#app');
    const observation = window.__machimamoreRead?.();
    return app?.dataset.screen === 'playing' && observation?.phase === 'playing';
  }, null, { timeout: 30000 });
  let lastTick = -1, advancingSamples = 0, stableSince = null;
  const frameGapRecoveries = [];
  const setupDeadline = Date.now() + 20000;
  while (Date.now() < setupDeadline) {
    const state = await page.evaluate(() => ({ screen: document.querySelector('#app')?.dataset.screen, reason: document.querySelector('#pause-reason')?.textContent?.trim(), observation: window.__machimamoreRead?.() }));
    if (state.screen === 'paused') {
      if (JSON.stringify(state.observation?.pauseReasons) !== '["frame"]') throw new Error(`Unexpected pause during fixture setup: ${JSON.stringify({ screen: state.screen, reason: state.reason, pauseReasons: state.observation?.pauseReasons })}`);
      const tick = state.observation.tick;
      await page.waitForTimeout(120);
      const frozen = await page.evaluate(() => ({ screen: document.querySelector('#app')?.dataset.screen, observation: window.__machimamoreRead?.() }));
      if (frozen.screen !== 'paused' || frozen.observation?.tick !== tick || JSON.stringify(frozen.observation?.pauseReasons) !== '["frame"]') throw new Error(`Frame pause did not freeze for 120ms: ${JSON.stringify({ screen: frozen.screen, tickBefore: tick, tickAfter: frozen.observation?.tick, pauseReasons: frozen.observation?.pauseReasons })}`);
      if (frameGapRecoveries.length >= 2) throw new Error(`Fixture setup exceeded two strict frame-pause recoveries: ${JSON.stringify(frameGapRecoveries)}`);
      if (!(await page.locator('#resume').isVisible()) || !(await page.locator('#resume').isEnabled())) throw new Error('Visible Resume was unavailable for documented fixture setup recovery.');
      frameGapRecoveries.push({ reason: state.reason, pauseReasons: state.observation.pauseReasons, tick, confirmedFrozenMs: 120, resumedThroughVisibleButton: true });
      await tap('#resume');
      await page.waitForFunction(() => document.querySelector('#app')?.dataset.screen === 'playing' && window.__machimamoreRead?.().phase === 'playing', null, { timeout: 3000 });
      lastTick = -1; advancingSamples = 0; stableSince = null;
      continue;
    }
    if (state.screen !== 'playing' || state.observation?.phase !== 'playing') throw new Error(`Mission left Playing during fixture setup: ${JSON.stringify({ screen: state.screen, phase: state.observation?.phase })}`);
    if (state.observation.tick > lastTick) { lastTick = state.observation.tick; advancingSamples += 1; stableSince ??= Date.now(); }
    if (advancingSamples >= 12 && Date.now() - stableSince >= 300) break;
    await page.waitForTimeout(40);
  }
  if (advancingSamples < 12 || Date.now() - stableSince < 300) throw new Error('Mission did not reach the strict 12-advance / 300ms fixture warmup.');
  await tap('#pause');
  await page.waitForFunction(() => document.querySelector('#app')?.dataset.screen === 'paused', null, { timeout: 3000 });
  const before = await page.evaluate(() => {
    const value = window.__machimamoreRead?.();
    return { observer: value && { phase: value.phase, screen: value.screen, tick: value.tick, missionId: value.missionId, seed: value.seed, pauseReasons: value.pauseReasons }, domScreen: document.querySelector('#app')?.dataset.screen };
  });
  if (before.observer?.phase !== 'paused' || before.observer?.screen !== 'paused' || !before.observer.pauseReasons.includes('manual')) throw new Error(`Expected actual manual pause before DOM fixture: ${JSON.stringify(before)}`);
  await page.evaluate(() => {
    const app = document.querySelector('#app');
    app.dataset.screen = 'playing'; // CSS-presentation fixture only; main.ts retains its actual paused closure.
    document.querySelector('#pause-screen').hidden = true;
    const setText = (id, value) => { const node = document.getElementById(id); node.hidden = false; node.textContent = value; };
    setText('reload-status', '再装填 6.0秒');
    const progress = document.querySelector('#reload-progress'); progress.hidden = false; progress.max = 360; progress.value = 180;
    setText('city-warning', '△ 前方の街が攻撃中 · 区画13 250HP · 計20区画');
    document.querySelector('#warning').hidden = false;
  });
  await page.waitForTimeout(150);
  const fixture = await page.evaluate(() => {
    const observation = window.__machimamoreRead?.();
    const rect = selector => {
      const element = document.querySelector(selector), bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
      return { selector, text: element.textContent?.trim() ?? '', hidden: element.hidden, display: style.display, left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
    };
    const height = innerHeight, width = innerWidth, centerX = width / 2;
    const body = { left: centerX - height * .17, right: centerX + height * .17, top: height * .59, bottom: height * .70 };
    const reticle = { left: centerX - 18, right: centerX + 18, top: height * .363 - 18, bottom: height * .363 + 18 };
    const elements = ['.hud-notices', '#reload-status', '#reload-progress', '#city-warning', '#warning', '#announcement', '.flight-data', '.mission-hud'].map(rect);
    const intersects = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const notices = elements.filter(value => ['#reload-status', '#reload-progress', '#city-warning', '#warning'].includes(value.selector) && !value.hidden && value.display !== 'none');
    const noticeBottom = Math.max(...notices.map(value => value.bottom));
    return {
      fixtureType: 'DOM-only combination presentation fixture; not a naturally occurring combat sample',
      noGameStateWrites: true,
      domScreenForCss: document.querySelector('#app')?.dataset.screen,
      observer: observation && { phase: observation.phase, screen: observation.screen, tick: observation.tick, missionId: observation.missionId, seed: observation.seed, pauseReasons: observation.pauseReasons },
      viewport: { width, height, devicePixelRatio },
      notices,
      announcement: elements.find(value => value.selector === '#announcement'),
      noticeStack: elements.find(value => value.selector === '.hud-notices'),
      approximateNormalAircraftBand: body,
      approximateNormalReticleZone: reticle,
      maxNoticeBottom: noticeBottom,
      bodyBandClearancePx: body.top - noticeBottom,
      noticeObstructionsOfBodyBand: notices.filter(value => intersects(body, value)).map(value => value.selector),
      noticeObstructionsOfReticle: notices.filter(value => intersects(reticle, value)).map(value => value.selector),
      measuredBounds: elements,
    };
  });
  if (fixture.observer?.phase !== 'paused' || fixture.observer?.screen !== 'paused' || fixture.observer?.tick !== before.observer.tick || fixture.domScreenForCss !== 'playing') throw new Error(`The presentation fixture changed or resumed game state: ${JSON.stringify({ before, fixture })}`);
  const screenshot = `${out}/${stem}.png`;
  await page.screenshot({ path: screenshot });
  const after = await page.evaluate(() => { const value = window.__machimamoreRead?.(); return { phase: value?.phase, screen: value?.screen, tick: value?.tick, missionId: value?.missionId, seed: value?.seed, pauseReasons: value?.pauseReasons, domScreen: document.querySelector('#app')?.dataset.screen }; });
  if (after.phase !== 'paused' || after.screen !== 'paused' || after.tick !== before.observer.tick || after.domScreen !== 'playing') throw new Error(`Game state changed during fixture screenshot: ${JSON.stringify({ before, after })}`);
  const record = { command: 'FIXTURE_WIDTH=' + width + ' FIXTURE_HEIGHT=' + height + ' node docs/evidence/browser-visual/review-compact-notice-fixture.mjs', browser: `Chromium ${browser.version()}`, baseURL, setupFrameGapRecoveries: frameGapRecoveries, screenshot, actualPausedBefore: before, fixture, actualPausedAfter: after, visualReview: 'Pending human opening of the PNG.' };
  await writeFile(`${out}/${stem}.json`, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify(record, null, 2));
  await context.close();
} finally { await browser.close(); }
