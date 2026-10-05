import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, webkit, type Page } from '@playwright/test';

type Snapshot = Record<string, unknown>;
type Mode = 'performance' | 'endurance';
type ResourceCounts = {
  aircraft: number;
  activeLasers: number;
  projectiles: number;
  decorations: number;
  geometries: number;
  textures: number;
  programs: number;
  audioContexts: number;
  audioSources: number;
  activeEffectSources: number;
  soundEnabled: boolean;
};

const modeIndex = process.argv.indexOf('--mode');
const modeArg = process.argv.find(arg => arg.startsWith('--mode='))?.split('=')[1]
  ?? (modeIndex >= 0 ? process.argv[modeIndex + 1] : undefined);
if (modeArg !== 'performance' && modeArg !== 'endurance') {
  throw new Error('Use --mode performance or --mode endurance.');
}
const mode = modeArg as Mode;
const browserEngine = process.env.BROWSER_EVIDENCE_ENGINE ?? 'chromium';
if (browserEngine !== 'chromium' && browserEngine !== 'webkit') {
  throw new Error('BROWSER_EVIDENCE_ENGINE must be chromium or webkit.');
}
function viewportDimension(name: 'BROWSER_EVIDENCE_WIDTH' | 'BROWSER_EVIDENCE_HEIGHT', fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return value;
}
const targetViewport = {
  width: viewportDimension('BROWSER_EVIDENCE_WIDTH', 393),
  height: viewportDimension('BROWSER_EVIDENCE_HEIGHT', 852),
};
const baseURL = process.env.BROWSER_EVIDENCE_BASE_URL ?? 'http://127.0.0.1:4176';
const outputDir = join(process.cwd(), 'artifacts', 'browser-evidence');
mkdirSync(outputDir, { recursive: true });
const runId = `${new Date().toISOString().replaceAll(':', '-')}-${mode}`;
const outputPath = join(outputDir, `${runId}.json`);
const screenshotPaths: string[] = [];
const networkAttempts = new Set<string>();
const framePauseRecoveries: Snapshot[] = [];
const missionSetupWarmups: Snapshot[] = [];
const activeScreenshotCaptures: Snapshot[] = [];
const localURL = new URL(baseURL);
function isExternal(url: string): boolean {
  try {
    const parsed = new URL(url);
    const network = ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol);
    const sameAuthority = parsed.host === localURL.host
      && ((parsed.protocol === 'ws:' && localURL.protocol === 'http:')
        || (parsed.protocol === 'wss:' && localURL.protocol === 'https:')
        || parsed.protocol === localURL.protocol);
    return network && !sameAuthority;
  } catch {
    return false;
  }
}

function plain(value: unknown): Snapshot {
  return value && typeof value === 'object' ? value as Snapshot : {};
}

function missionIdentity(snapshot: Snapshot): Snapshot {
  if (typeof snapshot.seed !== 'number' || !Number.isSafeInteger(snapshot.seed)) {
    throw new Error('The development observation is missing the integer mission seed.');
  }
  if (typeof snapshot.rulesVersion !== 'string' || snapshot.rulesVersion.length === 0) {
    throw new Error('The development observation is missing the simulation rules version.');
  }
  return {
    missionId: snapshot.missionId,
    seed: snapshot.seed,
    rulesVersion: snapshot.rulesVersion,
    mode: snapshot.mode,
  };
}

