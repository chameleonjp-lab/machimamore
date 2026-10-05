import { test, expect, openHome, readRequiredObservation, settleActiveMission, startMission, pauseActiveMission } from './fixtures';

test('IME composition, shortcut modifiers, and keyboard capture use the settings dialog', async ({ page }) => {
  await openHome(page);
  await page.locator('#home-controls').click();
  await expect(page.locator('#control-settings')).toBeVisible();
  await page.locator('#control-editor-keyboard').click();

  const loopBinding = page.locator('[data-key-action="loop"]');
  await loopBinding.click();
  await expect(page.locator('#keyboard-capture-note')).toContainText('キーを押してください');
  await page.evaluate(() => {
    const target = document.activeElement;
    target?.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'あ' }));
    target?.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: 'あ' }));
    target?.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, key: 'a', code: 'KeyA', isComposing: true, keyCode: 229,
    }));
    target?.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'あ' }));
  });
  await expect(loopBinding).toHaveAttribute('aria-pressed', 'true');
  await expect(loopBinding).toHaveText('キーを押す…');

  await page.keyboard.press('Control+P');
  await expect(page.locator('#keyboard-capture-note')).toContainText('Ctrl・Alt・⌘');
  await expect(loopBinding).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('p');
  await expect(loopBinding).toHaveText('P');
  await expect(loopBinding).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#control-save').click();
  await expect(page.locator('#control-settings')).toBeHidden();
  const binding = await page.evaluate(() => {
    const raw = localStorage.getItem('machimamore-keyboard-v1');
    return raw ? JSON.parse(raw).bindings.loop : null;
  });
  expect(binding).toBe('KeyP');
  await expect(page.locator('#home-controls')).toBeFocused();
});

test.describe('touch-first two-pointer emulation', () => {
test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });

