import { test, expect, openHome, startMission, saveScreenshot, saveActiveMissionScreenshot, readRequiredObservation, settleActiveMission, pauseActiveMission } from './fixtures';
import { Quaternion, Vector3 } from 'three';
import { FLIGHT_FOV, getFlightCameraPose } from '../src/flight-view';

// Override project-level failure captures for this short CI-only probe.
const cameraContractTest = test.extend({ screenshot: 'off', trace: 'off', video: 'off' });

type CameraSample = {
  calls: number;
  tick: number;
  mode: 'easy' | 'normal';
  alpha: number;
  camera: { position: number[]; quaternion: number[]; fov: number; aspect: number };
  player: { previous: number[]; position: number[]; quaternion: number[]; pitch: number; yaw: number; bank: number; speed: number };
  visualQuaternion: number[];
};

async function installPassiveCameraProbe(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    const sceneModuleUrl = '/src/scene.ts';
    const { MachiMamoreScene } = await import(sceneModuleUrl);
    const prototype: any = MachiMamoreScene.prototype;
    if (prototype.__cameraContractOriginalRender) throw new Error('camera contract probe already installed');
    const originalRender = prototype.render;
    const probe = { calls: 0, samples: [] as any[] };
    (window as any).__machimamoreCameraContract = probe;
    prototype.__cameraContractOriginalRender = originalRender;
    prototype.render = function (state: any, flight: boolean, alpha = 1, resultAnimationTime = 0, events: any[] = []) {
      const result = originalRender.call(this, state, flight, alpha, resultAnimationTime, events);
      probe.calls += 1;
      const player = state.fighters.find((fighter: any) => fighter.id === state.playerId);
      // Keep sample overhead small and bounded; this is a transform check, not
      // a frame-time measurement.
      if (flight && state.phase === 'playing' && player && probe.calls % 3 === 0) {
        if (probe.samples.length === 16) probe.samples.shift();
        probe.samples.push({
          calls: probe.calls, tick: state.tick, mode: state.mode, alpha,
          camera: { position: this.camera.position.toArray(), quaternion: this.camera.quaternion.toArray(), fov: this.camera.fov, aspect: this.camera.aspect },
          player: { previous: player.previous.toArray(), position: player.position.toArray(), quaternion: player.quaternion.toArray(), pitch: player.pitch, yaw: player.yaw, bank: player.bank, speed: player.speed },
          visualQuaternion: this['planes'].find((plane: any) => plane.root.visible)?.root.quaternion.toArray() ?? [],
        });
      }
      return result;
    };
  });
}

async function restorePassiveCameraProbe(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    const sceneModuleUrl = '/src/scene.ts';
    const { MachiMamoreScene } = await import(sceneModuleUrl);
    const prototype: any = MachiMamoreScene.prototype;
    if (prototype.__cameraContractOriginalRender) {
      prototype.render = prototype.__cameraContractOriginalRender;
      delete prototype.__cameraContractOriginalRender;
    }
    delete (window as any).__machimamoreCameraContract;
  });
}

async function latestCameraSample(page: import('@playwright/test').Page): Promise<CameraSample> {
  const sample = await page.evaluate(() => {
    const probe = (window as any).__machimamoreCameraContract;
    return probe?.samples.at(-1) ?? null;
  });
  expect(sample, 'The real scene renderer should provide a bounded camera sample').not.toBeNull();
  return sample!;
}

