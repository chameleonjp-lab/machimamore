// Run against a development server whose source stays fixed during the run:
// CONTROLS_BASE_URL=http://127.0.0.1:4176/ node scripts/controls-browser.mjs --webkit
// CONTROLS_BROWSER and CONTROLS_OUTPUT optionally select the backend/output.
// This is functional evidence; documented frame-gap recovery is not a
// performance pass. All mission actions use ordinary DOM/physical input.
import { chromium, webkit, expect } from '@playwright/test';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const backend = process.env.CONTROLS_BROWSER ?? (process.argv.includes('--webkit') ? 'webkit' : 'chromium');
const validBackend = ['chromium', 'webkit'].includes(backend);
const viewport = { width: 393, height: 852 };
const baseURL = process.env.CONTROLS_BASE_URL ?? 'http://127.0.0.1:4180/';
const output = resolve(repoRoot, process.env.CONTROLS_OUTPUT ?? `artifacts/controls-integration-final-${validBackend ? backend : 'invalid-backend'}`);
const mapping = {
  left: 'KeyA', right: 'KeyD', up: 'KeyI', down: 'KeyK', fire: 'KeyF',
  loop: 'KeyJ', accelerate: 'KeyE', brake: 'KeyQ', pause: 'KeyP',
};
const frameReason = '画面更新に長い空白があったため停止しました。';
const startedAt = new Date().toISOString();
const errors = [];
const report = {
  status: 'running', bootstrapStage: 'output', backend, browserVersion: null,
  viewport, baseURL, output, pid: process.pid, startedAt,
  setupPauses: [], inputHandovers: [], cases: [], errors, beforeHashes: null,
  method: 'Functional controls check through ordinary settings DOM, physical Playwright keyboard/mouse events, and visible Resume only. Development snapshots and localStorage are read-only. Exact frame-gap pauses may be resumed after a 120ms frozen-tick check; this run makes no performance claim. Pilot changes release every physical hold before fresh key-down events. The server must keep source fixed; this driver does not configure HMR. No post-Start state edits.',
};
let browser, context, page;
let outputReady = false;
let actor = '';
const intendedKeys = new Set();
const physicalKeys = new Set();

async function sourceHashes() {
  const names = (await readdir(join(repoRoot, 'src')))
    .filter(name => /\.(ts|css)$/.test(name)).map(name => `src/${name}`);
  names.push('index.html');
  const result = {};
  for (const name of names.sort()) {
    result[name] = createHash('sha256').update(await readFile(join(repoRoot, name))).digest('hex');
  }
  return result;
}

async function persistReport() {
  if (outputReady) await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}

const read = () => page.evaluate(() => window.__machimamoreRead());
const actorOf = observation => observation.player
  ? `${observation.missionId}:${observation.player.token}:${observation.player.generation}` : '';

async function mark(name, data) {
  report.cases.push({ name, ...data });
  console.log(JSON.stringify(report.cases.at(-1)));
  await persistReport();
}

async function keyDown(code) {
  intendedKeys.add(code);
  if (!physicalKeys.has(code)) {
    await page.keyboard.down(code);
    physicalKeys.add(code);
  }
}

async function keyUp(code) {
  intendedKeys.delete(code);
  await page.keyboard.up(code);
  physicalKeys.delete(code);
}

async function releaseHeldInputs(preserveIntent = false) {
  const released = [...physicalKeys];
  if (page) {
    await page.mouse.up();
    for (const code of new Set([...Object.values(mapping), ...physicalKeys])) {
      await page.keyboard.up(code);
    }
  }
  physicalKeys.clear();
  if (!preserveIntent) intendedKeys.clear();
  return released;
}

async function reapplyHeldInputs() {
  for (const code of intendedKeys) {
    await page.keyboard.down(code);
    physicalKeys.add(code);
  }
}

async function syncActor(observation, stage, reapply = true) {
  const next = actorOf(observation);
  if (next === actor) return;
  const prior = actor;
  const intended = [...intendedKeys];
  const released = await releaseHeldInputs(true);
  actor = next;
  if (next && observation.phase === 'playing' && reapply) await reapplyHeldInputs();
  const handover = {
    stage, tick: observation.tick, from: prior, to: next, released, intended,
    freshDown: next && reapply ? [...physicalKeys] : [],
  };
  report.inputHandovers.push(handover);
  console.log(JSON.stringify({ inputHandover: handover }));
  await persistReport();
}

