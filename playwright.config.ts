import { defineConfig } from '@playwright/test';

// Normal checks are UI only. The preserved gameplay suite is opt-in via
// playwright.gameplay.config.ts and never used by the normal CI command.
export default defineConfig({
  testDir: './browser-tests/ui-only', testMatch: '**/*.spec.ts',
  timeout: 45000, expect: { timeout: 3000 },
  workers: 2, retries: 0, forbidOnly: !!process.env.CI,
  reporter: [['list'], ['json', { outputFile: 'test-results/ui-results.json' }]],
  projects: [
    { name: 'chromium-portrait', use: { browserName:'chromium', viewport:{width:393,height:852} } },
    { name: 'chromium-small-landscape', use: { browserName:'chromium', viewport:{width:568,height:320} } },
    { name: 'chromium-desktop', use: { browserName:'chromium', viewport:{width:1280,height:720} } },
    { name: 'webkit-small-portrait', use: { browserName:'webkit', viewport:{width:320,height:568} } },
  ],
  use: { baseURL:'http://127.0.0.1:4176', hasTouch:true, screenshot:'only-on-failure', trace:'retain-on-failure' },
  webServer: { command:'npm run dev:ui', url:'http://127.0.0.1:4176', reuseExistingServer:false, timeout:30000 },
});
