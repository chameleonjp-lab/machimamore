import { test, expect } from '@playwright/test';
import type { UiFixtureDriver } from '../../src/ui-test-driver';
test('boss warning, health, escorts and retry are readable without audio',async({page},info)=>{
 await page.goto('/');await page.waitForFunction(()=>Boolean((window as any).__machimamoreUi));
 await page.evaluate(()=>((window as any).__machimamoreUi as UiFixtureDriver).show('boss-warning'));
 await expect(page.locator('#enemy-label')).toHaveText('⚠ WARNING');await expect(page.locator('#enemy-total')).toContainText('巨大UFO接近');await expect(page.locator('#enemy-total')).toBeVisible();
 await page.screenshot({path:info.outputPath('boss-warning.png'),animations:'disabled'});
 await page.evaluate(()=>((window as any).__machimamoreUi as UiFixtureDriver).show('boss'));
 await expect(page.locator('#enemy-count')).toHaveText('320 / 640 HP');await expect(page.locator('#enemy-total')).toContainText('妨害UFO 3体');await expect(page.locator('#enemy-total')).toBeVisible();
 const bounds=await page.locator('.enemy-tally').boundingBox(),viewport=page.viewportSize()!;expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(viewport.width);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(viewport.height);
 await page.screenshot({path:info.outputPath('boss-health.png'),animations:'disabled'});
 await page.evaluate(()=>((window as any).__machimamoreUi as UiFixtureDriver).show('easy'));await expect(page.locator('#enemy-label')).toHaveText('UFO撃破');await expect(page.locator('#enemy-count')).not.toContainText('HP');
});