cameraContractTest('[camera-contract] real render camera matches the live pose and horizontal input retains pitch', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let probeInstalled = false;
  try {
    await openHome(page);
    await page.getByRole('radio', { name: 'ノーマル' }).check();
    await installPassiveCameraProbe(page);
    probeInstalled = true;
    // Omitting testInfo intentionally suppresses setup recovery JSON attachments
    // for this focused contract run; the regular gameplay suite keeps them.
    await startMission(page);
    await page.waitForFunction(() => (window as any).__machimamoreCameraContract?.samples.some((sample: any) => sample.tick >= 30));

    const initial = await latestCameraSample(page);
    expect(initial.mode).toBe('normal');
    expectCameraMatchesRenderedPose(initial);

    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction((pitch: number) => {
      const sample = (window as any).__machimamoreCameraContract?.samples.at(-1);
      return sample && sample.player.pitch > pitch + 0.02;
    }, initial.player.pitch);
    const climbed = await latestCameraSample(page);
    expect(climbed.player.pitch).toBeGreaterThan(initial.player.pitch + 0.02);
    expectCameraMatchesRenderedPose(climbed);

    await page.keyboard.up('ArrowUp');
    // Capture the barrier only after keyup dispatch completes, so a render that
    // raced between a pre-keyup read and the key event cannot satisfy it.
    const afterReleaseDispatch = await latestCameraSample(page);
    await page.waitForFunction(({ calls, tick }: { calls: number; tick: number }) => {
      const sample = (window as any).__machimamoreCameraContract?.samples.at(-1);
      return sample && sample.calls > calls && sample.tick > tick;
    }, { calls: afterReleaseDispatch.calls, tick: afterReleaseDispatch.tick });
    const releasedVertical = await latestCameraSample(page);
    await page.waitForFunction((tick: number) => {
      const sample = (window as any).__machimamoreCameraContract?.samples.at(-1);
      return sample && sample.tick >= tick + 6;
    }, releasedVertical.tick);
    const horizontalOnly = await latestCameraSample(page);
    expect(Math.abs(horizontalOnly.player.pitch - releasedVertical.player.pitch)).toBeLessThan(1e-9);
    expectCameraMatchesRenderedPose(horizontalOnly);
    expect(errors).toEqual([]);
  } finally {
    await page.keyboard.up('ArrowUp').catch(() => {});
    await page.keyboard.up('ArrowRight').catch(() => {});
    if (probeInstalled) await restorePassiveCameraProbe(page);
  }
});

function expectCameraMatchesRenderedPose(sample: CameraSample): void {
  const player: any = {
    previous: new Vector3().fromArray(sample.player.previous),
    position: new Vector3().lerpVectors(new Vector3().fromArray(sample.player.previous), new Vector3().fromArray(sample.player.position), sample.alpha),
    quaternion: new Quaternion().fromArray(sample.player.quaternion),
    bank: sample.player.bank,
  };
  const position = new Vector3(), quaternion = new Quaternion();
  getFlightCameraPose(player, sample.mode, position, quaternion);
  const actualPosition = new Vector3().fromArray(sample.camera.position);
  const actualQuaternion = new Quaternion().fromArray(sample.camera.quaternion);
  const visualQuaternion = new Quaternion().fromArray(sample.visualQuaternion);
  const maxQuaternionComponentDelta = (left: Quaternion, right: Quaternion) => {
    const a = left.toArray(), b = right.toArray();
    const direct = Math.max(...a.map((value, i) => Math.abs(value - b[i]!)));
    const opposite = Math.max(...a.map((value, i) => Math.abs(value + b[i]!)));
    return Math.min(direct, opposite);
  };
  expect(actualPosition.distanceTo(position)).toBeLessThan(1e-6);
  expect(maxQuaternionComponentDelta(actualQuaternion, quaternion)).toBeLessThan(1e-8);
  expect(maxQuaternionComponentDelta(visualQuaternion, new Quaternion().fromArray(sample.player.quaternion))).toBeLessThan(1e-8);
  expect(sample.camera.fov).toBe(FLIGHT_FOV);
}

test('Home → Start → Pause → Rules/Settings → Resume → fresh mission', async ({ page }, testInfo) => {
  // This complete interaction covers two mission starts plus pause, dialogs,
  // settings persistence, and recovery; keep the 20s active-play setup gate
  // unchanged while allowing the whole journey a bounded aggregate budget.
  test.setTimeout(120_000);
  await openHome(page);
  await expect(page.getByRole('heading', { name: 'マチマモレ' })).toBeVisible();
  await expect(page.getByText('街を守りUFO50機を撃破。')).toBeVisible();
  await expect(page.locator('#home-sound')).toHaveAttribute('aria-pressed', 'false');
  await saveScreenshot(page, testInfo, 'home-393x852');

  await page.getByRole('radio', { name: 'ノーマル' }).check();
  await startMission(page, testInfo);
  await expect(page.locator('#enemy-total')).toContainText('出撃8');
  await expect(page.locator('#allies-total')).toContainText('出撃8');
  await saveActiveMissionScreenshot(page, testInfo, 'mission-393x852');

  await pauseActiveMission(page, testInfo);
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  const stopped = await readRequiredObservation(page);
  const stoppedTick = stopped.tick;
  await page.locator('#pause-rules').click();
  await expect(page.locator('#rules-guide')).toBeVisible();
  await saveScreenshot(page, testInfo, 'rules-paused-393x852');
  await page.locator('#rules-close').click();
  await expect(page.locator('#pause-screen')).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');

  await page.locator('#pause-controls').click();
  const settings = page.locator('#control-settings');
  await expect(settings).toBeVisible();
  await page.locator('#control-editor-touch').click();
  await saveScreenshot(page, testInfo, 'settings-portrait-393x852');
  const size = page.locator('#control-size');
  const originalSize = await size.inputValue();
  await size.focus();
  await size.press('ArrowRight');
  const canceledSize = await size.inputValue();
  expect(canceledSize).not.toBe(originalSize);
  await page.locator('#control-cancel').click();
  await expect(settings).toBeHidden();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');

  await page.locator('#pause-controls').click();
  await expect(settings).toBeVisible();
  await page.locator('#control-editor-touch').click();
  await expect(size).toHaveValue(originalSize);
  await size.focus();
  await size.press('ArrowRight');
  const savedSize = await size.inputValue();
  await page.locator('#control-save').click();
  await expect(settings).toBeHidden();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  const persistedLayout = await page.evaluate(() => localStorage.getItem('machimamore-controls-v2'));
  expect(persistedLayout).not.toBeNull();
  expect(JSON.parse(persistedLayout!).controls.fire.size).toBe(Number(savedSize));

  expect((await readRequiredObservation(page)).tick).toBe(stoppedTick);

  await page.locator('#resume').click();
  await settleActiveMission(page, testInfo);
  await pauseActiveMission(page, testInfo);
  await page.locator('#pause-home').click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'home');
  await expect(page.locator('#start')).toBeEnabled();
  await startMission(page, testInfo);
  const restarted = await readRequiredObservation(page);
  expect(restarted.missionId).not.toBe(stopped.missionId);
});

