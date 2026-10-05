import { test as base, expect, type Page, type TestInfo } from '@playwright/test';

export { expect };

export const test = base.extend<{ outboundAttempts: string[] }>({
  outboundAttempts: [async ({ page, baseURL }, use) => {
    const local = new URL(baseURL ?? 'http://127.0.0.1:4176');
    const attempts = new Set<string>();
    const external = (url: string) => {
      try {
        const parsed = new URL(url);
        const network = ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol);
        const sameAuthority = parsed.host === local.host
          && ((parsed.protocol === 'ws:' && local.protocol === 'http:')
            || (parsed.protocol === 'wss:' && local.protocol === 'https:')
            || parsed.protocol === local.protocol);
        return network && !sameAuthority;
      } catch {
        return false;
      }
    };

    page.on('request', request => {
      if (external(request.url())) attempts.add(request.url());
    });
    page.on('websocket', socket => {
      if (external(socket.url())) attempts.add(socket.url());
    });
    await page.route('**/*', async route => {
      if (external(route.request().url())) {
        attempts.add(route.request().url());
        await route.abort();
      } else {
        await route.continue();
      }
    });

    await use([...attempts]);
    expect([...attempts], 'The app must not attempt external HTTP or WebSocket requests').toEqual([]);
  }, { auto: true }],
});

export async function openHome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'home');
  await expect(page.locator('#flight')).toBeVisible();
  await expect(page.locator('#start')).toBeEnabled({ timeout: 30_000 });
}

export async function startMission(page: Page, testInfo?: TestInfo): Promise<void> {
  await expect(page.locator('#start')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#start').click();
  await settleActiveMission(page, testInfo);
}

export async function settleActiveMission(page: Page, testInfo?: TestInfo): Promise<void> {
  const recoveries: Array<Record<string, unknown>> = [];
  const setupStarted = Date.now();
  const setupDeadline = setupStarted + 20_000;
  let stableSince: number | null = null;
  let lastTick = -1;
  let stableTicks = 0;
  let lastScreen: string | null = null;
  while (Date.now() < setupDeadline) {
    // Read the UI state and the read-only game snapshot in one page task. A
    // separate attribute check followed by a 15s expect can miss a pause that
    // arrives between those two browser round trips.
    const sample = await readMissionSample(page);
    lastScreen = sample.screen;
    if (sample.screen === 'paused') {
      const recovery = await recoverFrameGapPause(page, sample);
      recoveries.push(recovery);
      await attachFrameRecovery(testInfo, `setup-frame-gap-recovery-${recoveries.length}`, recovery);
      stableSince = null;
      stableTicks = 0;
      lastTick = -1;
      continue;
    }
    if (sample.screen !== 'playing') {
      await page.waitForTimeout(40);
      continue;
    }
    expect(sample.observation?.phase, 'The mission screen and game phase should agree during setup').toBe('playing');
    const tick = sample.observation?.tick as number;
    if (tick > lastTick) {
      lastTick = tick;
      stableTicks += 1;
      stableSince ??= Date.now();
    }
    // Wait through the first renderer frames before a test starts interacting
    // or recording a baseline. This setup window ends before performance tests.
    if (stableSince !== null && stableTicks >= 12 && Date.now() - stableSince >= 300) {
      if (testInfo && recoveries.length > 0) {
        await testInfo.attach('documented-frame-gap-recovery', {
          body: JSON.stringify({ recoveries, resumedThroughVisibleButton: true, setupWarmupTicks: stableTicks, setupWarmupMs: Date.now() - stableSince, setupElapsedMs: Date.now() - setupStarted }, null, 2),
          contentType: 'application/json',
        });
      }
      return;
    }
    await page.waitForTimeout(40);
  }
  throw new Error(`Mission did not produce 12 advancing ticks across a stable 300ms setup window within 20 seconds (last screen=${lastScreen}, ticks=${stableTicks}).`);
}

/** Use the visible pause button, retrying only after a documented frame-gap pause. */
export async function pauseActiveMission(page: Page, testInfo?: TestInfo): Promise<void> {
  const recoveries: Array<Record<string, unknown>> = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await settleActiveMission(page, testInfo);
    try {
      await page.locator('#pause').click({ timeout: 1_500 });
    } catch (error) {
      const sample = await readMissionSample(page);
      if (sample.screen !== 'paused') throw error;
      const recovery = await recoverFrameGapPause(page, sample);
      recoveries.push(recovery);
      await attachFrameRecovery(testInfo, `pause-frame-gap-recovery-${recoveries.length}`, recovery);
      continue;
    }
    await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused', { timeout: 3_000 });
    const sample = await readMissionSample(page);
    if (sample.screen === 'paused' && sample.reason === '作戦時計・装填・復帰・レーザーも止まっています。') {
      expect(sample.observation?.pauseReasons).toEqual(['manual']);
      if (testInfo && recoveries.length > 0) {
        await testInfo.attach('frame-gap-recovery-before-manual-pause', {
          body: JSON.stringify({ recoveries, resumedThroughVisibleButton: true }, null, 2),
          contentType: 'application/json',
        });
      }
      return;
    }
    if (sample.screen === 'paused') {
      const recovery = await recoverFrameGapPause(page, sample);
      recoveries.push(recovery);
      await attachFrameRecovery(testInfo, `pause-frame-gap-recovery-${recoveries.length}`, recovery);
      continue;
    }
    throw new Error(`The visible Pause action did not produce a paused screen (screen=${sample.screen}).`);
  }
  if (testInfo && recoveries.length > 0) {
    await testInfo.attach('frame-gap-recovery-before-manual-pause', {
      body: JSON.stringify({ recoveries, resumedThroughVisibleButton: true }, null, 2),
      contentType: 'application/json',
    });
  }
  throw new Error('Could not reach a manual pause after four setup-only frame-gap recoveries.');
}