test('Chromium CDP two-touch input keeps the remaining pointer held and clears it on cancel', async ({ page, browser, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'Two-finger touch dispatch uses Chromium CDP; WebKit still runs the other interruption cases.');
  await openHome(page);
  await touchscreenTap(page, 'input[name="game-mode"][value="normal"]');
  await expect(page.locator('input[name="game-mode"][value="normal"]')).toBeChecked();
  await expect(page.locator('#app')).toHaveAttribute('data-input', 'touch');
  const cdp = await page.context().newCDPSession(page);
  await touchscreenTap(page, '#home-sound');
  await expect(page.locator('#home-sound')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#app')).toHaveAttribute('data-input', 'touch');
  await touchscreenTap(page, '#start');
  await settleActiveMission(page, testInfo);
  await expect(page.locator('#app')).toHaveAttribute('data-input', 'touch');
  await expect(page.locator('#fire')).toBeVisible();

  const targets = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#flight')!.getBoundingClientRect();
    const fire = document.querySelector<HTMLButtonElement>('#fire')!.getBoundingClientRect();
    if (getComputedStyle(document.querySelector('#fire')!).display === 'none') throw new Error('Touch presentation did not expose the Fire control.');
    return {
      steering: { x: Math.round(canvas.left + canvas.width * .24), y: Math.round(canvas.top + canvas.height * .47) },
      firing: { x: Math.round(fire.left + fire.width / 2), y: Math.round(fire.top + fire.height / 2) },
    };
  });
  const readTouchState = () => page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('#app');
    const read = (window as Window & { __machimamoreRead?: () => unknown }).__machimamoreRead;
    const value = typeof read === 'function' ? read() : null;
    return {
      screen: app?.getAttribute('data-screen') ?? null,
      reason: document.querySelector<HTMLElement>('#pause-reason')?.textContent?.trim() ?? null,
      inputPresentation: app?.getAttribute('data-input') ?? null,
      observation: value && typeof value === 'object' ? value as Record<string, unknown> : null,
    };
  });
  const beforeTouchState = await readTouchState();
  expect(beforeTouchState.screen).toBe('playing');
  const beforeTouch = beforeTouchState.observation;
  expect(beforeTouch).not.toBeNull();
  const beforeTouchReasons = beforeTouch!.pauseReasons as string[];
  expect(beforeTouchReasons).toEqual([]);
  await page.evaluate(() => {
    const target = window as Window & { __twoTouchPointerAudit?: Array<Record<string, unknown>> };
    target.__twoTouchPointerAudit = [];
    for (const type of ['pointerdown', 'pointerup', 'pointercancel'] as const) {
      document.addEventListener(type, event => {
        const pointer = event as PointerEvent;
        const element = event.target as HTMLElement | null;
        target.__twoTouchPointerAudit!.push({
          type,
          pointerId: pointer.pointerId,
          pointerType: pointer.pointerType,
          trusted: event.isTrusted,
          target: element?.id || element?.tagName.toLowerCase() || null,
        });
      }, true);
    }
  });
  const point = (id: number, position: { x: number; y: number }) => ({
    id, x: position.x, y: position.y, radiusX: 3, radiusY: 3, force: 1,
  });

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [point(1, targets.steering), point(2, targets.firing)],
  });
  const pressedState = await readTouchState();
  await testInfo.attach('two-touch-start-observation', {
    body: JSON.stringify({ browserVersion: browser.version(), ...pressedState, cdpContacts: { steering: 1, firing: 2 } }, null, 2),
    contentType: 'application/json',
  });
  expect(pressedState.screen, 'A frame-gap pause must be recorded as an interruption, not accepted as a touch result.').toBe('playing');
  expect(pressedState.observation).not.toBeNull();
  const pressed = pressedState.observation!;
  expect(pressed.phase).toBe('playing');
  expect(pressed.pauseReasons).toEqual([]);
  expect(pressedState.inputPresentation).toBe('touch');
  const pressedInput = pressed.input as { steerPointer: number | null; heldPointers: Record<string, number[]> };
  const steerPointer = pressedInput.steerPointer;
  const firePointer = pressedInput.heldPointers.fire?.[0];
  expect(steerPointer).not.toBeNull();
  expect(firePointer).toBeDefined();
  expect(firePointer).not.toBe(steerPointer);
  expect(pressedInput.heldPointers.fire).toHaveLength(1);

  const moved = { x: targets.steering.x + 35, y: targets.steering.y + 5 };
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: [point(1, moved), point(2, targets.firing)],
  });
  const afterMoveState = await readTouchState();
  const afterMove = afterMoveState.observation!;
  expect(afterMoveState.screen).toBe('playing');
  expect(afterMove.phase).toBe('playing');
  expect(afterMove.pauseReasons).toEqual([]);
  const inputAfterMove = afterMove.input as { turn: number; climb: number; steerPointer: number | null; heldPointers: Record<string, number[]> };
  expect(inputAfterMove.steerPointer).toBe(steerPointer);
  expect(inputAfterMove.heldPointers.fire).toContain(firePointer);
  expect(Math.abs(inputAfterMove.turn) + Math.abs(inputAfterMove.climb), 'The steering move should update the raw flight input.').toBeGreaterThan(0.01);

  // Chromium's CDP touchEnd identifies the contact being lifted. Sending the
  // remaining contact here would end steering and leave Fire held.
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd', touchPoints: [point(2, targets.firing)],
  });
  const afterOneReleaseState = await readTouchState();
  const afterOneRelease = afterOneReleaseState.observation!;
  const inputAfterRelease = afterOneRelease.input as { turn: number; climb: number; steerPointer: number | null; heldPointers: Record<string, number[]> };
  expect(afterOneReleaseState.screen).toBe('playing');
  expect(afterOneRelease.phase).toBe('playing');
  expect(afterOneRelease.pauseReasons).toEqual([]);
  expect(inputAfterRelease.steerPointer).toBe(steerPointer);
  expect(inputAfterRelease.heldPointers.fire).toHaveLength(0);
  expect(Math.abs(inputAfterRelease.turn) + Math.abs(inputAfterRelease.climb), 'Releasing Fire should retain steering input from the remaining contact.').toBeGreaterThan(0.01);
  const pointerEventsAfterRelease = await page.evaluate(() => (window as Window & { __twoTouchPointerAudit?: Array<Record<string, unknown>> }).__twoTouchPointerAudit ?? []);
  expect(pointerEventsAfterRelease).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'pointerup', pointerId: firePointer, pointerType: 'touch', trusted: true, target: 'fire' }),
  ]));
  expect(pointerEventsAfterRelease).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'pointerup', pointerId: steerPointer }),
  ]));
  await testInfo.attach('two-touch-fire-release-audit', {
    body: JSON.stringify({ browserVersion: browser.version(), releasedCdpContact: 2, retainedCdpContact: 1, input: afterOneRelease.input, pointerEvents: pointerEventsAfterRelease }, null, 2),
    contentType: 'application/json',
  });

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const releasedState = await readTouchState();
  const released = releasedState.observation!;
  const releasedInput = released.input as { turn: number; climb: number; steerPointer: number | null; heldPointers: Record<string, number[]> };
  expect(releasedState.screen).toBe('playing');
  expect(released.phase).toBe('playing');
  expect(released.pauseReasons).toEqual([]);
  expect(releasedInput.steerPointer).toBeNull();
  expect(Object.values(releasedInput.heldPointers).every(ids => ids.length === 0)).toBe(true);
  expect(releasedInput.turn).toBe(0);
  expect(releasedInput.climb).toBe(0);
  const pointerEventsAfterCancel = await page.evaluate(() => (window as Window & { __twoTouchPointerAudit?: Array<Record<string, unknown>> }).__twoTouchPointerAudit ?? []);
  expect(pointerEventsAfterCancel).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'pointercancel', pointerId: steerPointer, pointerType: 'touch', trusted: true, target: 'flight' }),
  ]));
  await testInfo.attach('two-touch-cancel-audit', {
    body: JSON.stringify({ browserVersion: browser.version(), input: released.input, pointerEvents: pointerEventsAfterCancel }, null, 2),
    contentType: 'application/json',
  });
  await cdp.detach();
  await pauseActiveMission(page, testInfo);
  await page.locator('#pause-home').click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'home');
});
});