async function resumeKnownFrame(observation, stage, { sameActor = '', reapplyOnActor = true } = {}) {
  expect(observation.phase).toBe('paused');
  expect(observation.screen).toBe('paused');
  expect(observation.pauseReasons).toEqual(['frame']);
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  expect((await page.locator('#pause-reason').textContent())?.trim()).toBe(frameReason);
  await expect(page.locator('#resume')).toBeVisible();
  await expect(page.locator('#resume')).toBeEnabled();
  await page.waitForTimeout(120);
  const stopped = await read();
  expect(stopped.tick).toBe(observation.tick);
  expect(stopped.screen).toBe('paused');
  expect(stopped.phase).toBe('paused');
  expect(stopped.pauseReasons).toEqual(['frame']);
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  expect((await page.locator('#pause-reason').textContent())?.trim()).toBe(frameReason);
  const pause = {
    stage, reason: frameReason, pauseReasons: observation.pauseReasons,
    tick: observation.tick, frozenTick: stopped.tick, freezeCheckMs: 120,
    maxGap: observation.timing.maxFrameGap, heldBefore: [...physicalKeys],
    resumeMethod: 'visible #resume button', resumedThroughVisibleButton: false,
  };
  report.setupPauses.push(pause);
  console.log(JSON.stringify({ setupFramePause: pause }));
  await persistReport();
  await releaseHeldInputs(true);
  await expect(page.locator('#resume')).toBeVisible();
  await expect(page.locator('#resume')).toBeEnabled();
  await page.locator('#resume').click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'playing');
  const resumed = await read();
  expect(resumed.screen).toBe('playing');
  expect(resumed.phase).toBe('playing');
  pause.resumedTick = resumed.tick;
  pause.resumedPhase = resumed.phase;
  pause.resumedThroughVisibleButton = true;
  const priorActor = actor;
  const resumedActor = actorOf(resumed);
  if (sameActor && resumedActor !== sameActor) {
    await persistReport();
    throw new Error(stage + ' lost its original pilot during frame recovery ' + sameActor + ' -> ' + resumedActor);
  }
  await syncActor(resumed, stage + '-resume', false);
  if (resumed.player && (reapplyOnActor || resumedActor === priorActor)) await reapplyHeldInputs();
  pause.freshDown = [...physicalKeys];
  console.log(JSON.stringify({ setupFrameResumed: pause }));
  await persistReport();
}

async function waitObserved(stage, predicate, { timeout = 30000, sameActor = '', reapplyOnActor = true } = {}) {
  const deadline = Date.now() + timeout;
  let frameRecoveries = 0;
  while (Date.now() < deadline) {
    const observation = await read();
    if (observation.phase === 'paused') {
      if (++frameRecoveries > 8) throw new Error(stage + ' exceeded eight documented frame-gap recoveries');
      await resumeKnownFrame(observation, stage, { sameActor, reapplyOnActor });
      continue;
    }
    if (observation.phase !== 'playing') {
      throw new Error(stage + ' unexpectedly stopped: ' + JSON.stringify({
        phase: observation.phase, screen: observation.screen, pauseReasons: observation.pauseReasons,
      }));
    }
    if (sameActor && actorOf(observation) !== sameActor) {
      throw new Error(stage + ' lost its original pilot ' + sameActor + ' -> ' + actorOf(observation));
    }
    await syncActor(observation, stage, reapplyOnActor);
    if (predicate(observation)) return observation;
    await page.waitForTimeout(120);
  }
  throw new Error(stage + ' timed out after ' + timeout + 'ms');
}

async function startMission() {
  await releaseHeldInputs();
  actor = '';
  await page.locator('#start').click();
  return waitObserved('start', observation => observation.tick > 3 && !!observation.player);
}

async function pauseManually() {
  await releaseHeldInputs();
  await page.keyboard.press(mapping.pause);
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  const observation = await read();
  expect(observation.phase).toBe('paused');
  expect(observation.pauseReasons).toEqual(['manual']);
  return observation;
}

async function warmLoop() {
  const currentActor = actorOf(await read());
  const pauseIndex = report.setupPauses.length;
  await keyDown(mapping.loop);
  const started = await waitObserved('loop-warmup-start', observation => observation.hud.player?.loopProgress > 0, { sameActor: currentActor });
  const done = await waitObserved('loop-warmup-finish', observation => observation.tick - started.tick >= 420
    && observation.hud.player.loopProgress === 0 && observation.hud.player.loopCooldown === 0,
  { sameActor: currentActor, timeout: 60000 });
  await keyUp(mapping.loop);
  report.warmup = {
    startTick: started.tick, endTick: done.tick,
    explicitFrameResumes: report.setupPauses.length - pauseIndex,
    method: 'Ordinary loop key and exact frame-gap visible Resume only; no state edits',
  };
  console.log(JSON.stringify({ warmup: report.warmup }));
  await persistReport();
}

