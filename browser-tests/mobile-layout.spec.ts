import { test, expect, openHome, expectNoPageOverflow, saveScreenshot, saveActiveMissionScreenshot, startMission, settleActiveMission, waitForMissionTickAdvance, pauseActiveMission } from './fixtures';

type NativeTouchAudit = { type: string; pointerType: string | null; trusted: boolean; target: string | null };

async function nativeTouch(page: import('@playwright/test').Page, selector: string): Promise<NativeTouchAudit[]> {
  const target = page.locator(selector);
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (!box) throw new Error(`Cannot touch hidden or missing control: ${selector}`);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const hit = await page.evaluate(({ selector, x, y }) => {
    const target = document.querySelector(selector);
    const actual = document.elementFromPoint(x, y);
    return {
      inViewport: x >= 0 && y >= 0 && x < innerWidth && y < innerHeight,
      targetReached: !!target && !!actual && (actual === target || target.contains(actual)),
      actual: actual ? `${actual.tagName.toLowerCase()}#${(actual as HTMLElement).id}` : null,
    };
  }, { selector, ...point });
  expect(hit.inViewport, `${selector} touch coordinate should be inside the visible viewport`).toBe(true);
  expect(hit.targetReached, `${selector} should be the element at the native touch coordinate (actual: ${hit.actual})`).toBe(true);
  const eventOffset = await page.evaluate(() => {
    const windowWithAudit = window as Window & { __nativeTouchAudit?: NativeTouchAudit[]; __nativeTouchAuditInstalled?: boolean };
    windowWithAudit.__nativeTouchAudit ??= [];
    if (!windowWithAudit.__nativeTouchAuditInstalled) {
      for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) {
        window.addEventListener(type, event => {
          const pointer = event as PointerEvent;
          const eventTarget = event.target as HTMLElement | null;
          windowWithAudit.__nativeTouchAudit!.push({
            type,
            pointerType: pointer.pointerType ?? null,
            trusted: event.isTrusted,
            target: eventTarget?.id || eventTarget?.tagName.toLowerCase() || null,
          });
        }, true);
      }
      windowWithAudit.__nativeTouchAuditInstalled = true;
    }
    return windowWithAudit.__nativeTouchAudit.length;
  });
  await page.touchscreen.tap(point.x, point.y);
  const pointerEvents = await page.evaluate(offset => (window as Window & { __nativeTouchAudit?: NativeTouchAudit[] }).__nativeTouchAudit?.slice(offset) ?? [], eventOffset);
  expect(pointerEvents.some(event => event.type === 'pointerdown' && event.pointerType === 'touch' && event.trusted), `${selector} should receive a trusted touch pointerdown`).toBe(true);
  return pointerEvents;
}

const viewports = [
  { width: 320, height: 568, name: 'portrait-small' },
  { width: 393, height: 852, name: 'portrait-large' },
  { width: 568, height: 320, name: 'landscape-small' },
  { width: 852, height: 393, name: 'landscape-large' },
  { width: 1366, height: 768, name: 'desktop' },
] as const;

