/**
 * Saved reconstruction of three independently executed stdin browser fixtures.
 * This combined driver has not been executed yet. It substitutes the Scene module
 * at Playwright's response boundary, rather than injecting a native GPU fault.
 * Actions use the normal DOM. It never edits product files or game state.
 * Run only against a local development server, separately from timed evidence.
 * Exact tick counts depend on scheduling; assert the clock freezes after failure.
 */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
async function observe(page) {
  return page.evaluate(() => ({
    phase: window.__machimamoreRead().phase, tick: window.__machimamoreRead().tick,
    reasons: window.__machimamoreRead().pauseReasons, render: window.__machimamoreRead().render,
    startDisabled: document.querySelector('#start').disabled,
    resumeDisabled: document.querySelector('#resume').disabled,
    error: document.querySelector('#startup-error').textContent,
    reloadVisible: !document.querySelector('#reload').hidden,
    pauseReloadVisible: !document.querySelector('#pause-reload').hidden,
  }));
}
try {
  for (const scenario of ['prepare-final-render', 'start-first-render', 'resize']) {
    const page = await browser.newPage();
    const failCode = scenario === 'prepare-final-render'
      ? `if (failOnce) { failOnce=false; throw new Error('injected final prepare render failure'); }`
      : scenario === 'start-first-render'
        ? `if (flight && failOnce) { failOnce=false; throw new Error('injected first Start render failure'); }` : '';
    const resizeCode = scenario === 'resize'
      ? `if (failOnce) { failOnce=false; throw new Error('injected resize failure'); }` : '';
    await page.route('**/src/scene.ts*', route => route.fulfill({ contentType: 'text/javascript', body: `
      let failOnce=true;
      export class MachiMamoreScene {
        disposed=false; calls=0; async prepare() {} setReducedMotion() {}
        resize() { ${resizeCode} }
        dispose() { this.disposed=true; }
        metrics() { return { disposed:this.disposed, calls:this.calls }; }
        render(state, flight) { if (this.disposed) return; this.calls++; ${failCode} }
      }
    ` }));
    await page.goto('http://127.0.0.1:4176');
    await page.waitForFunction(() => !!window.__machimamoreRead);
    if (scenario === 'prepare-final-render') {
      await page.waitForFunction(() => document.querySelector('#startup-error').textContent.includes('injected'));
    } else {
      await page.waitForFunction(() => !document.querySelector('#start').disabled);
      await page.locator('#start').click();
      if (scenario === 'resize') await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    }
    const failed = await observe(page);
    assert.equal(failed.render, null); assert.equal(failed.startDisabled, true);
    if (scenario === 'prepare-final-render') { assert.equal(failed.phase, 'ready'); assert.equal(failed.tick, 0); assert.equal(failed.reloadVisible, true); }
    else { assert.equal(failed.phase, 'paused'); assert.ok(failed.reasons.includes('render-failed')); assert.equal(failed.resumeDisabled, true); assert.equal(failed.pauseReloadVisible, true); }
    await page.waitForTimeout(200);
    const frozen = await observe(page); assert.equal(frozen.tick, failed.tick); assert.equal(frozen.phase, failed.phase);
    let recovered = null, continued = null;
    if (scenario !== 'resize') {
      await page.locator(scenario === 'prepare-final-render' ? '#reload' : '#pause-reload').click();
      await page.waitForFunction(scenario === 'prepare-final-render' ? () => !document.querySelector('#start').disabled : () => !document.querySelector('#resume').disabled);
      recovered = await observe(page); assert.equal(recovered.tick, failed.tick); assert.equal(recovered.phase, failed.phase); assert.equal(recovered.render.disposed, false);
      await page.locator(scenario === 'prepare-final-render' ? '#start' : '#resume').click();
      await page.waitForTimeout(100); continued = await observe(page); assert.equal(continued.phase, 'playing'); assert.ok(continued.tick > failed.tick);
    }
    console.log(JSON.stringify({ scenario, failed, frozen, recovered, continued }));
    await page.close();
  }
} finally { await browser.close(); }