test('synthetic window blur releases held keys and requires the visible Resume action', async ({ page }, testInfo) => {
  await openHome(page);
  await startWithKeyboard(page, testInfo);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => {
    const input = (await readRequiredObservation(page)).input as { keys: string[] };
    return input.keys.length;
  }).toBeGreaterThan(0);

  const focusBefore = await page.evaluate(() => ({ hidden: document.hidden, hasFocus: document.hasFocus() }));
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('ArrowRight');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  const pausedAt = await readRequiredObservation(page);
  const reasons = pausedAt.pauseReasons as string[];
  expect(reasons).toContain('blur');
  expect((pausedAt.input as { keys: string[] }).keys).toEqual([]);
  await page.waitForTimeout(120);
  expect((await readRequiredObservation(page)).tick).toBe(pausedAt.tick);
  const focusAfter = await page.evaluate(() => ({ hidden: document.hidden, hasFocus: document.hasFocus() }));
  await testInfo.attach('synthetic-blur-lifecycle', {
    body: JSON.stringify({ syntheticEvent: true, nativeFocusBefore: focusBefore, nativeFocusAfter: focusAfter, reasons, tick: pausedAt.tick, remainedPausedWithoutResume: true }, null, 2),
    contentType: 'application/json',
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  await page.locator('#resume').click();
  await settleActiveMission(page, testInfo);
});

test('native tab focus loss is measured separately from frame-gap pauses', async ({ page, browserName }, testInfo) => {
  await openHome(page);
  await startWithKeyboard(page, testInfo);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => ((await readRequiredObservation(page)).input as { keys: string[] }).keys.length).toBeGreaterThan(0);

  const before = await page.evaluate(() => ({ hidden: document.hidden, hasFocus: document.hasFocus() }));
  let cdp: import('@playwright/test').CDPSession | undefined;
  if (browserName === 'chromium') {
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  }
  const otherPage = await page.context().newPage();
  await otherPage.goto('about:blank');
  await otherPage.bringToFront();
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => ({ hidden: document.hidden, hasFocus: document.hasFocus() }));
  const screen = await page.locator('#app').getAttribute('data-screen');
  const observation = await readRequiredObservation(page);
  const reasons = observation.pauseReasons as string[];
  await testInfo.attach('native-tab-focus-observation', {
    body: JSON.stringify({ browserName, focusEmulationDisabled: browserName === 'chromium', before, after, screen, pauseReasons: reasons }, null, 2),
    contentType: 'application/json',
  });
  const nativeLossObserved = before.hasFocus && (!after.hasFocus || after.hidden) && (reasons.includes('blur') || reasons.includes('hidden'));
  test.skip(!nativeLossObserved, `Headless ${browserName} did not produce a native focus/visibility transition; synthetic window blur is covered separately.`);

  expect(screen).toBe('paused');
  expect(reasons.some(reason => reason === 'blur' || reason === 'hidden')).toBe(true);
  expect((observation.input as { keys: string[] }).keys).toEqual([]);
  const pausedClock = await page.locator('#timer').textContent();
  await page.waitForTimeout(150);
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  expect(await page.locator('#timer').textContent()).toBe(pausedClock);
  await otherPage.close();
  await page.bringToFront();
  await page.waitForTimeout(150);
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  expect((await readRequiredObservation(page)).tick).toBe(observation.tick);
  await page.locator('#resume').click();
  await settleActiveMission(page, testInfo);
  await cdp?.detach();
});