test('home layout fits the five supported viewport profiles', async ({ page }, testInfo) => {
  // Five complete UI start/pause/home journeys plus active screenshots are a
  // deliberate multi-profile check and need a larger bounded budget.
  test.setTimeout(120_000);
  await openHome(page);
  const nativeTouchEvidence: Array<{ selector: string; pointerEvents: NativeTouchAudit[] }> = [];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoPageOverflow(page);
    await expect(page.locator('#start')).toBeVisible();
    await expect(page.locator('#home-controls')).toBeVisible();
    if (viewport.name === 'portrait-small') {
      const firstScreen = await page.evaluate(() => {
        const selectors = ['#title', '.intro', '.mission-data', '.mode-picker', '#start'];
        return selectors.map(selector => {
          const rect = document.querySelector(selector)!.getBoundingClientRect();
          return { selector, top: rect.top, bottom: rect.bottom, height: document.documentElement.clientHeight };
        });
      });
      for (const bounds of firstScreen) {
        expect(bounds.top, `${bounds.selector} starts in the 320×568 first viewport`).toBeGreaterThanOrEqual(0);
        expect(bounds.bottom, `${bounds.selector} is fully visible in the 320×568 first viewport`).toBeLessThanOrEqual(bounds.height);
      }
    }
    const sizes = await page.locator('#start, #home-rules, #home-controls, #home-sound').evaluateAll(elements =>
      elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { id: (element as HTMLElement).id, width: rect.width, height: rect.height };
      }),
    );
    for (const target of sizes) {
      expect(target.width, `${target.id} width at ${viewport.name}`).toBeGreaterThanOrEqual(44);
      expect(target.height, `${target.id} height at ${viewport.name}`).toBeGreaterThanOrEqual(44);
    }
    await saveScreenshot(page, testInfo, `home-${viewport.name}`);

    nativeTouchEvidence.push({ selector: '.mode-picker label:nth-of-type(2)', pointerEvents: await nativeTouch(page, '.mode-picker label:nth-of-type(2)') });
    await expect(page.getByRole('radio', { name: 'ノーマル' })).toBeChecked();
    nativeTouchEvidence.push({ selector: '#start', pointerEvents: await nativeTouch(page, '#start') });
    await settleActiveMission(page, testInfo);
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#timer')).toBeVisible();
    await expect(page.locator('#game-sound')).toBeVisible();
    await expect(page.locator('#pause')).toBeVisible();
    await expect(page.locator('#enemy-total')).toContainText('出撃8');
    await expect(page.locator('#allies-total')).toContainText('出撃8');
    await expectNoPageOverflow(page);
    const flightBounds = await page.evaluate(() => ['#timer', '#game-sound', '#pause', '.mission-hud', '.flight-data'].map(selector => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return { selector, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight };
    }));
    for (const bounds of flightBounds) {
      expect(bounds.left, `${bounds.selector} begins within ${viewport.name}`).toBeGreaterThanOrEqual(0);
      expect(bounds.top, `${bounds.selector} begins within ${viewport.name}`).toBeGreaterThanOrEqual(0);
      expect(bounds.right, `${bounds.selector} ends within ${viewport.name}`).toBeLessThanOrEqual(bounds.width + 1);
      expect(bounds.bottom, `${bounds.selector} ends within ${viewport.name}`).toBeLessThanOrEqual(bounds.height + 1);
    }
    const hudLayout = await page.evaluate(() => {
      // Keep the parent bounds for viewport containment; its empty grid gap is
      // not a visible card and must not block the projected aircraft regions.
      const selectors = ['.mission-hud', '.flight-data', '.city-warning'];
      const boxes = selectors.map(selector => {
        const element = document.querySelector<HTMLElement>(selector)!;
        const rect = element.getBoundingClientRect();
        return { selector, visible: !element.hidden && rect.width > 0 && rect.height > 0, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      });
      const overlaps = (a: { visible: boolean; left: number; top: number; right: number; bottom: number }, b: { visible: boolean; left: number; top: number; right: number; bottom: number }) => a.visible && b.visible
        && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const panel = boxes.find(box => box.selector === '.flight-data')!;
      const cityWarning = boxes.find(box => box.selector === '.city-warning')!;
      const controls = ['#loop', '#fire', '#throttle'].map(selector => {
        const element = document.querySelector<HTMLElement>(selector)!;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { selector, visible: !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
          left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      });
      // The scene draws the Normal reticle along the player's projected
      // forward vector (about .363H in the initial straight pose); Easy draws
      // its aim circle around the viewport center. Keep DOM cards/notices clear.
      const mode = document.querySelector('#app')?.getAttribute('data-mode') ?? 'normal';
      const centerX = innerWidth / 2;
      const centerY = mode === 'easy' ? innerHeight / 2 : innerHeight * .363;
      const reticleRadius = mode === 'easy' ? Math.min(innerWidth, innerHeight) * .135 + 2 : 18;
      const reticleZone = { left: centerX - reticleRadius, right: centerX + reticleRadius, top: centerY - reticleRadius, bottom: centerY + reticleRadius };
      // The fixed-FOV camera makes the player's projected width scale with
      // viewport height; include a small margin around the measured model band.
      const halfBodyWidth = innerHeight * .17;
      const bodyZone = mode === 'easy'
        ? { left: centerX - halfBodyWidth, right: centerX + halfBodyWidth, top: innerHeight * .74, bottom: innerHeight * .86 }
        : { left: centerX - halfBodyWidth, right: centerX + halfBodyWidth, top: innerHeight * .59, bottom: innerHeight * .70 };
      const overlaySelectors = ['.mission-hud .tally', '.flight-data', '#city-warning', '#warning', '#reload-status', '#player-wait', '#ally-announcements', '#announcement', '.time-block', '.hud-actions'];
      const overlays = overlaySelectors.flatMap(selector => Array.from(document.querySelectorAll<HTMLElement>(selector)).map((element, index) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { selector: `${selector}[${index}]`, visible: !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0,
          left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      }));
      const hudCards = overlays.filter(overlay => overlay.selector.startsWith('.mission-hud .tally'));
      const intersects = (zone: typeof reticleZone, overlay: typeof overlays[number]) => overlay.visible
        && zone.left < overlay.right && overlay.left < zone.right && zone.top < overlay.bottom && overlay.top < zone.bottom;
      return {
        boxes,
        overlaps: [
          ...hudCards.flatMap(card => [panel, cityWarning].filter(block => overlaps(card, block)).map(block => ({ first: card.selector, second: block.selector }))),
          ...(overlaps(cityWarning, panel) ? [{ first: cityWarning.selector, second: panel.selector }] : []),
        ],
        lowerPanelClearOfControls: controls.filter(control => control.visible && panel.left < control.right && control.left < panel.right && panel.top < control.bottom && control.top < panel.bottom),
        inputPresentation: document.querySelector('#app')?.getAttribute('data-input') ?? null,
        controls,
        undersizedControls: controls.filter(control => control.visible && (control.width < 44 || control.height < 44)),
        reticleZone,
        reticleObstructions: overlays.filter(overlay => intersects(reticleZone, overlay)),
        playerBodyZone: bodyZone,
        playerBodyObstructions: overlays.filter(overlay => intersects(bodyZone, overlay)),
        overlays,
      };
    });
    await testInfo.attach(`flight-hud-layout-${viewport.name}`, { body: JSON.stringify({ ...hudLayout, nativeTouchEvidence }, null, 2), contentType: 'application/json' });
    expect(hudLayout.overlaps, `Flight information blocks should not cover each other at ${viewport.name}: ${JSON.stringify(hudLayout.boxes)}`).toEqual([]);
    expect(hudLayout.lowerPanelClearOfControls, `Lower flight panel should not cover touch controls at ${viewport.name}`).toEqual([]);
    expect(hudLayout.inputPresentation, `Touch presentation should be active after native touch at ${viewport.name}`).toBe('touch');
    expect(hudLayout.controls.filter(control => control.visible), `Normal touch controls should be visible at ${viewport.name}`).toHaveLength(3);
    expect(hudLayout.undersizedControls, `Visible flight controls should remain at least 44×44 CSS pixels at ${viewport.name}`).toEqual([]);
    expect(hudLayout.reticleObstructions, `HUD cards/notices should leave the projected reticle clear at ${viewport.name}`).toEqual([]);
    expect(hudLayout.playerBodyObstructions, `HUD cards/notices should leave the player aircraft clear at ${viewport.name}`).toEqual([]);
    await saveActiveMissionScreenshot(page, testInfo, `flight-normal-${viewport.name}`);
    await pauseActiveMission(page, testInfo);
    await expect(page.locator('#resume')).toBeVisible();
    await page.locator('#pause-home').click();
    await expect(page.locator('#app')).toHaveAttribute('data-screen', 'home');
  }
});