test('settings are saved only by an explicit action and survive reload', async ({ page }) => {
  await openHome(page);
  await page.getByRole('radio', { name: 'ノーマル' }).check();
  await page.locator('#home-controls').click();
  const settings = page.locator('#control-settings');
  await expect(settings).toBeVisible();
  await page.locator('#control-editor-touch').click();

  const original = await page.locator('#control-size').inputValue();
  await page.locator('#control-size').focus();
  await page.locator('#control-size').press('ArrowRight');
  const draft = await page.locator('#control-size').inputValue();
  expect(draft).not.toBe(original);
  await page.locator('#control-close').click();
  await expect(settings).toBeHidden();
  await page.locator('#home-controls').click();
  await page.locator('#control-editor-touch').click();
  await expect(page.locator('#control-size')).toHaveValue(original);

  await page.locator('#control-size').focus();
  await page.locator('#control-size').press('ArrowRight');
  await expect(page.locator('#control-size')).toHaveValue(draft);
  await page.locator('#control-save').click();
  const saved = await page.evaluate(() => localStorage.getItem('machimamore-controls-v2'));
  expect(saved).not.toBeNull();
  expect(JSON.parse(saved!).controls.fire.size).toBe(Number(draft));

  await page.reload();
  await expect(page.locator('#start')).toBeEnabled({ timeout: 30_000 });
  await page.getByRole('radio', { name: 'ノーマル' }).check();
  await page.locator('#home-controls').click();
  await page.locator('#control-editor-touch').click();
  await expect(page.locator('#control-size')).toHaveValue(draft);
});

test('storage refusal offers a deliberate session-only action and leaves saved data alone', async ({ page }) => {
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('machimamore-')) throw new DOMException('storage disabled', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    };
  });
  await openHome(page);
  await page.getByRole('radio', { name: 'ノーマル' }).check();
  await page.evaluate(() => localStorage.setItem('other-game-preserve', 'unchanged'));
  await page.locator('#home-controls').click();
  await expect(page.locator('#control-settings')).toBeVisible();
  await page.locator('#control-editor-touch').click();
  const original = await page.locator('#control-size').inputValue();
  await page.locator('#control-size').focus();
  await page.locator('#control-size').press('ArrowRight');
  const draft = await page.locator('#control-size').inputValue();
  expect(draft).not.toBe(original);

  await page.locator('#control-save').click();
  await expect(page.locator('#control-save')).toHaveText('今回だけ使う');
  await expect(page.locator('#control-settings')).toBeVisible();
  await expect(page.locator('#control-size')).toHaveValue(draft);
  await page.locator('#control-save').click();
  await expect(page.locator('#control-settings')).toBeHidden();
  const stored = await page.evaluate(() => ({
    other: localStorage.getItem('other-game-preserve'),
    app: Object.keys(localStorage).filter(key => key.startsWith('machimamore-')),
  }));
  expect(stored.other).toBe('unchanged');
  expect(stored.app).toEqual([]);
  await page.locator('#home-controls').click();
  await page.locator('#control-editor-touch').click();
  // The explicit temporary-use action applies to this page session, including a reopened editor.
  await expect(page.locator('#control-size')).toHaveValue(draft);
});