export async function waitForMissionTickAdvance(page: Page, minimumTicks = 1, testInfo?: TestInfo): Promise<void> {
  await settleActiveMission(page, testInfo);
  const startingTick = (await readRequiredObservation(page)).tick as number;
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await page.locator('#app').getAttribute('data-screen') === 'paused') {
      await settleActiveMission(page, testInfo);
      continue;
    }
    const tick = (await readRequiredObservation(page)).tick as number;
    if (tick >= startingTick + minimumTicks) return;
    await page.waitForTimeout(40);
  }
  throw new Error(`Mission tick did not advance by ${minimumTicks} within 5 seconds after setup recovery.`);
}

/** Development-only read access. Game actions in tests still travel through the visible UI. */
export async function readObservation(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    const read = (window as Window & { __machimamoreRead?: () => unknown }).__machimamoreRead;
    if (typeof read !== 'function') return null;
    const value = read();
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
  });
}

export async function readRequiredObservation(page: Page): Promise<Record<string, unknown>> {
  const observation = await readObservation(page);
  expect(observation, 'Development build should expose a read-only browser observation snapshot').not.toBeNull();
  return observation!;
}

type MissionSample = {
  screen: string | null;
  reason: string | null;
  inputPresentation: string | null;
  observation: Record<string, unknown> | null;
};

async function readMissionSample(page: Page): Promise<MissionSample> {
  return page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('#app');
    const reason = document.querySelector<HTMLElement>('#pause-reason')?.textContent?.trim() ?? null;
    const read = (window as Window & { __machimamoreRead?: () => unknown }).__machimamoreRead;
    const value = typeof read === 'function' ? read() : null;
    return {
      screen: app?.getAttribute('data-screen') ?? null,
      reason,
      inputPresentation: app?.getAttribute('data-input') ?? null,
      observation: value && typeof value === 'object' ? value as Record<string, unknown> : null,
    };
  });
}

async function recoverFrameGapPause(page: Page, stopped: MissionSample): Promise<Record<string, unknown>> {
  expect(stopped.screen).toBe('paused');
  expect(stopped.reason, 'Only the exact documented long-frame safety pause can be recovered during test setup').toBe('画面更新に長い空白があったため停止しました。');
  const pauseReasons = stopped.observation?.pauseReasons as string[] | undefined;
  expect(pauseReasons, 'The pause must be caused by a frame gap alone').toEqual(['frame']);
  expect(stopped.observation?.phase).toBe('paused');
  const stoppedTick = stopped.observation?.tick;
  await page.waitForTimeout(120);
  const stillStopped = await readMissionSample(page);
  expect(stillStopped.screen).toBe('paused');
  expect(stillStopped.reason).toBe(stopped.reason);
  expect(stillStopped.observation?.pauseReasons).toEqual(['frame']);
  expect(stillStopped.observation?.tick).toBe(stoppedTick);
  const resume = page.locator('#resume');
  await expect(resume).toBeVisible();
  await expect(resume).toBeEnabled();
  const resumeInputMethod = stopped.inputPresentation === 'touch' ? 'native-touch' : 'mouse-click';
  if (resumeInputMethod === 'native-touch') {
    await resume.scrollIntoViewIfNeeded();
    const box = await resume.boundingBox();
    expect(box, 'Visible Resume needs a measurable touch target').not.toBeNull();
    const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    const hit = await page.evaluate(({ x, y }) => {
      const target = document.querySelector<HTMLElement>('#resume');
      const actual = document.elementFromPoint(x, y);
      return { inViewport: x >= 0 && y >= 0 && x < innerWidth && y < innerHeight, targetReached: !!target && !!actual && (target === actual || target.contains(actual)) };
    }, point);
    expect(hit.inViewport, 'Resume touch point must lie inside the viewport').toBe(true);
    expect(hit.targetReached, 'Resume must be under its native touch point').toBe(true);
    await page.touchscreen.tap(point.x, point.y);
  } else {
    await resume.click();
  }
  await expect.poll(async () => (await readMissionSample(page)).screen).toBe('playing');
  const resumed = await readMissionSample(page);
  return {
    reason: stopped.reason,
    pauseReasons,
    tick: stoppedTick,
    confirmedFrozenTick: stillStopped.observation?.tick,
    freezeCheckMs: 120,
    resumedThroughVisibleButton: true,
    inputPresentationBeforeResume: stopped.inputPresentation,
    resumeInputMethod,
    inputPresentationAfterResume: resumed.inputPresentation,
    resumedScreen: resumed.screen,
    resumedPhase: resumed.observation?.phase,
  };
}