test('WebGL loss during initial preparation keeps Start disabled until graphics recover', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const prototype = HTMLCanvasElement.prototype as unknown as {
      getContext: (type: string, ...options: unknown[]) => WebGLRenderingContext | WebGL2RenderingContext | RenderingContext | null;
    };
    const original = prototype.getContext;
    let injected = false;
    prototype.getContext = function (this: HTMLCanvasElement, type: string, ...options: unknown[]) {
      const context = original.call(this, type, ...options);
      if (!injected && this.id === 'flight' && type.startsWith('webgl') && context) {
        injected = true;
        const extension = (context as WebGLRenderingContext).getExtension('WEBGL_lose_context');
        const controls = window as Window & {
          __initialLossSupported?: boolean;
          __restoreInitialContext?: () => void;
          __lostDuringPreparation?: boolean;
        };
        controls.__initialLossSupported = !!extension;
        controls.__restoreInitialContext = () => extension?.restoreContext();
        if (!extension) return context;
        queueMicrotask(() => {
          controls.__lostDuringPreparation = document.querySelector<HTMLButtonElement>('#start')?.disabled === true;
          extension.loseContext();
        });
      }
      return context;
    };
  });

  await page.goto('/');
  await expect.poll(() => page.evaluate(() => (window as Window & { __initialLossSupported?: boolean }).__initialLossSupported !== undefined)).toBe(true);
  const supported = await page.evaluate(() => (window as Window & { __initialLossSupported?: boolean }).__initialLossSupported === true);
  test.skip(!supported, 'The browser graphics backend does not expose WEBGL_lose_context during initial preparation.');
  await expect(page.locator('#startup-error')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#startup-error')).toContainText('描画コンテキストが失われました');
  await expect(page.locator('#start')).toBeDisabled();
  expect(await page.evaluate(() => (window as Window & { __lostDuringPreparation?: boolean }).__lostDuringPreparation)).toBe(true);

  await page.evaluate(() => (window as Window & { __restoreInitialContext?: () => void }).__restoreInitialContext?.());
  await expect(page.locator('#start')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'home');
  await startMission(page, testInfo);
  expect((await readRequiredObservation(page)).phase).toBe('playing');
});