test.describe('touch-first Easy aircraft clearance', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 320, height: 568 } });

  test('Easy aircraft and lower instruments remain visible in compact portrait and landscape', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    for (const viewport of [
      { width: 320, height: 568, name: 'portrait-small' },
      { width: 568, height: 320, name: 'landscape-small' },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openHome(page);
      await expect(page.locator('#app')).toHaveAttribute('data-mode', 'easy');
      const nativeStartTouch = await nativeTouch(page, '#start');
      await settleActiveMission(page, testInfo);
      await expect(page.locator('#app')).toHaveAttribute('data-mode', 'easy');
      await expect(page.locator('#app')).toHaveAttribute('data-input', 'touch');
      await expectNoPageOverflow(page);
      const layout = await page.evaluate(() => {
        const panelRect = document.querySelector<HTMLElement>('.flight-data')!.getBoundingClientRect();
        const loopRect = document.querySelector<HTMLElement>('#loop')!.getBoundingClientRect();
        const centerX = innerWidth / 2;
        const centerY = innerHeight / 2;
        const radius = Math.min(innerWidth, innerHeight) * .135 + 2;
        const reticleZone = { left: centerX - radius, top: centerY - radius, right: centerX + radius, bottom: centerY + radius };
        // The fixed-FOV camera makes the player's projected width scale with
        // viewport height; include a small margin around the measured model band.
        const halfBodyWidth = innerHeight * .17;
        const playerBodyZone = { left: centerX - halfBodyWidth, top: innerHeight * .74, right: centerX + halfBodyWidth, bottom: innerHeight * .86 };
        const overlaySelectors = ['.mission-hud .tally', '.flight-data', '#city-warning', '#warning', '#reload-status', '#player-wait', '#ally-announcements', '#announcement', '.time-block', '.hud-actions'];
        const overlays = overlaySelectors.flatMap(selector => Array.from(document.querySelectorAll<HTMLElement>(selector)).map((element, index) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return { selector: `${selector}[${index}]`, visible: !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0,
            left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
        }));
        const intersects = (zone: typeof reticleZone, overlay: typeof overlays[number]) => overlay.visible
          && zone.left < overlay.right && overlay.left < zone.right && zone.top < overlay.bottom && overlay.top < zone.bottom;
        const contentOverlaps = overlays.flatMap((first, index) => overlays.slice(index + 1)
          .filter(second => first.visible && second.visible && first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom)
          .map(second => ({ first: first.selector, second: second.selector })));
        const outOfViewport = overlays.filter(overlay => overlay.visible
          && (overlay.left < 0 || overlay.top < 0 || overlay.right > innerWidth + 1 || overlay.bottom > innerHeight + 1));
        const hudParent = document.querySelector<HTMLElement>('.mission-hud')!.getBoundingClientRect();
        const hudParentWithinViewport = hudParent.left >= 0 && hudParent.top >= 0 && hudParent.right <= innerWidth + 1 && hudParent.bottom <= innerHeight + 1;
        return {
          viewport: { width: innerWidth, height: innerHeight },
          panel: { left: panelRect.left, top: panelRect.top, right: panelRect.right, bottom: panelRect.bottom },
          hudParent: { left: hudParent.left, top: hudParent.top, right: hudParent.right, bottom: hudParent.bottom },
          hudParentWithinViewport,
          contentOverlaps,
          outOfViewport,
          reticleZone,
          reticleObstructions: overlays.filter(overlay => intersects(reticleZone, overlay)),
          playerBodyZone,
          playerBodyObstructions: overlays.filter(overlay => intersects(playerBodyZone, overlay)),
          loop: { left: loopRect.left, top: loopRect.top, right: loopRect.right, bottom: loopRect.bottom, width: loopRect.width, height: loopRect.height,
            visible: getComputedStyle(document.querySelector<HTMLElement>('#loop')!).display !== 'none' },
          panelOverlapsLoop: panelRect.left < loopRect.right && loopRect.left < panelRect.right && panelRect.top < loopRect.bottom && loopRect.top < panelRect.bottom,
          overlays,
        };
      });
      await testInfo.attach(`easy-flight-layout-${viewport.name}`, { body: JSON.stringify({ ...layout, nativeTouchEvidence: nativeStartTouch }, null, 2), contentType: 'application/json' });
      expect(layout.reticleObstructions, `HUD cards/notices should leave the Easy aim circle clear at ${viewport.name}`).toEqual([]);
      expect(layout.playerBodyObstructions, `HUD cards/notices should leave the Easy aircraft clear at ${viewport.name}`).toEqual([]);
      expect(layout.contentOverlaps, `Visible Easy flight facts, status and warnings should not overlap at ${viewport.name}`).toEqual([]);
      expect(layout.outOfViewport, `Visible Easy HUD blocks should stay within ${viewport.name}`).toEqual([]);
      expect(layout.hudParentWithinViewport, `The Easy mission HUD bounds should stay within ${viewport.name}`).toBe(true);
      expect(layout.loop.visible).toBe(true);
      expect(layout.loop.width, `Easy loop control should remain at least 44 CSS pixels wide at ${viewport.name}`).toBeGreaterThanOrEqual(44);
      expect(layout.loop.height, `Easy loop control should remain at least 44 CSS pixels high at ${viewport.name}`).toBeGreaterThanOrEqual(44);
      expect(layout.panelOverlapsLoop, `Easy lower panel should not cover the loop control at ${viewport.name}`).toBe(false);
      await saveActiveMissionScreenshot(page, testInfo, `flight-easy-${viewport.name}`);
      await pauseActiveMission(page, testInfo);
      await page.locator('#pause-home').click();
      await expect(page.locator('#app')).toHaveAttribute('data-screen', 'home');
    }
  });
});