async function attachFrameRecovery(testInfo: TestInfo | undefined, name: string, recovery: Record<string, unknown>): Promise<void> {
  if (!testInfo) return;
  await testInfo.attach(name, { body: JSON.stringify(recovery, null, 2), contentType: 'application/json' });
}

export async function saveScreenshot(page: Page, testInfo: TestInfo, name: string, fullPage = false): Promise<string> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
  return path;
}

/** Capture a full-screen visual-review candidate from a sampled active mission. */
export async function saveActiveMissionScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<string> {
  const attempts: Array<Record<string, unknown>> = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await settleActiveMission(page, testInfo);
    const before = await readMissionSample(page);
    if (before.screen === 'paused') {
      const recovery = await recoverFrameGapPause(page, before);
      attempts.push({ attempt, before: { screen: before.screen, tick: before.observation?.tick }, recovery });
      await attachFrameRecovery(testInfo, `${name}-pre-capture-frame-gap-${attempt}`, recovery);
      continue;
    }
    expect(before.screen).toBe('playing');
    expect(before.observation?.phase).toBe('playing');
    const path = testInfo.outputPath(`${name}-capture-candidate-${attempt}.png`);
    await page.screenshot({ path, fullPage: false, animations: 'disabled' });
    await testInfo.attach(`${name}-capture-candidate-${attempt}`, { path, contentType: 'image/png' });
    let after: MissionSample;
    try {
      after = await readMissionSample(page);
    } catch (error) {
      const failedState = {
        attempt,
        visualReviewRequired: true,
        before: { screen: before.screen, tick: before.observation?.tick, phase: before.observation?.phase },
        afterReadError: error instanceof Error ? error.message : String(error),
      };
      attempts.push(failedState);
      await testInfo.attach(`${name}-capture-state-attempt-${attempt}`, { body: JSON.stringify({ attempts, visualReviewRequired: true }, null, 2), contentType: 'application/json' });
      throw error;
    }
    const record: Record<string, unknown> = {
      attempt,
      before: { screen: before.screen, tick: before.observation?.tick, phase: before.observation?.phase },
      after: { screen: after.screen, tick: after.observation?.tick, phase: after.observation?.phase, pauseReasons: after.observation?.pauseReasons },
      visualReviewRequired: true,
      captureInterrupted: after.screen === 'paused',
      captureRecoveryStatus: after.screen === 'paused'
        ? 'pending'
        : after.screen === 'playing' && after.observation?.phase === 'playing' ? 'not-required' : 'unexpected-state',
    };
    attempts.push(record);
    // Preserve the PNG and state boundary even if a strict recovery check below fails.
    await testInfo.attach(`${name}-capture-state-attempt-${attempt}`, { body: JSON.stringify({ attempts, visualReviewRequired: true }, null, 2), contentType: 'application/json' });
    if (after.screen === 'playing' && after.observation?.phase === 'playing') {
      record.captureInterrupted = false;
    } else if (after.screen === 'paused') {
      try {
        const recovery = await recoverFrameGapPause(page, after);
        record.captureRecoveryStatus = 'recovered';
        record.capturePauseRecovery = recovery;
        await attachFrameRecovery(testInfo, `${name}-post-capture-frame-gap-${attempt}`, recovery);
      } catch (error) {
        record.captureRecoveryStatus = 'failed';
        record.captureRecoveryError = error instanceof Error ? error.message : String(error);
        await testInfo.attach(`${name}-capture-recovery-failure-${attempt}`, { body: JSON.stringify(record, null, 2), contentType: 'application/json' });
        throw error;
      }
    } else {
      throw new Error(`The screenshot operation ended in an unexpected UI/simulation state (${after.screen}/${String(after.observation?.phase)}).`);
    }
    // The PNG is a visual-review candidate, not an automatic visual pass.
    // Screenshot capture can itself create a later frame-gap pause; that
    // interruption is recorded and recovered for the following UI steps.
    await testInfo.attach(`${name}-capture-state`, { body: JSON.stringify({ attempts, visualReviewRequired: true }, null, 2), contentType: 'application/json' });
    return path;
  }
  await testInfo.attach(`${name}-capture-state`, { body: JSON.stringify({ attempts, captureFailed: true }, null, 2), contentType: 'application/json' });
  throw new Error(`Could not capture ${name} after three frame-gap setup recoveries.`);
}

export async function expectNoPageOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    viewportHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(dimensions.scrollWidth, `horizontal overflow at ${dimensions.viewportWidth}×${dimensions.viewportHeight}`).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}
