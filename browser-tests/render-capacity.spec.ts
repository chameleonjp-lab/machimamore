import { test, expect, saveScreenshot } from './fixtures';

test('maximum capacity renderer fixture keeps 16 entities, 40 beams, 2048 rounds and stable resources', async ({ page }, testInfo) => {
  await page.goto('/browser-tests/render-fixture.html');
  // This is a pre-Start rendering fixture, separate from the normal-play evidence.
  const observation = await page.evaluate(async () => {
    const scenePath = '/src/scene.ts', simPath = '/src/simulation.ts', threePath = '/node_modules/three/build/three.module.js';
    const [{ MachiMamoreScene }, { createGame }, { Vector3 }] = await Promise.all([import(scenePath), import(simPath), import(threePath)]);
    const state = createGame({ mode: 'normal', seed: 211 });
    state.beams = Array.from({ length: 40 }, (_, id) => ({ id, missionId: state.missionId, owner: 100 + id % 8, ownerToken: id % 8, ownerGeneration: 1,
      start: new Vector3((id % 8 - 4) * 90, 250, -700), aimPoint: new Vector3((id % 8 - 4) * 90, 40, -1100), end: new Vector3((id % 8 - 4) * 90, 40, -1100),
      birthTick: 0, expiresTick: 60, lastIntegratedTick: -1, actualTarget: null, actualDamage: 0 }));
    state.bullets = Array.from({ length: 2048 }, (_, id) => ({ id, missionId: state.missionId, owner: id % 8, ownerToken: id % 8, ownerGeneration: 1, playerOwned: false, team: 'friendly', kind: 'mg',
      position: new Vector3((id % 64 - 32) * 12, 150 + Math.floor(id / 64) * 3, -850), previous: new Vector3((id % 64 - 32) * 12, 150 + Math.floor(id / 64) * 3, -840),
      velocity: new Vector3(0, 0, -820), birthTick: 0, expiresTick: 90, damage: 2.4, distanceTravelled: 10 }));
    for (const ufo of state.ufos) { ufo.attack.phase = 'warning'; ufo.attack.start.copy(ufo.position); ufo.attack.aimPoint.copy(state.city[ufo.slot].position); }
    const scene = new MachiMamoreScene(document.querySelector('#capacity'), document.querySelector('#overlay'));
    await scene.prepare(state); scene.render(state, false);
    const cold = scene.metrics();
    // Exercise each visual variant once: Three uploads a hidden geometry only
    // when it first becomes visible. Subsequent toggles must not allocate again.
    for (const district of state.city) { district.health = 250; district.destroyed = false; district.attacked = true; }
    scene.render(state, false);
    for (const district of state.city) { district.health = 0; district.destroyed = true; }
    scene.render(state, false);
    for (const district of state.city) { district.health = 250; district.destroyed = false; }
    scene.render(state, false);
    const initial = scene.metrics();
    for (let i = 0; i < 200; i++) {
      for (const district of state.city) { district.health = i % 2 ? 0 : 250; district.destroyed = i % 2 === 1; district.attacked = i % 3 === 0; }
      for (const ufo of state.ufos) { ufo.attack.phase = i % 2 ? 'warning' : 'idle'; ufo.attack.start.copy(ufo.position); ufo.attack.aimPoint.copy(state.city[ufo.slot].position); }
      scene.render(state, false);
    }
    const final = scene.metrics();
    const gl = scene.renderer.getContext(); const error = gl.getError();
    (window as unknown as Record<string, unknown>).fixtureDispose = () => scene.dispose();
    return { cold, initial, final, error, NO_ERROR: gl.NO_ERROR };
  });
  expect(observation.initial.aircraft).toBe(16);
  expect(observation.initial.activeLasers).toBe(40);
  expect(observation.initial.projectiles).toBe(2048);
  expect(observation.final.geometries).toBe(observation.initial.geometries);
  expect(observation.final.textures).toBe(observation.initial.textures);
  expect(observation.final.programs).toBe(observation.initial.programs);
  expect(observation.final.decorations).toBeLessThanOrEqual(24);
  expect(observation.error).toBe(observation.NO_ERROR);
  await saveScreenshot(page, testInfo, 'maximum-render-capacity');
  await testInfo.attach('capacity-observation', { body: JSON.stringify(observation, null, 2), contentType: 'application/json' });
  await page.evaluate(() => (window as unknown as { fixtureDispose: () => void }).fixtureDispose());
});