function throwIfInterrupted() {
  if (report.interrupted) throw new Error('Controls run interrupted by SIGINT');
}

function interrupt() {
  report.interrupted = true;
  report.status = 'interrupted';
  process.exitCode = 130;
  void persistReport().catch(() => {});
  void context?.close().catch(() => {});
  void browser?.close().catch(() => {});
}

process.once('SIGINT', interrupt);
console.log(JSON.stringify({ event: 'controls-start', pid: process.pid, startedAt, backend, viewport, baseURL, output }));

try {
  await mkdir(output, { recursive: true });
  outputReady = true;
  await persistReport();
  if (!validBackend) throw new Error('CONTROLS_BROWSER must be chromium or webkit');
  throwIfInterrupted();
  report.bootstrapStage = 'source-hashes';
  report.beforeHashes = await sourceHashes();
  report.bootstrapStage = 'browser-launch';
  await persistReport();
  browser = backend === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({
    headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  throwIfInterrupted();
  report.browserVersion = browser.version();
  report.bootstrapStage = 'context';
  context = await browser.newContext({ viewport, hasTouch: true, deviceScaleFactor: 1 });
  throwIfInterrupted();
  report.bootstrapStage = 'page';
  page = await context.newPage();
  throwIfInterrupted();
  page.on('pageerror', error => errors.push(error.message));
  report.bootstrapStage = 'navigation';
  await persistReport();
  await page.goto(baseURL);
  await expect(page.locator('#start')).toBeEnabled({ timeout: 30000 });
  await page.waitForFunction(() => typeof window.__machimamoreRead === 'function');
  report.bootstrapStage = 'complete';
  await page.getByRole('radio', { name: 'ノーマル' }).check();
  await page.locator('#home-controls').click();
  await page.locator('#control-editor-keyboard').click();
  await expect(page.locator('[data-key-action]')).toHaveCount(9);
  for (const [action, code] of Object.entries(mapping)) {
    await page.locator(`[data-key-action="${action}"]`).click();
    await page.keyboard.press(code);
  }
  await page.screenshot({ path: join(output, 'keyboard-nine.png'), fullPage: true });
  await page.locator('#control-save').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('machimamore-keyboard-v1')));
  expect(saved.bindings).toEqual(mapping);
  await mark('nine bindings saved through settings UI', { pass: true, bindings: saved.bindings });
  await startMission();
  for (const [code, field, expected] of [['KeyA', 'turn', -1], ['KeyD', 'turn', 1], ['KeyI', 'climb', 1], ['KeyK', 'climb', -1]]) {
    await keyDown(code);
    await waitObserved('direction-' + field + '-' + expected, observation => observation.acceptedInput[field] === expected);
    await keyUp(code);
    await waitObserved('direction-release-' + field, observation => observation.acceptedInput[field] === 0);
  }
  for (const [code, field] of [['KeyE', 'accelerate'], ['KeyQ', 'brake']]) {
    await keyDown(code);
    await waitObserved('throttle-' + field, observation => observation.acceptedInput[field] === true);
    await keyUp(code);
    await waitObserved('throttle-release-' + field, observation => observation.acceptedInput[field] === false);
  }
  await mark('remapped four directions and throttle keys drive accepted inputs', { pass: true, tick: (await read()).tick });
  await warmLoop();
  await pauseManually();
  await page.locator('#pause-home').click();
  await startMission();
  const loopActor = actorOf(await read());
  const loopPauseIndex = report.setupPauses.length;
  await keyDown(mapping.loop);
  const started = await waitObserved('held-loop-start', observation => observation.hud.player?.loopProgress > 0, { sameActor: loopActor });
  const held = await waitObserved('held-loop-end', observation => observation.tick - started.tick >= 445, { sameActor: loopActor, timeout: 60000 });
  expect(held.phase).toBe('playing');
  expect(held.hud.player.loopProgress).toBe(0);
  expect(held.hud.player.loopCooldown).toBe(0);
  expect(held.input.keys).toContain(mapping.loop);
  await keyUp(mapping.loop);
  await mark('held loop completes and returns to ready through normal input', {
    pass: true, startTick: started.tick, endTick: held.tick, activeTicks: held.tick - started.tick,
    loopProgress: held.hud.player.loopProgress, cooldown: held.hud.player.loopCooldown,
    frameResumes: report.setupPauses.length - loopPauseIndex,
    uninterruptedSingleLoopVerified: report.setupPauses.length === loopPauseIndex,
    holdMethod: 'Physical key down, re-down only after documented pause recovery; no wall-time performance claim',
  });
  await pauseManually();
  await page.locator('#pause-home').click();
  await startMission();
  const fireActor = actorOf(await read());
  const firePauseIndex = report.setupPauses.length;
  await keyDown(mapping.fire);
  const empty = await waitObserved('held-fire-empty', observation => observation.hud.player?.reloadTicksRemaining > 0, { sameActor: fireActor, timeout: 60000 });
  expect(empty.hud.player.mg).toBe(0);
  expect(empty.hud.player.cannon).toBe(0);
  expect(empty.input.keys).toContain(mapping.fire);
  await page.screenshot({ path: join(output, 'held-fire-reload.png'), fullPage: true });
  const resumed = await waitObserved('held-fire-reload-complete', observation => {
    const player = observation.hud.player;
    return player && player.reloadTicksRemaining === 0 && player.mg > 0 && player.mg < 288;
  }, { sameActor: fireActor, timeout: 30000 });
  expect(resumed.phase).toBe('playing');
  expect(resumed.input.keys).toContain(mapping.fire);
  await keyUp(mapping.fire);
  await mark('held fire resumes after shared reload through the normal input path', {
    pass: true, actor: fireActor, emptyTick: empty.tick, reloadTicks: empty.hud.player.reloadTicksRemaining,
    resumeTick: resumed.tick, mg: resumed.hud.player.mg, cannon: resumed.hud.player.cannon,
    frameResumes: report.setupPauses.length - firePauseIndex,
  });
  const frozen = await pauseManually();
  await page.locator('#pause-controls').click();
  await page.locator('#control-close').click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  expect((await read()).tick).toBe(frozen.tick);
  await mark('closing settings returns to pause and preserves its clock', { pass: true, tick: frozen.tick });
  await page.locator('#pause-home').click();
  await startMission();
  const original = await read();
  const originalActor = actorOf(original);
  await keyDown(mapping.fire);
  await keyDown(mapping.down);
  const waiting = await waitObserved('ordinary-input-crash', observation => observation.hud.player === null, { timeout: 30000, reapplyOnActor: false });
  expect(waiting.input.keys).toEqual([]);
  expect(waiting.acceptedInput.fire).toBe(false);
  // Retire the dead pilot's intent. The new pilot gets its own first fresh key,
  // rather than replaying the dive used to exercise an ordinary crash.
  await releaseHeldInputs();
  const respawn = await waitObserved('ordinary-respawn', observation => !!observation.player && actorOf(observation) !== originalActor, { timeout: 30000, reapplyOnActor: false });
  expect(respawn.input.keys).toEqual([]);
  expect(respawn.acceptedInput.fire).toBe(false);
  await keyDown(mapping.right);
  const fresh = await waitObserved('new-pilot-first-key', observation => observation.acceptedInput.turn === 1, { timeout: 5000, sameActor: actorOf(respawn) });
  await keyUp(mapping.right);
  await mark('crash and respawn clear old holds and accept the new pilot first key', {
    pass: true, previousPilot: original.playerId, previousActor: originalActor, waitingTick: waiting.tick,
    newPilot: respawn.playerId, newActor: actorOf(respawn), respawnTick: respawn.tick,
    firstKeyTick: fresh.tick, firstTurn: fresh.acceptedInput.turn,
  });
  expect(errors).toEqual([]);
  report.status = 'passed';
} catch (error) {
  report.status = report.interrupted ? 'interrupted' : 'failed';
  report.error = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error);
  report.observation = page ? await read().catch(() => null) : null;
  console.error(error);
  if (page) await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {});
  if (!report.interrupted) process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString();
  try {
    report.afterHashes = await sourceHashes();
    report.productUnchanged = report.beforeHashes !== null
      && JSON.stringify(report.beforeHashes) === JSON.stringify(report.afterHashes);
    if (report.status === 'passed' && !report.productUnchanged) {
      report.status = 'failed';
      report.error = { name: 'SourceChanged', message: 'Product source changed during the controls run' };
      process.exitCode = 1;
    }
  } catch (error) {
    report.productUnchanged = null;
    report.sourceHashError = String(error);
    if (report.status === 'passed') { report.status = 'failed'; process.exitCode = 1; }
  }
  try {
    await persistReport();
  } finally {
    await releaseHeldInputs().catch(() => {});
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    process.removeListener('SIGINT', interrupt);
  }
}
