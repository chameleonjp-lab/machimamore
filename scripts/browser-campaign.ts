import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium, webkit, type Browser, type Page } from '@playwright/test';
import { Quaternion, Vector3 } from 'three';
import { pilotInput, type Policy } from './legal-pilot';
import type { Aircraft, GameState } from '../src/types';

const mode = process.argv.includes('--normal') ? 'normal' : 'easy';
const policy: Policy = process.argv.includes('--crash') ? 'crash-repeat' : 'active';
const backend = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const viewport = process.argv.includes('--small') ? { width: 568, height: 320 } : { width: 1366, height: 768 };
const origin = { x: viewport.width / 2, y: viewport.height / 2 };
let browser: Browser | undefined;
let page: Page;
const pauses: unknown[] = [], inputTrace: unknown[] = [], errors: string[] = [], attempts: string[] = [];
const path = `artifacts/campaign/${backend}-${viewport.width}x${viewport.height}-${mode}-${policy}`;
await mkdir(path, { recursive: true });
const start = Date.now();
const startedAt = new Date(start).toISOString();
let firing = false, dragging = false, identity = '', observed: any = null;
let accelerating = false, braking = false;
let copiedState: GameState | null = null;
const captured = new Set<string>();
const captures: unknown[] = [];
async function capture(label: string, fullPage = false): Promise<void> {
  const read = () => page.evaluate(() => (window as unknown as { __machimamoreRead: () => unknown }).__machimamoreRead());
  const before = await read();
  let failure: string | null = null;
  try { await page.screenshot({ path: `${path}/${label}.png`, fullPage }); }
  catch (error) { failure = String(error); throw error; }
  finally {
    const after = await read().catch(error => ({ observationError: String(error) }));
    captures.push({ label, file: `${label}.png`, before, after, failure });
    await writeFile(`${path}/captures.json`, JSON.stringify(captures, null, 2) + '\n');
  }
}
/** Pilot changes release physical keys too, so the next down is never an auto-repeat. */
async function releaseHeldInputs(): Promise<void> {
  await page.mouse.up();
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyS');
  dragging = false; firing = false; accelerating = false; braking = false;
}
try {
  browser = backend === 'webkit' ? await webkit.launch() : await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).host !== '127.0.0.1:4176') attempts.push(request.url()); });
  await page.goto('http://127.0.0.1:4176');
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('#start')?.disabled);
  await page.locator(`input[value="${mode}"]`).check();
  await page.locator('#start').click();
  while (Date.now() - start < 660000) {
    observed = await page.evaluate(() => (window as unknown as { __machimamoreRead: () => unknown }).__machimamoreRead());
    if (observed.screen === 'result') break;
    if (observed.screen === 'paused') {
      assert.deepEqual(observed.pauseReasons, ['frame'], 'Only the documented frame-gap safety pause can be resumed by this campaign driver');
      const reason = await page.locator('#pause-reason').textContent();
      assert.equal(reason?.trim(), '画面更新に長い空白があったため停止しました。');
      const before = observed.tick;
      await page.waitForTimeout(120);
      const frozen = await page.evaluate(() => (window as unknown as { __machimamoreRead: () => unknown }).__machimamoreRead()) as any;
      assert.equal(frozen.tick, before, 'A paused campaign must freeze simulation time');
      assert.equal(frozen.screen, 'paused');
      assert.equal(frozen.phase, 'paused');
      assert.deepEqual(frozen.pauseReasons, ['frame']);
      assert.equal((await page.locator('#pause-reason').textContent())?.trim(), reason?.trim());
      pauses.push({ atMs: Date.now() - start, tick: before, reasons: observed.pauseReasons, reason, frozenTick: frozen.tick });
      await page.locator('#resume').waitFor({ state: 'visible' });
      if (await page.locator('#resume').isDisabled()) throw new Error('Campaign hit an unrecoverable pause');
      await releaseHeldInputs(); identity = '';
      await page.locator('#resume').click();
      const resumed = await page.evaluate(() => (window as unknown as { __machimamoreRead: () => unknown }).__machimamoreRead()) as any;
      assert.equal(resumed.screen, 'playing');
      assert.equal(resumed.phase, 'playing');
      continue;
    }
    for (const [label, tick] of [['flight', 900], ['combat', 2700]] as const) {
      if (observed.tick >= tick && !captured.has(label)) {
        captured.add(label); await capture(label);
        observed = await page.evaluate(() => (window as unknown as { __machimamoreRead: () => unknown }).__machimamoreRead());
      }
    }
    if (observed.screen !== 'playing') continue;
    const p = observed.player;
    if (!p) {
      await releaseHeldInputs();
      identity = ''; await page.waitForTimeout(60); continue;
    }
    const currentIdentity = `${observed.missionId}:${p.token}:${p.generation}`;
    if (identity !== currentIdentity || !dragging) {
      await releaseHeldInputs();
      await page.mouse.move(origin.x, origin.y); await page.mouse.down();
      identity = currentIdentity; dragging = true;
    }
    const vector = (v: { x: number; y: number; z: number }) => new Vector3(v.x, v.y, v.z);
    const plane: Aircraft = { ...p, position: vector(p.position), previous: vector(p.previous),
      velocity: vector(p.velocity), quaternion: new Quaternion().fromArray(p.quaternion) };
    const snapshotState = {
      mode, missionId: observed.missionId, tick: observed.tick, fighters: [plane], playerId: plane.id,
      ufos: observed.ufos.map((u: any) => ({ ...u, position: new Vector3(u.position.x, u.position.y, u.position.z), velocity: new Vector3(u.velocity.x, u.velocity.y, u.velocity.z) })),
      rosters: { enemy: { tokens: Array.from({ length: 50 }, (_, i) => ({ status: i < observed.hud.enemy.D ? 'destroyed' : 'reserve' })) } },
    } as unknown as GameState;
    // Keep the driver's copy stable within a mission for policy WeakMap state.
    // Object.assign touches this Node-side copy, never the browser simulation.
    if (!copiedState || copiedState.missionId !== observed.missionId) copiedState = snapshotState;
    else Object.assign(copiedState, snapshotState);
    const input = pilotInput(copiedState, policy);
    const accelerate = Boolean(input.accelerate), brake = Boolean(input.brake);
    const magnitude = Math.hypot(input.turn, input.climb), response = Math.min(1, magnitude);
    // Inverse of FlightControls' 8% dead zone and 36px radius. Diagonal inputs
    // outside the unit disk are normalized by the real pointer input path.
    const radius = magnitude === 0 ? 0 : 36 * (.08 + .92 * response);
    await page.mouse.move(origin.x + (magnitude ? input.turn / magnitude * radius : 0), origin.y - (magnitude ? input.climb / magnitude * radius : 0));
    if (input.fire !== firing) {
      if (input.fire) await page.keyboard.down('Space'); else await page.keyboard.up('Space'); firing = input.fire;
    }
    if (accelerate !== accelerating) {
      if (accelerate) await page.keyboard.down('KeyW'); else await page.keyboard.up('KeyW');
      accelerating = accelerate;
    }
    if (brake !== braking) {
      if (brake) await page.keyboard.down('KeyS'); else await page.keyboard.up('KeyS');
      braking = brake;
    }
    inputTrace.push({ tick: observed.tick, turn: input.turn, climb: input.climb, fire: input.fire,
      accelerate, brake, enemyD: observed.hud.enemy.D,
      actor: currentIdentity, observedAcceptedInput: observed.acceptedInput,
      acceptedInputSampledBeforeActions: true });
    await page.waitForTimeout(60);
  }
  await releaseHeldInputs();
  await capture('end', true);
  const resultText = await page.locator('#result').textContent();
  let retry: any = null;
  if (observed?.screen === 'result') {
    await page.keyboard.press('ArrowLeft');
    const frozen = await page.evaluate(() => (window as unknown as { __machimamoreRead: () => unknown }).__machimamoreRead()) as any;
    assert.equal(frozen.tick, observed.tick); assert.equal(frozen.input.turn, 0);
    await page.locator('#retry').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#app')?.getAttribute('data-screen') === 'playing');
    retry = await page.evaluate(() => (window as unknown as { __machimamoreRead: () => unknown }).__machimamoreRead());
    assert.notEqual(retry.missionId, observed.missionId);
    assert.equal(retry.hud.friendly.remaining, 50); assert.equal(retry.hud.enemy.remaining, 50);
    assert.equal(retry.hud.friendly.D, 0); assert.equal(retry.hud.enemy.D, 0);
    assert.equal(retry.hud.score, 0);
    await capture('retry');
  }
  const result = { startedAt, finishedAt: new Date().toISOString(), mode, policy, backend, viewport, wallMs: Date.now() - start, browser: browser.version(), observation: observed, resultText, retry, pauses, errors, attempts, inputTrace, captures,
    method: 'Read-only development snapshots; all control actions use Playwright mouse drag, keyboard Space/KeyW/KeyS, and explicit UI resume. Pilot changes release and re-press held controls. The copied GameState exists only in the driver. No browser state edits after Start. Each accepted-input sample precedes the trace row actions; pointer diagonals are normalized by the real input path.' };
  await writeFile(`${path}/result.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ mode, policy, wallMs: result.wallMs, screen: observed?.screen, tick: observed?.tick, enemyD: observed?.hud?.enemy?.D, pauses: pauses.length, errors, attempts }));
  if (observed?.screen !== 'result' || errors.length || attempts.length) throw new Error('Campaign did not complete normally; see evidence');
} catch (error) {
  await writeFile(`${path}/failure.json`, JSON.stringify({
    status: 'failed', startedAt, finishedAt: new Date().toISOString(), mode, policy, backend, viewport, wallMs: Date.now() - start, browser: browser?.version() ?? null,
    failure: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
    observation: observed, pauses, errors, attempts, inputTrace, captures,
    method: 'Read-only development snapshots; actual mouse, keyboard and visible UI actions only. The failed driver run is diagnostic evidence, not a completed campaign.',
  }, null, 2) + '\n');
  throw error;
} finally { await browser?.close(); }
