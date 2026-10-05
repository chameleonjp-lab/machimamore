import { test, expect } from '@playwright/test';

test('release bundle starts through its normal UI with no observer and no outbound traffic', async ({ page }, testInfo) => {
  const attempts: string[] = [], origin = 'http://127.0.0.1:4177';
  page.on('request', request => { if (new URL(request.url()).origin !== origin) attempts.push(request.url()); });
  page.on('websocket', socket => attempts.push(socket.url()));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await expect(page.locator('#start')).toBeEnabled({ timeout: 30000 });
  const observer = await page.evaluate(() => ['__machimamoreRead', '__machimamoreDebug', '__MACHIMAMORE_TEST__'].filter(key => key in window));
  expect(observer).toEqual([]);
  await page.locator('#start').click();
  const recoveries: Array<Record<string, unknown>> = [];
  await settleReleaseMission(page, 'initial Start', recoveries);
  await pauseReleaseMission(page, recoveries);
  const manualPauseClock = await page.locator('#timer').textContent();
  await page.locator('#pause-controls').click();
  await expect(page.locator('#control-settings')).toBeVisible();
  await page.locator('#control-cancel').click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  await page.waitForTimeout(150);
  expect(await page.locator('#timer').textContent(), 'Closing Settings must not resume the paused mission.').toBe(manualPauseClock);
  await page.locator('#pause-restart').click();
  await settleReleaseMission(page, 'pause-menu restart', recoveries);
  await pauseReleaseMission(page, recoveries);
  await page.locator('#pause-home').click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'home');
  expect(attempts).toEqual([]); expect(errors).toEqual([]);
  await testInfo.attach('release-frame-pause-recovery', {
    body: JSON.stringify({ recoveries, resumedOnlyThroughVisibleButton: true, productionHudClockUsed: true }, null, 2),
    contentType: 'application/json',
  });
  const screenshot = testInfo.outputPath('release-home.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('release-home', { path: screenshot, contentType: 'image/png' });
});

async function settleReleaseMission(
  page: import('@playwright/test').Page,
  stage: string,
  recoveries: Array<Record<string, unknown>>,
): Promise<void> {
  const deadline = Date.now() + 15_000;
  let stableSince: number | null = null;
  let clockAdvances = 0;
  let previousClock: string | null = null;
  while (Date.now() < deadline) {
    const screen = await page.locator('#app').getAttribute('data-screen');
    if (screen === 'paused') {
      const reason = await page.locator('#pause-reason').textContent();
      expect(reason, `${stage}: only the exact documented long-frame safety pause can be recovered during setup`).toBe('画面更新に長い空白があったため停止しました。');
      const beforeClock = await page.locator('#timer').textContent();
      await page.waitForTimeout(150);
      await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
      const frozenClock = await page.locator('#timer').textContent();
      expect(frozenClock, `${stage}: HUD clock must freeze during the frame-gap pause`).toBe(beforeClock);
      recoveries.push({ stage, reason, beforeClock, frozenClock, freezeCheckMs: 150 });
      await page.locator('#resume').click();
      await expect.poll(() => page.locator('#app').getAttribute('data-screen'), { timeout: 5_000 }).toMatch(/^(playing|paused)$/);
      stableSince = null;
      clockAdvances = 0;
      previousClock = null;
      continue;
    }
    expect(screen, `${stage}: active setup should remain on the flight screen`).toBe('playing');
    const clock = await page.locator('#timer').textContent();
    if (clock !== previousClock) {
      previousClock = clock;
      clockAdvances += 1;
      stableSince ??= Date.now();
    }
    if (clockAdvances >= 3 && stableSince !== null && Date.now() - stableSince >= 250) return;
    await page.waitForTimeout(80);
  }
  throw new Error(`${stage}: no sustained advancing HUD clock within 15 seconds.`);
}

async function pauseReleaseMission(page: import('@playwright/test').Page, recoveries: Array<Record<string, unknown>>): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await settleReleaseMission(page, `pre-manual-pause-${attempt + 1}`, recoveries);
    try {
      await page.locator('#pause').click({ timeout: 1_500 });
    } catch (error) {
      if (await page.locator('#app').getAttribute('data-screen') !== 'paused') throw error;
    }
    await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
    const reason = await page.locator('#pause-reason').textContent();
    if (reason?.includes('作戦時計・装填・復帰・レーザーも止まっています。')) {
      const beforeClock = await page.locator('#timer').textContent();
      await page.waitForTimeout(150);
      expect(await page.locator('#timer').textContent(), 'Manual pause must stop the HUD clock').toBe(beforeClock);
      return;
    }
    expect(reason, 'A non-manual pause is recoverable only when it is exactly the documented frame-gap safety pause').toBe('画面更新に長い空白があったため停止しました。');
    const beforeClock = await page.locator('#timer').textContent();
    await page.waitForTimeout(150);
    expect(await page.locator('#timer').textContent()).toBe(beforeClock);
    recoveries.push({ stage: 'pause-button race', reason, beforeClock, frozenClock: await page.locator('#timer').textContent(), freezeCheckMs: 150 });
  }
  throw new Error('Could not reach manual Pause after four visible setup recoveries.');
}