function resourceCounts(snapshot: Snapshot): ResourceCounts {
  const render = plain(snapshot.render);
  const audio = plain(snapshot.audio);
  const value = {
    aircraft: Number(render.aircraft),
    activeLasers: Number(render.activeLasers),
    projectiles: Number(render.projectiles),
    decorations: Number(render.decorations),
    geometries: Number(render.geometries),
    textures: Number(render.textures),
    programs: Number(render.programs),
    audioContexts: Number(audio.contextCount),
    audioSources: Number(audio.activeSources),
    activeEffectSources: Number(audio.activeEffectSources),
    soundEnabled: audio.enabled === true,
  };
  for (const [name, count] of Object.entries(value)) {
    if (name !== 'soundEnabled' && (typeof count !== 'number' || !Number.isFinite(count))) throw new Error(`Missing runtime resource metric: ${name}`);
  }
  const limits: Array<[Exclude<keyof ResourceCounts, 'soundEnabled'>, number]> = [
    ['aircraft', 16], ['activeLasers', 40], ['projectiles', 2048], ['decorations', 24],
    ['audioContexts', 1], ['audioSources', 10], ['activeEffectSources', 9],
  ];
  for (const [name, maximum] of limits) {
    if (value[name] > maximum) throw new Error(`${name} resource bound exceeded: ${value[name]} > ${maximum}`);
  }
  if (value.geometries <= 0 || value.textures <= 0 || value.programs <= 0) {
    throw new Error('Renderer resource counts must remain present and positive.');
  }
  return value;
}

function rendererCounts(value: ResourceCounts): Pick<ResourceCounts, 'geometries' | 'textures' | 'programs'> {
  return { geometries: value.geometries, textures: value.textures, programs: value.programs };
}

function sameRendererCounts(left: ResourceCounts, right: ResourceCounts): boolean {
  return left.geometries === right.geometries && left.textures === right.textures && left.programs === right.programs;
}

async function observation(page: Page): Promise<Snapshot> {
  const value = await page.evaluate(() => {
    const read = (window as Window & { __machimamoreRead?: () => unknown }).__machimamoreRead;
    return typeof read === 'function' ? read() : null;
  });
  if (!value || typeof value !== 'object') {
    throw new Error('The development build does not expose its read-only browser observation hook.');
  }
  return plain(value);
}

async function writeScreenshot(page: Page, label: string): Promise<void> {
  const path = join(outputDir, `${runId}-${label}.png`);
  await page.screenshot({ path, fullPage: false, animations: 'disabled' });
  screenshotPaths.push(path);
}

async function missionSample(page: Page): Promise<{ screen: string | null; reason: string | null; observation: Snapshot }> {
  const sample = await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('#app');
    const read = (window as Window & { __machimamoreRead?: () => unknown }).__machimamoreRead;
    const value = typeof read === 'function' ? read() : null;
    return {
      screen: app?.getAttribute('data-screen') ?? null,
      reason: document.querySelector<HTMLElement>('#pause-reason')?.textContent?.trim() ?? null,
      observation: value && typeof value === 'object' ? value as Snapshot : null,
    };
  });
  if (!sample.observation) throw new Error('The development build does not expose its read-only browser observation hook.');
  return sample as { screen: string | null; reason: string | null; observation: Snapshot };
}

async function recoverFrameGapPause(page: Page, label: string): Promise<Snapshot> {
  const stopped = await missionSample(page);
  if (stopped.screen !== 'paused') throw new Error(`Expected a paused mission before frame-gap recovery at ${label}.`);
  if (stopped.observation.phase !== 'paused') throw new Error(`Pause screen and simulation phase disagree at ${label}.`);
  if (stopped.reason !== '画面更新に長い空白があったため停止しました。') {
    throw new Error(`A user action reached Pause for an unexpected reason at ${label}: ${stopped.reason ?? 'reason unavailable'}`);
  }
  if (JSON.stringify(stopped.observation.pauseReasons) !== JSON.stringify(['frame'])) {
    throw new Error(`Only a frame-gap pause can be recovered during setup at ${label}: ${JSON.stringify(stopped.observation.pauseReasons)}`);
  }
  const beforeTick = stopped.observation.tick;
  await page.waitForTimeout(120);
  const frozen = await missionSample(page);
  if (frozen.screen !== 'paused' || frozen.reason !== stopped.reason
    || frozen.observation.phase !== 'paused'
    || JSON.stringify(frozen.observation.pauseReasons) !== JSON.stringify(['frame'])) {
    throw new Error(`The frame-gap pause was not stable during the freeze check at ${label}.`);
  }
  if (beforeTick !== frozen.observation.tick) throw new Error('The game tick advanced during the frame-gap safety pause.');
  const resume = page.locator('#resume');
  await resume.waitFor({ state: 'visible', timeout: 5_000 });
  if (!(await resume.isEnabled())) throw new Error(`Visible Resume is disabled during setup recovery at ${label}.`);
  const recovery: Snapshot = {
    label,
    reason: stopped.reason,
    pauseReasons: stopped.observation.pauseReasons,
    tick: beforeTick,
    confirmedFrozenTick: frozen.observation.tick,
    freezeCheckMs: 120,
    resumedThroughVisibleButton: true,
    resumeConfirmed: false,
  };
  await resume.click();
  framePauseRecoveries.push(recovery);
  await page.waitForFunction(() => document.querySelector<HTMLElement>('#app')?.getAttribute('data-screen') === 'playing', null, { timeout: 5_000 });
  const resumed = await missionSample(page);
  if (resumed.screen !== 'playing' || resumed.observation.phase !== 'playing') {
    throw new Error(`Visible Resume did not return to active play at ${label}.`);
  }
  Object.assign(recovery, {
    resumeConfirmed: true,
    resumedScreen: resumed.screen,
    resumedPhase: resumed.observation.phase,
    resumedTick: resumed.observation.tick,
  });
  return recovery;
}