test('settings remain reachable at 200% text scale with safe-area insets and scroll', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openHome(page);
  await page.addStyleTag({ content: `
    :root { font-size: 200% !important; --safe-top: 30px; --safe-right: 20px; --safe-bottom: 30px; --safe-left: 20px; }
  ` });
  await page.locator('#home-controls').click();
  const dialog = page.locator('#control-settings');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#control-close')).toBeVisible();
  await expect(page.locator('#control-save')).toBeVisible();
  const dialogButtons = await page.locator('#control-close, #control-save').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { id: (element as HTMLElement).id, top: rect.top, bottom: rect.bottom, viewportHeight: window.innerHeight };
  }));
  for (const button of dialogButtons) {
    expect(button.top, `${button.id} begins within the 200% viewport`).toBeGreaterThanOrEqual(0);
    expect(button.bottom, `${button.id} remains within the 200% viewport`).toBeLessThanOrEqual(button.viewportHeight);
  }
  const scrollRegion = page.locator('.settings-main');
  const before = await scrollRegion.evaluate(element => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(before.clientHeight).toBeGreaterThan(0);
  if (before.scrollHeight > before.clientHeight) {
    await scrollRegion.evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await scrollRegion.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  }
  await expectNoPageOverflow(page);
  await saveScreenshot(page, testInfo, 'settings-200-percent-safe-area-320x568');
});

test('keyboard focus is visible and a modal traps Tab until Escape returns focus', async ({ page }) => {
  await openHome(page);
  await page.keyboard.press('Tab');
  for (let i = 0; i < 10 && !(await page.locator('#start').evaluate(element => element === document.activeElement)); i += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(page.locator('#start')).toBeFocused();
  const focusStyle = await page.locator('#start').evaluate(element => {
    const style = getComputedStyle(element);
    return { visible: element.matches(':focus-visible'), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.visible).toBe(true);
  expect(focusStyle.outlineStyle).not.toBe('none');
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0);

  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  const dialog = page.locator('#control-settings');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#control-close')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#control-save')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#home-controls')).toBeFocused();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'home');
});

test('reduced-motion preference leaves flight timing and essential controls usable', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 393, height: 852 });
  await openHome(page);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await page.getByRole('radio', { name: 'ノーマル' }).check();
  await saveScreenshot(page, testInfo, 'reduced-motion-home-393x852');
  await startMission(page, testInfo);
  await waitForMissionTickAdvance(page, 6, testInfo);
  await pauseActiveMission(page, testInfo);
  await expect(page.locator('#resume')).toBeVisible();
});
