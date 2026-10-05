import { test, expect, openHome, readRequiredObservation, saveScreenshot, saveActiveMissionScreenshot, settleActiveMission, startMission, pauseActiveMission } from './fixtures';

type RenderMetrics = {
  aircraft: number;
  activeLasers: number;
  projectiles: number;
  decorations: number;
  drawCalls: number;
  geometries: number;
  textures: number;
  programs: number;
};
type AudioMetrics = { enabled: boolean; contextCount: number; activeSources: number; activeEffectSources: number };
type GpuCounts = Pick<RenderMetrics, 'geometries' | 'textures' | 'programs'>;

function metrics(snapshot: Record<string, unknown>): { render: RenderMetrics; audio: AudioMetrics } {
  const render = snapshot.render as RenderMetrics | null;
  const audio = snapshot.audio as AudioMetrics | null;
  expect(render, 'Three.js scene should expose actual runtime metrics').not.toBeNull();
  expect(audio, 'Audio manager should expose runtime source counts').not.toBeNull();
  return { render: render!, audio: audio! };
}

function assertBounds(snapshot: Record<string, unknown>): { render: RenderMetrics; audio: AudioMetrics } {
  const value = metrics(snapshot);
  const { render, audio } = value;
  expect(render.aircraft).toBeLessThanOrEqual(16);
  expect(render.activeLasers).toBeLessThanOrEqual(40);
  expect(render.projectiles).toBeLessThanOrEqual(2048);
  expect(render.decorations).toBeLessThanOrEqual(24);
  expect(audio.contextCount).toBeLessThanOrEqual(1);
  expect(audio.activeSources).toBeLessThanOrEqual(10);
  expect(audio.activeEffectSources).toBeLessThanOrEqual(9);
  expect(render.geometries).toBeGreaterThan(0);
  expect(render.textures).toBeGreaterThan(0);
  expect(render.programs).toBeGreaterThan(0);
  return value;
}

test('normal 8-vs-8 play with sound on remains within runtime resource limits across ten relaunches', async ({ page }, testInfo) => {
  // The same page must retain renderer resources through the 12s live sample
  // and ten normal UI Start→Home cycles, so this bounded aggregate gets 180s.
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 393, height: 852 });
  await openHome(page);
  await page.getByRole('radio', { name: 'ノーマル' }).check();
  await page.locator('#home-sound').click();
  await expect(page.locator('#home-sound')).toHaveAttribute('aria-pressed', 'true');
  const coldHome = metrics(await readRequiredObservation(page)).render;
  await startMission(page, testInfo);

  const activeMax = { aircraft: 0, lasers: 0, projectiles: 0, decorations: 0, audioSources: 0 };
  const loopUntil = Date.now() + 12_000;
  let observedProjectile = false;
  await page.keyboard.down('Space');
  while (Date.now() < loopUntil) {
    const currentScreen = await page.locator('#app').getAttribute('data-screen');
    if (currentScreen === 'paused') {
      await settleActiveMission(page, testInfo);
      continue;
    }
    if (currentScreen === 'result') {
      await page.locator('#retry').click();
      await settleActiveMission(page, testInfo);
      continue;
    }
    expect(currentScreen).toBe('playing');
    const state = await readRequiredObservation(page);
    const value = assertBounds(state);
    expect(value.audio.enabled).toBe(true);
    activeMax.aircraft = Math.max(activeMax.aircraft, value.render.aircraft);
    activeMax.lasers = Math.max(activeMax.lasers, value.render.activeLasers);
    activeMax.projectiles = Math.max(activeMax.projectiles, value.render.projectiles);
    activeMax.decorations = Math.max(activeMax.decorations, value.render.decorations);
    activeMax.audioSources = Math.max(activeMax.audioSources, value.audio.activeSources);
    observedProjectile ||= value.render.projectiles > 0;
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('Space');
  expect(activeMax.aircraft).toBe(16);
  expect(observedProjectile, 'A held Space action should produce at least one live projectile during Normal play').toBe(true);
  const postSampleScreen = await page.locator('#app').getAttribute('data-screen');
  if (postSampleScreen === 'paused') await settleActiveMission(page, testInfo);
  else if (postSampleScreen === 'result') {
    await page.locator('#retry').click();
    await settleActiveMission(page, testInfo);
  }
  await saveActiveMissionScreenshot(page, testInfo, 'resource-check-active-normal');

  let beforeWarmHome = await page.locator('#app').getAttribute('data-screen');
  if (beforeWarmHome === 'paused') {
    await settleActiveMission(page, testInfo);
    beforeWarmHome = await page.locator('#app').getAttribute('data-screen');
  }
  if (beforeWarmHome === 'result') await page.locator('#result-home').click();
  else {
    if (beforeWarmHome === 'playing') await pauseActiveMission(page, testInfo);
    await page.locator('#pause-home').click();
  }
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'home');
  const warmSnapshot = await readRequiredObservation(page);
  const warmHome = assertBounds(warmSnapshot);
  expect(warmHome.audio.activeSources).toBe(0);
  let previousId = warmSnapshot.missionId;
  const relaunchIds = new Set<unknown>();
  const warmBaseline: GpuCounts = {
    geometries: warmHome.render.geometries,
    textures: warmHome.render.textures,
    programs: warmHome.render.programs,
  };
  const homeRenderCounts: Array<GpuCounts> = [];

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await startMission(page, testInfo);
    const restarted = await readRequiredObservation(page);
    expect(restarted.missionId).not.toBe(previousId);
    previousId = restarted.missionId;
    relaunchIds.add(previousId);
    const relaunched = assertBounds(restarted);
    expect(relaunched.render.aircraft).toBe(16);
    expect(relaunched.audio.enabled).toBe(true);
    await page.waitForTimeout(100);

    let currentScreen = await page.locator('#app').getAttribute('data-screen');
    if (currentScreen === 'paused') {
      await settleActiveMission(page, testInfo);
      currentScreen = await page.locator('#app').getAttribute('data-screen');
    }
    if (currentScreen === 'result') await page.locator('#result-home').click();
    else {
      if (currentScreen === 'playing') await pauseActiveMission(page, testInfo);
      await page.locator('#pause-home').click();
    }
    await expect(page.locator('#app')).toHaveAttribute('data-screen', 'home');
    const homeMetrics = assertBounds(await readRequiredObservation(page));
    expect(homeMetrics.audio.activeSources).toBe(0);
    homeRenderCounts.push({ geometries: homeMetrics.render.geometries, textures: homeMetrics.render.textures, programs: homeMetrics.render.programs });
  }

  expect(relaunchIds.size).toBe(10);
  for (const counts of homeRenderCounts) {
    expect(counts.geometries).toBe(warmBaseline.geometries);
    expect(counts.textures).toBe(warmBaseline.textures);
    expect(counts.programs).toBe(warmBaseline.programs);
  }
  await testInfo.attach('renderer-home-resource-counts', { body: JSON.stringify({ coldHome, warmBaseline, homeRenderCounts, activeMax, relaunchIds: [...relaunchIds] }, null, 2), contentType: 'application/json' });
  await saveScreenshot(page, testInfo, 'resource-check-home-after-ten-relaunches');
});