/** Save an active-flight review candidate and record any exact frame-pause interruption after capture. */
async function writeActiveScreenshot(page: Page, label: string): Promise<void> {
  let before = await missionSample(page);
  const preCaptureRecovery = before.screen === 'paused'
    ? await recoverFrameGapPause(page, `${label} pre-capture setup`)
    : null;
  if (preCaptureRecovery) before = await missionSample(page);
  if (before.screen !== 'playing' || before.observation.phase !== 'playing') {
    throw new Error(`Cannot take an active-flight screenshot at ${label} from ${before.screen}/${String(before.observation.phase)}.`);
  }

  const path = join(outputDir, `${runId}-${label}.png`);
  await page.screenshot({ path, fullPage: false, animations: 'disabled' });
  screenshotPaths.push(path);
  const activeCapture: Snapshot = {
    label,
    path,
    visualReviewRequired: true,
    captureInterrupted: null,
    captureRecoveryStatus: 'post-capture-observation-pending',
    before: { screen: before.screen, phase: before.observation.phase, tick: before.observation.tick },
    after: null,
    preCaptureRecovery,
    postCaptureRecovery: null,
  };
  activeScreenshotCaptures.push(activeCapture);

  let after: Awaited<ReturnType<typeof missionSample>>;
  try {
    after = await missionSample(page);
  } catch (error) {
    activeCapture.postCaptureObservationError = error instanceof Error ? error.message : String(error);
    throw error;
  }
  const captureInterrupted = after.screen === 'paused';
  Object.assign(activeCapture, {
    captureInterrupted,
    captureRecoveryStatus: captureInterrupted
      ? 'pending'
      : after.screen === 'playing' && after.observation.phase === 'playing' ? 'not-required' : 'unexpected-state',
    after: { screen: after.screen, phase: after.observation.phase, tick: after.observation.tick, reason: after.reason, pauseReasons: after.observation.pauseReasons },
  });
  if (captureInterrupted) {
    // Screenshots are outside the fixed measurement interval. Recover only an
    // exact frame-gap safety pause so the visible mission flow can continue.
    try {
      activeCapture.postCaptureRecovery = await recoverFrameGapPause(page, `${label} screenshot capture`);
      activeCapture.captureRecoveryStatus = 'recovered';
    } catch (error) {
      activeCapture.captureRecoveryStatus = 'failed';
      activeCapture.captureRecoveryError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  } else if (after.screen !== 'playing' || after.observation.phase !== 'playing') {
    throw new Error(`Screenshot at ${label} ended in an unexpected UI/simulation state (${after.screen}/${String(after.observation.phase)}).`);
  }
}

async function readScreen(page: Page): Promise<string> {
  return await page.locator('#app').getAttribute('data-screen') ?? 'unknown';
}

async function startMission(page: Page): Promise<void> {
  const screen = await readScreen(page);
  const action = screen;
  if (screen === 'result') {
    await page.locator('#retry').click();
  } else if (screen === 'home') {
    await page.locator('#start').click();
  } else if (screen === 'paused') {
    await recoverFrameGapPause(page, 'mission setup entry');
  }
  const startedAt = Date.now();
  const setupDeadline = startedAt + 15_000;
  let stableSince: number | null = null;
  let lastTick = -1;
  let stableTicks = 0;
  while (Date.now() < setupDeadline) {
    const sample = await missionSample(page);
    if (sample.screen === 'paused') {
      await recoverFrameGapPause(page, 'mission-setup-warmup');
      stableSince = null;
      stableTicks = 0;
      lastTick = -1;
      continue;
    }
    if (sample.screen !== 'playing') throw new Error(`Could not establish active play from the visible Start/Retry action (${sample.screen}).`);
    if (sample.observation.phase !== 'playing') throw new Error(`Mission screen and simulation phase disagree (${String(sample.observation.phase)}).`);
    const tick = Number(sample.observation.tick);
    if (tick > lastTick) {
      lastTick = tick;
      stableTicks += 1;
      stableSince ??= Date.now();
    }
    if (stableTicks >= 12 && stableSince !== null && Date.now() - stableSince >= 300) {
      missionSetupWarmups.push({ action, elapsedMs: Date.now() - startedAt, warmupTicks: stableTicks, lastTick, steadyDurationMs: Date.now() - stableSince });
      return;
    }
    await page.waitForTimeout(40);
  }
  throw new Error(`Mission did not complete its 300 ms renderer warm-up within 15 seconds (screen=${await readScreen(page)}, ticks=${stableTicks}).`);
}

async function recoverScreenshotFramePause(page: Page, label: string): Promise<void> {
  if (await readScreen(page) !== 'paused') return;
  await recoverFrameGapPause(page, label);
}

async function returnHome(page: Page): Promise<void> {
  const screen = await readScreen(page);
  if (screen === 'result') await page.locator('#result-home').click();
  else {
    if (screen === 'playing') await page.locator('#pause').click();
    if (await readScreen(page) === 'paused') await page.locator('#pause-home').click();
  }
  await page.waitForFunction(() => document.querySelector('#app')?.getAttribute('data-screen') === 'home', null, { timeout: 15_000 });
}

async function steadyFrameSample(page: Page, durationMs: number): Promise<Snapshot> {
  return page.evaluate(async duration => new Promise<Snapshot>(resolve => {
    const intervals: number[] = [];
    let first: number | null = null;
    let previous: number | null = null;
    const callbacks: FrameRequestCallback[] = [];
    callbacks.push(function (now: number) {
      if (first === null) first = now;
      if (previous !== null) intervals.push(now - previous);
      previous = now;
      if (now - first < duration) requestAnimationFrame(callbacks[0]);
      else {
        const sorted = [...intervals].sort((a, b) => a - b);
        resolve({
          durationMs: now - first,
          sampleCount: intervals.length,
          meanIntervalMs: intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null,
          p50IntervalMs: sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(.5 * sorted.length) - 1)] : null,
          p95IntervalMs: sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(.95 * sorted.length) - 1)] : null,
          p99IntervalMs: sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(.99 * sorted.length) - 1)] : null,
          maxIntervalMs: sorted.at(-1) ?? null,
        });
      }
    });
    requestAnimationFrame(callbacks[0]);
  }), durationMs);
}

