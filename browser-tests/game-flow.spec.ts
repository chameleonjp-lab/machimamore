import { test, expect, openHome, startMission, saveScreenshot, saveActiveMissionScreenshot, readRequiredObservation, settleActiveMission, pauseActiveMission } from './fixtures';

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
  const persistedLayout = await page.evaluate(() => localStorage.getItem('machimamore-controls-v1'));
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
  const saved = await page.evaluate(() => localStorage.getItem('machimamore-controls-v1'));
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