test('a first WebGL draw failure leaves Home unavailable until the visible retry succeeds', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const state = window as Window & { __machimamoreDrawFailureArmed?: boolean; __machimamoreDrawFailureInjected?: boolean };
    for (const contextType of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!contextType) continue;
      const prototype = contextType.prototype as unknown as Record<string, unknown>;
      for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const original = prototype[method];
        if (typeof original !== 'function') continue;
        prototype[method] = function (this: WebGLRenderingContext | WebGL2RenderingContext, ...args: unknown[]) {
          if (state.__machimamoreDrawFailureArmed && !state.__machimamoreDrawFailureInjected) {
            state.__machimamoreDrawFailureInjected = true;
            throw new Error('Injected first-frame WebGL draw failure');
          }
          return original.apply(this, args);
        };
      }
    }

    const descriptor = Object.getOwnPropertyDescriptor(HTMLButtonElement.prototype, 'disabled');
    if (descriptor?.get && descriptor.set) {
      Object.defineProperty(HTMLButtonElement.prototype, 'disabled', {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(this: HTMLButtonElement, value: boolean) {
          descriptor.set!.call(this, value);
          if (this.id === 'start' && value === false) state.__machimamoreDrawFailureArmed = true;
        },
      });
    }
  });

  await page.goto('/');
  await expect(page.locator('#startup-error')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#startup-error')).toContainText('画面を準備できません');
  await expect(page.locator('#start')).toBeDisabled();
  await expect(page.locator('#reload')).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __machimamoreDrawFailureInjected?: boolean }).__machimamoreDrawFailureInjected)).toBe(true);

  await page.locator('#reload').click();
  await expect(page.locator('#start')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('#startup-error')).toBeHidden();
  await startMission(page, testInfo);
  expect((await readRequiredObservation(page)).phase).toBe('playing');
});

test('WebGL context restoration does not silently resume the mission', async ({ page, browserName }, testInfo) => {
  await openHome(page);
  await startWithKeyboard(page, testInfo);
  const capability = await page.locator('#flight').evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null;
    const extension = gl?.getExtension('WEBGL_lose_context');
    const canLose = typeof extension?.loseContext === 'function';
    const canRestore = typeof extension?.restoreContext === 'function';
    if (!gl || !canLose || !canRestore) return {
      supported: false,
      contextType: gl ? (gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl') : null,
      extensionPresent: !!extension,
      canLose,
      canRestore,
    };
    (window as Window & { __restoreMachimamoreContext?: () => void }).__restoreMachimamoreContext = () => extension.restoreContext();
    extension.loseContext();
    return {
      supported: true,
      contextType: gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl',
      extensionPresent: true,
      canLose,
      canRestore,
    };
  });
  await testInfo.attach('webgl-context-restoration-capability', {
    body: JSON.stringify({ browserName, ...capability }, null, 2),
    contentType: 'application/json',
  });
  test.skip(!capability.supported, `Observed capability absence: context=${capability.contextType ?? 'none'}, WEBGL_lose_context=${capability.extensionPresent}, loseContext=${capability.canLose}, restoreContext=${capability.canRestore}.`);
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused', { timeout: 10_000 });
  const lost = await readRequiredObservation(page);
  expect(lost.pauseReasons as string[]).toContain('webgl-lost');
  const lostTick = lost.tick;
  await page.evaluate(() => (window as Window & { __restoreMachimamoreContext?: () => void }).__restoreMachimamoreContext?.());
  await expect(page.locator('#resume')).toBeEnabled({ timeout: 15_000 });
  await page.waitForTimeout(250);
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  expect((await readRequiredObservation(page)).tick).toBe(lostTick);
  await page.locator('#resume').click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'playing');
});

async function startWithKeyboard(page: import('@playwright/test').Page, testInfo?: import('@playwright/test').TestInfo): Promise<void> {
  for (let i = 0; i < 6 && !(await page.locator('#start').evaluate(element => element === document.activeElement)); i += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(page.locator('#start')).toBeFocused();
  await page.keyboard.press('Enter');
  await settleActiveMission(page, testInfo);
}

async function touchscreenTap(page: import('@playwright/test').Page, selector: string): Promise<void> {
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
  await page.touchscreen.tap(point.x, point.y);
}