const record: Snapshot = {
  status: 'running',
  mode,
  runId,
  baseURL,
  targetViewport,
  startTime: new Date().toISOString(),
  browser: null,
  environment: {
    userAgent: null,
    playwrightBrowsersPathConfigured: Boolean(process.env.PLAYWRIGHT_BROWSERS_PATH),
    graphics: null,
  softwareRendererWorkerLimit: process.env.LP_NUM_THREADS ?? null,
    graphicsThreadEnvironment: { LP_NUM_THREADS: process.env.LP_NUM_THREADS ?? null },
    memory: null,
  },
  outboundAttempts: [],
  screenshots: screenshotPaths,
  activeScreenshotCaptures,
  observations: [],
  framePauseRecoveries,
  missionSetupWarmups,
  conclusion: null,
};

const browser = browserEngine === 'webkit'
  ? await webkit.launch()
  : await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  record.browser = { name: browserEngine, version: browser.version() };
  const environment = plain(record.environment);
  const context = await browser.newContext({ viewport: targetViewport, hasTouch: true, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const rawUrl = route.request().url();
    if (isExternal(rawUrl)) {
      networkAttempts.add(rawUrl);
      await route.abort();
    } else {
      await route.continue();
    }
  });
  const page = await context.newPage();
  page.on('request', request => {
    if (isExternal(request.url())) networkAttempts.add(request.url());
  });
  page.on('websocket', socket => {
    if (isExternal(socket.url())) networkAttempts.add(socket.url());
  });

  const navigationStart = Date.now();
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.locator('#start').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#start').waitFor({ state: 'attached' });
  await page.waitForFunction(() => !(document.querySelector<HTMLButtonElement>('#start')?.disabled), null, { timeout: 30_000 });
  environment.userAgent = await page.evaluate(() => navigator.userAgent);
  environment.viewportProfile = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    deviceScaleFactor: devicePixelRatio,
    rendererPixelRatio: Math.min(devicePixelRatio || 1, 1.5),
  }));
  environment.navigationToReadyMs = Date.now() - navigationStart;
  environment.graphics = await page.locator('#flight').evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const cssRect = canvas.getBoundingClientRect();
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl ? {
      vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      antialias: gl.getContextAttributes()?.antialias ?? null,
      samples: gl.getParameter(gl.SAMPLES),
      cssSize: { width: cssRect.width, height: cssRect.height },
      drawingBuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
      effectivePixelRatio: cssRect.width > 0 ? gl.drawingBufferWidth / cssRect.width : null,
    } : null;
  });
  await writeScreenshot(page, 'home');
  await page.getByRole('radio', { name: 'ノーマル' }).check();
  if (await page.locator('#home-sound').getAttribute('aria-pressed') !== 'true') await page.locator('#home-sound').click();

  const relaunches: Snapshot[] = [];
  const maximumResources: ResourceCounts = {
    aircraft: 0, activeLasers: 0, projectiles: 0, decorations: 0,
    geometries: 0, textures: 0, programs: 0, audioContexts: 0, audioSources: 0, activeEffectSources: 0,
    soundEnabled: false,
  };
  const observeResources = async (): Promise<{ snapshot: Snapshot; resources: ResourceCounts }> => {
    const snapshot = await observation(page);
    if (snapshot.mode !== 'normal') throw new Error(`Expected Normal mode during resource evidence; saw ${String(snapshot.mode)}.`);
    const resources = resourceCounts(snapshot);
    if (!resources.soundEnabled) throw new Error('Sound must be explicitly enabled before resource-source checks.');
    const numericKeys = ['aircraft', 'activeLasers', 'projectiles', 'decorations', 'geometries', 'textures', 'programs', 'audioContexts', 'audioSources', 'activeEffectSources'] as const;
    for (const key of numericKeys) maximumResources[key] = Math.max(maximumResources[key], resources[key]);
    maximumResources.soundEnabled ||= resources.soundEnabled;
    return { snapshot, resources };
  };
  const coldHome = resourceCounts(await observation(page));
  await startMission(page);
  record.setupMission = missionIdentity(await observation(page));
  await writeActiveScreenshot(page, 'mission-start');
  const warmupSamples: Snapshot[] = [];
  const warmupStartedAt = Date.now();
  while (Date.now() - warmupStartedAt < 10_000) {
    let screen = await readScreen(page);
    if (screen === 'result') {
      await startMission(page);
      screen = await readScreen(page);
    } else if (screen === 'paused') {
      await recoverScreenshotFramePause(page, 'renderer warm-up');
      screen = await readScreen(page);
    }
    if (screen !== 'playing') {
      throw new Error(`Warm-up left the active mission screen (${screen}).`);
    }
    const { snapshot, resources } = await observeResources();
    warmupSamples.push({ elapsedMs: Date.now() - warmupStartedAt, ...missionIdentity(snapshot), resources });
    await page.waitForTimeout(250);
  }
  const warmupMission = (await observeResources()).snapshot;
  const warmupMissionId = warmupMission.missionId;
  await returnHome(page);
  const warmHomeObservation = await observeResources();
  if (warmHomeObservation.resources.audioSources !== 0) throw new Error('Audio sources remained active after returning Home.');
  const warmHome = warmHomeObservation.resources;
  const repeatedHome: Snapshot[] = [];

  let previousMissionId = warmupMissionId;
  for (let index = 1; index <= 10; index += 1) {
    await startMission(page);
    const { snapshot: active, resources: activeResources } = await observeResources();
    if (active.missionId === previousMissionId) throw new Error(`Mission ID did not change on relaunch ${index}.`);
    previousMissionId = active.missionId;
    if (activeResources.aircraft !== 16) throw new Error(`Expected 16 aircraft at Normal 8-vs-8 start; saw ${activeResources.aircraft}.`);
    await page.waitForTimeout(100);
    await returnHome(page);
    await page.waitForFunction(() => document.querySelector('#app')?.getAttribute('data-screen') === 'home', null, { timeout: 15_000 });
    const { snapshot: home, resources: homeResources } = await observeResources();
    if (homeResources.audioSources !== 0) throw new Error(`Audio source remained active on Home after relaunch ${index}.`);
    if (!sameRendererCounts(homeResources, warmHome)) throw new Error(`Renderer resources changed after relaunch ${index}: ${JSON.stringify(rendererCounts(homeResources))}`);
    repeatedHome.push({ index, ...missionIdentity(home), resources: rendererCounts(homeResources) });
    relaunches.push({ index, ...missionIdentity(active), resources: activeResources, homeResources: rendererCounts(homeResources) });
  }
  record.relaunches = relaunches;
  record.resourceBounds = {
    limits: { aircraft: 16, activeLasers: 40, projectiles: 2048, decorations: 24, audioContexts: 1, audioSources: 10, activeEffectSources: 9 },
    coldHome,
    warmHome: rendererCounts(warmHome),
    warmupMission: missionIdentity(warmupMission),
    warmupSamples,
    repeatedHome,
    maximumObserved: maximumResources,
    soundWasEnabled: maximumResources.soundEnabled,
  };
  await writeScreenshot(page, 'after-ten-relaunches');

  if (mode === 'performance') {
    await startMission(page);
    const { snapshot: before, resources: beforeResources } = await observeResources();
    record.performanceMission = missionIdentity(before);
    const beforeMissionId = before.missionId;
    const sample = await steadyFrameSample(page, 60_000);
    const { snapshot: after, resources: afterResources } = await observeResources();
    const endScreen = await readScreen(page);
    const continuousMission = endScreen === 'playing' && after.missionId === beforeMissionId;
    record.performance = {
      sample,
      before,
      after,
      resources: { before: beforeResources, after: afterResources },
      continuousMission,
      endScreen,
      r93SimulatedProfileComparison: {
        p95TargetMs: 33.4,
        p99TargetMs: 50,
        p95WithinTarget: typeof sample.p95IntervalMs === 'number' && sample.p95IntervalMs <= 33.4,
        p99WithinTarget: typeof sample.p99IntervalMs === 'number' && sample.p99IntervalMs <= 50,
        status: `simulated ${browserEngine} with ${plain(environment.graphics).renderer ?? 'unknown WebGL backend'}; not a physical Safari result`,
      },
    };
    if (endScreen === 'playing') await writeActiveScreenshot(page, 'performance-end');
    else await writeScreenshot(page, `performance-end-${endScreen}`);
    if (continuousMission) {
      record.conclusion = `60-second rAF sample recorded for ${browserEngine}. Read P95/P99 together with the recorded browser and graphics backend.`;
    } else {
      record.status = 'interrupted';
      record.conclusion = `The 60-second rAF sample finished after the mission left active play (${endScreen}); the sample is diagnostic, not a continuous-play pass.`;
    }
  } else {
    await startMission(page);
    const durationMs = 15 * 60 * 1000;
    const samples: Snapshot[] = [];
    const missionTransitions: Snapshot[] = [];
    await writeActiveScreenshot(page, 'endurance-start');
    await startMission(page); // Complete setup warm-up and any logged Resume before the fixed 15-minute window.
    const startedAt = Date.now();
    record.enduranceWindowMission = missionIdentity(await observation(page));
    while (Date.now() - startedAt < durationMs) {
      const screen = await readScreen(page);
      if (screen === 'result') {
        const endedMission = await observation(page);
        await page.locator('#retry').click();
        await page.waitForFunction(() => document.querySelector('#app')?.getAttribute('data-screen') === 'playing', null, { timeout: 30_000 });
        const nextMission = await observation(page);
        missionTransitions.push({ elapsedMs: Date.now() - startedAt, ended: missionIdentity(endedMission), next: missionIdentity(nextMission) });
      } else if (screen === 'paused') {
        const reason = await page.locator('#pause-reason').textContent();
        record.status = 'interrupted';
        record.conclusion = `The mission entered Pause during the endurance run: ${reason ?? 'reason unavailable'}`;
        break;
      } else if (screen !== 'playing') {
        throw new Error(`The endurance run left the active mission screen (${screen}).`);
      }
      const elapsedMs = Date.now() - startedAt;
      const { snapshot: mission, resources } = await observeResources();
      samples.push({
        elapsedMs,
        ...missionIdentity(mission),
        phase: mission.phase,
        tick: mission.tick,
        resources,
        timing: plain(mission.timing),
      });
      record.observations = samples;
      record.missionTransitions = missionTransitions;
      record.elapsedMs = elapsedMs;
      writeFileSync(outputPath, JSON.stringify(record, null, 2));
      await page.waitForTimeout(Math.min(5_000, Math.max(250, durationMs - elapsedMs)));
    }
    if (record.status === 'running') {
      const finalScreen = await readScreen(page);
      if (finalScreen === 'result') {
        const endedMission = await observation(page);
        await page.locator('#retry').click();
        await page.waitForFunction(() => document.querySelector('#app')?.getAttribute('data-screen') === 'playing', null, { timeout: 30_000 });
        const nextMission = await observation(page);
        missionTransitions.push({ elapsedMs: Date.now() - startedAt, ended: missionIdentity(endedMission), next: missionIdentity(nextMission) });
      } else if (finalScreen === 'paused') {
        record.status = 'interrupted';
        record.conclusion = `The mission entered Pause at the end of the endurance interval: ${await page.locator('#pause-reason').textContent() ?? 'reason unavailable'}`;
      } else if (finalScreen !== 'playing') {
        throw new Error(`The endurance run finished outside an active or result screen (${finalScreen}).`);
      }
    }
    if (record.status === 'running') {
      record.status = Date.now() - startedAt >= durationMs ? 'completed' : 'interrupted';
      record.elapsedMs = Date.now() - startedAt;
      record.conclusion = record.status === 'completed'
        ? '15-minute wall-clock run completed with periodic live-play observations. Review resource maxima and trend.'
        : 'The endurance run ended before 15 minutes.';
    }
    record.observations = samples;
    record.missionTransitions = missionTransitions;
    const finalScreen = await readScreen(page);
    if (finalScreen === 'playing') await writeActiveScreenshot(page, 'endurance-end');
    else await writeScreenshot(page, `endurance-end-${finalScreen}`);
  }

  record.outboundAttempts = [...networkAttempts];
  if (networkAttempts.size > 0) throw new Error(`Unexpected outbound connection attempt(s): ${[...networkAttempts].join(', ')}`);
  record.finishTime = new Date().toISOString();
  record.status = record.status === 'interrupted' ? 'interrupted' : 'completed';
  writeFileSync(outputPath, JSON.stringify(record, null, 2));
  console.log(`Browser evidence saved: ${outputPath}`);
} catch (error) {
  record.status = 'failed';
  record.outboundAttempts = [...networkAttempts];
  record.finishTime = new Date().toISOString();
  record.error = error instanceof Error ? error.message : String(error);
  writeFileSync(outputPath, JSON.stringify(record, null, 2));
  throw error;
} finally {
  await browser.close();
}
